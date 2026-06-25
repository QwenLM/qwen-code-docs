# Quickstart & Operações

Esta página foca em **como iniciar `qwen serve`, como verificar se está funcionando, e como é a cadeia de chamadas internas desde `qwen serve` até o servidor em escuta**. Detalhes de arquitetura, componentes e protocolo de transporte estão nas outras páginas de mergulho profundo do daemon.

## 1. Caminho mais curto

```bash
qwen serve
```

Output:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Abra `http://127.0.0.1:4170/demo` em um navegador para ver o console de depuração: chat UI, stream de eventos e inspeção do workspace. No modo loopback padrão de desenvolvimento, `/demo` é registrado **antes** de `bearerAuth` no ramo de rota loopback de `packages/cli/src/serve/server.ts`, então nenhum token é necessário.

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

Com a receita de loopback protegida (3), `/demo` é registrado após `bearerAuth`. Uma navegação normal do navegador precisa de um cabeçalho de autenticação, então use curl ou um script SDK.

## 3. Flags completas de inicialização

A CLI está definida em **`packages/cli/src/commands/serve.ts`**:

| Flag                                    | Tipo                           | Padrão                                       | Obrigatório quando                       | Efeito                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                        | Porta TCP; `0` significa porta efêmera atribuída pelo SO.                                                                                                                                                                       |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | Loopback não requer token              | Endereço de bind. Valores loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Colchetes em `[::1]` são removidos automaticamente; entrada `host:port` é rejeitada com orientação para usar `--port`.                                    |
| `--token <s>`                           | string                         | env / nenhum                                   | Loopback não e `--require-auth`        | Token Bearer; aparado uma vez. **Aparece em `/proc/<pid>/cmdline`, então prefira `QWEN_SERVER_TOKEN`**. O boot também avisa sobre isso no stderr.                                                                                |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                        | Limite de sessões ativas. Excesso retorna 503. `0` significa ilimitado. Valores `NaN` / negativos lançam erro.                                                                                                                     |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                        | Limite de prompts aceitos mas pendentes/em execução por sessão. Excesso retorna 503. `0` / `Infinity` significa ilimitado. Valores negativos ou não inteiros lançam erro.                                                               |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | Workspace vinculado. **Deve ser um caminho absoluto, deve existir e deve ser um diretório**. O boot o canonicaliza uma vez via `canonicalizeWorkspace`. `POST /session` com `cwd` incompatível retorna `400 workspace_mismatch`. |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                        | `server.maxConnections` no nível do listener. `0` / `Infinity` significa ilimitado. `NaN` / negativos falham no boot para evitar comportamento de falha aberta.                                                                              |
| `--require-auth`                        | boolean                        | `false`                                      | Token necessário                           | Estende a autenticação bearer para loopback **e** `/health`. O boot recusa iniciar sem um token.                                                                                                                             |
| `--enable-session-shell`                | boolean                        | `false`                                      | Token necessário                           | Habilita execução direta via `POST /session/:id/shell`. Chamadores também devem enviar um `X-Qwen-Client-Id` vinculado à sessão.                                                                                                        |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                        | Profundidade do ring de replay SSE por sessão. Limite suave é `MAX_EVENT_RING_SIZE = 1_000_000`; valores fora da faixa lançam erro durante a construção da ponte.                                                                               |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                        | Modo ponte Estágio 1: um filho `qwen --acp` multiplexado pelo daemon. Modo em processo Estágio 2 ainda não implementado; `--no-http-bridge` recai e imprime no stderr.                                            |
| `--mcp-client-budget <n>`               | number                         | nenhum                                         | Obrigatório para `mcp-budget-mode=enforce`   | Limite de clientes MCP do workspace. Deve ser um inteiro positivo.                                                                                                                                                                 |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | `warn` quando um orçamento é definido, senão `off` | `enforce` requer `--mcp-client-budget` | `enforce` recusa, `warn` apenas avisa em 75%, `off` é apenas observação.                                                                                                                                               |
| `--allow-origin <pattern>`              | string repetível              | nenhum                                         | -                                        | Lista de permissões CORS que substitui a negação padrão de Origin. `*` requer um token.                                                                                                                                         |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                        | Permite instalação de provedor de autenticação `baseUrl` localhost / rede privada. Use apenas para desenvolvimento local confiável.                                                                                                      |
| `--prompt-deadline-ms <n>`              | number                         | nenhum                                         | -                                        | Limite de tempo de prompt do lado do servidor em ms; timeout aborta o prompt.                                                                                                                                                  |
| `--writer-idle-timeout-ms <n>`          | number                         | nenhum                                         | -                                        | Timeout de ociosidade por conexão SSE em ms.                                                                                                                                                                                |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                        | Mantém o filho ACP ativo após a última sessão fechar. `0` significa reclamar imediatamente.                                                                                                                               |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                        | Intervalo de varredura do coletor de sessões. `0` desabilita.                                                                                                                                                                        |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                        | Timeout de ociosidade de sessão desconectada. `0` desabilita.                                                                                                                                                                   |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / off                                    | -                                        | Habilita ou desabilita limitação de taxa HTTP por camada.                                                                                                                                                                      |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                           | Requisições de prompt por janela.                                                                                                                                                                                           |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                           | Requisições de mutação por janela.                                                                                                                                                                                         |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                           | Requisições de leitura por janela.                                                                                                                                                                                             |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                           | Duração da janela de limitação de taxa; deve ser `>= 1000`.                                                                                                                                                                          |
## 4. Variáveis de ambiente

| Variável de ambiente                 | Flag / efeito equivalente                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                  | Equivalente a `--token`; `--token` tem prioridade. Ajustada uma vez na inicialização para evitar uma nova linha no final proveniente de `cat token.txt`.                |
| `QWEN_SERVE_DEBUG`                   | `1` / `true` / `on` / `yes` (insensível a maiúsculas/minúsculas) ativa logs verbosos em stderr.                                                                        |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` desativa completamente o pool MCP do workspace e recorre ao `McpClientManager` por sessão. As capacidades deixam de anunciar `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | Orçamento interno do filho ACP. A CLI o gera a partir de `--mcp-client-budget` via `childEnvOverrides`; não é um fallback de variável de ambiente do processo pai.       |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | Modo de orçamento interno do filho ACP. A CLI o gera a partir de `--mcp-budget-mode` via `childEnvOverrides`; não é um fallback de variável de ambiente do processo pai.  |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Fallback de variável de ambiente para `--prompt-deadline-ms`.                                                                                                            |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Fallback de variável de ambiente para `--writer-idle-timeout-ms`.                                                                                                        |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | Lido pelo filho ACP. Lista de transportes permitidos do pool, separados por vírgulas; o padrão é `stdio,websocket`.                                                       |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | Lido pelo filho ACP. Atraso de drenagem ociosa de entradas do pool; o padrão é `30000`, limitado a `1000..600000` ms.                                                     |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` ativa limitação de taxa; a flag da CLI tem prioridade.                                                                                                      |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Fallback de variável de ambiente para `--rate-limit-prompt`.                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Fallback de variável de ambiente para `--rate-limit-mutation`.                                                                                                           |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Fallback de variável de ambiente para `--rate-limit-read`.                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Fallback de variável de ambiente para `--rate-limit-window-ms`.                                                                                                          |

As substituições de variáveis de ambiente por handle são intencionais: dois daemons executando no mesmo processo não competem por `process.env`. O `defaultSpawnChannelFactory` captura o ambiente no momento da criação do processo filho.

## 5. `settings.json` também é lido

A inicialização chama `loadSettings(boundWorkspace)` uma vez:

| Chave                        | Tipo                                                               | Comportamento                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy`  | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Define `BridgeOptions.permissionPolicy`. **A inicialização valida com `validatePolicyConfig`**; valores desconhecidos lançam `InvalidPolicyConfigError` em vez de cair em fallback silenciosamente. |
| `policy.consensusQuorum`     | inteiro positivo                                                    | N para a política `consensus`. O padrão é `floor(M/2)+1`. Se definido em uma política diferente de consenso, é ignorado e a inicialização registra um aviso em stderr.     |
| `context.fileName`           | string                                                             | Substitui `getCurrentGeminiMdFilename()` e controla qual arquivo `POST /workspace/init` escreve.                                                                         |
| `tools.disabled`             | string[]                                                           | Normalizado através de `normalizeDisabledToolList()` (remover espaços, descartar entradas vazias, deduplicar) antes de afetar a próxima criação de filho ACP.              |
| `tools.approvalMode`         | string                                                             | Modo de aprovação padrão da sessão.                                                                                                                                      |
| `telemetry`                  | object                                                             | Configuração OTel: `enabled`, `otlpEndpoint`, `otlpProtocol`, endpoints por sinal e mais. Veja [`17-configuration.md`](./17-configuration.md).                            |
Falha de I/O das configurações, como JSON malformado, recai para os padrões. `InvalidPolicyConfigError` é a exceção: configuração incorreta de política impede a inicialização explicitamente.

## 6. Cenários de recusa de inicialização (falhas explícitas)

`run-qwen-serve.ts` intencionalmente lança exceções em vez de usar fallback nestes casos:

| Cenário                                                                                   | Prefixo do erro                                                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Bind não loopback sem token                                                               | `Refusing to bind ... without a bearer token`                                                          |
| `--require-auth` sem token                                                                | `Refusing to start with --require-auth set but no bearer token`                                        |
| `--workspace` não existe, não é um diretório ou não é absoluto                            | `Invalid --workspace ...`                                                                              |
| Permissão negada ao executar stat em `--workspace`                                        | `Invalid --workspace ...: permission denied`                                                           |
| `--mcp-client-budget` não é um inteiro positivo                                           | `Must be a positive integer`                                                                           |
| `--mcp-budget-mode=enforce` sem orçamento definido                                        | `requires a positive mcpClientBudget`                                                                  |
| `--hostname` escrito como `localhost:4170`                                                | `looks like a "host:port" combination. Use --port`                                                     |
| `--hostname [::1]:8080`                                                                   | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form`    |
| `--max-connections` é `NaN` ou negativo                                                   | `Must be >= 0`                                                                                         |
| `--event-ring-size > 1_000_000`                                                           | Lançado durante a construção da bridge                                                                 |
| `--allow-origin '*'` sem token                                                            | `Refusing to start with --allow-origin '*' but no bearer token configured`                             |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` não é um inteiro positivo             | `Must be a positive integer`                                                                           |
| `policy.permissionStrategy` desconhecido ou `policy.consensusQuorum` não positivo         | `InvalidPolicyConfigError`                                                                             |

## 7. Lista de verificação com curl

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

Quando a autenticação bearer está habilitada, adicione `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` a toda requisição.

## 8. A página de demonstração pode ser usada?

**Sim.** É implementada por `getDemoHtml(port)` em `packages/cli/src/serve/demo.ts` como HTML autocontido, sem dependência externa.

| Modo de inicialização                            | Onde `/demo` é registrado                                                        | Navegação direta no navegador                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Loopback sem `--require-auth`                    | Ramo de rota de pré-autenticação loopback em `server.ts`, **antes** de `bearerAuth` | Funciona sem token                                                |
| Loopback com `--require-auth`                    | Ramo de rota pós-autenticação em `server.ts`, **após** `bearerAuth`              | Difícil de usar em um navegador comum; use curl ou SDK            |
| Bind não loopback                                | Ramo de rota pós-autenticação em `server.ts`, **após** `bearerAuth`              | O mesmo que acima                                                 |
CSP é `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, mais `X-Frame-Options: DENY`. A página só pode buscar `'self'` (o daemon) e não pode carregar scripts ou estilos externos.

## 9. Cadeia de chamadas de `qwen serve` até o servidor ouvinte

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
commands/serve.ts                  handler(argv) - pré-verificações de inicialização
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # carregamento tardio
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- cortar token
   |  |- fallback de incompatibilidade de hostname
   |  |- pré-verificação de autenticação
   |  |- validação + canonicalização do workspace
   |  |- validação do orçamento MCP + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - constrói o app Express (**não escuta**)
   |  |- cadeia de middlewares (lista de hosts permitidos / CORS / bearerAuth / mutationGate / limite de taxa)
   |  |- montagem de rotas (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- escreve "qwen serve ouvindo em ..."
   |  |- registra SIGINT / SIGTERM (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // bloqueia para sempre até sinal
```

Fatos importantes:

- **`createServeApp` apenas constrói; não escuta.** Ela retorna uma instância de `express()` com middlewares e rotas montados. O chamador é dono do `app.listen()`. `server.test.ts` usa a fábrica dessa forma em cerca de 25 casos, então a fábrica intencionalmente não gerencia o ciclo de vida.
- **`() => actualPort` é uma closure preguiçosa.** `actualPort` é atribuída no callback de `app.listen`. O middleware `hostAllowlist` a lê sob demanda, para que portas efêmeras (`--port 0`) ainda bloqueiem o cabeçalho `Host` corretamente.
- **`await blockForever()` é intencional.** Se `yargs.parse()` resolver, o topo da CLI cai no ponto de entrada do TUI interativo (`gemini.tsx`). SIGINT / SIGTERM saem pelo caminho `onSignal` do `runQwenServe`.

## 10. Divisão dos arquivos de rota HTTP

A montagem principal acontece em `createServeApp()` em `server.ts`, que monta quatro arquivos de rota modulares:

| Rotas                                                                                                                      | Arquivo                                                | Ponto de montagem                               |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `/health`, `/demo`, `/capabilities`, todas as rotas de sessão, fluxo de dispositivo, voto de permissão, SSE e reinicialização MCP em servidor único | `packages/cli/src/serve/server.ts`                     | Registradas diretamente dentro de `createServeApp()` |
| `/workspace/memory` (GET/POST)                                                                                             | `packages/cli/src/serve/workspace-memory.ts`           | `mountWorkspaceMemoryRoutes()`                  |
| Todas as rotas CRUD de `/workspace/agents`                                                                                 | `packages/cli/src/serve/workspace-agents.ts`           | `mountWorkspaceAgentsRoutes()`                  |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                                                      | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`             |
| `POST /file/write`, `/file/edit`                                                                                           | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`            |

Para a referência completa de rotas e protocolo de rede, veja [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Para arquitetura, veja [`01-architecture.md`](./01-architecture.md).

## 11. Desligamento gracioso vs. forçado

- **Primeiro SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> desligamento gracioso em duas fases:
  1. `bridge.shutdown()`: cada canal recebe `KILL_HARD_DEADLINE_MS` (10s), depois `channel.kill()`.
  2. `server.close()`: as requisições em andamento são drenadas, `SHUTDOWN_FORCE_CLOSE_MS` (5s) dispara `closeAllConnections()`, depois é aplicado um segundo prazo de 2s.
- **Segundo SIGINT / SIGTERM enquanto já está saindo** -> `bridge.killAllSync()` sincronamente envia SIGKILL para todos os filhos ACP e chama `process.exit(1)` para evitar processos órfãos.
`RunHandle.close()` retornado por `runQwenServe` é o equivalente programático para embutidores e testes.

## 12. Invocação embutida (ignorando a CLI)

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // efêmero
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon at ${handle.url}`);
// ... chame handle.bridge diretamente ou acesse handle.server
await handle.close(); // desligamento programático
```

Ou obtenha o app Express diretamente e escute você mesmo:

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

Nota: ao chamar `createServeApp` diretamente, o padrão `fsFactory.trusted = false`. O `writeTextFile` ACP do lado do agente é rejeitado como `untrusted_workspace`, e um aviso é exibido uma vez no stderr. Injete `deps.fsFactory` com confiança explícita, injete `deps.bridge`, ou aceite o comportamento padrão restrito por confiança.

## 13. Receitas de depuração

Veja a seção de depuração em [`19-observability.md`](./19-observability.md). Os comandos comuns são:

```bash
# O daemon está vivo?
curl http://127.0.0.1:4170/health

# Quais capacidades estão sendo anunciadas?
curl -s http://127.0.0.1:4170/capabilities | jq

# Prontidão do daemon-host
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Visualizar SSE ao vivo
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Logs detalhados
QWEN_SERVE_DEBUG=1 qwen serve
```

## Referências

- Ponto de entrada da CLI: `packages/cli/src/commands/serve.ts`
- Bootstrap: `packages/cli/src/serve/run-qwen-serve.ts`
- Fábrica Express: `packages/cli/src/serve/server.ts`
- Middleware: `packages/cli/src/serve/auth.ts`
- Fábrica Bridge: `packages/acp-bridge/src/bridge.ts`
- HTML da página de demonstração: `packages/cli/src/serve/demo.ts`
- Documentação do usuário: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Protocolo de comunicação: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
