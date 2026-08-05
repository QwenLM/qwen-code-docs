# Contrato de telemetria terminal de chamada de ferramenta

## Problema

Eventos terminais de chamada de ferramenta são produzidos tanto pelo
agendador do Core quanto pelo ACP. Eles já expõem `status`, `success`,
`error` e `error_type`, mas esses campos podem divergir ou estar ausentes.
Em particular, uma ferramenta pode retornar um erro suave sem um tipo de
erro, e o ACP pode chamar o logger de telemetria sem construir um
`ToolCallEvent`.

Isso deixa logs, estatísticas de uso, métricas, hooks e gravação de chat com
visões diferentes do mesmo resultado terminal.

## Escopo do PR1

O PR1 estabelece um contrato de runtime em duas fronteiras:

1. O agendador do Core converte um `ToolResult.error` não classificado em
   `ToolErrorType.UNKNOWN` antes de construir uma chamada concluída.
2. `logToolCall` normaliza todo evento antes de enviá-lo a qualquer
   consumidor de telemetria.

O contrato terminal é:

| `status`    | `success` | `error`     | `error_type`                |
| ----------- | --------- | ----------- | --------------------------- |
| `success`   | `true`    | ausente     | ausente                     |
| `error`     | `false`   | preservado  | valor explícito ou `unknown` |
| `cancelled` | `false`   | ausente     | ausente                     |

`status` é autoritativo. Um `function_name` em branco vira `unknown_tool`.
Nomes de ferramenta não vazios e tipos de erro não vazios são preservados
literalmente. O normalizador retorna uma cópia e é idempotente.

A fronteira do Core é intencionalmente privada. Implementações públicas de
ferramenta podem continuar omitindo `ToolResult.error.type`, e
`ToolCallResponseInfo.errorType` permanece opcional, porque chamadas
bem-sucedidas e canceladas não têm uma classificação de erro.

## Consumidores

O evento normalizado é usado pela telemetria da UI, pelo evento de UI
gravado do chat, QwenLogger, logs do OpenTelemetry e métricas de chamada de
ferramenta. Os aliases `error.message` e `error.type` do OpenTelemetry são
preenchidos independentemente.

O contador de chamadas de ferramenta adiciona o atributo de baixa
cardinalidade `status` enquanto mantém `success`. A entrada pública de
`recordToolCallMetrics` aceita um status opcional para compatibilidade de
origem; chamadores que o omitem são mapeados a partir do booleano legado de
sucesso. O histograma de latência permanece com chave apenas por
`function_name`, e `error_type` não é adicionado às métricas.

O QwenLogger recebe `status` e `tool_type`. Ele não recebe `mcp_server_name`,
argumentos de função, resultados ou stack traces como parte desta alteração.

## Compatibilidade e follow-ups

Esta alteração é aditiva para logs e métricas, mas muda um erro do Core não
classificado de um valor ausente para `unknown` no PostToolBatch e na
gravação de chat do Core. Consultas históricas devem coalescer tipos de erro
ausentes em `unknown`; nenhum backfill de dados é necessário.

O seguinte permanece fora do PR1:

- corrigir o cancelamento de permissão do ACP e outros bugs de status
  terminal do lado do produtor;
- normalizar a gravação separada de `tool_result` bruto do ACP;
- adicionar `error_type` ao contrato do hook PostToolUseFailure;
- adicionar classificação de erro aos spans primários de ferramenta;
- classificar pontos de erro individuais embutidos e de MCP;
- alterar a semântica legada de `totalFail` da UI.

A nova métrica `status` não deve se tornar a fonte do SLO de estabilidade
até que as correções de status terminal do ACP sejam integradas.

## Verificações de rollout

Para a nova versão do serviço, operadores devem verificar que:

- logs de chamada de ferramenta com erro nunca tenham um `error_type` em
  branco;
- logs de chamada de ferramenta nunca tenham um `function_name` em branco;
- eventos de sucesso e cancelados não carreguem campos de erro;
- erros explicitamente classificados mantenham seu tipo anterior;
- o total do contador de chamadas de ferramenta permaneça alinhado com o
  volume de logs de chamada de ferramenta; e
- o aumento em `unknown` corresponda ao intervalo ausente anterior.
