# Relatório de Benchmark de Memória em Tempo de Execução do Qwen Code

Data: 2026-05-18

## Resumo

Este relatório registra benchmarks de memória local para o comportamento em tempo de execução do Qwen Code. Ele compara o Qwen Code entre diferentes modelos e compara o Qwen Code com o Claude Code nas mesmas formas de tarefas, quando endpoints de modelo equivalentes estavam disponíveis.

O resultado principal é consistente na matriz mais recente (execução única por célula, sem repetição estatística):

- Pico de RSS da árvore de processos do Qwen Code: cerca de `852-1062 MiB` (`0,83-1,04 GiB`).
- Pico de RSS da árvore de processos do Claude Code: cerca de `279-366 MiB` (`0,27-0,36 GiB`).
- O Qwen Code foi cerca de `2,3x-3,6x` maior nos benchmarks de tarefas CLI não interativas testadas.

Nota: o RSS da árvore de processos inclui processos filhos MCP (cerca de 350 MiB de overhead no lado do Qwen). Isso inflaciona os números absolutos, mas a comparação relativa continua informativa, já que ambos os CLIs foram medidos da mesma forma.

A diferença se reproduziu em workloads pequenos de revisão de PR, navegação de código e diff sintético. Portanto, é improvável que seja explicada apenas por um PR grande ou por um único provedor de modelo.

Este relatório tem como objetivo tornar visível a investigação atual de desempenho: o que foi medido, qual conclusão já é suportada, o que ainda é desconhecido e quais diagnósticos devem ser adicionados a seguir.

## Ambiente de Teste

| Item                                          | Valor                                      |
| --------------------------------------------- | ------------------------------------------ |
| Data                                          | 2026-05-18                                 |
| Plataforma                                    | Máquina local de desenvolvimento macOS     |
| Versão do Qwen Code                           | `0.15.11`                                  |
| Binário do Qwen Code                          | Binário `qwen` resolvido no PATH           |
| Versão do Claude Code usada na matriz mais recente | `2.1.129`                              |
| Binário do Claude Code usado na matriz mais recente | Binário `claude` resolvido no PATH   |
| Versão do Node.js                             | v22.x (instalação padrão do sistema)       |
| Método de amostragem                          | Amostragem externa de RSS com `ps` uma vez por segundo |
| Métrica principal                             | Pico de RSS da árvore de processos         |

O RSS da árvore de processos é usado como métrica principal porque o Qwen Code inicia um wrapper raiz e um worker filho Node/Qwen. Olhar apenas para o processo raiz pode subestimar a pegada de memória vista pelos usuários.

Diretórios de configuração temporários do CLI foram usados para execuções da matriz, para que os benchmarks não dependessem do estado global do CLI.

## Artefatos do Benchmark

Cinco relatórios locais foram produzidos antes deste relatório consolidado:

1. Execução de memória de revisão de PR do Qwen Code.
2. Execução de comparação de modelos do Qwen Code.
3. Comparação estrita entre Qwen Code e Claude Code com `pai/glm-5`.
4. Qwen Code vs Claude Code, dois CLIs com dois modelos.
5. Qwen Code vs Claude Code, matriz de cinco casos.

Este relatório consolidado abrange as conclusões e métricas principais de todos os cinco relatórios. Ele não incorpora todas as linhas brutas de amostragem, transcrições de terminal ou artefatos temporários de execução. Esses artefatos brutos permaneceram em diretórios `tmp/` locais porque são saídas de experimentos, e não fixtures estáveis do repositório.

A matriz mais recente é a evidência mais forte porque cobre múltiplas formas de tarefas, e não apenas um workload de revisão de PR.

## Conclusão Preliminar

Os dados atuais são suficientemente fortes para afirmar que o Qwen Code tem uma pegada de memória em tempo de execução maior que o Claude Code nestes benchmarks locais de tarefas CLI não interativas. Ainda não são fortes o suficiente para apontar uma única causa raiz definitiva.

A principal hipótese é uma diferença no runtime/caminho do Qwen Code, e não uma diferença de provedor de modelo:

- a diferença se reproduz tanto com `pai/glm-5` quanto com `qwen3.6-plus`;
- a diferença se reproduz em tarefas pequenas de PR e navegação de código, não apenas em tarefas com grandes diffs;
- o Qwen Code envia ou contabiliza mais tokens que o Claude Code para trabalhos semelhantes;
- o maior componente observado no Qwen Code é o processo filho Node/Qwen worker, o que aponta para a pegada do processo durante a tarefa, carregamento de módulos, montagem de contexto, histórico ativo, retenção de resultados de ferramentas ou caminhos de subagentes/saídas salvas.

A medição mais útil a seguir, portanto, não é outra execução apenas com RSS externo. A próxima medição deve dividir o RSS em heap V8, memória nativa, tamanho da sessão/histórico, tamanho retido de resultados de ferramentas e atividade de subagentes/árvore de processos.

## Análise Inicial de Causa

O benchmark ainda não comprova uma única causa raiz, mas restringe a área provável do problema.

| Sinal                                                                                       | O que sugere                                                                           | O que não prova                                                                                  |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Qwen permanece próximo de `1 GiB` em casos pequenos de PR e navegação de código             | Um custo alto em tempo de execução não interativo provavelmente está envolvido         | Não identifica se a pegada é heap V8, memória nativa, carregamento de módulos ou estado retido   |
| Tamanho do diff de 100 KiB a 5 MiB não escala linearmente com o RSS                         | Apenas bytes brutos de diff provavelmente não são o principal driver                   | Saídas grandes ainda podem amplificar a memória em fluxos reais de revisão de PR                 |
| Qwen usa mais tokens que Claude em todas as células da matriz                               | Qwen provavelmente constrói ou retém um estado maior de prompt/contexto/resultado de ferramenta para trabalho similar | Contagem de tokens não é o mesmo que memória de processo e pode ser um efeito, não a causa       |
| Contagens de chamadas de ferramenta são semelhantes, e Claude às vezes usa mais turnos/chamadas com menor RSS | Uma cadeia mais longa de chamadas de ferramenta provavelmente não é a principal explicação por si só | Tamanho da saída das ferramentas e retenção ainda precisam ser medidos                           |
| Execuções anteriores com PRs grandes mostraram recuperação de saídas salvas e amplificação de subagentes | Truncamento de saída de ferramentas e caminhos de saídas salvas são provavelmente amplificadores em workloads pesados | Eles não explicam toda a pegada de execução em tarefas pequenas                                  |

A melhor explicação atual é, portanto:

1. **Custo do runtime em tempo de tarefa primeiro**: o Qwen Code provavelmente inicializa ou retém mais estado do runtime durante a execução de tarefas CLI não interativas do que o Claude Code. Isso pode incluir runtime do agente, registro de ferramentas, adaptadores de provedor, serviços de sessão ou estruturas de interface/histórico que não são estritamente necessárias para uma tarefa curta não interativa.
2. **Volume de contexto/resultado de ferramenta em segundo**: o Qwen Code parece carregar um contexto maior voltado para o modelo ou para a sessão em trabalhos semelhantes. A diferença de tokens torna a montagem de contexto, a normalização de resultados de ferramentas e a retenção de histórico suspeitas importantes.
3. **Amplificação de saídas grandes em terceiro**: a revisão de PRs grandes pode acionar caminhos adicionais de saídas salvas e subagentes. Provavelmente não são a única causa, mas podem piorar a pressão de memória e tokens em tarefas de revisão realistas.

A próxima execução de diagnóstico deve responder onde está o `~1 GiB`:

- alto imediatamente após a inicialização: custo de inicialização de módulo/runtime;
- salta após execução de ferramenta: retenção de saída de ferramenta ou normalização de resultado;
- salta durante a montagem da requisição: construção de contexto ou históricos duplicados;
- cresce após streaming/compressão: retenção de resposta ou estado de compressão;
- principalmente RSS fora do heap V8: buffers nativos, módulos carregados ou memória externa.

## Matriz Mais Recente

O benchmark mais recente executou:

- 2 CLIs: Qwen Code e Claude Code.
- 2 rótulos de modelo: `pai/glm-5` e `qwen3.6-plus`.
- 5 casos:
  - revisão de PR pequena: PR `#4268`, alteração de uma linha
  - navegação de código: `rg` mais `sed` em arquivos relacionados a compressão
  - diff local sintético, aproximadamente 100 KiB
  - diff local sintético, aproximadamente 1 MiB
  - diff local sintético, aproximadamente 5 MiB

Todas as 20 execuções terminaram com código `0` e sem timeout.

## Resultados da Matriz

| Caso             | Modelo          | Pico de árvore Qwen | Pico de árvore Claude | Qwen / Claude |
| ---------------- | -------------- | ------------------: | --------------------: | ------------: |
| PR pequeno `#4268` | `pai/glm-5`    |         1032,7 MiB |           357,8 MiB |        2,89x |
| PR pequeno `#4268` | `qwen3.6-plus` |          852,2 MiB |           365,5 MiB |        2,33x |
| Navegação código  | `pai/glm-5`    |          993,1 MiB |           359,6 MiB |        2,76x |
| Navegação código  | `qwen3.6-plus` |          996,9 MiB |           349,0 MiB |        2,86x |
| diff 100 KiB     | `pai/glm-5`    |         1012,1 MiB |           350,8 MiB |        2,89x |
| diff 100 KiB     | `qwen3.6-plus` |         1001,1 MiB |           336,2 MiB |        2,98x |
| diff 1 MiB       | `pai/glm-5`    |         1008,3 MiB |           278,8 MiB |        3,62x |
| diff 1 MiB       | `qwen3.6-plus` |         1003,3 MiB |           340,5 MiB |        2,95x |
| diff 5 MiB       | `pai/glm-5`    |          858,8 MiB |           323,2 MiB |        2,66x |
| diff 5 MiB       | `qwen3.6-plus` |         1062,0 MiB |           331,2 MiB |        3,21x |

Pico médio de RSS da árvore de processos por caso:

| Caso             | Média pico árvore Qwen | Média pico árvore Claude |
| ---------------- | ---------------------: | -----------------------: |
| PR pequeno `#4268` |              942,5 MiB |               361,6 MiB |
| Navegação código  |              995,0 MiB |               354,3 MiB |
| diff 100 KiB     |             1006,6 MiB |               343,5 MiB |
| diff 1 MiB       |             1005,8 MiB |               309,6 MiB |
| diff 5 MiB       |              960,4 MiB |               327,2 MiB |

## Sinais de Tempo de Execução e Tokens

A mesma matriz também mostrou o Qwen Code usando mais tokens do lado do modelo em cada caso testado.

Exemplos selecionados:

| Caso            | Modelo          | CLI    | Duração | Turnos | Total tokens | Chamadas de ferramenta |
| --------------- | -------------- | ------ | -------: | -----: | -----------: | ---------------------: |
| PR pequeno      | `pai/glm-5`    | Qwen   |    25,2s |      2 |       32.567 |                      3 |
| PR pequeno      | `pai/glm-5`    | Claude |    21,1s |      4 |        7.899 |                      3 |
| Navegação código | `qwen3.6-plus`| Qwen   |    25,2s |      2 |       38.151 |                      3 |
| Navegação código | `qwen3.6-plus`| Claude |    46,9s |      6 |       25.861 |                      5 |
| diff 100 KiB    | `qwen3.6-plus` | Qwen   |    16,5s |      3 |       57.185 |                      2 |
| diff 100 KiB    | `qwen3.6-plus` | Claude |    17,2s |      3 |        6.377 |                      2 |
| diff 5 MiB      | `pai/glm-5`    | Qwen   |    23,2s |      2 |       38.574 |                      2 |
| diff 5 MiB      | `pai/glm-5`    | Claude |     9,8s |      3 |        5.285 |                      2 |

Essa diferença de tokens não prova que o volume de tokens é a causa raiz da memória, mas sugere que a montagem de contexto, a retenção de resultados de ferramentas ou a normalização de resposta devem ser medidas juntamente com as estatísticas de RSS e heap V8.

## Análise de Uso de Tokens

A diferença de tokens é uma das pistas mais fortes, mas precisa de métricas internas de requisição antes de ser tratada como causa raiz.

O que os dados suportam hoje:

- O Qwen Code usou mais tokens totais que o Claude Code em todas as células da matriz.
- A diferença aparece mesmo quando as contagens de chamadas de ferramenta são semelhantes.
- Claude às vezes usou mais turnos ou chamadas de ferramenta enquanto ainda usava menos memória.

O que isso sugere:

- É improvável que o delta de tokens venha apenas de uma cadeia mais longa de chamadas de ferramenta.
- Qwen pode estar carregando um estado de prompt/contexto estático maior, esquemas de ferramentas maiores, resultados de ferramentas serializados maiores ou mais conteúdo de conversa/sessão retido.
- Fluxos com saídas grandes podem adicionar outra camada através de truncamento, recuperação de saídas salvas ou caminhos de subagentes.

O que ainda está faltando:

- detalhamento de tokens de entrada por requisição;
- tamanhos de tokens do prompt do sistema e esquemas de ferramentas;
- tamanhos retidos de mensagens e resultados de ferramentas antes de cada requisição ao modelo;
- se saídas grandes são retidas em vários lugares, como histórico do modelo, histórico da interface, gravação de sessão ou armazenamento de saídas salvas.

Essas métricas ausentes são o motivo pelo qual o próximo passo deve adicionar diagnósticos internos, em vez de apenas repetir o benchmark externo de RSS.

## Sinal Anterior de Revisão de PR Grande

Um benchmark estrito anterior de revisão de PR usou o PR `#4186` e mostrou a mesma forma geral:

| Modelo          | CLI         | Pico de RSS da árvore de processos |
| -------------- | ----------- | --------------------------------: |
| `pai/glm-5`    | Qwen Code   |                       1000,7 MiB |
| `pai/glm-5`    | Claude Code |                        349,0 MiB |
| `qwen3.6-plus` | Qwen Code   |                       1095,8 MiB |
| `qwen3.6-plus` | Claude Code |                        341,1 MiB |

Essa execução anterior não era suficiente por si só, pois um PR grande pode acionar caminhos incomuns de saída de ferramentas e saídas salvas. A matriz mais recente de cinco casos torna a descoberta mais forte, pois tarefas pequenas de PR e navegação de código também reproduzem a diferença.

## Hipótese de Trabalho

As evidências atuais suportam estas hipóteses, em ordem de prioridade:

1. O Qwen Code tem uma pegada de processo em tempo de tarefa não interativa maior que o Claude Code. O worker filho Node do Qwen era tipicamente o maior processo na amostragem local, geralmente em torno de `0,7-0,8 GiB`.
2. A escolha do modelo não é a principal explicação. Tanto `pai/glm-5` quanto `qwen3.6-plus` mostraram a mesma diferença geral entre Qwen e Claude.
3. Apenas o tamanho grande do diff não é a principal explicação. O tamanho do diff sintético não escalou linearmente de 100 KiB para 5 MiB, provavelmente porque o truncamento de saída de ferramentas limita quanto da saída chega ao modelo.
4. O tratamento de contexto/resultado de ferramenta ainda é um contribuidor provável. O Qwen Code usou mais tokens que o Claude Code em todas as células da matriz, e execuções anteriores com PRs grandes mostraram recuperação de saídas salvas e caminhos de amplificação de subagentes.
5. A próxima camada de diagnóstico deve separar heap V8, RSS nativo, custo de inicialização de módulo/runtime, histórico de sessão, histórico de interface, retenção de resultados de ferramentas e atividade de subagentes. Apenas o RSS externo não consegue distinguir essas causas.

## Ressalvas

- São execuções únicas por célula da matriz, não amostras estatísticas repetidas.
- RSS é o RSS externo do processo. Não consegue distinguir heap V8, buffers nativos, carregamento de módulos, saída de ferramenta retida, estado da interface ou histórico de sessão.
- Claude Code e Qwen Code usam implementações de runtime e adaptadores de protocolo diferentes, mesmo quando os rótulos de modelo são os mesmos.
- O benchmark foi executado localmente no macOS. Servidores Linux devem ser testados antes de tirar conclusões específicas para implantação.

## Medições Recomendadas como Próximo Passo

O próximo ramo de investigação local deve adicionar ou usar diagnósticos para:

- `process.memoryUsage()` antes e depois da inicialização, execução de ferramenta, streaming, compressão e finalização de sessão.
- Estatísticas de heap V8 e espaços de heap.
- Handles e requisições ativas.
- Contagem de mensagens da sessão e volume aproximado de caracteres/tokens retidos.
- Contagem de resultados de ferramentas, tamanho total retido de resultados de ferramentas, maior tamanho de resultado de ferramenta e se saídas grandes são retidas pelo histórico da interface ou pelo histórico do modelo.
- Contagem de subagentes e RSS da árvore de processos/processos filhos.
- Eventos de truncamento de saída de ferramentas e recuperação de saídas salvas.

Essas medições devem ser coletadas com a mesma matriz de benchmark, para que a comparação atual de RSS possa ser conectada ao estado interno do Qwen Code.