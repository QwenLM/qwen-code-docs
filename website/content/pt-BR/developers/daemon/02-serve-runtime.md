# Serve Runtime

## Visão geral

`packages/cli/src/serve/` é a camada de inicialização do `qwen serve`. Ele traduz as flags da CLI em `ServeOptions`, valida a configuração de inicialização, constrói o app Express, conecta os middlewares, registra as rotas, expõe os provedores de preflight/status do daemon-host, mantém o anel de auditoria de permissões e é responsável pela sequência de desligamento gracioso em duas fases. O trabalho voltado para HTTP fica nesta camada; o trabalho voltado para ACP fica uma camada abaixo em `@qwen-code/acp-bridge` (consulte [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Responsabilidades

- Analisar e validar `ServeOptions`: endereço de escuta, autenticação, workspace, limites de sessão/conexão, orçamento/pool de MCP, CORS, timeouts de inatividade de prompt/SSE/sessão, limite de taxa (rate limit) e toggles relacionados.
- **Canonicalizar** o workspace vinculado exatamente uma vez. A mesma forma canônica é compartilhada por `/capabilities`, o fallback de `POST /session` e a bridge.
- Rejeitar configurações de inicialização inseguras ou inválidas: bind fora do loopback sem token, `--require-auth` sem token, `--allow-origin '*'` sem token, `mcpBudgetMode='enforce'` sem um `mcpClientBudget` positivo, um `--workspace` inexistente ou que não seja um diretório, e valores inválidos de timeout ou rate limit.
- Construir a factory `WorkspaceFileSystem`, o publisher de auditoria de permissões, o `DaemonStatusProvider` e a `acp-bridge`.
- Construir o app Express, conectar os middlewares (`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> access log -> `bearerAuth` -> rate limit -> JSON parser -> telemetry -> `mutationGate` por rota) e montar as rotas HTTP de sessão, CRUD de workspace, arquivo, autenticação de device-flow, votação de permissão e ACP.
- Vincular a porta de escuta e registrar os manipuladores de sinais (signal handlers).
- Executar o desligamento em duas fases no SIGINT/SIGTERM; forçar a saída (force-exit) em um segundo sinal.

## Arquitetura

**Entrada**: `runQwenServe(opts, deps)` em `packages/cli/src/serve/run-qwen-serve.ts`. Retorna um `RunHandle` (`{ url, port, close, ... }`).

**Factory do app**: `createServeApp(opts, getPort, deps)` em `packages/cli/src/serve/server.ts`. Constrói o `Application` do Express. Embedders diretos e testes o chamam sem o wrapper de bootstrap.

**Registro de capacidades**: `SERVE_CAPABILITY_REGISTRY` em `packages/cli/src/serve/capabilities.ts`. Cada tag tem uma versão `since` e `modes` opcionais. Dez tags condicionais (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) são omitidas quando seu respectivo toggle está desativado. Consulte [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts` e `server.ts`):

| Middleware, em ordem de registro             | Propósito                                                                                                                  | Notas                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors`  | Negar todos os headers `Origin` por padrão; alternar para uma allowlist quando `--allow-origin <pattern>` estiver configurado. | Consulte [`12-auth-security.md`](./12-auth-security.md).                                                          |
| `hostAllowlist(bind, getPort)`               | No loopback, validar se o `Host` pertence a `localhost`, `127.0.0.1`, `[::1]` ou `host.docker.internal` mais a porta real. | Defesa contra DNS rebinding. A comparação não diferencia maiúsculas de minúsculas e é armazenada em cache por porta. |
| Access-log middleware                        | Registra método, caminho (path), status, durationMs, sessionId e clientId no `DaemonLogger` quando uma requisição termina. | Registrado **antes** do `bearerAuth`, para que as negações 401 também sejam registradas. Ignora `/health` e heartbeat. |
| `bearerAuth(token)`                          | Comparação de bearer em tempo constante usando SHA-256 mais `timingSafeEqual`.                                             | Passthrough aberto quando nenhum token está configurado (padrão de dev no loopback). O esquema `Bearer` não diferencia maiúsculas de minúsculas. |
| Rate-limit middleware                        | Token bucket opcional por tier para rotas de prompt, mutação e leitura.                                                    | Registrado após o `bearerAuth` e antes da análise do JSON; retorna 429 antes da análise quando um bucket é esgotado. |
| `express.json({ limit: '10mb' })`            | Análise do corpo (body) JSON.                                                                                              | Erros de análise retornam 400.                                                                                    |
| `daemonTelemetryMiddleware`                  | Envolve cada requisição HTTP em um span do OpenTelemetry através do `withDaemonRequestSpan`.                               | Os atributos incluem rota, sessionId, clientId e código de status.                                                |
| `createMutationGate` (por rota)              | Gate de opt-in no nível da rota para rotas de mutação que exigem token mesmo no loopback.                                  | Retorna `401 { code: 'token_required' }`. Não é um `app.use` global; as rotas chamam `mutate({ strict: true })` conforme necessário. |

**Subsistemas**:

| Caminho                                                          | Função                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve/fs/`                                                      | Factory `WorkspaceFileSystem` mais `policy.ts` (verificações de tamanho/confiança/binário), `paths.ts` (canonicalizar, resolveWithin, rejeição de symlink), `audit.ts` e valores tipados de `FsError`.                                                                                                                                                                                                                                                               |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | Handlers HTTP para `GET /file`, `GET /file/bytes`, `POST /file/write` e `POST /file/edit`.                                                                                                                                                                                                                                                                                                                                                                           |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory` (CRUD do QWEN.md).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents` (CRUD de subagentes).                                                                                                                                                                                                                                                                                                                                                                                                            |
| `serve/daemon-status-provider.ts`                                | Snapshot do ambiente (env) mais células de preflight do daemon-host: versão do Node, entrada da CLI, stat do workspace, ripgrep, git, npm.                                                                                                                                                                                                                                                                                                                           |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing` (FIFO de 512 entradas) e `createPermissionAuditPublisher`.                                                                                                                                                                                                                                                                                                                                                                                     |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`      | Rotas OAuth de device-flow. Consulte [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/daemon-logger.ts`                                         | Logs de arquivo estruturados do `DaemonLogger`. Consulte [`19-observability.md`](./19-observability.md).                                                                                                                                                                                                                                                                                                                                                             |
| `serve/debug-mode.ts`                                            | Predicado compartilhado `isServeDebugMode()` que controla o contexto de erro detalhado nas respostas HTTP.                                                                                                                                                                                                                                                                                                                                                           |
| `serve/acp-http/`                                                | Transporte ACP Streamable HTTP (RFD #721), montado em `/acp`. Sete arquivos implementam JSON-RPC POST, SSE GET, teardown DELETE e uso compartilhado da bridge em paralelo com a superfície REST.                                                                                                                                                                                                                                                                     |
| `serve/demo.ts`                                                  | HTML inline autossuficiente para `GET /demo`: console de debug do navegador com UI de chat, log de eventos e inspetor de workspace. No loopback sem `--require-auth`, é registrado **antes** do `bearerAuth`; fora do loopback ou com `--require-auth`, é registrado **depois** do `bearerAuth`. Servido com CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` mais `X-Frame-Options: DENY`. |

**Imports do pacote ACP bridge**:

- Primitivas de event-bus são importadas de `@qwen-code/acp-bridge/eventBus`.
- Primitivas de status são importadas de `@qwen-code/acp-bridge/status`.
- `serve/acp-session-bridge.ts` permanece como a facade de compatibilidade local da CLI para a superfície mais ampla da bridge.

## Fluxo

### Sequência de inicialização

1. **Resolver e remover espaços do token** em `opts.token` ou `QWEN_SERVER_TOKEN`; isso evita que uma nova linha final de `cat token.txt` quebre silenciosamente a comparação do bearer.
2. **Proteção contra erro de digitação no hostname**: `--hostname localhost:4170` gera um erro e sugere `--port`.
3. **Preflight de autenticação**: fora do loopback sem token é recusado; `--require-auth` sem token é recusado.
4. **Validação do workspace**: caminho absoluto, existe, é diretório. `EACCES` / `EPERM` são encapsulados para apontar para a flag.
5. **Canonicalizar workspace**: `canonicalizeWorkspace(rawWorkspace)` executa `realpathSync.native` uma vez e alimenta `/capabilities`, o fallback de `POST /session` e a bridge.
6. **Validação do orçamento do MCP**: inteiro positivo; `enforce` exige um orçamento.
7. **Inferência do toggle do pool MCP**: a env pai `QWEN_SERVE_NO_MCP_POOL=1` torna `mcpPoolActive=false`, para que as capacidades omitam honestamente `mcp_workspace_pool` e `mcp_pool_restart`.
8. **Validação de CORS / timeout / rate limit**: `--allow-origin '*'` exige token; valores de prompt, writer, channel idle, session idle, reaper e janela de rate limit falham rapidamente (fail fast) quando inválidos.
9. **`childEnvOverrides` por handle**: passa `QWEN_SERVE_MCP_CLIENT_BUDGET` e `QWEN_SERVE_MCP_BUDGET_MODE` para o filho ACP através de `BridgeOptions.childEnvOverrides` em vez de mutar `process.env`.
10. **Carregar `settings.json` uma vez**: lê `context.fileName`, `policy.permissionStrategy` e `policy.consensusQuorum`. Arquivos corrompidos recorrem aos padrões. `validatePolicyConfig()` verifica `policy.*` contra `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`; estratégias desconhecidas ou `consensusQuorum` não positivo lançam `InvalidPolicyConfigError`. Um quórum definido sob uma estratégia não `consensus` registra um aviso no stderr.
11. **Alocar `PermissionAuditRing`** (512 entradas).
12. **Construir `fsFactory`**: `runQwenServe` usa como padrão `trusted: true`; chamadores diretos de `createServeApp` usam como padrão `trusted: false` e avisam uma vez.
13. **`createHttpAcpBridge`**, consulte [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** monta o Express.
15. **`server.listen(port, hostname)`**, depois resolve o `getPort()` real para a allowlist de hosts.
16. **Registrar manipuladores SIGINT / SIGTERM** para desligamento gracioso.

### Desligamento gracioso

1. **Fase 1 - teardown da bridge** no primeiro sinal:
   - Descartar o registro de device-flow e cancelar fluxos pendentes.
   - `bridge.shutdown()` marca cada canal como `isDying = true`, envia um fechamento gracioso para o stdin de cada filho ACP, aguarda `KILL_HARD_DEADLINE_MS` (10s) por canal e então chama `channel.kill()` se necessário.
2. **Fase 2 - teardown HTTP**:
   - `server.close()` para de aceitar novas conexões e deixa as requisições em andamento terminarem.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5s) aciona `server.closeAllConnections()`.
   - Um segundo prazo de 2s escala novamente se necessário.
3. **Segundo sinal durante a saída**:
   - `bridge.killAllSync()` + `process.exit(1)` para evitar que filhos órfãos bloqueiem a saída do daemon.

## Estado e ciclo de vida

`RunHandle` expõe:

- `url`: URL de escuta resolvida, após a resolução da porta efêmera.
- `port`: porta real, incluindo a resolução de `0`.
- `close({ timeoutMs? })`: desligamento programático para embedders e testes.

Chamar `createServeApp` diretamente retorna apenas um `Application`; o embedder é responsável pelo `listen` e pelo desligamento.

## Dependências

| Upstream usado por `serve/`                                                                             | Downstream usando `serve/`                |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `@qwen-code/acp-bridge`: bridge, event bus, tipos de status                                             | O handler do subcomando `serve` da CLI `qwen` |
| `packages/core`: `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext`             | Embedders diretos, testes                 |
| ACP SDK (`@agentclientprotocol/sdk`): `PROTOCOL_VERSION`, `ClientSideConnection` através da bridge      |                                           |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path`                                            |                                           |

## Configuração

| Origem          | Chave                                                                                           | Efeito                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Env             | `QWEN_SERVER_TOKEN`                                                                             | Token bearer após remoção de espaços.                                                                 |
| Env             | `QWEN_SERVE_NO_MCP_POOL=1`                                                                      | Força `mcpPoolActive=false`.                                                                          |
| Env do filho ACP| `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                   | Gerado a partir de `--mcp-client-budget` / `--mcp-budget-mode` e encaminhado através de `childEnvOverrides`. |
| Env             | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                           | Timeouts padrão de inatividade de prompt / SSE.                                                       |
| Env             | `QWEN_SERVE_RATE_LIMIT*`                                                                        | Switch de rate limit, limites de prompt / mutação / leitura e padrão de janela.                       |
| Env             | `QWEN_SERVE_DEBUG=1`                                                                            | Logs detalhados no stderr. Consulte [`19-observability.md`](./19-observability.md).                   |
| Flags           | `--hostname`, `--port`                                                                          | Vinculação de escuta.                                                                                 |
| Flags           | `--token`, `--require-auth`, `--enable-session-shell`                                           | Token bearer, reforço de autenticação no loopback e switch explícito de execução de shell.            |
| Flag            | `--workspace`                                                                                   | Substitui `process.cwd()`.                                                                            |
| Flags           | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size` | Limites da Bridge / Express.                                                                          |
| Flags           | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                 | Encaminhado para o filho ACP.                                                                         |
| Flags           | `--allow-origin`, `--allow-private-auth-base-url`                                               | Allowlist de CORS do navegador e switch de instalação do provedor de autenticação localhost/privado.  |
| Flags           | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`                 | Controle do ciclo de vida de inatividade de prompt, writer SSE e filho ACP.                           |
| Flags           | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                       | Controle de reaping de sessões desconectadas.                                                         |
| Flags           | `--rate-limit*`                                                                                 | Limite de taxa HTTP por tier.                                                                         |
| `settings.json` | `policy.permissionStrategy`, `policy.consensusQuorum`                                           | Política e quórum do `MultiClientPermissionMediator`.                                                 |
| `settings.json` | `context.fileName`                                                                              | Substituição de `getCurrentGeminiMdFilename` para a bridge.                                           |
Consulte [`17-configuration.md`](./17-configuration.md) para a referência consolidada.

## Ressalvas e limites conhecidos

- O uso direto de `createServeApp` sem `deps.fsFactory` ou `deps.bridge` tem como padrão `trusted: false`; o `writeTextFile` do ACP no lado do agente rejeita como `untrusted_workspace`. O aviso é impresso apenas uma vez.
- O `denyBrowserOriginCors` rejeita **todas** as requisições que carregam `Origin`; a página de demonstração funciona porque outro middleware remove primeiro os valores correspondentes de mesma origem.
- Ordem do body-parser: rotas que usam `mutate({ strict: true })` retornam 401 apenas após o `express.json()`. O pior caso é `--max-connections × express.json({limit: '10mb'})`, chegando a cerca de 2,5 GB de memória transitória em um listener de loopback saturado; esse tradeoff é intencional.
- Múltiplos daemons em um único processo devem usar `childEnvOverrides` por handle; a mutação de `process.env` causa race conditions porque o `defaultSpawnChannelFactory` faz um snapshot do env no momento do spawn.

## Referências

- `packages/cli/src/serve/run-qwen-serve.ts` (bootstrap, validação de inicialização, encerramento gracioso)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, montagem de middleware e rotas)
- `packages/cli/src/serve/auth.ts` (CORS, allowlist de Host, bearer auth, gate de mutação)
- `packages/cli/src/serve/rate-limit.ts` (rate limit HTTP por tier)
- `packages/cli/src/serve/capabilities.ts` (registro de capabilities e anúncio condicional)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)