# Status de Execução de Ferramenta

## Motivação

O status terminal da chamada de ferramenta descreve se a chamada como um todo
teve sucesso, falhou ou foi cancelada. Ele não diz se o dispatcher realmente
entrou em `invocation.execute()`. Falhas de validação, rejeições de permissão,
falhas de execução e falhas pós-execução, portanto, precisam de um resultado
de execução separado antes de poderem ser medidos com precisão.

## Contrato

`ToolCallResponseInfo` carrega um `executionStatus` opcional para
compatibilidade de código-fonte e de registro:

```ts
type ToolExecutionStatus = 'not_started' | 'success' | 'error' | 'cancelled';
```

O agendador do core (`CoreToolScheduler`) e o `Session.runTool` do ACP sempre
definem o campo. Valores ausentes de gravações mais antigas, produtores de
terceiros e projeções de resultado de subagente (o caminho `buildResponse`
não interativo, que reproduz o resultado reportado por outro agente) se
tornam `unknown` apenas no limite de telemetria e nunca são inferidos do
status terminal da chamada.

Os eixos terminal e de execução são intencionalmente independentes:

| Status terminal | Status de execução | Exemplo                                                                              |
| --------------- | ------------------ | ------------------------------------------------------------------------------------ |
| `success`       | `success`          | Conclusão normal de ferramenta                                                        |
| `success`       | `not_started`      | Resposta sintética irmã (sibling) no nível do protocolo                               |
| `error`         | qualquer valor     | Negação pré-execução, erro de execução, erro de pós-processamento ou override de hook de lote |
| `cancelled`     | qualquer valor     | Cancelamento antes, durante ou depois da execução                                     |

Lendo cada linha como um par (terminal, execução), as únicas combinações
inválidas são `success/error` e `success/cancelled`: uma chamada que termina
`success` só pode carregar status de execução `success` ou `not_started`.
O status de execução congela quando `invocation.execute()` se liquida; hooks,
ponte de resultado, persistência e processamento em lote não podem
sobrescrevê-lo. A habilitação do PostToolBatch e seu span de ferramenta pai
são capturados em snapshot quando um lote do agendador inicia, então a
reconfiguração de hooks em runtime afeta o próximo lote em vez de mudar o
comportamento de conclusão de um lote em andamento.

## Telemetria

O evento `tool_call` normalizado adiciona `call_id` e `execution_status`. A
normalização ocorre uma vez antes de todos os sinks:

- nomes de ferramenta vazios viram `unknown_tool`;
- `success` é recalculado a partir do `status` terminal;
- erros terminais sem tipo de erro usam `unknown`;
- sucesso e cancelamento omitem campos de erro no nível da chamada;
- status de execução ausente vira `unknown`.

A dimensão `status` terminal em `qwen-code.tool.call.count`, estabelecida
pelo contrato de telemetria terminal, é inalterada por este design. Um novo
contador `qwen-code.tool.execution.count` usa apenas as dimensões específicas
de evento `execution_status` e `tool_type`. Atributos comuns de métrica
configurados globalmente, como o opt-in `session.id`, também podem estar
presentes. A taxa de falha de execução é:

```text
execution_status = error
────────────────────────────────────────
execution_status in {success, error}
```

Cancelamento, `not_started` e `unknown` são excluídos. Tipo de erro, nome de
função, ID de chamada, mensagens e nomes de servidor MCP permanecem em logs
ou spans em vez de rótulos de métrica. O contador deliberadamente omite
`function_name`, então uma taxa de falha de execução não pode ser atribuída a
uma ferramenta específica apenas pela métrica; faça drill down pelos logs de
`tool_call`, que carregam tanto `call_id` quanto `function_name`.

Um span de execução existe apenas depois que o dispatcher tenta `execute()`.
Ele registra a identidade da ferramenta, o status de execução congelado e o
tipo de erro de execução. Spans de ferramenta pai continuam representando o
status terminal da chamada, e spans cancelados permanecem unset em vez de
error. O core abre o span pai após resolução da ferramenta e validação da
invocação; caminhos terminais mais cedo são cobertos pelo evento normalizado
e contador de execução e não sintetizam um span a partir de um nome de
requisição não resolvido.

O QwenLogger recebe o status terminal normalizado, status de execução, ID de
chamada e tipo de ferramenta, mas não nomes de servidor MCP ou argumentos de
função. Nomes de servidor MCP permanecem fora do QwenLogger e estão
disponíveis para exporters configurados de log e span de telemetria.

## Compatibilidade e escopo

Os campos públicos de resposta e evento permanecem opcionais. Produtores
embutidos usam um formato interno obrigatório, enquanto gravações JSONL
antigas não são migradas nem preenchidas retroativamente. Novas gravações
JSONL incluem `executionStatus` nos resultados de ferramenta gravados; o
campo é aditivo, então leitores de replay que ignoram campos desconhecidos
não são afetados. Projeções manuais de gravação nos modos core, ACP, TUI e
não interativo copiam o novo escalar sem expô-lo na saída JSON visível ao
usuário. Uma chamada cancelada antes da resolução da ferramenta pode omitir
`tool` e `invocation` da variante pública `CancelledToolCall`, então
consumidores dessa variante devem guardar esses campos antes do uso. Quando
um cancelamento pré-resolução assim é emitido pela telemetria, `tool_type`
tem como padrão `"native"` porque a identidade da ferramenta ainda não está
resolvida; este é um viés conhecido na dimensão `tool_type` para
cancelamentos pré-validação.

Erros de execução por chamada não rejeitam mais
`CoreToolScheduler.schedule()`; o resultado é entregue através dos callbacks
existentes de atualização e conclusão como uma chamada `error` terminal,
então a falha de uma ferramenta não aborta suas irmãs. O método ainda
retorna `Promise<void>` e pode rejeitar por falhas de configuração ou fila no
nível do agendador. `handleConfirmationResponse()` terminaliza erros do fluxo
de confirmação antes de relançá-los, preservando seu sinal de falha existente
sem deixar uma chamada em `awaiting_approval`. Embedders devem ler `status`
terminal e `executionStatus` de chamadas entregues por callback, não esperar
que nenhum dos dois pontos de entrada públicos retorne chamadas concluídas.

O primeiro release cobre `CoreToolScheduler` e `Session.runTool` do ACP.
Especulação, execução direta de `/fork`, retries internos do MCP,
reconciliação provisória de resultado de subagente, metadata de saída de
shell, capacidade de retry, posse e fases genéricas de falha permanecem fora
de escopo.

Core e ACP devem ser lançados juntos. Dashboards devem fazer o corte por hora
de deployment ou `service.version`, monitorar `unknown` separadamente e nunca
usar a métrica `success` legada como o SLI de falha de execução.

## Riscos de manutenção conhecidos

O invariante de cancelamento pré-execução ("todo `await` no caminho
pré-execução é seguido por uma verificação de abort") é aplicado por
verificações colocadas manualmente em cada ponto de chamada em
`CoreToolScheduler` e `Session.runTool`, em vez de por um mecanismo
estrutural. Adicionar um novo `await` a qualquer dos caminhos sem uma
verificação subsequente reintroduz silenciosamente o bug de execução obsoleta
que este design corrige. Um refactor futuro deve envolver os awaits em um
helper guardado; até lá, revisores desses caminhos devem verificar o
invariante manualmente.
