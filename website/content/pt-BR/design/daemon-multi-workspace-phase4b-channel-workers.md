# Fase 4b Multi-Workspace do Daemon: Workers de Canal por Workspace

## Resumo

Este documento projeta a fatia de workers de canal da Fase 4b da issue #6378:
agrupar workers de canal gerenciados pelo daemon por workspace. Voice
(`/workspaces/:workspace/voice/stream`) é uma fatia separada da Fase 4b e está
fora do escopo aqui.

Hoje `qwen serve --channel <nome>` inicia um único worker de canal vinculado
ao workspace primário. No modo multi-workspace, o worker deve ser agrupado
pelo workspace que possui cada canal: cada workspace registrado e confiável
recebe seu próprio processo de worker vinculado ao cwd, a
`QWEN_DAEMON_WORKSPACE` e ao overlay de env efetivo desse workspace. O pidfile
e o status do daemon ganham uma lista de workers aditiva, preservando os
campos existentes de worker único. `--channel all` permanece somente primário
na v1. O comportamento de workspace único é inalterado.

Modelo de mapeamento: canais são agrupados **implicitamente pelo seu cwd
resolvido** — um canal pertence ao workspace registrado para o qual seu cwd
configurado resolve. Nenhuma nova sintaxe de CLI é adicionada.

## Baseline: ponto de integração atual do worker de canal

- `run-qwen-serve.ts` cria um `ChannelWorkerSupervisor` no callback de listen
  (vinculado a `boundWorkspace`, o primário) e o inicia em
  `completeRuntimeStartup`. `completeRuntimeStartup` é o único ponto de
  convergência entre todos os caminhos de inicialização de runtime (o caminho
  imediato de `deps.bridge` e o caminho `startRuntime` -> `buildRuntime`).
  `deps.bridge` é restrito a um único workspace, então o multi-workspace
  sempre flui através de `startRuntime`.
- `commands/channel/daemon-worker.ts` valida seu próprio workspace contra
  `capabilities.workspaceCwd` (o primário), então um worker não primário lança
  exceção. `validateChannelWorkspaces` adicionalmente exige que o cwd
  resolvido de cada canal seja igual ao workspace do daemon.
- `config-utils.ts` resolve o cwd de um canal como
  `resolvePath(rawConfig.cwd || defaultCwd)`; `loadChannelsConfig(W)` retorna
  `loadSettings(W).merged.channels`, que mescla os escopos
  sistema/usuário/workspace.
- `channel-worker-supervisor.ts` constrói o env do worker a partir de
  `{...process.env}`. No modo multi-workspace, o env pai é o env base do
  daemon (isolamento de env da Fase 2a), então ele perderia o próprio `.env`
  do workspace.
- O `ServiceInfo` do pidfile é de worker único (`channels[] / servePid? /
  workerPid?`); o `runtime.channelWorker` do status do daemon é um snapshot
  único.
- O registro de workspaces (construído dentro de `buildRuntime`) expõe o
  `env.effectiveEnv`, o `trusted` e o `workspaceCwd` canônico de cada runtime.
  O roteamento de sessões da Fase 2a/3 já mira um runtime por `workspaceCwd`.

## Algoritmo de agrupamento

Uma função pura `resolveChannelWorkspaceGroups` espelha o
`validateChannelWorkspaces` do lado do worker e a resolução de cwd do
`config-utils` — caso contrário, o agrupamento da camada serve e a própria
validação do worker poderiam divergir. Como `loadChannelsConfig(W)` é mesclado
entre escopos, a propriedade não pode ser decidida por "qual configuração
mesclada de workspace contém o nome".

Para cada `nome` de canal selecionado, itere pelos workspaces registrados `W`.
Se `nome` está em `loadChannelsConfig(W)`, calcule
`resolvedCwd = canonicalizeWorkspace(resolvePath(cfg[name].cwd ?? W))`. `W` é
um proprietário candidato **se e somente se `resolvedCwd === W`** (ou seja, o
canal passaria em `validateChannelWorkspaces` sob `W`):

- `cwd` explícito = um caminho registrado X: apenas `W === X` satisfaz ->
  proprietário = X (sem ambiguidade).
- sem `cwd`, definido apenas no próprio escopo de um workspace
  (`/B/.qwen/settings.json`): aparece apenas na configuração mesclada de B e
  resolve para B -> proprietário = B (sem ambiguidade).
- sem `cwd`, definido no escopo de usuário/sistema: satisfeito sob todo W ->
  múltiplos proprietários -> genuinamente ambíguo.
- `cwd` explícito = um caminho não registrado: nenhum W satisfaz -> zero
  proprietários.

Erros e agregação:

- zero proprietários -> `channel_workspace_mismatch` (não configurado, ou o
  cwd aponta para um workspace não registrado).
- mais de um proprietário -> `ambiguous_channel_workspace` (um canal de escopo
  usuário/sistema sem `cwd`; o operador deve delimitá-lo a um workspace ou
  adicionar um `cwd` explícito).
- proprietário não confiável -> `untrusted_workspace` (um canal precisa criar
  sessões).
- proprietário confiável único -> agrupar nomes por proprietário -> cada grupo
  recebe `{mode:'names', names}`.
- `mode:'all'` -> somente primário:
  `[{ workspaceCwd: primário, selection: {mode:'all'} }]`. O worker primário
  carrega os canais mesclados do primário; entradas cujo cwd não é o primário
  mantêm o comportamento de erro existente de
  `validateChannelWorkspaces`.
- workspace único (apenas primário): `resolvedCwd` só pode ser o primário,
  produzindo exatamente o mesmo grupo único de hoje.

Um auxiliar de cwd compartilhado é usado pelo parsing de configuração e pelo
agrupamento de propriedade. Caminhos absolutos explícitos e `~/...` mantêm seu
significado existente; caminhos relativos comuns resolvem contra o workspace
cujas configurações estão sendo carregadas. O caminho do proprietário é então
canonicalizado, para que a camada serve e o worker não possam divergir sobre a
propriedade.

## Identidade e env do worker

`CreateChannelWorkerSupervisorOptions` ganha um `workerBaseEnv` opcional
(padrão `process.env`). `createWorkerEnv` usa `workerBaseEnv ?? process.env`
como base; todo o resto é inalterado (`QWEN_DAEMON_WORKSPACE`, limpeza de env
de token, injeção de token do daemon). O gerenciador de grupo passa
`runtime.env.effectiveEnv ?? process.env` — ler o campo diretamente evita
importar um auxiliar privado de `server.ts`, e um runtime em modo de processo
pai (workspace único) tem `effectiveEnv` indefinido, fazendo fallback para
`process.env` exatamente como hoje.

## Correção de validação do daemon-worker

`DaemonCapabilitiesLike` ganha um
`workspaces?: Array<{ cwd; id; primary; trusted }>` opcional (já publicado por
`/capabilities` desde a Fase 2a). A validação resolve
`daemonWorkspace = canonicalizeWorkspace(opts.workspace)`; quando
`capabilities.workspaces` está presente, ele deve corresponder a um deles e
ser confiável, caso contrário faz fallback para a verificação legada
`== capabilities.workspaceCwd` para daemons antigos de workspace único. Ambos
os lados são canônicos (o supervisor passa `runtime.workspaceCwd`), então a
comparação é estável. O restante do worker (carregamento de configuração de
canal, `validateChannelWorkspaces`, `createOrAttach({workspaceCwd})`) já
funciona com o roteamento multi-workspace.

## Gerenciador de grupo do supervisor

Um `ChannelWorkerGroup` fino é dono de
`Map<workspaceId, ChannelWorkerSupervisor>`:

- construído a partir dos grupos resolvidos e do registro; cada supervisor é
  vinculado ao `workspaceCwd`, à seleção e ao `env.effectiveEnv` do seu
  runtime, e é criado através da mesma fábrica injetável que o worker único
  usa.
- `start()` inicia supervisores sequencialmente e faz rollback dos já
  iniciados se uma inicialização posterior falhar. `stop()` aguarda qualquer
  reinício em andamento e para todos os supervisores. `killAllSync()`
  permanece o fallback do handler de sinal.
- `restart()` é a transação de reload de todo o daemon. Requisições
  concorrentes coalescem; supervisores reiniciam sequencialmente, e qualquer
  falha para o grupo inteiro para evitar uma frota parcialmente recarregada.
- `snapshots()` retorna snapshots por workspace
  (`ChannelWorkerSnapshot & { workspaceId; workspaceCwd; primary }`);
  `primarySnapshot()` apoia os campos legados de worker único.
- `onReady` / `onExit` de qualquer supervisor dispara uma reescrita completa
  do pidfile a partir de `snapshots()` (nunca uma atualização incremental de
  entrada única — veja abaixo).

## Esquema do pidfile e concorrência

`ServiceInfo` ganha um
`workers?: Array<{ workspaceId?; workspaceCwd?; channels: string[]; workerPid? }>`
opcional. O `channels` de nível superior vira a união dos canais de todos os
workers, e o `workerPid` de nível superior permanece o pid do worker primário,
então leitores antigos (`qwen channel status`, que lê apenas `workerPid` e
`channels`) não são afetados.

Concorrência: com N workers, os callbacks `onReady`/`onExit` disparam
concorrentemente. Uma leitura-modificação-escrita de uma única entrada
perderia atualizações. Em vez disso, o escritor obtém o conjunto completo de
snapshots do grupo e realiza uma única reescrita completa síncrona.
`writeServeServiceInfo` usa `openSync`/`writeSync` síncronos sem `await`,
então uma escrita de snapshot completo é atômica o suficiente — a última
escrita sempre mantém o quadro completo. `writeServeServiceInfo` ganha um
parâmetro `workers` opcional escrito literalmente sob a guarda existente de
`O_RDWR + O_NOFOLLOW` + propriedade do serve; `parseServiceInfo` valida
`workers?` opcionalmente e o repassa.

## Esquema do status do daemon

`DaemonStatusRuntime` ganha um
`channelWorkers?: Array<ChannelWorkerSnapshot & { workspaceId; workspaceCwd; primary }>`
opcional; o `channelWorker` obrigatório permanece como o snapshot do grupo
primário para clientes antigos. O getter (`getChannelWorkerSnapshots`) é
encadeado de `run-qwen-serve` através de `ServeAppDeps` e
`BuildDaemonStatusOptions`, espelhando o caminho existente
`getChannelWorkerSnapshot`, e também é exposto no status de bootstrap. Antes
que o grupo seja criado (pré-inicialização), ele reporta o snapshot de
desabilitado.

## Orquestração e tempo

- A variável única `channelWorker` vira uma referência de gerenciador de grupo
  no escopo externo, para que o escritor do pidfile e os caminhos de
  desligamento ainda a vejam.
- Fail-fast precoce: no momento do listen (antes de `buildRuntime`), a função
  pura de agrupamento roda uma vez contra `workspaceInputs` + `loadSettings` +
  confiança congelada no boot (`getWorkspaceTrustStatus`). Propriedade de cwd
  desconhecida, ambígua, não confiável e inválida rejeita a inicialização
  antes que um handle utilizável seja exposto. O plano de grupo resolvido é
  congelado para o restante da inicialização; configurações não são
  reagrupadas depois sob um snapshot diferente do sistema de arquivos.
- A criação/inicialização real se move para `completeRuntimeStartup`: ele lê o
  registro de `runtimeApp.locals.workspaceRegistry` (garantidamente presente
  para multi-workspace, que sempre flui através de `startRuntime` ->
  `buildRuntime`), constrói um supervisor por grupo congelado e os inicia —
  substituindo o único `channelWorker.start()`.
- O app de runtime recém-construído é publicado e anexado aos transportes ACP
  antes que os supervisores de canal iniciem. Workers exigem a rota
  `/capabilities` do runtime durante o bootstrap e podem receber tráfego de
  canal assim que conectam, então suas rotas de sessão do daemon já devem
  estar disponíveis. Isso corresponde ao ordenamento existente de workspace
  único no `main`; `runtimeReady` ainda é liquidado apenas depois que todos os
  supervisores solicitados alcançam pronto.
- Uma falha de inicialização de worker de canal permanece fatal. A publicação
  do runtime é retirada antes que o grupo, o pidfile, as bridges e o listener
  sejam desmontados; um timeout de inicialização de runtime durante a fase do
  worker segue o mesmo caminho em vez de deixar um daemon em escuta para
  trás. O cancelamento do grupo também previne que um supervisor de workspace
  posterior seja iniciado depois que esse teardown começa.
- A reserva do pidfile mantém os nomes agregados de canais; os caminhos de
  desligamento (`stopChannelWorkerAfterFailedStartup`, `killAllSync`,
  desligamento normal) fazem fan-out para o grupo.

Risco de regressão: para um único workspace, o tempo de criação se move do
callback de listen para `completeRuntimeStartup`. Os testes de canal
existentes em `run-qwen-serve.test.ts` (fábrica injetada, pidfile-no-ready,
force-kill de segundo sinal) devem permanecer verdes. A cobertura de
orquestração multi-workspace também sonda a rota `/capabilities` do daemon ao
vivo a partir da inicialização do supervisor, para que o ordenamento
runtime/worker não possa regredir atrás de uma fábrica injetada somente de
ready.

## Comportamento de boot

- workspace único: idêntico a hoje.
- multi-workspace + `--channel names`: agrupado por proprietário, um worker
  por workspace confiável; zero / múltiplos proprietários / não confiável ->
  um erro de boot claro (sem habilitação parcial).
- multi-workspace + `--channel all`: apenas worker primário, com uma nota no
  stderr de que canais não primários não são hospedados.

## Compatibilidade e limitações

- workspace único é inalterado; leitores antigos de pidfile/status mantêm
  `channels`/`workerPid`/`channelWorker`.
- orientação ao operador: para hospedar um canal em um workspace não primário,
  defina-o no próprio `.qwen/settings.json` desse workspace (sem necessidade
  de `cwd`) ou defina-o em qualquer escopo com um `cwd` explícito igual ao
  caminho do workspace. Um canal de escopo usuário/sistema sem `cwd` deve ser
  desambiguado no modo multi-workspace ou o daemon dá erro de boot.
- limitações da v1: canais ambíguos/com o mesmo nome precisam de uma sintaxe
  explícita futura; `--channel all` é somente primário; o raio de falha de
  daemon único cobre os workers de todos os workspaces; um token de daemon
  cobre todos os workspaces.

## Perguntas em aberto

- Canais ambíguos deveriam ser resolvíveis via uma sintaxe explícita
  `--channel <workspace>:<nome>` em vez de erro de boot?
- `--channel all` deveria eventualmente fazer fan-out por todos os workspaces?

## Fora do escopo

- voice `/workspaces/:workspace/voice/stream` e voice por workspace.
- adição/remoção dinâmica de workspace (Fase 5).
