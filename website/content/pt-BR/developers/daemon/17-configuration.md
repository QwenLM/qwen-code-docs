# Referência de Configuração

## Visão Geral

Esta página reúne todas as configurações que afetam o daemon `qwen serve` e seus adaptadores: variáveis de ambiente, flags de CLI, chaves do `settings.json` e opções programáticas. Páginas específicas de funcionalidades fazem referência a esta página quando precisam de detalhes de configuração transversais.

## Flags de CLI (`qwen serve`)

| Flag                                    | Tipo                       | Padrão                                    | Efeito                                                                                                                                                                              |
| --------------------------------------- | -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | string                     | `127.0.0.1`                                | Endereço de bind. Valores de loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Um endereço não loopback requer um token bearer na inicialização. Entrada `host:port` é rejeitada com orientação para usar `--port`. |
| `--port <n>`                            | number                     | `4170`                                     | Porta de escuta; `0` significa efêmera.                                                                                                                                                   |
| `--token <s>`                           | string                     | env                                        | Token bearer. Sobrescreve `QWEN_SERVER_TOKEN` e é aparado na inicialização. Aparece na linha de comando do processo, então prefira env em implantações.                                           |
| `--require-auth`                        | boolean                    | `false`                                    | Estende a autenticação bearer para loopback e `/health`; a inicialização se recusa a iniciar sem um token.                                                                                               |
| `--workspace <dir>`                     | caminho absoluto           | `process.cwd()`                            | Workspace vinculado. Deve ser absoluto e um diretório; canonicalizado uma vez na inicialização.                                                                                                      |
| `--max-sessions <n>`                    | number                     | `20`                                       | Limite de sessões ativas. `0` / `Infinity` significa ilimitado; `NaN` / valores negativos lançam erro.                                                                                                |
| `--max-pending-prompts-per-session <n>` | number                     | `5`                                        | Limite de prompts aceitos, mas pendentes/em execução por sessão. Excesso de prompts retorna 503. `0` / `Infinity` significa ilimitado; valores negativos ou não inteiros lançam erro.                             |
| `--max-connections <n>`                 | number                     | `256`                                      | `server.maxConnections` do listener HTTP; `0` / `Infinity` significa ilimitado.                                                                                                            |
| `--enable-session-shell`                | boolean                    | `false`                                    | Habilita a execução direta `POST /session/:id/shell`. Requer token bearer, e cada chamada deve carregar um `X-Qwen-Client-Id` vinculado à sessão.                                            |
| `--event-ring-size <n>`                 | number                     | `8000`                                     | Anel de replay SSE por sessão; limite suave é `1_000_000`.                                                                                                                               |
| `--http-bridge`                         | boolean                    | `true`                                     | Modo bridge estágio 1. `--no-http-bridge` ainda recai para http-bridge e imprime em stderr.                                                                                       |
| `--mcp-client-budget <n>`               | inteiro positivo           | não definido                               | Define `WorkspaceMcpBudget.clientBudget` e o encaminha para o filho ACP através de `childEnvOverrides`.                                                                                |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | `warn` quando o orçamento é definido, caso contrário `off` | Define `WorkspaceMcpBudget.mode`; `enforce` requer `--mcp-client-budget`.                                                                                                           |
| `--allow-origin <pattern>`              | string repetível           | não definido                               | Lista de permissões de origem cruzada que substitui a negação padrão de CORS. `*` permite qualquer origem, mas requer um token.                                                                           |
| `--allow-private-auth-base-url`         | boolean                    | `false`                                    | Permite que `/workspace/auth/provider` instale um `baseUrl` de provedor de autenticação localhost/rede privada; use apenas em desenvolvimento local confiável.                                            |
| `--prompt-deadline-ms <n>`              | inteiro positivo           | não definido                               | Limite de tempo real (wallclock) para prompt no lado do servidor em ms. O timeout aborta e retorna um erro.                                                                                                      |
| `--writer-idle-timeout-ms <n>`          | inteiro positivo           | não definido                               | Timeout de inatividade por conexão SSE em ms. O daemon fecha a conexão SSE quando nenhum evento é enviado por essa duração.                                                                |
| `--channel-idle-timeout-ms <n>`         | inteiro não negativo       | `0`                                        | Quanto tempo manter o filho ACP ativo após a última sessão ser fechada. `0` significa liberar imediatamente.                                                                                  |
| `--session-reap-interval-ms <n>`        | inteiro não negativo       | `60000`                                    | Intervalo de varredura do coletor de sessões; `0` o desabilita.                                                                                                                                      |
| `--session-idle-timeout-ms <n>`         | inteiro não negativo       | `1800000`                                  | Tempo de coleta de inatividade para sessões desconectadas; `0` o desabilita.                                                                                                          |
| `--rate-limit` / `--no-rate-limit`      | boolean                    | env / off                                  | Habilita a limitação de taxa HTTP por camada para rotas de prompt, mutação e leitura.                                                                                                          |
| `--rate-limit-prompt <n>`               | inteiro positivo           | `10`                                       | Limite de requisições de prompt por janela; requer que a limitação de taxa esteja habilitada.                                                                                                              |
| `--rate-limit-mutation <n>`             | inteiro positivo           | `30`                                       | Limite de requisições de mutação por janela; requer que a limitação de taxa esteja habilitada.                                                                                                            |
| `--rate-limit-read <n>`                 | inteiro positivo           | `120`                                      | Limite de requisições de leitura por janela; requer que a limitação de taxa esteja habilitada.                                                                                                                |
| `--rate-limit-window-ms <n>`            | inteiro `>= 1000`          | `60000`                                    | Duração da janela de limite de taxa; requer que a limitação de taxa esteja habilitada.                                                                                                                     |
| sem flag                                | -                          | -                                          | `QWEN_SERVE_NO_MCP_POOL=1` desabilita completamente o pool.                                                                                                                                 |

## Variáveis de Ambiente

### Lidas por `runQwenServe` / middleware Express

| Variável                           | Efeito                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                 | Token bearer; aparado na inicialização.                                                                                                                                           |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (insensível a maiúsculas/minúsculas) habilita logs verbose em stderr. Veja [`19-observability.md`](./19-observability.md).                                          |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` desabilita o pool de transporte MCP do workspace e recai para `McpClientManager` por sessão; as capacidades param de anunciar `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Fallback de ambiente para `--prompt-deadline-ms`.                                                                                                                                 |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Fallback de ambiente para `--writer-idle-timeout-ms`.                                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` habilita a limitação de taxa HTTP por camada; CLI `--rate-limit` / `--no-rate-limit` prevalece.                                                                           |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Fallback de ambiente para `--rate-limit-prompt`.                                                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Fallback de ambiente para `--rate-limit-mutation`.                                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Fallback de ambiente para `--rate-limit-read`.                                                                                                                                    |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Fallback de ambiente para `--rate-limit-window-ms`.                                                                                                                               |

### Encaminhadas para o filho ACP através de `BridgeOptions.childEnvOverrides`

`runQwenServe` constrói estas por handle, para que dois daemons em um processo não disputem `process.env`. As variáveis de orçamento não são fallbacks de ambiente do processo pai para `qwen serve`; o caminho CLI deve gerá-las a partir de `--mcp-client-budget` / `--mcp-budget-mode`.

| Variável                          | Efeito                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | String de inteiro positivo consumida pelo `readBudgetFromEnv()` do filho ACP.                                               |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`.                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | Lista de permissões de transportes separada por vírgulas; transportes padrão do pool são `stdio,websocket`; pode incluir explicitamente `http,sse`. |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | Atraso de dreno de inatividade para entradas do pool; padrão `30000`, limitado a `1000..600000` ms.                                              |

### Lidas por SDK / adaptadores

| Variável                   | Efeito                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | URL base do daemon para o adaptador TUI da CLI, canais e companion IDE. |
| `QWEN_DAEMON_TOKEN`     | Token bearer.                                                     |
| `QWEN_DAEMON_WORKSPACE` | Sobrescreve o `cwd` enviado para `POST /session`.                      |

## Chaves do `settings.json`

O daemon lê as configurações uma vez na inicialização através de `loadSettings(boundWorkspace)` dentro de `runQwenServe`. Configurações malformadas recaem para os padrões através de uma proteção try/catch.

| Chave                        | Tipo                                                               | Efeito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Define `BridgeOptions.permissionPolicy`; o valor ativo aparece em `/capabilities` como `policy.permission`. **A inicialização valida** através de `validatePolicyConfig()` contra `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`. Literais desconhecidos lançam `InvalidPolicyConfigError` e falham a inicialização explicitamente.                                                                                                                                                                                               |
| `policy.consensusQuorum`    | inteiro positivo                                                   | N para a política `consensus`. **Padrão** é `floor(M/2) + 1` sobre `votersAtIssue.size` (M=2 significa unânime; M par maior significa mais da metade). Se definido sob uma política não-consensus, é ignorado e a inicialização imprime um aviso no stderr. Inteiros não positivos lançam `InvalidPolicyConfigError`. Veja [`04-permission-mediation.md`](./04-permission-mediation.md).                                                                                                                                                                        |
| `context.fileName`          | string                                                             | Sobrescreve `getCurrentGeminiMdFilename()` através de `BridgeOptions.contextFilename`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`            | string[]                                                           | Ferramentas desabilitadas para a próxima criação do filho ACP. Normalizado através de `normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`): não-array vira `[]`, entradas não-string são ignoradas, espaços em branco são aparados, entradas vazias são removidas e duplicatas são eliminadas mantendo a primeira ocorrência. Tanto a inicialização quanto a atualização de configurações `restartMcpServer` passam por esta função. `ToolRegistry.has(name)` é exato e sensível a maiúsculas/minúsculas. `POST /workspace/tools/:name/enable` e `tool_toggled` atualizam esta chave. |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | Modo de aprovação padrão da sessão; `POST /session/:id/approval-mode` escreve aqui quando `persist: true`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                 | object                                                             | Configuração OTel. Chaves incluem `enabled`, `otlpEndpoint`, `otlpProtocol`, `otlpTracesEndpoint`, `otlpLogsEndpoint`, `otlpMetricsEndpoint`, `target`, `outfile`, `includeSensitiveSpanAttributes`, `sensitiveSpanAttributeMaxLength`, `resourceAttributes` e `metrics.includeSessionId`. `resolveTelemetrySettings()` lê na inicialização e inicializa `initializeTelemetry()`.                                                                                                                                                             |

## `ServeOptions` (incorporação programática)

`packages/cli/src/serve/types.ts` define o objeto de opções tipadas aceito tanto por `runQwenServe` quanto por `createServeApp`. Ele espelha as flags de CLI acima e adiciona:

| Campo                         | Efeito                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | Sobrescreve o tamanho padrão do anel por sessão.                                                  |
| `maxPendingPromptsPerSession` | Limite de prompts pendentes por sessão; `0` / `Infinity` significa ilimitado.                             |
| `mcpPoolActive`               | Chave programática, padrão a partir de `QWEN_SERVE_NO_MCP_POOL`.                                |
| `allowOrigins`                | Lista de permissões de origem cruzada (`string[]`), correspondendo a `--allow-origin`.                       |
| `allowPrivateAuthBaseUrl`     | Permite instalação de `baseUrl` de provedor de autenticação privado / localhost.                              |
| `enableSessionShell`          | Habilita execução de shell na sessão; token bearer e id de cliente vinculado à sessão ainda são necessários. |
| `promptDeadlineMs`            | Limite de tempo real (wallclock) para prompt.                                                                       |
| `writerIdleTimeoutMs`         | Timeout de inatividade do writer SSE.                                                                      |
| `channelIdleTimeoutMs`        | Quanto tempo manter o filho ACP aquecido após a última sessão ser fechada.                            |
| `sessionReapIntervalMs`       | Intervalo de varredura do coletor de sessões.                                                                 |
| `sessionIdleTimeoutMs`        | Tempo de coleta de inatividade para sessões desconectadas.                                                       |
| `rateLimit*`                  | Chave de limite de taxa HTTP por camada, limites e janela.                                      |
## `BridgeOptions` (incorporação programática da bridge)

`packages/acp-bridge/src/bridgeOptions.ts` define as opções da bridge. Consulte [`03-acp-bridge.md`](./03-acp-bridge.md) para a tabela completa. Campos principais:

| Campo                                                                                                                   | Efeito                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | Workspace canônico obrigatório.                                                                 |
| `sessionScope`                                                                                                          | `'single'` (padrão) vs `'thread'`.                                                           |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | Limites máximos de recursos.                                                                        |
| `channelFactory`                                                                                                        | Fábrica ACP filha plugável; o padrão é `defaultSpawnChannelFactory`.                         |
| `fileSystem`                                                                                                            | Adaptador `BridgeFileSystem`. Consulte [`07-workspace-filesystem.md`](./07-workspace-filesystem.md). |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | Conexão do mediator.                                                                              |
| `statusProvider`                                                                                                        | Células de pré-voo do daemon host.                                                                  |
| `childEnvOverrides`                                                                                                     | Adições ou remoções de ambiente por handle.                                                 |
| `contextFilename`                                                                                                       | Sobrescreve `getCurrentGeminiMdFilename()`.                                                     |
| `channelIdleTimeoutMs`                                                                                                  | Quanto tempo manter o filho ACP ativo após o fechamento da última sessão, em ms; padrão `0`.       |

## Padrões importantes

| Constante                          | Arquivo                  | Valor             | Significado                                                           |
| --------------------------------- | ----------------------- | ----------------- | --------------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | Limite de sessões antes de `SessionLimitExceededError`.                   |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | Limite flexível para `BridgeOptions.eventRingSize`; protege contra erros de digitação. |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | Profundidade do anel de replay SSE por sessão.                                |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | Limite de fila por assinante.                                         |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | Limite de assinantes por barramento.                                           |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | Gatilho `slow_client_warning`.                                    |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | Limite de rearranque de histerese.                                      |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | Timeout do handshake `initialize` do ACP.                               |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | Timeout da bridge para `/workspace/mcp/:server/restart`.              |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | Tempo de parede por solicitação de permissão.                                 |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | Alinhado com `DEFAULT_MAX_SUBSCRIBERS`.                           |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | FIFO para permissões resolvidas recentemente.                           |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | Janela de desligamento gracioso por canal.                             |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`       | `5_000`           | Temporizador de fechamento forçado do servidor HTTP.                                    |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | Limite de leitura.                                                         |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | Limite de gravação.                                                        |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | Limite de `displayName` da sessão.                                        |

## Referências cruzadas

- Configurações de autenticação: [`12-auth-security.md`](./12-auth-security.md)
- Capacidades e versão do protocolo: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- Anel de eventos e ajuste de contrapressão: [`10-event-bus.md`](./10-event-bus.md)
- Pool / orçamento MCP: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) e [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- Política de permissão: [`04-permission-mediation.md`](./04-permission-mediation.md)
- Guia de operações do usuário: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)