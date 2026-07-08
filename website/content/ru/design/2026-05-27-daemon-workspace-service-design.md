# Дизайн реализации DaemonWorkspaceService (План C)

> Связано: issue #4542, PR #4472, #3803, #4175
> Ветка: `daemon_mode_b_main`
> Дата: 2026-05-27
> Тип: Документ по дизайну реализации (ориентирован на внедрение), не RFC

---

> **Описание области внедрения (обновлено 2026-05-31, PR #4563)**
>
> В этом документе описывается **целевая архитектура**. PR #4563 реализует только её часть, остальное войдёт в последующие PR. При чтении ориентируйтесь на таблицу ниже и не предполагайте, что всё уже реализовано:
>
> | Возможность | Статус в данном PR (#4563) |
| --- | --- |
| Переименование `HttpAcpBridge` → `AcpSessionBridge` | ✅ Реализовано |
| Предоставление bridge обобщённых делегатов `queryWorkspaceStatus` / `invokeWorkspaceCommand` | ✅ Реализовано |
| Workspace-уровневые status / init / tool-toggle / mcp-restart в facade | ✅ Реализовано и подключено (server.ts + диспетчеризация acpHttp через facade) |
| Четыре sub-service: File / Auth / Agents / Memory | ⏳ **отложено** — не в этом PR. Вместе с подключением соответствующих маршрутов, инъекцией `deviceFlowRegistry`/`subagentManager` и e2e-тестами будет реализовано в последующих PR |
| Перенаправление REST-маршрутов `/workspace/memory`, `/workspace/agents` и т.д. на вызов facade | ⏳ **отложено** — в настоящее время по-прежнему напрямую обслуживаются старыми `workspaceMemory.ts` / `workspaceAgents.ts` |
| Диспетчеризация `/acp` northbound `qwen/workspace/*` (§6) | ⏳ **отложено** |
| Использование `fsFactory` / `WorkspaceFileSystem` для `initWorkspace` (trust gate + audit) | ⏳ **отложено** — в настоящее время используется старая реализация bridge с сырым `node:fs` (включая защиту от §SV TOCTOU/symlink), без регрессий; миграция на fsFactory/audit отложена на потом |
>
> Таким образом, §3.4 (интерфейсы sub-service), §6 (/acp northbound), `e2e.test.ts` в §7.1 и описание формы PR в §10 относятся к **целевому/будущему состоянию** и в данном PR не реализованы.

---

## 1. Архитектура и границы

### 1.1 Целевое разделение на уровни

```
                          CLIENTS
   webui    SDK/channels(via REST)    Zed/Goose(/acp)    future
     │             │                       │
═════╪═════════════╪═══════════════════════╪═════════════ L1 transport (тонкий)
   REST+SSE      REST+SSE              /acp (jsonrpc/sse)
   server.ts                           acpHttp/
     └─────────────┴───────────────────────┘
                          │ бизнес-логика/trust/audit всегда опускаются на L2
═════════════════════════╪═══════════════════════════════ L2 прикладной уровень
   ┌──────────────────────────┐   ┌─────────────────────────────────┐
   │ AcpSessionBridge          │   │ DaemonWorkspaceService (facade)  │
   │ (← переименован из HttpAcpBridge)│  ┌──────────────────────────┐   │
   │ • жизненный цикл channel/session │  │ FileService              │   │
   │ • prompt / cancel / close │   │  │ AuthService              │   │
   │ • EventBus / арбитраж прав│   │  │ AgentsService            │   │
   │ • интроспекция состояния, │   │  │ MemoryService            │   │
   │   зависящая от child      │   │  └──────────────────────────┘   │
   │   (mcp/skills/preflight)  │   │  единый WorkspaceRequestContext │
   └──────────┬───────────────┘   └──────────┬──────────────────────┘
              │                    │
              │ L3 → child         │ (чисто локально, не трогает child)
              ▼                    │
══════════════════════════════════════════════════════════ L3 ACP-client
══════════════════════════════════════════════════════════ L4 agent
```

### 1.2 Функция принятия решения о разделении

**Единственное правило: каков scope операции — session или workspace?**

- **session-scoped** (операции с определённым sessionId: prompt/cancel/close/model/approval/metadata/heartbeat) **→ остаются в `AcpSessionBridge`**
- **workspace-scoped** (операции над рабочим пространством в целом: file/auth/agents/memory/mcp-status/skills/env/preflight/tool-toggle/init) **→ переходят в `DaemonWorkspaceService`**

Некоторые методы workspace требуют опроса child (status getters, restartMcpServer) и выполняются через **injected callback**, делегируя запрос каналу bridge; сам service не владеет connection.

### 1.3 Сквозные зависимости: инъекция callback (без общей infra)

В настоящее время `publishWorkspaceEvent` и `knownClientIds` принадлежат bridge (per-session bus fan-out / session-derived). service использует их через **одностороннюю инъекцию callback**, не вводя общий уровень инфраструктуры.

**Обоснование:**

1. EventBus — это per-session bus (`bridge.ts:1457`), workspace-level bus в комментариях к коду запланирован на PR 24 (`bridge.ts:2611`)
2. `knownClientIds` также выводится из session-attach state, в комментариях явно указано "PR 24 will replace it" (`bridge.ts:2658`)
3. Обе задачи являются независимыми и уже поставлены в план; жёсткая привязка к данному PR приведёт к наслоению дополнительного рефакторинга
4. Инъекция callback для service — это односторонняя зависимость (хранит только ссылку на функцию, не зная, что она из bridge); после внедрения PR 24 достаточно будет просто сменить источник инъекции, интерфейс service не изменится

**Жёсткие правила:**

1. В `DaemonWorkspaceServiceDeps` не должно быть ссылок на тип `AcpSessionBridge` — используются только сигнатуры функций.
2. bridge публично предоставляет два новых метода: `queryWorkspaceStatus` и `invokeWorkspaceCommand`, которые service вызывает через callback. Внутри по-прежнему используется существующая логика `requestWorkspaceStatus` / `liveChannelInfo` + timeout, новые абстракции не создаются.

---

## 2. Порядок создания и инъекция зависимостей

```ts
// Порядок создания в runQwenServe.ts

// 1. Сначала создаётся fsFactory (используется обоими)
const fsFactory = resolveBridgeFsFactory({ ... });

// 2. Затем создаётся bridge (он является владельцем session/channel/EventBus)
const bridge = createAcpSessionBridge({
  eventRingSize,
  boundWorkspace,
  fileSystem: createBridgeFileSystemAdapter(fsFactory),
  // ... остальные существующие параметры без изменений
});

// 3. После этого создаётся service, получающий набор callback из bridge
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager,
  boundWorkspace,
  contextFilename,
  // Сквозные callback — service не знает, что они из bridge
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  // Делегирующие callback для child — workspace-scoped ext method достигают agent через channel bridge
  queryWorkspaceStatus: (method, idle) => bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) => bridge.invokeWorkspaceCommand(method, params, opts),
});

// 4. Оба передаются в маршруты server + обработчик /acp
createServeApp({ bridge, workspace, ... });
```

**Порядок создания bridge → service является жёсткой зависимостью** (service нужны методы экземпляра bridge в качестве источника callback).

---

## 3. Внутренняя структура DaemonWorkspaceService

### 3.1 Структура каталогов

```
packages/cli/src/serve/workspace-service/
├── types.ts            ← WorkspaceRequestContext + sub-service interfaces
├── index.ts            ← facade factory (createDaemonWorkspaceService)
├── fileService.ts      ← wraps fsFactory
├── authService.ts      ← wraps DeviceFlowRegistry
├── agentsService.ts    ← wraps SubagentManager
├── memoryService.ts    ← wraps memory file ops
└── __tests__/
    ├── fileService.test.ts
    ├── authService.test.ts
    ├── agentsService.test.ts
    ├── memoryService.test.ts
    └── e2e.test.ts
```

### 3.2 Интерфейс Facade

```ts
export interface DaemonWorkspaceService {
  file: FileService;
  auth: AuthService;
  agents: AgentsService;
  memory: MemoryService;

  // Чисто локально
  initWorkspace(
    opts: InitWorkspaceOpts,
    ctx: WorkspaceRequestContext,
  ): Promise<void>;
  setToolEnabled(
    toolName: string,
    enabled: boolean,
    ctx: WorkspaceRequestContext,
  ): Promise<ToolToggleResult>;

  // Делегируется child через callback
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

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `publishWorkspaceEvent` / `knownClientIds` остаются в bridge — они обращаются к внутреннему per-session state bridge (map `byId` / session bus) и являются инфраструктурой, производной от session. service потребляет их через callback и не владеет ими напрямую.

### 3.3 Сигнатура Facade Factory

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

  // Сквозные callback (инфраструктура, производная от session)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // Делегирующие callback для child (workspace-scoped ext method достигают agent через channel bridge)
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

### 3.4 Интерфейсы sub-service

| Sub-service | Методы | Необходимые deps | Существующий источник |
| --- | --- | --- | --- |
| FileService | `read`, `readBytes`, `write`, `edit`, `glob`, `list`, `stat` | `fsFactory`, `boundWorkspace` | `serve/routes/workspaceFileRead.ts`, `workspaceFileWrite.ts`, `serve/fs/` |
| AuthService | `startFlow`, `getFlowStatus(flowId)`, `cancelFlow(flowId)`, `getAuthStatus` | `deviceFlowRegistry` | `serve/auth/deviceFlow.ts`, `server.ts:794-966` |
| AgentsService | `list`, `get(agentType)`, `create`, `update`, `delete` | `subagentManager`, `publishWorkspaceEvent`, `knownClientIds` | `serve/workspaceAgents.ts` |
| MemoryService | `list`, `read`, `write`, `delete` | `fsFactory` or direct fs, `publishWorkspaceEvent`, `knownClientIds` | `serve/workspaceMemory.ts` |

Первым параметром каждого метода является `ctx: WorkspaceRequestContext`, trust gate выполняется единообразно на входе в метод.

---

## 4. WorkspaceRequestContext

```ts
export interface WorkspaceRequestContext {
  originatorClientId?: string; // заголовок X-Qwen-Client-Id (может отсутствовать для операций только на чтение)
  sessionId?: string; // привязка к audit (например, для операций, инициированных из контекста session)
  route: string; // audit trail (например, "POST /file/write")
  workspaceCwd: string; // корень границы доверия (trust boundary)
}
```

> `originatorClientId` является optional — в настоящее время маршруты только на чтение, такие как file read, работают как обычно при отсутствии заголовка (`clientId ?? undefined` передаётся в `fsFactory.forRequest`). Маршруты записи проверяют легитимность только при **наличии** clientId.

**Место создания**: обработчик маршрута L1 / обработчик метода `/acp` извлекает данные из заголовков/параметров запроса и передаёт их на L2. L2 только потребляет их, не извлекая HTTP-контекст самостоятельно.

---

## 5. Оптимизация и переименование AcpSessionBridge

### 5.1 Методы, выносимые из bridge

| Метод | Куда | Механизм | Обоснование |
| --- | --- | --- | --- |
| `initWorkspace` | `workspace.initWorkspace` | Прямой перенос (чисто локально) | Заодно исправляется FIXME (bridge не подключён к fsFactory, пропускает trust gate / audit) |
| `setWorkspaceToolEnabled` | `workspace.setToolEnabled` | Прямой перенос (чисто локально) | Чистый file I/O + event fan-out, в комментариях явно указано "no ACP roundtrip" |
| `getWorkspaceMcpStatus` | `workspace.getMcpStatus` | через callback `queryWorkspaceStatus` | workspace-scoped status query |
| `getWorkspaceSkillsStatus` | `workspace.getSkillsStatus` | через callback `queryWorkspaceStatus` | Аналогично |
| `getWorkspaceProvidersStatus` | `workspace.getProvidersStatus` | через callback `queryWorkspaceStatus` | Аналогично |
| `getWorkspaceEnvStatus` | `workspace.getEnvStatus` | через callback `queryWorkspaceStatus` | Аналогично |
| `getWorkspacePreflightStatus` | `workspace.getPreflightStatus` | через callback `queryWorkspaceStatus` | Аналогично |
| `restartMcpServer` | `workspace.restartMcpServer` | через callback `invokeWorkspaceCommand` | workspace-scoped mutation |
> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` остаются в bridge — они обращаются к внутренней session map `byId` в bridge и являются session-scoped операциями.

### 5.2 Остается в bridge

- Полный жизненный цикл session/channel (spawn/load/resume/send/cancel/close/kill/detach)
- Хранение EventBus + реализация fan-out для `publishWorkspaceEvent` (для использования в service callback)
- `knownClientIds` (для использования в service callback)
- `queryWorkspaceStatus` / `invokeWorkspaceCommand` (новые открытые методы, инкапсулирующие channel + timeout + error, для делегирования из service callback)
- Медиатор арбитража прав доступа
- Изменение конфигурации session (model/approvalMode/recap)
- Состояние session (context/supportedCommands/metadata/heartbeat/listSessions)

### 5.3 Переименование

- `HttpAcpBridge` → `AcpSessionBridge`
- `createHttpAcpBridge` → `createAcpSessionBridge`
- Файл `serve/httpAcpBridge.ts` → `serve/acpSessionBridge.ts`

Внешних потребителей пакета нет (проверено отсутствие ссылок за пределами `packages/cli/src/serve/` и `packages/acp-bridge/src/`), изменение безопасно для внутреннего использования.

---

## 6. Northbound ext methods для /acp

### 6.1 Пространства имен

`qwen/workspace/...` (отделяем от существующего `qwen/control/...`):

- `qwen/control/...` = пересылка команд daemon→child (southbound, через AcpSessionBridge)
- `qwen/workspace/...` = локальные операции с рабочей областью daemon (northbound, завершаются в DaemonWorkspaceService)

> Ожидается подтверждение от chiga0. При изменении пространства имен потребуется только замена префикса имен методов, на архитектуру это не повлияет.

### 6.2 Список методов

| method                            | Соответствующий REST                              | Вызов L2                                            |
| --------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| `qwen/workspace/fs/read`          | `GET /file?path=...`                              | `workspace.file.read(ctx, path)`                    |
| `qwen/workspace/fs/readBytes`     | `GET /file/bytes?path=...`                        | `workspace.file.readBytes(ctx, path)`               |
| `qwen/workspace/fs/write`         | `POST /file/write`                                | `workspace.file.write(ctx, path, content)`          |
| `qwen/workspace/fs/edit`          | `POST /file/edit`                                 | `workspace.file.edit(ctx, path, edits)`             |
| `qwen/workspace/fs/glob`          | `GET /glob?pattern=...`                           | `workspace.file.glob(ctx, pattern)`                 |
| `qwen/workspace/fs/list`          | `GET /list?path=...`                              | `workspace.file.list(ctx, path)`                    |
| `qwen/workspace/fs/stat`          | `GET /stat?path=...`                              | `workspace.file.stat(ctx, path)`                    |
| `qwen/workspace/auth/start`       | `POST /workspace/auth/device-flow`                | `workspace.auth.startFlow(ctx)`                     |
| `qwen/workspace/auth/status`      | `GET /workspace/auth/status`                      | `workspace.auth.getAuthStatus(ctx)`                 |
| `qwen/workspace/auth/flow`        | `GET /workspace/auth/device-flow/:id`             | `workspace.auth.getFlowStatus(ctx, flowId)`         |
| `qwen/workspace/auth/cancel`      | `POST /workspace/auth/device-flow/:id` (cancel)   | `workspace.auth.cancelFlow(ctx, flowId)`            |
| `qwen/workspace/agents/list`      | `GET /workspace/agents`                           | `workspace.agents.list(ctx)`                        |
| `qwen/workspace/agents/get`       | `GET /workspace/agents/:agentType`                | `workspace.agents.get(ctx, agentType)`              |
| `qwen/workspace/agents/create`    | `POST /workspace/agents`                          | `workspace.agents.create(ctx, spec)`                |
| `qwen/workspace/agents/update`    | `POST /workspace/agents/:agentType`               | `workspace.agents.update(ctx, agentType, spec)`     |
| `qwen/workspace/agents/delete`    | `DELETE /workspace/agents/:agentType`             | `workspace.agents.delete(ctx, agentType)`           |
| `qwen/workspace/memory/list`      | `GET /workspace/memory`                           | `workspace.memory.list(ctx)`                        |
| `qwen/workspace/memory/read`      | `GET /workspace/memory/:key`                      | `workspace.memory.read(ctx, key)`                   |
| `qwen/workspace/memory/write`     | `POST /workspace/memory`                          | `workspace.memory.write(ctx, key, content)`         |
| `qwen/workspace/memory/delete`    | `DELETE /workspace/memory/:key`                   | `workspace.memory.delete(ctx, key)`                 |
| `qwen/workspace/init`             | `POST /workspace/init`                            | `workspace.initWorkspace(ctx, opts)`                |
| `qwen/workspace/tool/toggle`      | `POST /workspace/tool/toggle`                     | `workspace.setToolEnabled(ctx, toolName, enabled)`  |
| `qwen/workspace/status/mcp`       | `GET /workspace/mcp`                              | `workspace.getMcpStatus()`                          |
| `qwen/workspace/status/skills`    | `GET /workspace/skills`                           | `workspace.getSkillsStatus()`                       |
| `qwen/workspace/status/providers` | `GET /workspace/providers`                        | `workspace.getProvidersStatus()`                    |
| `qwen/workspace/status/env`       | `GET /workspace/env`                              | `workspace.getEnvStatus()`                          |
| `qwen/workspace/status/preflight` | `GET /workspace/preflight`                        | `workspace.getPreflightStatus()`                    |
| `qwen/workspace/mcp/restart`      | `POST /workspace/mcp/restart`                     | `workspace.restartMcpServer(ctx, serverName, opts)` |

При объявлении capabilities (advertise) эти методы указываются в `_meta.qwen.methods`.

---

## 7. Список изменений файлов

### 7.1 Новые файлы

| Файл                                                      | Назначение                                         |
| --------------------------------------------------------- | -------------------------------------------------- |
| `serve/workspace-service/types.ts`                        | `WorkspaceRequestContext` + интерфейсы sub-service |
| `serve/workspace-service/index.ts`                        | фабрика facade                                     |
| `serve/workspace-service/fileService.ts`                  | Реализация FileService                             |
| `serve/workspace-service/authService.ts`                  | Реализация AuthService                             |
| `serve/workspace-service/agentsService.ts`                | Реализация AgentsService                           |
| `serve/workspace-service/memoryService.ts`                | Реализация MemoryService                           |
| `serve/workspace-service/__tests__/fileService.test.ts`   | модульный тест                                     |
| `serve/workspace-service/__tests__/authService.test.ts`   | модульный тест                                     |
| `serve/workspace-service/__tests__/agentsService.test.ts` | модульный тест                                     |
| `serve/workspace-service/__tests__/memoryService.test.ts` | модульный тест                                     |
| `serve/workspace-service/__tests__/e2e.test.ts`           | сквозное (end-to-end) тестирование эквивалентности REST ↔ /acp |

### 7.2 Измененные файлы

| Файл                                                          | Изменения                                                                                                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp-bridge/src/bridge.ts`                                    | Удалены 8 методов workspace (initWorkspace / setWorkspaceToolEnabled / 5 status getters / restartMcpServer); добавлены открытые `queryWorkspaceStatus` + `invokeWorkspaceCommand`; переименована фабричная функция |
| `acp-bridge/src/bridgeTypes.ts`                               | Интерфейс переименован: `HttpAcpBridge` → `AcpSessionBridge`; удалены сигнатуры 8 методов workspace; добавлены сигнатуры `queryWorkspaceStatus` + `invokeWorkspaceCommand` |
| `acp-bridge/src/bridgeOptions.ts`                             | Обновлены ссылки в JSDoc                                                                                                                                                      |
| `acp-bridge/src/status.ts`                                    | Обновлено имя класса в сообщениях об ошибках                                                                                                                                  |
| `cli/src/serve/httpAcpBridge.ts` → переименован в `acpSessionBridge.ts` | Обновлен re-export                                                                                                                                                              |
| `cli/src/serve/runQwenServe.ts`                               | Создается `DaemonWorkspaceService`, инжектится callback, передается в routes и обработчик /acp                                                                                |
| `cli/src/serve/server.ts`                                     | routes переключены с прямого вызова `fsFactory`/`DeviceFlowRegistry` на вызов `workspace.file.*` / `workspace.auth.*`                                                         |
| `cli/src/serve/workspaceAgents.ts`                            | Бизнес-логика перенесена в `agentsService.ts`; исходный файл стал тонкой оболочкой для route handler (формирует ctx → вызывает service)                                       |
| `cli/src/serve/workspaceMemory.ts`                            | Аналогично                                                                                                                                                                    |
| `cli/src/serve/routes/workspaceFileRead.ts`                   | Аналогично                                                                                                                                                                    |
| `cli/src/serve/routes/workspaceFileWrite.ts`                  | Аналогично                                                                                                                                                                    |
| Обработчик `/acp` (внутри `acp-integration/` или `serve/`)    | Добавлена диспетчеризация northbound методов                                                                                                                                  |

---

## 8. Совместимость SDK и формат ошибок

### 8.1 Обратная совместимость SDK

Поверхность REST API (пути, HTTP-методы, JSON-схемы запросов/ответов) остается без изменений. `DaemonClient` / `DaemonSessionClient` в `sdk-typescript` не требуют никаких изменений.

Способ проверки: существующие `packages/sdk-typescript/test/unit/DaemonClient.test.ts` и `DaemonSessionClient.test.ts` должны проходить в этом PR без каких-либо изменений.

### 8.2 Формат ошибок при отклонении trust gate в /acp

Оба транспорта семантически эквивалентны, но имеют разное кодирование:

| Сценарий                          | REST                                       | /acp (JSON-RPC)                                                          |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Недействительный/отсутствующий bearer token | `401 { error, code: "unauthorized" }`      | `{ error: { code: -32001, message: "unauthorized" } }`                   |
| Недействительный clientId         | `400 { error, code: "invalid_client_id" }` | `{ error: { code: -32602, message: "invalid_client_id", data: {...} } }` |
| Отклонение trust gate (выход за пределы пути и т.д.) | `403 { error, code: "forbidden" }`         | `{ error: { code: -32003, message: "forbidden", data: {...} } }`         |

> Коды ошибок JSON-RPC следуют [реестру кодов ошибок ACP](https://spec.acpprotocol.org) (стандартный диапазон -32000 ~ -32099 предназначен для server-defined application errors). Конкретные значения кодов при реализации приводятся в соответствие с существующей логикой маппинга ошибок для `/acp` (`acp-integration/errorCodes.ts`).

---

## 9. Стратегия тестирования

| Уровень           | Тип тестов                                                            | Целевое покрытие                                                 |
| ----------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Модульные тесты sub-service | Jest, моки fsFactory / DeviceFlowRegistry / SubagentManager / callbacks | Корректность бизнес-логики + отклонение недействительных clientId через trust gate |
| Интеграционные тесты routes | Существующие тесты routes переделаны для работы через сервис (проверка неизменности поверхности HTTP) | Гарантия отсутствия регрессий, REST-пути не ломаются             |
| Сквозная проверка эквивалентности (E2E) | Запуск реального serve + HTTP-запросы                             | REST и `/acp` возвращают эквивалентные результаты для одной операции; trust gate единообразно отклоняет запросы на обоих концах |
### Матрица E2E-валидации

- Чтение/запись файлов: REST `GET /file` vs `/acp` `qwen/workspace/fs/read` → одинаковый результат
- CRUD для агентов: REST `POST /workspace/agents` vs `/acp` `qwen/workspace/agents/create` → одинаковое поведение
- Отклонение на trust gate: невалидный `clientId` возвращает 403 на обоих путях
- Инициализация workspace: проверка прохождения через `fsFactory` + формирование audit trail

---

## 10. Формат PR

Атомарный коммит в одном PR, включающий:

- Все новые файлы для `DaemonWorkspaceService`
- Изменение REST route handler'ов для вызова service
- Уменьшение размера bridge (вынос 8 методов workspace) + добавление 2 новых дочерних делегирующих методов
- Переименование `HttpAcpBridge` → `AcpSessionBridge`
- Добавление новых northbound ext methods для `/acp` (27 штук)
- Полный набор тестов (unit + integration + e2e)

---

## 11. Что явно не входит в скоуп (scope boundary)

- `EventBus` с областью видимости workspace (территория PR 24)
- `ClientRegistry` с областью видимости workspace (территория PR 24)
- Разделение L2 ↔ L3 (вынос `ClientSideConnection` из bridge)
- Создание REST в виде `/acp` compat shim (долгосрочное направление)
- Унификация standalone-режима для channels (вопрос независимого формата развертывания)
- Миграция `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` (область видимости session, оставляем на месте)
- Передача владения `publishWorkspaceEvent` / `knownClientIds` (инфраструктура, производная от session; остается в bridge, service потребляет через callback)

---

## 12. Точки принятия решений, ожидающие подтверждения от chiga0

1. Northbound-пространство имен для `/acp`: `qwen/workspace/...` или другое (например, переиспользовать `qwen/control/...`)
2. Делать ли переименование в том же PR: склоняемся к тому, чтобы в том же, но по фидбеку можно вынести отдельно

> Если по этим двум пунктам потребуются изменения, это повлияет только на нейминг и границы коммитов, но не на архитектуру.