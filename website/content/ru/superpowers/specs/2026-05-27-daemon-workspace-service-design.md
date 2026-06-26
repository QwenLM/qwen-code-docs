# Проектирование реализации DaemonWorkspaceService (Вариант C)

> Связь: issue #4542, PR #4472, #3803, #4175
> Ветка: `daemon_mode_b_main`
> Дата: 2026-05-27
> Характер: документ проектирования реализации (ориентирован на внедрение), не RFC

---

> **Пояснение по объему внедрения (обновление от 2026-05-31, PR #4563)**
>
> Этот документ описывает **архитектуру конечного состояния**. PR #4563 внедряет только её часть, остальное — в рамках последующих PR. При чтении ориентируйтесь на таблицу ниже, не предполагайте, что всё уже реализовано:
>
> | Возможность                                                                       | Статус в данном PR (#4563)                                                                                             |
> | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
> | `HttpAcpBridge` → переименование в `AcpSessionBridge`                             | ✅ Внедрено                                                                                                             |
> | bridge предоставляет обобщённые делегаты `queryWorkspaceStatus` / `invokeWorkspaceCommand` | ✅ Внедрено                                                                                                             |
> | Фасадные методы уровня workspace: **status / init / tool-toggle / mcp-restart**   | ✅ Внедрены и подключены (сервер.ts + диспетчеризация acpHttp через фасад)                                              |
> | **Четыре подсервиса: File / Auth / Agents / Memory**                              | ⏳ **Отложены** — не входят в данный PR. Вместе с соответствующей маршрутизацией, инжекцией `deviceFlowRegistry`/`subagentManager` и e2e-тестами будут внедрены в последующих PR |
> | REST-маршруты `/workspace/memory`, `/workspace/agents` и т.д. переключаются на фасад | ⏳ **Отложено** — пока обслуживаются старыми `workspaceMemory.ts` / `workspaceAgents.ts` напрямую                      |
> | Диспетчеризация `/acp` northbound `qwen/workspace/*` (§6)                        | ⏳ **Отложено**                                                                                                         |
> | `initWorkspace` через `fsFactory` / `WorkspaceFileSystem` (trust gate + audit)   | ⏳ **Отложено** — текущая реализация использует сырой `node:fs` старого bridge (включая защиту от §SV TOCTOU/symlink), без регрессии; миграция на fsFactory/audit отложена |
>
> Таким образом, §3.4 (интерфейсы подсервисов), §6 (northbound /acp), §7.1 (`e2e.test.ts`), §10 (описание PR) относятся к **конечному/будущему объёму** и не реализованы в данном PR.

---

## 1. Архитектура и границы

### 1.1 Уровни конечного состояния

```
                          КЛИЕНТЫ
   webui    SDK/каналы(через REST)    Zed/Goose(/acp)    future
     │             │                       │
═════╪═════════════╪═══════════════════════╪═════════════ L1 transport (тонкий)
   REST+SSE      REST+SSE              /acp (jsonrpc/sse)
   server.ts                           acpHttp/
     └─────────────┴───────────────────────┘
                          │ бизнес/trust/audit всегда опускаются на L2
═════════════════════════╪═══════════════════════════════ L2 прикладной уровень
   ┌──────────────────────────┐   ┌─────────────────────────────────┐
   │ AcpSessionBridge          │   │ DaemonWorkspaceService (facade)  │
   │ (← переименованный        │   │  ┌──────────────────────────┐   │
   │   HttpAcpBridge)          │   │  │ FileService              │   │
   │ • жизненный цикл канал/   │   │  │ AuthService              │   │
   │   сессия                  │   │  │ AgentsService            │   │
   │ • prompt / cancel / close │   │  │ MemoryService            │   │
   │ • EventBus / арбитраж прав│   │  └──────────────────────────┘   │
   │ • самоанализ состояния    │   │   Единый WorkspaceRequestContext │
   │   дочернего процесса      │   └──────────┬──────────────────────┘
   │   (mcp/skills/preflight)  │              │
   └──────────┬───────────────┘              │ (чисто локальный, не трогает дочерний)
              │ L3 → дочерний процесс        │
              ▼                               │
══════════════════════════════════════════════════════════ L3 ACP-клиент
══════════════════════════════════════════════════════════ L4 агент
```

### 1.2 Функция разделения

**Единственное правило:** область действия операции — сессия или рабочее пространство?

- **Область сессии** (операции с конкретным sessionId: prompt/cancel/close/model/approval/metadata/heartbeat) → остаются в `AcpSessionBridge`
- **Область рабочего пространства** (операции с целым workspace: file/auth/agents/memory/mcp-status/skills/env/preflight/tool-toggle/init) → переходят в `DaemonWorkspaceService`

Некоторым методам workspace требуется запрос к дочернему процессу (геттеры статуса, restartMcpServer). Они выполняются через **внедрённый callback**, делегирующий каналу bridge. Сам сервис не владеет соединением.

### 1.3 Сквозные зависимости: внедрение callback (не общая инфраструктура)

В настоящее время `publishWorkspaceEvent` и `knownClientIds` принадлежат bridge (per-session bus fan-out / производная от сессии). Сервис использует их через **однонаправленное внедрение callback**, не вводя общий инфраструктурный слой.

**Причины:**

1. EventBus — это per-session bus (`bridge.ts:1457`); workspace-level bus в комментариях к коду привязан к PR 24 (`bridge.ts:2611`).
2. `knownClientIds` также является производным от состояния подключения сессии, комментарий явно указывает "PR 24 will replace it" (`bridge.ts:2658`).
3. Обе эти сущности — выделенные независимые работы; жёстко привязывать их к данному PR означает накладывать дополнительный рефакторинг.
4. Внедрение callback создаёт однонаправленную зависимость для сервиса (он хранит только ссылку на функцию, не зная о bridge); после внедрения PR 24 источник инжекции можно заменить, интерфейс сервиса не изменится.

**Жёсткие правила:**

1. В `DaemonWorkspaceServiceDeps` **не должно быть** ссылок на тип `AcpSessionBridge` — только сигнатуры функций.
2. Bridge предоставляет наружу два новых метода `queryWorkspaceStatus` и `invokeWorkspaceCommand`, которые сервис вызывает через callback. Внутри bridge по-прежнему использует существующую логику `requestWorkspaceStatus` / `liveChannelInfo` + timeout, без создания новых абстракций.

---

## 2. Порядок создания и внедрение зависимостей

```ts
// Порядок создания в runQwenServe.ts

// 1. Сначала создаётся fsFactory (общий для обоих)
const fsFactory = resolveBridgeFsFactory({ ... });

// 2. Затем создаётся bridge (владелец сессии/канала/EventBus)
const bridge = createAcpSessionBridge({
  eventRingSize,
  boundWorkspace,
  fileSystem: createBridgeFileSystemAdapter(fsFactory),
  // ... остальные существующие параметры без изменений
});

// 3. Затем создаётся сервис, получающий набор callback от bridge
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager,
  boundWorkspace,
  contextFilename,
  // сквозные callback — сервис не знает, что они из bridge
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  // callback делегирования дочернему процессу — методы уровня workspace доходят до агента через канал bridge
  queryWorkspaceStatus: (method, idle) => bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) => bridge.invokeWorkspaceCommand(method, params, opts),
});

// 4. Оба передаются в маршруты сервера и обработчик /acp
createServeApp({ bridge, workspace, ... });
```

**Порядок создания bridge → сервис является жёсткой зависимостью** (сервису нужны методы экземпляра bridge в качестве источника callback).

---

## 3. Внутренняя структура DaemonWorkspaceService

### 3.1 Структура каталогов

```
packages/cli/src/serve/workspace-service/
├── types.ts            ← WorkspaceRequestContext + интерфейсы подсервисов
├── index.ts            ← фабрика фасада (createDaemonWorkspaceService)
├── fileService.ts      ← обёртка над fsFactory
├── authService.ts      ← обёртка над DeviceFlowRegistry
├── agentsService.ts    ← обёртка над SubagentManager
├── memoryService.ts    ← обёртка над операциями с файлами памяти
└── __tests__/
    ├── fileService.test.ts
    ├── authService.test.ts
    ├── agentsService.test.ts
    ├── memoryService.test.ts
    └── e2e.test.ts
```

### 3.2 Интерфейс фасада

```ts
export interface DaemonWorkspaceService {
  file: FileService;
  auth: AuthService;
  agents: AgentsService;
  memory: MemoryService;

  // чисто локальные
  initWorkspace(
    opts: InitWorkspaceOpts,
    ctx: WorkspaceRequestContext,
  ): Promise<void>;
  setToolEnabled(
    toolName: string,
    enabled: boolean,
    ctx: WorkspaceRequestContext,
  ): Promise<ToolToggleResult>;

  // через callback к дочернему процессу
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

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `publishWorkspaceEvent` / `knownClientIds` остаются в bridge — они обращаются к внутреннему per-session состоянию bridge (карта `byId` / шина сессии), являясь производной инфраструктурой от сессии. Сервис потребляет их через callback, а не владеет ими напрямую.

### 3.3 Сигнатура фабрики фасада

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

  // сквозные callback (производная инфраструктура от сессии)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // callback делегирования дочернему процессу (методы уровня workspace доходят до агента через канал bridge)
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

### 3.4 Интерфейсы подсервисов

| Подсервис     | Методы                                                                                           | Требуемые зависимости                                              | Существующий источник                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| FileService   | `read`, `readBytes`, `write`, `edit`, `glob`, `list`, `stat`                                    | `fsFactory`, `boundWorkspace`                                      | `serve/routes/workspaceFileRead.ts`, `workspaceFileWrite.ts`, `serve/fs/`                  |
| AuthService   | `startFlow`, `getFlowStatus(flowId)`, `cancelFlow(flowId)`, `getAuthStatus`                     | `deviceFlowRegistry`                                               | `serve/auth/deviceFlow.ts`, `server.ts:794-966`                                            |
| AgentsService | `list`, `get(agentType)`, `create`, `update`, `delete`                                          | `subagentManager`, `publishWorkspaceEvent`, `knownClientIds`       | `serve/workspaceAgents.ts`                                                                |
| MemoryService | `list`, `read`, `write`, `delete`                                                               | `fsFactory` или прямой fs, `publishWorkspaceEvent`, `knownClientIds` | `serve/workspaceMemory.ts`                                                                |

Первым параметром каждого метода является `ctx: WorkspaceRequestContext`, проверка trust gate выполняется единообразно на входе в метод.

---

## 4. WorkspaceRequestContext

```ts
export interface WorkspaceRequestContext {
  originatorClientId?: string; // заголовок X-Qwen-Client-Id (может отсутствовать для операций чтения)
  sessionId?: string; // связь с аудитом (например, для операций, инициированных из контекста сессии)
  route: string; // трассировка аудита (например "POST /file/write")
  workspaceCwd: string; // корень границы доверия
}
```

> `originatorClientId` является опциональным — текущие маршруты чтения (например, file read) работают и при отсутствии заголовка (`clientId ?? undefined` передаётся в `fsFactory.forRequest`). Маршруты записи проверяют легитимность **только при наличии** clientId.

**Место создания**: обработчик L1 route / метод `/acp` извлекает данные из заголовков/параметров запроса и передаёт на L2. L2 только потребляет, не извлекая HTTP-контекст самостоятельно.

---

## 5. Упрощение и переименование AcpSessionBridge

### 5.1 Методы, перемещаемые из bridge

| Метод                          | Назначение                      | Механизм                             | Обоснование                                                                       |
| ------------------------------ | ------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `initWorkspace`                | `workspace.initWorkspace`       | прямой перенос (чисто локальный)     | Заодно исправляется FIXME (bridge не подключал fsFactory, пропускал trust gate/audit) |
| `setWorkspaceToolEnabled`      | `workspace.setToolEnabled`      | прямой перенос (чисто локальный)     | Чистый файловый ввод-вывод + fan-out событий, комментарий явно указывает "no ACP roundtrip" |
| `getWorkspaceMcpStatus`        | `workspace.getMcpStatus`        | через callback `queryWorkspaceStatus` | Запрос статуса уровня workspace                                                   |
| `getWorkspaceSkillsStatus`     | `workspace.getSkillsStatus`     | через callback `queryWorkspaceStatus` | То же                                                                             |
| `getWorkspaceProvidersStatus`  | `workspace.getProvidersStatus`  | через callback `queryWorkspaceStatus` | То же                                                                             |
| `getWorkspaceEnvStatus`        | `workspace.getEnvStatus`        | через callback `queryWorkspaceStatus` | То же                                                                             |
| `getWorkspacePreflightStatus`  | `workspace.getPreflightStatus`  | через callback `queryWorkspaceStatus` | То же                                                                             |
| `restartMcpServer`             | `workspace.restartMcpServer`    | через callback `invokeWorkspaceCommand` | Мутация уровня workspace                                                       |

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` остаются в bridge — они обращаются к внутренней карте сессий `byId` bridge, являясь операциями уровня сессии.

### 5.2 Остаётся в bridge

- Весь жизненный цикл сессии/канала (spawn/load/resume/send/cancel/close/kill/detach)
- Владение EventBus + реализация fan-out `publishWorkspaceEvent` (для потребления сервисом через callback)
- `knownClientIds` (для потребления сервисом через callback)
- `queryWorkspaceStatus` / `invokeWorkspaceCommand` (новые, инкапсулируют канал + timeout + ошибку, для делегирования сервисом через callback)
- Посредник арбитража прав
- Изменение конфигурации сессии (model/approvalMode/recap)
- Состояние сессии (context/supportedCommands/metadata/heartbeat/listSessions)

### 5.3 Переименование

- `HttpAcpBridge` → `AcpSessionBridge`
- `createHttpAcpBridge` → `createAcpSessionBridge`
- Файл `serve/httpAcpBridge.ts` → `serve/acpSessionBridge.ts`

Внешних потребителей пакета нет (проверено: нет ссылок за пределами `packages/cli/src/serve/` и `packages/acp-bridge/src/`), внутреннее изменение безопасно.

---

## 6. Методы расширения northbound /acp

### 6.1 Пространство имён

`qwen/workspace/...` (отличается от существующего `qwen/control/...`):

- `qwen/control/...` = команды пересылки от демона к дочернему процессу (southbound, через AcpSessionBridge)
- `qwen/workspace/...` = локальные операции с рабочим пространством демона (northbound, завершаются в DaemonWorkspaceService)

> Ожидается подтверждение от chiga0. Если пространство имён будет изменено, потребуется только заменить префикс имени метода, архитектура не изменится.

### 6.2 Список методов

| method                            | Соответствующий REST                                | Вызов L2                                            |
| --------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `qwen/workspace/fs/read`          | `GET /file?path=...`                                | `workspace.file.read(ctx, path)`                    |
| `qwen/workspace/fs/readBytes`     | `GET /file/bytes?path=...`                          | `workspace.file.readBytes(ctx, path)`               |
| `qwen/workspace/fs/write`         | `POST /file/write`                                  | `workspace.file.write(ctx, path, content)`          |
| `qwen/workspace/fs/edit`          | `POST /file/edit`                                   | `workspace.file.edit(ctx, path, edits)`             |
| `qwen/workspace/fs/glob`          | `GET /glob?pattern=...`                             | `workspace.file.glob(ctx, pattern)`                 |
| `qwen/workspace/fs/list`          | `GET /list?path=...`                                | `workspace.file.list(ctx, path)`                    |
| `qwen/workspace/fs/stat`          | `GET /stat?path=...`                                | `workspace.file.stat(ctx, path)`                    |
| `qwen/workspace/auth/start`       | `POST /workspace/auth/device-flow`                  | `workspace.auth.startFlow(ctx)`                     |
| `qwen/workspace/auth/status`      | `GET /workspace/auth/status`                        | `workspace.auth.getAuthStatus(ctx)`                 |
| `qwen/workspace/auth/flow`        | `GET /workspace/auth/device-flow/:id`               | `workspace.auth.getFlowStatus(ctx, flowId)`         |
| `qwen/workspace/auth/cancel`      | `POST /workspace/auth/device-flow/:id` (отмена)    | `workspace.auth.cancelFlow(ctx, flowId)`            |
| `qwen/workspace/agents/list`      | `GET /workspace/agents`                             | `workspace.agents.list(ctx)`                        |
| `qwen/workspace/agents/get`       | `GET /workspace/agents/:agentType`                  | `workspace.agents.get(ctx, agentType)`              |
| `qwen/workspace/agents/create`    | `POST /workspace/agents`                            | `workspace.agents.create(ctx, spec)`                |
| `qwen/workspace/agents/update`    | `POST /workspace/agents/:agentType`                 | `workspace.agents.update(ctx, agentType, spec)`     |
| `qwen/workspace/agents/delete`    | `DELETE /workspace/agents/:agentType`               | `workspace.agents.delete(ctx, agentType)`           |
| `qwen/workspace/memory/list`      | `GET /workspace/memory`                             | `workspace.memory.list(ctx)`                        |
| `qwen/workspace/memory/read`      | `GET /workspace/memory/:key`                        | `workspace.memory.read(ctx, key)`                   |
| `qwen/workspace/memory/write`     | `POST /workspace/memory`                            | `workspace.memory.write(ctx, key, content)`         |
| `qwen/workspace/memory/delete`    | `DELETE /workspace/memory/:key`                     | `workspace.memory.delete(ctx, key)`                 |
| `qwen/workspace/init`             | `POST /workspace/init`                              | `workspace.initWorkspace(ctx, opts)`                |
| `qwen/workspace/tool/toggle`      | `POST /workspace/tool/toggle`                       | `workspace.setToolEnabled(ctx, toolName, enabled)`  |
| `qwen/workspace/status/mcp`       | `GET /workspace/mcp`                                | `workspace.getMcpStatus()`                          |
| `qwen/workspace/status/skills`    | `GET /workspace/skills`                             | `workspace.getSkillsStatus()`                       |
| `qwen/workspace/status/providers` | `GET /workspace/providers`                          | `workspace.getProvidersStatus()`                    |
| `qwen/workspace/status/env`       | `GET /workspace/env`                                | `workspace.getEnvStatus()`                          |
| `qwen/workspace/status/preflight` | `GET /workspace/preflight`                          | `workspace.getPreflightStatus()`                    |
| `qwen/workspace/mcp/restart`      | `POST /workspace/mcp/restart`                       | `workspace.restartMcpServer(ctx, serverName, opts)` |

При объявлении возможностей эти методы указываются в `_meta.qwen.methods`.

---

## 7. Список изменений файлов

### 7.1 Новые файлы

| Файл                                                          | Назначение                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `serve/workspace-service/types.ts`                            | `WorkspaceRequestContext` + интерфейсы подсервисов          |
| `serve/workspace-service/index.ts`                            | фабрика фасада                                              |
| `serve/workspace-service/fileService.ts`                      | Реализация FileService                                     |
| `serve/workspace-service/authService.ts`                      | Реализация AuthService                                     |
| `serve/workspace-service/agentsService.ts`                    | Реализация AgentsService                                   |
| `serve/workspace-service/memoryService.ts`                    | Реализация MemoryService                                   |
| `serve/workspace-service/__tests__/fileService.test.ts`       | модульный тест                                             |
| `serve/workspace-service/__tests__/authService.test.ts`       | модульный тест                                             |
| `serve/workspace-service/__tests__/agentsService.test.ts`     | модульный тест                                             |
| `serve/workspace-service/__tests__/memoryService.test.ts`     | модульный тест                                             |
| `serve/workspace-service/__tests__/e2e.test.ts`               | сквозной тест для проверки эквивалентности REST ↔ /acp    |

### 7.2 Изменённые файлы

| Файл                                                          | Изменения                                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp-bridge/src/bridge.ts`                                    | Удалены 8 методов workspace (initWorkspace / setWorkspaceToolEnabled / 5 геттеров статуса / restartMcpServer); добавлены `queryWorkspaceStatus` + `invokeWorkspaceCommand`; переименована фабричная функция |
| `acp-bridge/src/bridgeTypes.ts`                               | Интерфейс переименован `HttpAcpBridge` → `AcpSessionBridge`; удалены сигнатуры 8 методов workspace; добавлены сигнатуры `queryWorkspaceStatus` + `invokeWorkspaceCommand`    |
| `acp-bridge/src/bridgeOptions.ts`                             | Обновлены ссылки в JSDoc                                                                                                                                                  |
| `acp-bridge/src/status.ts`                                    | Обновлено имя класса в сообщениях об ошибках                                                                                                                               |
| `cli/src/serve/httpAcpBridge.ts` → переименован в `acpSessionBridge.ts` | Обновление re-export                                                                                                                                                     |
| `cli/src/serve/runQwenServe.ts`                               | Создание `DaemonWorkspaceService`, инжекция callback, передача в маршруты и обработчик /acp                                                                                |
| `cli/src/serve/server.ts`                                     | Маршруты переключаются с прямого использования `fsFactory`/`DeviceFlowRegistry` на вызов `workspace.file.*` / `workspace.auth.*`                                             |
| `cli/src/serve/workspaceAgents.ts`                            | Бизнес-логика перенесена в `agentsService.ts`; исходный файл становится тонкой обёрткой обработчика маршрута (создание ctx → вызов сервиса)                                 |
| `cli/src/serve/workspaceMemory.ts`                            | Аналогично                                                                                                                                                                  |
| `cli/src/serve/routes/workspaceFileRead.ts`                   | Аналогично                                                                                                                                                                  |
| `cli/src/serve/routes/workspaceFileWrite.ts`                  | Аналогично                                                                                                                                                                  |
| Обработчик `/acp` (внутри `acp-integration/` или `serve/`)    | Добавлена диспетчеризация методов northbound                                                                                                                               |
---

## 8. Совместимость SDK и формат ошибок

### 8.1 Обратная совместимость SDK

Поверхность REST API (пути, HTTP-методы, JSON-схемы запросов/ответов) остаётся неизменной. `DaemonClient` / `DaemonSessionClient` в `sdk-typescript` не требуют никаких изменений.

Способ проверки: существующие `packages/sdk-typescript/test/unit/DaemonClient.test.ts` и `DaemonSessionClient.test.ts` должны проходить без изменений в данном PR.

### 8.2 Формат ошибок при отклонении через trust gate в /acp

Два транспорта семантически эквивалентны, но кодируются по-разному:

| Сценарий                                  | REST                                       | /acp (JSON-RPC)                                                          |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Недействительный/отсутствующий bearer token | `401 { error, code: "unauthorized" }`      | `{ error: { code: -32001, message: "unauthorized" } }`                   |
| Недействительный clientId                 | `400 { error, code: "invalid_client_id" }` | `{ error: { code: -32602, message: "invalid_client_id", data: {...} } }` |
| Отклонение trust gate (обход пути и т.п.) | `403 { error, code: "forbidden" }`         | `{ error: { code: -32003, message: "forbidden", data: {...} } }`         |

> Коды ошибок JSON-RPC следуют [реестру кодов ошибок ACP](https://spec.acpprotocol.org) (стандартный диапазон -32000 ~ -32099 — определённые сервером ошибки приложения). Конкретные значения кодов при реализации согласовываются с существующей логикой отображения ошибок `/acp` (`acp-integration/errorCodes.ts`).

---

## 9. Стратегия тестирования

| Уровень               | Тип теста                                                               | Цель покрытия                                               |
| --------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Модульные (sub-service) | Jest, mock fsFactory / DeviceFlowRegistry / SubagentManager / callbacks | Корректность бизнес-логики + отклонение недопустимого clientId через trust gate |
| Интеграционные (route) | Существующие тесты маршрутов перенаправлены через service (проверка неизменности HTTP-поверхности) | Регрессионная защита, REST-пути не ломаются                 |
| E2e-эквивалентность   | Запуск реального serve + HTTP-запросы                                   | REST и `/acp` возвращают эквивалентные результаты для одной и той же операции; trust gate одинаково отклоняет на обоих концах |

### Матрица E2e-проверок

- Чтение/запись файлов: REST `GET /file` vs `/acp` `qwen/workspace/fs/read` → одинаковые результаты
- CRUD агентов: REST `POST /workspace/agents` vs `/acp` `qwen/workspace/agents/create` → одинаковое поведение
- Отклонение trust gate: недействительный clientId по обоим путям возвращает 403
- Инициализация workspace: проверка прохождения fsFactory + создание audit trail

---

## 10. Структура PR

Один PR с атомарным коммитом, включающий:

- Все новые файлы DaemonWorkspaceService
- Изменение REST-обработчиков маршрутов на вызов service
- Упрощение bridge (вынесены 8 методов workspace) + новые 2 делегирующих метода дочерних
- Переименование `HttpAcpBridge` → `AcpSessionBridge`
- Добавлены 27 новых northbound методов для `/acp`
- Полное тестирование (unit + integration + e2e)

---

## 11. Что явно не входит (границы области)

- Workspace-scoped EventBus (территория PR 24)
- Workspace-scoped ClientRegistry (территория PR 24)
- Разделение L2 ↔ L3 (вынос `ClientSideConnection` из bridge)
- Превращение REST в совместимую обёртку для `/acp` (долгосрочное направление)
- Унификация standalone-режима channels (вопросы отдельного развёртывания)
- Миграция `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` (session-scoped, остаются на месте)
- Передача владения `publishWorkspaceEvent` / `knownClientIds` (инфраструктура, производная от session; остаётся в bridge, service потребляет через callback)

---

## 12. Решения, ожидающие подтверждения от chiga0

1. Пространство имён northbound для `/acp`: `qwen/workspace/...` vs другое (например, повторное использование `qwen/control/...`)
2. Переименование в том же PR: склоняемся к тому же PR, но можно выделить по отзывам

> Оба пункта, если потребуется скорректировать, влияют только на именование и границы коммита, но не на архитектуру.