# Execução de plano de sessão comum

## Objetivo

Exibir o plano de Todo de uma sessão comum como um grafo de dependências e
conectar cada nó às execuções de Agent que o implementam. Reutilizar o stream
de plano ACP existente, o snapshot de tarefas de sessão e a sessão de
detalhes de subagente existentes.

Este recurso é observacional. Ele não agenda, retenta, desbloqueia ou completa
trabalho.

## Contrato de dados

`todo_write` aceita IDs de Todo opcionais em `blockedBy`. O runtime valida que
os IDs são únicos, que as referências existem, que as dependências não são
duplicadas ou autorreferenciadas e que o grafo é acíclico.

O sidecar de Todo armazena um `planId` gerado pelo runtime com o snapshot
atual. O ID permanece estável enquanto um plano ativo é revisado. Limpar um
plano, ou iniciar trabalho não vazio depois que o plano anterior completou,
inicia um novo plano.

Exibições de resultado de Todo carregam o `planId`, então a projeção ACP ao
vivo e o caminho de replay de transcrição comum preservam os mesmos metadados
de plano:

- atualização de plano `_meta.qwenTodoPlan.id`: identidade estável do plano
- atualização de plano `_meta.qwenTranscript.planToolCallId`: chamada de
  ferramenta Todo de origem
- entrada de plano `_meta.qwenTodo.id`: ID original do Todo
- entrada de plano `_meta.qwenTodo.blockedBy`: IDs de dependências quando
  presentes

Clientes que ignoram `_meta` continuam a receber entradas de plano ACP
padrão.

A ferramenta Agent aceita `todo_id` opcional. É uma orientação, não um gate de
runtime: chamadas de Agent de nível superior devem fornecê-lo quando um grafo
de Todo ativo existe. O `AgentTask.toolUseId` existente junta a chamada de
ferramenta Agent ao status de tarefa ao vivo, então a API de tarefas não
precisa de nenhum campo adicional.

## Fluxo de UI

O pill de Todo ativo continua a renderizar a lista compacta existente. Clicar
nele abre o diálogo Tasks existente. Quando metadados de plano estão
presentes, esse diálogo adiciona uma seção nativa CSS de execução de plano
acima da árvore de tarefas existente:

1. Agrupar nós topologicamente em camadas a partir de `blockedBy`.
2. Agrupar chamadas de ferramenta Agent de nível superior por `args.todo_id`.
3. Juntar linhas de tarefa ao vivo por `task.toolUseId === tool.callId`.
4. Manter linhas de Agent aninhadas sob a raiz via `parentAgentId`.
5. Selecionar um nó de fluxo de trabalho para inspecionar seu conteúdo
   completo de Todo, status, dependências e execuções de Agent vinculadas
   abaixo do grafo.
6. Abrir o painel existente de detalhes de subagente ao vivo a partir de uma
   execução de Agent vinculada; ele permanece a fonte para progresso em
   streaming, chamadas de ferramenta e saída final.
7. Colocar vínculos `todo_id` ausentes ou desconhecidos em um grupo Não
   atribuído.

Nenhuma biblioteca de grafos é adicionada. Planos sem metadados de dependência
mantêm a apresentação em lista.

## Aprovação do Plan Mode

O Plan Mode é o gate de execução opt-in para usuários que querem revisar um
fluxo de trabalho antes que o trabalho comece. Quando `exit_plan_mode`
solicita permissão, o Web Shell mostra o corpo de plano ACP autoritativo
seguido pelo fluxo de trabalho de Todo ativo no painel de aprovação existente.
A visão de Todo é suplementar porque seu snapshot pode diferir do texto de
plano submetido. Um fluxo de trabalho ciente de dependências é renderizado
como o mesmo DAG usado pelo diálogo Tasks; um fluxo de trabalho sem
dependências mantém a apresentação em lista.

O ciclo de vida de permissão existente permanece autoritativo: aprovar sai do
Plan Mode e inicia a execução, enquanto rejeitar mantém a sessão no Plan
Mode. Se não há snapshot de Todo ativo, a aprovação mantém sua apresentação
existente somente de texto usando o corpo de plano carregado pelo ACP. Sessões
que não entram no Plan Mode permanecem inalteradas.

## Composição de status

O status de Todo permanece a fonte de verdade de negócio. O estado de Agent é
uma sobreposição de execução:

1. Qualquer execução vinculada em execução: Em execução
2. Caso contrário, qualquer execução vinculada pausada: Pausado
3. Todo completado: Completado
4. Qualquer Todo de dependência incompleto: Bloqueado
5. Todo em andamento: Em andamento
6. Caso contrário: Pronto

Uma execução com falha ou cancelada adiciona um selo de atenção necessária sem
alterar o status do Todo.

## Compatibilidade e limites

- Snapshots antigos de Todo sem IDs ou dependências permanecem legíveis.
- Chamadas de Agent sem `todo_id` permanecem válidas.
- Snapshots de Todo vazios devem limpar o estado ativo imediatamente.
- Resultados completos de subagente ficam fora da resposta de polling de
  tarefas de três segundos.
- Nós de Todo não inventam saída de etapa; detalhes de execução vêm das
  chamadas de ferramenta Agent vinculadas e da sessão de detalhes de
  subagente existente.
- Aplicação estrita de plano primeiro para toda sessão permanece fora de
  escopo porque uma verificação de existência no nível da sessão poderia
  aceitar um plano obsoleto.
