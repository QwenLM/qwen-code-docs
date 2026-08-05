# SDK de daemon Java 0.1.0-alpha

## Status

Este documento define o primeiro transporte de daemon no artefato existente
`com.alibaba:qwencode-sdk`. Ele é intencionalmente independente da
implementação legada de stdio sob `com.alibaba.qwen.code.cli`.

## Objetivos

- Adicionar uma API Java 11 para `qwen serve` sem criar outro artefato Maven.
- Entregar eventos stream de texto, thought, ferramenta, uso, permissão e
  brutos na ordem do daemon.
- Retornar o texto do prompt apenas após um evento terminal confiável
  correspondente.
- Retomar um stream de prompt a partir da marca d'água de admissão sem lacunas
  de replay ou entrega duplicada a observador.
- Tornar explícitos resultados ambíguos de mutação e resultados incompletos de
  prompt.
- Manter limitados os threads, streams, sessões e tentativas de detach
  pertencentes ao cliente.

## Superfície pública

`DaemonClient` é dono dos recursos HTTP e de trabalho, lê capabilities e cria
sessões. A criação de sessão usa por padrão `sessionScope=thread`. A
observação de prompt bloqueante usa um pool de trabalho limitado configurável
em vez de um executor global ou ilimitado.
O timer compartilhado apenas despacha ações de watchdog. O fechamento de
stream SSE potencialmente bloqueante roda em um pool limitado separado,
dimensionado para o limite de concorrência de prompts, então um fechamento
travado não pode atrasar o deadline ou o watchdog de ociosidade de outra
sessão. Cada prompt admitido reserva capacidade limitada de limpeza de stream
até que sua tarefa final de fechamento termine. Um prompt publica seu terminal
quando seu slot de prompt é liberado, enquanto seu próprio stream ainda está
fechando, então essa capacidade permite uma limpeza de drenagem por slot de
prompt; uma continuação terminal pode iniciar o próximo prompt mesmo no limite
de concorrência. Fechamentos que permanecem travados além dessa folga ainda
podem fazer uma chamada `startPrompt` posterior falhar com
`DaemonClientCapacityException`, mas não podem descartar silenciosamente um
fechamento disparado por deadline ou crescer o trabalho de limpeza sem limite.

`DaemonSessionClient` é dono de uma sessão de daemon e admite no máximo um
prompt local por vez. `startPrompt` retorna um `PromptCall` imediatamente.
Suas futures de admissão e terminal são independentes, então um chamador pode
distinguir "o daemon aceitou este prompt" de "o turno terminou de forma
confiável".
Continuações de futures de admissão e terminal são despachadas por um executor
separado, pertencente ao cliente, então continuações do usuário não podem
atrasar a observação SSE, seu timeout local ou a capacidade de transporte de
prompt. Conclusão excepcional segue o mesmo caminho. A capacidade de
publicação é limitada em relação a `maximumConcurrentPrompts`; continuações
que permanecem bloqueadas podem, portanto, fazer uma chamada `startPrompt`
posterior falhar com `DaemonClientCapacityException` em vez de criar threads
ou trabalho enfileirado ilimitados.

Uma conclusão indeterminada não é uma fronteira de reutilização de sessão.
Depois que a admissão se torna desconhecida ou um prompt admitido termina
indeterminadamente, o cliente de sessão rejeita permanentemente prompts
adicionais mesmo que a limpeza local de stream seja bem-sucedida. Um timeout
de observação local é publicado sem esperar indefinidamente pelo fechamento do
stream; a limpeza continua assincronamente e mantém capacidade limitada do
cliente até terminar. Chamadores fecham ou destroem a sessão afetada.

`PromptObserver` recebe callbacks tipados e o evento bruto. Callbacks executam
serialmente em um thread de daemon pertencente ao cliente. Um cursor de evento
avança apenas depois que todos os callbacks aplicáveis retornam com sucesso.
Callbacks devem, portanto, retornar prontamente, não devem esperar no mesmo
`PromptCall` e não devem fechar ou destruir a mesma sessão a partir de um
callback. Responder a uma permissão a partir do seu callback é suportado; o
método de resposta retorna `false` quando o daemon reporta que a requisição já
foi resolvida ou não está mais pendente.

`promptText` é uma conveniência sobre `startPrompt`. Ele coleta apenas texto
de assistente, impõe um limite de bytes UTF-8 e retorna um
`PromptTextResult` apenas para um `turn_complete` correspondente. Um
`turn_error` permanece um terminal confiável, mas é reportado como
`PromptTurnException`; qualquer resultado sem um terminal confiável é
reportado como `PromptOutcomeIndeterminateException` com texto parcial
explicitamente incompleto quando disponível.

Codificação Fastjson2 e decodificação estrita Jackson Core são detalhes de
implementação. A decodificação rejeita JSON não padrão e chaves de objeto
duplicadas. Valores JSON brutos públicos usam `Map`, `List`, valores escalares
e nulo de Java.

Seleção de modelo no momento da criação não é exposta intencionalmente neste
alpha. O daemon mantém uma sessão nova viva no modelo padrão quando
`modelServiceId` é rejeitado e reporta a rejeição apenas por um evento SSE
emitido antes da resposta de criação. A assinatura por prompt começa da marca
d'água de admissão posterior, então ela não pode provar que o modelo
solicitado foi selecionado sem adicionar um ciclo de vida separado de eventos
de sessão.

Antes da criação de sessão, o SDK requer que o daemon anuncie REST e
`session_scope_override`; ele se recusa a mutar quando um daemon mais antigo
poderia silenciosamente ignorar o escopo solicitado. Enquanto uma sessão
permanece aberta, o SDK envia uma nova mutação de heartbeat uma vez por
intervalo configurado (um minuto por padrão) apenas quando o daemon anuncia
`client_heartbeat`, e para em detach ou destroy. Cada heartbeat tem o deadline
finito normal de requisição e não é retentado; definir o intervalo para zero
desativa o keepalive automático. Da mesma forma, um prompt carregando
`deadlineMs` é rejeitado antes da admissão a menos que o daemon anuncie
`prompt_absolute_deadline`, então um deadline solicitado no servidor não pode
ser silenciosamente ignorado. O timeout de observação local permanece
independente e é sempre imposto pelo SDK.

## Fluxo de fio

1. Enviar um único `POST /session/:id/prompt` sem retry.
2. Exigir `202` e validar `{promptId,lastEventId,eventEpoch?}`.
3. Abrir `GET /session/:id/events` com `Last-Event-ID` definido para a marca
   d'água e `X-Qwen-Event-Epoch` definido quando o daemon forneceu uma época.
4. Reproduzir e observar apenas eventos correlacionados com aquele prompt,
   enquanto trata frames de falha no nível da sessão como fatais.
5. Parar apenas em `turn_complete` ou `turn_error` correspondente.

Esta assinatura por prompt cobre eventos de conteúdo e terminais emitidos
antes que a resposta `202` chegue ao cliente. Ela não requer um cache de
prompt desconhecido ou uma bomba de sessão de longa duração.

## Contrato de transporte

O `HttpClient` do JDK usa HTTP/1.1 e nunca segue redirecionamentos. Toda
requisição envia cabeçalhos `Accept` de JSON ou event-stream, autenticação
bearer quando configurada e o `X-Qwen-Client-Id` emitido pelo daemon após a
criação da sessão. O SSE adicionalmente envia `Accept-Encoding: identity`,
`Cache-Control: no-cache` e `Last-Event-ID`. Quando disponível,
`X-Qwen-Event-Epoch` viaja com esse cursor. O cliente o semeia a partir da
admissão do prompt, aprende-o de um cabeçalho de resposta SSE validado para
compatibilidade, mantém um valor conhecido quando uma resposta omite o
cabeçalho e falha fail closed se o valor mudar durante a observação do prompt.

Corpos finitos de JSON e erro são consumidos por um assinante limitado e
competem com o deadline da requisição via `sendAsync`; receber cabeçalhos de
resposta não encerra esse deadline. Corpos SSE de não sucesso são limitados
separadamente pelo menor dos orçamentos de requisição e de observação de
prompt.

O parser SSE aceita framing LF e CRLF, comentários e múltiplas linhas `data:`.
A decodificação UTF-8 é estrita. Frames, nomes de evento, versão de envelope,
IDs numéricos e consistência de ID SSE/envelope são validados. Um frame
malformado, uma lacuna de ID, `state_resync_required`, morte de sessão, falha
de observador, timeout de ociosidade ou esgotamento de reconexão falham fail
closed.

IDs no cursor consolidado ou abaixo dele são duplicatas e não são entregues.
O próximo evento numérico deve ser exatamente `cursor + 1`. Eventos sintéticos
sem ID são aceitos apenas para os frames de controle documentados do daemon e
não movem o cursor; um evento de conteúdo ou terminal sem ID falha fail
closed. A implementação reconecta apenas o GET do SSE, usando backoff
exponencial limitado com full-jitter, a diretiva `retry` do SSE após uma
desconexão de stream e `Retry-After` em respostas HTTP retentáveis. Mutações
nunca são retentadas automaticamente.

## Resultados ambíguos e terminais

Se o transporte de prompt falhar após o despacho sem um `202` validado, ou
retornar HTTP 408 ou 5xx, a future de admissão falha com
`PromptAdmissionUnknownException`; o SDK nunca reenvia o prompt. A criação de
sessão aplica a mesma classificação conservadora por meio de
`SessionCreationOutcomeUnknownException`. Permissão, cancelamento, heartbeat,
detach e delete aplicam a mesma classificação porque uma resposta de
intermediário não prova que o daemon rejeitou a mutação. O detach usa o
`DetachOutcomeUnknownException` mais específico. Toda mutação é tentada no
máximo uma vez por invocação de método.

Apenas `turn_complete` e `turn_error` correspondentes são terminais. Eventos
de fila e `prompt_cancelled` são consultivos. Um timeout local para a
observação, mas não cancela automaticamente o turno do daemon. Um cancelamento
cooperativo do daemon completa como `turn_complete` com
`stopReason=cancelled`, enquanto uma falha de agente ou provider durante o
cancelamento pode produzir `turn_error`. `promptText()` retorna o resultado
completo e expõe o terminal de erro como `PromptTurnException`; chamadores
devem esperar pelo terminal em ambos os casos. Quando cancelamento, deadline,
desmonte ou liquidação do agente competem, o latch exactly-once do daemon
publica o primeiro terminal formal e suprime candidatos posteriores. O SDK,
portanto, trata o terminal recebido como autoritativo em vez de derivar um
resultado da última mutação de controle que enviou.

`close()` é localmente idempotente, para a observação local e tenta o detach
no máximo uma vez. Uma resposta de detach perdida não é retentada.
`destroySession()` é a única API que emite `DELETE /session/:id`; ela pode
ser chamada após o detach.

## Compatibilidade e não objetivos

O artefato inteiro agora requer Java 11. Usuários de Java 8 devem permanecer
em `0.0.3-alpha`. A API de stdio permanece compatível em nível de código, mas
agora roda em Java 11 e obtém logging via `slf4j-api`; aplicações escolhem seu
próprio provider SLF4J porque o Logback é apenas de teste.

O daemon compatível é o build de qwen-code lançado a partir da mesma revisão
de código-fonte do SDK. Ele contém o ledger de detach por cliente de #7386, a
garantia terminal por época de #7400, épocas de cursor de evento seguras para
reinicialização de #7458 e o cancelamento de admissão reconhecido mais a cerca
de drenagem de cancelamento FIFO deste lançamento. O commit de #7400 sozinho
ainda pode reconhecer o cancelamento antes do despacho do agente sem parar o
prompt admitido, ou deixar um cancelamento de escopo de sessão não reconhecido
alcançar um sucessor enfileirado. O filho ACP empacotado trata a requisição de
cancelamento interna do daemon por meio de um handshake único, reconhecido e
ciente de admissão. Um filho ACP personalizado compatível com padrões que não
implementa essa extensão recebe, em vez disso, uma única notificação padrão
`session/cancel`. O daemon não anuncia uma capability que distingue essas
implementações com o mesmo conjunto de recursos REST/SSE, então o SDK não pode
negociar esse mínimo em runtime e falha fail closed quando um terminal formal
está ausente.

O handshake espera intencionalmente que a chamada de prompt alvo se estabeleça
antes que o FIFO possa despachar seu sucessor. Adicionar um timeout apenas de
reconhecimento permitiria que um cancelamento tardio de escopo de sessão
alcançasse esse sucessor e quebraria a garantia de ordenação. Consequentemente,
um provider, ferramenta ou integração personalizada que ignora seu
`AbortSignal` indefinidamente pode deixar o resultado da mutação de
cancelamento desconhecido e a sessão inutilizável. Recuperar um filho ACP
compartilhado travado sem terminar sessões irmãs requer isolamento de runtime
mais forte e está fora deste alpha.

O alpha detecta mudança de época de evento durante um prompt observado e falha
fail closed, mas não promete execução exactly-once através de reinicializações
do daemon, recuperação automática de época, snapshot/resync, cursores
persistidos ou cancelamento verdadeiramente direcionado a ID de prompt. Ele
também não expõe seleção de modelo no momento da criação até que o daemon
possa retornar um resultado definitivo ou o SDK possua um ciclo de vida de
eventos de sessão a partir de `Last-Event-ID: 0`. Uma criação ambígua pode
deixar uma sessão de daemon que o chamador não pode identificar ou destacar
até a coleta no lado do daemon. Esses casos requerem contratos de daemon mais
fortes.

## Verificação

Testes unitários usam um servidor HTTP em processo para injetar fragmentação
de SSE, entrega lenta de linha única, replay, duplicatas, lacunas, IDs de
prompt conflitantes, dados de evento futuros opacos, replay de marca d'água,
desconexões, respostas comprimidas, corpos finitos travados, propagação e
incompatibilidade de época de evento, resync, falhas de observador, ausência
de terminal e respostas de mutação ambíguas. Testes de ciclo de vida cobrem
admissão de um prompt local, serialização de admissão/fechamento, terminal de
deadline seguido de reutilização de sessão, conclusão cancelada, ordenação de
terminal de desmonte, texto limitado, heartbeat automático, fechamento
idempotente, identidade de cliente de detach, detach único e destruição
explícita.

O CI compila e testa em Java 11, 17 e 21 no Linux, com cobertura de smoke em
Java 21 no macOS e Windows. O CI do Linux e o workflow de release protegido
executam um E2E contra um processo `qwen serve` real com um workspace
temporário e um stub de modelo.
