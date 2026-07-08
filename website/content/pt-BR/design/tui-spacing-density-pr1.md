# Espaçamento e Densidade da TUI PR1

## Por que

A TUI atual frequentemente gasta linhas extras com espaçamento antes da saída do assistente, entre blocos de status/ferramentas e dentro de grupos de ferramentas expandidos. Em sessões comuns, isso torna respostas simples, listas de arquivos, saída de ferramentas, estados de erro, diffs e saídas de streaming longas mais difíceis de ler, pois os usuários precisam rolar a tela por espaços em branco em vez de conteúdo.

Este PR é a primeira passagem focada para QwenLM/qwen-code#4588. Ele aborda apenas espaçamento e densidade para que a revisão possa comparar o uso de linhas antes e depois sem também revisar a visibilidade do raciocínio, bordas de ferramentas, layout do SubAgent, identidade visual ou alterações de cores do tema.

## Como

A implementação mantém a estrutura de informações e as superfícies de renderização existentes intactas:

- O espaçamento dos itens do histórico é centralizado perto de `HistoryItemDisplay`. Prompts do usuário e visualizações de comandos independentes ainda começam com um separador de turno, enquanto continuações do assistente, grupos de ferramentas, mensagens de status, resumos de ferramentas e saídas relacionadas dentro do turno não adicionam mais uma linha extra de espaçamento inicial.
- Grupos de ferramentas expandidos mantêm sua borda atual e estrutura de status/título, mas não inserem mais linhas em branco entre entradas de ferramentas adjacentes.
- Os resultados das ferramentas são renderizados diretamente abaixo da linha de título/status da ferramenta. Isso remove a linha em branco extra entre o cabeçalho da ferramenta e sua saída sem alterar o conteúdo da saída, truncamento, foco do shell, prompts de confirmação ou comportamento do modo compacto.

O comportamento de linhas em branco do Markdown foi intencionalmente deixado inalterado. O renderizador já colapsa linhas em branco consecutivas em um único espaçamento e preserva blocos complexos, como tabelas, blocos de código e blocos matemáticos.

## Padrão de Espaçamento

- Turnos independentes do usuário mantêm um separador visual.
- A saída do assistente e blocos de acompanhamento dentro do turno não adicionam um segundo separador.
- O cabeçalho da ferramenta e o conteúdo do resultado da ferramenta são adjacentes.
- Grupos de múltiplas ferramentas expandidos não inserem linhas em branco entre cada entrada de ferramenta.
- Blocos complexos de Markdown mantêm seu layout interno existente.

## Efeito Esperado

Sob a mesma largura de terminal e mesmo conteúdo renderizado, os cenários alvo devem usar menos linhas visíveis:

- Perguntas e respostas simples devem reduzir pelo menos uma linha visível.
- A saída de ferramentas expandidas deve reduzir pelo menos uma linha para cada resultado de ferramenta renderizado que anteriormente tinha um espaçamento em branco entre cabeçalho/resultado.
- Grupos de múltiplas ferramentas devem reduzir uma linha entre cada entrada de ferramenta adjacente.
- Cenários de inspeção de projeto, diff, lista de arquivos, erro e streaming longo não devem ganhar linhas, a menos que alterações na quebra de linha do terminal tornem isso inevitável.

## Medição

As asserções automatizadas de espaçamento e as evidências de terminal usam fixtures de 100 colunas para as regras alteradas:

| Cenário                                        | Largura | Linhas base | Linhas PR1 | Delta | Evidência                                                                                                     |
| ----------------------------------------------- | ------: | ----------: | ---------: | ----: | ------------------------------------------------------------------------------------------------------------- |
| Resposta simples do assistente                  |     100 |           2 |          1 |    -1 | espaçamento inicial do histórico removido                                                                     |
| Cabeçalho da ferramenta com resultado de uma linha |     100 |           3 |          2 |    -1 | cabeçalho e resultado são adjacentes                                                                          |
| Grupo expandido de três ferramentas com resultados renderizados |     100 |          16 |         11 |    -5 | um espaçamento de cabeçalho/resultado removido por resultado de ferramenta e um separador entre ferramentas removido entre ferramentas adjacentes |
| Fixture representativo completo                 |     100 |          26 |         19 |    -7 | mesmo conteúdo renderizado capturado no tmux                                                                  |

Os diffs de snapshot também cobrem os fixtures existentes de 80 colunas para confirmar os mesmos deltas de contagem de linhas no harness de teste de componentes atual.

## Fora do Escopo

- Ocultar rastros de raciocínio.
- Remover bordas de ferramentas.
- Redesenhar a saída do SubAgent.
- Alterar a identidade visual de inicialização ou o banner.
- Alterar cores do tema.
- Adicionar tempo decorrido do assistente por turno.
- Alterar o destaque de código inline em tabelas.