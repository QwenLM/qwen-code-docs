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

Abra `http://127.0.0.1:4170/` em um navegador para obter a UI do Web Shell: chat, lista de sessões e inspeção de workspace. `createServeApp()` monta os assets do Web Shell empacotados (`packages/cli/src/serve/web-shell-static.ts`) **antes** de `bearerAuth`, então o shell carrega sem token; suas próprias chamadas de API carregam o bearer quando um está configurado — inicie o daemon com `--open` (que coloca o token no fragmento da URL, nunca enviado ao servidor) ou adicione `#token=…` manualmente quando a autenticação estiver habilitada. `--no-web` desativa e deixa o daemon apenas com API.

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

Com a receita de loopback reforçado (3), `/health` é registrado após `bearerAuth`, então as sondas devem carregar o token como qualquer outra rota de API (a superfície estática do Web Shell permanece pré-auth por design; use `--no-web` para um daemon apenas com API).

## 3. Flags de inicialização completas

A CLI é definida em **`packages/cli/src/commands/serve.ts`**:

| Flag                                    | Type                           | Default                                          | Required when                            | Effect                                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | ------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                           | -                                        | Porta TCP; `0` significa porta efêmera atribuída pelo SO.                                                                                                                                                                                                                                                             |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                      | Non-loopback requires token              | Endereço de bind. Valores de loopback: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Os colchetes de `[::1]` são removidos automaticamente; a entrada `host:port` é rejeitada com orientação para usar `--port`.                                                                                                          |
| `--token <s>`                           | string                         | env / none                                       | Non-loopback and `--require-auth`        | Token Bearer; aparado uma vez. **Ele aparece em `/proc/<pid>/cmdline`, então prefira `QWEN_SERVER_TOKEN`**. O stderr de inicialização também avisa sobre isso.                                                                                                                                                         |
| `--max-sessions <n>`                    | number                         | `32`                                             | -                                        | Limite de sessões ativas por workspace. Spawn em excesso retorna 503. `0` significa ilimitado. Valores `NaN` / negativos lançam erro.                                                                                                                                                                                  |
| `--max-total-sessions <n>`              | number                         | derivado para múltiplos workspaces na inicialização/restaurados | -                       | Limite de sessões ativas em todo o daemon. Quando omitido, um padrão finito é derivado uma vez do limite por workspace e da contagem de workspaces na inicialização/restaurados; o registro dinâmico não o recalcula. `0` significa ilimitado.                                                                          |
| `--memory-budget-mb <n>`                | integer em `[1024, 1048576]`   | 50% da memória do cgroup/host                    | -                                        | Orçamento total de memória para a árvore de processos do daemon, limitado à memória disponível resolvida. Nenhum filho é dimensionado a partir dele; o único consumidor hoje é o pool adaptativo de crescimento de live journal (veja `--max-journal-bytes`). Reportado em `limits.memory`, incluindo uma partição modelada por filho. |
| `--max-journal-events <n>`              | inteiro positivo seguro          | `10000`                                          | -                                        | Limite base por sessão de entradas de replay `liveJournal` em andamento. O crescimento adaptativo pode elevá-lo (veja `--max-journal-bytes`); fixar qualquer flag de journal desativa o crescimento.                                                                                                                                                                    |
| `--max-journal-bytes <n>`               | inteiro positivo seguro          | `8388608`                                        | -                                        | Limite base por sessão em bytes do `liveJournal` em andamento. Brechas aumentam os limites sob demanda (até o dobro, limitado pela folga restante do pool) dentro de um pool único do daemon de 5% do `--memory-budget-mb` efetivo (limitado a `1024` MB; 0 — crescimento desativado — quando o orçamento efetivo cai abaixo do mínimo de 1024 MB), nunca além de um limite rígido de 256 MiB por sessão; fixar qualquer flag de journal desativa o crescimento. |
| `--memory-pressure-mode <mode>`         | `off` \| `observe`             | `observe`                                        | Somente observação                       | Reporta `runtime.memory.pressure` em ambos os modos; apenas `observe` levanta o issue `daemon_memory_pressure`. Apenas o processo raiz.                                                                                                                                                                                         |
| `--child-heap-mode <mode>`              | `off` \| `observe`             | `observe`                                        | Somente observação                       | Sob `observe`, reporta a partição modelada em `limits.memory.childHeap`; não aplica nada e não recusa nada. Sob `off`, os dois valores desse bloco são `null`.                                                                                                                                                |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                              | -                                        | Limite de prompts aceitos, mas pendentes/em execução por sessão. Prompt em excesso retorna 503. `0` / `Infinity` significa ilimitado. Valores negativos ou não inteiros lançam erro.                                                                                                                                   |
| `--workspace <dir>`                     | string / repetível             | `process.cwd()`                                  | -                                        | Runtime de workspace na inicialização; repita para registrar runtimes isolados adicionais. O primeiro é o primário. Cada valor **deve ser um caminho absoluto, deve existir e deve ser um diretório**. A inicialização canoniza cada valor via `canonicalizeWorkspace`. `POST /session` com um `cwd` incompatível retorna `400 workspace_mismatch`.                                   |
| `--max-connections <n>`                 | number                         | `256`                                            | -                                        | `server.maxConnections` no nível do listener. `0` / `Infinity` significa ilimitado. Valores `NaN` / negativos falham na inicialização para evitar comportamento fail-open.                                                                                                                                            |
| `--require-auth`                        | boolean                        | `false`                                          | Token required                           | Estende a autenticação bearer para loopback **e** `/health`. A inicialização recusa iniciar sem um token.                                                                                                                                                                                                              |
| `--enable-session-shell`                | boolean                        | `false`                                          | Token required                           | Habilita a execução direta de `POST /session/:id/shell`. Os chamadores também devem enviar um `X-Qwen-Client-Id` vinculado à sessão.                                                                                                                                                                                   |
| `--event-ring-size <n>`                 | number                         | `8000`                                           | -                                        | Profundidade do anel de replay SSE por sessão. O limite flexível é `MAX_EVENT_RING_SIZE = 1_000_000`; valores fora do intervalo lançam erro durante a construção da bridge.                                                                                                                                            |
| `--http-bridge`                         | boolean                        | `true`                                           | -                                        | Modo bridge: a produção tenta pré-aquecer um filho primário `qwen --acp` e tenta novamente no primeiro uso após falha; secundários confiáveis iniciam um sob demanda, enquanto secundários não confiáveis não podem iniciar ACP. O modo in-process da etapa 2 ainda não está implementado; `--no-http-bridge` faz fallback e imprime no stderr.                                     |
| `--mcp-client-budget <n>`               | number                         | none                                             | Required for `mcp-budget-mode=enforce`   | Limite de clientes MCP do workspace. Deve ser um inteiro positivo.                                                                                                                                                                                                                                                     |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | `warn` when a budget is set, otherwise `off`     | `enforce` requires `--mcp-client-budget` | `enforce` recusa, `warn` apenas avisa em 75%, `off` é apenas observação.                                                                                                                                                                                                                                               |
| `--allow-origin <pattern>`              | repeatable string              | none                                             | -                                        | Allowlist CORS que substitui a negação padrão de Origin. `*` requer um token.                                                                                                                                                                                                                                          |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                          | -                                        | Permite a instalação de `baseUrl` de provedor de autenticação localhost / rede privada. Use apenas para desenvolvimento local confiável.                                                                                                                                                                               |
| `--prompt-deadline-ms <n>`              | number                         | none                                             | -                                        | Limite de wallclock do prompt no lado do servidor em ms; o timeout aborta o prompt.                                                                                                                                                                                                                                    |
| `--writer-idle-timeout-ms <n>`          | number                         | none                                             | -                                        | Timeout de ociosidade por conexão SSE em ms.                                                                                                                                                                                                                                                                           |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                              | -                                        | Mantém o filho ACP ativo após o fechamento da última sessão. `0` significa recuperar imediatamente.                                                                                                                                                                                                                    |
| `--initialize-timeout-ms <n>`           | number                         | `10000`                                          | -                                        | Timeout de requisição do filho ACP, incluindo o handshake de inicialização (ms).                                                                                                                                                                                                                                       |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                          | -                                        | Intervalo de varredura do reaper de sessões. `0` o desativa.                                                                                                                                                                                                                                                           |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                        | -                                        | Timeout de ociosidade de sessão desconectada. `0` o desativa.                                                                                                                                                                                                                                                          |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / off                                        | -                                        | Habilita ou desabilita o rate limiting HTTP por tier.                                                                                                                                                                                                                                                                  |
| `--rate-limit-prompt <n>`               | number                         | `10`                                             | `--rate-limit`                           | Requisições de prompt por janela.                                                                                                                                                                                                                                                                                     |
| `--rate-limit-mutation <n>`             | number                         | `30`                                             | `--rate-limit`                           | Requisições de mutação por janela.                                                                                                                                                                                                                                                                                    |
| `--rate-limit-read <n>`                 | number                         | `120`                                            | `--rate-limit`                           | Requisições de leitura por janela.                                                                                                                                                                                                                                                                                    |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                          | `--rate-limit`                           | Comprimento da janela de rate limit; deve ser `>= 1000`.                                                                                                                                                                                                                                                               |

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
| `--initialize-timeout-ms` não é um inteiro positivo ou excede `2^31-1`         | `Must be a positive integer` / `Exceeds maximum JS timer delay`                                     |
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

# 8. Web Shell UI
open http://127.0.0.1:4170/
```

Quando a autenticação bearer está habilitada, adicione `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` a cada requisição.

## 8. Existe uma UI no navegador?

**Sim — o Web Shell.** `resolveWebShellDir()` localiza os assets compilados (empacotados ao lado do bundle da CLI em um release, `packages/web-shell/dist` em um checkout) e `mountWebShellAssets()` os serve em `/`, `/assets` e nas navegações de documento `/session/:id` (deep links do navegador — um `curl /session/<id>` simples recebe o 401/404 da API, não o shell). Quando os assets estão ausentes, o daemon degrada para apenas API em vez de quebrar; `--no-web` desativa explicitamente.

O shell estático é montado **antes** de `bearerAuth` em qualquer modo de inicialização — um navegador não pode anexar um header `Authorization` a uma navegação na barra de endereços ou a um sub-recurso `<script src>`, então protegê-lo simplesmente quebraria a UI. Toda rota de API que ele chama permanece protegida por token, e o front-end anexa o bearer por conta própria. Em um bind não-loopback, o shell é somente leitura, a menos que `--allow-origin <origin>` seja passado — POSTs same-origin carregam um header `Origin` que a barreira CORS rejeita (403) — então use `--allow-origin` para qualquer bind além do loopback.

A CSP é construída por `buildWebShellCsp()` e é deliberadamente mais permissiva que a de uma página estática (`'unsafe-inline'` para o patch inline `performance.measure`, workers `eval`/wasm/blob para shiki e mermaid, `data:` para fontes katex, `connect-src 'self'` para SSE). `frame-ancestors 'none'` mais `X-Frame-Options: DENY` bloqueiam clickjacking, exceto quando um origin de extensão é explicitamente permitido via `--allow-origin` para que a UI possa ser hospedada em um painel lateral do Chrome (#5626).

Para inspeção direta do protocolo, assine o stream SSE diretamente (`routes/sse-events.ts`) — veja as receitas com curl na seção 7.

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
   |  |- route mounting (health / web-shell static / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = createServer(app) / https.createServer(..., app)
   |  |- lifecycle.bindServer(server, { startupReady, drainHost })
   |  |- server.listen(port, hostname)
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

- **`createServeApp` apenas constrói; ele não inicia a escuta.** Ele retorna uma instância `express()` com middlewares e rotas montadas. Embedders apenas ordinários podem continuar sendo donos do `app.listen()`. Embedders que usam Live/Conversations devem vincular o servidor Node real ao ciclo de vida do app exportado antes de ouvir (listen) e aguardar esse ciclo de vida durante o desligamento.
- **`() => actualPort` é uma closure preguiçosa (lazy).** `actualPort` é atribuído no callback do `server.listen`. O middleware `hostAllowlist` o lê sob demanda, então portas efêmeras (`--port 0`) ainda controlam o cabeçalho `Host` corretamente.
- **`await blockForever()` é intencional.** Se `yargs.parse()` for resolvido, o nível superior da CLI cai no ponto de entrada da TUI interativa (`gemini.tsx`). SIGINT / SIGTERM saem através do caminho `onSignal` do `runQwenServe`.

## 10. Divisão de arquivos de rotas HTTP

A montagem principal acontece em `createServeApp()` no `server.ts`, que conecta os middlewares e monta módulos de rotas focados:

| Rotas                                                                                          | Arquivo                                                 | Ponto de montagem                                                              |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/health`                                                                                      | `packages/cli/src/serve/routes/health.ts`               | `healthRoutes.register()`                                                      |
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

Ou obtenha o app Express diretamente e vincule o ciclo de vida do listener você mesmo. Essa forma é necessária quando o embed usa Live/Conversations:

```ts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createServeApp,
  getServeAppLifecycle,
} from '@qwen-code/qwen-code/serve';

let actualPort = 0;
const app = createServeApp(
  {
    port: 0,
    hostname: '127.0.0.1',
    mode: 'http-bridge',
    maxSessions: 20,
  },
  () => actualPort,
  {
    /* deps: bridge, fsFactory, ... */
  },
);

const lifecycle = getServeAppLifecycle(app);
const server = createServer(app);
lifecycle.bindServer(server);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve());
});
actualPort = (server.address() as AddressInfo).port;
console.log('listening on', server.address());

// Stop admission, drain app work, close the listener, and release ownership.
await lifecycle.close();
```

Chamar `server.close()` diretamente também inicia a mesma limpeza orientada por eventos, mas é apenas melhor esforço a menos que o processo permaneça vivo; sempre aguarde `lifecycle.close()` para receber erros de desligamento. Se nenhum servidor estiver vinculado, as requisições de Live/Conversations falham com fail closed, enquanto o comportamento do app apenas ordinário permanece inalterado.

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
- Montagem estática do Web Shell: `packages/cli/src/serve/web-shell-static.ts`
- Docs do usuário: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Protocolo de comunicação: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
