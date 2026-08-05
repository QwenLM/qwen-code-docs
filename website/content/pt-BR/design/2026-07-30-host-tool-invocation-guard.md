# Guard de invocação de ferramentas do host

## Status

Design de rascunho para a issue
[#8102](https://github.com/QwenLM/qwen-code/issues/8102) e o PR
[#8032](https://github.com/QwenLM/qwen-code/pull/8032).

## Problema

Um embedding host em processo pode avaliar uma chamada de ferramenta proposta
pelo modelo através das permissões e hooks existentes, mas essas verificações
podem rodar antes que o Qwen Code tenha resolvido o nome canônico da
ferramenta ou construído os parâmetros finais da invocação. Um host que aplica
política organizacional, portanto, não pode provar que avaliou a mesma chamada
que chegou a `invocation.execute()`.

O primitivo faltante é uma decisão de limite final de execução sobre a chamada
de ferramenta efetiva. Estado de tarefa específico de produto, workflows de
aprovação, armazenamento de política e transporte de auditoria não pertencem
ao Qwen Code.

## Objetivos

- Permitir que um host em processo forneça uma função allow/deny através de
  `ConfigParameters`.
- Avaliar o nome canônico da ferramenta e os parâmetros finais clonados da
  invocação imediatamente antes da execução.
- Cobrir o agendador do core, o runtime de sessão ACP e os caminhos de
  execução especulativa.
- Falhar de forma fechada (fail closed) quando um guard configurado nega,
  lança exceção, retorna uma decisão malformada ou não consegue receber
  argumentos clonados.
- Preservar o caminho de execução existente quando nenhum guard está
  configurado.
- Impedir a execução se ocorrer cancelamento antes ou durante o await do
  guard.

## Não objetivos

- Nenhum flag de CLI, chave de configuração, variável de ambiente, rota de
  daemon, cliente de rede ou transporte de política externa.
- Nenhum schema de tarefa, plano, grant, autorização de negócio ou auditoria.
- Nenhuma mudança na semântica de permissão, hook, sandbox ou modo de
  aprovação.
- Nenhuma alegação de que o planejamento do modelo ou implementações de
  ferramentas se tornam determinísticos.
- Nenhum callback de resultado ou protocolo paralelo de resultado de
  ferramenta.
- Nenhuma interceptação de um consumidor de SDK que chame manualmente
  `ToolInvocation.execute()` ou `Tool.buildAndExecute()` fora de um runtime
  de posse do Config.

## Contrato

O host fornece um `ToolInvocationGuard` em `ConfigParameters`. O guard recebe:

- o identificador de correlação de chamada de ferramenta aceito pelo runtime;
- o nome canônico da ferramenta;
- um clone estruturado dos parâmetros finais da invocação; e
- o sinal de abort da invocação.

A decisão é `{ allowed: true }` ou `{ allowed: false, reason? }`. Uma razão de
negação ausente ou vazia usa uma mensagem genérica estável. Exceções, decisões
malformadas e falhas de clone usam uma mensagem de falha estável separada e
negam a execução. Uma razão de negação fornecida é visível ao usuário e pode
entrar nas superfícies existentes de resultado de ferramenta e telemetria,
então não deve conter segredos ou erros brutos de provider.

Os argumentos clonados impedem que um guard mute a invocação que o Qwen Code
vai executar. O contrato não torna secretos os argumentos arbitrários de
ferramenta; um embedding host deve tratá-los como dados sensíveis de
aplicação.

O identificador de chamada de ferramenta pode ter origem em uma resposta do
modelo. Ele é útil para correlacionar a decisão do guard com eventos de ciclo
de vida existentes, mas não é um sujeito autenticado nem uma chave de
idempotência independente. Um host gerenciado que precisa de identidade forte
deve vinculá-lo à identidade de sessão e prompt de posse do host.

## Posicionamento da execução

O agendador do core avalia o guard após construção da ferramenta, tratamento
de permissão, normalização de caminho e `PreToolUse`, mas antes que a chamada
mude para `executing` e antes de `invocation.execute()`.

A sessão ACP avalia o mesmo contrato após construção da ferramenta, tratamento
de permissão e `PreToolUse`, mas antes do seu caminho direto de
`invocation.execute()`.

O motor de especulação experimental também executa invocações diretamente em
vez de usar o agendador do core. Ele avalia o mesmo guard após construir a
invocação e converte uma negação ou cancelamento em um limite de especulação
com zero chamadas de executor. Um futuro modo gerenciado de provider externo
deve desabilitar o apply especulativo porque copiar um overlay para o
filesystem real é um limite de efeito separado, fora de
`invocation.execute()`.

Todos os três caminhos usam os parâmetros de invocação construídos em vez dos
argumentos de rascunho fornecidos pelo modelo. Nos caminhos core e ACP, uma
negação produz zero chamadas de executor e um resultado de ferramenta
estruturado `execution_denied`.

Qualquer futuro runtime de posse do Config que execute um `ToolInvocation`
diretamente deve avaliar o mesmo guard ou rotear por um agendador já
guardado. Isso é um invariante de revisão de código, não uma alegação de que
chamadores externos arbitrários podem ser interceptados.

Dois pontos de chamada de despacho de agente — o comando slash `/fork` e o
handler de fork de agente do ACP — constroem e executam uma invocação da
ferramenta de agente diretamente sem consultar o guard. O subagente gerado
compartilha o `Config` do chamador, então toda ferramenta que o próprio
subagente chama é guardada; apenas a chamada de despacho em si não é
guardada. Uma mudança futura pode estender o guard a esses pontos.

## Compatibilidade de padrão desligado

O Qwen Code não preenche `toolInvocationGuard` no seu bootstrap de CLI ou
daemon. O campo é apenas uma API de embedding em processo.

Cada caminho de execução lê o callback opcional e entra no avaliador
assíncrono apenas quando o callback existe. Quando ausente, o Qwen Code não
executa nenhuma alocação de promise de guard, clone de argumentos, chamada de
provider, anúncio de capability ou yield assíncrono adicional. Deployments
existentes de CLI e daemon, portanto, retêm seu caminho de execução anterior.

O setter de produção ausente intencionalmente no repositório significa que
esta mudança exige concordância dos mantenedores sobre a costura pública de
embedding antes do merge. Uma mudança futura de provider externo deve
permanecer um PR separado e não pode ser presumida como parte da aprovação
deste PR.

## Semântica de cancelamento e falha

O avaliador verifica cancelamento tanto antes de invocar o guard quanto depois
que sua promise se liquida. Cada caminho de execução também verifica seu sinal
ativo imediatamente após o await e antes de qualquer chamada de executor.

- cancelamento antes da avaliação: não chamar o guard nem o executor;
- cancelamento durante o await de um guard: registrar o cancelamento e não
  chamar o executor;
- negação explícita: registrar `execution_denied` e não chamar o executor;
- exceção do guard, resposta malformada ou falha de clone: falhar de forma
  fechada e não chamar o executor.

Não há retry automático. O callback do guard é dono de qualquer política de
retry específica do provider, mas um embedding host não deve fazer retry nem
executar um efeito colateral ambíguo através desta API.

## Evidência

Os testes unitários e de integração cobrem:

- decisões configuradas de allow e deny;
- razão padrão de negação;
- exceção do guard, resposta malformada e falha de clone;
- isolamento de mutação de argumentos;
- cancelamento antes e durante a avaliação do guard;
- argumentos finais normalizados nos caminhos core e ACP;
- execução especulativa para em um limite na negação;
- zero chamadas de executor na negação e cancelamento;
- paridade de `execution_denied` entre registros de resultado de ferramenta
  do core e do ACP; e
- execução existente não configurada através das suítes do agendador ao redor
  e do ACP.

Nenhum plano de E2E é exigido para este PR porque ele não adiciona CLI,
configuração, rota de daemon ou outro comportamento ativável pelo usuário.
CI multiplataforma continua obrigatório antes do merge.

## Limite de acompanhamento

Um futuro provider de política externa pode estender o contexto com
identidade confiável de sessão e prompt de posse do runtime e adaptar o
callback em processo através do limite `qwen serve` para filho ACP. Esse
acompanhamento deve ser desligado por padrão, revisado independentemente e
provar que um CLI e daemon não configurados não inicializam um provider nem
mudam o ambiente dos seus processos filhos.

A observação de resultados deve reutilizar os eventos estruturados existentes
de ciclo de vida de ferramenta, a menos que uma issue separada demonstre uma
lacuna concreta de correlação. Orquestração e política específicas de produto
permanecem fora do Qwen Code.
