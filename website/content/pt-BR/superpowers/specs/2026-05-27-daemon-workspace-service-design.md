# DaemonWorkspaceService - Design de Implementação (Plano C)

> Relacionado: issue #4542, PR #4472, #3803, #4175
> Branch: `daemon_mode_b_main`
> Data: 2026-05-27
> Natureza: Documento de design de implementação (voltado para execução), não RFC

---

> **Escopo de implementação (Atualização em 2026-05-31, PR #4563)**
>
> Este documento descreve a **arquitetura final**. O PR #4563 implementa apenas uma parte dela; o restante fica para PRs futuros. Ao ler, use a tabela abaixo como referência, sem assumir que tudo já foi implementado:
>
> | Capacidade                                                                     | Status neste PR (#4563)                                                                                                          |
> | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
> | Renomeação de `HttpAcpBridge` → `AcpSessionBridge`                            | ✅ Implementado                                                                                                                  |
> | Bridge expõe delegates genéricos `queryWorkspaceStatus` / `invokeWorkspaceCommand` | ✅ Implementado                                                                                                                  |
> | **status / init / tool-toggle / mcp-restart** em nível de workspace no facade | ✅ Implementado e conectado (server.ts + dispatch acpHttp via facade)                                                            |
> | **Quatro sub-serviços: File / Auth / Agents / Memory**                        | ⏳ **Deferido** – Não está neste PR. Será implementado em PRs futuros junto com as respectivas conexões de rota, injeção de `deviceFlowRegistry`/`subagentManager` e testes e2e |
> | Rotas REST como `/workspace/memory`, `/workspace/agents` alteradas para chamar facade | ⏳ **Deferido** – Atualmente ainda são servidas diretamente pelos antigos `workspaceMemory.ts` / `workspaceAgents.ts`          |
> | Dispatch northbound `/acp` para `qwen/workspace/*` (§6)                       | ⏳ **Deferido**                                                                                                                |
> | `initWorkspace` via `fsFactory` / `WorkspaceFileSystem` (trust gate + audit)  | ⏳ **Deferido** – Atualmente mantém a implementação raw `node:fs` da bridge antiga (com proteção §SV TOCTOU/symlink), sem regressão; migração fsFactory/audit fica para depois |
>
> Portanto, os itens §3.4 (interfaces dos sub-serviços), §6 (northbound /acp), §7.1 (e2e.test.ts), §10 (descrição do formato do PR) pertencem ao **escopo final/futuro**, não implementados neste PR.

---

## 1. Arquitetura e Limites

### 1.1 Camadas Finais

```
                          CLIENTES
   webui    SDK/canais(via REST)    Zed/Goose(/acp)    futuro
     │             │                       │
═════╪═════════════╪═══════════════════════╪═════════════ L1 transporte (fino)
   REST+SSE      REST+SSE              /acp (jsonrpc/sse)
   server.ts                           acpHttp/
     └─────────────┴───────────────────────┘
                          │ Negócio/trust/audit sempre descem para L2
═════════════════════════╪═══════════════════════════════ L2 Camada de aplicação
   ┌──────────────────────────┐   ┌─────────────────────────────────┐
   │ AcpSessionBridge          │   │ DaemonWorkspaceService (facade)  │
   │ (← renomeado de HttpAcpBridge)│  ┌──────────────────────────┐   │
   │ • ciclo de vida de canal/sessão │  │ FileService              │   │
   │ • prompt / cancel / close │   │ AuthService              │   │
   │ • EventBus / arbitragem de permissão│  │ AgentsService            │   │
   │ • introspecção de estado do child (dependências)│  │ MemoryService            │   │
   │   (mcp/skills/preflight)  │   └──────────────────────────┘   │
   └──────────┬───────────────┘   │ WorkspaceRequestContext unificado │
              │                    └──────────┬──────────────────────┘
              │ L3 → child                    │
              ▼                               │ (puramente local, não toca no child)
══════════════════════════════════════════════════════════ L3 ACP-client
══════════════════════════════════════════════════════════ L4 agent
```

### 1.2 Função de Decisão de Separação

**Regra única: o escopo da operação é sessão ou workspace?**

- **session-scoped** (opera em uma sessionId específica: prompt/cancel/close/model/approval/metadata/heartbeat) **→ permanece em `AcpSessionBridge`**
- **workspace-scoped** (opera no workspace como um todo: file/auth/agents/memory/mcp-status/skills/env/preflight/tool-toggle/init) **→ entra em `DaemonWorkspaceService`**

Alguns métodos de workspace precisam consultar o child (getters de status, restartMcpServer). Isso é feito por meio de **callbacks injetados** que delegam ao canal da bridge. O service em si não mantém a conexão.

### 1.3 Dependência Transversal: Injeção de Callbacks (não infraestrutura compartilhada)

Atualmente, `publishWorkspaceEvent` e `knownClientIds` são mantidos pela bridge (fan-out do bus por sessão / derivado da sessão). O service as utiliza por meio de **injeção unidirecional de callbacks**, sem introduzir uma camada de infraestrutura compartilhada.

**Motivos:**

1. O EventBus é um bus por sessão (`bridge.ts:1457`). O bus em nível de workspace está comentado no código, associado ao PR 24 (`bridge.ts:2611`).
2. `knownClientIds` também é derivado do estado de attach da sessão, e o comentário explicita "PR 24 will replace it" (`bridge.ts:2658`).
3. Esses dois são trabalhos independentes já planejados; amarrá-los neste PR adicionaria um refactor extra.
4. A injeção de callbacks é uma dependência unidirecional para o service (ele só detém referências de função, não sabe que vêm da bridge); após a implementação do PR 24, basta trocar a fonte de injeção, a interface do service permanece inalterada.

**Regras rígidas:**

1. `DaemonWorkspaceServiceDeps` não pode conter referência ao tipo `AcpSessionBridge` — apenas assinaturas de função.
2. A bridge expõe externamente dois novos métodos: `queryWorkspaceStatus` e `invokeWorkspaceCommand`, para serem chamados pelo service via callback. Internamente, continuam usando a lógica existente de `requestWorkspaceStatus` / `liveChannelInfo` + timeout, sem criar novas abstrações.

---

## 2. Sequência de Construção e Injeção de Dependências

```ts
// Ordem de construção em runQwenServe.ts

// 1. fsFactory é construído primeiro (compartilhado entre ambos)
const fsFactory = resolveBridgeFsFactory({ ... });

// 2. bridge é construído primeiro (dono da sessão/canal/EventBus)
const bridge = createAcpSessionBridge({
  eventRingSize,
  boundWorkspace,
  fileSystem: createBridgeFileSystemAdapter(fsFactory),
  // ... demais parâmetros existentes inalterados
});

// 3. service é construído depois, recebe o conjunto de callbacks da bridge
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager,
  boundWorkspace,
  contextFilename,
  // Callbacks transversais — o service não sabe que eles vêm da bridge
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  // Callbacks de delegação ao child — métodos workspace-scoped alcançam o agent via canal da bridge
  queryWorkspaceStatus: (method, idle) => bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) => bridge.invokeWorkspaceCommand(method, params, opts),
});

// 4. Ambos são passados para as rotas do servidor + handler /acp
createServeApp({ bridge, workspace, ... });
```

**Ordem de construção bridge → service é uma dependência rígida** (o service precisa dos métodos na instância da bridge como fonte de callbacks).

---

## 3. Estrutura Interna do DaemonWorkspaceService

### 3.1 Layout de Diretórios

```
packages/cli/src/serve/workspace-service/
├── types.ts            ← WorkspaceRequestContext + interfaces dos sub-serviços
├── index.ts            ← facade factory (createDaemonWorkspaceService)
├── fileService.ts      ← encapsula fsFactory
├── authService.ts      ← encapsula DeviceFlowRegistry
├── agentsService.ts    ← encapsula SubagentManager
├── memoryService.ts    ← encapsula operações de arquivo de memória
└── __tests__/
    ├── fileService.test.ts
    ├── authService.test.ts
    ├── agentsService.test.ts
    ├── memoryService.test.ts
    └── e2e.test.ts
```

### 3.2 Interface do Facade

```ts
export interface DaemonWorkspaceService {
  file: FileService;
  auth: AuthService;
  agents: AgentsService;
  memory: MemoryService;

  // Puramente local
  initWorkspace(
    opts: InitWorkspaceOpts,
    ctx: WorkspaceRequestContext,
  ): Promise<void>;
  setToolEnabled(
    toolName: string,
    enabled: boolean,
    ctx: WorkspaceRequestContext,
  ): Promise<ToolToggleResult>;

  // Delega ao child via callback
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

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `publishWorkspaceEvent` / `knownClientIds` permanecem na bridge — eles acessam o estado interno de sessão da bridge (mapa `byId` / bus de sessão), sendo infraestrutura derivada de sessão. O service os consome via callback, não os possui diretamente.

### 3.3 Assinatura da Facade Factory

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

  // Callbacks transversais (infraestrutura derivada de sessão)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // Callbacks de delegação ao child (métodos workspace-scoped alcançam o agent via canal da bridge)
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

### 3.4 Interfaces de Cada Sub-serviço

| Sub-serviço  | Métodos                                                                      | Deps Necessárias                                                    | Fonte Atual                                                              |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| FileService  | `read`, `readBytes`, `write`, `edit`, `glob`, `list`, `stat`                 | `fsFactory`, `boundWorkspace`                                       | `serve/routes/workspaceFileRead.ts`, `workspaceFileWrite.ts`, `serve/fs/`|
| AuthService  | `startFlow`, `getFlowStatus(flowId)`, `cancelFlow(flowId)`, `getAuthStatus` | `deviceFlowRegistry`                                                | `serve/auth/deviceFlow.ts`, `server.ts:794-966`                          |
| AgentsService| `list`, `get(agentType)`, `create`, `update`, `delete`                      | `subagentManager`, `publishWorkspaceEvent`, `knownClientIds`        | `serve/workspaceAgents.ts`                                               |
| MemoryService| `list`, `read`, `write`, `delete`                                           | `fsFactory` ou fs direto, `publishWorkspaceEvent`, `knownClientIds` | `serve/workspaceMemory.ts`                                               |

Cada método tem como primeiro parâmetro `ctx: WorkspaceRequestContext`, e o trust gate é executado de forma unificada na entrada do método.

---

## 4. WorkspaceRequestContext

```ts
export interface WorkspaceRequestContext {
  originatorClientId?: string; // Header X-Qwen-Client-Id (pode estar ausente em operações somente leitura)
  sessionId?: string; // Associação de auditoria (ex.: operação iniciada a partir do contexto de sessão)
  route: string; // Trilha de auditoria (ex.: "POST /file/write")
  workspaceCwd: string; // Raiz do limite de trust
}
```

> `originatorClientId` é opcional — atualmente, rotas somente leitura como file read funcionam mesmo com o header ausente (`clientId ?? undefined` passado para `fsFactory.forRequest`). Rotas de escrita validam a legitimidade apenas quando o clientId **está presente**.

**Onde é construído:** O handler da rota L1 / handler de método `/acp` extrai dos headers/params da requisição e passa para L2. L2 apenas consome, não extrai o contexto HTTP por conta própria.

---

## 5. Emagrecimento e Renomeação do AcpSessionBridge

### 5.1 Métodos Removidos da Bridge

| Método                        | Destino                        | Mecanismo                                    | Motivo                                                         |
| ----------------------------- | ------------------------------ | -------------------------------------------- | -------------------------------------------------------------- |
| `initWorkspace`               | `workspace.initWorkspace`      | Migração direta (puramente local)            | Aproveita para corrigir FIXME (bridge não usava fsFactory, pulava trust gate / audit) |
| `setWorkspaceToolEnabled`     | `workspace.setToolEnabled`     | Migração direta (puramente local)            | Apenas I/O de arquivo + fan-out de evento, comentário explicita "no ACP roundtrip" |
| `getWorkspaceMcpStatus`       | `workspace.getMcpStatus`       | via callback `queryWorkspaceStatus`          | Consulta de status escopo workspace                            |
| `getWorkspaceSkillsStatus`    | `workspace.getSkillsStatus`    | via callback `queryWorkspaceStatus`          | Idem                                                           |
| `getWorkspaceProvidersStatus` | `workspace.getProvidersStatus` | via callback `queryWorkspaceStatus`          | Idem                                                           |
| `getWorkspaceEnvStatus`       | `workspace.getEnvStatus`       | via callback `queryWorkspaceStatus`          | Idem                                                           |
| `getWorkspacePreflightStatus` | `workspace.getPreflightStatus` | via callback `queryWorkspaceStatus`          | Idem                                                           |
| `restartMcpServer`            | `workspace.restartMcpServer`   | via callback `invokeWorkspaceCommand`        | Mutação no escopo workspace                                    |

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` permanecem na bridge — acessam o mapa interno de sessões `byId` da bridge, sendo operações session-scoped.

### 5.2 O que Permanece na Bridge

- Todo o ciclo de vida de sessão/canal (spawn/load/resume/send/cancel/close/kill/detach)
- Posse do EventBus + implementação de fan-out de `publishWorkspaceEvent` (para consumo via callback do service)
- `knownClientIds` (para consumo via callback do service)
- `queryWorkspaceStatus` / `invokeWorkspaceCommand` (recém-expostos, encapsulam canal + timeout + erro, para delegação via callback do service)
- Mediador de arbitragem de permissão
- Alterações de configuração de sessão (model/approvalMode/recap)
- Estado da sessão (context/supportedCommands/metadata/heartbeat/listSessions)

### 5.3 Renomeação

- `HttpAcpBridge` → `AcpSessionBridge`
- `createHttpAcpBridge` → `createAcpSessionBridge`
- Arquivo `serve/httpAcpBridge.ts` → `serve/acpSessionBridge.ts`

Não há consumidores externos (verificado: não há referências fora de `packages/cli/src/serve/` e `packages/acp-bridge/src/`), seguro internamente.

---

## 6. Métodos /acp Northbound ext methods

### 6.1 Namespace

`qwen/workspace/...` (para diferenciar dos existentes `qwen/control/...`):

- `qwen/control/...` = comandos encaminhados do daemon para o child (southbound, via AcpSessionBridge)
- `qwen/workspace/...` = operações locais do workspace no daemon (northbound, terminam no DaemonWorkspaceService)

> Aguardando confirmação do chiga0. Se o namespace mudar, basta alterar o prefixo do nome do método, não afeta a arquitetura.

### 6.2 Lista de Métodos

| method                            | REST Correspondente                               | Chamada no L2                                         |
| --------------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `qwen/workspace/fs/read`          | `GET /file?path=...`                              | `workspace.file.read(ctx, path)`                      |
| `qwen/workspace/fs/readBytes`     | `GET /file/bytes?path=...`                        | `workspace.file.readBytes(ctx, path)`                 |
| `qwen/workspace/fs/write`         | `POST /file/write`                                | `workspace.file.write(ctx, path, content)`            |
| `qwen/workspace/fs/edit`          | `POST /file/edit`                                 | `workspace.file.edit(ctx, path, edits)`               |
| `qwen/workspace/fs/glob`          | `GET /glob?pattern=...`                           | `workspace.file.glob(ctx, pattern)`                   |
| `qwen/workspace/fs/list`          | `GET /list?path=...`                              | `workspace.file.list(ctx, path)`                      |
| `qwen/workspace/fs/stat`          | `GET /stat?path=...`                              | `workspace.file.stat(ctx, path)`                      |
| `qwen/workspace/auth/start`       | `POST /workspace/auth/device-flow`                | `workspace.auth.startFlow(ctx)`                       |
| `qwen/workspace/auth/status`      | `GET /workspace/auth/status`                      | `workspace.auth.getAuthStatus(ctx)`                   |
| `qwen/workspace/auth/flow`        | `GET /workspace/auth/device-flow/:id`             | `workspace.auth.getFlowStatus(ctx, flowId)`           |
| `qwen/workspace/auth/cancel`      | `POST /workspace/auth/device-flow/:id` (cancelar) | `workspace.auth.cancelFlow(ctx, flowId)`              |
| `qwen/workspace/agents/list`      | `GET /workspace/agents`                           | `workspace.agents.list(ctx)`                          |
| `qwen/workspace/agents/get`       | `GET /workspace/agents/:agentType`                | `workspace.agents.get(ctx, agentType)`                |
| `qwen/workspace/agents/create`    | `POST /workspace/agents`                          | `workspace.agents.create(ctx, spec)`                  |
| `qwen/workspace/agents/update`    | `POST /workspace/agents/:agentType`               | `workspace.agents.update(ctx, agentType, spec)`       |
| `qwen/workspace/agents/delete`    | `DELETE /workspace/agents/:agentType`             | `workspace.agents.delete(ctx, agentType)`             |
| `qwen/workspace/memory/list`      | `GET /workspace/memory`                           | `workspace.memory.list(ctx)`                          |
| `qwen/workspace/memory/read`      | `GET /workspace/memory/:key`                      | `workspace.memory.read(ctx, key)`                     |
| `qwen/workspace/memory/write`     | `POST /workspace/memory`                          | `workspace.memory.write(ctx, key, content)`           |
| `qwen/workspace/memory/delete`    | `DELETE /workspace/memory/:key`                   | `workspace.memory.delete(ctx, key)`                   |
| `qwen/workspace/init`             | `POST /workspace/init`                            | `workspace.initWorkspace(ctx, opts)`                  |
| `qwen/workspace/tool/toggle`      | `POST /workspace/tool/toggle`                     | `workspace.setToolEnabled(ctx, toolName, enabled)`    |
| `qwen/workspace/status/mcp`       | `GET /workspace/mcp`                              | `workspace.getMcpStatus()`                            |
| `qwen/workspace/status/skills`    | `GET /workspace/skills`                           | `workspace.getSkillsStatus()`                         |
| `qwen/workspace/status/providers` | `GET /workspace/providers`                        | `workspace.getProvidersStatus()`                      |
| `qwen/workspace/status/env`       | `GET /workspace/env`                              | `workspace.getEnvStatus()`                            |
| `qwen/workspace/status/preflight` | `GET /workspace/preflight`                        | `workspace.getPreflightStatus()`                      |
| `qwen/workspace/mcp/restart`      | `POST /workspace/mcp/restart`                     | `workspace.restartMcpServer(ctx, serverName, opts)`   |

Ao anunciar capabilities, esses métodos são declarados em `_meta.qwen.methods`.

---

## 7. Lista de Alterações de Arquivos

### 7.1 Novos Arquivos

| Arquivo                                                    | Finalidade                                             |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `serve/workspace-service/types.ts`                        | `WorkspaceRequestContext` + interfaces de sub-serviços |
| `serve/workspace-service/index.ts`                        | Facade factory                                         |
| `serve/workspace-service/fileService.ts`                  | Implementação do FileService                           |
| `serve/workspace-service/authService.ts`                  | Implementação do AuthService                           |
| `serve/workspace-service/agentsService.ts`                | Implementação do AgentsService                         |
| `serve/workspace-service/memoryService.ts`                | Implementação do MemoryService                         |
| `serve/workspace-service/__tests__/fileService.test.ts`   | Teste unitário                                         |
| `serve/workspace-service/__tests__/authService.test.ts`   | Teste unitário                                         |
| `serve/workspace-service/__tests__/agentsService.test.ts` | Teste unitário                                         |
| `serve/workspace-service/__tests__/memoryService.test.ts` | Teste unitário                                         |
| `serve/workspace-service/__tests__/e2e.test.ts`           | Teste e2e de equivalência REST ↔ /acp                 |

### 7.2 Arquivos Modificados

| Arquivo                                                        | Alteração                                                                                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp-bridge/src/bridge.ts`                                    | Remove 8 métodos workspace (initWorkspace / setWorkspaceToolEnabled / 5 getters de status / restartMcpServer); expõe `queryWorkspaceStatus` + `invokeWorkspaceCommand`; renomeia factory function |
| `acp-bridge/src/bridgeTypes.ts`                               | Interface renomeada `HttpAcpBridge` → `AcpSessionBridge`; remove assinaturas dos 8 métodos workspace; adiciona assinaturas de `queryWorkspaceStatus` + `invokeWorkspaceCommand`      |
| `acp-bridge/src/bridgeOptions.ts`                             | Atualiza referências de JSDoc                                                                                                                                                          |
| `acp-bridge/src/status.ts`                                    | Atualiza nome da classe em mensagens de erro                                                                                                                                           |
| `cli/src/serve/httpAcpBridge.ts` → renomeado para `acpSessionBridge.ts` | Atualiza re-export                                                                                                                                             |
| `cli/src/serve/runQwenServe.ts`                               | Constrói `DaemonWorkspaceService`, injeta callbacks, passa para routes e handler /acp                                                                                                  |
| `cli/src/serve/server.ts`                                     | Rotas mudam de acessar diretamente `fsFactory`/`DeviceFlowRegistry` para chamar `workspace.file.*` / `workspace.auth.*`                                                               |
| `cli/src/serve/workspaceAgents.ts`                            | Lógica de negócio migrada para `agentsService.ts`; arquivo original vira uma casca fina de handler de rota (constrói ctx → chama service)                                              |
| `cli/src/serve/workspaceMemory.ts`                            | Idem                                                                                                                                                                                   |
| `cli/src/serve/routes/workspaceFileRead.ts`                   | Idem                                                                                                                                                                                   |
| `cli/src/serve/routes/workspaceFileWrite.ts`                  | Idem                                                                                                                                                                                   |
| Handler `/acp` (dentro de `acp-integration/` ou `serve/`)     | Adiciona dispatch de método northbound                                                                                                                                                   |
## 8. Compatibilidade do SDK e formato de erro

### 8.1 Compatibilidade retroativa do SDK

A superfície da API REST (caminhos, métodos HTTP, JSON schema de requisição/resposta) permanece inalterada. O `DaemonClient` / `DaemonSessionClient` no `sdk-typescript` não requer nenhuma alteração.

Método de verificação: os testes existentes `packages/sdk-typescript/test/unit/DaemonClient.test.ts` e `DaemonSessionClient.test.ts` devem passar sem modificações neste PR.

### 8.2 Formato de erro para rejeição do trust gate `/acp`

As duas transports são semanticamente equivalentes, mas com codificação diferente:

| Cenário                               | REST                                          | `/acp` (JSON-RPC)                                                         |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| Token bearer inválido/ausente          | `401 { error, code: "unauthorized" }`         | `{ error: { code: -32001, message: "unauthorized" } }`                   |
| clientId inválido                      | `400 { error, code: "invalid_client_id" }`    | `{ error: { code: -32602, message: "invalid_client_id", data: {...} } }` |
| Rejeição do trust gate (path escape, etc.) | `403 { error, code: "forbidden" }`            | `{ error: { code: -32003, message: "forbidden", data: {...} } }`         |

> Os códigos de erro JSON-RPC seguem o [registro de códigos de erro ACP](https://spec.acpprotocol.org) (a faixa padrão -32000 ~ -32099 são erros de aplicação definidos pelo servidor). Os valores específicos dos códigos são alinhados com a lógica de mapeamento de erros existente do `/acp` (`acp-integration/errorCodes.ts`) durante a implementação.

---

## 9. Estratégia de teste

| Camada                    | Tipo de teste                                                                                     | Cobertura                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Unidade de sub-serviço    | Jest, mockando fsFactory / DeviceFlowRegistry / SubagentManager / callbacks                       | Correção da lógica de negócios + rejeição de clientId inválido pelo trust gate |
| Integração de rota        | Testes de rota existentes alterados para passar pelo service (verificar que a superfície HTTP permanece inalterada) | Garantia de regressão, caminhos REST não quebram                         |
| Verificação de equivalência E2E | Iniciar servidor real + requisições HTTP                                                         | REST e `/acp` retornam resultados equivalentes para a mesma operação; rejeição consistente do trust gate em ambos os lados |

### Matriz de verificação E2E

- Leitura/gravação de arquivo: REST `GET /file` vs `/acp` `qwen/workspace/fs/read` → mesmo resultado
- CRUD de agent: REST `POST /workspace/agents` vs `/acp` `qwen/workspace/agents/create` → mesmo comportamento
- Rejeição do trust gate: clientId inválido resulta em 403 em ambos os caminhos
- Inicialização do workspace: verificar que fsFactory funciona + geração de audit trail

---

## 10. Formato do PR

Um único PR com commit atômico, contendo:

- Todos os novos arquivos do `DaemonWorkspaceService`
- Handlers de rota REST alterados para chamar o service
- Emagrecimento da bridge (migração de 8 métodos de workspace) + exposição de 2 novos métodos delegados `child`
- Renomeação de `HttpAcpBridge` → `AcpSessionBridge`
- Adição de 27 novos métodos ext northbound no `/acp`
- Testes completos (unitários + integração + e2e)

---

## 11. Explicitamente fora do escopo (scope boundary)

- EventBus com escopo de workspace (território do PR 24)
- ClientRegistry com escopo de workspace (território do PR 24)
- Divisão L2 ↔ L3 (extrair `ClientSideConnection` da bridge)
- Transformar REST em um shim compatível com `/acp` (direção de longo prazo)
- Unificação do modo standalone de channels (problema de forma de implantação independente)
- Migração de `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` (com escopo de sessão, mantidos no lugar)
- Transferência de ownership de `publishWorkspaceEvent` / `knownClientIds` (infraestrutura derivada de sessão, bridge mantém posse, service consome via callback)

---

## 12. Pontos de decisão pendentes de confirmação do chiga0

1. Namespace northbound do `/acp`: `qwen/workspace/...` vs outros (por exemplo, reutilizar `qwen/control/...`)
2. Renomeação no mesmo PR: tendência a fazer no mesmo PR, mas pode ser separado com base no feedback

> Se esses dois pontos precisarem de ajustes, afetam apenas a nomenclatura e os limites do commit, não a arquitetura.