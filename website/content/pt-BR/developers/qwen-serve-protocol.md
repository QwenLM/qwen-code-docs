# Referência do protocolo HTTP do `qwen serve`

Estágio 1 do [design do daemon do qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Todas as rotas ficam sob a URL base do daemon (padrão `http://127.0.0.1:4170`).

## Autenticação

Quando o daemon for iniciado com `--token` ou `QWEN_SERVER_TOKEN`, **todas as rotas, exceto `/health` em binds de loopback**, devem conter:

```
Authorization: Bearer <token>
```

Sem um token configurado (padrão de dev em loopback), o cabeçalho é opcional. A comparação do token é em tempo constante. As respostas 401 são uniformes para `missing header` / `wrong scheme` / `wrong token`.

**Isenção do `/health`** (Bctum): em binds de loopback (`127.0.0.1` / `localhost` / `::1` / `[::1]`), o `/health` é registrado ANTES do middleware bearer, então as sondas de liveness dentro do pod não precisam conter o token, mesmo quando o daemon foi iniciado com `--token`. Binds fora do loopback (`--hostname 0.0.0.0`, etc.) restringem o `/health` atrás do bearer como qualquer outra rota — veja a seção [`GET /health`](#get-health) para a justificativa.

**`--require-auth` (#4175 PR 15).** Passe esta flag na inicialização para estender a regra "deve ter um token" também para o loopback. A inicialização falha sem um token; a isenção do `/health` é removida (então o `/health` também requer `Authorization: Bearer …`).

Quando a flag está ativa, o middleware global `bearerAuth` restringe **todas** as rotas — incluindo `/capabilities`. Portanto, um cliente **não autenticado** não pode fazer pre-flight de `caps.features` para descobrir que a autenticação é necessária: a superfície de descoberta para esse caso é o próprio **corpo da resposta 401** (uniforme em todas as rotas conforme a seção [Authentication](#authentication)). A tag de capacidade `require_auth` é uma **confirmação pós-autenticação** — assim que um cliente se autentica com sucesso e lê `/capabilities`, a presença da tag confirma que o daemon foi iniciado com `--require-auth` (útil para UIs de auditoria/conformidade e para que clientes SDK exibam "esta implantação está protegida" em um painel de configurações). Rotas de mutação que optam pelo modo estrito por rota (acompanhamentos da Wave 4) recusam com `401 { code: "token_required", error: "…" }` quando acessadas no padrão loopback sem token — mas com `--require-auth` ativado, o middleware bearer global interrompe a requisição antes do gate por rota, então o corpo legado `Unauthorized` é o que os chamadores não autenticados realmente veem.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** WebUIs de navegador acessando o daemon cross-origin são bloqueadas por padrão — qualquer requisição contendo um cabeçalho `Origin` retorna `403 {"error":"Request denied by CORS policy"}` porque clientes CLI/SDK nunca enviam `Origin` e o daemon trata sua presença como um sinal de que a requisição veio de um contexto de navegador no qual o operador não optou por permitir. Passe `--allow-origin <pattern>` (repetível) na inicialização para instalar uma allowlist em vez do bloqueio total. Cada padrão é:

- O literal `*` — admite qualquer origin. **Arriscado**: a inicialização recusa quando `*` está configurado, mas nenhum bearer token está definido (qualquer fonte: `--token`, `QWEN_SERVER_TOKEN` ou `--require-auth`, que exige um token na inicialização). O breadcrumb de inicialização emite um aviso no stderr quando `*` está na lista. **Recomendação**: combine com `--require-auth` em binds de loopback para que `/health` e `/demo` também sejam restringidos pelo bearer — eles são registrados antes do middleware bearer no loopback por padrão (para que as sondas k8s/Compose possam alcançar `/health` sem um token), e uma allowlist `*` os torna acessíveis de qualquer navegador cross-origin. Em binds fora do loopback, o bearer já é obrigatório na inicialização, então a superfície de exposição do `*` é apenas `/health` (JSON de status) e `/demo` (uma página estática cujo JS ainda chama rotas restritas por token) — a superfície real da API é restrita de qualquer forma.
- Um origin de URL canônico — `<scheme>://<host>[:<port>]`. **Sem barra no final, sem caminho, sem userinfo, sem query.** A inicialização recusa com `InvalidAllowOriginPatternError` se a entrada falhar no round-trip `new URL(pattern).origin === pattern`; a mensagem de erro nomeia o padrão incorreto e a forma canônica. Estrito por intenção: a normalização silenciosa (ex.: remover uma `/` no final) deixaria erros de digitação passarem e aceitaria entradas ambíguas.

Origins correspondentes recebem os cabeçalhos de resposta CORS padrão em cada requisição:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` ecoa o origin da requisição literalmente (minúsculas/maiúsculas como o navegador enviou) em vez do literal `*`, mesmo sob o padrão `*` — os caches do navegador chaveiam as respostas nele emparelhado com `Vary: Origin`, e ecoar deixa espaço para adicionar `Access-Control-Allow-Credentials` em uma versão futura sem mudança de schema. `Access-Control-Expose-Headers: Retry-After` permite que webUIs de navegador honrem as dicas de retry do daemon de respostas `429` / `503`. `Access-Control-Allow-Credentials` **NÃO** é enviado hoje: o daemon autentica via bearer no `Authorization`, o que funciona cross-origin sem `credentials: 'include'`.

Requisições de preflight OPTIONS (OPTIONS com `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) são interrompidas com `204 No Content` mais os cabeçalhos acima. Este é o padrão CORS convencional e é seguro — o preflight apenas confirma quais métodos/cabeçalhos o daemon aceitará; a requisição subsequente real ainda executa a cadeia completa (allowlist de host → bearer auth → rotas), então a anti-DNS-rebinding e a aplicação do bearer ainda disparam antes que qualquer estado seja lido ou mutado. Requisições OPTIONS simples de origins correspondentes continuam fluindo para o downstream com os cabeçalhos CORS anexados.

Origins que não correspondem à allowlist ainda recebem `403 {"error":"Request denied by CORS policy"}` — o mesmo envelope da parede padrão, para que os clientes que já analisaram a resposta da parede não precisem tratar de forma especial daemons com allowlist implantados. O caminho de rejeição **não** emite nenhum cabeçalho `Access-Control-*` (o navegador os ignoraria, e emiti-los anunciaria indiretamente o tamanho da allowlist através da presença do cabeçalho).

A lista de padrões configurada intencionalmente NÃO é ecoada em `/capabilities` — a webUI do navegador já conhece seu próprio origin (afinal, ela chamou o daemon), e expor a lista permitiria que um leitor não autenticado de `/capabilities` enumerasse cada origin confiável (recon útil para uma implantação mal configurada). Clientes SDK dependem da tag `caps.features.allow_origin` para "este daemon honra acessos cross-origin de navegadores" sem precisar saber quais origins específicos.

Requisições de self-origin de loopback (ex.: a página `/demo` chamando o daemon no mesmo `127.0.0.1:port`) são tratadas por um shim de remoção de Origin **separado** que é executado ANTES do middleware CORS e remove o cabeçalho `Origin` para `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Portanto, eles passam independentemente da configuração `--allow-origin` — os operadores não precisam listar a própria porta do daemon para fazer a página de demonstração funcionar.

## Formato comum de erro

Respostas 5xx carregam o `code` e `data` do erro original quando presentes (estilo JSON-RPC — o ACP SDK encaminha `{code, message, data}` do agente):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

JSON malformado no corpo da requisição retorna:

```json
{ "error": "Invalid JSON in request body" }
```

com status `400`.

`SessionNotFoundError` para um ID de sessão desconhecido retorna:

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

com status `404`.

`WorkspaceMismatchError` para um `POST /session` cujo `cwd` não canoniza para o workspace vinculado do daemon (#3803 §02 — 1 daemon = 1 workspace) retorna `400` com:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Use isso para detectar incompatibilidade no pre-flight: leia `workspaceCwd` em `/capabilities` e omita `cwd` do `POST /session` (ele faz fallback para o workspace vinculado), ou roteie a requisição para um daemon vinculado a `requestedWorkspace`.

`POST /session` além do limite `--max-sessions` do daemon retorna `503` com um cabeçalho `Retry-After: 5` e:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Anexações a sessões existentes NÃO são contadas para o limite, então as reconexões de um daemon ocioso continuam funcionando mesmo quando estiver na capacidade máxima.

`RestoreInProgressError` — emitido apenas por `POST /session/:id/load` e `POST /session/:id/resume` — retorna `409` com um cabeçalho `Retry-After: 5` (correspondendo a `session_limit_exceeded`) e:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Disparado quando um `session/load` é emitido para um ID que já tem um `session/resume` em andamento (ou vice-versa). Aguarde pelo menos `Retry-After` segundos e tente novamente — a restauração subjacente é concluída dentro de `initTimeoutMs` (padrão 10s). Corridas de mesma ação (`load` vs `load`, `resume` vs `resume`) são coalescidas em vez de gerar erro.

## Capacidades

O daemon anuncia suas tags de recursos suportados a partir do registro de capacidades do serve. Os clientes **devem** condicionar a UI a `features`, não a `mode` (conforme design §10).

```
['health', 'capabilities', 'session_create', 'session_scope_override',
 'session_load', 'session_resume',
 'unstable_session_resume',
 'session_list', 'session_prompt', 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_providers', 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'session_stats',
 'session_lsp', 'session_status',
 'session_close', 'session_metadata', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_btw', 'session_shell_command',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload']
```

> Tags condicionais aparecem apenas quando seu toggle de implantação correspondente está ativado (veja a tabela abaixo). A tag `permission_mediation` do F3 está sempre ativa e carrega `modes: ['first-responder', 'designated', 'consensus', 'local-only']` para que clientes SDK possam introspectar o conjunto suportado pelo build; a estratégia ativa em tempo de execução está em `body.policy.permission`.

`session_scope_override` é o identificador de negociação para o campo `sessionScope` por requisição no `POST /session` (veja abaixo). Daemons mais antigos ignoram silenciosamente o campo, então clientes SDK devem fazer pre-flight de `caps.features` para esta tag antes de enviá-lo.

`session_load` e `session_resume` anunciam as rotas de restauração explícita (`POST /session/:id/load` e `POST /session/:id/resume`). Daemons mais antigos retornam `404` para esses caminhos, então clientes SDK devem fazer pre-flight de `caps.features` antes de chamar. `unstable_session_resume` ainda é anunciado como um alias depreciado para compatibilidade com SDKs que foram lançados enquanto o método ACP subjacente era chamado de `connection.unstable_resumeSession`; novos clientes devem depender de `session_resume`.

`slow_client_warning` cobre dois controles de backpressure de SSE co-lançados no #4175 Wave 2.5 PR 10: (a) o daemon emite um frame de stream de eventos sintético `slow_client_warning` quando a fila de um assinante ultrapassa 75% de capacidade, uma vez por episódio de estouro (rearmado após a fila drenar abaixo de 37,5%); (b) `GET /session/:id/events` aceita um parâmetro de query `?maxQueued=N` (intervalo `[16, 2048]`) para pré-dimensionar o backlog por assinante para reconexões a frio contra um grande anel de replay. O tamanho do anel em todo o daemon é controlado por `--event-ring-size` (padrão **8000**, conforme #3803 §02). Daemons antigos carecem silenciosamente de ambos — faça pre-flight desta tag antes de optar por usá-la.

`typed_event_schema` anuncia payloads de eventos do daemon que correspondem ao schema `KnownDaemonEvent` do SDK. Daemons mais antigos ainda podem transmitir frames compatíveis, mas clientes SDK devem fazer pre-flight desta tag antes de assumir cobertura de eventos tipados.

`client_heartbeat` anuncia `POST /session/:id/heartbeat`. Daemons mais antigos retornam `404`; faça pre-flight desta tag antes de emitir heartbeats periódicos.

`session_close` e `session_metadata` anunciam `DELETE /session/:id` e `PATCH /session/:id/metadata`. Daemons mais antigos retornam `404`; faça pre-flight destas tags antes de expor recursos de fechamento ou renomeação.

`session_lsp` anuncia `GET /session/:id/lsp`, o snapshot de status LSP estruturado e somente leitura para clientes do daemon. Daemons mais antigos retornam `404`; faça pre-flight desta tag antes de expor o status remoto do LSP.

`session_status` anuncia `GET /session/:id/status`, o resumo ao vivo da bridge para uma única sessão por ID (`clientCount` / `hasActivePrompt` e os campos principais). Daemons mais antigos retornam `404`; faça pre-flight desta tag antes de fazer polling do status de uma única sessão em vez de escanear a lista completa de sessões.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` e `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) anunciam as quatro rotas de controle de mutação documentadas em "Mutação: aprovação, ferramentas, init, reinício do MCP" abaixo. Todas as quatro são estritamente controladas pelo gate de mutação do PR 15 (um daemon configurado sem bearer token as rejeita com 401 `token_required`). Daemons mais antigos retornam `404`; faça pre-flight de cada tag antes de expor o recurso correspondente.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) cobre a superfície de orçamento do MCP: os campos `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` em `GET /workspace/mcp`, o campo `disabledReason` em células por servidor e as flags CLI `--mcp-client-budget` / `--mcp-budget-mode`. Daemons mais antigos omitem os novos campos inteiramente; clientes SDK fazem pre-flight desta tag antes de depender da semântica de `budgets[]`. O descritor do registro também carrega `modes: ['warn', 'enforce']` para exposição futura de feature-modes — por enquanto, os clientes inferem o modo a partir do campo `budgetMode` do snapshot. A recusa do servidor no modo `enforce` é determinística pela ordem de declaração de `Object.entries(mcpServers)`; uma camada futura de precedência de escopo (se o qwen-code adotar uma) mudaria isso para "menor precedência primeiro" para espelhar a convenção `plugin < user < project < local` do claude-code.

> ⚠️ **Escopo do PR 14 v1: por sessão, não por workspace.** Cada sessão ACP dentro do daemon constrói seu próprio `Config` + `McpClientManager` (via `acpAgent.newSessionConfig`). Os limites de orçamento limitam clientes MCP ativos **por sessão**; cada sessão lê independentemente `QWEN_SERVE_MCP_CLIENT_BUDGET` do env encaminhado. Com `--mcp-client-budget=10` e 5 sessões ACP concorrentes, a contagem real de clientes MCP ativos pode chegar a 5 × 10 = 50 em todo o daemon. O snapshot `GET /workspace/mcp` lê a contabilidade do `McpClientManager` da **sessão de bootstrap** apenas — o valor `budgets[0].scope: 'session'` é o sinal honesto de que isso é por sessão, não agregado. **O Wave 5 PR 23 (pool MCP compartilhado)** introduzirá um gerenciador com escopo de workspace e adicionará uma célula `scope: 'workspace'` ao lado da célula por sessão para uma verdadeira agregação entre sessões. A v1 é a base de contador em processo + aplicação suave na qual o PR 23 se baseia.

`workspace_file_read` cobre as rotas de arquivo de workspace de texto/lista/stat/glob (`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes` cobre `GET /file/bytes`, que foi adicionado posteriormente para que os clientes possam fazer pre-flight do suporte a janelas de bytes brutos contra daemons da era do PR19. `workspace_file_write` cobre as rotas de mutação de texto com reconhecimento de hash (`POST /file/write`, `POST /file/edit`). A tag de escrita significa que o contrato da rota existe; não significa que a implantação atual está aberta para mutação anônima. Escrita/edição são rotas de mutação estritas e requerem um bearer token configurado mesmo em loopback.

`daemon_status` anuncia `GET /daemon/status`, o snapshot de diagnóstico consolidado e somente leitura do operador documentado abaixo.

**Tags condicionais.** Um pequeno número de tags de recursos é anunciado apenas quando o toggle de implantação correspondente está ativado. Presença da tag = comportamento está ativo; ausência = ou um daemon mais antigo anterior à tag, OU um daemon atual onde o operador não optou por ativar. Atualmente:

| Tag                        | Anunciada quando …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | o daemon foi iniciado com `--require-auth` (ou `requireAuth: true` via API incorporada). O Bearer token é obrigatório em todas as rotas, incluindo `/health` em binds de loopback.                                                                                                                                                                                                                                                                                                                               |
| `mcp_workspace_pool`       | o pool de transporte MCP compartilhado está ativo. Omitido quando `QWEN_SERVE_NO_MCP_POOL=1` desativa o pool.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `mcp_pool_restart`         | o pool de transporte MCP compartilhado está ativo; as respostas de reinício podem incluir formas de múltiplas entradas com reconhecimento de pool.                                                                                                                                                                                                                                                                                                                                                                 |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). O daemon foi iniciado com pelo menos um `--allow-origin <pattern>` (ou `allowOrigins: [...]` via API incorporada). Requisições cross-origin de origins correspondentes recebem cabeçalhos de resposta CORS adequados; origins não correspondentes ainda recebem o 403 padrão. A lista de padrões configurada intencionalmente NÃO é ecoada em `/capabilities` para evitar vazar o conjunto de origins confiáveis para leitores não autenticados — a webUI do navegador já conhece seu próprio origin. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` está definido como um inteiro positivo.                                                                                                                                                                                                                                                                                                                                                                                |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` está definido como um inteiro positivo.                                                                                                                                                                                                                                                                                                                                                                     |
| `workspace_settings`       | o daemon foi criado com persistência de configurações disponível.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `session_shell_command`    | a execução de shell da sessão está explicitamente habilitada.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` está habilitado.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `workspace_reload`         | o suporte a recarga de workspace está disponível na configuração de rotas incorporadas.                                                                                                                                                                                                                                                                                                                                                                                                                          |
`mcp_guardrails` **não** está nesta tabela condicional — é uma tag sempre ativa, anunciada sempre que o binário suporta os novos campos de orçamento de `/workspace/mcp`, independentemente de o operador ter configurado um orçamento. Operadores que não definiram `--mcp-client-budget` ainda recebem os novos campos (com `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) anuncia os eventos push tipados do SSE que expõem as transições de estado do orçamento do MCP sem a necessidade de um loop de polling. Dois tipos de frame chegam em `GET /session/:id/events`:

- `mcp_budget_warning` — dispara uma vez na transição ascendente de 75% de `reservedSlots.size / clientBudget`. Rearma apenas após a proporção cair abaixo de 37,5% (`MCP_BUDGET_REARM_FRACTION`). Espelha a histerese de `slow_client_warning` do PR 10, mas no nível do gerenciador em vez do nível de backlog por assinante. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Dispara nos modos `warn` e `enforce`; nunca no modo `off`.
- `mcp_child_refused_batch` — dispara no final de cada passagem de `discoverAllMcpTools*` quando um ou mais servidores foram recusados, E como um batch de tamanho 1 no caminho de recusa de lazy-spawn de `readResource`. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` é o literal `'enforce'` porque o modo `warn` nunca recusa.

Ambos os eventos residem no anel de replay do SSE por sessão (eles carregam um `id`), então um cliente reconectando com `Last-Event-ID` retoma a partir deles; o snapshot em `GET /workspace/mcp` ainda é a fonte da verdade para o estado após desconexões prolongadas. Sempre ativo uma vez anunciado — não há toggle condicional. O estado do reducer do SDK (`DaemonSessionViewState`) expõe `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` para adaptadores que desejam uma UI simples no estilo de lag.

## Rotas

### `GET /health`

Sonda de liveness (liveness probe). A forma padrão retorna `200 {"status":"ok"}` se o listener estiver ativo — é leve, não requer acesso à bridge, adequada para sondas de liveness de alta frequência no k8s/Compose.

Passe `?deep=1` (também aceita `?deep=true` ou apenas `?deep`) para uma sonda que expõe os **contadores** da bridge (apenas informativos, não é uma verificação de liveness real):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ A sonda profunda (deep probe) é **informativa**, não uma verificação real de liveness. Ela lê acessores de contadores (`bridge.sessionCount`, `bridge.pendingPermissionCount`) que são simples getters de tamanho de Map; eles não fazem ping em processos filhos / canais individuais e, portanto, não detectam uma sessão travada mas ainda contabilizada. Use-a para painéis de capacidade (concorrência atual vs. `--max-sessions`, profundidade da fila) em vez de usá-la como gatilho para "remover este daemon da rotação". Uma resposta `503 {"status":"degraded"}` é teoricamente possível se os getters de uma implementação de bridge personalizada lançarem uma exceção, mas os getters da bridge real nunca fazem isso — em operação normal, a sonda profunda sempre retorna 200. Para um liveness real, confie no fato de o listener aceitar uma conexão TCP (ou seja, o `/health` padrão sem `?deep`).

**Auth:** obrigatório **apenas em binds não-loopback**. No loopback (`127.0.0.1`, `::1`, `[::1]`), `/health` é registrado antes do middleware bearer, então as sondas k8s/Compose dentro do pod não precisam carregar o token. Em não-loopback (`--hostname 0.0.0.0`, etc.), a rota é registrada após o middleware bearer e retorna 401 sem um token válido — caso contrário, um chamador não autenticado poderia sondar endereços arbitrários para confirmar a existência de um `qwen serve`, um vazamento de informação de baixa severidade que se combina mal com varredura de portas. A negação de CORS + allowlist de Host ainda se aplicam na isenção de loopback.

### `GET /daemon/status`

Diagnósticos do operador somente leitura. Ao contrário de `/health`, esta é uma API normal do daemon:
é registrada após a autenticação bearer e limitação de taxa (rate limiting), inclusive em binds
de loopback. Parâmetro de consulta:

- `detail=summary` (padrão) lê apenas o estado do daemon em memória.
- `detail=full` também inclui diagnósticos de sessões ativas, diagnósticos de conexão ACP,
  contagens de auth device-flow e seções de status do workspace.
- qualquer outro `detail` retorna `400 { "code": "invalid_detail" }`.

`summary` intencionalmente não consulta métodos de status do workspace, não inicia um filho ACP
nem cria uma sessão. `full` consulta cada seção do workspace independentemente;
um timeout ou exceção marca apenas essa seção como `unavailable` e adiciona um
issue `workspace_status_unavailable`.

Formato da resposta:

```json
{
  "v": 1,
  "detail": "summary",
  "generatedAt": "2026-06-16T00:00:00.000Z",
  "status": "ok",
  "issues": [],
  "daemon": {
    "pid": 12345,
    "uptimeMs": 3600000,
    "mode": "http-bridge",
    "workspaceCwd": "/repo",
    "qwenCodeVersion": "0.18.1",
    "daemonId": "serve-..."
  },
  "security": {
    "tokenConfigured": true,
    "requireAuth": false,
    "loopbackBind": true,
    "allowOriginConfigured": false,
    "allowOriginMode": "none",
    "sessionShellCommandEnabled": false
  },
  "limits": {
    "maxSessions": 20,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "promptDeadlineMs": null,
    "writerIdleTimeoutMs": null,
    "channelIdleTimeoutMs": 0,
    "sessionIdleTimeoutMs": 1800000,
    "acpConnectionCap": 64
  },
  "runtime": {
    "sessions": { "active": 0 },
    "permissions": { "pending": 0, "policy": "first-responder" },
    "channel": { "live": false },
    "transport": {
      "restSseActive": 0,
      "acp": {
        "enabled": true,
        "connections": 0,
        "connectionStreams": 0,
        "sessionStreams": 0,
        "sseStreams": 0,
        "wsStreams": 0,
        "pendingClientRequests": 0
      }
    }
  }
}
```

`status` é `error` se qualquer issue tiver severidade de erro, `warning` se qualquer issue tiver
severidade de aviso, caso contrário `ok`. Os códigos de issue são estáveis e incluem
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits` e
`workspace_status_unavailable`. Durante a curta janela após o listener estar pronto
mas antes que o runtime completo seja montado, `/daemon/status` pode reportar
`daemon_runtime_starting`; se a montagem assíncrona do runtime falhar, ele reporta
`daemon_runtime_failed` enquanto as rotas de runtime que não são de status retornam `503`.

Segurança: a resposta nunca inclui bearer tokens, client ids, IDs completos de conexão ACP,
códigos de usuário de device-flow ou URLs de verificação. `summary` omite
o caminho do log do daemon; `full` pode incluí-lo para operadores autenticados.

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": ["health", "daemon_status", "capabilities", "..."],
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/workspace"
}
```

Contrato estável: quando `v` é incrementado, o layout do frame mudou de uma forma incompatível com versões anteriores.

> **`protocolVersions`** descreve as versões do protocolo serve que o daemon pode falar. `current` é a versão de protocolo preferida do daemon e `supported` é o conjunto compatível. Clientes que exigem um protocolo específico devem verificar `supported`; UIs específicas de recursos ainda devem usar `features` como gate. Aditivo ao v=1: daemons v=1 mais antigos omitem este campo, então clientes SDK que visam builds mais antigos devem tratá-lo como opcional.

> **`modelServices` é sempre `[]` no Stage 1.** O agente usa seu único serviço de modelo padrão e não o enumera pela rede. O Stage 2 populará isso a partir de adaptadores de modelo registrados para que clientes SDK possam construir service-pickers; até lá, NÃO confie neste campo sendo não-vazio.

> **`workspaceCwd`** é o caminho absoluto canônico ao qual este daemon se vincula (#3803 §02 — 1 daemon = 1 workspace). Use-o para (a) detectar incompatibilidades antes de postar em `/session` e (b) omitir `cwd` em `POST /session` (a rota faz fallback para este caminho). Deployments multi-workspace expõem múltiplos daemons em portas diferentes, cada um com seu próprio `workspaceCwd`. Aditivo ao v=1: daemons v=1 pré-§02 omitem o campo — clientes que visam builds mais antigos devem verificar se é nulo antes de consumi-lo.

### Rotas de status de runtime somente leitura

Estas rotas reportam snapshots de runtime do lado do daemon. São rotas v1 aditivas,
não mutam o estado e não alteram a versão do protocolo serve. As rotas de status
do workspace intencionalmente **não** iniciam o processo filho ACP apenas porque
um cliente faz polling de uma rota GET: se o daemon estiver ocioso, elas retornam
`initialized: false` com um snapshot vazio. As rotas de status de sessão exigem uma
sessão ativa e usam o formato padrão `404 SessionNotFoundError` para IDs
desconhecidos.

Tags de capacidade:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_status` → `GET /session/:id/status`

Célula de status comum:

```ts
type DaemonStatus =
  | 'ok'
  | 'warning'
  | 'error'
  | 'disabled'
  | 'not_started'
  | 'unknown';

type DaemonErrorKind =
  | 'missing_binary'
  | 'blocked_egress'
  | 'auth_env_error'
  | 'init_timeout'
  | 'protocol_error'
  | 'missing_file'
  | 'parse_error';

interface DaemonStatusCell {
  kind: string;
  status: DaemonStatus;
  error?: string;
  errorKind?: DaemonErrorKind;
  hint?: string;
}
```

`errorKind` é um enum fechado compartilhado por `/workspace/preflight`,
`/workspace/env` e (eventualmente) MCP guardrails para que clientes SDK possam renderizar
remediação por categoria em vez de analisar mensagens de forma livre. O PR 13
(#4175) introduziu os sete literais listados acima; o PR 14 populará
`blocked_egress` assim que a sonda de egress for implementada.

Os payloads de status nunca expõem valores de env do MCP, headers, detalhes de OAuth/service-account,
chaves de API do provider, `baseUrl` / `envKey` do provider, corpo da skill, caminhos do sistema de arquivos da skill,
definições de hook ou valores de variáveis de ambiente secretas. `/workspace/env` reporta apenas a **presença**
de env vars na allowlist; URLs de proxy têm suas credenciais removidas e são reduzidas para
`host:port` antes de irem para a rede.

### `GET /workspace/mcp`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "docs",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
      "description": "Documentation server",
      "extensionName": "docs-ext"
    }
  ]
}
```

`discoveryState` é um entre `not_started`, `in_progress` ou `completed`.
`transport` é um entre `stdio`, `sse`, `http`, `websocket`, `sdk` ou
`unknown`. `errors` é omitido quando a descoberta é bem-sucedida.

**MCP client guardrails (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Daemons pós-PR-14 estendem o payload com quatro campos aditivos e uma célula no nível do workspace:

```jsonc
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "clientCount": 3,
  "clientBudget": 2,
  "budgetMode": "enforce",
  "budgets": [
    {
      "kind": "mcp_budget",
      "scope": "session",
      "status": "error",
      "errorKind": "budget_exhausted",
      "hint": "Raise --mcp-client-budget or remove servers from mcpServers config.",
      "liveCount": 2,
      "budget": 2,
      "mode": "enforce",
      "refusedCount": 1,
    },
  ],
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "a",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "b",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "error",
      "name": "c",
      "mcpStatus": "disconnected",
      "transport": "stdio",
      "disabled": false,
      "disabledReason": "budget",
      "errorKind": "budget_exhausted",
      "hint": "...",
    },
  ],
}
```

`budgetMode` é um entre `enforce`, `warn` ou `off`. `clientBudget` está ausente quando nenhum orçamento foi definido. `budgets[]` é **sempre um array** em daemons pós-PR-14 (possivelmente vazio quando `budgetMode === 'off'`); daemons pré-PR-14 omitem o campo inteiramente. O v1 emite uma célula com `scope: 'session'` (aplicação por sessão — veja a seção de capacidades acima para saber o porquê). Os consumidores DEVEM tolerar entradas adicionais em `budgets[]` com valores de `scope` não reconhecidos — o Wave 5 PR 23 adicionará `scope: 'workspace'` (ou `'pool'`) ao lado da célula por sessão sem um aumento de schema.

`disabledReason` nas células por servidor distingue o desativado pelo operador (`'config'` — lista de configuração `disabledMcpServers`) do recusado por orçamento (`'budget'` — descoberto, mas nunca conectado devido ao modo `enforce`). As recusas são determinísticas pela ordem de declaração de `Object.entries(mcpServers)`. O `status: 'error', errorKind: 'budget_exhausted'` por servidor sobrepõe o `mcpStatus: 'disconnected'` bruto (que é verdadeiro, mas não é a severidade voltada para o operador).

A aplicação de orçamento no PR 14 v1 é **por sessão, não por workspace**. Embora os daemons do Modo B sejam `1 daemon = 1 workspace × N sessões` pós-#4113 no nível do processo, o `McpClientManager` é construído dentro do `Config` de cada sessão ACP via `acpAgent.newSessionConfig`, então N sessões aplicam cada uma sua própria cópia do limite. O snapshot representa a visão da sessão de bootstrap. O Wave 5 PR 23 introduz um pool MCP compartilhado com escopo de workspace que promove isso para uma aplicação verdadeira por workspace.

**Detectando pressão de orçamento.** Duas superfícies, ambas populadas pós-PR-14b:

- **Eventos push** (anunciados via `mcp_guardrail_events`): assine `GET /session/:id/events` e filtre os frames `mcp_budget_warning` / `mcp_child_refused_batch` através de `KnownDaemonEvent`. A máquina de estados dispara uma vez por transição ascendente de 75% (rearmada abaixo de 37,5%); as recusas são coalescidas uma vez por passagem de descoberta no modo `enforce`.
- **Snapshot poll** (anunciado via `mcp_guardrails`): `GET /workspace/mcp` e inspecione a célula de orçamento por sessão (`budgets[0]`):

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (corresponde ao limite de histerese que o evento push do PR 14b usará).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (um ou mais servidores recusados nesta passagem de descoberta).
- `budgets[0].status === 'ok'` ⇔ abaixo do limite de 75% E sem recusas.

Cadência de polling recomendada: alinhada com o que já faz polling de `/workspace/mcp`; o snapshot é leve e a célula de orçamento não carrega custo extra de descoberta. Clientes SDK que assinam eventos push ainda se beneficiam do snapshot para o estado após desconexões prolongadas (a profundidade do anel de replay do SSE é finita — `--event-ring-size`, padrão 8000 — então um cliente offline por mais tempo do que a cobertura do anel recorre à ressincronização por snapshot).

### `GET /workspace/skills`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "skills": [
    {
      "kind": "skill",
      "status": "ok",
      "name": "review",
      "description": "Review code",
      "level": "project",
      "modelInvocable": true,
      "argumentHint": "[path]"
    }
  ]
}
```

`level` é um entre `project`, `user`, `extension` ou `bundled`. `errors` é
omitido quando a descoberta é bem-sucedida.

### `GET /workspace/providers`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "current": { "authType": "qwen", "modelId": "qwen3(qwen)" },
  "providers": [
    {
      "kind": "model_provider",
      "status": "ok",
      "authType": "qwen",
      "current": true,
      "models": [
        {
          "modelId": "qwen3(qwen)",
          "baseModelId": "qwen3",
          "name": "Qwen 3",
          "description": null,
          "contextLimit": 4096,
          "isCurrent": true,
          "isRuntime": false
        }
      ]
    }
  ]
}
```

Os modelos são agrupados por tipo de auth. Os diagnósticos de conexão do provider ficam na
célula `providers` de `/workspace/preflight`; o preflight de ambiente fica em
`/workspace/preflight` e `/workspace/env` (abaixo). `errors` é omitido
quando a construção do snapshot é bem-sucedida.

### `GET /workspace/env`

Reporta o runtime, plataforma, sandbox, proxy e a **presença** de variáveis de ambiente
secretas na allowlist do processo do daemon. Sempre responde a partir do estado `process.*`
— o daemon nunca cria um filho ACP para servir esta rota, e a resposta é idêntica
se o ACP estiver ativo ou ocioso. O campo `acpChannelLive` é apenas informativo.

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    { "kind": "runtime", "name": "node", "status": "ok", "value": "22.4.0" },
    { "kind": "platform", "name": "darwin", "status": "ok", "value": "arm64" },
    {
      "kind": "sandbox",
      "name": "SANDBOX",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "proxy",
      "name": "HTTPS_PROXY",
      "status": "ok",
      "present": true,
      "value": "proxy.internal:1080"
    },
    {
      "kind": "proxy",
      "name": "NO_PROXY",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "env_var",
      "name": "OPENAI_API_KEY",
      "status": "ok",
      "present": true
    },
    {
      "kind": "env_var",
      "name": "ANTHROPIC_BASE_URL",
      "status": "disabled",
      "present": false
    }
  ]
}
```

Formato da célula:

```ts
type DaemonEnvKind =
  | 'runtime' // name: 'node' | 'bun' | 'unknown'; value: process.versions.node
  | 'platform' // name: process.platform; value: process.arch
  | 'sandbox' // name: 'SANDBOX' | 'SEATBELT_PROFILE'; value optional
  | 'proxy' // name: HTTP_PROXY | HTTPS_PROXY | NO_PROXY | ALL_PROXY; value: redacted host
  | 'env_var'; // presence-only; value field is ALWAYS omitted

interface DaemonEnvCell extends DaemonStatusCell {
  kind: DaemonEnvKind;
  name: string;
  present?: boolean;
  value?: string;
}
```

**Política de redação.** Células `kind: 'env_var'` nunca incluem um campo `value`;
os clientes veem apenas `present: boolean`. Células `kind: 'proxy'` executam o valor bruto
da env através da redação de credenciais (`redactProxyCredentials`) e depois através do
parsing de `URL` para que a rede carregue apenas `host:port`. `NO_PROXY`
é passado pela redação literalmente porque é uma lista de hosts em vez de
uma URL. A allowlist de env vars secretas enumeradas atualmente inclui
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
`DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` e `QWEN_SERVER_TOKEN`. Outras
env vars não são enumeradas, então segredos definidos acidentalmente permanecem invisíveis.

### `GET /workspace/preflight`

Reporta verificações de prontidão do daemon. **Células no nível do daemon** (`node_version`,
`cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) são sempre
populadas a partir de `process.*` e `node:fs`. **Células no nível do ACP** (`auth`,
`mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`)
exigem um filho ACP ativo — quando o daemon está ocioso elas emitem
placeholders `status: 'not_started'`. A rota nunca cria um ACP apenas
para popular células; as células correspondentes fazem fallback para `not_started`.

Resposta ociosa (sem filho ACP):

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    {
      "kind": "node_version",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "22.4.0", "required": ">=22" }
    },
    {
      "kind": "cli_entry",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/usr/local/bin/qwen", "source": "process.argv[1]" }
    },
    {
      "kind": "workspace_dir",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/canonical/path" }
    },
    { "kind": "ripgrep", "status": "ok", "locality": "daemon" },
    {
      "kind": "git",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "2.45.0" }
    },
    {
      "kind": "npm",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "10.7.0" }
    },
    {
      "kind": "auth",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "mcp_discovery",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "skills",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "providers",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "tool_registry",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "egress",
      "status": "not_started",
      "locality": "acp",
      "hint": "egress probing lands in PR 14 (#4175)"
    }
  ]
}
```
Formato da célula:

```ts
type DaemonPreflightKind =
  | 'node_version'
  | 'cli_entry'
  | 'workspace_dir'
  | 'ripgrep'
  | 'git'
  | 'npm'
  | 'auth'
  | 'mcp_discovery'
  | 'skills'
  | 'providers'
  | 'tool_registry'
  | 'egress';

interface DaemonPreflightCell extends DaemonStatusCell {
  kind: DaemonPreflightKind;
  locality: 'daemon' | 'acp';
  detail?: Record<string, unknown>;
}
```

Semântica de `errorKind`:

- `missing_binary` — Versão do Node abaixo da exigida, `QWEN_CLI_ENTRY` ausente,
  ripgrep / git / npm não estão no PATH (avisos em vez de erros para os
  binários opcionais).
- `missing_file` — `boundWorkspace` não existe ou não é um diretório;
  erro de parse de skill apontando para um arquivo ausente ou ilegível.
- `parse_error` — Falha no parse do `SKILL.md`, JSON de configuração malformado.
- `auth_env_error` — `validateAuthMethod` retornou uma string de falha não nula,
  ou uma subclasse de `ModelConfigError` propagada a partir da resolução do provider.
- `init_timeout` — Rejeição de `withTimeout` na bridge (um timeout real
  enquanto aguarda um roundtrip do ACP). Reconhecido pela
  classe tipada `BridgeTimeoutError`. Nota: uma célula `warning`
  transitória de `mcp_discovery` com `connecting > 0` NÃO carrega este tipo — esse é
  um estado normal de handshake em andamento, distinto de um timeout real.
- `protocol_error` — `extMethod` do ACP rejeitado porque o canal fechou
  no meio da requisição, ou porque o tool registry estava inesperadamente ausente.
- `blocked_egress` — reservado para o PR 14 (#4175). O PR 13 deixa a
  célula `egress` como `status: 'not_started'`.

Se a bridge falhar ao alcançar o child do ACP ao servir uma requisição de preflight
(ex.: um fechamento de canal no meio da requisição), o array `errors`
do envelope carrega um único `ServeStatusCell` descrevendo a falha e as células
fazem fallback para placeholders ACP `not_started`. Células de nível do daemon ainda são
retornadas.

### Rotas de arquivo do workspace

Todos os caminhos de arquivo são resolvidos através do workspace vinculado do daemon. As respostas usam
caminhos relativos ao workspace e nunca retornam caminhos absolutos do sistema de arquivos para casos de sucesso
normais. Respostas de arquivo bem-sucedidas incluem:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Erros do sistema de arquivos usam este formato JSON:

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

Os valores de `errorKind` incluem `path_outside_workspace`, `symlink_escape`,
`path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`,
`permission_denied`, `parse_error`, `hash_mismatch`,
`file_already_exists`, `text_not_found` e `ambiguous_text_match`.

#### `GET /file`

Lê um arquivo de texto. Query params: `path` (obrigatório), `maxBytes`, `line` e
`limit`. O daemon rejeita arquivos binários e arquivos acima do limite de leitura de texto.
A resposta inclui `hash`, um resumo SHA-256 sobre os bytes brutos no disco para
o arquivo inteiro, mesmo quando `line`, `limit` ou `maxBytes` retornaram uma fatia (slice).

```json
{
  "kind": "file",
  "path": "src/index.ts",
  "content": "export {};\n",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "sizeBytes": 11,
  "returnedBytes": 11,
  "truncated": false,
  "hash": "sha256:...",
  "matchedIgnore": null,
  "originalLineCount": null
}
```

#### `GET /file/bytes`

Lê bytes brutos de um arquivo sem decodificar. Query params: `path` (obrigatório),
`offset` (padrão `0`) e `maxBytes` (padrão `65536`, máximo `262144`). Esta
rota suporta janelas delimitadas em arquivos binários grandes sem carregar o arquivo
inteiro. A resposta inclui `hash` apenas quando a janela retornada cobre o
arquivo inteiro.

```json
{
  "kind": "file_bytes",
  "path": "assets/logo.png",
  "offset": 0,
  "sizeBytes": 3912,
  "returnedBytes": 3912,
  "truncated": false,
  "contentBase64": "...",
  "hash": "sha256:..."
}
```

#### `POST /file/write`

Cria ou substitui um arquivo de texto. Esta é uma rota de mutação estrita: em loopback
sem um token configurado, retorna `401 { "code": "token_required" }`.
Com `--require-auth`, o middleware bearer global rejeita requisições não autenticadas
antes da rota ser executada.

Corpo:

```json
{
  "path": "src/new.ts",
  "content": "export const value = 1;\n",
  "mode": "create"
}
```

```json
{
  "path": "src/existing.ts",
  "content": "export const value = 2;\n",
  "mode": "replace",
  "expectedHash": "sha256:..."
}
```

`mode` deve ser `create` ou `replace`. `create` nunca sobrescreve um arquivo
existente (`409 file_already_exists`). `replace` requer `expectedHash`; hashes ausentes ou
malformados resultam em `400 parse_error`, e hashes desatualizados resultam em
`409 hash_mismatch`. `expectedHash` é `sha256:` mais 64 caracteres hexadecimais
minúsculos, computado sobre os bytes brutos no disco.

`bom`, `encoding` e `lineEnding` podem ser fornecidos. A substituição preserva o
perfil de codificação do arquivo existente por padrão; campos explícitos o sobrescrevem.
Escrita de binários está fora do escopo.

O daemon escreve em um arquivo temporário aleatório no diretório de destino, faz fsync onde
suportado, verifica novamente o hash atual imediatamente antes do `rename()` e, em seguida,
renomeia para o local final. Isso impede a observação de arquivos parciais e serializa
escritas originadas pelo daemon no mesmo arquivo, mas não é um compare-and-swap
de kernel entre processos: um editor externo ainda pode competir na pequena janela
entre a verificação final do hash e a renomeação.

```json
{
  "kind": "file_write",
  "path": "src/existing.ts",
  "mode": "replace",
  "created": false,
  "sizeBytes": 24,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

#### `POST /file/edit`

Aplica uma substituição de texto exata a um arquivo de texto existente. Esta também é uma
rota de mutação estrita e requer `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` deve ser não vazio e ocorrer exatamente uma vez. Nenhuma correspondência retorna
`422 text_not_found`; múltiplas correspondências retornam `422 ambiguous_text_match`.
A rota preserva codificação, BOM e quebras de linha, e verifica novamente
`expectedHash` imediatamente antes da renomeação atômica.

Escritas/edições explícitas em caminhos ignorados são permitidas porque o chamador autenticado
nomeou o caminho. Respostas de sucesso e eventos de auditoria incluem
`matchedIgnore: "file" | "directory" | null`.

```json
{
  "kind": "file_edit",
  "path": "src/config.ts",
  "replacements": 1,
  "sizeBytes": 128,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

### `GET /session/:id/context`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "state": {
    "models": {},
    "modes": {},
    "configOptions": []
  }
}
```

`state` espelha os mesmos formatos de model/mode/config-option do ACP usados por
`POST /session`, `POST /session/:id/load` e `POST /session/:id/resume`.

### `GET /session/:id/supported-commands`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "availableCommands": [
    {
      "name": "init",
      "description": "Initialize the project",
      "input": null,
      "_meta": { "source": "builtin" }
    }
  ],
  "availableSkills": ["review"]
}
```

`availableCommands` é o mesmo snapshot de comandos usado pela
notificação SSE `available_commands_update`. `availableSkills` lista apenas os nomes das skills;
os clientes não devem esperar corpos ou caminhos de skills nesta rota.

### `GET /session/:id/tasks`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "now": 1700000000000,
  "tasks": [
    {
      "kind": "agent",
      "id": "agent-1",
      "label": "reviewer: check failure",
      "description": "check failure",
      "status": "running",
      "startTime": 1699999999000,
      "runtimeMs": 1000,
      "outputFile": "/tmp/agent-1.jsonl",
      "isBackgrounded": true,
      "subagentType": "reviewer"
    }
  ]
}
```

Esta rota é um snapshot out-of-band somente leitura. Intencionalmente não é um prompt
e pode ser consultada enquanto a sessão está em streaming. A resposta contém apenas
metadados na whitelist dos registros de tarefas do agent, shell e monitor;
controllers, timers, offsets, mensagens pendentes e objetos brutos de registro
nunca são expostos.

### `GET /session/:id/lsp`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "enabled": true,
  "configuredServers": 1,
  "readyServers": 1,
  "failedServers": 0,
  "inProgressServers": 0,
  "notStartedServers": 0,
  "servers": [
    {
      "name": "typescript",
      "status": "READY",
      "languages": ["typescript", "javascript"],
      "transport": "stdio",
      "command": "typescript-language-server"
    }
  ]
}
```

`status` é um entre `NOT_STARTED`, `IN_PROGRESS`, `READY` ou `FAILED`.
O `error` opcional está presente em servidores com falha quando disponível. LSP desabilitado
(incluindo o modo bare) retorna HTTP 200 com `enabled: false`, contagens zero e
`servers: []`. LSP habilitado sem servidores configurados retorna `enabled: true`,
`configuredServers: 0` e `servers: []`. Se a inicialização falhar antes do
cliente existir, a resposta pode incluir `initializationError`; se um cliente ativo
não puder fornecer um snapshot, a resposta inclui `statusUnavailable: true`.

Esta rota expõe apenas campos estáveis voltados para o cliente. Intencionalmente omite
detalhes internos de depuração, como IDs de processo, argumentos de spawn, caudas de stderr, URIs raiz e
caminhos de pastas do workspace.

### `POST /session`

Inicia (spawn) um novo agent ou anexa a um existente (sob `sessionScope: 'single'`, o padrão).

Requisição:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Field            | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | no       | Caminho absoluto correspondente ao workspace vinculado do daemon. Se omitido, a rota faz fallback para `boundWorkspace` (leia-o em `/capabilities.workspaceCwd`). Um `cwd` não vazio incompatível retorna `400 workspace_mismatch` (#3803 §02 — 1 daemon = 1 workspace). Os caminhos do workspace são canonizados via `realpathSync.native` (com um fallback de apenas resolução para caminhos inexistentes) para que sistemas de arquivos insensíveis a maiúsculas/minúsculas não rejeitem sessões por diferenças de grafia.                                                                                                                                                                          |
| `modelServiceId` | no       | Seleciona qual _model service_ configurado o agent usará (o provider de back-end — Alibaba ModelStudio, OpenRouter, etc). Se omitido, o agent usa o seu padrão. Se o workspace já tiver uma sessão, isso chama `setSessionModel` na existente e transmite `model_switched`. Distinto de `modelId` em `POST /session/:id/model`, que seleciona o modelo **dentro** de um serviço já vinculado. O array `modelServices` em `/capabilities` é reservado para anunciar serviços configurados; no Stage 1, é sempre `[]` (o serviço padrão do agent é usado e não enumerado via HTTP). |
| `sessionScope`   | no       | Substituição por requisição para compartilhamento de sessão. `'single'` (o padrão em todo o daemon) faz com que um segundo `POST /session` no mesmo workspace reutilize a sessão existente (`attached: true`); `'thread'` força uma nova sessão distinta a cada chamada. Omita para herdar o padrão em todo o daemon. Valores fora do enum retornam `400 { code: 'invalid_session_scope' }`. Daemons antigos (anteriores ao PR 5 do #4175) ignoram o campo silenciosamente — verifique `caps.features.session_scope_override` no pre-flight antes de enviar. O padrão em todo o daemon está codificado como `'single'` em produção hoje; o #4175 pode adicionar uma flag CLI `--sessionScope` em um follow-up.         |

Resposta:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` significa que uma sessão para aquele workspace já existia e agora você está compartilhando-a.

Chamadas concorrentes de `POST /session` para o mesmo workspace são **coalescidas** em um único spawn — ambos os chamadores recebem o mesmo `sessionId`, exatamente um reporta `attached: false`. Se o spawn subjacente falhar (timeout de inicialização, saída do agent malformada, OOM), **todos os chamadores coalescidos recebem o mesmo erro** — o slot em andamento é limpo para que uma chamada subsequente possa tentar novamente do zero.

> ⚠️ **A rejeição de `modelServiceId` em uma sessão nova é silenciosa na
> resposta HTTP.** Um `modelServiceId` inválido (erro de digitação, serviço não configurado)
> NÃO gera um 500 na criação — a sessão continua operacional no
> modelo padrão do agent para que o chamador ainda receba um `sessionId` com o qual
> possa tentar novamente a troca de modelo (via `POST /session/:id/model`).
> O sinal de falha visível é um evento `model_switch_failed` no
> stream SSE da sessão, disparado entre o handshake de spawn e sua
> primeira inscrição. **Assinantes que precisam observar este evento
> devem passar `Last-Event-ID: 0` em seu primeiro `GET
/session/:id/events`** para repetir a partir do evento mais antigo disponível
> no ring (cobre o `model_switch_failed` do momento do spawn, mesmo que a
> inscrição ocorra alguns ms após a resposta de criação).

### `POST /session/:id/load`

Restaura uma sessão ACP persistida por id e repete seu histórico via SSE. O id no path é soberano; qualquer campo `sessionId` no body é ignorado. Verifique no pre-flight `caps.features.session_load` — daemons antigos retornam `404` para esta rota.

Requisição:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Field | Required | Notes                                                                                                                                                                                                                                |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | no       | Mesmas regras de canonização + `workspace_mismatch` do `POST /session`. Omita para herdar `/capabilities.workspaceCwd`. `mcpServers` intencionalmente NÃO é aceito aqui — o MCP em todo o daemon é orientado por configurações (corresponde ao `POST /session`). |

Resposta:

```json
{
  "sessionId": "persisted-1",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "state": {
    "models": { ... },
    "modes": { ... },
    "configOptions": [ ... ]
  }
}
```

`state` espelha o `LoadSessionResponse` do ACP — `models` é um `SessionModelState`, `modes` um `SessionModeState`, `configOptions` um array de `SessionConfigOption`. Campos ausentes são decididos pelo agent. Assinantes tardios (os caminhos `attached: true` abaixo) recebem o MESMO snapshot de `state` que o chamador original do load viu — o daemon o armazena em cache na entrada; mutações em tempo de execução (ex.: `model_switched`) são entregues no stream SSE, não nas respostas de anexação subsequentes.

`attached: true` significa que a sessão já estava ativa (seja de um `session/load`/`session/resume` anterior, ou porque um chamador concorrente coalescido competiu logo à frente).

**Repetição de histórico via SSE.** Enquanto `loadSession` está em andamento no lado do agent, o agent emite notificações `session_update` para cada turno persistido. O daemon os armazena em buffer no event-bus da sessão antes que a resposta da rota retorne, para que assinantes que chamam imediatamente `GET /session/:id/events` com `Last-Event-ID: 0` vejam a repetição completa. **O ring de repetição é delimitado** (padrão de 8000 frames por sessão). Históricos longos com muitos turnos de tool-call / thought-stream podem exceder isso — os frames mais antigos são descartados silenciosamente. Clientes que precisam do histórico completo devem se inscrever imediatamente após o `load` retornar; alternativamente, podem persistir os ids de eventos SSE e usar `Last-Event-ID` para retomar a partir de um limite de turno posterior.

**Erros:**

- `404` — id de sessão persistida não existe (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (mesmo formato do `POST /session`).
- `503` — `session_limit_exceeded` (conta contra `--max-sessions`; restaurações em andamento também são contabilizadas).
- `409` — `restore_in_progress` (um `session/resume` para o mesmo id já está em andamento). `Retry-After: 5`. Competições de mesma ação (dois `session/load` concorrentes para o mesmo id) são coalescidas — exatamente um retorna `attached: false`, o resto retorna `attached: true` com o mesmo `state`.

### `POST /session/:id/resume`

Restaura uma sessão ACP persistida por id SEM repetir o histórico via SSE. O contexto do modelo é restaurado internamente no lado do agent (via `geminiClient.initialize` lendo `config.getResumedSessionData`); o stream SSE permanece limpo para clientes que já têm o histórico renderizado. Verifique no pre-flight `caps.features.session_resume`; `unstable_session_resume` permanece como um alias de compatibilidade obsoleto para clientes antigos.

Mesmo formato de requisição do `/load`. Mesmo formato de resposta — `state` espelha o `ResumeSessionResponse` do ACP. Mesmo envelope de erros, incluindo `409 restore_in_progress` (que dispara quando um `session/load` está em andamento; `session/resume` competindo atrás de outro `session/resume` é coalescido).

Use `/load` quando o cliente não tem histórico renderizado (reconexão a frio, seletor → abrir). Use `/resume` quando o cliente já tem os turnos na tela e só precisa do handle do lado do daemon de volta.

> ⚠️ **Por que `unstable_session_resume` ainda é anunciado?** A rota HTTP do daemon e a capacidade `session_resume` são estáveis para a v1, mas a bridge ainda chama o `connection.unstable_resumeSession` do ACP. A tag antiga permanece apenas para que SDKs lançados antes do `session_resume` continuem funcionando.

### `GET /workspace/:id/sessions`

Lista todas as sessões ativas cujo workspace canônico corresponde a `:id` (cwd absoluto codificado por URL).

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
```

Resposta:

```json
{
  "sessions": [
    {
      "sessionId": "<uuid>",
      "workspaceCwd": "/canonical/path",
      "createdAt": "2026-05-17T08:30:00.000Z",
      "displayName": "My Session",
      "clientCount": 2,
      "hasActivePrompt": false
    }
  ]
}
```

Array vazio (não 404) quando não existem sessões — uma UI de seletor de sessões não deve dar erro apenas porque o workspace está ocioso.

### `POST /session/:id/prompt`

Encaminha um prompt para o agent. Chamadores de múltiplos prompts enfileiram em FIFO por sessão (o ACP garante um prompt ativo por sessão).

Requisição:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

Validação: `prompt` deve ser um array não vazio de objetos. Outras falhas retornam `400` antes de chegar à bridge.

Resposta:

```json
{ "stopReason": "end_turn" }
```

Outros motivos de parada: `cancelled`, `max_tokens`, `error`, `length` (conforme a especificação do ACP).

Se o cliente HTTP desconectar no meio do prompt, o daemon envia uma notificação ACP `cancel` para o agent, que encerra o prompt com `stopReason: "cancelled"`.
> **Limitação da Fase 1 — sem timeout de prompt no lado do servidor.** A bridge
> apenas disputa o `prompt()` do agente contra o `transportClosedReject`
> (o crash do processo filho do agente) e o AbortSignal de desconexão HTTP
> do chamador. Um agente travado mas vivo (ex.: uma chamada de modelo que
> trava) bloqueia o FIFO por sessão até que o cliente HTTP atinja o timeout
> em sua ponta e desconecte. Prompts de longa duração são legítimos
> (pesquisa profunda, análise de codebases grandes), então um deadline padrão não é
> definido deliberadamente; a Fase 2 exporá um `promptTimeoutMs` configurável
> como opt-in. Até lá, os chamadores devem definir seu próprio
> timeout no lado do cliente e desconectar (ou chamar
> `POST /session/:id/cancel`) ao expirar.

### `POST /session/:id/cancel`

Cancela o prompt **atualmente ativo** na sessão. No lado do ACP, isso é uma notificação, não uma requisição — o agente reconhece resolvendo o `prompt()` ativo com `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrato de multi-prompt:** o cancelamento afeta apenas o prompt ativo. Quaisquer prompts que o mesmo cliente enviou anteriormente via POST e que ainda estão na fila atrás do ativo continuarão a ser executados. O enfileiramento de multi-prompt é um comportamento introduzido pelo daemon (não está na especificação do ACP); o contrato para prompts enfileirados é "eles continuam executando a menos que você cancele cada um, ou encerre a sessão via saída do canal".

### `DELETE /session/:id`

Fecha explicitamente uma sessão ativa. Força o fechamento mesmo quando outros clientes estão conectados — cancela qualquer prompt ativo, resolve permissões pendentes como canceladas, publica o evento `session_closed`, fecha o EventBus e remove a sessão dos mapas do daemon. Sessões persistidas em disco NÃO são excluídas — elas podem ser recarregadas via `POST /session/:id/load`. Pre-flight `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotente: retorna `404` para sessões desconhecidas (mesmo formato de `SessionNotFoundError` que outras rotas).

> **Evento `session_closed`.** Assinantes SSE recebem um evento terminal `session_closed` com `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` antes do stream terminar. Reducers do SDK tratam isso de forma idêntica ao `session_died` (define `alive: false`, limpa `pendingPermissions`).

### `PATCH /session/:id/metadata`

Atualiza metadados mutáveis da sessão. Atualmente suporta apenas `displayName`. Pre-flight `caps.features.session_metadata`.

Request:

```json
{ "displayName": "My Investigation Session" }
```

| Campo         | Obrigatório | Notas                                                                          |
| ------------- | ----------- | ------------------------------------------------------------------------------ |
| `displayName` | não         | String, máximo de 256 caracteres. String vazia limpa o nome. Omita para manter como está. |

Response:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Publica um evento `session_metadata_updated` no stream SSE da sessão com `{ sessionId, displayName }`.

### `POST /session/:id/heartbeat`

Atualiza o controle de última visualização (last-seen) do daemon para esta sessão. Adaptadores de longa duração (TUI/IDE/web) fazem ping nisso em um intervalo para que a futura política de revogação (Wave 5 PR 24) possa distinguir clientes mortos de clientes silenciosos.

Headers:

| Header             | Obrigatório | Notas                                                                                                                                                                                                                                   |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | não         | Ecoa o id emitido pelo daemon do `POST /session`. Clientes identificados também atualizam seu timestamp por cliente; heartbeats anônimos atualizam apenas a marca d'água por sessão. Deve satisfazer o mesmo formato `[A-Za-z0-9._:-]{1,128}` usado em outros lugares. |

O corpo da requisição está vazio (`{}` está bem — nenhum campo é lido hoje).

Response:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` é ecoado apenas quando um `X-Qwen-Client-Id` confiável foi fornecido. `lastSeenAt` é o epoch `Date.now()` (ms) do lado do daemon que a bridge armazenou.

Errors:

- `400` — `{ code: 'invalid_client_id' }` quando o header está malformado (regra de formato do header) ou quando carrega um `clientId` que não está registrado para esta sessão (a bridge lança `InvalidClientIdError` antes de atualizar qualquer timestamp).
- `404` — sessão desconhecida.

Capability gating: pre-flight `caps.features.client_heartbeat`. Daemons mais antigos retornam `404` para este path.

### `POST /session/:id/model`

Altera o modelo ativo **dentro** do serviço de modelo atualmente vinculado à sessão. Serializado através da fila de alteração de modelo por sessão.

(Para alterar o _serviço_ em si — Alibaba ModelStudio vs OpenRouter etc — passe `modelServiceId` no `POST /session` para uma nova sessão. A Fase 1 não possui uma rota de troca de serviço em tempo real.)

Request:

```json
{ "modelId": "qwen-staging" }
```

Response:

```json
{ "modelId": "qwen-staging" }
```

Em caso de sucesso, publica `model_switched` no stream SSE. Em caso de falha, publica `model_switch_failed` (para que assinantes passivos vejam a falha, não apenas o chamador). Disputa contra a saída do canal do agente para que um processo filho travado não possa bloquear o handler HTTP.

### `POST /session/:id/recap`

Capability tag: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Gera um resumo de uma frase de "onde eu parei" da sessão. Encapsula o `generateSessionRecap` do core (`packages/core/src/services/sessionRecap.ts`), que executa uma side-query contra o modelo rápido com ferramentas desabilitadas, `maxOutputTokens: 300`, e um formato de saída estrito `<recap>...</recap>`. A side-query lê o histórico de chat existente do GeminiClient da sessão e **não** adiciona a ele.

O corpo da requisição é ignorado (envie `{}` ou vazio). Mutation gate não estrito — a postura espelha `/session/:id/prompt` (a chamada custa tokens, mas não muta estado). Nenhum evento SSE é publicado.

Response (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` é `null` (um 200 normal, não um erro) quando:

- a sessão tem menos de dois turnos de diálogo até agora,
- a side-query não retornou nenhum payload `<recap>...</recap>` extraível,
- ou ocorreu qualquer erro de modelo subjacente (o helper do core é best-effort e nunca lança exceção).

Errors:

- `400 {code: 'invalid_client_id'}` — header `X-Qwen-Client-Id` malformado.
- `404` — sessão desconhecida.

Cancellation: **nenhuma na v1**. A rota não escuta desconexão do cliente HTTP, nenhum `AbortSignal` é conectado à bridge, e o processo filho do ACP executa a side-query até o fim independentemente de o chamador ter desconectado. Os únicos limites são o timeout de segurança de 60s da bridge (`SESSION_RECAP_TIMEOUT_MS`) e a disputa de transporte fechado contra a morte do canal ACP. Isso é aceitável porque o recap é curto (tentativa única, `maxOutputTokens: 300`, ~1–5s típico); um ext-method de cancelamento baseado em request-id pode conectar um cancelamento completo de ponta a ponta em uma versão futura se o custo de largura de banda algum dia justificar.

### Mutation: approval, tools, init, MCP restart

A issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 adiciona quatro rotas de controle de mutação que permitem que clientes remotos alterem a postura de runtime sem tocar na CLI do host do daemon. Todas as quatro:

- São controladas pelo mutation gate **estrito** do PR 15. Um daemon configurado sem um bearer token as rejeita com `401 {code: 'token_required'}`. Configure `--token` (ou `QWEN_SERVER_TOKEN`) antes de optar por usar.
- Aceitam e carimbam o header `X-Qwen-Client-Id` (cadeia de auditoria do PR 7). Quando o header carrega um id confiável, o daemon emite `originatorClientId` no evento SSE correspondente para que UIs multi-cliente possam suprimir ecos de suas próprias mutações.
- Fazem pre-flight de cada capability por tag antes de expor o recurso. Daemons mais antigos retornam `404` para a rota.

Três das quatro rotas (`tools/:name/enable`, `init`, `mcp/:server/restart`) emitem eventos **com escopo de workspace**: cada barramento SSE de sessão ativa recebe o evento, independentemente de qual sessão estava conectada quando a mutação foi acionada. `approval-mode` emite um evento **com escopo de sessão** porque a alteração é local para o `Config` de uma sessão.

#### `POST /session/:id/approval-mode`

Capability tag: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Altera o modo de aprovação de uma sessão ativa. O novo modo entra imediatamente no `Config` por sessão do processo filho do ACP. As configurações NÃO são gravadas em disco por padrão — passe `persist: true` para também gravar `tools.approvalMode` nas configurações do workspace.

Request:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` deve ser um de `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (espelho do enum `ApprovalMode` do core; o SDK exporta `DAEMON_APPROVAL_MODES` para validação em runtime). `persist` tem como padrão `false`.

Response (200):

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

Errors:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — literal de modo desconhecido.
- `400 {code: 'invalid_persist_flag'}` — `persist` não é booleano.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — o modo solicitado requer uma pasta confiável (modos privilegiados em workspaces não confiáveis são rejeitados pelo `Config.setApprovalMode` do core).
- `404` — sessão desconhecida.

Evento SSE (com escopo de sessão): `approval_mode_changed` com `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Capability tag: `workspace_tool_toggle`. IO de arquivo puro — sem roundtrip ACP.

Alterna um nome de ferramenta na lista de configurações `tools.disabled` do workspace. Ferramentas listadas ali **não são registradas** (distinto de `permissions.deny`, que mantém a ferramenta registrada e rejeita a invocação). Tanto ferramentas nativas quanto ferramentas descobertas via MCP passam por `ToolRegistry.registerTool`, que consulta o conjunto de desabilitadas.

> ⚠️ **Os nomes devem corresponder exatamente ao identificador exposto pelo registro.** Nenhuma resolução de alias acontece — a rota armazena qualquer string que esteja no parâmetro de path em `tools.disabled`, e o próximo processo filho do ACP compara contra `tool.name` no momento do registro. Ferramentas nativas usam seu nome canônico de registro (forma de verbo em snake_case): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — NÃO os rótulos de exibição (`Shell`, `Read`, `Write`) que a CLI exibe. Ferramentas descobertas via MCP usam a forma qualificada `mcp__<server>__<name>` (que também é a forma que os eventos `tool_toggled` transmitem e o que `GET /workspace/mcp` lista). Desabilitar `Bash` NÃO impedirá que `run_shell_command` seja registrada na próxima sessão.

Processos filhos do ACP ativos retêm ferramentas já registradas — a alternância entra em vigor no **próximo** spawn do processo filho do ACP. Combine com `POST /workspace/mcp/:server/restart` (para ferramentas de origem MCP) ou criação de nova sessão para tornar a alteração efetiva no daemon atual.

Nomes de ferramentas desconhecidos são aceitos: pré-desabilitar uma ferramenta MCP ainda não instalada é um caso de uso legítimo.

Request:

```json
{ "enabled": false }
```

Response (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Errors:

- `400 {code: 'invalid_tool_name'}` — parâmetro de path vazio, ou parâmetro de path excede o limite de 256 caracteres.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` ausente ou não booleano.

Evento SSE (com escopo de workspace): `tool_toggled` com `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Capability tag: `workspace_init`. IO de arquivo puro — sem roundtrip ACP, **sem invocação de LLM**.

Cria a estrutura de um `QWEN.md` vazio (ou o que quer que `getCurrentGeminiMdFilename()` retorne sob overrides de `--memory-file-name`) na raiz do workspace vinculado ao daemon. Apenas mecânico — para preenchimento de conteúdo dirigido por IA, siga com `POST /session/:id/prompt`.

O padrão recusa sobrescrever quando o arquivo alvo existe com conteúdo que não seja apenas espaço em branco. Arquivos apenas com espaços em branco são tratados como ausentes (corresponde ao comando de barra `/init` local).

Request:

```json
{ "force": false }
```

Response (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` é `'created'` para criações novas, `'noop'` quando um arquivo existente apenas com espaços em branco foi deixado intacto (nenhuma gravação realizada), e `'overwrote'` quando `force: true` substituiu conteúdo não vazio. O evento SSE `workspace_initialized` espelha a ação da resposta — observadores podem filtrar por `action !== 'noop'` para reagir apenas a alterações reais no disco.

Errors:

- `400 {code: 'invalid_force_flag'}` — `force` não é booleano.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — o arquivo existe com conteúdo que não é espaço em branco e `force` foi omitido/falso. O corpo carrega o path absoluto e o tamanho (bytes) para que clientes SDK possam renderizar um prompt "sobrescrever N bytes?" sem fazer re-stat.

Evento SSE (com escopo de workspace): `workspace_initialized` com `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Capability tag: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Reinicia um servidor MCP configurado através do `McpClientManager.discoverMcpToolsForServer` do processo filho do ACP (disconnect + reconnect + rediscover). Faz uma pré-verificação do snapshot de orçamento em tempo real da contabilidade do PR 14 v1, para que uma reinicialização em um workspace com orçamento saturado retorne uma recusa suave em vez de acionar uma cascata de `BudgetExhaustedError`.

O corpo da requisição está vazio (`{}`). O parâmetro de path é o nome do servidor codificado por URL conforme aparece na configuração `mcpServers`.

Response (200) — discriminated union em `restarted`:

```json
{ "serverName": "docs", "restarted": true, "durationMs": 1234 }
```

```json
{
  "serverName": "docs",
  "restarted": false,
  "skipped": true,
  "reason": "budget_would_exceed"
}
```

Motivos de skip suave (todos retornam 200):

| `reason`                | Significado                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Outra descoberta / reinicialização para este servidor já está em andamento. A rota retorna imediatamente em vez de aguardar a promise original. O chamador deve tentar novamente após um curto atraso. |
| `'disabled'`            | O servidor está configurado, mas listado em `excludedMcpServers`. Reabilite antes de reiniciar.                                                                                       |
| `'budget_would_exceed'` | O daemon está em `--mcp-budget-mode=enforce`, o servidor alvo não está atualmente em `reservedSlots`, e o total em tempo real atingiu `clientBudget`. O chamador deve liberar um slot primeiro. |

Errors (non-2xx):

- `400 {code: 'invalid_server_name'}` — parâmetro de path vazio.
- `404` — nome do servidor não está na configuração `mcpServers`, ou nenhum canal ACP ativo existe (a reinicialização inerentemente requer uma instância ativa de `McpClientManager`).
- `500` — erro interno (ex.: `ToolRegistry` não inicializado).

Eventos SSE (com escopo de workspace): `mcp_server_restarted` com `{serverName, durationMs, originatorClientId?}` em caso de sucesso; `mcp_server_restart_refused` com `{serverName, reason, originatorClientId?}` em caso de skip suave.

### `GET /session/:id/events` (SSE)

Assina o stream de eventos da sessão.

Headers:

```
Accept: text/event-stream
Last-Event-ID: 42        ← opcional, faz replay a partir do id 42
```

Query params:

| Param       | Obrigatório | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued` | não         | Limite de **live-backlog** por assinante. Intervalo `[16, 2048]`, padrão 256. Frames de replay forçados no momento da assinatura são isentos do limite; o que realmente o consome são eventos ao vivo que chegam enquanto o assinante ainda está drenando um grande replay de `Last-Event-ID: 0`. Aumente para reconexões a frio para que a cauda ao vivo não acione o aviso de cliente lento / evicção antes que o consumidor alcance. Valores fora do intervalo / não decimais / presentes mas vazios retornam `400 invalid_max_queued` antes do handshake SSE abrir. Pre-flight `caps.features.slow_client_warning` — daemons antigos ignoram o param silenciosamente. |

Formato do frame. A linha `data:` é o **envelope de evento completo**, JSON-stringified em uma única linha — `{id?, v, type, data, originatorClientId?}`. O payload específico do ACP (`sessionUpdate`, argumentos de `requestPermission`, etc.) fica sob o campo `data` do envelope; o próprio `type` do envelope corresponde à linha `event:` do SSE.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← a cada 15s, sem payload

event: client_evicted    ← frame terminal, sem id (sintético)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

As linhas `id:` / `event:` no nível do SSE duplicam `envelope.id` / `envelope.type` para compatibilidade com EventSource. Consumidores raw-`fetch` (o `parseSseStream` do SDK) leem tudo do envelope JSON e ignoram as linhas de preâmbulo do SSE.

| Tipo de evento              | Gatilho                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`            | Qualquer notificação `sessionUpdate` do ACP (chunks do LLM, chamadas de ferramentas, uso)                                                                                                                                                                                                                              |
| `permission_request`        | Agente pediu aprovação de ferramenta                                                                                                                                                                                                                                                                                   |
| `permission_resolved`       | Algum cliente votou em uma permissão via `POST /permission/:requestId`                                                                                                                                                                                                                                                 |
| `permission_partial_vote`   | (apenas consensus) Um voto foi registrado, mas o quórum ainda não foi atingido. Carrega `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pre-flight `caps.features.permission_mediation`.                                                                                                 |
| `permission_forbidden`      | Um voto foi rejeitado pela política ativa (`designated` incompatível, `local-only` non-loopback, ou votante `consensus` não está no snapshot). Carrega `{requestId, sessionId, clientId?, reason}`. Pre-flight `caps.features.permission_mediation`.                                                                   |
| `model_switched`            | `POST /session/:id/model` teve sucesso                                                                                                                                                                                                                                                                                 |
| `model_switch_failed`       | `POST /session/:id/model` foi rejeitado                                                                                                                                                                                                                                                                                |
| `session_died`              | Processo filho do agente travou inesperadamente. **Terminal: o stream SSE fecha após este frame; a sessão é removida de `byId`.** Assinantes devem reconectar via `POST /session` para gerar uma nova.                                                                                                                |
| `slow_client_warning`       | Local do assinante: fila ≥ 75% cheia. **Não terminal** — o stream continua; o aviso é um alerta prévio antes da evicção. Carrega `{queueSize, maxQueued, lastEventId}`. Dispara UMA VEZ por episódio de overflow; rearma após a fila drenar abaixo de 37,5%. Sem `id` (sintético). Pre-flight `caps.features.slow_client_warning`. |
| `client_evicted`            | Local do assinante: overflow da fila. **Terminal: o stream SSE fecha após este frame** (sem `id` — sintético). Outros assinantes na mesma sessão continuam.                                                                                                                                                            |
| `stream_error`              | Erro no lado do daemon durante o fan-out. **Terminal: o stream SSE fecha após este frame** (sem `id` — sintético).                                                                                                                                                                                                     |
Semântica de reconexão:

- Envie `Last-Event-ID: <n>` para reproduzir eventos com `id > n` a partir do ring por sessão (profundidade padrão **8000**, ajustável via `qwen serve --event-ring-size <n>`)
- **Detecção de lacunas (lado do cliente):** se `<n>` for anterior ao evento mais antigo ainda no ring (ex.: você reconecta com `Last-Event-ID: 50`, mas o ring agora contém 200–1199), o daemon reproduz a partir do evento disponível mais antigo sem gerar erro. Compare o `id` do primeiro evento reproduzido com `n + 1`; qualquer diferença é o tamanho da janela perdida. A Fase 2 injetará um frame sintético `stream_gap` explícito no lado do daemon; na Fase 1, a detecção é responsabilidade do cliente.
- Os IDs são monóticos por sessão, começando em 1
- Frames sintéticos (`client_evicted`, `slow_client_warning`, `stream_error`) omitem intencionalmente o `id` para não consumir um slot de sequência para outros assinantes

Backpressure:

- A fila por assinante tem como padrão `maxQueued: 256` itens ativos (frames de reprodução durante a reconexão ignoram o limite). Substitua via `?maxQueued=N` (intervalo `[16, 2048]`) na requisição SSE.
- Quando a fila de um assinante ultrapassa 75% de capacidade, o bus envia à força um frame sintético `slow_client_warning` para esse assinante (uma vez por episódio de estouro; rearmado após o esvaziamento abaixo de 37,5%). O stream permanece aberto — o aviso é um alerta para que o cliente possa esvaziar a fila mais rápido ou desconectar e reconectar de forma limpa.
- Se a fila estourar de fato após o aviso, o bus emite o frame terminal `client_evicted` e encerra a assinatura.

### `POST /permission/:requestId`

Registre um voto em uma `permission_request` pendente. A **política de mediação** ativa decide quem vence:

| Policy                      | Behavior                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (default) | Qualquer votante validado vence; votantes posteriores recebem `404`. Linha de base pré-F3.                                                                                                            |
| `designated`                | Apenas o originador do prompt (`originatorClientId`) decide; não originadores recebem `403 permission_forbidden / designated_mismatch`. Faz fallback para first-responder para prompts anônimos.       |
| `consensus`                 | N de M votantes devem concordar (padrão `N = floor(M/2) + 1`, substituível via `policy.consensusQuorum`). A primeira opção a atingir `N` vence. Votos não resolutivos recebem frames SSE `200` + `permission_partial_vote`. |
| `local-only`                | Apenas votantes de loopback decidem; chamadores remotos recebem `403 permission_forbidden / remote_not_allowed`.                                                                                      |

A política ativa é configurada em `settings.json` sob `policy.permissionStrategy` e exposta em `/capabilities` em `body.policy.permission`. Pré-voo `caps.features.permission_mediation` (com `modes: [...]`) para o conjunto suportado pelo build.

> **F3 (#4175): coordenação de permissões multi-cliente.** A F3 adicionou as quatro políticas acima. Daemons pré-F3 tinham first-responder em hardcode; o formato na rede permanece inalterado bit a bit quando a política configurada é `first-responder`. Novos eventos (`permission_partial_vote`, `permission_forbidden`) são aditivos — SDKs antigos os veem como `unrecognized_known_event` e os ignoram graciosamente.

> **Timeout de permissão (padrão de 5 minutos).** Uma `permission_request`
> permanece pendente até que: (a) algum cliente vote aqui, (b) `POST /session/:id/cancel`
> seja disparado, (c) o cliente HTTP que conduz o prompt desconecte
> (o cancelamento no meio do prompt resolve permissões pendentes como `cancelled`),
> (d) a sessão seja encerrada, (e) o daemon seja desligado, **ou
> (f) o timeout de permissão por sessão seja disparado** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 minutos). No disparo do timeout, o `requestPermission` do agente é resolvido
> como `{outcome: 'cancelled'}`, o ring de auditoria registra uma
> entrada `permission.timeout`, o stderr do daemon emite um breadcrumb
> de uma linha, e o bus SSE distribui o frame cancelado padrão
> `permission_resolved` para que os assinantes façam a limpeza. O
> timeout é configurável via `BridgeOptions.permissionResponseTimeoutMs`;
> chamadores headless executando prompts longos podem querer estendê-lo.

Requisição:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

Resultados:

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — aceitar / rejeitar / proceder-uma-vez / etc, conforme as opções oferecidas pelo agente
- `{ "outcome": "cancelled" }` — descartar a requisição (equivale ao que `cancelSession` / `shutdown` fazem internamente)

Resposta:

- `200 {}` — seu voto foi aceito (resolvido OU registrado sob o quórum de consenso)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: a política ativa rejeitou seu voto
- `404 { "error": "..." }` — o requestId é desconhecido (já resolvido, nunca existiu ou a sessão foi derrubada)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: o `allowedOptionIds` do agente contém o sentinel reservado `'__cancelled__'`; violação de contrato entre agente / daemon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 compatibilidade futura: um literal de política chegou ao schema, mas seu branch de mediação ainda não foi construído (atualmente inacessível; reservado para políticas futuras)

Após um voto bem-sucedido, todo cliente conectado vê `permission_resolved` com o mesmo `requestId` e o `outcome` escolhido. Sob `consensus`, votos intermediários também distribuem `permission_partial_vote` até atingir o quórum.

### Rotas do Auth device-flow (issue #4175 PR 21)

O daemon intermedia um OAuth 2.0 Device Authorization Grant (RFC 8628) para que um cliente SDK remoto possa acionar um login cujos tokens sejam salvos no sistema de arquivos do **daemon** — e não no cliente. O próprio daemon faz o polling do IdP; a única tarefa do cliente é exibir a URL de verificação + o código do usuário e (opcionalmente) assinar o SSE para eventos de conclusão.

Tag de capacidade: `auth_device_flow` (sempre anunciada). Provedores suportados na v1: `qwen-oauth`.

> [!note]
>
> O tier gratuito do Qwen OAuth foi descontinuado em 15/04/2026. Trate `qwen-oauth` como o
> identificador de provedor legado da v1 neste protocolo; novos clientes devem preferir um
> provedor de auth atualmente suportado quando houver um disponível.

**Localidade em runtime.** O daemon nunca abre um navegador — mesmo que possa. O cliente decide se deve chamar `open(verificationUri)` localmente; em um pod headless (o deployment canônico do Modo B), o usuário abre a URL em qualquer dispositivo onde tenha um navegador. Consulte `docs/users/qwen-serve.md` para a UX recomendada.

**Sem vazamento de token em eventos.** `auth_device_flow_started` carrega apenas `{deviceFlowId, providerId, expiresAt}`. O código do usuário e a URL de verificação retornam ponto a ponto no corpo do POST 201 e via `GET /workspace/auth/device-flow/:id`; eles nunca são transmitidos no SSE.

**Singleton por provedor.** Um segundo `POST` para o mesmo provedor enquanto um fluxo está pendente é uma assunção idempotente — ele retorna a entrada existente com `attached: true` em vez de iniciar uma nova requisição ao IdP.

#### `POST /workspace/auth/device-flow`

Portão de mutação estrito: requer um bearer token mesmo nos padrões de loopback sem token (`401 token_required`).

Requisição:

```json
{ "providerId": "qwen-oauth" }
```

Resposta (`201` início novo, `200` assunção idempotente):

```json
{
  "deviceFlowId": "fa07c61b-…",
  "providerId": "qwen-oauth",
  "status": "pending",
  "userCode": "USER-1",
  "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
  "verificationUriComplete": "https://chat.qwen.ai/api/v1/oauth2/device?user_code=USER-1",
  "expiresAt": 1700000600000,
  "intervalMs": 5000,
  "attached": false
}
```

Erros:

- `400 unsupported_provider` — `providerId` desconhecido (a resposta inclui `supportedProviders`)
- `409 too_many_active_flows` — limite do workspace (4) atingido; cancele um com `DELETE`
- `401 token_required` — o portão estrito negou uma requisição sem token
- `502 upstream_error` — o IdP retornou um erro inesperado

#### `GET /workspace/auth/device-flow/:id`

Leia o estado atual. Entradas pendentes ecoam `userCode/verificationUri/expiresAt/intervalMs`; entradas terminais (graça de 5 min) os removem e expõem `status` + `errorKind/hint` opcional.

Retorna `404 device_flow_not_found` para IDs desconhecidos e entradas removidas após o período de graça.

#### `DELETE /workspace/auth/device-flow/:id`

Cancelamento idempotente:

- entrada pendente → `204` + emite `auth_device_flow_cancelled`
- entrada terminal → `204` no-op (sem reemissão de evento)
- ID desconhecido → `404`

#### `GET /workspace/auth/status`

Snapshot de fluxos pendentes + provedores suportados:

```json
{
  "v": 1,
  "workspaceCwd": "/work/bound",
  "providers": [],
  "pendingDeviceFlows": [
    {
      "deviceFlowId": "fa07c61b-…",
      "providerId": "qwen-oauth",
      "expiresAt": 1700000600000
    }
  ],
  "supportedDeviceFlowProviders": ["qwen-oauth"]
}
```

#### Eventos SSE do Device-flow

Cinco eventos tipados (escopo do workspace, distribuídos para cada bus de sessão ativo):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST bem-sucedido; o SDK deve assinar (sem userCode aqui, busque via GET se necessário)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — o daemon respeitou o `slow_down` do upstream; clientes fazendo polling no GET devem aumentar seu intervalo para corresponder
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — credenciais persistidas; `accountAlias` é um rótulo não-PII (nunca e-mail/telefone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal; `errorKind` é um de `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` é interno do daemon: o exchange do IdP foi bem-sucedido, mas o daemon não conseguiu armazenar as credenciais de forma durável (EACCES / EROFS / ENOSPC). O usuário deve tentar novamente assim que a condição de disco subjacente for corrigida.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE bem-sucedido contra uma entrada pendente

> **Não compatível com MCP.** A especificação de autorização MCP (2025-06-18) exige OAuth 2.1 + auth-code PKCE com um callback de redirecionamento, o que não funciona para daemons em pods headless. A superfície de device-flow do Modo B é privada do daemon — clientes que visam servidores compatíveis com MCP devem usar um caminho de auth diferente.

## Formato de transmissão

Os eventos são emitidos como frames EventSource padrão. O daemon escreve uma linha `data:` por frame (o JSON não tem quebras de linha embutidas após `JSON.stringify`); o parser do SDK em `packages/sdk-typescript/src/daemon/sse.ts` lida com isso e com a forma multi-`data:` permitida pela especificação no lado do recebimento.

## Frames de erro durante o streaming

Se o iterador da bridge lançar uma exceção ao servir um assinante SSE, o daemon emite um frame terminal `stream_error` (sem `id`). A linha `data:` é o envelope completo (mesmo formato de qualquer outro frame SSE neste documento); a mensagem de erro real fica em `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

A conexão é então fechada.

## Variáveis de ambiente

| Var                 | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer token. Espaços em branco no início e no fim são removidos na inicialização. |

## Estrutura do código-fonte

| Path                                                 | Purpose                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | comando yargs + schema de flags                                                                            |
| `packages/cli/src/serve/run-qwen-serve.ts`           | ciclo de vida do listener + tratamento de sinais                                                           |
| `packages/cli/src/serve/server.ts`                   | montagem do app Express, ordenação de middlewares e rotas diretas restantes                                |
| `packages/cli/src/serve/routes/*.ts`                 | grupos de rotas Express focados, incluindo sessão, SSE, auth do workspace, status do workspace e rotas de arquivos |
| `packages/cli/src/serve/auth.ts`                     | bearer + allowlist de Host + negação de CORS                                                               |
| `packages/cli/src/serve/acp-session-bridge.ts`       | facade de compatibilidade da bridge local do CLI para spawn-or-attach, FIFO por sessão e registro de permissões |
| `packages/acp-bridge/src/status.ts`                  | tipos de wire de status do daemon somente leitura + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | helper puro que constrói payloads de `/workspace/env` a partir do estado `process.*`, incluindo redação de credenciais |
| `packages/acp-bridge/src/eventBus.ts`                | fila assíncrona limitada + ring de reprodução                                                              |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | cliente TS                                                                                                 |
| `packages/sdk-typescript/src/daemon/sse.ts`          | parser de frames EventSource                                                                               |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 casos, sem LLM                                                                                          |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 casos, filho real `qwen --acp` suportado pelo servidor OpenAI fake local (somente POSIX; ignorado no Windows) |