# Contrato de Apresentação de Interação de Canal

## Status

Contrato neutro entre canais implementado para o PR #6930. A projeção
específica do DingTalk e os detalhes operacionais permanecem em
`2026-07-15-dingtalk-interactive-cards.md`.

## Problema

A implementação anterior criava um card de status do DingTalk no evento
`started` no nível da execução. Se o modelo então chamasse
`ask_user_question`, o adapter criava um segundo card de formulário e mudava o
primeiro card para `Waiting for input`. O usuário via dois cards ativos mesmo
quando o modelo não produzia nenhuma resposta visível.

Isso não é uma corrida de renderização do DingTalk. É um erro de posse:

- um evento no nível da execução está sendo tratado como evento de saída
  visível;
- apresentação de saída e de entrada são máquinas de estado independentes do
  adapter;
- não há definição compartilhada de um segmento de saída visível;
- uma requisição de entrada não encerra a apresentação de saída ativa.

Corrigir apenas a remoção ou recall de cards do DingTalk preservaria o erro de
posse e não daria ao Feishu ou a futuros adapters IM um contrato de interação
estável.

## Objetivos

- Criar uma apresentação de saída apenas quando houver saída visível ao
  usuário.
- Permitir que um card nativo de entrada se torne a única apresentação ativa
  quando o modelo pede entrada antes de produzir saída visível.
- Atualizar um card de entrada in-place até seu estado terminal; não removê-lo
  durante o ciclo de vida normal.
- Retomar o contexto original de permissão e de modelo sem injetar uma mensagem
  sintética de usuário.
- Dar a cada segmento de saída e requisição de entrada correlação exata de
  execução, sessão, alvo e dono.
- Permitir que DingTalk, Feishu e futuros adapters IM optem pela mesma
  semântica sem compartilhar APIs de cards de plataforma ou schemas de
  template.
- Preservar o comportamento existente para adapters que não optarem.

## Não objetivos

- Uma API genérica multiplataforma `createCard`, `updateCard` ou `deleteCard`.
- Parsing de texto livre como substituto de entrada estruturada nativa.
- Exigir que todo IM suporte saída em streaming, formulários ou botões.
- Mover handles de plataforma do DingTalk ou Feishu para `ChannelBase`.
- Persistir callbacks ao vivo entre reinícios de processo.
- Mudar o Core, o ACP ou o contrato de respostas de `ask_user_question`.
- Refatorar a implementação existente de cards do Feishu na correção do
  DingTalk.

## Princípios de design

### Semântica compartilhada, projeção local

`ChannelBase` é dono da semântica de contexto, ordenação e liquidação. Um
adapter IM é dono da renderização nativa, transporte de callback, handles de
plataforma, throttling e falhas de projeção.

A camada compartilhada nunca se refere a cards. Ela se refere a:

- uma execução de prompt;
- um segmento de saída visível;
- uma requisição de entrada estruturada;
- o resultado terminal desses objetos.

### Contexto é capturado, nunca redescoberto

A cadeia de correlação autoritativa é:

```text
SessionTarget(chatId/threadId) -> sessionId -> runId -> segmentId/requestId
```

O adapter captura essa cadeia quando cria uma apresentação nativa. Um callback
resolve o registro capturado. Ele não deve buscar o card mais recente, a
execução mais recente ou a sessão mais recente em um chat.

`SessionTarget.threadId` permanece a partição de thread quando uma plataforma
expõe uma. Plataformas sem semântica de thread usam `chatId`. Callbacks de
plataforma não derivam independentemente um novo alvo.

### Transações e projeções são separadas

A resposta de permissão é a transação. A atualização do card é uma projeção de
UI. Uma resposta de permissão bem-sucedida nunca é revertida porque a
atualização do card nativo subsequente falhou.

## Modelo semântico compartilhado

### Execução de prompt

Um `runId` identifica uma execução de prompt de posse do Canal. Ele retém as
regras existentes de cancelamento de execução exata e de dono.

O evento de ciclo de vida `started` significa que a execução foi aceita. Ele
não abre uma apresentação de saída.

### Segmento de saída

Um segmento de saída é uma sequência contígua de texto de assistente visível
ao usuário dentro de uma execução. `ChannelBase` aloca um `segmentId` opaco
apenas quando o primeiro texto visível daquele segmento chega.

Um segmento termina no primeiro entre:

- um limite de resposta;
- apresentação de uma requisição de entrada estruturada;
- entrega bem-sucedida da resposta final;
- falha da execução;
- cancelamento da execução.

Depois que uma requisição de entrada estruturada se liquida, texto posterior
na mesma execução abre um novo segmento com um novo `segmentId`. Ele nunca
reabre ou sobrescreve o segmento anterior à pergunta.

### Requisição de entrada

Um `requestId` identifica uma requisição de permissão pendente original de
`ask_user_question`. Uma requisição pode conter todas as perguntas
normalizadas daquela chamada de ferramenta. A posse da apresentação tem escopo
de `sessionId + owner.id`. Usuários ou sessões diferentes podem ter
apresentações de entrada ativas simultaneamente. Dentro de uma execução, uma
segunda requisição no mesmo escopo retorna `unsupported`, mantém a primeira
apresentação nativa respondível e usa o fallback existente de permissão por
texto.

A máquina de estado interna de entrada do adapter é:

```text
reserved -> pending -> claimed -> terminal
```

É arbitragem de callback, não um estado de card de plataforma. O DingTalk
expõe apenas `pending`, `submitted`, `cancelled` e `expired`: envio aceito
mapeia para `submitted`, cancelamento aceito do usuário mapeia para
`cancelled`, e timeout, resolução externa ou um respondedor indisponível mapeia
para `expired`. Toda transição terminal atualiza in-place a apresentação de
entrada nativa existente e nunca a remove.

O rótulo compartilhado de liquidação é `resolved_outside_presenter`. O
contrato é compartilhado por formulários nativos e outras superfícies de
interação, então um substantivo específico de plataforma não se torna API
pública.

## Contrato compartilhado

Os hooks existentes permanecem como superfície de extensão. Eles recebem
contexto semântico mais forte em vez de operações de plataforma.

```ts
interface ChannelOutputSegmentContext {
  channelName: string;
  sessionId: string;
  runId: string;
  segmentId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  messageId?: string;
}

type ChannelOutputSegmentEndReason =
  | 'response_boundary'
  | 'input_requested'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

Os hooks de chunk e de conclusão ganham um argumento final opcional de contexto
para compatibilidade de origem. A terminação de segmento usa um hook dedicado
para que adapters possam distinguir limites de resposta de requisições de
entrada e causas terminais:

```ts
protected onResponseChunk(
  chatId: string,
  chunk: string,
  sessionId: string,
  segment?: ChannelOutputSegmentContext,
): void;

protected onOutputSegmentEnd(
  chatId: string,
  sessionId: string,
  segment: ChannelOutputSegmentContext,
  reason: ChannelOutputSegmentEndReason,
): void | Promise<void>;

protected onResponseBoundary(
  chatId: string,
  sessionId: string,
): void | Promise<void>;

protected onResponseComplete(
  chatId: string,
  text: string,
  sessionId: string,
  segment?: ChannelOutputSegmentContext,
): Promise<void>;
```

Overrides existentes que aceitam menos argumentos permanecem válidos e
inalterados. `ChannelBase` sempre fornece o contexto de segmento aos hooks de
resposta para uma execução atendida de posse do Canal e chama
`onOutputSegmentEnd` sempre que esse segmento fecha. Sua implementação padrão
delega apenas `response_boundary` ao hook legado `onResponseBoundary`.
Caminhos de loop, webhook e sintéticos legados permanecem inelegíveis para
apresentação nativa de interação.

`ChannelUserInputRequestContext` retém seu respondedor de requisição e
assinatura de liquidação existentes. Ele adicionalmente carrega o escopo de
interação capturado:

```ts
interface ChannelUserInputRequestContext {
  requestId: string;
  sessionId: string;
  runId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  precedingSegmentId?: string;
  // perguntas normalizadas existentes, opção de envio, onSettled e respond
}
```

Sua união de razões de liquidação usa `resolved_outside_presenter`,
`cancelled` e `run_cancelled`.

Antes de invocar `presentUserInputRequest`, `ChannelBase` fecha a identidade
de segmento compartilhada e passa seu ID como `precedingSegmentId`, mas não
projeta um limite de resposta de plataforma. Um adapter compatível fecha sua
própria apresentação com `input_requested` antes de apresentar a entrada
nativa. Isso impede adapters incompatíveis de limpar ou de outra forma mutar
seu estado de streaming existente. O fechamento é idempotente, então um evento
de limite de resposta de plataforma que chegue antes ou depois não pode fechar
dois segmentos diferentes.

Nenhum flag de capability compartilhado é exigido. A capability é expressa por
comportamento:

- hooks de saída são opcionais e têm como padrão a entrega existente;
- `presentUserInputRequest` retorna `unsupported` quando entrada estruturada
  nativa está indisponível;
- configuração específica de plataforma permanece dentro do adapter.

Isso evita combinações inválidas de booleanos globais e permite que um adapter
suporte saída em streaming sem suportar formulários, ou formulários sem saída
em streaming.

## Contrato do apresentador dentro de cada adapter

Um adapter pode compor um apresentador interno em vez de adicionar estado de
plataforma à sua classe principal de adapter. Esse apresentador é dono de:

- `segmentId -> handle de saída nativo`;
- `requestId/outTrackId/messageId -> handle de entrada nativo`;
- uma fila de projeção serializada por `runId`;
- snapshots de saída limitados e coalescência de atualizações;
- validação de dono de callback e reivindicações de uso único;
- timeouts de API nativa e registro de erros;
- tombstones terminais compactos.

A fila de projeção por execução garante esta ordem:

```text
terminar segmento de saída antigo
  -> criar apresentação de entrada
  -> atualizar estado terminal da entrada
  -> criar o próximo segmento de saída no seu primeiro texto visível
```

Acréscimos intermediários de saída enfileiram um snapshot completo
substituível e não bloqueiam a geração do modelo. Limite, apresentação de
entrada e entrega final entram na mesma fila para que não possam ultrapassar
escritas anteriores.

## Sequências de interação obrigatórias

### Resposta normal

```text
execução iniciada
  -> sem saída nativa
primeiro texto visível
  -> alocar segmento-1
  -> criar de forma lazy a apresentação de saída nativa
chunks posteriores
  -> atualizar segmento-1
execução concluída
  -> atualizar segmento-1 in-place para concluído
```

Se um provider retornar uma resposta final sem emitir chunks, a entrega final
aloca o segmento e cria uma apresentação de saída concluída única.

### Pergunta direta

```text
execução iniciada
  -> sem saída nativa
requisição ask_user_question
  -> criar apresentação de entrada da requisição-1
```

Nenhum segmento de saída existe, então o usuário vê apenas a apresentação de
entrada. Enquanto ela está pendente, não há apresentação separada de status de
execução. O estado pendente da apresentação de entrada é a indicação visível
de que a execução está esperando o usuário.

### Texto seguido de pergunta

```text
primeiro texto visível
  -> criar apresentação de saída do segmento-1
requisição ask_user_question
  -> concluir segmento-1 in-place
  -> criar apresentação de entrada da requisição-1
```

A saída concluída permanece como histórico de conversa, mas apenas a
apresentação de entrada está ativa.

### Envio de pergunta e continuação

```text
callback válido
  -> correlacionar requisição-1 e validar dono
  -> reivindicar requisição-1 atomicamente
  -> reconhecer callback
  -> responder à permissão original
  -> atualizar requisição-1 in-place para enviado
próximo texto visível do modelo na mesma execução
  -> alocar segmento-2
  -> criar uma nova apresentação de saída
```

A resposta retoma o contexto original do modelo. O adapter não injeta uma
mensagem de entrada sintética.

### Perguntas concorrentes

No máximo uma apresentação de entrada nativa fica ativa para o mesmo
`sessionId + owner.id + runId`. Uma segunda requisição nesse escopo retorna
`unsupported`; `ChannelBase` envia seu fallback semântico por texto enquanto a
primeira apresentação nativa permanece válida. Isso evita uma requisição
pendente inalcançável sem sintetizar um cancelamento ou mensagem de entrada.
Usuários e sessões diferentes permanecem independentes, e o término da
execução fecha todas as apresentações de posse daquela execução.

## Projeção DingTalk

O apresentador do DingTalk mapeia:

- um segmento de saída para uma instância de template de card de status;
- uma requisição de entrada para uma instância de template de card de
  pergunta.

Mudanças em relação à implementação atual:

- não criar card de status em `started`;
- criá-lo no primeiro chunk ou resposta final de um segmento;
- indexar registros de status por `segmentId`, retendo `runId` para Stop;
- fechar o segmento ativo antes de criar um card de pergunta;
- manter o primeiro card de pergunta ativo quando a mesma execução requisitar
  outra pergunta e deixar a requisição mais nova usar o fallback por texto;
- nunca mudar um card de status antigo para `Waiting for input`;
- atualizar o card de pergunta in-place para enviado, cancelado, expirado ou
  resolvido externamente;
- criar um novo card de status apenas quando texto pós-envio começar.

O caminho normal não faz recall nem remove nenhum dos cards. Se uma entrega
nativa parcialmente falha deixar um órfão inutilizável que não pode ser
atualizado, a limpeza de plataforma pode removê-lo ou fazer recall como
caminho de erro de último recurso; isso não é uma transição de estado de
negócio.

A ação Stop permanece vinculada ao `runId` exato e ao dono capturados pelo
segmento. Parar a partir de qualquer segmento de saída ativo cancela apenas
aquela execução. Um segmento histórico terminal não pode parar uma execução
posterior.

A ação Cancel do card de pergunta resolve a requisição de entrada original
como cancelada. A semântica existente de cancelamento de `ask_user_question`
então decide se a execução termina; o adapter não emite um segundo
cancelamento no escopo da sessão.

A primeira projeção de metadata é deliberadamente limitada ao modelo
configurado e ao tempo de parede decorrido. O DingTalk lê o modelo opcional da
configuração existente do Canal e renderiza uma linha corrente como
`Running · qwen3.7-max · 12s`. Ele atualiza o valor decorrido quando o fluxo
coalescido existente de texto do modelo é descarregado e o segundo exibido
mudou, então o status adiciona no máximo uma atualização por segundo sem um
timer independente. Pensamento silencioso ou execução de ferramenta,
portanto, não avança o contador visível até o próximo flush de texto. A
atualização terminal sempre escreve o valor exato decorrido, por exemplo
`Stopped · qwen3.7-max · 18s`. Se a configuração do Canal não selecionar um
modelo, a linha omite o modelo em vez de inferir um.

Este incremento não expõe uso de tokens. Contagens exatas de tokens por turno
não estão presentes na bridge ou no contrato de ciclo de vida atual do Canal,
e uma estimativa derivada do texto visível seria enganosa. Uma mudança
posterior pode adicionar metadata de tokens apenas depois que o runtime
compartilhado fornecer um snapshot autoritativo por turno. Metadata ausente
nunca atrasa nem muda o estado do segmento.

## Extensão Feishu

A implementação existente do Feishu já cria cards de streaming de forma lazy
nos chunks de resposta e pode atualizar ou remover uma mensagem interativa.
Ela não precisa mudar na correção do DingTalk.

Uma mudança posterior de interação do Feishu pode adotar os mesmos contextos:

- `segmentId` substitui a posse implícita por `inboundMsgId` para cards de
  saída;
- `runId` continua protegendo Stop de cancelar uma execução mais nova;
- um formulário interativo nativo ou botões implementam
  `presentUserInputRequest`;
- o callback resolve o `requestId` capturado, não o card mais recente do chat;
- a mesma mensagem de entrada é atualizada (patch) até seu estado terminal;
- tipos de campo não suportados retornam `unsupported` ou cancelam com uma
  falha legível local da plataforma em vez de fazer parsing de texto
  arbitrário.

Telegram, WeCom, Weixin, QQ e adapters de plugin podem consumir
independentemente contextos de saída, contextos de entrada, ambos ou nenhum.
Os hooks padrão preservam seu comportamento atual.

## Regras de falha e degradação

| Falha                                                    | Comportamento obrigatório                                                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criação da apresentação de saída falha                   | Reter texto limitado e usar o caminho existente de entrega de texto aguardado.                                                                                  |
| Atualização de saída intermediária falha                 | Parar streaming nativo adicional para esse segmento; preservar o texto final para fallback.                                                                      |
| Atualização terminal de saída falha                      | Enviar o texto final pelo fallback existente e marcar a projeção nativa como indisponível.                                                                       |
| Apresentação de entrada retorna `unsupported`            | Usar a mensagem semântica de permissão existente; não fazer parsing de uma resposta livre posterior.                                                             |
| Criação de entrada nativa falha após opt-in              | Informar ao usuário que a pergunta nativa falhou, cancelar a requisição original e permitir um retry explícito.                                                  |
| Resposta de permissão tem sucesso mas atualização do card de entrada falha | Manter a permissão resolvida, reter um tombstone terminal e registrar a falha de projeção no log.                                            |
| Callback duplicado, obsoleto, estrangeiro ou malformado  | Reconhecer após validação síncrona e não fazer nenhuma mudança de estado.                                                                                         |
| Execução termina com entradas pendentes                  | Atualizar essas apresentações de entrada in-place para canceladas.                                                                                                |
| Processo reinicia com cards ao vivo                      | Tratar callbacks como não mais pendentes e atualizar para expirado/indisponível quando a correlação de plataforma permitir. Recuperação persistente é trabalho separado. |

## Limites de estado e recursos

- O conteúdo de saída permanece limitado a 20.000 caracteres visíveis por
  segmento.
- Cada segmento permite uma escrita nativa em andamento e um snapshot pendente
  substituível.
- Chamadas de API nativa retêm timeouts explícitos.
- Mapas de execução, segmento, requisição e callback ao vivo permanecem
  ordenados por inserção e limitados.
- Tombstones terminais contêm apenas correlação e estado terminal; eles não
  retêm respondedores, perguntas, respostas, timers ou conteúdo.
- Toda limpeza verifica identidade exata do objeto para que conclusão
  assíncrona tardia não possa mutar um registro mais novo da mesma sessão.

## Plano de migração

A correção deve permanecer pequena e ordenada:

1. Adicionar contexto de segmento de saída e limites de segmento idempotentes a
   `ChannelBase`, preservando assinaturas existentes de hooks através de
   parâmetros finais opcionais.
2. Adicionar testes compartilhados para alocação lazy de segmento, ordenação de
   limites, perguntas diretas, segmentos de continuação, perguntas
   concorrentes e isolamento de contexto.
3. Substituir o controlador de status com escopo de execução do DingTalk por um
   apresentador de execução dono de registros de saída com escopo de segmento e
   registros de entrada com escopo de requisição.
4. Remover a criação antecipada de card de status e a projeção `Waiting for
   input`.
5. Manter os campos V2 existentes de conteúdo final e a lógica de liquidação de
   perguntas estruturadas.
6. Verificar o DingTalk em dispositivo real com cenários de pergunta direta,
   texto-então-pergunta, continuação pós-envio, Stop, timeout e falha.
7. Deixar o código de produção do Feishu inalterado; adicionar apenas evidência
   de compatibilidade se a mudança de assinatura compartilhada exigir.

A correção local só pode ser commitada depois que a aceitação em dispositivo
real corresponder às sequências acima. Ela permanece sem push até aprovação
explícita.

## Critérios de aceitação

### Canal compartilhado

- `started` nunca aloca um segmento de saída.
- O primeiro texto visível aloca exatamente um ID de segmento.
- Um limite de resposta ou requisição de entrada fecha esse segmento
  exatamente uma vez.
- Texto após a liquidação da pergunta recebe um ID de segmento diferente na
  mesma execução e sessão.
- Correlação de `chatId/threadId`, sessão, execução, requisição, segmento e
  dono não pode cruzar entre contextos concorrentes.
- Adapters existentes sem suporte a interação retêm seu comportamento.

### DingTalk

- Um `ask_user_question` direto exibe um card de pergunta e nenhum card de
  status.
- Um card de pergunta é atualizado in-place no envio, cancelamento, expiração
  e resolução externa.
- Uma segunda pergunta na mesma execução usa o fallback por texto enquanto o
  primeiro card nativo permanece respondível.
- Usuários e sessões diferentes retêm cards de pergunta ativos independentes.
- Texto antes de uma pergunta permanece em um card de status histórico
  concluído.
- Texto após o envio aparece em um novo card de status.
- Nenhum card de status exibe `Waiting for input`.
- Stop cancela apenas a execução exata capturada.
- O conteúdo final concluído permanece visível através dos campos V2
  `blockList`, `content` e `copy_content`.

### Compatibilidade entre IMs

- O Feishu compila e seus testes existentes de card de streaming e Stop
  permanecem verdes sem adotar o novo apresentador.
- Um adapter pode implementar entrada nativa sem saída em streaming.
- Um adapter pode implementar saída em streaming sem entrada nativa.
- Um adapter que não suporta nenhum dos dois herda o comportamento de texto
  existente.

## Resumo da decisão

A abstração compartilhada é um contrato de apresentação de interação, não um
framework de cards. `ChannelBase` é dono do contexto e da semântica de
segmento/requisição. Cada IM é dono do seu apresentador nativo. Cards de saída
são lazy e com escopo de segmento; cards de entrada têm escopo de requisição e
são atualizados in-place. Isso remove o comportamento de dois cards ativos do
DingTalk enquanto dá ao Feishu e a futuros adapters um caminho de extensão
estável e neutro em relação à plataforma.
