# Referência do protocolo HTTP do `qwen serve`

Estágio 1 do [design do daemon qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Todas as rotas ficam sob a URL base do daemon (padrão `http://127.0.0.1:4170`).

## Autenticação

Quando o daemon foi iniciado com `--token` ou `QWEN_SERVER_TOKEN`, **toda rota exceto `/health` em binds de loopback** deve carregar:

```
Authorization: Bearer <token>
```

Sem um token configurado (padrão de desenvolvimento em loopback), o cabeçalho é opcional. A comparação de tokens é em tempo constante. As respostas 401 são uniformes entre `missing header`, `wrong scheme` e `wrong token`.

**Isenção do `/health`** (Bctum): em binds de loopback (`127.0.0.1` / `localhost` / `::1` / `[::1]`) `/health` é registrada ANTES do middleware bearer, então as sondas de liveness dentro do pod não precisam carregar o token mesmo quando o daemon foi iniciado com `--token`. Binds não loopback (`--hostname 0.0.0.0` etc.) bloqueiam `/health` atrás do bearer como qualquer outra rota — veja a seção [`GET /health`](#get-health) para a justificativa.

**`--require-auth` (#4175 PR 15).** Passe esta flag na inicialização para estender a regra "deve ter um token" também para loopback. A inicialização falha sem um token; a isenção do `/health` é removida (então `/health` também requer `Authorization: Bearer …`).

Quando a flag está ativa, o middleware global `bearerAuth` protege **todas** as rotas — incluindo `/capabilities`. Um cliente **não autenticado** portanto não pode fazer pre-flight em `caps.features` para descobrir que a autenticação é necessária: a superfície de descoberta para esse caso é o próprio **corpo da resposta 401** (uniforme em todas as rotas de acordo com a seção [Autenticação](#authentication)). A tag de capacidade `require_auth` é uma **confirmação pós-autenticação** — uma vez que um cliente autentica com sucesso e lê `/capabilities`, a presença da tag confirma que o daemon foi iniciado com `--require-auth` (útil para UIs de auditoria/conformidade e para clientes SDK exibirem "esta implantação está robusta" em um painel de configurações). Rotas de mutação que optam pelo modo estrito por rota (acompanhamentos da Onda 4) recusam com `401 { code: "token_required", error: "…" }` quando acessadas em um loopback padrão sem token — mas com `--require-auth` ativado, o middleware bearer global interrompe a requisição antes da barreira por rota, então o corpo legado `Unauthorized` é o que os chamadores não autenticados realmente veem.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Webuis de navegador acessando o daemon de origem cruzada são bloqueados por padrão — qualquer requisição com um cabeçalho `Origin` retorna `403 {"error":"Request denied by CORS policy"}` porque clientes CLI/SDK nunca enviam `Origin` e o daemon interpreta sua presença como um sinal de que a requisição veio de um contexto de navegador no qual o operador não optou. Passe `--allow-origin <pattern>` (repetível) na inicialização para instalar uma lista de permissões em vez do bloqueio. Cada padrão é:

- O literal `*` — admitir qualquer origem. **Risco**: a inicialização recusa quando `*` está configurado mas nenhum token bearer está definido (qualquer fonte: `--token`, `QWEN_SERVER_TOKEN`, ou `--require-auth` que exige um token na inicialização). O rastro de inicialização emite um aviso no stderr quando `*` está na lista. **Recomendação**: combine com `--require-auth` em binds de loopback para que `/health` e `/demo` também sejam protegidos pelo bearer — eles são registrados antes do middleware bearer em loopback por padrão (para que sondas k8s/Compose possam acessar `/health` sem token), e uma lista de permissões com `*` os torna acessíveis de qualquer navegador de origem cruzada. Em binds não loopback o bearer já é obrigatório na inicialização, então a superfície de exposição do `*` é apenas `/health` (JSON de status) e `/demo` (uma página estática cujo JS ainda chama rotas protegidas por token) — a superfície real da API é protegida de qualquer forma.
- Uma origem de URL canônica — `<scheme>://<host>[:<port>]`. **Sem barra final, sem caminho, sem userinfo, sem query.** A inicialização recusa com `InvalidAllowOriginPatternError` se a entrada falhar no teste de ida e volta `new URL(pattern).origin === pattern`; a mensagem de erro nomeia o padrão ruim e a forma canônica. Rigor intencional: normalização silenciosa (por exemplo, remover uma barra final) permitiria que erros de digitação passassem e aceitasse entrada ambígua.

Origens correspondidas recebem os cabeçalhos de resposta CORS padrão em cada requisição:

```
Access-Control-Allow-Origin: <origem ecoada>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` ecoa a origem da requisição textualmente (minúsculas / maiúsculas conforme o navegador enviou) em vez do literal `*`, mesmo sob o padrão `*` — os caches do navegador armazenam respostas com base nisso em par com `Vary: Origin`, e ecoar deixa espaço para adicionar `Access-Control-Allow-Credentials` em uma versão futura sem uma mudança de esquema. `Access-Control-Expose-Headers: Retry-After` permite que webuis de navegador honrem as dicas de repetição do daemon de respostas `429` / `503`. `Access-Control-Allow-Credentials` **NÃO** é enviada hoje: o daemon autentica via bearer no `Authorization`, que funciona entre origens sem `credentials: 'include'`.

Requisições de preflight OPTIONS (OPTIONS com `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) são interrompidas com `204 No Content` mais os cabeçalhos acima. Este é o padrão CORS convencional e é seguro — o preflight apenas confirma quais métodos/cabeçalhos o daemon aceitará; a requisição subsequente real ainda executa toda a cadeia (lista de permissões de host → autenticação bearer → rotas), então a proteção anti-DNS-rebinding e a aplicação do bearer ainda ocorrem antes que qualquer estado seja lido ou modificado. Requisições OPTIONS comuns de origens correspondidas continuam fluindo downstream com os cabeçalhos CORS anexados.

Origens que não correspondem à lista de permissões ainda recebem `403 {"error":"Request denied by CORS policy"}` — mesmo formato do bloqueio padrão, para que clientes que já analisaram a resposta do bloqueio não precisem tratar de forma especial daemons com lista de permissões implantada. O caminho de rejeição **não** emite nenhum cabeçalho `Access-Control-*` (o navegador os ignoraria, e emiti-los indiretamente anunciaria o tamanho da lista de permissões através da presença do cabeçalho).

A lista de padrões configurada intencionalmente **não** é ecoada em `/capabilities` — o webui do navegador já conhece sua própria origem (afinal, ele chamou o daemon), e expor a lista permitiria que um leitor não autenticado de `/capabilities` enumerasse todas as origens confiáveis (reconhecimento útil para uma implantação mal configurada). Clientes SDK usam a tag `caps.features.allow_origin` para "este daemon honra acessos de navegador entre origens" sem precisar saber quais origens específicas.

Requisições de auto-origem em loopback (por exemplo, a página `/demo` chamando o daemon na mesma `127.0.0.1:porta`) são tratadas por um **shim separado** de remoção de Origin que é executado ANTES do middleware CORS e remove o cabeçalho `Origin` para `127.0.0.1:porta` / `localhost:porta` / `[::1]:porta` / `host.docker.internal:porta`. Portanto, elas passam independentemente da configuração de `--allow-origin` — os operadores não precisam listar a própria porta do daemon para fazer a página de demonstração funcionar.

## Formato comum de erro

Respostas 5xx carregam o `code` e `data` originais do erro quando presentes (estilo JSON-RPC — o SDK ACP encaminha `{code, message, data}` do agente):

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

`WorkspaceMismatchError` para um `POST /session` cujo `cwd` não se canoniciza para o workspace vinculado do daemon (#3803 §02 — 1 daemon = 1 workspace) retorna `400` com:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Use isso para detectar incompatibilidade antes do voo: leia `workspaceCwd` de `/capabilities` e omita `cwd` de `POST /session` (ele usa o workspace vinculado como fallback), ou direcione a requisição para um daemon vinculado ao `requestedWorkspace`.

`POST /session` além do limite `--max-sessions` do daemon retorna `503` com um cabeçalho `Retry-After: 5` e:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Anexos a sessões existentes **não** são contados no limite, então as reconexões de um daemon ocioso continuam funcionando mesmo quando está na capacidade máxima.

`RestoreInProgressError` — emitida apenas por `POST /session/:id/load` e `POST /session/:id/resume` — retorna `409` com um cabeçalho `Retry-After: 5` (correspondendo a `session_limit_exceeded`) e:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Acionada quando um `session/load` é emitido para um id que já tem um `session/resume` em andamento (ou vice-versa). Aguarde pelo menos `Retry-After` segundos e tente novamente — a restauração subjacente é concluída dentro de `initTimeoutMs` (padrão 10s). Races de mesma ação (`load` vs `load`, `resume` vs `resume`) coalescem em vez de gerar erro.

## Capacidades

O daemon anuncia suas tags de recurso suportadas a partir do registro de capacidade
de serviço. Clientes **devem** basear a UI em `features`, não em `mode` (por design
§10).

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

> Tags condicionais aparecem apenas quando sua alternância de implantação correspondente está ativa (veja a tabela abaixo). A tag `permission_mediation` do F3 está sempre ativa e carrega `modes: ['first-responder', 'designated', 'consensus', 'local-only']` para que clientes SDK possam inspecionar o conjunto suportado pela construção; a estratégia ativa em tempo de execução está em `body.policy.permission`.

`session_scope_override` é o identificador de negociação para o campo `sessionScope` por requisição em `POST /session` (veja abaixo). Daemons mais antigos ignoram silenciosamente o campo, então clientes SDK devem fazer pre-flight em `caps.features` por esta tag antes de enviá-lo.

`session_load` e `session_resume` anunciam as rotas de restauração explícita (`POST /session/:id/load` e `POST /session/:id/resume`). Daemons mais antigos retornam `404` para esses caminhos, então clientes SDK devem fazer pre-flight em `caps.features` antes de chamá-los. `unstable_session_resume` ainda é anunciada como um alias obsoleto para compatibilidade com SDKs que foram lançados enquanto o método ACP subjacente era nomeado `connection.unstable_resumeSession`; novos clientes devem usar `session_resume`.

`slow_client_warning` cobre dois ajustes de backpressure SSE lançados juntos no #4175 Wave 2.5 PR 10: (a) o daemon emite um quadro de evento sintético `slow_client_warning` no fluxo de eventos quando a fila de um assinante ultrapassa 75% de capacidade, uma vez por episódio de estouro (reativado após a fila drenar abaixo de 37,5%); (b) `GET /session/:id/events` aceita um parâmetro de consulta `?maxQueued=N` (intervalo `[16, 2048]`) para pré-dimensionar o backlog por assinante para reconexões frias contra um anel de repetição grande. O tamanho do anel em todo o daemon é controlado por `--event-ring-size` (padrão **8000**, conforme #3803 §02). Daemons antigos silenciosamente carecem de ambos — faça pre-flight desta tag antes de optar por ela.

`typed_event_schema` anuncia cargas de eventos do daemon que correspondem ao esquema `KnownDaemonEvent` do SDK. Daemons mais antigos ainda podem transmitir quadros compatíveis, mas clientes SDK devem fazer pre-flight desta tag antes de assumir cobertura de eventos tipados.

`client_heartbeat` anuncia `POST /session/:id/heartbeat`. Daemons mais antigos retornam `404`; faça pre-flight desta tag antes de emitir heartbeats periódicos.

`session_close` e `session_metadata` anunciam `DELETE /session/:id` e `PATCH /session/:id/metadata`. Daemons mais antigos retornam `404`; faça pre-flight destas tags antes de expor affordances de fechamento ou renomeação.

`session_lsp` anuncia `GET /session/:id/lsp`, o snapshot de status LSP estruturado somente leitura para clientes do daemon. Daemons mais antigos retornam `404`; faça pre-flight desta tag antes de expor status LSP remoto.

`session_status` anuncia `GET /session/:id/status`, o resumo da bridge ativa para uma única sessão por id (`clientCount` / `hasActivePrompt` e os campos principais). Daemons mais antigos retornam `404`; faça pre-flight desta tag antes de consultar o status de uma única sessão em vez de escanear a lista completa de sessões.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` e `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) anunciam as quatro rotas de controle de mutação documentadas abaixo em "Mutação: aprovação, ferramentas, init, reinicialização MCP". Todas as quatro são estritamente protegidas pela barreira de mutação do PR 15 (um daemon configurado sem token bearer as rejeita com 401 `token_required`). Daemons mais antigos retornam `404`; faça pre-flight de cada tag antes de expor a affordance correspondente.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) cobre a superfície de orçamento MCP: os campos `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` em `GET /workspace/mcp`, o campo `disabledReason` em células por servidor, e as flags de CLI `--mcp-client-budget` / `--mcp-budget-mode`. Daemons mais antigos omitem completamente os novos campos; clientes SDK fazem pre-flight desta tag antes de confiar na semântica de `budgets[]`. O descritor do registro também carrega `modes: ['warn', 'enforce']` para exposição futura de modos de recurso — por enquanto, os clientes inferem o modo a partir do campo `budgetMode` do snapshot. A recusa do servidor no modo `enforce` é determinista pela ordem de declaração de `Object.entries(mcpServers)`; uma futura camada de precedência de escopo (se o qwen-code adotar uma) mudaria para "menor precedência primeiro" para espelhar a convenção `plugin < user < project < local` do claude-code.

> ⚠️ **Escopo v1 do PR 14: por sessão, não por workspace.** Cada sessão ACP dentro do daemon constrói seu próprio `Config` + `McpClientManager` (via `acpAgent.newSessionConfig`). Os limites de orçamento controlam clientes MCP ativos **por sessão**; cada sessão lê independentemente `QWEN_SERVE_MCP_CLIENT_BUDGET` do env encaminhado. Com `--mcp-client-budget=10` e 5 sessões ACP concorrentes, a contagem real de clientes MCP ativos pode chegar a 5 × 10 = 50 em todo o daemon. O snapshot `GET /workspace/mcp` lê apenas a contabilidade do `McpClientManager` da **sessão de inicialização** — o valor `budgets[0].scope: 'session'` é o sinal honesto de que isso é por sessão, não agregado. **Wave 5 PR 23 (pool MCP compartilhado)** introduzirá um gerenciador com escopo de workspace e adicionará uma célula `scope: 'workspace'` junto com a célula por sessão para agregação verdadeira entre sessões. v1 é o contador em processo + a fundação de aplicação suave sobre a qual o PR 23 se constrói.

`workspace_file_read` cobre as rotas de arquivo de workspace de texto/lista/stat/glob
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
cobre `GET /file/bytes`, que foi adicionada posteriormente para que clientes possam
fazer pre-flight de suporte a janela de bytes brutos contra daemons da era PR19. `workspace_file_write` cobre
as rotas de mutação de texto com reconhecimento de hash (`POST /file/write`, `POST /file/edit`).
A tag de escrita significa que o contrato da rota existe; não significa que a
implantação atual está aberta para mutação anônima. Write/edit são rotas de mutação
estritas e exigem um token bearer configurado mesmo em loopback.

`daemon_status` anuncia `GET /daemon/status`, o snapshot de diagnóstico somente leitura
consolidado do operador documentado abaixo.

**Tags condicionais.** Um pequeno número de tags de recurso é anunciado apenas quando a alternância de implantação correspondente está ativa. Presença da tag = comportamento ativado; ausência = ou um daemon mais antigo anterior à tag, OU um daemon atual onde o operador não optou. Atualmente:

| Tag                        | Anunciada quando …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | o daemon foi iniciado com `--require-auth` (ou `requireAuth: true` via API embutida). Token bearer é obrigatório em toda rota, incluindo `/health` em binds de loopback.                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | o pool de transporte MCP compartilhado está ativo. Omitida quando `QWEN_SERVE_NO_MCP_POOL=1` desabilita o pool.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | o pool de transporte MCP compartilhado está ativo; respostas de reinicialização podem incluir formas de múltiplas entradas com reconhecimento de pool.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). O daemon foi iniciado com pelo menos um `--allow-origin <pattern>` (ou `allowOrigins: [...]` via API embutida). Requisições de origem cruzada de origens correspondidas recebem cabeçalhos de resposta CORS adequados; origens não correspondidas ainda recebem o 403 padrão. A lista de padrões configurada intencionalmente **não** é ecoada em `/capabilities` para evitar vazar o conjunto de origens confiáveis para leitores não autenticados — o webui do navegador já conhece sua própria origem. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` está definido como um inteiro positivo.                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` está definido como um inteiro positivo.                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | o daemon foi criado com persistência de configurações disponível.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | a execução de shell de sessão está explicitamente habilitada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` está ativado.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | o suporte a recarregamento de workspace está disponível na configuração de rota embutida.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` **não** está nesta tabela condicional — é uma tag sempre ativa, anunciada sempre que o binário suporta os novos campos de orçamento `/workspace/mcp`, independentemente de o operador ter configurado um orçamento. Operadores que não definiram `--mcp-client-budget` ainda recebem os novos campos (com `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) anuncia os eventos push SSE tipados que expõem cruzamentos de estado do orçamento MCP sem um loop de polling. Dois tipos de frame chegam em `GET /session/:id/events`:

- `mcp_budget_warning` — dispara uma vez na subida acima de 75% de `reservedSlots.size / clientBudget`. Rearma somente após a proporção cair abaixo de 37,5% (`MCP_BUDGET_REARM_FRACTION`). Espelha a histerese do `slow_client_warning` do PR 10, mas no nível do gerenciador, não no nível do backlog por assinante. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Dispara em ambos os modos `warn` e `enforce`; nunca em `off`.
- `mcp_child_refused_batch` — dispara ao final de cada passagem `discoverAllMcpTools*` quando um ou mais servidores foram recusados, E como um lote de comprimento 1 no caminho de recusa de spawn preguiçoso do `readResource`. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` é literalmente `'enforce'` porque o modo `warn` nunca recusa.

Ambos os eventos vivem no anel de replay SSE por sessão (eles carregam um `id`), então um cliente reconectando com `Last-Event-ID` passa por eles; o snapshot em `GET /workspace/mcp` ainda é a fonte da verdade para o estado após uma desconexão prolongada. Sempre ativos uma vez anunciados — não há toggle condicional. O estado do reducer do SDK (`DaemonSessionViewState`) expõe `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` para adapters que desejam uma UI simples de lag.

## Rotas

### `GET /health`

Sonda de atividade. O formato padrão retorna `200 {"status":"ok"}` se o listener estiver ativo — barato, sem acesso à bridge, adequado para sondas de atividade k8s/Compose de alta frequência.

Passe `?deep=1` (também aceita `?deep=true` ou apenas `?deep`) para uma sonda que expõe **contadores** da bridge (apenas informativos, não uma verificação real de atividade):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ A sonda profunda é **informacional**, não uma verificação real de atividade. Ela lê accessors de contadores (`bridge.sessionCount`, `bridge.pendingPermissionCount`), que são simples getters de Map-size; eles não pingam processos filhos / canais individuais e, portanto, não detectarão uma sessão travada mas ainda contabilizada. Use-a para painéis de capacidade (concorrência atual vs. `--max-sessions`, profundidade de fila), em vez de como gatilho para "retire este daemon da rotação". Uma resposta `503 {"status":"degraded"}` é teoricamente possível se os getters de uma implementação de bridge personalizada lançarem exceção, mas os getters da bridge real nunca lançam — sob operação normal, a sonda profunda sempre retorna 200. Para atividade real, confie em se o listener aceita uma conexão TCP (ou seja, o `/health` padrão sem `?deep`).

**Auth:** exigida **apenas em binds não-loopback**. Em loopback (`127.0.0.1`, `::1`, `[::1]`) `/health` é registrado antes do middleware bearer, para que sondas k8s/Compose dentro do pod não precisem carregar o token. Em não-loopback (`--hostname 0.0.0.0` etc.) a rota é registrada após o middleware bearer e retorna 401 sem um token válido — caso contrário, um chamador não autenticado poderia sondar endereços arbitrários para confirmar a existência de um `qwen serve`, um vazamento de informação de baixa severidade que se combina mal com varredura de portas. CORS deny + Host allowlist ainda se aplicam na isenção de loopback.

### `GET /daemon/status`

Diagnósticos somente leitura para operadores. Diferente de `/health`, esta é uma API de daemon normal:
ela é registrada após auth bearer e rate limiting, inclusive em binds loopback.
Parâmetro de consulta:

- `detail=summary` (padrão) lê apenas o estado do daemon em memória.
- `detail=full` também inclui diagnósticos de sessão ativa, diagnósticos de conexão ACP,
  contagens de fluxo de dispositivo de auth e seções de status do workspace.
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

`status` é `error` se algum issue tiver severidade de erro, `warning` se algum issue tiver severidade de aviso, caso contrário `ok`. Os códigos de issue são estáveis e incluem
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits`, e
`workspace_status_unavailable`. Durante a janela curta após o listener estar pronto mas antes de o runtime completo ser montado, `/daemon/status` pode reportar
`daemon_runtime_starting`; se a montagem assíncrona do runtime falhar, reporta
`daemon_runtime_failed` enquanto as rotas de runtime não relacionadas a status retornam `503`.

Segurança: a resposta nunca inclui tokens bearer, ids de cliente, ids completos de conexão ACP,
códigos de usuário de fluxo de dispositivo ou URLs de verificação. `summary` omite
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

Contrato estável: quando `v` é incrementado, o layout do frame mudou de forma incompatível com versões anteriores.

> **`protocolVersions`** descreve as versões do protocolo serve que o daemon pode falar. `current` é a versão do protocolo preferida do daemon e `supported` é o conjunto compatível. Clientes que exigem um protocolo específico devem verificar `supported`; a UI baseada em funcionalidades ainda deve depender de `features`. Aditivo ao v=1: daemons v=1 mais antigos omitem este campo, portanto clientes SDK que visam builds mais antigas devem tratá-lo como opcional.

> **`modelServices` é sempre `[]` no Estágio 1.** O agente usa seu único serviço de modelo padrão e não o enumera pela rede. O Estágio 2 irá preenchê-lo a partir de adaptadores de modelo registrados para que clientes SDK possam construir seletores de serviço; até lá, NÃO confie neste campo estando não vazio.

> **`workspaceCwd`** é o caminho absoluto canônico ao qual este daemon se vincula (#3803 §02 — 1 daemon = 1 workspace). Use-o para (a) detectar incompatibilidade antes de postar `/session` e (b) omitir `cwd` em `POST /session` (a rota usa este caminho como fallback). Implantações multi-workspace expõem múltiplos daemons em portas diferentes, cada um com seu próprio `workspaceCwd`. Aditivo ao v=1: daemons v=1 pré-§02 omitem o campo — clientes que visam builds mais antigas devem verificar null antes de consumi-lo.

### Rotas de status de runtime somente leitura

Estas rotas reportam snapshots de runtime do lado do daemon. São rotas v1 aditivas,
não mutam estado e não alteram a versão do protocolo serve. Rotas de status do workspace intencionalmente **não** iniciam o processo filho ACP apenas porque um cliente
polling em uma rota GET: se o daemon está ocioso, elas retornam
`initialized: false` com um snapshot vazio. Rotas de status de sessão exigem uma
sessão ativa e usam o formato padrão `404 SessionNotFoundError` para ids desconhecidos.

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
`/workspace/env`, e (futuramente) guardrails MCP para que clientes SDK possam
renderizar remediação por categoria em vez de analisar mensagens de forma livre. O PR 13
(#4175) introduziu os sete literais listados acima; o PR 14 irá preencher
`blocked_egress` assim que a sonda de egress for implementada.

Payloads de status nunca expõem valores de env MCP, cabeçalhos, detalhes de OAuth/ service-account,
chaves de API de provedores, `baseUrl` / `envKey` de provedores, corpo de skill, caminhos de
arquivos de skill, definições de hooks ou valores de variáveis de ambiente secretas.
`/workspace/env` relata apenas a **presença** de env vars na lista de permissões;
URLs de proxy são limpas de credenciais e reduzidas a
`host:port` antes de irem para o fio.

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
      "description": "Servidor de documentação",
      "extensionName": "docs-ext"
    }
  ]
}
```

`discoveryState` é um de `not_started`, `in_progress`, ou `completed`.
`transport` é um de `stdio`, `sse`, `http`, `websocket`, `sdk`, ou
`unknown`. `errors` é omitido quando a descoberta é bem-sucedida.

**Guardrails do cliente MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Daemons pós-PR-14 estendem o payload com quatro campos aditivos e uma célula de nível de workspace:

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
      "hint": "Aumente --mcp-client-budget ou remova servidores da config mcpServers.",
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

`budgetMode` é um de `enforce`, `warn`, ou `off`. `clientBudget` está ausente quando nenhum orçamento foi definido. `budgets[]` é **sempre um array** em daemons pós-PR-14 (possivelmente vazio quando `budgetMode === 'off'`); daemons pré-PR-14 omitem o campo completamente. v1 emite uma célula com `scope: 'session'` (aplicação por sessão — veja a seção de capacidades acima para entender o porquê). Consumidores DEVEM tolerar entradas adicionais de `budgets[]` com valores de `scope` não reconhecidos — o Wave 5 PR 23 adicionará `scope: 'workspace'` (ou `'pool'`) junto com a célula por sessão sem um bump de schema.

`disabledReason` em células por servidor distingue desabilitado pelo operador (`'config'` — lista de configuração `disabledMcpServers`) de recusado por orçamento (`'budget'` — descoberto mas nunca conectado devido ao modo `enforce`). As recusas são determinísticas pela ordem de declaração de `Object.entries(mcpServers)`. O `status: 'error', errorKind: 'budget_exhausted'` por servidor ofusca o `mcpStatus: 'disconnected'` bruto (que é verdadeiro mas não a severidade voltada ao operador).

A aplicação do orçamento no PR 14 v1 é **por sessão, não por workspace**. Embora daemons Modo B sejam `1 daemon = 1 workspace × N sessões` pós-#4113 no nível de processo, o `McpClientManager` é construído dentro de cada `Config` de sessão ACP via `acpAgent.newSessionConfig`, então N sessões cada uma aplica sua própria cópia do limite. O snapshot representa a visão da sessão de bootstrap. O Wave 5 PR 23 introduz um pool MCP compartilhado com escopo de workspace que gradua isso para verdadeira aplicação por workspace.

**Detectando pressão de orçamento.** Duas superfícies, ambas populadas pós-PR-14b:

- **Eventos push** (anunciados via `mcp_guardrail_events`): assine `GET /session/:id/events` e filtre frames `mcp_budget_warning` / `mcp_child_refused_batch` através de `KnownDaemonEvent`. A máquina de estados dispara uma vez por cruzamento ascendente de 75% (rearmado abaixo de 37,5%); recusas são coalescidas uma vez por passagem de descoberta no modo `enforce`.
- **Poll de snapshot** (anunciado via `mcp_guardrails`): `GET /workspace/mcp` e inspecione a célula de orçamento por sessão (`budgets[0]`):

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (corresponde ao limiar de histerese que o evento push do PR 14b usará).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (um ou mais servidores recusados nesta passagem de descoberta).
- `budgets[0].status === 'ok'` ⇔ abaixo do limiar de 75% E sem recusas.

Cadência de polling recomendada: alinhada com o que já faz polling em `/workspace/mcp`; o snapshot é barato e a célula de orçamento não tem custo extra de descoberta. Clientes SDK que assinam eventos push ainda se beneficiam do snapshot para estado após desconexão prolongada (a profundidade do anel de replay SSE é finita — `--event-ring-size`, padrão 8000 — então um cliente offline por mais tempo do que a cobertura do anel recai na ressincronização por snapshot).

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
      "description": "Revisar código",
      "level": "project",
      "modelInvocable": true,
      "argumentHint": "[path]"
    }
  ]
}
```

`level` é um de `project`, `user`, `extension`, ou `bundled`. `errors` é
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

Modelos são agrupados por tipo de auth. Diagnósticos de conexão do provedor ficam em
`/workspace/preflight` na célula `providers`; o preflight de ambiente fica em
`/workspace/preflight` e `/workspace/env` (abaixo). `errors` é omitido
quando a construção do snapshot é bem-sucedida.

### `GET /workspace/env`

Relata o runtime do processo do daemon, plataforma, sandbox, proxy, e a
**presença** de variáveis de ambiente secretas na lista de permissões. Sempre responde
a partir do estado `process.*` — o daemon nunca cria um filho ACP para servir
esta rota, e a resposta é idêntica independentemente de o ACP estar ativo ou ocioso. O campo
`acpChannelLive` é apenas informativo.

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
  | 'sandbox' // name: 'SANDBOX' | 'SEATBELT_PROFILE'; value opcional
  | 'proxy' // name: HTTP_PROXY | HTTPS_PROXY | NO_PROXY | ALL_PROXY; value: host redigido
  | 'env_var'; // apenas presença; o campo value é SEMPRE omitido

interface DaemonEnvCell extends DaemonStatusCell {
  kind: DaemonEnvKind;
  name: string;
  present?: boolean;
  value?: string;
}
```

**Política de redação.** Células `kind: 'env_var'` nunca incluem um campo `value`;
clientes veem apenas `present: boolean`. Células `kind: 'proxy'` passam o valor bruto da env
por redação de credenciais (`redactProxyCredentials`) e depois por
análise de `URL` para que o fio carregue apenas `host:port`. `NO_PROXY`
é passado pela redação textualmente porque é uma lista de hosts em vez de
uma URL. A lista de permissões de env vars secretas enumeradas atualmente inclui
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
`DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` e `QWEN_SERVER_TOKEN`. Outras
env vars não são enumeradas, então secrets acidentalmente definidas permanecem invisíveis.

### `GET /workspace/preflight`

Relata verificações de prontidão do daemon. **Células de nível de daemon** (`node_version`,
`cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) são sempre
populadas a partir de `process.*` e `node:fs`. **Células de nível ACP** (`auth`,
`mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`)
exigem um filho ACP ativo — quando o daemon está ocioso, elas emitem
placeholders com `status: 'not_started'`. A rota nunca cria ACP apenas para popular células;
as células correspondentes recaem em `not_started`.

Resposta ociosa (nenhum filho ACP):

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
      "hint": "crie uma sessão para popular"
    },
    {
      "kind": "mcp_discovery",
      "status": "not_started",
      "locality": "acp",
      "hint": "crie uma sessão para popular"
    },
    {
      "kind": "skills",
      "status": "not_started",
      "locality": "acp",
      "hint": "crie uma sessão para popular"
    },
    {
      "kind": "providers",
      "status": "not_started",
      "locality": "acp",
      "hint": "crie uma sessão para popular"
    },
    {
      "kind": "tool_registry",
      "status": "not_started",
      "locality": "acp",
      "hint": "crie uma sessão para popular"
    },
    {
      "kind": "egress",
      "status": "not_started",
      "locality": "acp",
      "hint": "sonda de egress chega no PR 14 (#4175)"
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

Semântica do `errorKind`:

- `missing_binary` — Versão do Node abaixo da necessária, falta `QWEN_CLI_ENTRY`,
  ripgrep / git / npm não estão no PATH (avisos em vez de erros para os
  binários opcionais).
- `missing_file` — `boundWorkspace` não existe ou não é um diretório;
  erro de análise de skill apontando para um arquivo ausente ou ilegível.
- `parse_error` — Falha na análise de `SKILL.md`, JSON de configuração malformado.
- `auth_env_error` — `validateAuthMethod` retornou uma string de falha não nula,
  ou uma subclasse de `ModelConfigError` propagada da resolução de provedor.
- `init_timeout` — Rejeição de `withTimeout` na bridge (um timeout real
  enquanto espera por uma viagem de ida e volta ACP). Reconhecido através da
  classe tipada `BridgeTimeoutError`. Nota: uma célula `warning` transitória de `mcp_discovery`
  com `connecting > 0` NÃO carrega este tipo — isso é
  um estado normal de handshake em andamento, distinto de um timeout real.
- `protocol_error` — `extMethod` do ACP rejeitado porque o canal foi fechado
  no meio da solicitação, ou porque o registro de ferramentas estava inesperadamente ausente.
- `blocked_egress` — reservado para o PR 14 (#4175). O PR 13 deixa a
  célula `egress` como `status: 'not_started'`.

Se a bridge não conseguir alcançar o filho ACP ao atender uma solicitação
de preflight (por exemplo, um fechamento de canal no meio da solicitação), o array `errors` do envelope
carrega uma única `ServeStatusCell` descrevendo a falha e as células
caem de volta para placeholders ACP `not_started`. As células do daemon ainda são
retornadas.

### Rotas de arquivo do workspace

Todos os caminhos de arquivo são resolvidos através do workspace vinculado ao daemon. As respostas usam
caminhos relativos ao workspace e nunca retornam caminhos absolutos do sistema de arquivos para casos de sucesso normais. Respostas bem-sucedidas de arquivos incluem:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Erros do sistema de arquivos usam esta forma JSON:

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

Lê um arquivo de texto. Parâmetros de consulta: `path` (obrigatório), `maxBytes`, `line` e
`limit`. O daemon rejeita arquivos binários e arquivos acima do limite de leitura de texto.
A resposta inclui `hash`, um digest SHA-256 sobre os bytes brutos no disco para
o arquivo inteiro, mesmo quando `line`, `limit` ou `maxBytes` retornaram um fragmento.

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

Lê bytes brutos de um arquivo sem decodificação. Parâmetros de consulta: `path` (obrigatório),
`offset` (padrão `0`) e `maxBytes` (padrão `65536`, máximo `262144`). Esta
rota suporta janelas limitadas em grandes arquivos binários sem ler o arquivo
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
Com `--require-auth`, o middleware global de bearer rejeita requisições não autenticadas
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
malformados geram `400 parse_error`, e hashes desatualizados geram
`409 hash_mismatch`. `expectedHash` é `sha256:` mais 64 caracteres hexadecimais minúsculos,
calculado sobre os bytes brutos no disco.

`bom`, `encoding` e `lineEnding` podem ser fornecidos. A substituição preserva o
perfil de codificação do arquivo existente por padrão; campos explícitos o sobrescrevem.
Escritas binárias estão fora do escopo.

O daemon escreve em um arquivo temporário aleatório no diretório de destino, executa fsync onde
suportado, verifica novamente o hash atual imediatamente antes de `rename()`, então
renomeia para o local. Isso evita a observação parcial do arquivo e serializa
escritas originadas pelo daemon para o mesmo arquivo, mas não é uma operação atômica
de compare-and-swap entre processos: um editor externo ainda pode causar race condition na pequena janela
entre a verificação final do hash e o rename.

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

Aplica uma substituição exata de texto em um arquivo de texto existente. Esta também é uma
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
A rota preserva codificação, BOM e finais de linha, e verifica novamente
`expectedHash` imediatamente antes do rename atômico.

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

`state` espelha as mesmas formas de modelo/modo/opção de configuração do ACP usadas por
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
`available_commands_update`. `availableSkills` lista apenas nomes de skills;
os clientes não devem esperar corpos ou caminhos de skill nesta rota.

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

Esta rota é um snapshot somente leitura fora de banda. Não é intencionalmente um
prompt e pode ser consultada enquanto a sessão está em streaming. A resposta contém
apenas metadados autorizados dos registros de tarefas agente, shell e monitor;
controladores, timers, offsets, mensagens pendentes e objetos de registro brutos nunca são expostos.

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

`status` é um de `NOT_STARTED`, `IN_PROGRESS`, `READY` ou `FAILED`.
Opcional `error` está presente em servidores com falha quando disponível. LSP desabilitado
(incluindo modo bare) retorna HTTP 200 com `enabled: false`, contagens zero e
`servers: []`. LSP habilitado sem servidores configurados retorna `enabled: true`,
`configuredServers: 0` e `servers: []`. Se a inicialização falhar antes do
cliente existir, a resposta pode incluir `initializationError`; se um cliente ativo
não puder fornecer um snapshot, a resposta inclui `statusUnavailable: true`.

Esta rota expõe apenas campos estáveis voltados para o cliente. Ela intencionalmente omite
detalhes internos de debug, como IDs de processo, argumentos de spawn, stderr, URIs raiz e
caminhos de pastas do workspace.

### `POST /session`

Iniciar um novo agente ou anexar a um existente (sob `sessionScope: 'single'`, o padrão).

Requisição:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Campo            | Obrigatório | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`            | não         | Caminho absoluto correspondente ao workspace vinculado do daemon. Se omitido, a rota usa `boundWorkspace` (leia em `/capabilities.workspaceCwd`). Um `cwd` não vazio e incompatível retorna `400 workspace_mismatch` (#3803 §02 — 1 daemon = 1 workspace). Caminhos de workspace são canonicalizados via `realpathSync.native` (com fallback apenas para resolver para caminhos inexistentes) para que sistemas de arquivos case-insensitive não rejeitem sessões por ortografia.                                                                                                                                 |
| `modelServiceId` | não         | Seleciona qual _serviço de modelo_ configurado o agente usará como rota (o provedor backend — Alibaba ModelStudio, OpenRouter, etc). Se omitido, o agente usa seu padrão. Se o workspace já possui uma sessão, isso chama `setSessionModel` na existente e transmite `model_switched`. Distinto de `modelId` em `POST /session/:id/model`, que seleciona o modelo **dentro** de um serviço já vinculado. O array `modelServices` em `/capabilities` é reservado para anunciar serviços configurados; no Estágio 1 é sempre `[]` (o serviço padrão do agente é usado e não é enumerado via HTTP).                         |
| `sessionScope`   | não         | Substituição por requisição para compartilhamento de sessão. `'single'` (o padrão do daemon) faz uma segunda `POST /session` para o mesmo workspace reutilizar a sessão existente (`attached: true`); `'thread'` força uma nova sessão distinta a cada chamada. Omita para herdar o padrão do daemon. Valores fora do enum retornam `400 { code: 'invalid_session_scope' }`. Daemons antigos (pré-#4175 PR 5) ignoram o campo silenciosamente — faça preflight em `caps.features.session_scope_override` antes de enviar. O padrão do daemon atualmente é hardcoded como `'single'` em produção; #4175 pode adicionar uma flag CLI `--sessionScope` em um follow-up. |

Resposta:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` significa que uma sessão para esse workspace já existia e você agora a está compartilhando.

Chamadas `POST /session` concorrentes para o mesmo workspace são **coalescidas** em um único spawn — ambos os chamadores recebem o mesmo `sessionId`, exatamente um relata `attached: false`. Se o spawn subjacente falhar (timeout de init, saída malformada do agente, OOM), **todos os chamadores coalescidos recebem o mesmo erro** — o slot em andamento é limpo para que uma chamada subsequente possa tentar novamente do zero.

> ⚠️ **A rejeição de `modelServiceId` em uma sessão nova é silenciosa na
> resposta HTTP.** Um `modelServiceId` inválido (erro de digitação, serviço não configurado)
> NÃO causa erro 500 na criação — a sessão permanece operacional com o
> modelo padrão do agente para que o chamador ainda receba um `sessionId` que possa
> usar para tentar a troca de modelo novamente (via `POST /session/:id/model`).
> O sinal visível de falha é um evento `model_switch_failed` no stream SSE da
> sessão, disparado entre o handshake de spawn e sua
> primeira inscrição. **Inscritos que precisam observar este evento
> devem passar `Last-Event-ID: 0` em sua primeira chamada `GET
/session/:id/events`** para reproduzir a partir do evento mais antigo disponível
> no ring (cobre o `model_switch_failed` do tempo de spawn mesmo se a
> inscrição chegar alguns ms após a resposta de criação).

### `POST /session/:id/load`

Restaurar uma sessão ACP persistida pelo id e reproduzir seu histórico via SSE. O id no caminho é autoritativo; qualquer campo `sessionId` no corpo é ignorado. Faça preflight em `caps.features.session_load` — daemons antigos retornam `404` para esta rota.

Requisição:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Campo | Obrigatório | Notas                                                                                                                                                                                                                          |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | não         | Mesmas regras de canonicalização + `workspace_mismatch` de `POST /session`. Omita para herdar `/capabilities.workspaceCwd`. `mcpServers` intencionalmente NÃO é aceito aqui — MCP do daemon é orientado por configurações (igual a `POST /session`). |

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

`state` espelha o `LoadSessionResponse` do ACP — `models` é um `SessionModelState`, `modes` um `SessionModeState`, `configOptions` um array de `SessionConfigOption`. Campos ausentes são decididos pelo agente. Anexadores tardios (os caminhos `attached: true` abaixo) recebem o MESMO snapshot de `state` que o chamador original do load viu — o daemon armazena em cache na entrada; mutações em tempo de execução (ex.: `model_switched`) são entregues no stream SSE, não em respostas de anexo subsequentes.

`attached: true` significa que a sessão já estava ativa (seja de um `session/load`/`session/resume` anterior, ou porque um chamador concorrente coalescido chegou na frente).

**Reprodução de histórico via SSE.** Enquanto `loadSession` está em andamento no lado do agente, o agente emite notificações `session_update` para cada turno persistido. O daemon as armazena em buffer no barramento de eventos da sessão antes da resposta da rota retornar, para que inscritos que imediatamente chamarem `GET /session/:id/events` com `Last-Event-ID: 0` vejam a reprodução completa. **O ring de reprodução é limitado** (padrão 8000 frames por sessão). Históricos longos com muitas chamadas de ferramenta / turnos de stream de pensamento podem exceder isso — os frames mais antigos são descartados silenciosamente. Clientes que precisam do histórico completo devem se inscrever imediatamente após o `load` retornar; alternativamente, podem persistir os IDs de eventos SSE e usar `Last-Event-ID` para retomar a partir de um limite de turno posterior.

**Erros:**

- `404` — id de sessão persistida não existe (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (mesma forma de `POST /session`).
- `503` — `session_limit_exceeded` (conta contra `--max-sessions`; restaurações em andamento também são contabilizadas).
- `409` — `restore_in_progress` (um `session/resume` para o mesmo id já está em andamento). `Retry-After: 5`. Corridas de mesma ação (duas chamadas `session/load` concorrentes para o mesmo id) coalescem — exatamente uma retorna `attached: false`, as demais retornam `attached: true` com o mesmo `state`.

### `POST /session/:id/resume`

Restaurar uma sessão ACP persistida pelo id SEM reproduzir o histórico via SSE. O contexto do modelo é restaurado internamente no lado do agente (via `geminiClient.initialize` lendo `config.getResumedSessionData`); o stream SSE permanece limpo para clientes que já têm o histórico renderizado. Faça preflight em `caps.features.session_resume`; `unstable_session_resume` permanece um alias de compatibilidade obsoleto para clientes antigos.

Mesma forma de requisição que `/load`. Mesma forma de resposta — `state` espelha o `ResumeSessionResponse` do ACP. Mesmo envelope de erro, incluindo `409 restore_in_progress` (que dispara quando um `session/load` está em andamento; `session/resume` correndo atrás de outro `session/resume` coalesce).

Use `/load` quando o cliente não tiver histórico renderizado (reconexão fria, seletor → abrir). Use `/resume` quando o cliente já tiver os turnos na tela e precisar apenas do handle do lado do daemon de volta.

> ⚠️ **Por que `unstable_session_resume` ainda é anunciado?** A rota HTTP do daemon e a capacidade `session_resume` são estáveis para v1, mas a bridge ainda chama `connection.unstable_resumeSession` do ACP. A tag antiga permanece apenas para que SDKs que foram lançados antes de `session_resume` continuem funcionando.

### `GET /workspace/:id/sessions`

Listar todas as sessões ativas cujo workspace canônico corresponde a `:id` (cwd absoluto codificado para URL).

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

Array vazio (não 404) quando não existem sessões — uma UI de seletor de sessão não deve gerar erro apenas porque o workspace está ocioso.

### `POST /session/:id/prompt`

Encaminhar um prompt para o agente. Chamadores de múltiplos prompts são enfileirados em FIFO por sessão (ACP garante um prompt ativo por sessão).

Requisição:

```json
{
  "prompt": [{ "type": "text", "text": "O que src/main.ts faz?" }]
}
```

Validação: `prompt` deve ser um array não vazio de objetos. Outras falhas retornam `400` antes de alcançar a bridge.

Resposta:

```json
{ "stopReason": "end_turn" }
```

Outras razões de parada: `cancelled`, `max_tokens`, `error`, `length` (de acordo com a especificação ACP).

Se o cliente HTTP desconectar no meio do prompt, o daemon envia uma notificação ACP `cancel` para o agente, que encerra o prompt com `stopReason: "cancelled"`.
> **Limitação do Estágio 1 — sem timeout de prompt no lado do servidor.** A ponte
> apenas confronta o `prompt()` do agente com `transportClosedReject`
> (falha do processo filho do agente) e o `AbortSignal` de desconexão HTTP do
> chamador. Um agente travado, mas ainda vivo (ex.: uma chamada de modelo que
> trava), bloqueia o FIFO por sessão até que o cliente HTTP atinja seu timeout
> e se desconecte. Prompts de longa duração são legítimos (pesquisa profunda,
> análise de base de código grande), portanto, um prazo padrão é
> deliberadamente não definido; o Estágio 2 exporá um opt-in configurável
> `promptTimeoutMs`. Até lá, os chamadores devem definir seu próprio timeout
> no lado do cliente e desconectar (ou chamar
> `POST /session/:id/cancel`) ao expirar.

### `POST /session/:id/cancel`

Cancela o prompt **atualmente ativo** na sessão. Do lado do ACP, isso é uma notificação, não uma requisição — o agente confirma resolvendo o `prompt()` ativo com `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrato de múltiplos prompts:** cancelar afeta apenas o prompt ativo. Quaisquer prompts que o mesmo cliente tenha enviado anteriormente via POST e que ainda estejam na fila atrás do ativo continuarão a executar. O enfileiramento de múltiplos prompts é um comportamento introduzido pelo daemon (não está na especificação ACP); o contrato para prompts enfileirados é "eles continuam executando a menos que você cancele cada um, ou encerre a sessão via saída do canal".

### `DELETE /session/:id`

Fecha explicitamente uma sessão ativa. Força o fechamento mesmo quando outros clientes estão conectados — cancela qualquer prompt ativo, resolve permissões pendentes como canceladas, publica o evento `session_closed`, fecha o EventBus e remove a sessão dos mapas do daemon. Sessões persistidas em disco NÃO são deletadas — podem ser recarregadas via `POST /session/:id/load`. Pré-verificação de `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotente: retorna `404` para sessões desconhecidas (mesma forma `SessionNotFoundError` que outras rotas).

> **Evento `session_closed`.** Assinantes SSE recebem um evento terminal `session_closed` com `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` antes do stream terminar. Redutores (reducers) do SDK tratam isso de forma idêntica a `session_died` (define `alive: false`, limpa `pendingPermissions`).

### `PATCH /session/:id/metadata`

Atualiza metadados mutáveis da sessão. Atualmente suporta apenas `displayName`. Pré-verificação de `caps.features.session_metadata`.

Requisição:

```json
{ "displayName": "My Investigation Session" }
```

| Campo         | Obrigatório | Notas                                                                          |
| ------------- | ----------- | ------------------------------------------------------------------------------ |
| `displayName` | não         | String, máximo 256 caracteres. String vazia limpa o nome. Omita para deixar como está. |

Resposta:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Publica um evento `session_metadata_updated` no stream SSE da sessão com `{ sessionId, displayName }`.

### `POST /session/:id/heartbeat`

Atualiza o registro de última atividade (last-seen) do daemon para esta sessão. Adaptadores de longa duração (TUI/IDE/web) fazem ping neste endpoint em intervalos para que uma política futura de revogação (Wave 5 PR 24) possa distinguir clientes mortos de clientes silenciosos.

Cabeçalhos:

| Cabeçalho         | Obrigatório | Notas                                                                                                                                                                                                                                   |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | não         | Ecoa o ID emitido pelo daemon em `POST /session`. Clientes identificados também atualizam seu timestamp por cliente; heartbeats anônimos atualizam apenas o watermark da sessão. Deve satisfazer a mesma forma `[A-Za-z0-9._:-]{1,128}` usada em outros lugares. |

Corpo da requisição vazio (`{}` é aceitável — nenhum campo é lido atualmente).

Resposta:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` é ecoado apenas quando um `X-Qwen-Client-Id` confiável foi fornecido. `lastSeenAt` é a epoch (ms) do `Date.now()` no lado do daemon que a ponte armazenou.

Erros:

- `400` — `{ code: 'invalid_client_id' }` quando o cabeçalho está malformado (regra de formato do cabeçalho) ou quando carrega um `clientId` que não está registrado para esta sessão (a ponte lança `InvalidClientIdError` antes de atualizar qualquer timestamp).
- `404` — sessão desconhecida.

Proteção por capacidade: pré-verificação `caps.features.client_heartbeat`. Daemons antigos retornam `404` para esta rota.

### `POST /session/:id/model`

Alterna o modelo ativo **dentro** do serviço de modelo atualmente vinculado à sessão. Serializado através da fila de troca de modelo por sessão.

(Para alternar o _serviço_ em si — Alibaba ModelStudio vs OpenRouter etc — passe `modelServiceId` em `POST /session` para uma nova sessão. O Estágio 1 não possui rota de troca de serviço em tempo real.)

Requisição:

```json
{ "modelId": "qwen-staging" }
```

Resposta:

```json
{ "modelId": "qwen-staging" }
```

Em caso de sucesso, publica `model_switched` no stream SSE. Em caso de falha, publica `model_switch_failed` (para que assinantes passivos vejam a falha, não apenas o chamador). Corre em paralelo com a saída do canal do agente para que um processo filho travado não bloqueie o manipulador HTTP.

### `POST /session/:id/recap`

Tag de capacidade: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Gera um resumo de uma frase "onde eu parei" da sessão. Encapsula o `generateSessionRecap` do core (`packages/core/src/services/sessionRecap.ts`), que executa uma consulta lateral contra o modelo rápido com ferramentas desabilitadas, `maxOutputTokens: 300` e um formato de saída estrito `<recap>...</recap>`. A consulta lateral lê o histórico de chat existente do GeminiClient da sessão e **não** o modifica.

O corpo da requisição é ignorado (envie `{}` ou vazio). Portão de mutação não estrito — postura espelha `/session/:id/prompt` (a chamada custa tokens mas não altera estado). Nenhum evento SSE é publicado.

Resposta (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` é `null` (um 200 normal, não um erro) quando:

- a sessão tem menos de duas rodadas de diálogo ainda,
- a consulta lateral não retornou nenhum payload `<recap>...</recap>` extraível,
- ou ocorreu algum erro de modelo subjacente (o helper do core é de melhor esforço e nunca lança exceção).

Erros:

- `400 {code: 'invalid_client_id'}` — cabeçalho `X-Qwen-Client-Id` malformado.
- `404` — sessão desconhecida.

Cancelamento: **nenhum na v1**. A rota não escuta desconexão do cliente HTTP, nenhum `AbortSignal` é conectado à ponte, e o processo filho ACP executa a consulta lateral até o fim independentemente de o chamador ter se desconectado. Os únicos limites são o timeout de retaguarda de 60s da ponte (`SESSION_RECAP_TIMEOUT_MS`) e a corrida de transporte fechado contra a morte do canal ACP. Isso é aceitável porque recap é curto (tentativa única, `maxOutputTokens: 300`, ~1–5s típico); um método de extensão de cancelamento baseado em ID de requisição pode conectar o cancelamento completo de ponta a ponta em uma versão futura se o custo de banda um dia justificar.

### Mutação: aprovação, ferramentas, init, restart MCP

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 adiciona quatro rotas de controle de mutação que permitem que clientes remotos alterem a postura de execução (runtime) sem tocar na CLI do host do daemon. Todas as quatro:

- São protegidas pelo portão de mutação **estrito** do PR 15. Um daemon configurado sem token de portador as rejeita com `401 {code: 'token_required'}`. Configure `--token` (ou `QWEN_SERVER_TOKEN`) antes de optar pelo uso.
- Aceitam e carimbam o cabeçalho `X-Qwen-Client-Id` (cadeia de auditoria PR 7). Quando o cabeçalho carrega um ID confiável, o daemon emite `originatorClientId` no evento SSE correspondente para que UIs entre clientes possam suprimir ecos de suas próprias mutações.
- Pré-verificam cada capacidade por tag antes de expor a funcionalidade. Daemons antigos retornam `404` para a rota.

Três das quatro rotas (`tools/:name/enable`, `init`, `mcp/:server/restart`) emitem eventos **com escopo de workspace**: todos os barramentos SSE de sessão ativa recebem o evento, independentemente de qual sessão estava conectada quando a mutação foi acionada. `approval-mode` emite um evento **com escopo de sessão** porque a alteração é local ao `Config` de uma sessão.

#### `POST /session/:id/approval-mode`

Tag de capacidade: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Altera o modo de aprovação de uma sessão ativa. O novo modo é aplicado imediatamente dentro do `Config` por sessão do processo filho ACP. As configurações NÃO são gravadas em disco por padrão — passe `persist: true` para também gravar `tools.approvalMode` nas configurações do workspace.

Requisição:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` deve ser um dos `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (espelho do enum `ApprovalMode` do core; o SDK exporta `DAEMON_APPROVAL_MODES` para validação em tempo de execução). `persist` padrão é `false`.

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
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — o modo solicitado requer uma pasta confiável (modos privilegiados em workspaces não confiáveis são rejeitados por `Config.setApprovalMode` do core).
- `404` — sessão desconhecida.

Evento SSE (escopo de sessão): `approval_mode_changed` com `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Tag de capacidade: `workspace_tool_toggle`. Operação de E/S de arquivo pura — sem viagem de ida e volta ACP.

Alterna um nome de ferramenta na lista de configurações `tools.disabled` do workspace. Ferramentas listadas ali **não são registradas** (diferente de `permissions.deny`, que mantém a ferramenta registrada e rejeita a invocação). Tanto ferramentas internas quanto ferramentas descobertas via MCP passam por `ToolRegistry.registerTool`, que consulta o conjunto de desabilitadas.

> ⚠️ **Os nomes devem corresponder exatamente ao identificador exposto pelo registro.** Nenhuma resolução de alias ocorre — a rota armazena qualquer string que esteja no parâmetro de caminho em `tools.disabled`, e o próximo processo filho ACP compara com `tool.name` no momento do registro. Ferramentas internas usam seu nome canônico de registro (forma verbal em snake_case): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — NÃO os rótulos de exibição (`Shell`, `Read`, `Write`) que a CLI exibe. Ferramentas descobertas via MCP usam a forma qualificada `mcp__<servidor>__<nome>` (que também é a forma que os eventos `tool_toggled` transmitem e que `GET /workspace/mcp` lista). Desabilitar `Bash` NÃO impedirá que `run_shell_command` seja registrado na próxima sessão.

Processos filhos ACP ativos retêm ferramentas já registradas — a alternância tem efeito na **próxima** criação de processo filho ACP. Combine com `POST /workspace/mcp/:server/restart` (para ferramentas originadas de MCP) ou criação de nova sessão para tornar a alteração efetiva no daemon atual.

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

- `400 {code: 'invalid_tool_name'}` — parâmetro de caminho vazio, ou parâmetro excede o limite de 256 caracteres.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` ausente ou não booleano.

Evento SSE (escopo de workspace): `tool_toggled` com `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Tag de capacidade: `workspace_init`. Operação de E/S de arquivo pura — sem viagem de ida e volta ACP, **sem invocação de LLM**.

Cria um arquivo `QWEN.md` vazio (ou o que `getCurrentGeminiMdFilename()` retornar sob sobrescrição de `--memory-file-name`) na raiz do workspace vinculado ao daemon. Apenas mecânico — para preenchimento de conteúdo orientado por IA, prossiga com `POST /session/:id/prompt`.

Por padrão, recusa sobrescrever quando o arquivo de destino existe com conteúdo não vazio. Arquivos com apenas espaços em branco são tratados como ausentes (igual ao comando `/init` local).

Requisição:

```json
{ "force": false }
```

Resposta (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` é `'created'` para criações novas, `'noop'` quando um arquivo existente com apenas espaços em branco foi deixado intacto (nenhuma gravação realizada), e `'overwrote'` quando `force: true` substituiu conteúdo não vazio. O evento SSE `workspace_initialized` espelha a ação da resposta — observadores podem filtrar por `action !== 'noop'` para reagir apenas a alterações reais em disco.

Erros:

- `400 {code: 'invalid_force_flag'}` — `force` não é booleano.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — arquivo existe com conteúdo não vazio e `force` está omitido/false. O corpo carrega o caminho absoluto e o tamanho (bytes) para que clientes SDK possam renderizar um prompt "sobrescrever N bytes?" sem precisar de um novo stat.

Evento SSE (escopo de workspace): `workspace_initialized` com `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Tag de capacidade: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Reinicia um servidor MCP configurado através do `McpClientManager.discoverMcpToolsForServer` do processo filho ACP (desconectar + reconectar + redescobrir). Pré-verifica o snapshot de orçamento ativo da contabilidade do PR 14 v1, de modo que uma reinicialização em um workspace com orçamento saturado retorna uma recusa suave em vez de desencadear uma cascata de `BudgetExhaustedError`.

Corpo da requisição vazio (`{}`). O parâmetro de caminho é o nome do servidor codificado na URL conforme aparece na configuração `mcpServers`.

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

Razões de pulo suave (todas retornam 200):

| `reason`                | Significado                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Outra descoberta / reinicialização para este servidor já está em andamento. A rota retorna imediatamente em vez de aguardar a promise original. O chamador deve tentar novamente após um breve atraso. |
| `'disabled'`            | Servidor está configurado mas listado em `excludedMcpServers`. Reative antes de reiniciar.                                                                                                    |
| `'budget_would_exceed'` | Daemon está em `--mcp-budget-mode=enforce`, o servidor alvo não está atualmente em `reservedSlots`, e o total ativo atingiu `clientBudget`. O chamador deve liberar um slot primeiro.         |

Erros (não 2xx):

- `400 {code: 'invalid_server_name'}` — parâmetro de caminho vazio.
- `404` — nome do servidor não está na configuração `mcpServers`, ou não existe canal ACP ativo (reinicializar requer inerentemente uma instância ativa de `McpClientManager`).
- `500` — erro interno (ex.: `ToolRegistry` não inicializado).

Eventos SSE (escopo de workspace): `mcp_server_restarted` com `{serverName, durationMs, originatorClientId?}` em caso de sucesso; `mcp_server_restart_refused` com `{serverName, reason, originatorClientId?}` em pulo suave.

### `GET /session/:id/events` (SSE)

Assine o stream de eventos da sessão.

Cabeçalhos:

```
Accept: text/event-stream
Last-Event-ID: 42        ← opcional, reproduz a partir do id após 42
```

Parâmetros de consulta:

| Parâmetro   | Obrigatório | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued` | não         | Limite de **backlog ativo** por assinante. Intervalo `[16, 2048]`, padrão 256. Quadros de reprodução forçados no momento da assinatura estão isentos do limite; o que realmente consome o limite são eventos ao vivo que chegam enquanto o assinante ainda está drenando uma reprodução grande com `Last-Event-ID: 0`. Aumente para reconexões a frio para que a cauda ativa não dispare o aviso/expulsão de cliente lento antes que o consumidor alcance. Valores fora do intervalo / não decimais / presente mas vazio retornam `400 invalid_max_queued` antes que o handshake SSE abra. Pré-verificação `caps.features.slow_client_warning` — daemons antigos ignoram silenciosamente o parâmetro. |

Formato do quadro. A linha `data:` é o **envelope completo do evento**, serializado como JSON em uma única linha — `{id?, v, type, data, originatorClientId?}`. O payload específico do ACP (argumentos de `sessionUpdate`, `requestPermission`, etc.) fica sob o campo `data` do envelope; o próprio `type` do envelope corresponde à linha `event:` do SSE.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← a cada 15s, sem payload

event: client_evicted    ← quadro terminal, sem id (sintético)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

As linhas `id:` / `event:` no nível SSE duplicam `envelope.id` / `envelope.type` para compatibilidade com EventSource. Consumidores usando `fetch` bruto (o `parseSseStream` do SDK) leem tudo do envelope JSON e ignoram as linhas de preâmbulo SSE.

| Tipo de evento            | Gatilho                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session_update`          | Qualquer notificação ACP `sessionUpdate` (chunks do LLM, chamadas de ferramenta, uso)                                                                                                                                                                                                                                                     |
| `permission_request`      | Agente solicitou aprovação de ferramenta                                                                                                                                                                                                                                                                                            |
| `permission_resolved`     | Algum cliente votou em uma permissão via `POST /permission/:requestId`                                                                                                                                                                                                                                                      |
| `permission_partial_vote` | (somente consenso) Um voto foi registrado, mas o quórum ainda não foi atingido. Carrega `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pré-verificação `caps.features.permission_mediation`.                                                                                                                   |
| `permission_forbidden`    | Um voto foi rejeitado pela política ativa (incompatibilidade de `designated`, `local-only` não loopback, ou voto `consensus` não presente no snapshot). Carrega `{requestId, sessionId, clientId?, reason}`. Pré-verificação `caps.features.permission_mediation`.                                                                                 |
| `model_switched`          | `POST /session/:id/model` bem-sucedido                                                                                                                                                                                                                                                                                      |
| `model_switch_failed`     | `POST /session/:id/model` rejeitado                                                                                                                                                                                                                                                                                       |
| `session_died`            | Processo filho do agente falhou inesperadamente. **Terminal: o stream SSE fecha após este quadro; a sessão é removida de `byId`.** Assinantes devem reconectar via `POST /session` para criar uma nova.                                                                                                                              |
| `slow_client_warning`     | Local do assinante: fila ≥ 75% cheia. **Não terminal** — o stream continua; o aviso é um alerta antes da expulsão. Carrega `{queueSize, maxQueued, lastEventId}`. Dispara UMA VEZ por episódio de estouro; rearma após a fila esvaziar abaixo de 37,5%. Sem `id` (sintético). Pré-verificação `caps.features.slow_client_warning`. |
| `client_evicted`          | Local do assinante: estouro de fila. **Terminal: o stream SSE fecha após este quadro** (sem `id` — sintético). Outros assinantes na mesma sessão continuam.                                                                                                                                                                |
| `stream_error`            | Erro no lado do daemon durante a distribuição (fan-out). **Terminal: o stream SSE fecha após este quadro** (sem `id` — sintético).                                                                                                                                                                                                                |
Reconexão semântica:

- Envie `Last-Event-ID: <n>` para reproduzir eventos com `id > n` do anel por sessão (profundidade padrão **8000**, ajustável via `qwen serve --event-ring-size <n>`)
- **Detecção de lacuna (lado do cliente):** se `<n>` for anterior ao evento mais antigo ainda no anel (ex.: você reconecta com `Last-Event-ID: 50` mas o anel agora contém 200–1199), o daemon reproduz a partir do evento mais antigo disponível sem levantar erro. Compare o `id` do primeiro evento reproduzido com `n + 1`; qualquer diferença é o tamanho da janela perdida. O Estágio 2 injetará um frame sintético `stream_gap` explícito no lado do daemon; no Estágio 1 a detecção é responsabilidade do cliente.
- IDs são monotônicos por sessão, começando em 1
- Frames sintéticos (`client_evicted`, `slow_client_warning`, `stream_error`) omitem intencionalmente o `id` para não consumirem um slot de sequência de outros assinantes

Contrapressão:

- Fila por assinante padrão é de `maxQueued: 256` itens ao vivo (frames de reprodução durante reconexão ignoram o limite). Sobrescreva com `?maxQueued=N` (faixa `[16, 2048]`) na requisição SSE.
- Quando a fila de um assinante ultrapassa 75% de ocupação, o barramento força o envio de um frame sintético `slow_client_warning` para aquele assinante (uma vez por episódio de estouro; rearmado após drenagem abaixo de 37,5%). O stream permanece aberto — o aviso é um alerta para que o cliente possa drenar mais rápido ou desconectar e reconectar corretamente.
- Se a fila realmente estourar após o aviso, o barramento emite o frame terminal `client_evicted` e fecha a assinatura.

### `POST /permission/:requestId`

Votar em uma `permission_request` pendente. A **política de mediação** ativa decide quem vence:

| Política                      | Comportamento                                                                                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (padrão)    | Qualquer votante validado vence; votantes posteriores recebem `404`. Linha de base pré-F3.                                                                                                                                                                                 |
| `designated`                  | Apenas o originador do prompt (`originatorClientId`) decide; não-originadores recebem `403 permission_forbidden / designated_mismatch`. Cai para first-responder em prompts anônimos.                                                                                     |
| `consensus`                   | N-dos-M votantes devem concordar (padrão `N = floor(M/2) + 1`, sobrescrita via `policy.consensusQuorum`). A primeira opção a atingir `N` vence. Votos não resolvidos recebem `200` + frames SSE `permission_partial_vote`.                                               |
| `local-only`                  | Apenas votantes loopback decidem; chamadores remotos recebem `403 permission_forbidden / remote_not_allowed`.                                                                                                                                                              |

A política ativa é configurada em `settings.json` sob `policy.permissionStrategy` e exposta em `/capabilities` em `body.policy.permission`. Pré-voo `caps.features.permission_mediation` (com `modes: [...]`) para o conjunto suportado pela build.

> **F3 (#4175): coordenação de permissão multi-cliente.** O F3 adicionou as quatro políticas acima. Daemons pré-F3 usavam first-responder fixo; o formato permanece idêntico bit a bit quando a política configurada é `first-responder`. Novos eventos (`permission_partial_vote`, `permission_forbidden`) são aditivos — SDKs antigos os veem como `unrecognized_known_event` e ignoram graciosamente.

> **Timeout de permissão (padrão 5 minutos).** Uma `permission_request`
> permanece pendente até que: (a) algum cliente vote aqui, (b) `POST /session/:id/cancel`
> dispare, (c) o cliente HTTP que está conduzindo o prompt desconecte
> (cancelamento durante o prompt resolve permissões pendentes como `cancelled`),
> (d) a sessão seja encerrada, (e) o daemon desligue, **ou
> (f) o timeout de permissão por sessão dispare** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 minutos). Ao disparar o timeout, o `requestPermission` do agente resolve
> como `{outcome: 'cancelled'}`, o anel de auditoria registra uma
> entrada `permission.timeout`, o stderr do daemon emite um breadcrumb
> de uma linha, e o barramento SSE distribui o frame padrão
> `permission_resolved` cancelado para que assinantes façam a limpeza. O
> timeout é configurável via `BridgeOptions.permissionResponseTimeoutMs`;
> chamadores headless executando prompts longos podem querer aumentá-lo.

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

- `{ "outcome": "selected", "optionId": "<uma-das-opções>" }` — aceitar / rejeitar / proceed-once / etc, conforme as opções oferecidas pelo agente
- `{ "outcome": "cancelled" }` — descartar a requisição (equivale ao que `cancelSession` / `shutdown` fazem internamente)

Resposta:

- `200 {}` — seu voto foi aceito (resolvido OU registrado sob quórum de consenso)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: a política ativa rejeitou seu voto
- `404 { "error": "..." }` — o requestId é desconhecido (já resolvido, nunca existiu, ou sessão encerrada)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: o `allowedOptionIds` do agente contém o sentinela reservado `'__cancelled__'`; violação de contrato agente/daemon
- `501 { "code": "permission_policy_not_implemented", "policy": "<nome>" }` — compatibilidade futura F3: um literal de política chegou ao esquema mas seu ramo de mediador ainda não foi implementado (atualmente inalcançável; reservado para políticas futuras)

Após um voto bem-sucedido, todo cliente conectado vê `permission_resolved` com o mesmo `requestId` e o `outcome` escolhido. Sob `consensus`, votos intermediários adicionalmente distribuem `permission_partial_vote` até o quórum.

### Rotas de fluxo de dispositivo para autenticação (issue #4175 PR 21)

O daemon media uma Concessão de Autorização de Dispositivo OAuth 2.0 (RFC 8628) para que um cliente SDK remoto possa disparar um login cujos tokens caiam no **sistema de arquivos** do daemon — não no cliente. O daemon consulta o IdP ele mesmo; a única função do cliente é exibir a URL de verificação + código de usuário e (opcionalmente) assinar SSE para eventos de conclusão.

Tag de capacidade: `auth_device_flow` (sempre anunciada). Provedores suportados na
v1: `qwen-oauth`.

> [!note]
>
> O nível gratuito do Qwen OAuth foi descontinuado em 2026-04-15. Trate `qwen-oauth` como o
> identificador de provedor legado v1 neste protocolo; novos clientes devem preferir um
> provedor de autenticação atualmente suportado quando disponível.

**Localidade de execução.** O daemon nunca abre um navegador — mesmo que possa. O cliente decide se deve chamar `open(verificationUri)` localmente; em um pod headless (a implantação canônica do Modo B) o usuário abre a URL no dispositivo em que tiver um navegador. Veja `docs/users/qwen-serve.md` para a UX recomendada.

**Sem vazamento de token em eventos.** `auth_device_flow_started` carrega apenas `{deviceFlowId, providerId, expiresAt}`. O código de usuário e a URL de verificação são retornados ponto a ponto no corpo do POST 201 e via `GET /workspace/auth/device-flow/:id`; nunca são transmitidos via SSE.

**Singleton por provedor.** Um segundo `POST` para o mesmo provedor enquanto um fluxo estiver pendente é uma tomada de controle idempotente — retorna a entrada existente com `attached: true` em vez de iniciar uma nova requisição ao IdP.

#### `POST /workspace/auth/device-flow`

Portão de mutação estrito: requer um token bearer mesmo nos padrões loopback sem token (`401 token_required`).

Requisição:

```json
{ "providerId": "qwen-oauth" }
```

Resposta (`201` início novo, `200` tomada de controle idempotente):

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

- `400 unsupported_provider` — `providerId` desconhecido (resposta inclui `supportedProviders`)
- `409 too_many_active_flows` — limite do workspace (4) atingido; cancele um com `DELETE`
- `401 token_required` — portão estrito negou requisição sem token
- `502 upstream_error` — IdP retornou um erro inesperado

#### `GET /workspace/auth/device-flow/:id`

Ler o estado atual. Entradas pendentes ecoam `userCode/verificationUri/expiresAt/intervalMs`; entradas terminais (janela de 5 min) as removem e expõem `status` + opcional `errorKind/hint`.

Retorna `404 device_flow_not_found` para ids desconhecidos e entradas removidas após a janela.

#### `DELETE /workspace/auth/device-flow/:id`

Cancelamento idempotente:

- entrada pendente → `204` + emite `auth_device_flow_cancelled`
- entrada terminal → `204` sem operação (sem reemissão de evento)
- id desconhecido → `404`

#### `GET /workspace/auth/status`

Instantâneo de fluxos pendentes + provedores suportados:

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

#### Eventos SSE de fluxo de dispositivo

Cinco eventos tipados (escopo do workspace, distribuídos para todos os barramentos de sessão ativos):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST bem-sucedido; SDK deve assinar (sem userCode aqui, busque via GET se necessário)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — daemon honrou `slow_down` do upstream; clientes fazendo polling GET devem ajustar seu intervalo para corresponder
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — credenciais persistidas; `accountAlias` é um rótulo não-PII (nunca email/telefone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal; `errorKind` é um de `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` é interno do daemon: a troca com o IdP foi bem-sucedida mas o daemon não conseguiu armazenar as credenciais de forma durável (EACCES / EROFS / ENOSPC). O usuário deve tentar novamente após a condição de disco subjacente ser corrigida.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE bem-sucedido contra uma entrada pendente

> **Não compatível com MCP.** A especificação de autorização do MCP (2025-06-18) exige OAuth 2.1 + PKCE com callback de redirecionamento, o que não funciona para daemons em pods headless. A superfície de fluxo de dispositivo do Modo B é privada do daemon — clientes que visam servidores compatíveis com MCP devem usar um caminho de autenticação diferente.

## Formato de streaming

Eventos são emitidos como frames padrão do EventSource. O daemon escreve uma linha `data:` por frame (o JSON não tem quebras de linha embutidas após `JSON.stringify`); o parser do SDK em `packages/sdk-typescript/src/daemon/sse.ts` lida tanto com isso quanto com a forma multi-`data:` permitida pela especificação no lado da recepção.

## Frames de erro durante streaming

Se o iterador da ponte lançar uma exceção ao atender um assinante SSE, o daemon emite um frame terminal `stream_error` (sem `id`). A linha `data:` contém o envelope completo (mesma forma de qualquer outro frame SSE neste doc); a mensagem de erro real está em `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<mensagem>"}}
```

A conexão é então fechada.

## Variáveis de ambiente

| Variável            | Finalidade                                                    |
| ------------------- | ------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Token Bearer. Remove espaços em branco iniciais/finais na inicialização. |

## Estrutura do código-fonte

| Caminho                                              | Finalidade                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | Comando yargs + esquema de flags                                                                             |
| `packages/cli/src/serve/run-qwen-serve.ts`           | Ciclo de vida do listener + tratamento de sinais                                                              |
| `packages/cli/src/serve/server.ts`                   | Rotas Express + middleware                                                                                    |
| `packages/cli/src/serve/auth.ts`                     | Bearer + lista de permissão de Host + negação CORS                                                            |
| `packages/cli/src/serve/httpAcpBridge.ts`            | Iniciar ou anexar + FIFO por sessão + registro de permissão                                                   |
| `packages/cli/src/serve/status.ts`                   | Tipos de fio do status do daemon somente leitura + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | Helper puro que constrói cargas de `/workspace/env` a partir do estado de `process.*`, incluindo redação de credenciais |
| `packages/acp-bridge/src/eventBus.ts`                | Fila assíncrona limitada + anel de reprodução                                                                  |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | Cliente TS                                                                                                     |
| `packages/sdk-typescript/src/daemon/sse.ts`          | Parser de frames EventSource                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 casos, sem LLM                                                                                              |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 casos, filho real `qwen --acp` apoiado pelo servidor OpenAI fake local (apenas POSIX; ignorado no Windows)   |