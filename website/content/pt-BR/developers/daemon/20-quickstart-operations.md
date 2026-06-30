# Início rápido e operações

Esta página foca em **como iniciar o `qwen serve`, como verificar se ele está funcionando e como é a cadeia de chamadas interna do `qwen serve` até o servidor de escuta**. Detalhes de arquitetura, componentes e protocolo de comunicação estão nas outras páginas de aprofundamento do daemon.

## 1. Caminho mais curto

```bash
qwen serve
```

Saída:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Abra `http://127.0.0.1:4170/demo` em um navegador para ver o console de depuração: UI de chat, stream de eventos e inspeção de workspace. No modo de desenvolvimento loopback padrão, `createServeApp()` monta a rota `/demo` de `packages/cli/src/serve/routes/health-demo.ts` **antes** de `bearerAuth`, portanto nenhum token é necessário.

## 2. Receitas de inicialização

```bash
# 1. Local dev default (loopback, no token)
qwen serve

# 2. Explicit workspace + ephemeral port
qwen serve --workspace /path/to/repo --port 0

# 3. Hardened loopback development (force bearer even on loopback)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Expose to LAN (non-loopback requires a token)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Tune for many sessions and a larger replay ring
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. Multi-client collaboration + strict MCP budget
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. Start with a consensus policy configured in settings.json
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. Debug logging
QWEN_SERVE_DEBUG=1 qwen serve

# 9. Disable the F2 pool (fallback to per-session MCP clients)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Allow browser web UI cross-origin access
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Prompt deadline + SSE idle timeout
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. Keep the ACP child warm after the last session closes
qwen serve --channel-idle-timeout-ms 60000

# 13. Enable HTTP rate limiting
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

Com a receita de loopback reforçado (3), `/demo` é registrado após `bearerAuth`. Uma navegação normal no navegador precisa de um header de autenticação, então use curl ou um script de SDK em vez disso.

## 3. Flags de inicialização completas

A CLI é definida em **`packages/cli/src/commands/serve.ts`**:

| Flag                                    | Type                           | Default                                      | Required when                            | Effect                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                        | Porta TCP; `0` significa porta efêmera atribuída pelo SO.                                                                                                                                                             |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | Non-loopback requires token              | Endereço de bind. Valores de loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Os colchetes de `[::1]` são removidos automaticamente; a entrada `host:port` é rejeitada com orientação para usar `--port`.           |
| `--token <s>`                           | string                         | env / none                                   | Non-loopback and `--require-auth`        | Token Bearer; aparado uma vez. **Ele aparece em `/proc/<pid>/cmdline`, então prefira `QWEN_SERVER_TOKEN`**. O stderr de inicialização também avisa sobre isso.                                                        |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                        | Limite de sessões ativas. Spawn em excesso retorna 503. `0` significa ilimitado. Valores `NaN` / negativos lançam erro.                                                                                               |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                        | Limite de prompts aceitos, mas pendentes/em execução por sessão. Prompt em excesso retorna 503. `0` / `Infinity` significa ilimitado. Valores negativos ou não inteiros lançam erro.                                  |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | Workspace vinculado. **Deve ser um caminho absoluto, deve existir e deve ser um diretório**. A inicialização o canoniza uma vez via `canonicalizeWorkspace`. `POST /session` com um `cwd` incompatível retorna `400 workspace_mismatch`. |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                        | `server.maxConnections` no nível do listener. `0` / `Infinity` significa ilimitado. Valores `NaN` / negativos falham na inicialização para evitar comportamento fail-open.                                            |
| `--require-auth`                        | boolean                        | `false`                                      | Token required                           | Estende a autenticação bearer para loopback **e** `/health`. A inicialização recusa iniciar sem um token.                                                                                                             |
| `--enable-session-shell`                | boolean                        | `false`                                      | Token required                           | Habilita a execução direta de `POST /session/:id/shell`. Os chamadores também devem enviar um `X-Qwen-Client-Id` vinculado à sessão.                                                                                  |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                        | Profundidade do anel de replay SSE por sessão. O limite flexível é `MAX_EVENT_RING_SIZE = 1_000_000`; valores fora do intervalo lançam erro durante a construção da bridge.                                           |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                        | Modo bridge da etapa 1: um filho `qwen --acp` multiplexado pelo daemon. O modo in-process da etapa 2 ainda não está implementado; `--no-http-bridge` faz fallback e imprime no stderr.                                |
| `--mcp-client-budget <n>`               | number                         | none                                         | Required for `mcp-budget-mode=enforce`   | Limite de clientes MCP do workspace. Deve ser um inteiro positivo.                                                                                                                                                    |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | `warn` when a budget is set, otherwise `off` | `enforce` requires `--mcp-client-budget` | `enforce` recusa, `warn` apenas avisa em 75%, `off` é apenas observação.                                                                                                                                              |
| `--allow-origin <pattern>`              | repeatable string              | none                                         | -                                        | Allowlist CORS que substitui a negação padrão de Origin. `*` requer um token.                                                                                                                                         |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                        | Permite a instalação de `baseUrl` de provedor de autenticação localhost / rede privada. Use apenas para desenvolvimento local confiável.                                                                              |
| `--prompt-deadline-ms <n>`              | number                         | none                                         | -                                        | Limite de wallclock do prompt no lado do servidor em ms; o timeout aborta o prompt.                                                                                                                                   |
| `--writer-idle-timeout-ms <n>`          | number                         | none                                         | -                                        | Timeout de ociosidade por conexão SSE em ms.                                                                                                                                                                          |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                        | Mantém o filho ACP ativo após o fechamento da última sessão. `0` significa recuperar imediatamente.                                                                                                                   |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                        | Intervalo de varredura do reaper de sessões. `0` o desativa.                                                                                                                                                          |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                        | Timeout de ociosidade de sessão desconectada. `0` o desativa.                                                                                                                                                         |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / off                                    | -                                        | Habilita ou desabilita o rate limiting HTTP por tier.                                                                                                                                                                 |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                           | Requisições de prompt por janela.                                                                                                                                                                                     |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                           | Requisições de mutação por janela.                                                                                                                                                                                    |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                           | Requisições de leitura por janela.                                                                                                                                                                                    |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                           | Comprimento da janela de rate limit; deve ser `>= 1000`.                                                                                                                                                              |

## 4. Variáveis de ambiente

| Env                                 | Equivalent flag / effect                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | Equivalente a `--token`; `--token` prevalece. Aparado uma vez na inicialização para evitar uma nova linha final de `cat token.txt`.                                     |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (case-insensitive) habilita logs detalhados no stderr.                                                                                      |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` desativa completamente o pool MCP do workspace e faz fallback para o `McpClientManager` por sessão. As capacidades param de anunciar `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | Entrada de orçamento interno do filho ACP. A CLI o gera a partir de `--mcp-client-budget` através de `childEnvOverrides`; não é um fallback de env do processo pai.      |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | Modo de orçamento interno do filho ACP. A CLI o gera a partir de `--mcp-budget-mode` através de `childEnvOverrides`; não é um fallback de env do processo pai.           |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Fallback de env para `--prompt-deadline-ms`.                                                                                                                            |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Fallback de env para `--writer-idle-timeout-ms`.                                                                                                                        |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | Lido pelo filho ACP. Allowlist de transportes em pool separados por vírgula; o padrão é `stdio,websocket`.                                                              |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | Lido pelo filho ACP. Atraso de drenagem de ociosidade da entrada do pool; o padrão é `30000`, limitado a `1000..600000` ms.                                             |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` habilita o rate limiting; a flag da CLI prevalece.                                                                                                         |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Fallback de env para `--rate-limit-prompt`.                                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Fallback de env para `--rate-limit-mutation`.                                                                                                                           |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Fallback de env para `--rate-limit-read`.                                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Fallback de env para `--rate-limit-window-ms`.                                                                                                                          |

As substituições de env por handle são intencionais: dois daemons rodando no mesmo processo não competem por `process.env`. `defaultSpawnChannelFactory` tira um snapshot do env no momento do spawn.

## 5. `settings.json` também é lido

A inicialização chama `loadSettings(boundWorkspace)` uma vez:

| Key                         | Type                                                               | Behavior                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Define `BridgeOptions.permissionPolicy`. **A inicialização valida com `validatePolicyConfig`**; valores desconhecidos lançam `InvalidPolicyConfigError` em vez de fazer fallback silenciosamente. |
| `policy.consensusQuorum`    | positive integer                                                   | N para a política `consensus`. O padrão é `floor(M/2)+1`. Se definido sob uma política não-consenso, é ignorado e a inicialização registra um aviso no stderr.            |
| `context.fileName`          | string                                                             | Substitui `getCurrentGeminiMdFilename()` e controla qual arquivo `POST /workspace/init` escreve.                                                                         |
| `tools.disabled`            | string[]                                                           | Normalizado através de `normalizeDisabledToolList()` (aparar, remover entradas vazias, deduplicar) antes de afetar o próximo spawn do filho ACP.                         |
| `tools.approvalMode`        | string                                                             | Modo de aprovação de sessão padrão.                                                                                                                                      |
| `telemetry`                 | object                                                             | Configuração OTel: `enabled`, `otlpEndpoint`, `otlpProtocol`, endpoints por sinal, e mais. Veja [`17-configuration.md`](./17-configuration.md).                          |

Falhas de I/O de configurações, como JSON malformado, fazem fallback para os padrões. `InvalidPolicyConfigError` é a exceção: configuração incorreta de política falha explicitamente na inicialização.

## 6. Cenários de recusa de inicialização (falhas explícitas)

`run-qwen-serve.ts` intencionalmente lança erros em vez de fazer fallback nestes casos:

| Scenario                                                                      | Error prefix                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bind não-loopback sem token                                                   | `Refusing to bind ... without a bearer token`                                                       |
| `--require-auth` sem token                                                    | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` não existe, não é um diretório ou não é absoluto                | `Invalid --workspace ...`                                                                           |
| Permissão negada no stat de `--workspace`                                     | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` não é um inteiro positivo                               | `Must be a positive integer`                                                                        |
| `--mcp-budget-mode=enforce` sem orçamento                                     | `requires a positive mcpClientBudget`                                                               |
| `--hostname` está escrito como `localhost:4170`                               | `looks like a "host:port" combination. Use --port`                                                 |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` é `NaN` ou negativo                                       | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | Lançado durante a construção da bridge                                                              |
| `--allow-origin '*'` sem token                                                | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` não é um inteiro positivo | `Must be a positive integer`                                                                        |
| `policy.permissionStrategy` desconhecido ou `policy.consensusQuorum` não positivo | `InvalidPolicyConfigError`                                                                          |
## 7. Checklist de verificação com Curl

```bash
# 1. Liveness
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Deep health
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Capabilities
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Preflight readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Env snapshot (secrets only report presence)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP pool / budget snapshot
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. Create a session
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. Tail SSE (replace <sid>)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Demo page
open http://127.0.0.1:4170/demo
```

Quando a autenticação bearer está habilitada, adicione `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` a cada requisição.

## 8. A página de demonstração pode ser usada?

**Sim.** Ela é implementada por `getDemoHtml(port)` em `packages/cli/src/serve/demo.ts` como um HTML autossuficiente, sem dependências externas.

| Modo de inicialização               | Onde `/demo` é registrado                                                    | Navegação direta no navegador                        |
| ----------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Loopback sem `--require-auth`       | `routes/health-demo.ts`, montado por `createServeApp()` **antes** de `bearerAuth` | Funciona sem token                                   |
| Loopback com `--require-auth`       | `routes/health-demo.ts`, montado por `createServeApp()` **depois** de `bearerAuth`  | Difícil de usar em um navegador comum; use curl ou SDK |
| Bind não-loopback                   | `routes/health-demo.ts`, montado por `createServeApp()` **depois** de `bearerAuth`  | Mesmo caso acima                                     |

A CSP é `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, além de `X-Frame-Options: DENY`. A página só pode fazer requisições para `'self'` (o daemon) e não pode carregar scripts ou estilos externos.

## 9. Cadeia de chamadas do `qwen serve` até o servidor em escuta

```text
qwen serve
   |
   v (process)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (yargs assembly)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (handler)
commands/serve.ts                  handler(argv) - boot pre-checks
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # lazy load
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- trim token
   |  |- hostname mismatch fallback
   |  |- auth preflight
   |  |- workspace validation + canonicalization
   |  |- MCP budget validation + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - builds Express app (**does not listen**)
   |  |- middleware chain (Host allowlist / CORS / bearerAuth / mutation gate / rate limit)
   |  |- route mounting (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- write "qwen serve listening on ..."
   |  |- register SIGINT / SIGTERM (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // block forever until signal
```

Pontos-chave:

- **`createServeApp` apenas constrói; ele não inicia a escuta.** Ele retorna uma instância `express()` com middlewares e rotas montadas. O chamador é responsável pelo `app.listen()`. O `server.test.ts` usa a factory dessa forma em cerca de 25 casos, então a factory intencionalmente evita gerenciar o ciclo de vida.
- **`() => actualPort` é uma closure preguiçosa (lazy).** `actualPort` é atribuído no callback do `app.listen`. O middleware `hostAllowlist` o lê sob demanda, então portas efêmeras (`--port 0`) ainda controlam o cabeçalho `Host` corretamente.
- **`await blockForever()` é intencional.** Se `yargs.parse()` for resolvido, o nível superior da CLI cai no ponto de entrada da TUI interativa (`gemini.tsx`). SIGINT / SIGTERM saem através do caminho `onSignal` do `runQwenServe`.

## 10. Divisão de arquivos de rotas HTTP

A montagem principal acontece em `createServeApp()` no `server.ts`, que conecta os middlewares e monta módulos de rotas focados:

| Rotas                                                                                          | Arquivo                                                 | Ponto de montagem                                                              |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/health`, `/demo`                                                                             | `packages/cli/src/serve/routes/health-demo.ts`          | `healthDemoRoutes.register()`                                                  |
| `/daemon/status`                                                                               | `packages/cli/src/serve/routes/daemon-status.ts`        | `registerDaemonStatusRoutes()`                                                 |
| `/capabilities`, rotas de mutação de init/ferramenta/MCP do workspace, bridge HTTP ACP         | `packages/cli/src/serve/server.ts`                      | Registrado diretamente dentro de `createServeApp()`                            |
| Status do workspace, env, preflight, resumos de MCP/ferramenta/provedor/skill                  | `packages/cli/src/serve/routes/workspace-status.ts`     | `registerWorkspaceStatusRoutes()`, `registerWorkspaceDiagnosticStatusRoutes()` |
| Extensões do workspace e operações de extensão                                                 | `packages/cli/src/serve/routes/workspace-extensions.ts` | `registerWorkspaceExtensionRoutes()`                                           |
| `/workspace/memory` (GET/POST)                                                                 | `packages/cli/src/serve/workspace-memory.ts`            | `mountWorkspaceMemoryRoutes()`                                                 |
| Todas as rotas CRUD de `/workspace/agents`                                                     | `packages/cli/src/serve/workspace-agents.ts`            | `mountWorkspaceAgentsRoutes()`                                                 |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                          | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`                                            |
| `POST /file/write`, `/file/edit`                                                               | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`                                           |
| Rotas de setup, trust, settings, permissions e voice do workspace                              | `packages/cli/src/serve/routes/workspace-*.ts`          | `registerWorkspaceSetupGithubRoutes()`, `registerWorkspaceTrustRoutes()`, etc. |
| Rotas de provedor de auth e device-flow do workspace                                           | `packages/cli/src/serve/routes/workspace-auth.ts`       | `registerWorkspaceAuthRoutes()`                                                |
| Rotas de ciclo de vida da sessão, prompt, metadados, idioma, shell, recap, rewind, branch e list | `packages/cli/src/serve/routes/session.ts`              | `registerSessionRoutes()`                                                      |
| Stream SSE `GET /session/:id/events`                                                           | `packages/cli/src/serve/routes/sse-events.ts`           | `registerSseEventsRoutes()`                                                    |
| Rotas de resposta de permissão                                                                 | `packages/cli/src/serve/routes/permission.ts`           | `registerPermissionRoutes()`                                                   |

Para a referência completa de rotas e protocolo de comunicação, consulte [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Para a arquitetura, consulte [`01-architecture.md`](./01-architecture.md).

## 11. Shutdown graceful vs hard shutdown

- **Primeiro SIGINT / SIGTERM** -> `onSignal` do `runQwenServe` -> shutdown graceful em duas fases:
  1. `bridge.shutdown()`: cada canal recebe `KILL_HARD_DEADLINE_MS` (10s), depois `channel.kill()`.
  2. `server.close()`: requisições em andamento são drenadas, `SHUTDOWN_FORCE_CLOSE_MS` (5s) aciona `closeAllConnections()`, e então um segundo prazo de 2s se aplica.
- **Segundo SIGINT / SIGTERM enquanto já está encerrando** -> `bridge.killAllSync()` envia SIGKILL síncrono para todos os filhos ACP e chama `process.exit(1)` para evitar processos órfãos.

O `RunHandle.close()` retornado pelo `runQwenServe` é o equivalente programático para embedders e testes.

## 12. Invocação embutida (bypass da CLI)

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // ephemeral
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon at ${handle.url}`);
// ... call handle.bridge directly or access handle.server
await handle.close(); // programmatic shutdown
```

Ou obtenha o app Express diretamente e inicie a escuta por conta própria:

```ts
import { createServeApp } from '@qwen-code/qwen-code/serve';

const app = createServeApp(
  {
    port: 0,
    hostname: '127.0.0.1',
    mode: 'http-bridge',
    maxSessions: 20,
  },
  () => 0,
  {
    /* deps: bridge, fsFactory, ... */
  },
);

const server = app.listen(0, '127.0.0.1', () => {
  console.log('listening on', server.address());
});
```

Nota: ao chamar `createServeApp` diretamente, o padrão é `fsFactory.trusted = false`. O `writeTextFile` do ACP no lado do agente é rejeitado como `untrusted_workspace`, e um aviso é impresso no stderr uma única vez. Injete `deps.fsFactory` com confiança explícita, injete `deps.bridge` ou aceite o comportamento padrão restrito por confiança.

## 13. Receitas de depuração

Consulte a seção de depuração em [`19-observability.md`](./19-observability.md). Os comandos comuns são:

```bash
# Is the daemon alive?
curl http://127.0.0.1:4170/health

# Which capabilities are advertised?
curl -s http://127.0.0.1:4170/capabilities | jq

# Daemon-host readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Tail live SSE
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Verbose logs
QWEN_SERVE_DEBUG=1 qwen serve
```

## Referências

- Entrada da CLI: `packages/cli/src/commands/serve.ts`
- Bootstrap: `packages/cli/src/serve/run-qwen-serve.ts`
- Factory do Express: `packages/cli/src/serve/server.ts`
- Middleware: `packages/cli/src/serve/auth.ts`
- Factory da bridge: `packages/acp-bridge/src/bridge.ts`
- HTML da página de demonstração: `packages/cli/src/serve/demo.ts`
- Docs do usuário: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Protocolo de comunicação: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)