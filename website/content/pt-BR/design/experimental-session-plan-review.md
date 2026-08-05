# Plan & Review de Sessão Experimental

## Objetivo

Tornar a visualização de Workflow de sessão comum opt-in e permitir que os
usuários revisem o grafo exato de dependências de Todo antes da execução.
Reutilizar o Modo Plan, snapshots de Todo e o ciclo de vida de permissão
existente.

## Lançamento

`experimental.sessionWorkflow` é desabilitado por padrão. Quando desabilitado, o
Web Shell mantém o comportamento existente da lista de Todo e do Modo Plan, mas
não renderiza o DAG do Workflow nem renomeia o Modo Plan. A configuração altera
apenas a apresentação; ela não registra ferramentas, não altera a semântica de
Todo nem cria outro modo de aprovação.

Quando habilitado, o modo `plan` existente é apresentado como **Plan & Review**. O
Modo Plan permanece como o gate de execução: investigação somente leitura é
permitida, ferramentas de mutação permanecem bloqueadas, rejeitar
`exit_plan_mode` permanece no Modo Plan e aprovar sai do Modo Plan.

## Entrega

### Fase 1: apresentação opt-in

- Expor a configuração desabilitada por padrão por meio da rota existente de
  configurações de workspace do daemon.
- Ler a configuração efetiva do workspace ativo do Web Shell e aplicá-la
  consistentemente ao seu chat principal, painéis divididos e painéis de tarefa
  lateral.
- Manter a renderização da lista de Todo inalterada enquanto controla com gate as
  entradas do DAG do Workflow.
- Renomear a entrada de Plan existente apenas enquanto a configuração está
  habilitada.

### Fase 2: aprovação vinculada à revisão

- No Plan & Review, exigir um snapshot de execução de Todo estruturado cujos nós
  permanecem pendentes antes da aprovação.
- Carregar a identidade do plano de Todo e a identidade da chamada de ferramenta
  de origem com a requisição de aprovação de `exit_plan_mode`.
- Resolver o DAG de aprovação a partir dessa identidade em vez da lista de Todo
  ativa mais recente.
- Reutilizar a linhagem de ID de plano existente para que snapshots posteriores e
  execuções de Agente continuem atualizando o mesmo Workflow sem outro
  armazenamento.
- Fazer fallback para a aprovação existente apenas de texto quando nenhum snapshot
  correspondente está disponível.

## Limites

O Workflow permanece observacional. Ele não agenda dependências, não faz retry de
Agentes, não propaga conclusão nem adiciona um armazenamento de Workflow.
`blockedBy` e `todo_id` permanecem opcionais para sessões fora do Plan & Review.
