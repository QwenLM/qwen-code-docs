# Endurecimento do Todo Stop Guard do Daemon

## Contexto

O Todo Stop Guard do daemon pode anexar uma continuação limitada após um turno do
modelo deixar itens de Todo confiáveis inacabados. A bridge pode admitir outro
prompt do usuário enquanto o turno atual está drenando, e agentes em segundo
plano, monitores, notificações e tarefas cron podem ser concluídos ao mesmo tempo.
O Guard não deve ultrapassar o trabalho de usuário admitido, reviver trabalho de
outro workspace ou prompt, ou perder conteúdo de usuário e de ferramenta quando um
envio automático falha.

## Propriedade da continuação

`craft/claimTodoStopGuardContinuation` é a fronteira de ordenação entre uma fila
de prompts da bridge e uma continuação do Guard. A requisição contém o ID da
sessão e, para um prompt de propriedade da bridge, o `InvocationContextV1.promptId`
confiável injetado pela bridge. IDs de prompt do provedor locais da sessão não são
proprietários.

Para um prompt de propriedade da bridge, o daemon reivindica apenas enquanto esse
prompt ainda é a entrada em execução ativa e não abortada. Um prompt enfileirado
ativo produz `{ claimed: false, hasQueuedPrompt: true }` e vincula a espera ao ID
do prompt proprietário atual. Um proprietário ausente, substituído ou concorrente
faz fail closed sem alterar o estado de outro proprietário. Um turno automático
sem proprietário só pode reivindicar quando não existe nenhum prompt ativo da
bridge.

Canais e o agente compartilhado do desktop não têm o FIFO do daemon. Eles validam
a sessão atual e retornam uma reivindicação bem-sucedida para ela; sessões
desconhecidas e handlers de fallback sem proprietário fazem fail closed. Clientes
que não implementam o método, respostas malformadas e o prazo de reivindicação de
dois segundos desabilitam apenas a porção do Guard de uma continuação; um hook de
Stop externo que bloqueia independentemente ainda pode continuar. Um prompt FIFO
ativo confirmado, em vez disso, encerra o turno antigo imediatamente, sem exibir
ou contar a resposta do hook agora obsoleta.

`craft/todoStopGuardQueueReleased` carrega o ID do prompt proprietário do Guard.
Uma liberação tardia só pode limpar a espera correspondente. A promoção FIFO
também limpa a espera com escopo de proprietário porque o prompt de usuário
enfileirado assumiu a propriedade. A sessão também rastreia reivindicações em
andamento: se a liberação correspondente for processada antes da continuação da
resposta da reivindicação, ela registra um tombstone de vida curta, aplica o
estado de liberação terminal e se recusa a instalar uma espera a partir da
resposta obsoleta. O tombstone é removido quando a última reivindicação em
andamento para esse proprietário é liquidada.

## Ordenação de envio e preservação

O campo `hasQueuedPrompt` do resultado do dreno é uma dica. Uma dica positiva é
confirmada por uma reivindicação: uma fila ainda ativa cede o turno, enquanto uma
fila desaparecida permite que o processamento do Stop continue. Se o mesmo dreno
também removeu conteúdo de usuário do meio do turno, ceder armazena esse conteúdo
no histórico de chat antes que o prompt enfileirado seja executado, para que a
fronteira de ordenação não se torne uma fronteira de perda de dados. Um dreno com
falha ou malformado dá prioridade ao conteúdo de usuário recuperado quando tal
conteúdo existe; caso contrário, ele suspende rigidamente o Guard sem suprimir um
hook de Stop externo independente.

Antes de um stream de modelo atribuído ao Guard, a Sessão drena a entrada,
constrói partes de imagem, seleciona o modelo de visão de turno completo,
atualiza o modo PLAN e o estado de segundo plano, atualiza a decisão do Guard e
reivindica a continuação. A compressão, as verificações de limite de tokens e o
envio ao provedor acontecem apenas após essa reivindicação. Cada stream adicional
do Guard reivindica separadamente. Um prompt admitido antes da reivindicação
vence; um admitido após a reivindicação é ordenado após a continuação já
confirmada.

Se a preparação, compressão, reivindicação, validação de limite de tokens, criação
de stream ou o envio ao provedor falhar, a instrução do Guard não enviada é
removida antes da preservação do histórico. Partes de usuário drenadas, respostas
de função bem-sucedidas e outro conteúdo de Stop independente permanecem. A Sessão
compara o contador de push de conteúdo de usuário antes de adicionar o histórico,
para que uma camada inferior que já persistiu o conteúdo não possa causar uma
duplicata.

## Suspensão rígida

A suspensão rígida é iniciada após o esgotamento do Guard, disposição explícita da
sessão, início da realocação do diretório de trabalho, uma liberação terminal de
prompt enfileirado, um dreno não confiável sem entrada de usuário recuperada e
caminhos de cancelamento ou falha controlados que não podem continuar a cadeia com
segurança. Ela limpa a propriedade enfileirada existente e bloqueia escritas
tardias de Todo de rearmar a cadeia antiga. Uma observação FIFO completa em
corrida com a suspensão ainda pode estabelecer prioridade de ordenação de prompt
para seu proprietário, mas essa prioridade não restaura a confiança do Guard nem
permite um envio do Guard.

Apenas um novo prompt comum inicia uma nova cadeia. Um retry confiável pode
retomar uma cadeia pausada por retry, mas resultados de segundo plano, turnos de
cron, turnos de notificação, atualizações de configurações e conclusões tardias de
ferramenta não podem limpar a suspensão rígida. Entrar no modo PLAN limpa a
confiança do Guard e impede a continuação automática.

## Linhagem de segundo plano

A Sessão captura um baseline de segundo plano no início de cada cadeia de trabalho
e redefine o baseline e o conjunto explícito de agentes relacionados juntos.

- Um agente de nível superior recém-criado é relacionado.
- Um novo filho herda recursivamente de seu pai. Pais ausentes e ciclos fazem fail
  closed.
- Um agente de baseline não é relacionado a menos que a cadeia o continue com
  sucesso via `send_message(task_id)`.
- `send_message(task_id)` marca provisoriamente o alvo após as verificações de
  permissão e `PreToolUse`, mas antes da execução, de modo que uma notificação de
  conclusão rápida seja classificada corretamente. O sucesso confirma antes do
  `PostToolUse`; erro, cancelamento ou exceção reverte apenas a marca introduzida
  por aquela chamada.
- `send_message(to)` endereçado à equipe não altera a linhagem da tarefa.
- Um monitor com proprietário herda a relação do proprietário independentemente da
  associação do próprio monitor ao baseline. Um monitor sem proprietário usa seu
  ID de monitor.

A relação de notificação é armazenada no momento do enfileiramento, para que
exclusão posterior do registro ou mudanças de status não possam reclassificar um
resultado já entregue. Varreduras ativas, seleção de prioridade e proteção de
overflow usam as mesmas regras de linhagem. Iniciar um novo prompt comum redefine
intencionalmente todas as notificações já na fila para não relacionadas: esses
resultados foram enfileirados antes da nova fronteira de cadeia de trabalho e não
podem herdar a classificação de sua cadeia anterior.

## Ciclo de vida da sessão e filas limitadas

`/cd` valida e canoniciza o alvo antes de adquirir o gate de fechamento de sessão
existente. Um aparente no-op também adquire o gate e reverifica o diretório atual,
de modo que não possa entrar em corrida com uma realocação concorrente; ele não
suspende rigidamente o Guard a menos que se torne uma movimentação real. Uma vez
que uma movimentação é controlada pelo gate, ela suspende rigidamente o Guard,
aguarda os turnos de primeiro plano, cron e notificação se estabilizarem, realoca,
atualiza o contexto do modelo e libera o gate em `finally`. A admissão de prompt
verifica o gate tanto antes quanto depois da admissão do gravador. O loop de
estabilização reverifica a propriedade após cada conclusão, de modo que um prompt
admitido antes do gate enquanto esperava por seu predecessor seja incluído também.
Falha de realocação deixa o Guard antigo suspenso.

`dispose()` permanece síncrono, mas aborta o controlador de primeiro plano com um
motivo dedicado de cancelamento controlado, suspende rigidamente o Guard e impede
que resultados tardios de ferramenta o revivam. Os caminhos de fechamento de
produção mantêm a responsabilidade de aguardar até que os turnos se estabilizem.

No carregamento ou retomada de sessão persistida, o replay de histórico, a
restauração de worktree, a restauração de agentes pausados e a restauração de goal
são todos concluídos antes que o rewriter e o agendador de cron durável iniciem.
Isso impede que um disparo de cron imediatamente vencido entre em corrida com a
restauração e classifique um agente pausado preexistente como novo trabalho da
cadeia retomada.

O overflow de cron adiado é calculado após a deduplicação. Um item de entrada
relacionado pode reter vinte itens não relacionados; um item de entrada não
relacionado primeiro reduz para dezenove e se torna o vigésimo. Entradas
relacionadas nunca são descartadas, e uma redução de múltiplas entradas emite um
único diagnóstico.

O caso da fila de notificação em que todas as entradas limitadas são relacionadas
permanece adiado. Substituir um único resultado relacionado por outro ainda seria
perda silenciosa de dados. Um design subsequente deve fornecer um resultado
recuperável ou uma notificação de lacuna durável, visível ao modelo e ao usuário,
para cada resultado relacionado omitido. Acompanhe esse trabalho em
[#7805](https://github.com/QwenLM/qwen-code/issues/7805).
