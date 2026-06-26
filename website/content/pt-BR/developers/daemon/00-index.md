# Documentação para Desenvolvedores do Daemon

Esta é a documentação técnica voltada para desenvolvedores sobre o **modo daemon do Qwen Code**: o daemon HTTP `qwen serve`, o pacote `@qwen-code/acp-bridge`, o pool de transporte MCP com escopo de workspace, a mediação de permissões para múltiplos clientes, o esquema de eventos tipados do daemon v1, o cliente do daemon do SDK TypeScript e os adaptadores que se conectam ao daemon.

Ela complementa, sem substituir, os seguintes documentos existentes:

| Documento existente                                                                 | Público-alvo           | Fonte da verdade para                                    |
| ----------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                            | Operadores             | Guia rápido do usuário, flags, modelo de ameaça          |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                            | Implementadores de protocolo | Catálogo de rotas HTTP, formatos de requisição/resposta, códigos de erro |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md) | Usuários do SDK        | Tutorial TypeScript completo                             |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                           | Autores de adaptadores | Documentos de design de adaptadores de cliente legados   |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                   | Autores de adaptadores | Notas de design de adaptadores de cliente                |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)     | Mantenedores do F2     | Design do pool de transporte MCP do workspace v2.2       |

Se você deseja **iniciar um daemon e usá-lo**, leia `qwen-serve.md` primeiro. Se você deseja **criar um cliente para o formato de transmissão**, leia `qwen-serve-protocol.md`. Se você deseja **entender, estender ou depurar os internos do daemon**, leia este conjunto.

## Ordem de leitura

Escolha o caminho que corresponde ao seu objetivo:

- **Iniciar e verificar um daemon primeiro**: `20 -> 17 -> 19`.
- **Novo colaborador**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **Adicionar um novo adaptador de cliente**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **Trabalhar no pool MCP ou orçamento**: `01 -> 03 -> 05 -> 06`.
- **Trabalhar em permissões**: `01 -> 03 -> 04 -> 12`.
- **Depurar um daemon em produção**: `19 -> 18 -> 17 -> 20`.

## Conjunto de documentos

### Fundação

- [`01-architecture.md`](./01-architecture.md) - arquitetura do sistema, topologia de processos, mapa de pacotes e todos os sete diagramas de sequência de alto nível.

### Núcleo do servidor

- [`02-serve-runtime.md`](./02-serve-runtime.md) - inicialização do `runQwenServe`, aplicativo Express, cadeia de middlewares, desligamento gracioso.
- [`03-acp-bridge.md`](./03-acp-bridge.md) - internos do pacote `@qwen-code/acp-bridge`, multiplexação de sessões, fábrica de canais, spawn do processo filho ACP.
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`, quatro políticas, invariante de timeout N1, sentinela de cancelamento.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2), entradas do pool, índice reverso, reinicialização, dreno.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`, modos (`off`/`warn`/`enforce`), histerese, coalescência de lotes recusados.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - sandbox `WorkspaceFileSystem`, política de caminhos, auditoria, contrato `BridgeFileSystem`.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - criar / anexar / carregar / retomar, `X-Qwen-Client-Id`, heartbeat, despejo, metadados.
- [`09-event-schema.md`](./09-event-schema.md) - esquema de eventos tipados v1: todos os 43 tipos de eventos conhecidos com payloads, redutores, compatibilidade futura.
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`, IDs monotônicos, replay em anel, `Last-Event-ID`, contrapressão para clientes lentos, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - registro de capacidades, versão do protocolo, versão do esquema, anúncio condicional.
- [`12-auth-security.md`](./12-auth-security.md) - middleware bearer, lista de permissões de hosts, negação de CORS, gate de mutação, `--require-auth`, isenção do `/health`, fluxo de dispositivo.

### Clientes

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - SDK TypeScript: `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, parser SSE, redutores de eventos, camada de transcrição `ui/*`.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - camada de transcrição de interface compartilhada e o relacionamento do adaptador do daemon TUI de CLI legado.
- [`15-channel-adapters.md`](./15-channel-adapters.md) - base compartilhada `DaemonChannelBridge` mais adaptadores por canal: DingTalk, WeChat (Weixin), Telegram, Feishu.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`, imposição de apenas loopback, ponte webview.

### Apêndices de referência

- [`17-configuration.md`](./17-configuration.md) - variáveis de ambiente, flags de CLI, chaves do `settings.json` que afetam o daemon.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - erros tipados por camada com remediação.
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`, receitas de depuração, lacunas de telemetria.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - caminho de inicialização mais curto, verificações com curl, mapa de rotas e receitas de invocação incorporadas.

## Glossário

- **ACP** - Agent Client Protocol. JSON-RPC via stdio falado entre a ponte do daemon e o processo filho ACP. Não é o protocolo HTTP que os clientes usam contra o daemon.
- **ACP child** - o processo filho que o daemon inicia (`qwen --acp`) para hospedar o runtime real do agente. A ponte multiplexa um ACP child entre vários clientes conectados.
- **acp-bridge** - o pacote `@qwen-code/acp-bridge` (`packages/acp-bridge/`). Gerencia multiplexação de sessões, o mediador de permissões, o barramento de eventos e a fábrica de canais.
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`. Encapsula uma conexão de lado cliente ACP e lida com `requestPermission`, `sendPrompt` e `cancelSession`.
- **Channel factory** - estratégia plugável para iniciar ou anexar a um ACP child. O padrão `spawnChannel` executa `qwen --acp` como um subprocesso; `inMemoryChannel` o executa em processo para testes.
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`. Fachada HTTP do SDK TypeScript no nível do daemon.
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. Invólucro com escopo de sessão que rastreia `lastSeenEventId` para replay SSE.
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`. Pub/sub em memória por sessão com IDs monotônicos, um anel limitado e contrapressão por assinante.
- **F1 / F2 / F3 / F4** - marcos internos rastreados em [#4175](https://github.com/QwenLM/qwen-code/issues/4175). F1: extração da ponte e `BridgeFileSystem`. F2: pool de transporte MCP com escopo de workspace. F3: mediação de permissões para múltiplos clientes. F4: conclusão do protocolo e superfícies do cliente do daemon.
- **MCP** - Model Context Protocol. Servidores expõem ferramentas, recursos e prompts; o ACP child do daemon se conecta a eles.
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`. Pool com escopo de workspace F2 que compartilha um transporte MCP por nome de servidor e impressão digital de configuração.
- **Mediator policy** - uma de `first-responder`, `designated`, `consensus` ou `local-only`. Decide como os votos de permissão de múltiplos clientes são resolvidos.
- **Originator client id** - o `X-Qwen-Client-Id` do cliente que iniciou o prompt que está atualmente solicitando permissão. A política `designated` só aceita votos deste id.
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`. Uma entrada no `McpTransportPool`: um transporte MCP, uma contagem de referência de sessões anexadas e um timer de dreno ocioso.
- **Session scope** - `single` (uma sessão ACP compartilhada por todos os clientes) ou `thread` (uma sessão por thread de conversa). O padrão é `single`.
- **SSE** - Server-Sent Events. Canal de eventos de saída do daemon (`GET /session/:id/events`).
- **Workspace** - o diretório ao qual o daemon foi vinculado na inicialização (`--workspace` ou `cwd`). Um processo daemon equivale a um workspace.

## Âncoras de implementação no código-fonte

Use estas âncoras ao passar dos documentos para o código mais recente no `main`:

| Superfície                             | Âncoras de implementação                                                                                                                                                                                                                                   | Documentos principais                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Inicialização e montagem HTTP          | `packages/cli/src/serve/run-qwen-serve.ts`, `server.ts`, `/demo`                                                                                                                                                                                           | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                   |
| Ponte ACP e multiplexação de sessões   | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                     | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                          |
| Mediação de permissões                 | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                       | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                    |
| Pool de transporte MCP                 | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                 | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                              |
| Diretrizes de orçamento MCP            | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                           | [`06`](./06-mcp-budget-guardrails.md)                                                                                  |
| Sistema de arquivos do workspace       | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                            | [`07`](./07-workspace-filesystem.md)                                                                                   |
| Esquema de eventos e escritor SSE      | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/server.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Ressincronização de eventos            | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                 | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Capacidades                            | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                           | [`11`](./11-capabilities-versioning.md)                                                                                |
| Autenticação e fluxo de dispositivo    | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                             | [`12`](./12-auth-security.md)                                                                                          |
| Cliente do daemon do SDK TypeScript    | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                               | [`13`](./13-sdk-daemon-client.md)                                                                                      |
| Camada de transcrição de UI compartilhada | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                 | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Adaptadores de canais e IDE            | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                  | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                   |

## O que está intencionalmente fora do escopo

- **Clientes do daemon em SDK Java / Python** - apenas o SDK TypeScript inclui um cliente do daemon atualmente. O documento 13 é exclusivo para TypeScript.
- **Detalhes do produto Web UI** - a camada de transcrição compartilhada e os pontos de entrada do daemon na web UI são abordados aqui, mas o layout da UI do produto é rastreado em `docs/developers/daemon-ui/` e nas notas de design do adaptador.
- **Extensão Zed (`packages/zed-extension/`)** - ela inicia `qwen --acp` via stdio diretamente e ignora o daemon.
- **Hospedagem experimental em processo** - `--no-http-bridge` ainda usa http-bridge como fallback atualmente; um modo de serviço estável em processo precisaria de nova documentação quando for implementado.

## Cobertura atual do modo daemon

### Cobertura do núcleo do servidor

| Área                           | Estado atual                                                                                                                                                                    | Documentos principais                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Inicialização / caminho de escuta | `qwen serve` carrega lazy `runQwenServe`, valida auth/workspace/budget/settings, constrói um aplicativo Express, então chama `app.listen` e bloqueia para sempre até um sinal.  | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)               |
| Diretrizes de auth / rede      | Loopback padrão não requer bearer; não-loopback requer bearer; `--require-auth` estende bearer para loopback e `/health`; lista de permissões de Host e negação CORS padrão estão ativas. | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)                      |
| Ciclo de vida da sessão        | `POST /session`, `load`, `resume`, patch de metadados, heartbeat, despejo, limpeza ociosa, limites de prompt pendentes e fechamento gracioso estão documentados.               | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)                      |
| Ponte ACP                      | Único ACP child multiplexado por padrão; `sessionScope` suporta `single` e `thread`; `BridgeFileSystem`, nome de arquivo de contexto, sobrescritas de env e timeout ocioso do canal estão configurados. | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)                  |
| Pool / orçamento MCP           | Pool MCP do workspace está ligado por padrão, a menos que `QWEN_SERVE_NO_MCP_POOL=1`; eventos de diretrizes e semântica de reinicialização estão documentados.                  | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)          |
| Permissões                     | Mediador F3 suporta `first-responder`, `designated`, `consensus` e `local-only`; configurações inválidas falham explicitamente.                                                  | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)               |

### Protocolo de transmissão

| Área            | Estado atual                                                                                                                                         | Documentos principais                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Rotas HTTP      | O catálogo de rotas está em `qwen-serve-protocol.md`; este conjunto de documentos do daemon apenas o referencia e explica a propriedade da implementação. | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)                        |
| Esquema de eventos | `EVENT_SCHEMA_VERSION = 1`; 43 tipos de eventos conhecidos; quadros sintéticos de assinante sem id; `_meta.serverTimestamp` carimbado na fronteira de escrita SSE. | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Capacidades     | `SERVE_PROTOCOL_VERSION = 'v1'`; 67 tags registradas; 10 tags condicionais.                                                                           | [`11`](./11-capabilities-versioning.md)                                                                                 |
| Shell da sessão | `POST /session/:id/shell` existe por trás de `--enable-session-shell`, auth bearer e `X-Qwen-Client-Id` vinculado à sessão; a tag de capacidade é condicional. | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md)          |
| Limitação de taxa | Limite de taxa HTTP opcional por nível é exposto por flags de CLI/env e tag de capacidade condicional.                                                | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                                  |

### Clientes / SDK

| Área                            | Estado atual                                                                                                                                                   | Documentos principais                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliente do daemon do SDK TypeScript | `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, parser SSE, redutores de eventos, verificação prévia de recursos e exportações de transcrição de UI estão documentados. | [`13`](./13-sdk-daemon-client.md)                                                                                                                        |
| Camada de transcrição de UI compartilhada | SDK `daemon/ui/*` normaliza eventos do daemon em 37 tipos de eventos semânticos de UI, reduz em blocos de transcrição e fornece helpers de renderização/conformidade. | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md)            |
| Consumidor do daemon na Web UI  | `packages/webui/src/daemon/` consome o armazenamento de transcrição do SDK através de providers e adaptadores React.                                            | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                            |
| CLI TUI / canais / VS Code      | Caminhos legados ainda existem; a migração para primitivas de transcrição compartilhadas está documentada como trabalho futuro, não como comportamento concluído. | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                    |
### Referência e operações

| Área                    | Estado atual                                                                                                                                             | Documentação principal                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Configuração            | Todas as flags do `qwen serve`, variáveis de ambiente, `settings.json`, `ServeOptions`, `BridgeOptions` e constantes importantes estão reunidas em uma página. | [`17`](./17-configuration.md)                   |
| Quickstart / operações  | Caminho de inicialização mais curto, receitas de inicialização, verificações com curl, comportamento de autenticação da página de demonstração, divisão de rotas, comportamento de desligamento e receitas de invocação incorporadas são cobertos. | [`20`](./20-quickstart-operations.md)           |
| Erros                   | Falhas explícitas na inicialização, erros de rota, erros de bridge, erros do EventBus, erros do sistema de arquivos e erros do mediator são resumidos com correções. | [`18`](./18-error-taxonomy.md)                  |
| Observabilidade         | `QWEN_SERVE_DEBUG`, receitas com curl, eventos úteis, lacunas de telemetria e listas de verificação de investigação estão documentados.                  | [`19`](./19-observability.md)                   |

### Superfícies históricas ou obsoletas

| Superfície                                          | Status                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `docs/developers/daemon-client-adapters/tui.md`     | Rascunho histórico para o antigo spike do `DaemonTuiAdapter`; a arquitetura atual de transcrição da UI compartilhada está no doc 14. |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts`  | Adaptador experimental legado ainda na árvore. Novos trabalhos de UI compartilhada devem preferir SDK `daemon/ui/*`.      |
| `--no-http-bridge`                                  | Aceito para compatibilidade, mas usa http-bridge como fallback e imprime stderr.                                         |

### Compatibilidade futura

- O esquema de eventos v1 é aditivo. Novos tipos de evento conhecidos devem ser anexados a `DAEMON_KNOWN_EVENT_TYPE_VALUES`; SDKs antigos devem tratar tipos desconhecidos como compatíveis com versões futuras.
- Tags de capacidade são contratos de comportamento. Novo comportamento precisa de uma nova tag, especialmente se clientes podem verificar previamente antes de chamar uma rota.
- `sessionScope: 'thread'` é a divisão atual por thread de conversa; evite reintroduzir terminologia antiga com escopo de cliente.
- `_meta` do envelope e `data._meta` do payload ACP são distintos. A proveniência de chamadas de ferramenta reside no payload ACP; os timestamps de emissão do servidor residem no envelope SSE.

## Procedência da versão

Este conjunto de documentos reflete a superfície do modo daemon atualmente mesclada no `main`, incluindo o trabalho complementar do [#4412](https://github.com/QwenLM/qwen-code/pull/4412). Ele descreve intencionalmente o comportamento atual em vez de snapshots de planejamento anteriores da série F.