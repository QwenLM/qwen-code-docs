# Início Rápido & Operações

Esta página foca em **como iniciar `qwen serve`, como verificar se está funcionando e como é a cadeia de chamadas internas desde `qwen serve` até o servidor em escuta**. Arquitetura, componentes e detalhes do protocolo de comunicação estão nas outras páginas de aprofundamento sobre o daemon.

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

Abra `http://127.0.0.1:4170/demo` em um navegador para ver o console de depuração: interface de chat, fluxo de eventos e inspeção do workspace. No modo padrão de desenvolvimento via loopback, `/demo` é registrado **antes** de `bearerAuth` no ramo de rota loopback de `packages/cli/src/serve/server.ts`, portanto nenhum token é necessário.

## 2. Receitas de inicialização

```bash
# 1. Padrão de desenvolvimento local (loopback, sem token)
qwen serve

# 2. Workspace explícito + porta efêmera
qwen serve --workspace /path/to/repo --port 0

# 3. Desenvolvimento loopback reforçado (força bearer mesmo em loopback)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Expor para a rede local (não loopback requer token)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Ajustar para muitas sessões e um anel de replay maior
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. Colaboração multi-cliente + orçamento MCP rigoroso
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. Iniciar com uma política de consenso configurada em settings.json
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. Log de depuração
QWEN_SERVE_DEBUG=1 qwen serve

# 9. Desabilitar o pool F2 (fallback para clientes MCP por sessão)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Permitir acesso de origens diferentes na interface web
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Prazo do prompt + timeout de inatividade SSE
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. Manter o filho ACP ativo após o fechamento da última sessão
qwen serve --channel-idle-timeout-ms 60000

# 13. Habilitar limitação de taxa HTTP
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

Com a receita de loopback reforçado (3), `/demo` é registrado após `bearerAuth`. Uma navegação normal no navegador precisa de um cabeçalho de autenticação; portanto, use curl ou um script do SDK.

## 3. Flags completas de inicialização

A CLI é definida em **`packages/cli/src/commands/serve.ts`**:

| Flag                                    | Tipo                           | Padrão                                       | Obrigatório quando                            | Efeito                                                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | número                         | `4170`                                       | -                                        | Porta TCP; `0` significa porta efêmera atribuída pelo SO.                                                                                                                                                              |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | Não loopback requer token              | Endereço de bind. Valores loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Os colchetes `[::1]` são removidos automaticamente; entrada `host:porta` é rejeitada com orientação para usar `--port`.                    |
| `--token <s>`                           | string                         | env / nenhum                                 | Não loopback e `--require-auth`        | Token bearer; cortado uma vez. **Aparece em `/proc/<pid>/cmdline`, então prefira `QWEN_SERVER_TOKEN`**. O stderr da inicialização também avisa sobre isso.                                                              |
| `--max-sessions <n>`                    | número                         | `20`                                         | -                                        | Limite de sessões ativas. Excesso retorna 503. `0` significa ilimitado. `NaN` / negativos geram erro.                                                                                                                  |
| `--max-pending-prompts-per-session <n>` | número                         | `5`                                          | -                                        | Limite de prompts pendentes/em execução por sessão. Excesso retorna 503. `0` / `Infinity` significa ilimitado. Valores negativos ou não inteiros geram erro.                                                           |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | Workspace vinculado. **Deve ser um caminho absoluto, deve existir e deve ser um diretório**. A inicialização o canonicaliza uma vez via `canonicalizeWorkspace`. `POST /session` com `cwd` diferente retorna `400 workspace_mismatch`. |
| `--max-connections <n>`                 | número                         | `256`                                        | -                                        | `server.maxConnections` no nível do listener. `0` / `Infinity` significa ilimitado. `NaN` / negativos impedem a inicialização para evitar comportamento de falha aberta.                                               |
| `--require-auth`                        | booleano                       | `false`                                      | Token obrigatório                       | Estende a autenticação bearer para loopback **e** `/health`. A inicialização se recusa a iniciar sem token.                                                                                                            |
| `--enable-session-shell`                | booleano                       | `false`                                      | Token obrigatório                       | Habilita a execução direta via `POST /session/:id/shell`. Chamadores também devem enviar um `X-Qwen-Client-Id` vinculado à sessão.                                                                                     |
| `--event-ring-size <n>`                 | número                         | `8000`                                       | -                                        | Profundidade do anel de replay SSE por sessão. Limite máximo é `MAX_EVENT_RING_SIZE = 1_000_000`; valores fora da faixa geram erro durante a construção da bridge.                                                     |
| `--http-bridge`                         | booleano                       | `true`                                       | -                                        | Modo bridge do estágio 1: um filho `qwen --acp` multiplexado pelo daemon. O modo em processo do estágio 2 ainda não foi implementado; `--no-http-bridge` faz fallback e imprime no stderr.                              |
| `--mcp-client-budget <n>`               | número                         | nenhum                                       | Obrigatório para `mcp-budget-mode=enforce`   | Limite de clientes MCP do workspace. Deve ser um inteiro positivo.                                                                                                                                                     |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | `warn` quando um orçamento é definido, senão `off` | `enforce` requer `--mcp-client-budget` | `enforce` recusa, `warn` apenas avisa em 75%, `off` é apenas observação.                                                                                                                                                |
| `--allow-origin <pattern>`              | string repetível               | nenhum                                       | -                                        | Lista de permissões CORS que substitui a negação de origem padrão. `*` requer um token.                                                                                                                                 |
| `--allow-private-auth-base-url`         | booleano                       | `false`                                      | -                                        | Permite instalação de `baseUrl` do provedor de autenticação em localhost/rede privada. Use apenas para desenvolvimento local confiável.                                                                                 |
| `--prompt-deadline-ms <n>`              | número                         | nenhum                                       | -                                        | Limite de tempo de parede do prompt no lado do servidor em ms; timeout aborta o prompt.                                                                                                                                 |
| `--writer-idle-timeout-ms <n>`          | número                         | nenhum                                       | -                                        | Timeout de inatividade por conexão SSE em ms.                                                                                                                                                                          |
| `--channel-idle-timeout-ms <n>`         | número                         | `0`                                          | -                                        | Mantém o filho ACP ativo após o fechamento da última sessão. `0` significa liberar imediatamente.                                                                                                                       |
| `--session-reap-interval-ms <n>`        | número                         | `60000`                                      | -                                        | Intervalo de varredura do coletor de sessões. `0` desabilita.                                                                                                                                                          |
| `--session-idle-timeout-ms <n>`         | número                         | `1800000`                                    | -                                        | Timeout de inatividade de sessão desconectada. `0` desabilita.                                                                                                                                                         |
| `--rate-limit` / `--no-rate-limit`      | booleano                       | env / desligado                              | -                                        | Habilita ou desabilita a limitação de taxa HTTP por nível.                                                                                                                                                             |
| `--rate-limit-prompt <n>`               | número                         | `10`                                         | `--rate-limit`                           | Requisições de prompt por janela.                                                                                                                                                                                       |
| `--rate-limit-mutation <n>`             | número                         | `30`                                         | `--rate-limit`                           | Requisições de mutação por janela.                                                                                                                                                                                      |
| `--rate-limit-read <n>`                 | número                         | `120`                                        | `--rate-limit`                           | Requisições de leitura por janela.                                                                                                                                                                                      |
| `--rate-limit-window-ms <n>`            | número                         | `60000`                                      | `--rate-limit`                           | Duração da janela de limitação de taxa; deve ser `>= 1000`.                                                                                                                                                            |

## 4. Variáveis de ambiente

| Env                                 | Flag/efeito equivalente                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | Equivalente a `--token`; `--token` vence. Cortada uma vez na inicialização para evitar uma nova linha ao final de `cat token.txt`.                                         |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (case-insensitive) habilita logs verbose no stderr.                                                                                             |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` desabilita completamente o pool MCP do workspace e faz fallback para `McpClientManager` por sessão. Recursos param de anunciar `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | Entrada de orçamento interno do filho ACP. A CLI o gera a partir de `--mcp-client-budget` via `childEnvOverrides`; não é um fallback de env do processo pai.                  |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | Modo de orçamento interno do filho ACP. A CLI o gera a partir de `--mcp-budget-mode` via `childEnvOverrides`; não é um fallback de env do processo pai.                     |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Fallback de env para `--prompt-deadline-ms`.                                                                                                                                |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Fallback de env para `--writer-idle-timeout-ms`.                                                                                                                            |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | Lido pelo filho ACP. Lista de permissões de transportes poolados separada por vírgulas; padrão é `stdio,websocket`.                                                           |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | Lido pelo filho ACP. Atraso de drenagem por inatividade de entrada no pool; padrão é `30000`, limitado a `1000..600000` ms.                                                  |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` habilita limitação de taxa; a flag da CLI vence.                                                                                                              |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Fallback de env para `--rate-limit-prompt`.                                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Fallback de env para `--rate-limit-mutation`.                                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Fallback de env para `--rate-limit-read`.                                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Fallback de env para `--rate-limit-window-ms`.                                                                                                                              |

As substituições de env por handle são intencionais: dois daemons executando no mesmo processo não competem por `process.env`. `defaultSpawnChannelFactory` captura o env no momento do spawn.

## 5. `settings.json` também é lido

A inicialização chama `loadSettings(boundWorkspace)` uma vez:

| Chave                        | Tipo                                                               | Comportamento                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Define `BridgeOptions.permissionPolicy`. **A inicialização valida com `validatePolicyConfig`**; valores desconhecidos lançam `InvalidPolicyConfigError` em vez de fallback silencioso. |
| `policy.consensusQuorum`    | inteiro positivo                                                   | N para a política de `consensus`. Padrão é `floor(M/2)+1`. Se definido sob uma política que não é de consenso, é ignorado e a inicialização registra um aviso no stderr.                              |
| `context.fileName`          | string                                                             | Substitui `getCurrentGeminiMdFilename()` e controla qual arquivo `POST /workspace/init` escreve.                                                                          |
| `tools.disabled`            | string[]                                                           | Normalizado através de `normalizeDisabledToolList()` (trim, remover entradas vazias, deduplicar) antes de afetar o próximo spawn do filho ACP.                                           |
| `tools.approvalMode`        | string                                                             | Modo de aprovação padrão da sessão.                                                                                                                                           |
| `telemetry`                 | object                                                             | Configuração OTel: `enabled`, `otlpEndpoint`, `otlpProtocol`, endpoints por sinal e mais. Veja [`17-configuration.md`](./17-configuration.md).                       |

Falha de I/O nas configurações, como JSON malformado, usa valores padrão. `InvalidPolicyConfigError` é a exceção: configuração incorreta de política falha a inicialização explicitamente.

## 6. Cenários de recusa de inicialização (falhas explícitas)

`run-qwen-serve.ts` lança intencionalmente em vez de fazer fallback nestes casos:

| Cenário                                                                      | Prefixo do erro                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bind não loopback sem token                                               | `Refusing to bind ... without a bearer token`                                                       |
| `--require-auth` sem token                                                | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` não existe, não é um diretório ou não é absoluto            | `Invalid --workspace ...`                                                                           |
| Permissão negada no stat de `--workspace`                                 | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` não é um inteiro positivo                           | `Must be a positive integer`                                                                        |
| `--mcp-budget-mode=enforce` sem orçamento                                | `requires a positive mcpClientBudget`                                                               |
| `--hostname` está escrito como `localhost:4170`                           | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                   | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` é `NaN` ou negativo                                   | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                           | Lançado durante a construção da bridge                                                                   |
| `--allow-origin '*'` sem token                                            | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` não é inteiro positivo | `Must be a positive integer`                                                                        |
| `policy.permissionStrategy` desconhecido ou `policy.consensusQuorum` não positivo | `InvalidPolicyConfigError`                                                                          |
## 7. Lista de verificação de verificação com Curl

```bash
# 1. Liveness
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Deep health
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Capacidades
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Preflight readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Snapshot de ambiente (secrets apenas reportam presença)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. Pool / budget do MCP
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. Criar uma sessão
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. Tail SSE (substituir <sid>)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Página de demonstração
open http://127.0.0.1:4170/demo
```

Quando a autenticação bearer estiver habilitada, adicione `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` a cada requisição.

## 8. A página de demonstração pode ser usada?

**Sim.** Ela é implementada por `getDemoHtml(port)` em `packages/cli/src/serve/demo.ts` como HTML autocontido, sem dependência externa.

| Modo de inicialização           | Onde `/demo` é registrada                                          | Navegação direta pelo navegador                             |
| -------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| Loopback sem `--require-auth`   | Ramo de rota de pré-autorização loopback em `server.ts`, **antes** de `bearerAuth` | Funciona sem token                                          |
| Loopback com `--require-auth`   | Ramo de rota pós-autorização em `server.ts`, **após** `bearerAuth` | Difícil de usar em um navegador comum; use curl ou SDK      |
| Bind não-loopback               | Ramo de rota pós-autorização em `server.ts`, **após** `bearerAuth` | Igual ao anterior                                           |

CSP é `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, mais `X-Frame-Options: DENY`. A página só pode buscar em `'self'` (o daemon) e não pode carregar scripts ou estilos externos.

## 9. Cadeia de chamadas de `qwen serve` até o servidor em escuta

```text
qwen serve
   |
   v (processo)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (montagem yargs)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (handler)
commands/serve.ts                  handler(argv) - verificações preliminares de boot
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # lazy load
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- trim token
   |  |- hostname mismatch fallback
   |  |- auth preflight
   |  |- validação do workspace + canonicalização
   |  |- validação do budget MCP + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - constrói a aplicação Express (**não escuta**)
   |  |- cadeia de middlewares (Host allowlist / CORS / bearerAuth / mutation gate / rate limit)
   |  |- montagem de rotas (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- escreve "qwen serve listening on ..."
   |  |- registra SIGINT / SIGTERM (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // bloqueia para sempre até receber sinal
```

Fatos importantes:

- **`createServeApp` apenas constrói; não escuta.** Ela retorna uma instância `express()` com middlewares e rotas montadas. O chamador é responsável por `app.listen()`. O `server.test.ts` usa a factory assim em aproximadamente 25 casos, então a factory intencionalmente não gerencia o ciclo de vida.
- **`() => actualPort` é uma closure lazy.** `actualPort` é atribuída no callback de `app.listen`. O middleware `hostAllowlist` lê o valor sob demanda, portanto portas efêmeras (`--port 0`) ainda limitam corretamente o cabeçalho `Host`.
- **`await blockForever()` é intencional.** Se `yargs.parse()` resolver, o nível superior da CLI cai no ponto de entrada TUI interativa (`gemini.tsx`). SIGINT/SIGTERM saem pelo caminho `onSignal` do `runQwenServe`.

## 10. Divisão dos arquivos de rota HTTP

A montagem principal ocorre em `createServeApp()` em `server.ts`, que monta quatro arquivos de rota modulares:

| Rotas                                                                                                                    | Arquivo                                                | Ponto de montagem                               |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `/health`, `/demo`, `/capabilities`, todas as rotas de sessão, device flow, permission vote, SSE e restart MCP single-server | `packages/cli/src/serve/server.ts`                     | Registradas diretamente dentro de `createServeApp()` |
| `/workspace/memory` (GET/POST)                                                                                            | `packages/cli/src/serve/workspace-memory.ts`           | `mountWorkspaceMemoryRoutes()`                  |
| Todas as rotas CRUD de `/workspace/agents`                                                                                | `packages/cli/src/serve/workspace-agents.ts`           | `mountWorkspaceAgentsRoutes()`                  |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                                                     | `packages/cli/src/serve/routes/workspace-file-read.ts` | `registerWorkspaceFileReadRoutes()`             |
| `POST /file/write`, `/file/edit`                                                                                          | `packages/cli/src/serve/routes/workspace-file-write.ts`| `registerWorkspaceFileWriteRoutes()`            |

Para referência completa do protocolo de rotas e wire, veja [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Para arquitetura, veja [`01-architecture.md`](./01-architecture.md).

## 11. Desligamento gracioso vs forçado

- **Primeiro SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> desligamento gracioso em duas fases:
  1. `bridge.shutdown()`: cada canal recebe `KILL_HARD_DEADLINE_MS` (10s), depois `channel.kill()`.
  2. `server.close()`: requisições em andamento são drenadas, `SHUTDOWN_FORCE_CLOSE_MS` (5s) dispara `closeAllConnections()`, e então um segundo prazo de 2s se aplica.
- **Segundo SIGINT / SIGTERM enquanto já está saindo** -> `bridge.killAllSync()` envia SIGKILL sincronamente a todos os filhos ACP e chama `process.exit(1)` para evitar processos órfãos.

`RunHandle.close()` retornado por `runQwenServe` é o equivalente programático para embutidores e testes.

## 12. Invocação embutida (pulando a CLI)

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // efêmera
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon em ${handle.url}`);
// ... chame handle.bridge diretamente ou acesse handle.server
await handle.close(); // desligamento programático
```

Ou pegue a aplicação Express diretamente e escute você mesmo:

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
  console.log('escutando em', server.address());
});
```

Nota: ao chamar `createServeApp` diretamente, o padrão de `fsFactory.trusted = false`. As chamadas ACP do lado do agente para `writeTextFile` são rejeitadas como `untrusted_workspace`, e um aviso é emitido no stderr uma vez. Injete `deps.fsFactory` com confiança explícita, injete `deps.bridge`, ou aceite o comportamento padrão limitado por confiança.

## 13. Receitas de depuração

Veja a seção de depuração em [`19-observability.md`](./19-observability.md). Os comandos comuns são:

```bash
# O daemon está ativo?
curl http://127.0.0.1:4170/health

# Quais capacidades são anunciadas?
curl -s http://127.0.0.1:4170/capabilities | jq

# Prontidão do daemon-host
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Acompanhar SSE ao vivo
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Logs verbosos
QWEN_SERVE_DEBUG=1 qwen serve
```

## Referências

- Entrada da CLI: `packages/cli/src/commands/serve.ts`
- Bootstrap: `packages/cli/src/serve/run-qwen-serve.ts`
- Factory Express: `packages/cli/src/serve/server.ts`
- Middleware: `packages/cli/src/serve/auth.ts`
- Factory de Bridge: `packages/acp-bridge/src/bridge.ts`
- HTML da página de demonstração: `packages/cli/src/serve/demo.ts`
- Documentação do usuário: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Protocolo wire: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)