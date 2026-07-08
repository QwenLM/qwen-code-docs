# Design de Implementação do DaemonWorkspaceService (Plano C)

> Relacionado: issue #4542, PR #4472, #3803, #4175
> Branch: `daemon_mode_b_main`
> Data: 2026-05-27
> Natureza: Documento de design de implementação (focado na execução), não é um RFC

---

> **Escopo de Implementação (atualizado em 2026-05-31, PR #4563)**
>
> Este documento descreve a **arquitetura final**. O PR #4563 implementa apenas uma parte dele, o restante fica para PRs subsequentes. Ao ler, considere a tabela abaixo e não assuma que tudo já foi implementado:
>
> | Capacidade                                                                         | Status neste PR (#4563)                                                                                                             |
> | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
> | Renomeação de `HttpAcpBridge` para `AcpSessionBridge`                                    | ✅ Implementado                                                                                                                      |
> | Bridge expondo delegações genéricas `queryWorkspaceStatus` / `invokeWorkspaceCommand`       | ✅ Implementado                                                                                                                      |
> | **status / init / tool-toggle / mcp-restart** no nível do workspace da facade         | ✅ Implementado e conectado (server.ts + acpHttp dispatch via facade)                                                                      |
> | **Quatro sub-services: File / Auth / Agents / Memory**                           | ⏳ **adiado** — não está neste PR. Será implementado em PRs futuros, junto com suas respectivas conexões de rotas, injeção de `deviceFlowRegistry`/`subagentManager` e testes e2e      |
> | Rotas REST como `/workspace/memory`, `/workspace/agents` chamando a facade             | ⏳ **adiado** — atualmente ainda servidas diretamente pelos antigos `workspaceMemory.ts` / `workspaceAgents.ts`                                           |
> | Dispatch `/acp` northbound `qwen/workspace/*` (§6)                          | ⏳ **adiado**                                                                                                                |
> | `initWorkspace` usando `fsFactory` / `WorkspaceFileSystem` (trust gate + audit) | ⏳ **adiado** — atualmente reutiliza a implementação raw `node:fs` da bridge antiga (incluindo proteção §SV TOCTOU/symlink), sem regressão; migração do fsFactory/audit fica para depois |
>
> Portanto, a §3.4 (interfaces de sub-service), §6 (/acp northbound), `e2e.test.ts` da §7.1 e a descrição do formato do PR da §10 pertencem ao **escopo final/futuro** e não foram implementadas neste PR.

---

## 1. Arquitetura e Limites

### 1.1 Camadas da Arquitetura Final

```
                          CLIENTS
   webui    SDK/channels(via REST)    Zed/Goose(/acp)    future
     │             │                       │
═════╪═════════════╪═══════════════════════╪═════════════ L1 transport (fino)
   REST+SSE      REST+SSE              /acp (jsonrpc/sse)
   server.ts                           acpHttp/
     └─────────────┴───────────────────────┘
                          │ negócios/trust/audit sempre descem para L2
═════════════════════════╪═══════════════════════════════ L2 camada de aplicação
   ┌──────────────────────────┐   ┌─────────────────────────────────┐
   │ AcpSessionBridge          │   │ DaemonWorkspaceService (facade)  │
   │ (← renomeado de HttpAcpBridge)│   │  ┌──────────────────────────┐   │
   │ • ciclo de vida channel/session │   │  │ FileService              │   │
   │ • prompt / cancel / close │   │  │ AuthService              │   │
   │ • EventBus / arbitragem de permissões      │   │  │ AgentsService            │   │
   │ • introspecção de estado dependente do child    │   │  │ MemoryService            │   │
   │   (mcp/skills/preflight)  │   │  └──────────────────────────┘   │
   └──────────┬───────────────┘   │  WorkspaceRequestContext unificado     │
              │                    └──────────┬──────────────────────┘
              │ L3 → child                    │
              ▼                               │ (puramente local, não toca no child)
══════════════════════════════════════════════════════════ L3 ACP-client
══════════════════════════════════════════════════════════ L4 agent
```

### 1.2 Função de Decisão de Divisão

**Única regra: o escopo da operação é session ou workspace?**

- **session-scoped** (opera em um sessionId específico: prompt/cancel/close/model/approval/metadata/heartbeat) **→ permanece em `AcpSessionBridge`**
- **workspace-scoped** (opera no workspace como um todo: file/auth/agents/memory/mcp-status/skills/env/preflight/tool-toggle/init) **→ vai para `DaemonWorkspaceService`**

Alguns métodos do workspace precisam consultar o child (status getters, restartMcpServer), o que é delegado ao channel da bridge por meio de **callbacks injetados**; o service em si não mantém a connection.

### 1.3 Dependências Transversais: Injeção de Callback (sem infra compartilhada)

Atualmente, `publishWorkspaceEvent` e `knownClientIds` são mantidos pela bridge (fan-out do bus por session / derivados da session). O service os utiliza por meio de **injeção de callback unidirecional**, sem introduzir uma camada de infraestrutura compartilhada.

**Motivo:**

1. O EventBus é um bus por session (`bridge.ts:1457`), e o bus no nível do workspace já está planejado nos comentários do código para o PR 24 (`bridge.ts:2611`).
2. `knownClientIds` também é derivado do estado de session-attach, e os comentários indicam claramente "PR 24 will replace it" (`bridge.ts:2658`).
3. Esses dois itens são trabalhos independentes já iniciados; forçá-los neste PR equivaleria a adicionar uma refatoração extra.
4. A injeção de callback é uma dependência unidirecional para o service (mantém apenas a referência da função, não sabe que vem da bridge); após a implementação do PR 24, basta trocar a fonte de injeção, a interface do service permanece inalterada.

**Regras rígidas:**

1. Não deve haver referências de tipo `AcpSessionBridge` em `DaemonWorkspaceServiceDeps` — use apenas assinaturas de função.
2. A bridge expõe externamente dois novos métodos, `queryWorkspaceStatus` e `invokeWorkspaceCommand`, para que o service os chame via callback. Internamente, continua usando a lógica existente de `requestWorkspaceStatus` / `liveChannelInfo` + timeout, sem criar novas abstrações.

---

## 2. Sequência de Construção e Injeção de Dependência

```ts
// Sequência de construção em runQwenServe.ts

// 1. fsFactory construído primeiro (compartilhado por ambos)
const fsFactory = resolveBridgeFsFactory({ ... });

// 2. bridge construída primeiro (é a owner de session/channel/EventBus)
const bridge = createAcpSessionBridge({
  eventRingSize,
  boundWorkspace,
  fileSystem: createBridgeFileSystemAdapter(fsFactory),
  // ... outros parâmetros existentes inalterados
});

// 3. service construído depois, recebe o conjunto de callbacks da bridge
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager,
  boundWorkspace,
  contextFilename,
  // callbacks transversais — o service não sabe que vêm da bridge
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  // callbacks delegados ao child — métodos ext workspace-scoped chegam ao agent via channel da bridge
  queryWorkspaceStatus: (method, idle) => bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) => bridge.invokeWorkspaceCommand(method, params, opts),
});

// 4. Ambos são passados para as rotas do server + handler /acp
createServeApp({ bridge, workspace, ... });
```

**A ordem de construção bridge → service é uma dependência rígida** (o service precisa dos métodos na instância da bridge como fonte de callback).

---

## 3. Estrutura Interna do DaemonWorkspaceService

### 3.1 Layout de Diretórios

```
packages/cli/src/serve/workspace-service/
├── types.ts            ← WorkspaceRequestContext + interfaces de sub-service
├── index.ts            ← factory da facade (createDaemonWorkspaceService)
├── fileService.ts      ← envolve fsFactory
├── authService.ts      ← envolve DeviceFlowRegistry
├── agentsService.ts    ← envolve SubagentManager
├── memoryService.ts    ← envolve operações de arquivo de memória
└── __tests__/
    ├── fileService.test.ts
    ├── authService.test.ts
    ├── agentsService.test.ts
    ├── memoryService.test.ts
    └── e2e.test.ts
```

### 3.2 Interface da Facade

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

  // Delegado ao child via callback
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

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `publishWorkspaceEvent` / `knownClientIds` permanecem na bridge — eles acessam o estado por session interno da bridge (mapa `byId` / session bus), sendo infraestrutura derivada da session. O service os consome via callback, não os possui diretamente.

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

  // callbacks transversais (infraestrutura derivada da session)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // callbacks delegados ao child (métodos ext workspace-scoped chegam ao agent via channel da bridge)
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

### 3.4 Interfaces de Cada Sub-service

| Sub-service        | Métodos                                                                        | Deps necessários                                                           | Origem existente                                                                  |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FileService   | `read`, `readBytes`, `write`, `edit`, `glob`, `list`, `stat`                | `fsFactory`, `boundWorkspace`                                       | `serve/routes/workspaceFileRead.ts`, `workspaceFileWrite.ts`, `serve/fs/` |
| AuthService   | `startFlow`, `getFlowStatus(flowId)`, `cancelFlow(flowId)`, `getAuthStatus` | `deviceFlowRegistry`                                                | `serve/auth/deviceFlow.ts`, `server.ts:794-966`                           |
| AgentsService | `list`, `get(agentType)`, `create`, `update`, `delete`                      | `subagentManager`, `publishWorkspaceEvent`, `knownClientIds`        | `serve/workspaceAgents.ts`                                                |
| MemoryService | `list`, `read`, `write`, `delete`                                           | `fsFactory` or direct fs, `publishWorkspaceEvent`, `knownClientIds` | `serve/workspaceMemory.ts`                                                |

O primeiro parâmetro de cada método é `ctx: WorkspaceRequestContext`, e o trust gate é executado de forma unificada na entrada do método.

---

## 4. WorkspaceRequestContext

```ts
export interface WorkspaceRequestContext {
  originatorClientId?: string; // header X-Qwen-Client-Id (pode estar ausente em operações somente leitura)
  sessionId?: string; // correlação de auditoria (ex: operações iniciadas de dentro do contexto da session)
  route: string; // trilha de auditoria (ex: "POST /file/write")
  workspaceCwd: string; // raiz do limite de confiança (trust boundary)
}
```

> `originatorClientId` é opcional — atualmente, rotas somente leitura como file read funcionam normalmente quando o header está ausente (`clientId ?? undefined` é passado para `fsFactory.forRequest`). Rotas de write validam a legitimidade apenas quando o clientId **está presente**.

**Onde é construído**: O route handler L1 / method handler `/acp` extrai dos headers/params da request e passa para o L2. O L2 apenas consome, não extrai o contexto HTTP por conta própria.

---

## 5. Redução e Renomeação do AcpSessionBridge

### 5.1 Métodos Movidos da Bridge

| Método                          | Destino                           | Mecanismo                                  | Motivo                                                           |
| ----------------------------- | ------------------------------ | ------------------------------------- | -------------------------------------------------------------- |
| `initWorkspace`               | `workspace.initWorkspace`      | Migração direta (puramente local)                      | Corrige o FIXME (a bridge não usava fsFactory, pulando o trust gate / audit) |
| `setWorkspaceToolEnabled`     | `workspace.setToolEnabled`     | Migração direta (puramente local)                      | Puramente file I/O + event fan-out, comentários indicam claramente "no ACP roundtrip"       |
| `getWorkspaceMcpStatus`       | `workspace.getMcpStatus`       | via callback `queryWorkspaceStatus`   | Consulta de status workspace-scoped                                  |
| `getWorkspaceSkillsStatus`    | `workspace.getSkillsStatus`    | via callback `queryWorkspaceStatus`   | Idem                                                           |
| `getWorkspaceProvidersStatus` | `workspace.getProvidersStatus` | via callback `queryWorkspaceStatus`   | Idem                                                           |
| `getWorkspaceEnvStatus`       | `workspace.getEnvStatus`       | via callback `queryWorkspaceStatus`   | Idem                                                           |
| `getWorkspacePreflightStatus` | `workspace.getPreflightStatus` | via callback `queryWorkspaceStatus`   | Idem                                                           |
| `restartMcpServer`            | `workspace.restartMcpServer`   | via callback `invokeWorkspaceCommand` | Mutação workspace-scoped                                      |
> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` permanecem no bridge — eles acessam o mapa de sessões interno `byId` do bridge e são operações com escopo de sessão.

### 5.2 O que permanece no bridge

- Todo o ciclo de vida de session/channel (spawn/load/resume/send/cancel/close/kill/detach)
- Manutenção do EventBus + implementação de fan-out do `publishWorkspaceEvent` (para consumo pelos callbacks do service)
- `knownClientIds` (para consumo pelos callbacks do service)
- `queryWorkspaceStatus` / `invokeWorkspaceCommand` (novamente expostos, encapsulando channel + timeout + error, para delegação pelos callbacks do service)
- Mediator de arbitragem de permissões
- Alterações de configuração da session (model/approvalMode/recap)
- Estado da session (context/supportedCommands/metadata/heartbeat/listSessions)

### 5.3 Renomeações

- `HttpAcpBridge` → `AcpSessionBridge`
- `createHttpAcpBridge` → `createAcpSessionBridge`
- Arquivo `serve/httpAcpBridge.ts` → `serve/acpSessionBridge.ts`

Sem consumidores de pacotes externos (verificado que não há referências fora de `packages/cli/src/serve/` e `packages/acp-bridge/src/`), seguro internamente.

---

## 6. Métodos ext northbound do /acp

### 6.1 Namespaces

`qwen/workspace/...` (para diferenciar do existente `qwen/control/...`):

- `qwen/control/...` = daemon→child encaminhamento de comandos (southbound, via AcpSessionBridge)
- `qwen/workspace/...` = daemon operações locais de workspace (northbound, terminando em DaemonWorkspaceService)

> Aguardando confirmação de chiga0. Se o namespace for alterado, basta trocar o prefixo do nome do método, sem afetar a arquitetura.

### 6.2 Lista de métodos

| method                            | REST correspondente                             | Chamada L2                                          |
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

Ao anunciar capabilities, declare esses métodos em `_meta.qwen.methods`.

---

## 7. Lista de alterações de arquivos

### 7.1 Novos

| Arquivo                                                   | Propósito                                          |
| --------------------------------------------------------- | -------------------------------------------------- |
| `serve/workspace-service/types.ts`                        | `WorkspaceRequestContext` + interfaces de sub-service |
| `serve/workspace-service/index.ts`                        | facade factory                                     |
| `serve/workspace-service/fileService.ts`                  | Implementação do FileService                       |
| `serve/workspace-service/authService.ts`                  | Implementação do AuthService                       |
| `serve/workspace-service/agentsService.ts`                | Implementação do AgentsService                     |
| `serve/workspace-service/memoryService.ts`                | Implementação do MemoryService                     |
| `serve/workspace-service/__tests__/fileService.test.ts`   | unit test                                          |
| `serve/workspace-service/__tests__/authService.test.ts`   | unit test                                          |
| `serve/workspace-service/__tests__/agentsService.test.ts` | unit test                                          |
| `serve/workspace-service/__tests__/memoryService.test.ts` | unit test                                          |
| `serve/workspace-service/__tests__/e2e.test.ts`           | Validação de equivalência E2E REST ↔ /acp          |

### 7.2 Modificados

| Arquivo                                                       | Alteração                                                                                                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp-bridge/src/bridge.ts`                                    | Remove 8 métodos de workspace (initWorkspace / setWorkspaceToolEnabled / 5 status getters / restartMcpServer); expõe novamente `queryWorkspaceStatus` + `invokeWorkspaceCommand`; renomeia a função factory |
| `acp-bridge/src/bridgeTypes.ts`                               | Renomeia interface `HttpAcpBridge` → `AcpSessionBridge`; remove 8 assinaturas de métodos de workspace; adiciona assinaturas de `queryWorkspaceStatus` + `invokeWorkspaceCommand`    |
| `acp-bridge/src/bridgeOptions.ts`                             | Atualiza referências do JSDoc                                                                                                                                                       |
| `acp-bridge/src/status.ts`                                    | Atualiza nomes de classes nas mensagens de erro                                                                                                                                   |
| `cli/src/serve/httpAcpBridge.ts` → renomeado `acpSessionBridge.ts` | Atualiza re-export                                                                                                                                                                  |
| `cli/src/serve/runQwenServe.ts`                               | Constrói `DaemonWorkspaceService`, injeta callback, passa para routes e handler /acp                                                                                              |
| `cli/src/serve/server.ts`                                     | routes mudam de conexão direta com `fsFactory`/`DeviceFlowRegistry` para chamar `workspace.file.*` / `workspace.auth.*`                                                             |
| `cli/src/serve/workspaceAgents.ts`                            | Lógica de negócio movida para `agentsService.ts`; arquivo original se torna um wrapper fino de route handler (constrói ctx → chama service)                                       |
| `cli/src/serve/workspaceMemory.ts`                            | Idem                                                                                                                                                                              |
| `cli/src/serve/routes/workspaceFileRead.ts`                   | Idem                                                                                                                                                                              |
| `cli/src/serve/routes/workspaceFileWrite.ts`                  | Idem                                                                                                                                                                              |
| `/acp` handler (dentro de `acp-integration/` ou `serve/`)     | Adiciona dispatch de método northbound                                                                                                                                            |

---

## 8. Compatibilidade do SDK e formato de erros

### 8.1 Compatibilidade retroativa do SDK

A superfície da API REST (caminhos, métodos HTTP, schema JSON de requisição/resposta) permanece inalterada. O `DaemonClient` / `DaemonSessionClient` no `sdk-typescript` não precisa de nenhuma alteração.

Método de validação: os `packages/sdk-typescript/test/unit/DaemonClient.test.ts` e `DaemonSessionClient.test.ts` existentes devem passar sem nenhuma modificação neste PR.

### 8.2 Formato de erro de rejeição do trust gate do /acp

Os dois transportes são semanticamente equivalentes, mas codificados de forma diferente:

| Cenário                       | REST                                       | /acp (JSON-RPC)                                                          |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Bearer token inválido/ausente | `401 { error, code: "unauthorized" }`      | `{ error: { code: -32001, message: "unauthorized" } }`                   |
| clientId inválido             | `400 { error, code: "invalid_client_id" }` | `{ error: { code: -32602, message: "invalid_client_id", data: {...} } }` |
| Rejeição do trust gate (path traversal, etc.) | `403 { error, code: "forbidden" }`         | `{ error: { code: -32003, message: "forbidden", data: {...} } }`         |

> Os códigos de erro do JSON-RPC seguem o [registro de códigos de erro do ACP](https://spec.acpprotocol.org) (a faixa padrão -32000 ~ -32099 é para erros de aplicativo definidos pelo servidor). Os valores de código específicos devem ser alinhados com a lógica de mapeamento de erros existente do `/acp` durante a implementação (`acp-integration/errorCodes.ts`).

---

## 9. Estratégia de testes

| Camada            | Tipo de teste                                                           | Objetivo de cobertura                                          |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| Sub-service unit  | Jest, mock de fsFactory / DeviceFlowRegistry / SubagentManager / callbacks | Corretude da lógica de negócio + rejeição de clientId inválido pelo trust gate |
| Route integration | Testes de route existentes alterados para passar pelo service (valida que a superfície HTTP não muda) | Garantia de regressão, caminhos REST não quebram             |
| Validação de equivalência E2E | Inicia serve real + requisições HTTP                                | REST e `/acp` retornam resultados equivalentes para a mesma operação; trust gate rejeita consistentemente em ambos os lados |
### Matriz de validação E2E

- Leitura/escrita de arquivos: REST `GET /file` vs `/acp` `qwen/workspace/fs/read` → mesmo resultado
- CRUD de Agent: REST `POST /workspace/agents` vs `/acp` `qwen/workspace/agents/create` → mesmo comportamento
- Rejeição no trust gate: clientId inválido retorna 403 em ambos os caminhos
- Inicialização do workspace: validar fluxo do fsFactory + geração de audit trail

---

## 10. Formato do PR

Commit atômico em um único PR, contendo:

- Todos os novos arquivos do DaemonWorkspaceService
- REST route handler alterado para chamar o service
- Redução da bridge (extração de 8 métodos de workspace) + exposição de 2 novos métodos de delegação child
- Renomeação de `HttpAcpBridge` para `AcpSessionBridge`
- Adição de 27 novos métodos ext northbound de `/acp`
- Testes completos (unit + integration + e2e)

---

## 11. O que não será feito (scope boundary)

- EventBus com escopo de workspace (território do PR 24)
- ClientRegistry com escopo de workspace (território do PR 24)
- Separação L2 ↔ L3 (extração de `ClientSideConnection` da bridge)
- Transformar REST em um shim de compatibilidade para `/acp` (direção de longo prazo)
- Unificação do modo standalone de channels (questão de modelo de deploy independente)
- Migração de `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` (session-scoped, manter no local atual)
- Transferência de ownership de `publishWorkspaceEvent` / `knownClientIds` (infraestrutura derivada de session, manter na bridge, service consome via callback)

---

## 12. Pontos de decisão pendentes de confirmação por chiga0

1. Namespace northbound de `/acp`: `qwen/workspace/...` vs outros (como reutilizar `qwen/control/...`)
2. Se a renomeação será no mesmo PR: tendência a manter no mesmo PR, mas pode ser separado conforme feedback

> Se esses dois pontos precisarem de ajuste, afetarão apenas a nomenclatura e os limites do commit, não a arquitetura.