# Aprovação Explícita de Saída do Plan

## Problema

`exit_plan_mode` anteriormente misturava aprovação e execução. Seu callback de
confirmação alterava o `ApprovalMode` antes que hooks e execução fossem
concluídos, e sessões AUTO/YOLO podiam contornar o usuário por meio de um Gate de
Aprovação de Plan por LLM. Regras de permissão (allow) do gerenciador de
permissões, hooks de permissão e autoaprovação de irmão também podiam satisfazer
uma decisão `ask` sem uma resposta real de host/usuário. Isso tornava uma chamada
de ferramenta originada do modelo capaz de tentar sair do modo Plan sem uma decisão
do usuário e criava notificações de modo enganosas quando a execução posterior
falhava.

## Design

Invocações de ferramenta podem declarar `requiresUserInteraction()`. Este é um
requisito intrínseco de interação, não outro nível de permissão: negações
intrínsecas ou do gerenciador de permissões ainda vencem, enquanto regras de
permissão (allow) e modos de aprovação automática não podem satisfazê-lo. O
`exit_plan_mode` da sessão principal declara o requisito. Teammates que exigem plan
mantêm seu caminho de aprovação do líder, e subagentes comuns mantêm a rejeição
existente de ferramenta de ciclo de vida.

O callback de confirmação de plan registra apenas uma das quatro decisões:
restaurar o modo pré-plan, alternar para auto-edit, alternar para padrão ou
cancelar. Ele nunca altera o modo. Criar a confirmação congela o texto do plan, o
modo pré-plan e a revisão atual do modo de aprovação. `execute()` verifica se a
aprovação existe, se o sinal está ativo, se a sessão ainda está no modo Plan e se a
revisão ainda corresponde antes de aplicar a transição de modo sincronicamente.
Isso faz saídas obsoletas, reentrantes e concorrentes fazerem fail closed. A
persistência do plan acontece em melhor esforço apenas após a transição ter
sucesso.

`Config` possui uma revisão monotônica do modo de aprovação que incrementa apenas
quando o modo realmente muda. Overrides do modo de aprovação possuem revisões
independentes. O argumento opcional existente do setter `enteredByModel` permanece
temporariamente como um parâmetro de compatibilidade ignorado; a origem do modelo
não tem efeito sobre a aprovação.

O Gate de Aprovação de Plan por LLM e seu acoplamento de metadados AskUserQuestion
são removidos. `prePlanMode` permanece porque é uma escolha de saída visível ao
usuário. `originalRequest` e `researchSummary` permanecem para revisão do líder de
teammates que exigem plan. `resolutionSummary` permanece apenas como uma
propriedade de entrada TypeScript descontinuada para compatibilidade de origem e
não é mais aceita pelo esquema de runtime.

## Comportamento do host

Confirmação de CLI e IDE, `requestPermission` do ACP e respostas de permissão
(allow) de `can_use_tool` do stream-json contam como interação explícita. Hooks de
permissão (allow) do PermissionRequest, regras de permissão (allow) do PM,
YOLO/AUTO/AUTO_EDIT e autoaprovação de irmão não contam. Decisões de negação de
hook permanecem autoritativas. Chamadores não interativos sem um host capaz de
aprovação fazem fail closed.

O ACP não envia nenhuma atualização de modo quando a permissão está pendente ou
quando confirmação, hooks, execução ou a transição falham. Após execução
bem-sucedida do ciclo de vida do plan e uma mudança real de modo, ele envia uma
atualização usando o modo lido de `Config`. Falha de notificação legada é
informativa e o canal lateral da extensão ainda é tentado com um valor preciso de
`legacyFrameSent`.

## Comportamento de falha

- Chamadas fora do modo Plan falham com segurança com orientação de estado
  acionável em qualquer fronteira que observe a mudança de modo. `execute()`
  retorna um erro de orientação quando a sessão está fora do modo Plan e não há
  snapshot de aprovação. `getConfirmationDetails()` lança a mesma orientação quando
  chamado fora do modo Plan (ex.: via uma regra `ask` do PM ou uma alternância de
  Plan para não Plan entre a avaliação de permissão e a construção da confirmação).
  A permissão padrão é `allow` — este é um problema de estado, não um problema de
  segurança.
- Resultados de confirmação inválidos, cancelamento, aborts, revisões obsoletas e
  falhas de transição deixam o modo Plan ativo.
- Duas saídas aprovadas contra a mesma revisão não podem ambas ter sucesso.
- Se um host ACP não pode apresentar `switch_mode`, o modo Plan permanece ativo e o
  erro direciona o usuário ao seletor de modo do host ou `/plan exit`.
- Salvar um plan já aprovado é em melhor esforço e não faz rollback de uma
  transição de modo bem-sucedida.

## Compatibilidade e escopo

Esta alteração intencionalmente não amplia a execução geral de shell no modo Plan e
não adiciona ferramentas de leitura específicas do DataWorks. Essas são alterações
separadas de permissão/ferramental. O método público de invocação é opcional com
padrão `false`, então ferramentas existentes e implementações externas permanecem
compatíveis.
