# Semântica de erro de timeout do Shell

## Problema

Comandos Shell em primeiro plano atualmente descrevem um timeout em texto, mas
retornam um `ToolResult` de sucesso. O código downstream portanto registra a
chamada como bem-sucedida, envia uma resposta de função com um campo `output`
e pode renderizar um indicador de sucesso mesmo que o comando não tenha
terminado. Um cancelamento que chega após o timeout também pode sobrescrever
o motivo original. Durante a descoberta de PTY, uma chamada já abortada ainda
pode iniciar um processo, porque o serviço de execução não observa o sinal
até depois da inicialização.

## Contrato de resultado

Um timeout de primeiro plano de propriedade do Shell retorna
`ToolErrorType.EXECUTION_TIMEOUT`. O resultado usa três canais
intencionalmente separados:

| Canal           | Audiência                                 | Conteúdo de timeout                                                                              |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `error.message` | Hooks, telemetria, spans, logs, alertas   | Apenas um resumo curto do timeout                                                                |
| `llmContent`    | Resposta de função do modelo              | Resumo do timeout, saída parcial ou uma declaração explícita de sem saída, e qualquer ponteiro de truncamento |
| `returnDisplay` | Histórico interativo e clientes ACP       | Resumo do timeout, saída parcial ou declaração de sem saída, e qualquer ponteiro de truncamento  |

O agendador converte o `llmContent` de timeout em uma resposta de função cujo
`response` tem um campo `error` e nenhum campo `output`. O contexto adicional
do hook de falha é anexado uma única vez a esse erro voltado ao modelo. O
`ToolCallResponseInfo.error` de nível superior permanece o resumo operacional
curto, de modo que a saída do comando não seja copiada para telemetria ou
argumentos de erro de hook.

Outros erros suaves de ferramenta mantêm seu comportamento existente no
agendador do Core. ACP e execução especulativa codificam consistentemente
todos os erros suaves com um envelope de erro, porque esses caminhos invocam
ferramentas diretamente e, caso contrário, não teriam uma etapa de
classificação do agendador.

## Regras de causa inicial

`AbortSignal.any()` preserva o motivo do primeiro sinal que aborta. A
classificação do Shell lê apenas o motivo do sinal combinado após a execução:

- `TimeoutError` mais uma execução abortada é um timeout.
- Um motivo de promoção para segundo plano mais uma execução abortada e não
  promovida é a corrida existente de promoção recusada.
- Qualquer outra execução abortada é cancelamento.
- Um timeout que ocorre primeiro não é alterado por um cancelamento do
  usuário ou requisição de promoção posterior.
- Um cancelamento ou requisição de promoção que ocorre primeiro não é alterado
  por um timeout posterior.

O agendador do Core tem um segundo timer global opcional de execução. Um
timeout estruturado retornado por uma ferramenta permanece um timeout mesmo
que o sinal pai seja abortado antes de o agendador consumir o resultado.
Quando o próprio timer do agendador fornece o resultado de timeout, ele vence
apenas se o sinal pai ainda não estava abortado quando o timer disparou. Um
cancelamento do pai seguido pelo disparo do timer contra uma ferramenta não
cooperativa permanece cancelado.

O ACP aplica a mesma regra para timeouts estruturados de ferramenta: o
timeout é um erro e não uma interrupção, mesmo que seu sinal pai seja
observado como abortado depois. Exceções lançadas continuam usando o estado
de aborto ao vivo.

## Comportamento de inicialização

`ShellExecutionService.execute()` retorna imediatamente um handle abortado e
sem processo quando seu sinal já está abortado. A descoberta de PTY compete
com o sinal usando `getPty()` e remove seu listener temporário após a
corrida. Se o aborto vence, uma resolução ou rejeição posterior de PTY é
consumida sem iniciar um PTY ou fazer fallback para `child_process`. O
resultado retornado usa `executionMethod: 'none'` e não tem pid.

Esse comportamento afeta todos os consumidores do serviço no repositório:
encanamento de Shell em primeiro plano e em segundo plano, Shell `!` do
usuário, injeção de comando do prompt, tratamento de shell da bridge ACP e
sondas de atribuição de git. A única mudança de comportamento é que uma
requisição já abortada não inicia mais um processo.

## Comportamento dos consumidores

| Consumidor                                        | Comportamento de timeout                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Agendador do Core                                 | `status: error`, erro curto de nível superior, `response.error` detalhado, tipo de falha de timeout      |
| Sessão ACP                                        | atualização de ferramenta com falha, envelope de erro detalhado no histórico do modelo e na gravação, metadados operacionais curtos |
| Execução especulativa                             | envelope de erro detalhado; histórico especulativo aceito renderiza Error                                |
| Adaptador Anthropic                               | `tool_result.is_error: true`                                                                             |
| Adaptadores compatíveis com OpenAI                | texto de erro detalhado explícito; não existe um bit de erro em nível de protocolo                       |
| JSON e stream-json                                | `is_error: true` com conteúdo de erro aninhado detalhado preferido sobre o resumo curto                  |
| Estimativa de contexto e orçamento de lote        | tanto o texto de `response.output` quanto o de `response.error` são contados; erros grandes demais mantêm a chave de erro quando descarregados |

A microcompactação continua deixando resultados de ferramenta com falha
intocados. A compactação completa do chat agora vê o tamanho do erro
detalhado e pode disparar no orçamento correto.

## Comparação com o Claude Code

O Claude Code trata um timeout de comando como um resultado de ferramenta com
falha, mantém a saída produzida antes do encerramento para o modelo e o
usuário, e marca o resultado da ferramenta como um erro no protocolo
Anthropic. Este design adota essas propriedades observáveis enquanto mantém o
formato existente de `ToolResult` e as convenções de telemetria do qwen-code.
Ele não copia a saída do comando para o canal operacional curto de erro.

## Compatibilidade e observabilidade

Esta é uma correção intencional em nível de wire. Falhas suaves de ACP e
especulativas mudam de `{ output }` para `{ error }`; o Core muda esse formato
apenas para `EXECUTION_TIMEOUT`. Contagens de timeout se movem de métricas de
sucesso para métricas de erro/timeout, e hooks de falha substituem hooks de
sucesso. Nenhuma mudança de schema, enum de erro, padrão de timeout, migração
ou flag de rollout.

A saída parcial do comando pode conter dados sensíveis. Ela permanece
disponível para o modelo, o resultado interativo, a gravação do chat e a
saída JSON explícita, como era antes da correção de classificação. Ela não é
adicionada a argumentos de erro de hook, erros de nível superior, atributos
de resultado de span ou resumos de log operacional. Limites existentes de
truncamento e de derramamento para disco se aplicam ao canal detalhado do
modelo.

## Fora do escopo

- Heartbeats ou relatórios periódicos de progresso
- Guards de parada de todo ou mudanças de prompt
- Semântica de código de saída diferente de zero
- Semântica de encerramento por sinal externo
- Timeouts de Shell em segundo plano
- Esperar pela saída parcial após o timer global do agendador vencer
- Novas configurações de timeout ou campos de protocolo

## Verificação

A cobertura unitária exercita corridas de pré-aborto e de descoberta de PTY,
ordenação de timeout/cancelamento/promoção do Shell, simulação de sed, canais
curto versus detalhado do agendador, ordenação do timeout global do Core,
invocação direta de ACP e especulativa, conversão Anthropic, seleção de
conteúdo JSON, estimativa de tamanho de erro e descarregamento de lote. O
plano E2E está registrado em `.qwen/e2e-tests/shell-timeout-semantics.md`.
