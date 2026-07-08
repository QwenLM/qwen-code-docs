# Conception de l'implémentation de DaemonWorkspaceService (Plan C)

> Associé : issue #4542, PR #4472, #3803, #4175
> Branche : `daemon_mode_b_main`
> Date : 2026-05-27
> Nature : Document de conception d'implémentation (orienté mise en œuvre), non RFC

---

> **Note sur le périmètre de mise en œuvre (mis à jour le 2026-05-31, PR #4563)**
>
> Ce document décrit l'**architecture cible finale**. La PR #4563 n'en implémente qu'une partie, le reste relevant de PRs ultérieures. Lors de la lecture, veuillez vous référer au tableau ci-dessous et ne pas supposer que tout est implémenté :
>
> | Capacité                                                                         | Statut dans cette PR (#4563)                                                                                                             |
> | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
> | Renommage de `HttpAcpBridge` en `AcpSessionBridge`                                    | ✅ Implémenté                                                                                                                      |
> | Exposition par le bridge des délégations génériques `queryWorkspaceStatus` / `invokeWorkspaceCommand`       | ✅ Implémenté                                                                                                                      |
> | Opérations de niveau workspace du facade : **status / init / tool-toggle / mcp-restart**         | ✅ Implémenté et câblé (server.ts + dispatch acpHttp via le facade)                                                                      |
> | **Quatre sub-services : File / Auth / Agents / Memory**                           | ⏳ **reporté** — Non inclus dans cette PR. Le câblage de leurs routes respectives, l'injection de `deviceFlowRegistry`/`subagentManager` et les tests e2e seront implémentés dans une PR ultérieure      |
> | Modification des routes REST `/workspace/memory`, `/workspace/agents`, etc. pour appeler le facade             | ⏳ **reporté** — Actuellement toujours servi directement par les anciens `workspaceMemory.ts` / `workspaceAgents.ts`                                           |
> | Dispatch northbound `/acp` `qwen/workspace/*` (§6)                          | ⏳ **reporté**                                                                                                                |
> | `initWorkspace` via `fsFactory` / `WorkspaceFileSystem` (trust gate + audit) | ⏳ **reporté** — Utilise actuellement l'implémentation brute `node:fs` de l'ancien bridge (incluant la protection §SV TOCTOU/symlink), sans régression ; la migration vers fsFactory/audit est reportée à plus tard |
>
> Par conséquent, la §3.4 (interfaces des sub-services), la §6 (/acp northbound), le `e2e.test.ts` de la §7.1 et la description de la forme de la PR de la §10 relèvent de l'**état cible/futur** et ne sont pas implémentés dans cette PR.

---

## 1. Architecture et limites

### 1.1 Architecture cible en couches

```
                          CLIENTS
   webui    SDK/channels(via REST)    Zed/Goose(/acp)    future
     │             │                       │
═════╪═════════════╪═══════════════════════╪═════════════ L1 transport (mince)
   REST+SSE      REST+SSE              /acp (jsonrpc/sse)
   server.ts                           acpHttp/
     └─────────────┴───────────────────────┘
                          │ logique métier/trust/audit toujours déléguée à L2
═════════════════════════╪═══════════════════════════════ L2 couche application
   ┌──────────────────────────┐   ┌─────────────────────────────────┐
   │ AcpSessionBridge          │   │ DaemonWorkspaceService (facade)  │
   │ (← renommé depuis HttpAcpBridge)│   │  ┌──────────────────────────┐   │
   │ • cycle de vie channel/session│   │  │ FileService              │   │
   │ • prompt / cancel / close │   │  │ AuthService              │   │
   │ • EventBus / arbitrage permissions│   │  │ AgentsService            │   │
   │ • introspection d'état dépendant du child│   │  │ MemoryService            │   │
   │   (mcp/skills/preflight)  │   │  └──────────────────────────┘   │
   └──────────┬───────────────┘   │  WorkspaceRequestContext unifié     │
              │                    └──────────┬──────────────────────┘
              │ L3 → child                    │
              ▼                               │ (purement local, n'accède pas au child)
══════════════════════════════════════════════════════════ L3 ACP-client
══════════════════════════════════════════════════════════ L4 agent
```

### 1.2 Fonction de décision de répartition

**Règle unique : le scope de l'opération est-il session ou workspace ?**

- **session-scoped** (opère sur un sessionId spécifique : prompt/cancel/close/model/approval/metadata/heartbeat) **→ reste dans `AcpSessionBridge`**
- **workspace-scoped** (opère sur le workspace dans son ensemble : file/auth/agents/memory/mcp-status/skills/env/preflight/tool-toggle/init) **→ va dans `DaemonWorkspaceService`**

Certaines méthodes du workspace nécessitent d'interroger le child (status getters, restartMcpServer). Cela est délégué via un **callback injecté** au channel du bridge ; le service lui-même ne détient pas la connexion.

### 1.3 Dépendances transverses : injection de callbacks (pas d'infra partagée)

Actuellement, `publishWorkspaceEvent` et `knownClientIds` sont détenus par le bridge (fan-out de bus per-session / dérivé de la session). Le service les utilise via une **injection de callback unidirectionnelle**, sans introduire de couche d'infrastructure partagée.

**Raisons :**

1. L'EventBus est un bus per-session (`bridge.ts:1457`), le bus de niveau workspace est déjà prévu dans les commentaires du code pour la PR 24 (`bridge.ts:2611`)
2. `knownClientIds` est également dérivé de l'état session-attach, et les commentaires indiquent explicitement "PR 24 will replace it" (`bridge.ts:2658`)
3. Ces deux éléments font l'objet de travaux indépendants déjà planifiés ; les lier à cette PR reviendrait à ajouter un refactor supplémentaire
4. L'injection de callback crée une dépendance unidirectionnelle pour le service (il ne détient que des références de fonctions, sans savoir qu'elles viennent du bridge) ; une fois la PR 24 implémentée, il suffira de changer la source d'injection, l'interface du service restant inchangée

**Règles strictes :**

1. Aucune référence de type `AcpSessionBridge` ne doit apparaître dans `DaemonWorkspaceServiceDeps` — utilisez uniquement des signatures de fonctions.
2. Le bridge expose désormais deux nouvelles méthodes, `queryWorkspaceStatus` et `invokeWorkspaceCommand`, pour que le service les appelle via callback. En interne, il continue d'utiliser la logique existante `requestWorkspaceStatus` / `liveChannelInfo` + timeout, sans créer de nouvelle abstraction.

---

## 2. Séquence de construction et injection de dépendances

```ts
// Ordre de construction dans runQwenServe.ts

// 1. fsFactory construit en premier (partagé entre les deux)
const fsFactory = resolveBridgeFsFactory({ ... });

// 2. bridge construit en premier (il est le owner de session/channel/EventBus)
const bridge = createAcpSessionBridge({
  eventRingSize,
  boundWorkspace,
  fileSystem: createBridgeFileSystemAdapter(fsFactory),
  // ... les autres paramètres existants restent inchangés
});

// 3. service construit ensuite, reçoit l'ensemble de callbacks du bridge
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager,
  boundWorkspace,
  contextFilename,
  // callbacks transverses — le service ne sait pas qu'ils viennent du bridge
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  // callbacks de délégation child — les méthodes ext workspace-scoped atteignent l'agent via le channel du bridge
  queryWorkspaceStatus: (method, idle) => bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) => bridge.invokeWorkspaceCommand(method, params, opts),
});

// 4. Les deux sont transmis aux routes du server + au handler /acp
createServeApp({ bridge, workspace, ... });
```

**L'ordre de construction bridge → service est une dépendance stricte** (le service a besoin des méthodes de l'instance du bridge comme source de callbacks).

---

## 3. Structure interne de DaemonWorkspaceService

### 3.1 Structure des répertoires

```
packages/cli/src/serve/workspace-service/
├── types.ts            ← WorkspaceRequestContext + interfaces des sub-services
├── index.ts            ← factory du facade (createDaemonWorkspaceService)
├── fileService.ts      ← encapsule fsFactory
├── authService.ts      ← encapsule DeviceFlowRegistry
├── agentsService.ts    ← encapsule SubagentManager
├── memoryService.ts    ← encapsule les opérations de fichiers de mémoire
└── __tests__/
    ├── fileService.test.ts
    ├── authService.test.ts
    ├── agentsService.test.ts
    ├── memoryService.test.ts
    └── e2e.test.ts
```

### 3.2 Interface du facade

```ts
export interface DaemonWorkspaceService {
  file: FileService;
  auth: AuthService;
  agents: AgentsService;
  memory: MemoryService;

  // purement local
  initWorkspace(
    opts: InitWorkspaceOpts,
    ctx: WorkspaceRequestContext,
  ): Promise<void>;
  setToolEnabled(
    toolName: string,
    enabled: boolean,
    ctx: WorkspaceRequestContext,
  ): Promise<ToolToggleResult>;

  // délégué au child via callback
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

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `publishWorkspaceEvent` / `knownClientIds` restent dans le bridge — ils accèdent à l'état per-session interne du bridge (map `byId` / bus de session), ce qui constitue une infrastructure dérivée de la session. Le service les consomme via des callbacks, sans les posséder directement.

### 3.3 Signature de la factory du facade

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

  // callbacks transverses (infrastructure dérivée de la session)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // callbacks de délégation child (les méthodes ext workspace-scoped atteignent l'agent via le channel du bridge)
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

### 3.4 Interfaces des sub-services

| Sub-service        | Méthodes                                                                        | Dépendances requises                                                           | Source existante                                                                  |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FileService   | `read`, `readBytes`, `write`, `edit`, `glob`, `list`, `stat`                | `fsFactory`, `boundWorkspace`                                       | `serve/routes/workspaceFileRead.ts`, `workspaceFileWrite.ts`, `serve/fs/` |
| AuthService   | `startFlow`, `getFlowStatus(flowId)`, `cancelFlow(flowId)`, `getAuthStatus` | `deviceFlowRegistry`                                                | `serve/auth/deviceFlow.ts`, `server.ts:794-966`                           |
| AgentsService | `list`, `get(agentType)`, `create`, `update`, `delete`                      | `subagentManager`, `publishWorkspaceEvent`, `knownClientIds`        | `serve/workspaceAgents.ts`                                                |
| MemoryService | `list`, `read`, `write`, `delete`                                           | `fsFactory` or direct fs, `publishWorkspaceEvent`, `knownClientIds` | `serve/workspaceMemory.ts`                                                |

Le premier paramètre de chaque méthode est `ctx: WorkspaceRequestContext`, le trust gate étant exécuté de manière uniforme à l'entrée de la méthode.

---

## 4. WorkspaceRequestContext

```ts
export interface WorkspaceRequestContext {
  originatorClientId?: string; // header X-Qwen-Client-Id (peut être absent pour les opérations en lecture seule)
  sessionId?: string; // corrélation d'audit (par ex. pour les opérations initiées depuis le contexte de la session)
  route: string; // audit trail (par ex. "POST /file/write")
  workspaceCwd: string; // racine de la limite de trust
}
```

> `originatorClientId` est optionnel — les routes en lecture seule actuelles comme file read fonctionnent normalement en cas d'absence du header (`clientId ?? undefined` est passé à `fsFactory.forRequest`). Les routes d'écriture ne valident la légalité que si le `clientId` est **présent**.

**Emplacement de construction** : Le handler de route L1 / le handler de méthode `/acp` l'extrait des headers/params de la requête et le transmet à L2. L2 ne fait que le consommer, sans extraire lui-même le contexte HTTP.

---

## 5. Allègement et renommage de AcpSessionBridge

### 5.1 Méthodes déplacées hors du bridge

| Méthode                          | Destination                           | Mécanisme                                  | Raison                                                           |
| ----------------------------- | ------------------------------ | ------------------------------------- | -------------------------------------------------------------- |
| `initWorkspace`               | `workspace.initWorkspace`      | Déplacement direct (purement local)                      | Corrige au passage le FIXME (le bridge n'utilisait pas fsFactory, contournant le trust gate / l'audit) |
| `setWorkspaceToolEnabled`     | `workspace.setToolEnabled`     | Déplacement direct (purement local)                      | Pure E/S de fichier + fan-out d'événements, le commentaire indique explicitement "no ACP roundtrip"       |
| `getWorkspaceMcpStatus`       | `workspace.getMcpStatus`       | via le callback `queryWorkspaceStatus`   | requête de statut workspace-scoped                                  |
| `getWorkspaceSkillsStatus`    | `workspace.getSkillsStatus`    | via le callback `queryWorkspaceStatus`   | Idem                                                           |
| `getWorkspaceProvidersStatus` | `workspace.getProvidersStatus` | via le callback `queryWorkspaceStatus`   | Idem                                                           |
| `getWorkspaceEnvStatus`       | `workspace.getEnvStatus`       | via le callback `queryWorkspaceStatus`   | Idem                                                           |
| `getWorkspacePreflightStatus` | `workspace.getPreflightStatus` | via le callback `queryWorkspaceStatus`   | Idem                                                           |
| `restartMcpServer`            | `workspace.restartMcpServer`   | via le callback `invokeWorkspaceCommand` | mutation workspace-scoped                                      |
> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` restent dans le bridge — ils accèdent à la map de sessions interne `byId` du bridge et sont des opérations au niveau de la session.

### 5.2 Ce qui reste dans le bridge

- Cycle de vie complet des sessions/channels (spawn/load/resume/send/cancel/close/kill/detach)
- Détention de l'EventBus + implémentation du fan-out de `publishWorkspaceEvent` (consommé par les callbacks de service)
- `knownClientIds` (consommé par les callbacks de service)
- `queryWorkspaceStatus` / `invokeWorkspaceCommand` (nouvellement exposés, encapsulent channel + timeout + error, délégués par les callbacks de service)
- Médiateur d'arbitrage des permissions
- Modifications de la configuration de session (model/approvalMode/recap)
- État de la session (context/supportedCommands/metadata/heartbeat/listSessions)

### 5.3 Renommages

- `HttpAcpBridge` → `AcpSessionBridge`
- `createHttpAcpBridge` → `createAcpSessionBridge`
- Fichier `serve/httpAcpBridge.ts` → `serve/acpSessionBridge.ts`

Aucun package externe ne les consomme (aucune référence trouvée en dehors de `packages/cli/src/serve/` et `packages/acp-bridge/src/`), changement interne sans risque.

---

## 6. Méthodes d'extension northbound /acp

### 6.1 Espace de noms

`qwen/workspace/...` (pour distinguer de l'existant `qwen/control/...`) :

- `qwen/control/...` = commandes transmises daemon→child (southbound, via AcpSessionBridge)
- `qwen/workspace/...` = opérations d'espace de travail local du daemon (northbound, terminées dans DaemonWorkspaceService)

> En attente de confirmation par chiga0. Si l'espace de noms change, il suffira de remplacer le préfixe des noms de méthodes, sans impact sur l'architecture.

### 6.2 Liste des méthodes

| method                            | REST correspondant                              | Appel L2                                            |
| --------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `qwen/workspace/fs/read`          | `GET /file?path=...`                            | `workspace.file.read(ctx, path)`                    |
| `qwen/workspace/fs/readBytes`     | `GET /file/bytes?path=...`                      | `workspace.file.readBytes(ctx, path)`               |
| `qwen/workspace/fs/write`         | `POST /file/write`                              | `workspace.file.write(ctx, path, content)`          |
| `qwen/workspace/fs/edit`          | `POST /file/edit`                               | `workspace.file.edit(ctx, path, edits)`             |
| `qwen/workspace/fs/glob`          | `GET /glob?pattern=...`                         | `workspace.file.glob(ctx, pattern)`                 |
| `qwen/workspace/fs/list`          | `GET /list?path=...`                            | `workspace.file.list(ctx, path)`                    |
| `qwen/workspace/fs/stat`          | `GET /stat?path=...`                            | `workspace.file.stat(ctx, path)`                    |
| `qwen/workspace/auth/start`       | `POST /workspace/auth/device-flow`              | `workspace.auth.startFlow(ctx)`                     |
| `qwen/workspace/auth/status`      | `GET /workspace/auth/status`                    | `workspace.auth.getAuthStatus(ctx)`                 |
| `qwen/workspace/auth/flow`        | `GET /workspace/auth/device-flow/:id`           | `workspace.auth.getFlowStatus(ctx, flowId)`         |
| `qwen/workspace/auth/cancel`      | `POST /workspace/auth/device-flow/:id` (cancel) | `workspace.auth.cancelFlow(ctx, flowId)`            |
| `qwen/workspace/agents/list`      | `GET /workspace/agents`                         | `workspace.agents.list(ctx)`                        |
| `qwen/workspace/agents/get`       | `GET /workspace/agents/:agentType`              | `workspace.agents.get(ctx, agentType)`              |
| `qwen/workspace/agents/create`    | `POST /workspace/agents`                        | `workspace.agents.create(ctx, spec)`                |
| `qwen/workspace/agents/update`    | `POST /workspace/agents/:agentType`             | `workspace.agents.update(ctx, agentType, spec)`     |
| `qwen/workspace/agents/delete`    | `DELETE /workspace/agents/:agentType`           | `workspace.agents.delete(ctx, agentType)`           |
| `qwen/workspace/memory/list`      | `GET /workspace/memory`                         | `workspace.memory.list(ctx)`                        |
| `qwen/workspace/memory/read`      | `GET /workspace/memory/:key`                    | `workspace.memory.read(ctx, key)`                   |
| `qwen/workspace/memory/write`     | `POST /workspace/memory`                        | `workspace.memory.write(ctx, key, content)`         |
| `qwen/workspace/memory/delete`    | `DELETE /workspace/memory/:key`                 | `workspace.memory.delete(ctx, key)`                 |
| `qwen/workspace/init`             | `POST /workspace/init`                          | `workspace.initWorkspace(ctx, opts)`                |
| `qwen/workspace/tool/toggle`      | `POST /workspace/tool/toggle`                   | `workspace.setToolEnabled(ctx, toolName, enabled)`  |
| `qwen/workspace/status/mcp`       | `GET /workspace/mcp`                            | `workspace.getMcpStatus()`                          |
| `qwen/workspace/status/skills`    | `GET /workspace/skills`                         | `workspace.getSkillsStatus()`                       |
| `qwen/workspace/status/providers` | `GET /workspace/providers`                      | `workspace.getProvidersStatus()`                    |
| `qwen/workspace/status/env`       | `GET /workspace/env`                            | `workspace.getEnvStatus()`                          |
| `qwen/workspace/status/preflight` | `GET /workspace/preflight`                      | `workspace.getPreflightStatus()`                    |
| `qwen/workspace/mcp/restart`      | `POST /workspace/mcp/restart`                   | `workspace.restartMcpServer(ctx, serverName, opts)` |

Ces méthodes sont déclarées dans `_meta.qwen.methods` lors de l'annonce des capabilities.

---

## 7. Liste des modifications de fichiers

### 7.1 Ajouts

| Fichier                                                   | Objectif                                           |
| --------------------------------------------------------- | -------------------------------------------------- |
| `serve/workspace-service/types.ts`                        | `WorkspaceRequestContext` + interfaces des sous-services |
| `serve/workspace-service/index.ts`                        | factory de façade                                  |
| `serve/workspace-service/fileService.ts`                  | Implémentation de FileService                      |
| `serve/workspace-service/authService.ts`                  | Implémentation de AuthService                      |
| `serve/workspace-service/agentsService.ts`                | Implémentation de AgentsService                    |
| `serve/workspace-service/memoryService.ts`                | Implémentation de MemoryService                    |
| `serve/workspace-service/__tests__/fileService.test.ts`   | test unitaire                                      |
| `serve/workspace-service/__tests__/authService.test.ts`   | test unitaire                                      |
| `serve/workspace-service/__tests__/agentsService.test.ts` | test unitaire                                      |
| `serve/workspace-service/__tests__/memoryService.test.ts` | test unitaire                                      |
| `serve/workspace-service/__tests__/e2e.test.ts`           | Validation d'équivalence end-to-end REST ↔ /acp    |

### 7.2 Modifications

| Fichier                                                           | Modification                                                                                                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp-bridge/src/bridge.ts`                                        | Suppression de 8 méthodes workspace (initWorkspace / setWorkspaceToolEnabled / 5 status getters / restartMcpServer) ; exposition de `queryWorkspaceStatus` + `invokeWorkspaceCommand` ; renommage de la factory |
| `acp-bridge/src/bridgeTypes.ts`                                   | Renommage de l'interface `HttpAcpBridge` → `AcpSessionBridge` ; suppression des signatures de 8 méthodes workspace ; ajout des signatures de `queryWorkspaceStatus` + `invokeWorkspaceCommand` |
| `acp-bridge/src/bridgeOptions.ts`                                 | Mise à jour des références JSDoc                                                                                                                                                  |
| `acp-bridge/src/status.ts`                                        | Mise à jour des noms de classe dans les messages d'erreur                                                                                                                         |
| `cli/src/serve/httpAcpBridge.ts` → renommé `acpSessionBridge.ts`  | Mise à jour du re-export                                                                                                                                                          |
| `cli/src/serve/runQwenServe.ts`                                   | Instanciation de `DaemonWorkspaceService`, injection des callbacks, transmission aux routes et au handler /acp                                                                                  |
| `cli/src/serve/server.ts`                                         | Les routes passent d'une connexion directe à `fsFactory`/`DeviceFlowRegistry` à l'appel de `workspace.file.*` / `workspace.auth.*`                                                                      |
| `cli/src/serve/workspaceAgents.ts`                                | La logique métier est déplacée dans `agentsService.ts` ; le fichier d'origine devient un wrapper léger de route handler (construction du ctx → appel du service)                             |
| `cli/src/serve/workspaceMemory.ts`                                | Idem                                                                                                                                                                              |
| `cli/src/serve/routes/workspaceFileRead.ts`                       | Idem                                                                                                                                                                              |
| `cli/src/serve/routes/workspaceFileWrite.ts`                      | Idem                                                                                                                                                                              |
| `/acp` handler (dans `acp-integration/` ou `serve/`)              | Ajout du dispatch des méthodes northbound                                                                                                                                         |

---

## 8. Compatibilité SDK et format des erreurs

### 8.1 Rétrocompatibilité SDK

La surface de l'API REST (chemins, méthodes HTTP, schémas JSON de requête/réponse) reste inchangée. `DaemonClient` / `DaemonSessionClient` dans `sdk-typescript` ne nécessitent aucune modification.

Méthode de validation : les tests existants `packages/sdk-typescript/test/unit/DaemonClient.test.ts` et `DaemonSessionClient.test.ts` doivent passer sans aucune modification dans cette PR.

### 8.2 Format des erreurs rejetées par le trust gate /acp

Les deux transports sont sémantiquement équivalents mais encodés différemment :

| Scénario                          | REST                                       | /acp (JSON-RPC)                                                          |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Token bearer invalide/manquant    | `401 { error, code: "unauthorized" }`      | `{ error: { code: -32001, message: "unauthorized" } }`                   |
| clientId invalide                 | `400 { error, code: "invalid_client_id" }` | `{ error: { code: -32602, message: "invalid_client_id", data: {...} } }` |
| Rejet par le trust gate (path traversal, etc.) | `403 { error, code: "forbidden" }`         | `{ error: { code: -32003, message: "forbidden", data: {...} } }`         |

> Les codes d'erreur JSON-RPC suivent le [registre des codes d'erreur ACP](https://spec.acpprotocol.org) (la plage standard -32000 ~ -32099 est réservée aux erreurs d'application définies par le serveur). Les valeurs de codes spécifiques seront alignées lors de l'implémentation sur la logique de mapping d'erreurs existante de `/acp` (`acp-integration/errorCodes.ts`).

---

## 9. Stratégie de test

| Couche              | Type de test                                                          | Objectif de couverture                                               |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Unit test sous-service | Jest, mock de fsFactory / DeviceFlowRegistry / SubagentManager / callbacks | Exactitude de la logique métier + rejet des clientId illégaux par le trust gate |
| Intégration de route | Les tests de route existants sont modifiés pour passer par le service (vérifie que la surface HTTP reste inchangée) | Garantie de non-régression, les chemins REST ne cassent pas          |
| Validation d'équivalence E2E | Démarrage du vrai serve + requêtes HTTP                               | REST et `/acp` retournent des résultats équivalents pour la même opération ; rejet cohérent des deux côtés par le trust gate |
### Matrice de validation E2E

- Lecture/écriture de fichiers : REST `GET /file` vs `/acp` `qwen/workspace/fs/read` → même résultat
- CRUD d'agents : REST `POST /workspace/agents` vs `/acp` `qwen/workspace/agents/create` → même comportement
- Rejet par la trust gate : clientId invalide, les deux chemins retournent 403
- Initialisation du workspace : validation du fonctionnement de fsFactory + génération de l'audit trail

---

## 10. Format du PR

Commit atomique dans un seul PR, incluant :

- Tous les nouveaux fichiers de DaemonWorkspaceService
- Modification des route handlers REST pour appeler le service
- Allègement du bridge (déplacement de 8 méthodes workspace) + exposition de 2 nouvelles méthodes de délégation child
- Renommage de `HttpAcpBridge` en `AcpSessionBridge`
- Ajout de nouvelles méthodes ext northbound `/acp` (27)
- Tests complets (unit + integration + e2e)

---

## 11. Ce qui est explicitement exclu (périmètre)

- EventBus à l'échelle du workspace (ressort du PR 24)
- ClientRegistry à l'échelle du workspace (ressort du PR 24)
- Séparation L2 ↔ L3 (extraction de `ClientSideConnection` du bridge)
- Transformation de REST en shim de compatibilité `/acp` (orientation à long terme)
- Unification du mode standalone des channels (problème de mode de déploiement indépendant)
- Migration de `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` (à l'échelle de la session, conservés à leur emplacement actuel)
- Transfert de propriété de `publishWorkspaceEvent` / `knownClientIds` (infrastructure dérivée de la session, conservée par le bridge, consommée par le service via callback)

---

## 12. Points de décision en attente de confirmation par chiga0

1. Espace de noms northbound `/acp` : `qwen/workspace/...` vs autres (par ex. réutilisation de `qwen/control/...`)
2. Renommage dans le même PR : tendance à le faire dans le même PR, mais peut être séparé selon les retours

> Si ces deux points doivent être ajustés, cela n'affectera que le nommage et les limites des commits, pas l'architecture.