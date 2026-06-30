# Referência de Configuração

## Visão Geral

Esta página reúne todas as configurações que afetam o daemon `qwen serve` e seus adaptadores: variáveis de ambiente, flags da CLI, chaves do `settings.json` e opções programáticas. Páginas específicas de recursos fazem referência a esta página quando precisam de detalhes de configuração transversais.

## Flags da CLI (`qwen serve`)

| Flag                                    | Tipo                       | Padrão                                     | Efeito                                                                                                                                                                              |
| --------------------------------------- | -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | string                     | `127.0.0.1`                                | Endereço de bind. Valores de loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Valores fora de loopback exigem um bearer token na inicialização. A entrada `host:port` é rejeitada com orientação para usar `--port`. |
| `--port <n>`                            | number                     | `4170`                                     | Porta de escuta; `0` significa efêmera.                                                                                                                                                   |
| `--token <s>`                           | string                     | env                                        | Bearer token. Sobrescreve `QWEN_SERVER_TOKEN` e é aparado na inicialização. Aparece na linha de comando do processo, portanto prefira variáveis de ambiente em deployments.                                           |
| `--require-auth`                        | boolean                    | `false`                                    | Estende a autenticação bearer para loopback e `/health`; a inicialização recusa iniciar sem um token.                                                                                               |
| `--workspace <dir>`                     | absolute path              | `process.cwd()`                            | Workspace vinculado. Deve ser absoluto e um diretório; canonizado uma vez na inicialização.                                                                                                      |
| `--max-sessions <n>`                    | number                     | `20`                                       | Limite de sessões ativas. `0` / `Infinity` significa ilimitado; valores `NaN` / negativos lançam exceção.                                                                                                |
| `--max-pending-prompts-per-session <n>` | number                     | `5`                                        | Limite de prompts aceitos, mas pendentes/em execução por sessão. Prompts em excesso retornam 503. `0` / `Infinity` significa ilimitado; valores negativos ou não inteiros lançam exceção.                             |
| `--max-connections <n>`                 | number                     | `256`                                      | `server.maxConnections` do listener HTTP; `0` / `Infinity` significa ilimitado.                                                                                                            |
| `--enable-session-shell`                | boolean                    | `false`                                    | Habilita a execução direta de `POST /session/:id/shell`. Exige bearer token, e toda chamada deve carregar um `X-Qwen-Client-Id` vinculado à sessão.                                            |
| `--event-ring-size <n>`                 | number                     | `8000`                                     | Ring de replay SSE por sessão; o limite flexível (soft cap) é `1_000_000`.                                                                                                                               |
| `--http-bridge`                         | boolean                    | `true`                                     | Modo bridge da fase 1. `--no-http-bridge` ainda faz fallback para http-bridge e imprime no stderr.                                                                                       |
| `--mcp-client-budget <n>`               | positive integer           | unset                                      | Define `WorkspaceMcpBudget.clientBudget` e o encaminha para o filho ACP através de `childEnvOverrides`.                                                                                |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | `warn` quando o budget é definido, caso contrário `off` | Define `WorkspaceMcpBudget.mode`; `enforce` exige `--mcp-client-budget`.                                                                                                           |
| `--allow-origin <pattern>`              | repeatable string          | unset                                      | Allowlist de cross-origin que substitui a negação padrão de CORS. `*` permite qualquer origem, mas exige um token.                                                                           |
| `--allow-private-auth-base-url`         | boolean                    | `false`                                    | Permite que `/workspace/auth/provider` instale o `baseUrl` do provedor de autenticação localhost / rede privada; use apenas em desenvolvimento local confiável.                                            |
| `--prompt-deadline-ms <n>`              | positive integer           | unset                                      | Limite de wallclock do prompt no lado do servidor em ms. O timeout aborta e retorna um erro.                                                                                                      |
| `--writer-idle-timeout-ms <n>`          | positive integer           | unset                                      | Timeout de ociosidade por conexão SSE em ms. O daemon fecha a conexão SSE quando nenhum evento é enviado por essa duração.                                                                |
| `--channel-idle-timeout-ms <n>`         | non-negative integer       | `0`                                        | Por quanto tempo manter o filho ACP ativo após o fechamento da última sessão. `0` significa recuperar (reclaim) imediatamente.                                                                                  |
| `--session-reap-interval-ms <n>`        | non-negative integer       | `60000`                                    | Intervalo de varredura do reaper de sessões; `0` o desativa.                                                                                                                                      |
| `--session-idle-timeout-ms <n>`         | non-negative integer       | `1800000`                                  | Tempo de reaping de ociosidade para sessões desconectadas; `0` o desativa.                                                                                                                            |
| `--rate-limit` / `--no-rate-limit`      | boolean                    | env / off                                  | Habilita rate limiting HTTP por tier para rotas de prompt, mutação e leitura.                                                                                                          |
| `--rate-limit-prompt <n>`               | positive integer           | `10`                                       | Limite de requisições de prompt por janela; exige que o rate limiting esteja habilitado.                                                                                                              |
| `--rate-limit-mutation <n>`             | positive integer           | `30`                                       | Limite de requisições de mutação por janela; exige que o rate limiting esteja habilitado.                                                                                                            |
| `--rate-limit-read <n>`                 | positive integer           | `120`                                      | Limite de requisições de leitura por janela; exige que o rate limiting esteja habilitado.                                                                                                                |
| `--rate-limit-window-ms <n>`            | integer `>= 1000`          | `60000`                                    | Duração da janela de rate limit; exige que o rate limiting esteja habilitado.                                                                                                                     |
| sem flag                                 | -                          | -                                          | `QWEN_SERVE_NO_MCP_POOL=1` desativa completamente o pool.                                                                                                                                 |

## Variáveis de ambiente

### Lidas por `runQwenServe` / middleware Express

| Env                                 | Efeito                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                 | Bearer token; aparado na inicialização.                                                                                                                                           |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (case-insensitive) habilita logs verbosos no stderr. Ver [`19-observability.md`](./19-observability.md).                                          |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` desativa o pool de transporte MCP do workspace e faz fallback para o `McpClientManager` por sessão; as capacidades param de anunciar `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Fallback de ambiente para `--prompt-deadline-ms`.                                                                                                                                 |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Fallback de ambiente para `--writer-idle-timeout-ms`.                                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` habilita rate limiting HTTP por tier; a flag da CLI `--rate-limit` / `--no-rate-limit` tem precedência.                                                                           |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Fallback de ambiente para `--rate-limit-prompt`.                                                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Fallback de ambiente para `--rate-limit-mutation`.                                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Fallback de ambiente para `--rate-limit-read`.                                                                                                                                    |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Fallback de ambiente para `--rate-limit-window-ms`.                                                                                                                               |

### Encaminhadas para o filho ACP através de `BridgeOptions.childEnvOverrides`

O `runQwenServe` constrói estas variáveis por handle para que dois daemons em um mesmo processo não disputem o `process.env`. As variáveis de budget não são fallbacks de ambiente do processo pai para o `qwen serve`; o caminho da CLI deve gerá-las a partir de `--mcp-client-budget` / `--mcp-budget-mode`.

| Env                              | Efeito                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | String de inteiro positivo consumida pelo `readBudgetFromEnv()` do filho ACP.                                               |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`.                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | Allowlist de transportes separada por vírgulas; os transportes padrão do pool são `stdio,websocket`; pode incluir explicitamente `http,sse`. |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | Atraso de drenagem de ociosidade da entrada do pool; padrão `30000`, limitado (clamped) a `1000..600000` ms.                                              |

### Lidas pelo SDK / adaptadores

| Env                     | Efeito                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | URL base do daemon para o adaptador TUI da CLI, canais e companion de IDE. |
| `QWEN_DAEMON_TOKEN`     | Bearer token.                                                     |
| `QWEN_DAEMON_WORKSPACE` | Sobrescreve o `cwd` enviado para `POST /session`.                      |

## Chaves do `settings.json`

O daemon lê as configurações uma vez na inicialização através de `loadSettings(boundWorkspace)` dentro do `runQwenServe`. Configurações malformadas usam os padrões como fallback através de uma guarda try/catch.

| Key                         | Tipo                                                               | Efeito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Define `BridgeOptions.permissionPolicy`; o valor ativo aparece em `/capabilities` como `policy.permission`. **A inicialização valida** através de `validatePolicyConfig()` contra `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`. Literais desconhecidos lançam `InvalidPolicyConfigError` e falham a inicialização explicitamente.                                                                                                                                                                                                                               |
| `policy.consensusQuorum`    | positive integer                                                   | N para a política `consensus`. O **padrão** é `floor(M/2) + 1` sobre `votersAtIssue.size` (M=2 significa unânime; M par maior significa mais da metade). Se definido sob uma política não-consensus, é ignorado e a inicialização imprime um aviso no stderr. Inteiros não positivos lançam `InvalidPolicyConfigError`. Ver [`04-permission-mediation.md`](./04-permission-mediation.md).                                                                                                                                                                        |
| `context.fileName`          | string                                                             | Sobrescreve `getCurrentGeminiMdFilename()` através de `BridgeOptions.contextFilename`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`            | string[]                                                           | Ferramentas desabilitadas para o próximo spawn do filho ACP. Normalizado através de `normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`): não-array vira `[]`, entradas não-string são ignoradas, espaços em branco são removidos, entradas vazias são descartadas e duplicatas são removidas preservando a primeira ocorrência. A inicialização e a atualização de configurações do `restartMcpServer` ambas passam por esta função. `ToolRegistry.has(name)` é exato e case-sensitive. `POST /workspace/tools/:name/enable` e `tool_toggled` atualizam esta chave. |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | Modo de aprovação de sessão padrão; `POST /session/:id/approval-mode` escreve aqui quando `persist: true`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                 | object                                                             | Configuração do OTel. As chaves incluem `enabled`, `otlpEndpoint`, `otlpProtocol`, `otlpTracesEndpoint`, `otlpLogsEndpoint`, `otlpMetricsEndpoint`, `target`, `outfile`, `includeSensitiveSpanAttributes`, `sensitiveSpanAttributeMaxLength`, `resourceAttributes` e `metrics.includeSessionId`. `resolveTelemetrySettings()` a lê na inicialização e inicializa `initializeTelemetry()`.                                                                                                                                                             |

## `ServeOptions` (incorporação programática)

O `packages/cli/src/serve/types.ts` define o objeto de opções tipado aceito tanto por `runQwenServe` quanto por `createServeApp`. Ele espelha as flags da CLI acima e adiciona:

| Field                         | Efeito                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | Sobrescreve o tamanho padrão do ring por sessão.                                                  |
| `maxPendingPromptsPerSession` | Limite de prompts pendentes por sessão; `0` / `Infinity` significa ilimitado.                             |
| `mcpPoolActive`               | Switch programático, com padrão vindo de `QWEN_SERVE_NO_MCP_POOL`.                                |
| `allowOrigins`                | Allowlist de cross-origin (`string[]`), correspondente a `--allow-origin`.                       |
| `allowPrivateAuthBaseUrl`     | Permite a instalação do `baseUrl` do provedor de autenticação privado / localhost.                              |
| `enableSessionShell`          | Habilita a execução do shell de sessão; bearer token e client id vinculado à sessão ainda são exigidos. |
| `promptDeadlineMs`            | Limite de wallclock do prompt.                                                                       |
| `writerIdleTimeoutMs`         | Timeout de ociosidade do writer SSE.                                                                      |
| `channelIdleTimeoutMs`        | Por quanto tempo manter o filho ACP aquecido (warm) após o fechamento da última sessão.                            |
| `sessionReapIntervalMs`       | Intervalo de varredura do reaper de sessões.                                                                 |
| `sessionIdleTimeoutMs`        | Tempo de reaping de ociosidade para sessões desconectadas.                                                       |
| `rateLimit*`                  | Switch de rate limit HTTP por tier, limites (thresholds) e janela.                                      |
## `BridgeOptions` (incorporação programática da bridge)

`packages/acp-bridge/src/bridgeOptions.ts` define as opções da bridge. Consulte [`03-acp-bridge.md`](./03-acp-bridge.md) para a tabela completa. Campos principais:

| Campo                                                                                                                   | Efeito                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | Workspace canônico obrigatório.                                                               |
| `sessionScope`                                                                                                          | `'single'` (padrão) vs `'thread'`.                                                            |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | Limites máximos de recursos.                                                                  |
| `channelFactory`                                                                                                        | Factory plugável de child ACP; o padrão é `defaultSpawnChannelFactory`.                       |
| `fileSystem`                                                                                                            | Adaptador `BridgeFileSystem`. Consulte [`07-workspace-filesystem.md`](./07-workspace-filesystem.md). |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | Configuração do mediador.                                                                     |
| `statusProvider`                                                                                                        | Células de preflight do host do daemon.                                                       |
| `childEnvOverrides`                                                                                                     | Adições ou remoções de ambiente por handle.                                                   |
| `contextFilename`                                                                                                       | Substitui `getCurrentGeminiMdFilename()`.                                                     |
| `channelIdleTimeoutMs`                                                                                                  | Por quanto tempo manter o child ACP ativo após o fechamento da última sessão, em ms; padrão `0`. |

## Padrões importantes

| Constante                          | Arquivo                 | Valor             | Significado                                                           |
| --------------------------------- | ----------------------- | ----------------- | --------------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | Limite de sessões antes de `SessionLimitExceededError`.               |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | Limite flexível (soft cap) para `BridgeOptions.eventRingSize`; protege contra erros de digitação. |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | Profundidade do ring de replay de SSE por sessão.                     |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | Limite da fila por subscriber.                                        |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | Limite de subscribers por bus.                                        |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | Gatilho do `slow_client_warning`.                                     |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | Limite de rearme por histerese.                                       |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | Timeout do handshake `initialize` do ACP.                             |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | Timeout da bridge para `/workspace/mcp/:server/restart`.              |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | Tempo de relógio real por solicitação de permissão.                   |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | Alinhado com `DEFAULT_MAX_SUBSCRIBERS`.                               |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | FIFO para permissões resolvidas recentemente.                         |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | Janela de encerramento gracioso (graceful shutdown) por channel.      |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`     | `5_000`           | Timer de fechamento forçado do servidor HTTP.                         |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | Limite de leitura.                                                    |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | Limite de escrita.                                                    |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | Limite do `displayName` da sessão.                                    |

## Referências cruzadas

- Configurações de autenticação: [`12-auth-security.md`](./12-auth-security.md)
- Capacidades e versão do protocolo: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- Ajuste do event ring e backpressure: [`10-event-bus.md`](./10-event-bus.md)
- Pool / budget do MCP: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) e [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- Política de permissões: [`04-permission-mediation.md`](./04-permission-mediation.md)
- Guia de operações do usuário: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)