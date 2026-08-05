# Modelo de Capacidade do Daemon e Limites de Memória

## Contexto

A issue [#8051](https://github.com/QwenLM/qwen-code/issues/8051) observa que
o daemon limita workspaces registrados e sessões por contagem, e que limites
de contagem não são limites de memória. A
[#8091](https://github.com/QwenLM/qwen-code/issues/8091) propõe entregar a
correção como sete PRs, dos quais o
[#8093](https://github.com/QwenLM/qwen-code/pull/8093) é o primeiro: um
`ResourceBudget` de todo o processo sobre o heap JavaScript do processo raiz
do daemon, com quinze categorias de bytes, admissão atômica composta, leases
divisíveis e transferíveis, três agendadores justos com escopo de
`AsyncLocalStorage` e um modelo de cobrança por proxy de heap que precifica um
valor JavaScript em dois bytes por unidade de código de string, 96 bytes por
nó de objeto e 16 bytes por propriedade.

Este documento propõe uma decomposição diferente do mesmo problema. Ele
concorda com a premissa da #8051 e com o instinto da #8091 de entregar
incrementalmente. Discorda sobre qual processo detém a memória, qual
mecanismo pode limitá-la e qual mudança deve entrar primeiro.

As três constatações abaixo vêm da leitura do daemon como existe hoje.

### O daemon não é um processo

`ServeMode` é `http-bridge` (`packages/cli/src/serve/types.ts:18-35`): o
daemon pré-aquece um filho `qwen --acp` por runtime de workspace, e múltiplas
sessões em um runtime se multiplexam nesse filho através de
`connection.newSession()`. O daemon raiz canaliza NDJSON do ACP sobre HTTP e
SSE. O RSS por sessão de aproximadamente 30–50 MB — o número contra o qual
`maxSessions` é documentado em `types.ts:58-68` — é gasto dentro do filho,
não na raiz.

O RSS agregado dos filhos é, portanto, para onde vai a memória de regime
estável multi-workspace, e um orçamento de bytes sobre o heap da raiz não o
observa, não o limita e não o recusa.

Isso é um argumento contra um _livro-razão universal do heap da raiz como o
limite do daemon inteiro_, não contra proteção local da raiz. A raiz ainda é
dona da montagem de NDJSON do ACP, anéis de replay do EventBus, snapshots de
subagentes virtuais, carregamento de configurações, exportação de sessão
ativa, filas HTTP e WebSocket e caches com escopo de geração, e cada um
desses pode esgotá-la independentemente de qualquer filho. A Parte 3 abaixo é
inteiramente trabalho do lado da raiz exatamente por essa razão.

### O modelo de capacidade está desacoplado da memória do host

Três controles decidem quanta memória o daemon pode consumir. Cada um é
derivado independentemente, e nenhum código os reconcilia:

| Controle               | Derivação                                                   | Local                                                   |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Workspaces registrados | constante fixa `25`                                          | `packages/acp-bridge/src/channel-control-timeouts.ts:7` |
| Total de sessões       | `maxSessionsPerWorkspace × workspaceCount`                  | `packages/cli/src/serve/run-qwen-serve.ts:391`          |
| Heap V8 por filho      | `max(min(50% da memória do cgroup-ou-host, 16 GB), padrão do V8)` | `packages/acp-bridge/src/spawnChannel.ts:18-36`    |

O terceiro é o significativo. `getAcpMemoryArgs()` calcula um valor, armazena
em cache em uma variável de nível de módulo e aplica a **todo** filho gerado.
É uma fração do host, não uma cota de nada.

O termo `max(…, padrão do V8)` não é óbvio no código e importa duas vezes. O
flag é emitido apenas quando o alvo calculado excede o `heap_size_limit` do
**próprio daemon gerador** (`spawnChannel.ts:27-34`), então em hosts onde o
alvo é menor o flag é descartado e o filho herda silenciosamente o padrão do
V8 — que é ele próprio derivado da memória do host. Medido em um host de 3,4
GB: alvo 1747 MB, limite do daemon 1795 MB, flag descartado, teto do filho
1795 MB. Em um host de 32 GB o padrão é aproximadamente 4 GB, o alvo é 16384
MB e o flag é emitido.

Então o total permitido é 25 × 16 GB em um host de 32 GB e 25 × ~1,8 GB em um
host de 3,4 GB — um overcommit de aproximadamente doze vezes em qualquer dos
dois sentidos, e o único efeito do guard hoje é elevar um teto, nunca
rebaixar um. Essa última propriedade é a razão pela qual a mudança abaixo
deve contorná-lo explicitamente.

Nenhuma contabilidade de bytes no processo raiz muda nenhum desses números,
porque a raiz não é o processo que os aloca.

### O daemon mede memória mas não tem denominador

`DaemonMetricsRing` já amostra `rssBytes`, `heapUsedBytes`, `cpuPercent` e
`eventLoopLagP99Ms` a cada cinco segundos em um anel de 180 buckets, dando
quinze minutos de histórico, e já faz polling do RSS do filho ACP primário
com um guard single-flight e um penhasco de obsolescência de 30 segundos
(`packages/cli/src/serve/daemon-metrics-ring.ts`, conectado em
`run-qwen-serve.ts:4231-4377`). `GET /daemon/status` retorna tudo isso.

O que falta ao daemon é qualquer número pelo qual dividir. Não há leitura de
cgroup, nenhum `heap_size_limit`, nenhuma razão, nenhum nível de pressão,
nenhum código de issue derivado de memória, nenhum campo de memória
`limits.*` e nenhum flag de CLI em qualquer lugar do processo do daemon. O
`MemoryPressureMonitor` do core calcula tudo isso, mas
`computeEffectiveMemoryLimit()` é um método privado
(`packages/core/src/services/memoryPressureMonitor.ts:766`) em uma classe
construída apenas por `Config.initialize()`, que o daemon nunca chama. Filhos
de workspace secundário e todo worker de canal não reportam nenhum RSS.

O daemon consegue dizer quantos bytes está usando e não consegue dizer se
isso é muito.

## Problema

Enunciado precisamente: **o modelo de capacidade do daemon não tem relação
com a memória do host, e o daemon não consegue observar quão perto da
exaustão está.** Separada e independentemente, um pequeno conjunto enumerável
de contêineres do processo raiz é genuinamente ilimitado — qualquer um deles
pode esgotar a raiz sozinho, sem nenhum filho envolvido. Ambos são reais;
nenhum é razão para construir uma camada de contabilidade geral sobre cada
alocação.

## Objetivos

- Derivar os controles de capacidade de um único número de memória, para que o
  teto de heap de um filho seja uma cota de algo, em vez de uma fração do
  host repetida por filho.
- Dar ao daemon um denominador, para que a pressão seja observável antes de
  ser fatal.
- Limitar os contêineres que são genuinamente ilimitados, no contêiner.
- Limitar o _agregado_ de muitos contêineres individualmente limitados, onde
  a multiplicidade torna a soma o risco real.
- Manter cada mudança independentemente revisável e independentemente útil —
  e manter cada uma honesta sobre quais caminhos cobre.

## Não objetivos

- Nenhum livro-razão de bytes de todo o processo sobre o heap da raiz e nenhum
  modelo de cobrança por proxy de heap. Ver "Alternativas rejeitadas".
- Nenhuma remediação no trabalho de observação: sem GC forçado, sem evicção
  LRU, sem fechamento de sessão, sem término de processo.
- Nenhuma mudança no comportamento de memória do CLI interativo ou do
  acompanhante de IDE.
- Nenhuma _garantia_ de RSS ou de memória de árvore de processos. A Parte 1
  limita o espaço velho do V8 nos filhos ACP; Buffers, alocações nativas,
  workers de canal e descendentes de MCP estão fora dela.
- Nenhuma camada geral de agendamento agora. Admissão no momento do spawn
  está no caminho — é o que qualquer orçamento aplicável de filhos ao vivo
  exige — mas espera pelos dados da Parte 2, e as faixas de I/O pesado e de
  processos esperam por evidência de amplificação de concorrência. Ver
  "Alternativas rejeitadas".

## Princípio de design

**Torne o limite uma propriedade do contêiner, não uma promessa do
chamador.**

Uma reserva declarada pelo chamador vale apenas o que vale o chamador.
`runBufferedProcessOperation(scheduler, budget, cwd, operation, maximumBufferedBytes, task)`
do #8093 aceita uma contagem de bytes que o chamador afirma e nada reconcilia
com a saída real do processo; um chamador que declara 1 MB e emite 500 MB
deixa o livro-razão reportando saúde enquanto o heap cresce. Generalizar esse
padrão significa que cada um de várias centenas de pontos de alocação deve
lembrar de estimar, reservar e liberar em todo caminho, para sempre, sem
assistência do compilador. A cobertura será parcial. Cobertura parcial não é
inútil — é aceitável, e normal, quando status e capabilities nomeiam
exatamente quais caminhos estão protegidos, o que é uma disciplina que o
próprio plano de entrega do #8093 já impõe. O modo de falha é mais restrito
que "parcial": é anunciar uma garantia do daemon inteiro sobre uma
contabilidade incompleta, de modo que os caminhos contabilizados começam a
recusar trabalho com 503 enquanto os caminhos não contabilizados são os que
estão esgotando o heap.

Este princípio já é o estilo da casa, e o melhor trabalho deste repositório o
segue:

- `readTextRangeFromHandle` recebe dois orçamentos de bytes **obrigatórios**
  — `maxOutputBytes` para o que uma leitura retorna e `maxScanBytes` para o
  que ela custa — porque "um chamador recorre a um handle precisamente quando
  precisa que a leitura seja limitada"
  ([`2026-07-29-handle-bound-text-range-reads.md`](./2026-07-29-handle-bound-text-range-reads.md)).
  Ele verifica o acumulador a cada chunk, não a cada quadro, porque "uma
  região sem quebra de linha de outra forma o faria crescer até o arquivo
  inteiro estar residente"
  (`packages/core/src/utils/read-text-range.ts:350-353`).
- `packages/cli/src/serve/fs/policy.ts:33-62` separa truncamento suave
  (`enforceReadSize`) de rejeição dura (`enforceWriteSize`,
  `enforceReadBytesSize`), e dimensiona `MAX_WRITE_BYTES` deliberadamente
  abaixo do limite de corpo do Express para que um corpo que sobreviva ao
  parser sobreviva ao gate de política.
- A janela de replay limitada
  ([`2026-07-07-bounded-replay-snapshot-window.md`](./2026-07-07-bounded-replay-snapshot-window.md))
  limita o replay retido por bytes serializados, mantém ao menos uma unidade
  quando uma única unidade excede o teto e expõe a perda como um marcador
  explícito `history_truncated` em vez de truncar silenciosamente. Sua Nota
  de Auditoria da rodada 3 registra a lição diretamente: "Um teto de
  contagem de turnos não limita a memória quando um turno contém saída de
  ferramenta grande."

O trabalho abaixo generaliza esses. Não adiciona um segundo paradigma ao lado
deles.

## Design

### Parte 1 — Um orçamento, um denominador, reportado antes de ser aplicado

Resolva os números de memória do daemon uma vez e reporte-os. Nada os consome
para dimensionar um filho ainda, e essa contenção é o design, não uma
conveniência de faseamento.

```
availableMemoryMb        = limite do cgroup, senão os.totalmem()      (limitado ao total do host)
configuredBudgetMb  = --memory-budget-mb ?? floor(availableMemoryMb * 0.5)
effectiveBudgetMb   = min(configuredBudgetMb, availableMemoryMb)
rootReserveMb       = min(clamp(floor(effectiveBudgetMb * 0.1), 256, 1024), effectiveBudgetMb)
childPoolMb         = effectiveBudgetMb - rootReserveMb
legacyChildCeilingMb     = min(floor(availableMemoryMb * 0.5), 16384)     // o que um filho recebe hoje
insufficientMemory  = effectiveBudgetMb < 1024
```

Configurado e efetivo são separados porque divergem nas duas direções, e
fundí-los produz um denominador que a máquina não consegue sustentar. Um
orçamento explícito maior que o host é reduzido. Um orçamento derivado abaixo
do mínimo documentado **não** é elevado — um rascunho anterior fazia
exatamente isso, e um host de 768 MB consequentemente reportava um orçamento
de 1024 MB, o que teria envenenado toda razão que o trabalho de observação
pretende calcular. Um host pequeno demais é uma observação
(`insufficientMemory`), não uma licença para inventar capacidade.

`recommendedChildShareMb(budget, children)` é exportado e reportado tanto na
contagem de filhos registrados quanto na de filhos ao vivo. Nunca é aplicado.
A lacuna entre esses dois números é o propósito de reportá-los.

#### Por que a cota não é aplicada

Dividir o pool pela contagem de workspaces falha nos seus próprios termos, e
este documento propôs isso anteriormente:

- **Registro não é alocação.** Um runtime de workspace gera seu filho de forma
  lazy e `channelIdleTimeoutMs` tem como padrão `0` — "mata o canal
  imediatamente" (`packages/acp-bridge/src/bridgeOptions.ts:415-422`) — então
  um secundário dormente não tem filho. O primário pré-aquecido é a exceção.
- **Um divisor por contagem registrada tem um custo real e não compra nada.**
  Em um host de 32 GB com 25 workspaces registrados e apenas o primário
  pré-aquecido ao vivo, aquele filho cairia de um teto de 16384 MB para 614
  MB — um corte de 26,7× impulsionado por 24 registros que não detêm memória.
  Enquanto isso, o piso por filho significa que cotas divididas ainda somam
  além do pool: em um host de 8 GB, 25 filhos com piso de 512 MB autorizam
  12800 MB contra um pool de 3687 MB.
- **Registro dinâmico não deixa nenhuma contagem sólida.** Uma contagem no
  boot perde workspaces posteriores; recalcular não pode encolher o heap V8
  de um filho em execução; a contagem registrada atual penaliza workspaces
  dormentes. Dividir pelos filhos _ao vivo_ em vez disso ainda produz tetos
  que dependem da ordem de spawn, e ainda sem limite agregado.

O controle real é admissão no momento do spawn, indexada pelos filhos ao vivo
concorrentemente, com uma política declarada para o que acontece quando o
próximo filho excederia o pool. Isso precisa dos dados que a Parte 2 produz,
então é adiado em vez de adivinhado.

#### O que uma política de capacidade de filhos deve respeitar quando chegar

- **`--max-old-space-size` limita o espaço velho do V8, não o RSS.** Não
  cobre Buffers, alocações externas e nativas, a geração jovem, workers de
  canal, descendentes de MCP ou qualquer outro processo filho. Qualquer
  política aqui é uma _política de heap do filho_, nunca uma garantia de
  memória de árvore de processos, e a reserva da raiz é uma proteção em vez
  de uma contabilidade desses consumidores.
- **Aplicar uma cota é uma mudança de compatibilidade mesmo sem recusas**,
  porque altera comportamento de GC e OOM dos filhos. Não pode ser entregue
  como "apenas reporte".
- **Nunca deve elevar um teto.** Limitar a `legacyChildCeilingMb` é o que
  torna a política segura para aplicar incondicionalmente; sem isso, a
  constante de orçamento mínimo e um flag explícito grande demais inflam a
  cota.
- **O caminho de spawn tem uma armadilha.** `getAcpMemoryArgs()` emite
  `--max-old-space-size` apenas quando seu alvo calculado excede o
  `heap_size_limit` do _próprio daemon gerador_
  (`spawnChannel.ts:27-34`). Uma cota derivada de orçamento normalmente fica
  abaixo disso, então uma mudança ingênua é silenciosamente descartada e o
  overcommit retorna. O teste de regressão deve assertir que o flag sobrevive
  a um valor abaixo do limite do próprio processo de teste.

### Parte 2 — Observar, com um denominador, antes de aplicar

O amostrador existente de cinco segundos ganha o limite efetivo de memória,
`v8.getHeapStatistics().heap_size_limit`, e RSS agregado de filhos por
**todos** os filhos de workspace e workers de canal, em vez de apenas o
primário. O status ganha `runtime.memory { level, ratio, source }` e dois
códigos na união de issues fechadas em `daemon-status.ts:70-85`.

O flag de modo segue o idioma estabelecido de `--mcp-client-budget` /
`--mcp-budget-mode`: `off | warn | enforce`, com padrão `warn` quando um
orçamento está definido, com `enforce` rejeitado no boot até que uma mudança
posterior o mereça. Nada nesta parte remedeia.

Isso é deliberadamente promovido à frente do trabalho de teto de bytes. É a
única peça cujo valor não depende de o resto do design estar correto, e todo
limite escolhido depois deve ser calibrado contra seus dados em vez de
adivinhado. A tabela de limites do #8093 é um argumento mais fraco para esta
ordenação do que parece à primeira vista, e a forma mais fraca é a honesta:
`prompt: 384 MiB` é exatamente `normalAdmissionBytes` e, portanto,
redundante, mas as categorias de 256 MiB _não_ são mortas — uma única
categoria alcançando 256 MiB vincula bem antes de o uso normal total alcançar
o teto de 384 MiB. O problema com a tabela é simplesmente que as constantes
não são calibradas, que é o que a observação corrige.

### Parte 3 — Limitar os contêineres que são realmente ilimitados

Ordenado por risco medido, cada um independentemente entregável.

**O leitor de quadros NDJSON não tem limite de espécie alguma.**
`packages/acp-bridge/src/ndJsonStream.ts:35` declara `pending: Uint8Array[]`,
adiciona bytes finais não terminados em `:92` e nunca verifica uma contagem
ou um total de bytes. `takeLineBytes` (`:96-111`) então aloca uma cópia
contígua do total acumulado, `TextDecoder.decode` produz uma string UTF-16 de
aproximadamente o dobro disso, e `JSON.parse` constrói objetos novamente —
cerca de cinco vezes de amplificação sobre um quadro que não tem limite
superior. Este é o lado de leitura do stdout de todo filho ACP gerado, e
`packages/cli/src/serve/large-pipe-frame-observer.ts:10` apenas registra
quadros acima de 256 KiB. A correção é um teto de bytes de quadro verificado
a cada chunk, um erro fatal tipado em streams gerenciados pelo daemon e uma
estratégia de enfileiramento no `ReadableStream` de mensagens decodificadas
em `:33`, que nunca consulta `desiredSize` e é um segundo buffer ilimitado
atrás de um consumidor lento. `createStderrForwarder`
(`spawnChannel.ts:58-72`, 64 KiB com um marcador `[truncated]`) e o buffer de
log do worker de canal (`channel-worker-supervisor.ts:67-69`) são os modelos
no repositório.

**O anel de replay do EventBus limita apenas por contagem de quadros.**
`packages/acp-bridge/src/eventBus.ts:473` evicta quando
`ring.length > ringSize`, padrão 8000 quadros, por sessão, ajustável até um
milhão. Isso é conspícuo porque tudo ao redor do anel já é limitado por
bytes: filas por assinante em 2 MiB, rajada de replay em 8 MiB, journal em 8
MiB, replay compactado em 4 MiB. O anel é a lacuna, e multiplica os quadros
ilimitados acima por 8000. O tamanho serializado **já é calculado e está em
escopo** em `:459`, onde é entregue ao motor de compactação; aplicá-lo ao
anel é um total corrente, um loop de evicção sobre ambos os limites e a
garantia de reter ao menos um que o motor de compactação já implementa.

**Transcrições de subagentes virtuais são lidas inteiras.**
`packages/cli/src/serve/virtual-subagent-sessions.ts:331,385` chamam
`Buffer.alloc(size - this.offset)` com `this.offset === 0` na primeira
leitura, materializando a transcrição `.jsonl` inteira e, separadamente, o
sidecar `.stream` inteiro, então `.toString('utf8')`, então `.split('\n')`,
então um parse por linha. `createSnapshotOnce` (`:593-620`) constrói um
segundo alvo e relê a transcrição inteira, deixando duas a três cópias ao
vivo. O leitor paginado e o padrão de cursor de bytes já em andamento são a
substituição.

**Carregamento e exportação de sessão têm tetos assimétricos.**
`packages/cli/src/serve/server/session-export.ts:83-108` passa um teto de
bytes no ramo arquivado e chama `loadSession()` sem nenhum no ramo ativo — o
mesmo caminho sem teto usado pelo carregamento e resume do daemon. O teto de
arquivado é 256 MB de JSONL, que faz parse para um a dois gigabytes de
objetos, então nenhum dos ramos é um limite real.
`session-transcript-reader.ts` é o modelo correto e já está presente.

**Arquivos de configuração fornecidos pelo workspace são lidos sem gate de
tamanho.** `fs.readFileSync(path, 'utf-8')` no `.qwen/settings.json` do
workspace (`packages/cli/src/config/settings.ts:557,733`), pastas confiáveis,
o fast path do serve (síncrono, então também bloqueia o event loop) e todo
`QWEN.md` descoberto, vinte concorrentemente
(`packages/core/src/utils/memoryDiscovery.ts:225,245`). Registrar um
workspace contendo um `settings.json` de dois gigabytes esgota o daemon sem
sessão, sem prompt e sem agente — o ataque mais barato do conjunto, e o mais
distante de qualquer coisa que um livro-razão de heap notaria.

Registrados e adiados com evidência: cadeias de escrita SSE e WebSocket
respeitam backpressure mas não limitam bytes enfileirados
(`acp-http/sse-stream.ts:110-128`, `ws-stream.ts:58-82`); buffers de quadros
pré-anexação do ACP espelham o `maxQueued` do EventBus mas não seu
`maxQueuedBytes` (`connection-registry.ts:18,30`); a lista de sessões
organizada materializa 50.000 resumos; vários caches por workspace sobrevivem
ao seu workspace.

### Parte 4 — Pequenas quotas agregadas onde a multiplicidade importa

Limitar um contêiner limita um contêiner. Não limita _N_ deles, e o formato
do daemon é muitas coisas pequenas limitadas: 32 sessões por workspace, 25
workspaces, um journal de 8 MiB e um replay compactado de 4 MiB cada. Cada um
deles pode ficar dentro do seu limite documentado enquanto o total alcança
vários gigabytes. A Parte 3 sozinha, portanto, não produz um limite agregado,
e dizer o contrário repetiria o erro que este documento critica no #8093.

O que é necessário é restrito: contadores por workspace e de todo o processo
sobre anéis retidos, filas, caches e operações grandes concorrentes,
atualizados nos pontos reais de inserção e remoção. Duas propriedades impedem
que isso volte a ser o livro-razão do #8093 — ele conta os bytes que um
contêiner **realmente retém** em vez de um custo estimado de objeto V8, e é
mantido onde a estrutura de dados já muta em vez de em uma chamada de reserva
separada que todo chamador deve lembrar. O `maxQueuedBytes` existente por
assinante do `EventBus` é o formato a copiar; já está correto, apenas não
agregado.

Escopo e constantes para isso pertencem depois da Parte 2, pela mesma razão
que suas constantes.

### Helpers compartilhados, extraídos no segundo consumidor

`truncateUtf8` existe em duas cópias privadas. Um contêiner limitado por
contagem, bytes e TTL é implementado corretamente uma vez
(`session-transcript-reader.ts:148-150`) e aproximado em outros lugares. REST
e ACP mantêm dois mapeamentos escritos à mão sobre um conjunto compartilhado
de classes de erro, dos quais `FsError` (`fs/errors.ts:101`) é o único membro
carregando seu próprio status HTTP. Cada um vale a pena ser unificado quando
um segundo consumidor aparecer neste trabalho, e não antes.

## Alternativas rejeitadas

**Um livro-razão de bytes de todo o processo sobre o heap da raiz (o
`ResourceBudget` do #8093).** Ele orça a raiz, onde a memória não está; suas
constantes de proxy de heap não têm relação estável com o V8, que representa
strings como ropes, slices ou dados externos e precifica objetos por
compartilhamento de hidden-class, então o erro é um fator de dois a cinco em
qualquer direção; e suas categorias são globais em vez de por workspace,
então não entregam o isolamento de locatário que a #8051 pede. Seus próprios
padrões mostram a dificuldade de escolher números sem medição, como anotado
acima.

Duas propriedades de implementação confirmadas rodando o branch valem ser
registradas para que não sejam rederivadas depois. `ResourceBudget.release()`
e `ResourceBudgetLease.commitGrow()` são públicos e não validados, então uma
única chamada desgarrada torna `usedBytes` negativo e todo teto subsequente
silenciosamente para de vincular; e `grow()` aceita um lease pertencente a um
orçamento diferente, o que corrompe ambos. Separadamente,
`emergencyPoolBytes` se torna `0` sempre que `capBytes` é fornecido
(`resource-budget.ts:199-201`), então a reserva que existe para manter
possíveis respostas de shutdown e sobrecarga desaparece precisamente quando
um operador configura um orçamento — que é o que `--memory-budget-mb` faria.

**Uma nova camada de agendamento justo, como escrita
(`FairDaemonBulkScheduler` e suas faixas de spawn e de processo).** Todo
ponto quente enumerado acima é um problema de tamanho; nenhum é corrigido por
admitir menos operações concorrentes. Os primitivos de concorrência já
existem e estão em uso: `createFifoTaskQueue(limit)`
(`extension-operation-scheduler.ts:31`) com admissão FIFO, desenfileiramento
por `AbortSignal` e `runUntilReleased` para liberação antecipada de slot;
`PathMutexRegistry` para locks com chave; e
`createTotalSessionAdmissionController`
(`total-session-admission.ts:40-121`) para admissão por contagem com
liberação idempotente e erros tipados, que é o que fornece isolamento por
workspace hoje.

As faixas propostas também carregam defeitos que argumentam contra adotá-las
como fundação: o `AbortSignal` é aceito mas nunca encaminhado à tarefa, então
cancelar uma requisição a desenfileira apenas enquanto enfileirada e deixa um
processo filho em execução segurando seu slot; aquisição aninhada e
entre faixas são 503s duros propagados através de `AsyncLocalStorage` para
todo trabalho assíncrono herdado, o que falha na primeira vez que uma
operação em lote legitimamente precisar gerar um filho; e as faixas de spawn
e de processo definem o limite ativo por workspace igual ao limite global,
então um workspace pode ocupar todo slot. Este é um caso para adiar e
restringir o agendador, não para descartá-lo, e o rascunho anterior deste
documento o superestimou. Os primitivos existentes não são substitutos
completos: `createFifoTaskQueue` não tem limite de espera nem timeout,
`PathMutexRegistry` pode acumular uma cadeia de promises ilimitada, e
`createTotalSessionAdmissionController` limita contagens de sessão mas não
spawn de filhos, decodificação de filesystem ou processos externos. Mais
decisivamente, **qualquer orçamento aplicável de filhos ao vivo exige
admissão no momento do spawn** — que é precisamente uma faixa de agendamento.
Então a admissão de spawn está no caminho; as faixas de I/O pesado e de
processos devem esperar medições mostrando amplificação de concorrência ou
inanição entre workspaces, e se justiça por workspace for necessária,
round-robin com chave na fila existente são aproximadamente quarenta linhas
contra um primitivo testado.

**`AsyncLocalStorage` no caminho de requisição do daemon.** Não há nenhum
hoje em `packages/cli/src/serve` ou `packages/acp-bridge`. A atribuição de
workspace já flui explicitamente como `WorkspaceRequestContext.workspaceCwd`
(`workspace-service/types.ts:68-77`) e como `AuditContext` através do limite
do filesystem. Adicionar propagação implícita para carregar dados que já são
carregados explicitamente adiciona um mecanismo sem adicionar informação.

## Compatibilidade

Os caminhos do CLI interativo, acompanhante de IDE e bridge de embedding
direto são inalterados: eles geram um filho e mantêm o teto derivado do host.

A Parte 1 não muda nenhum argumento de spawn de filho, então não há mudança
em como qualquer filho é dimensionado, em qualquer host. O único novo
comportamento de boot é rejeitar um `--memory-budget-mb` fora do intervalo, e
uma trilha em stderr quando um orçamento é explicitamente definido ou o host
está abaixo do mínimo documentado.

A discussão de compatibilidade que pertence aqui é para a política de
capacidade de filhos que se segue, e é adiada junto com ela. O que pode ser
dito agora: aquela política vai rebaixar tetos e nunca deve elevá-los, será
uma mudança de compatibilidade mesmo sem recusas, e precisa de uma regra de
admissão para o caso em que um filho já em execução não pode ser encolhido.

Nenhuma nova recusa é introduzida. A única nova falha de boot é o formato de
validação existente para um `--memory-budget-mb` fora do intervalo. Registro
de workspace, restauração persistida e `POST /workspaces` são inalterados.

`maxSessions` e `maxTotalSessions` mantêm seus padrões e derivação atuais, e
esta mudança não lhes dá nenhum novo limite. Um rascunho anterior alegava que
`maxTotalSessions` era transitivamente limitado porque `workspaceCount` seria
limitado pelo orçamento; isso é falso contra este PR, onde o teto de
workspaces permanece o `MAX_REGISTERED_WORKSPACES = 25` fixo e nada deriva um
limite do orçamento. Sessões ainda se multiplexam em um filho por workspace,
então a memória por sessão fica dentro de um heap de filho que nada limita
atualmente além do próprio teto do V8. A documentação de `maxSessions` deve
ser lida como um controle de justiça e descritores de arquivo, não de
memória.

`limits.memory` e `runtime.memory` em `GET /daemon/status` são aditivos e
opcionais no espelho do SDK, então daemons mais antigos fazem parse contra
clientes mais novos.

Workers de canal geram `process.execPath` por workspace sem argumentos de
memória (`channel-worker-supervisor.ts:823`). Eles são consumidores reais da
memória da árvore do daemon e não são cobertos pelo teto por filho; a reserva
da raiz nominalmente os cobre, e a Parte 2 os mede.

## Plano de verificação

- Testar unitariamente a aritmética de orçamento em hosts restritos e não
  restritos com o número do host injetado, incluindo o piso por filho, o teto
  de 16 GB, o clamp sentinela do cgroup e a monotonicidade da cota por filho
  na contagem de filhos.
- Testar por regressão que um teto derivado de orçamento é emitido mesmo
  quando fica abaixo do limite de heap do próprio daemon gerador.
  `getAcpMemoryArgs()` atualmente emite `--max-old-space-size` apenas quando
  o alvo calculado excede o limite atual; um valor derivado de orçamento
  normalmente é menor, então uma mudança ingênua descartaria silenciosamente
  o flag e restauraria o overcommit. Este é o teste mais importante da
  primeira mudança.
- Assertir que o orçamento efetivo nunca excede a memória resolvida do host,
  em qualquer direção: um orçamento explícito acima do host é reduzido, e um
  host abaixo do mínimo documentado reporta `insufficientMemory` em vez de
  ser elevado. Assertir que a cota consultiva nunca excede
  `legacyChildCeilingMb` em tamanhos de host de 768 MB a 32 GB.
- Assertir que nenhum argumento de spawn de filho muda: as suítes de spawn
  existentes passam sem modificação, e `getAcpMemoryArgs` fica intocado neste
  estágio.
- Ponta a ponta: iniciar com vários valores de `--workspace` e ler
  `GET /daemon/status`; `limits.memory` deve descrever o host honestamente e
  `runtime.memory` deve mostrar `activeAcpChildren` abaixo de
  `registeredWorkspaces` quando um workspace ficar ocioso — a observação que
  justifica indexar a política posterior pelos filhos ao vivo.
- Para a Parte 2, assertir uma razão finita sob cgroup v2, cgroup v1 e
  nenhum; assertir a classificação de nível; assertir que nenhum caminho de
  remediação existe; confirmar que o RSS agregado de filhos inclui workspaces
  secundários e workers de canal. Então rodar o daemon sob uso real e ler o
  resultado — esses dados calibram a Parte 3.
- Para cada mudança da Parte 3, o teste de aceitação é um antes-e-depois
  contra uma entrada real acima do tamanho: um único quadro NDJSON de vários
  gigabytes, um anel de 8000 quadros de eventos grandes, um `settings.json`
  de dois gigabytes. O daemon deve recusar com um erro tipado enquanto o RSS
  permanece plano, onde hoje ele cresce até o processo morrer. Essa evidência
  é o ponto: um teste de que um livro-razão é internamente consistente não é
  um teste de que a memória é limitada.
- `npm run build`, `npm run typecheck` e `npm run lint` em toda mudança, mais
  as suítes colocalizadas dos arquivos tocados.
