# Contexto de Todo Ativo

## Problema

O `todo_write` apresenta a lista atual como um lembrete apenas no seu próprio
resultado de ferramenta. Após mais chamadas de ferramenta, esse lembrete perde
proeminência e o modelo pode encerrar o turno com itens não concluídos. O
arquivo de todo persistido não é adequado como estado de controle ao vivo
porque pode sobreviver à cadeia de trabalho que o criou.

## Design

Após um `todo_write` bem-sucedido, manter um lembrete contendo apenas itens
não concluídos sob um dono estável da cadeia de trabalho. IDs de prompt usados
por retries e turnos automáticos relacionados resolvem para esse dono, então
ramos de notificação concorrentes não movem nem sobrescrevem o lembrete de
primeiro plano. Tarefas em segundo plano e wakeups de loop capturam o dono
quando são criados e o carregam de volta com seu turno automático; turnos de
cron e notificação não relacionados usam um dono isolado que é removido quando
o turno termina. Injetar o lembrete na primeira requisição de um retry ou
turno automático relacionado e após respostas de função em turnos de
ferramenta posteriores. Limpá-lo quando todos os todos forem concluídos, uma
nova cadeia de trabalho ordinária começar ou a sessão mudar.

Toda cópia injetada é gravada permanentemente no histórico de chat, então a
injeção por turno cresceria o contexto ao vivo linearmente com os turnos de
ferramenta. A injeção em turno de ferramenta, portanto, reemite o lembrete
apenas a cada terceiro turno de ferramenta desde a última vez que o estado foi
apresentado (o próprio resultado do `todo_write` conta); injeções no início do
turno sempre disparam e redefinem essa cadência. O payload é uma lista
compacta de linhas `- [status] content` limitada a 800 caracteres. O
histórico permanece append-only, então o cache de prefixo do provedor não é
afetado.

Isso não muda a semântica de parada nem habilita o `todoStopGuard`. O guard
permanece uma recuperação limitada opcional depois que o modelo já tentou
parar; esta mudança, em vez disso, preserva o contexto da tarefa antes dessa
decisão.

## Verificação

- Uma gravação bem-sucedida com itens não concluídos atualiza o lembrete da
  sessão.
- Uma lista concluída o limpa.
- Mensagens de resultado de ferramenta do Core e do ACP anexam o lembrete após
  os resultados de função.
- A entrada de usuário no meio do turno do ACP permanece por último e,
  portanto, mantém precedência.
- Um novo prompt ordinário limpa o estado obsoleto enquanto retry/continue o
  retém.
- Turnos automáticos independentes são isolados; turnos automáticos
  relacionados herdam.
- Turnos automáticos finais liberam seu estado de posse temporária.
