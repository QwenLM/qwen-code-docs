# Todo Stop Guard do Daemon

## Problema

Clientes do daemon e ACP podem manter uma sessão ativa após um turno do modelo
terminar. Quando o modelo acabou de escrever uma lista de Todo de nível superior
inacabada, uma parada natural do modelo pode deixar a requisição do daemon
incompleta mesmo que a sessão tenha estado confiável suficiente para continuar. O
cliente atualmente não tem uma maneira limitada e integrada de distinguir esse caso
de um turno comum concluído.

Este design adiciona um guard de parada opt-in exclusivo do daemon. Ele
deliberadamente não altera a TUI, a ferramenta Todo do Core ou o loop geral do
agente.

## Configuração e fronteira de segurança

`experimental.todoStopGuard` tem padrão `false`, exige uma reinicialização e não é
mostrado no diálogo de configurações da TUI. O guard é forçado a desligado no modo
seguro, no modo bare e no modo `plan` de Aprovação. `disableAllHooks` não
desabilita o guard integrado porque ele não é um hook externo.

Cada estágio ininterrupto de continuação automática pode criar no máximo dois
streams extras do modelo primário. Uma mensagem de usuário no meio do turno inicia
explicitamente um novo estágio de duas tentativas porque é uma nova entrada de
usuário, enquanto retry/continue e resultados de segundo plano retêm o orçamento do
estágio atual. Verificações de permissão existentes, cancelamento, limites de
tokens, proteção de loop, períodos de graça do ACP e limites de recursos do daemon
permanecem autoritativos. Em particular, um cliente desconectado nunca implica
aprovação de permissão.

## Estado confiável

A `Session` da CLI possui uma pequena máquina de estados `DaemonTodoStopGuard` em
memória. Ela armazena se a cadeia de trabalho atual está armada, a contagem mais
recente de itens inacabados, tentativas de continuação confirmadas, estado de
suspensão/prompt enfileirado e se o esgotamento já foi reportado. A Sessão faz
separadamente um snapshot dos IDs de agentes em segundo plano, shells, monitores e
wakeups no início de uma cadeia de trabalho, incluindo notificações terminais e
wakeups já enfileirados naquela fronteira.

Apenas um resultado de nível superior bem-sucedido de `TodoWriteTool.execute()` com
o envelope estruturado `{ type: 'todo_list', todos: [...] }` pode armar o guard. A
observação acontece após a execução da ferramenta e o cálculo de status, antes dos
hooks `PostToolUse` da Sessão. Argumentos, histórico reproduzido, estado de disco,
chamadas de ferramenta com falha ou duplicadas, listas de Todo de subagente e
ferramentas descobertas que sombreiam o nome de wire `todo_write` não são
confiáveis. O resultado bem-sucedido mais recente substitui a contagem; uma lista
vazia ou totalmente concluída desarma o guard imediatamente. Desarmar impede outra
continuação de parada natural; não trunca um loop de ferramenta já aberto por um
stream do Guard confirmado.

Um novo prompt de usuário comum inicia uma cadeia de trabalho desarmada e redefine
seu baseline de segundo plano. Ele não pode herdar ativação de uma requisição
anterior mesmo que o estado de Todo permaneça em memória. Retry/continue confiável
mantém a cadeia de trabalho apenas enquanto o estado do Guard inacabado confiável
ainda existe; após um evento de ciclo de vida que limpa a confiança, ele inicia com
um novo baseline de segundo plano e deve armar novamente. Uma mensagem de usuário
no meio do turno mantém sua ativação e inicia um novo estágio de duas tentativas.
Isso significa que o limite rígido é dois streams automáticos consecutivos sem nova
entrada de usuário, não dois streams ao longo de toda a vida de uma cadeia de
trabalho. Turnos de cron e notificação podem estabelecer sua própria cadeia por
meio de uma escrita de Todo de nível superior bem-sucedida; quando processam
resultados de segundo plano para uma cadeia armada, eles retêm o orçamento daquela
cadeia. Um resultado de segundo plano relacionado também é uma continuação confiável
que limpa uma pausa de retry de API/rede sem limpar uma suspensão rígida.

O guard não é persistido. Rewind e restauração de histórico limpam a confiança,
assim como branch/fork, uma mudança bem-sucedida de diretório de trabalho, uma nova
Sessão, restauração de disco e reinicialização de daemon ou agente. Uma anexação de
cliente ativo à mesma Sessão mantém o estado em memória; mudar modelos ou modos de
aprovação diferentes de Plan não inicia por si só uma nova cadeia de trabalho. Uma
invalidação de ciclo de vida também bloqueia resultados tardios de ferramenta do
turno ativo substituído de rearmar o guard; o próximo prompt independente ou turno
automático estabelece uma nova fronteira. Filas automáticas adiadas são liberadas
assim que um prompt de primeiro plano invalidado se estabiliza, incluindo quando
esse prompt sai por um caminho de erro.

## Ordenação de parada

O guard participa apenas em uma parada natural do modelo. Quando está ativo, a
Sessão aplica esta ordem:

1. Drena mensagens de usuário do meio do turno. Se alguma existir, pula os hooks de
   Stop e o guard, redefine o orçamento do guard e executa a continuação do usuário
   no loop atual.
2. Se o FIFO do daemon contém um prompt completo e não abortado, termina a
   requisição atual e marca a cadeia antiga como aguardando aquele prompt. Uma
   requisição enfileirada cancelada não pode posteriormente deixar a atividade de
   segundo plano reviver a cadeia antiga. Quando o último prompt enfileirado é
   abortado, a bridge diz explicitamente à Sessão ativa para encerrar o guard em
   espera e liberar filas automáticas não relacionadas. Se um dreno observa tanto
   uma mensagem do meio do turno quanto um prompt completo enfileirado, a mensagem
   do meio do turno é executada primeiro e a prioridade FIFO permanece em vigor
   mesmo se aquela continuação completar a lista de Todo ou parar rigidamente o
   guard.
3. Em turnos de primeiro plano, avalia os hooks de Stop externos existentes com seu
   limite e semântica de erro existentes.
4. Avalia o guard apenas quando ele está armado, não suspenso ou aguardando um
   prompt enfileirado, tem itens inacabados, está fora do `plan` de Aprovação e não
   tem entrada de segundo plano relevante.
5. Se tanto um hook externo quanto o guard bloqueiam a mesma parada, combina seus
   motivos em uma única chamada de modelo de continuação. Seus contadores
   permanecem independentes.

Entrada de segundo plano relevante é um agente em segundo plano, shell, monitor ou
`@wakeup` ainda ativo cujo ID não estava no baseline da cadeia de trabalho, mais
notificações ou wakeups enfileirados com a mesma relação. Trabalho de segundo plano
e tarefas cron comuns herdadas de uma requisição mais antiga não bloqueiam uma nova
requisição. Turnos automáticos de cron/notificação executam apenas o guard
integrado; eles não introduzem chamadas de hook de Stop externo. Um resultado
relacionado retém o orçamento atual, enquanto uma notificação de tarefa antiga ou
turno de cron comum é atrasado até que a cadeia ativa não possa mais retomar, então
inicia uma cadeia independente desarmada. Disparos de cron recorrentes adiados não
relacionados são coalescidos por tarefa e limitados para que uma dependência de
segundo plano travada não possa crescer a fila sem limite. Sugestões de
acompanhamento do daemon também são suprimidas enquanto uma cadeia do Guard ainda
pode retomar ou um prompt FIFO completo tem prioridade, de modo que trabalho
inacabado não dispare uma chamada concorrente de modelo de sugestão.

Caminhos terminais rígidos suspendem a cadeia de trabalho atual: cancelamento de
usuário ou permissão, `PostToolUse.shouldStop`, proteção de loop ou chamada
repetida, limites de tokens e o limite de hook de Stop externo. Erros de API e rede
preservam o estado para um retry/continue confiável explícito.

## Continuações e observabilidade

A primeira continuação do guard envia:

> [Todo Stop Guard] N item(ns) de todo ainda estão pendentes ou em andamento. Continue executando a tarefa atual agora. Não pergunte ao usuário se deve continuar. Se o progresso exigir entrada do usuário, use o fluxo de pergunta estruturada ou permissão. Se o progresso depender de estado externo, reporte o bloqueador explicitamente.

A segunda também envia:

> Esta é a continuação automática final. Antes de terminar, complete/atualize os todos ou reporte o progresso concluído e o bloqueador exato.

O contador é confirmado apenas após `responseStream` ser retornado com sucesso.
Cancelamento, falha de compactação ou rejeição de tokens antes desse ponto não
consome uma tentativa; uma falha de stream posterior consome. Texto de bloqueador em
formato livre não é analisado. Uma falha de compactação suspende aquela cadeia do
guard para que não possa deixar filas automáticas bloqueadas atrás de um retry
inalcançável; quando um hook de Stop externo foi coalescido, seu motivo ainda pode
continuar sob a semântica existente do hook. O orçamento conta cada stream do
modelo primário atribuível ao guard, incluindo um acompanhamento que envia
resultados de ferramenta do stream do guard precedente. Se o segundo stream retorna
mais chamadas de ferramenta, a Sessão executa e preserva seus resultados mas não
abre um terceiro stream atribuível ao guard. Se o primeiro stream completa todos os
Todos por meio de uma chamada de ferramenta, a tentativa restante pode enviar o
resultado da ferramenta sem outro prompt de Todo inacabado para que o modelo possa
terminar sua resposta. A entrada do meio do turno patrocina esse envio de resultado
de ferramenta em vez disso e tem prioridade sem consumir a tentativa restante do
Guard. Quando aquele stream foi coalescido com um hook de Stop externo, o loop de
ferramenta existente do hook ainda pode enviar esses resultados sem outro prompt do
Guard ou tentativa do Guard; habilitar o Guard não deve truncar uma continuação de
hook externo.

Cada continuação confirmada emite um `agent_message_chunk` discreto reproduzível em
replay com `_meta.source = 'todo_stop_guard'` e a tentativa, contagem máxima de
tentativas e contagem de inacabados. O esgotamento emite similarmente:

> [Todo Stop Guard] Continuação automática interrompida após 2 tentativas; N item(ns) de todo permanecem inacabados.

O texto do Todo nunca é incluído na telemetria do guard. Metadados de uso normais
ainda contabilizam as chamadas adicionais. A compactação de replay preserva eventos
do Guard que carregam tanto `qwenDiscreteMessage` quanto a fonte do Guard
independentemente, de modo que não mescla tentativas nem descarta seus metadados
por tentativa após o anel de eventos ativo rolar.

## Compatibilidade da bridge

`craft/drainMidTurnQueue` adiciona `hasQueuedPrompt` opcional. A bridge o define
apenas quando sua lista de prompts pendentes contém uma entrada completa cujo estado
é `queued` e cujo sinal de abort não está abortado. Clientes Desktop/canal mais
antigos podem omitir o campo; a Sessão trata a omissão como `false`. Se o dreno
atinge o timeout, respostas tardias podem restaurar conteúdos de mensagem, mas seu
snapshot de prompt enfileirado é descartado porque pode já estar obsoleto.

O comportamento de desconexão REST/SSE e o anel de eventos permanecem inalterados.
ACP HTTP retém seu período de graça de dez segundos existente e caminho de replay;
expiração de graça e fechamento/cancelamento explícito mantêm seu comportamento de
término atual.

## Verificação

Testes unitários cobrem ativação estrita, redefinições de ciclo de vida, suspensão,
orçamento e semântica de confirmação de stream, relatório de fila da bridge, gates
de configuração, coalescência de hook de Stop e caminhos terminais. Testes de
concorrência cobrem prioridade FIFO de prompt, recuperação de dreno tardio,
isolamento de baseline de segundo plano e turnos automáticos. Testes E2E do daemon
cobrem admissão de prompt sem um assinante SSE e replay posterior do anel das
tentativas limitadas. Regressões de transporte ACP existentes cobrem reconexão
dentro da janela de graça, expiração de graça e idas e vindas de permissão; o plano
E2E manual também exercita esses caminhos com o guard armado. Com a configuração
desabilitada, o comportamento existente de hook de Stop, cron, notificação e prompt
deve permanecer inalterado.
