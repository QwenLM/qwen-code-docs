---

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

- O literal `*` — admite qualquer origin. **Arriscado**: a inicialização recusa quando `*` está configurado, mas nenhum token bearer está definido (qualquer fonte: `--token`, `QWEN_SERVER_TOKEN` ou `--require-auth`, que exige um token na inicialização). O breadcrumb de inicialização emite um aviso no stderr quando `*` está na lista. **Recomendação**: combine com `--require-auth` em binds de loopback para que `/health` também seja protegido pelo bearer — ele é registrado antes do middleware bearer no loopback por padrão (para que as sondas k8s/Compose possam alcançar sem um token), e uma allowlist `*` o torna acessível de qualquer navegador cross-origin. `--require-auth` ainda deixa os assets estáticos do Web Shell (`/`, `/assets/*` e navegações de documento `/session/:id`) pré-auth no loopback por design — eles são montados antes do middleware bearer — então sob uma allowlist `*` eles permanecem legíveis de qualquer navegador cross-origin; `--no-web` remove essa superfície. Em binds fora do loopback o bearer já é obrigatório na inicialização e `/health` é registrado atrás dele, então a única superfície que `*` expõe sem um token são os assets estáticos do Web Shell (`/`, `/assets/*` e navegações de documento `/session/:id` — o JS deles ainda chama rotas protegidas por token). `--no-web` remove até isso; a superfície real da API é protegida de qualquer forma.
- Um origin de URL canônico — `<scheme>://<host>[:<port>]`. **Sem barra no final, sem path, sem userinfo, sem query.** A inicialização recusa com `InvalidAllowOriginPatternError` se a entrada falhar no round-trip `new URL(pattern).origin === pattern`; a mensagem de erro nomeia o padrão incorreto e a forma canônica. Estrito por intenção: a normalização silenciosa (por exemplo, remover uma `/` no final) deixaria erros de digitação passarem e aceitaria entradas ambíguas.

Origins correspondentes recebem os cabeçalhos de resposta CORS padrão em cada requisição:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin` ecoa o origin da requisição literalmente (maiúsculas/minúsculas como o navegador enviou) em vez do literal `*`, mesmo sob o padrão `*` — caches de navegador indexam respostas com ele emparelhado a `Vary: Origin`, e ecoar deixa espaço para adicionar `Access-Control-Allow-Credentials` em uma versão futura sem mudança de schema. Os headers expostos permitem que webUIs de navegador respeitem as dicas de retry, retenham o epoch do SSE e corrijam streams físicos aceitos. `Access-Control-Allow-Credentials` **NÃO** é enviado hoje: o daemon autentica via bearer no `Authorization`, que funciona cross-origin sem `credentials: 'include'`.

Requisições OPTIONS de preflight (OPTIONS com `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) retornam imediatamente com `204 No Content` mais os cabeçalhos acima. Este é o padrão CORS convencional e é seguro — o preflight apenas confirma quais métodos/cabeçalhos o daemon aceitará; a requisição subsequente real ainda executa toda a cadeia (allowlist de host → auth bearer → rotas), então a anti-DNS-rebinding e a aplicação do bearer ainda disparam antes de qualquer estado ser lido ou mutado. Requisições OPTIONS simples de origins correspondentes continuam fluindo downstream com os cabeçalhos CORS anexados.

Origins que não correspondem à allowlist ainda recebem `403 {"error":"Request denied by CORS policy"}` — mesmo envelope da barreira padrão, então clientes que já parsearam a resposta da barreira não precisam tratar especialmente daemons com allowlist. O caminho de rejeição **não** emite nenhum cabeçalho `Access-Control-*` (o navegador os ignoraria, e emitir indicaria indiretamente o tamanho da allowlist pela presença do cabeçalho).

A lista de padrões configurada intencionalmente NÃO é ecoada em `/capabilities` — a webUI do navegador já conhece seu próprio origin (afinal, ela chamou o daemon), e expor a lista permitiria que um leitor não autenticado de `/capabilities` enumerasse cada origin confiável (recon útil para uma implantação mal configurada). Clientes SDK verificam a tag `caps.features.allow_origin` para "este daemon honra requisições cross-origin de navegador" sem precisar saber quais origins específicos.

Requisições de self-origin em loopback (por exemplo, o Web Shell chamando o daemon no mesmo `127.0.0.1:port`) são tratadas por um shim **separado** de remoção de Origin que executa ANTES do middleware CORS e remove o cabeçalho `Origin` para `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Então elas passam independentemente da configuração `--allow-origin` — operadores não precisam listar a própria porta do daemon para fazer o Web Shell funcionar.

## Formato de erro comum

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

`SessionNotFoundError` para um session id desconhecido retorna:

```json
{
  "error": "No session with id \"<sid>\"",
  "sessionId": "<sid>",
  "code": "session_not_found"
}
```

com status `404`. Um close concorrente usa `code: "session_closing"`.

`WorkspaceMismatchError` para um `POST /session` cujo `cwd` não canoniza para um workspace registrado retorna `400` com:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

Use isso para detectar mismatch em um preflight: leia `workspaceCwd` de `/capabilities` e omita `cwd` do `POST /session` (ele faz fallback para o workspace primário), ou quando `multi_workspace_sessions` é anunciado, escolha um dos `workspaces[].cwd`.

`POST /session` além do limite `--max-sessions` do daemon retorna `503` com um cabeçalho `Retry-After: 5` e:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

Quando `--max-total-sessions` rejeita uma nova sessão, o mesmo formato de resposta é retornado com `"scope": "total"`.

Reconexões a sessões existentes NÃO contam para o limite, então reconexões de um daemon ocioso continuam funcionando mesmo quando a capacidade está no máximo.

`RestoreInProgressError` — emitido por `POST /session/:id/load`, `POST /session/:id/resume`, ou um `POST /session` com id fornecido pelo chamador quando outro registro já possui aquele id — retorna `409` e:

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

Disparado quando um `session/load` é emitido para um id que já tem um `session/resume` em andamento (ou vice-versa), ou quando um spawn com id fornecido pelo chamador compete com qualquer direção de restore. Aguarde pelo menos `Retry-After` segundos e tente novamente. Conflitos de mesma ação (`load` vs `load`, `resume` vs `resume`) são coalescidos em vez de gerar erro enquanto o restore está ativo.

`reason` distingue duas cercas que compartilham este código, e o header `Retry-After` o rastreia:

| `reason`                     | Significado                                                                                                          | `Retry-After`                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `restore_in_progress`        | Um restore ordinário está em execução.                                                                               | `5` (correspondendo a `session_limit_exceeded`)               |
| `awaiting_abandoned_cleanup` | O chamador público já recebeu um `504` e a requisição ACP não cancelável mais sua limpeza ainda não se estabilizaram. | o budget efetivo de restore em segundos, limitado a `5`–`120` |

A requisição de restore pública é governada por `limits.sessionRestoreTimeoutMs` (padrão 60s). Após um `504` o id permanece cercado até que a requisição ACP tardia e a limpeza se estabilizem, então um cliente que continua fazendo retry na cadência ordinária de 5 segundos ficaria girando contra um 409 que não pode limpar — honre a dica derivada do budget que vem com `awaiting_abandoned_cleanup`.

`SessionWorkspaceConflictError` — emitido por `POST /session/:id/load` e `POST /session/:id/resume` quando o `cwd` solicitado aponta para um workspace registrado, mas o mesmo session id já está ativo ou sendo restaurado por outro runtime — retorna `409` com:

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

Clientes devem fazer retry com o workspace proprietário ou aguardar o restore em andamento terminar antes de restaurar o id em um workspace diferente. Conflitos de restore no mesmo workspace continuam usando o comportamento de `restore_in_progress` / coalescência da bridge.

`SessionArchivedError` é emitido quando um chamador tenta carregar ou resumir uma sessão cujo JSONL está em `chats/archive/`:

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

com status `409`.

`SessionArchivingError` é emitido quando uma transição de arquivamento ou desarquivamento já está em andamento para o mesmo id:

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

com status `409` e `Retry-After: 5`.

## Capabilities

O daemon anuncia suas tags de feature suportadas do registry de capability do serve. Clientes **devem** basear a UI em `features`, não em `mode` (conforme design §10).

```
['health', 'capabilities', 'session_create', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload',
 'session_approval_mode_control', 'workspace_tool_toggle', 'workspace_skill_toggle',
 'workspace_skill_batch_toggle',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_shell_command',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> Tags condicionais aparecem apenas quando seu toggle de deployment correspondente está ativo (veja a tabela abaixo). A tag `permission_mediation` do F3 é sempre-ativa e carrega `modes: ['first-responder', 'designated', 'consensus', 'local-only']` para que clientes SDK possam introspectar o conjunto suportado pelo build; a estratégia runtime-ativa está em `body.policy.permission`.

`session_scope_override` é o handle de negociação para o campo `sessionScope` por requisição no `POST /session` (veja abaixo). Daemons mais antigos ignoram o campo silenciosamente, então clientes SDK devem fazer preflight de `caps.features` para esta tag antes de enviá-lo.

`session_id_override` é o handle de negociação para o `sessionId` opcional fornecido pelo chamador no `POST /session` e nos metadados `session/new` do ACP. Clientes devem confirmar que `caps.features` contém esta tag antes de enviar o campo porque daemons mais antigos podem ignorá-lo silenciosamente.

`persistent_workspace_registration` anuncia registro durável para workspaces adicionados em runtime. `POST /workspaces` aceita `{ "cwd": "/absolute/path", "persist": true }`; sucesso inclui `persisted: true`. Registros são escopados ao workspace primário canônico do daemon sob o Qwen home do usuário e são restaurados na próxima inicialização do daemon. Omitir `persist` preserva o registro local ao processo. `GET /workspace-registrations` lista o conjunto desejado armazenado, e `DELETE /workspace-registrations/:id` esquece uma entrada para o próximo restart sem remover a quente um runtime ativo.

`workspace_display_name` anuncia entrada opcional de `displayName` no `POST /workspaces`, atualizações de metadados de workspace via `PATCH /workspaces/:workspace`, e campos opcionais de display-name em projeções de workspace. Nomes não participam de busca ou roteamento: `id` e `cwd` canônico permanecem como os únicos seletores, e nomes duplicados são permitidos.

`workspace_runtime_removal` anuncia remoção a quente síncrona via `DELETE /workspaces/:workspace`. Entradas de capability workspace adicionam `removable` opcional; apenas linhas com `removable: true` podem ser removidas. A remoção também esquece todo alias de registro persistente para o runtime, mas nunca deleta arquivos, configurações, transcrições ou arquivos arquivados.

`session_load` e `session_resume` anunciam as rotas de restore explícito (`POST /session/:id/load` e `POST /session/:id/resume`). Daemons mais antigos retornam `404` para esses paths, então clientes SDK devem fazer preflight de `caps.features` antes de chamar. `unstable_session_resume` ainda é anunciado como um alias depreciado para compatibilidade com SDKs que foram publicados enquanto o método ACP subjacente se chamava `connection.unstable_resumeSession`; novos clientes devem verificar `session_resume`.

`limits.sessionRestoreTimeoutMs`, quando presente, é o budget de wall-clock do daemon para a requisição ACP subjacente `loadSession` / `unstable_resumeSession`. É um campo aditivo v1. O SDK TypeScript dá ao daemon 10 segundos de margem do cliente, e o watchdog da WebUI dá 15 segundos; clientes falando com um daemon mais antigo devem usar 70 segundos e 75 segundos respectivamente.

`session_transcript` anuncia `GET /session/:id/transcript`, uma visão de replay paginada somente-leitura sobre o JSONL da sessão ativa persistida. É separada do `/load`: não anexa um cliente, não semeia o EventBus ao vivo, não cria uma sessão ao vivo, nem altera a janela de replay ao vivo. Clientes devem usá-la quando precisam da transcrição completa em disco para uma sessão longa, e continuar usando `/load` apenas para replay ao vivo limitado durante restore frio de UI.

`workspace_persisted_transcript` anuncia `GET /workspaces/:workspace/session/:id/transcript`, um pager daemon-local somente-persistido que não inicia ACP, não consulta estado de bridge ao vivo, não carrega configurações, não descobre capabilities do projeto, nem cria a chave legada de cursor persistido. A tag é incondicional porque primaries single-workspace confiáveis podem usar a rota plural; a autorização de confiança por workspace ainda é avaliada em cada requisição. Workspaces secundários não confiáveis registrados podem ler, enquanto um primário não confiável continua sendo rejeitado.

`workspace_session_export` anuncia `GET /workspaces/:workspace/session/:id/export`, uma exportação completa somente para confiáveis da sessão ativa persistida do workspace selecionado. É independente de `session_export` e `workspace_qualified_rest_core`: daemons lançados podem anunciar ambas as tags antigas sem implementar a rota plural, então clientes devem fazer preflight desta tag diretamente. A tag é incondicional porque um primário single-workspace confiável pode usar a rota por id ou cwd. A exportação não resolve um proprietário ao vivo, não inicia ACP, não anexa um cliente, nem faz fallback para outro workspace.

`workspace_archived_session_export` anuncia `GET /workspaces/:workspace/session/:id/archive/export`, uma exportação completa somente para confiáveis do armazenamento persistido arquivado do workspace selecionado. É independente de `workspace_session_export` e `workspace_qualified_rest_core`; clientes devem fazer preflight desta tag diretamente. Uma rota distinta impede que um daemon mais antigo ignore a intenção de arquivo e retorne uma transcrição ativa com o mesmo id.

`slow_client_warning` cobre o comportamento de backpressure de SSE: (a) o daemon emite um frame sintético `slow_client_warning` no stream de eventos quando o backlog de frames ao vivo ou o backlog de bytes serializados ao vivo de um assinante ultrapassa 75% de capacidade, uma vez por episódio de overflow (rearmado após ambas as medições drenarem abaixo de 37,5%); (b) `GET /session/:id/events` aceita um query param `?maxQueued=N` (faixa `[16, 2048]`) para pré-dimensionar o backlog de frames por assinante para reconexões frias contra um anel de replay grande. O limite de bytes serializados é de propriedade do daemon (padrão **2 MiB** por assinante), somente ao vivo, e intencionalmente não tem query parameter. O tamanho do anel global do daemon é controlado por `--event-ring-size` (padrão **8000**, conforme #3803 §02). Daemons antigos não possuem silenciosamente o comportamento de aviso/query — faça preflight desta tag antes de optar.

`typed_event_schema` anuncia payloads de eventos do daemon que correspondem ao schema `KnownDaemonEvent` do SDK. Daemons mais antigos ainda podem transmitir frames compatíveis, mas clientes SDK devem fazer preflight desta tag antes de assumir cobertura de eventos tipados.

`client_heartbeat` anuncia `POST /session/:id/heartbeat`. Daemons mais antigos retornam `404`; faça preflight desta tag antes de emitir heartbeats periódicos.

`session_close` e `session_metadata` anunciam `DELETE /session/:id` e `PATCH /session/:id/metadata`. Daemons mais antigos retornam `404`; faça preflight destas tags antes de expor affordances de close ou rename.

`session_organization` anuncia grupos de sessão personalizados e fixação. Adiciona `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization`, e a visão de lista organizada opt-in `GET /workspace/:id/sessions?view=organized`. Quando ambos `session_organization` e `workspace_qualified_rest_core` são anunciados, a mutação de organização qualificada por workspace `PATCH /workspaces/:workspace/session/:id/organization` também está disponível. A mutação legada permanece somente para o workspace primário. Daemons mais antigos retornam `404` para as rotas de mutação/grupo e ignoram o contrato de visão organizada, então clientes WebShell/SDK devem fazer preflight destas tags antes de mostrar a UI de agrupamento ou fixação correspondente.

`session_archive` anuncia a API de arquivamento v1 baseada em estado de diretório: `POST /sessions/archive`, `POST /sessions/unarchive`, e `GET /workspace/:id/sessions?archiveState=active|archived`. Sessões arquivadas não podem ser carregadas ou resumidas até serem desarquivadas.

`workspace_qualified_rest_core` anuncia rotas REST core plurais sob `/workspaces/:workspace/...`. O seletor resolve primeiro como id exato de workspace, depois como cwd absoluto URL-encoded após canonização. Daemons single-workspace mais novos incluem o runtime primário em `workspaces[]` mesmo quando `multi_workspace_sessions` está ausente, permitindo que clientes descubram o id necessário pelas rotas qualificadas por workspace; clientes devem fazer fallback para `capabilities.workspaceCwd` para daemons mais antigos que omitem o array. Status de confiança e rotas de solicitação de confiança estão disponíveis para workspaces não confiáveis registrados; rotas de leitura de arquivo seguem a política existente de leitura de filesystem. Workspaces secundários não confiáveis registrados também expõem catálogos de sessão e grupo de sessão somente-persistidos: essas leituras não anexam a uma sessão, não iniciam ACP, nem mesclam estado de bridge ao vivo. Escrita de arquivos, mutações de catálogo e outras rotas core plurais requerem um workspace confiável, a menos que uma capability separada defina explicitamente uma política somente-leitura mais restrita, como `workspace_persisted_transcript`. Um primário não confiável continua recebendo `403 { code: "untrusted_workspace" }` das rotas de catálogo plural e transcrição; rotas singulares legadas do primário mantêm seu comportamento de compatibilidade existente. Esta tag cobre as superfícies core de arquivo, status, configurações, permissões, confiança, ciclo de vida, controle MCP, toggles de ferramenta e skill, memória, CRUD de agente de workspace e armazenamento de sessão. Não cobre auth, voz, extensões, transporte ACP/WebSocket, roteamento de channel worker, nem exportação de sessão qualificada por workspace; faça preflight de `workspace_session_export` ou `workspace_archived_session_export` separadamente. Confiança de workspace não é um ACL: um cliente que possui o token do daemon pode ler toda superfície de workspace registrada permitida por esta política.

`workspace_qualified_voice` anuncia rotas de Voice selecionadas por um runtime de workspace confiável: `GET` e `POST /workspaces/:workspace/voice`, `POST /workspaces/:workspace/voice/transcribe`, e `WS /workspaces/:workspace/voice/stream`. É anunciada apenas quando runtimes multi-workspace e o listener WebSocket compartilhado ACP/Voice estão ambos habilitados. O seletor segue as mesmas regras de id-ou-cwd-absoluto-encoded que outras rotas plurais. Para REST, um seletor desconhecido retorna `400 { code: "workspace_mismatch" }` e um seletor não confiável retorna `403 { code: "untrusted_workspace" }`; rejeição de upgrade WebSocket expõe o status HTTP 400/403 correspondente sem um envelope JSON estruturado. Nenhum transporte faz fallback para o primário. `/workspace/voice`, `/workspace/voice/transcribe`, e `/voice/stream` legados permanecem somente-primário. Clientes usam `workspace_qualified_voice` para todas as modalidades Voice qualificadas e deixam o runtime selecionado reportar erros específicos de configuração. As tags legadas `workspace_voice`, `workspace_voice_transcription`, e `voice_transcribe` descrevem apenas as rotas vinculadas ao primário e não devem esconder uma configuração secundária qualificada.

`workspace_qualified_memory` anuncia as rotas de memória gerenciada qualificadas por workspace: `POST /workspaces/:workspace/memory/{remember,forget,dream}` enfileiram tarefas e `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId` as lê de volta. É anunciada apenas quando ACP HTTP e runtimes multi-workspace estão ambos habilitados. O seletor segue as mesmas regras de id-ou-cwd-absoluto-encoded que outras rotas plurais. Cada workspace registrado tem sua própria lane de tarefas; a lane qualificada do primário é a mesma instância da superfície singular `/workspace/memory`, então uma tarefa enfileirada em uma é legível na outra. A resolução é estritamente por runtime selecionado sem fallback para o primário: um seletor desconhecido retorna `400 { code: "workspace_mismatch" }`, um seletor não confiável retorna `403 { code: "untrusted_workspace" }`, e um runtime inativo ou em drenagem retorna `503 { code: "workspace_runtime_unavailable" }`. Leituras nunca alocam uma lane, então fazer poll de um workspace sem tarefas retorna `404 { code: "<kind>_task_not_found" }`. Ids de tarefa são escopados à sua lane e não sobrevivem a uma reconfiguração de workspace ou substituição de runtime; um id obsoleto retorna `404`, não uma condição de perda de dados. Quando ACP HTTP está desabilitado, a tag não é anunciada e uma requisição qualificada não-primária retorna um `501 { code: "workspace_memory_unavailable" }` não-retryable, enquanto a rota qualificada primária continua funcionando através da lane de propriedade local.

`session_lsp` anuncia `GET /session/:id/lsp`, o snapshot de status LSP estruturado somente-leitura para clientes do daemon. Daemons mais antigos retornam `404`; faça preflight desta tag antes de expor status LSP remoto.

`session_status` anuncia `GET /session/:id/status`, o resumo da bridge ao vivo para uma única sessão por id. Além de `clientCount` e `hasActivePrompt`, sessões ao vivo expõem `isWaitingForPermission`, `isWaitingForUserQuestion`, `pendingInteractionCount`, e um `turnError` retido após um turno com falha. O erro é limpo quando o próximo prompt realmente inicia. Tanto a resposta de status de sessão única quanto as listas de sessão do workspace incluem `turnError` e `pendingInteractions`: ações de permissão prontas para renderização ou perguntas `ask_user_question` mais o `requestId` e opções selecionáveis exigidas pelas rotas de voto de permissão existentes. Cada pergunta do usuário tem um `answerKey`; vote com `answers`, por exemplo `{ "0": "Polling" }`, chaveado por esse valor. Sessões somente-persistidas omitem estado de runtime porque nenhum runtime existe. Daemons mais antigos retornam `404`; faça preflight desta tag antes de fazer poll do status de uma sessão individual em vez de escanear a lista completa de sessões.

`session_info` anuncia `GET /workspace/:id/session-info` e seu gêmeo `/workspaces/:workspace/session-info`. A resposta agrega contagens de sessões ativas persistidas e arquivadas sem hidratar metadados de lista. É um scan explícito de disco O(n) e não deve ser feito poll; clientes devem tratar `truncated: true` como um resultado de limite inferior.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_skill_toggle`, `workspace_skill_batch_toggle`, `workspace_init`, e `workspace_mcp_restart` anunciam as rotas de controle de mutação documentadas abaixo. São protegidas pelo gate de mutação estrito (um daemon configurado sem token bearer as rejeita com 401 `token_required`). Daemons mais antigos retornam `404`; faça preflight de cada tag antes de expor a affordance correspondente.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) cobre a superfície de budget MCP: os campos `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` no `GET /workspace/mcp`, o campo `disabledReason` nas células por servidor, e as flags CLI `--mcp-client-budget` / `--mcp-budget-mode`. Daemons mais antigos omitem os novos campos inteiramente; clientes SDK fazem preflight desta tag antes de depender da semântica de `budgets[]`. O descritor do registry também carrega `modes: ['warn', 'enforce']` para exposição futura de feature-modes — por enquanto, clientes inferem o modo do campo `budgetMode` do snapshot. A aplicação do servidor sob modo `enforce` é determinística pela ordem de declaração `Object.entries(mcpServers)`; uma camada futura de precedência por escopo (se o qwen-code adotar uma) mudaria isso para "menor precedência primeiro" para espelhar a convenção `plugin < user < project < local` do claude-code.

> **Escopo é orientado por capability.** Com `mcp_workspace_pool`, sessões dentro de um runtime de workspace compartilham um pool de transporte e `WorkspaceMcpBudget`, e o snapshot emite `budgets[0].scope: 'workspace'`. Runtimes de workspace diferentes possuem pools independentes. Sem a tag, cada sessão ACP usa seu `McpClientManager` legado, o snapshot emite `scope: 'session'`, e N sessões podem consumir individualmente o limite configurado.

`workspace_file_read` cobre as rotas de arquivo de workspace texto/lista/stat/glob
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
cobre `GET /file/bytes`, que foi adicionada depois para que clientes possam fazer preflight
de suporte a janela de bytes brutos contra daemons da era PR19. `workspace_file_write` cobre
as rotas de mutação de texto com awareness de hash (`POST /file/write`, `POST /file/edit`).
A tag de escrita significa que o contrato da rota existe; não significa que o deployment
atual está aberto para mutação anônima. Escrita/edição são rotas de mutação estritas
e requerem um token bearer configurado mesmo em loopback.
`workspace_file_upload` cobre `POST /file/upload`, a rota de entrada binária:
um corpo `application/octet-stream` limitado a `MAX_UPLOAD_BYTES` (50 MiB) é
escrito no workspace sem nunca sobrescrever — um nome ocupado é numerado
automaticamente (`name (1).ext`, `name (2).ext`, ...). Também é uma rota de mutação estrita.

Quando `workspace_qualified_rest_core` é anunciado, a mesma superfície de arquivo também está disponível em `/workspaces/:workspace/file`, `/workspaces/:workspace/file/bytes`, `/workspaces/:workspace/stat`, `/workspaces/:workspace/list`, `/workspaces/:workspace/glob`, `/workspaces/:workspace/file/write`, `/workspaces/:workspace/file/edit`, e `/workspaces/:workspace/file/upload`.

A mesma tag também expõe CRUD de project-agent qualificado por workspace em `/workspaces/:workspace/agents` e `/workspaces/:workspace/agents/:agentType`. Essas rotas plurais apenas leem ou mutam agentes de nível de projeto para o workspace selecionado; requisições de escopo `global` e `user` retornam `400 { code: "global_scope_not_supported_for_workspace_route" }`. Rotas `/workspace/agents` sem workspace mantêm seu comportamento existente de workspace primário e permanecem a única superfície REST para escopo de agente de nível de usuário.

`extension_management_v2` anuncia um catálogo de extensões de nível de usuário e superfície de mutação em `/extensions/*`, mais projeções de ativação por workspace em `/workspaces/:workspace/extensions/*`. Artefatos são globais; rotas de workspace expõem apenas leituras de projeção, overrides exatos de ativação, e refresh de runtime. Leituras podem visar um workspace registrado não confiável, enquanto ativação, refresh e instalação escopada por workspace requerem um alvo confiável. Mutações lentas usam operações daemon-locais em `/extensions/operations/:operationId`; a geração do store, não o histórico de operações, é autoritativa entre restarts e entre daemons. A capability publicada `workspace_extensions` e as rotas `/workspace/extensions/*` permanecem como adaptador de compatibilidade para workspace primário. Clientes devem fazer preflight de `extension_management_v2` e não devem inferi-lo do modo do daemon ou `workspace_qualified_rest_core`.

### Contrato de wire do Extension Management V2

Todas as rotas usam as regras de autenticação bearer do daemon acima. `X-Qwen-Client-Id` é opcional para as rotas de mutação V2; quando fornecido, deve identificar um cliente registrado em um dos runtimes de workspace alvo da mutação. `:extensionId` é a identidade de extensão em 64-hex minúsculo. `:workspace` resolve primeiro como id exato de workspace e caso contrário como cwd absoluto URL-encoded após canonização.

| Method e path                                                        | Sucesso                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /extensions`                                                    | `200` catálogo global de artefatos                                        |
| `PUT /extensions/:extensionId/activation`                            | `202` operação de ativação padrão global                                  |
| `POST /extensions/install`                                           | `202` operação de instalação                                              |
| `POST /extensions/check-updates`                                     | `202` operação de verificação de atualização                              |
| `POST /extensions/:extensionId/update`                               | `202` operação de atualização                                             |
| `DELETE /extensions/:extensionId`                                    | `202` operação de desinstalação, ou `204` idempotente quando a extensão está ausente |
| `GET /extensions/operations/:operationId`                            | `200` snapshot da operação                                                |
| `GET /workspaces/:workspace/extensions`                              | `200` projeção de ativação por workspace                                  |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation`      | `202` operação de ativação por workspace exata                            |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation`   | `202` operação de limpeza de override                                     |
| `POST /workspaces/:workspace/extensions/refresh`                     | `202` operação de refresh de runtime                                      |

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

`installType` é omitido quando nenhum metadado de instalação está disponível. `defaultActivation` é `enabled` ou `disabled`. `workspaceOverrideCount` exclui entradas `inherit` armazenadas.

A resposta de projeção do workspace é:

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

`workspaceActivation` é `enabled`, `disabled`, ou `null` para herança. `activationSource` é `default`, `workspace_override`, `legacy_path_rule`, ou `cli_override`. `desiredGeneration` é a geração durável do store; `appliedGeneration` é a última geração que o controller registrou como aplicada àquele runtime de workspace e pode temporariamente ficar atrasada.

Instalação requer consentimento explícito e uma ativação inicial:

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

Para ativação inicial somente por workspace use `{ "scope": "workspace", "workspaceId": "target-workspace-id" }`; o alvo deve existir e ser confiável. Instalações do daemon aceitam fontes GitHub, Git e npm. `ref` não se aplica a npm, e `registry` aplica-se apenas a npm. `ref`, `autoUpdate`, `allowPreRelease`, e `registry` são opcionais.

Requisições `PUT` de ativação global e por workspace usam o mesmo corpo:

```json
{ "state": "enabled" }
```

`state` é `enabled` ou `disabled`. Requisições de atualização, desinstalação, verificação de atualizações, limpeza de ativação e refresh não têm corpo obrigatório.

Cada mutação assíncrona aceita retorna:

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

Mutações qualificadas por workspace usam o mesmo path de polling global `/extensions/operations/:operationId`. O histórico de operações é local ao processo, mantém apenas um número limitado de entradas terminais, e é perdido no restart do daemon; clientes devem reler o catálogo ou projeção de workspace e comparar gerações quando um id de operação desaparecer.

Um snapshot de operação tem esta forma:

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

`status` transita de `queued` para `running`, depois para `succeeded`, `succeeded_with_warnings`, ou `failed`. Enquanto em execução, `phase` é `preparing`, `committing`, ou `reconciling`. Sucesso terminal pode incluir `result` com `status` igual a `installed`, `enabled`, `disabled`, `updated`, `uninstalled`, `checked`, ou `refreshed`; resultados de reconciliação podem adicionalmente conter `refreshed`, `failed`, e `error`. Verificações de atualização retornam `result.states`, chaveado por nome de extensão, com valores como `checking for updates`, `update available`, `up to date`, `not updatable`, ou `error`.

Um commit durável seguido de limpeza incompleta ou reconciliação de runtime não é reportado como mutação com falha. Retorna `succeeded_with_warnings` e preserva o resultado commitado:

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "activation",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "disabled",
    "name": "demo",
    "refreshed": 1,
    "failed": 1
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

`workspaceId` e `code` do warning são opcionais; `workspaceCwd` e `error` estão sempre presentes. Clientes devem exibir warnings, atualizar seu catálogo/projeção, e não devem fazer retry cego da mutação durável.

Falhas de validação e autorização são erros HTTP síncronos usando `{ "error": "...", "code": "..." }` quando um código estável existe. Casos importantes são `400 invalid_extension_id`, `400 invalid_extension_activation`, `400 workspace_mismatch`, `403 untrusted_workspace`, `404 extension_operation_not_found`, e `429 extension_queue_full`. Validação de instalação também retorna `400` para opções inválidas de source/ref/registry, consentimento ausente, ou ativação inicial ausente/inválida. Uma mutação que falha após `202` é representada, enquanto retida no histórico de operações, com `status: "failed"`, `error`, e um `code` estável opcional; códigos comuns incluem `extension_prepare_timeout` e `extension_conflict`. HTTP `404` para uma operação não implica rollback porque o histórico de operações não é durável.

`daemon_status` anuncia `GET /daemon/status`, o snapshot de diagnóstico
operacional consolidado somente-leitura documentado abaixo.

**Tags condicionais.** Estas tags de feature são anunciadas apenas quando seu toggle de deployment, wiring de runtime, ou condição de disponibilidade está ativa. Presença da tag significa que o comportamento documentado está disponível; ausência significa ou um daemon mais antigo que precede a tag ou um daemon atual onde aquela condição é falsa. Atualmente:

<!-- conditional-serve-features:start -->

| Tag                                 | Anunciada quando …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`                      | o daemon foi iniciado com `--require-auth` (ou `requireAuth: true` via API embedded). Token bearer é obrigatório em toda rota, incluindo `/health` em binds de loopback.                                                                                                                                                                                                                                                                                                                                        |
| `mcp_workspace_pool`                | o pool de transporte MCP compartilhado está ativo. Omitido quando `QWEN_SERVE_NO_MCP_POOL=1` desabilita o pool.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `mcp_pool_restart`                  | o pool de transporte MCP compartilhado está ativo; respostas de restart podem incluir formas multi-entrada com awareness de pool.                                                                                                                                                                                                                                                                                                                                                                                 |
| `external_tool_guard`               | `qwen serve` completou o handshake de inicialização para `--external-tool-guard-mode=required`; todo canal ACP spawned deve reconhecer o callback instalado antes da criação de sessão, e toda invocação de ferramenta ACP gerenciada de nível superior suportada que alcança o limite final de execução deve receber uma permissão pré-execução externa. Negações anteriores de permissão/hook não fazem requisição ao provider. Execução aninhada do AgentCore está fora do v1 e é rejeitada.                   |
| `allow_origin`                      | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). O daemon foi iniciado com pelo menos um `--allow-origin <pattern>` (ou `allowOrigins: [...]` via API embedded). Requisições cross-origin de origins correspondentes recebem cabeçalhos de resposta CORS adequados; origins não correspondentes ainda recebem o 403 padrão. A lista de padrões configurada intencionalmente NÃO é ecoada em `/capabilities` para evitar vazar o conjunto de origins confiáveis para leitores não autenticados — a webUI do navegador já conhece seu próprio origin. |
| `prompt_absolute_deadline`          | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` está definido como um inteiro positivo.                                                                                                                                                                                                                                                                                                                                                                                |
| `writer_idle_timeout`               | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` está definido como um inteiro positivo.                                                                                                                                                                                                                                                                                                                                                                    |
| `workspace_settings`                | o daemon foi criado com persistência de configurações disponível.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `workspace_voice`                   | persistência de configurações está disponível, então as rotas legadas de configurações Voice do workspace primário estão ativas.                                                                                                                                                                                                                                                                                                                                                                                  |
| `workspace_voice_transcription`     | o workspace primário tem um modelo de transcrição Voice configurado.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `session_shell_command`             | execução de shell da sessão está explicitamente habilitada.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `session_artifacts_persistence`     | persistência de artefatos de sessão está conectada para o runtime.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `session_generation`                | helpers de geração de sessão estão disponíveis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `workspace_generation`              | helpers de geração escopados por workspace estão disponíveis.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `rate_limit`                        | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` está habilitado.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `workspace_reload`                  | suporte a reload de workspace está disponível na configuração de rotas embedded.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `workspace_trust_hot_reload`        | monitoramento de política de confiança de workspace e reconciliação de geração de runtime estão conectados, então mudanças de confiança têm efeito sem reiniciar o daemon e relatórios de status de confiança v2 reportam convergência.                                                                                                                                                                                                                                                                          |
| `channel_reload`                    | um gerenciador de channel worker gerenciado pelo daemon está habilitado e pode recarregar sua seleção atual.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `channel_control`                   | controle de runtime de channel worker gerenciado pelo daemon está conectado.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `channel_management`                | configurações de Channel escopadas por workspace, ciclo de vida e gerenciamento de pairing estão conectados.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `multi_workspace_sessions`          | mais de um runtime de workspace está registrado, então a criação de sessão pode selecionar um runtime confiável por cwd.                                                                                                                                                                                                                                                                                                                                                                                          |
| `multi_workspace_session_rewind`    | mais de um runtime de workspace está registrado; rotas singulares de rewind de sessão ao vivo resolvem o runtime proprietário.                                                                                                                                                                                                                                                                                                                                                                                   |
| `multi_workspace_session_shell`     | mais de um runtime de workspace está registrado e execução de shell da sessão está explicitamente habilitada; shell REST singular resolve o runtime proprietário.                                                                                                                                                                                                                                                                                                                                                 |
| `dynamic_workspace_registration`    | uma factory de runtime de workspace está conectada ao daemon, então um diretório confiável existente pode ser registrado como runtime secundário em tempo de execução.                                                                                                                                                                                                                                                                                                                                           |
| `persistent_workspace_registration` | um store de registro de workspace está conectado ao daemon. O `runQwenServe` de produção fornece o store de nível de usuário automaticamente; embeds diretos de `createServeApp` devem injetar um explicitamente e gerenciar a restauração de inicialização do seu registry de workspace.                                                                                                                                                                                                                          |
| `scratch_workspace_registration`    | criação gerenciada de workspace scratch está disponível — uma factory de runtime, uma raiz scratch gerenciada validada, e descarte de runtime estão conectados, e todo runtime gerenciado respeita o limite da raiz scratch.                                                                                                                                                                                                                                                                                      |
| `workspace_runtime_removal`         | runtimes secundários removíveis dinâmicos ou restaurados por persistência podem ser drenados e removidos através da rota de gerenciamento.                                                                                                                                                                                                                                                                                                                                                                       |
| `workspace_qualified_acp`           | ACP HTTP e runtimes multi-workspace estão ativos, então o endpoint ACP plural pode selecionar um runtime secundário.                                                                                                                                                                                                                                                                                                                                                                                              |
| `workspace_qualified_voice`         | runtimes multi-workspace e o listener WebSocket compartilhado ACP/Voice estão ativos, então toda modalidade Voice qualificada por workspace é alcançável para um runtime secundário.                                                                                                                                                                                                                                                                                                                               |
| `workspace_qualified_memory`        | ACP HTTP e runtimes multi-workspace estão ativos, então rotas de memória gerenciada qualificadas por workspace podem selecionar uma lane de tarefas por workspace para operações remember, forget e dream.                                                                                                                                                                                                                                                                                                        |
| `client_mcp_over_ws`                | o daemon aceita servidores MCP hospedados pelo cliente sobre o WebSocket ACP. Este é um opt-in explícito, não obrigatório para o caminho do túnel CDP.                                                                                                                                                                                                                                                                                                                                                           |
| `cdp_tunnel_over_ws`                | o daemon expõe o túnel WebSocket reverso `/cdp`, seja por opt-in explícito ou porque um origin de extensão Chrome é permitido. Isso significa apenas que o túnel existe; não significa que ferramentas MCP do Chrome DevTools estão registradas.                                                                                                                                                                                                                                                                  |
| `browser_automation_mcp`            | ACP HTTP está habilitado, `cdp_tunnel_over_ws` está ativo, nenhum token bearer bloqueia `/cdp`, e `QWEN_CDP_MCP_COMMAND` nomeia um adaptador MCP stdio externo. O pacote CLI principal não empacota um adaptador de automação de navegador; sem esta tag, o chat do side-panel da extensão Chrome ainda pode funcionar, mas ferramentas de console/rede/screenshot/clique não são registradas por padrão.                                                                                                         |
| `voice_transcribe`                  | o endpoint WebSocket de Voice está montado; um modelo Voice configurado ainda é necessário para uma transcrição bem-sucedida.                                                                                                                                                                                                                                                                                                                                                                                     |
| `realtime_voice`                    | o daemon WebShell do macOS tem Live Voice habilitado e integração nativa de Host ativa. `/live/status` reporta prontidão, mas a capability é retirada até que a feature seja habilitada.                                                                                                                                                                                                                                                                                                                          |

<!-- conditional-serve-features:end -->

`mcp_guardrails` **não** está nesta tabela condicional — é uma tag sempre-ativa, anunciada sempre que o binário suporta os novos campos de budget de `/workspace/mcp`, independentemente de o operador ter configurado um budget. Operadores que não definiram `--mcp-client-budget` ainda recebem os novos campos (com `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) anuncia os eventos push SSE tipados que surface cruzamentos de estado de budget MCP sem um loop de poll. Dois tipos de frame chegam no `GET /session/:id/events`:

- `mcp_budget_warning` — dispara uma vez no cruzamento ascendente de 75% de `reservedSlots.size / clientBudget`. Rearma apenas após a razão cair abaixo de 37,5% (`MCP_BUDGET_REARM_FRACTION`). Espelha a histerese do `slow_client_warning` do PR 10, mas no nível do manager em vez do nível de backlog por assinante. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Dispara sob ambos modos `warn` e `enforce`; nunca sob `off`.
- `mcp_child_refused_batch` — dispara no final de cada passagem `discoverAllMcpTools*` quando um ou mais servidores foram recusados, E como um batch de tamanho 1 no caminho de recusa de spawn lazy de `readResource`. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` é o literal `'enforce'` porque o modo `warn` nunca recusa.

Ambos eventos vivem no anel de replay SSE por sessão (carregam um `id`) então um cliente reconectando com `Last-Event-ID` retoma através deles; o snapshot em `GET /workspace/mcp` ainda é a fonte da verdade para estado-após-desconexão-prolongada. Sempre-ativo uma vez anunciado — não há toggle condicional. O estado do reducer SDK (`DaemonSessionViewState`) expõe `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` para adaptadores que querem UI simples estilo lag.

## Rotas

### `GET /health`

Sonda de liveness. A forma padrão retorna `200 {"status":"ok"}` se o listener está ativo — barato, sem acesso à bridge, adequado para sondas de liveness k8s/Compose de alta frequência.

Passe `?deep=1` (também aceita `?deep=true` ou `?deep` simples) para uma sondagem em todo o daemon que agrega **contadores** da bridge em cada runtime de workspace gerenciado, incluindo um workspace que ainda está drenando (somente informativo, não uma verificação real de liveness):

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

`sessions`, `pendingPermissions`, e `activePrompts` são somas. `activeWork` **não conta background shells, Monitors, workflows, cron jobs, nem sugestões de follow-up** — é true quando qualquer runtime tem um prompt aceito mas não liquidado (incluindo um prompt em espera FIFO), um Agent em execução em background, ou uma notificação terminal de Agent enfileirada/em progresso, e nada mais. É escopado por sessão: trabalho de nível de channel sem sessão anexada ainda — um spawn em andamento, um restore pendente, descoberta ou autenticação MCP — não é contado, então `activeWork` pode ler false enquanto o daemon ainda se recusa a reclaimar aquele channel. Não leia este campo como "o daemon é reclaimável"; ele descreve apenas trabalho de propriedade de sessão. `activeWorkReporting` diz quanto desse booleano é realmente garantido: `full` quando toda sessão ao vivo é coberta por um relatório fresco de um filho que reporta todas as categorias, `none` quando nenhuma sessão está, `partial` para qualquer coisa entre — incluindo um snapshot obsoleto ou um filho mais antigo que nunca reconheceu a capability. Um snapshot mais antigo que três intervalos de relatório para de contar como cobertura: não é um relatório de que a sessão está ociosa, então a sessão volta a ler como retida, exatamente como se o filho nunca tivesse reportado. `activeWorkStaleMs` é a idade do snapshot mais antigo no qual o booleano se baseia **entre as sessões cobertas**, e é `0` quando nenhuma sessão está coberta; é diagnóstico, porque a frescura já é graduada em `activeWorkReporting` pelo daemon (apenas o daemon conhece a cadência negociada de cada channel). O grau é computado uma vez sobre todo runtime gerenciado em vez de por runtime e depois combinado — um runtime sem sessões é vacuamente completo, e tratar isso como evidência deixaria um workspace vazio garantir sessões não reportadas de outro workspace. `lastActivityAt` é o horário de atividade mais recente não-nulo do workspace e `idleSinceMs` é derivado desse mesmo snapshot. `channelAlive` significa que pelo menos um channel de workspace gerenciado está ativo; não significa que todo workspace está saudável. `connectedClients` e o `rateLimitHits` opcional permanecem como contadores de todo o daemon em vez de somas por workspace.

Controllers de restart devem tratar o daemon como ocupado quando:

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

Remover o terceiro termo torna `activeWork === false` indistinguível de "nenhum filho me disse nada", que é o único caso em que agir sobre isso é inseguro. Respostas desconhecidas e sondagens falhadas também devem impedir o restart. `activePrompts` permanece como um sinal de compatibilidade independente.

Esses campos são um cache de observação, não um lease de restart: mesmo uma resposta fresca, totalmente graduada e vazia descreve o momento em que foi amostrada, e o trabalho pode começar imediatamente depois. A regra acima reduz substancialmente o risco de um restart errado, mas não o elimina — segurança estrita precisa de uma cerca de prepare-restart que pare a admissão de novo trabalho, confirme a drenagem, e só então desligue.

> ⚠️ A sondagem profunda é **informativa**, não uma verificação real de liveness ou um lease de reclaim atômico. Filhos ACP negociados publicam snapshots de trabalho ativo de todo o channel em uma cadência negociada, e o daemon gradua sua frescura em `activeWorkReporting` — mas nunca mata um channel por um relatório ausente, porque o silêncio de uma sessão não é evidência de que o processo morreu. Liveness de transporte e detecção de Agent travado são mecanismos separados. `connectedClients` conta conexões REST SSE, não todo transporte ACP. Use amostras repetidas e shutdown gracioso para reclaim por ociosidade; use `/daemon/status` autenticado para diagnósticos de transporte e por workspace. Se qualquer getter de runtime gerenciado lançar exceção, a sondagem profunda fail closed com `503 {"status":"degraded","reason":"aggregation_failed"}` em vez de retornar totais parciais, e o log do daemon identifica o runtime de workspace com falha. Durante bootstrap, antes do registry de runtime estar pronto, retorna `503 {"status":"degraded","reason":"bootstrap"}` com `Retry-After: 1`. Para liveness do listener, use o `/health` padrão sem `?deep`.

**Auth:** obrigatório **apenas em binds fora do loopback**. Em loopback (`127.0.0.1`, `::1`, `[::1]`) `/health` é registrado antes do middleware bearer para que sondas k8s/Compose dentro do pod não precisem incluir o token. Fora do loopback (`--hostname 0.0.0.0`, etc.) a rota é registrada após o middleware bearer e retorna 401 sem um token válido — caso contrário, um chamador não autenticado poderia sondar endereços arbitrários para confirmar que um `qwen serve` existe, um vazamento de informação de baixa severidade que se combina mal com port scanning. Negação CORS + allowlist de Host ainda se aplicam na isenção de loopback.

### `GET /daemon/status`

Diagnósticos operacionais somente-leitura. Diferente de `/health`, esta é uma API normal do daemon:
é registrada após auth bearer e rate limiting, incluindo em binds de loopback.
Parâmetro de query:

- `detail=summary` (padrão) lê apenas estado do daemon em memória.
- `detail=full` também inclui diagnósticos de sessão ao vivo, diagnósticos de
  conexão ACP, contagens de device-flow de auth, e seções de status de workspace.
- qualquer outro `detail` retorna `400 { "code": "invalid_detail" }`.

`summary` intencionalmente não consulta métodos de status de workspace, não inicia um filho
ACP, nem cria uma sessão. `full` consulta cada seção de workspace independentemente;
um timeout ou exceção marca apenas aquela seção como `unavailable` e adiciona um
issue `workspace_status_unavailable`.

Forma da resposta:

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
    "maxSessions": 32,
    "maxTotalSessions": null,
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

Respostas multi-workspace também incluem linhas `workspaces[]` no nível superior com
`{ id, cwd, displayName?, primary, trusted }`. O display name opcional é
omitido quando não definido e permanece apenas para apresentação; consumidores de status devem continuar
usando `id` ou `cwd` para correlacionar runtimes.

`runtime.perf` é opcional. Quando presente, reporta lag do event loop do processo do daemon,
amostras de espera da fila FIFO de prompts, e contadores de bytes do pipe daemon-filho apenas;
lag do event loop do filho ACP não é incluído em `/daemon/status`.

`status` é `error` se algum issue tem severidade de erro, `warning` se algum issue tem
severidade de aviso, caso contrário `ok`. Códigos de issue são estáveis e incluem
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited`, e
`channel_worker_partial_connect`, e `workspace_status_unavailable`. Durante
a janela curta após o listener estar pronto mas antes do runtime completo ser
montado, `/daemon/status` pode reportar `daemon_runtime_starting`; se a montagem
assíncrona do runtime falhar, reporta `daemon_runtime_failed` enquanto rotas de runtime
não-status retornam `503`.

`runtime.activity` reporta atividade de prompts em todo o daemon. `activePrompts` conta sessões com um prompt em andamento. `pendingPrompts` conta todos os prompts aceitos que ainda não foram liquidados, incluindo o prompt em execução e prompts em espera FIFO. `queuedPrompts` conta prompts em espera FIFO que foram aceitos mas não despachados. `lastActivityAt` é o timestamp ISO 8601 do último início/fim de prompt ou spawn de sessão; `null` quando o daemon nunca processou nenhuma atividade desde o boot. `idleSinceMs` é computado a partir de `lastActivityAt` no momento da geração da resposta.

`limits.memory` é aditivo e reporta as figuras de memória resolvidas do daemon: um `enforced: false` obrigatório, um objeto `childHeap` (`mode`; `maxConcurrentChildren` e `perChildCeilingMb`, ambos `null` sob `mode: 'off'`, que não modela nada — e `perChildCeilingMb` adicionalmente `null` sempre que nenhuma partição pode ser modelada dentro de `modeled.minChildHeapMb` — seja o pool não consegue cobrir um filho nesse piso, ou o teto ficaria abaixo dele uma vez limitado em `modeled.legacyChildCeilingMb`, que é `floor(available / 2)` e portanto fica abaixo do piso em um host abaixo de 1024 MB. Nunca é 0, e `maxConcurrentChildren` é `0` nesses casos, pois um host que não modela nenhuma partição é uma resposta computada em vez de um modelo ausente; e `refusals`, os spawns que teriam excedido o limite modelado), `configuredBudgetMb`, `effectiveBudgetMb` (o valor configurado limitado na memória cgroup/host resolvida), `budgetSource` (`flag` / `derived`), `availableMemoryMb`, `availableMemorySource` (`constrained` / `host`), `insufficientMemory`, e um objeto `modeled` contendo `rootReserveMb`, `childPoolMb`, `minChildHeapMb`, `maxChildHeapMb`, e `legacyChildCeilingMb` (um modelo conservador do teto que um filho ACP recebe hoje, que pode ficar abaixo do valor real). `runtime.memory` adicionalmente reporta `registeredWorkspaces` (a contagem de registro — entradas de workspace não removidas, incluindo drenando, em transição, ou bloqueadas; não uma contagem de filhos ao vivo), `activeAcpChildren` (filhos ACP gerenciados pelo daemon com um channel ao vivo, não-dying — inclui entradas em transição ou bloqueadas, mas exclui um workspace cujo kill foi iniciado mesmo se o filho não saiu; não channel workers, descendentes MCP, nem reservas de spawn não anexadas), `childRssCoverage` (`active_children` — todo filho ACP com um channel ao vivo, que é o conjunto que `activeAcpChildren` conta; daemons mais antigos enviam `primary_only`), um objeto `children` descrito abaixo, e um objeto `modeled` contendo `recommendedShareAtRegisteredMb` (`null` quando nenhum workspace está registrado) e `recommendedShareAtActiveMb` (`null` quando nenhum filho está ativo). Cada share é limitado no teto legado do filho, e limitado por baixo no heap mínimo do filho apenas quando o teto permite — em um host pequeno o teto fica abaixo do piso, então share × contagem pode exceder o pool de filhos. Leia um share como consultivo, não uma partição do pool. Tudo isso é observação: nenhum argumento de spawn de filho deriva desses valores, e nenhuma requisição é recusada com base neles. `childHeap` modela uma partição fixa de `modeled.childPoolMb` — todo filho receberia o mesmo `perChildCeilingMb`, então o total modelado fica dentro do pool em vez de acumular como um share por spawn faria. Leia `refusals` apenas como pressão de admissão: uma contagem de 0 **não** significa que a partição é segura para aplicar, porque os filhos rodam no teto muito maior derivado do host, então uma carga de trabalho que precisa de mais old space que `perChildCeilingMb` está saudável aqui e só falharia uma vez que a partição fosse aplicada. Mais duas razões pelas quais uma contagem diferente de zero não necessariamente significa pressão de capacidade: a decisão de admissão conta um filho em terminação até ele sair, então em um daemon já em `maxConcurrentChildren` toda substituição de channel registra uma recusa durante a janela de sobreposição; e em um host pequeno demais para modelar uma partição `maxConcurrentChildren` é `0`, então `refusals` é igual à contagem total de spawns ACP, com `insufficientMemory` como o campo que explica. No caminho normal `runQwenServe` o budget é resolvido antes do app de bootstrap ser criado, então `limits.memory` já está populado durante a janela de bootstrap. É `null` apenas em caminhos que não resolvem budget (como bypass de embed direto pulando `runQwenServeImpl`). O tipo SDK permite `null`, então clientes corretos lidam com isso.

`runtime.memory.children` é aditivo dentro desse bloco e reporta RSS agregado entre os filhos que `childRssCoverage` nomeia: `rssBytes` (seu RSS auto-reportado somado), `sampled` (quantos produziram uma leitura), e `oldestReadingAgeMs` (a idade da leitura mais antiga na soma, para que um chamador possa dizer quão separadas suas partes foram tiradas). O denominador para `sampled` é o irmão `activeAcpChildren`, não repetido dentro do bloco; quando `sampled` é menor, `rssBytes` é um piso em vez de um total. A amostragem é controlada por um watcher SSE/WS ativo, então uma requisição de status contra um daemon do qual ninguém está fazendo streaming reporta `sampled: 0` mesmo com filhos ativos — `activeAcpChildren` ao lado torna essa lacuna visível, e `rssBytes: 0` com `sampled: 0` nunca significa um zero medido. `oldestReadingAgeMs` é `null` quando nada foi amostrado e também quando todo contribuidor é uma bridge anterior ao campo, então nunca significa "recente". Leia a soma como uma super-contagem e uma sub-contagem ao mesmo tempo: somar RSS por processo conta duplamente páginas que os filhos compartilham, enquanto cada filho reporta apenas seu próprio processo, então seus descendentes MCP e todo channel worker estão faltando. Não é a memória da árvore do daemon. O campo é opcional no espelho SDK porque daemons que reportam `primary_only` nunca o enviam.

`runtime.memory.pressure` é aditivo dentro desse bloco e reporta a própria pressão de memória do processo raiz do daemon: `mode` (`off` / `observe`), `level` (`normal` / `soft` / `hard` / `critical`), `source` (`rss` / `heap` / `unknown`), `ratio`, e as seis figuras brutas das quais as razões vêm — `rssBytes`, `rssRatio`, `availableBytes`, `heapUsedBytes`, `heapRatio`, `heapLimitBytes`. `ratio` é o maior entre `rssRatio` e `heapRatio`, e `source` nomeia qual foi; empates são reportados como `rss`. `availableBytes` é `limits.memory.availableMemoryMb` em bytes — deliberadamente a figura detectada de cgroup/host em vez de `effectiveBudgetMb`, porque o que encerra o processo é o limite real, não o número de política do operador. `source: "unknown"` significa que nenhum denominador foi mensurável e não deve ser lido como saudável; `level` é `normal` nesse caso apenas porque não há nada para classificar. As figuras cobrem apenas o **processo raiz** do daemon: são o `memoryUsage()` deste processo, então filhos crescendo não as movem. `runtime.memory.children` reporta aqueles separadamente, e nenhuma figura é memória da árvore de processos. Ambos os modos reportam o bloco inteiro; apenas `observe` adicionalmente levanta o aviso sem caminho `daemon_memory_pressure` no rollup de status, então `off` deixa o `status` de nível superior inalterado. Nada remedia em nenhum dos modos. O campo é opcional no espelho SDK porque daemons que lançaram `runtime.memory` antes dele existir enviam o bloco sem ele.

`limits.maxTotalSessions` é aditivo. `null` significa que o limite efetivo de novas sessões em todo o daemon está desabilitado. Quando vários workspaces de inicialização/restaurados estão presentes, `--max-total-sessions` é omitido, e `maxSessionsPerWorkspace` é finito, o daemon deriva o limite total efetivo uma vez como `maxSessionsPerWorkspace * startupWorkspaceCount`; registro dinâmico posterior não o recomputa. Quando definido, limita criação de novas sessões em todo o daemon e reporta falhas de limite total com o formato de erro existente `session_limit_exceeded` mais `scope: "total"`.

`runtime.channel.live` reporta o channel da bridge ACP dentro do daemon. Não é
o worker do channel-adapter. Channels gerenciados pelo daemon usam
`runtime.channelWorker`, cujo `state` é um de `disabled`, `starting`,
`running`, `exited`, `failed`, ou `stopped`. Quando um worker atinge `running`
e depois sai, `/daemon/status` mantém o daemon online e reporta o código de issue
de aviso `channel_worker_exited`.

Inicialização de channel worker gerenciado pelo daemon permanece fail-fast: se `qwen serve
--channel ...` não consegue iniciar um worker que atinge ready, a inicialização do serve falha.
Após um worker ter atingido ready, saídas inesperadas são reiniciadas pelo supervisor
do serve dentro de uma política limitada: até 3 tentativas de restart em uma janela de 5 minutos,
com backoff de 1s, 5s, depois 15s. O worker envia heartbeats IPC a cada 15s; se nenhum
heartbeat é observado por 45s, o supervisor trata o worker como obsoleto, o mata, registra
`staleHeartbeatAt`, e usa o mesmo caminho de restart.

`runtime.channelWorker` pode incluir campos operacionais aditivos:
`requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`,
`restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`,
`lastHeartbeatAt`, `staleHeartbeatAt`, `startupFailures`, e
`startupFailuresTruncated`. Cada falha de inicialização tem `channel`, `phase`
(atualmente `connect`), `code` opcional fornecido pelo adapter, e uma `message` com
credenciais redigidas. No máximo 64 falhas são retidas para a geração atual do worker;
a flag de truncação significa que mais falhas foram observadas. `code` é diagnóstico
e não é uma classificação estável entre adapters. `restartCount` é o número de tentativas
de restart durante a vida deste processo serve; um worker em execução com `restartCount > 0`
está saudável a menos que outro issue se aplique. Um worker em execução cujo
`requestedChannels` inclui nomes ausentes de `channels` reporta `channel_worker_partial_connect`.

Em um daemon multi-workspace (`--workspace` repetido), `runtime` adicionalmente
inclui `channelWorkers[]` — uma entrada por workspace proprietário, cada uma um
snapshot de `channelWorker` anotado com `workspaceId`, `workspaceCwd`, e
`primary`. `channelWorker` permanece populado como snapshot do workspace primário
para compatibilidade. Daemons single-workspace omitem `channelWorkers[]`.

### Controle de channel gerenciado pelo daemon

A capability `channel_control` anuncia o recurso de seleção de runtime.
O recurso é de todo o daemon mesmo que seu caminho de compatibilidade use o
prefixo singular `/workspace`. Seleções de runtime não são persistidas e não
modificam a opção `--channel` de boot do daemon.

`GET /workspace/channel` retorna um snapshot imutável do manager:

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

`selection` é `null` enquanto desabilitado. `pendingSelection` está presente apenas durante
uma mutação. `transition` é um de `idle`, `starting`, `reconciling`,
`stopping`, ou `rolling_back`.

`PUT /workspace/channel` é protegido pelo gate estrito e aceita exatamente uma seleção:

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

Nomes são aparados e deduplicados sem ordenação; um array de nomes vazio é
inválido. `all` permanece somente-workspace-primário. Uma mudança de desabilitado para habilitado
retorna `201`; um PUT idempotente ou substituição retorna `200`. A resposta é
`{ changed, replaced, partial, state }`. Uma seleção igual mantém workers
saudáveis no lugar, mas recupera uma seleção igual cujo worker está parado ou
com falha.

`DELETE /workspace/channel` é protegido pelo gate estrito e idempotente. Retorna
`{ changed, state }`; um estado bem-sucedido é desabilitado. `POST
/workspace/channel/reload` também é protegido pelo gate estrito e relê configurações,
re-resolve grupos de workspace, e força-reconcilia a seleção commitada.
Retorna `409 channel_worker_not_enabled` enquanto desabilitado. A
capability `channel_reload` é anunciada dinamicamente apenas enquanto o manager
tem uma seleção commitada e recarregável.

Cada enable, replace, reload, stop, e shutdown do daemon entra em uma lane FIFO
de ciclo de vida. GET não espera por essa lane. Grupos de workspace cuja seleção
ordenada não mudou permanecem online. Falhas de replacement tentam parar
workers recém-iniciados e restaurar a seleção commitada anterior. Clientes
devem inspecionar `rolledBack`, `rollbackError`, e `state` porque limpeza ou
restauração também podem falhar. O daemon mantém o lease de PID do channel-service
durante toda a transação e não o libera até que toda saída de filho relevante
seja confirmada.

Erros de controle estáveis são:

- `400 invalid_channel_selection`, `channel_workspace_mismatch`, ou `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict` ou `channel_worker_not_enabled`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed`, com `rolledBack` e um `rollbackError` opcional com credenciais redigidas
- `503 daemon_draining`

Escritas estritas contra um daemon sem token configurado retornam `401
token_required` antes do código de controle executar. Uma vez que uma requisição começa,
desconectar o cliente HTTP não cancela a transação de ciclo de vida; clientes podem fazer retry
do mesmo PUT com segurança.

Para `502 channel_worker_start_failed`, a resposta pode também incluir
`startupFailures[]` e `startupFailuresTruncated`. Cada falha adiciona o
`workspaceCwd` confiável do worker tentado. Estes campos descrevem a
transação com falha, enquanto `state` descreve o estado atual após rollback;
um GET posterior não retém a tentativa com falha. Um worker parcialmente conectado
em vez disso retorna sucesso e expõe suas falhas no snapshot do worker. Boot-time
all-failure ainda aborta `qwen serve` antes que um daemon consultável exista.

`qwen channel status` sem `--daemon-url` continua lendo metadados de pidfile;
com `--daemon-url` lê `GET /workspace/channel`. Durante uma janela de restart
o pidfile de propriedade do serve permanece reservado, mas `workerPid` é omitido para que
clientes não exibam um processo worker obsoleto. Em um daemon multi-workspace o
pidfile também carrega um array aditivo `workers[]` (por workspace
`workspaceId` / `workspaceCwd` / `channels` / `workerPid` ao vivo) enquanto o
`channels` de nível superior (união) e `workerPid` (primário) permanecem populados para
leitores mais antigos; daemons single-workspace mantêm a forma original de worker único. Stdout/stderr do worker
são encaminhados para o log do daemon com tokens bearer, valores sensíveis de
ambiente do worker, e credenciais de URL de proxy redigidos.

### Gerenciamento de Channel por workspace

A capability `channel_management` anuncia configuração de Channel escopada por workspace
e gerenciamento de runtime. As rotas singulares `/workspace` visam
o runtime primário. `/workspaces/:workspace` resolve o runtime registrado,
confiável exato e nunca faz fallback para o runtime primário.

Descoberta somente-leitura usa:

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`

O catálogo marca os tipos suportados por esta API de gerenciamento com
`manageable: true`. Snapshots de instância incluem uma revisão, metadados de presença de
segredo redigido, estado de inicialização, e estado de runtime; segredos literais nunca
são retornados. Snapshots de Channel usam `Cache-Control: no-store`.

Descritores de campo podem expor metadados de objetos aninhados através de `properties`.
Descritores numéricos podem usar `exclusiveMinimum` para limites inferiores abertos. Clientes
que não renderizam um tipo de campo anunciado devem preservar seu valor de configuração
existente em vez de coergir ou deletá-lo. Campos de objeto não podem ser obrigatórios,
e propriedades aninhadas não podem ser segredos ou campos resolvíveis por ambiente;
esses protocolos de gerenciamento permanecem apenas no nível superior. Uma propriedade `required`
aninhada é aplicada apenas enquanto seu objeto pai está presente na escrita; omitir o
objeto pai deixa seus requisitos aninhados sem verificação. Escritas substituem o valor
armazenado de cada campo integralmente, então preservar um objeto significa reenviar o
objeto armazenado; o daemon não mescla objetos parciais.

Escritas de configuração usam concorrência otimista e o gate estrito de token bearer:

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- as rotas equivalentes `/workspaces/:workspace/...`

Cada mutação de configurações inclui `expectedRevision`. Requisições upsert contêm um
objeto `config` e podem conter operações explícitas de segredo: `preserve`,
`replace`, ou `clear`. Uma configuração de Channel não pode selecionar um diretório de trabalho
fora do workspace resolvido.

Ações de runtime são requisições `POST` protegidas pelo gate estrito para
`.../channels/:name/start`, `stop`, ou `restart`. Operam apenas no
worker de propriedade do workspace resolvido.

Gerenciamento de pairing está disponível apenas para instâncias configuradas com a
política de envio `pairing` ou política de grupo:

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve` com `{ "code": "..." }`
- `GET .../channels/:name/pairing-approvals`
- `DELETE .../channels/:name/pairing-approvals` com
  `{ "senderId": "..." }` ou `{ "groupId": "..." }`

Todas as rotas de pairing requerem um token bearer e usam `Cache-Control: no-store`.
Requisições, aprovações e revogações são escopadas à instância de Channel
selecionada e workspace. Requisições pendentes incluem um sujeito tipado de usuário ou grupo;
requisições de grupo também retêm o remetente que iniciou a requisição. Snapshots de aprovação
contêm `senderIds` e `groupIds` porque allowlists não persistem nomes de exibição. Revogar um
usuário ou grupo desconhecido retorna `404 channel_pairing_approval_not_found`.

### Entrega de Channel e Notify

`channel_delivery` anuncia suporte de entrega imediata e best-effort. É uma
capability de protocolo, não um sinal de saúde do worker. Entrega nunca inicia um
worker ausente, faz fallback para outro workspace, faz retry, persiste uma outbox,
nem replaya notificações históricas.

Notify direto bypassa Agent e Session e aguarda uma tentativa de envio:

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

Ambas rotas usam o gate estrito de mutação. A rota qualificada resolve apenas um
workspace registrado e confiável. Sucesso é `200 {delivered:true,deliveryId}`.
`delivered:true` significa que a Promise de envio do Channel resolveu; não prova
aceitação do provider, recebimento do usuário, ou confirmação de leitura.
Validação de resposta específica do provider e semântica consistente de razão de erro
entre adaptadores IM estão fora deste contrato V1.
Erros são `400 channel_delivery_invalid`, `503 channel_worker_unavailable` ou
`channel_delivery_queue_full`, `504 channel_delivery_timeout`, e `502
channel_delivery_rejected` ou `channel_delivery_failed`. Um timeout tem resultado
desconhecido e não é retryado.
Intencionalmente não há endpoint separado de teste de conectividade: uma chamada
Notify normal é o teste ponta-a-ponta.

O evento de resultado replayável contém apenas correlação e status sanitizado:

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

Um Prompt bem-sucedido vazio omite campos de erro:

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

`source` é `prompt` ou `scheduled`; `status` é `delivered`, `failed`, ou
`skipped`. `skipped` significa que o turno elegível completou com sucesso mas seu
último bloco de resposta do assistente sem ferramenta estava vazio ou apenas com espaços em branco. O
daemon consome a autorização de entrega e publica o evento sem
resolver um Channel Worker. Correlação agendada usa `taskId` e `firedAt`.
O evento nunca contém IDs de alvo, texto de mensagem, credenciais, ou segredos de webhook.

Segurança: a resposta nunca inclui tokens bearer, ids de cliente, ids de conexão ACP
completos, user codes de device-flow, ou URLs de verificação. Ambos níveis de detalhe
podem incluir `daemon.runId`, `daemon.logMode`, e `daemon.logHealth` aditivos. `summary` omite
o caminho do log do daemon e detalhes de perda; `full` pode incluir `logPath`, `logIssues`,
`logDroppedRecords`, e `logDroppedBytes` para operadores autenticados. Logging de arquivo degradado
adiciona o aviso sem caminho `daemon_log_degraded` ao rollup normal de status.

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
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 64,
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

Contrato estável: quando `v` incrementa o layout do frame mudou de forma incompatível com versões anteriores.

> **`protocolVersions`** descreve as versões do protocolo serve que o daemon pode falar. `current` é a versão de protocolo preferida do daemon e `supported` é o conjunto compatível. Clientes que requerem uma versão específica devem verificar `supported`; UI específica de feature ainda deve verificar `features`. Aditivo ao v=1: daemons v=1 mais antigos omitem este campo, então clientes SDK que visam builds mais antigos devem tratá-lo como opcional.

> **`modelServices` é sempre `[]` no Estágio 1.** O agente usa seu único serviço de modelo padrão e não o enumera pelo wire. O Estágio 2 populará isso a partir de adapters de modelo registrados para que clientes SDK possam construir seletores de serviço; até lá, NÃO dependa deste campo sendo não-vazio.

> **`workspaceCwd`** é o caminho absoluto canônico do workspace primário do daemon. Use-o para omitir `cwd` no `POST /session` (a rota faz fallback para este path primário) e para manter clientes single-workspace antigos compatíveis. Aditivo ao v=1: daemons v=1 pré-§02 omitem o campo — clientes que visam builds mais antigos devem verificar null antes de consumi-lo.

> **`workspaces[]`** lista todo runtime registrado. Daemons single-workspace mais novos incluem o runtime primário mesmo quando `multi_workspace_sessions` está ausente para que clientes possam descobrir o id estável necessário pelas rotas qualificadas por workspace; daemons mais antigos podem omitir o array. Cada entrada é `{ id, cwd, displayName?, primary, trusted, removable? }`. `displayName` é apenas para apresentação e omitido quando não definido. O primeiro/workspace primário permanece espelhado por `workspaceCwd`; novos clientes escolhem um runtime não-primário passando o `cwd` daquela entrada para `POST /session`. Workspaces não confiáveis são anunciados para diagnóstico mas rejeitam criação de novas sessões com `403 untrusted_workspace` até que a confiança mude. `removable` está presente em daemons que suportam remoção de runtime e é true apenas para runtimes secundários dinâmicos por processo ou restaurados por persistência.

As tags de feature de workspace e `workspaces[]` são dinâmicas. Clientes que adicionam um workspace devem buscar `/capabilities` novamente após a mutação completar; o daemon não broadcasta mudanças de capability para clientes que cachearam uma resposta anterior. Esquecer persistência não descarrega um runtime ativo, então esse runtime permanece anunciado até o restart.

### `POST /workspaces`

Registra um runtime de workspace adicional. O path deve ser um diretório absoluto existente, acessível, que não duplica ou aninha com outro workspace registrado. O registro é local ao processo a menos que o cliente envie `persist: true`; clientes devem fazer preflight de `persistent_workspace_registration` antes de solicitar persistência. Quando `workspace_display_name` é anunciado, a requisição pode também incluir um `displayName` opcional.

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

Um runtime recém-criado retorna `201`; promover um workspace secundário já ativo para persistente retorna `200`. Sucesso persistente inclui `persisted: true`:

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

`displayName` deve ser uma string de no máximo 256 caracteres após remover espaços em branco ao redor. Um resultado vazio é tratado como sem nome, e caracteres de controle C0 internos (`U+0000`–`U+001F`) ou DEL (`U+007F`) são rejeitados. JSON `null` não é um valor de criação e retorna `400 invalid_display_name`; omita o campo para não fornecer um nome inicial. Nomes de exibição duplicados são permitidos. Um nome fornecido com um registro local ao processo dura apenas para aquele processo do daemon; `persist: true` o armazena com o registro persistente para que possa ser restaurado após restart. Repetir a requisição para um workspace já persistente é idempotente e não o renomeia.

Erros incluem `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`, `409 workspace_exists` / `workspace_nested` / `workspace_limit_reached`, `500 workspace_registration_store_error` / `runtime_creation_failed`, e `501 persistence_not_available` / `not_implemented`.

### `PATCH /workspaces/:workspace`

Atualiza um recurso de workspace ativo selecionado por ID de workspace ou cwd absoluto URL-encoded. O endpoint atualmente suporta apenas metadados de display-name:

```json
{ "displayName": "Payments Production" }
```

Envie `{ "displayName": null }` para limpar o nome. Aqui `null` é um sentinel de deleção apenas para atualização; valores não-null seguem as mesmas regras de normalização de string que `POST /workspaces`. A resposta é a projeção atualizada `{ id, cwd, displayName?, primary, trusted, removable? }` do workspace. Metadados de runtime são sempre atualizados. Se o runtime tem identidades de registro persistente correspondentes, todo alias é atualizado atomicamente através do store de registro schema-v1 existente; o endpoint nunca cria ou promove um registro persistente.

Campos não suportados falham fail closed em vez de serem ignorados silenciosamente. Erros incluem `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`, `409 workspace_registration_in_progress`, `500 workspace_registration_store_error`, e `503 daemon_shutting_down`.

### `DELETE /workspaces/:workspace`

Remove um runtime secundário removível. O seletor segue as regras de roteamento de workspace plural e aceita tanto um ID de workspace quanto um cwd absoluto URL-encoded. O corpo JSON opcional é `{ "force": boolean }`; omiti-lo solicita remoção não-forçada.

Remoção não-forçada retorna `409 workspace_busy` com um snapshot `activity` quando o runtime congelado tem sessões, prompts, inícios pendentes, conexões ACP, tarefas de memória, ou channel workers de workspace. Enviar `{ "force": true }` solicita o término desses recursos. Remoção de persistência é o ponto de commit: limpeza subsequente é limitada e best-effort, falhas de limpeza são logadas, e remoção lógica ainda converge em vez de restaurar o runtime. Uma resposta bem-sucedida é:

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

Uma requisição não-forçada imediatamente ocupada retorna um snapshot rápido de atividade de pré-drenagem. Uma vez que a drenagem começa, a resposta ocupada ou de sucesso contém o snapshot final tirado após os gates de admissão e drenagem ACP fecharem e antes da limpeza começar. Erros incluem `400 invalid_force_flag` / `workspace_mismatch`, `409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`, `500 workspace_persist_failed` / `workspace_runtime_removal_failed`, `501 workspace_runtime_removal_unsupported`, e `503 daemon_shutting_down`.

### `GET /workspace-registrations`

Lista o conjunto desejado de workspaces persistidos para este workspace primário. Entradas permanecem visíveis com `active: false` quando um diretório armazenado não pôde ser restaurado durante a inicialização atual.
Uma entrada permanece `active: true` enquanto seu runtime está drenando porque o runtime ainda possui recursos ao vivo até a remoção completar.
Entradas incluem `displayName` opcional quando o registro persistente tem um.

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

Retorna `501 persistence_not_available` quando nenhum store de registro está configurado e `500 workspace_registration_store_error` quando o store não pode ser lido.

### `DELETE /workspace-registrations/:id`

Esquece um registro persistido. Isso não descarrega um runtime ativo nem termina suas sessões; `restartRequired: true` significa que o runtime ativo desaparece no próximo restart do daemon.

```json
{ "removed": true, "active": true, "restartRequired": true }
```

Retorna `404 workspace_registration_not_found`, `500 workspace_registration_store_error`, ou `501 persistence_not_available`. Como outras rotas de mutação, este endpoint requer autenticação de mutação quando a autenticação do daemon está habilitada.

### Rotas de status de runtime somente-leitura

Estas rotas reportam snapshots de runtime do lado do daemon. São rotas v1 aditivas,
não mutam estado, e não mudam a versão do protocolo serve. Rotas de status de workspace
intencionalmente **não** iniciam o processo filho ACP só porque um cliente faz poll de uma rota GET:
se o daemon está ocioso, retornam `initialized: false` com um snapshot vazio. Rotas de status de sessão
requerem uma sessão ao vivo e retornam `404 { code: "session_not_found", ... }` para ids
desconhecidos.

Tags de capability:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_monitor_tool_correlation` → entradas do monitor de `GET /session/:id/tasks`
  incluem `toolUseId` para correlação transcrição-tarefa
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` e `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` e `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status` reporta a liveness pontual do channel ACP do workspace primário
como `{ channelLive: boolean }`. O handler não cria um channel, mas alcançar uma rota de runtime pode
primeiro iniciar um runtime de daemon diferido, cuja política de inicialização configurada pode independentemente
fazer preheat de ACP. O snapshot não é um lease: clientes devem deixar a criação de Session revalidar ou iniciar
o channel.

### Preheat de ACP

Tag de capability: `workspace_acp_preheat`.

`POST /workspace/acp/preheat?timeoutMs=N` inicializa best-effort o channel ACP do workspace
primário. `timeoutMs` padrão é 5000 e deve ser um inteiro positivo não maior que 60000. Chamadores
concorrentes e criação de Session compartilham a mesma inicialização de bridge. Um timeout de requisição termina
apenas aquela espera HTTP; não cancela a inicialização compartilhada.

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready` sempre é igual a `channelLive`. Uma resposta ao vivo omite `reason` e
`error`; caso contrário `reason` é `timeout` ou `error`. `durationMs` mede a
chamada HTTP atual, não a vida completa de uma inicialização que a chamada juntou-se.
Timeout operacional ou falha retorna HTTP 200. `timeoutMs` inválido retorna 400, enquanto
autenticação, rate limiting, e falhas de runtime diferido mantêm suas respostas normais.

Ambas rotas de workspace ACP são singulares e somente-workspace-primário. Clientes
não devem usá-las para um workspace secundário nem interpretar nenhuma resposta como uma
garantia durável de prontidão.

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
`/workspace/env`, e (eventualmente) guardrails MCP para que clientes SDK possam renderizar
remediação por categoria em vez de parsear mensagens de forma livre. Os sete literais
de status originais vieram do #4175; `restore_timeout` foi adicionado separadamente
para requisições de restore de sessão. `blocked_egress` permanece reservado até que a
sondagem de egress chegue.

Payloads de status nunca expõem valores env MCP, headers, detalhes OAuth/service-account,
chaves de API de provider, `baseUrl` / `envKey` de provider, corpo de skill, caminhos de filesystem
de skill, definições de hook, ou valores de variáveis de ambiente secretas. `/workspace/env` reporta
a **presença** de variáveis de ambiente em whitelist apenas; URLs de proxy são limpas de
credenciais e reduzidas a `host:port` antes de irem para o wire.

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

`discoveryState` é um de `not_started`, `in_progress`, ou `completed`.
`transport` é um de `stdio`, `sse`, `http`, `websocket`, `sdk`, ou
`unknown`. `errors` é omitido quando a descoberta tem sucesso.

**Guardrails de cliente MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175)).** Daemons atuais estendem o payload com quatro campos aditivos e uma célula de budget escopada por capability:

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

`budgetMode` é um de `enforce`, `warn`, ou `off`. `clientBudget` está ausente quando nenhum budget foi definido. `budgets[]` é **sempre um array** em daemons anunciando `mcp_guardrails` (possivelmente vazio quando `budgetMode === 'off'`); daemons mais antigos omitem o campo inteiramente. Quando `mcp_workspace_pool` é anunciado, a célula tem `scope: 'workspace'` e cobre o pool compartilhado do runtime de workspace selecionado. Quando aquela tag está ausente, incluindo sob `QWEN_SERVE_NO_MCP_POOL=1`, o manager legado emite `scope: 'session'`. Consumidores DEVEM tolerar valores de escopo adicionais não reconhecidos.

`disabledReason` em células por servidor distingue desabilitado pelo operador (`'config'` — lista de configuração `disabledMcpServers`) de recusado por budget (`'budget'` — descoberto mas nunca conectado devido ao modo `enforce`). Recusas são determinísticas pela ordem de declaração `Object.entries(mcpServers)`. O `status: 'error', errorKind: 'budget_exhausted'` por servidor sobrepõe o `mcpStatus: 'disconnected'` bruto (que é verdadeiro mas não é a severidade voltada ao operador).

Aplicação de budget é orientada por capability. Com `mcp_workspace_pool`, sessões dentro de um runtime de workspace compartilham transportes e um `WorkspaceMcpBudget`; runtimes de workspace diferentes nunca compartilham pool ou budget. Sem a tag, o `McpClientManager` de cada sessão ACP aplica sua própria cópia do limite e o snapshot representa aquela visão de sessão legada.

**Detectando pressão de budget.** Duas superfícies, ambas populadas pós-PR-14b:

- **Eventos push** (anunciados via `mcp_guardrail_events`): assine `GET /session/:id/events` e filtre frames `mcp_budget_warning` / `mcp_child_refused_batch` via `KnownDaemonEvent`. A máquina de estados dispara uma vez por cruzamento ascendente de 75% (rearmada abaixo de 37,5%); recusas são coalescidas uma vez por passagem de descoberta sob modo `enforce`.
- **Poll de snapshot** (anunciado via `mcp_guardrails`): `GET /workspace/mcp` e inspecione a célula de budget (`budgets[0]`) junto com `mcp_workspace_pool` para determinar seu escopo:

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (corresponde ao limite de histerese que o evento push do PR 14b usará).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (um ou mais servidores recusados nesta passagem de descoberta).
- `budgets[0].status === 'ok'` ⇔ abaixo do limite de 75% E sem recusas.

Cadência de poll recomendada: alinhada com o que já faz poll de `/workspace/mcp`; o snapshot é barato e a célula de budget não carrega custo de descoberta extra. Clientes SDK que assinam eventos push ainda se beneficiam do snapshot para estado-após-desconexão-prolongada (a profundidade do anel de replay SSE é finita — `--event-ring-size`, padrão 8000 — então um cliente offline por mais tempo que a cobertura do anel faz fallback para ressincronização por snapshot).

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
      "userInvocable": false,
      "installedPath": "/home/alice/project/.qwen/skills/review/SKILL.md",
      "argumentHint": "[path]"
    }
  ]
}
```

`level` é um de `project`, `user`, `extension`, ou `bundled`.
`userInvocable` (booleano, opcional) é omitido para skills normais (significando
`true`) e está presente apenas como `false` quando a skill não pode ser invocada manualmente
ou alternada através da API de skill. `modelInvocable` é independente: `false`
significa que a skill permanece disponível manualmente mas está oculta da invocação por modelo.
`installedPath` é o path absoluto existente para o `SKILL.md` da skill; o
daemon o retorna como armazenado sem resolver symlinks separadamente ou
canonizá-lo. Daemons atuais o emitem para toda skill, enquanto clientes devem
tolerar sua ausência de daemons v1 mais antigos. Corpos de skill, hooks, `skillRoot`,
e outras configurações de skill permanecem excluídos. `errors` é omitido quando
a descoberta tem sucesso.

Leituras repetidas são servidas do último snapshot de workspace commitado,
periodicamente revalidadas contra o cache em memória do filho. Uma leitura nunca
escaneia diretórios de skill ou reparseia arquivos `SKILL.md`. O filho verifica
que suas fontes de extensão não mudaram — um `readdir` do diretório de extensões
mais um `stat` por entrada, o arquivo de habilitação, e o estado de ativação do store — e atualiza apenas quando moveram, então uma extensão
instalada ou alternada fora do daemon ainda é detectada na próxima leitura.
Modos safe e bare pulam a verificação, correspondendo à sua exclusão de extensões.

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

Modelos são agrupados por tipo de auth. Diagnósticos de conexão de provider ficam em
`/workspace/preflight` na célula `providers`; preflight de ambiente fica em
`/workspace/preflight` e `/workspace/env` (abaixo). `errors` é omitido
quando a construção do snapshot tem sucesso.

### `GET /workspace/env`

Reporta o runtime, plataforma, sandbox, proxy, e a **presença** de variáveis de ambiente
secretas em whitelist do processo do daemon. Sempre responde a partir do estado `process.*` — o
daemon nunca cria um filho ACP para servir esta rota, e a resposta é idêntica se ACP está
ativo ou ocioso. O campo `acpChannelLive` é apenas informativo.

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

Forma da célula:

```ts
type DaemonEnvKind =
  | 'runtime' // name: 'node' | 'bun' | 'unknown'; value: process.versions.node
  | 'platform' // name: process.platform; value: process.arch
  | 'sandbox' // name: 'SANDBOX' | 'SEATBELT_PROFILE'; value opcional
  | 'proxy' // name: HTTP_PROXY | HTTPS_PROXY | NO_PROXY | ALL_PROXY; value: host redigido
  | 'env_var'; // apenas presença; campo value é SEMPRE omitido

interface DaemonEnvCell extends DaemonStatusCell {
  kind: DaemonEnvKind;
  name: string;
  present?: boolean;
  value?: string;
}
```

**Política de redação.** Células `kind: 'env_var'` nunca incluem um campo `value`;
clientes veem apenas `present: boolean`. Células `kind: 'proxy'` executam o
valor env bruto através de redação de credenciais (`redactProxyCredentials`) e
depois através de parsing `URL` para que o wire carregue apenas `host:port`. `NO_PROXY`
é passado pela redação literalmente porque é uma lista de hosts em vez de
uma URL. A whitelist de variáveis de ambiente secretas enumeradas atualmente inclui
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
`DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY`, e `QWEN_SERVER_TOKEN`. Outras
variáveis de ambiente não são enumeradas, então secrets acidentalmente definidos permanecem invisíveis.

### `GET /workspace/preflight`

Reporta verificações de prontidão do daemon. **Células de nível daemon** (`node_version`,
`cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) são sempre
populadas a partir de `process.*` e `node:fs`. **Células de nível ACP** (`auth`,
`mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`)
requerem um filho ACP ao vivo — quando o daemon está ocioso elas emitem
placeholders `status: 'not_started'`. A rota nunca cria ACP somente
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

Forma da célula:

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

- `missing_binary` — versão do Node abaixo do necessário, `QWEN_CLI_ENTRY` ausente,
  ripgrep / git / npm não estão no PATH (avisos em vez de erros para os
  binários opcionais).
- `missing_file` — `boundWorkspace` não existe ou não é um diretório;
  erro de parse de skill apontando para um arquivo ausente ou ilegível.
- `parse_error` — falha de parse de `SKILL.md`, JSON de configuração malformado.
- `auth_env_error` — `validateAuthMethod` retornou uma string de falha não-null,
  ou uma subclasse `ModelConfigError` propagada da resolução de provider.
- `init_timeout` — reject `withTimeout` na bridge (um timeout real
  enquanto aguarda um roundtrip ACP). Reconhecido via a classe tipada
  `BridgeTimeoutError`. Nota: uma célula `mcp_discovery` transitória com
  `warning` e `connecting > 0` NÃO carrega este tipo — esse é
  um estado normal de handshake em andamento, distinto de um timeout real.
- `restore_timeout` — um load ou resume de sessão excedeu o budget dedicado
  de restore. A resposta REST é `504` e é retryable; é distinta da inicialização
  do filho e dos limites de janela de replay limitada.
- `protocol_error` — `extMethod` ACP rejeitado porque o channel fechou
  no meio da requisição, ou porque o registry de ferramentas estava inesperadamente ausente.
- `blocked_egress` — reservado para PR 14 (#4175). PR 13 deixa a
  célula `egress` como `status: 'not_started'`.

Se a bridge falhar ao alcançar o filho ACP enquanto serve uma requisição de preflight
(por exemplo, um fechamento de channel no meio da requisição), o array `errors` do envelope
carrega um único `ServeStatusCell` descrevendo a falha e as células
fazem fallback para placeholders ACP `not_started`. Células de nível daemon ainda
são retornadas.

### Rotas de arquivo de workspace

Todos os paths de arquivo são resolvidos através do workspace primário do daemon. Respostas usam
paths relativos ao workspace e nunca retornam paths absolutos do filesystem para casos de
sucesso normais. Respostas de arquivo bem-sucedidas incluem:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Erros de filesystem usam esta forma JSON:

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

Valores de `errorKind` incluem `path_outside_workspace`, `symlink_escape`,
`path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`,
`permission_denied`, `parse_error`, `hash_mismatch`,
`file_already_exists`, `text_not_found`, e `ambiguous_text_match`.

#### `GET /file`

Lê um arquivo de texto. Query params: `path` (obrigatório), `maxBytes`, `line`, `limit`,
e `cursor`. O daemon rejeita arquivos binários. Arquivos acima do limite de snapshot
completo de 256 KiB requerem pelo menos um argumento explícito de janela (`line`, `limit`, ou
`maxBytes`); uma requisição sem nenhum deles permanece `file_too_large`. Tal janela
é transmitida por streaming, e seu conteúdo UTF-8 retornado permanece limitado a 256 KiB.
`maxBytes` sempre se aplica aos bytes de resposta UTF-8 após decodificação, incluindo
quando a fonte usa outra codificação suportada dentro do limite de snapshot completo.

Offsets de linha são resolvidos escaneando do início do arquivo, então uma janela
também é recusada com `file_too_large` quando alcançá-la leria mais de
8 MiB (`MAX_TEXT_SCAN_BYTES`). Use `GET /file/bytes` para alcançar um offset mais profundo
diretamente. Texto grande em uma codificação que a rota não pode decodificar retorna
`binary_file`, não `file_too_large` — tentar novamente com uma janela menor não pode
ajudar, e `readBytes` é o mesmo remédio que já se aplica a binários.

Para arquivos dentro do limite de snapshot completo, a resposta inclui `hash`, um digest SHA-256
sobre os bytes brutos em disco do arquivo inteiro, mesmo quando `line`, `limit`,
ou `maxBytes` retornaram uma fatia. Janelas parciais grandes omitem `hash`, retêm o
`sizeBytes` completo, definem `truncated: true`, e retornam
`originalLineCount: null` quando o streaming para antes do EOF.

##### Paginação com `cursor`

Requer a capability `workspace_file_read_cursor`. Uma resposta que tem mais
a retornar retorna `hasMore: true` e, quando um offset de bytes do arquivo é derivável, um
token `nextCursor`. Passá-lo de volta como `cursor` retoma em O(1), onde um offset
profundo de `line` custa um scan do byte 0 e é recusado além de 8 MiB.

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → próxima página
```

`cursor` e `line` são mutuamente exclusivos (`parse_error`) — ambos nomeiam um
ponto de partida. Um cursor malformado ou muito longo é `parse_error`; um cursor
cujo arquivo foi substituído ou truncado é `hash_mismatch` (409). Append
**não** invalida um cursor pendente, que é o caso para o qual a feature
existe.

`content` omite a quebra de linha terminante de sua última linha, como toda outra leitura
faz, então um cliente remontando páginas as junta com `\n`. `hasMore` não é uma
reafirmação de `nextCursor`: um arquivo pequeno não-UTF-8 lido com um `limit` tem
mais conteúdo mas nenhum offset de bytes derivável, então reporta `hasMore: true` com
`nextCursor: null`. O cursor também é null quando o limite de bytes corta a linha
atual, porque retomar daquele offset retornaria uma linha parcial. Para muitas
linhas curtas, diminua `limit` até que a página termine antes do limite de bytes e retorne
um cursor. Para uma linha única muito grande, solicite a linha seguinte explicitamente
(por exemplo, `line=2` quando começando na linha 1), depois continue com cursores;
use `GET /file/bytes` quando a linha muito grande completa é necessária.

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

Lê bytes brutos de um arquivo sem decodificação. Query params: `path` (obrigatório),
`offset` (padrão `0`), e `maxBytes` (padrão `65536`, máximo `262144`). Esta
rota suporta janelas limitadas em arquivos binários grandes sem engolir o arquivo
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
sem um token configurado retorna `401 { "code": "token_required" }`.
Com `--require-auth`, o middleware bearer global rejeita requisições não autenticadas
antes da rota executar.

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
malformados são `400 parse_error`, e hashes obsoletos são
`409 hash_mismatch`. `expectedHash` é `sha256:` mais 64 caracteres hex minúsculos,
computado sobre bytes brutos em disco.

`bom`, `encoding`, e `lineEnding` podem ser fornecidos. Substituição preserva o
perfil de codificação do arquivo existente por padrão; campos explícitos o sobrepõem.
Escritas binárias estão fora de escopo.

O daemon escreve em um arquivo temporário aleatório no diretório alvo, faz fsync onde
suportado, re-verifica o hash atual imediatamente antes do `rename()`, depois
renomeia para o lugar. Isso impede observação de arquivo parcial e serializa
escritas originadas do daemon para o mesmo arquivo, mas não é um compare-and-swap de
kernel entre processos: um editor externo ainda pode competir na janela minúscula
entre a verificação final de hash e o rename.

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

`oldText` deve ser não-vazio e ocorrer exatamente uma vez. Nenhuma correspondência retorna
`422 text_not_found`; múltiplas correspondências retornam `422 ambiguous_text_match`.
A rota preserva codificação, BOM, e quebras de linha, e re-verifica
`expectedHash` imediatamente antes do rename atômico.

Escritas/edições explícitas em paths ignorados são permitidas porque o chamador
autenticado nomeou o path. Respostas de sucesso e eventos de auditoria incluem
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

`state` espelha as mesmas formas de modelo/modo/opção de configuração ACP usadas por
`POST /session`, `POST /session/:id/load`, e `POST /session/:id/resume`.

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
notificação SSE `available_commands_update`. `availableSkills` lista apenas nomes de skills;
clientes não devem esperar corpos de skill ou paths por esta rota.

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

Esta rota é um snapshot out-of-band somente-leitura. Intencionalmente não é um
prompt e pode ser consultada enquanto a sessão está em streaming. A resposta apenas
contém metadados em whitelist dos registries de agente, shell, e monitor;
controllers, timers, offsets, mensagens pendentes, e objetos de registry brutos
nunca são expostos.

Tarefas de agente spawned por outro sub-agente (sub-agentes aninhados, limitados por
`maxSubagentDepth`) carregam três campos de linhagem opcionais: `parentAgentId` (o
`id` da tarefa de agente que spawnou), `parentName` (o `subagentType` do agente que spawnou,
capturado no registro para que sobreviva à evicção do pai do registry), e `depth`
(profundidade de lançamento baseada em 0; 0 = spawned pela sessão de nível superior). Agentes lançados
pela sessão de nível superior omitem `parentAgentId` e `parentName`; clientes devem tratar
todos os três campos como opcionais e fazer fallback para uma lista plana quando ausentes.

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

`status` é um de `NOT_STARTED`, `IN_PROGRESS`, `READY`, ou `FAILED`.
`error` opcional está presente em servidores com falha quando disponível. LSP desabilitado
(incluindo modo bare) retorna HTTP 200 com `enabled: false`, contagens zero, e
`servers: []`. LSP habilitado sem servidores configurados retorna `enabled: true`,
`configuredServers: 0`, e `servers: []`. Se a inicialização falhar antes do
cliente existir, a resposta pode incluir `initializationError`; se um cliente ao vivo
não puder fornecer um snapshot, a resposta inclui `statusUnavailable: true`.

Esta rota expõe apenas campos estáveis voltados ao cliente. Intencionalmente omite
internos de debug como IDs de processo, args de spawn, caudas de stderr, URIs de root, e
paths de pasta de workspace.

### `POST /session`

Cria um novo agente ou anexa a um existente (sob `sessionScope: 'single'`, o padrão).

Requisição:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread"
}
```

| Campo            | Obrigatório | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`            | não         | Path absoluto correspondendo a um workspace registrado. Se omitido, a rota faz fallback para o workspace primário (leia-o de `/capabilities.workspaceCwd`). Um `cwd` não-vazio incompatível retorna `400 workspace_mismatch`. Quando `features` contém `multi_workspace_sessions`, clientes podem passar qualquer `workspaces[].cwd` confiável; caso contrário apenas o workspace primário é aceito. Paths de workspace são canonizados via `realpathSync.native` (com fallback resolve-only para paths inexistentes) para que filesystems case-insensitive não rejeitem sessões por grafia.                                        |
| `modelServiceId` | não         | Seleciona qual _model service_ configurado o agente usará (o provider back-end — Alibaba ModelStudio, OpenRouter, etc). Se omitido o agente usa seu padrão. Se o workspace já tem uma sessão, isso chama `setSessionModel` na existente e broadcasta `model_switched`. Distinto de `modelId` no `POST /session/:id/model`, que seleciona o modelo **dentro** de um serviço já vinculado. O array `modelServices` em `/capabilities` é reservado para anunciar serviços configurados; no Estágio 1 é sempre `[]` (o serviço padrão do agente é usado e não enumerado por HTTP).                                                 |
| `sessionId`      | não         | UUID variante RFC v1-v5 escolhido pelo chamador. O daemon normaliza para minúsculas e sempre cria uma sessão thread fresca; nunca trata este campo como um attach idempotente. Confirme que `caps.features` contém `session_id_override` antes de enviá-lo porque daemons mais antigos podem ignorar campos desconhecidos. `null` é equivalente a omissão.                                                                                                                                                                                                                                                                   |
| `sessionScope`   | não         | Override por requisição para compartilhamento de sessão. `'single'` (o padrão de todo o daemon) faz um segundo `POST /session` no mesmo workspace reutilizar a sessão existente (`attached: true`); `'thread'` força uma nova sessão distinta a cada chamada. Omita para herdar o padrão de todo o daemon. Valores fora do enum retornam `400 { code: 'invalid_session_scope' }`. Daemons antigos (pré-PR #4175 5) ignoram o campo silenciosamente — faça preflight de `caps.features.session_scope_override` antes de enviar. O padrão de todo o daemon é hardcoded como `'single'` em produção hoje; #4175 pode adicionar uma flag CLI `--sessionScope` em um acompanhamento. |

Resposta:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` significa que uma sessão para aquele workspace já existia e você agora a está compartilhando.

IDs fornecidos pelo chamador são únicos entre todos os runtimes de workspace atualmente registrados e toda geração de bridge ainda ao vivo, incluindo substitutos em drenagem. Um duplicata ao vivo, pendente, ativa, arquivada ou backed por worktree retorna `409 session_id_conflict`. Valores inválidos retornam `400 invalid_session_id`; uma verificação indisponível de proprietário ao vivo ou estado persistido retorna `503 session_id_admission_unavailable` retryable. Faça retry com backoff limitado após mudanças de saúde da bridge ou armazenamento; `retryable` significa que outra tentativa é segura, não que um retry imediato terá sucesso. Se o agente downstream retornar um ID diferente, o daemon remove aquele órfão e retorna `500 session_id_not_honored`. Após uma resposta ambígua, faça load ou resume do ID conhecido em vez de tentar novamente create como attach.

Integrações multi-cliente que querem conversas independentes devem enviar
`sessionScope: "thread"` em cada `POST /session`. Use o escopo padrão `single`
apenas quando clientes intencionalmente compartilham uma sessão colaborativa; sessões
compartilhadas serializam prompts através de uma FIFO única, visível através de
`/daemon/status` como `runtime.activity.pendingPrompts` e
`runtime.activity.queuedPrompts`.

Chamadas `POST /session` concorrentes para o mesmo workspace são **coalescidas** para um único spawn — ambos chamadores recebem o mesmo `sessionId`, exatamente um reporta `attached: false`. Se o spawn subjacente falhar (timeout de init, saída de agente malformada, OOM), **todos os chamadores coalescidos recebem o mesmo erro** — o slot em andamento é limpo para que uma chamada subsequente possa tentar novamente do zero.

> ⚠️ **Rejeição de `modelServiceId` em uma sessão nova é silenciosa na
> resposta HTTP.** Um `modelServiceId` ruim (erro de digitação, serviço não configurado)
> NÃO gera 500 na criação — a sessão permanece operacional no
> modelo padrão do agente para que o chamador ainda receba um `sessionId` com o qual
> pode tentar novamente a troca de modelo (via `POST /session/:id/model`).
> O sinal de falha visível é um evento `model_switch_failed` no
> stream SSE da sessão, disparado entre o handshake de spawn e sua
> primeira assinatura. **Assinantes que precisam observar este evento
> devem passar `Last-Event-ID: 0` no seu primeiro `GET
/session/:id/events`** para replayar do evento mais antigo disponível do anel
(cobre o `model_switch_failed` do momento do spawn mesmo se a
assinatura chegar alguns ms após a resposta de criação).

### ACP `session/new` com ID fornecido pelo chamador

Clientes ACP solicitam o mesmo comportamento através do campo de metadados da extensão:

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

A resposta contém o ID normalizado em minúsculas. Montagens ACP primárias e qualificadas por workspace compartilham admissão com REST, incluindo `session/load` e `session/resume`. IDs inválidos usam `INVALID_PARAMS` do ACP com `data.httpStatus=400` e `data.errorKind="invalid_session_id"`; conflitos usam `data.httpStatus=409`; verificações indisponíveis de proprietário ao vivo ou estado persistido usam `data.httpStatus=503` e `data.retryable=true`.

Uma sessão criada via ACP que nunca recebe um prompt não deixa rastreamento persistido, e o daemon a recolhe quando sua conexão proprietária fecha com zero sessões anexadas. Após essa coleta o mesmo ID pode ser criado novamente — isso é ciclo de vida de conexão, não reuso de ID: enquanto a conexão (ou qualquer anexo) está ao vivo, a admissão rejeita a duplicata.

### `POST /session/:id/load`

Restaura uma sessão ACP persistida por id e replaya seu histórico via SSE. O id do path é autoritativo; qualquer campo `sessionId` no corpo é ignorado. Faça preflight de `caps.features.session_load` — daemons mais antigos retornam `404` para esta rota.

Requisição:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Campo | Obrigatório | Notas                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | não         | Mesmas regras de canonização + `workspace_mismatch` que `POST /session`. Omita para herdar `/capabilities.workspaceCwd`. Quando `features` contém `multi_workspace_sessions`, chamadores podem passar qualquer `workspaces[].cwd` registrado e confiável; workspaces não primários não confiáveis retornam `403 untrusted_workspace`. `mcpServers` intencionalmente NÃO é aceito aqui — MCP de todo o daemon é orientado por configurações (corresponde a `POST /session`). |

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

`state` espelha o `LoadSessionResponse` do ACP — `models` é um `SessionModelState`, `modes` um `SessionModeState`, `configOptions` um array de `SessionConfigOption`. Campos ausentes são decididos pelo agente. Anexadores tardios (os caminhos `attached: true` abaixo) recebem o MESMO snapshot `state` que o chamador original do load viu — o daemon o cacheia na entrada; mutações de runtime (por exemplo, `model_switched`) são entregues no stream SSE, não em respostas de anexo subsequentes.

`attached: true` significa que a sessão já estava ao vivo (seja de um `session/load`/`session/resume` anterior, ou porque um chamador concorrente coalescido competiu logo à frente).

**Replay de histórico via SSE.** Enquanto `loadSession` está em andamento no lado do agente, o agente pode emitir notificações `session_update` para turnos persistidos, ou retornar atualizações de replay em massa nos metadados da resposta. O daemon semeia esses eventos na janela de snapshot de replay limitada da sessão antes da resposta da rota retornar. Para sessões ao vivo, `POST /session/:id/load` promete apenas aquela janela limitada (`compactedReplay`, `liveJournal`, `lastEventId`), não a transcrição completa. A janela é limitada por bytes por `--compacted-replay-max-bytes` (padrão 4 MiB, máximo 256 MiB); se entradas de replay mais antigas foram descartadas, `compactedReplay[0]` é um marcador `history_truncated` sem id. O `liveJournal` em andamento é limitado separadamente por `--max-journal-events` (padrão 10 000 entradas de replay) e `--max-journal-bytes` (padrão 8 MiB de eventos fonte serializados). Estes são limites **baseline** por sessão. Quando um turno em andamento os excede, o daemon primeiro tenta crescimento adaptativo: eleva os limites daquela sessão em direção ao dobro (até um limite rígido por sessão de 256 MiB, entradas escaladas proporcionalmente, limitadas pelo headroom restante do pool) enquanto o crescimento concedido a todas as sessões ao vivo couber em um pool de crescimento global do daemon dimensionado em 5% do budget de memória efetivo do daemon — o valor de `--memory-budget-mb` quando passado, limitado à memória disponível resolvida, caso contrário 50% da memória autodetectada — limitado a `1024` MB. A contabilidade é em todo o daemon — um daemon multi-workspace executa uma bridge por workspace e todas compartilham o pool único. O crescimento é sob demanda e apenas até onde o pool permite; um `--max-journal-events` ou `--max-journal-bytes` fixado pelo operador o desabilita, assim como um host cujo budget efetivo fica abaixo do mínimo de 1024 MB (`insufficientMemory`): o pool é 0 e o crescimento adaptativo é desabilitado completamente. Eventos fonte consecutivos compatíveis de `agent_message_chunk` ou `agent_thought_chunk` compartilham uma entrada de replay, até 256 eventos fonte por entrada, enquanto limites de ferramenta, atribuição, proveniência e mensagem discreta permanecem intactos. Quando o journal ainda excede seus limites (possivelmente crescidos) após o crescimento que o pool permite — incluindo quando nenhum headroom é concedido ou uma concessão cobre apenas parte do excesso — as entradas mais antigas são descartadas inteiras (então a cauda retida pode ser muito menor que o limite de bytes) e um marcador `history_truncated` com `scope: 'live_journal'` é prepended; seus campos `truncatedEvents` e `retainedEvents` contam eventos fonte, não entradas de replay, e seus `maxBytes` / `maxEvents` refletem os limites em vigor (que podem já ter crescido). Clientes devem renderizar esse marcador como status e continuar aplicando eventos retidos. Acesso completo à transcrição persistida é exposto separadamente via `GET /session/:id/transcript`.

Os limites de bytes da janela de replay se aplicam após o filho ter reconstruído a transcrição persistida; eles não limitam a leitura JSONL em disco. Um restore que exceder o budget do daemon retorna `504` com um `Retry-After` derivado do budget de restore (limitado a 5-120s) e `{code: "session_restore_timeout", errorKind: "restore_timeout", retryable: true, sessionId, action, timeoutMs}`. O daemon cerca a requisição ACP ainda em execução e limpa qualquer sessão tardia em vez de registrá-la. Um retry para o mesmo id retorna `409 restore_in_progress` com `reason: "awaiting_abandoned_cleanup"` e um `Retry-After` do budget de restore (limitado a 5-120s) até que essa limpeza se estabilize. Se a limpeza tardia é incerta, ou o restore abandonado ainda não se estabilizou um budget completo de restore após seu deadline, novas sessões naquele workspace retornam `503 acp_channel_unavailable` com `reason: "restore_cleanup_failed"` ou `"restore_settlement_overdue"`; sessões já ao vivo permanecem utilizáveis enquanto o channel drena.

**Erros:**

- `404` — id de sessão persistida não existe (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (mesma forma que `POST /session`).
- `403` — `untrusted_workspace` quando `cwd` aponta para um workspace não primário não confiável.
- `503` — `session_limit_exceeded` (conta contra `--max-sessions`; restores em andamento também são contabilizados).
- `504` — `session_restore_timeout`; retryable, com um `Retry-After` derivado do budget de restore (limitado a 5-120s) porque o mesmo session id permanece cercado até a limpeza tardia se estabilizar.
- `503` — `acp_channel_unavailable` quando o channel do workspace está fechado para novo trabalho de sessão. `reason` diz por quê: `restore_cleanup_failed` quando um restore abandonado não pôde ser limpo de forma conclusiva, ou `restore_settlement_overdue` quando um restore abandonado ainda não se estabilizou um budget completo de restore após seu deadline. Em ambos os casos sessões existentes permanecem disponíveis, e novo trabalho de sessão pode ser tentado após o channel do workspace drenar — o corpo carrega `retryAfterSeconds` e o header um `Retry-After` derivado do budget correspondente, porque a quarentena sobrevive à cerca e um id fresco nunca vê o 409 que carregaria a dica.
- `409` — `restore_in_progress` (um `session/resume` para o mesmo id já está em andamento, ou um spawn fresco forneceu um id que um restore possui). `Retry-After: 5` enquanto o restore está ativo; uma dica derivada do budget uma vez que está cercado como `awaiting_abandoned_cleanup`. Conflitos de mesma ação (dois `session/load` concorrentes para o mesmo id) são coalescidos — exatamente um retorna `attached: false`, os demais retornam `attached: true` com o mesmo `state`.
- `409` — `session_workspace_conflict` quando o mesmo session id já está ao vivo ou sendo restaurado por outro runtime de workspace.
- `409` — `session_archived` quando o id existe apenas sob `chats/archive/`; chame `POST /sessions/unarchive` antes de `load` ou `resume`.
- `409` — `session_archiving` quando arquivamento ou desarquivamento está em andamento para o mesmo id. `Retry-After: 5`.
- `409` — `session_conflict` quando o id existe tanto em `chats/` quanto em `chats/archive/`; delete a sessão com `POST /sessions/delete` antes de carregar.

### `GET /session/:id/transcript`

Retorna uma página de frames de replay `session_update` sem id reconstruídos da transcrição JSONL ativa persistida. Faça preflight de `caps.features.session_transcript` — daemons mais antigos retornam `404` para esta rota.

Parâmetros de query:

| Campo    | Obrigatório | Notas                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | não         | Cursor opaco base64url retornado pela página anterior. Omita para a primeira página. O cursor é emitido pelo daemon e verificado contra adulteração; modificá-lo retorna `400 invalid_transcript_cursor`. Ele se vincula à identidade do arquivo de transcrição e tamanho de bytes da primeira página congelado; deletar, truncar, substituir, ou arquivar o arquivo o invalida e retorna `409`. |
| `limit`  | não         | Número de `ChatRecord`s ativos para incluir na página. Padrão `100`, máximo `500`. Um registro pode produzir múltiplos frames de replay, então `events.length` pode ser maior que `limit`. Valores inválidos retornam `400 invalid_transcript_limit`.                                                                                                                                              |

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

`events` são apenas frames de replay: `{ v: 1, type: "session_update", data: SessionUpdate }`. Não carregam ids do EventBus, e a resposta nunca inclui `lastEventId`. Chamar esta rota não chama `/load`, não anexa um cliente, não semeia o EventBus ao vivo, não cria uma sessão ao vivo, nem altera a janela de replay ao vivo atual. Sessões ativas ao vivo e inativas são ambas reconstruídas pelo método de status somente-leitura do lado do filho para que o replay use as mesmas configurações de workspace, diretório de saída de runtime, emissores, e semântica de histórico do `/load` sem mutar estado de sessão do daemon.

A primeira página congela o tamanho atual do snapshot JSONL. Páginas posteriores leem apenas aquele prefixo de bytes, então appends após a página 1 não mudam o conjunto de resultados. Se o arquivo desaparecer, for truncado abaixo do tamanho congelado, for substituído com um inode diferente, ou for movido para arquivo, a próxima página retorna `409` e o cliente deve recomeçar da página 1 ou pedir ao usuário para reabrir a transcrição.

Para proteger memória e latência do daemon, snapshots acima do limite de indexação de transcrição falham antes do daemon escanear o JSONL. Clientes recebem `413 transcript_too_large` e devem fazer fallback para processamento de exportação/offline ou pedir ao usuário para encurtar/arquivar histórico mais antigo.

`partial: true` e `replayError` podem aparecer se a conversão de replay falhar após produzir alguns frames. Respostas parciais nunca incluem `nextCursor`, então clientes não podem paginar silenciosamente além de registros que não foram convertidos.

**Erros:**

- `400` — `limit`, `cursor`, ou forma de session id inválidos.
- `404` — id de sessão persistida ativa não existe na requisição da primeira página.
- `409` — `session_archived`, `session_archiving`, ou `session_conflict` das mesmas verificações de carregabilidade que `/load`.
- `409` — snapshot de transcrição indisponível porque o arquivo foi deletado, truncado, substituído, ou arquivado após o cursor ser emitido; isso também se aplica quando o preflight não encontra mais o arquivo ativo para uma requisição de cursor.
- `413` — `transcript_too_large` quando o snapshot congelado de transcrição excede o limite de indexação do daemon.
- `413` — `transcript_page_too_large` quando um registro agregado excede o orçamento de página qualificado por workspace ou a página serializada excede seu orçamento de resposta.

### `GET /workspaces/:workspace/session/:id/transcript`

Retorna a mesma projeção `DaemonSessionTranscriptPage` que a rota singular do JSONL ativo persistido do workspace registrado selecionado. Faça preflight de `workspace_persisted_transcript`; esta capability é independente de `multi_workspace_sessions` e funciona para um primário single-workspace confiável selecionado por id ou cwd.

O seletor e parâmetros de query seguem as regras existentes de workspace plural e transcrição. Runtimes primários e secundários confiáveis e runtimes secundários não confiáveis podem ler. Um primário não confiável retorna `403 untrusted_workspace`. Conteúdo arquivado não é retornado.

Para esta rota qualificada por workspace, `limit` é a contagem máxima de registros. Uma página pode parar antes no orçamento de 4 MiB de fonte persistida e retornar um cursor de continuação. Respostas serializadas são limitadas a 32 MiB e cursores a 64 KiB. Se o estado de replay excederia o limite do cursor, a página retorna seus eventos convertidos com sucesso com `partial: true`, `hasMore: false`, e sem `nextCursor`.

Diferente da rota singular legada, este path é implementado inteiramente dentro do processo do daemon. Não chama a bridge de workspace, não inicia ACP, não carrega configurações, não parseia agentes ou skills definidos pelo projeto, nem cria/repara `session-transcript-cursor-key`. Frames de ferramenta usam nomes e descrições de ferramentas persistidas sem consultar o registry de ferramentas do runtime. Sua chave de cursor HMAC existe apenas na memória do daemon, é isolada por workspace, e rotaciona no restart; um cursor de um processo daemon anterior retorna `400 invalid_transcript_cursor`.

### `GET /workspaces/:workspace/session/:id/export`

Exporta a sessão ativa persistida do workspace registrado selecionado como um anexo. Faça preflight de `workspace_session_export`; não inferir suporte de `session_export` ou `workspace_qualified_rest_core`. O seletor resolve primeiro como id exato de workspace, depois como cwd absoluto URL-encoded após canonização. Ambos runtimes primários e secundários devem ser confiáveis. Um runtime não confiável retorna `403 untrusted_workspace` antes da validação de sessão ou formato.

O `format` opcional de query é `html` (padrão), `md`, `json`, ou `jsonl`. O corpo, tipo MIME, sanitização de filename, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, e disposição de anexo correspondem a `GET /session/:id/export`. A rota legada permanece vinculada ao armazenamento primário.

A rota plural lê apenas o JSONL ativo persistido do workspace selecionado sob o coordenador de arquivo compartilhado existente. Não escaneia outros stores de workspace, não faz fallback para o primário, não resolve um proprietário ao vivo, não chama a bridge de workspace, não inicia ACP, não anexa um cliente, nem carrega configurações. Um session id que existe apenas em outro workspace retorna `404 { code: "session_not_found" }`; sessões arquivadas retornam `409 session_archived`. Formatos inválidos retornam `400 invalid_export_format`, e corridas de armazenamento mantêm os erros existentes `session_archiving` e `session_conflict`.

### `GET /workspaces/:workspace/session/:id/archive/export`

Exporta a sessão persistida arquivada do workspace registrado selecionado como um anexo. Faça preflight de `workspace_archived_session_export`; suporte não pode ser inferido de capabilities de exportação ativa ou core plural. Resolução do seletor de workspace e verificações de confiança executam antes da validação de session-id e formato.

Chamadores do SDK TypeScript usam `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)`. O método sempre usa REST nativo e retorna a projeção de anexo `DaemonSessionExportResult` existente.

A query `format` opcional, corpo da resposta, tipo MIME, filename sanitizado, política de cache, cabeçalho de segurança, e disposição de anexo são idênticos à exportação de workspace ativa. JSONL de fonte arquivada é limitado a 256 MiB antes da reconstrução; um arquivo maior retorna `413 transcript_too_large` com `sessionId`, `snapshotSize`, e `maxBytes`. A exportação ativa mantém seu comportamento de tamanho existente.

A rota lê apenas `chats/archive/<id>.jsonl` no workspace confiável selecionado sob um lease compartilhado do coordenador de arquivo. Não inspeciona conteúdo ativo para fallback, não escaneia outro workspace, não resolve um proprietário ao vivo, não chama uma bridge, não inicia ACP, não anexa um cliente, nem carrega configurações. Um id apenas-ativo retorna `409 { code: "session_not_archived" }`; um id ausente retorna `404 { code: "session_not_found" }`; arquivos ativos e arquivados simultâneos retornam `409 session_conflict`; e uma transição de arquivo retorna `409 session_archiving` com `Retry-After: 5`.

### `POST /session/:id/resume`

Restaura uma sessão ACP persistida por id SEM replayar histórico via SSE. O contexto do modelo é restaurado internamente no lado do agente (via `geminiClient.initialize` lendo `config.getResumedSessionData`); o stream SSE permanece limpo para clientes que já têm histórico renderizado. Faça preflight de `caps.features.session_resume`; `unstable_session_resume` permanece como um alias de compatibilidade depreciado para clientes mais antigos.

Mesma forma de requisição que `/load`. Mesma forma de resposta — `state` espelha o `ResumeSessionResponse` do ACP. Mesmo envelope de erros, incluindo `409 restore_in_progress` (que dispara quando um `session/load` está em andamento; `session/resume` competindo atrás de outro `session/resume` é coalescido).

Use `/load` quando o cliente não tem histórico renderizado (reconexão fria, seletor → abrir). Use `/resume` quando o cliente já tem os turnos na tela e precisa apenas do handle do lado do daemon de volta.

> ⚠️ **Por que `unstable_session_resume` ainda é anunciado?** A rota HTTP do daemon e a capability `session_resume` são estáveis para v1, mas a bridge ainda chama `connection.unstable_resumeSession` do ACP. A tag antiga permanece apenas para que SDKs publicados antes de `session_resume` continuem funcionando.

### `GET /workspace/:id/session-info` e `GET /workspaces/:workspace/session-info`

Retorna contagens agregadas de sessões persistidas para o workspace selecionado sem alterar o caminho paginado de lista de sessões:

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

`active`, `archived`, e `total` contam sessões JSONL locais. `live` é a contagem correspondente da bridge em memória e é omitido para um workspace secundário não confiável registrado porque aquela leitura somente-persistida não deve consultar estado ao vivo. `expensive` é sempre `true` e `cost` é sempre `"disk_scan"`; clientes devem chamar este endpoint com pouca frequência em vez de fazer poll. Se o scan atingir seu limite de segurança ou não puder classificar todo arquivo candidato, a resposta adiciona `"truncated": true` e as contagens persistidas são limites inferiores. Armazenamento ausente retorna contagens persistidas zero. A rota plural usa o mesmo seletor de workspace e política de confiança que o catálogo de sessões plural; um primário não confiável ainda retorna `403 untrusted_workspace`.

O SDK TypeScript do daemon expõe a rota plural via `workspaceById(...)` ou `workspaceByCwd(...)`, seguido de `getWorkspaceSessionInfo()`.

### `GET /workspace/:id/sessions` e `GET /workspaces/:workspace/sessions`

Lista sessões cujo workspace canônico corresponde a `:id` ou `:workspace`. O parâmetro de path primeiro resolve como id exato de workspace e depois como cwd absoluto URL-encoded. Workspaces primários incluem a fusão persistida/ao vivo existente: a lista padrão é sessões ativas de `chats/`; passe `archiveState=archived` para listar sessões arquivadas de `chats/archive/`. Workspaces não primários confiáveis incluem sessões ativas persistidas de seu próprio store `chats/` e fundem resumos ao vivo correspondentes sem duplicatas; se nenhuma sessão ativa persistida existir, a rota preserva o comportamento anterior de cursor somente ao vivo. Workspaces secundários não primários confiáveis também suportam `archiveState=archived`, a lista organizada `view=organized`, e filtros `group`, lendo de seus próprios stores `chats/`, `chats/archive/`, e organização de sessão; uma query combinada `view=organized&archiveState=archived` retorna apenas sessões arquivadas sem fusão ao vivo. Workspaces secundários não primários não confiáveis registrados suportam as mesmas formas de lista, filtro e paginação mas retornam apenas entradas persistidas: o daemon não consulta a bridge ao vivo nem popula interações pendentes, erros de turno, ou estado de cliente do runtime. Padrões persistidos como `clientCount: 0` e `hasActivePrompt: false` permanecem presentes para compatibilidade de wire. Armazenamento ausente retorna uma lista vazia. A rota plural ainda retorna `403 { code: "untrusted_workspace" }` para um primário não confiável; rotas primárias legadas mantêm seu comportamento de compatibilidade existente. `archiveState=all` não é suportado no v1. Listas primárias e backed por persistência mantêm a semântica numérica existente de `cursor`; o fallback ao vivo de não-primário confiável sem persistência mantém seu cursor ao vivo opaco existente.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

Quando `workspace_qualified_rest_core` é anunciado, operações de batch de sessão escopadas por workspace, CRUD de grupo, e mutação de organização de sessão estão disponíveis sob `/workspaces/:workspace/sessions/{delete,archive,unarchive}`, `/workspaces/:workspace/session-groups`, e `/workspaces/:workspace/session/:id/organization`. Para um secundário não confiável, GET de grupo permanece disponível; toda mutação de grupo, sessão e organização permanece protegida por confiança. Rotas de batch e mutação de organização sem workspace permanecem somente-workspace-primário para compatibilidade.

Parâmetros de query:

| Campo          | Obrigatório | Notas                                                                                                                                                                                                                         |
| -------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | não         | `active` (padrão) ou `archived`. Qualquer outro valor retorna `400 { code: "invalid_archive_state" }`.                                                                                                                         |
| `cursor`       | não         | Cursor de paginação da resposta anterior.                                                                                                                                                                                      |
| `size`         | não         | Tamanho da página. Valores inválidos retornam `400 { code: "invalid_cursor" }` ou a validação de tamanho de página existente.                                                                                                  |
| `view`         | não         | Omita para a lista recente legada. `organized` opta pela ordenação de grupos/fixados no servidor e adiciona campos de organização opcionais. Qualquer outro valor retorna `400 { code: "invalid_session_view" }`.              |
| `group`        | não         | Significativo apenas com `view=organized`. `all` (padrão), `pinned`, `ungrouped`, ou um id de grupo personalizado. Ids de grupo desconhecidos retornam `404 { code: "group_not_found" }`.                                       |

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

Com `view=organized`, o daemon lê `<Storage.getProjectDir(cwd)>/session-organization.v1.json`, retorna sessões fixadas primeiro, depois tempo de atividade descendente, e depois `sessionId` para empates estáveis. O cursor organizado é JSON base64url opaco e não deve ser reutilizado com a lista recente legada. `pinned` é um filtro virtual, não um grupo. `groupId: null` significa não agrupado. Sessões arquivadas mantêm seus metadados de organização, mas `archiveState=archived&view=organized` ainda retorna apenas sessões arquivadas.

Campos adicionais podem aparecer em cada sessão quando `view=organized`:

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

Listas ativas confiáveis incluem campos de overlay do daemon ao vivo como `clientCount` e `hasActivePrompt`. Listas de secundário não confiável e arquivadas são somente de armazenamento: campos de overlay ao vivo permanecem ausentes ou falsos, e entradas arquivadas definem `isArchived` como `true`. Array vazio (não 404) quando nenhuma sessão existe — uma UI de seletor de sessão não deve errar só porque o workspace está ocioso.

### `GET /workspace/:id/session-groups`

Lista grupos de sessão definidos pelo usuário para um workspace. O seletor GET singular aceita qualquer id de workspace registrado ou cwd canônico URL-encoded. O alias GET plural também está disponível para um secundário não confiável e lê apenas o sidecar de organização. Mutações de grupo plurais permanecem protegidas por confiança, enquanto mutações de grupo singulares mantêm seu comportamento de compatibilidade somente-primário. Faça preflight de `caps.features.includes('session_organization')`.

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

Cores são apenas tokens de protocolo; clientes localizam nomes de exibição. Nenhum grupo padrão com nome de cor é criado.

### `POST /workspace/:id/session-groups`

Cria um grupo de sessão personalizado. Gate estrito de mutação. Faça preflight de `caps.features.includes('session_organization')`.

Requisição:

```json
{ "name": "Frontend", "color": "blue" }
```

`name` é aparado, deve ter 1-64 caracteres, não pode conter caracteres de controle, e é único dentro do workspace por comparação aparada case-insensitive. Nomes duplicados retornam `409 { code: "group_name_conflict" }`. `color` deve ser um dos `colorOptions` retornados.

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

Atualiza um grupo de sessão personalizado. Gate estrito de mutação. Faça preflight de `caps.features.includes('session_organization')`. Campos do corpo são opcionais: `{ "name"?: string, "color"?: string, "order"?: number }`. Ids de grupo desconhecidos retornam `404 { code: "group_not_found" }`; nomes e cores duplicados/inválidos usam os mesmos erros que a criação.

### `DELETE /workspace/:id/session-groups/:groupId`

Deleta um grupo de sessão personalizado. Gate estrito de mutação. Faça preflight de `caps.features.includes('session_organization')`. Sessões referenciando o grupo são limpas para `groupId: null`; estado de fixação é preservado. Resposta é `{ "deleted": true }` quando um grupo foi removido e `{ "deleted": false }` quando o id não existia.

### `POST /sessions/delete`

Deleção hard de um ou mais arquivos JSONL de sessão persistidos. O daemon primeiro faz best-effort close de sessões ao vivo, depois remove o JSONL ativo ou arquivado. Se ambas cópias ativa e arquivada existem para o mesmo id, ambas são removidas. Sidecars de worktree de ambos os lados são limpos; histórico de arquivo, transcrições de subagente, e sidecars de runtime são intencionalmente preservados.

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

Arquiva uma ou mais sessões. Arquivamento é uma transição de estado, não deleção: o JSONL move de `chats/<id>.jsonl` para `chats/archive/<id>.jsonl`. Histórico de arquivo, transcrições de subagente, e sidecars de runtime permanecem no lugar. Se uma sessão está ao vivo, o daemon primeiro executa um close estrito e requer que o handler de close do agente ACP faça flush da gravação do chat; se close ou flush falhar, o JSONL não é movido. Faça preflight de `caps.features.session_archive`.

Requisição:

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` deve ser um array de strings não-vazio com no máximo 100 ids. Duplicatas são colapsadas.

Resposta:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

Entradas de `errors` têm `{ "sessionId": "<uuid>", "error": "message" }`. Arquivos ativos e arquivados com o mesmo id são tratados como conflito e reportados em `errors`; nenhum arquivo é sobrescrito.

### `POST /sessions/unarchive`

Restaura sessões arquivadas para o diretório ativo. Isso não resume a sessão por si só; apenas move `chats/archive/<id>.jsonl` de volta para `chats/<id>.jsonl`. Após o unarchive ter sucesso, clientes podem chamar `POST /session/:id/load` ou `POST /session/:id/resume`.

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

Se um JSONL ativo já existe para o id, unarchive reporta um conflito em `errors` e não o sobrescreve. Arquivamento ou desarquivamento em andamento para o mesmo id retorna `409 session_archiving` antes de iniciar o batch.

ACP-over-HTTP usa os mesmos corpos de requisição e resposta através de métodos vendor `_qwen/sessions/archive` e `_qwen/sessions/unarchive`. A tabela de rotas REST mapeia `POST /sessions/archive` e `POST /sessions/unarchive` para aqueles métodos para transportes ACP.

### Roteamento de sessão ao vivo multi-workspace

Quando `multi_workspace_sessions` é anunciado, operações de sessão ao vivo identificam seu workspace a partir do `sessionId`; clientes não adicionam um seletor de workspace à URL. Além das operações de ciclo de vida roteadas por proprietário existentes, isso se aplica a `PATCH /session/:id/metadata`, `POST /session/:id/recap`, `POST /session/:id/generate`, `POST /session/:id/btw`, `POST /session/:id/mid-turn-message`, `GET /session/:id/mid-turn-messages`, `DELETE /session/:id/mid-turn-messages/:messageId`, `POST /session/:id/tasks/:taskId/cancel`, `POST /session/:id/goal/clear`, `POST /session/:id/continue`, `POST /session/:id/language`, `POST /session/:id/artifacts`, e `DELETE /session/:id/artifacts/:artifactId`. O daemon roteia cada requisição para o runtime confiável que possui a sessão ao vivo. Um proprietário não primário não confiável retorna `403 untrusted_workspace`, um proprietário ao vivo ausente retorna `404 session_not_found`, e um proprietário ambíguo fail closed com `500 ambiguous_session_owner`.

Esta regra é apenas para sessões ao vivo e não torna toda rota de sessão sem workspace consciente de multi-workspace. Operações persistidas ou arquivadas usam suas rotas qualificadas por workspace documentadas. `POST /session/:id/branch`, `POST /session/:id/fork`, e `POST /session/:id/cd` intencionalmente permanecem somente-primário e retornam `non_primary_session_route_not_supported` para proprietários não primários.

### Mensagens mid-turn

`POST /session/:id/mid-turn-message` aceita `{ "message": "...", "messageId": "<optional-message-id>" }`. Uma admissão bem-sucedida retorna `{ "accepted": true, "messageId": "<id>" }` e transfere a propriedade para o daemon: a mensagem é drenada para o turno ativo ou promovida para a FIFO normal de prompts quando a sessão fica ociosa. Clientes usando `session_mid_turn_message_query` enviam um `messageId` estável; repeti-lo é idempotente enquanto permanece na fila, pendente, ou nos anéis limitados de reconciliação. Uma fila cheia rejeita uma nova requisição sem tomar propriedade. Novos clientes conectados a um daemon mais antigo detectam a capability ausente e retêm seu fallback local legado.

`GET /session/:id/mid-turn-messages` retorna a fila de propriedade do daemon em toda a sessão mais os anéis limitados `settledMessageIds` e `promotedMessageIds`. IDs resolvidos foram injetados ou explicitamente deletados; IDs promovidos entraram na FIFO normal de prompts. Um id em qualquer anel não deve ser reenviado.

Quando uma mensagem na fila é drenada para o turno ativo, o daemon publica `mid_turn_message_injected` carregando arrays alinhados de `messages` e `messageIds` (e o `promptId` do turno em execução quando conhecido). É um sinal de dedupe transitório, não um item de transcrição: clientes liquidam callbacks de completion registrados sob aqueles ids de mensagem e descartam quaisquer linhas pendentes locais para eles. Daemons mais antigos adicionalmente carregam `originatorClientId` no payload. Um eco perdido é recuperado do anel resolvido via a query acima.

Quando `session_mid_turn_message_mutation` é anunciado, um cliente de sessão anexado pode chamar `DELETE /session/:id/mid-turn-messages/:messageId`. Remove a mensagem da fila mid-turn ou de seu estado de prompt pendente promovido; remover um mensagem promovida que já está em execução aborta aquele turno, correspondendo à remoção ordinária de prompt pendente. Adições e remoções da fila de propriedade do daemon publicam os eventos de sessão existentes `pending_prompt_added` e `pending_prompt_completed` para que clientes anexados refresquem ambos os snapshots autoritativos da fila. `{ "removed": false }` significa que a mensagem já foi injetada, completada, ou não encontrada.

### `POST /session/:id/prompt`

Encaminha um prompt para o agente. Chamadores de multi-prompt enfileiram em FIFO por sessão (ACP garante um prompt ativo por sessão).

Requisição:

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

`delivery` é opcional e requer a capability `channel_delivery`. O
daemon ainda retorna `202 {promptId,lastEventId}` quando o prompt é admitido.
Após um `end_turn` bem-sucedido, a sessão submete o texto final visível para o
Channel Worker já em execução do workspace exato. O payload é apenas o
último bloco de resposta do assistente sem ferramenta; preâmbulos de chamada de ferramenta,
narração entre ferramentas, tentativas sobrepostas, e blocos anteriores de continuação automática são
excluídos. Um final vazio ou apenas com espaços em branco ainda produz um `channel_delivery_result`
correlacionado com `status: "skipped"` após a autorização ser consumida, mas não
contata um worker. Sucesso ou falha de entrega chegam depois através do mesmo evento replayável
e nunca mudam `turn_complete` em `turn_error`. Cancelamento, falha do Agent, e
terminação por limite de tokens não enviam nem publicam um resultado de entrega.

Validação: `prompt` deve ser um array não-vazio de objetos. Outras falhas retornam `400` antes de alcançar a bridge.

Resposta:

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

A resposta `202` reconhece admissão, não conclusão do Agent. Observe o
stream SSE da sessão após `lastEventId` e correlacione `turn_complete` ou
`turn_error` por `promptId`. `turn_complete.data.stopReason` pode ser `end_turn`,
`cancelled`, `max_tokens`, `error`, ou `length`.

Se o cliente HTTP desconectar no meio do prompt, o daemon envia uma notificação `cancel` ACP para o agente, que encerra o prompt com `stopReason: "cancelled"`.

Quando `prompt_absolute_deadline` é anunciado, `deadlineMs` pode encurtar o
deadline do servidor configurado. Expiração emite um `turn_error` correlacionado com
`errorKind: "prompt_deadline_exceeded"`.

### `POST /session/:id/cancel`

Cancela o prompt **ativamente em execução** na sessão. Do lado ACP isso é uma notificação, não uma requisição — o agente reconhece resolvendo o `prompt()` ativo com `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrato de multi-prompt:** cancel afeta apenas o prompt ativo. Quaisquer prompts que o mesmo cliente POSTou anteriormente e ainda estão na fila atrás do ativo continuarão executando. Enfileiramento de multi-prompt é um comportamento introduzido pelo daemon (não está na spec ACP); o contrato para prompts na fila é "eles continuam executando a menos que você cancele cada um, ou mate a sessão via saída de channel".

Se prompts na fila são inesperados em um deployment multi-cliente, primeiro confirme
se os chamadores estão compartilhando uma sessão padrão `sessionScope: "single"`. Para
conversas independentes por thread, crie sessões com
`sessionScope: "thread"` para que prompts serializem apenas dentro daquela thread.

### `DELETE /session/:id`

Fecha explicitamente uma sessão ao vivo. Força o close mesmo quando outros clientes estão anexados — cancela qualquer prompt ativo, resolve permissões pendentes como canceladas, publica evento `session_closed`, fecha o EventBus, e remove a sessão dos mapas do daemon. Sessões persistidas em disco NÃO são deletadas — podem ser recarregadas via `POST /session/:id/load`. Faça preflight de `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotente: retorna `404` para sessões desconhecidas. O envelope de erro usa `code: "session_not_found"`; um close concorrente pode retornar `code: "session_closing"`, que clientes podem tratar como o mesmo estado terminal bem-sucedido para esta rota.

> **Evento `session_closed`.** Assinantes SSE recebem um evento terminal `session_closed` com `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` antes do stream terminar. Reducers SDK tratam isso de forma idêntica a `session_died` (define `alive: false`, limpa `pendingPermissions`).

### `PATCH /session/:id/metadata`

Atualiza metadados mutáveis da sessão. Atualmente suporta apenas `displayName`. Faça preflight de `caps.features.session_metadata`. Agrupamento e fixação intencionalmente não fazem parte desta rota; use `PATCH /session/:id/organization` sob `session_organization`.

Requisição:

```json
{ "displayName": "My Investigation Session" }
```

| Campo         | Obrigatório | Notas                                                                     |
| ------------- | ----------- | ------------------------------------------------------------------------- |
| `displayName` | não         | String, máximo 256 caracteres. String vazia limpa o nome. Omita para manter. |

Resposta:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Publica um evento `session_metadata_updated` no stream SSE da sessão com `{ sessionId, displayName }`.

### `PATCH /session/:id/organization` e `PATCH /workspaces/:workspace/session/:id/organization`

Atualiza estado de organização de sessão local através do gate de mutação existente. Faça preflight de `caps.features.includes('session_organization')`; a rota plural adicionalmente requer `workspace_qualified_rest_core`. Na rota plural, `:workspace` resolve primeiro como id de workspace registrado exato e depois como cwd absoluto canônico URL-encoded. O runtime selecionado deve ser confiável. Validação de existência de sessão e `groupId` não-null é escopada ao estado de sessão ativa persistida, arquivada persistida, e ao vivo daquele runtime e store de grupo, sem fallback para o primário ou outro workspace. A rota legada permanece somente-workspace-primário.

Requisição:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| Campo      | Obrigatório | Notas                                                                                                  |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `isPinned` | não         | Booleano. `true` define `pinnedAt` se não estava fixado; `false` limpa `pinnedAt`.                     |
| `groupId`  | não         | Id de grupo personalizado ou `null` para não agrupado. Ids de grupo desconhecidos retornam `404 { code: "group_not_found" }`. |
| `color`    | não         | Um token de cor de sessão suportado, ou `null` para limpar a cor da sessão.                            |

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

Este estado é armazenado no sidecar de organização de sessão de nível de projeto sob o diretório de armazenamento de runtime do daemon. Não é conteúdo de transcrição, não atualiza `mtime` de transcrição, não é exportado com transcrições, e é preservado entre archive/unarchive.

### `POST /session/:id/heartbeat`

Atualiza a contabilidade de last-seen do daemon para esta sessão. Adaptadores de longa duração (TUI/IDE/web) fazem ping disto em um intervalo para que política futura de revogação (Wave 5 PR 24) possa distinguir clientes mortos de silenciosos.

Headers:

| Header             | Obrigatório | Notas                                                                                                                                                                                                                                          |
| ------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | não         | Ecoa o id emitido pelo daemon do `POST /session`. Clientes identificados também atualizam seu timestamp por cliente; heartbeats anônimos apenas atualizam a marca d'água por sessão. Deve satisfazer a mesma forma `[A-Za-z0-9._:-]{1,128}` como em outros lugares. |

Corpo da requisição é vazio (`{}` é aceito — nenhum campo é lido hoje).

Resposta:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` é ecoado apenas quando um `X-Qwen-Client-Id` confiável foi fornecido. `lastSeenAt` é o epoch `Date.now()` do lado do daemon (ms) que a bridge armazenou.

Erros:

- `400` — `{ code: 'invalid_client_id' }` quando o header está malformado (regra de forma do header) ou quando carrega um `clientId` que não está registrado para esta sessão (a bridge lança `InvalidClientIdError` antes de atualizar qualquer timestamp).
- `404` — sessão desconhecida.

Gating por capability: faça preflight de `caps.features.client_heartbeat`. Daemons mais antigos retornam `404` para este path.

### `POST /session/:id/model`

Troca o modelo ativo **dentro** do serviço de modelo atualmente vinculado da sessão. Serializado através da fila de troca de modelo por sessão.

(Para trocar o _serviço_ em si — Alibaba ModelStudio vs OpenRouter etc — passe `modelServiceId` no `POST /session` para uma sessão nova. O Estágio 1 não tem rota de troca de serviço ao vivo.)

Requisição:

```json
{ "modelId": "qwen-staging" }
```

Resposta:

```json
{ "modelId": "qwen-staging" }
```

Em sucesso, publica `model_switched` no stream SSE. Em falha, publica `model_switch_failed` (para que assinantes passivos vejam a falha, não apenas o chamador). Compete com a saída do channel do agente para que um filho travado não possa bloquear o handler HTTP.

### `POST /session/:id/recap`

Tag de capability: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Gera um resumo de uma frase "onde eu parei" da sessão. Encapsula `generateSessionRecap` do core (`packages/core/src/services/sessionRecap.ts`), que executa uma side-query contra o modelo rápido com ferramentas desabilitadas, `maxOutputTokens: 300`, e um formato de saída estrito `<recap>...</recap>`. A side-query lê o histórico de chat existente do GeminiClient da sessão e **não** adiciona a ele.

Corpo da requisição é ignorado (envie `{}` ou vazio). Gate de mutação não-estrito — postura espelha `/session/:id/prompt` (a chamada custa tokens mas não muta estado). Nenhum evento SSE é publicado.

Resposta (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` é `null` (um 200 normal, não um erro) quando:

- a sessão tem menos de dois turnos de diálogo,
- a side-query não retornou payload extraível `<recap>...</recap>`,
- ou qualquer erro de modelo subjacente ocorreu (o helper do core é best-effort e nunca lança).

Erros:

- `400 {code: 'invalid_client_id'}` — header `X-Qwen-Client-Id` malformado.
- `404` — sessão desconhecida.

Cancelamento: **nenhum no v1**. A rota não escuta desconexão de cliente HTTP, nenhum `AbortSignal` é conectado na bridge, e o filho ACP executa a side-query até o completion independentemente de o chamador ter desconectado. Os únicos tetos são o timeout de backstop de 60s da bridge (`SESSION_RECAP_TIMEOUT_MS`) e a competição de transporte-fechado contra morte do channel ACP. Isso é aceitável porque recap é curto (tentativa única, `maxOutputTokens: 300`, ~1–5s típico); um cancel ext-method baseado em request-id pode conectar cancelamento ponta-a-ponta completo em uma versão futura se o custo de bandwidth justificar.

### `POST /session/:id/generate`

Tag de capability: `session_generation`.

Executa geração de texto escopada por requisição a partir de um prompt fornecido pelo chamador. A requisição
não lê nem muta histórico de conversa e não expõe ferramentas. Prefere
o modelo rápido configurado, fazendo fallback para o modelo principal da sessão se o modelo rápido
está ausente ou não pode ser resolvido. O endpoint é agnóstico de tarefa;
tradução é apenas um possível prompt definido pelo chamador.

Requisição:

```json
{ "prompt": "Translate into Chinese: Hello" }
```

A resposta é `text/event-stream`. O servidor escreve um comentário SSE inicial
imediatamente, seguido de `started`, um evento de progresso `thinking` opcional, zero
ou mais eventos `delta`, e `done`. O evento `thinking` não carrega conteúdo de raciocínio.
Uma falha de modelo após o streaming iniciar produz um evento `error`; não
faz retry com outro modelo. Prompts são limitados a 32 KiB de texto UTF-8.
Desconectar o cliente HTTP cancela a requisição de geração.

### Mutação: aprovação, ferramentas, skills, init, restart de MCP

O daemon expõe cinco rotas de controle de mutação que permitem que clientes remotos mudem a postura de runtime sem tocar no CLI do host do daemon. Todas as cinco:

- São protegidas pelo gate de mutação **estrito** do PR 15. Um daemon configurado sem token bearer as rejeita com `401 {code: 'token_required'}`. Configure `--token` (ou `QWEN_SERVER_TOKEN`) antes de optar.
- Aceitam e estampam o header `X-Qwen-Client-Id` (cadeia de auditoria PR 7). Quando o header carrega um id confiável, o daemon emite `originatorClientId` no evento SSE correspondente para que UIs multi-cliente possam suprimir ecos de suas próprias mutações.
- Faça preflight de cada capability por tag antes de expor a affordance. Daemons mais antigos retornam `404` para a rota.

As rotas de toggle de ferramenta, toggle de skill, init, e restart de MCP emitem eventos **escopados por workspace**: todo bus SSE de sessão ativa recebe o evento, independentemente de qual sessão estava anexada quando a mutação foi disparada. `approval-mode` emite um evento **escopado por sessão** porque a mudança é local ao `Config` de uma sessão.

#### `POST /session/:id/approval-mode`

Tag de capability: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Muda o modo de aprovação de uma sessão ao vivo. O novo modo chega dentro do `Config` por sessão do filho ACP imediatamente. Configurações NÃO são escritas em disco por padrão — passe `persist: true` para também escrever `tools.approvalMode` nas configurações do workspace.

Requisição:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` deve ser um de `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (espelho do enum `ApprovalMode` do core; o SDK exporta `DAEMON_APPROVAL_MODES` para validação em runtime). `persist` padrão é `false`.

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
- `400 {code: 'invalid_persist_flag'}` — `persist` é não-booleano.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — o modo solicitado requer uma pasta confiável (modos privilegiados em workspaces não confiáveis são rejeitados pelo `Config.setApprovalMode` do core).
- `404` — sessão desconhecida.

Evento SSE (escopado por sessão): `approval_mode_changed` com `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Tag de capability: `workspace_tool_toggle`. IO de arquivo puro — sem roundtrip ACP.

Alterna um nome de ferramenta na lista de configurações `tools.disabled` do workspace. Ferramentas listadas ali **não são registradas** (distinto de `permissions.deny`, que mantém a ferramenta registrada e rejeita invocação). Tanto ferramentas built-in quanto ferramentas descobertas via MCP passam por `ToolRegistry.registerTool`, que consulta o conjunto desabilitado.

> ⚠️ **Nomes devem corresponder ao identificador exposto do registry exatamente.** Nenhuma resolução de alias acontece — a rota armazena qualquer string que está no parâmetro de path em `tools.disabled`, e o próximo filho ACP compara contra `tool.name` no momento do registro. Built-ins usam seu nome de registry canônico (forma verbo snake_case): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — NÃO os labels de exibição (`Shell`, `Read`, `Write`) que a CLI surface. Ferramentas descobertas via MCP usam a forma qualificada `mcp__<server>__<name>` (que também é a forma que eventos `tool_toggled` broadcastam e que `GET /workspace/mcp` lista). Desabilitar `Bash` NÃO impedirá `run_shell_command` de se registrar na próxima sessão.

Filhos ACP ao vivo retêm ferramentas já registradas — o toggle tem efeito no **próximo** spawn de filho ACP. Combine com `POST /workspace/mcp/:server/restart` (para ferramentas de origem MCP) ou criação de nova sessão para tornar a mudança efetiva no daemon atual.

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

- `400 {code: 'invalid_tool_name'}` — parâmetro de path vazio, ou parâmetro de path excede o limite de 256 caracteres.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` ausente ou não-booleano.

Evento SSE (escopado por workspace): `tool_toggled` com `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/skills/:name/enable`

Tag de capability: `workspace_skill_toggle`. A forma qualificada por workspace é `POST /workspaces/:workspace/skills/:name/enable`.

Alterna uma skill carregada e invocável pelo usuário através das configurações de skill do workspace, correspondendo ao comportamento da tecla Space no painel CLI `/skills`. Busca é case-insensitive, enquanto persistência e resposta usam o nome canônico da skill. Habilitar uma skill `skills.defaultDisabled` adiciona um opt-in `skills.enabled` do workspace; desabilitar remove aquele opt-in e adiciona uma entrada `skills.disabled` do workspace. Entradas existentes para skills que não estão mais carregadas são preservadas, e entradas duplicadas/variantes de caso para o alvo são colapsadas. Uma entrada de desabilitação hard herdada de padrões do sistema, usuário, ou escopo do sistema bloqueia a skill: escopo do workspace não pode sobrepô-la.

Isso é diferente da operação de skill gerenciada `qwen/skills/setEnabled` do ACP e do campo frontmatter `disable-model-invocation`. Disponibilidade efetiva de skill segue `skills.disabled` > `skills.enabled` > `skills.defaultDisabled`. Ambos disables hard e padrão removem a skill da disponibilidade de comando slash/modelo e rejeitam execução posterior de skill. `disable-model-invocation: true` mantém a invocação direta pelo usuário disponível e apenas oculta a skill da invocação por modelo.

Requisição:

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

`activation` é `applied` quando toda sessão ativa fez refresh, `deferred` quando nenhum filho ACP existe (a configuração persistida é usada quando um iniciar), e `partial` quando pelo menos uma sessão ativa falhou em fazer refresh. Sessões ocupadas são incluídas. O daemon recarrega configurações de workspace para o filho ACP e toda sessão ativa, notifica consumidores do SkillManager, e envia `available_commands_update`. Uma requisição já enviada ao modelo não é reescrita; validação subsequente, snapshots de comandos, e contextos de modelo usam o novo estado. Se a persistência falhar, nenhum refresh ou evento é emitido. Se um refresh de sessão falhar, a configuração commitada é retida. Quando o filho retorna resultados por sessão, as contagens de sessão são exatas. Se o próprio controle de refresh falhar antes de retornar aqueles resultados, `sessionsFailed: 1` é um limite inferior conservador indicando que a requisição de refresh falhou.

Erros:

- `400 {code: 'invalid_skill_name'}` — parâmetro de path vazio, ou mais de 256 caracteres.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` ausente ou não-booleano.
- `403 {code: 'untrusted_workspace'}` — o workspace selecionado não é confiável.
- `404 {code: 'skill_not_found'}` — nenhuma skill carregada corresponde ao nome.
- `409 {code: 'skill_not_toggleable', reason: 'not_user_invocable' | 'inactive_extension' | 'locked', lockedScope?: 'system' | 'user' | 'systemDefaults'}` — o painel CLI não permitiria que o alvo fosse alternado. `lockedScope` está presente apenas quando `reason` é `locked`.

A mutação reutiliza o evento `settings_changed` escopado por workspace para cada chave alterada (`skills.disabled` e/ou `skills.enabled`); não adiciona um novo tipo de evento. Células de status de skill do workspace incluem campos opcionais `disabledReason: 'hard' | 'default' | 'inactive_extension'` e `lockedScope: 'system' | 'user' | 'systemDefaults'`.

#### `POST /workspace/skills/enable`

Tag de capability: `workspace_skill_batch_toggle`. A forma qualificada por workspace é `POST /workspaces/:workspace/skills/enable`.

Alterna até 100 skills carregadas em uma requisição; o limite conta as entradas brutas de `skillNames` antes da deduplicação. Nomes são aparados e deduplicados case-insensitively preservando a ordem de primeira ocorrência. O daemon valida contra um snapshot de status de Skill, persiste todas as mudanças válidas em uma escrita bloqueada de configurações, e refresca sessões ativas uma vez. O processamento é best-effort para erros de alvo esperados: um alvo desconhecido, oculto, de extensão inativa, ou bloqueado é registrado em `errors` sem impedir que outros alvos válidos sejam aplicados. Falhas inesperadas de persistência ou geração de runtime ainda falham toda a requisição.

Requisição:

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
    }
  ],
  "errors": [
    {
      "skillName": "missing",
      "code": "skill_not_found",
      "error": "Skill not found: missing"
    }
  ]
}
```

Erros de alvo usam `skill_not_found`, `skill_not_toggleable`, ou `skill_inactive_extension`. Requisições malformadas retornam HTTP 400 com `invalid_skill_names`, `invalid_skill_name`, ou `invalid_enabled_flag`. Autenticação, confiança de workspace, identidade de cliente, falhas inesperadas de persistência e falhas de geração de runtime falham toda a requisição através dos gates padrão da rota. `activation`, `sessionsRefreshed`, e `sessionsFailed` de nível de batch descrevem o único refresh de sessão ao vivo compartilhado por todos os resultados alterados. `activation` reporta a tentativa de refresh em vez do resultado: um batch no qual nenhum alvo mudou (por exemplo, todo alvo gerou erro) ainda responde `applied` quando uma sessão está ao vivo, correspondendo à resposta no-op de Skill única, então derive o que realmente mudou da flag `changed` de cada resultado e do array `errors`.

#### `POST /workspace/init`

Tag de capability: `workspace_init`. IO de arquivo puro — sem roundtrip ACP, **sem invocação LLM**.

Cria um `QWEN.md` vazio (ou o que `getCurrentGeminiMdFilename()` retorna sob overrides `--memory-file-name`) na raiz do workspace primário do daemon. Apenas mecânico — para preenchimento de conteúdo por IA, faça follow-up com `POST /session/:id/prompt`.

Padrão recusa sobrescrever quando o arquivo alvo existe com conteúdo não-vazio. Arquivos apenas com espaços em branco são tratados como ausentes (corresponde ao comando slash `/init` local).

Requisição:

```json
{ "force": false }
```

Resposta (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` é `'created'` para criações novas, `'noop'` quando um arquivo existente apenas com espaços em branco foi deixado intacto (nenhuma escrita realizada), e `'overwrote'` quando `force: true` substituiu conteúdo não-vazio. O evento SSE `workspace_initialized` espelha a ação da resposta — observadores podem filtrar por `action !== 'noop'` para reagir apenas a mudanças reais em disco.

Erros:

- `400 {code: 'invalid_force_flag'}` — `force` é não-booleano.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — arquivo existe com conteúdo não-vazio e `force` está omitido/falso. Corpo carrega o path absoluto e tamanho (bytes) para que clientes SDK possam renderizar um prompt "sobrescrever N bytes?" sem re-fazer stat.

Evento SSE (escopado por workspace): `workspace_initialized` com `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/reload`

Recarrega configurações MCP persistidas na configuração de descoberta do workspace e em cada
sessão ativa. A forma qualificada por workspace é
`POST /workspaces/:workspace/mcp/reload`.

Corpo da requisição:

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll` é opcional e padrão `false`, preservando
reconciliação incremental. Quando true, o daemon reconecta todo servidor MCP
elegível configurado após a reconciliação de configurações. Alternativamente, passe
`forceReconnectWhich: ["server-a", "server-b"]` para reconectar apenas servidores nomeados.
As opções são mutuamente exclusivas. Uma reconexão forçada faz cada
transporte ler credenciais que outro processo Qwen Code local pode ter
escrito no armazenamento de tokens; não inicia um fluxo de autorização OAuth.

A rota retorna `202 { "accepted": true }`; faça poll de `GET /workspace/mcp` para
o status final de conexão. Valores de opção inválidos retornam 400.

#### `POST /workspace/mcp/:server/restart`

Tag de capability: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Reinicia um servidor MCP configurado através do `McpClientManager.discoverMcpToolsForServer` do filho ACP (disconnect + reconnect + rediscover). Pré-verifica o snapshot de budget ao vivo da contabilidade do PR 14 v1 para que um restart em um workspace saturado de budget retorne uma recusa suave em vez de disparar uma cascata `BudgetExhaustedError`.

Corpo da requisição é vazio (`{}`). O parâmetro de path é o nome do servidor URL-encoded como aparece na configuração `mcpServers`.

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

Razões de skip suave (todas retornam 200):

| `reason`                | Significado                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Outra descoberta / restart para este servidor já está em andamento. A rota retorna imediatamente em vez de aguardar a promise original. Chamador deve tentar novamente após um curto delay. |
| `'disabled'`            | Servidor está configurado mas listado em `excludedMcpServers`. Re-habilite antes de reiniciar.                                                                                           |
| `'budget_would_exceed'` | Daemon está `--mcp-budget-mode=enforce`, o servidor alvo não está atualmente em `reservedSlots`, e o total ao vivo alcançou `clientBudget`. Chamador deve liberar um slot primeiro.       |

Erros (não-2xx):

- `400 {code: 'invalid_server_name'}` — parâmetro de path vazio.
- `404` — nome do servidor não está na configuração `mcpServers`, ou nenhum channel ACP ao vivo existe (restart inerentemente requer uma instância `McpClientManager` ao vivo).
- `500` — erro interno (por exemplo, `ToolRegistry` não inicializado).

Eventos SSE (escopados por workspace): `mcp_server_restarted` com `{serverName, durationMs, originatorClientId?}` em sucesso; `mcp_server_restart_refused` com `{serverName, reason, originatorClientId?}` em skip suave.

### `GET /session/:id/events` (SSE)

Assina o stream de eventos da sessão.

Headers:

```
Accept: text/event-stream
Last-Event-ID: 42        ← opcional, replaya a partir de após id 42
X-Qwen-Event-Epoch: ...  ← opcional, emparelha o cursor com seu bus epoch
X-Qwen-Client-Id: ...    ← opcional identidade de cliente e correlação diagnóstica
```

Query params:

| Param              | Obrigatório | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued`        | não         | Limite de **backlog de frames ao vivo** por assinante. Faixa `[16, 2048]`, padrão 256. Frames de replay forçados no momento da assinatura são isentos dos limites de frame e bytes; o que realmente os consome são eventos ao vivo que chegam enquanto o assinante ainda está drenando um replay grande de `Last-Event-ID: 0`. Aumente para reconexões frias para que a cauda ao vivo não dispare o aviso de cliente lento / evicção antes do consumidor alcançar. O limite de bytes serializados ao vivo é fixo no lado do daemon (padrão 2 MiB) e não tem query parameter. Valores fora da faixa / não-decimais / presentes-mas-vazios retornam `400 invalid_max_queued` antes do handshake SSE abrir. Faça preflight de `caps.features.slow_client_warning` — daemons antigos ignoram o param silenciosamente. |
| `connectReason`    | não         | Hint diagnóstico reportado pelo cliente: `initial`, `resume`, `prompt_restart`, `stream_end`, `transport_error`, `state_resync`, ou `unknown`. Valores inválidos normalizam para `unknown` e nunca rejeitam o handshake. O daemon não usa este campo para auth, replay, evicção, deduplicação, ou substituição de stream.                                                                                                                                                                                                                                                                                        |
| `previousStreamId` | não         | UUID do stream REST/SSE aceito anterior reportado pelo cliente. Valores inválidos são ignorados. Esta é apenas linhagem best-effort e nunca muda o comportamento do stream.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Um handshake bem-sucedido inclui `X-Qwen-SSE-Stream-Id: <uuid>`. Gateways de navegador devem preservar esse header de resposta e expô-lo através de `Access-Control-Expose-Headers`. Daemons antigos ou intermediários podem omiti-lo; clientes devem continuar normalmente e tratar a linhagem como indisponível. O id identifica esta conexão REST/SSE física e correlaciona seu ciclo de vida do daemon, diagnósticos de fila, e rastreamento de requisição.

Formato de frame. A linha `data:` é o **envelope de evento completo**, JSON-stringificado em uma única linha — `{id?, v, type, data, originatorClientId?}`. O payload específico ACP (`sessionUpdate`, argumentos `requestPermission`, etc.) fica sob o campo `data` do envelope; o `type` do envelope corresponde à linha `event:` do SSE.

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

As linhas SSE `id:` / `event:` duplicam `envelope.id` / `envelope.type` para compatibilidade com EventSource. Consumidores raw-`fetch` (o `parseSseStream` do SDK) leem tudo do envelope JSON e ignoram as linhas de preâmbulo SSE.

| Tipo de evento            | Gatilho                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`          | Qualquer notificação `sessionUpdate` ACP (chunks LLM, chamadas de ferramenta, uso)                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `permission_request`      | Agente pediu aprovação de ferramenta                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `permission_resolved`     | Algum cliente votou em uma permissão via `POST /permission/:requestId`                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `permission_partial_vote` | (apenas consensus) Um voto foi registrado mas quórum ainda não alcançado. Carrega `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Faça preflight de `caps.features.permission_mediation`.                                                                                                                                                                                                                                                                                     |
| `permission_forbidden`    | Um voto foi rejeitado pela política ativa (mismatch `designated`, `local-only` não-loopback, ou votante `consensus` não está no snapshot). Carrega `{requestId, sessionId, clientId?, reason}`. Faça preflight de `caps.features.permission_mediation`.                                                                                                                                                                                                                                                      |
| `model_switched`          | `POST /session/:id/model` teve sucesso                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `model_switch_failed`     | `POST /session/:id/model` foi rejeitado                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `session_died`            | Filho agente caiu inesperadamente. **Terminal: stream SSE fecha após este frame; a sessão desaparece de `byId`.** Assinantes devem reconectar via `POST /session` para criar uma nova.                                                                                                                                                                                                                                                                                                                       |
| `slow_client_warning`     | Local do assinante: backlog de frames ao vivo ou backlog de bytes serializados ao vivo ≥ 75% cheio. **Não-terminal** — o stream continua; o aviso é um heads-up antes da evicção. Carrega `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}` onde `threshold` é `frames`, `bytes`, ou `frames_and_bytes`. Dispara UMA VEZ por episódio de overflow; rearma após ambas medições drenarem abaixo de 37,5%. Sem `id` (sintético). Faça preflight de `caps.features.slow_client_warning`. |
| `client_evicted`          | Local do assinante: overflow de fila. `reason` é `queue_overflow` para o limite de frames ao vivo e `queue_bytes_overflow` para o limite de bytes serializados ao vivo. **Terminal: stream SSE fecha após este frame** (sem `id` — sintético). Outros assinantes na mesma sessão continuam.                                                                                                                                                                                                                  |
| `stream_error`            | Erro do lado do daemon durante fan-out. **Terminal: stream SSE fecha após este frame** (sem `id` — sintético).                                                                                                                                                                                                                                                                                                                                                                                                |

Semântica de reconexão:

- Envie `Last-Event-ID: <n>` para replayar eventos com `id > n` do anel por sessão (profundidade padrão **8000**, ajustável via `qwen serve --event-ring-size <n>`).
- **Detecção de gap:** se `<n>` é anterior ao evento mais antigo ainda no anel, o daemon emite um frame sem id `state_resync_required` antes de replayar o sufixo sobrevivente. O SDK faz latch de `awaitingResync`; clientes devem chamar `POST /session/:id/load` e reconstruir da janela atual de snapshot de replay limitado. Aquele snapshot pode ele mesmo começar com `history_truncated` quando entradas de replay em memória mais antigas foram descartadas; este marcador é informativo e não deve iniciar outro loop de resync.
- IDs são monóticos por sessão, começando em 1
- Frames sintéticos (`client_evicted`, `slow_client_warning`, `stream_error`) intencionalmente omitem `id` para não queimar um slot de sequência para outros assinantes

Backpressure:

- Fila por assinante padrão é `maxQueued: 256` itens ao vivo mais um limite de bytes serializados ao vivo de 2 MiB de propriedade do daemon. Frames de replay durante reconexão, `slow_client_warning`, e `client_evicted` bypassam ambos limites.
- Sobrescreva apenas o limite de frames via `?maxQueued=N` (faixa `[16, 2048]`) na requisição SSE. Deliberadamente não há `?maxQueuedBytes`; clientes não podem aumentar o budget de memória do daemon.
- Quando o backlog de frames ao vivo ou backlog de bytes ao vivo de um assinante ultrapassa 75% cheio o bus força-envia um frame sintético `slow_client_warning` para aquele assinante (uma vez por episódio de overflow; rearmado após ambas medições drenarem abaixo de 37,5%). O stream permanece aberto — o aviso é um heads-up para que o cliente possa drenar mais rápido ou detachar + reconectar de forma limpa.
- Se o limite de frames ao vivo transborda, o bus emite `client_evicted` com `reason: "queue_overflow"`. Se o limite de bytes ao vivo transborda, emite `reason: "queue_bytes_overflow"`. Em ambos casos o frame terminal é forçado e a assinatura fecha.

### `POST /permission/:requestId`

Vota em um `permission_request` pendente. A **política de mediação** ativa decide quem vence:

| Política                    | Comportamento                                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (padrão)  | Qualquer votante validado vence; votantes posteriores recebem `404`. Baseline pré-F3.                                                                                                                                                   |
| `designated`                | Apenas o originador do prompt (`originatorClientId`) decide; não-originadores recebem `403 permission_forbidden / designated_mismatch`. Faz fallback para first-responder para prompts anônimos.                                        |
| `consensus`                 | N-de-M votantes devem concordar (padrão `N = floor(M/2) + 1`, override via `policy.consensusQuorum`). Primeira opção a alcançar `N` vence. Votos não-resolutivos recebem frames SSE `200` + `permission_partial_vote`.                 |
| `local-only`                | Apenas votantes de loopback decidem; chamadores remotos recebem `403 permission_forbidden / remote_not_allowed`.                                                                                                                        |

A política ativa é configurada em `settings.json` sob `policy.permissionStrategy` e surface em `/capabilities` em `body.policy.permission`. Faça preflight de `caps.features.permission_mediation` (com `modes: [...]`) para o conjunto suportado pelo build.

> **F3 (#4175): coordenação de permissão multi-cliente.** F3 adicionou as quatro políticas acima. Daemons pré-F3 hardcoded first-responder; a forma de wire permanece bit-a-bit inalterada quando a política configurada é `first-responder`. Novos eventos (`permission_partial_vote`, `permission_forbidden`) são aditivos — SDKs antigos os veem como `unrecognized_known_event` e ignoram graciosamente.

> **Timeout de permissão (padrão 5 minutos).** Um `permission_request`
> permanece pendente até: (a) algum cliente votar aqui, (b) `POST /session/:id/cancel`
> disparar, (c) o cliente HTTP dirigindo o prompt desconectar
> (cancel mid-prompt resolve permissões pendentes como `cancelled`),
> (d) a sessão ser morta, (e) o daemon desligar, **ou
> (f) o timeout de permissão por sessão disparar** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 minutos). No disparo do timeout o `requestPermission` do agente resolve
> como `{outcome: 'cancelled'}`, o anel de auditoria registra uma
> entrada `permission.timeout`, stderr do daemon emite um breadcrumb
> de uma linha, e o bus SSE faz fan-out do frame cancelado padrão
> `permission_resolved` para que assinantes limpem. O
> timeout é configurável via `BridgeOptions.permissionResponseTimeoutMs`;
> chamadores headless executando prompts de longa duração podem querer estendê-lo.

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
- `404 { "error": "..." }` — o requestId é desconhecido (já resolvido, nunca existiu, ou sessão derrubada)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: o `allowedOptionIds` do agente contém o sentinel reservado `'__cancelled__'`; violação de contrato agente / daemon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 forward-compat: um literal de política chegou ao schema mas seu branch mediador ainda não está construído (atualmente inalcançável; reservado para políticas futuras)

Após um voto bem-sucedido, todo cliente conectado vê `permission_resolved` com o mesmo `requestId` e o `outcome` escolhido. Sob `consensus`, votos intermediários adicionalmente fazem fan-out de `permission_partial_vote` até o quórum.

### Rotas de device-flow de Auth (issue #4175 PR 21)

O daemon intermedia um OAuth 2.0 Device Authorization Grant (RFC 8628) para que um cliente SDK remoto possa disparar um login cujos tokens cheguem ao filesystem do **daemon** — não ao cliente. O daemon faz poll do IdP ele mesmo; o único trabalho do cliente é exibir a URL de verificação + user code e (opcionalmente) assinar SSE para eventos de conclusão.

Tag de capability: `auth_device_flow` (sempre anunciada). Providers suportados no
v1: `qwen-oauth`.

> [!note]
>
> O tier gratuito do Qwen OAuth foi descontinuado em 2026-04-15. Trate `qwen-oauth` como o
> identificador legado de provider v1 neste protocolo; novos clientes devem preferir um
> provider de auth atualmente suportado quando disponível.

**Localidade de runtime.** O daemon nunca abre um navegador — mesmo que pudesse. O cliente decide se chama `open(verificationUri)` localmente; em um pod headless (o deployment canônico Modo B) o usuário abre a URL em qualquer dispositivo que tenha um navegador. Veja `docs/users/qwen-serve.md` para a UX recomendada.

**Sem vazamento de token em eventos.** `auth_device_flow_started` carrega apenas `{deviceFlowId, providerId, expiresAt}`. O user code e URL de verificação voltam ponto-a-ponto no corpo POST 201 e via `GET /workspace/auth/device-flow/:id`; nunca são broadcastados no SSE.

**Singleton por provider.** Um segundo `POST` para o mesmo provider enquanto um fluxo está pendente é uma tomada idempotente — retorna a entrada existente com `attached: true` em vez de iniciar uma nova requisição ao IdP.

#### `POST /workspace/auth/device-flow`

Gate estrito de mutação: requer um token bearer mesmo em padrões loopback sem token (`401 token_required`).

Requisição:

```json
{ "providerId": "qwen-oauth" }
```

Resposta (`201` início fresco, `200` tomada idempotente):

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
- `409 too_many_active_flows` — limite do workspace (4) alcançado; cancele um com `DELETE`
- `401 token_required` — gate estrito negou uma requisição sem token
- `502 upstream_error` — IdP retornou um erro inesperado

#### `GET /workspace/auth/device-flow/:id`

Lê o estado atual. Entradas pendentes ecoam `userCode/verificationUri/expiresAt/intervalMs`; entradas terminais (graça de 5 min) os removem e surface `status` + `errorKind/hint` opcional.

Retorna `404 device_flow_not_found` para ids desconhecidos e entradas evacuadas pós-graça.

#### `DELETE /workspace/auth/device-flow/:id`

Cancel idempotente:

- entrada pendente → `204` + emite `auth_device_flow_cancelled`
- entrada terminal → `204` no-op (nenhum evento re-emitido)
- id desconhecido → `404`

#### `GET /workspace/auth/status`

Snapshot de fluxos pendentes + providers suportados:

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

#### Eventos SSE de device-flow

Cinco eventos tipados (escopados por workspace, fan-out para todo bus de sessão ativo):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST teve sucesso; SDK deve assinar (sem userCode aqui, busque via GET se necessário)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — daemon honrou `slow_down` do upstream; clientes fazendo poll GET devem aumentar seu intervalo para corresponder
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — credenciais persistidas; `accountAlias` é um label não-PII (nunca email/telefone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal; `errorKind` é um de `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` é interno ao daemon: o exchange do IdP teve sucesso mas o daemon não pôde armazenar credenciais de forma durável (EACCES / EROFS / ENOSPC). O usuário deve tentar novamente quando a condição de disco subjacente for corrigida.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE teve sucesso contra uma entrada pendente

> **Não compatível com MCP.** A spec de autorização MCP (2025-06-18) manda OAuth 2.1 + PKCE auth-code com callback de redirect, que não funciona para daemons em pod headless. A superfície de device-flow do Modo B é privada do daemon — clientes visando servidores compatíveis com MCP devem usar um caminho de auth diferente.

## Formato de wire de streaming

Eventos são emitidos como frames EventSource padrão. O daemon escreve uma linha `data:` por frame (o JSON não tem newlines embutidos após `JSON.stringify`); o parser SDK em `packages/sdk-typescript/src/daemon/sse.ts` lida com isso e com a forma multi-`data:` permitida pela spec no lado do recebimento.

## Frames de erro durante streaming

Se o iterator da bridge lançar exceção enquanto serve um assinante SSE, o daemon emite um frame terminal `stream_error` (sem `id`). A linha `data:` é o envelope completo (mesma forma que todo outro frame SSE neste doc); a mensagem de erro real fica sob `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

A conexão então fecha.

## Variáveis de ambiente

| Var                 | Propósito                                                      |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Token bearer. Limpo de espaços em branco no início/fim no boot. |

## Layout do código-fonte

| Path                                                 | Propósito                                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | Comando yargs + schema de flags                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`           | Ciclo de vida do listener + tratamento de sinais                                                               |
| `packages/cli/src/serve/server.ts`                   | Montagem do app Express, ordenação de middleware, e rotas diretas restantes                                     |
| `packages/cli/src/serve/routes/*.ts`                 | Grupos de rotas Express focados, incluindo sessão, SSE, auth de workspace, status de workspace, e rotas de arquivo |
| `packages/cli/src/serve/auth.ts`                     | bearer + allowlist de Host + negação CORS                                                                       |
| `packages/cli/src/serve/acp-session-bridge.ts`       | Facade de compatibilidade de bridge local ao CLI para spawn-or-attach, FIFO por sessão, e registry de permissões  |
| `packages/acp-bridge/src/status.ts`                  | Tipos de wire de status somente-leitura do daemon + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | Helper puro que constrói payloads `/workspace/env` a partir do estado `process.*`, incluindo redação de credenciais |
| `packages/acp-bridge/src/eventBus.ts`                | Fila async limitada + anel de replay                                                                           |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | Cliente TS                                                                                                     |
| `packages/sdk-typescript/src/daemon/sse.ts`          | Parser de frames EventSource                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 casos, sem LLM                                                                                              |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 casos, filho real `qwen --acp` backed pelo servidor OpenAI fake local (apenas POSIX; pulado no Windows)       |
