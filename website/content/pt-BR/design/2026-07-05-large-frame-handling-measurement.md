# Medição do Tratamento de Frames Grandes no Pipe

## Resumo

Este PR é uma etapa de medição e design para frames grandes de pipe do ACP no `qwen serve`. Ele não altera payloads do pipe, limites de frames, comportamento do EventBus, comportamento do SDK, campos de protocolo público, flags de CLI, parâmetros de query HTTP ou capacidades anunciadas.

O objetivo imediato é coletar atribuição de baixa cardinalidade para mensagens NDJSON de pipe de tamanho excessivo, para que o próximo design de sidecar possa usar distribuições reais de `pipe.message_bytes` em vez de limites estimados.

## Limites Atuais

O pipe filho do ACP atualmente não possui um limite de bytes por frame. As métricas existentes do daemon registram `pipe.message_bytes` apenas com o atributo `direction`, que é intencionalmente de baixa cardinalidade, mas não consegue explicar quais famílias de payload causam frames grandes.

Os leitores SSE do SDK já possuem um limite de buffer separado de 16 MiB para entrega de browser/event-stream. Esse limite não restringe o tamanho do frame do pipe do daemon para o filho e não explica as origens dos frames do pipe.

O replay em massa de sessões atualmente tem um limite de contagem de 10.000 atualizações. Ele não possui um limite de bytes, portanto, um número limitado de atualizações grandes ainda pode criar um frame de resposta grande.

## Formato da Medição

O novo observador interno de NDJSON recebe `{ direction, bytes, message }` após uma mensagem ser lida ou escrita com sucesso no pipe. Os hooks de bytes existentes ainda recebem apenas `bytes`, preservando o caminho de métricas atual.

O daemon registra contagens de pipe existentes, totais, máximos, métricas de histograma e campos de status para cada frame. A atribuição de frames grandes só é executada quando `bytes >= 256 * 1024`.

Os logs de frames grandes são amostrados com uma janela de processo por daemon de 50 registros a cada 60 segundos. As contagens de amostras suprimidas são anexadas ao próximo log de frame grande registrado.

Os campos registrados são restritos a atribuições de baixa sensibilidade: direção, tamanho em bytes, limite, tipo de mensagem JSON-RPC, método, classe de origem, contagem de atualizações, contagem e estratégia de atualizações resumidas quando limitado, tipo de atualização de sessão, marcador de atualização de sessão mista, nome da ferramenta, proveniência da ferramenta, tipo de raw output, máximos de bytes de texto superficial para conteúdo e raw output, bytes aproximados limitados de raw output não-string mais um marcador de limite, e contadores de supressão de limite de taxa. Payloads, IDs de sessão, IDs de cliente, caminhos de arquivo, prompts e raw output de ferramentas não são registrados.

O histograma permanece de baixa cardinalidade e mantém apenas `direction`; campos como método, nome da ferramenta, atualização de sessão e classe de origem não são adicionados como atributos de métrica.

## Classes de Origem

O observador usa apenas classes de origem que podem ser comprovadas a partir da forma do frame:

- `session_update_notification`: uma notificação `session/update` com `params.update`.
- `load_session_bulk_replay_response`: uma resposta JSON-RPC contendo `_meta["qwen.session.loadReplay"]`.
- `load_updates_response`: uma resposta JSON-RPC contendo `result.updates` mais marcadores de resposta de load-update.
- `jsonrpc_request`: qualquer outra solicitação ou notificação JSON-RPC com um método.
- `jsonrpc_response`: qualquer outra resposta JSON-RPC.
- `unknown`: qualquer outra coisa.

A camada de pipe não consegue distinguir de forma confiável frames `session/update` ao vivo versus reproduzidos, portanto, esta medição não emite um campo de atribuição `live` ou `replay`.

## Candidatos a Sidecar para a Próxima Fase

O provável alvo do sidecar é o raw output grande de ferramentas carregado por `tool_call_update`, especialmente texto em `content[]` e `rawOutput`. Uma implementação posterior deve manter uma pequena prévia de wire ou stub na atualização, enquanto coloca o corpo completo em um sidecar gerenciado pelo daemon.

Os metadados devem trafegar por `_meta` para que clientes mais antigos os ignorem e clientes mais novos possam optar por resolver o conteúdo do sidecar. O contrato do sidecar deve definir ciclo de vida, controle de acesso, limpeza, limites de bytes, comportamento de fallback e UX do cliente antes da implementação.

O replay em massa e `qwen/session/loadUpdates` precisam de tratamento separado porque uma resposta pode ser grande devido a muitas atualizações médias ou poucas atualizações grandes. Os campos de medição incluem `updateCount`, `summarizedUpdateCount`, `summarizedUpdateStrategy`, `maxContentTextBytes`, `maxRawOutputTextBytes`, `maxRawOutputApproxBytes` e `maxRawOutputApproxBytesCapped` para separar esses casos sem percorrer arrays de atualizações ilimitados ou materializar raw outputs não-string grandes. Quando os arrays de atualizações excedem o orçamento de resumo, os campos máximos são computados a partir de uma amostra determinística de prefixo mais sufixo, em vez de uma varredura completa.

## Não Objetivos

Este PR não implementa armazenamento de sidecar, transferência de arquivos temporários, limites de frames, limites de bytes do replay-ring, trimming de compactação, limites de bytes do EventBus ou limites de bytes do buffer de binding HTTP do ACP.

Este PR não adiciona um parâmetro de query `?maxFrameBytes` ou `?maxQueuedBytes`, uma flag de CLI, uma opção de SDK ou uma capacidade. O orçamento de memória e transporte do daemon não deve ser aumentado por clientes arbitrários.

Este PR não altera esquemas de eventos públicos. Qualquer protocolo de sidecar futuro deve ser aditivo e revisado separadamente.