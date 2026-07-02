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

Quando a flag está ativa, o middleware global `bearerAuth` restringe **todas** as rotas — incluindo `/capabilities`. Portanto, um cliente **não autenticado** não pode fazer pre-flight de `caps.features` para descobrir que a autenticação é necessária: a superfície de descoberta para esse caso é o próprio **corpo da resposta 401** (uniforme em todas as rotas conforme a seção [Authentication](#authentication)). A tag de capacidade `require_auth` é uma **confirmação pós-autenticação** — uma vez que um cliente se autentica com sucesso e lê `/capabilities`, a presença da tag confirma que o daemon foi iniciado com `--require-auth` (útil para UIs de auditoria/conformidade e para que clientes SDK exibam "esta implantação está reforçada" em um painel de configurações). Rotas de mutação que optam pelo modo estrito por rota (acompanhamentos da Wave 4) recusam com `401 { code: "token_required", error: "…" }` quando acessadas no padrão loopback sem token — mas com `--require-auth` ativado, o middleware bearer global interrompe a requisição antes do gate por rota, então o corpo legado `Unauthorized` é o que os chamadores não autenticados realmente veem.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Webuis de navegador acessando o daemon cross-origin são bloqueados por padrão — qualquer requisição contendo um cabeçalho `Origin` retorna `403 {"error":"Request denied by CORS policy"}` porque clientes CLI/SDK nunca enviam `Origin` e o daemon trata sua presença como um sinal de que a requisição veio de um contexto de navegador no qual o operador não optou por permitir. Passe `--allow-origin <pattern>` (repetível) na inicialização para instalar uma allowlist em vez do bloqueio total. Cada padrão é:

- O literal `*` — admite qualquer origin. **Arriscado**: a inicialização recusa quando `*` está configurado, mas nenhum bearer token está definido (qualquer fonte: `--token`, `QWEN_SERVER_TOKEN` ou `--require-auth`, que exige um token na inicialização). O breadcrumb de inicialização emite um aviso no stderr quando `*` está na lista. **Recomendação**: combine com `--require-auth` em binds de loopback para que `/health` e `/demo` também sejam restringidos pelo bearer — eles são registrados antes do middleware bearer no loopback por padrão (para que as sondas k8s/Compose possam alcançar `/health` sem um token), e uma allowlist `*` os torna acessíveis de qualquer navegador cross-origin. Em binds fora do loopback, o bearer já é obrigatório na inicialização, então a superfície de exposição `*` é apenas `/health` (JSON de status) e `/demo` (uma página estática cujo JS ainda chama rotas restritas por token) — a superfície real da API é restrita de qualquer forma.
- Um origin de URL canônico — `<scheme>://<host>[:<port>]`. **Sem barra final, sem path, sem userinfo, sem query.** A inicialização recusa com `InvalidAllowOriginPatternError` se a entrada falhar no round-trip `new URL(pattern).origin === pattern`; a mensagem de erro nomeia o padrão incorreto e a forma canônica. Rigoroso por intenção: a normalização silenciosa (ex.: remover uma `/` final) deixaria erros de digitação passarem e aceitaria entradas ambíguas.

Origins correspondentes recebem os cabeçalhos de resposta CORS padrão em cada requisição:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` ecoa o origin da requisição literalmente (minúsculas/maiúsculas como o navegador enviou) em vez do literal `*`, mesmo sob o padrão `*` — os caches do navegador chaveiam as respostas nisso emparelhado com `Vary: Origin`, e ecoar deixa espaço para adicionar `Access-Control-Allow-Credentials` em uma versão posterior sem alteração de esquema. `Access-Control-Expose-Headers: Retry-After` permite que webuis de navegador honrem as dicas de retry do daemon vindas de respostas `429` / `503`. `Access-Control-Allow-Credentials` **NÃO** é enviado hoje: o daemon autentica via bearer-in-`Authorization`, o que funciona cross-origin sem `credentials: 'include'`.

Requisições OPTIONS de preflight (OPTIONS com `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) são interrompidas com `204 No Content` mais os cabeçalhos acima. Este é o padrão CORS convencional e é seguro — o preflight apenas confirma quais métodos/cabeçalhos o daemon aceitará; a requisição subsequente real ainda executa a cadeia completa (allowlist de host → auth bearer → rotas), então a proteção anti-DNS-rebinding e a aplicação do bearer ainda disparam antes que qualquer estado seja lido ou mutado. Requisições OPTIONS simples de origins correspondentes continuam fluindo para downstream com os cabeçalhos CORS anexados.

Origins que não correspondem à allowlist ainda recebem `403 {"error":"Request denied by CORS policy"}` — o mesmo envelope do bloqueio padrão, então clientes que já analisaram a resposta do bloqueio não precisam tratar como caso especial daemons implantados com allowlist. O caminho de rejeição **não** emite nenhum cabeçalho `Access-Control-*` (o navegador os ignoraria, e emiti-los anunciaria indiretamente o tamanho da allowlist através da presença do cabeçalho).

A lista de padrões configurada intencionalmente NÃO é ecoada em `/capabilities` — a webui do navegador já conhece seu próprio origin (afinal, ela chamou o daemon), e expor a lista permitiria que um leitor não autenticado de `/capabilities` enumerasse cada origin confiável (recon útil para uma implantação mal configurada). Clientes SDK usam a tag `caps.features.allow_origin` para saber "este daemon honra acessos cross-origin de navegador" sem precisar saber quais origins específicos.

Requisições de self-origin de loopback (ex.: a página `/demo` chamando o daemon na mesma `127.0.0.1:port`) são tratadas por um shim de remoção de Origin **separado** que é executado ANTES do middleware CORS e remove o cabeçalho `Origin` para `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Assim, elas passam independentemente da configuração `--allow-origin` — os operadores não precisam listar a própria porta do daemon para fazer a página demo funcionar.

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

Use isso para detectar incompatibilidade no pre-flight: leia `workspaceCwd` de `/capabilities` e omita `cwd` do `POST /session` (ele faz fallback para o workspace vinculado), ou direcione a requisição para um daemon vinculado a `requestedWorkspace`.

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
 'session_close', 'session_metadata', 'session_archive', 'mcp_guardrails',
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

`session_scope_override` é o identificador de negociação para o campo `sessionScope` por requisição no `POST /session` (veja abaixo). Daemons mais antigos ignoram o campo silenciosamente, então clientes SDK devem fazer pre-flight de `caps.features` para esta tag antes de enviá-lo.

`session_load` e `session_resume` anunciam as rotas de restauração explícita (`POST /session/:id/load` e `POST /session/:id/resume`). Daemons mais antigos retornam `404` para esses caminhos, então clientes SDK devem fazer pre-flight de `caps.features` antes de chamar. `unstable_session_resume` ainda é anunciado como um alias depreciado para compatibilidade com SDKs que foram lançados enquanto o método ACP subjacente se chamava `connection.unstable_resumeSession`; novos clientes devem condicionar a `session_resume`.

`slow_client_warning` cobre dois controles de backpressure de SSE co-lançados introduzidos no #4175 Wave 2.5 PR 10: (a) o daemon emite um frame de stream de eventos sintético `slow_client_warning` quando a fila de um assinante ultrapassa 75% de capacidade, uma vez por episódio de estouro (rearmado após a fila esvaziar abaixo de 37,5%); (b) `GET /session/:id/events` aceita um parâmetro de query `?maxQueued=N` (intervalo `[16, 2048]`) para pré-dimensionar o backlog por assinante para reconexões a frio contra um ring de replay grande. O tamanho do ring para todo o daemon é controlado por `--event-ring-size` (padrão **8000**, conforme #3803 §02). Daemons antigos carecem de ambos silenciosamente — faça pre-flight desta tag antes de optar por usá-la.

`typed_event_schema` anuncia payloads de eventos do daemon que correspondem ao esquema `KnownDaemonEvent` do SDK. Daemons mais antigos ainda podem transmitir frames compatíveis, mas clientes SDK devem fazer pre-flight desta tag antes de assumir cobertura de eventos tipados.

`client_heartbeat` anuncia `POST /session/:id/heartbeat`. Daemons mais antigos retornam `404`; faça pre-flight desta tag antes de emitir heartbeats periódicos.

`session_close` e `session_metadata` anunciam `DELETE /session/:id` e `PATCH /session/:id/metadata`. Daemons mais antigos retornam `404`; faça pre-flight destas tags antes de expor recursos de fechamento ou renomeação.

`session_archive` anuncia a API de arquivamento de estado de diretório v1: `POST /sessions/archive`, `POST /sessions/unarchive` e `GET /workspace/:id/sessions?archiveState=active|archived`. Sessões arquivadas não podem ser carregadas ou retomadas até que sejam desarquivadas.

`session_lsp` anuncia `GET /session/:id/lsp`, o snapshot de status LSP estruturado e somente leitura para clientes do daemon. Daemons mais antigos retornam `404`; faça pre-flight desta tag antes de expor o status remoto do LSP.

`session_status` anuncia `GET /session/:id/status`, o resumo ao vivo da bridge para uma única sessão por id (`clientCount` / `hasActivePrompt` e os campos principais). Daemons mais antigos retornam `404`; faça pre-flight desta tag antes de consultar o status de uma única sessão em vez de escanear a lista completa de sessões.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` e `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) anunciam as quatro rotas de controle de mutação documentadas em "Mutação: aprovação, ferramentas, init, reinício do MCP" abaixo. Todas as quatro são estritamente restritas pelo gate de mutação do PR 15 (um daemon configurado sem um bearer token as rejeita com 401 `token_required`). Daemons mais antigos retornam `404`; faça pre-flight de cada tag antes de expor o recurso correspondente.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) cobre a superfície de orçamento do MCP: os campos `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` em `GET /workspace/mcp`, o campo `disabledReason` em células por servidor e as flags CLI `--mcp-client-budget` / `--mcp-budget-mode`. Daemons mais antigos omitem os novos campos inteiramente; clientes SDK fazem pre-flight desta tag antes de confiar na semântica de `budgets[]`. O descritor do registro também carrega `modes: ['warn', 'enforce']` para exposição futura de feature-modes — por enquanto, os clientes inferem o modo a partir do campo `budgetMode` do snapshot. A recusa do servidor no modo `enforce` é determinística pela ordem de declaração de `Object.entries(mcpServers)`; uma camada futura de precedência de escopo (se o qwen-code adotar uma) mudaria isso para "menor precedência primeiro" para espelhar a convenção `plugin < user < project < local` do claude-code.

> ⚠️ **Escopo do PR 14 v1: por sessão, não por workspace.** Cada sessão ACP dentro do daemon constrói seu próprio `Config` + `McpClientManager` (via `acpAgent.newSessionConfig`). Os limites de orçamento restringem clientes MCP ativos **por sessão**; cada sessão lê independentemente `QWEN_SERVE_MCP_CLIENT_BUDGET` do env encaminhado. Com `--mcp-client-budget=10` e 5 sessões ACP concorrentes, a contagem real de clientes MCP ativos pode chegar a 5 × 10 = 50 em todo o daemon. O snapshot `GET /workspace/mcp` lê apenas a contabilidade do `McpClientManager` da **sessão de bootstrap** — o valor `budgets[0].scope: 'session'` é o sinal honesto de que isso é por sessão, não agregado. **Wave 5 PR 23 (shared MCP pool)** introduzirá um gerenciador com escopo de workspace e adicionará uma célula `scope: 'workspace'` ao lado da célula por sessão para uma verdadeira agregação entre sessões. A v1 é a base de contador em processo + aplicação suave na qual o PR 23 se constrói.

`workspace_file_read` cobre as rotas de arquivo de workspace text/list/stat/glob (`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes` cobre `GET /file/bytes`, que foi adicionado posteriormente para que clientes possam fazer pre-flight do suporte a raw byte-window contra daemons da era do PR19. `workspace_file_write` cobre as rotas de mutação de texto com reconhecimento de hash (`POST /file/write`, `POST /file/edit`). A tag write significa que o contrato da rota existe; não significa que a implantação atual está aberta para mutação anônima. Write/edit são rotas de mutação estritas e requerem um bearer token configurado mesmo em loopback.

`daemon_status` anuncia `GET /daemon/status`, o snapshot de diagnóstico do operador consolidado e somente leitura documentado abaixo.

**Tags condicionais.** Um pequeno número de tags de recursos é anunciado apenas quando o toggle de implantação correspondente está ativo. Presença da tag = comportamento ativo; ausência = ou um daemon mais antigo anterior à tag, OU um daemon atual onde o operador não optou por ativar. Atualmente:

| Tag                        | Anunciado quando …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | o daemon foi iniciado com `--require-auth` (ou `requireAuth: true` via API incorporada). O bearer token é obrigatório em todas as rotas, incluindo `/health` em binds de loopback.                                                                                                                                                                                                                                                                                                                               |
| `mcp_workspace_pool`       | o pool de transporte MCP compartilhado está ativo. Omitido quando `QWEN_SERVE_NO_MCP_POOL=1` desativa o pool.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `mcp_pool_restart`         | o pool de transporte MCP compartilhado está ativo; as respostas de reinício podem incluir formas de múltiplas entradas cientes do pool.                                                                                                                                                                                                                                                                                                                                                                          |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). O daemon foi iniciado com pelo menos um `--allow-origin <pattern>` (ou `allowOrigins: [...]` via API incorporada). Requisições cross-origin de origins correspondentes recebem cabeçalhos de resposta CORS adequados; origins não correspondentes ainda recebem o 403 padrão. A lista de padrões configurada intencionalmente NÃO é ecoada em `/capabilities` para evitar vazar o conjunto de origins confiáveis para leitores não autenticados — a webui do navegador já conhece seu próprio origin. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` está definido como um inteiro positivo.                                                                                                                                                                                                                                                                                                                                                                               |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` está definido como um inteiro positivo.                                                                                                                                                                                                                                                                                                                                                                    |
| `workspace_settings`       | o daemon foi criado com persistência de configurações disponível.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `session_shell_command`    | a execução de shell da sessão está explicitamente habilitada.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` está habilitado.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `workspace_reload`         | o suporte a recarga de workspace está disponível na configuração de rotas incorporada.                                                                                                                                                                                                                                                                                                                                                                                                                           |
`mcp_guardrails` **não** está nesta tabela condicional — é uma tag sempre ativa, anunciada sempre que o binário suporta os novos campos de orçamento de `/workspace/mcp`, independentemente de o operador ter configurado um orçamento. Operadores que não definiram `--mcp-client-budget` ainda recebem os novos campos (com `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) anuncia os eventos push SSE tipados que expõem as transições de estado do orçamento do MCP sem a necessidade de um loop de polling. Dois tipos de frame chegam em `GET /session/:id/events`:

- `mcp_budget_warning` — dispara uma vez na transição ascendente de 75% de `reservedSlots.size / clientBudget`. Rearma apenas após a proporção cair abaixo de 37,5% (`MCP_BUDGET_REARM_FRACTION`). Espelha a histerese de `slow_client_warning` do PR 10, mas no nível do gerenciador em vez do nível de backlog por assinante. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Dispara nos modos `warn` e `enforce`; nunca no modo `off`.
- `mcp_child_refused_batch` — dispara no final de cada passagem de `discoverAllMcpTools*` quando um ou mais servidores foram recusados, E como um batch de tamanho 1 no caminho de recusa de lazy-spawn de `readResource`. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` é o literal `'enforce'` porque o modo `warn` nunca recusa.

Ambos os eventos residem no anel de replay SSE por sessão (eles carregam um `id`), então um cliente reconectando com `Last-Event-ID` retoma a partir deles; o snapshot em `GET /workspace/mcp` ainda é a fonte da verdade para o estado após desconexões prolongadas. Sempre ativo uma vez anunciado — não há toggle condicional. O estado do reducer do SDK (`DaemonSessionViewState`) expõe `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` para adaptadores que desejam uma UI simples no estilo lag.

## Rotas

### `GET /health`

Sonda de liveness (verificação de atividade). A forma padrão retorna `200 {"status":"ok"}` se o listener estiver ativo — é leve, não acessa a bridge, adequada para sondas de liveness de alta frequência no k8s/Compose.

Passe `?deep=1` (também aceita `?deep=true` ou apenas `?deep`) para uma sonda que expõe os **contadores** da bridge (apenas informativo, não é uma verificação de liveness real):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ A sonda profunda (deep probe) é **informativa**, não uma verificação real de liveness. Ela lê acessadores de contadores (`bridge.sessionCount`, `bridge.pendingPermissionCount`) que são simples getters de tamanho de Map; eles não fazem ping em processos filhos / canais individuais e, portanto, não detectarão uma sessão travada mas ainda contada. Use-a para dashboards de capacidade (concorrência atual vs. `--max-sessions`, profundidade da fila) em vez de usá-la como gatilho para "remover este daemon da rotação". Uma resposta `503 {"status":"degraded"}` é teoricamente possível se os getters de uma implementação de bridge personalizada lançarem exceções, mas os getters da bridge real nunca fazem isso — em operação normal, a sonda profunda sempre retorna 200. Para liveness real, confie em se o listener aceita uma conexão TCP (ou seja, o `/health` padrão sem `?deep`).

**Auth:** obrigatório **apenas em binds não-loopback**. No loopback (`127.0.0.1`, `::1`, `[::1]`), `/health` é registrado antes do middleware bearer, então as sondas k8s/Compose dentro do pod não precisam carregar o token. Em não-loopback (`--hostname 0.0.0.0`, etc.), a rota é registrada após o middleware bearer e retorna 401 sem um token válido — caso contrário, um chamador não autenticado poderia sondar endereços arbitrários para confirmar a existência de um `qwen serve`, um vazamento de informação de baixa severidade que se combina mal com varredura de portas. A negação de CORS + allowlist de Host ainda se aplicam na isenção de loopback.

### `GET /daemon/status`

Diagnósticos do operador somente leitura. Ao contrário de `/health`, esta é uma API normal do daemon:
ela é registrada após a autenticação bearer e limitação de taxa (rate limiting), inclusive em binds
de loopback. Parâmetro de query:

- `detail=summary` (padrão) lê apenas o estado do daemon em memória.
- `detail=full` também inclui diagnósticos de sessões ativas, diagnósticos de conexão
  ACP, contagens de auth device-flow e seções de status do workspace.
- qualquer outro `detail` retorna `400 { "code": "invalid_detail" }`.

`summary` intencionalmente não consulta métodos de status do workspace, não inicia um filho
ACP nem gera uma sessão. `full` consulta cada seção do workspace independentemente;
um timeout ou exceção marca apenas aquela seção como `unavailable` e adiciona um
problema `workspace_status_unavailable`.

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
    }
  }
}
```

`status` é `error` se qualquer problema tiver severidade de erro, `warning` se qualquer problema tiver
severidade de aviso, caso contrário `ok`. Os códigos de problema são estáveis e incluem
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited` e
`channel_worker_partial_connect`, e `workspace_status_unavailable`. Durante
a curta janela após o listener estar pronto, mas antes que o runtime completo seja
montado, `/daemon/status` pode reportar `daemon_runtime_starting`; se a montagem
do runtime assíncrono falhar, ele reporta `daemon_runtime_failed` enquanto as rotas
de runtime que não são de status retornam `503`.

`runtime.channel.live` reporta o canal da bridge ACP dentro do daemon. Ele não é
o worker do adaptador de canal. Canais gerenciados pelo daemon usam
`runtime.channelWorker`, cujo `state` é um entre `disabled`, `starting`,
`running`, `exited`, `failed` ou `stopped`. Quando um worker atinge `running`
e então sai, `/daemon/status` mantém o daemon online e reporta o código de problema de aviso
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
`restartCount > 0` está saudável, a menos que outro problema se aplique. Um worker em execução
cujos `requestedChannels` incluam nomes ausentes em `channels` reporta
`channel_worker_partial_connect`.

`qwen channel status` continua lendo metadados do pidfile. Durante uma janela de reinicialização,
o pidfile pertencente ao serve permanece reservado, mas `workerPid` é omitido para que
os clientes não exibam um processo de worker obsoleto. O stdout/stderr do worker são
encaminhados para o log do daemon com tokens bearer, valores sensíveis do ambiente do worker
e credenciais de URL de proxy redigidos.

Segurança: a resposta nunca inclui tokens bearer, ids de cliente, ids completos de conexão
ACP, códigos de usuário de device-flow ou URLs de verificação. `summary` omite
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

Contrato estável: quando `v` incrementa, o layout do frame mudou de uma forma incompatível com versões anteriores.

> **`protocolVersions`** descreve as versões do protocolo serve que o daemon pode falar. `current` é a versão de protocolo preferida do daemon e `supported` é o conjunto compatível. Clientes que exigem um protocolo específico devem verificar `supported`; a UI específica de recursos ainda deve ser controlada por `features`. Aditivo ao v=1: daemons v=1 mais antigos omitem este campo, então clientes SDK que visam builds mais antigos devem tratá-lo como opcional.

> **`modelServices` é sempre `[]` no Stage 1.** O agente usa seu único serviço de modelo padrão e não o enumera pela rede. O Stage 2 populará isso a partir de adaptadores de modelo registrados para que clientes SDK possam construir seletores de serviço; até lá, NÃO dependa deste campo estar não vazio.

> **`workspaceCwd`** é o caminho absoluto canônico ao qual este daemon se vincula (#3803 §02 — 1 daemon = 1 workspace). Use-o para (a) detectar incompatibilidades antes de postar em `/session` e (b) omitir `cwd` em `POST /session` (a rota faz fallback para este caminho). Deployments multi-workspace expõem múltiplos daemons em portas diferentes, cada um com seu próprio `workspaceCwd`. Aditivo ao v=1: daemons v=1 pré-§02 omitem o campo — clientes que visam builds mais antigos devem verificar se é nulo antes de consumi-lo.

### Rotas de status de runtime somente leitura

Estas rotas reportam snapshots de runtime do lado do daemon. Elas são rotas v1 aditivas,
não mutam o estado e não alteram a versão do protocolo serve. As rotas de status
do workspace intencionalmente **não** iniciam o processo filho ACP apenas porque
um cliente faz polling de uma rota GET: se o daemon estiver ocioso, elas retornam
`initialized: false` com um snapshot vazio. As rotas de status de sessão exigem uma
sessão ativa e usam o formato padrão `404 SessionNotFoundError` para ids
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
`/workspace/env` e (eventualmente) guardrails do MCP para que clientes SDK possam renderizar
remediação por categoria em vez de analisar mensagens de forma livre. O PR 13
(#4175) introduziu os sete literais listados acima; o PR 14 populará
`blocked_egress` assim que a sonda de egresso for implementada.

Os payloads de status nunca expõem valores de env do MCP, headers, detalhes de OAuth/conta de serviço,
chaves de API do provedor, `baseUrl` / `envKey` do provedor, corpo da skill, caminhos
do sistema de arquivos da skill, definições de hook ou valores de variáveis de ambiente
secretas. `/workspace/env` reporta apenas a **presença** de variáveis de ambiente
na allowlist; URLs de proxy têm suas credenciais removidas e são reduzidas para
`host:port` antes de serem enviadas pela rede.

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

`budgetMode` é um entre `enforce`, `warn` ou `off`. `clientBudget` está ausente quando nenhum orçamento foi definido. `budgets[]` é **sempre um array** em daemons pós-PR-14 (possivelmente vazio quando `budgetMode === 'off'`); daemons pré-PR-14 omitem o campo inteiramente. O v1 emite uma célula com `scope: 'session'` (aplicação por sessão — veja a seção de capacidades acima para entender o porquê). Os consumidores DEVEM tolerar entradas adicionais em `budgets[]` com valores de `scope` não reconhecidos — o Wave 5 PR 23 adicionará `scope: 'workspace'` (ou `'pool'`) ao lado da célula por sessão sem um aumento de schema.

`disabledReason` nas células por servidor distingue o desativado pelo operador (`'config'` — lista de configuração `disabledMcpServers`) do recusado por orçamento (`'budget'` — descoberto, mas nunca conectado devido ao modo `enforce`). As recusas são determinísticas pela ordem de declaração de `Object.entries(mcpServers)`. O `status: 'error', errorKind: 'budget_exhausted'` por servidor sobrepõe o `mcpStatus: 'disconnected'` bruto (que é verdadeiro, mas não é a severidade voltada para o operador).

A aplicação de orçamento no PR 14 v1 é **por sessão, não por workspace**. Embora os daemons do Modo B sejam `1 daemon = 1 workspace × N sessões` pós-#4113 no nível do processo, o `McpClientManager` é construído dentro do `Config` de cada sessão ACP via `acpAgent.newSessionConfig`, então N sessões aplicam cada uma sua própria cópia do limite. O snapshot representa a visão da sessão de bootstrap. O Wave 5 PR 23 introduz um pool MCP compartilhado com escopo de workspace que promove isso para uma aplicação verdadeira por workspace.

**Detectando pressão no orçamento.** Duas superfícies, ambas populadas pós-PR-14b:

- **Eventos push** (anunciados via `mcp_guardrail_events`): assine `GET /session/:id/events` e filtre os frames `mcp_budget_warning` / `mcp_child_refused_batch` através de `KnownDaemonEvent`. A máquina de estados dispara uma vez por transição ascendente de 75% (rearmada abaixo de 37,5%); as recusas são coalescidas uma vez por passagem de descoberta no modo `enforce`.
- **Poll de snapshot** (anunciado via `mcp_guardrails`): `GET /workspace/mcp` e inspecione a célula de orçamento por sessão (`budgets[0]`):

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (corresponde ao limite de histerese que o evento push do PR 14b usará).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (um ou mais servidores recusados nesta passagem de descoberta).
- `budgets[0].status === 'ok'` ⇔ abaixo do limite de 75% E sem recusas.

Cadência de polling recomendada: alinhada com o que já faz polling de `/workspace/mcp`; o snapshot é leve e a célula de orçamento não carrega custo extra de descoberta. Clientes SDK que assinam eventos push ainda se beneficiam do snapshot para o estado após desconexões prolongadas (a profundidade do anel de replay SSE é finita — `--event-ring-size`, padrão 8000 — então um cliente offline por mais tempo do que a cobertura do anel faz fallback para ressincronização por snapshot).

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

Os modelos são agrupados por tipo de autenticação. Os diagnósticos de conexão do provedor ficam na
célula `providers` de `/workspace/preflight`; o preflight de ambiente fica em
`/workspace/preflight` e `/workspace/env` (abaixo). `errors` é omitido
quando a construção do snapshot é bem-sucedida.

### `GET /workspace/env`

Reporta o runtime, plataforma, sandbox, proxy e a **presença** de variáveis de ambiente
secretas na allowlist do processo do daemon. Sempre responde a partir do estado
`process.*` — o daemon nunca gera um filho ACP para servir
esta rota, e a resposta é idêntica se o ACP estiver ativo ou ocioso. O
campo `acpChannelLive` é apenas informativo.

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
**Política de redação.** Células `kind: 'env_var'` nunca incluem um campo `value`; os clientes veem apenas `present: boolean`. Células `kind: 'proxy'` passam o valor bruto da variável de ambiente pelo processo de redação de credenciais (`redactProxyCredentials`) e depois pelo parsing de `URL`, de modo que a rede transmite apenas `host:port`. `NO_PROXY` é passado pela redação literalmente, pois é uma lista de hosts e não uma URL. A whitelist de variáveis de ambiente secretas enumeradas atualmente inclui `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` e `QWEN_SERVER_TOKEN`. Outras variáveis de ambiente não são enumeradas, portanto, secrets definidos acidentalmente permanecem invisíveis.

### `GET /workspace/preflight`

Reporta as verificações de prontidão do daemon. **Células de nível do daemon** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) são sempre populadas a partir de `process.*` e `node:fs`. **Células de nível do ACP** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) exigem um filho ACP ativo — quando o daemon está ocioso, elas emitem placeholders com `status: 'not_started'`. A rota nunca cria um ACP apenas para popular células; as células correspondentes retornam ao fallback `not_started`.

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

- `missing_binary` — Versão do Node abaixo da exigida, `QWEN_CLI_ENTRY` ausente, ripgrep / git / npm não estão no PATH (avisos em vez de erros para os binários opcionais).
- `missing_file` — `boundWorkspace` não existe ou não é um diretório; erro de parsing de skill apontando para um arquivo ausente ou ilegível.
- `parse_error` — Falha no parsing do `SKILL.md`, JSON de configuração malformado.
- `auth_env_error` — `validateAuthMethod` retornou uma string de falha não nula, ou uma subclasse de `ModelConfigError` propagada a partir da resolução do provedor.
- `init_timeout` — Rejeição de `withTimeout` na bridge (um timeout real enquanto aguarda um roundtrip do ACP). Reconhecido pela classe tipada `BridgeTimeoutError`. Nota: uma célula `warning` transitória de `mcp_discovery` com `connecting > 0` NÃO carrega este tipo — é um estado normal de handshake em andamento, distinto de um timeout real.
- `protocol_error` — `extMethod` do ACP rejeitado porque o canal fechou no meio da requisição, ou porque o registro de ferramentas estava ausente inesperadamente.
- `blocked_egress` — reservado para o PR 14 (#4175). O PR 13 deixa a célula `egress` com `status: 'not_started'`.

Se a bridge falhar ao alcançar o filho ACP enquanto serve uma requisição preflight (por exemplo, um fechamento de canal no meio da requisição), o array `errors` do envelope carrega um único `ServeStatusCell` descrevendo a falha e as células retornam ao fallback de placeholders ACP `not_started`. As células de nível do daemon ainda são retornadas.

### Rotas de arquivos do workspace

Todos os caminhos de arquivo são resolvidos através do workspace vinculado do daemon. As respostas usam caminhos relativos ao workspace e nunca retornam caminhos absolutos do sistema de arquivos para casos de sucesso normais. Respostas de arquivo bem-sucedidas incluem:

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

Os valores de `errorKind` incluem `path_outside_workspace`, `symlink_escape`, `path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`, `permission_denied`, `parse_error`, `hash_mismatch`, `file_already_exists`, `text_not_found` e `ambiguous_text_match`.

#### `GET /file`

Lê um arquivo de texto. Parâmetros de query: `path` (obrigatório), `maxBytes`, `line` e `limit`. O daemon rejeita arquivos binários e arquivos acima do limite de leitura de texto. A resposta inclui `hash`, um resumo SHA-256 sobre os bytes brutos no disco para o arquivo inteiro, mesmo quando `line`, `limit` ou `maxBytes` retornaram uma fatia (slice).

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

Lê bytes brutos de um arquivo sem decodificação. Parâmetros de query: `path` (obrigatório), `offset` (padrão `0`) e `maxBytes` (padrão `65536`, máximo `262144`). Esta rota suporta janelas delimitadas em arquivos binários grandes sem carregar o arquivo inteiro. A resposta inclui `hash` apenas quando a janela retornada cobre o arquivo inteiro.

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

Cria ou substitui um arquivo de texto. Esta é uma rota de mutação estrita: em loopback sem um token configurado, retorna `401 { "code": "token_required" }`. Com `--require-auth`, o middleware bearer global rejeita requisições não autenticadas antes da rota ser executada.

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

`mode` deve ser `create` ou `replace`. `create` nunca sobrescreve um arquivo existente (`409 file_already_exists`). `replace` exige `expectedHash`; hashes ausentes ou malformados resultam em `400 parse_error`, e hashes desatualizados resultam em `409 hash_mismatch`. `expectedHash` é `sha256:` mais 64 caracteres hexadecimais minúsculos, computados sobre os bytes brutos no disco.

`bom`, `encoding` e `lineEnding` podem ser fornecidos. A substituição preserva o perfil de codificação do arquivo existente por padrão; campos explícitos o sobrescrevem. Escrita de binários está fora do escopo.

O daemon escreve em um arquivo temporário aleatório no diretório de destino, faz fsync onde suportado, verifica novamente o hash atual imediatamente antes do `rename()` e, em seguida, renomeia para o local final. Isso impede a observação de arquivos parciais e serializa escritas originadas pelo daemon no mesmo arquivo, mas não é um compare-and-swap de kernel entre processos: um editor externo ainda pode competir na pequena janela entre a verificação final do hash e a renomeação.

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

Aplica uma substituição de texto exata a um arquivo de texto existente. Esta também é uma rota de mutação estrita e exige `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` deve ser não vazio e ocorrer exatamente uma vez. Nenhuma correspondência retorna `422 text_not_found`; múltiplas correspondências retornam `422 ambiguous_text_match`. A rota preserva a codificação, BOM e quebras de linha, e verifica novamente o `expectedHash` imediatamente antes da renomeação atômica.

Escritas/edições explícitas em caminhos ignorados são permitidas porque o chamador autenticado nomeou o caminho. Respostas de sucesso e eventos de auditoria incluem `matchedIgnore: "file" | "directory" | null`.

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

`state` espelha os mesmos formatos de model/mode/config-option do ACP usados por `POST /session`, `POST /session/:id/load` e `POST /session/:id/resume`.

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

`availableCommands` é o mesmo snapshot de comandos usado pela notificação SSE `available_commands_update`. `availableSkills` lista apenas os nomes das skills; os clientes não devem esperar corpos de skills ou caminhos nesta rota.

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

Esta rota é um snapshot read-only out-of-band. Intencionalmente não é um prompt e pode ser consultada enquanto a sessão está em streaming. A resposta contém apenas metadados permitidos (whitelisted) dos registros de tarefas do agent, shell e monitor; controllers, timers, offsets, mensagens pendentes e objetos brutos de registro nunca são expostos.

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

`status` é um dos valores `NOT_STARTED`, `IN_PROGRESS`, `READY` ou `FAILED`. O `error` opcional está presente em servidores com falha quando disponível. LSP desabilitado (incluindo o modo bare) retorna HTTP 200 com `enabled: false`, contagens zero e `servers: []`. LSP habilitado sem servidores configurados retorna `enabled: true`, `configuredServers: 0` e `servers: []`. Se a inicialização falhar antes do cliente existir, a resposta pode incluir `initializationError`; se um cliente ativo não puder fornecer um snapshot, a resposta inclui `statusUnavailable: true`.

Esta rota expõe apenas campos estáveis voltados para o cliente. Intencionalmente omite detalhes internos de depuração, como IDs de processo, argumentos de spawn, caudas de stderr, URIs raiz e caminhos de pastas do workspace.

### `POST /session`

Cria (spawn) um novo agent ou anexa a um existente (sob `sessionScope: 'single'`, o padrão).

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
| `cwd`            | no       | Caminho absoluto correspondente ao workspace vinculado do daemon. Se omitido, a rota usa o fallback para `boundWorkspace` (leia-o em `/capabilities.workspaceCwd`). Um `cwd` não vazio incompatível retorna `400 workspace_mismatch` (#3803 §02 — 1 daemon = 1 workspace). Os caminhos do workspace são canonizados via `realpathSync.native` (com um fallback de apenas resolução para caminhos inexistentes) para que sistemas de arquivos que não diferenciam maiúsculas de minúsculas não rejeitem sessões por diferenças de grafia.                                                                                                                                                                          |
| `modelServiceId` | no       | Seleciona qual _model service_ configurado o agent usará como rota (o provedor de back-end — Alibaba ModelStudio, OpenRouter, etc). Se omitido, o agent usa o seu padrão. Se o workspace já tiver uma sessão, isso chama `setSessionModel` na existente e transmite `model_switched`. Distinto de `modelId` em `POST /session/:id/model`, que seleciona o modelo **dentro** de um serviço já vinculado. O array `modelServices` em `/capabilities` é reservado para anunciar serviços configurados; no Stage 1, é sempre `[]` (o serviço padrão do agent é usado e não enumerado via HTTP). |
| `sessionScope`   | no       | Substituição por requisição para compartilhamento de sessão. `'single'` (o padrão em todo o daemon) faz com que um segundo `POST /session` no mesmo workspace reutilize a sessão existente (`attached: true`); `'thread'` força uma nova sessão distinta a cada chamada. Omita para herdar o padrão em todo o daemon. Valores fora do enum retornam `400 { code: 'invalid_session_scope' }`. Daemons antigos (anteriores ao PR 5 do #4175) ignoram o campo silenciosamente — faça pre-flight em `caps.features.session_scope_override` antes de enviar. O padrão em todo o daemon está codificado como `'single'` em produção hoje; o #4175 pode adicionar uma flag CLI `--sessionScope` em um follow-up.         |

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

> ⚠️ **A rejeição de `modelServiceId` em uma nova sessão é silenciosa na resposta HTTP.** Um `modelServiceId` inválido (erro de digitação, serviço não configurado) NÃO gera um erro 500 na criação — a sessão permanece operacional no modelo padrão do agent, então o chamador ainda recebe um `sessionId` contra o qual pode tentar novamente a troca de modelo (via `POST /session/:id/model`). O sinal de falha visível é um evento `model_switch_failed` no stream SSE da sessão, disparado entre o handshake de spawn e sua primeira inscrição. **Assinantes que precisam observar este evento devem passar `Last-Event-ID: 0` em seu primeiro `GET /session/:id/events`** para repetir a partir do evento mais antigo disponível no ring (cobre o `model_switch_failed` no momento do spawn, mesmo que a inscrição ocorra alguns ms após a resposta de criação).

### `POST /session/:id/load`

Restaura uma sessão ACP persistida por id e repete seu histórico via SSE. O id no path é autoritativo; qualquer campo `sessionId` no body é ignorado. Faça pre-flight em `caps.features.session_load` — daemons antigos retornam `404` para esta rota.

Requisição:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Field | Required | Notes                                                                                                                                                                                                                                |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | no       | Mesmas regras de canonização + `workspace_mismatch` que `POST /session`. Omita para herdar `/capabilities.workspaceCwd`. `mcpServers` intencionalmente NÃO é aceito aqui — o MCP em todo o daemon é orientado por configurações (igual a `POST /session`). |

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

`state` espelha o `LoadSessionResponse` do ACP — `models` é um `SessionModelState`, `modes` um `SessionModeState`, `configOptions` um array de `SessionConfigOption`. Campos ausentes são decididos pelo agent. Anexadores tardios (os caminhos `attached: true` abaixo) recebem o MESMO snapshot de `state` que o chamador de load original viu — o daemon o armazena em cache na entrada; mutações em tempo de execução (por exemplo, `model_switched`) são entregues no stream SSE, não nas respostas de anexo subsequentes.

`attached: true` significa que a sessão já estava ativa (seja de um `session/load`/`session/resume` anterior, ou porque um chamador concorrente coalescido ganhou a corrida por pouco).

**Repetição de histórico via SSE.** Enquanto `loadSession` está em andamento no lado do agent, o agent emite notificações `session_update` para cada turno persistido. O daemon os armazena em buffer no event-bus da sessão antes que a resposta da rota seja retornada, então assinantes que chamam imediatamente `GET /session/:id/events` com `Last-Event-ID: 0` veem a repetição completa. **O ring de repetição é delimitado** (padrão de 8000 frames por sessão). Históricos longos com muitos turnos de tool-call / thought-stream podem exceder isso — os frames mais antigos são descartados silenciosamente. Clientes que precisam do histórico completo devem se inscrever imediatamente após o retorno de `load`; alternativamente, eles podem persistir os ids de eventos SSE e usar `Last-Event-ID` para retomar a partir de um limite de turno posterior.

**Erros:**

- `404` — o id da sessão persistida não existe (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (mesmo formato que `POST /session`).
- `503` — `session_limit_exceeded` (conta contra `--max-sessions`; restaurações em andamento também são contabilizadas).
- `409` — `restore_in_progress` (um `session/resume` para o mesmo id já está em andamento). `Retry-After: 5`. Corridas de mesma ação (dois `session/load` concorrentes para o mesmo id) são coalescidas — exatamente um retorna `attached: false`, o resto retorna `attached: true` com o mesmo `state`.
- `409` — `session_archived` quando o id existe apenas em `chats/archive/`; chame `POST /sessions/unarchive` antes de `load` ou `resume`.
- `409` — `session_archiving` quando o arquivamento ou desarquivamento está em andamento para o mesmo id. `Retry-After: 5`.
- `409` — `session_conflict` quando o id existe tanto em `chats/` quanto em `chats/archive/`; exclua a sessão com `POST /sessions/delete` antes de carregar.
### `POST /session/:id/resume`

Restaura uma sessão ACP persistida pelo ID SEM reproduzir o histórico via SSE. O contexto do modelo é restaurado internamente no lado do agente (via `geminiClient.initialize` lendo `config.getResumedSessionData`); o stream SSE permanece limpo para clientes que já têm o histórico renderizado. Pré-voo `caps.features.session_resume`; `unstable_session_resume` permanece como um alias de compatibilidade obsoleto para clientes mais antigos.

Mesmo formato de requisição que `/load`. Mesmo formato de resposta — `state` espelha o `ResumeSessionResponse` do ACP. Mesmo envelope de erro, incluindo `409 restore_in_progress` (disparado quando um `session/load` está em andamento; requisições `session/resume` concorrentes com outra `session/resume` são coalescidas).

Use `/load` quando o cliente não tem histórico renderizado (reconexão a frio, seletor → abrir). Use `/resume` quando o cliente já tem os turnos na tela e só precisa recuperar o handle no lado do daemon.

> ⚠️ **Por que `unstable_session_resume` ainda é anunciado?** A rota HTTP do daemon e a capability `session_resume` são estáveis para a v1, mas a bridge ainda chama `connection.unstable_resumeSession` do ACP. A tag antiga permanece apenas para que SDKs lançados antes de `session_resume` continuem funcionando.

### `GET /workspace/:id/sessions`

Lista sessões persistidas cujo workspace canônico corresponde a `:id` (cwd absoluto codificado por URL). A lista padrão são as sessões ativas de `chats/`; passe `archiveState=archived` para listar sessões arquivadas de `chats/archive/`. `archiveState=all` não é suportado na v1.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
```

Parâmetros de query:

| Campo          | Obrigatório | Notas                                                                                                   |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `archiveState` | não       | `active` (padrão) ou `archived`. Qualquer outro valor retorna `400 { code: "invalid_archive_state" }`.      |
| `cursor`       | não       | Cursor de paginação da resposta anterior.                                                           |
| `size`         | não       | Tamanho da página. Valores inválidos retornam `400 { code: "invalid_cursor" }` ou a validação de tamanho de página existente. |

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

Listas ativas incluem campos de overlay do daemon em tempo real, como `clientCount` e `hasActivePrompt`. Listas arquivadas são apenas de armazenamento: `isArchived` é `true`, e os campos de overlay em tempo real permanecem ausentes ou falsos. Array vazio (não 404) quando não existem sessões — uma UI de seletor de sessão não deve gerar erro apenas porque o workspace está ocioso.

### `POST /sessions/delete`

Exclui permanentemente (hard-delete) um ou mais arquivos JSONL de sessão persistidos. O daemon primeiro fecha as sessões ativas com o melhor esforço (best-effort) e, em seguida, remove o JSONL ativo ou arquivado. Se ambas as cópias, ativa e arquivada, existirem para o mesmo ID, ambas serão removidas. Os sidecars do worktree em ambos os lados são limpos; o histórico de arquivos, transcrições de subagentes e sidecars de runtime são intencionalmente preservados.

Requisição:

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

Arquiva uma ou mais sessões. Arquivar é uma transição de estado, não uma exclusão: o JSONL move de `chats/<id>.jsonl` para `chats/archive/<id>.jsonl`. O histórico de arquivos, transcrições de subagentes e sidecars de runtime permanecem no lugar. Se uma sessão estiver ativa, o daemon primeiro realiza um fechamento estrito e exige que o handler de fechamento do agente ACP faça o flush da gravação do chat; se o fechamento ou o flush falhar, o JSONL não é movido. Pré-voo `caps.features.session_archive`.

Requisição:

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` deve ser um array de strings não vazio com no máximo 100 IDs. Duplicatas são colapsadas.

Resposta:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

As entradas de `errors` têm `{ "sessionId": "<uuid>", "error": "message" }`. Arquivos ativos e arquivados com o mesmo ID são tratados como um conflito e reportados em `errors`; nenhum arquivo é sobrescrito.

### `POST /sessions/unarchive`

Restaura sessões arquivadas para o diretório ativo. Isso não retoma a sessão por si só; apenas move `chats/archive/<id>.jsonl` de volta para `chats/<id>.jsonl`. Após o sucesso do unarchive, os clientes podem chamar `POST /session/:id/load` ou `POST /session/:id/resume`.

Requisição:

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

Se um JSONL ativo já existir para o ID, o unarchive reporta um conflito em `errors` e não o sobrescreve. Um archive ou unarchive em andamento para o mesmo ID retorna `409 session_archiving` antes de iniciar o lote.

ACP-over-HTTP usa os mesmos corpos de requisição e resposta através dos métodos de vendor `_qwen/sessions/archive` e `_qwen/sessions/unarchive`. A tabela de rotas REST mapeia `POST /sessions/archive` e `POST /sessions/unarchive` para esses métodos para transports ACP.

### `POST /session/:id/prompt`

Encaminha um prompt para o agente. Chamadores de múltiplos prompts enfileiram em FIFO por sessão (o ACP garante um prompt ativo por sessão).

Requisição:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

Validação: `prompt` deve ser um array de objetos não vazio. Outras falhas retornam `400` antes de chegar à bridge.

Resposta:

```json
{ "stopReason": "end_turn" }
```

Outros motivos de parada: `cancelled`, `max_tokens`, `error`, `length` (conforme a especificação do ACP).

Se o cliente HTTP desconectar no meio do prompt, o daemon envia uma notificação `cancel` do ACP para o agente, que encerra o prompt com `stopReason: "cancelled"`.

> **Limitação da Stage 1 — sem timeout de prompt no lado do servidor.** A bridge
> apenas coloca em corrida (race) o `prompt()` do agente contra `transportClosedReject`
> (o crash do processo filho do agente) e o AbortSignal de desconexão HTTP
> do chamador. Um agente travado mas vivo (por exemplo, uma chamada de modelo que
> trava) bloqueia o FIFO por sessão até que o cliente HTTP atinja o timeout
> do seu lado e desconecte. Prompts de longa execução são legítimos
> (pesquisa profunda, análise de codebase grande), então um deadline padrão
> não é definido deliberadamente; a Stage 2 exporá um `promptTimeoutMs`
> configurável como opt-in. Até lá, os chamadores devem definir seu próprio
> timeout no lado do cliente e desconectar (ou chamar
> `POST /session/:id/cancel`) na expiração.

### `POST /session/:id/cancel`

Cancela o prompt **atualmente ativo** na sessão. No lado do ACP, isso é uma notificação, não uma requisição — o agente reconhece resolvendo o `prompt()` ativo com `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrato de múltiplos prompts:** o cancelamento afeta apenas o prompt ativo. Quaisquer prompts que o mesmo cliente enviou anteriormente via POST e que ainda estão enfileirados atrás do ativo continuarão a ser executados. O enfileiramento de múltiplos prompts é um comportamento introduzido pelo daemon (não está na especificação do ACP); o contrato para prompts enfileirados é "eles continuam executando a menos que você cancele cada um, ou encerre a sessão via saída do canal".

### `DELETE /session/:id`

Fecha explicitamente uma sessão ativa. Força o fechamento mesmo quando outros clientes estão conectados — cancela qualquer prompt ativo, resolve permissões pendentes como canceladas, publica o evento `session_closed`, fecha o EventBus e remove a sessão dos mapas do daemon. Sessões persistidas em disco NÃO são excluídas — elas podem ser recarregadas via `POST /session/:id/load`. Pré-voo `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotente: retorna `404` para sessões desconhecidas (mesmo formato de `SessionNotFoundError` que outras rotas).

> **Evento `session_closed`.** Assinantes SSE recebem um evento terminal `session_closed` com `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` antes do stream terminar. Reducers do SDK tratam isso de forma idêntica a `session_died` (define `alive: false`, limpa `pendingPermissions`).

### `PATCH /session/:id/metadata`

Atualiza metadados mutáveis da sessão. Atualmente suporta apenas `displayName`. Pré-voo `caps.features.session_metadata`.

Requisição:

```json
{ "displayName": "My Investigation Session" }
```

| Campo         | Obrigatório | Notas                                                                          |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `displayName` | não       | String, max 256 caracteres. String vazia limpa o nome. Omita para deixar como está. |

Resposta:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Publica um evento `session_metadata_updated` no stream SSE da sessão com `{ sessionId, displayName }`.

### `POST /session/:id/heartbeat`

Atualiza a contabilidade de last-seen do daemon para esta sessão. Adaptadores de longa duração (TUI/IDE/web) fazem ping nisso em um intervalo para que a futura política de revogação (Wave 5 PR 24) possa distinguir clientes mortos de clientes quietos.

Headers:

| Header             | Obrigatório | Notas                                                                                                                                                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | não       | Ecoa o ID emitido pelo daemon de `POST /session`. Clientes identificados também atualizam seu timestamp por cliente; heartbeats anônimos atualizam apenas a marca d'água por sessão. Deve satisfazer o mesmo formato `[A-Za-z0-9._:-]{1,128}` usado em outros lugares. |

O corpo da requisição está vazio (`{}` é válido — nenhum campo é lido hoje).

Resposta:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` é ecoado apenas quando um `X-Qwen-Client-Id` confiável foi fornecido. `lastSeenAt` é o epoch `Date.now()` (ms) do lado do daemon que a bridge armazenou.

Erros:

- `400` — `{ code: 'invalid_client_id' }` quando o header está malformado (regra de formato do header) ou quando carrega um `clientId` que não está registrado para esta sessão (a bridge lança `InvalidClientIdError` antes de atualizar qualquer timestamp).
- `404` — sessão desconhecida.

Gating de capability: pré-voo `caps.features.client_heartbeat`. Daemons mais antigos retornam `404` para este caminho.

### `POST /session/:id/model`

Troca o modelo ativo **dentro** do serviço de modelo atualmente vinculado à sessão. Serializado através da fila de troca de modelo por sessão.

(Para trocar o _serviço_ em si — Alibaba ModelStudio vs OpenRouter etc — passe `modelServiceId` em `POST /session` para uma nova sessão. A Stage 1 não tem uma rota de troca de serviço em tempo real.)

Requisição:

```json
{ "modelId": "qwen-staging" }
```

Resposta:

```json
{ "modelId": "qwen-staging" }
```

Em caso de sucesso, publica `model_switched` no stream SSE. Em caso de falha, publica `model_switch_failed` (para que assinantes passivos vejam a falha, não apenas o chamador). Coloca em corrida (race) contra a saída do canal do agente para que um processo filho travado não possa bloquear o handler HTTP.

### `POST /session/:id/recap`

Capability tag: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Gera um resumo de uma frase de "onde eu parei" da sessão. Encapsula o `generateSessionRecap` do core (`packages/core/src/services/sessionRecap.ts`), que executa uma side-query contra o modelo rápido com ferramentas desabilitadas, `maxOutputTokens: 300`, e um formato de saída estrito `<recap>...</recap>`. A side-query lê o histórico de chat existente do GeminiClient da sessão e **não** adiciona a ele.

O corpo da requisição é ignorado (envie `{}` ou vazio). Gate de mutação não estrito — a postura espelha `/session/:id/prompt` (a chamada custa tokens, mas não muta estado). Nenhum evento SSE é publicado.

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
- ou ocorreu qualquer erro de modelo subjacente (o helper do core é best-effort e nunca lança exceção).

Erros:

- `400 {code: 'invalid_client_id'}` — header `X-Qwen-Client-Id` malformado.
- `404` — sessão desconhecida.

Cancelamento: **nenhum na v1**. A rota não escuta a desconexão do cliente HTTP, nenhum `AbortSignal` é encadeado na bridge, e o processo filho do ACP executa a side-query até o fim independentemente de o chamador ter desconectado. Os únicos limites são o timeout de segurança de 60s da bridge (`SESSION_RECAP_TIMEOUT_MS`) e a corrida de transporte fechado contra a morte do canal ACP. Isso é aceitável porque o recap é curto (tentativa única, `maxOutputTokens: 300`, ~1–5s típico); um ext-method baseado em request-id pode encadear um cancelamento completo de ponta a ponta em uma versão futura se o custo de largura de banda algum dia justificar.

### Mutação: approval, tools, init, MCP restart

A issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 adiciona quatro rotas de controle de mutação que permitem que clientes remotos mudem a postura de runtime sem tocar no CLI do host do daemon. Todas as quatro:

- São controladas pelo gate de mutação **estrito** do PR 15. Um daemon configurado sem um bearer token as rejeita com `401 {code: 'token_required'}`. Configure `--token` (ou `QWEN_SERVER_TOKEN`) antes de optar por usar.
- Aceitam e estampam o header `X-Qwen-Client-Id` (cadeia de auditoria do PR 7). Quando o header carrega um ID confiável, o daemon emite `originatorClientId` no evento SSE correspondente para que UIs multi-cliente possam suprimir ecos de suas próprias mutações.
- Fazem pré-voo de cada capability por tag antes de expor o recurso. Daemons mais antigos retornam `404` para a rota.

Três das quatro rotas (`tools/:name/enable`, `init`, `mcp/:server/restart`) emitem eventos **com escopo de workspace**: cada barramento SSE de sessão ativa recebe o evento, independentemente de qual sessão estava conectada quando a mutação foi disparada. `approval-mode` emite um evento **com escopo de sessão** porque a mudança é local para o `Config` de uma sessão.

#### `POST /session/:id/approval-mode`

Capability tag: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Muda o modo de aprovação de uma sessão ativa. O novo modo entra imediatamente no `Config` por sessão do processo filho do ACP. As configurações NÃO são gravadas em disco por padrão — passe `persist: true` para também gravar `tools.approvalMode` nas configurações do workspace.

Requisição:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` deve ser um de `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (espelho do enum `ApprovalMode` do core; o SDK exporta `DAEMON_APPROVAL_MODES` para validação em runtime). `persist` tem padrão `false`.

Resposta (200):

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

Erros:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — literal de modo desconhecido.
- `400 {code: 'invalid_persist_flag'}` — `persist` não é booleano.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — o modo solicitado requer uma pasta confiável (modos privilegiados em workspaces não confiáveis são rejeitados pelo `Config.setApprovalMode` do core).
- `404` — sessão desconhecida.

Evento SSE (com escopo de sessão): `approval_mode_changed` com `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Capability tag: `workspace_tool_toggle`. IO de arquivo puro — sem roundtrip no ACP.

Alterna um nome de ferramenta na lista de configurações `tools.disabled` do workspace. Ferramentas listadas ali **não são registradas** (distinto de `permissions.deny`, que mantém a ferramenta registrada e rejeita a invocação). Tanto ferramentas nativas quanto ferramentas descobertas via MCP passam por `ToolRegistry.registerTool`, que consulta o conjunto de desabilitadas.

> ⚠️ **Os nomes devem corresponder exatamente ao identificador exposto do registro.** Nenhuma resolução de alias acontece — a rota armazena qualquer string que esteja no parâmetro de caminho em `tools.disabled`, e o próximo processo filho do ACP compara com `tool.name` no momento do registro. Ferramentas nativas usam seu nome canônico de registro (forma de verbo em snake_case): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — NÃO os rótulos de exibição (`Shell`, `Read`, `Write`) que a CLI exibe. Ferramentas descobertas via MCP usam a forma qualificada `mcp__<server>__<name>` (que também é a forma que os eventos `tool_toggled` transmitem e o que `GET /workspace/mcp` lista). Desabilitar `Bash` NÃO impedirá que `run_shell_command` seja registrado na próxima sessão.

Processos filhos ACP ativos retêm ferramentas já registradas — a alteração faz efeito na **próxima** criação de processo filho do ACP. Combine com `POST /workspace/mcp/:server/restart` (para ferramentas de origem MCP) ou criação de nova sessão para tornar a mudança efetiva no daemon atual.

Nomes de ferramentas desconhecidos são aceitos: pré-desabilitar uma ferramenta MCP ainda não instalada é um caso de uso legítimo.

Requisição:

```json
{ "enabled": false }
```

Resposta (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Erros:

- `400 {code: 'invalid_tool_name'}` — parâmetro de caminho vazio, ou parâmetro de caminho excede o limite de 256 caracteres.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` ausente ou não booleano.

Evento SSE (com escopo de workspace): `tool_toggled` com `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Capability tag: `workspace_init`. IO de arquivo puro — sem roundtrip no ACP, **sem invocação de LLM**.

Cria a estrutura de um `QWEN.md` vazio (ou o que quer que `getCurrentGeminiMdFilename()` retorne sob as substituições de `--memory-file-name`) na raiz do workspace vinculado ao daemon. Apenas mecânico — para preenchimento de conteúdo por IA, siga com `POST /session/:id/prompt`.

O padrão recusa sobrescrever quando o arquivo alvo existe com conteúdo que não seja espaço em branco. Arquivos apenas com espaços em branco são tratados como ausentes (corresponde ao comando slash `/init` local).

Requisição:

```json
{ "force": false }
```

Resposta (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` é `'created'` para criações novas, `'noop'` quando um arquivo existente apenas com espaços em branco foi deixado intacto (nenhuma gravação realizada), e `'overwrote'` quando `force: true` substituiu conteúdo não vazio. O evento SSE `workspace_initialized` espelha a ação da resposta — observadores podem filtrar por `action !== 'noop'` para reagir apenas a mudanças reais em disco.

Erros:

- `400 {code: 'invalid_force_flag'}` — `force` não é booleano.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — o arquivo existe com conteúdo que não seja espaço em branco e `force` foi omitido ou é falso. O corpo carrega o caminho absoluto e o tamanho (bytes) para que clientes SDK possam renderizar um prompt "sobrescrever N bytes?" sem precisar fazer stat novamente.

Evento SSE (com escopo de workspace): `workspace_initialized` com `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Capability tag: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Reinicia um servidor MCP configurado através do `McpClientManager.discoverMcpToolsForServer` do processo filho do ACP (desconectar + reconectar + redescobrir). Pré-verifica o snapshot de orçamento em tempo real da contabilidade do PR 14 v1 para que uma reinicialização em um workspace com orçamento saturado retorne uma recusa suave em vez de disparar uma cascata de `BudgetExhaustedError`.
O corpo da requisição está vazio (`{}`). O parâmetro de caminho é o nome do servidor codificado por URL conforme aparece na configuração `mcpServers`.

Resposta (200) — união discriminada em `restarted`:

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

Motivos de soft skip (todos retornam 200):

| `reason`                | Significado                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Outra descoberta / reinicialização para este servidor já está em andamento. A rota retorna imediatamente em vez de aguardar a promise original. O chamador deve tentar novamente após um curto atraso. |
| `'disabled'`            | O servidor está configurado, mas listado em `excludedMcpServers`. Reative-o antes de reiniciar.                                                                                           |
| `'budget_would_exceed'` | O daemon está com `--mcp-budget-mode=enforce`, o servidor de destino não está atualmente em `reservedSlots` e o total em tempo real atingiu `clientBudget`. O chamador deve liberar um slot primeiro.         |

Erros (não-2xx):

- `400 {code: 'invalid_server_name'}` — parâmetro de caminho vazio.
- `404` — nome do servidor não está na configuração `mcpServers`, ou nenhum canal ACP ativo existe (a reinicialização requer inerentemente uma instância ativa de `McpClientManager`).
- `500` — erro interno (ex.: `ToolRegistry` não inicializado).

Eventos SSE (escopo do workspace): `mcp_server_restarted` com `{serverName, durationMs, originatorClientId?}` em caso de sucesso; `mcp_server_restart_refused` com `{serverName, reason, originatorClientId?}` em caso de soft skip.

### `GET /session/:id/events` (SSE)

Inscreva-se no stream de eventos da sessão.

Headers:

```
Accept: text/event-stream
Last-Event-ID: 42        ← opcional, faz replay a partir do id 42
```

Parâmetros de query:

| Parâmetro   | Obrigatório | Observações                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued` | não         | Limite de **live-backlog** por assinante. Intervalo `[16, 2048]`, padrão 256. Frames de replay forçados no momento da assinatura são isentos do limite; o que realmente o consome são os eventos ao vivo que chegam enquanto o assinante ainda está drenando um grande replay de `Last-Event-ID: 0`. Aumente o valor para reconexões a frio para que a cauda ao vivo não acione o aviso de cliente lento / evicção antes que o consumidor alcance o atraso. Valores fora do intervalo / não decimais / presentes mas vazios retornam `400 invalid_max_queued` antes que o handshake SSE seja aberto. Pre-flight `caps.features.slow_client_warning` — daemons antigos ignoram o parâmetro silenciosamente. |

Formato do frame. A linha `data:` é o **envelope de evento completo**, serializado em JSON em uma única linha — `{id?, v, type, data, originatorClientId?}`. O payload específico do ACP (`sessionUpdate`, argumentos de `requestPermission`, etc.) fica sob o campo `data` do envelope; o próprio `type` do envelope corresponde à linha `event:` do SSE.

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

As linhas `id:` / `event:` no nível do SSE duplicam `envelope.id` / `envelope.type` para compatibilidade com EventSource. Consumidores que usam `fetch` puro (como o `parseSseStream` do SDK) leem tudo do envelope JSON e ignoram as linhas de preâmbulo do SSE.

| Tipo de evento            | Gatilho                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`          | Qualquer notificação ACP `sessionUpdate` (chunks do LLM, chamadas de ferramentas, uso)                                                                                                                                                                                                                                 |
| `permission_request`      | O agente solicitou aprovação de ferramenta                                                                                                                                                                                                                                                                             |
| `permission_resolved`     | Algum cliente votou em uma permissão via `POST /permission/:requestId`                                                                                                                                                                                                                                                 |
| `permission_partial_vote` | (apenas consensus) Um voto foi registrado, mas o quórum ainda não foi atingido. Carrega `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pre-flight `caps.features.permission_mediation`.                                                                                                  |
| `permission_forbidden`    | Um voto foi rejeitado pela política ativa (incompatibilidade de `designated`, `local-only` não-loopback, ou votante `consensus` não está no snapshot). Carrega `{requestId, sessionId, clientId?, reason}`. Pre-flight `caps.features.permission_mediation`.                                                           |
| `model_switched`          | `POST /session/:id/model` teve sucesso                                                                                                                                                                                                                                                                                 |
| `model_switch_failed`     | `POST /session/:id/model` foi rejeitado                                                                                                                                                                                                                                                                                |
| `session_died`            | O processo filho do agente travou inesperadamente. **Terminal: o stream SSE fecha após este frame; a sessão é removida de `byId`.** Os assinantes devem reconectar via `POST /session` para criar uma nova.                                                                                                           |
| `slow_client_warning`     | Local do assinante: fila ≥ 75% cheia. **Não-terminal** — o stream continua; o aviso é um alerta prévio antes da evicção. Carrega `{queueSize, maxQueued, lastEventId}`. Disparado UMA VEZ por episódio de estouro; rearma após a fila drenar abaixo de 37,5%. Sem `id` (sintético). Pre-flight `caps.features.slow_client_warning`. |
| `client_evicted`          | Local do assinante: estouro da fila. **Terminal: o stream SSE fecha após este frame** (sem `id` — sintético). Outros assinantes na mesma sessão continuam.                                                                                                                                                             |
| `stream_error`            | Erro no lado do daemon durante o fan-out. **Terminal: o stream SSE fecha após este frame** (sem `id` — sintético).                                                                                                                                                                                                     |

Semântica de reconexão:

- Envie `Last-Event-ID: <n>` para fazer replay de eventos com `id > n` a partir do ring por sessão (profundidade padrão **8000**, ajustável via `qwen serve --event-ring-size <n>`)
- **Detecção de lacuna (lado do cliente):** se `<n>` for anterior ao evento mais antigo ainda no ring (ex.: você reconecta com `Last-Event-ID: 50`, mas o ring agora contém 200–1199), o daemon faz replay a partir do evento disponível mais antigo sem gerar erro. Compare o `id` do primeiro evento reproduzido com `n + 1`; qualquer diferença é o tamanho da janela perdida. O Stage 2 injetará um frame sintético `stream_gap` explícito no lado do daemon; no Stage 1, a detecção é responsabilidade do cliente.
- Os IDs são monóticos por sessão, começando em 1
- Frames sintéticos (`client_evicted`, `slow_client_warning`, `stream_error`) omitem intencionalmente o `id` para não consumir um slot de sequência para outros assinantes

Backpressure:

- A fila por assinante tem como padrão `maxQueued: 256` itens ao vivo (frames de replay durante a reconexão ignoram o limite). Substitua via `?maxQueued=N` (intervalo `[16, 2048]`) na requisição SSE.
- Quando a fila de um assinante ultrapassa 75% de capacidade, o bus força o envio de um frame sintético `slow_client_warning` para esse assinante (uma vez por episódio de estouro; rearmado após drenar abaixo de 37,5%). O stream permanece aberto — o aviso é um alerta para que o cliente possa drenar mais rápido ou fazer detach + reconectar de forma limpa.
- Se a fila realmente estourar após o aviso, o bus emite o frame terminal `client_evicted` e fecha a assinatura.

### `POST /permission/:requestId`

Registre um voto em um `permission_request` pendente. A **política de mediação** ativa decide quem vence:

| Política                    | Comportamento                                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (padrão)  | Qualquer votante validado vence; votantes posteriores recebem `404`. Linha de base pré-F3.                                                                                                                |
| `designated`                | Apenas o originador do prompt (`originatorClientId`) decide; não-originadores recebem `403 permission_forbidden / designated_mismatch`. Faz fallback para first-responder para prompts anônimos.           |
| `consensus`                 | N de M votantes devem concordar (padrão `N = floor(M/2) + 1`, substituído via `policy.consensusQuorum`). A primeira opção a atingir `N` vence. Votos não-resolutivos recebem frames SSE `200` + `permission_partial_vote`. |
| `local-only`                | Apenas votantes loopback decidem; chamadores remotos recebem `403 permission_forbidden / remote_not_allowed`.                                                                                             |

A política ativa é configurada em `settings.json` sob `policy.permissionStrategy` e exposta em `/capabilities` em `body.policy.permission`. Pre-flight `caps.features.permission_mediation` (com `modes: [...]`) para o conjunto suportado pelo build.

> **F3 (#4175): coordenação de permissões multi-cliente.** O F3 adicionou as quatro políticas acima. Daemons pré-F3 tinham first-responder em hardcode; o formato na rede (wire shape) permanece inalterado bit a bit quando a política configurada é `first-responder`. Novos eventos (`permission_partial_vote`, `permission_forbidden`) são aditivos — SDKs antigos os veem como `unrecognized_known_event` e os ignoram graciosamente.

> **Timeout de permissão (padrão 5 minutos).** Um `permission_request`
> permanece pendente até que: (a) algum cliente vote aqui, (b) `POST /session/:id/cancel`
> seja disparado, (c) o cliente HTTP que conduz o prompt desconecte
> (o cancelamento no meio do prompt resolve permissões pendentes como `cancelled`),
> (d) a sessão seja encerrada, (e) o daemon seja desligado, **ou
> (f) o timeout de permissão por sessão seja disparado** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 minutos). No disparo do timeout, o `requestPermission` do agente é resolvido
> como `{outcome: 'cancelled'}`, o ring de auditoria registra uma
> entrada `permission.timeout`, o stderr do daemon emite um breadcrumb
> de uma linha, e o bus SSE faz o fan-out do frame padrão
> `permission_resolved` cancelado para que os assinantes façam a limpeza. O
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

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — aceitar / rejeitar / proceder-uma-vez / etc, de acordo com as opções oferecidas pelo agente
- `{ "outcome": "cancelled" }` — descartar a requisição (equivale ao que `cancelSession` / `shutdown` fazem internamente)

Resposta:

- `200 {}` — seu voto foi aceito (resolvido OU registrado sob quórum de consensus)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: a política ativa rejeitou seu voto
- `404 { "error": "..." }` — o requestId é desconhecido (já resolvido, nunca existiu ou a sessão foi derrubada)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: o `allowedOptionIds` do agente contém o sentinel reservado `'__cancelled__'`; violação de contrato entre agente / daemon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 forward-compat: um literal de política chegou ao schema, mas seu branch de mediação ainda não foi construído (atualmente inalcançável; reservado para políticas futuras)

Após um voto bem-sucedido, todo cliente conectado vê `permission_resolved` com o mesmo `requestId` e o `outcome` escolhido. Sob `consensus`, votos intermediários também fazem fan-out de `permission_partial_vote` até atingir o quórum.

### Rotas do Auth device-flow (issue #4175 PR 21)

O daemon intermedia um OAuth 2.0 Device Authorization Grant (RFC 8628) para que um cliente SDK remoto possa acionar um login cujos tokens aterrissam no sistema de arquivos do **daemon** — não no cliente. O daemon faz polling do próprio IdP; a única tarefa do cliente é exibir a URL de verificação + o código do usuário e (opcionalmente) se inscrever no SSE para eventos de conclusão.

Tag de capacidade: `auth_device_flow` (sempre anunciada). Provedores suportados na
v1: `qwen-oauth`.

> [!note]
>
> O tier gratuito do Qwen OAuth foi descontinuado em 15/04/2026. Trate `qwen-oauth` como o
> identificador de provedor legado v1 neste protocolo; novos clientes devem preferir um
> provedor de auth atualmente suportado quando houver um disponível.

**Localidade de runtime.** O daemon nunca abre um navegador — mesmo que possa. O cliente decide se deve chamar `open(verificationUri)` localmente; em um pod headless (o deployment canônico do Modo B), o usuário abre a URL em qualquer dispositivo onde tenha um navegador. Consulte `docs/users/qwen-serve.md` para a UX recomendada.

**Sem vazamento de token em eventos.** `auth_device_flow_started` carrega apenas `{deviceFlowId, providerId, expiresAt}`. O código do usuário e a URL de verificação retornam ponto a ponto no corpo do POST 201 e via `GET /workspace/auth/device-flow/:id`; eles nunca são transmitidos via broadcast no SSE.

**Singleton por provedor.** Um segundo `POST` para o mesmo provedor enquanto um fluxo está pendente é uma retomada idempotente — ele retorna a entrada existente com `attached: true` em vez de iniciar uma nova requisição ao IdP.

#### `POST /workspace/auth/device-flow`

Gate de mutação estrito: requer um bearer token mesmo nos padrões loopback sem token (`401 token_required`).

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

Leia o estado atual. Entradas pendentes ecoam `userCode/verificationUri/expiresAt/intervalMs`; entradas terminais (graça de 5 min) os removem e expõem `status` + `errorKind/hint` opcional.

Retorna `404 device_flow_not_found` para ids desconhecidos e entradas evictadas pós-graça.

#### `DELETE /workspace/auth/device-flow/:id`

Cancelamento idempotente:

- entrada pendente → `204` + emite `auth_device_flow_cancelled`
- entrada terminal → `204` no-op (sem re-emissão de evento)
- id desconhecido → `404`

#### `GET /workspace/auth/status`

Snapshot dos fluxos pendentes + provedores suportados:

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

Cinco eventos tipados (escopo do workspace, com fan-out para cada bus de sessão ativo):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST teve sucesso; o SDK deve se inscrever (sem userCode aqui, busque via GET se necessário)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — o daemon respeitou o `slow_down` do upstream; clientes fazendo polling no GET devem aumentar seu intervalo para corresponder
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — credenciais persistidas; `accountAlias` é um rótulo não-PII (nunca email/telefone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal; `errorKind` é um de `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` é interno do daemon: o exchange com o IdP teve sucesso, mas o daemon não conseguiu armazenar as credenciais de forma durável (EACCES / EROFS / ENOSPC). O usuário deve tentar novamente quando a condição de disco subjacente for corrigida.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE teve sucesso contra uma entrada pendente
> **Não compatível com MCP.** A especificação de autorização do MCP (2025-06-18) exige OAuth 2.1 + PKCE auth-code com um callback de redirecionamento, o que não funciona para daemons em pods headless. A superfície de device-flow do Modo B é privada do daemon — clientes que visam servidores compatíveis com MCP devem usar um caminho de autenticação diferente.

## Wire format de streaming

Os eventos são emitidos como frames padrão do EventSource. O daemon escreve uma linha `data:` por frame (o JSON não possui quebras de linha embutidas após `JSON.stringify`); o parser do SDK em `packages/sdk-typescript/src/daemon/sse.ts` lida tanto com isso quanto com a forma multi-`data:` permitida pela especificação no lado do recebimento.

## Frames de erro durante o streaming

Se o iterador da bridge lançar uma exceção ao servir um assinante SSE, o daemon emite um frame terminal `stream_error` (sem `id`). A linha `data:` é o envelope completo (mesmo formato de qualquer outro frame SSE neste documento); a mensagem de erro real fica em `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

A conexão é então fechada.

## Variáveis de ambiente

| Variável            | Propósito                                                      |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Token Bearer. Espaços em branco no início e no fim são removidos na inicialização. |

## Estrutura do código-fonte

| Caminho                                              | Propósito                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | Comando yargs + esquema de flags                                                                           |
| `packages/cli/src/serve/run-qwen-serve.ts`           | Ciclo de vida do listener + tratamento de sinais                                                           |
| `packages/cli/src/serve/server.ts`                   | Montagem do app Express, ordem dos middlewares e rotas diretas restantes                                   |
| `packages/cli/src/serve/routes/*.ts`                 | Grupos de rotas Express focados, incluindo sessão, SSE, auth do workspace, status do workspace e rotas de arquivo |
| `packages/cli/src/serve/auth.ts`                     | bearer + allowlist de Host + negação de CORS                                                               |
| `packages/cli/src/serve/acp-session-bridge.ts`       | Facade de compatibilidade da bridge local do CLI para spawn-or-attach, FIFO por sessão e registro de permissões |
| `packages/acp-bridge/src/status.ts`                  | Tipos de wire de status do daemon somente leitura + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | Helper puro que constrói payloads `/workspace/env` a partir do estado `process.*`, incluindo redação de credenciais |
| `packages/acp-bridge/src/eventBus.ts`                | Fila assíncrona limitada + ring de replay                                                                  |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | Cliente TS                                                                                                 |
| `packages/sdk-typescript/src/daemon/sse.ts`          | Parser de frames EventSource                                                                               |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 casos, sem LLM                                                                                          |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 casos, processo filho real `qwen --acp` suportado pelo servidor OpenAI fake local (apenas POSIX; ignorado no Windows) |