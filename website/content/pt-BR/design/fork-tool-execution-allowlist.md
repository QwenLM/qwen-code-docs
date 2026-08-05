# Allowlist de Execução de Ferramentas de Fork

## Resumo

Adiciona um parâmetro opcional `fork_tools` ao runtime existente
`subagent_type: "fork"` da ferramenta Agent. O parâmetro estreita quais
ferramentas um fork pode executar sem alterar as declarações de ferramentas
enviadas ao modelo.

Esta é a primeira fase de #7625. Arquivos de perfil nomeados, padrões de argumento
de shell, sistemas de arquivos overlay e integração `/btw` estão fora de escopo.
Uma dica de prompt de lançamento informa ao fork quais ferramentas visíveis a
allowlist permite.

## Objetivos

- Preservar a superfície de execução de fork herdada quando `fork_tools` é
  omitido, exceto para ferramentas de interação que forks nunca devem executar.
- Tratar uma lista vazia como deny-all em vez do comportamento curinga existente
  de `tools: []`.
- Manter as declarações atuais visíveis ao modelo do fork inalteradas para que
  adicionar uma restrição de execução não altere seu prefixo de prompt-cache.
- Rejeitar chamadas não permitidas antes da construção de ferramenta, hooks de
  ferramenta, classificação de permissão, agendamento ou aprovação.
- Preservar a restrição quando um fork de segundo plano é revivificado a partir de
  seu sidecar persistido.

## Parâmetro e Correspondência

`fork_tools` é válido apenas com um `subagent_type: "fork"` explícito e não pode
ser combinado com um teammate nomeado. Toda entrada deve ser uma string não vazia
sem espaços em branco ao redor. Nomes exatos desconhecidos permanecem na allowlist
e não correspondem a nada; eles não são filtrados, porque transformar uma lista
não vazia inválida em uma restrição omitida faria fail-open.

Ferramentas embutidas usam nomes de função canônicos exatos das declarações
visíveis ao modelo. Entradas MCP suportam nomes canônicos exatos mais padrões de
servidor e curinga de sufixo. Padrões são correspondidos contra a identidade bruta
de servidor/ferramenta MCP da ferramenta registrada em vez de apenas seu nome
sanitizado do provedor, de modo que nomes de servidor distintos que sanitizam para
o mesmo prefixo não podem ter correspondência cruzada. `*` sozinho é rejeitado; a
omissão já permite toda ferramenta herdada de outra forma executável. Entradas
curinga são limitadas a `mcp__*` ou um padrão de prefixo de ferramenta MCP de
sufixo como `mcp__github__read_*`. `mcp__*` deliberadamente corresponde a todas as
ferramentas MCP sem corresponder a ferramentas embutidas.

Padrões de argumento de shell não fazem parte desta fase. Listar
`run_shell_command` permite que a chamada de ferramenta continue pelo pipeline
normal de permissão, mas não pré-aprova seu comando.

## Separação de Runtime

`ToolConfig.tools` permanece como a fonte para `AgentCore.prepareTools()` e as
declarações de função em toda requisição de modelo. Um campo separado
`executionAllowedTools` é capturado em snapshot quando `AgentCore` é criado.
Entradas exatas e entradas curinga MCP são pré-computadas separadamente para que
uma não correspondência de ferramenta não aloque ou reanalise nomes embutidos não
relacionados.

`processFunctionCalls()` primeiro verifica se um nome solicitado está presente no
conjunto de declarações. Então aplica a allowlist de execução opcional. Uma
chamada não permitida produz uma resposta de erro sintética com o ID e nome
originais da chamada, enquanto outras chamadas no mesmo lote continuam para o
agendador. Porque esta verificação precede a construção do agendador, a chamada
rejeitada não pode abrir um prompt de aprovação ou executar um hook de
pré-ferramenta.

A allowlist apenas estreita a superfície existente. Ela não pode reabilitar
ferramentas removidas por exclusões de subagente, contornar permissões normais
para uma ferramenta permitida ou adicionar declarações.

Todo fork recebe uma allowlist de execução em memória, mesmo quando `fork_tools` é
omitido. O piso de propriedade do runtime remove `ask_user_question` após aplicar
a lista fornecida pelo chamador, de modo que um chamador não pode reabilitá-la. A
ferramenta permanece na lista de declarações derivada do pai para compartilhamento
de prompt-cache, mas uma chamada é rejeitada antes de agendamento ou aprovação. Um
fork bloqueado reporta a entrada ausente ao seu pai em vez de tentar interagir com
o usuário diretamente.

O fork recebe um aviso de restrição no prompt da tarefa após o prefixo cacheável
herdado. Isso evita chamadas de tentativa e erro sem alterar a instrução de
sistema derivada do pai, prefixo de histórico ou declarações de ferramentas.

## Revivificação de Segundo Plano

Forks de segundo plano persistem o histórico herdado no registro de transcrição
`agent_bootstrap` e o prompt da tarefa de lançamento em um registro separado.
Instrução de sistema e declarações de ferramentas são capabilities, então a
revivificação a frio as revincula do runtime pai atual e resolve nomes de
ferramentas atuais por meio do registro ativo.

`executionAllowedTools` fornecido pelo chamador é, em vez disso, política no
momento do lançamento. Forks restritos a armazenam no sidecar `AgentMeta`,
incluindo uma lista vazia deny-all, e a revivificação a frio a reaplica ao
`ToolConfig` ativo. Forks lançados sem `fork_tools` não persistem a lista
derivada, permitindo que a revivificação a recalcule a partir da superfície de
ferramentas pai atual. A superfície executável resultante é a superfície de
ferramentas derivada do pai atual estreitada pela política persistida e pela
exclusão obrigatória de ferramenta de interação.

O campo permanece opcional para compatibilidade. Transcrições mais antigas e forks
lançados sem `fork_tools` restauram com a superfície de ferramentas derivada do
pai atual menos a exclusão obrigatória de ferramenta de interação.

## Fronteira

`fork_tools` é fornecido pelo modelo pai ou chamador em cada chamada da ferramenta
Agent. É, portanto, uma restrição de capability de filho, não um sandbox de
segurança aplicado por usuário ou administrador. Uma futura camada de perfil pode
fornecer um nome de política curto e controlado pelo projeto sobre este mecanismo
de execução.

A restrição não pode ser contornada por meio de outro filho: a execução de fork é
executada dentro do contexto de runtime do fork, cujo guard autoritativo da
ferramenta Agent rejeita toda geração de subagente. Mais geralmente, `fork_tools`
não pode tornar uma ferramenta excluída ou não declarada executável.
