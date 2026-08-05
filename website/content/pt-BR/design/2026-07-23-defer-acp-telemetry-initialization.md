# Adiar a inicialização da telemetria do ACP até depois da inicialização do protocolo

- **Issue**: #7264 candidato 2
- **Escopo**: inicialização de filho ACP com telemetria habilitada
- **Status**: implementado e validado

## Problema

Um filho ACP atualmente inicia a telemetria a partir do construtor do `Config`.
A chamada é fire-and-forget, mas carregar e avaliar a implementação de
telemetria e a cadeia de exporters configurada ainda compete pelo mesmo event
loop e CPU com o bootstrap do CLI, o carregamento de módulos do ACP, a
inicialização da configuração do bootstrap e o manipulador `initialize` do
protocolo. Em um host restrito, as medições do candidato 1 mostraram que essa
contenção adiciona trabalho de volta à janela de inicialização visível ao
usuário.

Os eventos de telemetria já usam um gate de inicialização: eventos emitidos
antes que o SDK termine de iniciar são descartados. Adiar o início, portanto,
estende uma janela de perda existente em vez de introduzir um novo modelo de
buffer ou ordenação.

## Design

A configuração do ACP define a opção existente
`deferTelemetryInitialization`. Isso suprime o início fire-and-forget do
construtor sem alterar os caminhos padrão, headless, stream-JSON, TUI
interativa ou runtime do daemon.

`runAcpAgent` usa o hook existente de observação de mensagens no seu transport
NDJSON para lembrar o ID JSON-RPC de uma requisição `initialize` recebida. O
hook roda depois que a requisição analisada é enfileirada, mas antes que sua
continuação de leitura pendente possa tratá-la. Para mensagens de saída, o
mesmo hook roda apenas depois que a resposta codificada foi escrita com sucesso
no stream stdout subjacente. Quando uma resposta bem-sucedida com o ID lembrado
é observada, o filho inicia a telemetria por meio da fachada single-flight
existente, registra seu gauge de event loop apenas depois que essa
inicialização se liquida e limpa o ID lembrado. Essa ordenação é necessária
porque a API de métricas armazena em cache um meter no-op se um gauge for
registrado antes que o SDK instale o meter provider global.

Isso cria um limite definido pelo transport: o carregamento da telemetria não
pode começar antes que a escrita da resposta de inicialização seja resolvida.
Não depende de suposições de agendamento do event loop.

## Posse e consumidores downstream

O filho ACP tem um único SDK de telemetria global do processo e um único
`Config` de bootstrap. A opção adiada tem escopo de configuração, enquanto o
inicializador final é global do processo e single-flight. Configs por sessão
continuam compartilhando esse SDK global do processo e não possuem runtimes de
telemetria independentes.

Os consumidores afetados são:

- **Filho de bootstrap do ACP**: muda de telemetria iniciada pelo construtor
  para telemetria iniciada pela escrita da resposta. Seu registro de gauge de
  event loop se move para trás da inicialização do SDK para que o registro
  antecipado não desabilite permanentemente todas as métricas.
- **Criação de sessão e prompts do ACP**: mantêm os gates de inicialização
  existentes; eventos muito antecipados podem agora ser descartados por mais
  tempo enquanto o carregamento do SDK termina.
- **TUI interativa comum**: mantém o início pós-primeiro-render por meio de
  `startPostRenderPrefetches`.
- **CLI headless e stream-JSON**: mantêm a inicialização pelo construtor.
- **Runtime pai/daemon do `qwen serve`**: mantém sua inicialização e shutdown
  explícitos e adiados do runtime do core.
- **Limpeza na saída do processo**: mantém `Config.shutdown()`. Um filho que
  desconecta antes de uma inicialização de protocolo bem-sucedida nunca inicia
  a telemetria. Se a desconção correr com um import recém-iniciado, o catch
  interno do inicializador evita uma rejeição não tratada e o caminho externo
  do ACP ainda encerra o processo. Embora `shutdownTelemetry()` possa aguardar
  um inicializador em andamento, `Config.shutdown()` o chama apenas depois que
  o SDK reporta inicializado, então a limpeza atual da configuração pode pular
  uma inicialização ainda em andamento.

## Comportamento de falha e compatibilidade

- Telemetria desabilitada permanece um no-op da fachada após a resposta e não
  carrega módulos pesados de telemetria.
- Eventos únicos de bootstrap emitidos antes da resposta, incluindo o evento
  inicial `qwen-code.auth` e um evento `qwen-code.config` antecipado, ficam
  permanentemente ausentes da telemetria do ACP em vez de meramente atrasados.
  Esse é o custo aceito de mover a inicialização do SDK para trás da resposta;
  a mudança não sintetiza nem armazena em buffer eventos substitutos.
- Uma requisição `initialize` malformada ou rejeitada não inicia a telemetria.
  Uma requisição initialize válida posterior ainda pode iniciá-la.
- Uma falha de escrita no stdout não executa o hook de mensagem enviada, então
  a telemetria não é iniciada para uma resposta que o cliente não recebeu.
- Respostas JSON-RPC repetidas ou não relacionadas não podem iniciar a
  telemetria porque tanto o ID da requisição quanto o formato de resposta
  bem-sucedida devem corresponder; o ID lembrado é consumido uma única vez.
- O carregamento do SDK permanece fire-and-forget e best-effort. Sua
  implementação existente captura falhas de import, montagem e início.
- Nenhuma mudança de formato de protocolo, capability, tempo de autenticação,
  seleção de provider, comportamento de MCP ou superfície de configuração de
  telemetria.

## Alternativas rejeitadas

- **Iniciar dentro de `QwenAgent.initialize()`**: isso é antes que o
  manipulador retorne e, portanto, antes que o SDK possa serializar ou escrever
  a resposta.
- **Usar `queueMicrotask`, `setImmediate` ou um timer após o retorno do
  manipulador**: nenhum prova que a fila privada de escrita do SDK foi
  concluída, e um timer adiciona uma política de latência arbitrária.
- **Envolver ou fazer fork de `AgentSideConnection`**: desnecessário porque o
  stream NDJSON local do pacote já expõe observações de mensagem pós-escrita.
- **Esperar até a primeira resposta de sessão**: poderia remover mais
  contenção, mas amplia a janela de eventos descartados além do candidato 2 e
  nunca inicializa a telemetria para um canal inicializado ocioso.
- **Armazenar em buffer a telemetria antecipada**: muda materialmente a
  semântica da telemetria e a posse de memória; o candidato 2 aceita
  explicitamente eventos antecipados descartados.

## Verificação

Testes unitários cobrem o adiamento da configuração do ACP e a ordenação exata
do transport: nenhum início no recebimento, resposta não relacionada, resposta
de erro ou escrita com falha; um único início depois que a resposta bem-sucedida
correspondente foi escrita. Testes existentes do transport provam que os hooks
de envio rodam após a escrita subjacente e são pulados em rejeição de escrita.

O bundle de release é exercitado pelo caminho real de pai/filho ACP com
telemetria habilitada e desabilitada. Verificações de compatibilidade cobrem
canais frios e pré-aquecidos, primeiras sessões concorrentes, modo legado de
sessão única, desconexão antecipada, limpeza e produção de registros de
outfile.

A mudança só entra se passar o gate 2C4G do #7264: 30 cold starts seriais
pareados alternados reportando `channel.initialize`, processo filho até
resposta de initialize, requisição de sessão fria, processo até primeira
sessão, RSS de pico, comportamento pré-aquecido e compatibilidade com
telemetria ligada/desligada. Como o trabalho se move para depois em vez de
desaparecer, o gate deve reportar tanto o tempo de inicialização quanto o de
primeira sessão; um ganho que é meramente pago de volta antes da primeira
sessão não é tratado como otimização bem-sucedida.

## Resultados

O controle era o `origin/main` em
`14f1f2bb365280a6e1d4a45b452f7992f1928187`; o candidato era o mesmo commit mais
exatamente esta mudança na árvore de trabalho. Ambos os bundles de release
foram construídos do mesmo lockfile e testados no host Linux fornecido com 2
vCPUs, aproximadamente 3,5 GiB de RAM, sem swap e Node.js embutido 22.23.1.

Com telemetria de outfile habilitada, 30 cold starts pareados alternados
produziram:

| Métrica                                | Controle P50 / P95   | Candidato P50 / P95  | Delta P50     |
| -------------------------------------- | -------------------- | -------------------- | ------------- |
| `channel.initialize`                   | 942,1 / 1245,0 ms    | 898,3 / 1002,4 ms    | **-43,8 ms**  |
| Processo filho até resposta de initialize | 947,0 / 1249,8 ms | 903,0 / 998,4 ms     | **-43,9 ms**  |
| `POST /session` frio                   | 1235,5 / 1591,7 ms   | 1245,1 / 1462,0 ms   | +9,6 ms       |
| Processo até primeira sessão           | 1833,1 / 2190,6 ms   | 1845,5 / 2417,0 ms   | +12,4 ms      |
| RSS de pico                            | 418,7 / 443,6 MiB    | 406,7 / 438,4 MiB    | -11,9 MiB     |

A distribuição pareada mostrou `channel.initialize` mais rápido em 26 de 30
pares, com delta de mediana pareada de -44,2 ms. A requisição de sessão fria e
o processo até primeira sessão tiveram deltas de mediana pareada de +15,0 ms e
+13,8 ms respectivamente, com vitórias do candidato em 13/30 e 11/30 pares. O
intervalo bootstrap de 95% da mediana pareada de processo até primeira sessão
foi -2,8 a +27,5 ms, então esta execução não estabeleceu nem regressão nem
melhoria ponta a ponta. A mudança, portanto, alega apenas o ganho direto no
limite de inicialização do ACP.

Na fase pré-aquecida de 30 pares da mesma execução, `channel.initialize`
melhorou de 950,5 / 1323,7 ms para 908,4 / 964,4 ms P50/P95. A requisição de
sessão já pré-aquecida mudou de 82,1 / 94,8 ms para 83,7 / 131,6 ms, enquanto o
processo até sessão mudou de 3683,5 / 4105,0 ms para 3686,1 / 3749,2 ms. As
medianas pareadas de sessão e de processo até sessão foram +1,4 ms e +1,0 ms
respectivamente. Dois outliers isolados de sessão do candidato e vários
outliers de inicialização do controle ampliaram os valores P95 não pareados; as
medianas pareadas permaneceram neutras. Nenhuma mudança de memória
pré-aquecida é alegada.

As execuções funcionais do candidato passaram em primeiras sessões
concorrentes, telemetria desabilitada com zero registros e modo legado de
sessão única. Todas as 120 execuções de benchmark com telemetria habilitada
reportaram um perfil de inicialização válido e outfile não vazio, e toda
execução terminou sem processo residual. Um smoke de bundle de release pelo
cliente ACP oficial adicionalmente esperou além do intervalo de exportação de
métricas e confirmou tanto `qwen-code.session.count` quanto
`qwen-code.acp.event_loop.lag`, protegendo contra registro em um meter no-op
armazenado em cache. Dois smokes de prompt ao vivo com telemetria habilitada
contra o endpoint compatível com OpenAI disponível ambos foram concluídos e
produziram outfiles de telemetria não vazios. Testes smoke diretos de ACP
empacotado também passaram em ambos os limites de desconexão antecipada: EOF
antes do initialize terminou limpamente sem iniciar a telemetria, enquanto EOF
imediatamente após uma resposta de initialize bem-sucedida terminou limpamente
após criar o outfile, sem saída de stderr em nenhum dos casos.

Os artefatos brutos do host estão sob:

- `/root/qwen-7264-c2-20260723/results/fixed-formal-rerun/2026-07-23T05-14-14.236Z`
- `/root/qwen-7264-c2-20260723/results/prompt-smoke/2026-07-23T03-23-26.883Z`
