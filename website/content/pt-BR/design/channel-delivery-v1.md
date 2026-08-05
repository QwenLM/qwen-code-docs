# Channel Delivery V1

## Objetivo

Permitir que tarefas agendadas, prompts do daemon e uma API Notify direta
enviem texto para um destino IM explícito através do Channel Worker que possui
o workspace selecionado. A entrega é imediata e best effort: não há outbox
durável, replay, retry ou hook global de resposta final.

## Contrato público

```ts
interface ChannelDelivery {
  kind: 'channel';
  target: {
    channelName: string;
    type: 'user' | 'chat';
    id: string;
  };
}
```

A criação de tarefa agendada e `POST /session/:id/prompt` aceitam um
`delivery` opcional de nível superior. A notificação direta usa:

```http
POST /workspace/notify
POST /workspaces/:workspace/notify

{
  "text": "alert text",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

O daemon normaliza o destino público na sua fronteira de confiança para a
requisição interna do worker
`{ deliveryId, channelName, target: { type, id }, text }`. O texto enviado a
um worker deve ser não vazio e é limitado a 100.000 unidades de código UTF-16
antes do IPC. O controle reverso de Prompt e agendado pode carregar uma string
vazia apenas para reportar um turno bem-sucedido sem resposta final
entregável como `skipped`; esse caminho nunca alcança o IPC do worker.

## Fronteiras de execução

Tarefas agendadas e Prompt possuem sua própria semântica de resposta final.
Uma Session captura texto apenas quando a invocação atual carrega metadados de
delivery. Cada envio ao modelo possui um bloco de resposta: chunks de stream
que não são de pensamento são unidos dentro desse bloco, retry sem continuação
ou fallback de modelo descarta chunks substituídos, e qualquer bloco que
requisita uma ferramenta é intermediário e não pode se tornar o payload de
delivery. Uma continuação automática posterior substitui o candidato terminal
anterior. Depois que o turno completo alcança um `end_turn` bem-sucedido, a
Session envia exatamente uma requisição de controle reverso contendo apenas o
último bloco de resposta do assistente livre de ferramentas. Narração entre
ferramentas e todos os blocos de resposta anteriores são excluídos.

Um `end_turn` bem-sucedido sempre envia a requisição de controle reverso,
inclusive quando o bloco final está vazio ou contém apenas espaços em branco.
O daemon consome primeiro a autorização fixada, retorna `skipped` sem resolver
um worker e publica um evento `channel_delivery_result`. Cancelamento, falha
do Agent e encerramento por limite de tokens não enviam nada. Saída vazia é,
portanto, distinguível de um turno que nunca foi elegível para delivery.

A admissão de Prompt permanece `202`; a conclusão do Agent permanece
`turn_complete` ou `turn_error`. A conclusão do canal é um evento
`channel_delivery_result` posterior e nunca converte sucesso do Agent em
`turn_error`.

Notify contorna Session e Agent. Ele espera por uma tentativa de delivery do
worker e mapeia entrada inválida para 400, workers indisponíveis ou cheios
para 503, timeout para 504 e falha de adaptador para 502. Um timeout tem
resultado de delivery desconhecido e não sofre retry.

Webhook permanece um caminho assíncrono independente com seu próprio segredo e
contrato de admissão de worker `202`. Ele pode reutilizar primitivas de envio
e classificação de erro de `ChannelBase`, mas não o fluxo de controle de
Prompt/Notify. Prompts de notificação em segundo plano permanecem trabalho de
Agent local e não enviam automaticamente para IM.

## Posse de workspace

O daemon vincula o workspace ao construir cada bridge ACP. A admissão de
Prompt registra o ID de delivery emitido pelo daemon e o destino fixado,
enquanto o delivery agendado é autorizado a partir da tarefa persistida. O
callback do filho deve corresponder a essa autorização e não pode escolher
`workspaceCwd` nem substituir o destino. O callback do host consome a
autorização antes de decidir entre `skipped` e delivery do worker, então
finais vazios não podem forjar eventos nem deixar um estado de autorização
one-shot/monotônico inalterado. Texto não vazio roteia apenas para o grupo de
workers do workspace canônico. Donos ausentes, em bootstrap, drenando, parados
ou removidos retornam `channel_worker_unavailable`; não há fallback para o
runtime primário nem inicialização preguiçosa de worker.

## Confiabilidade e privacidade

A autorização é consumida antes que a disponibilidade do worker seja
verificada, então uma oscilação transitória do worker após o consumo descarta
esse delivery único permanentemente; isso é consistente com o contrato
imediato, best effort e sem retry.

Este V1 não tem persistência, replay de inicialização, varredura histórica,
retry ou garantia de idempotência. Tarefas existentes sem delivery nunca
enviam. O comportamento existente de catch-up do agendador não muda. Execuções
normais carregam delivery apenas quando a tarefa já o contém; o lote sintético
histórico de one-shot perdidos limpa explicitamente o delivery para que
habilitar o Channel depois não possa criar uma explosão de alertas antigos.

O V1 observa apenas a Promise de envio do Channel. Uma rejeição é sanitizada e
mapeada para `channel_delivery_failed`, exceto adaptadores que já fornecem uma
disposição permanente tipificada, mapeados para `channel_delivery_rejected`.
Parsing de resposta específico do provedor e semântica consistente de razão de
erro entre adaptadores IM são trabalho de acompanhamento; o daemon e o worker
não contêm tratamento de erro específico de plataforma.

Eventos e logs de resultado de delivery incluem identificadores de
correlação, origem, status e dados de erro sanitizados. Eles nunca incluem
texto de mensagem, IDs de destino, credenciais ou segredos de webhook.
`delivered` significa que a Promise de envio do adaptador resolveu; não alega
que o provedor aceitou a mensagem ou que um usuário a recebeu ou leu.

## Capability

O daemon anuncia `channel_delivery` quando suporta os contratos e rotas. Isso
é suporte de protocolo, não uma alegação de saúde ao vivo de qualquer worker
ou adaptador.
