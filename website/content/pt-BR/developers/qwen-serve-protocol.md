# `qwen serve` Referência do protocolo HTTP

Estágio 1 do [design do daemon qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Todas as rotas residem sob a URL base do daemon (padrão `http://127.0.0.1:4170`).

Esta referência descreve rotas HTTP e enquadramento SSE. Leia-a em conjunto com o [esquema de eventos tipados](./daemon/09-event-schema.md) para contratos de payload, motivos de ressincronização e âncoras de histórico, o [guia de barramento de eventos e replay](./daemon/10-event-bus.md) para entrega e backpressure, e [capacidades e versionamento](./daemon/11-capabilities-versioning.md) para o protocolo `v1` existente e regras de compatibilidade. O [índice da documentação do daemon](./daemon/00-index.md) vincula o conjunto completo de contratos.

## Autenticação [#authentication]

Quando o daemon foi iniciado com `--token` ou `QWEN_SERVER_TOKEN` — ou vinculado a uma interface não-loopback sem nenhum dos dois, o que gera um bearer efêmero e o imprime uma vez na inicialização — **todas as rotas normais da API exceto `/health` em vinculações loopback comuns** devem portar:

```
Authorization: Bearer <token>
```

Sem um token configurado no padrão loopback, o cabeçalho é opcional e as requisições que chegam através do listener primário têm autoridade total da API do operador. Confiança no workspace, propriedade da sessão, `X-Qwen-Client-Id`, permissões, recursos, validação e verificações de recursos ainda se aplicam. A comparação de tokens é de tempo constante. As respostas 401 são uniformes entre `missing header` / `wrong scheme` / `wrong token`.

**`--open-with-auth`.** Este modo CLI desativado por padrão requer uma vinculação loopback e um Web Shell disponível. Ele reutiliza a seleção normal `--token`-sobre-`QWEN_SERVER_TOKEN`, ou gera 32 bytes aleatórios codificados como base64url antes da inicialização do daemon quando essa seleção estiver vazia. O navegador recebe o bearer selecionado através de `#token=` e o armazena por aba; o protocolo e o middleware veem um token configurado comum. A entrega de fragmentos depende do token resolvido, não desta flag: qualquer lançamento `--open` anexa o bearer resolvido — configurado ou gerado — ao fragmento `#token=` da URL lançada (visível para usuários locais via `ps` / `/proc`, como o launcher avisa), então uma vinculação não-loopback com `--open` puro entrega seu bearer gerado ao navegador da mesma maneira; as contribuições distintas desta flag são a _geração_ de token no loopback e o fallback manual de URL para ambientes inelegíveis para navegador. Apenas chamadores embutidos diretos que ignoram `RunHandle.resolvedToken`, e clientes que nunca lançam um navegador, não recebem credenciais automáticas. Ambientes inelegíveis para navegador imprimem a URL do fragmento contendo o segredo para abertura manual. `/health` Loopback e assets estáticos do Web Shell mantêm as isenções descritas abaixo; `--require-auth` ainda controla `/health`.

A entrada webhook do canal (`POST /channels/:channelName/webhooks/:source`) é separada deste contrato bearer em todos os modos. Quando montada, ela é registrada antes de `bearerAuth` e autentica com seu `x-qwen-webhook-secret` configurado; rotacionar o bearer do daemon não rotaciona os segredos das fontes de webhook.

**Isenção `/health`** (Bctum): em vinculações loopback (`127.0.0.0/8` / `localhost` / `::1` / `[::1]`), `/health` é registrado ANTES do middleware bearer, então sondas de liveness dentro do pod não precisam portar o token mesmo quando o daemon foi iniciado com `--token`. Vinculações não-loopback (`--hostname 0.0.0.0` etc.) controlam `/health` junto com as outras rotas normais da API — veja a seção [`GET /health`](#get-health) para a justificativa.

**`--require-auth` (#4175 PR 15).** Passe esta flag na inicialização para estender a regra "deve ter um token" também para o loopback. A inicialização falha quando nenhuma fonte de token resolve — no loopback isso significa `--token`, `QWEN_SERVER_TOKEN`, ou `--open-with-auth` (que instala seu próprio token gerado antes da inicialização, então `--require-auth --open-with-auth` inicia). A falha rápida é exclusiva do loopback: uma vinculação não-loopback resolve o bearer efêmero que gera quando nenhuma fonte configurada está presente, e isso satisfaz a flag. A isenção `/health` é removida em ambos os casos, então `/health` também requer `Authorization: Bearer …`.

Quando a flag está ativada, o middleware global `bearerAuth` controla **todas as rotas normais da API** — incluindo `/health` e `/capabilities`. A entrada webhook do canal permanece autenticada independentemente por segredo compartilhado, e as rotas de documento e assets do Web Shell permanecem pré-autenticação. Um cliente **não autenticado**, portanto, não pode fazer pre-flight `caps.features` para descobrir que a autenticação é necessária: a superfície de descoberta para esse caso é o **corpo da resposta 401** em si (uniforme entre rotas controladas por bearer conforme a seção [Autenticação](#authentication)). A tag de capacidade `require_auth` é uma **confirmação pós-autenticação** — uma vez que um cliente autentica com sucesso e lê `/capabilities`, a presença da tag confirma que o daemon foi iniciado com `--require-auth` (útil para UIs de auditoria/conformidade e para clientes SDK exibirem "esta implantação é endurecida" em um painel de configurações). Rotas de mutação estritas aceitam requisições do listener primário loopback confiável, requisições autenticadas por bearer ou requisições pareadas Local Control. Embeds não confiáveis sem token ainda recebem `401 { code: "token_required", error: "…" }`; com `--require-auth`, o middleware bearer global rejeita primeiro com o corpo legado `Unauthorized`.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Clientes de navegador atingindo o daemon cross-origin são bloqueados por padrão — uma requisição portando um cabeçalho `Origin` retorna `403 {"error":"Request denied by CORS policy"}` porque clientes CLI/SDK nunca enviam `Origin` e o daemon trata sua presença como sinal de que a requisição veio de um contexto de navegador no qual o operador não optou. Uma exceção precede o muro em uma vinculação não-loopback com token: uma requisição same-origin (`Origin` igual ao esquema do socket direto mais a autoridade `Host` normalizada) é autenticada por bearer e seu `Origin` é removido **no listener primário** — com um bearer válido, o status da rota segue, com um bearer ausente ou inválido um `401`, **exceto as rotas pré-autenticação do documento Web Shell, `/assets/*`, `/manifest.webmanifest`, `/sw.js` e `/mcp-app-sandbox`, que são servidas sem credencial como em todos os outros modos** — e apenas valores `Origin` cross-origin ou não correspondentes mantêm o envelope `403`. Passe `--allow-origin <pattern>` (repetível) na inicialização para instalar uma allowlist em vez do muro. Cada padrão é:

- O literal `*` — admite qualquer origem. **Arriscado**: a inicialização recusa quando `*` está configurado, mas nenhum token bearer é resolvido. A proteção lê o token _resolvido_ — `--token`, `QWEN_SERVER_TOKEN`, o token de loopback gerado por `--open-with-auth` ou o bearer efêmero gerado por um bind não-loopback quando nenhuma fonte configurada está presente — portanto, essa recusa é exclusiva para loopback. O breadcrumb da inicialização emite um aviso no stderr quando `*` está na lista. **Recomendação**: combine com `--require-auth` em binds de loopback para que `/health` também seja protegido pelo bearer — ele é registrado antes do middleware bearer em loopback por padrão (para que sondas k8s/Compose possam acessá-lo sem um token), e uma allowlist `*` torna-o acessível de qualquer navegador cross-origin. `--require-auth` ainda deixa os ativos estáticos do Web Shell (`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, e as navegações de documento `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` e `/settings`) pré-autenticados em loopback por design — eles são montados antes do middleware bearer — então, sob uma allowlist `*`, permanecem legíveis de qualquer navegador cross-origin; `--no-web` remove essa superfície. Em binds não-loopback, o bearer já é obrigatório na inicialização e `/health` é registrado atrás dele. As rotas normais da API são protegidas por bearer, a entrada webhook do canal mantém seu próprio gate de segredo compartilhado e os ativos estáticos do Web Shell (`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, e as navegações de documento `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` e `/settings`) permanecem pré-autenticados, a menos que `--no-web` os remova.
- Uma origem de URL canônica — `<scheme>://<host>[:<port>]`. **Sem barra final, sem caminho, sem userinfo, sem consulta.** A inicialização recusa com `InvalidAllowOriginPatternError` se a entrada falhar na ida e volta `new URL(pattern).origin === pattern`; a mensagem de erro nomeia o padrão inválido e a forma canônica. Rigoroso por intenção: normalização silenciosa (por exemplo, aparar uma barra final `/`) permitiria que erros de digitação passassem e aceitaria entradas ambíguas. Sem um token resolvido — que após a geração significa um bind de loopback — as entradas HTTP(S) são limitadas a hosts de loopback; uma origem de navegador não-loopback requer um token porque pode, de outra forma, acionar toda a API do operador, incluindo execução de código como usuário do daemon. Origens explícitas de extensões de navegador mantêm seu caminho existente de automação local sem token. A inicialização registra a autoridade concedida a qualquer origem de navegador permitida sem token.

As origens correspondentes recebem os cabeçalhos de resposta CORS padrão em cada solicitação:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin` ecoa a origem da solicitação verbatim (minúsculas / maiúsculas conforme enviado pelo navegador) em vez do literal `*`, mesmo sob o padrão `*` — os caches dos navegadores indexam respostas nele pareado com `Vary: Origin`, e o eco deixa espaço para adicionar `Access-Control-Allow-Credentials` em uma versão futura sem alteração de esquema. Os cabeçalhos expostos permitem que clientes de navegador respeitem dicas de nova tentativa, retenham a época SSE e correlacionem fluxos físicos aceitos. `Access-Control-Allow-Credentials` **NÃO** é enviado hoje: credenciais de daemon configuradas usam bearer-in-`Authorization`, que funciona cross-origin sem `credentials: 'include'`; a autoridade de loopback confiável não precisa de credencial de navegador.

Solicitações de preflight OPTIONS (OPTIONS com `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) encerram-se antecipadamente com `204 No Content` mais os cabeçalhos acima. Este é o padrão CORS convencional e é seguro — o preflight apenas confirma quais métodos/cabeçalhos o daemon aceitará; a solicitação subsequente real ainda executa o gate Host e depois either authority bearer/listener ou o gate de segredo compartilhado do webhook do canal antes que qualquer estado seja lido ou alterado. Solicitações OPTIONS simples de origens correspondentes continuam fluindo para baixo com cabeçalhos CORS anexados.

Origens que não correspondem à allowlist ainda recebem `403 {"error":"Request denied by CORS policy"}` — mesmo envelope que a parede padrão, para que clientes que já analisaram a resposta da parede não precisem tratar especialmente daemons implantados com allowlist. O caminho de rejeição **não** emite nenhum cabeçalho `Access-Control-*` (o navegador os ignoraria, e emitir indiretamente anunciaria o tamanho da allowlist através da presença de cabeçalhos).

A lista de padrões configurada intencionalmente NÃO é ecoada em `/capabilities` — um cliente de navegador já conhece sua própria origem (afinal, chamou o daemon), e expor a lista permitiria que um leitor não autenticado de `/capabilities` enumerasse todas as origens confiáveis (reconhecimento útil para uma implantação mal configurada). Clientes SDK verificam a tag `caps.features.allow_origin` para "este daemon honra hits de navegador cross-origin" sem precisar saber quais origens específicas.

Solicitações de mesma origem de loopback (por exemplo, o Web Shell chamando o daemon no mesmo `127.0.0.1:port`) são tratadas por um shim de remoção de Origin **separado** que roda ANTES do middleware CORS e remove o cabeçalho `Origin` para `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` ou o endereço e porta exatos de loopback vinculados. Ele também aceita as formas sem porta correspondentes ao esquema que os navegadores enviam para portas padrão: `http://host` na porta 80 e `https://host` na porta 443. Essas solicitações passam independentemente da configuração `--allow-origin` — operadores não precisam listar a própria porta do daemon para fazer o Web Shell funcionar.

## Formato comum de erro

Respostas 5xx carregam `code` e `data` do erro original quando presentes (estilo JSON-RPC — o SDK ACP encaminha `{code, message, data}` do agente):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

JSON malformado em um corpo de solicitação retorna:

```json
{ "error": "Invalid JSON in request body" }
```

com status `400`.

`SessionNotFoundError` para um id de sessão desconhecido retorna:

```json
{
  "error": "No session with id \"<sid>\"",
  "sessionId": "<sid>",
  "code": "session_not_found"
}
```

com status `404`. Um fechamento concorrente usa `code: "session_closing"`.

`WorkspaceMismatchError` para um `POST /session` cujo `cwd` não se canoniza para um workspace registrado retorna `400` com:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

Use isso para detectar incompatibilidade pré-voo: leia `workspaceCwd` de `/capabilities` e omita `cwd` de `POST /session` (ele recorre ao workspace primário), ou quando `multi_workspace_sessions` for anunciado, escolha um de `workspaces[].cwd`.

`POST /session` além do limite `--max-sessions` do daemon retorna `503` com um cabeçalho `Retry-After: 5` e:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

Quando o limite total efetivo em todo o daemon rejeita uma nova sessão — `--max-total-sessions`, ou o padrão descrito sob `limits.maxTotalSessions` — o mesmo formato de resposta é retornado com `"scope": "total"`.

Anexações a sessões existentes NÃO são contadas para o limite, então reconexões de um daemon ocioso continuam funcionando mesmo quando no limite de capacidade.

Se o orçamento de inicialização do canal ACP expirar antes que `newSession` seja despachado, `POST /session` retorna `504` com `Retry-After: 5` e:

```json
{
  "error": "AcpSessionBridge initialize timed out after 10000ms",
  "code": "init_timeout",
  "errorKind": "init_timeout",
  "retryable": true,
  "sideEffectPossible": false,
  "phase": "channel.initialize",
  "timeoutMs": 10000
}
```

`timeoutMs` — e o sufixo numérico de `error` — refletem o orçamento `--initialize-timeout-ms` configurado do daemon (os valores acima são o padrão). O formato completo de nova tentativa segura acima é emitido apenas para criação simples de sessão, onde a inicialização do canal precede estritamente toda mutação durável: nesse caminho, o campo `sideEffectPossible: false` é autoritativo porque a inicialização precede a solicitação ACP `newSession`, e um cliente que entende este contrato estruturado pode tentar novamente após o atraso anunciado sem arriscar uma Sessão duplicada.

Requisições que carregam `branch` ou `worktree`, e timeouts de inicialização apresentados por rotas com mutação exceto criação simples (por exemplo, `POST /session/:id/branch` e `POST /session/:id/side-task`, onde um fork confirmado pode sobreviver ao handshake falho), retornam o mesmo `504` com `code: "init_timeout"`, `phase` e `timeoutMs` — mas SEM `Retry-After`, `retryable` ou `sideEffectPossible`. Para esses, o resultado da mutação é desconhecido: a preparação de branch e worktree altera o git antes do canal ser inicializado, e o rollback tentado em caso de falha é best-effort (um rollback de checkout falho deixa o workspace no novo branch, e uma nova tentativa pode apresentar um conflito de branch já existente). Clientes que classificam todas as respostas de mutação 5xx como ambíguas permanecem conservadoramente fail-closed e devem aplicar a mesma política à forma reduzida. `POST /session/:id/load` e `POST /session/:id/resume` apresentam a mesma `init_timeout` `504` reduzida quando a inicialização do canal expira antes que a requisição de restauração seja despachada (o estágio `ensureChannel`); diferentemente dos `session_restore_timeout` `504` documentados em suas listas de Erros, esta forma não carrega `Retry-After`, não carrega `retryable` e não instala nenhum fence porque a restauração nunca foi despachada. O timeout de despacho `newSession` em `POST /session` é uma exceção: retorna `504` com `code: "init_timeout"`, `retryable: true` e um `Retry-After` derivado do orçamento, mas sem `phase` ou `sideEffectPossible`, porque o resultado da criação é ambíguo. Todos os outros rótulos de timeout mantêm o mapeamento genérico.

`RestoreInProgressError` — emitido por `POST /session/:id/load`, `POST /session/:id/resume` ou um `POST /session` com id fornecido pelo chamador quando outro registro já possui esse id — retorna `409` e:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "reason": "restore_in_progress",
  "retryable": true,
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Disparado quando um `session/load` é emitido para um id que já tem um `session/resume` em andamento (ou vice-versa), ou quando uma spawn com id fornecido pelo chamador compete com qualquer direção de restauração. Aguarde pelo menos `Retry-After` segundos e tente novamente. Corridas de mesma ação (`load` vs `load`, `resume` vs `resume`) se coalescem em vez de gerar erro enquanto a restauração está ativa.

`reason` distingue dois fences que compartilham este código, e o cabeçalho `Retry-After` rastreia isso:

| `reason` | Significado | `Retry-After` |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `restore_in_progress` | Uma restauração ordinária está sendo executada. | `5` (correspondendo a `session_limit_exceeded`) |
| `awaiting_abandoned_cleanup` | O chamador público já recebeu um timeout (`504` para restauração, ou `init_timeout` para inicialização de sessão) e a requisição ACP não cancelável mais sua limpeza ainda não se estabilizaram. | o orçamento da operação que expirou em segundos — restauração, ou inicialização para uma spawn com id fornecido pelo chamador — limitado a `5`–`120` |

A requisição pública de restauração é regida por `limits.sessionRestoreTimeoutMs` (padrão 60s). Após um `504`, o id permanece fenced até que a requisição ACP tardia e a limpeza se estabilizem, então um cliente que continua tentando na cadência ordinária de 5 segundos giraria contra um 409 que não consegue limpar — respeite a dica derivada do orçamento que acompanha `awaiting_abandoned_cleanup`.

`SessionWorkspaceConflictError` — emitido por `POST /session/:id/load` e `POST /session/:id/resume` quando o `cwd` solicitado mira um workspace registrado, mas o mesmo id de sessão já está ativo ou sendo restaurado por outro runtime — retorna `409` com:

```json
{
  "error": "Session \"<sid>\" is already live or restoring in another workspace runtime.",
  "code": "session_workspace_conflict",
  "sessionId": "<sid>",
  "workspaceCwd": "/requested/workspace",
  "workspaceId": "requested-workspace-id",
  "liveWorkspaceCwd": "/live/owner/workspace",
  "liveWorkspaceId": "live-owner-workspace-id"
}
```

Clientes devem tentar novamente com o workspace proprietário ou aguardar a conclusão da restauração em andamento antes de restaurar o id em um workspace diferente. Corridas de restauração no mesmo workspace continuam usando o comportamento de `restore_in_progress` / coalescência da bridge.

`SessionArchivedError` é emitido quando um chamador tenta carregar ou retomar uma sessão cujo JSONL está sob `chats/archive/`:

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

## Capacidades [#capabilities]

O daemon anuncia suas tags de recursos suportados a partir do registro de capacidades do serve. Os clientes **devem** habilitar/desabilitar a UI com base em `features`, não em `mode` (conforme design §10).

```
['health', 'capabilities', 'session_create', 'session_startup_config', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_catalog_batch', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_mid_turn_send_now',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_skills_config_runtime',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'scheduled_task_gate', 'autofix_pr_watches', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_resources', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload', 'workspace_file_delete', 'workspace_directory_create', 'workspace_directory_delete',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_skill_settings_toggle', 'workspace_skill_settings_batch_toggle',
 'workspace_session_refresh',
 'extension_batch_activation_v2', 'extension_activation_explicit_refresh',
 'extension_state',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_btw_stream', 'session_shell_command',
 'standalone_sessions_v1', 'standalone_session_options_v1',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'user_language_sync', 'session_message_deletion', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'workspace_model_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name', 'workspace_runtime_removal', 'workspace_runtime',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2', 'extension_git_credentials',
 'extension_local_path_install',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'workspace_session_live_state', 'workspace_session_live_state_batch',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> Tags condicionais aparecem apenas quando sua condição de disponibilidade de implantação ou runtime é atendida (veja a tabela abaixo). A tag `permission_mediation` de F3 é sempre ativada e carrega `modes: ['first-responder', 'designated', 'consensus', 'local-only']` para que clientes SDK possam introspectar o conjunto suportado pela build; a estratégia ativa em runtime está em `body.policy.permission`.

`session_startup_config` anuncia `startupConfig: { modelServiceId, reasoningEffort? }` opcional na criação ordinária e standalone. Sempre faça preflight desta tag: rotas de criação ordinária antigas podem silenciosamente ignorar o objeto. `modelServiceId` é obrigatório (1–256 caracteres); `reasoningEffort` aceita `none`, `default`, `low`, `medium`, `high`, `xhigh` ou `max` quando suportado pelo modelo selecionado. A omissão aplica apenas o modelo, sem um setter de raciocínio ou `default` implícito. O objeto não pode ser combinado com o `modelServiceId` legado de nível superior ou escopo único explícito e implica uma nova thread. A inicialização nunca salva padrões compartilhados; o comportamento posterior da sessão permanece inalterado.

O sucesso inclui `modelApplied: true` e `startupConfigApplied: { modelServiceId, reasoningEffort?, effectiveReasoning? }`. O seletor de modelo é canônico. Apenas solicitações explícitas de raciocínio incluem os dois campos de raciocínio; o estado efetivo é `{ state: 'disabled' }`, `{ state: 'provider-default' }` ou `{ state: 'enabled', effort? }` (raciocínio apenas por toggle não tem esforço). Estrutura inválida é `400 invalid_startup_config`; uma seleção rejeitada ou não confirmada é `422 startup_config_rejected`. Rejeição definitiva standalone faz rollback de sua gravação própria e tenta descartar o diretório de saída vazio antes de retornar; um rollback de gravação cuja remoção não pode ser confirmada e falhas transitórias de inicialização retêm `standalone_creation_outcome_unknown`, enquanto um descarte de diretório falho é apenas registrado e a rejeição definitiva ainda é retornada. Uma falha de confirmação do corpo de sucesso no SDK é um erro de protocolo, não uma instrução para adotar uma sessão recuperada.

`session_scope_override` é o handle de negociação para o campo `sessionScope` por requisição em `POST /session` (veja abaixo). Daemons antigos silenciosamente ignoram o campo, então clientes SDK devem fazer pre-flight de `caps.features` para esta tag antes de enviá-lo.

`session_id_override` é o handle de negociação para o `sessionId` opcional fornecido pelo chamador em metadados `POST /session` e ACP `session/new`. Clientes devem confirmar que `caps.features` contém esta tag antes de enviar o campo porque daemons antigos podem silenciosamente ignorá-lo.

`persistent_workspace_registration` anuncia registro durável para workspaces adicionados em runtime. `POST /workspaces` aceita `{ "cwd": "/absolute/path", "persist": true }`; o sucesso inclui `persisted: true`. Registros são escopados ao workspace primário canônico do daemon sob o home Qwen do usuário e são restaurados na próxima inicialização do daemon. Omitir `persist` preserva o registro local ao processo. `GET /workspace-registrations` lista o conjunto desejado armazenado, e `DELETE /workspace-registrations/:id` esquece uma entrada para a próxima reinicialização sem remover hot um runtime ativo.

`workspace_display_name` anuncia entrada `displayName` opcional em `POST /workspaces`, atualizações de metadados de workspace através de `PATCH /workspaces/:workspace` e campos de nome de exibição opcionais em projeções de workspace. Nomes não participam de lookup ou roteamento: `id` e `cwd` canônicos permanecem os únicos seletores, e nomes duplicados são permitidos.

`workspace_runtime_removal` anuncia a remoção síncrona a quente por meio de `DELETE /workspaces/:workspace`. As entradas de capability do workspace adicionam `removable` opcional; apenas linhas com `removable: true` podem ser removidas. A remoção também esquece todos os aliases de registro persistentes para o runtime, mas nunca exclui arquivos, configurações, transcrições ou arquivos.

`workspace_runtime` anuncia `GET /workspace/runtime/status`, `POST /workspace/runtime/ensure` e seus equivalentes `/workspaces/:workspace/runtime/...`. `ensure` não aceita seleção de capability: inicia ou reutiliza o runtime ACP do workspace confiável selecionado e retorna seu estado de ciclo de vida e epoch de runtime monotônico. As rotas primárias pertencem apenas ao runtime primário; as rotas qualificadas resolvem apenas o runtime registrado selecionado e nunca fazem fallback. Um ensure bem-sucedido renova a janela de keepalive de dez minutos do runtime. O status é somente leitura e nunca inicia o processo filho. Ensures concorrentes compartilham uma única inicialização física. Inicialização em andamento ou falha retorna `503 runtime_still_starting` ou `503 runtime_initialization_failed` passíveis de nova tentativa. A preparação da capability pode continuar após o orçamento de observação do ensure expirar; nesse caso, o ensure ainda retorna o runtime ativo com um estado de capability não pronto para polling de status. A capability é anunciada apenas quando todas as pontes de runtime ativas fornecem o snapshot autoritativo do ciclo de vida; uma ponte injetada legada selecionada retorna `501 workspace_runtime_not_supported` em vez de um estado ou epoch estimado.

`workspace_runtime_stop` anuncia independentemente a parada de runtime confirmada pelo usuário. `GET /workspaces/runtime-stop-options` é uma pré-visualização somente leitura, global ao processo: inclui a contagem de processos filhos comprometidos, o teto modelado de processos filhos e as sessões, motivos bloqueados, ID do canal, epoch, token de parada atual e último recibo de cada workspace visível. Sessões carregadas ordinárias podem ser explicitamente paradas; clientes ACP independentes, agendamentos habilitados, trabalhos pendentes de scheduler/gerenciamento/início, tarefas de memória, workers, voz e runtimes de propósito especial são bloqueados. `POST /workspaces/:workspace/runtime/stop` usa o gate de mutação estrito e apenas o runtime confiável selecionado. Envie `confirmInterruptions: true`, `expectedChannelId`, `expectedRuntimeEpoch`, `expectedStopToken` e o `expectedSessionIds` exato da pré-visualização. Nunca faça fallback para o runtime primário. A pré-visualização e cada recibo listam os canais ACP ativos do runtime como `channels` (`channelId`, `runtimeEpoch`, `executionEngine` opcional); um runtime pode ter um canal por motor de execução, e uma parada cobre todos eles. `channelId` nomeia o primeiro canal listado e `runtimeEpoch` é o epoch mais recente listado, portanto, um canal iniciado após a pré-visualização torna a confirmação obsoleta.

Uma resposta bem-sucedida tem `state: "stopped"`, `stopped: true` e `released: true`, após fechamentos de sessão reconhecidos e a liberação do registro de processos de cada filho listado. Registro, arquivos e histórico salvo permanecem. As respostas incluem IDs de sessão afetados, interrompidos, fechados e restantes. Confirmação obsoleta ou bloqueada é HTTP 409 (`workspace_runtime_stop_stale` / `workspace_runtime_stop_blocked`); fechamento parcial é 409 `workspace_runtime_stop_incomplete`; desmontagem em andamento ou desmontagem falhada sem liberação comprovada é 503 `workspace_runtime_stop_in_progress` / `workspace_runtime_stop_failed`; gerenciamento não suportado é 501 `workspace_runtime_stop_not_supported`. Uma desmontagem não limpa que posteriormente comprova a liberação do registro pode retornar 200 com um aviso de erro; o flush não confirmado da sessão ainda retorna um resultado parcial/de erro. O orçamento total de observação/fechamento é de 60 segundos. Se ele expirar enquanto um fechamento de sessão ainda estiver em trânsito, a resposta se estabiliza com `state: "failed"` e `503 workspace_runtime_stop_failed`; a limpeza continua separadamente. O workspace selecionado permanece isolado e seu filho continua sendo contado até a conclusão real da limpeza, mesmo que o chamador tenha recebido uma falha. Opções somente leitura podem relatar posteriormente `stopped` após fechamentos reconhecidos e liberação comprovada, ou `incomplete` quando a persistência não foi confirmada; o snapshot de falha já retornado não muda. Se o orçamento for esgotado entre os fechamentos de sessão, a resposta se estabiliza com `state: "incomplete"` e `409 workspace_runtime_stop_incomplete`: nenhum fechamento adicional ou kill forçado é iniciado, a guarda de admissão da parada é liberada (o filho sobrevivente continua sendo contado normalmente) e parar as sessões restantes requer uma nova pré-visualização e confirmação. Uma recusa de flush não é ignorada matando à força as sessões restantes. A saída raiz ou uma queda na contagem global de processos sozinha não estabelece a liberação do filho selecionado. No Windows, onde o registro não rastreia grupos de processos descendentes, a saída estabilizada da raiz é a evidência de liberação, então `released: true` não prova que a árvore de processos desapareceu lá.

A confirmação repetida do token consumido mais recente observa a mesma operação. Uma nova confirmação pode tentar novamente uma parada incompleta, rotacionando o token; tokens consumidos mais antigos tornam-se obsoletos. Se uma resposta for perdida, leia as opções e corresponda ao recibo mais recente por workspace e token de parada em vez de parar outro alvo. Os recibos podem estar indisponíveis após remoção, mudanças de confiança ou recriação de daemon/ponte; a ausência deixa o resultado desconhecido e nunca autoriza a continuação. SDK `runtimeStopOptions()` e `workspaceById(id).stopRuntime(confirmation)` usam REST mesmo com transporte ACP e nunca repetem automaticamente o POST. Assinantes de sessão recebem `session_closed` com `reason: "client_close"` e `cause: "workspace_runtime_stop"`; saídas fatais associadas à parada marcam adicionalmente `persistenceUnconfirmed: true`. Clientes Web Shell atualizados mantêm a seleção/transcrição salva e aguardam Retomar explícito. Esta é uma parada única, não suspensão persistente; um cliente que perdeu o evento pode competir pela capacidade novamente.

As respostas de status e ensure do runtime usam esta forma:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "state": "active",
  "runtimeLive": true,
  "runtimeEpoch": 4,
  "capabilities": {
    "skills": {
      "state": "ready",
      "revision": 2,
      "runtimeEpoch": 4
    }
  }
}
```

Quando um runtime de workspace tem mais de um motor de execução, `runtimeLive` e `runtimeEpoch` descrevem o canal que serve o controle do workspace (MCP e Skills): enquanto esse canal está ativo, o início ou saída de outro motor não os altera. `state` reporta esse canal como `cold`, `starting` ou `stopping` enquanto ele não está ativo; `active` e `idle` contam o trabalho em todos os motores.

`capabilities.skills.state` é `not_started`, `starting`, `ready`, `stale` ou `error`; falhas incluem `{code, message}` em `capabilities.skills.error`. Um catálogo de Skills está atualizado apenas quando os valores top-level e de capability `runtimeEpoch` correspondem. `revision` ordena a preparação de Skills dentro de um único epoch de runtime e não deve ser comparado entre epochs.

`workspace_skills_config_runtime` anuncia as leituras de Skills divididas e mutações de configuração sob `/workspace/{config,runtime}/skills` e `/workspaces/:workspace/{config,runtime}/skills`. O Web Shell usa essas rotas para gerenciamento de Skills e, ao compor uma nova sessão, para popular comandos de barra a partir da config imediatamente antes de substituí-los por um catálogo de runtime de epoch correspondente. Quando o recurso está ausente, os clientes devem continuar usando as rotas legadas de Skills e não devem chamar ensure de runtime exclusivamente para Skills.

`session_load` e `session_resume` anunciam as rotas de restauração explícita (`POST /session/:id/load` e `POST /session/:id/resume`). Daemons mais antigos retornam `404` para esses caminhos, então os clientes SDK devem fazer pre-flight `caps.features` antes de chamar. `unstable_session_resume` ainda é anunciado como um alias depreciado para compatibilidade com SDKs que foram lançados enquanto o método ACP subjacente era chamado `connection.unstable_resumeSession`; novos clientes devem fazer gating em `session_resume`.

`limits.sessionRestoreTimeoutMs`, quando presente, é o orçamento de tempo real do daemon para a solicitação ACP `loadSession` / `unstable_resumeSession` subjacente. É um campo aditivo v1. O SDK TypeScript concede ao daemon 10 segundos de margem do cliente, e o watchdog da Web Shell concede 15 segundos; clientes que conversam com um daemon mais antigo devem usar 70 segundos e 75 segundos, respectivamente.

`session_transcript` anuncia `GET /session/:id/transcript`, uma visualização paginada somente de leitura para reprodução sobre o JSONL de sessão ativa persistido. É separado de `/load`: não anexa um cliente, inicializa o EventBus ao vivo, cria uma sessão ao vivo ou altera a janela de reprodução ao vivo. Os clientes devem usá-lo quando precisarem da transcrição completa em disco para uma sessão longa e continuar usando `/load` apenas para reprodução ao vivo limitada durante a restauração fria da interface do usuário.

`workspace_persisted_transcript` anuncia `GET /workspaces/:workspace/session/:id/transcript`, um paginador local ao daemon somente de dados persistidos que não inicia o ACP, consulta o estado da ponte ao vivo, carrega configurações, descobre capacidades do projeto ou cria a chave de cursor persistida legada. A tag é incondicional porque primárias confiáveis de espaço de trabalho único podem usar a rota plural; a autorização de confiança por espaço de trabalho ainda é avaliada em cada solicitação. Espaços de trabalho secundários não confiáveis registrados podem ler, enquanto uma primária não confiável permanece rejeitada.

`workspace_session_export` anuncia `GET /workspaces/:workspace/session/:id/export`, uma exportação completa somente confiável da sessão ativa persistida do espaço de trabalho selecionado. É independente de `session_export` e `workspace_qualified_rest_core`: daemons lançados podem anunciar ambas as tags mais antigas sem implementar a rota plural, então os clientes devem pré-verificar esta tag diretamente. A tag é incondicional porque uma primária confiável de espaço de trabalho único pode usar a rota por id ou cwd. A exportação não resolve um proprietário ao vivo, inicia o ACP, anexa um cliente nem recorre a outro espaço de trabalho.

`workspace_archived_session_export` anuncia `GET /workspaces/:workspace/session/:id/archive/export`, uma exportação completa somente confiável do armazenamento persistido arquivado do espaço de trabalho selecionado. É independente de `workspace_session_export` e `workspace_qualified_rest_core`; os clientes devem pré-verificar esta tag diretamente. Uma rota distinta impede que um daemon mais antigo ignore a intenção de arquivamento e retorne uma transcrição ativa com o mesmo id.

`workspace_session_live_state` anuncia `GET /workspaces/:workspace/sessions/live-state`, um snapshot somente de memória das sessões ativas do runtime do espaço de trabalho selecionado, além de uma versão de catálogo em memória que informa aos clientes quando uma recarga completa do catálogo persistido é justificada. É independente de `workspace_qualified_rest_core`: daemons lançados podem anunciar a capacidade REST de espaço de trabalho mais ampla sem implementar esta rota, então os clientes devem pré-verificar esta tag diretamente. A tag é incondicional porque uma primária confiável de espaço de trabalho único pode usar a rota por id ou cwd; verificações de confiança por espaço de trabalho ainda se aplicam em cada solicitação, e a rota não estende a política permissiva de leitura do catálogo persistido de secundário não confiável ao estado da ponte ao vivo. A tag significa que o endpoint existe; ela não promete que cada item ao vivo carregue o watermark de atividade opcional `updatedAt`, que depende do ciclo de vida.

`workspace_session_live_state_batch` anuncia `POST /sessions/live-state`. Os clientes pré-verificam isso uma vez antes de agrupar pesquisas e mantêm a rota de espaço de trabalho único para daemons mais antigos. O lote usa a mesma semântica de snapshot somente de memória e versão de catálogo confiável da rota de espaço de trabalho único.

O campo de nível superior opcional `/capabilities` `sessionLiveStatePollIntervalMs` anuncia o intervalo de pesquisa de estado ao vivo em todo o daemon em milissegundos. Ele é resolvido uma vez a partir da variável de ambiente de inicialização `QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS`, independentemente das sobreposições de ambiente do espaço de trabalho. Valores inteiros de `1000` a `2147483647` são aceitos; valores ausentes ou inválidos usam `5000`. A Web Shell consome esta dica para todas as pesquisas de estado ao vivo do espaço de trabalho e também recorre a `5000` para um campo ausente ou inválido de um daemon mais antigo ou incompatível. Este campo não altera a semântica de snapshot da rota, atualizações locais/imediatas de visibilidade ou pesquisas de catálogo completo. Clientes SDK permanecem responsáveis por seus próprios temporizadores.

`slow_client_warning` cobre o comportamento de contrapressão SSE: (a) o daemon emite um quadro de fluxo de eventos sintético `slow_client_warning` quando o backlog de quadros ao vivo ou o backlog de bytes serializados ao vivo de um assinante cruza 75% de ocupação, uma vez por episódio de estouro (rearmando após ambas as medições drenarem abaixo de 37,5%); (b) `GET /session/:id/events` aceita um parâmetro de consulta `?maxQueued=N` (intervalo `[16, 2048]`) para dimensionar previamente o backlog de quadros por assinante para reconexões frias contra um anel de reprodução grande. O limite de bytes serializados é propriedade do daemon (padrão **2 MiB** por assinante), somente ao vivo e intencionalmente não possui parâmetro de consulta. O tamanho do anel em todo o daemon é controlado por `--event-ring-size` (padrão **8000**, conforme #3803 §02). Daemons antigos silenciosamente carecem do comportamento de aviso/consulta — pré-verifique esta tag antes de optar por participar.

`typed_event_schema` anuncia payloads de eventos do daemon que correspondem ao esquema `KnownDaemonEvent` do SDK. Daemons mais antigos ainda podem transmitir quadros compatíveis, mas clientes SDK devem pré-verificar esta tag antes de assumir cobertura de eventos tipados.

`client_heartbeat` anuncia `POST /session/:id/heartbeat`. Daemons mais antigos retornam `404`; pré-verifique esta tag antes de emitir batimentos cardíacos periódicos.

`session_close` e `session_metadata` anunciam `DELETE /session/:id` e `PATCH /session/:id/metadata`. Daemons mais antigos retornam `404`; pré-verifique estas tags antes de expor recursos de fechamento ou renomeação.

`session_organization` anuncia grupos de sessão personalizados e fixação. Ele adiciona `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization` e a visualização de lista organizada opt-in `GET /workspace/:id/sessions?view=organized`. Quando tanto `session_organization` quanto `workspace_qualified_rest_core` são anunciados, a mutação de organização qualificada pelo espaço de trabalho `PATCH /workspaces/:workspace/session/:id/organization` também está disponível. A mutação legada permanece exclusiva para a primária do espaço de trabalho. Daemons mais antigos retornam `404` para as rotas de mutação/grupo e ignoram o contrato de visualização organizada, então clientes WebShell/SDK devem pré-verificar estas tags antes de mostrar a interface de agrupamento ou fixação correspondente.

`session_archive` anuncia a API de arquivamento de estado de diretório v1: `POST /sessions/archive`, `POST /sessions/unarchive` e `GET /workspace/:id/sessions?archiveState=active|archived`. Sessões arquivadas não podem ser carregadas ou retomadas até serem desarquivadas. `session_archive_idle_guard` anuncia a opção de arquivamento aditiva `requireIdle`: o runtime proprietário verifica se o trabalho ativo foi confirmado ocioso imediatamente antes de iniciar o fechamento e deixa a transcrição ativa no lugar caso contrário. `session_storage_conflict_repair` anuncia a opção de solicitação aditiva `resolveConflicts` e o bucket de resposta `resolvedConflicts` descrito abaixo.

`workspace_qualified_rest_core` anuncia rotas REST principais no plural sob `/workspaces/:workspace/...`. O seletor é resolvido primeiro como id exato do workspace e, em seguida, como cwd absoluto codificado em URL após a canonização. Daemons mais recentes de workspace único incluem o runtime primário em `workspaces[]` mesmo quando `multi_workspace_sessions` está ausente, permitindo que os clientes descubram o id exigido pelas rotas qualificadas por workspace; os clientes devem recorrer a `capabilities.workspaceCwd` para daemons antigos que omitem o array. As rotas de status de confiança e solicitação de confiança estão disponíveis para workspaces não confiáveis registrados; a leitura de status de hooks qualificada (`GET /workspaces/:workspace/hooks`) também é atendida para workspaces não confiáveis registrados porque relata a decisão pendente de confiança dos hooks do projeto, correspondendo à mutação de aprovação qualificada; as rotas de leitura de arquivos seguem a política existente de leitura do sistema de arquivos. Workspaces secundários não confiáveis registrados também expõem catálogos de sessões e grupos de sessões somente persistidos: essas leituras não se conectam a uma sessão, iniciam ACP ou mesclam estado ativo da ponte. Escrita de arquivos, mutações de catálogo e outras rotas principais no plural exigem um workspace confiável, a menos que uma capacidade separada documente uma política mais restrita: `workspace_persisted_transcript` (somente leitura), ou a mutação de concessão de confiança, que é aceita para um workspace não confiável registrado, independentemente de `workspace_trust_grant` ser anunciado — essa tag reporta apenas se o recarregamento dinâmico de confiança está configurado, para que uma decisão registrada possa alcançar o runtime em execução sem reiniciar o daemon; ela nunca reporta se a rota é atendida. Um primário não confiável continua recebendo `403 { code: "untrusted_workspace" }` das rotas de catálogo e transcrição no plural; as rotas singulares primárias legadas mantêm seu comportamento de compatibilidade existente. Esta tag cobre as superfícies principais de arquivos, status, configurações, permissões, confiança, ciclo de vida, controle MCP, alternância de ferramentas e habilidades, memória, CRUD de agentes de workspace e armazenamento de sessões. Ela não cobre autenticação, voz, extensões, transporte ACP/WebSocket, roteamento de worker de canal ou exportação de sessão qualificada por workspace; faça pré-verificação de `workspace_session_export` ou `workspace_archived_session_export` separadamente. A confiança do workspace não é uma ACL: um cliente que possui o token do daemon pode ler todas as superfícies de workspace registradas permitidas por esta política.

`workspace_qualified_voice` anuncia rotas de Voz selecionadas por um runtime de workspace confiável: `GET` e `POST /workspaces/:workspace/voice`, `POST /workspaces/:workspace/voice/transcribe` e `WS /workspaces/:workspace/voice/stream`. É anunciada apenas quando runtimes multi-workspace e o listener WebSocket compartilhado ACP/Voz estão ambos habilitados. O seletor segue as mesmas regras de id ou cwd absoluto codificado que outras rotas no plural. Para REST, um seletor desconhecido retorna `400 { code: "workspace_mismatch" }` e um seletor não confiável retorna `403 { code: "untrusted_workspace" }`; a rejeição do upgrade WebSocket expõe o status HTTP 400/403 correspondente sem um envelope JSON estruturado. Nenhum dos transportes recorre ao primário. Os legados `/workspace/voice`, `/workspace/voice/transcribe` e `/voice/stream` permanecem exclusivamente primários. Os clientes usam `workspace_qualified_voice` para todas as modalidades de Voz qualificadas e deixam o runtime selecionado reportar erros específicos da configuração. As tags legadas `workspace_voice`, `workspace_voice_transcription` e `voice_transcribe` descrevem apenas as rotas vinculadas ao primário e não devem ocultar uma configuração secundária qualificada.

`workspace_qualified_memory` anuncia as rotas de memória gerenciada qualificadas por workspace: `POST /workspaces/:workspace/memory/{remember,forget,dream}` enfileira tarefas e `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId` as lê de volta. É anunciada apenas quando HTTP ACP e runtimes multi-workspace estão ambos habilitados. O seletor segue as mesmas regras de id ou cwd absoluto codificado que outras rotas no plural. Cada workspace registrado obtém sua própria fila de tarefas; a fila qualificada do primário é a mesma instância da superfície singular `/workspace/memory`, portanto, uma tarefa enfileirada em uma é legível na outra. A resolução é estritamente por runtime selecionado, sem recurso ao primário: um seletor desconhecido retorna `400 { code: "workspace_mismatch" }`, um seletor não confiável retorna `403 { code: "untrusted_workspace" }` e um runtime inativo ou em drenagem retorna `503 { code: "workspace_runtime_unavailable" }`. As leituras nunca alocam uma fila, então consultar um workspace sem tarefas retorna `404 { code: "<kind>_task_not_found" }`. Os ids das tarefas são escopados à sua fila e não sobrevivem a uma reconfiguração do workspace ou substituição do runtime; um id obsoleto retorna `404`, não uma condição de perda de dados. Quando o HTTP ACP está desabilitado, a tag não é anunciada e uma solicitação qualificada não primária retorna um `501 { code: "workspace_memory_unavailable" }` não repetível, enquanto a rota qualificada primária continua funcionando através da fila localmente possuída.

`session_lsp` anuncia `GET /session/:id/lsp`, o instantâneo de status LSP estruturado somente leitura para clientes do daemon. Daemons antigos retornam `404`; faça pré-verificação desta tag antes de expor o status remoto do LSP.

`session_resources` anuncia `GET /session/:id/resources`, um par somente leitura de instantâneos sanitizados de Skill e MCP construídos a partir da Config da sessão ativa selecionada. A rota tem escopo de proprietário da sessão ativa: nunca recorre ao runtime primário e não infere os recursos da sessão a partir do status do workspace. Os objetos aninhados `skills` e `mcp` reutilizam os payloads de status de workspace correspondentes, mas omitem autenticação MCP, pool, orçamento de workspace e enriquecimentos de erro de descoberta de workspace. Status, descoberta e contabilização reportados pelo gerenciador MCP da sessão selecionada permanecem presentes. Daemons antigos retornam `404`; faça pré-verificação desta tag antes de mostrar um catálogo de recursos de sessão.

`session_status` anuncia `GET /session/:id/status`, o resumo da ponte ativa para uma única sessão por id. Além de `clientCount` e `hasActivePrompt`, sessões ativas expõem `isWaitingForPermission`, `isWaitingForUserQuestion`, `pendingInteractionCount` e um `turnError` retido após uma rodada falha. O erro é limpo quando o próximo prompt realmente inicia. Uma sessão ativa que liquidou uma rodada em execução na ponte atual também carrega `updatedAt`, a mesma marca d'água de atividade documentada na rota de estado ativo; como esta rota retorna o resumo da ponte diretamente, o valor não é mesclado com o mtime da transcrição persistida e pode ser anterior ao que uma lista de sessões reporta. Tanto a resposta de status de sessão única quanto as listas de sessões de workspace incluem `turnError` e `pendingInteractions`: ações de permissão prontas para renderização ou perguntas `ask_user_question`, além das opções `requestId` e selecionáveis exigidas pelas rotas existentes de voto de permissão. Cada pergunta do usuário tem um `answerKey`; vote com `answers`, por exemplo `{ "0": "Polling" }`, chaveado por esse valor. Sessões somente persistidas omitem o estado de runtime porque nenhum runtime existe. Daemons antigos retornam `404`; faça pré-verificação desta tag antes de consultar o status de uma sessão única em vez de varrer a lista completa de sessões.

`session_info` anuncia `GET /workspace/:id/session-info` e seu gêmeo `/workspaces/:workspace/session-info`. A resposta agrega contagens de sessões ativas e arquivadas persistidas sem hidratar metadados da lista. É uma varredura de disco O(n) explícita e não deve ser consultada periodicamente; os clientes devem tratar `truncated: true` como um resultado de limite inferior.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_skill_settings_toggle`, `workspace_skill_settings_batch_toggle`, `extension_batch_activation_v2`, `workspace_init` e `workspace_mcp_restart` anunciam as rotas de controle de mutação documentadas abaixo. O controle do modo de aprovação mantém sua porta de compatibilidade não estrita. Os outros controles são protegidos por portas estritas baseadas na autoridade do operador: solicitações primárias via loopback confiável, autenticadas por bearer ou pareadas com Local Control passam. Uma solicitação primária sem token que atinge a porta estrita sem autoridade de loopback confiável retorna 401 `token_required`; credenciais configuradas ausentes ou inválidas e credenciais de Local Control não pareadas são rejeitadas anteriormente pelo middleware bearer com `401 Unauthorized` simples. Daemons que não possuem uma dessas rotas retornam `404`. As tags de Skill específicas de configurações são diferentes: daemons da geração de tags aposentadas anunciam `workspace_skill_toggle` e `workspace_skill_batch_toggle` e servem seu contrato validado por catálogo nos mesmos caminhos. A rota aposentada de alvo único pode retornar HTTP `404 skill_not_found` ou `409 skill_not_toggleable`; a rota aposentada em lote retorna HTTP 200 e coloca falhas derivadas do catálogo em `errors[]`. Faça pre-flight de cada tag antes de expor sua funcionalidade e não infira o contrato de Skill específico de configurações sondando a acessibilidade das rotas. Os caminhos das rotas e os corpos das requisições não mudaram.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) cobre a superfície do orçamento MCP: os campos `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` em `GET /workspace/mcp`, o campo `disabledReason` nas células por servidor e as flags CLI `--mcp-client-budget` / `--mcp-budget-mode`. Daemons mais antigos omitem completamente os novos campos; clientes SDK fazem pre-flight desta tag antes de depender da semântica de `budgets[]`. O descritor do registro também carrega `modes: ['warn', 'enforce']` para futura exposição de modos de recurso — por enquanto, os clientes inferem o modo a partir do campo `budgetMode` do snapshot. A recusa do servidor no modo `enforce` é determinística pela ordem de declaração `Object.entries(mcpServers)`; uma futura camada de precedência de escopo (se qwen-code adotar uma) deslocaria isso para "menor precedência primeiro" para espelhar a convenção `plugin < user < project < local` do claude-code.

> **O escopo é orientado por capacidade.** Com `mcp_workspace_pool`, sessões dentro de um runtime de workspace compartilham um pool de transporte e `WorkspaceMcpBudget`, e o snapshot emite `budgets[0].scope: 'workspace'`. Runtimes de workspaces diferentes possuem pools independentes. Sem a tag, cada sessão ACP usa seu `McpClientManager` legado, o snapshot emite `scope: 'session'` e N sessões podem consumir cada uma o limite configurado.

`workspace_file_read` cobre as rotas de arquivos de workspace texto/lista/estatística/glob (`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes` cobre `GET /file/bytes`, que foi adicionado posteriormente para que os clientes possam pré-verificar o suporte a janelas de bytes brutos contra daemons da era PR19. `workspace_file_write` cobre as rotas de mutação de texto cientes de hash (`POST /file/write`, `POST /file/edit`). A tag write significa que o contrato de rota existe; isso não significa que a implantação atual está aberta para mutação anônima. Write/edit são rotas de mutação estritas e exigem autoridade do operador; loopback confiável sem token se qualifica. `workspace_file_upload` cobre `POST /file/upload`, a rota de entrada binária: um corpo `application/octet-stream` limitado a `MAX_UPLOAD_BYTES` (50 MiB) é escrito no workspace sem nunca sobrescrever — um nome ocupado é numerado automaticamente (`name (1).ext`, `name (2).ext`, ...). Também é uma rota de mutação estrita.

`workspace_file_delete` cobre apenas `POST /workspaces/:workspace/file/delete`; não existe rota `/file/delete` primária legada. O corpo JSON é `{ "path": "relative/file.txt" }` e o sucesso retorna `{ "kind": "file_delete", "path": "relative/file.txt" }`. Esta rota de mutação estrita remove permanentemente um arquivo regular do workspace local confiável selecionado. Diretórios e symlinks são rejeitados; fábricas não suportadas (incluindo SSH) retornam 422. A capacidade descreve o suporte ao protocolo, não a permissão para excluir em todos os workspaces. Os clientes também devem fazer preflight de `workspace_qualified_rest_core`.

Quando `workspace_qualified_rest_core` é anunciado, a mesma superfície de arquivos também está disponível em `/workspaces/:workspace/file`, `/workspaces/:workspace/file/bytes`, `/workspaces/:workspace/stat`, `/workspaces/:workspace/list`, `/workspaces/:workspace/glob`, `/workspaces/:workspace/file/write`, `/workspaces/:workspace/file/edit`, `/workspaces/:workspace/file/upload` e `/workspaces/:workspace/file/delete` (a última rota adicionalmente requer `workspace_file_delete`).

`workspace_directory_create` e `workspace_directory_delete` anunciam independentemente `POST /workspaces/:workspace/directory/create` e `POST /workspaces/:workspace/directory/delete`. Faça preflight da tag da operação junto com `workspace_qualified_rest_core`; daemons qualificados mais antigos podem não ter essas rotas. Ambos são mutações estritas pertencentes ao runtime local ativo selecionado confiável, sem fallback primário ou contraparte primária legada. A criação é exclusiva sob um pai existente; a exclusão é permanente e recursiva.

A mesma tag também expõe CRUD de agentes de projeto qualificados por workspace em `/workspaces/:workspace/agents` e `/workspaces/:workspace/agents/:agentType`. Essas rotas plurais apenas leem ou alteram agentes de nível de projeto para o workspace selecionado; solicitações com escopo `global` e `user` retornam `400 { code: "global_scope_not_supported_for_workspace_route" }`. Rotas `/workspace/agents` sem workspace mantêm seu comportamento existente de workspace primário e permanecem como a única superfície REST para escopo de agente de nível de usuário.

`extension_management_v2` anuncia uma superfície de catálogo e mutação de extensões de nível de usuário em `/extensions/*`, além de projeções de ativação de workspace em `/workspaces/:workspace/extensions/*`. Artefatos são globais; rotas de workspace expõem apenas leituras de projeção, substituições exatas de ativação e atualização de runtime. Leituras podem mirar um workspace registrado não confiável, enquanto ativação, atualização e instalação com escopo de workspace requerem um alvo confiável. Mutações lentas usam operações locais do daemon em `/extensions/operations/:operationId`; a geração do armazenamento, não o histórico de operações, é autoritativa entre reinicializações e entre daemons. A capacidade `workspace_extensions` publicada e as rotas `/workspace/extensions/*` permanecem como um adaptador de compatibilidade de workspace primário. Os clientes devem fazer preflight de `extension_management_v2` e não devem inferi-la do modo do daemon ou `workspace_qualified_rest_core`.

`extension_git_credentials` anuncia instalações Git HTTPS autenticadas tanto em `POST /workspace/extensions/install` quanto em `POST /extensions/install`. Os clientes devem fazer preflight desta tag antes de enviar userinfo da URL ou `credentialPersistence`; daemons mais antigos rejeitam credenciais na URL. A tag descreve o suporte ao protocolo backend, não a disponibilidade de um keychain: o modo armazenado reporta o backend selecionado no resultado da operação terminal.

`extension_local_path_install` anuncia fontes de Extensão locais do daemon tanto em `POST /workspace/extensions/install` quanto em `POST /extensions/install`. O `source` deve ser um caminho absoluto que exista no host do daemon. Caminhos relativos permanecem não suportados para que o cwd do processo do daemon não possa alterar a identidade da fonte ou sombrear um atalho GitHub `owner/repo`. A operação de instalação existente copia a Extensão para o armazenamento gerenciado; ela não vincula a fonte. Os clientes devem fazer preflight desta tag porque daemons mais antigos rejeitam fontes locais.

`extension_batch_activation_v2` adiciona `PUT /extensions/activation` e `PUT /workspaces/:workspace/extensions/activation`. Ambos aceitam 1–100 nomes em `extensionNames`, deduplicam-nos sem distinção de maiúsculas/minúsculas preservando a ordem da primeira aparição, persistem os alvos alterados em uma geração e retornam um manipulador de operação `202`. Um alvo não precisa estar instalado ao definir `enabled` ou `disabled`: seu nome cria uma declaração de estado desejado que é preservada quando uma Extensão com esse nome é instalada. A rota global aceita `state: "enabled" | "disabled"` e escreve V2 `defaultActivation`; a rota do workspace também aceita `"inherit"` e aplica ou limpa substituições exatas para o runtime confiável selecionado. `inherit` não declara um nome desconhecido, e uma limpeza totalmente desconhecida reporta `updated: false`.

`extension_activation_explicit_refresh` significa que as operações de ativação singular e em lote terminam após o commit durável da política sem atualizar diretamente as sessões ativas. Os chamadores que precisam de aplicação imediata devem aguardar o sucesso da ativação e então enviar a `POST /workspace/extensions/refresh` síncrona do workspace primário, que retorna contagens de atualização diretamente, ou a `POST /workspaces/:workspace/extensions/refresh` assíncrona do workspace selecionado, que retorna um manipulador de operação separado. As duas formas não são intercambiáveis: a operação assíncrona registra a geração aplicada quando sua reconciliação completa do runtime termina, enquanto a rota síncrona não registra nada, fazendo com que o reconciliador de gerações ainda trate esse workspace como pendente e atualize suas sessões novamente na próxima passagem. Os chamadores que podem endereçar um workspace específico devem preferir a forma assíncrona. Uma falha de atualização não reverte nem rebaixa o resultado da ativação. Daemons sem esta capacidade já incluem a atualização do runtime na ativação, portanto clientes de compatibilidade não devem enviar uma segunda atualização. O reconciliador de gerações independente de 30 segundos permanece habilitado e normalmente aplica a política comprometida na próxima passagem; a reconciliação falhada é tentada novamente nas passagens subsequentes.

### Contrato de comunicação da Gestão de Extensões V2 [#extension-management-v2-wire-contract]

Todas as rotas usam as regras de autenticação bearer do daemon acima. `X-Qwen-Client-Id` é opcional para as rotas de mutação V2; quando fornecido, deve identificar um cliente registrado com um dos runtimes do workspace alvo da mutação. `:extensionId` é a identidade da extensão em hexadecimal minúsculo de 64 caracteres. `:workspace` resolve primeiro como um id exato do workspace e, caso contrário, como um cwd absoluto codificado em URL após canonicalização.

| Método e caminho | Sucesso |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /extensions` | catálogo global de artefatos `200` |
| `PUT /extensions/activation` | operação de ativação padrão global em lote `202` |
| `PUT /extensions/:extensionId/activation` | operação de ativação padrão global `202` |
| `POST /extensions/install` | operação de instalação `202` |
| `POST /extensions/check-updates` | operação de verificação de atualização `202` |
| `POST /extensions/:extensionId/update` | operação de atualização `202` |
| `DELETE /extensions/:extensionId` | operação de desinstalação `202`, ou `204` idempotente quando a extensão está ausente |
| `GET /extensions/operations/:operationId` | instantâneo da operação `200` |
| `GET /workspaces/:workspace/extensions` | projeção de ativação do workspace `200` |
| `GET /workspaces/:workspace/extensions/:extensionId/state` | estado do recurso do workspace (`extension_state`) `200` |
| `PUT /workspaces/:workspace/extensions/:extensionId/state` | operação de estado do recurso do workspace (`extension_state`) `202` |
| `PUT /workspaces/:workspace/extensions/activation` | operação de ativação exata do workspace em lote `202` |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation` | operação de ativação exata do workspace `202` |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation` | operação de limpeza de substituição `202` |
| `POST /workspaces/:workspace/extensions/refresh` | operação de atualização do runtime `202` |

#### Atualização explícita de Extensão

Tag de capacidade: `workspace_session_refresh` para a seleção opcional de sessão. Ambas `POST /workspace/extensions/refresh` (runtime primário) e `POST /workspaces/:workspace/extensions/refresh` (runtime selecionado) aceitam:

```json
{ "sessionIds": ["session-1", "session-2"] }
```

Omitir `sessionIds` preserva a atualização completa do runtime. Um array fornecido é deduplicado na ordem da solicitação, e `[]` não atualiza nenhuma sessão ou cache de bootstrap. IDs devem ser strings não vazias. Formas de solicitação inválidas retornam HTTP 400; IDs desconhecidos, incluindo sessões pertencentes a outro workspace, retornam HTTP 404 antes do início do trabalho. A propriedade da sessão é verificada apenas dentro do runtime resolvido, sem fallback para o runtime primário. As portas existentes de autenticação, mutação estrita, confiança no workspace e identidade do cliente se aplicam.

A rota primária ainda retorna HTTP 200 com `{ refreshed, failed }`; a rota qualificada ainda retorna HTTP 202 com um manipulador de operação. As contagens descrevem as sessões selecionadas. Uma atualização com `sessionIds` não avança a geração aplicada em todo o workspace, mesmo que a seleção cubra todas as sessões atuais. A reconciliação automática completa permanece inalterada e pode atualizar outras sessões posteriormente. A seleção não cria uma política de ativação escopada por sessão: caches de runtime compartilhados podem mudar, e eventos do workspace permanecem em todo o workspace.

Os clientes devem fazer preflight de `workspace_session_refresh` antes de fornecer o campo, incluindo um array vazio; daemons mais antigos podem ignorá-lo silenciosamente. Chamadas existentes sem o campo não precisam de nova verificação de capacidade.

#### Estado do recurso do workspace

Preflight de `extension_state` independentemente. Ele suporta apenas Skills; não implica gestão de recursos MCP. Ambas as rotas selecionam o runtime do workspace registrado e nunca fazem fallback para o primário. GET segue as regras existentes de confiança somente leitura; PUT requer um workspace confiável.

```json
{
  "skills": [
    { "name": "review", "state": "enabled" },
    { "name": "deploy", "state": "disabled" }
  ]
}
```

PUT aceita 1–100 entradas, incluindo um lote de elemento único. Ele rejeita entradas malformadas, nomes duplicados sem distinção de maiúsculas/minúsculas e grupos não suportados antes de enfileirar. Todos os nomes devem pertencer à Extensão alvo instalada, incluindo Skills atualmente desabilitadas; um alvo inválido falha a operação sem escritas parciais. Um commit de armazenamento bloqueado mescla as substituições listadas para o workspace canônico exato. Skills não listadas e outros workspaces são preservados. Não há escrita de configurações, declaração de nome futuro ou ativação implícita da Extensão pai.

GET retorna `v: 1`, `workspaceId`, `workspaceCwd`, `extensionId`, `name` e `skills`. Cada Skill tem `name`, `defaultEnabled`, `workspaceEnabled` anulável, `effectiveEnabled`, e opcionais `disabledReason`/`lockedScope`. O `skillStates` opcional do manifesto fornece padrões; valores ausentes padrão para habilitado. Para um pai ativo, a precedência é desativação rígida das configurações, ativação explícita das configurações, desativação padrão das configurações, substituição interna do workspace, padrão do manifesto. A desativação interna usa `disabledReason: "default"` e nunca trava as configurações. Um pai desabilitado ou removido não pode ser revivido por uma substituição de Skill.

A operação `set_extension_state` retorna `status: "updated"` com `result.resourceStates.skills` ordenados; `result.states` mantém seu significado de verificação de atualização. O estado persistido não é prova de que todas as sessões foram atualizadas. O daemon atualiza apenas Skills e seus contextos de comandos/modelo para o runtime alvo, incluindo bootstrap e sessões ativas, sem reiniciar MCP/LSP/hooks não relacionados. Falhas na atualização pós-commit geram avisos sem fazer rollback do estado. As substituições sobrevivem a reinicializações e atualizações de Extensões e são removidas na desinstalação. Os clientes não devem recorrer à API de configurações de Skill, que grava uma configuração de prioridade mais alta.

#### Catálogo global

A resposta do catálogo global é:

```json
{
  "v": 1,
  "generation": 12,
  "extensions": [
    {
      "id": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "installType": "npm",
      "defaultActivation": "enabled",
      "workspaceOverrideCount": 1
    }
  ]
}
```

`installType` é omitido quando não há metadados de instalação disponíveis. `defaultActivation` é `enabled` ou `disabled`. `workspaceOverrideCount` exclui entradas `inherit` armazenadas.

A resposta da projeção do workspace é:

```json
{
  "v": 1,
  "workspaceId": "workspace-id",
  "workspaceCwd": "/absolute/workspace",
  "trusted": true,
  "desiredGeneration": 12,
  "appliedGeneration": 11,
  "extensions": [
    {
      "extensionId": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "defaultActivation": "enabled",
      "workspaceActivation": "disabled",
      "effectiveActivation": "disabled",
      "activationSource": "workspace_override"
    }
  ]
}
```

`workspaceActivation` é `enabled`, `disabled` ou `null` para herança. `activationSource` é `default`, `workspace_override`, `legacy_path_rule` ou `cli_override`. `desiredGeneration` é a geração do armazenamento durável; `appliedGeneration` é a última geração registrada pelo controlador como aplicada àquele runtime do workspace e pode ficar temporariamente atrasada.

A instalação requer consentimento explícito e uma ativação inicial:

```json
{
  "source": "@scope/demo",
  "consent": true,
  "activation": { "scope": "user" },
  "ref": "optional-git-ref",
  "autoUpdate": true,
  "allowPreRelease": false,
  "registry": "https://registry.npmjs.org"
}
```

Para ativação inicial somente no workspace, use `{ "scope": "workspace", "workspaceId": "target-workspace-id" }`; o alvo deve existir e ser confiável. Instalações via daemon aceitam fontes GitHub, Git e npm. Quando `extension_local_path_install` é anunciado, eles também aceitam um caminho absoluto que existe no host do daemon. `ref` não se aplica ao npm, `ref` e `autoUpdate` não se aplicam a fontes locais, e `registry` se aplica apenas ao npm. `ref`, `autoUpdate`, `allowPreRelease` e `registry` são opcionais.

Quando `extension_git_credentials` é anunciado, uma fonte Git HTTPS pode incluir userinfo, por exemplo `https://username:token@git.example.com/org/repository.git`. `credentialPersistence` é válido apenas com tal fonte. É `stored` ou `one_time` e tem valor padrão `one_time` quando omitido. O modo armazenado salva a credencial através do armazenamento híbrido de segredos do daemon e mantém apenas a URL limpa do repositório nos metadados de instalação, para que a extensão permaneça atualizável. O modo único não salva nem a URL do repositório nem a credencial e cria um `snapshot` não atualizável; `autoUpdate: true` é rejeitado para este modo. Fornecer o campo sem credenciais de URL, fornecer credenciais inválidas ou usar credenciais com fontes npm, arquivo, local, SSH ou não-Git retorna `400`.

Respostas e operações de instalação com credenciais expõem `credentialPersistence` e podem expor `credentialStorage` como `keychain` ou `encrypted_file`. Operações únicas omitem `source`; operações armazenadas podem retornar a fonte limpa. Entradas de status/catálogo de instantâneo omitem a fonte, definem `credentialPersistence` como `one_time` e reportam `not updatable`. A atualização falha com `extension_not_updatable`; um segredo armazenado indisponível falha antes do acesso à rede com `extension_credential_unavailable`.

As solicitações de ativação global e de workspace `PUT` usam o mesmo corpo:

```json
{ "state": "enabled" }
```

`state` é `enabled` ou `disabled`. Solicitações de atualização, desinstalação, verificação de atualizações, limpeza de ativação e atualização não têm corpo obrigatório.

Solicitações de ativação em lote usam nomes de Extensão:

```json
{
  "extensionNames": ["formatter", "review-tools"],
  "state": "disabled"
}
```

O lote de workspace também aceita `"state": "inherit"`. Resultados globais terminais contêm `name` e `defaultActivation`; resultados de workspace contêm `name`, `workspaceActivation` (`null` para herança) e `effectiveActivation`. Nomes malformados rejeitam a solicitação; conflitos com identidades existentes do Store falham atomicamente sem commit parcial. Um alvo `inherit` desconhecido não é persistido, porque limpar uma substituição não deve fabricar uma declaração de ativação padrão nem substituir o consentimento de instalação posterior.

Cada mutação assíncrona aceita retorna:

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

Mutações qualificadas por workspace usam o mesmo caminho de polling global `/extensions/operations/:operationId`. O histórico de operações é local ao processo, mantém apenas um número limitado de entradas terminais e é perdido na reinicialização do daemon; os clientes devem reler o catálogo ou a projeção do workspace e comparar gerações quando um id de operação desaparece.

Um instantâneo de operação tem esta forma:

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "install",
  "status": "running",
  "phase": "preparing",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000100,
  "source": "owner/repository",
  "name": "demo"
}
```

`status` transita de `queued` para `running`, depois para `succeeded`, `succeeded_with_warnings` ou `failed`. Enquanto estiver em execução, `phase` é `preparing`, `committing` ou `reconciling`. O sucesso terminal pode incluir `result` com `status` igual a `installed`, `enabled`, `disabled`, `updated`, `uninstalled`, `checked` ou `refreshed`; resultados de reconciliação podem conter adicionalmente `refreshed`, `failed` e `error`, enquanto resultados de ativação em lote contêm `results` ordenados. Verificações de atualização retornam `result.states`, chaveado pelo nome da extensão, com valores como `checking for updates`, `update available`, `up to date`, `not updatable` ou `error`. Credenciais e cabeçalhos de autorização nunca são campos de operação.

Um commit durável seguido de limpeza incompleta ou reconciliação de runtime não é reportado como uma mutação falha. Ele retorna `succeeded_with_warnings` e preserva o resultado commitado:

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "uninstall",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "uninstalled",
    "name": "demo",
    "refreshed": 2,
    "failed": 0
  },
  "warnings": [
    {
      "workspaceId": "workspace-id",
      "workspaceCwd": "/absolute/workspace",
      "code": "reconcile_slow",
      "error": "Runtime reconciliation took 31000ms."
    }
  ]
}
```

Os avisos `workspaceId` e `code` são opcionais; `workspaceCwd` e `error` estão sempre presentes. Os clientes devem exibir os avisos, atualizar seu catálogo/projeção e não devem tentar novamente a mutação durável cegamente.

Falhas de validação e autorização são erros HTTP síncronos usando `{ "error": "...", "code": "..." }` quando existe um código estável. Casos importantes são `400 invalid_extension_id`, `400 invalid_extension_names`, `400 invalid_extension_name`, `400 invalid_extension_activation`, `400 workspace_mismatch`, `403 untrusted_workspace`, `404 extension_operation_not_found` e `429 extension_queue_full`. A validação de instalação também retorna `400` para opções de fonte/ref/registry inválidas, consentimento ausente ou ativação inicial ausente/inválida. Uma mutação que falha após `202` é representada, enquanto retida no histórico de operações, com `status: "failed"`, `error` e um `code` estável opcional; códigos comuns incluem `extension_prepare_timeout` e `extension_conflict`. HTTP `404` para uma operação não implica rollback porque o histórico de operações não é durável.

`daemon_status` anuncia `GET /daemon/status`, o instantâneo consolidado de diagnóstico somente leitura do operador documentado abaixo.

`daemon_update` anuncia a superfície global do processo `GET /daemon/update`, `POST /daemon/update/prepare` e `POST /daemon/update/restart`.

`scheduled_task_gate` anuncia o opcional `gate` em `POST` e `PATCH /scheduled-tasks`, e `gate` e `gateStatus` nas visualizações de tarefas. Um gate é um comando shell que a sessão proprietária executa a cada disparo, fora do modelo: saída 0 com output entrega o disparo com esse output anexado, saída 0 sem nada no stdout pula-o, e uma saída diferente de zero é reportada quando o gate começa a falhar, não a cada disparo. `gateStatus.lastOutcome` é `quiet`, `delivered`, `failed` ou `blocked`.

- Um gate precisa de uma tarefa recorrente: `POST` com `recurring: false`, ou um `PATCH` que define um gate em uma one-shot ou transforma uma tarefa gated em one-shot, responde 400 `gate_requires_recurring`; uma tarefa já nesse estado mantém suas outras edições. Um gate malformado (vazio em `POST`, apenas um comentário, mais de 2048 caracteres, um caractere NUL ou um surrogate UTF-16 não pareado, um wrapper shell como `bash -c '…'`, ou qualquer parte em segundo plano com `&`) responde 400 `invalid_gate`. A verificação `&` é léxica e best-effort; onde incerto, ele recusa (um `&` em um comentário, corpo de heredoc ou `(( … ))`), e um gate que passa por isso é reportado `failed` quando sai sem nada no stdout enquanto uma parte em segundo plano ainda mantém seu stdout (fora do sandbox shell bwrap, cujo namespace PID termina essa parte com o comando). Em `PATCH`, `gate: null` ou `gate: ""` limpa o gate e seu `condition`.
- Uma tarefa legada protegida por um `condition` recusa qualquer chave `gate` em um `PATCH` com 409 `task_legacy_unsupported`, então um cliente envia `gate` apenas quando o altera.
- Um gate escrito através dessas rotas não carrega confirmação da sessão. Ele roda sem supervisão apenas onde uma chamada `monitor` do mesmo comando rodaria sem perguntar: sob uma regra allow salva `Monitor(...)` ou `Bash(...)`, como um comando somente leitura, ou em uma sessão auto ou yolo. Uma regra deny bloqueia-o em todos os modos e o modo plan bloqueia-o; um disparo bloqueado liquida `blocked`.
- Os clientes não devem enviar `gate` a um daemon sem esta tag: tal daemon descarta-o em `POST` e responde a um `PATCH` somente-gate com 400 `empty_patch`.

`autofix_pr_watches` anuncia `GET /autofix-pr/watches` (o workspace primário) e `GET /workspaces/:workspace/autofix-pr/watches` (um registrado e confiável). Cada um responde às watches `/autofix-pr` do clone do workspace conforme `qwen autofix-pr status` as lista, lidas dos arquivos das watches sob o worktree principal do clone (`.qwen/tmp`), cada um aberto sem seguir links e sem bloqueio. Nenhum lock é tomado, GitHub não é consultado, e nenhum comando git roda exceto `git worktree list`, que encontra o clone. A resposta é `{ v: 1, available, root?, now?, watches, unreadable? }`: `available` é false, sem watches, quando nenhum repositório git é encontrado para o workspace (ou git não pode rodar lá), e `root` é o worktree principal do clone, o mesmo para dois workspaces de um clone. Uma watch carrega os campos de `status` (Seção 6.10 do design `/autofix-pr`) mas `thisSession`, `worktreePath`, `pushTarget`, `gitTrusted` e `worktreeWork`; sua `session` é a sessão que a possui, que pode não ser nenhuma sessão deste daemon. Parar uma watch é responsabilidade da skill (`/autofix-pr stop <n>` na sessão que a possui); essas rotas não alteram nada.

**Tags condicionais.** Essas tags de recurso são anunciadas apenas quando sua alternância de implantação, conexão em tempo de execução ou condição de disponibilidade está ativa. A presença da tag significa que o comportamento documentado está disponível; a ausência significa que um daemon mais antigo anterior à tag ou um daemon atual onde essa condição é falsa. Atualmente:

<!-- conditional-serve-features:start -->

| Tag | Anunciada quando … |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_collaboration_v1` | pelo menos um workspace registrado optou pela colaboração persistente de Agent de workspace via `experimental.agentCollaboration` (qualquer escopo, workspace incluído) ou `QWEN_CODE_ENABLE_AGENT_COLLABORATION=1`. Presente significa `/workspaces/:workspace/agent/*` e as rotas de transporte do Agent Host estão montadas; `workspaces[].agentCollaborationEnabled` identifica o estado de opt-in de cada workspace, e clientes devem mostrar ou chamar a superfície de colaboração apenas para entradas habilitadas. Daemons mais antigos omitem esse campo de workspace, então clientes podem recorrer a esta tag de nível superior para compatibilidade. Ausente significa que a colaboração não é servida nesta resposta — a tag é recalculada por solicitação, não instantânea na inicialização — então um cliente deve descartar o ponto de entrada em vez de renderizá-lo e deixar as chamadas retornarem 404. Habilitar pela primeira vez requer reinicialização; alternar para um workspace enquanto outro já tem ativado entra em vigor na próxima solicitação. Distinto da tag incondicional `workspace_agents`, que é CRUD de definição de subagente. |
| `session_message_deletion` | o perfil privado Hosted Harness não está ativo. Lista e exclui grupos de mensagens através das rotas de dono de sessão ao vivo; sessões locais comuns de daemon suportam exclusão física, enquanto armazenamento autoritativo Managed e workspaces SSH rejeitam. |
| `hosted_harness_private_v1` | o perfil privado Hosted Harness está ativo; apenas sua API de sessão autenticada está disponível. |
| `managed_session_journal_delta_v1` | o perfil privado Hosted Harness está ativo (mesma condição que `hosted_harness_private_v1`) e esta build pode abrir journals de Sessão Managed contendo registros `message.delta`. Um plano de controle exige a tag na negociação de capacidade, então um Harness revertido anterior a esses registros é recusado lá em vez de falhar toda abertura de Sessão (`managed_session_open_failed`). |
| `require_auth` | o daemon foi iniciado com `--require-auth` (ou `requireAuth: true` via API embutida). Token Bearer é obrigatório em todas as rotas normais de API, incluindo `/health` em binds de loopback; ingressos de webhook de canal mantêm autenticação independente por segredo compartilhado, e rotas de documento e ativos do Web Shell permanecem pré-autenticação. |
| `mcp_workspace_pool` | o pool de transporte MCP compartilhado está ativo. Omitido quando `QWEN_SERVE_NO_MCP_POOL=1` desativa o pool. |
| `mcp_pool_restart` | o pool de transporte MCP compartilhado está ativo; respostas de reinicialização podem incluir formas multi-entrada cientes do pool. |
| `external_tool_guard` | `qwen serve` completou o handshake de inicialização para `--external-tool-guard-mode=required`; todo canal ACP gerado deve reconhecer o callback instalado antes da criação de Sessão, e toda invocação gerenciada de ferramenta ACP de nível superior suportada que atinge o limite final de execução deve receber uma permissão externa pré-execução. Negativas anteriores de permissão/hook não fazem requisição ao provedor. Execução aninhada AgentCore está fora do v1 e é rejeitada enquanto este modo de provedor externo está ativo. A tag reflete apenas o provedor externo: independentemente dele, todo daemon aplica a proteção interna de realocação Git às ferramentas gerenciadas que carregam linha de comando de shell (`run_shell_command` e `monitor`), então a ausência desta tag não significa que não há negativas pré-execução. |
| `allow_origin` | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). O daemon foi iniciado com pelo menos um `--allow-origin <pattern>` (ou `allowOrigins: [...]` via API incorporada). Requisições cross-origin de origens correspondentes recebem cabeçalhos de resposta CORS adequados; origens não correspondentes ainda recebem o 403 padrão. A lista de padrões configurada intencionalmente NÃO é ecoada em `/capabilities` para evitar vazar o conjunto de origens confiáveis para leitores não autenticados — um cliente do navegador já conhece sua própria origem. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` está definido como um inteiro positivo. |
| `writer_idle_timeout` | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` está definido como um inteiro positivo. |
| `workspace_settings` | o daemon foi criado com persistência de configurações disponível. |
| `user_language_sync` | o daemon foi criado com persistência de configurações disponível (mesma condição que `workspace_settings`), então a rota `POST /language` sem sessão é registrada. |
| `workspace_voice` | a persistência de configurações está disponível, então as rotas legadas de configurações de Voz do workspace primário estão ativas. |
| `workspace_voice_transcription` | o workspace primário tem um modelo de transcrição de Voz configurado. |
| `session_shell_command` | A execução de shell da sessão está explicitamente habilitada e efetiva sob autenticação bearer ou autoridade de loopback confiável; chamadas ainda exigem um id de cliente vinculado à sessão. |
| `standalone_sessions_v1` | o daemon instalou o runtime completo de sessões independentes, coordenador de ciclo de vida, diário de exclusão durável, implementação de diretório gerenciado e família de rotas `/standalone/sessions`. Incorporações diretas sem o grafo de dependências completo omitem tanto as rotas quanto esta tag. |
| `standalone_session_options_v1` | o runtime completo de sessões independentes está instalado (mesma condição que `standalone_sessions_v1`), então a rota somente leitura `GET /standalone/session-options` sem sessão é registrada no runtime interno Conversations. |
| `session_artifacts_persistence` | a persistência de artefatos de sessão está conectada ao runtime. |
| `session_artifact_library` | A persistência de artefatos de sessão está conectada; suporta leituras/remoções por proprietários de workspaces confiáveis de registros ativos, frios e arquivados via `/workspaces/:workspace/session/:id/artifact-library`. |
| `workspace_artifact_library` | Consultas de artefatos em todo o workspace persistidas, consultas de lote de sessões e remoção explícita de pares via `/workspaces/:workspace/artifact-library`. |
| `workspace_artifact_library_stream` | Metadados de sessão em todas as leituras da biblioteca de artefatos e SSE finito opt-in para consultas completas e de sessões selecionadas; requer persistência de artefatos. |
| `session_sources` | a persistência de fontes de sessão está conectada ao runtime. Registra arquivos de workspace apenas de metadados, anexos enviados e links HTTP(S) através do proprietário da sessão ativa. |
| `session_generation` | auxiliares de geração de sessão estão disponíveis. |
| `session_btw_stream` | Cada ponte de runtime registrada suporta streaming BTW retomável. Clientes devem verificar este sinalizador antes de chamar `/session/:id/btw/stream`; caso contrário, use a interface JSON BTW existente. |
| `scheduled_task_session_reuse` | o gerenciamento durável de sessões de tarefas agendadas está ativo e cada runtime de daemon gerenciado instalou o callback que permite que uma tarefa se vincule explicitamente à sua sessão existente atual. |
| `workspace_generation` | auxiliares de geração escopados por workspace estão disponíveis. |
| `rate_limit` | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` está habilitado. |
| `workspace_reload` | suporte a recarregamento de workspace está disponível na configuração de rotas incorporadas. |
| `workspace_trust_grant` | Recarregamento quente de confiança está conectado (mesma condição que `workspace_trust_hot_reload`). Ambas as rotas de concessão confiam apenas na pasta vinculada, retendo uma regra `TRUST_FOLDER` ou `TRUST_PARENT` existente. Após a persistência, `200` retorna status v1 apenas se a política do host e o status reportado forem confiáveis; caso contrário, `409 { error, code: "trust_grant_ineffective" }` nomeia o estado/fonte verificado em `error`, incluindo recusa de carregamento de política ou IDE/arquivo. Falhas de persistência de arquivo de confiança retornam `500 trusted_folders_invalid` para `FatalConfigError`, caso contrário `500 internal_error`. Leituras de arquivo de confiança aceitam comentários e vírgulas finais do escritor JSONC. As rotas são servidas sem recarregamento quente também: a concessão da própria API do daemon atualiza imediatamente o status v1 em cache, mas portões vinculados à inicialização exigem reinicialização (`requiresDaemonRestartForChanges: true`). Edições externas de terminal/arquivo exigem uma reinicialização do daemon para atualizar esse status em cache. |
| `workspace_trust_hot_reload` | monitoramento de política de confiança do workspace e reconciliação de geração de runtime estão conectados, então mudanças de confiança têm efeito sem reiniciar o daemon e o status de confiança v2 reporta convergência. |
| `channel_reload` | um gerenciador de trabalhadores de canal gerenciado pelo daemon está habilitado e pode recarregar sua seleção atual. |
| `channel_control` | controle de runtime de trabalhador de canal gerenciado pelo daemon está conectado. |
| `channel_management` | Configurações de Canal escopadas por workspace, ciclo de vida e gerenciamento de pareamento estão conectados. |
| `channel_delete_config_loss_convergence` | Gerenciamento de Canal do workspace está conectado (mesma condição que `channel_management`). `DELETE /workspaces/:workspace/channels/:name` converge um Canal cuja configuração desapareceu da visualização de configurações mesclada que o Worker resolve (escopos sistema + usuário + workspace): o runtime deve estar silencioso sobre o Canal ou confirmar exatamente um proprietário Worker comprometido naquele workspace, que é parado antes que a seleção de inicialização persistida mantida naquele escopo seja removida, em vez de reportar `channel_instance_not_found`. Um Canal cuja configuração a visualização mesclada ainda contém, mas o escopo de configurações de canal resolvido do workspace não possui — um configurado apenas no escopo de usuário ou sistema enquanto o workspace é um diretório de projeto — reporta `channel_instance_not_found` com o runtime intocado; um Canal que o escopo resolvido configura é excluído normalmente, e um workspace cujo diretório é o diretório home do usuário resolve aquele escopo para o arquivo compartilhado de usuário, então um Canal de escopo de usuário é configurado — e excluído — lá. |
| `multi_workspace_sessions` | mais de um runtime de workspace está registrado, então a criação de sessão pode selecionar um runtime confiável por cwd. |
| `multi_workspace_session_rewind` | mais de um runtime de workspace está registrado; rotas singulares de retrocesso de sessões ativas resolvem o runtime proprietário. |
| `multi_workspace_session_shell` | Mais de um runtime de workspace está registrado e a execução de shell da sessão está explicitamente habilitada sob autenticação bearer ou autoridade de loopback confiável; REST singular de shell resolve o runtime proprietário. |
| `dynamic_workspace_registration` | uma fábrica de runtime de workspace está conectada ao daemon, então um diretório confiável existente pode ser registrado como um runtime secundário em tempo de execução. |
| `persistent_workspace_registration` | uma loja de registro de workspace está conectada ao daemon. `runQwenServe` de produção fornece automaticamente a loja de nível de usuário; incorporações `createServeApp` diretas devem injetar uma explicitamente e possuir a restauração de inicialização de seu registro de workspaces. |
| `scratch_workspace_registration` | a criação gerenciada de espaço de trabalho temporário está disponível — uma fábrica de tempo de execução, uma raiz de scratch gerenciada validada e a descarte do tempo de execução estão conectados, e todos os tempos de execução gerenciados respeitam o limite da raiz de scratch. |
| `git_workspace_clone` | o host do daemon possui um binário `git`; `POST /workspaces` com `{ kind: "git", url, target }` inicia um job de clonagem assíncrono cujas rotas reportam progresso, cancelamento e o cwd canônico. Hosts sem `git` omitem a tag. |
| `workspace_runtime_removal` | tempos de execução secundários dinâmicos removíveis ou restaurados pela persistência podem ser drenados e removidos através da rota de gerenciamento. |
| `workspace_directories` | o daemon persiste configurações do workspace e cada runtime local confiável pode aplicar diretórios extras às suas sessões ativas: `/workspaces/:workspace/directories` lista, adiciona e remove as entradas persistidas no escopo do workspace (`context.includeDirectories`). Workspaces SSH, gerenciados e standalone são rejeitados mesmo quando a tag está presente, e daemons pareados experimentais omitem a tag e a rota porque uma mutação no escopo do workspace não pode alcançar o filho gerenciado. |
| `native_directory_picker` | o host do daemon pode abrir um seletor de diretório nativo do SO (`osascript` no macOS, PowerShell no Windows, `zenity` em um host Linux com display). Hosts headless omitem a tag para que os clientes ocultem o seletor nativo do daemon em vez de apresentar uma falha garantida. O Web Shell oculta Navegar quando nenhum seletor está disponível; um [seletor de diretório do host de incorporação](../design/web-shell-host-directory-picker.md#public-api-and-precedence) pode fornecê-lo sem esta tag. |
| `workspace_runtime_stop` | o daemon é responsável pela contabilidade de processos ACP, observações completas de atividade independente e tarefas agendadas, e uma ponte de tempo de execução que suporta paradas confirmadas e instantâneos de recibo. Tempos de execução individuais não suportados são desabilitados na pré-visualização. |
| `workspace_runtime` | cada ponte de workspace ativa fornece um instantâneo autoritativo do ciclo de vida do tempo de execução; pontes injetadas mistas ou legadas omitem a tag. |
| `workspace_skills_config_runtime` | cada workspace ativo suporta o ciclo de vida autoritativo do tempo de execução e as rotas separadas de configuração/tempo de execução Skills usadas pelo gerenciamento de Skills e pelo compositor de nova sessão. |
| `skill_archive_install` | o ciclo de vida autoritativo do workspace, a instalação bruta de arquivos de Skill e recibos de tentativa com escopo de proprietário estão disponíveis. |
| `skill_zip_file_source` | o ciclo de vida autoritativo do workspace, a cópia local de ZIP pelo daemon e recibos de tentativa com escopo de proprietário estão disponíveis. |
| `workspace_local_open` | o host do daemon pode abrir um diretório de workspace no gerenciador de arquivos do SO do host (`open` no macOS, `explorer.exe` no Windows, `xdg-open` em um host Linux com display). Hosts headless omitem a tag para que os clientes ocultem a opção Abrir localmente em vez de apresentar uma falha de lançamento garantida. O caminho aberto é sempre o cwd registrado resolvido do workspace, via `POST /workspaces/:workspace/open`; a rota aceita um corpo JSON opcional `{ "target": "terminal" }` (ausente/outro = pasta) e responde `{ kind: 'workspace-local-open', opened: true, target }` com `target` definido como `folder` ou `terminal`. |
| `workspace_local_terminal` | o host do daemon pode abrir uma janela de terminal em um diretório de workspace (`open -a Terminal` no macOS, `wt.exe` com alternativa `cmd.exe` no Windows, `gnome-terminal`/`konsole`/`xterm` em um host Linux com display). Hosts headless omitem a tag para que os clientes ocultem a opção Abrir no terminal em vez de apresentar uma falha de lançamento garantida. Servido por `POST /workspaces/:workspace/open` com corpo `{ "target": "terminal" }`. |
| `workspace_qualified_acp` | HTTP ACP e tempos de execução multi-workspace estão ativos, portanto o endpoint plural ACP pode selecionar um tempo de execução secundário. |
| `workspace_qualified_voice` | tempos de execução multi-workspace e o listener WebSocket compartilhado ACP/Voice estão ativos, portanto toda modalidade Voice qualificada por workspace é alcançável para um tempo de execução secundário. |
| `workspace_qualified_memory` | HTTP ACP e tempos de execução multi-workspace estão ativos, portanto rotas de memória gerenciada qualificadas por workspace podem selecionar uma lane de tarefa por workspace para operações lembrar, esquecer e sonhar. |
| `client_mcp_over_ws` | o daemon aceita servidores MCP hospedados pelo cliente sobre o WebSocket ACP. Isso é um opt-in explícito, não necessário para o caminho do túnel CDP. |
| `cdp_tunnel_over_ws` | o daemon expõe o túnel WebSocket reverso `/cdp`, seja por opt-in explícito ou porque uma origem de extensão Chrome é permitida. Isso significa apenas que o túnel existe; não significa que ferramentas MCP do Chrome DevTools estejam registradas. |
| `browser_automation_mcp` | HTTP ACP está habilitado, `cdp_tunnel_over_ws` está ativo, nenhum token bearer bloqueia `/cdp`, e `QWEN_CDP_MCP_COMMAND` nomeia um adaptador MCP stdio externo. O pacote principal da CLI não inclui um adaptador de automação de navegador; sem esta tag, o chat do painel lateral da extensão Chrome ainda pode funcionar, mas ferramentas de console/rede/captura de tela/clique não são registradas por padrão. |
| `voice_transcribe` | o endpoint WebSocket Voice está montado; um modelo Voice configurado ainda é necessário para uma transcrição bem-sucedida. |
| `realtime_voice` | o daemon WebShell do macOS tem Live Voice habilitado e o Host nativo optou com `QWEN_SERVE_LIVE_NATIVE_HOST=1` (desligado por padrão; veja abaixo). `/live/status` reporta prontidão, mas a capacidade é retirada até que o recurso seja habilitado. |
| `realtime_voice_web` | Live Voice está habilitado e a página do Web Shell pode ser ela mesma o endpoint de áudio sobre WS `/live/web`, em qualquer plataforma, e o endpoint padrão (o Host nativo é exclusivo para macOS e opt-in). A rota autentica como `/voice/stream` (subprotocolo bearer), requer um workspace primário confiável e fala o protocolo Live Host com um hello reduzido: permissão de microfone mais autoverificações de entrada/saída de áudio. Uma única locação de Host permanece: um Host nativo substitui um navegador (`4010`), um navegador nunca desloca um Host nativo (`4009`), e uma segunda aba assume apenas com `?takeover=1`. `/live/status` reporta `host.kind: "browser"`; a captura de tela precisa de uma tela compartilhada (abaixo), e uma mudança de atalho é armazenada para o próximo Host nativo em vez de registrada. |
| `web_terminal` | HTTP ACP está habilitado, portanto o endpoint autenticado do Web Terminal está disponível. |
| `user_skill_activation` | A persistência de configurações do usuário está disponível. `PUT /skills/activation` salva preferências de Usuário com nomes exatos e enfileira propagação assíncrona. |

<!-- conditional-serve-features:end -->

Live Voice usa o endpoint do Web Shell (`realtime_voice_web`, WS `/live/web`) em todas as plataformas por padrão. O Host nativo do macOS é opt-in: apenas um daemon macOS iniciado com `QWEN_SERVE_LIVE_NATIVE_HOST=1` anuncia `realtime_voice`, registra WS `/live/host` e instala o Host quando Live está habilitado. Sem isso, `/live/setup` reporta `nativeHost: false` com um erro `install` não repetível, e `POST /live/setup/install` e `POST /live/setup/launch` respondem `409 live_native_host_unavailable`.

Um Host de navegador responde `host.capture_visual` apenas enquanto o usuário compartilha uma tela com a página, o que a página reporta em seu hello como `selfChecks.screenShare`. Compartilhar é um ato separado e explícito — o modelo pergunta durante o turno, e `getDisplayMedia` requer um gesto do usuário — então a página mantém o stream e captura um quadro por requisição. Com nada compartilhado, ela responde `success: false` imediatamente em vez de deixar a requisição expirar.

Como uma página não pode escrever no sistema de arquivos do daemon, ela envia apenas o JPEG. O daemon ignora qualquer `screenshotPath` que um lease de navegador reporta e armazena a imagem em si, sob um nome que escolhe, no mesmo diretório privado de captura que um Host nativo escreve. Um Host nativo ainda persiste seu próprio PNG e passa o caminho, como antes.

`mcp_guardrails` **não** está nesta tabela condicional — é uma tag sempre ativa, anunciada sempre que o binário suporta os novos campos de orçamento `/workspace/mcp`, independentemente de o operador ter configurado um orçamento. Operadores que não definiram `--mcp-client-budget` ainda obtêm os novos campos (com `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) anuncia os eventos de push SSE tipados que revelam cruzamentos do estado do orçamento MCP sem um loop de consulta. Dois tipos de quadro chegam em `GET /session/:id/events`:

- `mcp_budget_warning` — dispara uma vez no cruzamento ascendente de 75% de `reservedSlots.size / clientBudget`. Rearma somente após a razão cair abaixo de 37,5% (`MCP_BUDGET_REARM_FRACTION`). Espelha a histerese `slow_client_warning` do PR 10, mas no nível do gerenciador, em vez do nível de backlog por assinante. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Dispara nos modos `warn` e `enforce`; nunca no modo `off`.
- `mcp_child_refused_batch` — dispara ao final de cada passagem `discoverAllMcpTools*` quando um ou mais servidores foram recusados, E como um lote de comprimento 1 no caminho de recusa de spawn preguiçoso `readResource`. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` é o literal `'enforce'` porque o modo `warn` nunca recusa.

Ambos os eventos residem no anel de replay SSE por sessão (eles carregam um `id`), para que um cliente que se reconecta com `Last-Event-ID` retome através deles; o instantâneo em `GET /workspace/mcp` ainda é a fonte da verdade para o estado após desconexão prolongada. Sempre ativo uma vez anunciado — não há alternância condicional. O estado do redutor SDK (`DaemonSessionViewState`) expõe `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` para adaptadores que desejam UI simples estilo lag.

## Rotas

Clientes podem detectar recursos `session_turn_status` e consultar `GET /session/:id/turns/current` ou `GET /session/:id/turns/:promptId`. Essas rotas exigem a Sessão proprietária ativa e nunca carregam ou escaneiam outro workspace. Resultados liquidados são registros de transcrição best-effort lidos do ramo ativo com uma varredura limitada; `prompt_not_found` significa que nenhum resultado foi encontrado na fila ativa, sobreposição terminal de 64 entradas ou janela ativa limitada. `resultText` é a resposta bruta final do modelo pai após o último limite de ferramenta, antes da reescrita opcional de mensagens, e pode estar ausente. Resultados com mais de 32.768 unidades de código UTF-16 incluem `resultTruncated: true` e `resultCode: "RESULT_TEXT_TRUNCATED"`.

### `GET /health`

Sonda de vivacidade. A forma padrão retorna `200 {"status":"ok"}` se o listener estiver ativo — barato, sem acesso à ponte, adequado para sondas de vivacidade k8s/Compose de alta frequência.

Passe `?deep=1` (também aceita `?deep=true` ou `?deep` puro) para uma sonda ampla do daemon que agrega **contadores** da ponte através de todos os runtimes de workspace gerenciados, incluindo um workspace que ainda está drenando (informativo apenas, não uma verdadeira verificação de vivacidade):

```json
{
  "status": "ok",
  "workspaceCount": 2,
  "sessions": 3,
  "pendingPermissions": 1,
  "activePrompts": 1,
  "activeWork": true,
  "activeWorkReporting": "full",
  "activeWorkStaleMs": 4200,
  "connectedClients": 2,
  "channelAlive": true,
  "lastActivityAt": "2026-07-15T08:30:00.000Z",
  "idleSinceMs": 120000
}
```

`sessions`, `pendingPermissions` e `activePrompts` são somas. `activeWork` é verdadeiro quando qualquer runtime tem um prompt aceito, mas não liquidado (incluindo um prompt aguardando FIFO), um Agent em segundo plano em execução, uma notificação de terminal de Agent enfileirada/em andamento, trabalho de shell ou fluxo de trabalho em segundo plano gerenciado pela Sessão, ou um turno de Sessão pertencente a um filho. A retenção agregada `session` cobre processamento de objetivo e cron, mutação de histórico e continuações Monitor enfileiradas ou em execução; prompts em primeiro plano permanecem pertencentes ao daemon. Monitores em execução, sugestões de acompanhamento e processos externos que o registro de shell não consegue mais rastrear permanecem fora do campo. É escopado por sessão: trabalho de nível de canal sem sessão anexada ainda — um spawn em voo, uma restauração pendente, descoberta ou autenticação MCP — não é contado, então `activeWork` pode ler falso enquanto o daemon ainda se recusa a recuperar esse canal. Não leia este campo como "o daemon é recuperável"; ele descreve apenas trabalho pertencente à sessão. `activeWorkReporting` diz quanto dessa booleana é realmente garantida: `full` quando toda sessão viva é coberta por um relatório fresco de um filho que reporta todas as categorias necessárias, `none` quando nenhuma sessão negociou relatórios, e `partial` para qualquer coisa entre — incluindo um instantâneo obsoleto ou um filho negociado que omite uma categoria necessária. Um instantâneo mais antigo que três intervalos de relatório para de contar como cobertura: não é um relatório de que a sessão está ociosa, então a sessão volta a ser lida como retida, exatamente como se o filho nunca tivesse reportado. A limpeza automática ordinária também é desativada para um filho negociado, mas incompleto; um filho que não entende `shell` ou `session` não pode autorizar com segurança o fechamento condicional de acordo com o predicado completo atual. Filhos históricos completamente não suportados mantêm o comportamento legado de limpeza, e fechar explicitamente, matar, desligar e sair do canal permanecem operações forçadas. `activeWorkStaleMs` é a idade do instantâneo mais antigo no qual a booleana repousa **entre as sessões cobertas**, e é `0` quando nenhuma sessão é coberta; é diagnóstico, porque a frescura já é graduada em `activeWorkReporting` pelo daemon (apenas o daemon conhece a cadência negociada de cada canal). A nota é calculada uma vez sobre todo runtime gerenciado, em vez de por runtime e depois combinada — um runtime sem sessões é vacuosamente completo, e tratar isso como evidência permitiria que um workspace vazio garantisse sessões não reportadas de outro workspace. `lastActivityAt` é o horário mais recente de atividade do workspace não nulo e `idleSinceMs` é derivado desse mesmo instantâneo. `channelAlive` significa que pelo menos um canal de workspace gerenciado está vivo; não significa que todo workspace esteja saudável. `connectedClients` e o opcional `rateLimitHits` permanecem contadores amplos do daemon, em vez de somas por workspace.

Controladores de reinicialização devem tratar o daemon como ocupado quando:

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

Descartar o terceiro termo torna `activeWork === false` indistinguível de "nenhum filho me disse nada", que é o único caso onde agir sobre isso é inseguro. Respostas desconhecidas e sondas falhas também devem impedir a reinicialização. `activePrompts` permanece um sinal de compatibilidade independente.

Esses campos são um cache de observação, não um lease de reinicialização: mesmo uma resposta fresca, totalmente graduada e vazia descreve o momento em que foi amostrada, e o trabalho pode começar imediatamente depois. A regra acima reduz substancialmente o risco de uma reinicialização errada, mas não o elimina — a segurança estrita precisa de uma cerca de preparação para reinicialização que pare a admissão de novo trabalho, confirme a drenagem e só então desligue.

> ⚠️ A sonda profunda é **informativa**, não uma verificação real de vivacidade ou um lease atômico de recuperação. Os filhos ACP negociados publicam instantâneos de trabalho ativo do canal inteiro em uma cadência negociada, e o daemon classifica sua atualização em `activeWorkReporting` — mas nunca mata um canal por falta de relatório, porque o silêncio de uma sessão não é evidência de que o processo morreu. A vivacidade do transporte e a detecção de Agentes paralisados são mecanismos separados. `connectedClients` conta conexões REST SSE, não todos os transportes ACP. Use amostras repetidas e desligamento gracioso para reclamation ociosa; use `/daemon/status` autenticado para diagnósticos de transporte e por workspace. Se qualquer getter de runtime gerenciado lançar exceção, a saúde profunda falha fechando com `503 {"status":"degraded","reason":"aggregation_failed"}` em vez de retornar totais parciais, e o log do daemon identifica o runtime do workspace com falha. Durante o bootstrap, antes que o registro de runtime esteja pronto, ele retorna `503 {"status":"degraded","reason":"bootstrap"}` com `Retry-After: 1`. Para vivacidade do listener, use o padrão `/health` sem `?deep`.

**Autenticação:** obrigatória em binds não-loopback e quando o loopback está endurecido com `--require-auth`. Em um bind loopback comum (`127.0.0.0/8`, `localhost`, `::1`, `[::1]`), `/health` é registrado antes do middleware bearer para que sondas k8s/Compose dentro do pod não precisem carregar o token. Em não-loopback (`--hostname 0.0.0.0` etc.) ou loopback endurecido, a rota é registrada após o middleware bearer e retorna 401 sem um token válido — caso contrário, um chamador não autenticado poderia sondar endereços arbitrários para confirmar que um `qwen serve` existe, um vazamento de informação de baixa severidade que se combina mal com varredura de portas. CORS deny + allowlist de Host ainda se aplicam na isenção de loopback comum.

### `GET /daemon/update`, `POST /daemon/update/prepare`, and `POST /daemon/update/restart`

Essas rotas autenticadas gerenciam a instalação do Qwen Code no daemon, independentemente do workspace selecionado. Elas sempre usam REST, incluindo de clientes SDK com transporte de sessão ACP. A capacidade `daemon_update` anuncia o protocolo; a disponibilidade é determinada pelo estado retornado.

GET verifica releases sem baixá-los ou ativá-los. Verificações bem-sucedidas são armazenadas em cache por 15 minutos e erros por um minuto; `?refresh=true` solicita uma nova verificação. Verificações concorrentes compartilham uma única consulta. A resposta contém `state` (`available`, `up-to-date`, `installing`, `ready`, `restarting`, `unavailable` ou `error`), `canInstall`, opcionais `currentVersion` e `latestVersion`, e opcionais `instructions` e `message`. `currentVersion` identifica o daemon em execução, inclusive após a preparação de uma atualização. Métodos de instalação não suportados podem reportar `available` com `canInstall: false` e instruções manuais.

Atualizações automáticas exigem um ciclo de vida real da CLI com POSIX `process.execve`, uma instalação standalone ou uma instalação global npm/pnpm/yarn/bun executando o launcher publicado (um prefixo npm pertencente ao root está incluído, pois o staging nunca escreve no prefixo global) e configurações do operador que permitam `general.enableAutoUpdate`. Servidores embutidos, Windows, runtimes Node não suportados e modo de desenvolvimento reportam `unavailable`. Apenas configurações globais/do sistema se aplicam; configurações do workspace não podem habilitar a instalação. A conexão deve usar o listener primário e seu token de runtime do daemon, ou a implantação loopback explicitamente confiável sem token. Navegadores pareados e conexões Local Control reportam `unavailable`, porque suas credenciais ou listener não sobreviveriam à reinicialização; suas mutações de atualização retornam `403 update_connection_unsupported`.

Ambas as rotas POST exigem a autoridade do operador do daemon do gate de mutação estrito e não aceitam parâmetros. O servidor escolhe o release, o destino e o launcher; os clientes não podem fornecer uma versão ou comando.

- `POST /daemon/update/prepare` inicia um download em segundo plano e retorna `202` com `state: "installing"`. Isso não altera a instalação ativa. Faça polling GET até que o estado seja `ready`; preparações repetidas compartilham a mesma operação e uma atualização preparada retorna `200`. Se nenhuma atualização automática estiver disponível, retorna `409 update_unavailable`.
- `POST /daemon/update/restart` exige uma atualização preparada, caso contrário retorna `409 update_not_ready`. Ele responde com `202` e `state: "restarting"` antes de ativar a atualização, fechar graciosamente o daemon e substituir o processo pelo launcher atualizado. Cliques repetidos compartilham uma única reinicialização. Após responder, o daemon resolve novamente a release atual uma vez: se for mais recente que a preparada e o clique único cobri-la, a release mais recente é colocada em staging e o payload preparado é descartado, para que um daemon de longa duração termine na última versão atual em vez daquela que era a última quando foi preparada pela primeira vez. O payload mais recente é confirmado antes que o substituído seja descartado, e esse descarte é best-effort: um descarte falho vaza disco, mas nunca orfana o payload mais recente nem recorre a um que possa estar parcialmente removido. `latestVersion` então reporta o alvo mais recente enquanto `state` permanece `restarting`. Uma resolução ou staging falhos aplicam a release preparada em vez disso; o clique nunca fica preso na versão em execução devido a uma falha no registro. A substituição preserva PID, diretório de trabalho, opções da CLI, porta vinculada e token efetivo do daemon, limpa pins de versões antigas e não reabre um navegador. O cliente faz polling GET até que `currentVersion` mude, então recarrega o documento na URL capturada quando a atualização foi solicitada. Como o staging roda após o `202` e pode levar minutos, o cliente mede seu prazo de reinicialização a partir da indisponibilidade contínua, não do clique: um daemon que continua respondendo ainda está trabalhando. Um limite absoluto generoso (20 minutos) serve como backstop para um daemon que permanece acessível, mas nunca sai de `restarting`. Ele fica acima de toda a cadeia de staging, não acima de uma única constante de timeout: um download de arquivo standalone tenta OSS e depois GitHub sequencialmente com um orçamento de cinco minutos _cada_, e as buscas de checksum e assinatura adicionam mais dois minutos, então um restaging pode gastar cerca de doze minutos baixando e verificando antes da ativação; o filho npm gerenciado tem um limite de dez. Cada caminho de desistência mantém uma entrada passível de nova tentativa na tela, porque um daemon travado continua reportando `restarting`, que o controle não exibe de outra forma. Uma vez que a reinicialização é reconhecida, `restarting` fica fixo (sticky) até que o processo seja substituído, então um daemon acessível que reporta qualquer outro estado com um `currentVersion` inalterado significa que a substituição não terminou na nova build; o cliente para de esperar, publica esse estado consolidado e reporta uma falha em vez de esperar para sempre por uma mudança de versão. Essa verificação se aplica apenas a um poll _iniciado_ após o reconhecimento: as requisições de status e reinicialização são independentes, então um poll iniciado anteriormente pode entregar um snapshot pré-reinicialização depois, e ler isso como um daemon consolidado reportaria uma falsa falha e suprimiria o recarregamento que uma atualização bem-sucedida ainda deve ao usuário. A validação do launcher standalone roda antes de fechar os serviços; uma verificação falha deixa o daemon rodando. Falhas após o início do shutdown ou durante a substituição do processo não têm garantia de recuperação.

O Web Shell verifica e prepara automaticamente atualizações compatíveis disponíveis em segundo plano, exibindo o botão de atualização adjacente à versão quando uma atualização preparada está pronta ou quando uma atualização disponível contém instruções manuais. No estado de instruções manuais, o botão abre um popover com as instruções da verificação e nunca prepara ou reinicia. A preparação e a prontidão sobrevivem aos recarregamentos do tempo de execução do workspace. Uma atualização preparada fixa seu alvo: o GET de polling, incluindo `?refresh=true`, continua relatando `latestVersion` preparado e nunca baixa novamente, para que um daemon que permanece vivo entre várias versões não faça downloads desnecessários em segundo plano. Apenas a reinicialização resolve novamente o alvo. O encerramento normal do daemon descarta o download preparado. Falhas na ativação mantêm o daemon em execução e reportam `error`; a próxima verificação após o cache de erro de um minuto pode preparar um novo download para nova tentativa. Desabilitar atualizações automáticas remove a prontidão e limpa o download antes que uma reinicialização possa começar. Uma vez que a reinicialização está em andamento, ela é ininterrupta: enquanto o estado for `restarting`, as rotas de status, prepare e restart retornam todas sem consultar a configuração do operador, e a limpeza no encerramento é uma operação nula, para que uma reestagiação que leva minutos não tenha sua carga útil removida debaixo dos pés. Clicar no botão no estado pronto reinicia explicitamente todo o daemon e interrompe suas sessões ativas.

### `GET /daemon/status`

Diagnósticos somente leitura do operador. Diferente de `/health`, esta é uma API normal do daemon: é registrada após autenticação por bearer e limitação de taxa, inclusive em binds de loopback. Parâmetro de consulta:

- `detail=summary` (padrão) lê apenas o estado em memória do daemon.
- `detail=full` também inclui diagnósticos de sessão ao vivo, diagnósticos de conexão ACP, contagens de fluxo de dispositivo de autenticação e seções de status do workspace.
- qualquer outro `detail` retorna `400 { "code": "invalid_detail" }`.

`summary` intencionalmente não consulta métodos de status do workspace, inicia um filho ACP nem gera uma sessão. `full` consulta cada seção do workspace independentemente; um timeout ou exceção marca apenas essa seção como `unavailable` e adiciona um problema `workspace_status_unavailable`.

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
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxSessions": 32,
    "maxTotalSessions": 800,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "compactedReplayMaxBytes": 4194304,
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

Respostas multi-workspace também incluem linhas de nível superior `workspaces[]` com `{ id, cwd, displayName?, primary, trusted }`. O nome de exibição opcional é omitido quando não definido e permanece apenas para apresentação; consumidores de status devem continuar usando `id` ou `cwd` para correlacionar tempos de execução.

`runtime.perf` é opcional. Quando presente, reporta apenas o atraso do event loop do processo do daemon, amostras de espera da fila FIFO de prompts e contadores de bytes do pipe do filho do daemon; o atraso do event loop do filho ACP não está incluído em `/daemon/status`.

`status` é `error` se qualquer problema tiver severidade de erro, `warning` se qualquer problema tiver severidade de aviso, caso contrário `ok`. Os códigos de problemas são estáveis e incluem `session_capacity_high`, `connection_capacity_high`, `pending_permissions`, `acp_channel_down`, `preflight_error`, `mcp_budget_warning`, `mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited`, `channel_worker_partial_connect`, `channel_restore_failed` e `workspace_status_unavailable`. Durante a breve janela após o listener estar pronto mas antes que o tempo de execução completo seja montado, `/daemon/status` pode reportar `daemon_runtime_starting`; se a montagem assíncrona do tempo de execução falhar, ele reporta `daemon_runtime_failed` enquanto rotas de tempo de execução não-status retornam `503`.

`runtime.activity` relata a atividade de prompts em todo o daemon. `activePrompts` conta sessões com um prompt em andamento. `pendingPrompts` conta todos os prompts aceitos que ainda não foram resolvidos, incluindo o prompt em execução e os prompts aguardando na fila FIFO. `queuedPrompts` conta os prompts aguardando na fila FIFO que foram aceitos, mas não despachados. `lastActivityAt` é o timestamp ISO 8601 do último início/fim de prompt ou spawn de sessão; `null` quando o daemon nunca processou nenhuma atividade desde a inicialização. `idleSinceMs` é calculado a partir de `lastActivityAt` no momento da geração da resposta.

`limits.memory` é aditivo e relata as figuras de memória resolvidas do daemon: um `enforced: false` obrigatório, um objeto `childHeap` (`mode`: `off`, `observe` ou `admit`; `admissionEnforced`, verdadeiro apenas para `admit` gerenciados; `maxConcurrentChildren` e `perChildCeilingMb`, ambos `null` sob `mode: 'off'`, que não modela nada — e `perChildCeilingMb` adicionalmente `null` onde nenhuma partição pode ser modelada dentro de `modeled.minChildHeapMb` — seja porque o pool não consegue cobrir um filho nesse piso, ou porque o teto cairia abaixo dele uma vez limitado a `modeled.legacyChildCeilingMb`, que é `floor(available / 2)` e, portanto, cai abaixo do piso em um host com menos de 1024 MB. Nunca é 0, e `maxConcurrentChildren` é `0` nesses casos, pois um host que não modela nenhuma partição é uma resposta calculada, não um modelo ausente; e `refusals`, os spawns que teriam excedido o limite modelado), `configuredBudgetMb`, `effectiveBudgetMb` (o valor configurado limitado à memória cgroup/host resolvida), `budgetSource` (`flag` / `derived`), `availableMemoryMb`, `availableMemorySource` (`constrained` / `host`), `insufficientMemory` e um objeto `modeled` contendo `rootReserveMb`, `childPoolMb`, `minChildHeapMb`, `maxChildHeapMb` e `legacyChildCeilingMb` (um modelo conservador do teto que um filho ACP recebe hoje, que pode ficar abaixo da figura real). `runtime.memory` additionally reports `registeredWorkspaces` (a contagem de registros — entradas de workspace não removidas, incluindo aquelas em draining, transicionando ou bloqueadas; não é uma contagem de filhos ativos), `activeAcpChildren` (filhos ACP gerenciados pelo daemon com um canal ativo e não morrendo — inclui entradas em transição ou bloqueadas, mas exclui um workspace cujo kill começou mesmo que o filho ainda não tenha saído; não são workers de canal, descendentes MCP ou reservas de spawn não anexadas), `childRssCoverage` (`active_children` — cada filho ACP com um canal ativo, que é o conjunto que `activeAcpChildren` conta; daemons mais antigos enviam `primary_only`), um objeto `children` descrito abaixo e um objeto `modeled` contendo `recommendedShareAtRegisteredMb` (`null` quando nenhum workspace está registrado) e `recommendedShareAtActiveMb` (`null` quando nenhum filho está ativo). Cada share é limitado ao teto legado do filho e definido no mínimo heap do filho apenas quando o teto permite — em um host pequeno, o teto fica abaixo do piso, então share × count pode exceder o pool de filhos. Leia um share como consultivo, não como uma partição do pool. O dimensionamento do heap do filho permanece consultivo: nenhum argumento de spawn de filho deriva desses valores. Opt-in `admit` aplica a contagem de filhos simultâneos modelada, enquanto o padrão `observe` apenas registra recusas potenciais. `runtime.memory.committedAcpChildren` conta reservas ACP gerenciadas e filhos anexados, incluindo filhos terminando até a liberação do registro; é `null` quando o registro gerenciado está indisponível. `childHeap` modela uma partição fixa de `modeled.childPoolMb` — cada filho receberia o mesmo `perChildCeilingMb`, então o total modelado permanece dentro do pool em vez de acumular como uma share por spawn faria. Leia `refusals` apenas como pressão de admissão: uma contagem de 0 **não** significa que a partição é segura para aplicar, porque os filhos executam no teto derivado do host muito maior, então uma carga de trabalho que precisa de mais espaço antigo do que `perChildCeilingMb` é saudável aqui e só falharia quando a partição fosse aplicada. Duas razões adicionais pelas quais uma contagem diferente de zero não precisa significar pressão de capacidade: a decisão de admissão conta um filho terminando até que ele saia, então em um daemon já em `maxConcurrentChildren` cada substituição de canal reserva uma recusa durante a janela de sobreposição; e em um host muito pequeno para modelar uma partição `maxConcurrentChildren` é `0`, então `refusals` é igual à contagem total de spawns ACP, com `insufficientMemory` sendo o campo que explica isso. Em `admit`, um modelo de slot zero falha na inicialização. Um daemon totalmente gerenciado enfrentando esgotamento de capacidade pode recuperar um ACP vazio menos recentemente usado sem sessões ativas ou trabalhos pendentes, esperar pela liberação rastreada e tentar novamente a admissão uma vez antes de fazer o spawn. Sessões carregadas permanecem protegidas; o registro do workspace e o histórico salvo são retidos. O contador `refusals` conta tentativas de admissão rejeitadas, incluindo uma rejeição inicial seguida de recuperação bem-sucedida, não falhas finais visíveis ao usuário. Capacidade esgotada retorna REST HTTP 503 com `code: "acp_child_capacity_exhausted"`, `maxConcurrentChildren` e `committedAcpChildren` (excluindo a reserva rejeitada), sem `Retry-After`. ACP JSON-RPC usa `-32603` com `data.errorKind` carregando esse código, `data.httpStatus: 503` e os mesmos contadores. Um rollback de criação standalone pré-despacho verificado retém `standalone_creation_rolled_back`, seu ID de sessão e retryability, e aninha o código de capacidade e contadores sob `capacity`; resultados de criação incertos mantêm suas semânticas de recuperação existentes. Os clientes devem parar as tentativas automáticas de capacidade e preservar o rascunho ou sessão selecionada para tentativa manual. No caminho normal `runQwenServe`, o orçamento é resolvido antes que o app bootstrap seja criado, então `limits.memory` já está preenchido durante a janela de bootstrap. É `null` apenas em caminhos que não resolvem nenhum orçamento (como direct-embed ignorando `runQwenServeImpl`). O tipo SDK permite `null`, então clientes corretos lidam com isso.

`runtime.memory.children` é aditivo dentro desse bloco e relata o RSS agregado entre os filhos que `childRssCoverage` nomeia: `rssBytes` (seu RSS auto-relatado somado), `sampled` (quantos produziram uma leitura) e `oldestReadingAgeMs` (a idade da leitura mais antiga na soma, para que um chamador possa dizer quão distantes suas partes foram tomadas). O denominador para `sampled` é o irmão `activeAcpChildren`, não repetido dentro do bloco; quando `sampled` é menor, `rssBytes` é um piso, não um total. A amostragem é condicionada a um watcher SSE/WS ativo, então uma solicitação de status contra um daemon do qual ninguém está transmitindo relata `sampled: 0` mesmo com filhos ativos — `activeAcpChildren` ao lado torna essa lacuna visível, e `rssBytes: 0` com `sampled: 0` nunca significa um zero medido. `oldestReadingAgeMs` é `null` quando nada foi amostrado e também quando cada contribuidor é uma bridge anterior ao campo, então nunca significa "fresco". Leia a soma como uma supercontagem e uma subcontagem ao mesmo tempo: somar o RSS por processo conta duas vezes as páginas que os filhos compartilham, enquanto cada filho reporta apenas seu próprio processo, então seus descendentes MCP e todos os workers de canal estão ausentes. Não é a memória da árvore do daemon. O campo é opcional no espelho SDK porque daemons reportando `primary_only` nunca o enviam.

`runtime.memory.children.heap` é aditivo dentro desse bloco e relata os picos históricos da geração antiga do V8 de cada filho ACP, agregados como um **máximo, não uma soma**: `peakOldGenerationBytes`, `peakLiveSetBytes`, `peakTotalHeapBytes`, `majorGcCount`, `majorGcMs`, `unclassifiedSpaceNames` e `reported`. Um limite superior de heap se aplica por filho e os picos foram atingidos em momentos diferentes, então um total não responderia a nenhuma pergunta; cada campo é um máximo independente entre os filhos que reportam, não um retrato de um único filho, e um limite superior por filho é julgado contra cada eixo individualmente. `reported` conta quantos de `sampled` contribuíram e é menor quando alguns filhos são anteriores aos campos. Cada figura de bytes cobre a **geração antiga** — o que `--max-old-space-size` realmente limita — e não apenas `old_space`, porque um filho pode esgotar seu limite superior com `old_space` em alguns megabytes enquanto `large_object_space` contém tudo. `peakOldGenerationBytes` são bytes comprometidos e aumenta com o limite superior dado ao filho, então leia-o como um limite superior do que a carga de trabalho precisa, em vez de seu requisito; `peakLiveSetBytes` é o que sobrevive a uma GC principal e não se move com o limite superior, o que faz dele a figura capaz de dizer que um filho não cabe em um; leia-o como um limite superior em vez de um conjunto vivo exato, porque as entradas de GC chegam de forma assíncrona e qualquer coisa alocada entre a coleta e a leitura é contada. `peakLiveSetBytes` é `0` até que uma GC principal seja observada, o que é uma ausência em vez de uma medição. `unclassifiedSpaceNames` é a união dos espaços de heap que nenhum filho que reporta poderia classificar; o V8 renomeia e adiciona espaços entre versões, um espaço desconhecido é descartado das somas e descartar subconta — então uma matriz não vazia significa que as figuras de bytes estão incompletas e não devem ser lidas como uma medição completa. O objeto inteiro é `null`, nunca um objeto zerado, quando nenhum filho amostrado reportou um; sem um watcher SSE/WS anexado, nada é amostrado, então esse é um estado rotineiro em vez de um caso extremo. Tudo isso é observacional: nada aqui dimensiona um filho, recusa um spawn ou move `limits.memory.enforced` de `false`.

`runtime.memory.pressure` é aditivo dentro desse bloco e relata a pressão de memória do próprio processo raiz do daemon: `mode` (`off` / `observe`), `level` (`normal` / `soft` / `hard` / `critical`), `source` (`rss` / `heap` / `unknown`), `ratio` e as seis figuras brutas das quais as proporções vêm — `rssBytes`, `rssRatio`, `availableBytes`, `heapUsedBytes`, `heapRatio`, `heapLimitBytes`. `ratio` é o maior entre `rssRatio` e `heapRatio`, e `source` nomeia qual deles foi; empates são reportados como `rss`. `availableBytes` é `limits.memory.availableMemoryMb` em bytes — deliberadamente a figura de cgroup/host detectada em vez de `effectiveBudgetMb`, porque o que termina o processo é o limite real, não um número de política do operador. `source: "unknown"` significa que nenhum denominador era mensurável e não deve ser lido como saudável; `level` é `normal` nesse caso apenas porque não há nada para classificar. As figuras cobrem **apenas o processo raiz do daemon**: elas são `memoryUsage()` deste processo, então o crescimento dos filhos não as altera. `runtime.memory.children` reporta esses separadamente, e nenhuma das figuras é memória da árvore de processos. Ambos os modos reportam o bloco inteiro; apenas `observe` eleva adicionalmente o aviso `daemon_memory_pressure` livre de caminho para o resumo de status, então `off` deixa `status` no nível superior inalterado. Nada remedia em nenhum dos modos. O campo é opcional no espelho do SDK porque daemons que lançaram `runtime.memory` antes de sua existência enviam o bloco sem ele.

`limits.maxRegisteredWorkspaces` é aditivo e reporta o limite resolvido de registro de usuários (padrão 256, configurável de 1 a 256). `limits.maxChannelControlWorkspaces` reporta o limite independente de proprietário de controle/recuperação de 25 no daemon padrão, mesmo quando os canais estão desabilitados. Controladores personalizados anunciam esse campo apenas quando o aplicam. Esses campos estão presentes nas respostas de bootstrap e ready; daemons mais antigos podem omiti-los. O controlador de canal rejeita uniões transitórias de proprietários acima de seu limite com `409 channel_control_workspace_limit_reached` antes de construir trabalhadores candidatos; uma união inicial na hora do boot acima do limite falha na inicialização antes que o listener seja publicado, então não tem superfície HTTP. A capacidade de registro não determina o tempo limite do canal do SDK.

`limits.maxTotalSessions` é aditivo. `null` significa que o limite efetivo de novas sessões em todo o daemon está desabilitado. Quando a capacidade de registro resolvida (padrão 256, configurável através de `QWEN_SERVE_MAX_WORKSPACES` ou `maxRegisteredWorkspaces` embutido) excede 25 e `--max-total-sessions` é omitido, o daemon padrão usa um total fixo de 800, mesmo com um workspace de inicialização. Em capacidades de registro de 25 ou menos, vários workspaces de inicialização/restaurados com um `maxSessionsPerWorkspace` finito derivam o total efetivo uma única vez como `maxSessionsPerWorkspace * workspaceCount` sobre essa mesma contagem de inicialização mais restaurados; um workspace de inicialização ou restaurado retém um padrão ilimitado. Limites totais explícitos, incluindo valores desabilitados, têm precedência. O registro dinâmico posterior não recalcula o total. Incorporações diretas de `createServeApp` devem fornecer sua própria política compartilhada de admissão. Quando definido, ele limita a criação de novas sessões em todo o daemon e reporta falhas de limite total com a forma de erro `session_limit_exceeded` existente mais `scope: "total"`.

`runtime.channel.live` reporta o canal bridge ACP dentro do daemon. Não é o worker do adaptador de canal. Canais gerenciados pelo daemon usam `runtime.channelWorker`, cujo `state` é um de `disabled`, `starting`, `running`, `exited`, `failed` ou `stopped`. Quando um worker atinge `running` e então sai, `/daemon/status` mantém o daemon online e reporta o código de problema de aviso `channel_worker_exited`.

A inicialização do worker de canal gerenciado pelo daemon a partir de um `qwen serve --channel ...` explícito permanece fail-fast e tem precedência sobre configurações de inicialização persistidas. Uma inicialização sem flags restaura `serve.channels` de todos os workspaces registrados confiáveis, cada um contribuindo com a lista em suas próprias configurações de escopo de workspace. Os nomes restaurados formam uma seleção cujos proprietários são resolvidos normalmente, com o workspace que listou um nome quebrando um empate de propriedade ambíguo. Essa atribuição de inicialização dura enquanto o daemon estiver rodando: um `PUT /workspace/channel` que reabilite tal nome resolve-o da mesma forma que a inicialização fez, mesmo após a seleção ter sido parada no meio. Um nome contribuído por um workspace não primário é descartado, com um log identificando-o, quando não puder ser resolvido, para que uma entrada obsoleta de um workspace não deixe os outros parados; um nome listado pelo workspace primário ainda faz a restauração falhar como um todo, quer outro workspace liste esse nome também ou não. `all` permanece exclusivo para o primário: é ignorado e reportado em qualquer outro lugar.

Um workspace não primário confiável registrado após a inicialização restaura seu próprio `serve.channels` também, carregando o tempo de execução do canal e reservando o lease do serviço de canal se nada mais o tiver feito. Essa restauração:

- acontece **uma vez por execução do daemon** — registrada assim que o workspace solicita qualquer coisa — para que uma remoção posterior e registro novamente, ou uma rematerialização de confiança, não desfaça a ação de um operador que parou um desses canais no meio;
- não acontece sob uma seleção `--channel` explícita, que nenhum workspace registrado posteriormente estende;
- não acontece depois que `DELETE /workspace/channel` parou de hospedar, até que um `PUT /workspace/channel` confirme uma seleção novamente ou o daemon reinicie;
- deixa uma seleção `all` confirmada como está;
- adiciona os nomes desse workspace à seleção confirmada em uma única alteração, restaurando um por vez. Diferente da inicialização (boot), que descarta um nome que não pode hospedar e mantém o restante, um nome que não pode ser atribuído deixa a lista inteira do workspace sem restauração, com o erro registrado no log e relatado conforme descrito abaixo.

O registro não espera pelo controle de canal. A restauração é enfileirada na lane de controle de canal e a resposta é escrita sem esperar por ela; o mesmo ocorre para a reconciliação desencadeada por uma alteração de registro ou confiança para canais que o daemon já hospeda. Portanto, um worker que nunca fica pronto atrasa apenas o trabalho de canal enfileirado atrás dele, nunca outro registro ou uma reconciliação de confiança. O lado negativo é que um `201` de `POST /workspaces` não significa que os canais desse workspace estão ativos, ou que um canal já hospedado que ele possui terminou de reiniciar; leia `GET /workspace/channel` para isso.

Sem uma seleção explícita, uma restauração `serve.channels` na inicialização (boot) ou um registro como o acima, o carregamento do runtime de canal permanece lazy.

Os nomes de inicialização armazenados devem ser não vazios, não ter espaços em branco no início ou fim e não conter caracteres de controle inseguros ou invisíveis. Entradas inválidas são ignoradas individualmente e registradas no log pelo índice do array; a inicialização não as corta para outros nomes de instância nem reescreve as configurações. Os argumentos do worker usam `--channel=<value>`, preservando um traço inicial como parte do nome.

Um campo de inicialização inválido ou um erro de validação ou de lease antes dos workers iniciarem pula a restauração automática, com um log identificando `serve.channels`, enquanto configurações não relacionadas permanecem em vigor. Uma falha na inicialização do worker permite que o daemon continue após a limpeza bem-sucedida. Timeouts globais de inicialização do runtime e paradas de worker não confirmadas seguem o caminho existente de falha de inicialização; o lease permanece retido enquanto a terminação do worker não for confirmada. O gerenciamento de canais relata configurações de inicialização persistidas e estado real do runtime.

Alguns nomes `serve.channels` que o daemon não trouxe para cima são relatados em vez de apenas registrados no log. Tal nome nunca se junta à seleção confirmada, então nenhum snapshot de worker o carrega. Três casos são relatados:

- uma seleção de inicialização configurada cujo worker falhou ao iniciar, no caminho de boot que mantém o daemon servindo sem seus canais;
- um nome descartado pelo resolvedor de propriedade do boot ao atribuí-lo a um workspace, relatado contra todos os workspaces que o listaram;
- todo nome ainda não hospedado após uma restauração de registro tardio falhar.

Eles aparecem em dois lugares:

- `/daemon/status` relata um aviso `channel_restore_failed` por workspace, nomeando cada canal com seu erro. Esta é a superfície completa e está presente também na resposta de bootstrap, que é a única que existe enquanto os registros de boot estão sendo escritos. No máximo 64 canais são nomeados por workspace, cada nome limitado a 128 caracteres, com `and <n> more` quando a lista é mais longa;
- o `GET /workspaces/:workspace/channels` desse workspace lista o canal com `runtime: { state: "error", lastError }` em vez de `stopped`, onde `lastError` é o próprio erro de inicialização do adaptador quando o worker reportou um para esse canal, caso contrário, o erro da tentativa. Esta superfície é construída a partir do escopo das configurações de canal do próprio workspace, portanto só pode carregar um nome que esse escopo define — um nome que nenhuma configuração de workspace registrada define, ou um cuja configuração reside em outro workspace, não tem linha aqui e é relatado apenas em `/daemon/status`.

Todo o resto que deixa um nome `serve.channels` sem hospedagem é diagnosticado apenas no log do daemon: um nome perdido porque a lista inteira era ilegível ou inválida, a lista de um workspace não primário descartada porque o primário selecionou `all`, uma restauração tardia pulada porque a seleção confirmada é `all`, e a lista de um workspace remoto (SSH). Inspecione os logs do daemon para esses casos.

Um relatório dura até que o canal seja hospedado — por este workspace ou por uma restauração posterior de outro — até que seu workspace não esteja mais registrado, ou até que um operador aja: start, stop ou restart `POST` no canal, `PUT`/`DELETE /workspace/channels/:name`, ou uma `PUT`/`DELETE /workspace/channel` que altere a seleção. `PUT /workspace/channels/:name/startup` não limpa isso: ele reescreve `serve.channels` sem dizer nada sobre a tentativa que falhou. O relatório é mantido na memória: um daemon reiniciado restaura novamente e relata o que essa tentativa fez. O texto do erro tem credenciais redigidas e é limitado da mesma forma que o log do daemon o renderiza.

Depois que um worker atingiu o estado pronto, saídas inesperadas são reiniciadas pelo supervisor de serve dentro de uma política limitada: até 3 tentativas de reinício em uma janela de 5 minutos, com backoff de 1s, 5s e depois 15s. O worker envia heartbeats IPC a cada 15s; se nenhum heartbeat for observado por 45s, o supervisor trata o worker como obsoleto (stale), mata-o, registra `staleHeartbeatAt` e usa o mesmo caminho de reinício.

`runtime.channelWorker` pode incluir campos operacionais aditivos: `requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`, `restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`, `lastHeartbeatAt`, `staleHeartbeatAt`, `startupFailures` e `startupFailuresTruncated`. Cada falha de inicialização possui `channel`, `phase` (atualmente `connect`), um opcional `code` fornecido pelo adaptador e um `message` com credenciais redigidas. No máximo 64 falhas são retidas para a geração atual do worker; o sinalizador de truncagem indica que mais falhas foram observadas. `code` é diagnóstico e não é uma classificação estável entre adaptadores. `restartCount` é o número total de tentativas de reinicialização feitas por este processo serve durante sua vida útil; um worker em execução com `restartCount > 0` é saudável, a menos que outro problema se aplique. Um worker em execução cujos `requestedChannels` incluem nomes ausentes em `channels` reporta `channel_worker_partial_connect`.

Em um daemon multi-workspace (`--workspace` repetido), `runtime` inclui adicionalmente `channelWorkers[]` — uma entrada por workspace proprietário, cada uma sendo um snapshot `channelWorker` anotado com `workspaceId`, `workspaceCwd` e `primary`. `channelWorker` permanece preenchido como o snapshot do workspace primário para compatibilidade. Daemons de workspace único omitem `channelWorkers[]`.

### Controle de canal gerenciado pelo daemon

A capacidade `channel_control` anuncia o recurso de seleção de runtime. O recurso é global ao daemon, embora seu caminho de compatibilidade use o prefixo singular `/workspace`. As seleções de runtime não são persistidas e não modificam a opção `--channel` do daemon no momento da inicialização.

`GET /workspace/channel` retorna um snapshot imutável do gerenciador:

```json
{
  "enabled": true,
  "selection": { "mode": "names", "names": ["telegram", "feishu"] },
  "pendingSelection": { "mode": "names", "names": ["telegram"] },
  "transition": "reconciling",
  "workers": [
    {
      "workspaceId": "primary-id",
      "workspaceCwd": "/work/primary",
      "primary": true,
      "enabled": true,
      "state": "running",
      "channels": ["telegram"],
      "pid": 1234
    }
  ]
}
```

`selection` é `null` enquanto desabilitado. `pendingSelection` está presente apenas durante uma mutação. `transition` é um dos seguintes: `idle`, `starting`, `reconciling`, `stopping` ou `rolling_back`.

`PUT /workspace/channel` é estritamente controlado e aceita exatamente uma seleção:

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

Os nomes são aparados e deduplicados sem ordenação; um array de nomes vazio é inválido. `all` permanece exclusivo do workspace primário. Uma mudança de desabilitado para habilitado retorna `201`; um PUT idempotente ou substituição retorna `200`. A resposta é `{ changed, replaced, partial, state }`. Uma seleção igual mantém os workers saudáveis no lugar, mas recupera uma seleção igual cujo worker foi parado ou falhou.

`DELETE /workspace/channel` é estritamente controlado e idempotente. Ele retorna `{ changed, state }`; um estado bem-sucedido é desabilitado. `POST /workspace/channel/reload` também é estritamente controlado e relê as configurações, resolve novamente os grupos de workspaces e força a reconciliação da seleção confirmada. Ele retorna `409 channel_worker_not_enabled` enquanto desabilitado. A capacidade `channel_reload` é anunciada dinamicamente apenas enquanto o gerenciador tiver uma seleção confirmada e recarregável.

Cada habilitação, substituição, recarga, parada e encerramento do daemon entra em uma única fila FIFO de ciclo de vida. GET não espera por essa fila. Grupos de workspaces cuja seleção ordenada não mudou permanecem online. Falhas na substituição tentam parar os workers recém-iniciados e restaurar a seleção confirmada anterior. Os clientes devem inspecionar `rolledBack`, `rollbackError` e `state` porque a limpeza ou restauração também podem falhar. O daemon mantém o lease PID do serviço de canal durante toda a transação e não o libera até que a saída de todos os processos filhos relevantes seja confirmada.

Erros de controle estáveis são:

- `400 invalid_channel_selection`, `channel_workspace_mismatch` ou `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict`, `channel_worker_not_enabled` ou `channel_control_workspace_limit_reached`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed`, com `rolledBack` e um `rollbackError` opcional com credenciais redigidas
- `503 daemon_draining`

Escritas estritas de uma solicitação primária sem token que atinge o gate sem autoridade confiável de loopback retornam `401 token_required` antes que o código de controle seja executado. Credenciais configuradas ausentes ou inválidas e credenciais Local Control não pareadas são rejeitadas anteriormente com `401 Unauthorized` simples. Solicitações primárias confiáveis de loopback são executadas normalmente. Depois que uma solicitação começa, desconectar o cliente HTTP não cancela a transação de ciclo de vida; os clientes podem tentar novamente o mesmo PUT com segurança.

Para `502 channel_worker_start_failed`, a resposta também pode incluir `startupFailures[]` e `startupFailuresTruncated`. Cada falha adiciona o `workspaceCwd` confiável do worker tentado. Esses campos descrevem a transação que falhou, enquanto `state` descreve o estado atual após o rollback; um GET posterior não retém a tentativa que falhou. Um worker parcialmente conectado retorna sucesso em vez disso e expõe suas falhas no snapshot do worker. Uma inicialização `--channel` explícita sem adaptador conectado falha na inicialização. Uma falha de inicialização derivada de configurações é registrada e permite que o daemon continue após a limpeza ser bem-sucedida, sujeito ao tempo limite global de inicialização do runtime. A falha em confirmar a limpeza mantém o comportamento normal de falha de inicialização e o lease do serviço.

`qwen channel status` sem `--daemon-url` continua lendo os metadados do arquivo pidfile; com `--daemon-url`, ele lê `GET /workspace/channel`. Durante uma janela de reinicialização, o pidfile pertencente ao serve permanece reservado, mas `workerPid` é omitido para que os clientes não exibam um processo de worker obsoleto. Em um daemon multi-workspace, o pidfile também carrega um array aditivo `workers[]` (por workspace: `workspaceId` / `workspaceCwd` / `channels` / `workerPid` ativo) enquanto o `channels` de nível superior (união) e `workerPid` (primário) permanecem preenchidos para leitores antigos; daemons de workspace único mantêm a forma original de worker único. stdout/stderr do worker são encaminhados para o log do daemon com tokens bearer, valores sensíveis do ambiente do worker e credenciais de URL de proxy redigidos.

### Gerenciamento do Canal do Workspace

A capacidade `channel_management` anuncia a configuração de Canal e o gerenciamento de runtime escopados por workspace. As rotas singulares `/workspace` direcionam para o runtime primário. `/workspaces/:workspace` resolve exatamente o runtime registrado e confiável e nunca recorre ao runtime primário.

A descoberta somente leitura usa:

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspace/channels/events`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`
- `GET /workspaces/:workspace/channels/events`

`GET .../channels/events` retorna o diário de eventos do Channel do workspace resolvido como `{ "events": [...], "truncated": boolean }` com `Cache-Control: no-store`, além de um membro opcional `channelLinkMeta`: um mapa do nome da instância do canal para metadados de link não confidenciais (`type` e `baseUrl`, presentes apenas quando configurados como string, e para canais GitHub um `webOrigin` resolvido — a origem da interface web que os clientes devem concatenar diretamente em vez de derivá-la novamente a partir da raiz da API). Os metadados são resolvidos a partir das configurações mescladas de sistema + usuário + workspace com as quais os workers do canal são executados — a listagem de gerenciamento local ao escopo não contém canais configurados em outro escopo — e filtrada para canais cujo `cwd` resolvido pertence ao workspace consultado, para que um workspace nunca receba os metadados do canal de outro workspace. Isso permite que os clientes vinculem linhas do diário (por exemplo, uma referência a PR ou issue do GitHub) mesmo para canais herdados de configurações de usuário ou sistema. O membro é omitido inteiramente quando nenhum canal é resolvido, e daemons mais antigos nunca o enviam; uma falha na leitura das configurações degrada para sua ausência em vez de falhar a leitura do diário. Cada evento registra o que um Channel fez — uma mensagem recebida que aceitou ou ignorou (com a razão da máquina: `reason_filter`, `mention_required`, `duplicate`, uma rejeição pelo filtro de remetente, `github_api_error`), uma thread do GitHub cujo tratamento falhou e que será lida novamente (`failed` com `github_api_error`: um erro do GitHub, ou um erro local enquanto o canal não consegue ler ou escrever seu próprio estado ou uma das tarefas da thread está inacabada), um resultado de publicação, uma transição de tarefa recebida ou um resultado de consulta — e nunca transporta texto de mensagem. Uma consulta do GitHub que filtra mais de 20 notificações registra as primeiras 20 individualmente e uma linha adicional `reason_filter` cujo `detail.filtered` conta as restantes, para que um cursor de consulta fixado não inunde o diário com repetições do mesmo lote. Enquanto o cursor está retido, um comentário que a consulta lê novamente é registrado como `duplicate` ou `mention_required` uma vez por janela, e uma thread com falha como `github_api_error` em sua primeira consulta com falha na janela e a cada décima consulta com falha (uma limitação de taxa ou falha de credencial: sua primeira e a cada décima consulta), e uma vez quando é ignorada. As linhas de uma vez por janela são rastreadas sob até 8.192 chaves; uma linha cuja chave não cabe mais é registrada a cada consulta. Parâmetros de consulta: `limit` (1-500, padrão 100), `type` (separado por vírgulas `inbound`, `outbound`, `task`, `poll`), `channel` (repita o parâmetro uma vez por nome de instância) e `since` (ISO 8601). A rota não requer autoridade de operador. Leituras do diário são assíncronas e limitadas: o diário atual mais um arquivo rotacionado por Channel, 256 KiB por arquivo, 4 MiB por solicitação, 32 arquivos por solicitação, do mais recente ao mais antigo. Os metadados de link também leem sincronamente um snapshot sem efeitos colaterais das configurações mescladas (alguns pequenos arquivos JSON, resolvidos contra o ambiente efetivo do runtime); é uma decoração melhor esforço, então qualquer falha omite o membro em vez de falhar a leitura do diário. `truncated` é verdadeiro quando o limite de registros ou qualquer limite de leitura cortou o resultado, incluindo um diário maior que a janela final por arquivo. Um workspace sem diário ainda retorna uma lista vazia; um diretório de escopo que não pode ser lido responde com 5xx em vez de uma lista vazia.

O catálogo marca os tipos suportados por esta API de gerenciamento com `manageable: true`. Snapshots de instância incluem uma revisão, metadados redigidos de presença de segredo, estado de inicialização e estado de execução; segredos literais nunca são retornados. Snapshots de Channel usam `Cache-Control: no-store`.

Descritores de campo podem expor metadados de objetos aninhados através de `properties`. Descritores numéricos podem usar `exclusiveMinimum` para um limite inferior aberto e `maximum` para um limite superior inclusivo. Um número armazenado fora de um limite recém-declarado ainda é aceito quando o cliente o reenvia inalterado, então declarar um limite não bloqueia edições não relacionadas a um canal existente; um valor que o cliente realmente alterou deve satisfazer ambos os limites. Descritores de string e segredo podem usar `multiline` para solicitar aos clientes uma área de texto multilinha; os tipos de descritor permitem isso apenas em campos de nível superior. Clientes que não renderizam um tipo de campo anunciado devem preservar seu valor de configuração existente em vez de coagir ou excluí-lo, e um cliente que renderiza um campo `multiline` em um controle de linha única deve preservar o valor armazenado verbatim em vez de escrever de volta seu valor de entrada com quebras de linha removidas. Campos de objeto não podem ser obrigatórios, e propriedades aninhadas não podem ser segredos ou campos resolvíveis por ambiente; esses protocolos de gerenciamento permanecem apenas no nível superior. Uma propriedade `required` aninhada é imposta apenas enquanto seu objeto pai está presente na escrita; omitir o objeto pai deixa seus requisitos aninhados não verificados. As escritas substituem o valor armazenado de cada campo integralmente, então preservar um objeto significa reenviar o objeto armazenado; o daemon não mescla objetos parciais.

As escritas de configuração usam concorrência otimista e o portão estrito de autoridade de operador:

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- as rotas `/workspaces/:workspace/...` equivalentes

Cada mutação de configurações inclui `expectedRevision`. Solicitações de upsert contêm um objeto `config` e podem conter operações explícitas de segredo: `preserve`, `replace` ou `clear`. Uma configuração de Channel não pode selecionar um diretório de trabalho fora do workspace resolvido.

As ações de runtime são solicitações `POST` estritamente controladas para `.../channels/:name/start`, `stop` ou `restart`. Elas operam apenas no worker pertencente ao workspace resolvido.

O gerenciamento de pareamento está disponível apenas para instâncias configuradas com a política de remetente `pairing` ou política de grupo:

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve` com `{ "code": "..." }`
- `GET .../channels/:name/pairing-approvals`
- `DELETE .../channels/:name/pairing-approvals` com `{ "senderId": "..." }` ou `{ "groupId": "..." }`

Todas as rotas de pareamento exigem autoridade estrita do operador e usam `Cache-Control: no-store`. Solicitações, aprovações e revogações estão escopadas na instância de Canal e workspace selecionados. As solicitações pendentes incluem um sujeito tipado de usuário ou grupo; solicitações de grupo também retêm o remetente que iniciou a solicitação. Os instantâneos de aprovação contêm `senderIds` e `groupIds` porque as listas de permissão não persistem nomes de exibição. Revogar um usuário ou grupo desconhecido retorna `404 channel_pairing_approval_not_found`.

### Entrega de Canal e Notify

`channel_delivery` anuncia suporte à entrega imediata e melhor esforço (best-effort). É uma capacidade do protocolo, não um sinal de saúde do worker. A entrega nunca inicia um worker ausente, recorre a outro workspace, tenta novamente, persiste uma caixa de saída ou reproduz notificações históricas.

Notify direto ignora Agent e Session e aguarda uma tentativa de envio:

```http
POST /workspace/notify
POST /workspaces/:workspace/notify
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "service unavailable",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

Ambas as rotas usam o gate de mutação estrito. A rota qualificada resolve apenas um workspace registrado e confiável. O sucesso é `200 {delivered:true,deliveryId}`. `delivered:true` significa que a Promise de envio do Canal foi resolvida; isso não prova a aceitação pelo provedor, o recebimento pelo usuário ou um recibo de leitura. A validação de respostas específicas do provedor e a semântica consistente de motivos de erro entre adaptadores de IM estão fora deste contrato V1. Os erros são `400 channel_delivery_invalid`, `503 channel_worker_unavailable` ou `channel_delivery_queue_full`, `504 channel_delivery_timeout`, e `502 channel_delivery_rejected` ou `channel_delivery_failed`. Um tempo limite tem um resultado desconhecido e não é tentado novamente. Não há intencionalmente um endpoint separado de teste de conectividade: uma chamada Notify normal é o teste ponta a ponta.

O evento de resultado reproduzível contém apenas correlação e status sanitizado:

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "failed",
    "promptId": "prompt-1",
    "code": "channel_worker_unavailable",
    "error": "Channel worker is not running."
  }
}
```

Um Prompt final bem-sucedido vazio omite campos de erro:

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "skipped",
    "promptId": "prompt-1"
  }
}
```

`source` é `prompt` ou `scheduled`; `status` é `delivered`, `failed` ou `skipped`. `skipped` significa que o turno elegível foi concluído com sucesso, mas seu último bloco de resposta do assistente sem ferramentas estava vazio ou continha apenas espaços em branco. O daemon consome a autorização de entrega e publica o evento sem resolver um Worker de Canal. A correlação agendada usa `taskId` e `firedAt`. O evento nunca contém IDs de destino, texto da mensagem, credenciais ou segredos de webhook.

Segurança: a resposta nunca inclui tokens bearer, IDs de cliente, IDs completos de conexão ACP, códigos de usuário do fluxo de dispositivo ou URLs de verificação. Ambos os níveis de detalhe podem incluir aditivos `daemon.runId`, `daemon.logMode` e `daemon.logHealth`. `summary` omite o caminho do log do daemon e detalhes de perda; `full` pode incluir `logPath`, `logIssues`, `logDroppedRecords` e `logDroppedBytes` para operadores autenticados. O registro de arquivos degradado adiciona o aviso `daemon_log_degraded` livre de caminhos ao resumo de status normal.

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": [
    "health",
    "daemon_status",
    "capabilities",
    "multi_workspace_sessions",
    "..."
  ],
  "limits": {
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 800,
    "sessionRestoreTimeoutMs": 60000
  },
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/primary-workspace",
  "workspaces": [
    {
      "id": "stable-workspace-id",
      "cwd": "/canonical/path/to/primary-workspace",
      "primary": true,
      "trusted": true
    },
    {
      "id": "stable-secondary-workspace-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "primary": false,
      "trusted": true
    }
  ]
}
```

Contrato estável: quando `v` incrementa, o layout do quadro mudou de forma incompatível com versões anteriores.

> **`protocolVersions`** descreve as versões do protocolo serve que o daemon pode falar. `current` é a versão de protocolo preferida do daemon e `supported` é o conjunto compatível. Clientes que exigem um protocolo específico devem verificar `supported`; a UI específica de recursos ainda deve ser controlada por `features`. Aditivo para v=1: daemons v=1 mais antigos omitem este campo, então clientes SDK que visam builds mais antigas devem tratá-lo como opcional.

> **`modelServices` é sempre `[]` na Fase 1.** O agente usa seu único serviço de modelo padrão e não o enumera pela rede. A Fase 2 preencherá isso a partir dos adaptadores de modelos registrados para que os clientes SDK possam construir seletores de serviços; até lá, NÃO dependa deste campo sendo não-vazio.

> **`workspaceCwd`** é o caminho absoluto canônico para o workspace primário do daemon. Use-o para omitir `cwd` em `POST /session` (a rota recorre a este caminho primário) e para manter a compatibilidade com clientes antigos de workspace único. Aditivo para v=1: daemons v=1 pré-§02 omitem o campo — clientes que visam builds mais antigas devem fazer uma verificação nula antes de consumi-lo.

> **`workspaces[]`** lista todos os runtimes registrados. Daemons mais recentes de workspace único incluem o runtime primário mesmo quando `multi_workspace_sessions` está ausente, para que os clientes possam descobrir o ID estável exigido pelas rotas qualificadas por workspace; daemons mais antigos podem omitir o array. Cada entrada é `{ id, cwd, displayName?, primary, trusted, removable? }`. `displayName` é apenas para apresentação e omitido quando não definido. O primeiro/workspace primário continua espelhado por `workspaceCwd`; novos clientes escolhem um runtime não primário passando o `cwd` dessa entrada para `POST /session`. Workspaces não confiáveis são anunciados para diagnóstico, mas rejeitam a criação de novas sessões com `403 untrusted_workspace` até que a confiança mude. `removable` está presente em daemons que suportam remoção de runtime e é verdadeiro apenas para runtimes secundários dinâmicos de processo ou restaurados da persistência.

> **`session_worktree_persistence_v1`** significa que o daemon pode persistir e verificar a propriedade do worktree da Parte 4A. Respostas bem-sucedidas de criação de worktree e respostas de restauração cujo filho foi realocado enquanto ocioso ou já reporta o cwd do worktree verificado, carregam metadados `worktree` além de `worktreeState: "persisted-v1"`. Uma restauração legacy best-effort, ou uma restauração fria cujo prompt de restauração foi disparado em vez de estacionado (`suppressWorktreeContextRestore` desligado, então a rota pediu à bridge para não adiar) e que portanto reporta um prompt ativo sem cwd atual, ainda pode retornar `worktree` sem essa atestação. Clientes que solicitam isolamento devem pre-verificar esta tag e verificar cada resposta; o objeto `worktree` sozinho não é prova de propriedade durável.

> **`session_worktree_reset_v1`** significa que o daemon suporta transferência de propriedade do worktree: `POST /session/:id/worktree-reset` move a propriedade do checkout de uma sessão de worktree persistida para uma nova sessão substituta. As respostas de restauração ganham três classificações tipadas 409 junto com isso: `worktree_session_superseded` (o sidecar da sessão carrega um link `supersededBy` — a classificação é decidida apenas a partir desse link, antes de qualquer leitura do marcador, e o link é escrito antes que o marcador seja alterado, então o `replacementSessionId` no corpo é um redirecionamento para verificar, não prova de propriedade: em um estado interrompido pré-commit, ele nomeia uma sessão que não é a dona do marcador, não pode ser restaurada por si só e é coletada pelo reset tentado novamente), `worktree_marker_missing` (o marcador do checkout está ausente; reinicie a tarefa para recriá-lo — uma tentativa de restauração não pode, porque nenhum caminho de restauração escreve um marcador) e `worktree_reset_interrupted` (uma transferência anterior falhou no meio do voo com seus links de sidecar concordando; tente o reset novamente). A classificação interrompida é verificada primeiro: um marcador ausente cujos links `supersedes`/`supersededBy` concordam aparece como `worktree_reset_interrupted`, nunca como `worktree_marker_missing`. Veja a seção de rota abaixo para o protocolo de transferência e taxonomia de falhas.

As tags de recurso do workspace e `workspaces[]` são dinâmicas. Clientes que adicionam um workspace devem buscar `/capabilities` novamente após a mutação ser concluída; o daemon não transmite mudanças de capacidade para clientes que armazenaram em cache uma resposta anterior. Esquecer a persistência não descarrega um runtime ativo, então esse runtime continua anunciado até o reinício.

### `GET /brand`

O branding de produto do Web Shell, para hosts que desejam white-labelizar o shell. Resolvido a partir de `ui.brand` nos escopos de configurações do operador. Controlado pela tag de recurso `web_shell_brand`; um daemon sem a rota responde 404.

```json
{
  "name": "QiuQiu Code",
  "logoDataUri": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E"
}
```

> **Ambos os campos são opcionais, e `{}` é uma resposta normal.** Um campo ausente significa "use a marca integrada do cliente" — o Web Shell renderiza seu próprio nome e logo inline. Os clientes não devem tratar um corpo vazio como erro.

> **O manipulador sempre responde 200, mesmo quando o logotipo configurado foi rejeitado.** Um arquivo ausente, um symlink, um arquivo com hard-link, um diretório, um documento não-SVG ou conteúdo acima de 32 KiB resultam em um corpo sem `logoDataUri`, e a razão é escrita no stderr do daemon como `qwen serve: GET /brand: ui.brand.logoPath …`. Portanto, um cliente não pode distinguir "nenhuma marca configurada" de "o logotipo do operador foi recusado"; o canal voltado ao operador é o log do daemon. Um aviso é mais suave que uma rejeição, e há dois: uma raiz `<svg>` sem `viewBox` utilizável e sem `width`/`height` positivos e não-percentuais (um viewBox malformado ou de área zero conta como inutilizável), que o navegador pode renderizar em branco no tamanho fixo da barra lateral; e uma raiz de limite de prefixo cujos elementos sem prefixo carecem de vinculação de namespace padrão, tornando-os invisíveis. O middleware na frente do manipulador responde antes que ele seja executado — `401` quando a autenticação bearer é necessária e está ausente, `429` quando o limitador de taxa opcional está ativo. Um daemon em dreno não rejeita esta rota: o limitador de taxa é permissivo durante o dreno, então o manipulador continua respondendo 200 até que o listener feche e o cliente veja uma falha de conexão em vez disso. A inicialização não é um 503 nesta rota: no caminho padrão de runtime adiado, a solicitação é _mantida_ até que o runtime esteja pronto e então respondida com 200, portanto, um tempo limite curto do cliente é o que pode disparar cedo. Um 503 com `code: "daemon_runtime_starting"` chega a esta rota apenas em configurações que respondem antes que o runtime esteja pronto (por exemplo, `--open`) e é repetível; um 503 com `code: "daemon_runtime_failed"` é terminal até que o daemon reinicie e não carrega `Retry-After` — não tente novamente.

> **As configurações do workspace nunca contribuem.** A rota carrega as configurações com `skipWorkspaceSettings`, então o `.qwen/settings.json` de um repositório não pode renomear o produto nem nomear um arquivo para o daemon ler e incorporar inline em todos os navegadores conectados. Apenas Padrões do Sistema, Usuário e Sistema são lidos, nessa precedência. Pela mesma razão, um valor de marca é recusado com um aviso no stderr do daemon sempre que a substituição de placeholders alteraria isso: a substituição usa o ambiente global do processo, que o bloco `.qwen/.env` ou `env` de um workspace popula primeiro na inicialização. Um placeholder irresolúvel (a variável não está definida) é mantido literalmente, então uma variável digitada incorretamente aparece como texto literal em vez de silenciosamente recorrer a um fallback.

> **`logoDataUri` deve ser renderizado como uma imagem, nunca injetado como markup.** O daemon não sanitiza o SVG que leu. SVG carregado através de um src `img` ou href de favicon não pode executar script; SVG injetado no documento pode. O Web Shell apenas atribui isso a um contexto de imagem, e essa invariante é o que torna segura a ausência de um sanitizador.

> **Global ao processo.** A rota não aceita seletor de workspace nem ID de sessão: o valor deriva da configuração global do usuário, sendo o mesmo para todos os workspaces servidos pelo daemon. Ela é registrada após `bearerAuth` e o limitador de taxa, e antes do fallback SPA do Web Shell, então ela responde JSON para qualquer cabeçalho `Accept`.

### `POST /workspaces`

Registre um runtime de workspace adicional. O caminho deve ser um diretório absoluto existente e acessível que não duplique nem aninhe com outro workspace registrado. O registro é local ao processo, a menos que o cliente envie `persist: true`; os clientes devem fazer um pre-flight de `persistent_workspace_registration` antes de solicitar persistência. Quando `workspace_display_name` é anunciado, a solicitação também pode incluir um `displayName` opcional.

Quando `git_workspace_clone` é anunciado, a mesma rota também aceita `{ "kind": "git", "url": "...", "target": "/absolute/new/path" }`. Esta forma requer um `target` absoluto que ainda não existe, inicia um clone assíncrono, não registra nada e retorna `202 { "kind": "git-workspace-clone", "jobId": "..." }`. As respostas `201` e `200` abaixo descrevem as formas síncronas `cwd` e `scratch`; a forma git não registra nada, e o progresso e cancelamento do clone usam `GET`/`DELETE /workspace-git-clone-jobs/:jobId`.

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

Um runtime recém-criado retorna `201`; promover um workspace secundário já ativo para persistente retorna `200`. O sucesso persistente inclui `persisted: true`:

```json
{
  "id": "stable-workspace-id",
  "cwd": "/canonical/path/to/secondary-workspace",
  "displayName": "Payments Production",
  "primary": false,
  "trusted": true,
  "persisted": true
}
```

`displayName` deve ser uma string com no máximo 256 caracteres após o corte dos espaços em branco circundantes. Um resultado vazio é tratado como sem nome, e caracteres de controle internos C0 (`U+0000`–`U+001F`) ou DEL (`U+007F`) são rejeitados. `null` JSON não é um valor de criação e retorna `400 invalid_display_name`; omita o campo para fornecer nenhum nome inicial. Nomes de exibição duplicados são permitidos. Um nome fornecido com um registro local ao processo dura apenas para aquele processo do daemon; `persist: true` armazena-o com o registro persistente para que possa ser restaurado após a reinicialização. Repetir a solicitação para um workspace já persistente é idempotente e não o renomeia.

Os erros incluem `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`, `409 workspace_exists` / `workspace_nested` / `workspace_limit_reached` / `workspace_registration_store_too_large`, `500 workspace_registration_store_error` / `runtime_creation_failed`, e `501 persistence_not_available` / `not_implemented`.

### `PATCH /workspaces/:workspace`

Atualize um recurso de workspace ativo selecionado por ID do workspace ou cwd absoluto codificado em URL. O endpoint atualmente suporta apenas metadados de nome de exibição:

```json
{ "displayName": "Payments Production" }
```

Envie `{ "displayName": null }` para limpar o nome. Aqui `null` é um sentinela de exclusão somente para atualização; valores não-nulos seguem as mesmas regras de normalização de string que `POST /workspaces`. A resposta é a projeção do workspace `{ id, cwd, displayName?, primary, trusted, removable? }` atualizado. Os metadados do runtime são sempre atualizados. Se o runtime tiver identidades de registro persistente correspondentes, cada alias é atualizado atomicamente através da loja de registros schema-v1 existente; o endpoint nunca cria nem promove um registro persistente.

Campos não suportados falham fechados em vez de serem silenciosamente ignorados. Os erros incluem `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`, `409 workspace_registration_in_progress`, `500 workspace_registration_store_error`, e `503 daemon_shutting_down`.

### `DELETE /workspaces/:workspace`

Remova um runtime secundário removível. O seletor segue as regras de roteamento de workspaces plurais e aceita tanto um ID do workspace quanto um cwd absoluto codificado em URL. O corpo JSON opcional é `{ "force": boolean }`; omiti-lo solicita remoção sem força.

A remoção sem força retorna `409 workspace_busy` com um snapshot `activity` quando o runtime congelado tem sessões, prompts, inícios pendentes, conexões ACP, tarefas de memória ou workers de canal de workspace. Enviar `{ "force": true }` solicita a terminação desses recursos. A remoção da persistência é o ponto de commit: a limpeza subsequente é limitada e best-effort, falhas de limpeza são registradas em log, e a remoção lógica ainda converge em vez de restaurar o runtime. Uma resposta bem-sucedida é:

```json
{
  "removed": true,
  "workspaceId": "stable-workspace-id",
  "workspaceCwd": "/canonical/path/to/secondary-workspace",
  "forced": true,
  "persistedRegistrationRemoved": true,
  "activity": {
    "sessions": 2,
    "activePrompts": 1,
    "pendingSessionStarts": 0,
    "acpConnections": 1,
    "memoryTasks": 0,
    "channelWorkers": 0,
    "voiceSessions": 0
  }
}
```

Uma solicitação sem força imediatamente ocupada retorna um snapshot rápido de atividade pré-dreno. Assim que o dreno começa, a resposta ocupada ou de sucesso contém o snapshot final tomado após o fechamento das portas de admissão e dreno ACP e antes do início da limpeza. Os erros incluem `400 invalid_force_flag` / `workspace_mismatch`, `409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`, `500 workspace_persist_failed` / `workspace_runtime_removal_failed`, `501 workspace_runtime_removal_unsupported`, e `503 daemon_shutting_down`.

### `GET /workspace-registrations`

Liste o conjunto de workspaces desejados persistidos para este workspace primário. As entradas permanecem visíveis com `active: false` quando um diretório armazenado não pôde ser restaurado durante a inicialização atual. Uma entrada permanece `active: true` enquanto seu runtime está sendo drenado, pois o runtime ainda possui recursos ativos até que a remoção seja concluída. As entradas incluem `displayName` opcional quando o registro persistente possui um.

```json
{
  "schemaVersion": 1,
  "primaryWorkspace": "/canonical/path/to/primary-workspace",
  "entries": [
    {
      "id": "stable-registration-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "active": true,
      "persisted": true
    }
  ]
}
```

Retorna `501 persistence_not_available` quando nenhuma loja de registros está configurada e `500 workspace_registration_store_error` quando a loja não pode ser lida.

### `DELETE /workspace-registrations/:id`

Esquece um registro persistido. Isso não descarrega um runtime ativo nem encerra suas sessões; `restartRequired: true` significa que o runtime ativo desaparece na próxima reinicialização do daemon.

```json
{ "removed": true, "active": true, "restartRequired": true }
```

Retorna `404 workspace_registration_not_found`, `500 workspace_registration_store_error` ou `501 persistence_not_available`. Como outras rotas de mutação, este endpoint requer autenticação de mutação quando a autenticação do daemon está habilitada.

### Rotas de status de runtime somente leitura

Essas rotas relatam instantâneos de runtime do lado do daemon. São rotas v1 aditivas, não alteram o estado e não mudam a versão do protocolo serve. As rotas de status do workspace intencionalmente **não** iniciam o processo filho ACP apenas porque um cliente consulta uma rota GET. `GET /workspace/mcp` retorna `initialized: false` com um instantâneo vazio quando o daemon está ocioso e não mantém nenhuma observação MCP retida; se um filho ativo respondeu anteriormente, a leitura ociosa reproduz essa observação com `source: "cache"` e seu valor `initialized` original. `GET /workspace/skills`, em vez disso, atende uma observação retida do daemon ou enumeração local do daemon, e relata `initialized: false` **com uma entrada `errors`** (indisponibilidade passível de nova tentativa, não um catálogo vazio) somente quando não existe observação retida e ambas as fontes estão indisponíveis (ou uma leitura fria é limitada por taxa) — veja [`GET /workspace/skills`](#get-workspaceskills). `GET /workspace/providers` é respondido localmente pelo daemon a partir das configurações do workspace e do ambiente, portanto não depende de um filho ACP ativo, e `acpChannelLive` reporta a vivacidade (liveness). Seu `initialized` é `true` no caminho de sucesso e `false` com uma entrada `errors` quando as configurações do workspace ou a configuração do modelo não podem ser resolvidas; daemons construídos sem um construtor de provedor local do daemon recorrem ao instantâneo ACP ativo, e a resposta local do daemon omite modelos registrados em runtime. As rotas de status da sessão exigem uma sessão ativa e retornam `404 { code: "session_not_found", ... }` para IDs desconhecidos.

Tags de capacidade:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_resources` → `GET /session/:id/resources`
- `session_monitor_tool_correlation` → entradas do monitor de `GET /session/:id/tasks` incluem `toolUseId` para correlação de transcrição para tarefa
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` e `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_session_live_state` → `GET /workspaces/:workspace/sessions/live-state`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` e `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status` reporta a vivacidade pontual do canal ACP do workspace primário como `{ channelLive: boolean }`. O manipulador não cria um canal, mas alcançar uma rota de runtime pode primeiro iniciar um runtime de daemon diferido, cuja política de inicialização configurada pode pré-aquecer independentemente o ACP. O instantâneo não é um lease: os clientes devem permitir que a criação da Sessão revalide ou inicie o canal.

### Pré-aquecimento ACP

Tag de capacidade: `workspace_acp_preheat`.

`POST /workspace/acp/preheat?timeoutMs=N` inicializa melhor esforço (best-effort) o canal ACP do workspace primário. `timeoutMs` tem padrão 5000 e deve ser um inteiro positivo não maior que 60000. Chamadores concorrentes e a criação de Sessão compartilham a mesma inicialização da ponte. Um tempo limite de requisição encerra apenas aquela espera HTTP; ele não cancela a inicialização compartilhada.

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready` é sempre igual a `channelLive`. Uma resposta ao vivo omite `reason` e `error`; caso contrário, `reason` é `timeout` ou `error`. `durationMs` mede a chamada HTTP atual, não o ciclo de vida completo de uma inicialização à qual a chamada se juntou. Timeout operacional ou falha retorna HTTP 200. Um `timeoutMs` inválido retorna 400, enquanto falhas de autenticação, limitação de taxa e runtime adiado mantêm suas respostas normais.

Ambas as rotas de workspace ACP são singulares e exclusivas para o workspace primário. Os clientes não devem usá-las para um workspace secundário nem interpretar qualquer resposta como uma garantia durável de prontidão.

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
  | 'restore_timeout'
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

`errorKind` é um enum fechado compartilhado por `/workspace/preflight`, `/workspace/env` e (eventualmente) guardrails MCP, para que os clientes SDK possam renderizar a remediação por categoria em vez de analisar mensagens de formato livre. As sete literais de status originais vieram do #4175; `restore_timeout` foi adicionado separadamente para solicitações de restauração de sessão. `blocked_egress` permanece reservado até que a sonda de saída seja implementada.

As cargas úteis de status nunca expõem valores de env MCP, cabeçalhos, detalhes de OAuth/conta de serviço, chaves de API do provedor, `baseUrl` / `envKey` do provedor, corpo da habilidade, caminhos do sistema de arquivos da habilidade, definições de hook ou valores de variáveis de ambiente secretas. `/workspace/env` relata apenas a **presença** de variáveis de ambiente na lista permitida; URLs de proxy têm suas credenciais removidas e são reduzidas a `host:port` antes de serem transmitidas.

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

`discoveryState` é um dos seguintes: `not_started`, `in_progress` ou `completed`. `transport` é um dos seguintes: `stdio`, `sse`, `http`, `websocket`, `sdk` ou `unknown`. `errors` é omitido quando a descoberta tem sucesso.

`source` é `"live"` enquanto o filho que produziu a observação está ativo. Quando o daemon está ocioso e um filho ativo respondeu anteriormente, a resposta reproduz essa observação com `source: "cache"` e os valores originais do filho, incluindo `initialized: true` e sua lista de servidores. A observação em cache é limpa apenas quando uma nova descoberta MCP começa; colher o filho não a descarta, então um `GET /workspace/mcp` ocioso pode reportar um catálogo que nenhum filho ativo atende atualmente.

**Guardrails do cliente MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175)).** Daemons atuais estendem o payload com quatro campos aditivos e uma célula de orçamento com escopo de capacidade:

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
      "scope": "workspace",
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

`budgetMode` é um de `enforce`, `warn` ou `off`. `clientBudget` está ausente quando nenhum orçamento foi definido. `budgets[]` é **sempre um array** em daemons que anunciam `mcp_guardrails` (possivelmente vazio quando `budgetMode === 'off'`); daemons mais antigos omitem o campo completamente. Quando `mcp_workspace_pool` é anunciado, a célula tem `scope: 'workspace'` e cobre o pool compartilhado do runtime de workspace selecionado. Quando essa tag está ausente, incluindo sob `QWEN_SERVE_NO_MCP_POOL=1`, o gerenciador legado emite `scope: 'session'`. Os consumidores DEVEM tolerar valores de escopo adicionais não reconhecidos.

`disabledReason` nas células por servidor distingue desabilitado pelo operador (`'config'` — `disabledMcpServers` lista de configuração) de recusado por orçamento (`'budget'` — descoberto mas nunca conectado devido ao modo `enforce`). As recusas são determinísticas pela ordem de declaração `Object.entries(mcpServers)`. O `status: 'error', errorKind: 'budget_exhausted'` por servidor ofusca o `mcpStatus: 'disconnected'` bruto (que é verdadeiro, mas não é a severidade voltada ao operador).

A aplicação do orçamento é orientada por capacidades. Com `mcp_workspace_pool`, sessões dentro de um runtime de workspace compartilham transportes e um `WorkspaceMcpBudget`; diferentes runtimes de workspace nunca compartilham um pool ou orçamento. Sem a tag, o `McpClientManager` de cada sessão ACP aplica sua própria cópia do limite e o snapshot representa essa visão de sessão legada.

**Detectando pressão de orçamento.** Duas superfícies, ambas populadas pós-PR-14b:

- **Eventos push** (anunciados via `mcp_guardrail_events`): assine `GET /session/:id/events` e filtre frames `mcp_budget_warning` / `mcp_child_refused_batch` através de `KnownDaemonEvent`. A máquina de estados dispara uma vez por cruzamento ascendente de 75% (rearmando abaixo de 37,5%); as recusas são coalescidas uma vez por passagem de descoberta no modo `enforce`.
- **Polling de snapshot** (anunciado via `mcp_guardrails`): `GET /workspace/mcp` e inspecione a célula de orçamento (`budgets[0]`) junto com `mcp_workspace_pool` para determinar seu escopo:

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (corresponde ao limiar de histerese que o evento push do PR 14b usará).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (um ou mais servidores recusados nesta passagem de descoberta).
- `budgets[0].status === 'ok'` ⇔ abaixo do limiar de 75% E sem recusas.

Cadência de polling recomendada: alinhada com qualquer coisa que já faça polling de `/workspace/mcp`; o snapshot é barato e a célula de orçamento não carrega custo adicional de descoberta. Clientes SDK que assinam eventos push ainda se beneficiam do snapshot para estado após desconexão prolongada (a profundidade do anel de replay SSE é finita — `--event-ring-size`, padrão 8000 — então um cliente offline por mais tempo que a cobertura do anel recorre à ressincronização via snapshot).

### `GET /workspace/skills`

As rotas de inventário primária e qualificada por workspace retornam imediatamente um snapshot retido enquanto revalidam em segundo plano. Inícios são limitados a uma vez por segundo, medidos desde o início da tarefa, e leitores concorrentes compartilham uma tarefa. A revalidação em segundo plano quente libera seu slot após cinco segundos; o timeout permite nova tentativa, mas não cancela a observação ou o trabalho ACP. Leituras frias respeitam o timeout de solicitação configurado do ACP (dez segundos por padrão), depois a enumeração local do daemon se o ACP estiver indisponível. Elas não impõem o prazo de segundo plano a nenhuma das fontes. Uma leitura fria que falha dentro de um segundo de seu início faz com que o restante dessa janela retorne status indisponível imediatamente; falhas mais lentas não deixam janela de limitação, então os clientes precisam de seu próprio backoff de nova tentativa. Uma observação bem-sucedida tardia em segundo plano pode publicar enquanto uma nova tentativa está pendente, mas não pode substituir uma observação iniciada posteriormente que já foi publicada. Tarefas invalidadas não podem publicar; uma observação invalidada bem-sucedida ainda pode responder ao chamador original. A invalidação explícita descarta o inventário conhecido como inválido e limpa a limitação. Um preaquecimento ACP bem-sucedido que conclui antes de seu timeout também invalida o inventário retido, inclusive quando o filho já estava ativo, para que a leitura subsequente veja o filho. Um preaquecimento que expira e depois encontra o canal ativo também reporta `ready: true` — pronto é sempre igual a `channelLive` — mas mantém o inventário retido porque a inicialização pode ainda estar incompleta; a próxima leitura retorna esses dados retidos, e a revalidação em segundo plano os substitui assim que a limitação de início de um segundo permitir. A exclusão de habilidade ignora o snapshot e a limitação, mas requer um catálogo recém-enumerado: usa fallback local e nunca responde a partir de um snapshot retido. Leituras de identidade de habilitação ignoram o snapshot e a limitação, aguardando uma nova observação com fallback local e depois o snapshot retido quando ambas as fontes falharem.

Respostas de inventário carregando uma observação retida do daemon incluem adicionalmente metadados opcionais de snapshot. Leituras diretas de status de configuração/runtime, inventários de recursos de sessão e daemons mais antigos omitem isso. Uma leitura fria bem-sucedida substituída retorna um snapshot retido mais recente quando disponível; caso contrário, retorna sua própria observação não armazenada em cache sem esses metadados. Apenas observações inicializadas sem erros podem substituir o snapshot retido:

```json
{
  "snapshot": {
    "observedAt": 1792486800000,
    "ageMs": 1500,
    "stale": true,
    "refreshing": true
  }
}
```

`observedAt` é o tempo de início em milissegundos Unix da observação bem-sucedida; `ageMs` é recalculado por resposta, incluindo conservadoramente o tempo de coleta. `stale` significa que a observação tem pelo menos um segundo de idade. `refreshing` indica se uma revalidação ocupa o slot compartilhado; observações com timeout podem ainda concluir após o slot ser liberado. Leituras falhas, timeouts de slot e replay após a parada do runtime não renovam o timestamp; uma publicação bem-sucedida posterior registra seu próprio tempo de início de observação. Os clientes podem exibir essa idade, mas ela não é uma revisão do sistema de arquivos nem prova de que todas as sessões estão atualizadas. Se não existir snapshot inicializado e ambas as fontes estiverem indisponíveis (ou a leitura fria for limitada), a resposta terá `initialized: false`, uma entrada `errors` e nenhum metadado `snapshot`. Isso é indisponibilidade passível de nova tentativa, não um catálogo vazio; um catálogo vazio válido possui `initialized: true`. As leituras de status não invocam comandos de atualização de Skill que afetam a sessão. Runtimes de workspace fechados ou em drenagem rejeitam leituras; os dados retidos sobrevivem à limpeza dos canais filhos, não à aposentadoria do runtime.

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
      "userInvocable": false,
      "installedPath": "/home/alice/project/.qwen/skills/review/SKILL.md",
      "argumentHint": "[path]"
    },
    {
      "kind": "skill",
      "status": "ok",
      "name": "database-review",
      "description": "Review database changes",
      "level": "extension",
      "modelInvocable": true,
      "installedPath": "/home/alice/.qwen/extensions/alibabacloud-database-suite/skills/database-review/SKILL.md",
      "extensionName": "alibabacloud-database-suite",
      "extensionDisplayName": "Alibaba Cloud Database Suite"
    }
  ]
}
```

`level` é um de `project`, `user`, `extension` ou `bundled`. `userInvocable` (booleano, opcional) é omitido para skills normais (significando `true`) e está presente apenas como `false` quando a skill não pode ser invocada manualmente. Ele não bloqueia as rotas de alternância de Skill apenas nas configurações descritas abaixo. `modelInvocable` é independente: `false` significa que a skill permanece disponível manualmente, mas fica oculta para invocações do modelo. `installedPath` é o caminho absoluto existente para o `SKILL.md` da skill; o daemon o retorna conforme armazenado, sem resolver links simbólicos ou normalizá-lo separadamente. Daemons atuais emitem isso para toda skill, enquanto os clientes devem tolerar sua ausência em daemons v1 mais antigos. Corpos de Skills, hooks, `skillRoot` e outras configurações de skill permanecem excluídos. `errors` é omitido quando a descoberta é bem-sucedida.

Para skills pertencentes a extensões, `extensionName` é o nome canônico do manifesto e é seguro usar como identidade do proprietário. `extensionDisplayName` é um valor de apresentação localizado opcional e pode não ser único. Novos clientes devem exibir `extensionDisplayName ?? extensionName`; daemons mais antigos omitem o campo de exibição.

Leituras repetidas são atendidas a partir do último snapshot de workspace confirmado, periodicamente revalidadas contra o cache em memória do filho. Leituras em estado estacionário não escaneiam diretórios de skills nem reanalisam arquivos `SKILL.md`; o fallback frio local ao daemon pode enumerar do disco. O filho verifica se suas fontes de extensão estão inalteradas — um `readdir` do diretório de extensões mais um `stat` por entrada, o arquivo de habilitação e o estado de ativação da loja — e atualiza apenas quando elas mudaram, de modo que uma extensão instalada ou alternada fora do daemon seja captada pela revalidação e apareça em uma leitura subsequente após essa revalidação publicar. Uma leitura quente sempre retorna a observação retida, mesmo quando inicia trabalho em segundo plano. Modo seguro e modo puro pulam a verificação, correspondendo à exclusão de extensões nesses modos.

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

Os modelos são agrupados por tipo de autenticação. Os diagnósticos de conexão do provedor ficam na célula `providers` de `/workspace/preflight`; a pré-verificação do ambiente fica em `/workspace/preflight` e `/workspace/env` (abaixo). `errors` é omitido quando a construção do snapshot é bem-sucedida.

### `GET /workspace/env`

Relata o runtime, plataforma, sandbox, proxy e a **presença** de variáveis de ambiente secretas permitidas na lista branca do processo do daemon. Sempre responde a partir do estado `process.*` — o daemon nunca gera um filho ACP para atender esta rota, e a resposta é idêntica quer o ACP esteja ativo ou ocioso. O campo `acpChannelLive` é apenas informativo.

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

**Política de redação.** Células `kind: 'env_var'` nunca incluem um campo `value`; os clientes veem apenas `present: boolean`. Células `kind: 'proxy'` passam o valor bruto do env pela redação de credenciais (`redactProxyCredentials`) e depois pela análise `URL`, de modo que a linha só transporta `host:port`. `NO_PROXY` passa pela redação literalmente porque é uma lista de hosts, não uma URL. A lista branca de variáveis de ambiente secretas enumeradas inclui atualmente `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` e `QWEN_SERVER_TOKEN`. Outras variáveis de ambiente não são enumeradas, portanto segredos definidos acidentalmente permanecem invisíveis.

### `GET /workspace/preflight`

Relata verificações de prontidão do daemon. **Células de nível de daemon** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) são sempre preenchidas a partir de `process.*` e `node:fs`. **Células de nível ACP** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) exigem um filho ACP vivo — quando o daemon está ocioso, elas emitem placeholders `status: 'not_started'`. A rota nunca gera ACP apenas para preencher células; as células correspondentes recorrem a `not_started`.

Formato da célula:

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

- `missing_binary` — Versão do Node abaixo da necessária, `QWEN_CLI_ENTRY` ausente, ripgrep / git / npm não no PATH (avisos em vez de erros para os binários opcionais).
- `missing_file` — `boundWorkspace` não existe ou não é um diretório; erro de análise de skill apontando para um arquivo ausente ou ilegível.
- `parse_error` — falha na análise de `SKILL.md`, JSON de configuração malformado.
- `auth_env_error` — `validateAuthMethod` retornou uma string de falha não nula, ou uma subclasse `ModelConfigError` propagada da resolução do provedor.
- `init_timeout` — Rejeição `withTimeout` na ponte (um timeout real ao aguardar uma ida e volta ACP). Reconhecido pela classe tipada `BridgeTimeoutError`. Nota: uma célula `mcp_discovery` `warning` transitória com `connecting > 0` NÃO carrega esse tipo — isso é um estado normal de handshake em andamento, distinto de um timeout real.
- `restore_timeout` — um carregamento ou retomada de sessão excedeu o orçamento dedicado de restauração. A resposta REST é `504` e pode ser repetida; ela é distinta da inicialização do filho e dos limites da janela de replay limitada.
- `protocol_error` — `extMethod` ACP rejeitado porque o canal foi fechado no meio da solicitação, ou porque o registro de ferramentas estava inesperadamente ausente.
- `blocked_egress` — reservado para PR 14 (#4175). O PR 13 deixa a célula `egress` como `status: 'not_started'`.

Se a ponte falhar ao alcançar o filho ACP enquanto atende uma solicitação de preflight (por exemplo, fechamento do canal no meio da solicitação), a matriz `errors` do envelope carrega um único `ServeStatusCell` descrevendo a falha e as células retornam placeholders ACP `not_started`. As células de nível de daemon ainda são retornadas.

### `GET /workspace/tools`

Retorna o catálogo de ferramentas reportado pelo filho ACP do workspace primário. Esta é uma rota legada de workspace primário: não possui seletor de workspace e não deve ser usada para inferir as ferramentas de um runtime não primário.

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": true,
  "tools": [
    {
      "name": "ReadFile",
      "displayName": "Read",
      "description": "Read a file",
      "enabled": true
    }
  ]
}
```

Quando nenhum filho ACP está ativo, a rota ainda retorna `200` com `acpChannelLive: false`, uma matriz `tools` vazia e uma entrada `not_started` na matriz opcional `errors`. Falhas inesperadas da ponte usam a resposta padrão de erro de ponte `500`. O método do SDK TypeScript é `workspaceTools()`; não há tag de capacidade dedicada, então clientes que suportam daemons antigos devem tratar `404` como não suportado.

### Rotas de arquivos do workspace

As rotas de arquivos legados resolvem caminhos através do workspace primário; as rotas `/workspaces/:workspace/...` resolvem caminhos através do workspace do runtime selecionado. As respostas usam caminhos relativos ao workspace e nunca retornam caminhos absolutos do sistema de arquivos para casos normais de sucesso. Respostas bem-sucedidas de arquivo incluem:

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

Os valores `errorKind` incluem `path_outside_workspace`, `symlink_escape`, `path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`, `permission_denied`, `parse_error`, `hash_mismatch`, `file_already_exists`, `text_not_found` e `ambiguous_text_match`.

#### `GET /file`

Lê um arquivo de texto. Parâmetros de consulta: `path` (obrigatório), `maxBytes`, `line`, `limit` e `cursor`. O daemon rejeita arquivos binários. Arquivos acima do limite de snapshot completo de 256 KiB exigem pelo menos um argumento explícito de janela (`line`, `limit` ou `maxBytes`); uma solicitação sem nenhum deles permanece `file_too_large`. Tal janela é transmitida em streaming, e seu conteúdo UTF-8 retornado permanece limitado a 256 KiB. `maxBytes` sempre se aplica aos bytes de resposta UTF-8 após a decodificação, inclusive quando a fonte usa outra codificação suportada dentro do limite de snapshot completo.

Os deslocamentos de linha são resolvidos escaneando desde o início do arquivo, portanto uma janela também é recusada com `file_too_large` quando alcançá-la implicaria ler mais de 8 MiB (`MAX_TEXT_SCAN_BYTES`). Use `GET /file/bytes` para alcançar um deslocamento mais profundo diretamente. Texto grande em uma codificação que a rota não consegue decodificar retorna `binary_file`, não `file_too_large` — tentar novamente com uma janela menor não ajuda, e `readBytes` é o mesmo remédio que já se aplica a binários.

Para arquivos dentro do limite de snapshot completo, a resposta inclui `hash`, um resumo SHA-256 sobre os bytes brutos em disco para todo o arquivo, mesmo quando `line`, `limit` ou `maxBytes` retornaram um slice. Janelas parciais grandes omitem `hash`, mantêm o `sizeBytes` completo, definem `truncated: true` e retornam `originalLineCount: null` quando o stream para antes do EOF.

##### Paginação com `cursor`

Requer a capacidade `workspace_file_read_cursor`. Uma resposta que tem mais a oferecer retorna `hasMore: true` e, quando um deslocamento de byte do arquivo é derivável, um token `nextCursor`. Passá-lo de volta como `cursor` retoma em O(1), onde um deslocamento `line` profundo custa um scan desde o byte 0 e é recusado além de 8 MiB.

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → next page
```

`cursor` e `line` são mutuamente exclusivos (`parse_error`) — ambos nomeiam um ponto de partida. Um cursor malformado ou muito longo resulta em `parse_error`; um cursor cujo arquivo foi substituído ou truncado resulta em `hash_mismatch` (409). Anexar dados **não** invalida um cursor pendente, que é o caso para o qual o recurso existe.

`content` omite a nova linha final de sua última linha, assim como toda leitura faz, então um cliente remontando páginas junta-as com `\n`. `hasMore` não é uma reformulação de `nextCursor`: um arquivo pequeno não-UTF-8 lido com um `limit` tem mais conteúdo mas nenhum deslocamento de byte derivável, então reporta `hasMore: true` com `nextCursor: null`. O cursor também é nulo quando o limite de bytes corta a linha atual, porque retomar daquele deslocamento retornaria uma linha parcial. Para muitas linhas curtas, reduza `limit` até que a página termine antes do limite de bytes e retorne um cursor. Para uma única linha excessivamente grande, solicite explicitamente a linha seguinte (por exemplo, `line=2` começando na linha 1), depois continue com cursores; use `GET /file/bytes` quando a linha excessivamente grande completa for necessária.

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

Lê bytes brutos de um arquivo sem decodificá-los. Parâmetros de consulta: `path` (obrigatório), `offset` (padrão `0`) e `maxBytes` (padrão `65536`, máximo `262144`). Esta rota suporta janelas limitadas em arquivos binários grandes sem ler o arquivo inteiro. A resposta inclui `hash` apenas quando a janela retornada cobre todo o arquivo.

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

#### `GET /stat`

Retorna metadados para um caminho do workspace primário. O parâmetro de consulta `path` é obrigatório.

```json
{
  "kind": "stat",
  "path": "src/index.ts",
  "type": "file",
  "sizeBytes": 128,
  "modifiedMs": 1700000000123
}
```

`type` é `file`, `directory`, `symlink` ou `other`. A rota usa o limite de arquivo do workspace e o envelope comum de erro do sistema de arquivos descrito acima. O método do SDK TypeScript é `fileStat()`.

#### `GET /list`

Lista um diretório do espaço de trabalho principal. O parâmetro de consulta `path` é obrigatório; `includeIgnored=1` (ou `true`) inclui entradas correspondidas por regras de ignorar. A resposta tem limite de 2.000 entradas e define `truncated: true` quando houver mais.

```json
{
  "kind": "list",
  "path": ".",
  "entries": [{ "name": "src", "kind": "directory", "ignored": false }],
  "truncated": false,
  "matchedIgnore": null
}
```

O `kind` de cada entrada é `file`, `directory`, `symlink` ou `other`. O método do SDK TypeScript é `dirList()`.

#### `GET /glob`

Corresponde caminhos dentro do espaço de trabalho principal. O parâmetro de consulta `pattern` é obrigatório. O opcional `cwd` restringe a busca, `includeIgnored=1` (ou `true`) inclui caminhos ignorados e `maxResults` é um inteiro de 1 a 50.000 (padrão 5.000).

```json
{
  "kind": "glob",
  "pattern": "**/*.ts",
  "cwd": "",
  "matches": ["src/index.ts"],
  "count": 1,
  "truncated": false,
  "durationMs": 4
}
```

As correspondências são relativas ao espaço de trabalho. Valores de consulta inválidos retornam `400`; confiança no espaço de trabalho, contenção, caminho ausente e falhas inesperadas usam o envelope comum de erro de sistema de arquivos. O método do SDK TypeScript é `glob()`.

#### `POST /file/write`

Cria ou substitui um arquivo de texto. Esta é uma rota de mutação estrita: uma solicitação primária de loopback confiável sem token é autorizada. Uma solicitação primária sem token que atinge o portão sem autoridade de loopback confiável retorna `401 { "code": "token_required" }`. Falhas de credenciais de token configurado e Local Control são rejeitadas antes com `401 Unauthorized` simples; com `--require-auth`, o middleware bearer global rejeita solicitações não autenticadas antes da execução da rota.

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

`mode` deve ser `create` ou `replace`. `create` nunca sobrescreve um arquivo existente (`409 file_already_exists`). `replace` requer `expectedHash`; hashes ausentes ou malformados são `400 parse_error`, e hashes obsoletos são `409 hash_mismatch`. `expectedHash` é `sha256:` mais 64 caracteres hexadecimais minúsculos, calculados sobre os bytes brutos em disco.

`bom`, `encoding` e `lineEnding` podem ser fornecidos. A substituição preserva o perfil de codificação do arquivo existente por padrão; campos explícitos o sobrescrevem. Escrita binária está fora do escopo.

O daemon escreve em um arquivo temporário aleatório no diretório de destino, faz fsync onde suportado, reverifica o hash atual imediatamente antes de `rename()` e então renomeia para o lugar. Isso evita observação de arquivo parcial e serializa escritas originadas pelo daemon no mesmo arquivo, mas não é um compare-and-swap entre processos no kernel: um editor externo ainda pode competir na pequena janela entre a verificação final do hash e a renomeação.

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

Aplica uma substituição exata de texto em um arquivo de texto existente. Esta também é uma rota de mutação estrita e requer `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` deve ser não vazio e ocorrer exatamente uma vez. Nenhuma correspondência retorna `422 text_not_found`; múltiplas correspondências retornam `422 ambiguous_text_match`. A rota preserva codificação, BOM e finais de linha, e reverifica `expectedHash` imediatamente antes da renomeação atômica.

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

#### `POST /workspaces/:workspace/directory/create`

Requer `workspace_qualified_rest_core` e `workspace_directory_create`, autoridade de mutação estrita e um espaço de trabalho local ativo confiável. Corpo:

```json
{ "path": "src/new-folder" }
```

O pai deve existir. A criação é exclusiva: um arquivo ou diretório existente retorna `409 file_already_exists`; um symlink final retorna `400 symlink_escape`. O sucesso é `201 { "kind": "directory_create", "path": "src/new-folder" }`. O método do SDK é `WorkspaceDaemonClient.createWorkspaceDirectory(path, clientId?)`.

#### `POST /workspaces/:workspace/directory/delete`

Requer `workspace_qualified_rest_core` e `workspace_directory_delete` sob a mesma política de mutação estrita e runtime local confiável. Corpo:

```json
{ "path": "src/old-folder" }
```

Exclui um diretório vazio ou não vazio recursivamente. Raízes de espaço de trabalho, arquivos regulares e symlinks finais são rejeitados; entradas de symlink aninhadas são removidas sem seguir seus alvos. Um alvo ausente retorna `404 path_not_found`. O sucesso é `200 { "kind": "directory_delete", "path": "src/old-folder" }`. O método do SDK é `WorkspaceDaemonClient.deleteWorkspaceDirectory(path, clientId?)`.

Ambas as rotas de diretório preservam o nome final lexical enquanto resolvem seu pai dentro do espaço de trabalho selecionado. Caminhos não devem terminar em separador; padrões de caminho suspeitos retornam `400 path_outside_workspace`, enquanto formas de folha malformadas retornam `400 parse_error`. Fábricas customizadas não suportadas retornam `422`; espaços de trabalho SSH são rejeitados pela fronteira SSH com `501`. Proprietários desconhecidos, indisponíveis, removidos ou não confiáveis nunca fazem fallback para o principal.

A exclusão é permanente e falhas podem deixar remoção parcial. Um escritor concorrente pode causar `ENOTEMPTY`, retornado como `503 io_error`; tente novamente a mesma operação após o escritor parar. Trava por caminho não serializam um diretório contra toda escrita filha, e a substituição externa de diretório não pode ser tornada atômica por verificações portáveis baseadas em caminho. Mutações explícitas de diretórios ignorados são permitidas e eventos de auditoria anotam `matchedIgnore` quando aplicável; criação registra `sizeBytes: 0`.

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

Para uma sessão de nível superior, `state` espelha as mesmas formas de modelo/modo/opção de configuração ACP usadas por `POST /session`, `POST /session/:id/load` e `POST /session/:id/resume`. Um id de sessão virtual prefixado com `subagent.` resolve contra seu runtime pai e retorna um objeto `state` vazio.

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

`availableCommands` é o mesmo snapshot de comando usado pela notificação SSE `available_commands_update`. `availableSkills` lista apenas nomes de skills; clientes não devem esperar corpos ou caminhos de skills nesta rota.

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

Esta rota é um snapshot somente leitura fora de banda. Ela intencionalmente não é um prompt e pode ser consultada enquanto a sessão está transmitindo. A resposta contém apenas metadados da whitelist dos registros de tarefas de agente, shell e monitor; controladores, timers, offsets, mensagens pendentes e objetos brutos de registro nunca são expostos.

Tarefas de Agent geradas por outro sub-agent (sub-agents aninhados, limitados por `maxSubagentDepth`) carregam três campos opcionais de linhagem: `parentAgentId` (o `id` da tarefa do agente que gerou), `parentName` (o `subagentType` do agente que gerou, capturado no registro para sobreviver à remoção do pai do registro) e `depth` (profundidade de lançamento baseada em 0; 0 = gerada pela sessão de nível superior). Agents lançados pela sessão de nível superior omitem `parentAgentId` e `parentName`; os clientes devem tratar todos os três campos como opcionais e recorrer a uma lista plana quando ausentes.

### `GET /session/:id/tasks/:taskId/runtime`

Detalhe sob demanda para uma tarefa shell. `GET /session/:id/tasks` carrega apenas fatos do ciclo de vida; esta rota lê o arquivo de saída capturado e sonda a árvore de processos, então um painel de detalhes aberto solicita isso separadamente.

O método ACP é `_qwen/session/task_runtime`, com parâmetros `sessionId` e `taskId`. Ambos os transportes resolvem o proprietário da sessão ativa; o ACP também exige que a conexão seja proprietária da sessão.

O `taskId` do caminho é resolvido contra o próprio registro de shell da sessão; os chamadores nunca passam um caminho de arquivo.

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "taskId": "bg_0123abcd",
  "runtime": {
    "memoryBytes": 104857600,
    "outputBytes": 65536,
    "outputModifiedAt": 1700000000000,
    "outputTail": "ready in 120ms\n",
    "outputTailTruncated": true
  }
}
```

`runtime` é `null` quando a tarefa é desconhecida, foi removida ou não é uma tarefa shell. `memoryBytes` é o conjunto residente da árvore de processos do shell, amostrado apenas enquanto a tarefa está sendo executada; páginas compartilhadas são contadas uma vez por processo, e um sandbox de container pode expor apenas o processo wrapper. `outputTail` é limitado ao mesmo limite de 8 KiB usado pela notificação de conclusão, e `outputTailTruncated` marca um final que começa no meio do arquivo. `outputError` é definido quando o arquivo não pode ser lido; campos de uma parte que teve sucesso ainda podem estar presentes.

### `POST /session/:id/tasks/:taskId/workflow-action`

Controla uma execução de workflow ou inicia uma nova. O método ACP é `_qwen/session/tasks/workflow_action`.

```json
{
  "action": "run-script",
  "script": "export const meta = { name: 'daily-audit', description: 'Audits yesterday' }\nreturn await agent(args.question)",
  "args": { "question": "which tables grew?" },
  "sourceRef": { "id": "definition-7", "revision": "rev-3" }
}
```

O que `taskId` nomeia depende da ação:

| `action` | `taskId` | Inicia uma execução |
| ----------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| `pause`, `resume`, `retry`, `rerun` | o id da execução | `retry` e `rerun` fazem |
| `delete-history` | o id da execução | não |
| `run-saved` | o nome do workflow salvo, `<extension>:<name>` para uma extensão | sim |
| `run-script` | uma chave de início escolhida pelo chamador | sim |

`args`, `sourceRef` e `script` são lidos apenas por `run-saved` e `run-script`. `args` está vinculado à global `args` do script e pode ser qualquer valor JSON; `sourceRef` é o `{id, revision}` do próprio chamador, registrado na execução, seu diário e seu snapshot; `script` é a fonte `run-script` que executa e é exigida por ela. Uma nova tentativa ou reexecução reproduz o `args` e o `sourceRef` originais da própria execução — isso é o que faz dela a mesma execução — portanto, esses campos são ignorados junto com as ações de controle.

Uma execução iniciada pertence à sessão: ela roda em segundo plano sem prompt de aprovação, e sua conclusão alcança o canal de conclusão da sessão. Ela se torna um alvo `retry`/`rerun` depois disso, como qualquer outra execução.

`retry` e `rerun` também aceitam uma execução restaurada do histórico (`isHistorical` em `GET /session/:id/tasks`), como uma interrompida por uma reinicialização do daemon: a execução é iniciada novamente a partir do script do snapshot, `args` e `sourceRef`, e registra-se e reporta sua conclusão à sessão que enviou a ação. Um `retry` retoma o diário da execução sob o mesmo id de execução e aplica-se a uma execução `failed` para a qual nenhum processo ainda está rodando; um `rerun` inicia um novo id de execução a partir de qualquer execução concluída. Uma entrada de histórico portando `argsOmitted` foi lançada com `args` grande demais para manter, então nenhuma das ações se aplica a ela. Nem se aplica a um snapshot escrito antes que `args` fossem mantidos, que não porta nem `argsOmitted` nem `argsRecorded`: o diário de uma execução é indexado a partir de um hash de seu `args`, então reiniciar uma cujo `args` seu histórico não pode nomear não reproduziria nada e redistribuiria cada agent. Ambas as recusas são `workflow_args_unavailable`, e `GET /session/:id/tasks` reporta ambas como `argsUnavailable` na entrada, para que um cliente possa ocultar as duas ações em vez de descobrir a recusa fazendo a chamada. `argsOmitted` permanece ao lado como o motivo, para um cliente que deseja dizer qual. Os próprios `args` nunca são colocados na transmissão.

`run-script` não passa um nome de definição, então a execução é rotulada pelo `export const meta` próprio do script — um script compilado deve declarar um, ou a execução mostra apenas seu id.

A resposta é `{"changed": true, "status": "running", "taskId": "<runId>"}` para uma execução iniciada, `{"changed": true, "status": "<status>"}` para uma ação de controle que entrou em vigor, e `{"changed": false}` quando nada aconteceu: Workflow indisponível para a sessão (desabilitado, modo bare, pasta não confiável), workspace não confiável, nome de workflow salvo desconhecido, id de execução desconhecido, ou outra inicialização já em andamento sob o mesmo `taskId`. Apenas inícios sobrepostos são deduplicados: duas chamadas `run-script` concorrentes sob um `taskId` iniciam uma execução. Assim que esse início retorna, a chave é liberada; submetê-la novamente pode iniciar outra execução, mesmo que a primeira ainda esteja ativa. A chave não fornece idempotência de nova tentativa após uma resposta perdida.

Um parâmetro rejeitado é um `400` (`-32602` via ACP), não uma execução iniciada: um `action` desconhecido, um `run-script` sem `script`, um `sourceRef` que não é `{id, revision}` de strings não vazias, ou um script rejeitado antes do lançamento devido a sintaxe inválida ou violação de determinismo. Erros de entrada de início de Workflow portam `workflow_invalid_params` e retêm a mensagem de rejeição.

Quatro recusas vêm do estado armazenado da execução, não da solicitação. Cada uma é `-32602` via ACP, portando seu `errorKind` e seu `data.httpStatus`. Três são um `409`; a quarta, `workflow_not_recorded`, é um `503`, porque nada foi iniciado e a mesma chamada pode simplesmente ser feita novamente: um `retry` registra que a execução está rodando novamente antes de começar — esse registro é o que impede que outro processo a inicie uma segunda vez — e o registro não pôde ser escrito.

| `code` / `errorKind` | HTTP | Quando | O que fazer |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `workflow_journal_unavailable` | `409` | um `retry` cuja execução não tem diário no disco, ou um que não pode ser lido | `rerun`-a, o que a inicia desde o começo |
| `workflow_args_unavailable` | `409` | um `retry` ou `rerun` de uma entrada de histórico marcada `argsUnavailable`: seus `args` eram grandes demais para serem mantidos, ou seu snapshot é anterior à manutenção deles | inicie-a novamente com `run-saved` ou `run-script` e seu `args` |
| `workflow_run_live_elsewhere` | `409` | um `retry` de uma execução cujo checkpoint registra um processo que não foi visto sair — um ainda em execução, um em outra máquina, ou um cujo pid foi reutilizado | `rerun`-a, o que pega um novo id de execução |
| `workflow_not_recorded` | `503` | um `retry` cujo registro de que a execução está sendo executada novamente não pôde ser escrito, então ela não iniciou | faça a mesma chamada novamente; a execução permanece intacta |

`workflowToolFeatures` em `GET /session/:id/supported-commands` anuncia `runSavedArgs` e `runScript`; um daemon sem eles não aceita nem a entrada de início nem a ação `run-script`. Ele também transporta `nameOnly`, verdadeiro quando o modelo da sessão pode executar apenas fluxos de trabalho nomeados (`tools.workflowNameOnly`): as próprias chamadas `script` e `scriptPath` do modelo são recusadas, enquanto todas as ações acima, incluindo `run-script`, ainda iniciam execuções. `retryHistorical` é verdadeiro quando `retry` e `rerun` aceitam uma execução restaurada do histórico; um daemon mais antigo responde a eles com `{"changed": false}`, então um cliente deve oferecer esses controles para uma entrada de histórico apenas quando for reportado.

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

`status` é um dos seguintes: `NOT_STARTED`, `IN_PROGRESS`, `READY` ou `FAILED`. O opcional `error` está presente em servidores que falharam, quando disponível. LSP desabilitado (incluindo modo bare) retorna HTTP 200 com `enabled: false`, contagens zero e `servers: []`. LSP habilitado sem servidores configurados retorna `enabled: true`, `configuredServers: 0` e `servers: []`. Se a inicialização falhar antes que o cliente exista, a resposta pode incluir `initializationError`; se um cliente ativo não puder fornecer um snapshot, a resposta incluirá `statusUnavailable: true`.

Esta rota expõe apenas campos estáveis voltados ao cliente. Ela omite intencionalmente internos de depuração como IDs de processo, argumentos de spawn, caudas de stderr, URIs raiz e caminhos de pastas de workspace.

### `GET /session/:id/resources`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/session/path",
  "skills": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "skills": []
  },
  "mcp": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "discoveryState": "completed",
    "servers": []
  }
}
```

Esta rota de proprietário de sessão ativa lê a Config da sessão selecionada através de sua própria conexão ACP. Ela não combina as rotas de status globais do processo ou do nível de workspace, não inicializa um runtime frio, não anexa um cliente e não recorre ao workspace primário. Sessões desconhecidas e somente persistidas retornam a resposta `session_not_found` existente.

Os objetos aninhados usam os contratos exatos de status `GET /workspace/skills` e `GET /workspace/mcp`. Seus campos `workspaceCwd` identificam a Config que produziu o snapshot e correspondem ao valor de nível superior. As regras existentes de redação ainda se aplicam: credenciais e cabeçalhos MCP, valores de ambiente, corpos de Skill e configurações brutas nunca aparecem na resposta. Enriquecimentos de autenticação MCP, pool, orçamento de workspace e erros de descoberta de workspace estão ausentes porque seu estado subjacente é pertencente ao workspace ou chaveado apenas pelo nome do servidor, e não pela sessão. Status, descoberta e contabilização do próprio gerenciador MCP da sessão selecionada permanecem disponíveis.

### Ciclo de vida da sessão autônoma (`standalone_sessions_v1`)

Quando `/capabilities.features` contém `standalone_sessions_v1`, o daemon expõe uma família de rotas global ao processo para sessões autônomas de nível superior pertencentes à sua runtime Conversations dedicada. Essas rotas nunca aceitam um seletor de espaço de trabalho e nunca recorrem ao espaço de trabalho principal. Incorporações diretas que não conseguem construir o grafo completo de dependências de propriedade, runtime, diretório, ciclo de vida e diário de exclusão da Conversations omitem tanto o recurso quanto todas as rotas abaixo.

| Rota | Requisição | Sucesso |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /standalone/sessions` | `{ "sessionId": "<UUID>", "modelServiceId"?: string, "startupConfig"?: { "modelServiceId": string, "reasoningEffort"?: ReasoningSelection }, "approvalMode"?: ApprovalMode }` | `200` com a sessão autônoma, `context: { "kind": "standalone" }` e seu diretório de saída gerenciado sem projeto. A criação é sem prompt. |
| `GET /standalone/session-options` | nenhuma | `200` enquanto a criação local está em andamento, caso contrário `{ v, initialized, current?, approvalMode?, providers, errors? }` com o resumo exato. |
| `GET /standalone/sessions` | Consulta: `cursor?`, `size?` (1-100), `archiveState?` (`active` ou `archived`) | `200 { sessions, nextCursor?, liveMergeFailed?, truncated? }` |
| `GET /standalone/sessions/:id` | Mesmas opções de restauração que `202 { sessionId, state: "creating" }`. | `200` sessão autônoma restaurada sem reprodução do histórico carregado. |
| `POST /standalone/sessions/:id/load` | Apenas opções de restauração existentes: `historyPageSize?`, `liveReplayMode?`, `compactedReplayMode?`, `hideInheritedHistory?`, `approvalMode?`; a identidade do cliente permanece em `X-Qwen-Client-Id`. | `200` sessão autônoma restaurada. |
| `POST /standalone/sessions/:id/resume` | Mesmas opções de restauração que `load`. | `200` sessão autônoma restaurada sem reprodução do histórico carregado. |
| `POST /standalone/sessions/:id/repair-directory` | Corpo vazio ou `{}` | `200` com o diretório gerenciado verificado ou recriado. |
| `PATCH /standalone/sessions/:id/metadata`        | `{ "displayName": string }`                                                                                                                                                          | `200 { sessionId, displayName }`                                                                                                               |
| `GET /standalone/sessions/:id/export` | Consulta: `format=html`, `format=md`, `format=json` ou `format=jsonl` (padrão `html`). | Tipo de conteúdo, nome de arquivo e corpo da exportação existente. |
| `POST /standalone/sessions/archive`              | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { archived, alreadyArchived, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/unarchive`            | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { unarchived, alreadyActive, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/delete`               | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { removed, notFound, errors, fileCleanupPending }`                                                                                        |

Quando `POST /standalone/sessions` carrega o `modelServiceId` legado, a resposta inclui `modelApplied`: `false` significa que a troca de modelo no momento da geração falhou (também exposta via evento de sessão `model_switch_failed`) e a sessão está sendo executada no modelo padrão do agente — a criação em si ainda tem sucesso para que o chamador possa avisar, liberar ou tentar novamente explicitamente.

Os corpos devem ser objetos JSON sem campos desconhecidos. Os IDs são valores RFC UUID v1-v5; o daemon os canoniza para minúsculas. As requisições em lote contêm 1-100 strings e são validadas e deduplicadas antes da mutação. Uma falha em lote é reportada como `{ sessionId, code, message }` e não reverte operações bem-sucedidas em outros IDs. `fileCleanupPending` significa que a exclusão da transcrição foi confirmada, mas a limpeza do sidecar autorizado pelo diário ou do diretório gerenciado deve ser tentada novamente pela reconciliação; a sessão já foi removida logicamente.

Somente transcrições autônomas explícitas e a forma legada de compatibilidade de nível superior documentada são visíveis. Registros filhos, Live, de projeto, worktree, ambíguos, ilegíveis ou com diário de exclusão falham fechados. A criação continua se sua resposta HTTP for desconectada; uma sessão confirmada não é excluída e o cliente da resposta é destacado. Recupere por GET exato seguido de load/resume em vez de tentar criar novamente como um attach.

Arquivar, desarquivar, reparar, renomear e excluir compartilham a mesma admissão de ciclo de vida por sessão que load/resume e prompts. Excluir usa o desvincular da transcrição como seu ponto de confirmação durável e um diário privado além de staging atômico do diretório gerenciado para recuperação de falhas. A recuperação restaura o diretório quando a transcrição permanece intacta e conclui a limpeza quando a transcrição desaparece; qualquer identidade incompatível, caminho conflitante, proprietário externo ou transcrição ambígua retorna um erro estruturado fail-closed.

### `POST /session`

O contrato opcional `startupConfig` é descrito em [Capacidades](#capabilities). Diferentemente da seleção de modelo melhor esforço legada, uma seleção de inicialização rejeitada falha na criação.

Gera um novo agente ou anexa a um existente (sob `sessionScope: 'single'`, o padrão).

Requisição:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread",
  "worktree": { "slug": "feature-a" }
}
```

| Campo | Obrigatório | Notas |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | não | Caminho absoluto correspondendo a um espaço de trabalho registrado. Se omitido, a rota recorre ao espaço de trabalho principal (leia-o de `/capabilities.workspaceCwd`). Um `cwd` não vazio incompatível retorna `400 workspace_mismatch`. Quando `features` contém `multi_workspace_sessions`, os clientes podem passar qualquer `workspaces[].cwd` confiável; caso contrário, apenas o espaço de trabalho principal é aceito. Os caminhos dos espaços de trabalho são canonizados via `realpathSync.native` (com um fallback de resolução apenas para caminhos inexistentes) para que sistemas de arquivos insensíveis a maiúsculas/minúsculas não rejeitem sessões por grafia. |
| `modelServiceId` | não | Seleciona qual _serviço_ de modelo configurado o agente roteará (o provedor back-end — Alibaba ModelStudio, OpenRouter etc.). Se omitido, o agente usa seu padrão. Se o espaço de trabalho já tiver uma sessão, isso chama `setSessionModel` na existente e transmite `model_switched`. Distinto de `modelId` em `POST /session/:id/model`, que seleciona o modelo **dentro** de um serviço já vinculado. O array `modelServices` em `/capabilities` está reservado para anunciar serviços configurados; no Estágio 1, é sempre `[]` (o serviço padrão do agente é usado e não enumerado via HTTP). |
| `startupConfig` | não | `{ modelServiceId: string, reasoningEffort?: ReasoningSelection }`; requer `session_startup_config`, cria uma nova thread e confirma a seleção solicitada sem escrever padrões compartilhados. Não pode ser misturado com `modelServiceId` de nível superior ou escopo único explícito. |
| `sessionId` | não | UUID v1-v5 variante RFC escolhido pelo chamador. O daemon normaliza para minúsculas e sempre cria uma nova sessão de thread; nunca trata este campo como um attach idempotente. Confirme que `caps.features` contém `session_id_override` antes de enviá-lo porque daemons mais antigos podem ignorar campos desconhecidos. `null` é equivalente à omissão. |
| `sessionScope` | não | Substituição por solicitação para compartilhamento de sessão. `'single'` (o padrão global do daemon) faz com que um segundo `POST /session` no mesmo workspace reutilize a sessão existente (`attached: true`); `'thread'` força uma nova sessão distinta a cada chamada. Omita para herdar o padrão global do daemon. Valores fora da enumeração retornam `400 { code: 'invalid_session_scope' }`. Daemons antigos (pré-#4175 PR 5) ignoram silenciosamente o campo — faça pre-flight `caps.features.session_scope_override` antes de enviar. O padrão global do daemon está hardcoded como `'single'` em produção hoje; #4175 pode adicionar uma flag CLI `--sessionScope` em uma atualização futura. |
| `worktree` | não | Cria uma nova sessão de thread em um worktree Git nomeado pelo usuário. O opcional `slug` usa a validação de nome de worktree do daemon. Pre-flight `session_worktree_persistence_v1`; os clientes não devem inferir isolamento durável de respostas antigas com formato de worktree. A criação do worktree não é uma operação de attach e não pode ser combinada com a criação de branch. A rota retorna sucesso apenas após a realocação, criação do marcador de propriedade exclusiva, persistência sidecar e uma verificação final da geração do runtime. |

Resposta:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "worktree": {
    "slug": "feature-a",
    "path": "/canonical/path/.qwen/worktrees/feature-a",
    "branch": "worktree-feature-a"
  },
  "worktreeState": "persisted-v1"
}
```

`attached: true` significa que uma sessão para esse workspace já existia e você está compartilhando-a agora.

`worktreeState` está presente apenas para uma sessão de worktree atestada. A restauração best-effort legada pode retornar `worktree` sem `worktreeState`. Uma restauração fria Part 4A cujo prompt de restauração foi disparado em vez de pausado (`suppressWorktreeContextRestore` desligado, então a rota pediu ao bridge para não adiar) também retorna metadados `worktree` não verificados até que o prompt se resolva: o filho lê ativo sem cwd reportado, a realocação é impossível sob um prompt ativo, e a rota mantém a sessão em vez de matar aquela que o chamador acabou de recuperar. Nenhuma resposta é prova durável de raiz de execução. Um cliente que solicitou isolamento de worktree deve exigir `worktreeState: "persisted-v1"` e o caminho canônico esperado antes de rotear um prompt; uma carga inicial pode ser repetida após o prompt ativo se resolver. Na reanexação SDK, o resultado depende de a resposta ainda carregar metadados `worktree`: uma resposta que os carrega com uma atestação ausente ou um caminho alterado é terminal para esse cliente — a nova anexação é destacada e o prompt não é repetido — enquanto uma resposta sem objeto `worktree` cura-se: o cliente descarta sua reivindicação de worktree em cache, mantém a nova anexação e repete o prompt na mesma chamada. A cura não bloqueia essa repetição, então um turno ainda pode executar em um diretório que o cliente não consegue mais atestar (um `exit_worktree` que o cliente nunca viu é a causa comum, e o cliente não pode distingui-lo de uma associação em memória limpa). Um chamador consciente de isolamento deve, portanto, reverificar a atestação do worktree ele próprio antes de despachar um prompt; a reivindicação descartada apenas faz esse chamador falhar fechado em seu próprio portão de identidade em sua próxima carga ou seleção.

IDs fornecidos pelo chamador são únicos entre todos os runtimes de workspace registrados atualmente e todas as gerações de bridge ainda vivas, incluindo substituições em drenagem. Um duplicado vivo, pendente, ativo, arquivado ou baseado em worktree retorna `409 session_id_conflict`. Valores inválidos retornam `400 invalid_session_id`; uma verificação de proprietário vivo indisponível ou estado persistido retorna `503 session_id_admission_unavailable` repetível. Repita com backoff limitado após mudanças na saúde do bridge ou armazenamento; `retryable` significa que outra tentativa é segura, não que uma repetição imediata terá sucesso. Se o agente downstream retornar um ID diferente, o daemon remove aquele órfão e retorna `500 session_id_not_honored`. Após uma resposta ambígua, carregue ou retome o ID conhecido em vez de repetir create como attach.

Integrações multi-cliente que desejam conversas independentes devem enviar `sessionScope: "thread"` em cada `POST /session`. Use o escopo padrão `single` apenas quando os clientes compartilham intencionalmente uma sessão colaborativa; sessões compartilhadas serializam prompts através de um único FIFO, visível através de `/daemon/status` como `runtime.activity.pendingPrompts` e `runtime.activity.queuedPrompts`.

Chamadas `POST /session` concorrentes para o mesmo workspace são **coalescidas** para um único spawn — ambos os chamadores obtêm o mesmo `sessionId`, exatamente um reporta `attached: false`. Se o spawn subjacente falhar (timeout de init, saída malformada do agente, OOM), **todos os chamadores coalescidos recebem o mesmo erro** — o slot em voo é limpo para que uma chamada subsequente possa tentar novamente do zero.

> ⚠️ **A rejeição de `modelServiceId` em uma nova sessão é silenciosa na resposta HTTP.** Um `modelServiceId` inválido (erro de digitação, serviço não configurado) NÃO gera erro 500 na criação — a sessão permanece operacional no modelo padrão do agente para que o chamador ainda receba um `sessionId` contra o qual possa tentar novamente a troca de modelo (via `POST /session/:id/model`). O sinal de falha visível é um evento `model_switch_failed` no stream SSE da sessão, disparado entre o handshake de spawn e sua primeira assinatura. **Assinantes que precisam observar este evento devem passar `Last-Event-ID: 0` em sua primeira `GET /session/:id/events`** para reproduzir desde o evento mais antigo disponível no ring (cobre o `model_switch_failed` no momento do spawn, mesmo que a assinatura chegue alguns ms após a resposta de criação).

### `GET /session/:id/status`

Retorne o resumo ativo do runtime que possui a sessão. Esta rota não carrega uma sessão somente persistida e nunca recorre ao runtime primário. Pré-verificação `caps.features.session_status`.

```json
{
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "createdAt": "2026-09-10T08:00:00.000Z",
  "clientCount": 1,
  "hasActivePrompt": true,
  "isWaitingForPermission": false,
  "isWaitingForUserQuestion": false,
  "pendingInteractionCount": 0,
  "pendingInteractions": []
}
```

A resposta é o formato de wire `DaemonSessionSummary`. Campos opcionais incluem metadados de exibição e fonte, `activeWorkState`, `updatedAt`, `turnError`, metadados de worktree ou branch e vínculos de PR. `404` significa que nenhum proprietário ativo existe; um proprietário em bootstrap, drenagem ou indisponível retorna `503` em vez de recorrer. Um proprietário não primário não confiável retorna `403 untrusted_workspace`, e um id ativo em mais de um workspace retorna `500 ambiguous_session_owner`. O método do SDK TypeScript é `sessionStatus()`.

### ID fornecido pelo chamador `session/new` ACP

Clientes ACP solicitam o mesmo comportamento através do campo de metadados de extensão:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/new",
  "params": {
    "cwd": "/absolute/path/to/workspace",
    "_meta": {
      "qwen-code/sessionId": "550E8400-E29B-41D4-A716-446655440000"
    }
  }
}
```

A resposta contém o ID normalizado em minúsculas. Montagens ACP primárias e qualificadas por workspace compartilham admissão com REST, incluindo `session/load` e `session/resume`. IDs inválidos usam `INVALID_PARAMS` ACP com `data.httpStatus=400` e `data.errorKind="invalid_session_id"`; conflitos usam `data.httpStatus=409`; verificações de proprietário vivo indisponível ou estado persistido usam `data.httpStatus=503` e `data.retryable=true`.

Uma sessão criada por ACP que nunca recebe um prompt não deixa nenhum rastro persistido, e o daemon a recolhe quando sua conexão proprietária fecha com zero sessões anexadas. Após esse recolhimento, o mesmo ID pode ser criado novamente — isso é ciclo de vida da conexão, não reutilização de ID: enquanto a conexão (ou qualquer anexo) estiver ativa, a admissão rejeita o duplicado.

### `POST /session/:id/load`

`liveReplayMode` e `compactedReplayMode` aceitam `full` (padrão) ou `summary`. Eles projetam `liveJournal` e `compactedReplay` respectivamente sem alterar o histórico armazenado. A seleção de página precede a filtragem, então itens visíveis podem ser menos que `historyPageSize`. Valores inválidos retornam `400 invalid_live_replay_mode` ou `400 invalid_compacted_replay_mode`. O carregamento standalone aceita ambas as opções, mas reporta valores inválidos como `400 invalid_request`.

Restaurar uma sessão ACP persistida pelo id e reproduzir seu histórico via SSE. O id do caminho é autoritativo; qualquer campo `sessionId` no corpo é ignorado. Pré-verificação `caps.features.session_load` — daemons mais antigos retornam `404` para esta rota.

Solicitação:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Campo | Obrigatório | Notas |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | não | Mesma canonização que `POST /session`, com um contrato de ausência mais estrito para restauração: um `cwd` explícito SEM entrada no registro (removido, ou nunca registrado) retorna `404 workspace_not_found` — uma ausência permanente que os chamadores podem classificar como desaparecida — enquanto um workspace cuja entrada existe em um estado reversível (esvaziando, transicionando, bloqueado) ainda retorna `400 workspace_mismatch`. Omitir para herdar `/capabilities.workspaceCwd`. Quando `features` contém `multi_workspace_sessions`, os chamadores podem passar qualquer `workspaces[].cwd` registrado confiável; workspaces não primários não confiáveis retornam `403 untrusted_workspace`. `mcpServers` NÃO é intencionalmente aceito aqui — MCP em todo o daemon é orientado por configurações (corresponde a `POST /session`). |

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

`state` espelha o `LoadSessionResponse` do ACP — `models` é um `SessionModelState`, `modes` um `SessionModeState`, `configOptions` uma matriz de `SessionConfigOption`. Campos ausentes são decididos pelo agente. Anexadores tardios (os caminhos `attached: true` abaixo) obtêm o MESMO instantâneo `state` que o chamador original de carga viu — o daemon o armazena em cache na entrada; mutações de tempo de execução (por exemplo, `model_switched`) são entregues no fluxo SSE, não nas respostas de anexação subsequentes.

`attached: true` significa que a sessão já estava ativa (seja de um `session/load`/`session/resume` anterior, ou porque um chamador concorrente coalescido correu logo à frente).

Quando a sessão persistida possui um worktree da Parte 4A, load/resume valida seu sidecar, contenção canônica e marcador de checkout exato. Um filho ocioso é realocado antes da resposta; um filho ativo é atestado apenas quando seu cwd relatado já é igual ao worktree, e um filho ativo cujo cwd relatado está ausente ou em outro lugar falha fechado em vez de ser movido sob seu prompt — exceto para uma restauração fria que não poderia adiar seu prompt de restauração (`suppressWorktreeContextRestore` desligado — qualquer restauração cuja fonte efetiva não seja propriedade do Channel — ou uma ponte sem a API de adiamento): essa forma ainda retorna `worktree` sem `worktreeState`, não realocada, e a sessão sobrevive. As respostas realocadas e atestadas retornam `worktree` mais `worktreeState: "persisted-v1"`. Classificações tipificadas de 409 do lado da restauração (anunciadas por `session_worktree_reset_v1`): `worktree_session_superseded` quando o sidecar da sessão carrega um link `supersededBy` — a classificação lê apenas esse link, sob a trava de propriedade por checkout e antes de qualquer leitura de marcador, então uma transferência que faz rollback enquanto a carga espera não pode redirecionar o chamador para uma sessão que o mesmo daemon está excluindo; o link é escrito antes que o marcador vire, porém, então o `replacementSessionId` do corpo é um redirecionamento para verificar em vez de prova de que a propriedade mudou: após uma transferência confirmada, os chamadores devem carregar esse id em vez disso e atualizar suas escritas, mas em um estado interrompido pré-confirmação ele nomeia um substituto que não é o proprietário do marcador, cuja própria restauração retorna `worktree_reset_interrupted`, e que o reset tentado novamente então recolhe — então `replacementSessionId` não deve ser persistido como o id da sessão da tarefa até que uma carga dela tenha sucesso; `worktree_reset_interrupted` quando o link `supersedes` da sessão restaurada e o link `supersededBy` da sessão nomeada concordam, mas o marcador nunca se moveu ou está ausente — um reset anterior falhou no meio da transferência e um reset tentado novamente é a reparação; e `worktree_marker_missing` quando o marcador de checkout está ausente sem esse par de links concordantes — reiniciar a tarefa é a reparação, porque nenhum caminho de restauração recria um marcador e uma tentativa de restauração retorna o mesmo 409. A classificação interrompida é verificada primeiro, então um par de links concordantes nunca aparece como `worktree_marker_missing`. Sempre que a fonte efetiva da restauração é propriedade do Channel, a rota suprime a limpeza melhor esforço do agente para a Parte 4A ou estado de sidecar não classificável, então o estado persistido obsoleto, estrangeiro, ambíguo ou com incompatibilidade de propriedade é preservado e falha a solicitação. Os metadados da fonte persistida têm precedência; quando ausentes, a solicitação load/resume fornece a fonte efetiva. Um sidecar legado estruturalmente válido sem o campo `workspaceCwd` da Parte 4A retém a restauração de agente melhor esforço existente, pode ser limpo por esse caminho e pode retornar `worktree` sem `worktreeState`; os clientes não devem inferir isolamento desses metadados de compatibilidade. Além desse caso explícito de compatibilidade legado, apenas sessões cuja fonte efetiva de restauração não é propriedade do Channel retêm a limpeza melhor esforço existente antes da validação da rota. Um sidecar ausente não retorna nenhuma atestação de worktree; clientes cientes de isolamento devem rejeitar essa resposta em vez de vincular novamente a sessão ao workspace compartilhado.

**Replay de histórico via SSE.** Enquanto `loadSession` está em andamento no lado do agente, o agente pode emitir notificações `session_update` para turnos persistidos ou retornar atualizações de replay em massa nos metadados da resposta. O daemon insere esses eventos na janela limitada de snapshot de replay da sessão antes que a resposta da rota seja retornada. Para sessões ao vivo, `POST /session/:id/load` promete apenas essa janela limitada (`compactedReplay`, `liveJournal`, opcionalmente `lifecycleReplay`, `lastEventId`), não a transcrição completa. Quando uma sessão ao vivo ociosa é atualizada a partir de uma página persistida limitada, `lifecycleReplay` complementa essa página com até 1024 frames `session_update` somente de metadados contendo `_meta.executionLifecycle` ou `_meta.toolLifecycle` da janela em memória. O complemento pode sobrepor registros de ciclo de vida persistidos; os clientes devem reduzi-lo idempotentemente e não devem inferir que inícios reproduzidos ainda estão em execução. `lifecycleReplayIncomplete: true` relata cobertura em memória indisponível, degradada ou truncada; `false` não promete uma transcrição completa. Esses campos opcionais não são um armazenamento separado persistido, e daemons mais antigos podem omiti-los. A janela tem limite de bytes por `--compacted-replay-max-bytes` (padrão 4 MiB, máximo 256 MiB); se entradas de replay mais antigas foram descartadas, `compactedReplay[0]` é um marcador `history_truncated` sem ID. O `liveJournal` em andamento é limitado separadamente por `--max-journal-events` (padrão 10 000 entradas de replay) e `--max-journal-bytes` (padrão 8 MiB de eventos de origem serializados). Estes são limites **base** por sessão. Quando um turno em andamento excede esses limites, o daemon tenta primeiro crescimento adaptativo: ele aumenta os limites dessa sessão em direção ao dobro (até um limite rígido por sessão de 256 MiB, entradas escaladas proporcionalmente, limitadas pela margem restante do pool) enquanto o crescimento concedido em todas as sessões ao vivo cabe em um único pool de crescimento global do daemon dimensionado em 5% do orçamento efetivo de memória do daemon — o valor `--memory-budget-mb` quando passado, limitado à memória disponível resolvida, caso contrário 50% da memória detectada automaticamente — limitado a `1024` MB. A contabilização é global ao daemon — um daemon multi-workspace executa uma ponte por workspace e todos compartilham o único pool. O crescimento é sob demanda e apenas na medida permitida pelo pool; um `--max-journal-events` ou `--max-journal-bytes` fixado pelo operador desativa isso, assim como um host cujo orçamento efetivo cai abaixo do mínimo de 1024 MB (`insufficientMemory`): o pool é 0 e o crescimento adaptativo é desativado completamente. Eventos de origem `agent_message_chunk` ou `agent_thought_chunk` compatíveis consecutivos compartilham uma entrada de replay, até 256 eventos de origem por entrada, enquanto fronteiras de ferramentas, atribuição, procedência e mensagens discretas permanecem intactas. Quando o diário ainda excede seus limites (possivelmente aumentados) após o crescimento permitido pelo pool — incluindo quando nenhuma margem é concedida ou uma concessão cobre apenas parte do excesso — as entradas mais antigas são descartadas inteiras (para que a cauda retida possa ser muito menor que o limite de bytes) e um marcador `history_truncated` com `scope: 'live_journal'` é prepended; seus campos `truncatedEvents` e `retainedEvents` contam eventos de origem, não entradas de replay, e seus campos `maxBytes` / `maxEvents` refletem os limites em vigor (que podem já ter crescido). Os clientes devem renderizar esse marcador como status e continuar aplicando os eventos retidos. O acesso completo à transcrição persistida é exposto separadamente através de `GET /session/:id/transcript`.

Os limites de bytes da janela de replay se aplicam após o filho ter reconstruído a transcrição persistida; eles não limitam a leitura JSONL em disco. Uma restauração que excede o orçamento do daemon retorna `504` com um `Retry-After` derivado do orçamento de restauração (limitado a 5-120s) e `{code: "session_restore_timeout", errorKind: "restore_timeout", retryable: true, sessionId, action, timeoutMs}`. O daemon isola a requisição ACP ainda em execução e limpa qualquer sessão tardia em vez de registrá-la. Uma nova tentativa para o mesmo ID retorna `409 restore_in_progress` com `reason: "awaiting_abandoned_cleanup"` e um `Retry-After` do orçamento de restauração (limitado a 5-120s) até que essa limpeza se estabilize. Se a limpeza tardia da restauração for incerta, ou se a restauração abandonada ainda não tiver se estabilizado após um orçamento de restauração completo após seu prazo, novas sessões nesse workspace retornam `503 acp_channel_unavailable` com `reason: "restore_cleanup_failed"` ou `"restore_settlement_overdue"`. Uma inicialização de sessão que expira segue a mesma política de admissão fail-closed para um filho ACP antigo que se estabiliza tarde: limpeza inconclusiva retorna `reason: "new_session_cleanup_failed"`, enquanto uma requisição que permanece não estabilizada por mais um orçamento de inicialização retorna `reason: "new_session_settlement_overdue"`. Um estado de liquidação atrasada é limpo imediatamente após uma falha tardia se estabilizar, ou após um sucesso tardio completar sua limpeza de ID exato; limpeza inconclusiva transiciona para o estado correspondente de falha de limpeza em vez disso. Estados de falha de limpeza duram até que o canal do workspace esvazie e seja reciclado. Sessões já ativas permanecem utilizáveis em ambos os casos.

**Erros:**

- `404` — ID de sessão persistida não existe (`SessionNotFoundError`).
- `404` — `workspace_not_found` quando um `cwd` explícito não possui nenhuma entrada no registro (removida, ou nunca registrada): uma ausência PERMANENTE, distinta dos estados reversíveis abaixo. Corpo: `{ error, code: "workspace_not_found", boundWorkspace, requestedWorkspace }` — sem `workspaceCount`. Um cliente que leu o contrato antigo "404 significa que a sessão sumiu" deve tratar este código como uma falha de roteamento que pode contornar (ex.: re-registrar o workspace), não como evidência de que a sessão foi excluída.
- `400` — `workspace_mismatch` (mesma forma que `POST /session`), incluindo os estados de ciclo de vida reversíveis: um workspace cuja entrada no registro existe mas está drenando, em transição ou bloqueado. Tente novamente quando o workspace se estabilizar; não o classifique como perdido.
- `403` — `untrusted_workspace` quando `cwd` aponta para um workspace não primário não confiável.
- `503` — `session_limit_exceeded` (conta contra `--max-sessions`; restaurações em andamento também são contabilizadas).
- `504` — `session_restore_timeout`; repetível, com um `Retry-After` derivado do orçamento de restauração (limitado a 5-120s) porque o mesmo ID de sessão permanece isolado até que a limpeza tardia se estabilize.
- `504` — `init_timeout`; NÃO repetível, sem `Retry-After`, sem `sideEffectPossible`, sem isolamento instalado. Emitido quando a inicialização do canal expira antes que a requisição de restauração seja despachada (estágio `ensureChannel`); a restauração nunca foi tentada, então nenhum ID de sessão é isolado e nenhuma limpeza está pendente.
- `503` — `acp_channel_unavailable` quando o canal do workspace está fechado para novos trabalhos de sessão. `reason` explica o motivo: `restore_cleanup_failed` quando uma restauração abandonada não pôde ser limpa conclusivamente; `restore_settlement_overdue` quando uma restauração abandonada ainda não se estabilizou após um orçamento completo de restauração depois de seu prazo; `new_session_cleanup_failed` quando uma sessão criada após o tempo limite de inicialização pública não pôde ser fechada conclusivamente; ou `new_session_settlement_overdue` quando a inicialização que excedeu o tempo limite ainda não se estabilizou após um orçamento adicional de inicialização depois de seu prazo. As sessões existentes permanecem disponíveis. Em um runtime de workspace com mais de um motor de execução, qualquer uma dessas quarentenas afeta o canal desse motor em vez disso: suas sessões também não aceitam novos trabalhos (prompts, continuações, solicitações laterais, comandos de shell, mensagens no meio da rodada e inícios de Goal ou workflow retornam o mesmo `503`), sessões estabilizadas são fechadas e novas sessões desse motor continuam recusadas até que a árvore de processos do canal desapareça, com `channel_exit_unverified` enquanto isso não puder ser confirmado. Nesse caso, `workspace_change_unacknowledged` significa que o canal não reconheceu uma alteração no workspace que afeta a sessão (regras de permissão, recarregamento de configurações, o gate do Session Workflow, provedores de modelos ou Skills); um reconhecimento tardio de todas as alterações ausentes encerra essa quarentena antecipadamente. Um estado de atraso na liquidação é resolvido após uma falha tardia se liquidar ou um sucesso tardio concluir sua limpeza por ID exato; uma limpeza inconclusiva transiciona para o estado correspondente de falha na limpeza, que exige que o canal do workspace esvazie e seja reciclado. O corpo contém `retryAfterSeconds` e o cabeçalho um `Retry-After` derivado do orçamento correspondente, para que os clientes usem um backoff na escala do orçamento da operação em vez de consultar no ritmo ordinário de 5 segundos.
- `409` — `restore_in_progress` (um `session/resume` para o mesmo id já está em andamento, ou um novo spawn forneceu um id que uma restauração possui). `Retry-After: 5` enquanto a restauração estiver ativa; uma dica derivada do orçamento uma vez que ela seja isolada como `awaiting_abandoned_cleanup`. Corridas de mesma ação (dois `session/load` concorrentes para o mesmo id) se coalescem — exatamente um retorna `attached: false`, os demais retornam `attached: true` com o mesmo `state`.
- `409` — `session_workspace_conflict` quando o mesmo id de sessão já está ativo ou sendo restaurado por outro runtime de workspace.
- `409` — `session_archived` quando o id existe apenas sob `chats/archive/`; chame `POST /sessions/unarchive` antes de `load` ou `resume`.
- `409` — `session_archiving` quando arquivar ou desarquivar está em andamento para o mesmo id. `Retry-After: 5`.
- `409` — `session_conflict` quando o id existe tanto em `chats/` quanto em `chats/archive/`; exclua a sessão com `POST /sessions/delete` antes de carregar.

### `GET /session/:id/transcript`

Retorna uma página de quadros de replay `session_update` sem id reconstruídos a partir do transcript JSONL persistido ativo. Pré-verificação `caps.features.session_transcript` — daemons mais antigos retornam `404` para esta rota.

Parâmetros de consulta:

| Campo | Obrigatório | Notas |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | não | Cursor base64url opaco retornado pela página anterior. Omitir para a primeira página. O cursor é emitido pelo daemon e verificado contra adulteração; modificá-lo retorna `400 invalid_transcript_cursor`. Ele vincula-se à identidade do arquivo de transcript e ao tamanho de bytes congelado da primeira página; excluir, truncar, substituir ou arquivar o arquivo invalida-o e retorna `409`. |
| `limit` | não | Número alvo de `ChatRecord`s ativos em uma página. Padrão `100`, máximo `500`. Uma página para trás pode expandir para no máximo `3 * limit` registros para preservar limites de turnos e chamadas/resultados de ferramentas. Um registro pode produzir múltiplos quadros de replay, então `events.length` pode ser ainda maior. Valores inválidos retornam `400 invalid_transcript_limit`. |
| `direction` | não | O único valor aceito é `backward`, que inicia uma página nos registros mais recentes. Omita o parâmetro para paginar para frente na primeira página, ou para continuar a direção congelada em `cursor`. Não pode ser combinado com `cursor`, `beforeRecordId`, `atRecordId` ou `snapshot`. |
| `beforeRecordId` | não | Inicia uma página para trás antes deste id de registro. Implica retrocesso, portanto não envie também `direction`. Não pode ser combinado com `cursor` ou `atRecordId`; pode ser pareado com `snapshot`. |
| `compactedReplayMode` | não | `full` (padrão) ou `summary`. Projeta `events` após a seleção da página, então a contagem visível pode ser menor que `limit`. Não altera o histórico armazenado nem a seleção do cursor. Também aceito pela rota de transcript qualificada pelo workspace. Valores inválidos retornam `400 invalid_compacted_replay_mode`. |

Resposta:

```json
{
  "v": 1,
  "sessionId": "persisted-1",
  "events": [
    {
      "v": 1,
      "type": "session_update",
      "data": {
        "sessionUpdate": "user_message_chunk",
        "content": { "type": "text", "text": "..." }
      }
    }
  ],
  "nextCursor": "opaque",
  "hasMore": true,
  "startTime": "2026-07-08T00:00:00.000Z",
  "lastUpdated": "2026-07-08T00:01:00.000Z"
}
```

`events` são apenas quadros de replay: `{ v: 1, type: "session_update", data: SessionUpdate }`. Eles não carregam ids do EventBus, e a resposta nunca inclui `lastEventId`. Chamar esta rota não chama `/load`, anexa um cliente, semeia o EventBus ao vivo, cria uma sessão ao vivo ou altera a janela de replay ao vivo atual. Sessões ativas ao vivo e inativas são ambas reconstruídas pelo método de status somente-leitura do lado filho para que o replay use as mesmas configurações do workspace, diretório de saída do runtime, emissores e semântica de histórico `/load` sem mutar o estado da sessão do daemon.

A primeira página congela o tamanho atual do snapshot JSONL. Páginas subsequentes leem apenas esse prefixo de bytes, então adições após a página 1 não alteram o conjunto de resultados. Se o arquivo desaparecer, for truncado abaixo do tamanho congelado, for substituído por um inode diferente ou for movido para o arquivo morto, a próxima página retorna `409` e o cliente deve reiniciar da página 1 ou pedir ao usuário para reabrir o transcript.

Para proteger a memória e a latência do daemon, snapshots acima do limite de indexação de transcripts falham antes que o daemon escaneie o JSONL. Os clientes recebem `413 transcript_too_large` e devem recorrer ao processamento offline/exportação ou pedir ao usuário para encurtar/arquivar o histórico mais antigo.

`partial: true` e `replayError` podem aparecer se a conversão de replay falhar após produzir alguns quadros. Respostas parciais nunca incluem `nextCursor`, então os clientes não podem silenciosamente paginar além de registros que não foram convertidos.

**Erros:**

- `400` — `limit`, `cursor`, `direction`, `beforeRecordId` ou formato de id de sessão inválido. Os parâmetros de paginação são mutuamente exclusivos: `cursor` não pode ser combinado com `beforeRecordId`, `atRecordId` ou `snapshot`; `snapshot` requer `atRecordId` ou `beforeRecordId`; `atRecordId` requer `snapshot`; e `backward` não pode ser combinado com um cursor ou qualquer âncora de registro.
- `404` — o id de sessão persistida ativa não existe na solicitação da primeira página.
- `409` — `session_archived`, `session_archiving` ou `session_conflict` das mesmas verificações de carregabilidade de `/load`.
- `409` — o snapshot do transcript está indisponível porque o arquivo foi excluído, truncado, substituído ou arquivado após a emissão do cursor; isso também se aplica quando a pré-verificação não consegue mais encontrar o arquivo ativo para uma solicitação de cursor.
- `413` — `transcript_too_large` quando o snapshot congelado do transcript excede o limite de indexação do daemon.
- `413` — `transcript_page_too_large` quando um registro agregado excede o orçamento de página qualificado pelo workspace ou quando a página serializada excede seu orçamento de resposta.

### `GET /session/:id/export`

Baixe a transcrição da sessão ativa persistida do workspace primário. A consulta opcional `format` é `html` (padrão), `md`, `json` ou `jsonl`. Pré-verificação `caps.features.session_export`.

Respostas bem-sucedidas são anexos com um nome de arquivo sanitizado, `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`. O tipo de conteúdo é `text/html`, `text/markdown`, `application/json` ou `application/jsonl` de acordo com o formato selecionado. A rota lê apenas o armazenamento persistido: ela não resolve um proprietário ativo, inicia ACP ou anexa um cliente. Use a rota qualificada por workspace abaixo quando o alvo estiver possivelmente em um workspace não primário. Formatos inválidos retornam `400 invalid_export_format`; sessões ativas ausentes retornam `404`; armazenamento arquivado, em transição ou conflitante retorna `409`. O método do SDK TypeScript é `exportSession()`.

### `GET /workspaces/:workspace/session/:id/transcript`

Retorne a mesma projeção `DaemonSessionTranscriptPage` que a rota singular do JSONL persistido ativo do workspace registrado selecionado. Pré-verificação `workspace_persisted_transcript`; esta capacidade é independente de `multi_workspace_sessions` e funciona para um primário de workspace único confiável selecionado por id ou cwd.

O seletor e os parâmetros de consulta seguem as regras existentes de workspaces plurais e transcrições. Runtimes primários e secundários confiáveis e runtimes secundários não confiáveis podem ler. Um primário não confiável retorna `403 untrusted_workspace`. Conteúdo arquivado não é retornado.

Para esta rota qualificada por workspace, `limit` é a contagem máxima de registros para páginas diretas. Uma página reversa pode expandir para no máximo `3 * limit` registros para que turnos e pares de chamada/resultado de ferramenta permaneçam intactos. Uma página pode parar antes no orçamento de fonte persistida de 4 MiB e retornar um cursor de continuação. Respostas serializadas têm limite de 32 MiB e cursores de 64 KiB. Se o estado de reprodução exceder o limite do cursor, a página retorna seus eventos convertidos com sucesso com `partial: true`, `hasMore: false` e sem `nextCursor`.

Páginas diretas e páginas de cursor são implementadas inteiramente dentro do processo daemon. Uma primeira página reversa para uma sessão ativa primeiro cruza uma barreira de flush de ponte de workspace de um registro para que a cauda persistida esteja atualizada; essa barreira pode iniciar o ACP e carregar configurações do workspace. A leitura da página persistida em si não analisa agentes ou habilidades definidos pelo projeto nem cria/repara `session-transcript-cursor-key`. Os quadros de ferramenta usam nomes e descrições de ferramentas persistidos sem consultar o registro de ferramentas do runtime. Sua chave de cursor HMAC existe apenas na memória do daemon, é isolada por workspace e gira ao reiniciar; um cursor de um processo daemon anterior retorna `400 invalid_transcript_cursor`.

### `GET /workspaces/:workspace/session/:id/export`

Exporte a sessão persistida ativa do workspace registrado selecionado como um anexo. Pré-verificação `workspace_session_export`; não infira suporte a partir de `session_export` ou `workspace_qualified_rest_core`. O seletor resolve primeiro como id exato do workspace, depois como cwd absoluto codificado em URL após canonicalização. Ambos os runtimes primário e secundário devem ser confiáveis. Um runtime não confiável retorna `403 untrusted_workspace` antes da validação de sessão ou formato.

O parâmetro de consulta opcional `format` é `html` (padrão), `md`, `json` ou `jsonl`. O corpo, o tipo MIME, a sanitização do nome do arquivo, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` e a disposição do anexo correspondem a `GET /session/:id/export`. A rota legada permanece vinculada ao armazenamento primário.

A rota plural lê apenas o JSONL persistido ativo do workspace selecionado sob o coordenador de arquivo compartilhado existente. Ela não escaneia outros repositórios de workspace, recorre ao primário, resolve um proprietário ativo, chama a ponte de workspace, inicia o ACP, anexa um cliente nem carrega configurações. Um id de sessão que existe apenas em outro workspace retorna `404 { code: "session_not_found" }`; sessões arquivadas retornam `409 session_archived`. Formatos inválidos retornam `400 invalid_export_format`, e corridas de armazenamento mantêm os erros `session_archiving` e `session_conflict` existentes.

### `GET /workspaces/:workspace/session/:id/archive/export`

Exporte a sessão persistida arquivada do workspace registrado selecionado como um anexo. Pré-verificação `workspace_archived_session_export`; o suporte não pode ser inferido a partir de exportações ativas ou capacidades principais plurais. A resolução do seletor de workspace e as verificações de confiança são executadas antes da validação de id de sessão e formato.

Os chamadores do SDK TypeScript usam `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)`. O método sempre usa REST nativo e retorna a projeção de anexo `DaemonSessionExportResult` existente.

O parâmetro de consulta opcional `format`, o corpo da resposta, o tipo MIME, o nome de arquivo sanitizado, a política de cache, o cabeçalho de segurança e a disposição do anexo são idênticos à exportação de workspace ativa. O JSONL de origem arquivado tem limite de 256 MiB antes da reconstrução; um arquivo maior retorna `413 transcript_too_large` com `sessionId`, `snapshotSize` e `maxBytes`. A exportação ativa mantém seu comportamento de tamanho existente.

A rota lê apenas `chats/archive/<id>.jsonl` no workspace confiável selecionado sob uma locação do coordenador de arquivo compartilhado. Ela não inspeciona conteúdo ativo para fallback, escaneia outro workspace, resolve um proprietário ativo, chama uma ponte, inicia o ACP, anexa um cliente nem carrega configurações. Um id somente ativo retorna `409 { code: "session_not_archived" }`; um id ausente retorna `404 { code: "session_not_found" }`; arquivos ativos e arquivados simultâneos retornam `409 session_conflict`; e uma transição de arquivamento retorna `409 session_archiving` com `Retry-After: 5`.

### `POST /session/:id/resume`

Restaure uma sessão ACP persistida por id SEM reproduzir o histórico via SSE. O contexto do modelo é restaurado internamente no lado do agente (via `geminiClient.initialize` lendo `config.getResumedSessionData`); o fluxo SSE permanece limpo para clientes que já têm o histórico renderizado. Pré-verificação `caps.features.session_resume`; `unstable_session_resume` permanece como um alias de compatibilidade obsoleto para clientes antigos.

Aceita os mesmos campos `cwd`, `approvalMode`, `sourceType` e `sourceId` que `/load`. Os campos de replay somente para carregamento `historyPageSize`, `liveReplayMode` e `compactedReplayMode` não são analisados, validados nem encaminhados aqui — eles são ignorados silenciosamente, correspondendo ao esquema publicado da solicitação de retomada. Mesmo formato de resposta — `state` espelha o `ResumeSessionResponse` do ACP. Mesmo envelope de erro, incluindo `409 restore_in_progress` (que é acionado quando um `session/load` está em andamento; `session/resume` competindo atrás de outro `session/resume` se coalescem).

Use `/load` quando o cliente não tem histórico renderizado (reconexão fria, seletor → abrir). Use `/resume` quando o cliente já tem os turnos na tela e só precisa recuperar o identificador do lado do daemon.

> ⚠️ **Por que `unstable_session_resume` ainda é anunciado?** A rota HTTP do daemon e a capacidade `session_resume` são estáveis para v1, mas a ponte ainda chama o `connection.unstable_resumeSession` do ACP. A tag antiga permanece apenas para que SDKs lançados antes de `session_resume` possam continuar funcionando.

### `POST /session/:id/worktree-reset`

Transfere a propriedade do checkout de uma sessão de worktree Part 4A persistida para uma nova sessão substituta. Pré-verificação `session_worktree_reset_v1` — daemons mais antigos retornam `404` para esta rota. A rota é como o Channel redefinir tarefas nomeadas `/clear` reinicia uma tarefa de worktree sem descartar seus arquivos: a substituta recebe uma conversa totalmente nova, e a sessão suplantada mantém seu transcript no catálogo, mas nunca pode ser restaurada novamente.

Corpo da solicitação (todos os campos são opcionais):

```json
{
  "cwd": "/canonical/path",
  "modelServiceId": "service-id",
  "approvalMode": "plan",
  "sourceType": "channel",
  "sourceId": "dingtalk-main"
}
```

`cwd` segue a mesma resolução que `POST /session/:id/load` e pode ser omitido para o workspace principal do daemon. Os campos de metadados carimbam a sessão substituta com as mesmas convenções de escopo de thread e origem de uma criação de worktree.

Em caso de sucesso, a rota retorna `200` com a resposta de criação da sessão substituta — o novo `sessionId`, `workspaceCwd`, `currentCwd` igual ao caminho canônico verificado do worktree, metadados `worktree` e `worktreeState: "persisted-v1"`. Os chamadores descartam seu handle no id antigo e usam o id substituto a partir daí; a restauração posterior do id antigo retorna `worktree_session_superseded` com `replacementSessionId`, que os clientes também podem usar para autocura de registros obsoletos — mas apenas após uma carga bem-sucedida desse id. A classificação é decidida apenas pelo link do sidecar, e esse link é escrito antes que o marcador seja alterado, então uma transferência interrompida pré-commit entrega um substituto que não é o proprietário do marcador, cuja própria restauração retorna `worktree_reset_interrupted`, e que a redefinição tentada novamente colhe.

Esta rota nunca lê `X-Qwen-Client-Id`, então o substituto inicia desanexado — mas a resposta de sucesso não está livre de registro. Uma nova transferência cunha um `clientId` estilo-proprietário para aquele spawn, registra-o na substituta e reporta-o no corpo; uma retomada idempotente de uma transferência confirmada não reporta nenhum. O id cunhado não é uma anexação (a contagem de anexos da substituta permanece inalterada, então `killSession` com `requireZeroAttaches` ainda a vê como desanexada), mas um registro de cliente ativo é exatamente o que impede a limpeza ociosa do daemon: desanexe um id que você não continua usando, ou a substituta permanecerá ativa indefinidamente — e uma substituta que ainda está ativa sem marcador é a forma que uma redefinição posterior se recusa a desmontar. Trate a resposta como a identidade da substituta e anexe-a através da superfície normal `POST /session/:id/load` ou `/resume` quando um cliente registrado for necessário.

A transferência é serializada por checkout contra restaurações de worktree e outras redefinições, recusa-se a executar enquanto qualquer uma das sessões estiver ocupada (prompt em andamento ou interação pendente) e arma uma barreira de admissão na sessão suplantada: enquanto armada, nove escritores são recusados com `worktree_reset_active` na admissão — `POST /session/:id/prompt`, `/rewind`, `/cd`, `/branch`, `/fork`, `/shell`, `/goal`, `/tasks/:taskId/workflow-action` e `/messages/delete`. Os outros oito estão cercados porque cada um move o cwd da sessão ou inicia trabalho nele sem passar pela admissão de prompt: um comando shell executa no cwd efetivo da sessão, que para uma sessão de worktree realocada é o próprio checkout; um agente fork executa suas ferramentas nesse cwd; um rewind restaura arquivos relativos a ele; um cd move-o, incluindo para um subdiretório do checkout; um branch muta o histórico persistido da sessão suplantada e gera uma sessão derivativa enquanto a propriedade está em fluxo; um objetivo `resume` promove um turno enfileirado e enfileira uma continuação; a exclusão de mensagens reescreve o histórico persistido; e uma ação de workflow executa um workflow salvo ou um script fornecido pelo chamador, ou reinicia uma execução ativa, através do próprio registro de ferramentas da sessão. `POST /session/:id/continue` não é uma décima barreira: ele conduz uma continuação aceita através da admissão de prompt cercada e é recusado lá. Essa lista é toda a cerca, e a cerca não é tudo o que chega ao filho — os caminhos de liberação e parada permanecem utilizáveis durante a transferência por design (cancelar uma tarefa, limpar um objetivo, desanexar um cliente, matar a sessão), e o enfileiramento de notificação de fundo interno do daemon — um reconhecimento de conclusão de uma subsessão para sua mãe, que nenhuma rota HTTP chama — também não está cercado, porque enfileira uma notificação em vez de iniciar um turno. O último passo da transferência rompe os registros de clientes da sessão suplantada, limpa sua associação de worktree em memória e reporta se a sessão suplantada realmente desapareceu. Um sobrevivente — um filho que ainda detém trabalho de fundo, então o fechamento ocioso disparado pelo último desanexo é recusado e adiado — é exposto em vez de mascarado: o daemon registra isso, a barreira permanece armada nessa entrada como a única cerca restante, e o corpo `200` carrega `supersededSessionLive: true` para que o chamador saiba que o id suplantado ainda está vivo e pode ser reanexado dentro do checkout cuja propriedade acabou de mudar. A segurança contra falhas é por janela, e a ordem de escrita define as janelas: o link `supersededBy` do sidecar antigo é escrito primeiro, depois o sidecar do substituto carregando `supersedes`, e o marcador muda por último. Uma falha antes da mudança deixa portanto a sessão antiga autoritativa em uma de três formas que uma nova tentativa distingue — nenhum link (o substituto é um órfão comum e uma nova tentativa simplesmente inicia uma nova transferência), apenas o link reverso com o sidecar do substituto ausente (uma nova tentativa falha fechada com `worktree_reset_invalid_state` e deixa o estado interrompido intocado para reparo do operador), ou ambos os links presentes (uma nova tentativa reverte a transferência parcial e completa uma nova — a menos que o substituto interrompido não possa ser removido porque um cliente ainda está anexado a ele, caso em que a reversão falha fechada com `worktree_reset_invalid_state` e mantém ambos os links, então uma nova tentativa posterior converge assim que esse cliente se for). Uma falha após a mudança deixa o substituto autoritativo e uma nova tentativa retoma como uma operação nula. A sessão antiga nunca é excluída e o checkout do worktree nunca é removido pela redefinição.

**Erros:**

- `404` — `session_not_found` quando o registro da sessão não existe.
- `409` — `worktree_reset_unsupported` quando a sessão não possui um sidecar válido da Parte 4A (não é uma sessão de worktree).
- `409` — `worktree_reset_active` quando uma sessão envolvida na transferência está ocupada; tente novamente quando ela estabilizar. A admissão de qualquer escritor coberto pela barreira — um prompt, rewind, mudança de cwd, branch, fork, comando shell, controle de objetivo ou ação de tarefa de workflow — em uma sessão durante a transferência falha com o mesmo código.
- `409` — `worktree_reset_invalid_state` para sidecar corrompido, marcador inválido, falha de contenção ou um par inconsistente de links de substituição. Não destrutivo para o que esta solicitação iniciou: qualquer transferência parcial iniciada por esta solicitação é revertida antes que o chamador a veja, enquanto os ramos de retomada fail-closed — um marcador inválido, um par de links de substituição que não concorda (incluindo um link reverso cujo sidecar de substituição está ausente), um proprietário de marcador ambíguo e uma substituição que ainda está ativa neste daemon enquanto o marcador está ausente — deixam o estado interrompido pré-existente intacto para reparo pelo operador, de modo que essa forma permaneça visível para um reset ou restore posterior. Uma nova tentativa contra um desses estados o relê e retorna o mesmo 409: ele não converge, portanto o estado precisa de reparo pelo operador em vez de um loop de novas tentativas. O motivo específico é escrito no log do daemon, não na conexão.
- `500` — erros internos fail-closed (por exemplo, uma ponte sem suporte a reset, ou uma rejeição de realocação após rollback); não repetíveis como estão. Um `500` difere em tipo: uma transferência de marcador cuja própria cauda pós-commit falhou _após_ o flip ter sido duravelmente commitado reporta que a propriedade foi movida, nunca executa o rollback destrutivo e é reparada tentando novamente o reset, que retoma a transferência commitada idempotentemente.

### `GET /workspace/:id/session-info` and `GET /workspaces/:workspace/session-info`

Retorna contagens agregadas de sessões persistidas para o workspace selecionado sem alterar o caminho paginado da lista de sessões:

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

`active`, `archived` e `total` contam sessões JSONL locais visíveis ao usuário; sessões de host de daemon internas e sessões de tarefas de agentes de workspace (`sourceType` `agent-host` e `agent`) são excluídas dessas contagens e de todas as listagens de sessões; uma pessoa ainda abre uma sessão de agente por id. `live` é a contagem correspondente de pontes em memória visíveis ao usuário e é omitida para um workspace secundário não confiável registrado porque essa leitura apenas-persistida não deve consultar o estado ativo. `expensive` é sempre `true` e `cost` é sempre `"disk_scan"`; os clientes devem chamar este endpoint com pouca frequência em vez de fazer polling. Se a varredura atingir seu limite de segurança ou não conseguir classificar todos os arquivos candidatos, a resposta adiciona `"truncated": true` e as contagens persistidas são limites inferiores. Armazenamento ausente retorna contagens persistidas zero. A rota plural usa o mesmo seletor de workspace e política de confiança que o catálogo de sessões plural; um primário não confiável ainda retorna `403 untrusted_workspace`.

O SDK TypeScript do daemon expõe a rota plural através de `workspaceById(...)` ou `workspaceByCwd(...)`, seguido por `getWorkspaceSessionInfo()`.

### Biblioteca de artefatos de sessões do workspace

`workspace_artifact_library` additionally anuncia consultas em todo o workspace e operações em lote:

| Método | Rota | Entrada |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/artifact-library` | Todas as sessões ativas, descarregadas e arquivadas no workspace |
| POST | `/workspaces/:workspace/artifact-library/query` | `{ "sessionIds": ["session-id"] }` |
| POST | `/workspaces/:workspace/artifact-library/delete` | `{ "artifacts": [{ "sessionId": "session-id", "artifactId": "artifact-id" }] }` |

Ambos os corpos POST são objetos estritos contendo 1–100 entradas. IDs ou pares duplicados são processados uma única vez. As respostas de consulta são `{ "v": 1, "sessions": [<session artifact envelope>], "errors": [<member error>] }`. Cada erro de membro contém `sessionId`, `status`, `code` e `message`. A descoberta completa omite sessões ausentes/estrangeiras; uma consulta explícita as reporta. Outras falhas de membros permanecem explícitas enquanto as sessões bem-sucedidas são retornadas.

Com `workspace_artifact_library_stream`, cada envelope de sessão da biblioteca de artefatos (incluindo o GET existente de sessão única) adicionalmente contém:

```json
{
  "session": {
    "displayName": "Task title",
    "createdAt": "2026-10-26T00:00:00.000Z",
    "archiveState": "archived",
    "sourceType": "scheduled_task",
    "sourceId": "task-id"
  }
}
```

`displayName` e `sourceId` são opcionais. `createdAt` é o horário original de criação da sessão, inclusive após a retomada; não é um timestamp de artefato. `archiveState` é `active` ou `archived`. Tipos de fonte são strings abertas e atribuição ausente torna-se `default`. Fontes como `resource_inspection` são preservadas para que os clientes possam excluí-las explicitamente. Um ID de fonte é pareado com seu tipo de fonte original. Nomes seguem o título atual ao vivo ou o título personalizado persistido/primeiro prompt. A resposta genérica `/session/:id/artifacts` permanece inalterada.

O GET completo e o POST de sessão selecionada também aceitam `Accept: text/event-stream`. Sem essa negociação, eles retornam a resposta JSON acima. Use streaming baseado em fetch para POST; verifique a capacidade e o tipo de conteúdo da resposta em daemons mais antigos. A sequência SSE finita é:

| Evento | Dados |
| --------------- | -------------------------------------------------------------------------------- |
| `start`         | `{ "v": 1, "total": <candidate sessions> }`                                      |
| `session` | Um envelope completo da biblioteca de artefatos incluindo `session` |
| `session_error` | `{ "v": 1, "sessionId": "...", "status": 404, "code": "...", "message": "..." }` |
| `complete`      | `{ "v": 1, "total": 10, "succeeded": 8, "failed": 1, "skipped": 1 }`             |
| `error` | Fatal `{ "v": 1, "status": 503, "code": "...", "message": "..." }` |

Os resultados chegam na ordem de conclusão com até quatro leituras de sessão concorrentes; uma sessão lenta não bloqueia outros workers. O JSON mantém a ordem de seleção. Sessões ausentes/estrangeiras na consulta completa contam como `skipped`; falhas na consulta explícita emitem `session_error`. `total` conta candidatos, não artefatos. Apenas `complete` marca uma varredura concluída. `error` fatal ou desconexão sem `complete` significa resultados parciais; não há cursor de replay, reconexão automática ou assinatura. Comentários de heartbeat podem ocorrer enquanto aguarda. Falhas iniciais usam códigos de status HTTP comuns; após cabeçalhos SSE, erros fatais são eventos de stream. Uma requisição desconectada para de despachar novas leituras; cargas de cache compartilhado já em execução podem terminar. O backpressure limita quadros de resultado pendentes e não retém barreiras de arquivo enquanto espera pelo cliente.

A remoção em lote retorna `{ "v": 1, "results": [...] }`. Cada resultado contém `sessionId` e `artifactId`, além do envelope de mutação existente (`v`, `changes`, `warnings`/`warningDetails` opcionais) ou `error: { status, code, message }`. Artefatos ausentes são alterações vazias idempotentes. Os clientes devem inspecionar cada resultado e aviso de persistência; uma resposta de lote 200 não significa que todos os membros tiveram sucesso. A remoção é agrupada por sessão, não é transacional entre sessões, preserva arquivos reais e requer a mesma autoridade estrita de operador que a remoção de artefato único. Entrada inválida retorna 400 `invalid_artifact_library_request`; erros no nível do workspace mantêm códigos de status HTTP comuns.

Artefatos e títulos ao vivo vêm da ponte; metadados de identidade persistidos limitados preservam o horário original de criação e a atribuição de fonte. Metadados não carregados, incluindo resultados vazios, são armazenados em cache por runtime com um orçamento de tamanho serializado de 32 MiB. Arquivos inalterados não são reproduzidos em consultas repetidas ou após um TTL. Identidades de metadados de transcrição e propriedade são verificadas em cada leitura; entradas alteradas são reconstruídas. A descoberta de candidatos é armazenada em cache pela identidade do diretório e atualizada na primeira consulta pelo menos dois segundos após uma varredura concluída, inclusive quando timestamps de diretório não mudam. Essa atualização apenas por nome de arquivo preserva caches de artefatos inalterados. Leituras frias concorrentes compartilham uma carga; cada requisição processa até quatro sessões por vez. Entradas inalteradas admitidas são retidas; novos resultados excedendo o orçamento são retornados sem cache para que varreduras completas repetidas não expulsem todo o cache. Essas sessões sem cache, ou uma reinicialização do daemon, exigem reconstrução. Isso evita análise JSONL repetida para entradas em cache, mas verificações de sistema de arquivos e tamanho da resposta ainda escalam com o workspace. A disponibilidade de arquivos frios mantém a semântica existente apenas de metadados.

O GET existente da biblioteca de artefatos de sessão única compartilha este mesmo cache com consultas completas e em lote, adicionando apenas o resumo `session` à sua resposta e mantendo formatos de erro existentes. Aquecer uma rota beneficia as outras; remoções únicas e em lote invalidam a entrada compartilhada. Anexos de transcrição apenas de título e movimentos de arquivo também atualizam metadados; títulos ao vivo são lidos em cada requisição sem esperar pela persistência em disco. Metadados persistidos ao vivo e envelopes frios compartilham o mesmo orçamento de 32 MiB, e transições ao vivo/frio reconstroem a entrada. O `generatedAt` de um envelope em cache é seu horário de criação da projeção.

`session_artifact_library` anuncia esses endpoints com escopo de workspace persistido:

| Método | Rota | Resultado |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/session/:id/artifact-library` | O envelope de artefatos da sessão, incluindo registros persistidos para sessões não carregadas e arquivadas. |
| DELETE | `/workspaces/:workspace/session/:id/artifact-library/:artifactId` | O resultado da mutação do artefato. Um registro já ausente retorna `changes: []`. |

O seletor de workspace resolve para um runtime confiável. Ambas as rotas rejeitam proprietários ativos ambíguos e um proprietário ativo em outro runtime antes de acessar os artefatos. Elas participam da barreira interna de atividade do runtime; leituras seguram a barreira compartilhada de arquivamento de sessão e remoções a seguram exclusivamente. Nenhuma rota carrega um agente ou desarquiva a sessão. A exclusão requer autoridade de operador do daemon através do portão de mutação estrito; ela não requer `X-Qwen-Client-Id`. Os endpoints de artefatos existentes pertencentes ao cliente mantêm suas regras de autorização.

Leituras frias reproduzem registros de artefatos persistidos e retornam metadados e localizadores como `workspacePath` relativo ao workspace, `managedId` ou `url`. Eles preservam timestamps registrados e reportam avisos de compatibilidade por artefato sem marcar a persistência bem-sucedida como indisponível. `limits.maxArtifacts` descreve o limite de registro da loja ativa; uma projeção fria não expulsa registros históricos para impor esse limite.

A exclusão fria anexa uma lápide explícita durável. Ela preserva os arquivos do workspace e libera referências de instantâneo de pré-visualização web gerenciadas pelo daemon não referenciadas usando a limpeza melhor esforço existente. A exclusão ativa pode retornar HTTP 200 com `changes: []`, `warnings` e `warningDetails` se a persistência falhar; os chamadores devem inspecionar o resultado e reter o registro. Falhas de escrita fria são retornadas como erros.

Ambas as rotas retornam `409 artifact_library_unavailable` quando a persistência de artefatos está desabilitada. Sessões desconhecidas retornam `404 session_not_found`; armazenamento de projeto externo é tratado como não encontrado, e armazenamento ambíguo ou não regular retorna `409 session_storage_conflict`. Registros de conversa incompletos ou um diário de mutação não autoritativo retornam `409 session_transcript_corrupt`, distinto de `session_transcript_changed` de um escritor concorrente. Leituras acima de 64 MiB retornam 413. A mutação de execução gerenciada fria retorna `409 artifact_mutation_requires_managed_authority`. As respostas de erro de propriedade e ciclo de vida do workspace existentes também se aplicam.

### `GET /workspace/:id/sessions` and `GET /workspaces/:workspace/sessions`

Lista sessões cujo workspace canônico corresponde a `:id` ou `:workspace`. O parâmetro de caminho primeiro resolve como um id exato do workspace e depois como um cwd absoluto codificado em URL. Os workspaces primários incluem a mesclagem existente persistida/ao vivo: a lista padrão é de sessões ativas de `chats/`; passe `archiveState=archived` para listar sessões arquivadas de `chats/archive/`. Workspaces não primários confiáveis incluem sessões persistidas ativas de seu próprio armazenamento `chats/` e mesclam resumos ao vivo correspondentes sem duplicatas; se não houver sessões persistidas ativas, a rota preserva o comportamento anterior de cursor somente ao vivo. Workspaces não primários confiáveis também suportam `archiveState=archived`, a lista organizada `view=organized` e filtros `group`, lendo de seus próprios armazéns `chats/`, `chats/archive/` e de organização de sessões; uma consulta combinada `view=organized&archiveState=archived` retorna apenas sessões arquivadas sem mesclagem ao vivo. Workspaces não primários registrados não confiáveis suportam as mesmas formas de lista, filtro e paginação, mas retornam apenas entradas persistidas: o daemon não consulta a ponte ao vivo nem popula interações pendentes, erros de turno ou estado do cliente a partir do runtime. Padrões persistidos como `clientCount: 0` e `hasActivePrompt: false` permanecem presentes para compatibilidade de wire. Armazenamento ausente retorna uma lista vazia. A rota plural ainda retorna `403 { code: "untrusted_workspace" }` para um primário não confiável; rotas primárias legadas mantêm seu comportamento de compatibilidade existente. `archiveState=all` não é suportado na v1. Listas primárias e baseadas em persistência mantêm a semântica numérica `cursor` existente; o fallback ao vivo para não primários confiáveis sem persistência mantém seu cursor ao vivo opaco existente.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

Quando `workspace_qualified_rest_core` é anunciado, operações em lote de sessão com escopo de workspace, CRUD de grupos e mutação de organização de sessão estão disponíveis sob `/workspaces/:workspace/sessions/{delete,archive,unarchive}`, `/workspaces/:workspace/session-groups` e `/workspaces/:workspace/session/:id/organization`. Para um secundário não confiável, GET de grupo permanece disponível; cada mutação de grupo, sessão e organização permanece restrita por confiança. Rotas de mutação de lote e organização sem workspace permanecem exclusivas para o workspace primário por compatibilidade.

Parâmetros de consulta:

| Campo | Obrigatório | Notas |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | não | `active` (padrão) ou `archived`. Qualquer outro valor retorna `400 { code: "invalid_archive_state" }`. |
| `cursor` | não | Cursor de paginação da resposta anterior. |
| `size` | não | Tamanho da página. Valores inválidos retornam `400 { code: "invalid_cursor" }` ou a validação de tamanho de página existente. |
| `view` | não | Omitir para a lista recente legada. `organized` opta pela ordenação de fixados/grupos no lado do servidor e adiciona campos opcionais de organização. Qualquer outro valor retorna `400 { code: "invalid_session_view" }`. |
| `group` | não | Significativo apenas com `view=organized`. `all` (padrão), `pinned`, `ungrouped` ou um id de grupo personalizado. Ids de grupo desconhecidos retornam `404 { code: "group_not_found" }`. |

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

Com `view=organized`, o daemon lê `<Storage.getProjectDir(cwd)>/session-organization.v1.json`, retorna sessões fixadas primeiro, depois tempo de atividade decrescente e então `sessionId` para empates estáveis. O cursor organizado é JSON base64url opaco e não deve ser reutilizado com a lista recente legada. `pinned` é um filtro virtual, não um grupo. `groupId: null` significa não agrupado. Sessões arquivadas mantêm seus metadados de organização, mas `archiveState=archived&view=organized` ainda retorna apenas sessões arquivadas.

Cursors ordenados por atividade — a visão organizada e as listas filtradas `parentSessionId` / `sourceType` — não são isolados por snapshot, e uma lista ativa confiável ordena linhas pelo mais tardio entre o mtime da transcrição e a marca d'água de atividade ao vivo. Uma marca d'água ao vivo é apenas em memória, então a chave de uma sessão pode regredir para seu mtime quando a entrada ao vivo se aposenta entre duas buscas de página. O cursor compensa: ele carrega as identidades já emitidas em uma chave derivada ao vivo — retendo-as enquanto a linha estiver ausente da coleção de uma página e enquanto uma virada de fixação poderia readmiti-las — e as exclui pelo resto da passagem, então o movimento de chave derivada ao vivo retorna uma sessão no máximo uma vez por passagem. A garantia está limitada ao carregamento: ela tem limite de 64 identidades (identidades excedentes em uma passagem degradam para uma duplicata no máximo uma vez, em vez de um erro), e uma linha somente persistida emitida antes que seu estado de fixação mudou nunca é carregada, então uma desfixação entre buscas pode retornar essa linha uma segunda vez exatamente como antes deste campo existir. Chamadores que acumulam páginas devem, portanto, sempre indexar linhas por `sessionId`, não apenas no caso de mais de 64. Linhas ainda podem se mover ou ser puladas sob atividade concorrente, exatamente como antes; um chamador que precisa de uma visão coerente recarrega da primeira página após uma mudança de atividade.

Campos adicionais podem aparecer em cada sessão quando `view=organized`:

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

Listas ativas confiáveis incluem campos de sobreposição do daemon ao vivo como `clientCount`, `hasActivePrompt` e `activeWorkState`. Listas de secundário não confiável e arquivadas são somente armazenamento: campos de sobreposição ao vivo permanecem ausentes ou falsos, e entradas arquivadas definem `isArchived` como `true`. Matriz vazia (não 404) quando não existem sessões — uma UI de seleção de sessão não deve dar erro apenas porque o workspace está ocioso.

### `POST /sessions/catalog`

Leia catálogos de sessão paginados independentemente para vários workspaces registrados em uma única solicitação. Pré-verifique `session_catalog_batch` uma vez; daemons mais antigos retêm os endpoints de lista de sessão e grupo qualificados por workspace. Cada membro do lote possui propriedade de workspace persistido: autenticação e admissão de solicitação são globais ao processo, enquanto cada entrada resolve e lê apenas seu workspace proprietário. Ele nunca registra um workspace, cria uma sessão, inicia ACP ou faz fallback para o runtime primário.

```json
{
  "workspaces": [
    { "workspace": "workspace-a", "cursor": "previous-a-cursor" },
    { "workspace": "/canonical/workspace-b" }
  ],
  "options": {
    "size": 20,
    "archiveState": "active",
    "view": "organized",
    "group": "all"
  },
  "includeGroups": true
}
```

`workspaces` é uma matriz ordenada de 1–20 entradas `{ workspace, cursor? }`, ou `"all"` para selecionar todos os workspaces registrados públicos. Seletores resolvem como ids exatos antes de caminhos absolutos canônicos. `all` exclui Conversations internas e entradas removidas, inclui entradas temporariamente indisponíveis e falha se mais de 20 entradas forem selecionadas; chamadores devem então dividir seleções explícitas. Um registro público vazio retorna um resultado vazio. Seletores internos explícitos retornam um erro de entrada sem iniciar o runtime interno.

`options` compartilhados aceitam `size` (inteiro 1–100, padrão 20), `archiveState`, `view`, `group`, `parentSessionId`, `sourceType` e `sourceId` com os filtros de lista e combinações existentes. `group` e `parentSessionId` são limitados a 256 caracteres. `includeGroups` padrão é false. Cada workspace tem seu próprio cursor. Páginas padrão do lote usam ordenação por atividade e cursors opacos, incluindo para sessões somente ao vivo; esses cursors não são intercambiáveis com cursors de lista numéricos legados. Continue com o `cwd` e `nextCursor` retornados dessa entrada, preservando os filtros. Não há ordenação global nem cursor de paginação global.

```json
{
  "workspaces": [
    {
      "workspace": "workspace-a",
      "workspaceId": "workspace-a",
      "cwd": "/canonical/workspace-a",
      "sessions": [],
      "groups": {
        "groups": [],
        "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
      }
    },
    {
      "workspace": "/canonical/workspace-b",
      "error": {
        "code": "workspace_not_found",
        "message": "Workspace is not registered with this daemon.",
        "status": 404
      }
    }
  ]
}
```

O resultado preserva a ordem da seleção e o seletor original como `workspace`. As entradas bem-sucedidas incluem `cwd` canônico, `workspaceId` e os campos de página existentes (`sessions`, `nextCursor` opcional, `truncated` e `liveMergeFailed`). O `workspaceCwd` de cada sessão retornada é normalizado para o `cwd` canônico da entrada que a contém. Quando solicitado, `groups` contém o catálogo completo de grupos; as identidades dos grupos são escopadas ao workspace que os contém. As leituras de grupo mantêm a normalização existente e o fallback de aviso-e-vazio para lojas de organização malformadas ou ilegíveis. As entradas com falha contêm `error: { code, message, status }` e identidade resolvida quando disponível, sem uma lista `sessions` vazia bem-sucedida. Lotes válidos retornam HTTP 200 mesmo quando algumas entradas falham. Envelopes de solicitação malformados retornam HTTP 400 antes das leituras de armazenamento.

Workspaces desconhecidos, internos e removidos produzem `404 workspace_not_found`; gerações de runtime indisponíveis ou alteradas produzem `503 workspace_runtime_unavailable`; um primário não confiável produz `403 untrusted_workspace`. Secundários não confiáveis mantêm a política de catálogo somente-persistido existente, sem leituras de bridge ao vivo, escritas de reparo ou registro de sessões de depuração. Falhas de cursor e grupo lançadas mantêm seus códigos existentes; outras falhas de leitura lançadas tornam-se `500 session_catalog_failed`. Entradas ativas confiáveis podem mesclar o estado do bridge ao vivo existente; entradas arquivadas permanecem somente-armazenamento.

O daemon executa no máximo quatro leituras de workspace simultaneamente por lote, limita seletores a 4096 caracteres e cursores a 16384 caracteres, e limita cada entrada bem-sucedida serializada a 512 KiB. Uma entrada excessivamente grande retorna `413 catalog_response_too_large`; reduza `size` ou omita grupos antes de tentar novamente. Isso limita a resposta do lote a aproximadamente 10 MiB mais sobrecarga de envelope/erro. A desconexão do cliente cancela leituras pendentes e impede que leituras adicionais de workspace sejam iniciadas. O limite de corpo JSON do daemon existente e os limites de varredura persistida também se aplicam. Solicitações de catálogo usam o nível de limite de taxa de leitura.

### `POST /sessions/live-state`

Leia instantâneos de estado ao vivo para 1–20 workspaces registrados explicitamente selecionados em uma única solicitação. O corpo estrito é `{ "workspaces": ["workspace-id", "/absolute/workspace/path"] }`; os seletores resolvem como ids exatos de workspace antes dos caminhos absolutos canônicos. A resposta é `{ "workspaces": [...] }` na ordem da solicitação. Cada entrada bem-sucedida inclui seu seletor `workspace` original, `workspaceId` e `cwd` canônicos, além do mesmo instantâneo `v: 1`, `catalogVersion` e `sessions` completo da rota de workspace único abaixo. Os instantâneos são independentes; não há atomicidade entre workspaces nem feed de sessões mesclado. Ambas as rotas compartilham exposição de versão de catálogo e invalidação de cache, então alternar entre elas preserva o contrato de reconciliação de catálogo de workspace único. Um lote válido retorna HTTP 200 e `Cache-Control: no-store` mesmo se algumas entradas falharem.

Cada entrada com falha contém `workspace`, `workspaceId` e `cwd` resolvidos opcionais, e `error: { code, message, status }` sem uma lista `sessions` vazia bem-sucedida. Seletores desconhecidos, internos ou removidos retornam `404 workspace_not_found`; gerações de runtime indisponíveis ou substituídas retornam `503 workspace_runtime_unavailable`; workspaces primários ou secundários não confiáveis retornam `403 untrusted_workspace`; falhas inesperadas de bridge retornam `500 session_live_state_failed`. Uma entrada bem-sucedida excedendo 512 KiB retorna `413 live_state_response_too_large`. Envelopes inválidos, chaves extras, arrays vazios, mais de 20 seletores e seletores com mais de 4096 caracteres retornam HTTP 400 `invalid_session_live_state_batch_request` antes de qualquer leitura de bridge. A rota lê apenas o bridge em memória de cada runtime ativo selecionado, nunca catálogos persistidos ou filhos ACP; leituras de membros são executadas sequencialmente, e o POST é cobrado pelo nível de limite de taxa de leitura do daemon.

### `GET /workspaces/:workspace/sessions/live-state`

Retorne o instantâneo de sessão ao vivo somente-memória do runtime do workspace selecionado mais uma versão de catálogo em memória, para que os clientes possam parar de consultar o catálogo persistido em `GET /workspaces/:workspace/sessions` para estado volátil como `hasActivePrompt`, flags de espera e `clientCount`. Pré-verificação `workspace_session_live_state`; a tag é independente de `workspace_qualified_rest_core`, então daemons antigos anunciando a capacidade REST de workspace mais ampla não implementam esta rota. O seletor resolve primeiro como id exato de workspace, depois como cwd absoluto codificado em URL após canonização, correspondendo às outras rotas plurais de sessão. A rota é somente-confiável para runtimes primários e secundários: ela nunca recorre ao runtime primário e não usa a política permissiva de catálogo persistido que concede leituras de catálogo limitadas a um secundário não confiável. O endpoint não possui parâmetros de consulta e não realiza operações de armazenamento de sessão, configurações, comando externo ou ida e volta ACP, portanto seu custo é independente da contagem de sessões persistidas e do tamanho JSONL; o limite padrão de sessão ao vivo mantém a resposta limitada, e com o limite desativado o custo permanece proporcional apenas ao número de sessões ao vivo.

Resposta:

```json
{
  "v": 1,
  "catalogVersion": {
    "generation": "7eca3164-bce1-4f50-94d8-c842c480f213",
    "revision": 17
  },
  "sessions": [
    {
      "sessionId": "session-123",
      "clientCount": 1,
      "hasActivePrompt": true,
      "activeWorkState": "active",
      "isWaitingForPermission": false,
      "isWaitingForUserQuestion": false,
      "updatedAt": "2026-08-18T08:12:30.123Z"
    }
  ]
}
```

`v` é a versão do esquema de resposta. Toda resposta bem-sucedida inclui `Cache-Control: no-store`. `sessions` é o conjunto completo, não paginado e não ordenado de sessões atualmente vivas no runtime selecionado; um runtime ao vivo vazio retorna `200` com `sessions: []`. `clientCount`, `hasActivePrompt`, `isWaitingForPermission` e `isWaitingForUserQuestion` são campos obrigatórios de transmissão, e valores de bridge opcionais ausentes projetam para `0` ou `false`. `activeWorkState` é aditivo à transmissão e ausente em daemons antigos: `active` significa que o daemon possui trabalho não resolvido ou o filho enviou um novo instantâneo de retenção não vazio; `idle` é emitido apenas para um novo instantâneo vazio cobrindo todas as categorias obrigatórias; `unknown` significa que a relatoria negociada está obsoleta ou incompleta; e `unsupported` significa que o filho não negociou a relatoria. Isso não altera `hasActivePrompt`: um shell em segundo plano, turno cron ou notificação terminal pendente é trabalho ativo sem se tornar um prompt em primeiro plano. Campos estáticos de catálogo como nome de exibição, tempo de criação, organização e metadados de origem são deliberadamente excluídos e permanecem de propriedade do catálogo completo. Uma linha de estado ao vivo ausente apenas limpa os campos voláteis de uma linha de catálogo conhecida; ela nunca exclui uma linha de catálogo persistida.

`updatedAt` é um watermark de atividade opcional observado pelo daemon, presente quando um prompt que atingiu o estado de execução publicou um terminal formal na ponte atual. Ele avança exatamente uma vez por cada terminal desse tipo — sucesso, erro, cancelamento e prazo limite igualmente — sendo escrito antes que o evento de terminal seja publicado, e é estritamente crescente por sessão ativa mesmo quando dois terminais caem no mesmo milissegundo do relógio de parede ou o relógio de parede retrocede; portanto, um salto adiante do relógio persiste até que o tempo de parede o alcance. Nunca é anterior ao `createdAt` da sessão: o primeiro avanço tem como piso o momento da criação, então um rollback do relógio de parede entre a criação e o primeiro terminal não pode indexar uma linha atrás do `createdAt` em que ela já estava listada. Admissão de prompts, esperas na fila, atualizações transmitidas, cancelamento apenas na fila, heartbeats e esperas de interação nunca o fazem avançar. Os clientes o usam para atualizar a recência de uma linha de catálogo que já possuem, em vez de recarregar todo o catálogo após um turno concluído. Não é um reconhecimento de persistência: o gravador escreve os resultados dos turnos de forma assíncrona, então o valor prova apenas que o daemon observou uma tentativa em execução se estabelecer. Está ausente antes do primeiro terminal em execução em uma geração de ponte — incluindo para uma sessão restaurada do disco — então a ausência não é uma sonda de suporte, e desaparece quando uma reinicialização do daemon ou substituição do runtime do workspace instala uma nova ponte. Quando existem tanto um resumo ativo quanto um persistido para uma sessão, as respostas completas do catálogo reportam o timestamp válido mais recente, então `GET /session/:id/status`, que retorna o resumo da ponte diretamente sem essa mesclagem, pode reportar um valor anterior do que uma resposta de lista.

`catalogVersion` é um token de igualdade para mudanças de catálogo observadas pelo daemon. `generation` é um UUID aleatório criado com cada instância de ponte e muda na reinicialização do daemon ou substituição do runtime do workspace; `revision` começa em zero e aumenta monotonicamente dentro de uma geração. A única operação suportada é a igualdade sobre o par inteiro: mesma geração e revisão significa nenhuma mudança de catálogo observada pelo daemon, e qualquer diferença significa recarregar todo o catálogo. Os clientes não devem realizar aritmética de revisão nem comparar revisões entre gerações, e incrementos extras conservadores são permitidos. A versão cobre mudanças de membros do catálogo e metadados estáticos observados pelo daemon; atividade comum de turno, ciclo de vida do prompt, anexar/desanexar e transições de estado de espera não o fazem avançar porque o snapshot ativo já carrega os campos voláteis correspondentes. Uma mudança em `updatedAt` sob uma versão inalterada é, portanto, válida e esperada, e não invalida os caches de listas persistidas do daemon. Dois valores de overlay volátil estão deliberadamente fora de ambos os sinais: estado de erro de turno (`hasTurnError`/`turnError`) e contagem/conteúdo de interação pendente (`pendingInteractionCount`/`pendingInteractions`) não avançam a versão nem aparecem no snapshot, então um cliente que precisa deles deve continuar lendo o fluxo de eventos por sessão ou o catálogo completo em vez de depender desta rota; qualquer campo pode ser adicionado de forma aditiva na transmissão quando um consumidor concreto o exigir. Mutações escritas diretamente por outro daemon, uma TUI ou um processo externo não são observadas, então assim que um cliente para o polling periódico do catálogo completo, essas escritas não têm tempo de descoberta limitado e surgem apenas após uma recarga explícita completa, outra mutação de catálogo observada, reconexão ou substituição do daemon/runtime.

Os clientes reconciliam um bundle de catálogo com um handshake de duas leituras: leia o estado ativo A, carregue a lista completa de sessões (mais `GET /workspaces/:workspace/session-groups` quando o cliente consome `session_organization`), depois leia o estado ativo B. Versões iguais de A e B aceitam o bundle; versões diferentes marcam o catálogo como obsoleto e coalescem no máximo uma recarga final em vez de entrar em um loop de retry apertado. Cada solicitação de catálogo aceita deve ser iniciada após A — uma solicitação ou promessa deduplicada que começou antes de A não pode satisfazer a reconciliação. Recargas impulsionadas pela versão são single-flight por workspace e obedecem a um intervalo mínimo de fundo não-zero, então churn sustentado do catálogo não pode levar a uma varredura completa do catálogo por poll de estado ativo; mutações locais explícitas ainda podem solicitar uma atualização imediata através da mesma operação single-flight.

**Erros:**

- `400` — comportamento existente de validação de seletor ou `workspace_mismatch` para um seletor desconhecido, malformado, aninhado ou não registrado; a rota nunca resolve um seletor desconhecido para o runtime primário.
- `403` — `untrusted_workspace` para qualquer runtime não confiável, incluindo um primário não confiável.
- `503` — `workspace_runtime_unavailable` com `Retry-After` para um runtime em bootstrap, transição, drenagem, bloqueado ou removido, ou uma geração de runtime que fecha durante a solicitação.
- `500` — erros locais inesperados usam o mapeamento de erros de ponte existente.

### `GET /workspace/:id/session-groups`

Lista grupos de sessões definidos pelo usuário para um workspace. O seletor GET singular aceita qualquer id de workspace registrado ou cwd canônico codificado em URL. O alias GET plural também está disponível para um secundário não confiável e lê apenas o sidecar da organização. As mutações de grupo plurais permanecem protegidas por confiança, enquanto as mutações de grupo singulares mantêm seu comportamento de compatibilidade somente-primário. Pre-flight `caps.features.includes('session_organization')`.

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

As cores são tokens de protocolo apenas; os clientes localizam os nomes de exibição. Nenhum grupo padrão nomeado por cor é criado.

### `POST /workspace/:id/session-groups`

Cria um grupo de sessões personalizado. Gate de mutação estrito. Pre-flight `caps.features.includes('session_organization')`.

Solicitação:

```json
{ "name": "Frontend", "color": "blue" }
```

`name` é aparado, deve ter 1-64 caracteres, não pode conter caracteres de controle e é único dentro do workspace por comparação aparada case-insensitive. Nomes duplicados retornam `409 { code: "group_name_conflict" }`. `color` deve ser uma das `colorOptions` retornadas.

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

Atualiza um grupo de sessões personalizado. Gate de mutação estrito. Pre-flight `caps.features.includes('session_organization')`. Campos do corpo são opcionais: `{ "name"?: string, "color"?: string, "order"?: number }`. Ids de grupo desconhecidos retornam `404 { code: "group_not_found" }`; nomes e cores duplicados/inválidos usam os mesmos erros da criação.

### `DELETE /workspace/:id/session-groups/:groupId`

Exclui um grupo de sessões personalizado. Gate de mutação estrito. Pre-flight `caps.features.includes('session_organization')`. Sessões referenciando o grupo são limpas para `groupId: null`; o estado fixado é preservado. A resposta é `{ "deleted": true }` quando um grupo foi removido e `{ "deleted": false }` quando o id não existia.

### `POST /sessions/delete`

Exclusão definitiva de um ou mais arquivos JSONL de sessões persistidas. O daemon primeiro fecha sessões ativas em melhor esforço, então remove o JSONL ativo ou arquivado. Se ambas as cópias, ativa e arquivada, existirem para o mesmo id, ambas são removidas. Sidecars de worktree em ambos os lados são limpos; histórico de arquivos, transcrições de subagentes e sidecars de runtime são intencionalmente preservados.

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

Arquiva uma ou mais sessões. A arquivamento é uma transição de estado, não uma exclusão: o JSONL move-se de `chats/<id>.jsonl` para `chats/archive/<id>.jsonl`. O histórico de arquivos, as transcrições de subagentes e os sidecars de tempo de execução permanecem no lugar. Se a sessão estiver ativa, o daemon primeiro realiza um fechamento estrito e exige que o manipulador de fechamento do agente ACP grave a gravação do chat; se o fechamento ou a gravação falharem, o JSONL não será movido. Pré-verificação `caps.features.session_archive`.

Solicitação:

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true, "requireIdle": true }
```

`sessionIds` deve ser uma matriz de strings não vazia com no máximo 100 ids. Duplicatas são eliminadas.

Resposta:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts` é opcional e tem valor padrão `false`. Por padrão, arquivos ativos e arquivados com o mesmo id são reportados em `errors`, e nenhuma cópia é movida, removida ou sobrescrita. Arquivar uma sessão ao vivo ainda executa o fechamento estrito descrito acima antes de classificar o conflito, para que o fechamento possa gravar registros na fila na transcrição ativa. Com `resolveConflicts: true`, o arquivamento repara o conflito apenas quando ambas as cópias são arquivos de transcrição regulares que o workspace selecionado pode manter, incluindo transcrições vazias ou danificadas de propriedade. Ele mantém a cópia arquivada, remove a cópia ativa e reporta o id em ambos `archived` e `resolvedConflicts`. A opção não ignora verificações de propriedade; propriedade mista local/estrangeira ou ambígua é reportada em `errors`, e nenhuma cópia é movida. Entradas `errors` têm `{ "sessionId": "<uuid>", "error": "message" }`.

`requireIdle` é opcional e tem valor padrão `false`. Os clientes devem pré-verificar `session_archive_idle_guard` antes de enviá-lo. Com `requireIdle: true`, um proprietário ao vivo cujo estado de trabalho ativo é ativo, desconhecido ou não suportado retorna essa sessão em `errors`; o daemon não a fecha nem move sua transcrição. A verificação e a transição para o fechamento ocorrem em um único turno de plano de controle do runtime proprietário, para que novos trabalhos não possam entrar entre eles. Uma sessão persistida cujo filho ao vivo já foi coletado permanece elegível para arquivamento.

Uma sessão somente arquivada é retornada em `alreadyArchived` após o daemon adquirir um lease de escritor ou manutenção para reconciliar a limpeza pendente de sidecar. Se outro processo ainda mantiver o lease de escritor, o id somente arquivado é reportado em `errors` até que o lease fique disponível.

A movimentação da transcrição ou reparo de conflito não é revertida se uma verificação posterior de propriedade de limpeza falhar. Nesse caso, o id pode aparecer apenas em `errors`, embora o estado de arquivamento já tenha mudado, e pode ser omitido de `archived` e `resolvedConflicts`. Repita a mesma solicitação de ciclo de vida para o mesmo workspace antes de tratar o erro como prova de que a cópia ativa ou o conflito permanece. Quando o serviço puder verificar a identidade da transcrição armazenada e adquirir o lease de escritor ou manutenção necessário, a repetição reporta o estado autoritativo `alreadyArchived` mesmo para transcrições vazias ou danificadas que a listagem de sessões omite, e retoma a limpeza pendente de sidecar. Transcrições cuja identidade armazenada não pode ser verificada continuam a reportar `errors` na repetição e exigem inspeção manual; repetições que não conseguem adquirir o lease necessário permanecem em `errors` até que ele fique disponível.

Conflitos de ciclo de vida são resultados de itens de lote: as rotas sem workspace e qualificadas por workspace retornam HTTP `200` com o conflito em `errors`. Isso substitui o envelope anterior HTTP `409 session_conflict` qualificado por workspace; clientes que chamaram essa rota devem inspecionar a resposta do lote. Lotes REST de runtime interno preservam a mensagem de conflito segura enquanto continuam a redigir outros detalhes de falha por sessão.

### `POST /sessions/unarchive`

Restaura sessões arquivadas para o diretório ativo. Isso não retoma a sessão por si só; apenas move `chats/archive/<id>.jsonl` de volta para `chats/<id>.jsonl`. Após o sucesso do desarquivamento, os clientes podem chamar `POST /session/:id/load` ou `POST /session/:id/resume`.

Solicitação:

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true }
```

Resposta:

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts` é opcional e tem valor padrão `false`. Por padrão, arquivos JSONL ativos e arquivados simultâneos produzem um conflito em `errors`, e nenhuma cópia é movida, removida ou sobrescrita; uma sessão somente ativa é retornada em `alreadyActive` após o daemon adquirir um lease de escritor ou manutenção para reconciliar a limpeza pendente de sidecar. Se uma sessão ao vivo ainda mantiver o lease de escritor, o id somente ativo é reportado em `errors` até que essa sessão seja fechada. Com `resolveConflicts: true`, o desarquivamento repara o conflito apenas quando ambas as cópias são arquivos de transcrição regulares que o workspace selecionado pode manter, incluindo transcrições vazias ou danificadas de propriedade. Ele mantém a cópia ativa, remove a cópia arquivada e reporta o id em ambos `unarchived` e `resolvedConflicts`. A opção não ignora verificações de propriedade; propriedade mista local/estrangeira ou ambígua é reportada em `errors`, e nenhuma cópia é movida. Arquivamento ou desarquivamento em andamento para o mesmo id retorna `409 session_archiving` antes de iniciar o lote.

A movimentação da transcrição ou reparo de conflito não é revertida se uma verificação posterior de propriedade de limpeza falhar. Nesse caso, o id pode aparecer apenas em `errors`, embora o estado de arquivamento já tenha mudado, e pode ser omitido de `unarchived` e `resolvedConflicts`. Repita a mesma solicitação de ciclo de vida para o mesmo workspace antes de tratar o erro como prova de que a cópia arquivada ou o conflito permanece. Quando o serviço puder verificar a identidade da transcrição armazenada e adquirir o lease de escritor ou manutenção necessário, a repetição reporta o estado autoritativo `alreadyActive` mesmo para transcrições vazias ou danificadas que a listagem de sessões omite, e retoma a limpeza pendente de sidecar. Transcrições cuja identidade armazenada não pode ser verificada continuam a reportar `errors` na repetição e exigem inspeção manual; repetições que não conseguem adquirir o lease necessário, inclusive porque uma sessão ativa ainda o mantém, permanecem em `errors` até que o lease fique disponível.

ACP-over-HTTP usa os mesmos corpos de solicitação e resposta através dos métodos de fornecedor `_qwen/sessions/archive` e `_qwen/sessions/unarchive`. A tabela de rotas REST mapeia `POST /sessions/archive` e `POST /sessions/unarchive` para esses métodos para transportes ACP.

### Roteamento de sessões ao vivo multi-workspace

Quando `multi_workspace_sessions` é anunciado, operações de sessão ao vivo identificam seu workspace a partir do `sessionId`; os clientes não adicionam um seletor de workspace à URL. Além das operações de ciclo de vida roteadas pelo proprietário existentes, isso se aplica a `PATCH /session/:id/metadata`, `POST /session/:id/recap`, `POST /session/:id/generate`, `POST /session/:id/btw`, `POST /session/:id/btw/stream`, `DELETE /session/:id/btw/stream/:requestId`, `POST /session/:id/mid-turn-message`, `GET /session/:id/mid-turn-messages`, `POST /session/:id/mid-turn-messages/send-now`, `DELETE /session/:id/mid-turn-messages/:messageId`, `POST /session/:id/tasks/:taskId/cancel`, `POST /session/:id/goal/clear`, `POST /session/:id/continue`, `POST /session/:id/language`, `POST /session/:id/artifacts`, `DELETE /session/:id/artifacts/:artifactId`, `GET /session/:id/sources`, `POST /session/:id/sources` e `DELETE /session/:id/sources/:sourceId`. O daemon roteia cada solicitação para o runtime confiável que possui a sessão ao vivo. Um proprietário não confiável não primário retorna `403 untrusted_workspace`, um proprietário ao vivo ausente retorna `404 session_not_found` e um proprietário ambíguo falha fechado com `500 ambiguous_session_owner`.

Esta regra é exclusiva para sessões ao vivo e não torna todas as rotas de sessão sem workspace cientes de múltiplos workspaces. Operações persistidas ou arquivadas usam suas rotas qualificadas por workspace documentadas. `POST /session/:id/branch`, `POST /session/:id/fork` e `POST /session/:id/cd` permanecem intencionalmente apenas primários e retornam `non_primary_session_route_not_supported` para proprietários não primários.

### Mensagens durante o turno

`POST /session/:id/mid-turn-message` aceita `{ "message": "...", "messageId": "<optional-message-id>" }`. Uma admissão bem-sucedida retorna `{ "accepted": true, "messageId": "<id>" }` e transfere a propriedade para o daemon: a mensagem é drenada para o turno ativo ou promovida para a fila FIFO de prompts normal quando a sessão fica ociosa. Clientes usando `session_mid_turn_message_query` enviam um `messageId` estável; repeti-lo é idempotente enquanto permanece na fila, pendente ou nos anéis de reconciliação limitados. Uma rejeição de uma solicitação que o daemon validou retorna `{ "accepted": false }` e nunca transfere a propriedade: uma sessão aberta sem prompt admitido em sua fila FIFO de prompts e sem um turno Goal ativo reporta `{ "accepted": false, "reason": "session_idle" }` para que o cliente possa reenviar a mensagem como um prompt comum em vez de exibir uma falha. Para uma nova admissão genuína, um bloco `content` referenciando um anexo que a sessão não possui mais — ou uma referência inválida — é recusado antes dos veredictos de ocioso e fila: a solicitação recebe resposta `410 session_attachment_gone` (ou `400 invalid_session_attachment_reference`) com um corpo `{ "error", "code" }`, que não carrega `reason` mesmo quando a sessão está ociosa. Dois portões anteriores o precedem: um `messageId` repetido cuja carga útil ainda corresponde se resolve idempotentemente com `{ "accepted": true, "messageId" }` mesmo que o anexo tenha sido removido desde então, e uma sessão que está fechando ou autorizando um fechamento é recusada com um `{ "accepted": false }` sem motivo. O veredicto descreve apenas o que pode drenar uma mensagem durante o turno, não tudo o que a sessão pode conter — um instantâneo da sessão ainda pode reportar `hasActivePrompt: true` para ela, por exemplo, enquanto um prompt de restauração diferido está estacionado. Uma rejeição sem motivo tem outra causa — a fila está cheia, a sessão está fechando ou autorizando um fechamento, o orçamento de anexos inline enfileirados está esgotado, ou um `messageId` repetido não corresponde mais à carga útil que o daemon possui. O daemon mantém a carga útil que já admitiu em vez de substituí-la, mas isso não é uma promessa de entrega: uma mensagem promovida que o cliente removeu desaparece dos instantâneos de prompts pendentes imediatamente — uma que não começou é descartada onde está, uma que já está sendo executada é ocultada até que seu turno abortado se resolva — portanto, a resposta de remoção é o único `removed = true` que um cliente observa. Uma sessão em fechamento nunca promove o que permanece na fila, e um turno que se resolve enquanto um fechamento ainda está sendo autorizado entrega a fila ao portão de admissão, que a recusa, então essas mensagens são descartadas em vez de promovidas e não entram em nenhum anel. Um fechamento que o filho então recusa deixa a sessão ativa com o que permaneceu na fila ainda listado e nada agendado para promovê-lo até que algum turno posterior termine. Essas mensagens ainda pertencem ao daemon, então a recuperação padrão é esperar: o settle do próximo turno promove o backlog, nada é perdido e nada é entregue duas vezes. Um cliente que não pode esperar — nenhum turno adicional virá e o usuário está observando uma fila que não será drenada — pode forçar a drenagem em vez disso, e a única maneira suportada é liberar cada carga útil antes de enviá-la novamente. Ambos os caminhos começam pelo mesmo conjunto: construa-o a partir do próprio registro do cliente sobre o que ele enfileirou durante essa janela menos aquilo para o qual ele tem evidência positiva de entrega, não a partir do silêncio da listagem. A consulta não é um inventário do que o daemon possui — ela omite um prompt já marcado como removido, ambos os anéis são limitados, e um enqueue enviado sem um id de cliente não é rastreado nesta superfície de forma alguma — então um id não reportado em lugar nenhum pode ter expirado após a entrega, sido descartado sem entrega, ou nunca ter sido listado. Evidência positiva de entrega é um eco `mid_turn_message_injected`, um `pending_prompt_started` para esse id, ou associação a qualquer um dos anéis.

O POST no meio do turno também aceita `eventDetailMode` opcional: `full` (padrão) ou `summary`; valores inválidos retornam `400 invalid_event_detail_mode`. O daemon retém esse modo com a mensagem e o usa se uma mensagem não drenada se tornar um novo prompt. Drenar para um turno existente não altera o modo desse turno. Enquanto estiver na fila ou promovido e pendente, uma nova tentativa sob o mesmo `messageId` deve corresponder ao texto, mídia e modo efetivo (omitido equivale a completo). O Web Shell envia seu modo de Provedor atual. A rota REST ainda rejeita novas admissões ociosas com `reason: "session_idle"`; os chamadores então enviam um prompt comum.

Para forçar a drenagem, `DELETE /session/:id/mid-turn-messages/:messageId` todo id nesse conjunto que a consulta ainda reporta como na fila, e somente então publique o texto novamente sob um novo `messageId`, porque um id repetido é confirmado idempotentemente e rearma nada. A ordem importa e se aplica ao conjunto inteiro em vez de um id por vez: uma carga útil ainda na fila que o daemon possui é promovida pelo próximo settle, então republicar um id cuja carga útil nunca foi liberada entrega essa mensagem duas vezes — uma vez dessa promoção e uma vez do reenvio. Onde `session_mid_turn_message_mutation` não é anunciado, não há maneira de liberar uma carga útil, então esperar é a única opção segura. Nenhum veredicto DELETE estabelece entrega por si só. `{ "removed": false }` cobre um id já injetado ou concluído — entregue, então não deve ser republicado — e, conforme a rota DELETE abaixo, dois outros casos. Um é um id que uma drenagem ainda retém, que também não deve ser republicado. Uma consulta posterior lista-o em `settledMessageIds`, mas isso não é final: se a drenagem falhar, o id sai do anel e retorna à fila sem um evento. O parágrafo de envio imediato abaixo descreve quando as mensagens de uma drenagem que expirou são perdidas. O outro é um id não encontrado, que para aquele que a consulta acabou de listar como na fila significa que saiu da fila entre as duas chamadas e pode ter sido descartado sem entrega pelo caminho de autorização de fechamento acima; decida esse caso pela própria evidência do cliente. `{ "removed": true }` libera a carga útil, mas para um id que um settle promoveu nessa janela, cobre tanto uma entrada FIFO cortada antes de ser despachada, que é seguro republicar, quanto um abort de um prompt promovido que já havia começado, que um reenvio então envia uma segunda vez. Um id promovido também permanece deletável pela mesma rota até que se resolva, embora a listagem não o reporte mais como na fila. O próprio reenvio é uma admissão durante o turno e pode ser recusado `{ "accepted": false, "reason": "session_idle" }`; isso não é uma falha, mas o sinal descrito acima de que a sessão agora aceita um prompt comum, e submeter pela rota comum inicia um turno cujo settle promove o que ainda estiver na fila — que é a mesma razão pela qual todo id no conjunto precisa ser liberado primeiro.

A ausência de `reason` não é, portanto, evidência de uma sessão ocupada. Daemons anteriores a `reason` omitem esse campo em todos os casos, então os clientes mantêm sua própria detecção de ociosidade junto com ele. Novos clientes conectados a um daemon mais antigo detectam a falta dessa capacidade e mantêm seu fallback local legado.

`GET /session/:id/mid-turn-messages` retorna a fila da sessão inteira gerenciada pelo daemon, além dos anéis limitados `settledMessageIds` e `promotedMessageIds`. IDs resolvidos foram injetados ou explicitamente excluídos; IDs promovidos entraram na FIFO normal de prompts. Um ID presente em qualquer um dos anéis não deve ser reenviado.

Quando uma mensagem na fila é drenada para o turno ativo, o daemon publica `mid_turn_message_injected` contendo arrays alinhados `messages` e `messageIds` (e o `promptId` do turno em execução, quando conhecido). É um sinal transitório de deduplicação, não um item de transcrição: os clientes resolvem callbacks de conclusão registrados sob esses IDs de mensagem e descartam quaisquer linhas pendentes locais para elas. Daemons mais antigos também carregam `originatorClientId` no payload. Um eco perdido é recuperado do anel de resolvidos por meio da consulta acima.

O agente drena a fila sempre que um lote de ferramentas termina, então uma mensagem admitida enquanto uma resposta do modelo está sendo transmitida aguarda essa resposta e seu lote de ferramentas. Quando `session_mid_turn_send_now` é anunciado, um cliente de sessão conectado pode chamar `POST /session/:id/mid-turn-messages/send-now` para que as mensagens na fila sejam entregues imediatamente: se um turno em primeiro plano, incluindo uma continuação de objetivo, estiver transmitindo uma resposta do modelo, o agente drena a fila imediatamente, interrompe aquela resposta, mantém a parte já transmitida na conversa e continua o mesmo turno com as mensagens. Uma resposta que iniciou uma chamada de ferramenta anunciada pelo provedor, mesmo que seus argumentos ainda estejam sendo transmitidos, não é interrompida, e ferramentas em execução nunca são interrompidas: as mensagens permanecem na fila e são entregues com os resultados das ferramentas, ou promovidas ao próximo prompt quando uma ferramenta encerra o turno. Alguns provedores anunciam uma chamada de ferramenta apenas quando seus argumentos estão completos, e tal chamada ainda pode ser interrompida. Em alguns casos, as mensagens já saíram da fila, mas não recebem resposta naquele turno. Quando o dreno de envio imediato já foi enviado enquanto o provedor anuncia uma chamada de ferramenta que então encerra o turno, ou enquanto o turno é parado, as mensagens são mantidas na conversa e na transcrição, mas não são promovidas. Quando o próprio dreno de envio imediato expira (o agente espera 2 s, e o daemon ainda pode estar lendo anexos), mensagens que o daemon entrega posteriormente cortam a resposta se ela ainda estiver sendo transmitida sem uma chamada de ferramenta, e são entregadas de outra forma com um dreno posterior, possivelmente em um turno posterior; como em qualquer dreno expirado, elas são perdidas se o daemon responder mais de 30 s após o tempo limite, ou se o turno for parado enquanto esse dreno posterior resolve seus anexos. Em todos os casos, seus IDs são resolvidos como os de qualquer mensagem drenada: reenviar um deles é reconhecido sem colocá-lo novamente na fila, e um cliente que deseja uma resposta para mensagens mantidas na conversa envia um novo prompt. O direcionamento interno somente-fila nunca aciona um corte e não é capturado pelo dreno de envio imediato; ele sai com a próxima solicitação ao modelo, ou através do caminho de resolução que seu chamador conduz quando o turno termina primeiro. Turnos de canal, cron e segundo plano mantêm a entrega na fronteira de ferramentas. A resposta é `{ "requested": true }` quando mensagens do usuário estavam aguardando e o agente foi solicitado a entregá-las, e `{ "requested": false }` quando nenhuma estava aguardando (elas já haviam sido entregues, removidas ou promovidas). Um agente anterior à solicitação responde com `-32601` e mantém a entrega na fronteira de ferramentas.

Quando `session_mid_turn_message_mutation` é anunciado, um cliente de sessão conectado pode chamar `DELETE /session/:id/mid-turn-messages/:messageId`. Ele remove a mensagem da fila durante o turno ou de seu estado de prompt pendente promovido; remover uma mensagem promovida que já está em execução aborta aquele turno, correspondendo à remoção ordinária de prompt pendente. Adições e remoções na fila gerenciada pelo daemon publicam os eventos de sessão existentes `pending_prompt_added` e `pending_prompt_completed` para que os clientes conectados atualizem ambas as snapshots autoritativas da fila. `{ "removed": false }` significa que a mensagem já foi injetada, concluída ou não encontrada. Uma mensagem que um dreno capturou, mas ainda não entregou ao agente, também responde `{ "removed": false }`. Se esse dreno falhar, a mensagem volta para a fila sem um evento de fila e seu ID sai do anel de resolvidos. Um dreno posterior ou a resolução do turno então a captura, mas quando o dreno falha após seu turno ter sido resolvido, a mensagem permanece na fila até o próximo turno.

### `GET /session/:id/pending-prompts`

Retorna o prompt em execução atualmente e os prompts aguardando na FIFO da sessão ativa. A requisição pode incluir `X-Qwen-Client-Id`; quando presente, deve identificar um cliente conectado.

```json
{
  "pendingPrompts": [
    {
      "promptId": "<prompt-id>",
      "text": "Explain the failure",
      "queuedAt": 1700000000123,
      "state": "running",
      "originatorClientId": "<client-id>"
    }
  ]
}
```

`state` é `running` para o prompt sendo despachado e `queued` para prompts aguardando. `content` aparece quando o prompt inclui conteúdo estruturado como imagens. Esta é uma rota do proprietário da sessão ativa: `404` significa que não há proprietário ativo e `503` significa que o proprietário está temporariamente indisponível. Um proprietário não confiável que não seja primário retorna `403 untrusted_workspace`, e um id ativo em mais de um workspace retorna `500 ambiguous_session_owner`. Não há tag de capacidade dedicada; daemons antigos retornam `404`. O método do SDK TypeScript é `getPendingPrompts()`.

### `POST /session/:id/prompt`

`eventDetailMode` aceita `full` (padrão) ou `summary`; valores inválidos retornam `400 invalid_event_detail_mode`. O resumo filtra detalhes de subagentes aninhados antes da retenção no ring e entrega via SSE, e remove prompts de Agent, ferramentas embutidas e contadores de tokens em andamento, preservando o conteúdo raiz e o uso do modelo principal. Resultados consolidados de Agent mantem totais de tokens `tokenCount` e `executionSummary` (incluindo falha/cancelamento) para métricas de turno; quadros de uso aninhados permanecem filtrados. A mesma regra se aplica a respostas de carregamento/transcrição resumida. O modo é capturado na admissão, aplicado apenas no despacho e reiniciado para completo na consolidação. Eventos tardios de subagente usam o modo na publicação: completo enquanto ocioso, ou o modo do prompt ativo quando um prompt subsequente está em execução. Eles não herdam o modo do prompt que originalmente iniciou o subagente. Aplica-se a todos os assinantes da sessão; detalhes filtrados não podem ser recuperados posteriormente do ring. O `/acp` `session/prompt` do daemon aceita a mesma extensão opcional de nível superior com o mesmo escopo (valores inválidos são JSON-RPC `-32602`); não é um campo ACP padrão e não é encaminhado ao filho.

Encaminha um prompt para o agente. Chamadores com múltiplos prompts usam fila FIFO por sessão (o ACP garante um prompt ativo por sessão).

Solicitação:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }],
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

`delivery` é opcional e requer a capacidade `channel_delivery`. O daemon ainda retorna `202 {promptId,lastEventId}` quando o prompt é admitido. Após um `end_turn` bem-sucedido, a sessão envia o texto final visível ao Channel Worker já em execução do workspace exato. A carga útil contém apenas o último bloco de resposta do assistente sem chamadas de ferramenta; preâmbulos de chamada de ferramenta, narração entre ferramentas, novas tentativas substituídas e blocos anteriores de continuação automática são excluídos. Um resultado final vazio ou apenas com espaços ainda produz um `channel_delivery_result` correlacionado com `status: "skipped"` após o consumo da autorização, mas não contata um worker. O sucesso ou fracasso da entrega chega posteriormente através do mesmo evento reproduzível e nunca muda `turn_complete` para `turn_error`. Cancelamento, falha de Agent e terminação por limite de tokens não enviam nem publicam um resultado de entrega.

Validação: `prompt` deve ser uma matriz não vazia de objetos. Outras falhas retornam `400` antes de alcançar a ponte.

`idempotencyKey` é uma string opcional não vazia de no máximo 200 caracteres (valores inválidos retornam `400 invalid_idempotency_key`). Ela identifica o EVENTO do chamador, não a requisição HTTP: a primeira admissão lembra a chave por sessão, e um POST repetido com a mesma chave retorna a admissão original — `202 { promptId, lastEventId, eventEpoch, deduplicated: true }` com o `promptId` do PRIMEIRO prompt e um cursor/epoch novo — sem enfileirar um segundo turno. Isso permite que um relay que marca a aceitação de forma durável após o `202` (ou perde a resposta) tente novamente com segurança. A deduplicação é best-effort dentro da vida útil do daemon: o ring é em memória e limitado (128 chaves por sessão, 1024 sessões, remoção FIFO em ambos os níveis). Qualquer limite pode remover uma chave enquanto a entrada da fila do seu evento ainda está ativa — o limite por sessão no caso comum de uma sessão de longa duração admitindo mais de 128 eventos distintos, o limite de sessões quando mais de 1024 sessões mantêm chaves — e uma nova tentativa após tal remoção reinsere. O ring também morre junto com a fila de prompts em memória que protege, então uma reinicialização do daemon perde ambos e a reinserção torna-se a recuperação correta. As chaves têm escopo por sessão; o campo é metadados de admissão e nunca é encaminhado ao agente.

Relés de canal usam três chaves `_meta` que a rota remove antes do encaminhamento: `qwen.channel.prompt` (classificação de turno de canal), `qwen.daemon.channelBoundRelay: true` (intenção de entrega vinculada entre workspaces) e `qwen.daemon.channelPromptAuthorization` (token de autorização do worker de canal; o worker de referência só o envia quando possui uma credencial). `qwen.channel.prompt` exige um token de autorização de worker de canal registrado — o registro por workspace para o workspace de destino ou, para uma entrega vinculada CROSS-workspace, qualquer token de worker registrado mais o marcador explícito `qwen.daemon.channelBoundRelay: true` e um destino primário/confiável. Um relé que envia apenas os dois marcadores sem a credencial não recebe classificação de canal: ele é admitido como um prompt interativo comum (rejeição por detecção de loop, backfill de vinculação de PR ativa no texto retransmitido). Um prompt simples carregando um token de worker estrangeiro também não recebe classificação de canal nem projeção de exibição fornecida pelo chamador.

Resposta:

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

A resposta `202` confirma a admissão, não a conclusão do Agente. Observe o fluxo SSE da sessão após `lastEventId` e correlacione `turn_complete` ou `turn_error` por `promptId`. Cada verificação de admissão alcançável pré-enfileiramento — incluindo a guarda de diretório de trabalho reservado autônomo — lança sincronamente, fazendo com que a rota responda com um erro não-202 ANTES de qualquer aceitação: a guarda responde `409 working_directory_missing` (`retryable: true`, `Retry-After: 5`) enquanto o vínculo de conversa gerenciada da sessão ainda não foi liberado, e um relé de canal adia o evento em vez de consumir uma aceitação fantasma. Se uma ponte ainda rejeitar o adiamento antes da admissão, a rota descarta o `idempotencyKey` da solicitação para que uma nova tentativa subsequente seja admitida do zero, em vez de deduplicar em uma admissão fantasma — uma defesa em profundidade para esse caso, cuja entrega ATUAL já foi consumida pelo chamador.

`turn_complete.data.stopReason` carrega o `StopReason` ACP retornado pelo agente — `end_turn`, `max_tokens`, `max_turn_requests`, `refusal` ou `cancelled`. O daemon também pode emitir `cancelled` para um prompt abortado sem que o agente o execute, incluindo remoção de prompt enfileirado, desconexão do chamador ou dreno/encerramento; esse valor não prova que o agente executou o prompt. **Trate o campo como uma string aberta**: ele é tipado como `string` na transmissão, o conjunto ACP pode crescer e um cliente que faça switch exaustivo sobre ele quebrará na próxima adição.

Dois resultados do lado do daemon **não** chegam neste campo. Um turno que falha dentro do daemon — expiração de prazo, flush de encerramento, crash do filho — é publicado como um evento `turn_error`, nunca como um stopReason `turn_complete`. Seu `data` sempre carrega `message`; `code` está presente apenas quando o daemon classificou a falha (expiração de prazo → `prompt_deadline_exceeded`, flush de encerramento → `channel_closed`, `session_closed`, `session_killed` ou `daemon_shutdown`), e o quadro para um prompt rejeitado porque o filho ACP morreu durante a solicitação não carrega nem `code` nem `errorKind`. Trate ambos como opcionais e ramifique com base em `message`.

Um turno recuperado do histórico persistido após uma reinicialização não é republicado no fluxo; ele aparece em `promptTerminals[]` no corpo da resposta `POST /session/:id/load` — como `{ terminal: "completed", stopReason: "reconstructed_from_transcript" }` quando o final persistido mostra que o turno terminou, ou `{ terminal: "interrupted", code: "daemon_lost" }` com **nenhum** `stopReason` quando o daemon morreu no meio do turno. Corresponda à entrada por `promptId` e ramifique com base em `terminal`; `promptTerminals` é omitido completamente da resposta quando o livro-razão não contém evidências para a sessão.

Se o cliente HTTP desconectar durante um prompt, o daemon envia uma notificação ACP `cancel` ao agente, que encerra o prompt com `stopReason: "cancelled"`.

Quando `prompt_absolute_deadline` é anunciado, `deadlineMs` pode encurtar o prazo do servidor configurado. A expiração emite um `turn_error` correlacionado com `code: "prompt_deadline_exceeded"`. O prazo libera o chamador sem matar o agente; se o agente liquidar posteriormente, as consultas de status do turno para aquele `promptId` retornarão o resultado transcritor liquidado em vez do erro de prazo.

### `POST /session/:id/cancel`

Cancele o prompt **atualmente ativo** na sessão. No lado ACP, isso é uma notificação, não uma solicitação — o agente reconhece resolvendo o `prompt()` ativo com `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrato multi-prompt:** o cancelamento afeta apenas o prompt ativo. Quaisquer prompts que o mesmo cliente tenha enviado anteriormente via POST e que ainda estejam na fila atrás do ativo continuarão a ser executados. O enfileiramento multi-prompt é um comportamento introduzido pelo daemon (não está na especificação ACP); o contrato para prompts na fila é "eles continuam rodando a menos que você cancele cada um, ou mate a sessão via saída do canal".

Se prompts enfileirados forem inesperados em uma implantação multi-cliente, confirme primeiro se os chamadores estão compartilhando uma sessão padrão `sessionScope: "single"`. Para conversas independentes por thread, crie sessões com `sessionScope: "thread"` para que os prompts sejam serializados apenas dentro daquela thread.

### `DELETE /session/:id`

Feche explicitamente uma sessão ativa. Força o fechamento mesmo quando outros clientes estão conectados — cancela qualquer prompt ativo, resolve permissões pendentes como canceladas, publica o evento `session_closed`, fecha o EventBus e remove a sessão dos mapas do daemon. Sessões persistidas em disco NÃO são excluídas — elas podem ser recarregadas via `POST /session/:id/load`. Pré-verificação `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotente: retorna `404` para sessões desconhecidas. O envelope de erro usa `code: "session_not_found"`; um fechamento concorrente pode retornar `code: "session_closing"`, que os clientes podem tratar como o mesmo estado terminal bem-sucedido para esta rota.

> **Evento `session_closed`.** Assinantes SSE recebem um evento terminal `session_closed` com `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` antes que o stream termine. Redutores SDK tratam isso identicamente a `session_died` (define `alive: false`, limpa `pendingPermissions`).

### `PATCH /session/:id/metadata`

Atualize os metadados mutáveis da sessão. Pré-verificação `caps.features.session_metadata`. Agrupamento e fixação intencionalmente não fazem parte desta rota; use `PATCH /session/:id/organization` sob `session_organization`.

Solicitação:

```json
{
  "displayName": "My Investigation Session",
  "pr": {
    "number": 123,
    "url": "https://github.com/QwenLM/qwen-code/pull/123",
    "state": "open"
  }
}
```

| Campo | Obrigatório | Notas |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayName` | não | String. Valores mais longos que 256 unidades de código UTF-16 são truncados, e o corte não considera pares substitutos, então um nome terminado em um caractere não-BMP pode perder metade de um substituto isolado. Um valor vazio ou somente espaços em branco é rejeitado com `400 invalid_metadata`; omita o campo para deixar o nome inalterado. |
| `pr` | não | Vincule uma pull request. Requer um inteiro positivo `number`, um `url` HTTP(S) de no máximo 2.048 caracteres sem caracteres de controle, e `state` opcional: `open`, `merged` ou `closed`. |

Resposta:

```json
{
  "sessionId": "<uuid>",
  "displayName": "My Investigation Session",
  "prs": [
    {
      "number": 123,
      "url": "https://github.com/QwenLM/qwen-code/pull/123",
      "state": "open"
    }
  ]
}
```

`prs` é o histórico de vínculo limitado efetivo e pode incluir links de issue atualizados. Publica um evento `session_metadata_updated` no fluxo SSE da sessão contendo apenas o grupo de campos alterado: uma renomeação emite `displayName` (mais `titleSource` quando o nome é definido) e deixa `prs` ausente, enquanto uma alteração de vínculo de PR emite `prs` e ecoa o `displayName` atual quando um está definido. Trate um campo ausente no evento como inalterado, não limpo, e releia o corpo `200` ou a lista de sessões quando precisar dos metadados completos.

### `PATCH /session/:id/organization` and `PATCH /workspaces/:workspace/session/:id/organization`

Atualize o estado de organização local da sessão através do portão de mutação existente. Pré-verificação `caps.features.includes('session_organization')`; a rota plural adicionalmente requer `workspace_qualified_rest_core`. Na rota plural, `:workspace` resolve primeiro como um id de workspace registrado exato e depois como um cwd absoluto canônico codificado em URL. O runtime selecionado deve ser confiável. A validação de existência da sessão e de `groupId` não nulo é escopada ao estado de sessão persistida ativa, persistida arquivada e viva desse runtime, além da store de grupos, sem fallback para o primário ou outro workspace. A rota legada permanece exclusiva do workspace primário.

Solicitação:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| Campo | Obrigatório | Notas |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | não | Booleano. `true` define `pinnedAt` se ainda não estava fixado; `false` limpa `pinnedAt`. |
| `groupId` | não | Id de grupo personalizado ou `null` para desagrupado. Ids de grupo desconhecidos retornam `404 { code: "group_not_found" }`. |
| `color` | não | Um token de cor de sessão suportado, ou `null` para limpar a cor da sessão. |

Resposta:

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "color": "blue",
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "updatedAt": "2026-07-04T12:00:00.000Z"
}
```

Este estado é armazenado no sidecar de organização de sessões em nível de projeto, sob o diretório de armazenamento do runtime do daemon. Não é conteúdo de transcrição, não atualiza a `mtime` da transcrição, não é exportado com as transcrições e é preservado durante arquivar/desarquivar.

### `POST /session/:id/heartbeat`

Atualize a contabilidade de última visualização do daemon para esta sessão. Adaptadores de longa duração (TUI/IDE/web) enviam ping nisso em intervalos regulares, para que políticas futuras de revogação (Wave 5 PR 24) possam distinguir clientes inativos de clientes silenciosos.

Cabeçalhos:

| Cabeçalho | Obrigatório | Notas |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | não | Repete o id emitido pelo daemon de `POST /session`. Clientes identificados também atualizam seu timestamp por cliente; heartbeats anônimos atualizam apenas o watermark por sessão. Deve satisfazer a mesma forma `[A-Za-z0-9._:-]{1,128}` usada em outros lugares. |

O corpo da requisição está vazio (`{}` é aceitável — nenhum campo é lido atualmente).

Resposta:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` é repetido apenas quando um `X-Qwen-Client-Id` confiável foi fornecido. `lastSeenAt` é a época `Date.now()` (ms) do lado do daemon que a ponte armazena.

Erros:

- `400` — `{ code: 'invalid_client_id' }` quando o cabeçalho está malformado (regra de forma do cabeçalho) ou quando carrega um `clientId` que não está registrado para esta sessão (a ponte lança `InvalidClientIdError` antes de atualizar qualquer timestamp).
- `404` — sessão desconhecida.

Restrição de capacidade: verificação prévia `caps.features.client_heartbeat`. Daemons mais antigos retornam `404` para este caminho.

### `POST /session/:id/model`

Alterne o modelo ativo **dentro** do serviço de modelos atualmente vinculado à sessão. Serializado através da fila de mudança de modelo por sessão.

(Para alternar o próprio _serviço_ — Alibaba ModelStudio vs OpenRouter etc — passe `modelServiceId` em `POST /session` para uma nova sessão. A Fase 1 não tem rota de troca de serviço ao vivo.)

Requisição:

```json
{ "modelId": "qwen-staging" }
```

Resposta: o resultado da troca de modelo do agente ACP, encaminhado literalmente — o daemon não o remodela, portanto o nível superior não carrega `modelId`. Leia os detalhes da troca de `_meta.qwenModelSwitch`.

Em caso de sucesso, publica `model_switched` no fluxo SSE. Em caso de falha, publica `model_switch_failed` (para que assinantes passivos vejam a falha, não apenas o chamador). Disputa contra a saída do canal do agente para que um processo filho travado não bloqueie o manipulador HTTP. Uma troca bem-sucedida também registra o modelo da sessão no JSONL da sessão em base best-effort; quando o registro é escrito, o carregamento/retomada do daemon tenta restaurar o modelo desta sessão antes da autenticação. Se o modelo registrado não puder mais ser aplicado (modelo removido, credenciais indisponíveis), a restauração usa uma rota de registro com o mesmo id quando existe — para um registro instantâneo do runtime, isso pode ser um endpoint diferente do vínculo registrado — e continua no padrão `settings.model.name` apenas quando nenhuma rota resolve. `settings.model.name` ainda é atualizado como o padrão para **novas** sessões.

### `GET /session/:id/message-groups`

Tag de capacidade: `session_message_deletion`. Ponte → extMethod ACP `qwen/status/session/message_groups`. Esta é uma leitura do proprietário da sessão ativa: resolve o runtime proprietário da sessão e nunca recorre ao workspace primário. A capacidade global do daemon não implica suporte para todas as sessões; workspaces SSH e armazenamento autoritativo gerenciado recusam exclusão.

Lista grupos de prompt/resposta ou exibição de comando atribuíveis com segurança na ordem do histórico ativo. Não adquire uma locação de escritor para um gravador legado comum. A leitura espera por mutações anteriores do histórico; um snapshot retornado pode ficar obsoleto conforme a sessão muda. A exclusão em si requer uma sessão ociosa.

Resposta (200):

```json
{
  "snapshot": "<opaque selection token>",
  "groups": [
    {
      "id": "<group-id>",
      "promptId": "<prompt-id>",
      "recordIds": ["<user-record-id>", "<reply-record-id>"]
    }
  ]
}
```

`promptId` e `promptIds` são identidades opcionais de prompt; `recordIds` identifica os registros salvos do grupo. Um histórico vazio retorna `groups: []`. Trate IDs de grupos e o snapshot como opacos; passe o snapshot retornado sem alterações ao excluir.

Os erros incluem `404` para uma sessão desconhecida, `400 unsupported_operation` para um workspace SSH e `422 session_message_deletion_unsupported` para armazenamento não suportado ou gravação indisponível. Erros existentes de integridade do escritor também podem retornar `409 session_writer_conflict`, `409 session_writer_lost`, `409 session_transcript_changed` ou `503 session_writer_unavailable`.

### `POST /session/:id/messages/delete`

Tag de capacidade: `session_message_deletion`. Ponte → extMethod ACP `qwen/control/session/messages_delete`. Porta de mutação estrita; escopo do proprietário da sessão ativa sem recurso ao workspace primário. Aceita `X-Qwen-Client-Id` opcional para atribuição de eventos.

Requisição:

```json
{ "snapshot": "<token from message-groups>", "groupIds": ["<group-id>"] }
```

Ambos os campos são obrigatórios. `snapshot` deve ser não-vazio; `groupIds` deve conter strings distintas não-vazias. Os grupos selecionados ainda devem existir naquele snapshot. O servidor rejeita sessões ocupadas em vez de enfileirar a exclusão atrás de uma rodada de modelo.

Resposta (200):

```json
{
  "deletedGroupIds": ["<group-id>"],
  "deletedPromptIds": ["<daemon-prompt-id>"]
}
```

Os registros originais selecionados e seu contexto de compressão bruto possuído são fisicamente removidos do JSONL. Textos de resumo existentes, efeitos de comandos e arquivos de projeto são preservados. Excluir todos os grupos deixa a sessão disponível para prompts posteriores.

Erros:

- `400 invalid_message_groups` — seleção de grupo malformada, desconhecida ou duplicada.
- `400 invalid_client_id` — cabeçalho de atribuição malformado.
- `404` — sessão desconhecida.
- `409 session_busy` — mutação de prompt ou histórico ativa; tente novamente após terminar.
- `409 worktree_reset_active` — esta sessão está sendo substituída por uma reinicialização de worktree; reconecte à sessão substituta.
- `409 message_groups_conflict` — snapshot da seleção está obsoleto; busque grupos novamente e exija uma nova seleção antes de tentar novamente.
- `409 message_history_invalid` — histórico não pode ser atribuído com segurança; mudar apenas o token de seleção não pode repará-lo.
- `400 unsupported_operation` / `422 session_message_deletion_unsupported` — armazenamento de sessão/workspace não suporta esta operação; atualizar e repetir a solicitação não a habilitará.
- `409 session_writer_conflict`, `409 session_writer_lost`, `409 session_transcript_changed` ou `503 session_writer_unavailable` — propriedade exclusiva da transcrição não pôde ser estabelecida ou mantida.
- `503 message_deletion_context_unavailable` — a exclusão **persistiu**, mas o contexto ativo não pôde ser instalado. O corpo JSON inclui `persisted: true`, `deletedGroupIds` e `deletedPromptIds`. Reconcilie a UI a partir do histórico autoritativo e reabra a sessão antes de enviar outro prompt. Não tente excluir novamente como se nada tivesse sido removido; prompts posteriores permanecem recusados até que a recuperação do contexto tenha sucesso.

Mutações subsequentes dependentes do histórico e solicitações de modelo enquanto a recuperação do contexto estiver pendente retornam 503 `session_history_context_unavailable` sem identidades `persisted` ou de exclusão. Carregar ou retomar a sessão tenta reinstalar o contexto JSONL autoritativo; apenas uma instalação bem-sucedida reabre a admissão do modelo. O encerramento do ciclo de vida permanece disponível.

Após a persistência, a sessão publica `session_messages_deleted` com dados `{sessionId, deletedGroupIds, deletedPromptIds}` e opcionalmente `originatorClientId` no **envelope do evento**. Identidades internas do histórico da API não são publicadas neste canal. Este evento também ocorre para o caminho de erro 503 persistido. Os pares devem invalidar o cache de transcrição, navegação, busca e estado de seleção e recarregar o histórico autoritativo. O originador deve reconciliar tanto as respostas HTTP bem-sucedidas quanto os erros `persisted: true`; ele não deve depender do processamento de seu próprio eco SSE.

### `POST /session/:id/recap`

Tag de capacidade: `session_recap`. Bridge → extMethod ACP `qwen/control/session/recap`.

Gera um resumo de uma frase "onde eu parei" da sessão. Envolve o `generateSessionRecap` principal (`packages/core/src/services/sessionRecap.ts`), que executa uma consulta lateral contra o modelo rápido com ferramentas desabilitadas, `maxOutputTokens: 300` e um formato de saída estrito `<recap>...</recap>`. A consulta lateral lê o histórico de chat existente do GeminiClient da sessão e **não** adiciona a ele.

O corpo da solicitação é ignorado (envie `{}` ou vazio). Gate de mutação não estrito — a postura reflete `/session/:id/prompt` (a chamada custa tokens, mas não altera o estado). Nenhum evento SSE é publicado.

Resposta (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` é `null` (um 200 normal, não um erro) quando:

- a sessão tem menos de duas turnos de diálogo ainda,
- a consulta lateral não retornou nenhum payload `<recap>...</recap>` extraível,
- ou ocorreu qualquer erro subjacente do modelo (o auxiliar principal é baseado em melhor esforço e nunca lança exceções).

Erros:

- `400 {code: 'invalid_client_id'}` — cabeçalho `X-Qwen-Client-Id` malformado.
- `404` — sessão desconhecida.

Cancelamento: **nenhum na v1**. A rota não escuta a desconexão do cliente HTTP, nenhum `AbortSignal` é integrado à bridge, e o filho ACP executa a consulta lateral até a conclusão independentemente de o chamador ter se desconectado. Os únicos limites são o tempo limite de backstop de 60s da bridge (`SESSION_RECAP_TIMEOUT_MS`) e a corrida de transporte fechado contra a morte do canal ACP. Isso é aceitável porque o recap é curto (tentativa única, `maxOutputTokens: 300`, ~1–5s típico); um ext-method de cancelamento baseado em ID de solicitação pode integrar o cancelamento completo ponta a ponta em uma versão futura se o custo de banda justificar.

### `POST /session/:id/generate`

Tag de capacidade: `session_generation`.

Execute geração de texto escopada pela solicitação a partir de um prompt fornecido pelo chamador. A solicitação não lê nem altera o histórico da conversa e não expõe ferramentas. Ela prefere o modelo rápido configurado, recorrendo ao modelo principal da sessão se o modelo rápido estiver ausente ou não puder ser resolvido. O endpoint é agnóstico quanto à tarefa; a tradução é apenas um possível prompt definido pelo chamador.

Solicitação:

```json
{ "prompt": "Translate into Chinese: Hello" }
```

A resposta é `text/event-stream`. O servidor escreve um comentário SSE inicial imediatamente, seguido por `started`, um evento de progresso `thinking` opcional, zero ou mais eventos `delta` e `done`. O evento `thinking` não contém conteúdo de raciocínio. Uma falha do modelo após o início do streaming produz um evento `error`; ele não tenta novamente com outro modelo. Os prompts são limitados a 32 KiB de texto UTF-8. Desconectar o cliente HTTP cancela a solicitação de geração.

### `POST /session/:id/btw/stream`

Tag de capacidade: `session_btw_stream`. Escopo: proprietário da sessão ativa.

Faça uma pergunta lateral sem uso de ferramentas usando o contexto da conversa da sessão ao vivo, sem adicionar à sua transcrição ou interromper sua tarefa principal. A API JSON `POST /session/:id/btw` existente permanece disponível com seu comportamento original.

Solicitação:

```json
{ "question": "Why?", "requestId": "unique-request-id", "resume": false }
```

`question` é uma string não vazia com espaços removidos nas extremidades, limitada a 4096 caracteres antes da remoção dos espaços. `requestId` contém 1–64 letras ASCII, dígitos, sublinhados ou hífens. `resume` é opcional e tem como padrão `false`. `X-Qwen-Client-Id`, quando fornecido, deve nomear um cliente registrado na sessão ao vivo. Cada início e retomada usa o runtime proprietário resolvido e seus portões de confiança e mutação.

A resposta é `text/event-stream`, com `v: 1` em cada evento:

| Evento | Payload |
| -------- | --------------------------------------------------------------------------- |
| `answer` | `{ "type": "answer", "requestId": "...", "answer": "accumulated text" }`    |
| `done`   | `{ "type": "done", "requestId": "...", "answer": "trimmed complete text" }` |
| `error`  | `{ "type": "error", "requestId": "...", "code": "...", "message": "..." }`  |

Cada `answer` substitui o texto anterior; não é um delta para anexar. Snapshots parciais preservam os espaços em branco; `done` remove os espaços em branco no início e no fim, correspondendo ao resultado BTW JSON existente. O snapshot inicial pode estar vazio. `done` e `error` terminam o stream. Comentários de heartbeat são enviados a cada 15 segundos. Uma resposta é limitada a 1 MiB de texto UTF-8; exceder isso produz `btw_failed`. O daemon encerra a geração após cinco minutos com `btw_timeout`; os prazos de limpeza de filhos e bridge permitem mais cinco e dez segundos, respectivamente. O cancelamento explícito produz `btw_cancelled`; outras falhas upstream produzem `btw_failed`.

A desconexão HTTP apenas desanexa o assinante. Reconecte com o mesmo `requestId`, pergunta e identidade do cliente e `resume: true` para receber o snapshot mais recente sem iniciar outra chamada de modelo. Submissões iniciais repetidas com a mesma identidade também reutilizam o trabalho retido. Nenhum cursor de evento ou `Last-Event-ID` é necessário. Uma solicitação `resume: true` cuja entrada retida está ausente retorna 410 e nunca inicia novo trabalho. As solicitações são escopadas pela identidade da bridge, sessão, cliente e ID da solicitação; elas não podem ser retomadas após uma reinicialização do daemon ou substituição do runtime proprietário.

Há no máximo 32 solicitações retidas por runtime proprietário. Recibos terminais e marcadores de cancelamento expiram após 60 segundos e podem ser expulsos antes, começando pelos mais antigos, para admitir uma nova solicitação. Solicitações ativas não são expulsas. A geração não mantém o lock de admissão do arquivo compartilhado da sessão enquanto espera pelo modelo ou assinante; a atividade da bridge ainda a protege contra limpeza por inatividade. O fechamento explícito da sessão e o desligamento do daemon mantêm seu comportamento normal de cancelamento.

Erros antes do início do SSE:

- `400 invalid_btw_request` — pergunta, ID de solicitação ou sinalizador de retomada inválido.
- `400 invalid_client_id` — identidade de cliente malformada ou não registrada.
- `403 untrusted_workspace` — o proprietário não primário resolvido não é confiável.
- `404 session_not_found` — nenhum proprietário ativo existe.
- `409 btw_request_conflict` — o ID retido pertence a outra pergunta.
- `410 btw_expired` — uma retomada não possui solicitação retida.
- `429 btw_limit` — todas as 32 solicitações retidas estão ativas.
- `501 btw_stream_not_supported` — a ponte do proprietário não pode transmitir BTW.

### `DELETE /session/:id/btw/stream/:requestId`

Tag de capacidade: `session_btw_stream`. Escopo: proprietário de sessão ativa.

Cancele a solicitação BTW correspondente com a mesma identidade de sessão e cliente usada para iniciá-la. Retorna `204` vazio; o cancelamento é idempotente para uma solicitação retida. A identidade exata em cache pode cancelar após seu cliente ter se desanexado, enquanto IDs desconhecidos exigem um cliente ainda registrado. Cancelar um ID desconhecido registra um marcador de cancelamento de curta duração para que um POST inicial atrasado não possa iniciar trabalho.

A rota usa a mesma resolução de proprietário, portões de confiança e mutação que o POST de streaming. IDs inválidos retornam `400 invalid_btw_request`; identidades de cliente inválidas retornam `400 invalid_client_id`. Um cancelamento desconhecido retorna `429 btw_limit` quando todas as 32 solicitações retidas estão ativas. Uma solicitação ativa conhecida sempre pode ser cancelada, mesmo quando o runtime está na capacidade máxima. O cancelamento não cancela o prompt principal nem o BTW de outra sessão.

### Mutação: aprovação, ferramentas, habilidades, init, reinicialização MCP

O daemon expõe cinco rotas de controle de mutação que permitem que clientes remotos alterem a postura do runtime sem tocar na CLI do host do daemon. O controle do modo de aprovação mantém sua porta de compatibilidade não estrita. Alternância de ferramenta, alternância de habilidade, init do workspace e reinicialização MCP usam a porta de mutação estrita: loopback primário confiável, autenticado por bearer e solicitações de Controle Local pareadas passam. Uma solicitação primária sem token que chega à porta sem autoridade de loopback confiável recebe `401 {code: 'token_required'}`; credenciais configuradas ausentes ou inválidas e credenciais de Controle Local não pareadas são rejeitadas anteriormente com `401 Unauthorized` simples. Todos os cinco:

- Aceitam e carimbam o cabeçalho `X-Qwen-Client-Id` (cadeia de auditoria PR 7). Quando o cabeçalho transporta um id confiável, o daemon emite `originatorClientId` no evento SSE correspondente para que interfaces multi-cliente possam suprimir ecos de suas próprias mutações.
- Verifique previamente cada capacidade por tag antes de expor o recurso. Um daemon que carece de uma rota retorna `404`. Para as rotas de configurações de Habilidade, a ausência da tag pode significar em vez disso que os mesmos caminhos atendem ao contrato obsoleto validado pelo catálogo: a rota de alvo único pode retornar HTTP `404 skill_not_found` ou `409 skill_not_toggleable`, enquanto a rota em lote retorna HTTP 200 com falhas derivadas do catálogo em `errors[]`. Não use a sondagem de rotas como verificação de versão.

As rotas de alternância de ferramenta, alternância de habilidade, init e reinicialização MCP emitem eventos **com escopo de workspace**: todos os barramentos SSE de sessões ativas recebem o evento, independentemente de qual sessão estava anexada quando a mutação foi acionada. `approval-mode` emite um evento **com escopo de sessão** porque a alteração é local ao `Config` de uma única sessão.

#### `POST /session/:id/approval-mode`

Tag de capacidade: `session_approval_mode_control`. Ponte → extMethod ACP `qwen/control/session/approval_mode`.

Altere o modo de aprovação de uma sessão ativa. O novo modo entra imediatamente no `Config` por sessão do filho ACP e é restaurado da transcrição dessa sessão quando a gravação de chat está disponível. O modo de execução selecionado do Plan é restaurado junto. As configurações do workspace NÃO são escritas por padrão — passe `persist: true` para também escrever `tools.approvalMode` nas configurações do workspace. Se a gravação estiver desabilitada ou degradada, o modo permanece apenas na sessão ativa.

Solicitação:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` deve ser um de `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (espelho da enum `ApprovalMode` do core; o SDK exporta `DAEMON_APPROVAL_MODES` para validação em tempo de execução). `persist` tem valor padrão `false`.

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
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — o modo solicitado exige uma pasta confiável (modos privilegiados em workspaces não confiáveis são rejeitados pela `Config.setApprovalMode` do core).
- `404` — sessão desconhecida.

Evento SSE (escopo de sessão): `approval_mode_changed` com `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Tag de capacidade: `workspace_tool_toggle`. IO puro de arquivo — sem ida e volta ACP.

Alterne um nome de ferramenta na lista de configurações `tools.disabled` do workspace. Ferramentas listadas lá **não são registradas** de forma alguma (distinto de `permissions.deny`, que mantém a ferramenta registrada e rejeita a invocação). Tanto ferramentas embutidas quanto ferramentas descobertas via MCP fluem através de `ToolRegistry.registerTool`, que consulta o conjunto desabilitado.

> ⚠️ **Os nomes devem corresponder exatamente ao identificador exposto pelo registro.** Nenhuma resolução de alias ocorre — a rota armazena qualquer string no parâmetro de caminho em `tools.disabled`, e o próximo filho ACP compara contra `tool.name` no momento do registro. Os embutidos usam seu nome canônico de registro (forma verbal snake_case): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — NÃO os rótulos de exibição (`Shell`, `Read`, `Write`) que a CLI apresenta. Ferramentas descobertas via MCP usam a forma qualificada `mcp__<server>__<name>` (que também é a forma que eventos `tool_toggled` transmitem e o que `GET /workspace/mcp` lista). Desabilitar `Bash` NÃO impedirá que `run_shell_command` seja registrado na próxima sessão.

Filhos ACP ativos mantêm ferramentas já registradas — a alternância entra em vigor no **próximo** spawn do filho ACP. Combine com `POST /workspace/mcp/:server/restart` (para ferramentas originadas de MCP) ou criação de nova sessão para tornar a alteração efetiva no daemon atual.

Nomes de ferramentas desconhecidos são aceitos: desativar previamente uma ferramenta MCP ainda não instalada é um caso de uso legítimo.

Solicitação:

```json
{ "enabled": false }
```

Resposta (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Erros:

- `400 {code: 'invalid_tool_name'}` — parâmetro de rota vazio, ou parâmetro de rota excede o limite de 256 caracteres.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` ausente ou não booleano.

Evento SSE (escopo de workspace): `tool_toggled` com `{toolName, enabled, originatorClientId?}`.

#### Separação das rotas de configuração e runtime do Skills

Tag de capacidade: `workspace_skills_config_runtime`.

`GET /workspace/config/skills` lê o proprietário da configuração global local ao daemon. `GET /workspaces/:workspace/config/skills` lê a configuração exata do workspace registrado e não requer um runtime ativo ou confiável. Ambos retornam o formato normal de status do Skills sem um `runtimeEpoch` obrigatório:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "skills": []
}
```

`GET /workspace/runtime/skills` e `GET /workspaces/:workspace/runtime/skills` leem o runtime confiável selecionado sem iniciá-lo. Um catálogo ativo inclui a geração do runtime que o produziu:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "runtimeEpoch": 4,
  "skills": []
}
```

A instalação e exclusão globais usam `POST /workspace/config/skills/install` e `DELETE /workspace/config/skills/:name?scope=global`. A instalação, exclusão e habilitação no escopo do workspace usam `POST /workspaces/:workspace/config/skills/install`, `DELETE /workspaces/:workspace/config/skills/:name?scope=workspace` e `POST /workspaces/:workspace/config/skills/:name/enable`. As escritas de configuração confirmam o estado durável antes de agendar a reconciliação do runtime. Seu `activation` é `deferred` quando nenhum runtime atual pode ser atualizado e `reconciling` quando uma atualização foi enfileirada; uma alternância sem efeito preserva a ativação da fachada em vez de afirmar que ocorreu uma atualização do runtime.

A exclusão de configuração retorna `503 skills_config_unavailable` em vez de uma resposta definitiva de não encontrado quando o inventário de Skills local ao daemon não pode ser enumerado. A exclusão do runtime (`DELETE /workspace/skills/:name` e sua forma qualificada por workspace) requer um catálogo recém-enumerado: retorna o mesmo `503 skills_config_unavailable` quando nem o catálogo do runtime nem a enumeração local ao daemon geram um catálogo inicializado, mesmo se existir uma observação retida. `404 skill_not_found` significa que o catálogo foi enumerado e o nome não está nele.

O proprietário singular de mutação rejeita o escopo de workspace com `400 workspace_scope_requires_qualified_workspace`; mutações qualificadas rejeitam o escopo global com `400 global_scope_requires_singular_owner`. Escritas qualificadas exigem um workspace confiável. Uma ponte injetada legada retorna `501 workspace_runtime_not_supported` para escritas de configuração qualificadas que exigem coordenação de runtime. Workspaces desconhecidos, removidos, em transição ou em drenagem seguem os erros padrão de workspace qualificado e nunca recorrem ao primário.

#### Instalação de arquivos ZIP nativos de Skills e recibos

`skill_archive_install` e `skill_zip_file_source` anunciam entradas ZIP nativas e as consultas de recibo correspondentes com escopo de proprietário. Ambos estão confinados à superfície moderna de configuração. Seus `limits.maxSkillArchiveBytes`, `maxSkillArchiveExpandedBytes`, `maxSkillArchiveEntries` e `maxSkillArchiveManifestBytes` aplicam-se apenas a essas duas fontes: 50 MiB comprimido, 200 MiB expandido, 4096 registros ZIP e 32 MiB para a raiz efetiva `SKILL.md`. Diretórios explícitos e metadados ignorados contam como registros antes da filtragem; pais implícitos não contam. Metadados ignorados não são inflados. Limites legados de base64, diretório e GitHub, incluindo o parser JSON de 10 MiB, permanecem inalterados.

- `POST /workspace/config/skills/install-archive?name=...&attemptId=...` instala globalmente; `/workspaces/:workspace/config/skills/install-archive` instala no workspace selecionado. Envie `application/octet-stream` sem codificação de conteúdo HTTP. A rota fixa o escopo.
- As rotas modernas existentes de instalação JSON também aceitam `{ "name": "example", "scope": "global", "attemptId": "<UUID>", "source": { "type": "zip-file", "path": "/absolute/daemon/path.zip", "sha256": "<optional 64 hex digits>" } }`. Rotas qualificadas exigem `scope: "workspace"`. O daemon copia o arquivo regular aberto para armazenamento privado e nunca remove ou renomeia o arquivo do chamador. Mantenha a fonte estável enquanto ela é copiada; verificações de metadados sozinhas não constituem um snapshot atômico.
- `GET /workspace/config/skills/install-attempts/:attemptId` e `GET /workspaces/:workspace/config/skills/install-attempts/:attemptId` consultam o proprietário original. As respostas carregam `running` (com fase), `committed`, `not_committed` ou `recovery_required`. Recibos ausentes ou inacessíveis significam que o resultado não pode ser confirmado. As consultas não iniciam um runtime nem adquirem o coordenador de mutação.

O cliente fornece um UUID antes de enviar; o SDK pode gerá-lo. Um ID duplicado sob o mesmo proprietário retorna 409 sem repetir a instalação. Duas operações podem estar ativas por daemon, incluindo esperas de bloqueio e limpeza; admissões adicionais retornam 429 com `Retry-After`. Há um orçamento de 120 segundos cobrindo a ingestão de recibos até a admissão de publicação. O cancelamento antes da publicação interrompe a operação; após a admissão, commit ou rollback conclui mesmo que a conexão HTTP desapareça.

O sucesso retém o resultado da mutação e a ativação, adicionando `attemptId` e `archiveSha256`. Uma falha de ativação pós-commit é um `activationWarning`, não um commit falho. Os recibos são resultados históricos locais ao processo, retidos por dez minutos após o trabalho se estabilizar, com capacidade de 256 e sem remoção antecipada. Eles não provam que uma operação posterior não substituiu o conteúdo instalado. Reinicialização, expiração ou perda de acesso ao proprietário tornam o resultado desconhecido. Os clientes devem consultar após falhas ambíguas e não devem retransmitir automaticamente.

#### `POST /workspace/skills/refresh`

Tag de capacidade: `workspace_session_refresh`. A forma qualificada por workspace é `POST /workspaces/:workspace/skills/refresh`. A rota singular possui o runtime primário; a rota qualificada resolve o runtime confiável selecionado exato e nunca recorre ao primário. Ambas usam o portão de mutação estrito e as verificações de identidade de cliente existentes.

Recarregue explicitamente as configurações e o conteúdo dos Skills para todas as sessões ativas, ou apenas para os IDs de sessão fornecidos:

```json
{ "sessionIds": ["session-1", "session-2"] }
```

Omitir `sessionIds` atualiza todas as sessões ativas. Os IDs devem ser strings não vazias e são deduplicados na ordem da solicitação; `[]` retorna contagens zero sem atualizar sessões ou caches. Formatos de solicitação inválidos retornam HTTP 400. IDs desconhecidos e IDs pertencentes a outro workspace retornam HTTP 404 antes que qualquer atualização comece. As sessões selecionadas são roteadas apenas para seus canais de motor de execução proprietários; canais não relacionados não recebem comando de atualização.

Resposta (200):

```json
{
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "configsRefreshed": 3,
  "configsFailed": 0,
  "reason": "all"
}
```

As contagens descrevem as sessões selecionadas e as configurações compartilhadas/sessão atualizadas para seus canais proprietários. A seleção controla a atualização imediata da sessão e notificações de comando; caches de canal compartilhados podem mudar, e eventos de workspace permanecem amplos ao workspace. A solicitação explícita não atualiza a revisão ou prontidão do coordenador de Skills. Habilitar/desabilitar Skills, instalar/excluir e reconciliação automática mantêm seu comportamento existente de atualização completa. Esta rota não adiciona `refreshRuntime` ou `sessionIds` aos corpos de alternância de Skills.

#### `POST /workspace/skills/:name/enable`

Tag de capacidade: `workspace_skill_settings_toggle`. A forma qualificada por workspace é `POST /workspaces/:workspace/skills/:name/enable`.

Atualize as configurações de Skill do workspace para um nome. Ao habilitar, o daemon primeiro resolve nomes criados por extensões contra uma observação nova do catálogo, ignorando dados retidos e limitação de leitura e aguardando ACP mais fallback local do daemon se necessário; se ambas as fontes novas falharem, uma observação retida é usada antes da heurística de nome legada. Os nomes não são validados contra o catálogo. Desabilitar não lê o catálogo. O nome da solicitação com espaços removidos nas extremidades é passado para a persistência e retornado na resposta. Habilitar qualquer nome registra uma opt-in `skills.enabled` do workspace, mesmo antes da instalação; desabilitar remove essa opt-in e adiciona uma entrada `skills.disabled` do workspace. Entradas existentes para Skills que não estão mais carregadas são preservadas, e entradas duplicadas/variantes de maiúsculas/minúsculas para o alvo são colapsadas. Uma entrada `skills.disabled` rígida herdada de um escopo superior permanece autoritativa para disponibilidade efetiva, mas não impede que o escopo do workspace registre ou remova sua própria declaração. As declarações do workspace participam, de outra forma, da resolução `skills.disabled > skills.enabled > skills.defaultDisabled` usual e podem sobrescrever entradas `skills.defaultDisabled` ou `skills.enabled` de escopos superiores.

Isso é diferente da operação de skill gerenciada `qwen/skills/setEnabled` do ACP e do campo de frontmatter `disable-model-invocation`. Para um pai Extension ativo, a disponibilidade efetiva da Skill segue `skills.disabled` > `skills.enabled` > `skills.defaultDisabled` > override interno do workspace > manifest `skillStates` > habilitado. Ambas as desabilitações rígidas e padrão removem a skill da disponibilidade de comandos de barra/modelo e rejeitam a execução posterior da skill. `disable-model-invocation: true` mantém a invocação direta pelo usuário disponível e apenas oculta a skill da invocação do modelo.

Solicitação:

```json
{ "enabled": false }
```

Resposta (200):

```json
{
  "skillName": "review",
  "enabled": false,
  "changed": true,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0
}
```

`activation` reflete a vivacidade do filho e qualquer atualização necessária independentemente de `changed`. É `applied` quando um filho ACP está vivo e qualquer atualização necessária tem sucesso, `deferred` quando nenhum filho estava vivo na verificação de vivacidade ou uma solicitação alterada perde seu filho/sessão durante a atualização necessária, e `partial` quando pelo menos uma outra atualização necessária falha. Uma operação sem efeito pode, portanto, ser `applied` ou `deferred` com `changed: false`; quando `changed` é verdadeiro e a ativação é `deferred`, a declaração persistida é usada quando um filho inicia. Sessões ocupadas são incluídas em uma atualização necessária. O daemon recarrega as configurações do workspace para o filho ACP e cada sessão ativa, notifica consumidores do SkillManager e envia `available_commands_update`. Uma solicitação já enviada ao modelo não é reescrita; validações subsequentes, snapshots de comando e contextos do modelo usam o novo estado. Se a persistência falhar, nenhuma atualização ou evento é emitido. Se a atualização de uma sessão falhar, a configuração comprometida é mantida. Quando o filho retorna resultados por sessão, as contagens de sessões são exatas. Se o controle de atualização em si falhar antes de retornar esses resultados, `sessionsFailed: 1` é um limite inferior conservador indicando que a solicitação de atualização falhou.

Erros:

- `400 {code: 'invalid_skill_name'}` — parâmetro de caminho vazio, ou mais de 256 caracteres.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` ausente ou não booleano.
- `403 {code: 'untrusted_workspace'}` — o workspace selecionado não é confiável.

A mutação reutiliza o evento `settings_changed` com escopo de workspace para cada chave alterada (`skills.disabled` e/ou `skills.enabled`); ela não adiciona um novo tipo de evento. Cada um desses eventos inclui o mesmo objeto `mutation`: `{ id, kind: 'skill_toggle', skills: [{ name, enabled }], activation, sessionsRefreshed, sessionsFailed }`. `id` correlaciona todos os eventos de configurações produzidos por uma solicitação de alternância. `skills` lista os nomes solicitados e valores habilitados solicitados cujas declarações de configurações do workspace realmente mudaram; uma configuração de escopo superior pode deixar a disponibilidade efetiva inalterada. Células de status de skill do workspace incluem campos opcionais `disabledReason: 'hard' | 'default' | 'inactive_extension'` e `lockedScope: 'system' | 'user' | 'systemDefaults'`.

#### `POST /workspace/skills/enable`

Tag de capacidade: `workspace_skill_settings_batch_toggle`. A forma qualificada pelo workspace é `POST /workspaces/:workspace/skills/enable`.

Atualize as configurações de Skill do workspace para até 100 nomes em uma solicitação; o limite conta as entradas brutas `skillNames` antes da deduplicação. Os nomes têm espaços removidos nas extremidades e são deduplicados sem distinção de maiúsculas/minúsculas, preservando a ordem e a capitalização da primeira ocorrência. Ao habilitar, o daemon primeiro resolve nomes criados por extensões contra uma observação nova do catálogo, ignorando dados retidos e limitação de leitura e aguardando ACP mais fallback local do daemon se necessário; se ambas as fontes novas falharem, uma observação retida é usada antes da heurística de nome legada. Os nomes não são validados contra o catálogo. Desabilitar não lê o catálogo. Ele aplica todas as mudanças de declaração resultantes em no máximo uma escrita de configurações bloqueada e, quando algo mudou, atualiza as sessões ativas uma vez. Habilitar sempre registra uma opt-in `skills.enabled` explícita do workspace, incluindo nomes ainda não instalados, para que possa sobrescrever uma desabilitação interna de uma Extension. Repetir uma declaração idêntica permanece uma operação sem efeito. Falhas inesperadas de persistência ou geração de tempo de execução fazem toda a solicitação falhar.

Solicitação:

```json
{
  "skillNames": ["review", "deploy", "missing"],
  "enabled": false
}
```

Resposta (200):

```json
{
  "enabled": false,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "results": [
    {
      "skillName": "review",
      "enabled": false,
      "changed": true
    },
    {
      "skillName": "deploy",
      "enabled": false,
      "changed": true
    },
    {
      "skillName": "missing",
      "enabled": false,
      "changed": true
    }
  ],
  "errors": []
}
```

Solicitações malformadas retornam HTTP 400 com `invalid_skill_names`, `invalid_skill_name` ou `invalid_enabled_flag`. Autenticação, confiança do workspace, identidade do cliente, falhas inesperadas de persistência e falhas de geração de tempo de execução fazem toda a solicitação falhar através dos portões de rota padrão. `errors` permanece na resposta para compatibilidade de transmissão e está vazio para nomes estruturalmente válidos. `activation`, `sessionsRefreshed` e `sessionsFailed` de nível de lote descrevem a vivacidade do filho e a única atualização de sessão ao vivo compartilhada por todos os resultados alterados. Um lote em que nenhum alvo mudou ainda pode responder `applied` quando um filho está vivo ou `deferred` quando nenhum existe, correspondendo à resposta de operação sem efeito de Skill única, então derive o que realmente mudou da flag `changed` de cada resultado. Quando pelo menos um alvo muda, o daemon emite os mesmos metadados de mutação `settings_changed` da rota de Skill única; cada evento `skills.disabled` / `skills.enabled` daquela solicitação compartilha um único `mutation.id`.

#### `PUT /skills/activation`

Capacidade: `user_skill_activation` (anunciada quando a persistência de Configurações do Usuário está disponível). Esta mutação global do processo salva preferências de Skill do Usuário sem exigir um workspace confiável ou escanear Skills instaladas. Ela usa os portões de mutação autenticados usuais; um opcional `X-Qwen-Client-Id` deve pertencer a um runtime ainda gerenciado, incluindo um sendo drenado.

```json
{
  "skillNames": ["rust:pdf", "go:review"],
  "state": "enabled"
}
```

Forneça 1–100 nomes (no máximo 256 caracteres cada). Os nomes têm espaços removidos nas extremidades e são deduplicados sem distinção de maiúsculas/minúsculas. `state` é `enabled` ou `disabled`. Apenas `disabled` aceita `mode`: `hard` (padrão) ou `default`. Os nomes não precisam estar instalados ainda. Lotes inválidos são rejeitados antes de qualquer escrita.

O Qwen lê as configurações de Usuário mais recentes sob sua trava de escrita de configurações, adiciona cada nome explícito a `skills.enabled`, `skills.disabled` ou `skills.defaultDisabled` e remove esse mesmo nome das outras duas listas em uma única gravação. Outros nomes, grafias, escopos e configurações são preservados. Em particular, habilitar `rust:pdf` não remove uma restrição `pdf`. Nomes simples explícitos mantêm as regras de correspondência existentes. As restrições do sistema ainda se aplicam.

```json
{
  "scope": "user",
  "state": "enabled",
  "results": [
    { "skillName": "rust:pdf", "changed": true },
    { "skillName": "go:review", "changed": true }
  ],
  "propagation": "queued"
}
```

As respostas desabilitadas também incluem o `mode` normalizado. `propagation` descreve o agendamento, não a disponibilidade medida: `queued` significa que pelo menos um runtime ativo enfileirou uma atualização; `deferred` significa que as configurações salvas aguardam o trabalho do ciclo de vida do runtime; `not_required` significa que esta solicitação não alterou nada. Uma operação nula (no-op) não escreve nem emite eventos e não certifica a conclusão de atualizações anteriores. Leia os endpoints de configuração do workspace existente e status da Skill do runtime para obter o estado efetivo.

Alterações bem-sucedidas invalidam caches de configuração e transmitem eventos `settings_changed` comuns com `scope: "user"`. As atualizações relêem as configurações de Usuário e Workspace atomicamente; falhas na atualização de configuração ou sessão retêm trabalhos pendentes para recuperação do ciclo de vida e tentativas limitadas. O comportamento de atualização exclusivo do workspace existente permanece inalterado.

Entrada malformada retorna HTTP 400 (`invalid_skill_names`, `invalid_skill_name`, `invalid_skill_activation_state` ou `invalid_skill_activation_mode`). Um fechamento da geração do runtime primário antes do commit retorna HTTP 503 com `Retry-After: 1`, assim como nas rotas de configurações. O SDK expõe `setUserSkillsActivation(skillNames, activation, { clientId? })` e envia um PUT sem uma leitura preliminar de configuração.

#### `POST /workspace/init`

Tag de capacidade: `workspace_init`. IO de arquivo puro — sem ida e volta ACP, **sem invocação de LLM**.

Cria um esqueleto vazio de `QWEN.md` (ou a substituição de configurações `context.fileName` do workspace) na raiz do workspace primário do daemon. Apenas mecânico — para preenchimento de conteúdo orientado por IA, siga com `POST /session/:id/prompt`.

Por padrão, recusa-se a sobrescrever quando o arquivo de destino existe com conteúdo não-vazio. Arquivos contendo apenas espaços em branco são tratados como ausentes (corresponde ao comando de barra `/init` local).

Solicitação:

```json
{ "force": false }
```

Resposta (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` é `'created'` para criações novas, `'noop'` quando um arquivo existente contendo apenas espaços em branco foi deixado intacto (nenhuma gravação realizada), e `'overwrote'` quando `force: true` substituiu conteúdo não-vazio. O evento SSE `workspace_initialized` espelha a ação da resposta — observadores podem filtrar por `action !== 'noop'` para reagir apenas a alterações reais no disco.

Erros:

- `400 {code: 'invalid_force_flag'}` — `force` não é booleano.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — o arquivo existe com conteúdo não-vazio e `force` está omitido/falso. O corpo contém o caminho absoluto e o tamanho (bytes) para que os clientes do SDK possam renderizar um prompt "sobrescrever N bytes?" sem precisar verificar novamente o status do arquivo.

Evento SSE (escopo do workspace): `workspace_initialized` com `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/reload`

Recarregue as configurações MCP persistidas na configuração de descoberta do workspace e em todas as sessões ativas. A forma qualificada pelo workspace é `POST /workspaces/:workspace/mcp/reload`.

Corpo da solicitação:

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll` é opcional e tem como padrão `false`, preservando a reconciliação incremental. Quando verdadeiro, o daemon reconecta todos os servidores MCP configurados elegíveis após a reconciliação das configurações. Alternativamente, passe `forceReconnectWhich: ["server-a", "server-b"]` para reconectar apenas servidores nomeados. As opções são mutuamente exclusivas. Uma reconexão forçada faz cada transporte ler credenciais que outro processo local do Qwen Code pode ter escrito no armazenamento de tokens; ela não inicia um fluxo de autorização OAuth.

A rota retorna `202 { "accepted": true }`; consulte `GET /workspace/mcp` para obter o status final da conexão. Valores de opção inválidos retornam 400.

#### `POST /workspace/mcp/:server/restart`

Tag de capacidade: `workspace_mcp_restart`. Bridge → extMethod ACP `qwen/control/workspace/mcp/restart`.

Reinicia um servidor MCP configurado através do `McpClientManager.discoverMcpToolsForServer` do filho ACP (desconexão + reconexão + redescoberta). Pré-verifica o snapshot do orçamento ao vivo da contabilidade da PR 14 v1, para que uma reinicialização em um workspace com orçamento saturado retorne uma recusa suave em vez de desencadear uma cascata `BudgetExhaustedError`.

O corpo da solicitação está vazio (`{}`). O parâmetro de caminho é o nome do servidor codificado em URL conforme aparece na configuração `mcpServers`.

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

Motivos de pulo suave (todos retornam 200):

| `reason` | Significado |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'` | Outra descoberta / reinicialização para este servidor já está em andamento. A rota retorna imediatamente em vez de aguardar a promessa original. O chamador deve tentar novamente após um curto atraso. |
| `'disabled'` | O servidor está configurado, mas listado em `excludedMcpServers`. Reative-o antes de reiniciar. |
| `'budget_would_exceed'` | O daemon está `--mcp-budget-mode=enforce`, o servidor de destino não está atualmente em `reservedSlots` e o total ao vivo atingiu `clientBudget`. O chamador deve liberar um slot primeiro. |

Erros (não-2xx):

- `400 {code: 'invalid_server_name'}` — parâmetro de caminho vazio.
- `404` — nome do servidor não presente na configuração `mcpServers`, ou nenhum canal ACP ativo existe (a reinicialização requer intrinsecamente uma instância `McpClientManager` ativa).
- `500` — erro interno (por exemplo, `ToolRegistry` não inicializado).

Eventos SSE (escopo do workspace): `mcp_server_restarted` com `{serverName, durationMs, originatorClientId?}` em caso de sucesso; `mcp_server_restart_refused` com `{serverName, reason, originatorClientId?}` em caso de pulo suave.

#### `POST /workspaces/:workspace/language`

Sincronização de idioma da interface do usuário do workspace sem sessão, registrada quando a persistência de configurações está disponível. Propriedade: runtime selecionado. Resolve o id do workspace ou o cwd absoluto codificado, requer um runtime confiável ativo e valida a propriedade do cliente contra esse runtime. Gerações inativas retornam `503 workspace_runtime_unavailable`; seletores não resolvidos nunca recorrem ao workspace primário.

Solicitação: `{ "language": "zh" }`. O idioma usa os mesmos códigos suportados que `POST /language`. Persiste apenas o `general.language` do workspace selecionado, então lê sua configuração mesclada efetiva e sincroniza canais já ativos através de `qwen/control/user/language` com `scope: "workspace"`. Canais frios são ignorados sem iniciar um processo ou criar uma conversa. As configurações de idioma de saída e modelo permanecem inalteradas; `syncOutputLanguage: true` é rejeitado.

A resposta tem a mesma estrutura que `POST /language`, com `outputLanguage: null`; `language` é o idioma configurado efetivo (incluindo `auto`) e `refresh` conta apenas o runtime selecionado. Um evento `language_changed` do workspace é emitido em caso de sucesso. O SDK expõe `client.workspaceByCwd(cwd).setUiLanguage(language)` via REST, independentemente do transporte de sessão.

#### `POST /language`

Tag de capacidade: `user_language_sync` (condicional — anunciado apenas quando a persistência de configurações está disponível, mesma condição que `workspace_settings`). Bridge → ACP extMethod `qwen/control/user/language` por runtime confiável com um canal ativo.

Sincronização de idioma **de nível de usuário** sem sessão (problema #10234), para hosts que precisam alternar o idioma antes que qualquer sessão exista (por exemplo, uma página de boas-vindas). Classificação de propriedade: global ao processo — altera apenas o estado global do usuário (`~/.qwen/settings.json`, o `~/.qwen/output-language.md` global) além da atualização best-effort do runtime, portanto não aceita seletor de workspace nem ID de sessão. Registrado atrás do portão não estrito `mutate()`, correspondendo ao irmão `POST /session/:id/language`.

O processo daemon é o único escritor: ele persiste `general.language` (e, quando `syncOutputLanguage` é verdadeiro, `general.outputLanguage` mais o `output-language.md` global) antes de distribuir. Cada runtime confiável então alterna seu próprio idioma de UI do processo e recarrega as configurações de escopo de usuário do disco; quando `syncOutputLanguage` é verdadeiro, também atualiza a instrução do sistema de cada sessão local. Diferenças em relação à rota com escopo de sessão:

- Arquivos de idioma de saída vinculados ao projeto NÃO são reescritos — uma sessão cujo workspace tem seu próprio `.qwen/output-language.md` mantém essa substituição (o escopo do projeto prevalece na atualização).
- Zero sessões e zero canais de runtime ativos são um **sucesso**, não um erro; um runtime sem um canal ativo é ignorado (não falha) e lê os arquivos persistidos quando seu canal for iniciado novamente.
- Runtimes de workspace não confiáveis são ignorados, correspondendo à postura `403 untrusted_workspace` da rota de sessão.

Requisição:

```json
{ "language": "zh", "syncOutputLanguage": true }
```

`language` deve ser um dos códigos listados em `/capabilities` `supportedLanguages` (mais `'auto'`); `syncOutputLanguage` assume o valor padrão `false`.

Resposta (200):

```json
{
  "language": "zh",
  "outputLanguage": "Chinese",
  "refresh": { "runtimes": 1, "sessions": 2, "failed": 0 }
}
```

`language` é a localidade de UI resolvida pelo daemon, portanto uma requisição `'auto'` pode retornar um idioma concreto; os hosts devem ler a configuração `general.language` persistida para o estado do seletor. `outputLanguage` é `null` quando `syncOutputLanguage` era falso. `refresh.runtimes` conta os runtimes que aplicaram a alternância sobre um canal ativo; `refresh.sessions` soma as atualizações de instrução do sistema por sessão; `refresh.failed` agrega falhas de atualização por sessão e runtimes que falharam (a distribuição é best-effort e nunca falha a requisição após a persistência ter sido bem-sucedida).

Erros:

- `400 {code: 'invalid_language', allowed: [...]}` — código de idioma desconhecido.
- `400 {code: 'invalid_sync_flag'}` — `syncOutputLanguage` não é booleano.
- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` não é um cliente conhecido por nenhum runtime (o cabeçalho é opcional; omita-o quando nenhuma sessão existir).
- `500 {code: 'persist_error'}` — falha na escrita de configurações do usuário ou arquivo de idioma de saída; a etapa que falhou e tudo o que veio depois dela não foram executadas (etapas aplicadas anteriormente, como a escrita `general.language`, não são revertidas).
- `404` — o daemon é anterior à rota ou foi compilado sem persistência de configurações (verifique a tag de capacidade).

Evento SSE (com escopo de workspace, nos barramentos de sessão de todos os runtimes): `language_changed` com `{language, outputLanguage, userLevel: true, originatorClientId?}`. O marcador `userLevel: true` distingue esta distribuição do evento por sessão da rota de sessão, que carrega `sessionId` em vez disso.

### `GET /session/:id/events` (SSE)

Inscreva-se no fluxo de eventos da sessão.

Cabeçalhos:

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
X-Qwen-Event-Epoch: ...  ← optional, pairs the cursor with its bus epoch
X-Qwen-Client-Id: ...    ← optional client identity and diagnostic correlation
```

Parâmetros de consulta:

| Parâmetro | Obrigatório | Observações |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | não | Limite de **backlog de quadros ao vivo** por assinante. Intervalo `[16, 2048]`, padrão 256. Quadros de replay forçados no momento da inscrição estão isentos dos limites de quadros e bytes; o que realmente os consome são eventos ao vivo que chegam enquanto o assinante ainda está drenando um grande replay `Last-Event-ID: 0`. Aumente para reconexões frias para que a cauda ao vivo não dispare o aviso/evicção de cliente lento antes que o consumidor alcance. O limite de bytes serializados ao vivo é fixo no lado do daemon (padrão 2 MiB) e não possui parâmetro de consulta. Valores fora do intervalo / não decimais / presentes mas vazios retornam `400 invalid_max_queued` antes que o handshake SSE seja aberto. Pré-verificação `caps.features.slow_client_warning` — daemons antigos ignoram silenciosamente o parâmetro. |
| `connectReason` | não | Dica diagnóstica reportada pelo cliente: `initial`, `resume`, `prompt_restart`, `stream_end`, `transport_error`, `state_resync` ou `unknown`. Valores inválidos normalizam para `unknown` e nunca rejeitam o handshake. O daemon não usa este campo para autenticação, replay, evicção, deduplicação ou substituição de stream. |
| `previousStreamId` | não | UUID do último stream REST/SSE aceito reportado pelo cliente. Valores inválidos são ignorados. Esta é apenas linhagem best-effort e nunca altera o comportamento do stream. |

Um handshake bem-sucedido inclui `X-Qwen-SSE-Stream-Id: <uuid>`. Gateways de navegador devem preservar esse cabeçalho de resposta e expô-lo através de `Access-Control-Expose-Headers`. Daemons antigos ou intermediários podem omiti-lo; os clientes devem continuar normalmente e tratar a linhagem como indisponível. O id identifica esta conexão física REST/SSE e correlaciona seu ciclo de vida do daemon, diagnósticos de fila e rastreamento de requisições.

Formato do quadro. A linha `data:` é o **envelope completo do evento**, stringificado em JSON em uma única linha — `{id?, v, type, data, originatorClientId?}`. A payload específica do ACP (argumentos `sessionUpdate`, `requestPermission` etc.) fica sob o campo `data` do envelope; o `type` do próprio envelope corresponde à linha SSE `event:`.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← every 15s, no payload

event: client_evicted    ← terminal frame, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← terminal frame for byte overflow, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

As linhas `id:` / `event:` no nível SSE duplicam `envelope.id` / `envelope.type` para compatibilidade com EventSource. Consumidores de `fetch` bruto (o `parseSseStream` do SDK) leem tudo do envelope JSON e ignoram as linhas de preâmbulo SSE.

| Tipo de evento | Gatilho |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update` | Qualquer notificação ACP `sessionUpdate` (chunks LLM, chamadas de ferramentas, uso) |
| `permission_request` | Agente solicitou aprovação de ferramenta |
| `permission_resolved` | Algum cliente votou em uma permissão via `POST /permission/:requestId` |
| `permission_partial_vote` | (apenas consenso) Um voto foi registrado, mas o quórum ainda não foi atingido. Carrega `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pré-verificação `caps.features.permission_mediation`. |
| `permission_forbidden` | Um voto foi rejeitado pela política ativa (incompatibilidade `designated`, `local-only` não-loopback ou eleitor `consensus` não presente no snapshot). Carrega `{requestId, sessionId, clientId?, reason}`. Pré-verificação `caps.features.permission_mediation`. |
| `model_switched` | `POST /session/:id/model` bem-sucedido |
| `model_switch_failed` | `POST /session/:id/model` rejeitado |
| `session_died` | Processo filho do Agent caiu inesperadamente. **Terminal: o stream SSE fecha após este quadro; a sessão desapareceu de `byId`.** Assinantes devem reconectar via `POST /session` para iniciar uma nova. |
| `slow_client_warning` | Local do assinante: backlog de quadros ao vivo ou backlog de bytes serializados ao vivo ≥ 75% cheio. **Não terminal** — o fluxo continua; o aviso é um alerta antes da expulsão. Carrega `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}` onde `threshold` é `frames`, `bytes` ou `frames_and_bytes`. Dispara UMA VEZ por episódio de estouro; rearma após ambas as medições drenarem abaixo de 37,5%. Sem `id` (sintético). Pré-verificação `caps.features.slow_client_warning`. |
| `client_evicted` | Local do assinante: estouro da fila. `reason` é `queue_overflow` para o limite de quadros ao vivo e `queue_bytes_overflow` para o limite de bytes serializados ao vivo. **Terminal: o fluxo SSE fecha após este quadro** (sem `id` — sintético). Outros assinantes na mesma sessão continuam. |
| `stream_error` | Erro no lado do daemon durante a distribuição em leque. **Terminal: o fluxo SSE fecha após este quadro** (sem `id` — sintético). |

Semântica de reconexão:

- Envie `Last-Event-ID: <n>` para reproduzir eventos com `id > n` do anel por sessão (profundidade padrão **8000**, ajustável via `qwen serve --event-ring-size <n>`).
- **Detecção de lacuna:** dentro da mesma época, se o primeiro id retido do anel for maior que `<n> + 1`, o daemon emite um quadro `state_resync_required` sem id com `reason: 'ring_evicted'` antes de reproduzir o sufixo sobrevivente. As outras razões são `epoch_reset`, `seeded_replay_not_in_ring` e `replay_budget_exceeded`; o sinal de orçamento segue o prefixo de reprodução entregue. Veja [razões de ressincronização e ordenação](./daemon/09-event-schema.md#resync-reasons-and-ordering) para seus gatilhos, campos de cursor e regras de recuperação.
- O SDK trava `awaitingResync`; os clientes devem chamar `POST /session/:id/load` e reconstruir a partir da janela atual limitada de instantâneo de reprodução. Esse instantâneo pode começar com `history_truncated` quando entradas de reprodução mais antigas na memória foram descartadas; esse marcador é informativo e não deve iniciar outro loop de ressincronização. Seu âncora de paginação opcional está [congelada na expulsão da janela de reprodução](./daemon/09-event-schema.md#history-truncation-anchor).
- Os IDs são monotônicos dentro da época do barramento de eventos de uma sessão, começando em 1. Uma publicação rejeitada não deve consumir um id; veja [invariantes de sequência de eventos](./daemon/09-event-schema.md#state-and-forward-compatibility).
- Quadros sintéticos (`client_evicted`, `slow_client_warning`, `stream_error`, `state_resync_required`, `replay_complete`) omitem intencionalmente `id` para não gastar um slot de sequência para outros assinantes. `replay_complete` marca o fim da reprodução, incluindo reprodução vazia ou incompleta; isso não significa que a ressincronização foi concluída.

Contrapressão:

- A fila por assinante tem como padrão `maxQueued: 256` itens ao vivo mais um limite de 2 MiB de bytes serializados ao vivo pertencente ao daemon. Quadros de reprodução durante a reconexão, `slow_client_warning` e `client_evicted` ignoram ambos os limites.
- Substitua apenas o limite de quadros via `?maxQueued=N` (intervalo `[16, 2048]`) na solicitação SSE. Deliberadamente não há `?maxQueuedBytes`; os clientes não podem aumentar o orçamento de memória do daemon.
- Quando o backlog de quadros ao vivo ou o backlog de bytes ao vivo de um assinante cruza 75% cheio, o barramento força o envio de um quadro sintético `slow_client_warning` para esse assinante (uma vez por episódio de estouro; rearma após ambas as medições drenarem abaixo de 37,5%). O fluxo permanece aberto — o aviso é um alerta para que o cliente possa drenar mais rápido ou desconectar + reconectar limpo.
- Se o limite de quadros ao vivo transbordar, o barramento emite `client_evicted` com `reason: "queue_overflow"`. Uma fila ao vivo vazia admite um evento superdimensionado inalterado. Antes de rejeitar um estouro de bytes em uma fila não vazia, o barramento pode descartar todo o `rawOutput.html` de um App MCP para `''` quando seu `fallbackText` não estiver vazio. Se essa cópia couber, a entrega continua sem expulsão ou sinal de ressincronização. Caso contrário, ele emite `reason: "queue_bytes_overflow"`. Em qualquer expulsão, o quadro terminal é forçado e a assinatura fecha.
- Essa degradação opcional do App afeta apenas a entrega enfileirada. A entrega direta e o anel de reprodução mantêm o original; a janela de reprodução compactada aplica seu próprio orçamento. A cópia degradada carrega o mesmo id de evento da entrada original do anel. Portanto, uma carga útil entregue com id não precisa ser igual à carga útil do anel, e retomar após esse id não recuperará seu HTML. Clientes que exigem o documento devem explicitamente repaginar a transcrição persistida, que também está sujeita a limites de tamanho de página.

### `POST /session/:id/permission/:requestId`

Emita o mesmo voto documentado abaixo, mas roteie-o através do runtime que possui a sessão ao vivo nomeada. Novas integrações multi-workspace devem usar esta forma em vez da rota global de processo legada. Pré-verificação `caps.features.session_permission_vote`.

O corpo da solicitação, políticas de mediação, resultados e resposta de sucesso são idênticos a `POST /permission/:requestId`. O cabeçalho `X-Qwen-Client-Id` opcional participa da política designada e de consenso. Falhas usam valores `code` estáveis onde indicado; entrada malformada e uma corrida de solicitação pendente perdida podem omitir `code`:

- `400` — um corpo de voto malformado (sem `code`) ou uma identidade de cliente inválida (`invalid_client_id`), ou `invalid_option_id` quando a opção selecionada não foi oferecida. Releia as opções oferecidas em vez de tentar novamente o mesmo voto.
- `403` — `permission_forbidden` quando a política ativa rejeita o eleitor, ou `untrusted_workspace` quando um workspace proprietário não primário não é confiável. Um proprietário primário não confiável está isento desta verificação de confiança e o voto pode ser aceito.
- `404` — `session_not_found` quando nenhum proprietário ativo existe, ou `code` quando a solicitação não está pendente.
- `500` — `cancel_sentinel_collision` quando o `allowedOptionIds` do agente contém o sentinela reservado `__cancelled__`, ou `ambiguous_session_owner` quando mais de um workspace reivindica a sessão.
- `501` — `permission_policy_not_implemented` para uma política que esta build não implementa.
- `503` — `workspace_runtime_unavailable` quando o runtime proprietário está indisponível, ou `daemon_draining` quando o daemon não está mais aceitando trabalho.

Ele nunca tenta novamente contra a ponte primária. O método do SDK TypeScript é `respondToSessionPermission()`.

### `POST /permission/:requestId`

Emita um voto em uma `permission_request` pendente. A **política de mediação** ativa decide quem vence:

| Política | Comportamento |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (padrão) | Qualquer votante validado vence; votantes posteriores recebem `404`. Baseline pré-F3. |
| `designated` | Apenas o originador do prompt (`originatorClientId`) decide; não-originadores recebem `403 permission_forbidden / designated_mismatch`. Recorre ao primeiro respondedor para prompts anônimos. |
| `consensus` | N de M votantes devem concordar (padrão `N = floor(M/2) + 1`, substituído via `policy.consensusQuorum`). A primeira opção a atingir `N` vence. Votos não resolvidos recebem quadros SSE `200` + `permission_partial_vote`. |
| `local-only` | Apenas votantes de loopback decidem; chamadores remotos recebem `403 permission_forbidden / remote_not_allowed`. |

A política ativa é configurada em `settings.json` sob `policy.permissionStrategy` e exibida em `/capabilities` em `body.policy.permission`. Faça uma verificação prévia de `caps.features.permission_mediation` (com `modes: [...]`) para o conjunto suportado pela build.

> **F3 (#4175): coordenação de permissões multi-cliente.** O F3 adicionou as quatro políticas acima. Daemons pré-F3 tinham hardcoded o primeiro respondedor; a forma do wire permanece bit a bit inalterada quando a política configurada é `first-responder`. Novos eventos (`permission_partial_vote`, `permission_forbidden`) são aditivos — SDKs antigos os veem como `unrecognized_known_event` e os ignoram graciosamente.

> **Tempo limite de permissão (desabilitado por padrão).** Um `permission_request` permanece pendente até: (a) algum cliente votar aqui, (b) `POST /session/:id/cancel` disparar, (c) o cliente HTTP que impulsiona o prompt desconectar (cancelamento no meio do prompt resolve permissões pendentes como `cancelled`), (d) a sessão for encerrada, (e) o daemon for desligado, **ou (f) seu tempo limite configurado disparar**. No disparo do tempo limite, o `requestPermission` do agente resolve como `{outcome: 'cancelled'}`, o anel de auditoria registra uma entrada `permission.timeout`, o stderr do daemon emite um breadcrumb de uma linha, e o barramento SSE distribui o quadro cancelado padrão `permission_resolved` para que os assinantes façam a limpeza. O tempo limite compartilhado é configurável via `BridgeOptions.permissionResponseTimeoutMs` ou `qwen serve --permission-response-timeout-ms`. Seu padrão é `0`, então tanto permissões comuns quanto `ask_user_question` aguardam indefinidamente por uma decisão humana. Cancelamento do eleitor, cancelamento da sessão, limpeza de desconexão e desligamento do daemon ainda resolvem interações pendentes como canceladas.

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

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — aceitar / rejeitar / prosseguir-uma-vez / etc., conforme as opções oferecidas pelo agente
- `{ "outcome": "cancelled" }` — descartar a requisição (corresponde ao que `cancelSession` / `shutdown` fazem internamente)

Resposta:

- `200 {}` — seu voto foi aceito (resolvido OU registrado sob quórum de consenso)
- `400` — corpo de voto malformado (sem `code`), `invalid_client_id`, ou `invalid_option_id` quando a opção selecionada não foi oferecida; releia as opções oferecidas em vez de tentar novamente o mesmo voto
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: a política ativa rejeitou seu voto
- `404 { "error": "..." }` — o requestId é desconhecido (já resolvido, nunca existiu ou a sessão foi encerrada)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: o `allowedOptionIds` do agente contém o sentinela reservado `'__cancelled__'`; violação de contrato agente/daemon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 compatibilidade futura: um literal de política chegou ao schema mas seu ramo de mediador ainda não foi construído (atualmente inalcançável; reservado para futuras políticas)

Após um voto bem-sucedido, todo cliente conectado vê `permission_resolved` com o mesmo `requestId` e a `outcome` escolhida. Sob `consensus`, votos intermediários adicionalmente distribuem `permission_partial_vote` até o quórum.

### Rotas de fluxo de dispositivo de autenticação (issue #4175 PR 21)

O daemon intermedia uma Concessão de Autorização de Dispositivo OAuth 2.0 (RFC 8628) para que um cliente SDK remoto possa acionar um login cujos tokens chegam ao sistema de arquivos do **daemon** — não no cliente. O daemon consulta o IdP por conta própria; a única tarefa do cliente é exibir a URL de verificação + código do usuário e (opcionalmente) assinar SSE para eventos de conclusão.

Tag de capacidade: `auth_device_flow` (sempre anunciado). Provedores suportados na v1: `qwen-oauth`.

> [!note]
>
> Em novas integrações, use [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli). `GET /auth/subscription?paywallScene=cli` retorna o link de compra em `plansUrl`. Inicie o login no navegador separadamente com `POST /auth/subscription/flows?paywallScene=cli` e consulte `GET /auth/subscription/flows/:id` até obter `authorizationUrl`.
>
> A modalidade gratuita do Qwen OAuth foi encerrada em 15 de abril de 2026. `qwen-oauth` é o identificador antigo do provedor v1 para as rotas abaixo.

**Localidade em tempo de execução.** O daemon nunca abre um navegador — mesmo que possa. O cliente decide se chama `open(verificationUri)` localmente; em um pod headless (a implantação canônica do Modo B) o usuário abre a URL em qualquer dispositivo que tenha um navegador. Veja `docs/users/qwen-serve.md` para a UX recomendada.

**Sem vazamento de token nos eventos.** `auth_device_flow_started` carrega apenas `{deviceFlowId, providerId, expiresAt}`. O código do usuário e a URL de verificação retornam ponto a ponto no corpo da resposta POST 201 e via `GET /workspace/auth/device-flow/:id`; eles nunca são transmitidos via SSE.

**Singleton por provedor.** Um segundo `POST` para o mesmo provedor enquanto um fluxo está pendente é uma tomada de posse idempotente — retorna a entrada existente com `attached: true` em vez de iniciar uma nova requisição ao IdP.

#### `POST /workspace/auth/device-flow`

Portão de mutação estrito: requisições primárias confiáveis de loopback sem token passam. Uma requisição primária sem token que atinge o portão sem autoridade de loopback confiável recebe `401 token_required`; credenciais configuradas ausentes ou inválidas e credenciais Local Control não pareadas são rejeitadas antes com `401 Unauthorized` simples.

Requisição:

```json
{ "providerId": "qwen-oauth" }
```

Resposta (`201` início novo, `200` tomada de posse idempotente):

```json
{
  "deviceFlowId": "fa07c61b-…",
  "providerId": "qwen-oauth",
  "status": "pending",
  "userCode": "USER-1",
  "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device?entry=qwen_code&paywallScene=cli",
  "verificationUriComplete": "https://chat.qwen.ai/api/v1/oauth2/device?user_code=USER-1&entry=qwen_code&paywallScene=cli",
  "expiresAt": 1700000600000,
  "intervalMs": 5000,
  "attached": false
}
```

Erros:

- `400 unsupported_provider` — `providerId` desconhecido (a resposta inclui `supportedProviders`)
- `409 too_many_active_flows` — limite de workspace (4) atingido; cancele um com `DELETE`
- `401 token_required` — o portão estrito negou uma requisição primária sem token sem autoridade de loopback confiável
- `502 upstream_error` — o IdP retornou um erro inesperado

#### `GET /workspace/auth/device-flow/:id`

Leia o estado atual. Entradas pendentes ecoam `userCode/verificationUri/expiresAt/intervalMs`; entradas terminais (graça de 5 min) os descartam e exibem `status` + `errorKind/hint` opcional.

Retorna `404 device_flow_not_found` para ids desconhecidos e entradas removidas após a graça.

#### `DELETE /workspace/auth/device-flow/:id`

Cancelamento idempotente:

- entrada pendente → `204` + emitir `auth_device_flow_cancelled`
- entrada terminal → `204` no-op (sem re-emissão de evento)
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

Cinco eventos tipados (escopo de workspace, distribuídos para todos os barramentos de sessão ativos):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST bem-sucedido; o SDK deve se inscrever (sem userCode aqui, busque via GET se necessário)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — daemon honrou o upstream `slow_down`; clientes que fazem polling GET devem ajustar seu intervalo para corresponder
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — credenciais persistidas; `accountAlias` é um rótulo não-PII (nunca e-mail/telefone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal; `errorKind` é um de `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` é interno ao daemon: a troca com o IdP foi bem-sucedida, mas o daemon não pôde armazenar as credenciais de forma durável (EACCES / EROFS / ENOSPC). O usuário deve tentar novamente assim que a condição subjacente do disco for corrigida.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE bem-sucedido contra uma entrada pendente

> **Não compatível com MCP.** A especificação de autorização MCP (2025-06-18) exige OAuth 2.1 + código de autorização PKCE com callback de redirecionamento, o que não funciona para daemons em pods headless. A superfície de fluxo de dispositivo do Modo B é privada do daemon — clientes direcionados a servidores compatíveis com MCP devem usar um caminho de autenticação diferente.

### Upload de fragmentos de anexos de sessão

Capacidade: `session_attachment_chunk_upload`. Todas as quatro rotas abaixo são mutações pertencentes ao runtime da sessão ativa. Elas usam o bearer existente e cabeçalhos opcionais `X-Qwen-Client-Id`. Um upload pertence à sua loja de sessões criadora e à identidade exata do cliente; uma identidade omitida é distinta de um cliente nomeado.

Seja `U = /session/:id/attachment-uploads`:

| Requisição | Corpo | Resposta |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST U` | JSON `{ name, mimeType, size }`, no máximo 4 KiB | 201 `{ uploadId }` |
| `POST U/:uploadId/chunks?offset=N` | `application/octet-stream` bruto, no máximo 512 KiB | 200 `{ offset }`, próximo deslocamento de byte |
| `POST U/:uploadId/complete` | Nenhum corpo necessário; um corpo JSON é analisado e ignorado | 200 referência de anexo existente `{ type, attachmentId, mimeType, size }` |
| `DELETE U/:uploadId` | Vazio | 204 para uploads recebidos, falhados ou ausentes; 409 enquanto completando ou concluído |

O tamanho máximo do anexo ainda é 8 MiB. Os metadados seguem as regras existentes de nome de arquivo/MIME; arquivos de imagem vazios são inválidos. Envie fragmentos sequenciais de 512 KiB, com um resto exato para o último fragmento. Apenas o fragmento imediatamente anterior pode ser repetido com offset, comprimento e bytes idênticos. Lacunas, sobreposições, tentativas alteradas ou conclusão prematura retornam 409; entrada malformada retorna 400, entrada oversized retorna 413, e tipo de mídia de fragmento não suportado ou conjunto de caracteres JSON retorna 415 `invalid_attachment_upload_content_type`. Codificações de requisição não suportadas nas requisições de criação e fragmento retornam 415 `invalid_attachment_upload_encoding`. IDs de upload desconhecidos, expirados ou de propriedade diferente retornam 404 nas três rotas POST; DELETE retorna 204 para uploads ausentes e 409 durante ou após a conclusão. As requisições de criação e fragmento não aceitam corpos comprimidos. A rota de conclusão usa o parser JSON global, então um corpo JSON comprimido válido pode ser ignorado, enquanto JSON malformado é rejeitado antes da conclusão.

A conclusão valida a posse da sessão/cliente/runtime antes e depois do armazenamento. Conclusões concorrentes ou repetidas retornam o mesmo resultado sem outra escrita. Uma cópia concorrente de sessão retorna temporariamente `503 attachment_upload_store_busy` com `retryable: true`; os bytes em staging permanecem disponíveis para conclusão com o mesmo ID de upload após o término da cópia. Falhas reais de armazenamento permanecem terminais para esse ID de upload. Uploads em recebimento expiram cinco minutos após a criação. Recibos de sucesso/falha expiram após cinco minutos e têm limite de 1024 por processo daemon. Fechamento/exclusão de sessão e desregistro final do cliente invalidam uploads inacabados. Apenas anexos concluídos podem ser lidos, referenciados ou copiados. Um DELETE não pode reverter um anexo já em finalização ou concluído; um arquivo concluído pode permanecer após uma resposta perdida.

O staging é limitado a 128 MiB e 32 uploads ativos entre todos os runtimes em um processo, com no máximo oito uploads ativos por loja de sessões. Exaustão retorna `429 attachment_upload_capacity_exceeded`; limites de taxa de requisição existentes também se aplicam. Este é um limite de buffer de staging, não a memória total do processo. IDs temporários não sobrevivem a uma reinicialização do daemon.

O SDK TypeScript usa automaticamente este protocolo para anexos maiores que 512 KiB quando anunciado, com dois arquivos simultâneos por cliente e fragmentos sequenciais. Ele usa REST autenticado mesmo com transportes ACP, armazena em cache descobertas válidas por 60 segundos e mantém o endpoint bruto existente para arquivos menores e daemons mais antigos. Tentativas de apêndice/conclusão ocorrem no máximo duas vezes após erros de rede, timeouts de requisição ou 502/503/504; tentativas de limite de taxa respeitam `Retry-After` dentro de um prazo operacional de cinco minutos. Criações ambíguas e falhas de capacidade não são repetidas. Uploads falhados recebem uma tentativa independente de limpeza de dois segundos. `DaemonAttachmentUploadError` preserva a causa e `httpStatus`; seu `status` omite o 404 interno do upload para que consumidores não o confundam com roteamento de anexo legado não suportado.

Consulte o [projeto completo](../design/session-attachment-chunk-upload.md) para detalhes de ciclo de vida e compatibilidade.

### Recarga do catálogo de modelos

A capacidade `workspace_model_reload` anuncia `POST /workspaces/:workspace/models/reload`. Esta mutação autenticada, confiável e de runtime selecionado relê configurações de escopo de usuário e workspace, atualiza a sobreposição de ambiente do runtime selecionado e reaplica o ambiente em seu filho ACP antes de reconstruir a configuração do provedor de modelos. Alterações de ambiente suportam credenciais de provedor e podem incluir outras chaves de ambiente; elas não são relatadas na resposta nem em um evento de configurações. O ambiente do processo daemon e a habilitação do workflow permanecem inalterados. Retorna `{ "status": "applied" | "deferred" | "failed" }`; `deferred` significa que nenhum filho ACP ativo aplicou o catálogo. Não busca um catálogo de plataforma, escreve configurações, alterna o modelo de conversa ativo nem transmite um evento de configurações. Leia o `/session/:id/context` de uma sessão existente posteriormente para seus modelos selecionáveis atuais; antes da criação da sessão, leia os provedores do workspace selecionado. Runtimes desconhecidos, não confiáveis, em drenagem ou fechados não fazem fallback para o primário.

## Formato de transmissão em streaming

Eventos são emitidos como quadros EventSource padrão. O daemon escreve uma linha `data:` por quadro (o JSON não tem novas linhas embutidas após `JSON.stringify`); o parser do SDK em `packages/sdk-typescript/src/daemon/sse.ts` trata tanto essa forma quanto a forma multi-`data:` permitida pela especificação no lado de recepção.

## Quadros de erro durante o streaming

Se o iterador bridge lançar uma exceção enquanto atende a um assinante SSE, o daemon emite um quadro `stream_error` terminal (sem `id`). A linha `data:` é o envelope completo (mesma forma que qualquer outro quadro SSE neste documento); a mensagem de erro real está sob `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

A conexão então fecha.

## Variáveis de ambiente

| Var | Propósito |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Token Bearer. Removidos espaços em branco à esquerda/direita na inicialização. |

## Layout do código-fonte

| Caminho | Propósito |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts` | Comando yargs + esquema de flags |
| `packages/cli/src/serve/run-qwen-serve.ts` | Ciclo de vida do listener + tratamento de sinais |
| `packages/cli/src/serve/server.ts` | Montagem da aplicação Express, ordenação de middlewares e rotas diretas restantes |
| `packages/cli/src/serve/routes/*.ts` | Grupos focados de rotas Express, incluindo sessão, SSE, autenticação de workspace, status de workspace e rotas de arquivos |
| `packages/cli/src/serve/auth.ts` | bearer + allowlist de Host + negação de CORS |
| `packages/cli/src/serve/acp-session-bridge.ts` | Fachada de compatibilidade para bridge local da CLI para spawn-or-attach, FIFO por sessão e registro de permissões |
| `packages/acp-bridge/src/status.ts` | Tipos wire somente leitura para status do daemon + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts` | Helper puro que constrói payloads `/workspace/env` a partir do estado `process.*`, incluindo redação de credenciais |
| `packages/acp-bridge/src/eventBus.ts` | Fila assíncrona limitada + anel de replay |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | Cliente TS |
| `packages/sdk-typescript/src/daemon/sse.ts` | Parser de frames EventSource |
| `integration-tests/cli/qwen-serve-routes.test.ts` | 18 casos, sem LLM |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 casos, filho real `qwen --acp` respaldado pelo servidor OpenAI falso local (apenas POSIX; ignorado no Windows) |
