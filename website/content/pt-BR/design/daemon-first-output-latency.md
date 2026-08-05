# Latência da primeira saída do daemon

- **Rastreamento**: #7757
- **Acompanhamento de prompt imediato**: #7982
- **Contexto**: #7264
- **Escopo**: latência observável pelo cliente do daemon/ACP
- **Status**: Medição e atribuição de prompt imediato

## Decisão e escopo

O primeiro PR é apenas de medição: um benchmark opt-in, auxiliares puros de classificação/estatística, testes e artefatos versionados. Ele não altera o comportamento de inicialização de produção.

Um protótipo separado de preparação do Provider é permitido apenas se a baseline de bundle único passar em seu gate. Publicar esse protótipo então exige que bundles de controle e candidato distintos passem em todos os gates de latência, recursos, funcionalidade e limpeza deste documento. Um resultado negativo válido encerra o trabalho.

O benchmark mede do spawn do processo até a primeira saída derivada do modelo, mantendo separados a preparação local, a chegada da requisição ao Provider, a primeira saída, o primeiro texto de resposta e a conclusão terminal. O `ttft_ms` de produção existente permanece inalterado: ele ainda mede do despacho ao Provider até o primeiro conteúdo visível e não absorve carregamento preguiçoso nem preparação local do prompt.

Fora do escopo estão renderização de TUI/Web Shell/editor, cache de prompts, compactação, comportamento de pensamento/ferramentas do modelo, pré-conexão de rede, otimização de latência com modelo real, alterações na telemetria de produção, APIs públicas de ciclo de vida, campos de protocolo, configuração e flags de funcionalidade.

## Contrato de repositório e runner

| Caminho                                                              | Responsabilidade                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `integration-tests/cli/qwen-daemon-first-output-benchmark.test.ts`   | Runner opt-in, Provider falso, ciclo de vida de processo isolado, protocolos de baseline/comparação e escrita de artefatos |
| `integration-tests/cli/_first-output-benchmark.ts`                   | Rastreamento puro de eventos, classificação, percentis, bootstrap pareado e entradas de decisão               |
| `integration-tests/cli/_first-output-benchmark.test.ts`              | Testes determinísticos para o contrato puro                                                                    |
| `integration-tests/fake-openai-server.ts`                            | Provider falso existente com fechamento de conexão opt-in para medições frias/quentes sem viés                |

O runner fica desabilitado a menos que `QWEN_FIRST_OUTPUT_BENCHMARK=1`. Seus dois modos de entrada são mutuamente exclusivos:

- **Baseline**: `BENCHMARK_CLI_PATH`.
- **Comparação**: ambos `BENCHMARK_CONTROL_CLI_PATH` e `BENCHMARK_CANDIDATE_CLI_PATH`.

`BENCHMARK_POST_SESSION_DWELL_MS` é exclusivo de comparação, aceita exatamente `0`, `100` ou `500` e o padrão é `0`. `BENCHMARK_MEASURED_PAIRS` também é exclusivo de comparação e aceita exatamente `10` ou `30`; o padrão é `10` para o diagnóstico de 500 ms e `30` caso contrário. Uma execução de 500 ms exige 10 pares e as execuções de 0/100 ms exigem 30, para que um diagnóstico não possa ser rotulado como portador de decisão. Execuções formais da Fase 2 invocam o runner separadamente para os três cenários de dwell; amostras de valores de dwell diferentes nunca são agrupadas. Modos ausentes ou misturados, bundles de comparação idênticos, caminhos ilegíveis, contagens de dwell ou de pares não suportadas e planos de dwell/amostra incompatíveis falham como `invalid_configuration` antes da amostragem.

O dwell é ancorado na prontidão do SSE em vez da prontidão da sessão. A conexão SSE fica entre as duas, então ancorar em `sessionReady` permitiria que uma conexão lenta consumisse toda a janela e reduzisse silenciosamente um cenário de 100 ms a uma execução de prompt imediato que ainda reportaria seu dwell configurado. `sseReadyToPromptMs` registra a janela ociosa que cada amostra realmente recebeu.

Números na escala de milissegundos só são significativos quando nada mais compete pelo host, então o runner é excluído da configuração de integração compartilhada e tem sua própria configuração serial em `integration-tests/vitest.firstoutput.config.ts` (`fileParallelism: false`, execução serial, `retry: 0`). Os testes dos auxiliares puros continuam rodando na suíte compartilhada. Execute o benchmark com:

```text
QWEN_FIRST_OUTPUT_BENCHMARK=1 QWEN_SANDBOX=false BENCHMARK_CLI_PATH=... \
  npx vitest run --config integration-tests/vitest.firstoutput.config.ts
```

Os artefatos são escritos abaixo de `.qwen/investigations/daemon-first-output-benchmark/`, fora do diretório de execução descartável do harness de integração. Isso mantém execuções bem-sucedidas, falhas e de resultado negativo após o teardown global sem exigir `KEEP_OUTPUT`.

## Contrato de medição

### Um único relógio

Todos os timestamps de latência usam `performance.now()` no harness pai. Nenhuma duração combina relógios do daemon, do filho ACP, do Provider ou de parede. O valor de espera na fila FIFO do daemon é uma duração standalone existente lida após o prompt isolado ser concluído; ele nunca é subtraído de um timestamp do pai.

| Timestamp                  | Definição observável pelo cliente                                                  |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `processSpawnAt`           | Imediatamente antes do `spawn` do daemon                                           |
| `sessionReadyAt`           | Resposta de sessão bem-sucedida totalmente lida e validada                         |
| `sseReadyAt`               | Primeiro callback de época SSE observado; a âncora do dwell                        |
| `promptStartedAt`          | Imediatamente antes de iniciar a requisição de prompt não bloqueante               |
| `promptAcceptedAt`         | Corpo do HTTP `202` validado, incluindo `promptId` de nível superior e cursor de replay |
| `userEchoAt`               | `user_message_chunk` retransmitido correspondente parseado do SSE                  |
| `providerRequestArrivalAt` | Provider falso aceita a requisição medida, antes do seu atraso fixo                |
| `providerReadyAt`          | Atraso fixo de 50 ms decorreu, imediatamente antes do stream de resposta estar disponível |
| `firstModelOutputAt`       | Primeiro evento SSE qualificante para o `promptId` de nível superior aceito parseado |
| `firstAnswerTextAt`        | Primeiro evento qualificante de texto de resposta parseado; anulável               |
| `terminalAt`               | `turn_complete` ou `turn_error` correspondente parseado                            |

Os timestamps brutos produzem estas métricas exatas:

| Métrica                                | Cálculo                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `processToSessionReadyMs`              | `sessionReadyAt - processSpawnAt`                     |
| `sseReadyToPromptMs`                   | `promptStartedAt - sseReadyAt`, diagnóstico           |
| `promptToAcceptanceMs`                 | `promptAcceptedAt - promptStartedAt`                  |
| `acceptanceToProviderRequestArrivalMs` | `providerRequestArrivalAt - promptAcceptedAt`, com sinal |
| `promptToUserEchoMs`                   | `userEchoAt - promptStartedAt`                        |
| `userEchoToProviderRequestArrivalMs`   | `providerRequestArrivalAt - userEchoAt`, com sinal    |
| `daemonPromptQueueWaitMs`              | Duração existente de espera na fila FIFO do daemon    |
| `promptToProviderRequestArrivalMs`     | `providerRequestArrivalAt - promptStartedAt`          |
| `promptToFirstModelOutputMs`           | `firstModelOutputAt - promptStartedAt`                |
| `promptToFirstAnswerTextMs`            | `firstAnswerTextAt - promptStartedAt`, anulável       |
| `providerReadyToFirstModelOutputMs`    | `firstModelOutputAt - providerReadyAt`                |
| `promptToTerminalMs`                   | `terminalAt - promptStartedAt`                        |
| `processToFirstModelOutputMs`          | `firstModelOutputAt - processSpawnAt`                 |

`promptAcceptedAt` é diagnóstico, não uma origem de latência: uma requisição ou evento do Provider pode preceder o recebimento do HTTP `202`. O daemon publica o eco de usuário correspondente antes de encaminhar o prompt ACP, mas a entrega SSE ainda pode perder a corrida com a chegada da requisição ao Provider. Portanto, tanto `acceptanceToProviderRequestArrivalMs` quanto `userEchoToProviderRequestArrivalMs` são offsets com sinal e valores negativos são válidos. Toda outra duração deve ser não negativa. O contador de espera na fila deve avançar exatamente uma vez por prompt isolado e reter um `lastMs` finito não negativo; caso contrário, a amostra é inválida porque o valor não pode ser correlacionado com segurança. Timestamps obrigatórios ausentes ou valores não finitos invalidam a amostra. O harness é dono do deadline de 30 segundos para prontidão do SSE; o timeout de conexão do SDK é registrado e definido cinco segundos depois para que o ordenamento de timers não possa transformar `sse_connect_timeout` em outro código de falha.

As métricas de atribuição de prompt imediato param deliberadamente nos limites existentes. Juntas, elas distinguem aceitação de cliente/rota, o eco de usuário pré-encaminhamento retransmitido, o enfileiramento FIFO do daemon e o intervalo restante do filho ACP/preparação local sem adicionar timestamp entre processos, campo de protocolo ou telemetria de produção. O limite do eco inclui o tempo de retransmissão SSE e é aproximado, não um timestamp interno do daemon. Essas métricas não dividem o intervalo restante entre transporte ACP, preparação do prompt, liquidação do loader do Provider e construção da requisição; instrumentação mais profunda exige evidência e design separados.

### Correlação de prompt e eventos

O coletor SSE está ativo antes do prompt, ou retoma a partir do cursor que o precede, e armazena em buffer um número fixo de eventos até que o `202` forneça o `promptId` de nível superior aceito. O envelope de aceitação deve conter um `promptId` não vazio e um `lastEventId` inteiro não negativo; um resultado síncrono legado é reconhecido apenas pelo seu `stopReason`, enquanto qualquer outra resposta malformada é rejeitada. Um timeout de aceitação do prompt aborta a requisição subjacente antes do teardown da amostra. O coletor então avalia eventos em buffer e ao vivo na ordem original de chegada e aceita apenas uma correspondência exata do ID de nível superior. Eventos anteriores, sem ID e de prompts não relacionados são ignorados; em estouro de buffer, o rastreador trava a falha e para de armazenar em buffer, então a amostra é invalidada e os eventos excedentes são descartados.

Requisições do Provider não carregam o `promptId` do daemon. Cada Provider falso isolado, portanto, permite apenas uma requisição medida esperada por vez e corresponde à sua sentinela de prompt única de comprimento fixo. Seu timestamp pode ser armazenado em buffer antes do `202`; uma requisição extra, ausente, precoce ou concorrente falha a amostra.

O primeiro evento qualificante determina `firstOutputAt`:

| Evento                                        | Tipo                                          |
| --------------------------------------------- | --------------------------------------------- |
| Texto não vazio de `agent_message_chunk`      | `answer_text`, e limite de primeira resposta  |
| Texto não vazio de `agent_thought_chunk`      | `thought_text`                                |
| `tool_call` inicial bem-formado               | `tool_call`                                   |

Não vazio significa que o comprimento do texto decodificado é maior que zero; o texto não é aparado nem reescrito. Frames de replay/status, mensagens discretas locais (incluindo saída de comando slash e notificação de segundo plano), eco de usuário, chunks somente de papel ou uso, diagnósticos de compactação, atualizações malformadas e `tool_call_update` não contam. `turn_error` sempre falha. `turn_complete` antes de saída qualificante também falha. O rastreador puro permite turnos válidos com pensamento ou ferramenta primeiro com métrica de resposta nula, enquanto o Provider falso ao vivo deve produzir sua sentinela de resposta conhecida.

## Provider falso e isolamento

O Provider falso compatível com OpenAI somente loopback registra a chegada da requisição, valida a requisição/modelo, aguarda um timer configurado de 50 ms, registra o atraso realmente decorrido e `providerReadyAt`, emite uma sentinela de resposta em stream única e completa normalmente. Respostas do benchmark usam explicitamente `Connection: close`, para que o turno quente não ganhe com uma conexão TCP aberta pelo turno frio; pré-conexão de rede permanece fora da otimização medida. O atraso separa o trabalho local pré-requisição da propagação de resposta/evento; ele não modela uma distribuição real de latência. Testes puros cobrem fixtures com pensamento e ferramenta primeiro sem adicionar não determinismo às execuções ao vivo.

Cada processo de baseline e cada braço de comparação recebe uma árvore de processos daemon/ACP nova, workspace, home e `QWEN_HOME` novos, portas efêmeras de daemon/Provider, coletor de eventos e livro de requisições. As amostras rodam serialmente.

Os caches de compilação do Node estão vazios no início da execução formal, isolados por bundle e modo, preenchidos apenas por warmups excluídos e então reutilizados apenas pelo mesmo bundle. O artefato registra cada diretório de cache para procedência, mas uma execução limpa o remove durante o teardown, então não se espera que o caminho registrado exista depois. Controle e candidato nunca os compartilham. Observações de warmup permanecem no artefato com `measured: false`.

O filho inicia a partir de uma allowlist mínima de ambiente. Ele usa locale/timezone fixos, caminhos graváveis isolados, telemetria/verificações de atualização desabilitadas, configuração de Provider fictícia e credenciais reais e variáveis de proxy apagadas. O artefato registra apenas valores não secretos fornecidos deliberadamente.

Comparações formais usam bundles de release construídos a partir do mesmo lockfile no mesmo host Linux ocioso de 2 vCPUs. O artefato registra caminhos resolvidos, hashes SHA-256, revisões de origem quando disponíveis, Node/OS/CPU/memória e metadados de carga. O cache de página do sistema de arquivos e o ruído do escalonador não podem ser descarregados com confiabilidade, então ordenamento AB/BA e o gate de sensibilidade à ordem são obrigatórios.

## Fase 1: baseline fria/quente de bundle único

Execute 2 processos de warmup excluídos e depois 50 processos medidos. Cada processo medido:

1. cria uma nova sessão `sessionScope: thread` e envia um prompt imediato de comprimento fixo (`cold`);
2. aguarda seu terminal validado;
3. mantém a primeira sessão aberta, cria uma sessão `sessionScope: thread` distinta no mesmo processo filho ACP; e
4. envia um prompt de mesmo comprimento com uma sentinela distinta (`warm`).

O runner registra o PID do filho ACP após ambos os turnos e invalida a amostra a menos que exatamente um filho inalterado os tenha atendido. Somente após o segundo turno ele fecha ambas as sessões. A segunda sessão, portanto, tem um novo wrapper preguiçoso de Provider por sessão, mas caches ESM/runtime quentes de todo o processo ACP. O par limita o custo local único da primeira passagem de um processo pelo caminho do prompt, sem confusão de histórico de conversa. A construção do Provider é um componente desse custo; o primeiro prompt também paga pelo primeiro acesso à rota do daemon, o primeiro ida-e-volta IPC do ACP, aquecimento de JIT e qualquer importação preguiçosa não relacionada. O delta, portanto, é um limite superior do que pré-carregar o Provider poderia recuperar, não uma estimativa do carregamento do Provider, e um gate aprovado não estabelece que o Provider responde por qualquer parcela específica dele. A atribuição é o que os testes de comparação pareada da Fase 2 verificam. Ambas as sessões ainda constroem seu próprio Provider no prompt, então trabalho que o protótipo pode mover para o dwell não é creditado; o gate é conservador. Métricas de processo da segunda sessão são diagnósticas.

A baseline espera exatamente duas requisições ao Provider por processo. Todos os 50 pares frio/quente devem ser válidos. Frio e quente compartilham um processo, então seus deltas são amostras pareadas em vez de independentes, e o gate é decidido pela mediana pareada com seu intervalo de 95% de bootstrap com semente:

```text
providerDelta[i] =
  cold promptToProviderRequestArrivalMs[i] -
  warm promptToProviderRequestArrivalMs[i]

providerDeltaCiLow = lower bound of the 95% CI of median(providerDelta)
```

A Fase 1 passa quando:

```text
providerDeltaCiLow >= 25 ms
```

ou:

```text
providerDeltaCiLow >= 10% * P50(cold promptToFirstModelOutputMs)
```

O limite inferior em vez da estimativa pontual deve superar o limiar, para que um delta que apenas o exceda não possa autorizar um protótipo com base em ruído. A diferença das duas P50s ainda é registrada para continuidade, mas não decide mais nada. Frio é sempre a primeira sessão, então o par não pode ser balanceado por ordem como uma comparação da Fase 2; esta é uma limitação conhecida do constructo, não uma omissão.

Caso contrário, o artefato é retido e o trabalho de produção para.

## Comparação e estatística

Cada dwell de comparação usa 2 pares de warmup excluídos seguidos por 30 pares medidos, exceto o cenário de 500 ms explicitamente diagnóstico, que usa 10 e sempre reporta um resultado de nível superior inconclusivo. Pares ímpares executam controle e depois candidato (AB); pares pares executam candidato e depois controle (BA). Cada braço tem estado novo, e todo delta registrado é `candidate - control`, então latência negativa é mais rápido.

Braços falhos permanecem na saída bruta e invalidam seus pares. Eles não são substituídos. A amostragem para após o primeiro processo inválido ou par concluído. O deadline externo do Vitest é derivado conservadoramente do maior plano de amostragem legal e de todo timeout fixo de ciclo de vida, com margem de escalonador, para que mesmo amostras legais perto do deadline não possam preemptar a escrita do artefato. O teardown de emergência tem seu próprio deadline fixo de hook. Não há exclusão de outliers, winsorização, seleção de subconjunto ou retry do Vitest. Qualquer par primário inválido invalida a execução formal.

Para cada métrica, reporte P50/P90/P99 por posto mais próximo e média para cada braço, delta de mediana pareado, vitórias/empates e medianas de subgrupo AB/BA. P90/P99 são apenas descritivos com 30 pares; nenhuma conclusão de P95 ou de latência de cauda é feita sem pelo menos 100 pares.

Duas definições de mediana coexistem deliberadamente e um leitor comparando colunas deve esperar que elas difiram em um número par de amostras. A `p50` por braço é por posto mais próximo, então é sempre um valor observado. O `median delta` pareado, e as medianas reamostradas dentro do bootstrap, tiram a média dos dois valores do meio em contagens pares. Uma linha de Markdown pode, portanto, mostrar uma `p50` e um `median delta` que não se reconciliam aritmeticamente sem que nenhum dos dois esteja errado.

O intervalo de confiança de 95% da mediana pareada usa 10.000 reamostragens de bootstrap com semente dos deltas de pares válidos com reposição; semente e contagem de iterações são armazenadas. Seus limites são os percentis por posto mais próximo 2,5 e 97,5. A semente de cada métrica é deslocada pela sua posição na lista de métricas, então inserir ou reordenar uma métrica desloca os limites de bootstrap de toda métrica posterior e torna artefatos de cada lado da alteração incomparáveis mesmo para amostras brutas idênticas; o `seed` armazenado por métrica mantém isso auditável. `orderSensitive` é verdadeiro quando os deltas de mediana AB e BA têm sinais opostos e qualquer mediana absoluta é pelo menos 10 ms. Sensibilidade à ordem torna a execução inconclusiva em vez de ser eliminada por média.

O resultado de nível superior de um artefato pareado descreve apenas sua métrica primária naquele único cenário. Ele não avalia os gates entre cenários, de recursos, funcionais ou de publicação e não pode, por si só, autorizar um pull request da Fase 2.

## Falhas, artefatos e limpeza

Toda falha de ciclo de vida ou de amostra classificada é retida e tem um código primário:

| Código                            | Gatilho                                                                     |
| --------------------------------- | --------------------------------------------------------------------------- |
| `invalid_configuration`           | Modo, caminho, dwell, ambiente ou identidade de bundle inválidos            |
| `daemon_boot_timeout`             | Nenhum endpoint em escuta antes do deadline                                 |
| `daemon_exited_before_listen`     | Daemon saiu antes da prontidão                                              |
| `session_create_failed`           | Erro ou resposta de sessão malformada                                       |
| `sse_connect_timeout`             | SSE não estabelecido antes do deadline                                      |
| `sse_stream_ended`                | SSE terminou antes do terminal correspondente                               |
| `prompt_accept_timeout`           | Requisição de prompt não terminou antes do deadline                         |
| `prompt_rejected`                 | Erro ou resposta `202` malformada                                           |
| `legacy_prompt_response`          | Endpoint completou sincronicamente em vez de retornar `promptId`            |
| `event_buffer_overflow`           | Buffer fixo pré-aceitação excedido                                          |
| `provider_request_count_mismatch` | Requisição falsa extra, ausente, precoce ou concorrente                     |
| `unexpected_output_kind`          | Benchmark ao vivo somente de resposta emitiu primeiro outro tipo de saída   |
| `first_output_timeout`            | Nenhuma saída qualificante antes do deadline                                |
| `terminal_before_first_output`    | Terminal limpo sem saída qualificante                                       |
| `turn_error`                      | Terminal de erro correspondente                                             |
| `terminal_timeout`                | Nenhum terminal após a saída antes do deadline                              |
| `wrong_final_text`                | Resposta difere da sentinela                                                |
| `cleanup_timeout`                 | Recursos pertencentes não pararam até o deadline                            |
| `residual_process`                | Descendente rastreado de daemon/ACP sobreviveu à limpeza                    |
| `harness_error`                   | Invariante do harness sem classificação ou falha de E/S                     |

A primeira falha causal de ciclo de vida permanece primária; falhas de limpeza de SSE/sessão e de processo são registradas separadamente e ainda invalidam o par. Tempos não finitos e tempos negativos inválidos, exceto os dois offsets com sinal, são retidos como falha do harness, mas normalizados para `null` antes da agregação, e execuções falhas nunca contribuem para cálculos de percentil ou de gate. Timeouts fixos, limites de requisição e capacidade de buffer são serializados. Mensagens de diagnóstico e caudas limitadas de stdout/stderr não afetam decisões.

Cada invocação escreve JSON `daemon-first-output` de esquema versão 2 mais Markdown derivado apenas desse JSON. Ele contém identidade de execução/plataforma/bundle, configuração sanitizada, warmups, todo timestamp relativo bruto e métrica, tipos de evento travados de primeira saída/resposta/terminal e contagens de correlação, contagens de requisição ao Provider, amostras e pares inválidos, falhas, resultados de limpeza, resumos de estatística/bootstrap/ordem e entradas de gate com razões de decisão explícitas. Execuções de recursos da Fase 2 estendem sua evidência de validação com medições de RSS. Falhas de amostra classificadas permanecem em seus slots fixos de amostra; configuração inválida ou uma falha de harness não classificada produz um artefato fatal. Artefatos excluem credenciais, tokens e conteúdo de prompt além da sentinela não secreta do benchmark.

A limpeza sempre aborta e aguarda o SSE, fecha sessões ao vivo, captura PIDs de descendentes ACP/MCP, envia `SIGTERM` para o grupo de processos pertencente enquanto seu líder ainda é conhecido como vivo e escala o grupo apenas se esse mesmo líder sobreviver ao período de tolerância fixo. Descendentes capturados e um latch de completude de enumeração permanecem anexados ao recurso ativo através da limpeza de emergência. Uma vez que o líder sai, a limpeza nunca mais sonda nem sinaliza seu ID numérico de grupo de processos porque o POSIX pode reutilizá-lo; ela apenas verifica o conjunto de descendentes retido e falha com segurança se um descendente sobreviver ou a enumeração estiver incompleta. Sockets do Provider fecham apenas após o teardown do processo, e o estado temporário é removido apenas depois que ambos forem verificados. A limpeza nunca usa matar por nome de processo em toda a extensão. Qualquer processo inválido ou par concluído para a amostragem imediatamente, retendo a falha. Se um processo ou listener pertencente não puder ser verificado como parado, o runner registra a raiz temporária adiada para limpeza de emergência, marca uma contraparte não iniciada quando necessário para preservar um par inválido e torna a falha do teardown de emergência visível em vez de descartar silenciosamente seu recurso rastreado. O teardown de emergência tenta novamente processos e Providers rastreados antes de excluir raízes temporárias adiadas ou caches de compilação.

## Fase 2: preparação de Provider de melhor esforço

### Comportamento e limite

O gerador preguiçoso atual memoriza uma promessa de loader entre geração, streaming, contagem de tokens e embedding. A preparação pode iniciar essa mesma promessa cedo; ela não deve adicionar outro loader/Provider, fazer qualquer requisição de model/token/embedding, atualizar credenciais ou alterar a validação imediata e o tempo de credenciais do Qwen OAuth. Um prompt imediato deve se juntar à mesma promessa.

Uma promessa de preparação rejeitada permanece memorizada para que o primeiro prompt observe a mesma falha. O chamador desanexado pode anexar um observador de rejeição apenas para prevenir uma rejeição não tratada; ele não deve limpar nem substituir a promessa armazenada. A capability permanece interna ao Core e não estende o contrato público `ContentGenerator`.

O gatilho mais precoce permitido é a escrita bem-sucedida, pelo filho ACP, de um resultado de `session/new`:

1. observar o ID de requisição recebido;
2. observar uma resposta enviada com o mesmo ID e...
3. confiar na observação existente ocorrendo apenas depois que `writer.write(frame)` resolve; e
4. agendar um único `setImmediate` com unref que inicia, mas não aguarda, a preparação.

Respostas falhas, autenticação, `session/load`, `session/resume` e outros RPCs não o disparam. Nenhum sleep é usado para adivinhar a entrega da resposta. Import de ESM não é cancelável, então uma sessão fechada pode permitir que um import já iniciado termine; ele ainda assim não deve emitir nenhuma requisição, não reter nenhum recurso externo e não produzir nenhuma rejeição não tratada.

Este limite é apenas de melhor esforço. O daemon ainda realiza trabalho de persistência de propriedade/configuração/origem da sessão e serializa a resposta HTTP externa após a escrita do filho. O import do Provider pode competir em um host de 2 vCPUs e degradar `processToSessionReadyMs`; `setImmediate` não cria nenhuma relação happens-before entre processos. A não inferioridade da sessão é, portanto, bloqueante. Se ela falhar, pare em vez de ajustar um timer. Um sinal exato de resposta externa concluída cruzaria o transporte HTTP, a ponte do daemon e o filho ACP e precisaria de um design separado apenas se o valor medido justificasse essa complexidade.

### Gates de publicação

Use bundles de release distintos no host de referência:

| Cenário                             | Resultado exigido                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Falso, dwell de 0 ms, 30 pares      | Limite superior do IC de 95% da mediana pareada para ambos `processToSessionReadyMs` e `promptToFirstModelOutputMs` é `<= +10 ms` |
| Falso, dwell de 100 ms, 30 pares    | Mediana pareada de `processToFirstModelOutputMs` é `<= -10 ms` e seu limite superior do IC de 95% é `< 0`           |
| Falso, dwell de 500 ms, 10 pares    | Apenas limite superior diagnóstico; não pode compensar outro gate falho nem justificar merge independentemente       |

Entre as execuções falsas de 0 e 100 ms, todos os 60/60 pares devem ser válidos, com zero requisições ao Provider na janela de pré-carregamento, zero processos residuais e nenhuma sensibilidade à ordem.

Meça o RSS de toda a árvore de processos para 1, 4 e 16 sessões ociosas depois que a preparação do Provider se estabilizar e antes de qualquer prompt. Ambos os gates devem passar:

- P50 de RSS candidato menos controle de sessão única `<= +10 MiB`;
- crescimento incremental candidato menos controle de 1 para 16 sessões ao vivo `<= +0.5 MiB` por sessão adicional:

```text
((candidateRss16 - candidateRss1) -
 (controlRss16 - controlRss1)) / 15
```

Cada sonda de sessão ociosa cria sessões serialmente, aguarda a preparação se estabilizar e não envia nenhum prompt antes da medição de RSS; qualquer requisição ao Provider a falha. Contagem de pares e ordenamento são fixados no artefato de validação da Fase 2 antes da medição formal.

Apenas depois que todos os gates falsos/de recursos passarem, execute validade externa com Provider real no mesmo host: 30 pares AB/BA em 100 ms mais uma fumaça imediata de 10 pares. Falhas funcionais/de autenticação/streaming/resposta bloqueiam. Incerteza de rede é reportada, mas não pode sobrepor as conclusões falsas-locais em nenhuma direção.

## Validação e decisão

Os testes puros da Fase 1 cobrem classificação de resposta/pensamento/ferramenta; exclusões locais/replay/diagnóstico; correlação exata e pré-`202`; estouro de buffer; caminhos terminal/erro; métricas de resposta anuláveis; percentis por posto mais próximo; bootstrap determinístico; sinal de delta; retenção de par inválido; sensibilidade à ordem; artefatos fatais representativos; e renderização de JSON para Markdown. Uma fumaça opt-in de bundle de release valida fiação do Provider, ciclo de vida, esquema de artefato e limpeza. Benchmarks formais não fazem parte do CI padrão.

Um candidato da Fase 2 testa adicionalmente tempo do gatilho e filtragem de RPC, single-flight com um prompt imediato, zero requisições ao Provider/atualizações de credencial, rejeição memorizada, escrita de resposta não bloqueante e desligamento seguro. Ele deve passar no build, typecheck, testes unitários/de integração afetados e nos gates completos de artefato.

```text
50-process cold/warm baseline valid and threshold met?
├─ no  → retain artifact; stop
└─ yes → prototype separately
         └─ fake 0 ms non-inferior?
            ├─ no  → retain artifact; stop
            └─ yes
               └─ fake 100 ms materially faster with CI < 0?
                  ├─ no  → retain artifact; stop
                  └─ yes
                     └─ 60/60 valid + request/cleanup/order/RSS gates pass?
                        ├─ no  → retain artifact; stop
                        └─ yes
                           └─ real-Provider runs functionally pass?
                              ├─ no  → retain artifact; stop
                              └─ yes → optimization PR may be published
```
