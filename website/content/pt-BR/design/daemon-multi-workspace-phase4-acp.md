# Fase 4 Multi-Workspace do Daemon: ACP Qualificado por Workspace

## Resumo

Este documento projeta a Fase 4 da issue #6378: ACP qualificado por workspace
para o `qwen serve`. Ele se baseia diretamente no branch da Fase 3 de REST
qualificado por workspace (`codex/phase3-workspace-qualified-rest`, PR #6567),
que **ainda não foi mesclado** (estado `CHANGES_REQUESTED`). A Fase 4 monta um
endpoint ACP por workspace em `/workspaces/:workspace/acp`, dá a cada runtime
de workspace seu próprio dispatcher ACP e estado de conexão, e permite que o
Web Shell escolha um workspace a partir de `/capabilities`. O `/acp` legado
permanece vinculado ao runtime primário, então o Web Shell e os clientes ACP
existentes não são afetados.

A Fase 4 tem como escopo o transporte ACP (Streamable HTTP + o WebSocket
`/acp` reverso, seus métodos espelhados de workspace e MCP/CDP reversos).
Voice (`/workspaces/:workspace/voice/stream`) e workers de canal gerenciados
pelo daemon são a **Fase 4b**; adição/remoção dinâmica de workspace é a
**Fase 5**. Nenhum dos dois está no escopo aqui.

A descoberta central da investigação de pontos de integração: a Fase 4 é
majoritariamente uma alteração de _fiação e roteamento_, não uma reescrita. O
`AcpDispatcher` já é vinculado a workspace por construção, sua verificação de
consistência de `workspaceCwd` já existe, a Fase 3 já tornou a superfície REST
espelhada por runtime, e o `clientMcpSenderRegistry` já é um campo por
runtime. O trabalho real é (1) transformar a montagem única de ACP em um
dispatcher por runtime (cada um com sua própria remember lane; ainda uma única
chamada `mountAcpHttp` e um único listener de upgrade; um `AcpHttpHandle` que
é dono do registro de todos os runtimes), (2) estender esse listener de
upgrade de WebSocket para despachar por caminho de URL, (3) manter o registro
de device-flow global do daemon e compartilhado entre todas as montagens (com
fan-out de melhor esforço de event-sink para a bridge de cada runtime
confiável), e (4) sincronizar a nova tag de capability
`workspace_qualified_acp` nos tipos de capability do SDK/CLI e nos testes.

## Retrabalho sistemático (fortalecimento, PR #6621)

A revisão revelou um Critical: uma iteração anterior tornou o registro de
device-flow por runtime, o que deixou as montagens secundárias não
autenticadas (`device_flow "not configured"`). A montagem ACP foi retrabalhada
em oito eixos; a arquitetura final é:

1. **Fábrica de montagem ACP de runtime.** Uma chamada `mountAcpHttp` é dona
   de um `primaryMount` mais um mapa `secondaryMounts` (um `RuntimeAcpMount`
   por runtime não primário), cada um carregando uma flag `primary`. HTTP e WS
   ambos resolvem uma montagem por seletor e delegam para handlers
   compartilhados.
2. **Roteamento + isolamento de conexão.** O seletor plural cria um alias do
   workspace primário para `primaryMount` e resolve uma montagem por runtime
   caso contrário. Workspaces não primários não confiáveis são rejeitados
   (403) tanto nos caminhos HTTP quanto WS antes que qualquer filho seja
   gerado.
3. **Parsing bruto do request-target do WS.** O listener de upgrade faz o
   parse do request-target bruto (não `new URL().pathname`, que normaliza
   `%2e%2e`), então um seletor com segmentos de ponto não normalizados /
   barra invertida é destruído antes do roteamento.
4. **Device-flow global do daemon + fan-out.** O registro de device-flow
   permanece uma única instância do daemon (credenciais OAuth são globais do
   processo). Montagens secundárias o compartilham via
   `opts.deviceFlowRegistry`; eventos de fluxo de autenticação fazem fan-out
   de melhor esforço para a bridge de cada runtime confiável
   (`resolveEventBridges`).
5. **CDP + client-MCP apenas primários.** As reivindicações de túnel CDP são
   controladas por gate em `activeMount.primary`; o POST plural retorna a
   promessa de despacho.
6. **Gate de ciclo de vida descartado.** Após `dispose()`, os handlers HTTP
   compartilhados retornam `503 server_disposed` em vez de correr com
   registros desmontados durante a drenagem do desligamento. `dispose()` é
   idempotente.
7. **Observabilidade agregada.** `AcpHttpHandle.getSnapshot()` soma as
   contagens de conexões e streams WS entre o primário e todas as montagens
   secundárias, então as métricas do daemon reportam conexões ACP de todos os
   workspaces, não apenas as do primário.
8. **Anúncio de capability.** `resolveAcpHttpEnabled()` é a única
   interpretação de `QWEN_SERVE_ACP_HTTP`; `workspace_qualified_acp` é
   anunciada apenas quando a superfície HTTP ACP está habilitada **e** sessões
   multi-workspace estão ativas.

## Fortalecimento de pontos de integração pós-revisão

A arquitetura de montagem acima permanece inalterada. A passagem final de
reparo fecha seis lacunas de limite sem substituir o `AcpHttpHandle` nem
introduzir um novo módulo de política de rotas.

1. **Uma única decisão de prontidão de rota qualificada.** O ACP qualificado
   por workspace está pronto apenas quando o ACP HTTP está habilitado e o
   registro de workspaces contém mais de um runtime. O registro de rotas HTTP,
   o reconhecimento de caminhos WebSocket, o anúncio de capability e a isenção
   do limitador de rate externo devem concordar com essa decisão. Daemons de
   workspace único continuam a expor apenas o `/acp` legado.
2. **Uma única cobrança de rate-limit.** O limitador Express externo isenta
   precisamente um caminho de transporte `/workspaces/<seletor-único>/acp`
   habilitado, incluindo o comportamento existente de maiúsculas/minúsculas e
   barra final da rota. Caminhos vizinhos permanecem limitados. O transporte
   ACP permanece responsável por aplicar o nível de método JSON-RPC, então um
   prompt qualificado consome apenas o bucket de prompts em vez de ambos os
   buckets de mutação e prompt.
3. **Falha estruturada de caminho malformado.** Falhas de decodificação de
   parâmetro de rota do Express que são ambas instâncias de `URIError` e
   marcadas com status HTTP 400 retornam um `400 invalid_request`
   estruturado. Outros valores `URIError` lançados e falhas não relacionadas
   mantêm o tratamento genérico de 500. O caminho WebSocket mantém sua
   resposta 400 explícita existente.
4. **Seletores seguros para log.** Um seletor decodificado usado em um log de
   rejeição de WebSocket voltado ao operador passa pelo sanitizador `logSafe`
   existente, então controles de terminal codificados não podem forjar ou
   dividir linhas do stderr.
5. **Descarte terminal.** `dispose()` é uma transição de ciclo de vida
   irreversível. Depois que ele roda, `attachServer()` não pode recriar um
   servidor WebSocket nem um listener de upgrade. Chamadas repetidas de
   `dispose()` e `attachServer()` permanecem inofensivas.
6. **Diagnósticos completos atribuídos por workspace.** O snapshot ACP
   agregado ganha diagnósticos de conexão aditivos decorados com
   `workspaceId`, `workspaceCwd` e `primary`. Os contadores de resumo
   permanecem inalterados, o `registry` primário público permanece disponível
   para compatibilidade, e leituras do daemon com `detail=full` leem a lista
   de conexões agregada. O teto de conexões existente permanece um limite por
   montagem porque toda montagem é construída com o mesmo teto configurado.

Cada contrato é fixado por um teste de regressão escrito antes da sua alteração
de produção. A verificação inclui as suítes focadas de ACP, rate-limit,
daemon-status e serve-server, mais build, typecheck, lint e a verificação de
closure do fast path do serve.

## Dependências da Fase 3 (não mesclada)

A Fase 4 consome estes pontos de integração da Fase 3. Como o PR #6567 está
`CHANGES_REQUESTED`, trate-os como _a estabilizar_; a implementação da Fase 4
deve fazer rebase na Fase 3 mesclada.

- `packages/cli/src/serve/workspace-route-runtime.ts`:
  - `resolveRegisteredWorkspaceRuntimeByPathSelector(registry, selector)` —
    função pura, retorna `WorkspaceRuntime | undefined`. **Reutilizável pelo
    listener de upgrade do WS** (veja Perguntas em Aberto).
  - `resolveWorkspaceRuntimeFromParam(registry, req, res, param)` — vinculado
    ao Express (escreve `res.status().json()`). **Utilizável para as rotas
    HTTP ACP, não para o caminho de upgrade do WS** (o listener de upgrade tem
    apenas um `IncomingMessage` bruto + `socket`, sem `res` do Express).
  - `requireTrustedWorkspaceRuntime(runtime, res)` — gate de confiança
    vinculado ao Express, reutilizado pelas rotas HTTP ACP.
  - `isPortableAbsolutePath` / `sendWorkspaceMismatch` — reutilizados para
    parsing de seletor e formato de erro.
- Handlers REST por runtime registrados em `server.ts`
  (`registerWorkspaceQualified{FileRead,FileWrite,Trust,Status,Permissions,Settings,Lifecycle,McpControl,Tools}Routes`).
  O dispatcher ACP espelha essas superfícies; a Fase 4 depende do
  comportamento por runtime delas existir.
- `workspaces[]` de `/capabilities` (Fase 2a), construído em
  `packages/cli/src/serve/routes/capabilities.ts` (L79-84) e espelhado em
  `packages/cli/src/serve/daemon-status.ts` (L432-437) com `id` / `cwd` /
  `primary` / `trusted` por runtime. As declarações de feature-flag e seus
  predicados de anúncio/alternância estão em
  `packages/cli/src/serve/capabilities.ts`.

## Baseline: ponto de integração atual do ACP (árvore da Fase 3)

- `mountAcpHttp(app, primaryBridge, opts)` em
  `packages/cli/src/serve/acp-http/index.ts` é chamado uma vez a partir de
  `server.ts` (L1226-1275) com entradas **todas primárias**: `primaryBridge`,
  `primaryBoundWorkspace`, `primaryWorkspace`,
  `primaryRouteFileSystemFactory`, o `deviceFlowRegistry` global do app,
  `primaryRuntime.clientMcpSenderRegistry` e `primaryRuntime.env` (para o
  `extraWsRoute` de voice).
- Um dispatcher por montagem: `mountAcpHttp` constrói um único
  `AcpDispatcher` e um único `ConnectionRegistry`, e retorna um
  `AcpHttpHandle` cujo `registry` é esse registro único e cujo `attachServer`
  instala exatamente um listener `httpServer.on('upgrade', ...)` (index.ts
  L1536, L1555). `dispose` remove esse único listener e fecha esse único
  registro (index.ts L1543-1553).
- **Listener único de upgrade de WebSocket** (index.ts `setupWebSocket`,
  handler de upgrade em L903-1045). Ele é instalado uma vez via
  `AcpHttpHandle.attachServer(server)` após `listen()`. Ele:
  - faz o parse da URL de upgrade,
  - rejeita qualquer caminho que não seja `opts.path` (`/acp`), nem `/cdp`, e
    nem uma entrada de `extraWsRoutes` — `socket.destroy()` em caminho
    desconhecido (index.ts L935-939),
  - executa verificações de segurança compartilhadas (loopback, allowlist de
    hosts, CSRF/origem, token bearer) para **todos** os caminhos,
  - então ramifica: `/cdp` -> `attachCdpClient`; `extraRoute` ->
    `onConnection`; senão o handshake de inicialização ACP.
  - O comentário de documentação em L328-337 é explícito: um segundo listener
    de `'upgrade'` não pode coexistir porque este destrói caminhos
    desconhecidos. A Fase 4 deve estender este único listener, não adicionar
    outro.
- O `AcpDispatcher` (dispatch.ts L644-656) já é vinculado a workspace pelo
  construtor: `bridge`, `boundWorkspace`, `workspace`,
  `workspaceRememberLane`, `fsFactory?`, `deviceFlowRegistry?`,
  `sessionShellCommandEnabled`, `registry?`, `archiveCoordinator`. Todo método
  de workspace espelhado que ele serve lê esses campos, então vincular um
  dispatcher a um runtime automaticamente delimita file / permissions /
  settings / trust / tools / mcp / memory / agents / auth a esse runtime.
- Duas dessas dependências do dispatcher são de instância única vinculadas ao
  primário hoje: `workspaceRememberLane = new WorkspaceRememberTaskLane(primaryBridge)`
  (server.ts L816) e `archiveCoordinator = new SessionArchiveCoordinator()`
  (server.ts L596). `sessionShellCommandEnabled` é uma política global, segura
  para compartilhar.
- A verificação de consistência já existe: `parseRequestedWorkspace`
  (dispatch.ts L694-697) lança `WorkspaceMismatchError` quando o
  `workspaceCwd` de uma requisição não é igual a `this.boundWorkspace`; o erro
  mapeia para `INVALID_PARAMS` (L577).
- O `WorkspaceRuntime` (workspace-registry.ts L28-38) carrega
  `clientMcpSenderRegistry` por runtime, mas **não tem campo
  `deviceFlowRegistry`** — o device-flow ainda é global do app
  (`setupDeviceFlowRegistry({ app, bridge })` em server.ts L609, vinculado à
  bridge primária).

## Arquitetura: montagem ACP por runtime

Mantenha a Opção B: um daemon, N runtimes de workspace independentes. Para o
ACP:

- Cada runtime registrado recebe seu próprio `AcpDispatcher` +
  `ConnectionRegistry` + fábrica de provider de MCP reverso, todos vinculados
  à `bridge` / `workspace` / `routeFileSystemFactory` /
  `clientMcpSenderRegistry` / `env` desse runtime. Todo dispatcher recebe o
  mesmo registro de device-flow global do daemon.
- O `/acp` legado permanece vinculado ao dispatcher do runtime primário
  (comportamento de comunicação inalterado).
- O novo `/workspaces/:workspace/acp` vincula ao dispatcher do runtime
  resolvido.
- **Invariante: `mountAcpHttp` ainda é chamado exatamente uma vez** e instala
  exatamente um listener `httpServer.on('upgrade', ...)`. Ele muda de "bridge
  única + opts" para aceitar o `WorkspaceRegistry` (mais preocupações
  compartilhadas fora de workspace: token, allowedOrigins, hostname,
  `checkRate`, `sessionShellCommandEnabled`, `cdpTunnelRegistry`).
  Internamente ele constrói um `Map<workspaceId, RuntimeAcpMount>`; a entrada
  primária permanece endereçável pelo caminho `/acp` legado.
- Cada `RuntimeAcpMount` é construído com a própria `bridge`, `workspace`,
  `routeFileSystemFactory`, `clientMcpSenderRegistry`, `env` desse runtime,
  uma nova `WorkspaceRememberTaskLane(runtime.bridge)` por runtime, seu
  `AcpDispatcher` e seu `ConnectionRegistry`. O registro de device-flow global
  do daemon, o `archiveCoordinator` e o `sessionShellCommandEnabled` são
  compartilhados.
- Todos os quatro pontos de entrada de despacho devem selecionar a montagem do
  runtime resolvido, não a primária: `POST`, `GET` (SSE) e `DELETE` no caminho
  plural (Express, via `resolveWorkspaceRuntimeFromParam`; hoje cada um fecha
  sobre o dispatcher único em index.ts L533/L675/L849), mais o ramo de upgrade
  do WS (abaixo). O POST/GET/DELETE/upgrade do `/acp` legado continuam
  despachando para o primário.
- O `AcpHttpHandle` deve crescer de um `registry` único para ser dono do
  dispatcher + `ConnectionRegistry` de todos os runtimes; `dispose` fecha
  todos eles e remove o único listener de upgrade.
- Ciclo de vida de sessão: `session/new` / `load` / `resume` do ACP em uma
  montagem plural deve disparar os mesmos callbacks `register` / `remove` de
  ciclo de vida da bridge que alimentam o `WorkspaceSessionOwnerIndex` da Fase
  2b (workspace-registry.ts L48-119). Uma sessão criada via
  `/workspaces/B/acp` deve então ser descoberta por leituras REST roteadas por
  proprietário (context, stats, etc.) e vice-versa. A Fase 2b já dimensionou
  esse índice para cobrir "o REST e o posterior dispatcher ACP"; a Fase 4 é
  onde o lado ACP é realmente conectado.

## Despacho de upgrade de WebSocket (design central)

O listener de upgrade é o único lugar onde o roteamento ACP não é conduzido
pelo Express, então ele precisa de tratamento explícito de caminho.

- Mantenha as verificações de segurança compartilhadas (loopback / allowlist
  de hosts / CSRF / bearer) exatamente como estão, aplicadas uniformemente
  antes de qualquer resolução de workspace.
- Estenda a classificação de caminho. Hoje:
  `pathname === '/acp' | '/cdp' | extraRoute`. A Fase 4 adiciona um ramo para
  `/workspaces/:workspace/acp`:
  1. Casar o prefixo e extrair o segmento bruto do seletor `:workspace`.
  2. Resolver com a função pura
     `resolveRegisteredWorkspaceRuntimeByPathSelector(registry, decodeURIComponent(selector))`
     (id primeiro, depois cwd canônico codificado, correspondendo ao
     resolvedor REST).
  3. Sem correspondência: rejeitar o upgrade com um fechamento da classe 400
     (`socket.write('HTTP/1.1 400 ...')` + `destroy()`), espelhando o
     `workspace_mismatch` do REST. Sem fallback para o primário.
  4. Com correspondência: executar o handshake de inicialização ACP contra o
     dispatcher + `ConnectionRegistry` do runtime resolvido (não os
     primários).
- O `/cdp` reverso e os `extraWsRoutes` de voice permanecem vinculados ao
  primário na Fase 4 (voice é 4b). O ramo `/cdp` é inalterado.
- O upgrade do `/acp` legado continua vinculando ao dispatcher primário.
- `%2F` no seletor cwd codificado: o daemon faz o parse da própria URL bruta
  de upgrade (`new URL(req.url, ...)`), então não está sujeito à decodificação
  de caminho do Express, mas proxies reversos ainda podem normalizar `%2F`.
  Recomende o seletor baseado em `id` para WS em implantações com proxy
  (mesma orientação que o REST da Fase 2b/3). As rotas plurais HTTP, por sua
  vez, reutilizam `resolveWorkspaceRuntimeFromParam`, que lê `req.params` (o
  Express decodifica uma vez), então herdam o tratamento de seletor codificado
  da Fase 3 de graça.
- Observabilidade: o caminho de upgrade do WS e seu despacho ACP contornam o
  middleware do Express, então a telemetria/logging do daemon deve carimbar o
  workspace resolvido explicitamente aqui (a mesma razão pela qual `checkRate`
  é encadeado através de `opts`); o hashing de workspace em tempo de
  requisição da Fase 1 cobre apenas rotas Express.

## Registro de device-flow por runtime (substituído — veja "Retrabalho sistemático" eixo 4)

> **Substituído.** Esta seção é o design pré-retrabalho (um registro de
> device-flow por runtime). A revisão descobriu que ele deixava as montagens
> secundárias não autenticadas, então a implementação entregue, em vez disso,
> mantém um único registro global do daemon compartilhado por todas as
> montagens com fan-out de event-sink de melhor esforço — veja o eixo 4 do
> "Retrabalho sistemático" acima. As subseções abaixo são retidas apenas como
> contexto de histórico de design e não descrevem o comportamento entregue.

O device-flow é a única superfície espelhada que ainda é global do app e deve
mudar.

- Adicionar `deviceFlowRegistry` ao `WorkspaceRuntime` (ou construir um por
  runtime dentro de `mountAcpHttp`). O dispatcher de cada runtime recebe seu
  próprio registro.
- `setupDeviceFlowRegistry` deve ser invocado por runtime (vinculado à
  bridge/env desse runtime), não uma vez contra a bridge primária.
- As rotas/métodos de autenticação qualificados por workspace
  (`GET/DELETE /workspaces/:workspace/auth/device-flow/:id` e os métodos ACP
  `_qwen/workspace/auth/device_flow/*`) devem resolver o registro do runtime
  alvo e rejeitar/ocultar fluxos que pertencem a outro workspace.
- O desligamento deve descartar o registro de todos os runtimes, não apenas o
  `app.locals.deviceFlowRegistry`.
- Os callbacks de instalação do provedor de autenticação já têm escopo de
  `boundWorkspace` dentro do dispatcher; dispatchers por runtime tornam isso
  correto automaticamente. As rotas de autenticação primárias legadas
  continuam escrevendo no primário.

## Superfície espelhada do dispatcher (vinculação de runtime)

O WS `/acp` reverso espelha uma grande superfície REST (index.ts
`WS_READ_METHODS` L186-219 e métodos do fornecedor em dispatch.ts): leitura de
file/list/glob/stat, mcp / skills / providers / env / preflight / trust /
permissions / voice / tools / agents / memory / auth de workspace, grupos de
sessão, setup-github. Como todos esses leem os campos do construtor do
dispatcher, vincular um dispatcher a um runtime os delimita de graça. A Fase 4
**não** os reimplementa; ela apenas garante que o dispatcher de cada runtime
seja construído com as dependências desse runtime. Esse conjunto inclui
explicitamente o `deviceFlowRegistry` e a `WorkspaceRememberTaskLane` por
runtime: se qualquer um for deixado como o singleton primário, chamadas
`_qwen/workspace/memory/remember` e `auth/device_flow` não primárias
executariam silenciosamente contra a bridge primária.

Garantia de consistência: como cada dispatcher montado é vinculado a runtime e
`parseRequestedWorkspace` já lança `WorkspaceMismatchError` quando o
`workspaceCwd` de uma requisição difere de `boundWorkspace`, um cliente que se
conecta a `/workspaces/A/acp` mas envia `workspaceCwd: B` nos parâmetros é
rejeitado. A Fase 4 deve adicionar um teste afirmando isso, e confirmar que a
mesma guarda cobre `session/new` (`parseOptionalWorkspaceCwd`, dispatch.ts
L1059).

## Isolamento de MCP / CDP reversos

- Canal de ferramenta reverso: o `clientMcpProviderFactory` atualmente fecha
  sobre `primaryRuntime.clientMcpSenderRegistry` + `primaryBridge` (server.ts
  L1252-1257). Montagens por runtime constroem a fábrica a partir do
  `clientMcpSenderRegistry` + `bridge` _do runtime resolvido_, então uma
  conexão WS em `/workspaces/B/acp` registra servidores MCP hospedados pelo
  cliente apenas no runtime do B.
- `ClientMcpWsConnection` e `cdpEndpoint` por conexão permanecem por conexão;
  eles simplesmente se anexam ao dispatcher do runtime proprietário.
- Túnel CDP: `cdpTunnelRegistry` tem escopo de processo e a ponte CDP é
  reivindicada por uma conexão `/acp` de extensão cujo
  `clientInfo.name === 'qwen-cdp-bridge'`. A Fase 4 mantém a reivindicação de
  CDP no `/acp` legado (primário) como padrão pragmático; CDP com escopo de
  workspace é apontado como uma Pergunta em Aberto em vez de resolvido aqui,
  porque um único cliente puppeteer em loopback + um endpoint `/cdp` não
  mapeia limamente para N runtimes. Concretamente, `RuntimeAcpMount`s não
  primários devem deixar o ramo `cdpTunnelOverWs` / `/cdp` e o registro de
  runtime-MCP `chrome-devtools` desligados; apenas a montagem primária os
  conecta.

## Gate de confiança

- Workspaces registrados não confiáveis permanecem visíveis/somente leitura,
  mas não devem gerar um filho. Em `/workspaces/:workspace/acp`, as operações
  que concedem propriedade (`session/new`, `session/load`, `session/resume`;
  dispatch.ts `CONN_ROUTED_METHODS` L239-243) devem rejeitar com um erro
  `untrusted_workspace` e não gerar, correspondendo à semântica REST 403
  `untrusted_workspace` já implementada em `routes/session-runtime.ts`
  (L39-53) e `routes/session.ts` (gates de confiança de
  criar/carregar/retomar sessão mais `session_workspace_conflict`).
- Reutilize a decisão de confiança que a Fase 3 expõe via
  `requireTrustedWorkspaceRuntime` para as rotas HTTP ACP; para o caminho WS,
  a verificação equivalente roda na flag `trusted` do runtime resolvido antes
  que o handshake conceda uma sessão.
- Confiança congelada no boot é a baseline da Fase 2a; alternâncias de
  confiança em runtime (drenar/parar o filho ACP do workspace + limpar seu
  índice de sessões na revogação) permanecem alinhadas com qualquer fase de
  mutação de confiança que chegue, e não são reimplementadas aqui.

## Capabilities e seletor do Web Shell

- Adicionar uma feature flag de ACP (ex.: `workspace_qualified_acp`) em
  `packages/cli/src/serve/capabilities.ts` (declaração de flag + predicado de
  anúncio/alternância), anunciada apenas quando mais de um runtime está
  registrado e o ACP está habilitado (espelhe o gate de
  `multi_workspace_sessions` em capabilities.ts L408-409). Se a Fase 4 chegar
  em múltiplos PRs, não anuncie a tag até que o loop plural completo de ACP
  (HTTP + WS + device-flow + fiação do índice de proprietário) esteja
  completo, para que clientes nunca construam URLs `/workspaces/:id/acp`
  contra uma superfície meio conectada (mesma filosofia de guarda de
  habilitação parcial que o gate de funcionalidade da Fase 2a). Atualize a
  nota em `workspace_qualified_rest_core` (L264-271) que atualmente diz "ACP/
  WebSocket, auth, voice e extensions permanecem em suas rotas existentes de
  workspace primário nesta fase."
- Adicionar a tag não é local a `capabilities.ts`. Ela deve ser sincronizada
  com: o construtor de resposta de `/capabilities` em
  `routes/capabilities.ts`, os tipos de capability do SDK
  (`packages/sdk-typescript/src/daemon/types.ts`), os tipos de serve do CLI
  (`packages/cli/src/serve/types.ts`) e a asserção de conjunto de
  funcionalidades em `server.test.ts` (L376-381). Este é um trabalho exigido
  da Fase 4, não opcional.
- `workspaces[]` já existe (Fase 2a), construído em `routes/capabilities.ts`
  (L79-84) e `daemon-status.ts` (L432-437) com `id` / `cwd` / `primary` /
  `trusted` por runtime. O Web Shell o lê e constrói URLs de conexão
  `/workspaces/:id/acp`; o seletor desabilita (ou marca como somente leitura)
  entradas não confiáveis.
- O `DaemonClient` do SDK (adicionado na Fase 3) já lê
  `caps.workspaces[].cwd` para roteamento de sessão; um auxiliar de conexão
  ACP qualificado por workspace é a extensão natural. A sincronização de tipos
  de capability acima é exigida; o auxiliar de conexão em si pode vir depois.

## Caminhos de falha

- `workspace_mismatch`: seletor WS/HTTP desconhecido -> rejeição da classe
  400; nunca faça fallback para o primário.
- `untrusted_workspace`: operação ACP que concede propriedade em um runtime
  não confiável -> rejeição, sem spawn.
- Incompatibilidade de parâmetro `workspaceCwd`: `WorkspaceMismatchError` ->
  `INVALID_PARAMS` (já conectado).
- Crash de filho: isolado no runtime proprietário; dispatchers e conexões de
  outros runtimes não são afetados (raio de falha maior de daemon único é uma
  limitação conhecida documentada).
- Confiança revogada: quando uma fase de mutação de confiança chegar, revogar
  um runtime deve drenar/parar seu filho ACP e limpar seu índice de sessões; a
  Fase 4 apenas garante que a montagem ACP por runtime é drenável, ela não
  adiciona a mutação de confiança em si.
- Desligamento global: descartar o `ConnectionRegistry` de todos os runtimes,
  então descartar o único registro de device-flow global do daemon uma vez.
- Rate limiting: a admissão HTTP/WS do ACP usa `checkRate` com chave por
  conexão/sessão (index.ts L627-641, L1175-1178). As montagens plurais
  compartilham o único limitador; as chaves devem permanecer sem ambiguidade
  entre runtimes para que um workspace não possa esgotar ou contornar o
  orçamento de outro.
- Capacidade: `maxConnections` é aplicado por `ConnectionRegistry` de runtime,
  então o total de conexões ACP escala para N x `maxConnections` (um
  orçamento por workspace, correspondendo ao modelo `maxSessions` por
  workspace). O total de sessões frescas permanece limitado pela admissão
  `maxTotalSessions` da Fase 2a no ponto da bridge, pela qual a criação de
  sessão ACP já passa.

## Não objetivos (Fase 4b / 5)

- `/workspaces/:workspace/voice/stream` e configurações de voice por workspace
  (4b).
- Agrupamento / pidfile / status de workers de canal gerenciados pelo daemon
  (4b).
- Adição/remoção dinâmica de workspace e criação preguiçosa de runtime (5).

## Estratégia de testes

- Despacho de upgrade do WS: teste unitário da classificação de caminho —
  `/acp` (primário), `/workspaces/:id/acp` (resolvido), seletor desconhecido
  (rejeitar), seletor cwd codificado com `%2F` e que as verificações de
  segurança compartilhadas ainda rodam para o caminho plural.
- Isolamento entre workspaces: uma conexão em `/workspaces/A/acp` não pode ver
  nem conduzir uma sessão pertencente a B; `session/list` e leituras
  espelhadas retornam apenas a visão de A.
- Propriedade entre transportes: uma sessão criada via `/workspaces/B/acp` é
  resolvível por leituras REST roteadas por proprietário (ex.:
  `GET /session/:id/stats`) e por `resolveLiveSessionOwner`, confirmando que a
  criação ACP alimenta o índice de proprietário.
- Consistência: conectar a A, enviar `workspaceCwd: B` ->
  `WorkspaceMismatchError`.
- Gate de confiança: `session/new|load|resume` em um runtime não confiável ->
  rejeitado, nenhum filho gerado.
- Device-flow: toda montagem alcança o registro global do daemon; a publicação
  de eventos faz fan-out para as bridges primária e secundárias confiáveis,
  uma bridge falhando não bloqueia as outras, e o desligamento descarta o
  registro uma vez.
- MCP reverso: `mcp_register` em `/workspaces/B/acp` chega apenas ao
  `clientMcpSenderRegistry` e à bridge do B.
- Rate limiting: prompts/mutações em `/workspaces/A/acp` e
  `/workspaces/B/acp` são medidos independentemente e nenhum pode contornar o
  limitador compartilhado.
- Capabilities: `workspace_qualified_acp` anunciada apenas com mais de 1
  runtime; formato de `workspaces[]` inalterado.

## Perguntas em aberto / feedback para a Fase 3

1. **Mantenha `resolveRegisteredWorkspaceRuntimeByPathSelector` como função
   pura.** O listener de upgrade do WS não pode usar o
   `resolveWorkspaceRuntimeFromParam` vinculado ao Express. A Fase 4 depende
   do resolvedor puro permanecer livre de acoplamento com `req`/`res`. Se a
   revisão da Fase 3 mudar esse ponto, preserve um ponto de entrada puro
   `(registry, selector) => runtime | undefined`.
2. **Propriedade do device-flow (resolvido).** Mantenha o registro global do
   daemon porque credenciais OAuth são globais do processo. A Fase 4
   compartilha esse registro com todos os dispatchers e faz fan-out de eventos
   sanitizados para as bridges de runtimes confiáveis.
3. **Modelo de túnel CDP por workspace.** Um cliente puppeteer em loopback +
   um endpoint `/cdp` não mapeia limamente para N runtimes. A Fase 4 mantém o
   CDP no primário; confirme que isso é aceitável ou dimensione um
   acompanhamento de CDP qualificado por workspace.
4. **Adiamento do voice.** Confirme que o voice permanece apenas primário até
   a Fase 4b, mesmo que o dispatcher ACP já exponha leituras de
   `_qwen/workspace/voice`.
5. **Escopo do `archiveCoordinator`.** Ele é um único
   `SessionArchiveCoordinator` hoje (server.ts L596). Confirme que
   compartilhá-lo entre runtimes é seguro, dado o arquivamento/organização
   qualificado por workspace da Fase 3, ou torne-o por runtime.
6. **Dimensionamento de chave de rate-limit.** Decida se as chaves de admissão
   plurais do ACP precisam de uma dimensão explícita de workspace, ou se as
   chaves por conexão/sessão já são sem ambiguidade entre montagens.
