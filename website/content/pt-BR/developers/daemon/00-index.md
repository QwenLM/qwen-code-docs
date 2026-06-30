# Documentação para Desenvolvedores do Daemon

Esta é a documentação técnica voltada para desenvolvedores do **modo daemon do qwen-code**: o daemon HTTP `qwen serve`, o pacote `@qwen-code/acp-bridge`, o pool de transporte MCP com escopo de workspace, a mediação de permissões para múltiplos clientes, o schema de eventos tipados do daemon v1, o cliente daemon do SDK TypeScript e os adaptadores que se conectam ao daemon.

Ela complementa, e não substitui, estas documentações existentes:

| Doc existente                                                                        | Público-alvo            | Fonte da verdade para                                    |
| ------------------------------------------------------------------------------------ | ----------------------- | -------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                             | Operadores              | Início rápido para usuários, flags, modelo de ameaças    |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                             | Implementadores de protocolo | Catálogo de rotas HTTP, formatos de request/response, códigos de erro |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md) | Usuários do SDK         | Passo a passo completo em TypeScript                     |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                           | Autores de adaptadores  | Docs de design do adaptador de cliente legado            |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                   | Autores de adaptadores  | Notas de design do adaptador de cliente                  |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)     | Mantenedores do F2      | Design do pool de transporte MCP de workspace v2.2       |

Se você quer **iniciar um daemon e usá-lo**, leia `qwen-serve.md` primeiro. Se você quer **desenvolver um cliente usando o wire format**, leia `qwen-serve-protocol.md`. Se você quer **entender, estender ou depurar os componentes internos do daemon**, leia este conjunto.

## Ordem de leitura

Escolha o caminho que corresponde ao seu objetivo:

- **Iniciar e verificar um daemon primeiro**: `20 -> 17 -> 19`.
- **Novo contribuidor**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **Adicionando um novo adaptador de cliente**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **Trabalhando no pool ou budget do MCP**: `01 -> 03 -> 05 -> 06`.
- **Trabalhando em permissões**: `01 -> 03 -> 04 -> 12`.
- **Depurando um daemon em produção**: `19 -> 18 -> 17 -> 20`.

## Conjunto de documentos

### Fundamentos

- [`01-architecture.md`](./01-architecture.md) - arquitetura do sistema, topologia de processos, mapa de pacotes e todos os sete diagramas de sequência de nível superior.

### Núcleo do servidor

- [`02-serve-runtime.md`](./02-serve-runtime.md) - bootstrap do `runQwenServe`, app Express, cadeia de middlewares, graceful shutdown.
- [`03-acp-bridge.md`](./03-acp-bridge.md) - internos do pacote `@qwen-code/acp-bridge`, multiplexação de sessões, channel factory, spawn de ACP child.
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`, quatro políticas, invariante de timeout N1, cancel sentinel.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2), entradas do pool, índice reverso, restart, drain.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`, modos (`off`/`warn`/`enforce`), histerese, coalescência de lotes recusados.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - sandbox `WorkspaceFileSystem`, política de caminhos, auditoria, contrato `BridgeFileSystem`.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - create / attach / load / resume, `X-Qwen-Client-Id`, heartbeat, eviction, metadados.
- [`09-event-schema.md`](./09-event-schema.md) - schema de eventos tipados v1: todos os 47 tipos de eventos conhecidos com payloads, reducers, forward compatibility.
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`, IDs monotônicos, ring replay, `Last-Event-ID`, backpressure para clientes lentos, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - registro de capacidades, versão do protocolo, versão do schema, anúncio condicional.
- [`12-auth-security.md`](./12-auth-security.md) - middleware de bearer, allowlist de hosts, CORS deny, mutation gate, `--require-auth`, isenção do `/health`, device flow.

### Clientes

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - SDK TypeScript: `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, parser SSE, event reducers, camada de transcrição `ui/*`.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - camada de transcrição de UI compartilhada e a relação com o adaptador legado de daemon CLI TUI.
- [`15-channel-adapters.md`](./15-channel-adapters.md) - base compartilhada `DaemonChannelBridge` mais adaptadores por canal para DingTalk, WeChat (Weixin), Telegram, Feishu.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`, aplicação exclusiva de loopback, bridging de webview.

### Apêndices de referência

- [`17-configuration.md`](./17-configuration.md) - env vars, flags de CLI, chaves do `settings.json` que afetam o daemon.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - erros tipados por camada com remediação.
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`, receitas de depuração, lacunas de telemetria.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - caminho de inicialização mais curto, verificações com curl, mapa de rotas e receitas de invocação incorporadas.

## Glossário

- **ACP** - Agent Client Protocol. JSON-RPC sobre stdio falado entre a bridge do daemon e o processo filho ACP. Este não é o protocolo HTTP que os clientes usam contra o daemon.
- **ACP child** - o processo filho que o daemon faz spawn (`qwen --acp`) para hospedar o runtime do agente real. A bridge multiplexa um ACP child entre muitos clientes conectados.
- **acp-bridge** - o pacote `@qwen-code/acp-bridge` (`packages/acp-bridge/`). É responsável pela multiplexação de sessões, mediador de permissões, event bus e channel factory.
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`. Encapsula uma `ClientSideConnection` ACP e lida com `requestPermission`, `sendPrompt` e `cancelSession`.
- **Channel factory** - estratégia plugável para fazer spawn ou anexar a um ACP child. O `spawnChannel` padrão executa `qwen --acp` como um subprocesso; `inMemoryChannel` o executa in-process para testes.
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`. A facade de nível HTTP do SDK TypeScript sobre o daemon.
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. Wrapper com escopo de sessão que rastreia o `lastSeenEventId` para replay de SSE.
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`. Pub/sub em memória por sessão com IDs monotônicos, um ring limitado e backpressure por assinante.
- **F1 / F2 / F3 / F4** - marcos internos rastreados em [#4175](https://github.com/QwenLM/qwen-code/issues/4175). F1: extração da bridge e `BridgeFileSystem`. F2: pool de transporte MCP com escopo de workspace. F3: mediação de permissões para múltiplos clientes. F4: conclusão do protocolo e superfícies do cliente daemon.
- **MCP** - Model Context Protocol. Servidores expõem ferramentas, recursos e prompts; o ACP child do daemon se conecta a eles.
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`. Pool F2 com escopo de workspace que compartilha um transporte MCP por nome de servidor e fingerprint de configuração.
- **Mediator policy** - uma entre `first-responder`, `designated`, `consensus` ou `local-only`. Decide como os votos de permissão de múltiplos clientes são resolvidos.
- **Originator client id** - o `X-Qwen-Client-Id` do cliente que iniciou o prompt que está solicitando permissão no momento. A política `designated` aceita apenas votos deste id.
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`. Uma entrada no `McpTransportPool`: um transporte MCP, uma contagem de referências de sessões anexadas e um timer de drain ocioso.
- **Session scope** - `single` (uma sessão ACP compartilhada por todos os clientes) ou `thread` (uma sessão por thread de conversa). O padrão é `single`.
- **SSE** - Server-Sent Events. O canal de eventos de saída do daemon (`GET /session/:id/events`).
- **Workspace** - o diretório ao qual o daemon foi vinculado na inicialização (`--workspace` ou `cwd`). Um processo daemon equivale a um workspace.

## Âncoras de código-fonte de implementação

Use estas âncoras ao transitar da documentação para o código mais recente da `main`:

| Superfície                              | Âncoras de implementação                                                                                                                                                                                                                                                 | Docs principais                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Bootstrap e montagem HTTP               | `packages/cli/src/serve/run-qwen-serve.ts`, `packages/cli/src/serve/server.ts`, `packages/cli/src/serve/routes/health-demo.ts`, `/demo`                                                                                                                                  | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                 |
| Bridge ACP e multiplexação de sessões   | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                                   | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                        |
| Mediação de permissões                  | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                                     | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                  |
| Pool de transporte MCP                  | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                              | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                            |
| Guardrails de budget MCP                | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                                         | [`06`](./06-mcp-budget-guardrails.md)                                                                                |
| Filesystem do workspace                 | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                                          | [`07`](./07-workspace-filesystem.md)                                                                                 |
| Schema de eventos e writer SSE          | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/routes/sse-events.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                              |
| Ressincronização de eventos             | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                             | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                              |
| Capacidades                             | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                                         | [`11`](./11-capabilities-versioning.md)                                                                              |
| Auth e device flow                      | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                                           | [`12`](./12-auth-security.md)                                                                                        |
| Cliente daemon do SDK TypeScript        | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                                           | [`13`](./13-sdk-daemon-client.md)                                                                                    |
| Camada de transcrição de UI compartilhada | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                             | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Canais e adaptadores de IDE             | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                                | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                 |

## O que está intencionalmente fora do escopo

- **Clientes daemon dos SDKs Java / Python** - apenas o SDK TypeScript traz um cliente daemon hoje. O Doc 13 é exclusivo para TypeScript.
- **Detalhes do produto Web UI** - a camada de transcrição compartilhada e os pontos de entrada do daemon na web UI são cobertos aqui, mas o layout da UI do produto é rastreado em `docs/developers/daemon-ui/` e nas notas de design do adaptador.
- **Extensão Zed (`packages/zed-extension/`)** - ela inicia `qwen --acp` sobre stdio diretamente e ignora o daemon.
- **Hospedagem in-process experimental** - `--no-http-bridge` ainda faz fallback para http-bridge hoje; um modo de serve in-process estável precisaria de novos documentos quando for lançado.

## Cobertura atual do modo daemon

### Cobertura do núcleo do servidor

| Área                      | Estado atual                                                                                                                                                                     | Docs principais                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Bootstrap / caminho de listen | `qwen serve` carrega `runQwenServe` de forma lazy, valida auth/workspace/budget/settings, constrói um app Express, então chama `app.listen` e bloqueia para sempre até receber um sinal. | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)        |
| Auth / guardrails de rede | Loopback usa como padrão sem bearer; não-loopback requer bearer; `--require-auth` estende bearer para loopback e `/health`; Allowlist de hosts e CORS deny padrão estão ativos.  | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)                |
| Ciclo de vida da sessão   | `POST /session`, `load`, `resume`, patch de metadados, heartbeat, eviction, reaping ocioso, limites de prompt pendente e graceful close estão documentados.                       | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)                |
| Bridge ACP                | ACP child único multiplexado por padrão; `sessionScope` suporta `single` e `thread`; `BridgeFileSystem`, nome do arquivo de contexto, overrides de env e timeout ocioso do canal estão conectados. | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)            |
| Pool / budget MCP         | O pool MCP de workspace está ativo por padrão, a menos que `QWEN_SERVE_NO_MCP_POOL=1`; eventos de guardrail e semântica de restart estão documentados.                           | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)   |
| Permissões                | O mediador F3 suporta `first-responder`, `designated`, `consensus` e `local-only`; configurações inválidas falham explicitamente.                                                | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)         |

### Wire protocol

| Área          | Estado atual                                                                                                                                                                                        | Docs principais                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Rotas HTTP    | O catálogo de rotas está em `qwen-serve-protocol.md`; este conjunto de daemon apenas o referencia e explica a propriedade da implementação.                                                         | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)                 |
| Schema de eventos | `EVENT_SCHEMA_VERSION = 1`; 47 tipos de eventos conhecidos; frames sintéticos de assinante sem id; `_meta.serverTimestamp` carimbado por `EventBus.publish()` (com fallback de `formatSseFrame()` para frames sintéticos). | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                         |
| Capacidades   | `SERVE_PROTOCOL_VERSION = 'v1'`; 75 tags registradas; 13 tags condicionais.                                                                                                                         | [`11`](./11-capabilities-versioning.md)                                                                         |
| Session shell | `POST /session/:id/shell` existe atrás de `--enable-session-shell`, bearer auth e `X-Qwen-Client-Id` vinculado à sessão; a tag de capacidade é condicional.                                          | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md)   |
| Rate limiting | Limite de taxa HTTP opcional por tier é exposto por flags/env de CLI e tag de capacidade condicional.                                                                                               | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                          |
### Clientes / SDK

| Área                         | Estado atual                                                                                                                                                | Documentação principal                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliente daemon do SDK TypeScript | `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, parser SSE, redutores de eventos, preflight de recursos e exportações de transcrição de UI estão documentados.            | [`13`](./13-sdk-daemon-client.md)                                                                                                             |
| Camada de transcrição de UI compartilhada   | O SDK `daemon/ui/*` normaliza eventos do daemon em 42 tipos de eventos semânticos de UI, os reduz em blocos de transcrição e fornece renderizadores/auxiliares de conformidade. | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Consumidor daemon da Web UI       | `packages/webui/src/daemon/` consome o store de transcrição do SDK por meio de providers e adapters React.                                                         | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                 |
| CLI TUI / channels / VS Code | Caminhos legados ainda existem; a migração para primitivas de transcrição compartilhadas está documentada como trabalho de acompanhamento, não como comportamento concluído.                                 | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                         |

### Referência e operações

| Área                    | Estado atual                                                                                                                                             | Documentação principal                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Configuração           | Flags completas de `qwen serve`, variáveis de ambiente, `settings.json`, `ServeOptions`, `BridgeOptions` e constantes importantes são coletadas em uma página.                   | [`17`](./17-configuration.md)         |
| Quickstart / operações | O caminho de inicialização mais curto, receitas de inicialização, verificações com curl, comportamento de autenticação da página de demonstração, divisão de rotas, comportamento de desligamento e receitas de invocação incorporada são abordados. | [`20`](./20-quickstart-operations.md) |
| Erros                  | Falhas explícitas no momento da inicialização, erros de rota, erros de bridge, erros do EventBus, erros de sistema de arquivos e erros de mediador são resumidos com suas respectivas soluções.        | [`18`](./18-error-taxonomy.md)        |
| Observabilidade           | `QWEN_SERVE_DEBUG`, receitas com curl, eventos úteis, lacunas de telemetria e checklists de investigação estão documentados.                                             | [`19`](./19-observability.md)         |

### Superfícies históricas ou obsoletas

| Superfície                                            | Status                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | Rascunho histórico para o spike antigo do `DaemonTuiAdapter`; a arquitetura atual de transcrição de UI compartilhada está no documento 14. |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | Adapter experimental legado ainda presente no repositório. Novos trabalhos de UI compartilhada devem preferir o SDK `daemon/ui/*`.                 |
| `--no-http-bridge`                                 | Aceito para compatibilidade, mas faz fallback para http-bridge e imprime no stderr.                                    |

### Compatibilidade futura

- O schema de eventos v1 é aditivo. Novos tipos de eventos conhecidos devem ser adicionados a `DAEMON_KNOWN_EVENT_TYPE_VALUES`; SDKs antigos devem tratar tipos desconhecidos como compatíveis com versões futuras.
- Tags de capacidade são contratos de comportamento. Novos comportamentos precisam de uma nova tag, especialmente se os clients puderem fazer preflight dela antes de chamar uma rota.
- `sessionScope: 'thread'` é a divisão atual por thread de conversa; evite reintroduzir terminologias mais antigas com escopo de client.
- O `_meta` do envelope e o `data._meta` do payload ACP são distintos. A proveniência de chamadas de ferramentas fica no payload ACP; os timestamps de emissão do servidor ficam no envelope SSE.

## Proveniência da versão

Este conjunto de documentos reflete a superfície do modo daemon atualmente mesclada na `main`, incluindo o trabalho de acompanhamento do PR [#4412](https://github.com/QwenLM/qwen-code/pull/4412). Ele descreve intencionalmente o comportamento atual em vez de snapshots de planejamento anteriores da série F.