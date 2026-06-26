# Relatório de Benchmark de Diagnósticos em Tempo de Execução do Qwen Code

Data: 2026-05-19

## Escopo

Esta execução repete os cenários anteriores de benchmark do Qwen Code com os novos diagnósticos de tempo de execução ativados por opt-in. Ele testa apenas o Qwen Code, não o Claude Code.

Matriz inicial de modelos:

- `pai/glm-5`
- `qwen3.6-plus`

Acompanhamento adicional no tamanho de um PR:

- `DeepSeek/deepseek-v4-pro` via protocolo compatível com Anthropic

Casos:

- revisão de PR pequeno no GitHub: PR `#4268`
- navegação de código: busca e leitura de código relacionado a compressão/compactação
- diff local sintético: cerca de 94,6 KiB
- diff local sintético: cerca de 968,5 KiB
- diff local sintético: cerca de 4,84 MiB

A execução usou a CLI local empacotada do branch de diagnósticos, com `QWEN_CODE_PROFILE_RUNTIME=1` e um diretório home da CLI temporário. Servidores MCP globais e hooks não foram carregados para este benchmark.

Ressalva importante: esses números absolutos de RSS são menores do que as execuções anteriores do `qwen` resolvido pelo PATH porque esta execução usou `node dist/cli.js` do branch local mais uma configuração temporária reduzida. Trate este relatório como uma execução de distribuição de diagnósticos interna, não como uma substituição direta da comparação de RSS da CLI instalada anteriormente.

## Verificação de Sanidade entre CLI Instalada e Pacote Local

Uma verificação de sanidade de acompanhamento usou o mesmo prompt mínimo, modelo e modo não interativo na CLI instalada e no pacote de diagnósticos local. A única variável intencional era se o Qwen Code carregava um diretório home da CLI temporário reduzido ou a configuração normal do usuário.

| CLI                 | Modo de configuração | Tokens totais | Pico de RSS da árvore | Pico de RSS da raiz | Pico de contagem de processos | Diagnósticos de execução |
| ------------------- | -------------------- | -----------: | --------------------: | ------------------: | ---------------------------: | ------------------------ |
| PATH `qwen`         | config reduzida      |       33.965 |             542,4 MiB |           249,9 MiB |                            3 | não                      |
| local `dist/cli.js` | config reduzida      |       47.281 |             455,2 MiB |           214,2 MiB |                            4 | sim                      |
| PATH `qwen`         | config normal        |       97.615 |           1.099,9 MiB |           250,1 MiB |                            6 | não                      |
| local `dist/cli.js` | config normal        |       97.954 |           1.105,4 MiB |           212,7 MiB |                            8 | sim                      |

Esta verificação altera a atribuição: o pico anterior de 1 GiB visível ao usuário é reproduzível com a configuração normal, mesmo no pacote de diagnósticos local. Portanto, não é explicado principalmente pelo branch local incluir o PR `#4186`.

No pico com configuração normal, a amostra da árvore de processos locais foi dominada por múltiplos processos Node/MCP, não apenas pelo processo raiz do Qwen:

| Papel | Forma do comando         | RSS no pico da árvore |
| ----- | ------------------------ | --------------------: |
| filho | Processo Node            |             252,9 MiB |
| filho | MCP do Chrome DevTools   |             219,7 MiB |
| filho | Processo Node            |             219,2 MiB |
| raiz  | Processo Node do Qwen    |             215,1 MiB |
| filho | Configuração do MCP Chrome DevTools |             175,2 MiB |

O PR `#4186` está presente no branch local de diagnósticos, mas é uma rede de segurança de compactação automática sob pressão de heap V8. Ele é acionado em cerca de 70% de pressão de heap V8; neste ambiente, o limite de heap Node é de aproximadamente 4,1 GiB, enquanto o heap final do benchmark reduzido era de cerca de 99-143 MiB. Com base nesses números, o RSS menor com configuração reduzida não é causado pelo `#4186` comprimindo ativamente o contexto durante estas execuções de benchmark.

### Verificação de Atribuição do Modo Bare

Um segundo acompanhamento usou `qwen3.6-plus` com o mesmo formato de prompt de revisão de PR na CLI instalada e no pacote local. Isso não é um benchmark de negócios normal de ponta a ponta. É uma verificação controlada de atribuição apenas para memória de inicialização/configuração.

`--bare` altera as entradas de tempo de execução: ele ignora a descoberta normal de configurações globais, inicialização do MCP, hooks, contexto implícito, skills e outras integrações de inicialização. Portanto, pode falhar ou se comportar de forma diferente quando um provedor de modelo está configurado apenas nas configurações globais. Para esta execução, as credenciais do modelo foram fornecidas apenas através do ambiente do processo filho, porque o modo bare intencionalmente não carrega as configurações normais do provedor. Nada foi gravado na configuração global do usuário.

Esta execução não produziu estatísticas úteis de tokens/chamadas de ferramenta: o modelo completou em um turno e não chamou o comando shell solicitado. Não use estas linhas como resultados normais de benchmark de tarefas e não compare seu comportamento de tokens/chamadas de ferramenta com a matriz acima. Elas são úteis apenas para estimar quanto do RSS da árvore de processos vem da configuração normal e dos processos filhos configurados.

| CLI                 | Modo   | Tempo real | Turnos | Usos de ferramenta | Pico de RSS da árvore | Pico de RSS da raiz | Pico de contagem de processos |
| ------------------- | ------ | ---------: | -----: | -----------------: | --------------------: | ------------------: | ---------------------------: |
| PATH `qwen`         | normal |        5,5s |      1 |                  0 |           1.021,3 MiB |           251,5 MiB |                            5 |
| PATH `qwen`         | `--bare` |       2,4s |      1 |                  0 |             525,7 MiB |           246,4 MiB |                            2 |
| local `dist/cli.js` | normal |        4,9s |      1 |                  0 |           1.046,2 MiB |           213,3 MiB |                            5 |
| local `dist/cli.js` | `--bare` |       2,3s |      1 |                  0 |             454,3 MiB |           216,5 MiB |                            3 |

O resultado confirma a hipótese da árvore de processos para atribuição de inicialização/configuração. Nesta máquina, a configuração normal adiciona aproximadamente 0,50-0,59 GiB de RSS da árvore de processos visível ao usuário em relação ao `--bare`, enquanto o RSS raiz permanece na mesma faixa de 0,21-0,25 GiB. No pico com configuração normal, o RSS extra veio novamente de processos filhos Node/MCP adicionais, incluindo um processo MCP do Chrome DevTools e seu wrapper de configuração. `--bare` remove esses filhos de inicialização/configuração e traz as execuções instalada e local de volta para a faixa de 0,45-0,53 GiB de RSS da árvore.

### Isolamento do MCP / Hooks com Configurações Temporárias

Como `--bare` altera muitas entradas de tempo de execução para ser tratado como um benchmark normal, um acompanhamento usou diretórios `QWEN_HOME` temporários com arquivos de configuração gerados a partir das configurações normais. A execução permaneceu no caminho normal de carregamento de configurações, mas alternou apenas duas dimensões de configuração:

- MCP desabilitado: `mcpServers` limpo e listas de permissão/exclusão do MCP esvaziadas.
- Hooks desabilitados: `disableAllHooks` definido como true.

Nenhuma configuração global foi modificada. O caso usou `qwen3.6-plus` e um prompt mínimo de inicialização, portanto mede o custo da árvore de processos de inicialização/configuração, não a qualidade do raciocínio da tarefa.

| CLI                 | Config temporária | Servidores MCP | Ferramentas | Pico de RSS da árvore | Pico de RSS da raiz | Pico de contagem de processos |
| ------------------- | ---------------- | -------------: | ----------: | --------------------: | ------------------: | ---------------------------: |
| PATH `qwen`         | completa          |              4 |          46 |           1.017,4 MiB |           249,8 MiB |                            5 |
| PATH `qwen`         | MCP desabilitado |              0 |          17 |             548,7 MiB |           252,4 MiB |                            2 |
| PATH `qwen`         | hooks desabilitados |             4 |          46 |           1.003,8 MiB |           246,4 MiB |                            5 |
| PATH `qwen`         | MCP e hooks desabilitados |          0 |          17 |             542,5 MiB |           248,0 MiB |                            2 |
| local `dist/cli.js` | completa          |              4 |          48 |             865,9 MiB |           220,4 MiB |                            6 |
| local `dist/cli.js` | MCP desabilitado |              0 |          19 |             442,9 MiB |           209,6 MiB |                            2 |
| local `dist/cli.js` | hooks desabilitados |             4 |          48 |             848,3 MiB |           212,6 MiB |                            5 |
| local `dist/cli.js` | MCP e hooks desabilitados |          0 |          19 |             447,2 MiB |           217,8 MiB |                            2 |

Interpretação:

1. Desabilitar o MCP é a mudança dominante. Remove 4 servidores MCP, reduz a contagem de ferramentas anunciada em cerca de 29 ferramentas e diminui o RSS da árvore de processos em aproximadamente 0,42-0,47 GiB neste caso de inicialização/configuração.
2. Desabilitar apenas os hooks mal altera o RSS neste caso. Isso é esperado porque o prompt não produziu chamadas de ferramenta, então os hooks `PreToolUse` / `PostToolUse` não foram executados.
3. O processo raiz permanece em torno de 0,21-0,25 GiB em todas as linhas. A grande diferença é novamente composição da árvore de processos, não o RSS raiz do Qwen.

Duas tentativas de acompanhamento de navegação de código com `qwen3.6-plus` e `pai/glm-5` também reproduziram a mesma divisão de memória MCP vs. sem MCP, mas nenhum dos modelos produziu chamadas de ferramenta nessas execuções. Portanto, essas linhas não são usadas como evidência de execução de hooks. Um benchmark de hooks válido ainda precisa de uma combinação tarefa/modelo que emita chamadas de ferramenta de forma confiável.

### Isolamento por MCP

A linha anterior mostrou que o MCP como grupo é o fator dominante de memória de inicialização/configuração. Um acompanhamento isolou cada servidor MCP configurado, mantendo os hooks desabilitados para todas as linhas. Isso mantém o teste no caminho normal de carregamento de configurações, mas altera apenas o subconjunto de servidores MCP.

Nomes de servidores MCP configurados:

- `approval-bridge`
- `env-center`
- `chrome-devtools`
- `code`

Isolamento de passagem única:

| Variante                         | MCPs habilitados                              | Ferramentas | Servidores MCP | Pico de RSS da árvore | Pico de RSS da raiz | Interpretação                       |
| -------------------------------- | --------------------------------------------- | ----------: | -------------: | --------------------: | ------------------: | ----------------------------------- |
| nenhum                           | nenhum                                        |          19 |              0 |             444,4 MiB |           211,7 MiB | linha de base sem MCP               |
| todos                            | todos os 4                                    |          48 |              4 |             857,3 MiB |           215,9 MiB | formato de inicialização com MCP completo |
| apenas `approval-bridge`         | `approval-bridge`                             |          19 |              1 |             455,5 MiB |           214,0 MiB | próximo da linha de base            |
| apenas `env-center`              | `env-center`                                  |          19 |              1 |             452,3 MiB |           214,4 MiB | próximo da linha de base            |
| apenas `chrome-devtools`         | `chrome-devtools`                             |          48 |              1 |             824,4 MiB |           209,5 MiB | grande aumento de RSS e ferramentas |
| apenas `code`                    | `code`                                        |          19 |              1 |             452,1 MiB |           216,6 MiB | próximo da linha de base            |
| sem `approval-bridge`            | `env-center`, `chrome-devtools`, `code`       |          48 |              3 |             997,1 MiB |           215,4 MiB | ainda alto; execução mostrou variância |
| sem `env-center`                 | `approval-bridge`, `chrome-devtools`, `code`  |          48 |              3 |             863,8 MiB |           220,9 MiB | ainda alto                          |
| sem `chrome-devtools`            | `approval-bridge`, `env-center`, `code`       |          19 |              3 |             463,4 MiB |           221,6 MiB | retorna próximo da linha de base    |
| sem `code`                       | `approval-bridge`, `env-center`, `chrome-devtools` |       48 |              3 |             858,1 MiB |           219,5 MiB | ainda alto                          |

Como o RSS de inicialização tem alguma variância, as variantes principais foram repetidas duas vezes:

| Variante                         | Amostras | Variação do RSS da árvore   | Média do RSS da árvore | Resultado                         |
| -------------------------------- | -------: | --------------------------- | ---------------------: | --------------------------------- |
| nenhum                           |        2 | 443,3-451,9 MiB             |              447,6 MiB | linha de base estável sem MCP     |
| todos                            |        2 | 856,1-922,8 MiB             |              889,5 MiB | faixa estável com MCP alto        |
| apenas `chrome-devtools`         |        2 | 1.007,1-1.021,2 MiB         |            1.014,2 MiB | sozinho suficiente para reproduzir alto |
| sem `chrome-devtools`            |        2 | 461,1-461,6 MiB             |              461,4 MiB | remove o RSS alto                  |
| apenas `approval-bridge`         |        2 | 449,1-449,9 MiB             |              449,5 MiB | próximo da linha de base           |
| apenas `env-center`              |        2 | 438,7-449,5 MiB             |              444,1 MiB | próximo da linha de base           |
| apenas `code`                    |        2 | 450,6-451,3 MiB             |              451,0 MiB | próximo da linha de base           |

Interpretação:

1. `chrome-devtools` é o contribuinte MCP dominante neste ambiente. Ele é suficiente por si só para reproduzir o alto RSS da árvore de processos.
2. Remover `chrome-devtools` do conjunto MCP completo retorna o RSS à faixa sem MCP. Remover outros MCPs mantendo `chrome-devtools` não.
3. A contagem de ferramentas anunciada segue o mesmo padrão: a linha de base é 19 ferramentas, enquanto `chrome-devtools` eleva a contagem para 48. Isso significa que este MCP também provavelmente aumenta o tamanho do esquema da ferramenta de requisição e a pressão de tokens, não apenas o RSS da árvore de processos.
4. `approval-bridge`, `env-center` e `code` individualmente permanecem próximos da linha de base sem MCP nessas execuções de inicialização/configuração. Eles emitiram avisos de inicialização neste ambiente, portanto este resultado deve ser interpretado como "nenhum proprietário persistente de RSS de inicialização observado", em vez de prova de que eles têm custo zero em todos os fluxos de trabalho.

## Resumo do Tempo de Execução

| Caso              | Modelo          | Tempo real | Turnos | Tokens totais | Pico de RSS da árvore | Pico de RSS da raiz | Heap final | RSS final |
| ----------------- | --------------- | ---------: | -----: | ------------: | --------------------: | ------------------: | ---------: | --------: |
| PR pequeno `#4268` | `pai/glm-5`    |       20,1s |      7 |       173.216 |             362,1 MiB |           359,8 MiB |   103,1 MiB | 216,5 MiB |
| navegação de código | `pai/glm-5`  |       18,4s |      2 |        49.127 |             378,0 MiB |           376,0 MiB |   102,4 MiB | 313,4 MiB |
| diff 94,6 KiB     | `pai/glm-5`    |       16,6s |      6 |       135.716 |             367,9 MiB |           366,0 MiB |    99,1 MiB | 295,0 MiB |
| diff 968,5 KiB    | `pai/glm-5`    |       11,4s |      2 |        42.590 |             373,2 MiB |           362,5 MiB |   106,4 MiB | 345,6 MiB |
| diff 4,84 MiB     | `pai/glm-5`    |       12,0s |      4 |        95.119 |             414,2 MiB |           412,0 MiB |   123,6 MiB | 410,7 MiB |
| PR pequeno `#4268` | `qwen3.6-plus` |       35,0s |      6 |       156.556 |             358,9 MiB |           356,9 MiB |   102,6 MiB | 293,1 MiB |
| navegação de código | `qwen3.6-plus` |      28,9s |      4 |        99.800 |             370,3 MiB |           368,3 MiB |   105,8 MiB | 298,2 MiB |
| diff 94,6 KiB     | `qwen3.6-plus` |       28,3s |      4 |        90.808 |             358,8 MiB |           356,9 MiB |   105,9 MiB | 307,0 MiB |
| diff 968,5 KiB    | `qwen3.6-plus` |       30,9s |      6 |       151.782 |             366,1 MiB |           364,1 MiB |   101,0 MiB | 316,9 MiB |
| diff 4,84 MiB     | `qwen3.6-plus` |       24,1s |      4 |        93.271 |             372,8 MiB |           366,0 MiB |   142,8 MiB | 366,0 MiB |

Média por modelo:

| Modelo          | Média do pico de RSS da árvore | Média do pico de RSS da raiz | Média de turnos | Média de tokens totais | Média do corpo máximo da mensagem | Média do resultado total de ferramenta |
| --------------- | ----------------------------: | --------------------------: | --------------: | ---------------------: | --------------------------------: | ------------------------------------: |
| `pai/glm-5`    |                     379,1 MiB |                   375,3 MiB |             4,2 |                 99.154 |                         111,8 KiB |                             335,1 KiB |
| `qwen3.6-plus` |                     365,4 MiB |                   362,4 MiB |             4,8 |                118.443 |                         119,3 KiB |                             344,3 KiB |

Instantâneo sobreposto do modelo para o PR pequeno `#4268`:

| Modelo                      | Protocolo | Tempo real | Turnos | Tokens totais | Pico de RSS da árvore | Pico de RSS da raiz | Corpo máximo da mensagem |
| --------------------------- | --------- | ---------: | -----: | ------------: | --------------------: | ------------------: | ----------------------: |
| `pai/glm-5`                | OpenAI    |       20,1s |      7 |       173.216 |             362,1 MiB |           359,8 MiB |               113,8 KiB |
| `qwen3.6-plus`             | OpenAI    |       35,0s |      6 |       156.556 |             358,9 MiB |           356,9 MiB |               134,1 KiB |
| `DeepSeek/deepseek-v4-pro` | Anthropic |       39,7s |      2 |        43.362 |             346,9 MiB |           344,8 MiB |               103,0 KiB |

## Diagnósticos de Requisição e Ferramenta

| Caso              | Modelo          | Requisições | Corpo máximo da mensagem | Prompt de sistema máximo | Esquema da ferramenta máximo | Chamadas de ferramenta | Resultado total da ferramenta | Resultado máximo da ferramenta | Resposta de função máxima na requisição |
| ----------------- | --------------- | ----------: | ----------------------: | ----------------------: | --------------------------: | ---------------------: | ----------------------------: | ----------------------------: | ------------------------------------: |
| PR pequeno `#4268` | `pai/glm-5`    |           7 |               113,8 KiB |                51,4 KiB |                  40,2 KiB |                      9 |                       4,7 KiB |                       3,9 KiB |                             15,3 KiB |
| navegação de código | `pai/glm-5`  |           2 |               114,6 KiB |                51,5 KiB |                  40,2 KiB |                      3 |                      17,5 KiB |                       6,2 KiB |                             18,4 KiB |
| diff 94,6 KiB     | `pai/glm-5`    |           6 |               111,2 KiB |                39,1 KiB |                  37,2 KiB |                      9 |                      94,9 KiB |                      92,6 KiB |                             29,2 KiB |
| diff 968,5 KiB    | `pai/glm-5`    |           2 |               104,8 KiB |                39,1 KiB |                  37,2 KiB |                      2 |                     772,1 KiB |                     771,9 KiB |                             25,6 KiB |
| diff 4,84 MiB     | `pai/glm-5`    |           4 |               114,7 KiB |                39,1 KiB |                  37,2 KiB |                      4 |                     786,3 KiB |                     783,2 KiB |                             34,7 KiB |
| PR pequeno `#4268` | `qwen3.6-plus` |          6 |               134,1 KiB |                51,4 KiB |                  40,2 KiB |                      5 |                      34,6 KiB |                      15,6 KiB |                             36,6 KiB |
| navegação de código | `qwen3.6-plus` |         4 |               114,9 KiB |                51,5 KiB |                  40,2 KiB |                      3 |                      17,5 KiB |                       6,2 KiB |                             18,4 KiB |
| diff 94,6 KiB     | `qwen3.6-plus` |           4 |               112,8 KiB |                39,1 KiB |                  37,2 KiB |                      3 |                      92,9 KiB |                      92,6 KiB |                             33,0 KiB |
| diff 968,5 KiB    | `qwen3.6-plus` |           6 |               113,1 KiB |                39,1 KiB |                  37,2 KiB |                      5 |                     778,0 KiB |                     771,9 KiB |                             32,1 KiB |
| diff 4,84 MiB     | `qwen3.6-plus` |           4 |               121,5 KiB |                39,1 KiB |                  37,2 KiB |                      4 |                     798,5 KiB |                     783,2 KiB |                             41,3 KiB |

## Observações

1. O RSS da árvore de processos é quase o mesmo que o RSS raiz nesta execução com pacote local. A diferença raiz/árvore geralmente fica abaixo de 10 MiB. Isso significa que essas execuções não mostraram um proprietário persistente de memória em processo filho. O processo dominante é o processo Node principal.
2. A execução com pacote local atinge pico em torno de 0,36-0,41 GiB, não os 0,83-1,04 GiB anteriores, porque a matriz usou uma configuração temporária reduzida. Uma verificação de sanidade com configuração normal reproduziu cerca de 1,1 GiB de RSS da árvore tanto no PATH `qwen` quanto no local `dist/cli.js`, com a memória extra vindo de processos filhos MCP/Node na árvore de processos.
3. O heap V8 é muito menor que o RSS. O heap final é de cerca de 99-143 MiB, enquanto o RSS final é de cerca de 216-411 MiB. A pegada restante provavelmente consiste em módulos carregados, alocações nativas, buffers externos ou sobrecarga de tempo de execução fora do heap JS ativo.
4. A sobrecarga estática de requisição é grande e repetida. O prompt de sistema tem cerca de 39-51 KiB por requisição, e o esquema da ferramenta tem cerca de 37-40 KiB por requisição. Isso explica por que mesmo tarefas pequenas podem produzir altas contagens acumuladas de tokens quando o modelo faz vários turnos.
5. A saída de diff grande é truncada antes de chegar à requisição do modelo. Os casos de diff de 968 KiB e 4,84 MiB produziram cerca de 772-799 KiB de resultado de ferramenta capturado, mas a maior resposta de função voltada para o modelo em uma requisição permaneceu em torno de 25-41 KiB, e o corpo máximo da mensagem ficou em torno de 105-122 KiB. Isso indica que o tratamento de truncamento/saída salva está funcionando no caminho voltado para o modelo.
6. A memória ainda aumenta em casos de saída grande, mesmo que o corpo da mensagem permaneça limitado. Por exemplo, a execução GLM de 4,84 MiB atingiu 414,2 MiB de RSS da árvore e 410,7 MiB de RSS final, e a execução qwen3.6-plus de 4,84 MiB terminou com 142,8 MiB de heap. Isso sugere que a saída grande de ferramenta ainda pode afetar a captura local, normalização ou estado de tempo de execução retido, mesmo quando o payload final da requisição é limitado.
7. A escolha do modelo alterou turnos e totais de tokens mais do que o RSS nesta execução. `qwen3.6-plus` teve, em média, mais tokens e turnos do que `pai/glm-5`, mas seu pico médio de RSS da árvore foi ligeiramente menor. Isso apoia a conclusão anterior de que a escolha do modelo não é a principal explicação para a memória do processo.
## Inferência de Trabalho Atualizada

Os novos diagnósticos tornam a hipótese anterior mais precisa:

- O pico de 1 GiB visível pelo usuário na CLI instalada agora é reproduzível com a configuração normal no pacote de diagnóstico local. A execução "stripped" deve ser usada para atribuição interna do runtime do Qwen; a execução com configuração normal deve ser usada para atribuição da árvore de processos visível pelo usuário.
- A maior diferença observada entre a configuração "stripped" e a normal é a forma da árvore de processos: a configuração normal inicia processos filhos adicionais do MCP/Node. Esses filhos explicam a maior parte do salto absoluto de cerca de 0,35-0,55 GiB para cerca de 1,1 GiB na verificação de sanidade com prompt mínimo.
- O acompanhamento com `--bare` confirma a mesma direção no `qwen3.6-plus`: a configuração normal custa cerca de 0,50-0,59 GiB a mais de RSS da árvore de processos do que o modo "bare" para o mesmo formato de prompt, enquanto o RSS da raiz muda apenas ligeiramente.
- O isolamento de configurações temporárias é um teste de atribuição melhor que `--bare`: desabilitar apenas o MCP reduz o RSS da árvore de processos em cerca de 0,42-0,47 GiB, mantendo o caminho normal de carregamento de configurações. Desabilitar apenas os hooks não mostra uma mudança significativa de RSS em casos sem chamada de ferramenta.
- O isolamento por MCP aponta para `chrome-devtools` como o contribuidor MCP dominante: ele é suficiente por si só para reproduzir a faixa alta de RSS, e sua remoção retorna a execução próxima à linha de base sem MCP.
- Dentro do runtime local do Qwen, as áreas mais suspeitas não são mais "bytes de diff brutos enviados ao modelo". O corpo da requisição voltada ao modelo é limitado.
- Os suspeitos mais fortes são o custo de contexto estático por requisição, as rodadas de requisição repetidas, o tamanho do esquema de ferramentas e a retenção/captura local de grandes saídas de ferramentas antes ou fora da truncagem voltada ao modelo.
- Como o RSS permanece muito maior que o heap V8, a próxima camada de perfil deve incluir contabilidade de módulos/inicialização, memória externa e snapshots de heap em torno da execução de ferramentas e da emissão da resposta final.

## Atribuição de RSS a Partir dos Diagnósticos Atuais

Os contadores atuais não identificam um objeto ou arquivo de origem retido exato, mas eles restringem o que está e o que não está impulsionando o RSS nessas execuções locais:

| Sinal                              | Evidência atual                                                                                                                      | Implicação no RSS                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| RSS raiz vs RSS da árvore de processos | Os picos da raiz e da árvore geralmente ficam dentro de 2-10 MiB; o PR grande do DeepSeek tem a maior diferença, cerca de 23,6 MiB   | Nenhum processo filho persistente explica o RSS nesta execução do pacote de diagnóstico local; o processo Node principal domina                     |
| Árvore de processos da config normal | Execuções com prompt mínimo e config normal atingem cerca de 1,1 GiB de RSS da árvore, enquanto o RSS raiz fica em cerca de 213-250 MiB | Os picos de 1 GiB visíveis pelo usuário podem ser dominados por processos filhos MCP/Node, e não apenas pelo RSS raiz do Qwen                      |
| Comparação `--bare`                | Execuções normais do `qwen3.6-plus` atingem pico de cerca de 1,02-1,05 GiB de RSS da árvore; execuções "bare" atingem pico de cerca de 0,45-0,53 GiB | Carregar a config normal adiciona cerca de 0,50-0,59 GiB de RSS na árvore de processos neste ambiente                                              |
| Isolamento temporário do MCP       | Limpar servidores MCP reduz o RSS da árvore de processos na inicialização/config de 865-1,017 MiB para 443-549 MiB                   | O MCP na inicialização e os processos filhos MCP explicam cerca de 0,42-0,47 GiB do RSS da árvore de processos na verificação de configuração controlada |
| Isolamento por MCP                 | Apenas `chrome-devtools` atinge cerca de 1,0 GiB em amostras repetidas; sem ele, a execução permanece em torno de 461 MiB           | `chrome-devtools` é o contribuidor dominante de RSS na árvore de processos do MCP neste ambiente                                                    |
| Isolamento temporário dos hooks    | `disableAllHooks=true` com MCP ainda ativado altera o RSS da árvore em apenas cerca de 13-18 MiB em casos sem chamada de ferramenta | A configuração de hook sozinha não é um driver visível de RSS na inicialização aqui; a execução do hook ainda precisa de um benchmark com chamada de ferramenta |
| Heap V8 vs RSS                     | Heap final é de cerca de 99-143 MiB, enquanto o RSS final é de cerca de 216-411 MiB                                                   | O heap JS ao vivo não é a pegada total; módulos carregados, alocações nativas, buffers externos ou sobrecarga do runtime são provavelmente significativos |
| Tamanho do PR/diff vs RSS          | PRs pequeno/médio/grande do DeepSeek variam de 1 a 4.750 linhas alteradas, mas o RSS da árvore fica em uma faixa estreita de 340,7-360,0 MiB | O tamanho bruto do PR não está impulsionando o RSS linearmente uma vez que a saída da ferramenta é limitada                                           |
| Tamanho da saída da ferramenta     | Execuções com diff grande capturam cerca de 772-799 KiB de resultados de ferramenta e mostram algum RSS/heap final mais alto, mas o RSS não escala linearmente | A captura/normalização do resultado da ferramenta contribui para a pressão, especialmente em casos de saída grande, mas é improvável que seja o único driver de RSS |
| Tamanho do corpo da requisição     | Corpo máximo voltado ao modelo varia de cerca de 103-289 KiB, enquanto o RSS permanece próximo da mesma faixa                       | O tamanho da serialização da requisição afeta tokens e latência mais claramente do que o pico de RSS                                                  |
| Contexto estático por requisição   | Prompt do sistema tem cerca de 39-51 KiB e esquema de ferramentas cerca de 37-48 KiB por requisição                                  | Rodadas repetidas são um amplificador de tokens/custo; isso sozinho não explica o RSS, mas é um provável alvo de otimização para pressão de tokens    |

Atribuição em andamento: no benchmark do pacote de diagnóstico local "stripped", o piso de RSS parece ser principalmente a pegada de runtime/módulo/nativo durante a tarefa, com saída grande de ferramenta adicionando pressão incremental. Na execução com configuração normal, o pico de 1 GiB na árvore visível ao usuário é principalmente composição da árvore de processos: raiz do Qwen mais processos filhos MCP/Node. A próxima medição direcionada deve dividir os diagnósticos da raiz do Qwen dos diagnósticos do servidor MCP configurado e, em seguida, adicionar pontos de verificação de inicialização/módulo/memória externa dentro do processo raiz do Qwen.

## Instantâneo do Progresso

Sinais confirmados atualmente:

1. O pico de 1 GiB na inicialização/configuração visível ao usuário é reproduzível tanto com a CLI instalada quanto com o pacote de diagnóstico local quando a configuração normal é carregada. Não é explicado principalmente pelo branch de diagnóstico ou pelo PR `#4186`.
2. Neste ambiente, esse pico de 1 GiB é principalmente composição da árvore de processos: processo raiz do Qwen mais processo filho de relançamento mais processos filhos MCP.
3. `chrome-devtools` é o contribuidor MCP configurado dominante na configuração atual. É suficiente por si só para reproduzir a faixa alta de RSS da árvore de processos, mesmo quando o prompt não usa explicitamente esse MCP.
4. A forma de relançamento normal sem MCP ainda fica em torno de 0,45 GiB de RSS da árvore de processos. Um único processo runtime do Qwen sem o pai de relançamento está mais próximo de 0,22-0,24 GiB na verificação de atribuição de inicialização. Isso significa que a linha de base de 0,45 GiB não é um número de RSS raiz de processo único.
5. Em execuções de tarefas não interativas "stripped", a escolha do modelo muda turnos, totais de tokens, latência e tamanhos de requisição mais claramente do que o RSS. O RSS permaneceu em uma faixa relativamente estreita entre `pai/glm-5`, `qwen3.6-plus` e `DeepSeek/deepseek-v4-pro`.
6. Os diagnósticos atuais de tarefas curtas mostram que as respostas de ferramenta/função voltadas ao modelo são limitadas, mas a captura local do resultado da ferramenta e o estado do runtime ainda podem aumentar o heap/RSS em casos de saída grande. Isso mantém a retenção de saída grande no caminho de investigação.

Lacunas atuais:

1. A matriz de benchmark de tarefas curtas ainda é de curta duração. Uma execução interativa posterior de revisão longa reproduziu uma falha de 41,9 min, mas ainda é uma única amostra e precisa de execuções repetidas mais atribuição de heap/objeto.
2. Os contadores atuais são suficientes para atribuir o RSS da árvore de processos e o tamanho da requisição, mas não para nomear o grafo de objetos JS retido durante sessões longas.
3. O RSS de inicialização/configuração e o OOM de sessão longa devem permanecer como trilhas separadas. MCP e relançamento explicam uma grande faixa de RSS ociosa/inicialização; eles não explicam por si só o OOM do heap V8 após tarefas longas.
4. A memória da TUI interativa ainda precisa de uma execução separada do modo não interativo, porque o histórico da UI e a saída estática do Ink não são exercitados da mesma forma.

## Evidências de OOM em Tarefas Longas a Partir de Issues e PRs

As evidências de issues/PRs apontam para várias formas diferentes de OOM, não um único modo de falha:

| Fonte                                                                                                                  | Resumo da evidência                                                                                                                                      | Hipótese a testar                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [`#4309`](https://github.com/QwenLM/qwen-code/issues/4309)                                                             | Usuário relata uso de memória de 5,84 GiB / aviso de 7,02 GiB com modo YOLO e backend DeepSeek; aumentar a memória do Node para 8 GiB não removeu o sintoma | Loops autônomos longos de ferramentas podem reter estado suficiente que simplesmente aumentar o limite de old space não é uma correção raiz |
| [`#4149`](https://github.com/QwenLM/qwen-code/issues/4149)                                                             | Múltiplos relatos mostram `Ineffective mark-compacts near heap limit`, incluindo casos de limite de heap de 4 GiB e muito maiores                        | Uma grande fração do heap é estado de aplicação alcançável, não lixo imediatamente coletável                                                  |
| [`#4116`](https://github.com/QwenLM/qwen-code/issues/4116)                                                             | OOM ocorreu enquanto a exibição de contexto estava em torno de 9,5%; análise aponta para `structuredClone`, histórico da UI, árvore estática do Ink e janelas de contexto grandes | O uso de tokens pode ser baixo enquanto a pressão no heap JS é alta; o limite de tokens sozinho não é uma proteção de memória confiável      |
| [`#4167`](https://github.com/QwenLM/qwen-code/issues/4167)                                                             | Usuário diz que a falha ocorreu durante a compressão; análise identifica o pico de memória da compressão como uma forma distinta                        | A compressão pode criar um pico quando o heap já está alto, especialmente se o histórico é clonado/stringificado ao mesmo tempo           |
| [`#2128`](https://github.com/QwenLM/qwen-code/issues/2128)                                                             | Relatório identifica histórico de UI ilimitado, diffs de arquivo/saída de terminal retidos, caches de string-width e serialização de checkpoint            | Sessões longas de TUI interativa podem reter memória fora do histórico do modelo e fora dos benchmarks não interativos                  |
| [`#2562`](https://github.com/QwenLM/qwen-code/issues/2562)                                                             | Relatório foca em `GeminiChat.getHistory()` clonando profundamente todo o histórico em sessões longas                                                  | A clonagem de todo o histórico pode amplificar picos de memória e deve ser medida separadamente do tamanho do estado estável retido      |
| [`#4185`](https://github.com/QwenLM/qwen-code/issues/4185)                                                             | Acompanha a pressão no heap V8 excedendo o limite antes da execução da compactação baseada em tokens                                                     | A proteção de pressão no heap é necessária, mas apenas mitiga sintomas se os dados retidos permanecerem grandes                         |
| [`#4184`](https://github.com/QwenLM/qwen-code/issues/4184)                                                             | Propõe diagnósticos e descarregamento/pré-visualização para grandes resultados de ferramentas retidos                                                   | A saída grande de ferramenta pode ser limitada para requisições do modelo, mas ainda retida na memória quente local                     |
| [`#4186`](https://github.com/QwenLM/qwen-code/pull/4186)                                                               | Rede de segurança de compactação automática por pressão no heap mesclada e acesso O(1) ao último histórico para `nextSpeakerChecker`                      | Cobre parte da amplificação de pressão no heap e clonagem, mas não alega resolver todas as classes de OOM                               |
| [`#4127`](https://github.com/QwenLM/qwen-code/pull/4127), [`#4168`](https://github.com/QwenLM/qwen-code/pull/4168)     | PRs abertos sobre limite de compactação; um usa limites fixos de heap, o outro redesenha limites de tokens e comportamento de compressão                | Trabalho relacionado útil, mas o teste de tarefa longa deve verificar se os sinais de heap, token e compressão se alinham em execuções reais |
| [`#3000`](https://github.com/QwenLM/qwen-code/issues/3000), [`#4183`](https://github.com/QwenLM/qwen-code/issues/4183) | O roteiro de diagnóstico menciona `/doctor memory`, snapshot de heap e linha do tempo de memória limitada                                               | Suporte a snapshot/linha do tempo é necessário para passar da atribuição de RSS para a atribuição de objetos retidos                    |

Interpretação inicial:

- MCP configurado mas não utilizado pode consumir memória porque a inicialização normal conecta-se aos servidores MCP configurados e anuncia suas ferramentas antes que a tarefa precise delas. Na configuração medida, `chrome-devtools` inicia processos extras do MCP Node/npm e também aumenta a contagem de esquemas de ferramentas de 19 para 48. Isso explica uma grande faixa de RSS de inicialização/configuração e também pode aumentar a sobrecarga de requisições repetidas.
- Os relatos de OOM em sessão longa são uma camada diferente. Logs de GC onde Mark-Compact libera muito pouca memória sugerem que o heap está cheio de estado alcançável. Os candidatos mais fortes são objetos de histórico/ferramenta/UI retidos, clones de histórico completo, intermediários de compressão e acumuladores de streaming/log.
- O PR `#4186` é uma mitigação útil porque pode compactar com base na pressão do heap antes que os limites de token sejam acionados e remove um clone desnecessário de histórico completo. Não deve ser tratado como prova de que a retenção de saída grande de ferramenta, a retenção de histórico de UI ou o pico de memória de compressão já estão resolvidos.

## Plano de Validação de Tarefa Longa

O próximo benchmark deve manter duas trilhas separadas:

1. Atribuição de inicialização/configuração: configuração normal vs MCP desabilitado vs apenas `chrome-devtools` vs sem relançamento. Isso explica o que os usuários veem antes que o trabalho significativo comece.
2. Crescimento do runtime em tarefa longa: chamadas de ferramenta repetidas, saídas grandes, compressão, retomada e histórico de UI interativa. Isso explica OOM após trabalho real.

Casos recomendados de tarefa longa:

| Caso                            | Forma                                                                                                                                        | Por que é importante                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Loop longo de revisão de PR     | Repetir prompts de revisão de PR médio/grande por 30, 60 e 120 minutos, com modelo fixo e configuração fixa                                   | Mais próximo de fluxos de trabalho de agente relatados; captura turnos, chamadas de ferramenta, crescimento de tokens e tendência de RSS/heap |
| Retenção de saída grande de ferramenta | Produzir repetidamente saídas de comando limitadas de 1 MiB / 5 MiB / 20 MiB e, em seguida, fazer perguntas de acompanhamento                | Testa se a saída bruta é retida localmente após a truncagem voltada ao modelo                                                         |
| Pressão de compressão           | Usar um limite de old space controlado mais baixo e prompts de contexto grande para acionar a compactação por pressão no heap                  | Verifica se o PR `#4186` é acionado antes do OOM e se a própria compressão cria um novo pico                                          |
| Histórico de TUI interativa     | Executar o mesmo loop longo no modo tmux TUI e comparar com o modo não interativo                                                              | Isola a retenção de histórico de UI, saída estática do Ink, diffs renderizados e exibição de saída de terminal                        |
| Estresse de retomada            | Retomar uma sessão grande salva e continuar o trabalho imediatamente                                                                         | Visa relatos de OOM ao usar `/resume` e o custo de reconstrução de sessão                                                            |
| Acumulador de streaming/logging | Forçar respostas longas em streaming com telemetria/logging ativados vs desativados                                                           | Testa o caminho suspeito de `collected responses` / retenção de logging da análise de issues                                          |
| MCP ocioso vs MCP ativo         | Executar variantes sem MCP, com `chrome-devtools` configurado mas não usado, e com `chrome-devtools` usado ativamente                         | Separa o RSS filho do MCP ocioso da execução real da ferramenta MCP e da sobrecarga de esquema/tokens da ferramenta                   |

Métricas que devem ser registradas por turno ou por intervalo de amostragem:

- RSS raiz atual/pico e RSS da árvore de processos atual/pico.
- Contagem de processos filhos e formas dos principais comandos filhos.
- `heapUsed`, `heapTotal`, `heap_size_limit`, `external` e `arrayBuffers` do V8.
- Contagem de turnos, contagem de requisições, contagem de chamadas de ferramenta e rodadas de chamadas de ferramenta.
- Tokens de entrada/saída/cache/total por requisição e por tarefa completa.
- Bytes do corpo da requisição, bytes do prompt do sistema, bytes do esquema de ferramentas e bytes das respostas de função.
- Contagem de resultados de ferramentas, total de bytes de resultados de ferramentas capturados, máximo de bytes de resultados de ferramentas e bytes de resultados de ferramentas retidos, se disponível.
- Contagem de mensagens do histórico da conversa e tamanho aproximado do histórico em bytes.
- Contagem de itens de histórico de UI apenas interativo e tamanho aproximado de exibição retido.
- Tentativas de compressão, motivo do acionamento da compressão, tokens antes/depois, pressão no heap antes/depois e status de falha da compressão.
- Snapshot de heap ou artefatos de linha do tempo de memória limitada quando a pressão no heap ultrapassar um limite configurado.

Critérios de validação:

1. Repetir pelo menos duas vezes os principais casos de tarefa longa. O RSS de inicialização tem variância visível, então conclusões de execução única devem ser evitadas.
2. Reportar RSS raiz e RSS da árvore de processos separadamente. A pressão de memória visível ao usuário pode vir de processos filhos, enquanto o OOM do V8 vem do heap raiz do Qwen.
3. Tratar uma linha de RSS plana como evidência importante. Se tokens e chamadas de ferramenta crescerem, mas heap/RSS permanecerem planos, o problema provavelmente está em outro lugar.
4. Quando RSS ou heap crescer, correlacionar o crescimento com um sinal específico: bytes de resultados de ferramentas, bytes de histórico, contagem de histórico de UI, evento de compressão, tamanho do acumulador de streaming ou início de processo MCP.
5. Se um snapshot de heap for tirado, escrever um JSON de diagnóstico estruturado primeiro, depois o snapshot. Snapshots de heap podem ser grandes e podem conter strings sensíveis, portanto devem permanecer opcionais e locais.

## Reprodução de Revisão Longa Interativa

Após os prompts curtos não interativos continuarem terminando antes da janela alvo, um benchmark de TUI interativa foi executado com entrada remota. O processo CLI permaneceu vivo em uma sessão enquanto um controlador submetia um turno real de revisão de PR por vez. O próximo turno só era submetido após o assistente emitir o marcador de conclusão daquele turno. Isso evita tratar um prompt curto de uma única vez como uma reprodução de tarefa longa.
Setup:

- Instalado Qwen Code `0.15.11`, modelo `qwen-latest-series-invite-beta-v28`.
- Home temporário da CLI derivado das configurações normais, com configurações MCP e hook removidas. Nenhuma configuração global foi modificada.
- Modo TUI interativo com saída dupla de eventos JSON e entrada remota JSONL.
- Apenas revisão estática de PR. O prompt não permitiu instalação de dependências, build, teste, Playwright, Docker e outros comandos longos de build externo.
- Amostradores RSS externos registraram tanto o RSS da árvore de processos quanto o RSS raiz do Qwen Node a cada 5 segundos.

Outcome:

| Sinal                                  |       Valor |
| -------------------------------------- | ----------: |
| Tempo de parede antes da saída         |    41,9 min |
| Status de saída                        |           1 |
| Rodadas de revisão de PR concluídas    |           6 |
| Registros principais do chat           |       1.076 |
| Telemetria de respostas da API         |         335 |
| Telemetria de chamadas de ferramenta   |         607 |
| Telemetria de chamadas de ferramenta MCP |           0 |
| Respostas da API principal/raiz        |          36 |
| Respostas da API do subagente          |         299 |
| Total de tokens da raiz                |       2,08M |
| Total de tokens do subagente           |      17,24M |
| Total de tokens de telemetria da API   |      19,32M |
| Máx. tokens de entrada da raiz         |      85.655 |
| Máx. tokens de entrada do subagente    |     215.207 |
| RSS máximo de `/usr/bin/time -l`       | 1.072,4 MiB |
| Pico de RSS amostrado da raiz Qwen     | 1.028,2 MiB |
| Pico de RSS amostrado da árvore de processos | 1.038,1 MiB |

O processo encerrou com:

```text
libc++abi: terminating due to uncaught exception of type std::__1::system_error: thread constructor failed: Resource temporarily unavailable
```

Este é um erro de **exaustão de threads**, não um OOM de heap V8. O mecanismo de falha é distinto: o SO recusou-se a criar uma nova thread, provavelmente devido a limites de recursos por processo (`RLIMIT_NPROC`) ou fragmentação de memória impedindo a alocação de pilha. Ainda é relevante porque ocorreu em uma revisão interativa de sessão longa com MCP desabilitado, sem build/teste, onde o próprio processo Qwen Node ultrapassou cerca de 1 GiB de RSS.

A falha ocorreu durante a fase de sumário final, após o controlador já ter concluído seis rodadas de revisão.

Linha do tempo das rodadas e RSS amostrado da raiz Qwen:

| Janela         | Estado da rodada        | RSS máximo da raiz Qwen | RSS da raiz Qwen ao final da janela |
| -------------- | ----------------------- | ----------------------: | ----------------------------------: |
| 0,0-9,0 min    | rodada 1 concluída      |               701,2 MiB |                         255,3 MiB   |
| 9,0-15,1 min   | rodada 2 concluída      |               503,2 MiB |                         494,4 MiB   |
| 15,1-24,1 min  | rodada 3 concluída      |               468,7 MiB |                         457,5 MiB   |
| 24,1-31,9 min  | rodada 4 concluída      |               619,3 MiB |                         602,3 MiB   |
| 31,9-40,3 min  | rodada 5 concluída      |               955,5 MiB |                         955,5 MiB   |
| 40,3-40,4 min  | rodada 6 concluída      |               988,6 MiB |                         988,6 MiB   |
| 40,4-41,9 min  | sumário final / saída   |             1.028,2 MiB |                       1.028,2 MiB   |

Distribuição de tokens e ferramentas:

| Proprietário   | Respostas da API | Tokens de entrada | Tokens de saída | Total de tokens | Máx. entrada |
| -------------- | ---------------: | ----------------: | --------------: | --------------: | -----------: |
| Sessão raiz    |               36 |            2,06M  |          22,2K  |           2,08M |        85.655 |
| Subagentes     |              299 |           17,08M  |         154,6K  |          17,24M |       215.207 |

Telemetria de chamadas de ferramenta por função:

| Ferramenta          | Chamadas | Tamanho do conteúdo capturado |
| ------------------- | -------: | ----------------------------: |
| `read_file`         |      271 |                       1,46 MB |
| `run_shell_command` |      181 |                      164,4 KB |
| `web_fetch`         |       80 |                      846,3 KB |
| `grep_search`       |       25 |                       15,0 KB |
| `glob`              |       15 |                       27,8 KB |
| `todo_write`        |       16 |                       16,1 KB |
| `list_directory`    |        8 |                        6,2 KB |
| `agent`             |       10 |                            0  |
| `tool_search`       |        1 |                        2,1 KB |

O contador de tokens TUI visível superior para um único agente atingiu cerca de 3,83M tokens. A telemetria também mostra o subagente mais pesado em cerca de 4,05M tokens totais, com uma requisição de entrada máxima de 215K tokens. Isso torna a amplificação do subagente o sinal dominante nesta reprodução.

Interpretação:

1. Esta execução separa o crescimento de sessão longa da memória de inicialização/configuração do MCP. O MCP estava desabilitado e não houve chamadas de ferramenta MCP, no entanto o processo raiz Qwen ainda atingiu cerca de 1 GiB de RSS.
2. O pico de memória tardio coincide com rodadas de revisão com muitos subagentes e o sumário final/mesclagem, não com processos filho externos de build/teste.
3. A curva de RSS não é um vazamento linear simples. Ela cai após as primeiras rodadas, depois sobe acentuadamente após rodadas posteriores com subagentes e permanece alta perto da saída.
4. O modo de falha é exaustão de recursos nativos, não um limite de heap V8, portanto a próxima execução deve adicionar amostragem de heap/externo/arrayBuffer/contagem de threads. Apenas o RSS não pode distinguir alocações JS heap de alocações nativas ou pressão de recursos de thread.
5. Os caminhos de código mais fortes a inspecionar continuam sendo: retenção de transcrições de subagentes, mesclagem de resultados de agente, clonagem de histórico completo, gravação de checkpoint/sessão e montagem de sumário/histórico final.

## Reprodução Determinística de Pressão de Clone de Tarefa Enorme

Uma estrutura de estresse determinística foi adicionada como `scripts/memory-pressure-repro.mjs`. Ela não chama um modelo. Em vez disso, constrói um grafo de objetos de sessão longa semelhante ao Qwen com rodadas de revisão raiz, transcrições de subagentes, grandes resultados de ferramentas, JSON de checkpoint e cópias retidas de `structuredClone()`. Isso fornece uma reprodução repetível para o pico de clone e checkpoint suspeito a partir do stack trace OOM fornecido pelo usuário.

A estrutura tem um teste de script leve:

```bash
npx vitest run --config ./scripts/tests/vitest.config.ts \
  scripts/tests/memory-pressure-repro.test.js
```

Resultado: passou, 1 teste.

Execuções controladas usaram `node --max-old-space-size=256` salvo indicação contrária.

| Caso                                             | Formato do histórico                                                        | Pressão de clone/checkpoint                         | Resultado                          |   RSS Máx |
| ------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------- | --------: |
| Sanidade pequena                                 | 2 rodadas, resultado de ferramenta de 2 KiB, 1 subagente                    | 1 clone + 1 checkpoint                              | passou; histórico JSON de 2,6 MiB  |  89,7 MiB |
| Apenas build enorme                              | 12 rodadas, resultado de ferramenta de 256 KiB, 2 subagentes x 12 rodadas subagente | nenhum clone/checkpoint retido           | passou; histórico JSON de 76,2 MiB | 491,5 MiB |
| Enorme + 1 clone                                 | igual ao anterior                                                           | 1 `structuredClone()` retido                        | passou                            | 569,6 MiB |
| Enorme + 2 clones                                | igual ao anterior                                                           | 2 cópias `structuredClone()` retidas                | OOM, saída 134                    | 496,5 MiB |
| Enorme + 1 checkpoint                            | igual ao anterior                                                           | um checkpoint com histórico original + clonado JSON | passou; checkpoint JSON de 152,5 MiB | 926,9 MiB |
| Enorme + 2 checkpoints                           | igual ao anterior                                                           | duas cópias de checkpoint                           | OOM, saída 134                    | 920,1 MiB |
| Enorme + 2 clones, sem transcrições de subagentes retidas | mesma saída gerada de subagente, mas o histórico pai mantém apenas sumários | passou; histórico pai JSON cai para 3,8 MiB        | 136,8 MiB |

A execução com clone enorme que falhou produziu:

```text
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

A pilha nativa incluiu:

- `v8::internal::ValueDeserializer::ReadObjectInternal`
- `v8::internal::ValueDeserializer::ReadDenseJSArray`
- `node::worker::Message::Deserialize`
- `node::worker::StructuredClone`

Isso corresponde à mesma família de pilha do log de OOM fornecido pelo usuário. A reprodução controlada também mostra por que relatos de usuário de 4 GiB / 8 GiB são plausíveis: a falha não é causada por um único objeto grande, mas sim por um grande estado retido de histórico/resultados de ferramentas/subagentes mais uma ou mais cópias de clone ou checkpoint do histórico completo. Aumentar `--max-old-space-size` pode atrasar o crash enquanto preserva o mesmo padrão de amplificação.

Atribuição importante desta execução determinística:

1. Construir um JSON de histórico pai de 76,2 MiB pode ser bem-sucedido sob heap reduzido. O OOM aparece quando cópias adicionais de clone/checkpoint do histórico completo são retidas.
2. Uma única cópia de checkpoint pode empurrar o RSS para perto de 1 GiB mesmo antes do OOM.
3. Remover as transcrições retidas de subagentes do histórico ativo pai altera a mesma carga de trabalho gerada de OOM para uma execução pequena de 136,8 MiB de RSS. Esse é o sinal de mitigação mais claro até agora.
4. Este reprodutor é sintético e intencionalmente adversarial, mas exercita a mesma forma de grafo de objetos da revisão interativa longa: sessão pai, subagentes, grandes saídas de ferramentas, mesclagem de transcrições e pressão de clone do histórico completo.

## Acompanhamento de Tamanho de PR com DeepSeek

Após a matriz de modelos inicial, uma execução adicional apenas com Qwen Code testou `DeepSeek/deepseek-v4-pro` em três tamanhos reais de PR. Este modelo é configurado através do protocolo compatível com Anthropic; a execução compatível com OpenAI retornou 404 em uma verificação rápida, então o benchmark bem-sucedido usa `--auth-type anthropic`.

O branch de diagnóstico foi estendido para registrar resumos de requisição wire Anthropic com a mesma regra de privacidade do caminho OpenAI: apenas contagens agregadas e tamanhos de bytes, sem texto de prompt, conteúdo de diff, argumentos de ferramenta, cabeçalhos, URL base ou chave de API.

Tamanhos de PR:

| Tamanho | PR       | Estado  | Arquivos | Linhas alteradas | Título                                                                  |
| ------- | -------- | ------- | -------: | ---------------: | ----------------------------------------------------------------------- |
| pequeno | `#4268`  | merged  |        1 |                1 | fix(serve): add mcp_guardrails to E2E capabilities expectation          |
| médio   | `#4186`  | merged  |        6 |              494 | fix(core): add heap-pressure auto-compaction safety net                 |
| grande  | `#4168`  | open    |       25 |            4.750 | feat(core)!: redesign auto-compaction thresholds with three-tier ladder |

Tempo de execução:

| Tamanho | PR       |  Parede | Rodadas | Total de tokens | Tokens de leitura de cache | Pico de RSS da árvore | Pico de RSS raiz | Heap final |  RSS final |
| ------- | -------- | ------: | ------: | --------------: | ------------------------: | --------------------: | ----------------: | ---------: | ---------: |
| pequeno | `#4268`  |   39,7s |       2 |          43.362 |                    28.672 |           346,9 MiB   |         344,8 MiB  |  115,2 MiB |  304,3 MiB |
| médio   | `#4186`  |  142,6s |       4 |         135.120 |                   115.840 |           340,7 MiB   |         337,3 MiB  |  103,5 MiB |  285,6 MiB |
| grande  | `#4168`  |  191,1s |       8 |         386.891 |                   332.928 |           360,0 MiB   |         336,3 MiB  |  119,3 MiB |  237,9 MiB |

Diagnósticos de requisição e ferramentas:

| Tamanho | PR       | Requisições | Requisições wire Anthropic | Tamanho máximo do corpo Anthropic | Sistema máximo | Esquema de ferramenta máximo | Chamadas de ferramenta | Total de resultado de ferramenta | Máximo resultado de ferramenta | Máxima resposta de função na requisição |
| ------- | -------- | ----------: | ------------------------: | --------------------------------: | -------------: | ---------------------------: | --------------------: | ------------------------------: | ----------------------------: | --------------------------------------: |
| pequeno | `#4268`  |           2 |                         2 |                        103,0 KiB  |      50,8 KiB  |                    47,6 KiB  |                    3 |                         0,6 KiB |                       0,5 KiB |                               1,1 KiB |
| médio   | `#4186`  |           4 |                         4 |                        159,8 KiB  |      50,8 KiB  |                    47,6 KiB  |                    5 |                        30,2 KiB |                      29,3 KiB |                              56,7 KiB |
| grande  | `#4168`  |           8 |                         8 |                        289,5 KiB  |      50,8 KiB  |                    47,6 KiB  |                   11 |                       235,0 KiB |                     232,1 KiB |                             182,4 KiB |

Observações sobre DeepSeek:

1. O tamanho do PR escalou claramente em rodadas, tokens, tamanho do corpo wire Anthropic e tamanho do resultado da ferramenta, mas não escalou o RSS proporcionalmente. Os picos de RSS da árvore pequeno/médio/grande permaneceram em uma faixa estreita de `340,7-360,0 MiB`.
2. O PR grande foi caro principalmente em rodadas de modelo e volume de tokens: 8 requisições e 386.891 tokens totais. Seu corpo máximo Anthropic foi de 289,5 KiB, muito maior que as execuções compatíveis com OpenAI, mas o RSS ainda permaneceu próximo da mesma faixa de bundle local.
3. O custo estático da requisição Anthropic também é visível: o prompt do sistema tem cerca de 50,8 KiB e o esquema de ferramenta cerca de 47,6 KiB por requisição. Rodadas repetidas são, portanto, um grande amplificador de tokens.
4. O PR grande produziu 235,0 KiB de resultados de ferramentas capturados e 182,4 KiB de resposta máxima de função em uma requisição. Isso é maior que os casos anteriores de PR pequeno / navegação de código e mostra que PRs grandes ainda colocam pressão no tratamento local de resultados de ferramentas e na montagem de requisições, mesmo quando o RSS não dispara.
5. A execução com DeepSeek reforça a conclusão sobre escolha de modelo: a escolha de provedor/modelo altera fortemente rodadas, latência, volume de tokens e formato da carga wire, mas o pico de RSS do bundle local permanece dominado pela forma de execução do Qwen Code, em vez de escalar linearmente com o tamanho do PR.

## Replay JSONL de Revisão Longa: Pressão de Clone de Histórico

Um registro recente de chat de revisão de PR longo foi analisado como uma forma post-mortem para a classe de OOM reportada. O JSONL bruto não está incluído aqui porque contém texto de prompt e saída de ferramenta. A forma agregada é:

| Sinal                           | Valor                        |
| ------------------------------- | ---------------------------- |
| Duração                         | 87,0 min                     |
| Versão do Qwen Code             | 0.15.10                      |
| Modelo                          | modelo beta qwen-latest-series |
| Respostas da API                | 380                          |
| Telemetria de chamadas de ferramenta | 507 eventos           |
| Telemetria de chamadas de ferramenta MCP | 4 eventos          |
| Respostas da API do subagente   | 313                          |
| Respostas da API raiz           | 67                           |
| Crescimento do prompt raiz      | 38.622 -> 168.555 tokens     |
| Máx. tokens de prompt           | 168.555                      |
| Total de tokens de resposta     | 31,28M                       |

Esta forma não suporta MCP como a causa primária do OOM para este caso. Apenas 4 dos 507 eventos de telemetria de chamadas de ferramenta eram MCP, e todos os quatro registraram `content_length=0`. A forma dominante é amplificação de sessão longa/subagente: 15 chamadas `agent` produziram 313 respostas de API de subagente e 403 eventos de chamada de ferramenta de subagente.

O replay então reconstruiu a forma da mensagem `Content[]` do chat a partir do JSONL e executou testes controlados de pressão de clone/stringify. A carga útil da mensagem retida base é pequena, então não é suficiente por si só para causar OOM:

| Escala do replay | Clones retidos | Histórico JSON | Checkpoint JSON | Heap final |  RSS final |
| ---------------- | -------------: | -------------: | --------------: | ---------: | ---------: |
| 1x               |              8 |        0,54 MB |         1,08 MB |   18,0 MB  |   88,8 MB  |
| 30x              |              8 |       14,46 MB |        28,92 MB |  260,0 MB  |  577,8 MB  |
| 60x              |              8 |       28,86 MB |        57,71 MB |  510,3 MB  |  960,8 MB  |

O replay em escala não é uma alegação de dados do usuário; é uma amplificação controlada da forma JSONL observada para testar se a serialização de clone de histórico completo e checkpoint pode criar o mesmo modo de falha dos relatos.

Uma reprodução com heap baixo usando `--max-old-space-size=256` confirma o mecanismo:

| Caso                             | Histórico JSON | Resultado                                             |
| -------------------------------- | -------------: | ----------------------------------------------------- |
| Apenas construir histórico       |       38,4 MB | Bem-sucedido; heap 131,6 MB, RSS 378,2 MB                |
| Construir + um clone             |       38,4 MB | Bem-sucedido; heap 183,3 MB, RSS 463,4 MB                |
| Construir + clones repetidos     |       38,4 MB | OOM após várias cópias `structuredClone()` retidas      |
| Checkpoint com histórico duplicado |     38,4 MB | OOM ao manter histórico mais histórico de cliente clonado |

A pilha de OOM com clones repetidos contém `ValueDeserializer::ReadObjectInternal`, `ValueDeserializer::ReadDenseJSArray`, `node::worker::Message::Deserialize` e `node::worker::StructuredClone`, correspondendo à mesma família de pilha vista no log de OOM fornecido pelo usuário. Isso prova que `structuredClone()` do histórico completo pode ser o gatilho imediato do OOM sem qualquer envolvimento do servidor MCP.

Hipótese de trabalho atual para esta classe de JSONL:

1. MCP pode explicar o RSS de inicialização de configuração normal em benchmarks separados, mas não é o gatilho provável para esta forma de OOM de revisão longa.
2. O crescimento de tarefa longa vem do histórico de chat retido, grandes saídas de ferramentas, históricos de subagentes, mensagens de agente observáveis e estado de ferramenta de resultado/UI.
3. O gatilho imediato do OOM pode ser um clone de histórico completo ou serialização dupla tipo checkpoint após o heap já estar alto.
4. A compressão pode mitigar o histórico retido, mas a própria compressão pode criar um pico temporário se primeiro clonar ou serializar um histórico grande.

### Validação de Mitigação Local: Caso de Revisão de PR com MCP Desabilitado

Duas mitigações direcionadas foram aplicadas localmente e validadas antes de reexecutar um caso de revisão de PR com MCP desabilitado:

1. `checkNextSpeaker()` agora lê apenas a última mensagem curada com `getHistoryTail(1, true)` e envia apenas essa mensagem para a consulta lateral do próximo falante. O prompt do próximo falante pergunta apenas sobre a resposta do modelo imediatamente anterior, então enviar o histórico completo era uma pressão desnecessária de clone e tokens.
2. `AgentToolInvocation` não retém mais arrays completos de `responseParts` dentro da exibição ativa de `task_execution.toolCalls`. As partes reais da resposta ainda fluem pelos caminhos de transcrição/histórico, mas a exibição da UI pai agora mantém apenas um resumo de texto limitado para streaming aninhado de resultados de ferramenta, em vez de manter outra cópia completa das grandes saídas de ferramentas de subagente durante execuções longas.
3. `GeminiChat.sendMessageStream()` agora constrói o conteúdo da requisição do modelo através de uma visão de histórico curada interna, em vez de chamar o público `getHistory(true)`. O `getHistory()` público ainda retorna um `structuredClone()` defensivo para chamadores externos, mas o caminho quente da requisição não faz mais um deep-clone de todo o histórico de chat retido antes de cada chamada de modelo.

Verificações TDD adicionadas para estas mitigações:

| Test                                                                                                                     | Proteção esperada                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `checkNextSpeaker > should send only the last curated model message to the side query`                                   | Previne clone/envio do histórico completo em verificações de próximo falante                 |
| `AgentTool > should not retain responseParts in live tool call display after TOOL_RESULT`                                | Previne que a exibição ao vivo do subagente retenha grandes respostas de ferramentas        |
| `AgentTool > should keep only a bounded result summary in live tool call display`                                        | Preserva a legibilidade do resultado aninhado sem reter o corpo completo da resposta         |
| `GeminiChat > sendMessageStream > does not deep-clone the full curated history when building request contents`           | Previne que a preparação da requisição acione o caminho OOM `ValueDeserializer` / `StructuredClone` |
Reprodução adicional e validação da correção:

| Etapa                                | Comando                                                                                                                                    | Resultado                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Pressão de clone determinística pré-correção | `node --max-old-space-size=256 scripts/memory-pressure-repro.mjs ... --clone-count=2 --mode=clone`                                         | OOM, saída 134; stderr continha `Reached heap limit` e `ValueDeserializer` / `StructuredClone`; RSS máximo 528.1 MiB na execução repetida |
| Teste vermelho                       | Teste direcionado do `GeminiChat` com `structuredClone` forçado a lançar exceção durante a configuração da requisição                       | falhou em `GeminiChat.getHistory()` antes da mitigação                                                                                  |
| Teste verde                          | Mesmo teste direcionado do `GeminiChat` após a mitigação                                                                                    | passou                                                                                                                                 |
| Smoke do código compilado            | `node --max-old-space-size=256` contra o pacote core compilado, com um histórico de 96 entradas / aproximadamente 48 MiB e `structuredClone` forçado a lançar exceção | passou; requisição tinha 97 conteúdos; RSS do processo 161.4 MiB, `/usr/bin/time -l` max RSS 161.6 MiB                                  |

Isso restringe a afirmação anterior de "mesma família de pilha": o OOM
sintético determinístico ainda prova que clones completos retidos podem falhar
na mesma família de pilha V8 que o log do usuário, enquanto o novo teste
vermelho/verde do `GeminiChat` prova que um caminho real de configuração de
requisição em produção não atinge mais aquele ponto de clone.
Os internos de checkpoint/resume e compressão ainda precisam de validação
separada em execução longa, pois podem legitimamente precisar de histórico
copiado durável.

Comandos de verificação:

| Comando                                                                                              | Resultado                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run src/core/geminiChat.test.ts`                                                         | passou, 89 testes                                                                                                                   |
| `npx vitest run src/utils/nextSpeakerChecker.test.ts --coverage=false`                               | passou, 13 testes                                                                                                                   |
| `npx vitest run src/tools/agent/agent.test.ts --coverage=false`                                      | passou, 77 testes                                                                                                                   |
| `npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/memory-pressure-repro.test.js` | passou, 1 teste                                                                                                                     |
| `npm run build --workspace=packages/core`                                                            | passou                                                                                                                              |
| `npm run build --workspace=packages/cli`                                                             | passou                                                                                                                              |
| `npm run typecheck --workspace=packages/core`                                                        | passou                                                                                                                              |
| `npm run typecheck --workspace=packages/cli`                                                         | passou                                                                                                                              |
| `npm run bundle`                                                                                     | passou                                                                                                                              |
| `npm run build`                                                                                     | falhou em `packages/vscode-ide-companion` lint em regras de importação de módulos internos existentes; core, CLI, bundle e testes direcionados acima passaram |

O `npm run build` completo da raiz não ficou limpo nesta árvore de trabalho
porque o pacote `vscode-ide-companion` atingiu erros de lint pré-existentes de
`import/no-internal-modules`. A compilação do core/CLI e o bundle necessários
para o teste de execução local foram concluídos com sucesso.

O mesmo prompt de revisão de PR foi então executado com uma configuração
temporária onde MCP e hooks estavam desabilitados. Ambas as linhas foram
interrompidas após uma janela limitada de execução longa, em vez de esperar a
revisão completa terminar. **Ressalva**: as duas execuções são confundidas pelo
tamanho da carga de trabalho (79K vs 390K tokens) e não podem ser comparadas
como um experimento controlado. A comparação mostra apenas evidência direcional.

| Variante            | Tempo de execução | Servidores MCP | Ferramentas | Mensagens do assistente | Blocos de uso/resultado de ferramenta | IDs de ferramenta pai | Total de tokens | Máx. tokens de entrada | RSS máximo da raiz |
| ------------------- | ----------------- | -------------- | ----------- | ----------------------- | ------------------------------------- | -------------------- | --------------- | -------------------- | ----------------- |
| antes da mitigação  | 365,08s           | 0              | 19          | 42                      | 42 / 42                               | 3                    | 79.439          | 26.807               | 357,7 MiB         |
| após a mitigação    | 404,52s           | 0              | 19          | 58                      | 52 / 42                               | 2                    | 390.339         | 54.000               | 310,5 MiB         |

Isso não é um benchmark determinístico comparável modelo a modelo: a execução
com correção fez mais trabalho e consumiu substancialmente mais tokens totais
antes do corte manual. O sinal útil é mais estreito: em um caso de revisão com
MCP desabilitado e mais trabalho observado, o RSS máximo da raiz não aumentou
e foi cerca de 47,2 MiB menor. Isso suporta a direção da mitigação, mas não
prova que toda a classe de OOM em tarefas longas foi corrigida.

Caminhos restantes de alto risco de clone/retenção a inspecionar a seguir:

1. A compressão ainda chama `getHistory(true)` completo antes da sumarização.
   Se o heap já estiver alto, a tentativa de compressão pode criar o pico que
   causa o OOM.
2. A criação de checkpoint pode manter o histórico original, o histórico clonado
   do cliente e um payload de checkpoint serializado ao mesmo tempo.
3. Subagentes fork ainda são semeados a partir do histórico pai com
   `getHistory(true)`.
4. Exportação ACP/histórico/sumarização/caminhos de cópia ainda chamam
   `getHistory()` completo e devem ser auditados separadamente do loop normal
   de revisão.

Cronologia das versões:

| Issue | Criada    | Versão reportada        | Sinal                                   |
| ----- | --------- | ----------------------- | --------------------------------------- |
| #2128 | 2026-03-05 | não especificada        | Crescimento de memória da UI em sessões longas |
| #2562 | 2026-03-21 | não especificada        | OOM do `structuredClone` em sessões longas |
| #2868 | 2026-04-03 | 0.13.2                  | OOM no heap                             |
| #2945 | 2026-04-07 | 0.14.0                  | OOM no heap V8                          |
| #4116 | 2026-05-13 | 0.15.11                 | OOM com análise no estilo structured-clone |
| #4134 | 2026-05-14 | 0.15.11                 | OOM                                     |
| #4149 | 2026-05-14 | 0.15.10-nightly.20260513 | OOM no heap V8                          |
| #4167 | 2026-05-15 | 0.15.11                 | Crash perto da compressão               |
| #4185 | 2026-05-15 | 0.15.11                 | Pressão no heap antes da compactação de tokens |
| #4254 | 2026-05-17 | não especificada        | Memória continua aumentando             |
| #4276 | 2026-05-18 | 0.15.11                 | OOM no heap V8                          |
| #4309 | 2026-05-19 | 0.15.11                 | Aviso de memória alta em torno de 7 GiB |

O histórico de issues não prova que a versão 0.15.10 introduziu a classe de
OOM; relatos similares existiam em março e abril. Ele suporta um aglomerado
recente começando por volta de 2026-05-13, sobrepondo os lançamentos
`v0.15.10`/`v0.15.11`. O diff relevante entre `v0.15.9` e `v0.15.10` mexeu
intensamente no runtime de subagentes, execução não interativa, `GeminiChat` e
código de compressão, portanto esse intervalo é uma janela de bissecção inicial
razoável.

## Notas

- O primeiro prompt de navegação de código permitia exploração aberta e atingiu
  `maxSessionTurns`; as linhas bem-sucedidas acima usam uma lista de comandos
  restrita.
- A primeira tentativa de diff sintético usou um caminho de bundle relativo de
  dentro dos repositórios temporários; essas falharam imediatamente e estão
  excluídas das tabelas. As linhas bem-sucedidas usam o caminho absoluto do
  bundle local.
- Os streams JSONL brutos não são commitados porque contêm prompts, comandos de
  ferramenta e saída de ferramenta. O relatório inclui apenas diagnósticos
  agregados.