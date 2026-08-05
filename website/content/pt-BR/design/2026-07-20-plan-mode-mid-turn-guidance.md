# Orientação no meio do turno e limite de entrada do modo Plan

## Problema

`enter_plan_mode` muda o modo de aprovação enquanto um turno do modelo ainda
está sendo processado. Antes desta mudança, uma invocação bem-sucedida retornava
apenas uma frase curta, então o modelo não recebia as restrições completas do
modo Plan até um turno posterior. Chamadas de ferramenta irmãs da mesma resposta
do modelo também podiam ser executadas de ambos os lados da transição de modo:
chamadas antes da entrada rodavam sob o modo anterior, enquanto chamadas depois
dela rodavam após o modo Plan se tornar ativo, sem serem reagendadas contra o
novo limite.

## Contrato

Uma invocação de `enter_plan_mode` bem-sucedida ou já ativa retorna o mesmo
lembrete completo produzido por `getPlanModeSystemReminder()`. Sessões SDK
recebem a variante específica do SDK. Entrada YOLO não solicitada, falhas de
transição e rejeição de subagente ou teammate mantêm seus resultados existentes
porque nenhuma transição de modo Plan ocorreu.

Quando um lote executável pós-deduplicação contém mais de uma chamada e uma
chamada é `enter_plan_mode`, a primeira chamada de entrada é um limite de
execução. Apenas essa chamada é elegível para execução. Toda outra irmã
executável, independentemente de ter aparecido antes ou depois da entrada,
recebe uma resposta terminal `EXECUTION_DENIED` instruindo o modelo a retentar
no próximo turno após observar o novo modo de aprovação. Falha de entrada ou
sucesso idempotente não liberam as irmãs.

Decisões terminais existentes têm precedência. A detecção de loop ainda rejeita
o lote inteiro primeiro. Respostas duplicadas de provider são emitidas nas suas
posições originais, mas não são irmãs executáveis. No modo structured-output, o
pré-scan existente de structured-output permanece terminal e suprime
`enter_plan_mode` junto com outras chamadas não estruturadas.

`exit_plan_mode` não é um limite de execução nesta mudança. Sua aprovação
explícita do usuário e proteções de contexto obsoleto são independentes.

## Integração

O scheduler do core aplica o limite após deduplicação por call-ID e resolução de
nome canônico, antes de verificações de permissão, busca no registry, hooks ou
construção de invocação. Chamadas puladas, portanto, não solicitam permissões
nem executam hooks por ferramenta. Elas permanecem como resultados terminais do
lote para que o callback de conclusão existente, gravação, telemetria e o
caminho de auditoria `PostToolBatch` observem uma resposta completa para cada ID
de chamada aceito. Visões do gerador de conteúdo específicas do runtime são
limpas junto com os outros resultados terminais.

O ACP aplica a mesma política após o tratamento de loop e de provider duplicado
e antes de executar seus lotes sequenciais ou de Agent. Respostas duplicadas
permanecem ordenadas. O ACP não introduz um hook `PostToolBatch` porque esse
caminho intencionalmente não suporta um.

O modo headless aplica a política após a filtragem de duplicatas e de
structured-output. Chamadas puladas são emitidas e retornadas como resultados de
ferramenta negados na sua ordem original, mas não consomem orçamento de
`--max-tool-calls`. A própria entrada segue o comportamento normal de orçamento
e de abort.

## Preservação da saída

O lembrete é política de ciclo de vida, não payload comum de ferramenta.
`enter_plan_mode` declara um limite de saída infinito por ferramenta, está isento
do gate de derramamento para persistência do scheduler e não é candidato a
offloading agregado de lote. Essas três proteções impedem que a política seja
truncada, substituída por um ponteiro de arquivo ou reduzida a uma prévia antes
do próximo turno do modelo.

## Validação

A cobertura unitária verifica os lembretes exatos DEFAULT e SDK, entrada
bem-sucedida e idempotente, seleção da primeira entrada, negação de irmãs em
ambos os lados, ordenação de provider duplicado, contabilização de orçamento
headless, preservação do lembrete completo sob limites de saída deliberadamente
minúsculos, visibilidade de `PostToolBatch` e limpeza de visões do runtime. As
suítes existentes de scheduler, ACP e headless cobrem o comportamento ao redor
de permissão, loop, duplicatas, structured-output e abort.

A validação em host gerenciado deve confirmar que o cliente ACP recebe um
resultado para cada chamada de ferramenta e que a próxima requisição do modelo
contém o lembrete completo mais as respostas de negação de irmãs. Essa
validação requer um build implantado e um ID de sessão do host; ela não é
simulada mudando o roteamento de produção neste PR.
