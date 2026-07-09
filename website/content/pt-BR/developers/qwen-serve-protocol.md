# Referência do protocolo HTTP do `qwen serve`

Estágio 1 do [design do daemon qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Todas as rotas ficam sob a URL base do daemon (padrão `http://127.0.0.1:4170`).

## Autenticação

Quando o daemon for iniciado com `--token` ou `QWEN_SERVER_TOKEN`, **todas as rotas, exceto `/health` em binds de loopback**, devem incluir:

```
Authorization: Bearer <token>
```

Sem um token configurado (padrão de dev em loopback), o cabeçalho é opcional. A comparação do token é em tempo constante. As respostas 401 são uniformes para `missing header` / `wrong scheme` / `wrong token`.

**Isenção do `/health`** (Bctum): em binds de loopback (`127.0.0.1` / `localhost` / `::1` / `[::1]`), o `/health` é registrado ANTES do middleware bearer, então as sondas de liveness dentro do pod não precisam incluir o token, mesmo quando o daemon foi iniciado com `--token`. Binds fora do loopback (`--hostname 0.0.0.0`, etc.) protegem o `/health` com o bearer como qualquer outra rota — veja a seção [`GET /health`](#get-health) para a justificativa.

**`--require-auth` (PR #4175 15).** Passe esta flag na inicialização para estender a regra "deve ter um token" também para o loopback. A inicialização falha sem um token; a isenção do `/health` é removida (então o `/health` também exige `Authorization: Bearer …`).

Quando a flag está ativa, o middleware global `bearerAuth` protege **todas** as rotas — incluindo `/capabilities`. Portanto, um cliente **não autenticado** não pode fazer preflight de `caps.features` para descobrir que a autenticação é necessária: a superfície de descoberta para esse caso é o próprio **corpo da resposta 401** (uniforme em todas as rotas conforme a seção [Authentication](#authentication)). A tag de capacidade `require_auth` é uma **confirmação pós-autenticação** — assim que um cliente se autentica com sucesso e lê `/capabilities`, a presença da tag confirma que o daemon foi iniciado com `--require-auth` (útil para UIs de auditoria/conformidade e para que clientes SDK exibam "esta implantação é reforçada" em um painel de configurações). Rotas de mutação que optam pelo modo estrito por rota (acompanhamentos da Wave 4) recusam com `401 { code: "token_required", error: "…" }` quando acessadas no padrão loopback sem token — mas com `--require-auth` habilitado, o middleware bearer global interrompe a requisição antes da proteção por rota, então o corpo legado `Unauthorized` é o que os chamadores não autenticados realmente veem.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** WebUIs de navegador acessando o daemon cross-origin são bloqueadas por padrão — qualquer requisição com um cabeçalho `Origin` retorna `403 {"error":"Request denied by CORS policy"}` porque clientes CLI/SDK nunca enviam `Origin` e o daemon trata sua presença como um sinal de que a requisição veio de um contexto de navegador no qual o operador não optou por incluir. Passe `--allow-origin <pattern>` (repetível) na inicialização para instalar uma allowlist em vez do bloqueio total. Cada padrão é:

- O literal `*` — admite qualquer origin. **Arriscado**: a inicialização recusa quando `*` está configurado, mas nenhum token bearer está definido (qualquer fonte: `--token`, `QWEN_SERVER_TOKEN` ou `--require-auth`, que exige um token na inicialização). O breadcrumb de inicialização emite um aviso no stderr quando `*` está na lista. **Recomendação**: combine com `--require-auth` em binds de loopback para que `/health` e `/demo` também sejam protegidos pelo bearer — eles são registrados antes do middleware bearer no loopback por padrão (para que as sondas k8s/Compose possam alcançar `/health` sem um token), e uma allowlist `*` os torna acessíveis de qualquer navegador cross-origin. Em binds fora do loopback, o bearer já é obrigatório na inicialização, então a superfície de exposição do `*` é apenas `/health` (JSON de status) e `/demo` (uma página estática cujo JS ainda chama rotas protegidas por token) — a superfície real da API é protegida de qualquer forma.
- Um origin de URL canônico — `<scheme>://<host>[:<port>]`. **Sem barra no final, sem path, sem userinfo, sem query.** A inicialização recusa com `InvalidAllowOriginPatternError` se a entrada falhar no round-trip `new URL(pattern).origin === pattern`; a mensagem de erro nomeia o padrão incorreto e a forma canônica. Estrito por intenção: a normalização silenciosa (por exemplo, remover uma `/` no final) deixaria erros de digitação passarem e aceitaria entradas ambíguas.

Origins correspondentes recebem os cabeçalhos de resposta CORS padrão em cada requisição:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` ecoa o origin da requisição literalmente (minúsculas/maiúsculas como o navegador enviou) em vez do literal `*`, mesmo sob o padrão `*` — os caches do navegador chaveiam as respostas com ele emparelhado com `Vary: Origin`, e ecoar deixa espaço para adicionar `Access-Control-Allow-Credentials` em uma versão futura sem alteração de schema. `Access-Control-Expose-Headers: Retry-After` permite que webUIs de navegador respeitem as dicas de retry do daemon de respostas `429` / `503`. `Access-Control-Allow-Credentials` **NÃO** é enviado hoje: o daemon autentica via bearer-in-`Authorization`, que funciona cross-origin sem `credentials: 'include'`.

Requisições OPTIONS de preflight (OPTIONS com `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) são interrompidas com `204 No Content` mais os cabeçalhos acima. Este é o padrão CORS convencional e é seguro — o preflight apenas confirma quais métodos/cabeçalhos o daemon aceitará; a requisição subsequente real ainda executa a cadeia completa (allowlist de host → auth bearer → rotas), então a proteção anti-DNS-rebinding e a aplicação do bearer ainda são disparadas antes que qualquer estado seja lido ou mutado. Requisições OPTIONS simples de origins correspondentes continuam fluindo para o downstream com os cabeçalhos CORS anexados.

Origins que não correspondem à allowlist ainda recebem `403 {"error":"Request denied by CORS policy"}` — o mesmo envelope da parede padrão, para que os clientes que já analisaram a resposta da parede não precisem tratar de forma especial daemons implantados com allowlist. O caminho de rejeição **não** emite nenhum cabeçalho `Access-Control-*` (o navegador os ignoraria, e emiti-los anunciaria indiretamente o tamanho da allowlist através da presença do cabeçalho).

A lista de padrões configurada intencionalmente NÃO é ecoada em `/capabilities` — a webUI do navegador já conhece seu próprio origin (afinal, ela chamou o daemon), e expor a lista permitiria que um leitor não autenticado de `/capabilities` enumerasse cada origin confiável (recon útil para uma implantação mal configurada). Clientes SDK baseiam-se na tag `caps.features.allow_origin` para "este daemon honra acessos cross-origin de navegadores" sem precisar saber quais origins específicos.

Requisições de self-origin de loopback (por exemplo, a página `/demo` chamando o daemon no mesmo `127.0.0.1:port`) são tratadas por um shim de remoção de Origin **separado** que é executado ANTES do middleware CORS e remove o cabeçalho `Origin` para `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Assim, eles passam independentemente da configuração `--allow-origin` — os operadores não precisam listar a própria porta do daemon para fazer a página de demonstração funcionar.

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

`SessionNotFoundError` para um id de sessão desconhecido retorna:

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

Use isso para detectar incompatibilidade em preflight: leia `workspaceCwd` de `/capabilities` e omita `cwd` de `POST /session` (ele faz fallback para o workspace vinculado), ou roteie a requisição para um daemon vinculado a `requestedWorkspace`.

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

Disparado quando um `session/load` é emitido para um id que já tem um `session/resume` em andamento (ou vice-versa). Aguarde pelo menos `Retry-After` segundos e tente novamente — a restauração subjacente é concluída dentro de `initTimeoutMs` (padrão 10s). Corridas de mesma ação (`load` vs `load`, `resume` vs `resume`) são coalescidas em vez de gerar erro.

`SessionArchivedError` é emitido quando um chamador tenta carregar ou retomar uma sessão cujo JSONL está em `chats/archive/`:

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

com status `409`.

`SessionArchivingError` é emitido quando uma transição de arquivamento ou desarquivamento de sessão já está em andamento para o mesmo id:

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

com status `409` e `Retry-After: 5`.

## Capacidades

O daemon anuncia suas tags de recursos suportados a partir do registro de capacidades do serve. Os clientes **devem** basear a UI em `features`, não em `mode` (conforme design §10).

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
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
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

> Tags condicionais aparecem apenas quando seu toggle de implantação correspondente está ativo (veja a tabela abaixo). A tag `permission_mediation` do F3 é sempre ativa e carrega `modes: ['first-responder', 'designated', 'consensus', 'local-only']` para que clientes SDK possam introspectar o conjunto suportado pelo build; a estratégia ativa em runtime está em `body.policy.permission`.
`session_scope_override` é o identificador de negociação para o campo `sessionScope` por requisição em `POST /session` (veja abaixo). Daemons mais antigos ignoram silenciosamente este campo, então os clientes SDK devem fazer um pre-flight em `caps.features` para esta tag antes de enviá-lo.

`session_load` e `session_resume` anunciam as rotas de restauração explícita (`POST /session/:id/load` e `POST /session/:id/resume`). Daemons mais antigos retornam `404` para estes caminhos, então os clientes SDK devem fazer um pre-flight em `caps.features` antes de chamá-los. `unstable_session_resume` ainda é anunciado como um alias obsoleto para compatibilidade com SDKs que foram lançados enquanto o método ACP subjacente se chamava `connection.unstable_resumeSession`; novos clientes devem usar `session_resume` como gate.

`slow_client_warning` cobre o comportamento de backpressure do SSE: (a) o daemon emite um frame de fluxo de eventos sintético `slow_client_warning` quando o backlog de frames ao vivo de um assinante ou o backlog de bytes serializados ao vivo ultrapassa 75% da capacidade, uma vez por episódio de estouro (rearmado após ambas as medições caírem abaixo de 37,5%); (b) `GET /session/:id/events` aceita um parâmetro de query `?maxQueued=N` (intervalo `[16, 2048]`) para pré-dimensionar o backlog de frames por assinante para reconexões a frio contra um grande anel de replay. O limite de bytes serializados é controlado pelo daemon (padrão de **2 MiB** por assinante), apenas ao vivo, e intencionalmente não possui parâmetro de query. O tamanho do anel em todo o daemon é controlado por `--event-ring-size` (padrão **8000**, conforme #3803 §02). Daemons antigos carecem silenciosamente do comportamento de aviso/query — faça um pre-flight nesta tag antes de ativá-la.

`typed_event_schema` anuncia payloads de eventos do daemon que correspondem ao schema `KnownDaemonEvent` do SDK. Daemons mais antigos ainda podem transmitir frames compatíveis, mas os clientes SDK devem fazer um pre-flight nesta tag antes de assumir a cobertura de eventos tipados.

`client_heartbeat` anuncia `POST /session/:id/heartbeat`. Daemons mais antigos retornam `404`; faça um pre-flight nesta tag antes de emitir heartbeats periódicos.

`session_close` e `session_metadata` anunciam `DELETE /session/:id` e `PATCH /session/:id/metadata`. Daemons mais antigos retornam `404`; faça um pre-flight nestas tags antes de expor as funcionalidades de fechamento ou renomeação.

`session_organization` anuncia grupos de sessões personalizados e fixação (pinning). Ele adiciona `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization` e a visualização de lista organizada opt-in `GET /workspace/:id/sessions?view=organized`. Daemons mais antigos retornam `404` para as rotas de mutação/grupo e ignoram o contrato de visualização organizada, então os clientes WebShell/SDK devem fazer um pre-flight nesta tag antes de exibir a UI de agrupamento ou fixação.

`session_archive` anuncia a API de arquivo de estado de diretório v1: `POST /sessions/archive`, `POST /sessions/unarchive` e `GET /workspace/:id/sessions?archiveState=active|archived`. Sessões arquivadas não podem ser carregadas ou retomadas até que sejam desarquivadas.

`session_lsp` anuncia `GET /session/:id/lsp`, o snapshot estruturado e somente leitura do status do LSP para clientes do daemon. Daemons mais antigos retornam `404`; faça um pre-flight nesta tag antes de expor o status remoto do LSP.

`session_status` anuncia `GET /session/:id/status`, o resumo ao vivo da bridge para uma única sessão por id (`clientCount` / `hasActivePrompt` e os campos principais). Daemons mais antigos retornam `404`; faça um pre-flight nesta tag antes de fazer polling do status de uma única sessão em vez de escanear a lista completa de sessões.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` e `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) anunciam as quatro rotas de controle de mutação documentadas em "Mutation: approval, tools, init, MCP restart" abaixo. Todas as quatro são estritamente controladas pelo gate de mutação do PR 15 (um daemon configurado sem um bearer token as rejeita com 401 `token_required`). Daemons mais antigos retornam `404`; faça um pre-flight em cada tag antes de expor a funcionalidade correspondente.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) cobre a superfície de orçamento do MCP: os campos `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` em `GET /workspace/mcp`, o campo `disabledReason` nas células por servidor e as flags de CLI `--mcp-client-budget` / `--mcp-budget-mode`. Daemons mais antigos omitem inteiramente os novos campos; clientes SDK fazem um pre-flight nesta tag antes de depender da semântica de `budgets[]`. O descritor de registro também carrega `modes: ['warn', 'enforce']` para futura exposição de modos de recursos — por enquanto, os clientes inferem o modo a partir do campo `budgetMode` do snapshot. A recusa do servidor no modo `enforce` é determinística pela ordem de declaração de `Object.entries(mcpServers)`; uma futura camada de precedência de escopo (se o qwen-code adotar uma) mudaria isso para "menor precedência primeiro" para espelhar a convenção `plugin < user < project < local` do claude-code.

> ⚠️ **Escopo do PR 14 v1: por sessão, não por workspace.** Cada sessão ACP dentro do daemon constrói seu próprio `Config` + `McpClientManager` (via `acpAgent.newSessionConfig`). Os limites de orçamento restringem os clientes MCP ao vivo **por sessão**; cada sessão lê independentemente `QWEN_SERVE_MCP_CLIENT_BUDGET` do env encaminhado. Com `--mcp-client-budget=10` e 5 sessões ACP simultâneas, a contagem real de clientes MCP ao vivo pode chegar a 5 × 10 = 50 em todo o daemon. O snapshot de `GET /workspace/mcp` lê apenas a contabilidade do `McpClientManager` da **sessão de bootstrap** — o valor `budgets[0].scope: 'session'` é o sinal claro de que isso é por sessão, não agregado. **Wave 5 PR 23 (shared MCP pool)** introduzirá um gerenciador com escopo de workspace e adicionará uma célula `scope: 'workspace'` ao lado da célula por sessão para uma verdadeira agregação entre sessões. A v1 é a base de contador em processo + aplicação suave na qual o PR 23 se constrói.

`workspace_file_read` cobre as rotas de arquivo de workspace de texto/lista/stat/glob
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
cobre `GET /file/bytes`, que foi adicionado posteriormente para que os clientes possam fazer um pre-flight
no suporte a janela de bytes brutos contra daemons da era do PR19. `workspace_file_write` cobre
as rotas de mutação de texto com reconhecimento de hash (`POST /file/write`, `POST /file/edit`).
A tag de write significa que o contrato da rota existe; não significa que o deployment
atual está aberto para mutação anônima. Write/edit são rotas de mutação estritas
e requerem um bearer token configurado mesmo no loopback.

`daemon_status` anuncia `GET /daemon/status`, o snapshot de diagnóstico
consolidado e somente leitura do operador documentado abaixo.

**Tags condicionais.** Um pequeno número de tags de recursos é anunciado apenas quando o toggle de deployment correspondente está ativado. Presença da tag = comportamento ativado; ausência = ou um daemon mais antigo anterior à tag, OU um daemon atual onde o operador não optou por ativar. Atualmente:

| Tag                        | Anunciada quando…                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | o daemon foi iniciado com `--require-auth` (ou `requireAuth: true` via API incorporada). O Bearer token é obrigatório em todas as rotas, incluindo `/health` em binds de loopback.                                                                                                                                                                                                                                                                                                                               |
| `mcp_workspace_pool`       | o pool de transporte MCP compartilhado está ativo. Omitido quando `QWEN_SERVE_NO_MCP_POOL=1` desativa o pool.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `mcp_pool_restart`         | o pool de transporte MCP compartilhado está ativo; as respostas de reinicialização podem incluir formas de múltiplas entradas com reconhecimento do pool.                                                                                                                                                                                                                                                                                                                                                        |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). O daemon foi iniciado com pelo menos um `--allow-origin <pattern>` (ou `allowOrigins: [...]` via API incorporada). Requisições cross-origin de origens correspondentes recebem os cabeçalhos de resposta CORS adequados; origens não correspondentes ainda recebem o 403 padrão. A lista de padrões configurada intencionalmente NÃO é ecoada em `/capabilities` para evitar vazar o conjunto de origens confiáveis para leitores não autenticados — o webui do navegador já conhece sua própria origem. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` está definido como um inteiro positivo.                                                                                                                                                                                                                                                                                                                                                                              |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` está definido como um inteiro positivo.                                                                                                                                                                                                                                                                                                                                                                    |
| `workspace_settings`       | o daemon foi criado com a persistência de configurações disponível.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `session_shell_command`    | a execução do shell da sessão está explicitamente habilitada.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` está habilitado.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `workspace_reload`         | o suporte a recarga de workspace está disponível na configuração de rotas incorporadas.                                                                                                                                                                                                                                                                                                                                                                                                                         |
`mcp_guardrails` **não** está nesta tabela condicional — é uma tag sempre ativa, anunciada sempre que o binário suporta os novos campos de orçamento de `/workspace/mcp`, independentemente de o operador ter configurado um orçamento. Operadores que não definiram `--mcp-client-budget` ainda recebem os novos campos (com `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) anuncia os eventos push SSE tipados que expõem as transições de estado do orçamento do MCP sem um loop de polling. Dois tipos de frame chegam em `GET /session/:id/events`:

- `mcp_budget_warning` — dispara uma vez na transição ascendente de 75% de `reservedSlots.size / clientBudget`. Rearma apenas após a proporção cair abaixo de 37,5% (`MCP_BUDGET_REARM_FRACTION`). Espelha a histerese de `slow_client_warning` do PR 10, mas no nível do gerenciador em vez do nível de backlog por assinante. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Dispara nos modos `warn` e `enforce`; nunca no modo `off`.
- `mcp_child_refused_batch` — dispara no final de cada passagem de `discoverAllMcpTools*` quando um ou mais servidores foram recusados, E como um batch de tamanho 1 no caminho de recusa de lazy-spawn de `readResource`. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` é o literal `'enforce'` porque o modo `warn` nunca recusa.

Ambos os eventos residem no anel de replay SSE por sessão (eles carregam um `id`), então um cliente reconectando com `Last-Event-ID` retoma a partir deles; o snapshot em `GET /workspace/mcp` ainda é a fonte da verdade para o estado após desconexões prolongadas. Sempre ativo uma vez anunciado — não há toggle condicional. O estado do reducer do SDK (`DaemonSessionViewState`) expõe `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` para adaptadores que desejam uma UI simples no estilo de lag.

## Rotas

### `GET /health`

Sonda de liveness. A forma padrão retorna `200 {"status":"ok"}` se o listener estiver ativo — é leve, não acessa a bridge, adequada para sondas de liveness de alta frequência no k8s/Compose.

Passe `?deep=1` (também aceita `?deep=true` ou apenas `?deep`) para uma sonda que expõe os **contadores** da bridge (apenas informativo, não é uma verificação de liveness real):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ A sonda profunda (deep probe) é **informativa**, não uma verificação real de liveness. Ela lê acessores de contadores (`bridge.sessionCount`, `bridge.pendingPermissionCount`) que são simples getters de tamanho de Map; eles não fazem ping em processos filhos / canais individuais e, portanto, não detectarão uma sessão travada mas ainda contada. Use-a para dashboards de capacidade (concorrência atual vs. `--max-sessions`, profundidade da fila) em vez de usá-la como gatilho para "remover este daemon da rotação". Uma resposta `503 {"status":"degraded"}` é teoricamente possível se os getters de uma implementação de bridge personalizada lançarem exceções, mas os getters da bridge real nunca o fazem — em operação normal, a sonda profunda sempre retorna 200. Para liveness real, confie se o listener aceita uma conexão TCP (ou seja, o `/health` padrão sem `?deep`).

**Auth:** obrigatório **apenas em binds não-loopback**. No loopback (`127.0.0.1`, `::1`, `[::1]`), `/health` é registrado antes do middleware bearer, então as sondas k8s/Compose dentro do pod não precisam carregar o token. Em não-loopback (`--hostname 0.0.0.0`, etc.), a rota é registrada após o middleware bearer e retorna 401 sem um token válido — caso contrário, um chamador não autenticado poderia sondar endereços arbitrários para confirmar a existência de um `qwen serve`, um vazamento de informação de baixa severidade que se combina mal com varredura de portas. A negação de CORS + allowlist de Host ainda se aplicam na isenção de loopback.

### `GET /daemon/status`

Diagnósticos operacionais somente leitura. Ao contrário de `/health`, esta é uma API normal do daemon:
ela é registrada após a autenticação bearer e o rate limiting, inclusive em binds
de loopback. Parâmetro de query:

- `detail=summary` (padrão) lê apenas o estado do daemon em memória.
- `detail=full` também inclui diagnósticos de sessões ativas, diagnósticos de conexão
  ACP, contagens de auth device-flow e seções de status do workspace.
- qualquer outro `detail` retorna `400 { "code": "invalid_detail" }`.

`summary` intencionalmente não consulta métodos de status do workspace, não inicia um filho
ACP, nem cria uma sessão. `full` consulta cada seção do workspace independentemente;
um timeout ou exceção marca apenas aquela seção como `unavailable` e adiciona um
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
    "channelWorker": {
      "enabled": false,
      "state": "disabled",
      "channels": []
    },
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
    },
    "perf": {
      "eventLoop": { "meanMs": 0, "p50Ms": 0, "p99Ms": 0, "maxMs": 0 },
      "promptQueueWait": {
        "count": 0,
        "meanMs": 0,
        "maxMs": 0,
        "lastMs": null
      },
      "pipe": {
        "inbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 },
        "outbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 }
      }
    },
    "activity": {
      "activePrompts": 0,
      "pendingPrompts": 0,
      "queuedPrompts": 0,
      "lastActivityAt": null,
      "idleSinceMs": null
    }
  }
}
```

`runtime.perf` é opcional. Quando presente, relata apenas o lag do event loop
do processo do daemon, amostras de espera da fila FIFO de prompts e contadores de bytes do pipe do daemon-filho;
o lag do event loop do filho ACP não é incluído em `/daemon/status`.

`status` é `error` se qualquer issue tiver severidade de erro, `warning` se qualquer issue tiver
severidade de aviso, caso contrário `ok`. Os códigos de issue são estáveis e incluem
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited` e
`channel_worker_partial_connect`, e `workspace_status_unavailable`. Durante
a curta janela após o listener estar pronto, mas antes do runtime completo ser
montado, `/daemon/status` pode reportar `daemon_runtime_starting`; se a montagem
do runtime assíncrono falhar, ele reporta `daemon_runtime_failed` enquanto as rotas
de runtime que não são de status retornam `503`.

`runtime.activity` reporta a atividade de prompts em todo o daemon. `activePrompts` conta sessões com um prompt em andamento. `pendingPrompts` conta todos os prompts aceitos que ainda não foram concluídos, incluindo o prompt em execução e os prompts em espera na FIFO. `queuedPrompts` conta os prompts em espera na FIFO que foram aceitos, mas não despachados. `lastActivityAt` é o timestamp ISO 8601 do último início/fim de prompt ou criação de sessão; `null` quando o daemon nunca processou nenhuma atividade desde a inicialização. `idleSinceMs` é calculado a partir de `lastActivityAt` no momento da geração da resposta.

`runtime.channel.live` reporta o canal da bridge ACP dentro do daemon. Ele não é
o worker do adaptador de canal. Canais gerenciados pelo daemon usam
`runtime.channelWorker`, cujo `state` é um entre `disabled`, `starting`,
`running`, `exited`, `failed` ou `stopped`. Quando um worker atinge `running`
e então sai, `/daemon/status` mantém o daemon online e reporta o código de issue de aviso
`channel_worker_exited`.

A inicialização do worker de canal gerenciado pelo daemon continua sendo fail-fast: se `qwen serve
--channel ...` não conseguir iniciar um worker que atinja o estado ready, a inicialização do serve falha.
Após um worker ter atingido o estado ready, saídas inesperadas são reiniciadas pelo supervisor
do serve dentro de uma política limitada: até 3 tentativas de reinicialização em uma janela de 5 minutos,
com backoff de 1s, 5s e depois 15s. O worker envia heartbeats IPC a cada
15s; se nenhum heartbeat for observado por 45s, o supervisor trata o worker como
obsoleto (stale), o encerra, registra `staleHeartbeatAt` e usa o mesmo caminho de reinicialização.

`runtime.channelWorker` pode incluir campos operacionais aditivos:
`requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`,
`restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`,
`lastHeartbeatAt` e `staleHeartbeatAt`. `restartCount` é o número total
de tentativas de reinicialização feitas por este processo serve; um worker em execução com
`restartCount > 0` está saudável, a menos que outro issue se aplique. Um worker em execução
cujos `requestedChannels` incluam nomes ausentes em `channels` reporta
`channel_worker_partial_connect`.

`qwen channel status` continua lendo os metadados do pidfile. Durante uma janela de reinicialização,
o pidfile pertencente ao serve permanece reservado, mas `workerPid` é omitido para que
os clientes não exibam um processo de worker obsoleto. O stdout/stderr do worker são
encaminhados para o log do daemon com tokens bearer, valores sensíveis do ambiente do worker
e credenciais de URL de proxy redigidos.

Segurança: a resposta nunca inclui tokens bearer, client ids, IDs completos de conexão
ACP, códigos de usuário do device-flow ou URLs de verificação. `summary` omite
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

> **`protocolVersions`** descreve as versões do protocolo serve que o daemon pode falar. `current` é a versão de protocolo preferida do daemon e `supported` é o conjunto compatível. Clientes que exigem um protocolo específico devem verificar `supported`; a UI específica de recursos ainda deve ser condicionada a `features`. Aditivo ao v=1: daemons v=1 mais antigos omitem este campo, então clientes SDK que visam builds mais antigos devem tratá-lo como opcional.

> **`modelServices` é sempre `[]` no Stage 1.** O agente usa seu único serviço de modelo padrão e não o enumera pela rede. O Stage 2 populará isso a partir de adaptadores de modelo registrados para que clientes SDK possam construir service-pickers; até lá, NÃO dependa deste campo estar não vazio.

> **`workspaceCwd`** é o caminho absoluto canônico ao qual este daemon se vincula (#3803 §02 — 1 daemon = 1 workspace). Use-o para (a) detectar incompatibilidades antes de postar em `/session` e (b) omitir `cwd` em `POST /session` (a rota faz fallback para este caminho). Deployments multi-workspace expõem múltiplos daemons em portas diferentes, cada um com seu próprio `workspaceCwd`. Aditivo ao v=1: daemons v=1 pré-§02 omitem o campo — clientes que visam builds mais antigos devem verificar se é nulo antes de consumi-lo.

### Rotas de status de runtime somente leitura

Estas rotas reportam snapshots de runtime do lado do daemon. Elas são rotas v1 aditivas,
não mutam o estado e não alteram a versão do protocolo serve. As rotas de status de workspace
intencionalmente **não** iniciam o processo filho ACP apenas porque
um cliente faz polling em uma rota GET: se o daemon estiver ocioso, elas retornam
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
`/workspace/env` e (eventualmente) guardrails de MCP, para que os clientes SDK possam renderizar a remediação por categoria em vez de analisar mensagens de forma livre. O PR 13 (#4175) introduziu os sete literais listados acima; o PR 14 preencherá `blocked_egress` assim que o probe de egress for implementado.

Os payloads de status nunca expõem valores de env do MCP, headers, detalhes de OAuth/conta de serviço, chaves de API do provedor, `baseUrl` / `envKey` do provedor, corpo da skill, caminhos do sistema de arquivos da skill, definições de hooks ou valores de variáveis de ambiente secretas. O `/workspace/env` relata apenas a **presença** de variáveis de ambiente na whitelist; as URLs de proxy têm suas credenciais removidas e são reduzidas para `host:port` antes de serem transmitidas pela rede.

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
`unknown`. `errors` é omitido quando a discovery é bem-sucedida.

**Guardrails do cliente MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Daemons pós-PR-14 estendem o payload com quatro campos aditivos e uma célula no nível do workspace:

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

`budgetMode` é um entre `enforce`, `warn` ou `off`. `clientBudget` está ausente quando nenhum budget foi definido. `budgets[]` é **sempre um array** em daemons pós-PR-14 (possivelmente vazio quando `budgetMode === 'off'`); daemons pré-PR-14 omitem o campo inteiramente. A v1 emite uma célula com `scope: 'session'` (aplicação por sessão — veja a seção de capacidades acima para entender o motivo). Os consumidores DEVEM tolerar entradas adicionais em `budgets[]` com valores de `scope` não reconhecidos — o Wave 5 PR 23 adicionará `scope: 'workspace'` (ou `'pool'`) ao lado da célula por sessão sem fazer bump do schema.

`disabledReason` nas células por servidor distingue os desativados pelo operador (`'config'` — lista de configuração `disabledMcpServers`) dos recusados por budget (`'budget'` — descobertos, mas nunca conectados devido ao modo `enforce`). As recusas são determinísticas pela ordem de declaração de `Object.entries(mcpServers)`. O `status: 'error', errorKind: 'budget_exhausted'` por servidor sobrepõe o `mcpStatus: 'disconnected'` bruto (que é verdadeiro, mas não representa a severidade voltada para o operador).

A aplicação de budget no PR 14 v1 é **por sessão, não por workspace**. Embora os daemons do Modo B sejam `1 daemon = 1 workspace × N sessões` pós-#4113 no nível do processo, o `McpClientManager` é construído dentro do `Config` de cada sessão ACP via `acpAgent.newSessionConfig`, então N sessões aplicam cada uma sua própria cópia do limite. O snapshot representa a visão da sessão de bootstrap. O Wave 5 PR 23 introduz um pool de MCP compartilhado com escopo de workspace que promove isso para uma aplicação verdadeira por workspace.

**Detectando pressão de budget.** Duas superfícies, ambas populadas pós-PR-14b:

- **Eventos de push** (anunciados via `mcp_guardrail_events`): inscreva-se em `GET /session/:id/events` e filtre os frames `mcp_budget_warning` / `mcp_child_refused_batch` através de `KnownDaemonEvent`. A máquina de estados dispara uma vez por cruzamento ascendente de 75% (rearmada abaixo de 37,5%); as recusas são coalescidas uma vez por passagem de discovery no modo `enforce`.
- **Snapshot poll** (anunciado via `mcp_guardrails`): `GET /workspace/mcp` e inspecione a célula de budget por sessão (`budgets[0]`):

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (corresponde ao limite de histerese que o evento de push do PR 14b usará).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (um ou mais servidores recusados nesta passagem de discovery).
- `budgets[0].status === 'ok'` ⇔ abaixo do limite de 75% E sem recusas.

Cadência de poll recomendada: alinhada com o que já faz poll de `/workspace/mcp`; o snapshot é leve e a célula de budget não acarreta custo extra de discovery. Clientes SDK que se inscrevem em eventos de push ainda se beneficiam do snapshot para o estado após desconexões prolongadas (a profundidade do anel de replay do SSE é finita — `--event-ring-size`, padrão 8000 — então um cliente offline por mais tempo do que a cobertura do anel recorre à ressincronização por snapshot).

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
omitido quando a discovery é bem-sucedida.

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

Os modelos são agrupados por tipo de autenticação. Os diagnósticos de conexão do provedor ficam na célula `providers` de `/workspace/preflight`; o preflight de ambiente fica em `/workspace/preflight` e `/workspace/env` (abaixo). `errors` é omitido quando a construção do snapshot é bem-sucedida.

### `GET /workspace/env`

Relata o runtime, plataforma, sandbox, proxy e a **presença** de variáveis de ambiente secretas na whitelist do processo do daemon. Sempre responde a partir do estado `process.*` — o daemon nunca gera um filho ACP para servir esta rota, e a resposta é idêntica se o ACP estiver ativo ou ocioso. O campo `acpChannelLive` é apenas informativo.

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

**Política de redação.** Células `kind: 'env_var'` nunca incluem um campo `value`; os clientes veem apenas `present: boolean`. Células `kind: 'proxy'` executam o valor bruto da variável de ambiente através da redação de credenciais (`redactProxyCredentials`) e depois através do parsing de `URL`, de modo que a rede transporta apenas `host:port`. `NO_PROXY` é passado pela redação literalmente, pois é uma lista de hosts e não uma URL. A whitelist de variáveis de ambiente secretas enumeradas atualmente inclui `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` e `QWEN_SERVER_TOKEN`. Outras variáveis de ambiente não são enumeradas, então segredos definidos acidentalmente permanecem invisíveis.

### `GET /workspace/preflight`

Relata as verificações de prontidão do daemon. **Células no nível do daemon** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) são sempre populadas a partir de `process.*` e `node:fs`. **Células no nível do ACP** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) requerem um filho ACP ativo — quando o daemon está ocioso, elas emitem placeholders com `status: 'not_started'`. A rota nunca gera um ACP apenas para popular células; as células correspondentes recorrem a `not_started`.

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
  ou uma subclasse de `ModelConfigError` propagada a partir da resolução do
  provedor.
- `init_timeout` — Rejeição de `withTimeout` na bridge (um timeout real
  enquanto aguarda um roundtrip do ACP). Reconhecido pela classe tipada
  `BridgeTimeoutError`. Nota: uma célula `warning` transitória de `mcp_discovery`
  com `connecting > 0` NÃO carrega este tipo — isso é um estado normal de
  handshake em andamento, distinto de um timeout real.
- `protocol_error` — `extMethod` do ACP rejeitado porque o canal fechou
  no meio da requisição, ou porque o registro de ferramentas estava
  inesperadamente ausente.
- `blocked_egress` — reservado para o PR 14 (#4175). O PR 13 deixa a
  célula `egress` como `status: 'not_started'`.

Se a bridge falhar ao alcançar o filho ACP ao servir uma requisição de preflight
(ex.: um fechamento de canal no meio da requisição), o array `errors` do envelope
carrega um único `ServeStatusCell` descrevendo a falha e as células fazem fallback
para placeholders ACP `not_started`. Células de nível do daemon ainda são retornadas.

### Rotas de arquivos do workspace

Todos os caminhos de arquivo são resolvidos através do workspace vinculado do daemon.
As respostas usam caminhos relativos ao workspace e nunca retornam caminhos absolutos
do sistema de arquivos para casos de sucesso normais. Respostas de arquivo bem-sucedidas
incluem:

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

Lê um arquivo de texto. Parâmetros de query: `path` (obrigatório), `maxBytes`, `line` e
`limit`. O daemon rejeita arquivos binários e arquivos acima do limite de leitura de texto.
A resposta inclui `hash`, um digest SHA-256 sobre os bytes brutos no disco para o arquivo
inteiro, mesmo quando `line`, `limit` ou `maxBytes` retornaram uma fatia (slice).

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

Lê bytes brutos de um arquivo sem decodificar. Parâmetros de query: `path` (obrigatório),
`offset` (padrão `0`) e `maxBytes` (padrão `65536`, máximo `262144`). Esta rota suporta
janelas limitadas em arquivos binários grandes sem carregar o arquivo inteiro. A resposta
inclui `hash` apenas quando a janela retornada cobre o arquivo inteiro.

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

`mode` deve ser `create` ou `replace`. `create` nunca sobrescreve um arquivo existente
(`409 file_already_exists`). `replace` requer `expectedHash`; hashes ausentes ou
malformados resultam em `400 parse_error`, e hashes desatualizados resultam em
`409 hash_mismatch`. `expectedHash` é `sha256:` mais 64 caracteres hexadecimais
minúsculos, computados sobre os bytes brutos no disco.

`bom`, `encoding` e `lineEnding` podem ser fornecidos. A substituição preserva o perfil
de codificação do arquivo existente por padrão; campos explícitos o sobrescrevem.
Escrita de binários está fora do escopo.

O daemon escreve em um arquivo temporário aleatório no diretório de destino, faz fsync
onde suportado, re-verifica o hash atual imediatamente antes do `rename()` e, em seguida,
renomeia para o local final. Isso impede a observação de arquivos parciais e serializa
escritas originadas pelo daemon no mesmo arquivo, mas não é um compare-and-swap de kernel
entre processos: um editor externo ainda pode competir na pequena janela entre a
verificação final do hash e a renomeação.

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

Aplica uma substituição de texto exata em um arquivo de texto existente. Esta também é uma
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
A rota preserva a codificação, BOM e quebras de linha, e re-verifica o `expectedHash`
imediatamente antes da renomeação atômica.

Escritas/edições explícitas em caminhos ignorados são permitidas porque o chamador
autenticado nomeou o caminho. Respostas de sucesso e eventos de auditoria incluem
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

`availableCommands` é o mesmo snapshot de comandos usado pela notificação SSE
`available_commands_update`. `availableSkills` lista apenas os nomes das skills;
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
    },
    {
      "kind": "agent",
      "id": "agent-2",
      "label": "general-purpose: run the failing test",
      "description": "run the failing test",
      "status": "running",
      "startTime": 1699999999500,
      "runtimeMs": 500,
      "outputFile": "/tmp/agent-2.jsonl",
      "isBackgrounded": false,
      "subagentType": "general-purpose",
      "parentAgentId": "agent-1",
      "parentName": "reviewer",
      "depth": 1
    }
  ]
}
```

Esta rota é um snapshot read-only out-of-band. Intencionalmente não é um prompt e pode
ser consultada enquanto a sessão está em streaming. A resposta contém apenas metadados
na whitelist dos registros de tarefas do agent, shell e monitor; controllers, timers,
offsets, mensagens pendentes e objetos brutos do registro nunca são expostos.

Tarefas de agent geradas por outro sub-agent (sub-agents aninhados, limitados por
`maxSubagentDepth`) carregam três campos de linhagem opcionais: `parentAgentId` (o `id`
da tarefa do agent gerador), `parentName` (o `subagentType` do agent gerador, capturado
no registro para que sobreviva à evicção do parent do registro) e `depth` (profundidade
de lançamento baseada em 0; 0 = gerado pela sessão de nível superior). Agents lançados
pela sessão de nível superior omitem `parentAgentId` e `parentName`; os clientes devem
tratar todos os três campos como opcionais e fazer fallback para uma lista plana quando
estiverem ausentes.

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

`status` é um entre `NOT_STARTED`, `IN_PROGRESS`, `READY` ou `FAILED`. O `error` opcional
está presente em servidores com falha quando disponível. LSP desabilitado (incluindo o
modo bare) retorna HTTP 200 com `enabled: false`, contagens zero e `servers: []`. LSP
habilitado sem servidores configurados retorna `enabled: true`, `configuredServers: 0` e
`servers: []`. Se a inicialização falhar antes do cliente existir, a resposta pode incluir
`initializationError`; se um cliente ativo não puder fornecer um snapshot, a resposta
inclui `statusUnavailable: true`.

Esta rota expõe apenas campos estáveis voltados para o cliente. Intencionalmente omite
detalhes internos de depuração, como IDs de processo, argumentos de spawn, caudas de
stderr, URIs raiz e caminhos de pastas do workspace.

### `POST /session`

Gera um novo agent ou anexa a um existente (sob `sessionScope: 'single'`, o padrão).

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
| `cwd`            | não      | Caminho absoluto correspondente ao workspace vinculado do daemon. Se omitido, a rota faz fallback para `boundWorkspace` (leia em `/capabilities.workspaceCwd`). Um `cwd` não vazio incompatível retorna `400 workspace_mismatch` (#3803 §02 — 1 daemon = 1 workspace). Os caminhos do workspace são canonizados via `realpathSync.native` (com um fallback de apenas resolução para caminhos inexistentes) para que sistemas de arquivos case-insensitive não rejeitem sessões por diferenças de grafia.                                                                                                                                                                          |
| `modelServiceId` | não      | Seleciona qual _model service_ configurado o agent usará como rota (o provedor de back-end — Alibaba ModelStudio, OpenRouter, etc). Se omitido, o agent usa o seu padrão. Se o workspace já tiver uma sessão, isso chama `setSessionModel` na existente e transmite `model_switched`. Distinto de `modelId` em `POST /session/:id/model`, que seleciona o modelo **dentro** de um serviço já vinculado. O array `modelServices` em `/capabilities` é reservado para anunciar serviços configurados; no Stage 1, é sempre `[]` (o serviço padrão do agent é usado e não enumerado via HTTP). |
| `sessionScope`   | não      | Substituição por requisição para compartilhamento de sessão. `'single'` (o padrão em todo o daemon) faz com que um segundo `POST /session` no mesmo workspace reutilize a sessão existente (`attached: true`); `'thread'` força uma nova sessão distinta a cada chamada. Omita para herdar o padrão em todo o daemon. Valores fora do enum retornam `400 { code: 'invalid_session_scope' }`. Daemons antigos (anteriores ao PR 5 do #4175) ignoram o campo silenciosamente — faça pre-flight de `caps.features.session_scope_override` antes de enviar. O padrão em todo o daemon está codificado como `'single'` em produção hoje; o #4175 pode adicionar uma flag CLI `--sessionScope` em um follow-up.         |
Resposta:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` significa que já existia uma sessão para esse workspace e agora você está compartilhando-a.

Integrações multi-cliente que desejam conversas independentes devem enviar
`sessionScope: "thread"` em cada `POST /session`. Use o escopo padrão `single`
apenas quando os clientes compartilham intencionalmente uma sessão colaborativa; sessões
compartilhadas serializam prompts através de um FIFO, visível através de
`/daemon/status` como `runtime.activity.pendingPrompts` e
`runtime.activity.queuedPrompts`.

Chamadas concorrentes de `POST /session` para o mesmo workspace são **consolidadas** em um único spawn — ambos os chamadores recebem o mesmo `sessionId`, e exatamente um reporta `attached: false`. Se o spawn subjacente falhar (timeout de inicialização, saída do agente malformada, OOM), **todos os chamadores consolidados recebem o mesmo erro** — o slot em andamento é limpo para que uma chamada subsequente possa tentar novamente do zero.

> ⚠️ **A rejeição de `modelServiceId` em uma nova sessão é silenciosa na
> resposta HTTP.** Um `modelServiceId` inválido (erro de digitação, serviço não configurado)
> NÃO retorna 500 na criação — a sessão permanece operacional no
> modelo padrão do agente para que o chamador ainda receba um `sessionId` com o qual
> possa tentar novamente a troca de modelo (via `POST /session/:id/model`).
> O sinal de falha visível é um evento `model_switch_failed` no
> stream SSE da sessão, disparado entre o handshake de spawn e sua
> primeira inscrição. **Assinantes que precisam observar este evento
> devem passar `Last-Event-ID: 0` em seu primeiro `GET
/session/:id/events`** para repetir a partir do evento mais antigo disponível no ring
> (isso cobre o `model_switch_failed` do momento do spawn, mesmo que a
> inscrição ocorra alguns ms após a resposta de criação).

### `POST /session/:id/load`

Restaura uma sessão ACP persistida por id e repete seu histórico através do SSE. O id no path é autoritativo; qualquer campo `sessionId` no body é ignorado. Pré-verifique `caps.features.session_load` — daemons mais antigos retornam `404` para esta rota.

Requisição:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Campo | Obrigatório | Notas                                                                                                                                                                                                                                |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | não         | Mesmas regras de canonização + `workspace_mismatch` que o `POST /session`. Omita para herdar `/capabilities.workspaceCwd`. `mcpServers` intencionalmente NÃO é aceito aqui — o MCP em todo o daemon é orientado por configurações (igual ao `POST /session`). |

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

`state` espelha o `LoadSessionResponse` do ACP — `models` é um `SessionModelState`, `modes` um `SessionModeState`, `configOptions` um array de `SessionConfigOption`. Campos ausentes são decididos pelo agente. Assinantes tardios (os caminhos `attached: true` abaixo) recebem o MESMO snapshot de `state` que o chamador original do load viu — o daemon o armazena em cache na entrada; mutações em runtime (ex.: `model_switched`) são entregues no stream SSE, não nas respostas de attach subsequentes.

`attached: true` significa que a sessão já estava ativa (seja de um `session/load`/`session/resume` anterior, ou porque um chamador concorrente consolidado ganhou a corrida por pouco).

**Repetição de histórico via SSE.** Enquanto o `loadSession` está em andamento no lado do agente, o agente emite notificações `session_update` para cada turno persistido. O daemon os armazena em buffer no event-bus da sessão antes que a resposta da rota retorne, então os assinantes que chamarem imediatamente `GET /session/:id/events` com `Last-Event-ID: 0` verão a repetição completa. **O ring de repetição é limitado** (padrão de 8000 frames por sessão). Históricos longos com muitos turnos de tool-call / thought-stream podem exceder isso — os frames mais antigos são descartados silenciosamente. Clientes que precisam do histórico completo devem se inscrever imediatamente após o `load` retornar; alternativamente, eles podem persistir os ids dos eventos SSE e usar `Last-Event-ID` para retomar a partir de um limite de turno posterior.

**Erros:**

- `404` — o id da sessão persistida não existe (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (mesmo formato que `POST /session`).
- `503` — `session_limit_exceeded` (conta contra `--max-sessions`; restaurações em andamento também são contabilizadas).
- `409` — `restore_in_progress` (um `session/resume` para o mesmo id já está em andamento). `Retry-After: 5`. Corridas de mesma ação (dois `session/load` concorrentes para o mesmo id) são consolidadas — exatamente um retorna `attached: false`, o resto retorna `attached: true` com o mesmo `state`.
- `409` — `session_archived` quando o id existe apenas em `chats/archive/`; chame `POST /sessions/unarchive` antes de `load` ou `resume`.
- `409` — `session_archiving` quando o arquivamento ou desarquivamento está em andamento para o mesmo id. `Retry-After: 5`.
- `409` — `session_conflict` quando o id existe tanto em `chats/` quanto em `chats/archive/`; exclua a sessão com `POST /sessions/delete` antes de carregar.

### `POST /session/:id/resume`

Restaura uma sessão ACP persistida por id SEM repetir o histórico através do SSE. O contexto do modelo é restaurado internamente no lado do agente (via `geminiClient.initialize` lendo `config.getResumedSessionData`); o stream SSE permanece limpo para clientes que já têm o histórico renderizado. Pré-verifique `caps.features.session_resume`; `unstable_session_resume` permanece como um alias de compatibilidade obsoleto para clientes mais antigos.

Mesmo formato de requisição que `/load`. Mesmo formato de resposta — `state` espelha o `ResumeSessionResponse` do ACP. Mesmo envelope de erros, incluindo `409 restore_in_progress` (que dispara quando um `session/load` está em andamento; `session/resume` em corrida atrás de outro `session/resume` é consolidado).

Use `/load` quando o cliente não tiver histórico renderizado (reconexão a frio, seletor → abrir). Use `/resume` quando o cliente já tiver os turnos na tela e precisar apenas do handle do lado do daemon de volta.

> ⚠️ **Por que `unstable_session_resume` ainda é anunciado?** A rota HTTP do daemon e a capability `session_resume` são estáveis para a v1, mas a bridge ainda chama `connection.unstable_resumeSession` do ACP. A tag antiga permanece apenas para que SDKs lançados antes do `session_resume` possam continuar funcionando.

### `GET /workspace/:id/sessions`

Lista sessões persistidas cujo workspace canônico corresponde a `:id` (cwd absoluto codificado por URL). A lista padrão são as sessões ativas de `chats/`; passe `archiveState=archived` para listar sessões arquivadas de `chats/archive/`. `archiveState=all` não é suportado na v1. A resposta padrão e a semântica numérica do `cursor` não são alteradas por `session_organization`.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
```

Parâmetros de query:

| Campo          | Obrigatório | Notas                                                                                                                                                                                           |
| -------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | não         | `active` (padrão) ou `archived`. Qualquer outro valor retorna `400 { code: "invalid_archive_state" }`.                                                                                          |
| `cursor`       | não         | Cursor de paginação da resposta anterior.                                                                                                                                                       |
| `size`         | não         | Tamanho da página. Valores inválidos retornam `400 { code: "invalid_cursor" }` ou a validação de tamanho de página existente.                                                                   |
| `view`         | não         | Omita para a lista recente legada. `organized` opta pela ordenação de pinned/group no lado do servidor e adiciona campos opcionais de organização. Qualquer outro valor retorna `400 { code: "invalid_session_view" }`. |
| `group`        | não         | Significativo apenas com `view=organized`. `all` (padrão), `pinned`, `ungrouped` ou um id de grupo personalizado. Ids de grupo desconhecidos retornam `404 { code: "group_not_found" }`.         |

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
      "hasActivePrompt": false,
      "isArchived": false
    }
  ],
  "nextCursor": 1772251200000
}
```

Com `view=organized`, o daemon lê `<Storage.getProjectDir(cwd)>/session-organization.v1.json`, retorna as sessões pinned primeiro, depois tempo de atividade em ordem decrescente e, em seguida, `sessionId` para empates estáveis. O cursor organizado é um JSON base64url opaco e não deve ser reutilizado com a lista recente legada. `pinned` é um filtro virtual, não um grupo. `groupId: null` significa sem grupo. Sessões arquivadas mantêm seus metadados de organização, mas `archiveState=archived&view=organized` ainda retorna apenas sessões arquivadas.

Campos adicionais podem aparecer em cada sessão quando `view=organized`:

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

Listas ativas incluem campos de overlay ao vivo do daemon, como `clientCount` e `hasActivePrompt`. Listas arquivadas são apenas de armazenamento: `isArchived` é `true`, e os campos de overlay ao vivo permanecem ausentes ou falsos. Array vazio (não 404) quando não existem sessões — uma UI de seletor de sessão não deve dar erro apenas porque o workspace está ocioso.

### `GET /workspace/:id/session-groups`

Lista grupos de sessão definidos pelo usuário para um workspace. Pré-verifique `caps.features.includes('session_organization')`.

Resposta:

```json
{
  "groups": [
    {
      "id": "018f...",
      "name": "Frontend",
      "color": "blue",
      "order": 0,
      "createdAt": "2026-07-04T12:00:00.000Z",
      "updatedAt": "2026-07-04T12:00:00.000Z"
    }
  ],
  "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
}
```

As cores são apenas tokens de protocolo; os clientes localizam os nomes de exibição. Nenhum grupo padrão nomeado por cor é criado.

### `POST /workspace/:id/session-groups`

Cria um grupo de sessão personalizado. Controle de mutação estrito. Pré-verifique `caps.features.includes('session_organization')`.

Requisição:

```json
{ "name": "Frontend", "color": "blue" }
```

`name` tem os espaços em branco das extremidades removidos, deve ter de 1 a 64 caracteres, não pode conter caracteres de controle e é único dentro do workspace por comparação sem distinção entre maiúsculas e minúsculas e sem espaços. Nomes duplicados retornam `409 { code: "group_name_conflict" }`. `color` deve ser uma das `colorOptions` retornadas.

Resposta:

```json
{
  "group": {
    "id": "018f...",
    "name": "Frontend",
    "color": "blue",
    "order": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### `PATCH /workspace/:id/session-groups/:groupId`

Atualiza um grupo de sessão personalizado. Controle de mutação estrito. Pré-verifique `caps.features.includes('session_organization')`. Os campos do body são opcionais: `{ "name"?: string, "color"?: string, "order"?: number }`. Ids de grupo desconhecidos retornam `404 { code: "group_not_found" }`; nomes e cores duplicados/inválidos usam os mesmos erros da criação.

### `DELETE /workspace/:id/session-groups/:groupId`

Exclui um grupo de sessão personalizado. Controle de mutação estrito. Pré-verifique `caps.features.includes('session_organization')`. Sessões que referenciam o grupo são limpas para `groupId: null`; o estado de pinned é preservado. A resposta é `{ "deleted": true }` quando um grupo foi removido e `{ "deleted": false }` quando o id não existia.
### `POST /sessions/delete`

Exclui permanentemente um ou mais arquivos JSONL de sessão persistidos. O daemon primeiro tenta fechar as sessões ativas, depois remove o JSONL ativo ou arquivado. Se existirem cópias ativas e arquivadas para o mesmo id, ambas são removidas. Os sidecars do worktree em ambos os lados são limpos; o histórico de arquivos, transcrições de subagentes e sidecars de runtime são intencionalmente preservados.

Solicitação:

```json
{ "sessionIds": ["<uuid>"] }
```

Resposta:

```json
{
  "removed": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

### `POST /sessions/archive`

Arquiva uma ou mais sessões. O arquivamento é uma transição de estado, não uma exclusão: o JSONL é movido de `chats/<id>.jsonl` para `chats/archive/<id>.jsonl`. O histórico de arquivos, transcrições de subagentes e sidecars de runtime permanecem no lugar. Se uma sessão estiver ativa, o daemon primeiro realiza um fechamento rigoroso e exige que o manipulador de fechamento do agente ACP faça o flush da gravação do chat; se o fechamento ou o flush falhar, o JSONL não será movido. Verificação prévia `caps.features.session_archive`.

Solicitação:

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` deve ser um array de strings não vazio com no máximo 100 ids. Duplicatas são consolidadas.

Resposta:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

As entradas de `errors` têm o formato `{ "sessionId": "<uuid>", "error": "message" }`. Arquivos ativos e arquivados com o mesmo id são tratados como um conflito e reportados em `errors`; nenhum arquivo é sobrescrito.

### `POST /sessions/unarchive`

Restaura sessões arquivadas para o diretório ativo. Isso não retoma a sessão por si só; apenas move `chats/archive/<id>.jsonl` de volta para `chats/<id>.jsonl`. Após o sucesso do desarquivamento, os clientes podem chamar `POST /session/:id/load` ou `POST /session/:id/resume`.

Solicitação:

```json
{ "sessionIds": ["<uuid>"] }
```

Resposta:

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "notFound": [],
  "errors": []
}
```

Se um JSONL ativo já existir para o id, o desarquivamento reporta um conflito em `errors` e não o sobrescreve. Um arquivamento ou desarquivamento em andamento para o mesmo id retorna `409 session_archiving` antes de iniciar o lote.

O ACP-over-HTTP usa os mesmos corpos de solicitação e resposta por meio dos métodos de fornecedor `_qwen/sessions/archive` e `_qwen/sessions/unarchive`. A tabela de rotas REST mapeia `POST /sessions/archive` e `POST /sessions/unarchive` para esses métodos para transportes ACP.

### `POST /session/:id/prompt`

Encaminha um prompt para o agente. Chamadores de múltiplos prompts enfileiram em FIFO por sessão (o ACP garante um prompt ativo por sessão).

Solicitação:

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

Se o cliente HTTP desconectar no meio do prompt, o daemon envia uma notificação ACP `cancel` para o agente, que encerra o prompt com `stopReason: "cancelled"`.

> **Limitação da Fase 1 — sem timeout de prompt no lado do servidor.** A bridge
> apenas coloca em corrida o `prompt()` do agente contra o `transportClosedReject`
> (o crash do processo filho do agente) e o AbortSignal de desconexão HTTP
> do chamador. Um agente travado mas vivo (por exemplo, uma chamada de modelo que
> trava) bloqueia o FIFO por sessão até que o cliente HTTP atinja o timeout
> do seu lado e desconecte. Prompts de longa execução são legítimos
> (pesquisa profunda, análise de codebase grande), portanto, um deadline padrão
> não é definido deliberadamente; a Fase 2 exporá um `promptTimeoutMs`
> configurável como opt-in. Até lá, os chamadores devem definir seu próprio
> timeout no lado do cliente e desconectar (ou chamar
> `POST /session/:id/cancel`) na expiração.

### `POST /session/:id/cancel`

Cancela o prompt **atualmente ativo** na sessão. No lado do ACP, isso é uma notificação, não uma solicitação — o agente reconhece resolvendo o `prompt()` ativo com `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrato de múltiplos prompts:** o cancelamento afeta apenas o prompt ativo. Quaisquer prompts que o mesmo cliente enviou anteriormente via POST e que ainda estão enfileirados atrás do ativo continuarão a ser executados. O enfileiramento de múltiplos prompts é um comportamento introduzido pelo daemon (não está na especificação do ACP); o contrato para prompts enfileirados é "eles continuam executando a menos que você cancele cada um, ou encerre a sessão via saída do canal".

Se prompts enfileirados forem inesperados em uma implantação multi-cliente, primeiro confirme
se os chamadores estão compartilhando uma sessão padrão `sessionScope: "single"`. Para
conversas independentes por thread, crie sessões com
`sessionScope: "thread"` para que os prompts sejam serializados apenas dentro dessa thread.

### `DELETE /session/:id`

Fecha explicitamente uma sessão ativa. Força o fechamento mesmo quando outros clientes estão conectados — cancela qualquer prompt ativo, resolve permissões pendentes como canceladas, publica o evento `session_closed`, fecha o EventBus e remove a sessão dos mapas do daemon. Sessões persistidas em disco NÃO são excluídas — elas podem ser recarregadas via `POST /session/:id/load`. Verificação prévia `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotente: retorna `404` para sessões desconhecidas (mesmo formato de `SessionNotFoundError` que outras rotas).

> **Evento `session_closed`.** Assinantes SSE recebem um evento terminal `session_closed` com `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` antes do stream terminar. Redutores do SDK tratam isso de forma idêntica ao `session_died` (define `alive: false`, limpa `pendingPermissions`).

### `PATCH /session/:id/metadata`

Atualiza metadados mutáveis da sessão. Atualmente suporta apenas `displayName`. Verificação prévia `caps.features.session_metadata`. Agrupamento e fixação (pinning) não fazem parte intencionalmente desta rota; use `PATCH /session/:id/organization` sob `session_organization`.

Solicitação:

```json
{ "displayName": "My Investigation Session" }
```

| Campo         | Obrigatório | Notas                                                                          |
| ------------- | ----------- | ------------------------------------------------------------------------------ |
| `displayName` | não         | String, máximo de 256 caracteres. String vazia limpa o nome. Omita para manter como está. |

Resposta:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Publica um evento `session_metadata_updated` no stream SSE da sessão com `{ sessionId, displayName }`.

### `PATCH /session/:id/organization`

Atualiza o estado de organização local da sessão. Gate de mutação estrito. Verificação prévia `caps.features.includes('session_organization')`.

Solicitação:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| Campo      | Obrigatório | Notas                                                                                                |
| ---------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | não         | Booleano. `true` define `pinnedAt` se ainda não estava fixado; `false` limpa `pinnedAt`.             |
| `groupId`  | não         | ID de grupo personalizado ou `null` para desagrupado. IDs de grupo desconhecidos retornam `404 { code: "group_not_found" }`. |

Resposta:

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "updatedAt": "2026-07-04T12:00:00.000Z"
}
```

Este estado é armazenado no sidecar de organização de sessão no nível do projeto, sob o diretório de armazenamento de runtime do daemon. Não é conteúdo de transcrição, não atualiza o `mtime` da transcrição, não é exportado com as transcrições e é preservado entre arquivamento/desarquivamento.

### `POST /session/:id/heartbeat`

Atualiza a contabilidade de last-seen do daemon para esta sessão. Adaptadores de longa duração (TUI/IDE/web) fazem ping nisso em um intervalo para que a futura política de revogação (Wave 5 PR 24) possa distinguir clientes mortos de clientes silenciosos.

Cabeçalhos:

| Cabeçalho          | Obrigatório | Notas                                                                                                                                                                                                                                   |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | não         | Ecoa o id emitido pelo daemon de `POST /session`. Clientes identificados também atualizam seu timestamp por cliente; heartbeats anônimos atualizam apenas a marca d'água por sessão. Deve satisfazer o mesmo formato `[A-Za-z0-9._:-]{1,128}` usado em outros lugares. |

O corpo da solicitação é vazio (`{}` está bom — nenhum campo é lido hoje).

Resposta:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` é ecoado apenas quando um `X-Qwen-Client-Id` confiável foi fornecido. `lastSeenAt` é a época `Date.now()` (ms) do lado do daemon que a bridge armazenou.

Erros:

- `400` — `{ code: 'invalid_client_id' }` quando o cabeçalho está malformado (regra de formato do cabeçalho) ou quando carrega um `clientId` que não está registrado para esta sessão (a bridge lança `InvalidClientIdError` antes de atualizar qualquer timestamp).
- `404` — sessão desconhecida.

Gating de capacidade: verificação prévia `caps.features.client_heartbeat`. Daemons mais antigos retornam `404` para este caminho.

### `POST /session/:id/model`

Altera o modelo ativo **dentro** do serviço de modelo atualmente vinculado da sessão. Serializado através da fila de alteração de modelo por sessão.

(Para alternar o _serviço_ em si — Alibaba ModelStudio vs OpenRouter etc — passe `modelServiceId` em `POST /session` para uma nova sessão. A Fase 1 não possui uma rota de alternância de serviço ao vivo.)

Solicitação:

```json
{ "modelId": "qwen-staging" }
```

Resposta:

```json
{ "modelId": "qwen-staging" }
```

Em caso de sucesso, publica `model_switched` no stream SSE. Em caso de falha, publica `model_switch_failed` (para que assinantes passivos vejam a falha, não apenas o chamador). Coloca em corrida contra a saída do canal do agente para que um processo filho travado não possa bloquear o manipulador HTTP.

### `POST /session/:id/recap`

Tag de capacidade: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Gera um resumo de uma frase "onde eu parei" da sessão. Envolve o `generateSessionRecap` do core (`packages/core/src/services/sessionRecap.ts`), que executa uma side-query contra o modelo rápido com ferramentas desabilitadas, `maxOutputTokens: 300`, e um formato de saída estrito `<recap>...</recap>`. A side-query lê o histórico de chat existente do GeminiClient da sessão e **não** adiciona a ele.

O corpo da solicitação é ignorado (envie `{}` ou vazio). Gate de mutação não estrito — a postura espelha `/session/:id/prompt` (a chamada custa tokens, mas não muta nenhum estado). Nenhum evento SSE é publicado.

Resposta (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` é `null` (um 200 normal, não um erro) quando:

- a sessão tem menos de dois turnos de diálogo até o momento,
- a side-query não retornou nenhum payload `<recap>...</recap>` extraível,
- ou ocorreu qualquer erro de modelo subjacente (o auxiliar do core é best-effort e nunca lança exceção).

Erros:

- `400 {code: 'invalid_client_id'}` — cabeçalho `X-Qwen-Client-Id` malformado.
- `404` — sessão desconhecida.

Cancelamento: **nenhum na v1**. A rota não escuta a desconexão do cliente HTTP, nenhum `AbortSignal` é conectado à bridge, e o processo filho do ACP executa a side-query até o fim, independentemente de o chamador ter desconectado. Os únicos limites são o timeout limite de 60s da bridge (`SESSION_RECAP_TIMEOUT_MS`) e a corrida de transporte fechado contra a morte do canal ACP. Isso é aceitável porque o recap é curto (tentativa única, `maxOutputTokens: 300`, ~1–5s típico); um ext-method de cancelamento baseado em request-id pode conectar um cancelamento completo de ponta a ponta em uma versão futura, se o custo de largura de banda algum dia justificar.

### Mutação: aprovação, ferramentas, init, reinício do MCP
A issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 adiciona quatro rotas de controle de mutação que permitem que clientes remotos alterem a postura de runtime sem interagir com a CLI do host do daemon. Todas as quatro:

- São protegidas pelo gate de mutação **strict** do PR 15. Um daemon configurado sem um bearer token as rejeita com `401 {code: 'token_required'}`. Configure `--token` (ou `QWEN_SERVER_TOKEN`) antes de habilitá-las.
- Aceitam e registram o header `X-Qwen-Client-Id` (cadeia de auditoria do PR 7). Quando o header carrega um id confiável, o daemon emite `originatorClientId` no evento SSE correspondente, permitindo que UIs multi-cliente suprimam ecos de suas próprias mutações.
- Fazem pre-flight de cada capacidade por tag antes de expor a funcionalidade. Daemons mais antigos retornam `404` para a rota.

Três das quatro rotas (`tools/:name/enable`, `init`, `mcp/:server/restart`) emitem eventos **workspace-scoped**: cada barramento SSE de sessão ativa recebe o evento, independentemente de qual sessão estava conectada quando a mutação foi acionada. `approval-mode` emite um evento **session-scoped** porque a alteração é local ao `Config` de uma única sessão.

#### `POST /session/:id/approval-mode`

Capability tag: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Altera o modo de aprovação de uma sessão ativa. O novo modo é aplicado imediatamente no `Config` por sessão do ACP child. As configurações NÃO são gravadas em disco por padrão — passe `persist: true` para também gravar `tools.approvalMode` nas configurações do workspace.

Request:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` deve ser um dos valores `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (espelho do enum `ApprovalMode` do core; o SDK exporta `DAEMON_APPROVAL_MODES` para validação em runtime). `persist` tem como padrão `false`.

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

Evento SSE (session-scoped): `approval_mode_changed` com `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Capability tag: `workspace_tool_toggle`. E/S de arquivo pura — sem roundtrip ACP.

Alterna o estado de um nome de ferramenta na lista de configurações `tools.disabled` do workspace. Ferramentas listadas ali **não são registradas** (diferente de `permissions.deny`, que mantém a ferramenta registrada e rejeita a invocação). Tanto ferramentas nativas quanto ferramentas descobertas via MCP passam por `ToolRegistry.registerTool`, que consulta o conjunto de desabilitadas.

> ⚠️ **Os nomes devem corresponder exatamente ao identificador exposto pelo registro.** Nenhuma resolução de alias é feita — a rota armazena qualquer string que esteja no parâmetro de caminho em `tools.disabled`, e o próximo ACP child compara com `tool.name` no momento do registro. Ferramentas nativas usam seu nome canônico de registro (forma de verbo em snake_case): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — NÃO os rótulos de exibição (`Shell`, `Read`, `Write`) que a CLI exibe. Ferramentas descobertas via MCP usam a forma qualificada `mcp__<server>__<name>` (que também é a forma transmitida pelos eventos `tool_toggled` e o que `GET /workspace/mcp` lista). Desabilitar `Bash` NÃO impedirá que `run_shell_command` seja registrado na próxima sessão.

ACP children ativos mantêm as ferramentas já registradas — a alteração entra em vigor no **próximo** spawn de ACP child. Combine com `POST /workspace/mcp/:server/restart` (para ferramentas originadas de MCP) ou com a criação de uma nova sessão para tornar a alteração efetiva no daemon atual.

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

- `400 {code: 'invalid_tool_name'}` — parâmetro de caminho vazio ou excede o limite de 256 caracteres.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` ausente ou não booleano.

Evento SSE (workspace-scoped): `tool_toggled` com `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Capability tag: `workspace_init`. E/S de arquivo pura — sem roundtrip ACP, **sem invocação de LLM**.

Cria a estrutura de um `QWEN.md` vazio (ou o que `getCurrentGeminiMdFilename()` retornar sob os overrides de `--memory-file-name`) na raiz do workspace vinculado ao daemon. Apenas mecânico — para preenchimento de conteúdo por IA, faça um follow-up com `POST /session/:id/prompt`.

Por padrão, recusa sobrescrever quando o arquivo de destino existe com conteúdo que não seja apenas espaços em branco. Arquivos contendo apenas espaços em branco são tratados como ausentes (comportamento igual ao comando slash local `/init`).

Request:

```json
{ "force": false }
```

Response (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` é `'created'` para criações novas, `'noop'` quando um arquivo existente contendo apenas espaços em branco foi deixado intacto (nenhuma gravação realizada) e `'overwrote'` quando `force: true` substituiu conteúdo não vazio. O evento SSE `workspace_initialized` espelha a ação da resposta — observadores podem filtrar por `action !== 'noop'` para reagir apenas a alterações reais no disco.

Errors:

- `400 {code: 'invalid_force_flag'}` — `force` não é booleano.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — o arquivo existe com conteúdo que não seja apenas espaços em branco e `force` foi omitido ou é false. O corpo carrega o caminho absoluto e o tamanho (em bytes) para que clientes do SDK possam exibir um prompt "sobrescrever N bytes?" sem precisar fazer um novo stat.

Evento SSE (workspace-scoped): `workspace_initialized` com `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Capability tag: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Reinicia um servidor MCP configurado através do `McpClientManager.discoverMcpToolsForServer` do ACP child (disconnect + reconnect + rediscover). Faz uma pré-verificação do snapshot de orçamento em tempo real da contabilidade do PR 14 v1, de modo que uma reinicialização em um workspace com orçamento saturado retorna uma recusa suave em vez de acionar uma cascata de `BudgetExhaustedError`.

O corpo da request está vazio (`{}`). O parâmetro de caminho é o nome do servidor codificado por URL conforme aparece na configuração `mcpServers`.

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

| `reason`                | Significado                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Outra descoberta / reinicialização para este servidor já está em andamento. A rota retorna imediatamente em vez de aguardar a promise original. O chamador deve tentar novamente após um curto atraso. |
| `'disabled'`            | O servidor está configurado, mas listado em `excludedMcpServers`. Reabilite-o antes de reiniciar.                                                                                   |
| `'budget_would_exceed'` | O daemon está com `--mcp-budget-mode=enforce`, o servidor de destino não está atualmente em `reservedSlots` e o total em tempo real atingiu `clientBudget`. O chamador deve liberar um slot primeiro. |

Errors (non-2xx):

- `400 {code: 'invalid_server_name'}` — parâmetro de caminho vazio.
- `404` — nome do servidor não está na configuração `mcpServers` ou não existe nenhum canal ACP ativo (a reinicialização requer inerentemente uma instância ativa de `McpClientManager`).
- `500` — erro interno (ex.: `ToolRegistry` não inicializado).

Eventos SSE (workspace-scoped): `mcp_server_restarted` com `{serverName, durationMs, originatorClientId?}` em caso de sucesso; `mcp_server_restart_refused` com `{serverName, reason, originatorClientId?}` em caso de skip suave.

### `GET /session/:id/events` (SSE)

Inscreve-se no stream de eventos da sessão.

Headers:

```
Accept: text/event-stream
Last-Event-ID: 42        ← opcional, faz replay a partir do id 42
```

Query params:

| Param       | Obrigatório | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | não         | Limite de **backlog de frames ao vivo** por assinante. Intervalo `[16, 2048]`, padrão 256. Frames de replay forçados no momento da assinatura são isentos dos limites de frame e byte; o que realmente os consome são eventos ao vivo que chegam enquanto o assinante ainda está drenando um grande replay de `Last-Event-ID: 0`. Aumente o valor para reconexões a frio para que a cauda ao vivo não acione o aviso de cliente lento / evicção antes que o consumidor alcance o ritmo. O limite de bytes serializados ao vivo é fixo no lado do daemon (padrão 2 MiB) e não possui parâmetro de query. Valores fora do intervalo / não decimais / presentes mas vazios retornam `400 invalid_max_queued` antes da abertura do handshake SSE. Faça pre-flight em `caps.features.slow_client_warning` — daemons antigos ignoram o parâmetro silenciosamente. |

Formato do frame. A linha `data:` é o **envelope de evento completo**, serializado em JSON em uma única linha — `{id?, v, type, data, originatorClientId?}`. O payload específico do ACP (argumentos de `sessionUpdate`, `requestPermission`, etc.) fica sob o campo `data` do envelope; o próprio `type` do envelope corresponde à linha `event:` do SSE.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← a cada 15s, sem payload

event: client_evicted    ← frame terminal, sem id (sintético)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← frame terminal para overflow de bytes, sem id (sintético)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

As linhas `id:` / `event:` no nível do SSE duplicam `envelope.id` / `envelope.type` para compatibilidade com EventSource. Consumidores de `fetch` puro (como o `parseSseStream` do SDK) leem tudo a partir do envelope JSON e ignoram as linhas de preâmbulo do SSE.
| Tipo de evento              | Gatilho                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`            | Qualquer notificação ACP `sessionUpdate` (chunks do LLM, chamadas de ferramentas, uso)                                                                                                                                                                                                                                                                                                                                                                                                        |
| `permission_request`        | O agente solicitou aprovação de ferramenta                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `permission_resolved`       | Algum cliente votou em uma permissão via `POST /permission/:requestId`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `permission_partial_vote`   | (apenas consensus) Um voto foi registrado, mas o quórum ainda não foi atingido. Carrega `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pre-flight `caps.features.permission_mediation`.                                                                                                                                                                                                                                                                          |
| `permission_forbidden`      | Um voto foi rejeitado pela política ativa (incompatibilidade de `designated`, `local-only` non-loopback, ou votante `consensus` não está no snapshot). Carrega `{requestId, sessionId, clientId?, reason}`. Pre-flight `caps.features.permission_mediation`.                                                                                                                                                                                                                                  |
| `model_switched`            | `POST /session/:id/model` bem-sucedido                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `model_switch_failed`       | `POST /session/:id/model` rejeitado                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `session_died`              | O agente filho travou inesperadamente. **Terminal: o stream SSE fecha após este frame; a sessão é removida de `byId`.** Os assinantes devem reconectar via `POST /session` para criar uma nova.                                                                                                                                                                                                                                                                                                |
| `slow_client_warning`       | Local do assinante: backlog de frames ao vivo ou backlog de bytes serializados ao vivo ≥ 75% cheio. **Não terminal** — o stream continua; o aviso é um alerta prévio antes da expulsão. Carrega `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}` onde `threshold` é `frames`, `bytes` ou `frames_and_bytes`. Dispara UMA VEZ por episódio de overflow; rearma após ambas as medições drenarem abaixo de 37,5%. Sem `id` (sintético). Pre-flight `caps.features.slow_client_warning`. |
| `client_evicted`            | Local do assinante: overflow da fila. `reason` é `queue_overflow` para o limite de frames ao vivo e `queue_bytes_overflow` para o limite de bytes serializados ao vivo. **Terminal: o stream SSE fecha após este frame** (sem `id` — sintético). Outros assinantes na mesma sessão continuam.                                                                                                                                                                                                |
| `stream_error`              | Erro no lado do daemon durante o fan-out. **Terminal: o stream SSE fecha após este frame** (sem `id` — sintético).                                                                                                                                                                                                                                                                                                                                                                            |

Semântica de reconexão:

- Envie `Last-Event-ID: <n>` para repetir eventos com `id > n` do ring por sessão (profundidade padrão **8000**, ajustável via `qwen serve --event-ring-size <n>`)
- **Detecção de lacuna (lado do cliente):** se `<n>` for anterior ao evento mais antigo ainda no ring (ex.: você reconecta com `Last-Event-ID: 50`, mas o ring agora contém 200–1199), o daemon repete a partir do evento disponível mais antigo sem gerar erro. Compare o `id` do primeiro evento repetido com `n + 1`; qualquer diferença é o tamanho da janela perdida. O Stage 2 injetará um frame sintético `stream_gap` explícito no lado do daemon; no Stage 1, a detecção é responsabilidade do cliente.
- Os IDs são monóticos por sessão, começando em 1
- Frames sintéticos (`client_evicted`, `slow_client_warning`, `stream_error`) omitem intencionalmente o `id` para não consumirem um slot de sequência para outros assinantes

Backpressure:

- A fila por assinante tem como padrão `maxQueued: 256` itens ao vivo, mais um limite de 2 MiB de bytes serializados ao vivo pertencente ao daemon. Frames de repetição durante a reconexão, `slow_client_warning` e `client_evicted` ignoram ambos os limites.
- Substitua apenas o limite de frames via `?maxQueued=N` (intervalo `[16, 2048]`) na requisição SSE. Não há deliberadamente um `?maxQueuedBytes`; os clientes não podem aumentar o orçamento de memória do daemon.
- Quando o backlog de frames ao vivo ou o backlog de bytes ao vivo de um assinante ultrapassa 75% de capacidade, o bus força o envio de um frame sintético `slow_client_warning` para esse assinante (uma vez por episódio de overflow; rearmado após ambas as medições drenarem abaixo de 37,5%). O stream permanece aberto — o aviso é um alerta para que o cliente possa drenar mais rápido ou desanexar e reconectar de forma limpa.
- Se o limite de frames ao vivo sofrer overflow, o bus emite `client_evicted` com `reason: "queue_overflow"`. Se o limite de bytes ao vivo sofrer overflow, emite `reason: "queue_bytes_overflow"`. Em ambos os casos, o frame terminal é forçado e a assinatura é encerrada.

### `POST /permission/:requestId`

Registre um voto em uma `permission_request` pendente. A **política de mediação** ativa decide quem vence:

| Política                      | Comportamento                                                                                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (padrão)    | Qualquer votante validado vence; votantes posteriores recebem `404`. Linha de base pré-F3.                                                                                                                                                                            |
| `designated`                  | Apenas o originador do prompt (`originatorClientId`) decide; não originadores recebem `403 permission_forbidden / designated_mismatch`. Faz fallback para first-responder para prompts anônimos.                                                                       |
| `consensus`                   | N de M votantes devem concordar (padrão `N = floor(M/2) + 1`, substituído via `policy.consensusQuorum`). A primeira opção a atingir `N` vence. Votos não resolutivos recebem frames SSE `200` + `permission_partial_vote`.                                             |
| `local-only`                  | Apenas votantes loopback decidem; chamadores remotos recebem `403 permission_forbidden / remote_not_allowed`.                                                                                                                                                         |

A política ativa é configurada em `settings.json` sob `policy.permissionStrategy` e exposta em `/capabilities` em `body.policy.permission`. Pre-flight `caps.features.permission_mediation` (com `modes: [...]`) para o conjunto suportado pelo build.

> **F3 (#4175): coordenação de permissões multi-cliente.** O F3 adicionou as quatro políticas acima. Daemons pré-F3 tinham first-responder em hardcode; o formato do wire permanece inalterado bit a bit quando a política configurada é `first-responder`. Novos eventos (`permission_partial_vote`, `permission_forbidden`) são aditivos — SDKs antigos os veem como `unrecognized_known_event` e os ignoram graciosamente.

> **Timeout de permissão (padrão 5 minutos).** Uma `permission_request`
> permanece pendente até que: (a) algum cliente vote aqui, (b) `POST /session/:id/cancel`
> seja disparado, (c) o cliente HTTP que conduz o prompt desconecte
> (o cancelamento no meio do prompt resolve permissões pendentes como `cancelled`),
> (d) a sessão seja encerrada, (e) o daemon seja desligado, **ou
> (f) o timeout de permissão por sessão seja disparado** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 minutos). No disparo do timeout, o `requestPermission` do agente é resolvido
> como `{outcome: 'cancelled'}`, o ring de auditoria registra uma
> entrada `permission.timeout`, o stderr do daemon emite um breadcrumb
> de uma linha, e o bus SSE faz o fan-out do frame cancelado padrão
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
- `{ "outcome": "cancelled" }` — descartar a requisição (corresponde ao que `cancelSession` / `shutdown` fazem internamente)

Resposta:

- `200 {}` — seu voto foi aceito (resolvido OU registrado sob quórum de consensus)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: a política ativa rejeitou seu voto
- `404 { "error": "..." }` — o requestId é desconhecido (já resolvido, nunca existiu ou a sessão foi derrubada)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: o `allowedOptionIds` do agente contém o sentinel reservado `'__cancelled__'`; violação de contrato entre agente / daemon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 forward-compat: um literal de política chegou ao schema, mas seu branch mediador ainda não foi construído (atualmente inacessível; reservado para políticas futuras)
Após uma votação bem-sucedida, cada cliente conectado vê `permission_resolved` com o mesmo `requestId` e o `outcome` escolhido. Sob `consensus`, votos intermediários também distribuem `permission_partial_vote` até atingir o quórum.

### Rotas de auth device-flow (issue #4175 PR 21)

O daemon atua como intermediário para um OAuth 2.0 Device Authorization Grant (RFC 8628) para que um cliente SDK remoto possa acionar um login cujos tokens sejam salvos no sistema de arquivos do **daemon** — e não no cliente. O próprio daemon faz o polling do IdP; a única tarefa do cliente é exibir a URL de verificação + o código do usuário e (opcionalmente) se inscrever no SSE para eventos de conclusão.

Capability tag: `auth_device_flow` (sempre anunciada). Provedores suportados na v1: `qwen-oauth`.

> [!note]
>
> O tier gratuito do Qwen OAuth foi descontinuado em 2026-04-15. Trate `qwen-oauth` como o identificador de provedor legado da v1 neste protocolo; novos clientes devem preferir um provedor de auth atualmente suportado quando houver um disponível.

**Localidade de runtime.** O daemon nunca abre um navegador — mesmo que possa. O cliente decide se deve chamar `open(verificationUri)` localmente; em um pod headless (o deployment canônico do Modo B), o usuário abre a URL em qualquer dispositivo onde tenha um navegador. Consulte `docs/users/qwen-serve.md` para a UX recomendada.

**Sem vazamento de token em eventos.** `auth_device_flow_started` carrega apenas `{deviceFlowId, providerId, expiresAt}`. O código do usuário e a URL de verificação retornam ponto a ponto no corpo do POST 201 e via `GET /workspace/auth/device-flow/:id`; eles nunca são transmitidos via broadcast no SSE.

**Singleton por provedor.** Um segundo `POST` para o mesmo provedor enquanto um fluxo está pendente é uma retomada idempotente — ele retorna a entrada existente com `attached: true` em vez de iniciar uma nova requisição ao IdP.

#### `POST /workspace/auth/device-flow`

Gate de mutação estrito: requer um bearer token mesmo nos padrões de loopback sem token (`401 token_required`).

Requisição:

```json
{ "providerId": "qwen-oauth" }
```

Resposta (`201` início novo, `200` retomada idempotente):

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
- `401 token_required` — o gate estrito negou uma requisição sem token
- `502 upstream_error` — o IdP retornou um erro inesperado

#### `GET /workspace/auth/device-flow/:id`

Lê o estado atual. Entradas pendentes retornam `userCode/verificationUri/expiresAt/intervalMs`; entradas terminais (período de carência de 5 min) os removem e exibem `status` + `errorKind/hint` opcional.

Retorna `404 device_flow_not_found` para ids desconhecidos e entradas removidas após o período de carência.

#### `DELETE /workspace/auth/device-flow/:id`

Cancelamento idempotente:

- entrada pendente → `204` + emite `auth_device_flow_cancelled`
- entrada terminal → `204` no-op (sem reemissão de evento)
- id desconhecido → `404`

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

Cinco eventos tipados (escopo do workspace, distribuídos para cada barramento de sessão ativo):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST bem-sucedido; o SDK deve se inscrever (sem userCode aqui, busque via GET se necessário)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — o daemon respeitou o `slow_down` do upstream; clientes fazendo polling no GET devem aumentar seu intervalo para corresponder
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — credenciais persistidas; `accountAlias` é um rótulo não-PII (nunca email/telefone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal; `errorKind` é um de `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` é interno do daemon: a troca com o IdP foi bem-sucedida, mas o daemon não conseguiu armazenar as credenciais de forma durável (EACCES / EROFS / ENOSPC). O usuário deve tentar novamente assim que a condição subjacente do disco for corrigida.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE bem-sucedido contra uma entrada pendente

> **Não compatível com MCP.** A especificação de autorização MCP (2025-06-18) exige OAuth 2.1 + PKCE auth-code com um callback de redirecionamento, o que não funciona para daemons em pods headless. A superfície de device-flow do Modo B é privada do daemon — clientes que visam servidores compatíveis com MCP devem usar um caminho de auth diferente.

## Formato de wire de streaming

Os eventos são emitidos como frames EventSource padrão. O daemon escreve uma linha `data:` por frame (o JSON não possui quebras de linha embutidas após `JSON.stringify`); o parser do SDK em `packages/sdk-typescript/src/daemon/sse.ts` lida com isso e com a forma multi-`data:` permitida pela especificação no lado do recebimento.

## Frames de erro durante o streaming

Se o iterador da bridge lançar uma exceção ao servir um assinante SSE, o daemon emite um frame `stream_error` terminal (sem `id`). A linha `data:` é o envelope completo (mesmo formato de qualquer outro frame SSE neste documento); a mensagem de erro real fica em `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

A conexão é então fechada.

## Variáveis de ambiente

| Var                 | Propósito                                                        |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer token. Espaços em branco no início e no fim são removidos na inicialização. |

## Estrutura do código-fonte

| Path                                                 | Propósito                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | comando yargs + schema de flags                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`           | ciclo de vida do listener + tratamento de sinais                                                                       |
| `packages/cli/src/serve/server.ts`                   | montagem do app Express, ordenação de middlewares e rotas diretas restantes                                     |
| `packages/cli/src/serve/routes/*.ts`                 | grupos de rotas Express focados, incluindo sessão, SSE, auth do workspace, status do workspace e rotas de arquivos    |
| `packages/cli/src/serve/auth.ts`                     | bearer + allowlist de Host + negação de CORS                                                                        |
| `packages/cli/src/serve/acp-session-bridge.ts`       | facade de compatibilidade da bridge local do CLI para spawn-or-attach, FIFO por sessão e registro de permissões       |
| `packages/acp-bridge/src/status.ts`                  | tipos de wire de status do daemon read-only + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | helper puro que constrói payloads de `/workspace/env` a partir do estado `process.*`, incluindo ofuscação de credenciais   |
| `packages/acp-bridge/src/eventBus.ts`                | fila assíncrona limitada + ring de replay                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | cliente TS                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | parser de frames EventSource                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 casos, sem LLM                                                                                           |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 casos, processo filho real `qwen --acp` suportado pelo servidor OpenAI fake local (apenas POSIX; ignorado no Windows)   |