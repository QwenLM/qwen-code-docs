# Runtime do Serve

## Visão Geral

`packages/cli/src/serve/` é a camada de inicialização para `qwen serve`. Ela traduz as flags da CLI em `ServeOptions`, valida a configuração de inicialização, constrói a aplicação Express, conecta middlewares, registra rotas, expõe provedores de preflight/status do daemon, mantém o anel de auditoria de permissões e gerencia a sequência de desligamento gracioso em duas fases. O trabalho voltado para HTTP reside nesta camada; o trabalho voltado para ACP reside uma camada abaixo em `@qwen-code/acp-bridge` (veja [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Responsabilidades

- Analisar e validar `ServeOptions`: endereço de escuta, autenticação, workspace, limites de sessão / conexão, orçamento / pool MCP, CORS, timeouts de prompt / SSE / sessão ociosa, limite de taxa e opções relacionadas.
- **Canonicalizar** o workspace definido exatamente uma vez. A mesma forma canônica é compartilhada por `/capabilities`, o fallback `POST /session` e a bridge.
- Rejeitar configurações de inicialização inseguras ou inválidas: binding não-loopback sem token, `--require-auth` sem token, `--allow-origin '*'` sem token, `mcpBudgetMode='enforce'` sem um `mcpClientBudget` positivo, um `--workspace` inexistente ou que não seja um diretório, e valores inválidos de timeout ou limite de taxa.
- Construir a fábrica `WorkspaceFileSystem`, o publicador de auditoria de permissões, o `DaemonStatusProvider` e o `acp-bridge`.
- Construir a aplicação Express, conectar middlewares (`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> log de acesso -> `bearerAuth` -> limite de taxa -> analisador JSON -> telemetria -> `mutationGate` por rota) e montar rotas de sessão, CRUD de workspace, arquivo, autenticação device-flow, votação de permissão e ACP HTTP.
- Vincular a porta de escuta e registrar handlers de sinais.
- Executar desligamento em duas fases ao receber SIGINT/SIGTERM; forçar saída em um segundo sinal.

## Arquitetura

**Entrada**: `runQwenServe(opts, deps)` em `packages/cli/src/serve/run-qwen-serve.ts`. Retorna um `RunHandle` (`{ url, port, close, ... }`).

**Fábrica de aplicação**: `createServeApp(opts, getPort, deps)` em `packages/cli/src/serve/server.ts`. Constrói a `Application` Express. Incorporadores diretos e testes a chamam sem o wrapper de inicialização.

**Registro de capacidades**: `SERVE_CAPABILITY_REGISTRY` em `packages/cli/src/serve/capabilities.ts`. Cada tag possui uma versão `since` e `modes` opcionais. Dez tags condicionais (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) são omitidas quando a opção correspondente está desligada. Veja [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middlewares** (`packages/cli/src/serve/auth.ts` e `server.ts`):

| Middleware, na ordem de registro           | Propósito                                                                                                                    | Notas                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors` | Negar todos os cabeçalhos `Origin` por padrão; alternar para uma lista de permissões quando `--allow-origin <pattern>` é configurado. | Veja [`12-auth-security.md`](./12-auth-security.md).                                                               |
| `hostAllowlist(bind, getPort)`              | Em loopback, validar que `Host` pertence a `localhost`, `127.0.0.1`, `[::1]` ou `host.docker.internal` mais a porta real. | Defesa contra DNS rebinding. A comparação é case-insensitive e armazenada em cache por porta.                     |
| Middleware de log de acesso                 | Registra método, caminho, status, duraçãoMs, sessionId e clientId no `DaemonLogger` quando uma requisição termina.               | Registrado **antes** do `bearerAuth`, para que negações 401 também sejam registradas. Ignora `/health` e heartbeat. |
| `bearerAuth(token)`                         | Comparação de bearer em tempo constante com SHA-256 mais `timingSafeEqual`.                                                   | Passagem aberta quando nenhum token é configurado (padrão loopback dev). O esquema `Bearer` é case-insensitive.    |
| Middleware de limite de taxa                | Token bucket opcional por nível para rotas de prompt, mutação e leitura.                                                      | Registrado após `bearerAuth` e antes do parsing JSON; retorna 429 antes do parsing quando um bucket está esgotado. |
| `express.json({ limit: '10mb' })`           | Parsing do corpo JSON.                                                                                                       | Erros de parsing retornam 400.                                                                                    |
| `daemonTelemetryMiddleware`                 | Envolve cada requisição HTTP em um span do OpenTelemetry através de `withDaemonRequestSpan`.                                  | Atributos incluem rota, sessionId, clientId e código de status.                                                   |
| `createMutationGate` (por rota)            | Gate de opt-in por rota para rotas de mutação que exigem token mesmo em loopback.                                           | Retorna `401 { code: 'token_required' }`. Não é global `app.use`; rotas chamam `mutate({ strict: true })` conforme necessário. |

**Subsistemas**:

| Caminho                                                         | Função                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serve/fs/`                                                      | Fábrica `WorkspaceFileSystem` mais `policy.ts` (verificações de tamanho/confiança/binário), `paths.ts` (canonicalizar, resolveWithin, rejeição de symlink), `audit.ts` e valores `FsError` tipados.                                                                                                                                                                                                                                                                              |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | Handlers HTTP para `GET /file`, `GET /file/bytes`, `POST /file/write` e `POST /file/edit`.                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory` (CRUD do QWEN.md).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents` (CRUD de subagentes).                                                                                                                                                                                                                                                                                                                                                                                                         |
| `serve/daemon-status-provider.ts`                                | Snapshot de ambiente mais células de preflight do daemon: versão do Node, entrada da CLI, stat do workspace, ripgrep, git, npm.                                                                                                                                                                                                                                                                                                                                                   |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing` (FIFO de 512 entradas) e `createPermissionAuditPublisher`.                                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`      | Rotas OAuth de device-flow. Veja [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                                                                                                                                                                                                                                                |
| `serve/daemon-logger.ts`                                         | Logs estruturados em arquivo do `DaemonLogger`. Veja [`19-observability.md`](./19-observability.md).                                                                                                                                                                                                                                                                                                                                                                     |
| `serve/debug-mode.ts`                                            | Predicado compartilhado `isServeDebugMode()` que controla contexto de erro verboso em respostas HTTP.                                                                                                                                                                                                                                                                                                                                                                   |
| `serve/acp-http/`                                                | Transporte ACP Streamable HTTP (RFD #721), montado em `/acp`. Sete arquivos implementam JSON-RPC POST, SSE GET, DELETE teardown e uso compartilhado da bridge em paralelo com a superfície REST.                                                                                                                                                                                                                                                                       |
| `serve/demo.ts`                                                  | HTML inline autocontido para `GET /demo`: console de depuração no navegador com UI de chat, log de eventos e inspetor de workspace. Em loopback sem `--require-auth`, é registrado **antes** do `bearerAuth`; em não-loopback ou com `--require-auth`, é registrado **após** o `bearerAuth`. Servido com CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` mais `X-Frame-Options: DENY`. |

**Shims de re-exportação** para compatibilidade com caminhos de importação pré-F1:

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## Fluxo

### Sequência de inicialização

1. **Resolver e aparar token** de `opts.token` ou `QWEN_SERVER_TOKEN`; isso evita que uma quebra de linha final de `cat token.txt` quebre silenciosamente a comparação bearer.
2. **Proteção de erro de digitação no hostname**: `--hostname localhost:4170` gera erro e sugere `--port`.
3. **Preflight de autenticação**: não-loopback sem token é recusado; `--require-auth` sem token é recusado.
4. **Validação do workspace**: caminho absoluto, existente, diretório. `EACCES` / `EPERM` são encapsulados para apontar para a flag.
5. **Canonicalizar workspace**: `canonicalizeWorkspace(rawWorkspace)` executa `realpathSync.native` uma vez e alimenta `/capabilities`, o fallback `POST /session` e a bridge.
6. **Validação de orçamento MCP**: inteiro positivo; `enforce` exige um orçamento.
7. **Inferência de alternância do pool MCP**: env pai `QWEN_SERVE_NO_MCP_POOL=1` faz `mcpPoolActive=false`, então as capacidades omitem honestamente `mcp_workspace_pool` e `mcp_pool_restart`.
8. **Validação de CORS / timeout / limite de taxa**: `--allow-origin '*'` exige token; valores de timeout de prompt, writer, canal ocioso, sessão ociosa, reaper e janela de limite de taxa falham rapidamente quando inválidos.
9. **`childEnvOverrides` por handle**: passar `QWEN_SERVE_MCP_CLIENT_BUDGET` e `QWEN_SERVE_MCP_BUDGET_MODE` para o filho ACP através de `BridgeOptions.childEnvOverrides` em vez de mutar `process.env`.
10. **Carregar `settings.json` uma vez**: ler `context.fileName`, `policy.permissionStrategy` e `policy.consensusQuorum`. Arquivos corrompidos voltam para padrões. `validatePolicyConfig()` verifica `policy.*` em relação a `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`; estratégias desconhecidas ou `consensusQuorum` não positivo lançam `InvalidPolicyConfigError`. Um quorum definido sob uma estratégia não `consensus` registra um aviso no stderr.
11. **Alocar `PermissionAuditRing`** (512 entradas).
12. **Construir `fsFactory`**: `runQwenServe` padrão é `trusted: true`; chamadores diretos de `createServeApp` padrão são `trusted: false` e emitem um aviso uma vez.
13. **`createHttpAcpBridge`**, veja [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** monta o Express.
15. **`server.listen(port, hostname)`**, então resolve o `getPort()` real para a lista de permissões de host.
16. **Registrar handlers SIGINT / SIGTERM** para desligamento gracioso.

### Desligamento gracioso

1. **Fase 1 - Teardown da bridge** no primeiro sinal:
   - Descartar o registro de device-flow e cancelar fluxos pendentes.
   - `bridge.shutdown()` marca cada canal como `isDying = true`, envia fechamento gracioso para o stdin de cada filho ACP, aguarda `KILL_HARD_DEADLINE_MS` (10s) por canal, então chama `channel.kill()` se necessário.
2. **Fase 2 - Teardown HTTP**:
   - `server.close()` para de aceitar novas conexões e permite que requisições em andamento terminem.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5s) aciona `server.closeAllConnections()`.
   - Um segundo deadline de 2s é escalado novamente se necessário.
3. **Segundo sinal durante saída**:
   - `bridge.killAllSync()` + `process.exit(1)` para evitar filhos órfãos bloqueando a saída do daemon.

## Estado e ciclo de vida

`RunHandle` expõe:

- `url`: URL de escuta resolvida, após resolução de porta efêmera.
- `port`: porta real, incluindo resolução de `0`.
- `close({ timeoutMs? })`: desligamento programático para incorporadores e testes.

Chamar `createServeApp` diretamente retorna apenas uma `Application`; o incorporador é responsável pelo `listen` e desligamento.

## Dependências

| Upstream usado por `serve/`                                                                       | Downstream que usa `serve/`                 |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `@qwen-code/acp-bridge`: bridge, barramento de eventos, tipos de status                            | O handler do subcomando `serve` da CLI `qwen` |
| `packages/core`: `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext`        | Incorporadores diretos, testes                |
| SDK ACP (`@agentclientprotocol/sdk`): `PROTOCOL_VERSION`, `ClientSideConnection` através da bridge |                                             |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path`                                      |                                             |

## Configuração

| Fonte           | Chave                                                                                             | Efeito                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Env             | `QWEN_SERVER_TOKEN`                                                                               | Token Bearer após aparar.                                                                              |
| Env             | `QWEN_SERVE_NO_MCP_POOL=1`                                                                        | Força `mcpPoolActive=false`.                                                                         |
| Env do filho ACP | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                    | Gerado a partir de `--mcp-client-budget` / `--mcp-budget-mode` e encaminhado via `childEnvOverrides`. |
| Env             | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                            | Timeouts padrão de prompt / SSE ocioso.                                                                   |
| Env             | `QWEN_SERVE_RATE_LIMIT*`                                                                          | Alternância de limite de taxa, limites de prompt / mutação / leitura e janela padrão.                 |
| Env             | `QWEN_SERVE_DEBUG=1`                                                                              | Logs verbosos no stderr. Veja [`19-observability.md`](./19-observability.md).                              |
| Flags           | `--hostname`, `--port`                                                                            | Binding de escuta.                                                                                       |
| Flags           | `--token`, `--require-auth`, `--enable-session-shell`                                             | Token Bearer, reforço de autenticação em loopback e alternância explícita de execução de shell.                           |
| Flag            | `--workspace`                                                                                     | Substitui `process.cwd()`.                                                                            |
| Flags           | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size`  | Limites da bridge / Express.                                                                                |
| Flags           | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                 | Encaminhado para o filho ACP.                                                                           |
| Flags           | `--allow-origin`, `--allow-private-auth-base-url`                                                | Lista de permissões CORS para navegador e alternância de instalação do provedor de autenticação localhost/privado. |
| Flags           | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`                 | Controle de ciclo de vida ocioso de prompt, writer SSE e filho ACP.                                             |
| Flags           | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                       | Controle de reaproveitamento de sessão desconectada.                                                                 |
| Flags           | `--rate-limit*`                                                                                    | Limite de taxa HTTP por nível.                                                                                 |
| `settings.json` | `policy.permissionStrategy`, `policy.consensusQuorum`                                           | Política e quorum do `MultiClientPermissionMediator`.                                                    |
| `settings.json` | `context.fileName`                                                                              | Substituição de `getCurrentGeminiMdFilename` para a bridge.
Veja [`17-configuration.md`](./17-configuration.md) para a referência mesclada.

## Advertências e limitações conhecidas

- `createServeApp` diretamente sem `deps.fsFactory` ou `deps.bridge` assume como padrão `trusted: false`; o `writeTextFile` do ACP do lado do agente rejeita como `untrusted_workspace`. O aviso é impresso uma vez.
- `denyBrowserOriginCors` rejeita **todas** as requisições que contêm `Origin`; a página de demonstração funciona porque outro middleware remove os valores de mesma origem correspondentes primeiro.
- Ordenação do body-parser: rotas que usam `mutate({ strict: true })` retornam 401 somente após `express.json()`. O pior caso é `--max-connections × express.json({limit: '10mb'})`, com até cerca de 2.5 GB de memória transitória em um listener de loopback saturado; essa compensação é intencional.
- Múltiplos daemons em um único processo devem usar `childEnvOverrides` por handle; modificar `process.env` gera condições de corrida porque `defaultSpawnChannelFactory` captura o env no momento da criação.

## Referências

- `packages/cli/src/serve/run-qwen-serve.ts` (bootstrap, boot validation, graceful shutdown)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, middleware and route assembly)
- `packages/cli/src/serve/auth.ts` (CORS, Host allowlist, bearer auth, mutation gate)
- `packages/cli/src/serve/rate-limit.ts` (per-tier HTTP rate limit)
- `packages/cli/src/serve/capabilities.ts` (capability registry and conditional advertisement)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)