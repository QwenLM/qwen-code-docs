# Cards Interativos do DingTalk

## Status

Contrato final de implementação para [#6443](https://github.com/QwenLM/qwen-code/issues/6443). Este documento fixa a fronteira de implementação, o contrato de payload, a propriedade de estado, o comportamento de degradação e os critérios de aceitação seguidos pela implementação de runtime correspondente.

## Motivação

O canal DingTalk já consegue entregar Markdown, receber eventos de ciclo de vida de tarefa, retransmitir requisições de permissão e cancelar um prompt ativo. Ele não fornece um card de status de execução in-place, uma ação Stop de execução exata ou um card de formulário que possa retornar respostas estruturadas de `ask_user_question` para a requisição original.

O design adiciona essas interações do DingTalk sem ensinar o modelo, as ferramentas, o schema ACP ou outros adapters de canal sobre os templates e payloads de callback do DingTalk.

## Capítulo 1: Arquitetura alvo

![Arquitetura dos cards interativos do DingTalk](./assets/dingtalk-interactive-cards-architecture.png)

![Compatibilidade e degradação de adapters de canal](./assets/dingtalk-interactive-cards-other-im-impact.png)

![Fronteira futura de extensão de adapters IM](./assets/dingtalk-interactive-cards-other-im-extension.png)

A arquitetura tem quatro camadas de propriedade:

1. Core e ACP continuam sendo donos das questões semânticas e da resolução de permissões.
2. `ChannelBase` é dono do registro, liquidação e cancelamento de execução exata de requisições pendentes.
3. O adapter DingTalk é dono da apresentação de cards, roteamento de callback, registries, idempotência e degradação.
4. O Card OpenAPI do DingTalk é dono da entrega, atualizações em streaming, atualizações de instância e transporte de callback.

Existem dois tipos de card, não um ciclo de vida de card genérico:

| Card                  | Objeto de negócio                                  | Protocolo DingTalk                                     | Ciclo de vida local                                                          |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Card de status em streaming | Um segmento de saída visível                 | `createAndDeliver`, `/card/streaming`, `/card/instances` | `running`, `completed`, `failed`, `stopped`, `cancelled`                   |
| Card de callback de formulário | Uma requisição de pergunta de usuário de propriedade do Canal | `createAndDeliver`, callback de card, `/card/instances` | `pending`, `submitted`, `cancelled`, `expired`, `resolved_outside_presenter` |

Eles compartilham autenticação e entrada de callback, mas mantêm registries e máquinas de estado independentes.

## Capacidades existentes reutilizadas — sem mudança

- `ask_user_question` já define perguntas, opções e comportamento de seleção múltipla.
- O metadata de permissão do ACP identifica uma interação de pergunta de usuário e preserva as perguntas.
- Permissões pendentes já têm IDs de requisição e um caminho de resposta única.
- `ChannelBase` já suporta múltiplas requisições de permissão pendentes para o mesmo chat.
- Eventos de ciclo de vida de tarefa já expõem `started`, chunks de texto, chamadas de ferramenta, `completed`, `failed` e `cancelled`.
- O cancelamento de prompt ativo já alimenta `/cancel`.
- O DingTalk já tem conectividade Stream e uma entrada de callback downstream genérica.
- As superfícies CLI/TUI, Web e IDE já renderizam perguntas de usuário nativamente.

## Restrições de fonte verificadas

As restrições comportamentais abaixo foram reverificadas contra `origin/main` durante a implementação:

- `packages/channels/base/src/ChannelBase.ts` registra cada permissão pendente, incluindo seu índice de requisição e chat, antes de formatar ou enviar o prompt Markdown existente. O mesmo registry suporta múltiplas requisições em um chat e direciona o lookup de `/approve`, `/approve-always` e `/deny`.
- `packages/channels/base/src/ChannelAgentBridge.ts` inclui o resultado da permissão em `PermissionResolvedEvent`. `packages/channels/base/src/AcpBridge.ts` emite esse evento sincronicamente antes que um respondedor bem-sucedido retorne, enquanto `packages/channels/base/src/DaemonChannelBridge.ts` retém um mapeamento de requisições respondidas e pode emitir o evento depois.
- `packages/core/src/tools/askUserQuestion.ts` permite de uma a quatro perguntas. O `permission_request` ao vivo carrega as perguntas ordenadas, mas não garante um `answerKey` pronto para renderização em cada uma. `packages/acp-bridge/src/bridgeClient.ts` adiciona chaves de resposta baseadas em índice apenas ao seu snapshot de status de interação pendente. A costura do Canal deve, portanto, derivar as mesmas chaves `String(index)` quando normaliza a requisição ao vivo.
- A sessão ACP consome um `answers: Record<string, string>` de nível superior além do resultado da permissão. Respostas de seleção múltipla permanecem strings juntadas por vírgula e espaço para compatibilidade com os clientes TUI e Web existentes.
- Os comandos de permissão genéricos enviam uma opção ou resultado de cancelamento, não respostas estruturadas. Aprovar um `ask_user_question` através do caminho atual do Canal, portanto, o retoma com um mapa de respostas vazio e produz `No valid answers were provided.` O caminho apresentado por card não deve reutilizar `/approve`.
- Quando mais de uma requisição está pendente, a resposta de ambiguidade existente já lista IDs e títulos de requisição, então o design não adiciona outro campo de card apenas para desambiguação de comando.

## Impacto da mudança e fronteira de implementação

Os rótulos neste documento são normativos:

- **Mudança necessária — camada compartilhada do Canal** significa que a implementação muda `ChannelBase` ou tipos públicos de propriedade do Canal.
- **Mudança apenas DingTalk** significa que nenhum outro adapter lê a configuração ou participa da máquina de estado.
- **Sem mudança** significa que o contrato existente e o comportamento de runtime permanecem autoritativos.

| Camada ou superfície                                                                            | Impacto                              | Trabalho necessário                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/channels/base/src/ChannelBase.ts`                                                     | Mudança necessária — Canal compartilhado | Adicionar identidade de execução, cancelamento de execução exata, normalização de perguntas semânticas, liquidação de apresentação e tratamento de comandos de perguntas estruturadas. |
| `packages/channels/base/src/types.ts` e exports                                                 | Mudança necessária — Canal compartilhado | Adicionar tipos de entrada semântica mais `runId` e `owner` públicos opcionais de ciclo de vida; eventos assistidos emitidos por `ChannelBase` sempre preenchem ambos.                 |
| `packages/channels/dingtalk`                                                                    | Mudança apenas DingTalk              | Adicionar configuração de card, acesso ao Card OpenAPI, parsing de callback, verificações de dono, dois registries, projeções coalescidas limitadas, degradação e testes.               |
| Este documento de design                                                                        | Mudança necessária — apenas documentação | Registrar os contratos finais de payload, propriedade, impacto de mudança, ciclo de vida, degradação e aceitação.                                                                      |
| Assets de arquitetura                                                                           | Apenas documentação                  | Mostrar a cadeia de runtime, a matriz de compatibilidade e degradação e a fronteira futura de extensão de adapters sem introduzir campos de plataforma no contrato compartilhado.      |
| `packages/core`, `ask_user_question` e `ToolConfirmationPayload`                                | Sem mudança                          | Continuar produzindo perguntas semânticas e consumindo `answers`.                                                                                                                        |
| Sessão de agente ACP, schema ACP, `acp-bridge`, mediador de permissão, rotas do daemon e SDK do daemon | Sem mudança                    | Continuar carregando `toolCall`, opções de permissão, resultados e `answers` de nível superior.                                                                                          |
| `ChannelAgentBridge`, `AcpBridge`, `DaemonChannelBridge`, worker do daemon e `SessionRouter`    | Sem mudança                          | Continuar retransmitindo requisições de permissão completas, roteando pelo `sessionId` dono e retornando respostas de permissão. Nenhum evento de bridge `userQuestionRequest` separado é introduzido. |
| Clientes CLI/TUI, Web/Desktop, IDE, SDK                                                         | Sem mudança                          | Continuar usando suas UIs de pergunta nativas e transportes de permissão existentes.                                                                                                     |
| Adapters Feishu, WeCom, QQ, Telegram, Weixin e plugin                                           | Sem mudança direta                   | Herdar o resultado de apresentação `unsupported` padrão e reter o Markdown e os comandos de permissão existentes. Sua conhecida incapacidade de retornar respostas estruturadas do Canal permanece explícita. |

O `runId` e o `owner` públicos opcionais de ciclo de vida evitam forçar adapters de terceiros ou fixtures de teste que sintetizam eventos de ciclo de vida a mudar imediatamente. `runId` não é opcional dentro de `ChannelBase`: todo prompt de propriedade do Canal tem um, e todo evento de ciclo de vida emitido para esse prompt o inclui. Um prompt de entrada assistido também carrega o dono normalizado do Canal; prompts de loop e webhook deliberadamente o omitem. O DingTalk não cria nenhum card interativo se a identidade necessária estiver ausente.

## Costura de entrada de usuário neutra de canal — mudança no Canal compartilhado

`ChannelBase` ganha um hook de apresentação semântica com três resultados explícitos:

```ts
type UserInputPresentationResult =
  | { kind: 'presented' }
  | { kind: 'handled' }
  | { kind: 'unsupported' };

type UserInputSettlementReason =
  | 'resolved_outside_presenter'
  | 'cancelled'
  | 'run_cancelled';

type ChannelUserInputResponse = RequestPermissionResponse & {
  answers?: Record<string, string>;
};

interface ChannelUserQuestion {
  answerKey: string;
  header: string;
  question: string;
  options: Array<{
    label: string;
    description: string;
  }>;
  multiSelect: boolean;
}

interface ChannelPromptOwner {
  kind: 'channel_user';
  id: string;
}

interface ChannelUserInputRequestContext {
  requestId: string;
  sessionId: string;
  runId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  questions: ChannelUserQuestion[];
  submitOptionId: string;
  onSettled(listener: (reason: UserInputSettlementReason) => void): () => void;
  respond(response: ChannelUserInputResponse): Promise<boolean>;
}

protected presentUserInputRequest(
  context: ChannelUserInputRequestContext,
): Promise<UserInputPresentationResult>;
```

`onSettled` é uma assinatura tipada de uso único em vez de um `AbortSignal`, cujo `reason` público é `any`. `ChannelBase` é o único escritor de liquidação; ele chama cada listener com um `UserInputSettlementReason`, e a função retornada desregistra apenas esse listener. O `ChannelPromptOwner` compartilhado é deliberadamente neutro de adapter: ele identifica o usuário humano do Canal que iniciou a execução sem expor payloads de callback do DingTalk ou nomes de campos de identidade. O contexto não contém ID de template, ID de ação, `outTrackId` ou objeto de bridge mutável. `submitOptionId` é a opção de permissão original anunciada como `allow_once`; para compatibilidade com produtores atuais, uma opção cujo ID é `proceed_once` e cujo `kind` está ausente é tratada da mesma forma. O adapter nunca inventa um ID de opção.

### Reconhecimento de requisição semântica

`ChannelBase` é dono de um normalizador para que adapters não reinterpretem independentemente o payload ACP:

1. O discriminador canônico é `toolCall._meta.qwenInteractionKind === 'user_question'`.
2. As perguntas canônicas vêm de `toolCall._meta.qwenQuestions`.
3. Para produtores mais antigos, `toolCall.rawInput.questions` é aceito apenas quando o nome canônico da ferramenta ou o tipo da ferramenta também identifica `AskUserQuestion`. Uma ferramenta diferente que por acaso aceita um argumento `questions` não é entrada semântica de usuário.
4. O normalizador valida de uma a quatro perguntas ordenadas, normaliza um `multiSelect` omitido para `false` e atribui `answerKey: String(index)`.
5. Uma requisição canônica malformada não é parcialmente renderizada. Ela segue o caminho existente de permissão não suportada e registra um diagnóstico estruturado sem registrar as respostas das perguntas no log.

O hook é inserido depois que a permissão pendente e seu controlador de liquidação são armazenados, mas antes do formatador e remetente de permissão existentes:

```text
armazenar PendingPermission + controlador de liquidação
active = ActivePrompt atual assistido de propriedade do Canal para event.sessionId
normalizar pergunta semântica + opção allow_once compatível
se pergunta válida e active tem runId + submitOptionId:
  construir contexto a partir de active e perguntas normalizadas
  resultado = presentUserInputRequest(contexto)
  presented   -> marcar entrada estruturada como apresentada, manter pendente e retornar
  handled     -> válido apenas se o adapter invocou context.respond sincronicamente
  unsupported -> continuar
formatar e enviar a mensagem de permissão existente
```

O closure `respond` é a única operação de liquidação visível ao adapter. Ele vincula o ID de requisição, encaminha a resposta completa através da bridge existente e realiza a mesma limpeza de pendência nos caminhos `true`, `false` e lançamento de exceção. `ChannelBase` registra se ele foi invocado antes que o hook de apresentação resolva. `handled` sem essa invocação é uma violação de contrato e recai na mensagem de permissão existente; não é uma segunda forma de deixar uma requisição pendente.

Todo caminho que remove uma permissão pendente liquida o controlador exatamente uma vez. Isso inclui comandos de permissão, o respondedor de contexto, `permissionResolved` do daemon, limpeza de sessão, cancelamento de tarefa e substituição de bridge. Um cancelamento de execução conhecido localmente liquida com `run_cancelled` antes que um resultado posterior de bridge colapsada possa sobrescrevê-lo. Um `permissionResolved` independente com um resultado de cancelamento, ou com a opção de rejeição original, torna-se o `cancelled` neutro; outro resultado ou resultado ausente torna-se `resolved_outside_presenter`. A bridge não preserva informação de causa suficiente para inferir timeout versus negação versus limpeza, então esta classificação nunca rotula um cancelamento desconhecido como `expired` e nunca adivinha qual cliente respondeu. O timer de pergunta local do DingTalk é dono da projeção `expired` distinta antes de chamar o respondedor.

O hook é elegível apenas para o `ActivePrompt` atual assistido de propriedade do Canal. `loopPrompt === true` é inelegível; isso exclui tanto jobs de loop agendados quanto produtores de webhook, cujos IDs de mensagem e remetentes são sintéticos em vez de entrada humana do DingTalk. Quando nenhum prompt ativo elegível, `runId` e dono existem, `ChannelBase` não constrói o contexto nem invoca o hook; ele trata a apresentação como `unsupported` e continua o caminho de permissão existente. O adapter independentemente exige o mesmo registro de propriedade de mensagem de entrada real do DingTalk para a execução. Uma execução iniciada por CLI, Web, IDE, SDK, outro cliente, um loop ou um webhook, portanto, não cria nenhuma interação vinculada a card. O design inicial não adiciona federação de identidade entre clientes.

O hook padrão retorna `unsupported`. Outros adapters IM, portanto, retêm sua formatação e comandos de permissão atuais.

## Identidade e cancelamento de execução exata — mudança no Canal compartilhado

Toda invocação de prompt cria um `runId` único opaco e o armazena no `ActivePrompt` correspondente. Não é a geração de ciclo de vida do daemon, que muda para operações de ciclo de vida de sessão em vez de cada prompt.

`ChannelTaskLifecycleBase` expõe `runId?: string` e `owner?: ChannelPromptOwner` para compatibilidade de fonte. `ChannelBase` inclui o ID de execução concreto em todo evento `started`, `text_chunk`, `tool_call` e terminal que emite. Prompts assistidos incluem o mesmo dono em todo evento; prompts de loop e webhook o omitem. Um consumidor que recebe um evento sem a identidade necessária pode continuar seu comportamento existente, mas não pode criar uma ação de card.

Um callback Stop de card de status carrega esse `runId` para um novo ponto de entrada protegido de cancelamento de execução exata de `ChannelBase`. O método lê o prompt ativo atual uma vez e verifica atomicamente o ID esperado antes de entrar no caminho de cancelamento existente. Um prompt ativo ausente ou um ID ausente, obsoleto ou divergente retorna `false`; o caminho vinculado ao card nunca recai para o cancelamento apenas por sessão. O comportamento existente de `/cancel` permanece com escopo de sessão e inalterado.

A sequência Stop aceita é:

1. Validar o dono do callback e a identidade do card.
2. Reivindicar sincronicamente o callback ao vivo atual antes da primeira operação assíncrona.
3. Pedir ao `ChannelBase` para cancelar a execução exata esperada.
4. Se o cancelamento retornar `true`, bloquear novos chunks de card de status, fechar o streaming e confirmar a apresentação Stopped.
5. Se o cancelamento retornar `false` e o mesmo registro ainda for atual e não terminal, liberar a reivindicação, manter o card ativo e permitir retry.

A reivindicação é um lock em andamento local do adapter, não um estado de ciclo de vida. Um resultado assíncrono pode atualizar ou liberar apenas o mesmo registro ainda atual e não terminal; um timeout, liquidação ou evento de ciclo de vida terminal que vencer durante o await não pode ser sobrescrito. Isso impede que um card antigo cancele um prompt mais recente, impede que callbacks duplicados disputem e evita reivindicar sucesso antes que o cancelamento tenha sucesso, sem adicionar um estado público `processing`.

## Ações de card apenas para o dono — mudança apenas DingTalk

A autorização de ação de card é mais estrita que a autorização de mensagem de sessão compartilhada. Stop, submit e cancel são sempre apenas para o dono, independentemente de `sessionScope`.

No momento da mensagem de entrada, o DingTalk já prefere `senderStaffId` e faz fallback para `senderId` para o remetente do envelope. Antes de entregar um turno de entrada real ao `ChannelBase`, o adapter registra `messageId -> DingTalkOwnerKey`. O mapa segue o teto existente de 1.000 entradas para mensagens de entrada. Um evento de ciclo de vida `started` correspondente consome e remove esse mapeamento, cria um registro de execução/status local do DingTalk e vincula o mesmo `runId` gerado pelo Canal ao dono tipado. IDs de mensagem de loop e webhook nunca entram no mapa. A limpeza de execução terminal remove o registro de execução/status depois de finalizar suas perguntas. O roteador de callback normaliza o `userId`, `senderStaffId` ou `senderId` do callback para o mesmo domínio tipado e exige uma correspondência exata. Se nenhuma identidade comparável estiver disponível, a ação falha de forma fail closed.

Um callback de usuário estrangeiro é reconhecido, mas não pode modificar uma execução, requisição de permissão ou card. Quando o card ao vivo pertence a um grupo, o controlador retorna o alvo de grupo original com o resultado `forbidden` e o adapter envia um aviso genérico "apenas o dono da tarefa pode operar este card" para esse grupo após o ACK do callback. Esse aviso usa o caminho de mensagem de grupo de saída diretamente: ele não é convertido em uma mensagem de entrada e nunca entra no contexto do Agente. Um aviso falho é registrado no log e não recai para liquidação de permissão, mutação de card ou entrega ao Agente. O feedback forbidden de card direto retém o caminho existente de mensagem direta.

`ignored` permanece distinto de `forbidden`. Callbacks duplicados, obsoletos, malformados e não reconhecidos são reconhecidos e descartados com segurança sem feedback de grupo, impedindo que callbacks repetidos ou forjados inundem um grupo. A distinção é uma disposição de callback interna do adapter, não um estado visível de card do DingTalk.

## Implementação local do DingTalk — mudança apenas DingTalk

Apenas o adapter DingTalk lê `interactiveCards` e registra o tópico de callback de card. Ele é dono de:

- Um cliente Card OpenAPI autenticado compartilhado que aplica o timeout de requisição fixo de 10 segundos a ambos os tipos de card.
- Um mapa limitado de donos de entrada real.
- Um registry de execução/status com chave por `runId`, com um `outTrackId` opcional de card de status.
- Um registry de cards de pergunta com chave por `requestId` e `outTrackId`.
- Um roteador de callback que valida o dono.
- Escritores coalescidos por card, reivindicações transitórias em andamento e tombstones terminais limitados.
- Fallback local do DingTalk e relato de erro estruturado.

A apresentação de perguntas tem escopo por `sessionId + owner.id`. Diferentes usuários e sessões podem possuir cards ao vivo independentemente. Se a mesma execução já tem uma pergunta nativa pendente naquele escopo, outra requisição retorna `unsupported`: `ChannelBase` mantém o primeiro card respondível e envia a segunda requisição através do fallback de permissão por texto existente. Ele não expira o primeiro card nem sintetiza uma resposta de permissão. O término da execução ainda expira ou cancela todo card possuído por aquela execução.

## Ciclo de vida do card de status em streaming — mudança apenas DingTalk

O card de status representa um segmento de saída visível dentro de uma execução de propriedade do Canal. Execuções iniciadas por CLI, Web, IDE, SDK ou outro cliente ainda podem afetar o estado da sessão compartilhada, mas não criam um card de status do DingTalk.

A criação e o streaming seguem o protocolo de card em streaming do DingTalk:

1. Chamar `createAndDeliver` com um `outTrackId` único e `flowStatus=2` inicial.
2. Abrir o streaming com uma atualização completa vazia usando `isFull=true`, `isFinalize=false` e `isError=false`.
3. Acumular a saída do modelo localmente e enviar snapshots completos coalescidos através de `/card/streaming`.
4. Enviar variáveis de template de baixa frequência, como texto de status, através de `/card/instances` com `updateCardDataByKey=true`.

Chunks brutos nunca se tornam uma requisição de rede cada. Cada registro de status permite no máximo uma escrita de Card OpenAPI em andamento e um snapshot completo pendente substituível. Um intervalo mínimo fixo de flush de 500 ms coalesce chunks mais novos nesse snapshot pendente. O conteúdo visível é limitado a 20.000 caracteres; o overflow descarta o conteúdo mais antigo e insere um marcador de truncatura em vez de crescer a memória. Toda chamada de Card OpenAPI tem um timeout de 10 segundos. Um timeout ou falha intermediária registra um erro estruturado, para escritas adicionais de streaming para esse card e retém o texto limitado mais recente para o caminho de entrega final aguardado.

Cards de status são preguiçosos e com escopo de segmento. Uma pergunta direta não cria nenhum card de status. O texto antes de uma pergunta fecha seu segmento antes que o card de pergunta seja apresentado, e o texto de continuação posterior abre um novo segmento:

```text
primeiro texto visível -> running
running -> completed
running -> failed
running -> stopped | cancelled
liquidação de pergunta + texto posterior -> um novo segmento running
```

O ciclo de vida do core permanece `cancelled`; nenhum evento `stopped` é introduzido. Um cancelamento com reason `cancel_command` pode ser apresentado como "Stopped" no DingTalk, enquanto outros reasons de cancelamento podem ser apresentados como "Cancelled".

Para `blockStreaming !== 'on'`, o DingTalk sobrescreve a costura aguardada existente `onResponseComplete()`. Esse método consome o último texto acumulado, cancela um timer de flush pendente, espera a única escrita em andamento dentro do seu timeout, realiza a atualização de instância final de completed e faz fallback para o remetente Markdown existente se a criação ou finalização do card não tiver sucesso. `ChannelBase`, portanto, emite `completed` apenas depois que um caminho de entrega aguardado termina. Nenhum novo hook compartilhado de entrega terminal é adicionado.

Quando `blockStreaming === 'on'`, o DingTalk não cria um card de status e não consome chunks brutos de ciclo de vida para entrega de card; o `BlockStreamer` existente permanece o único caminho de entrega de resposta. Cards de pergunta permanecem independentemente elegíveis. `onTaskLifecycle` registra causas terminais e pode fazer projeções best-effort de failed/cancelled, mas não é tratado como uma garantia de entrega aguardada.

Atualizações terminais de card de status seguem uma ordem limitada:

1. Parar de aceitar novos chunks de streaming, cancelar o timer de flush e dobrar o único snapshot pendente no conteúdo final limitado em vez de repetir cada chunk original.
2. Se o streaming foi aberto, fechá-lo com `isFinalize=true`.
3. Sanitizar marcadores locais de imagem não resolvidos para que o cancelamento terminal não possa expor um caminho do sistema de arquivos.
4. Confirmar o conteúdo final, conteúdo copiável, texto de status e `flowStatus=3` com uma atualização de `/card/instances`.

Completed, failed e cancelled todos projetam para `flowStatus=3` do DingTalk; o conteúdo final e o texto de status os distinguem. Uma vez terminal, o escritor por `outTrackId` rejeita atualizações tardias de streaming.

## Ciclo de vida do card de callback de formulário — mudança apenas DingTalk

O card de pergunta representa uma requisição de permissão contendo o array de perguntas normalizado completo. O schema da ferramenta permite de uma a quatro perguntas.

Cada registro pendente contém:

- `requestId`, `outTrackId` e `runId`.
- O conjunto de perguntas ordenado completo e suas chaves de resposta.
- O `submitOptionId` anunciado original.
- A identidade de dono tipada.
- O respondedor de uso único original.
- Assinaturas de timeout e liquidação.
- O estado local `reserved`, `pending` ou `claimed`; a terminalização
  substitui o registro por um tombstone compacto.

O ciclo de vida segue a disciplina de disputa de entrega mais recente do OpenClaw sem
copiar sua persistência ou continuação de mensagem sintética:

```text
reserved   inserido e assinado antes do createAndDeliver
pending    ativado apenas após entrega bem-sucedida enquanto ainda reserved
claimed    reivindicado atomicamente por um callback válido
terminal   a primeira liquidação vence; o payload ao vivo é compactado
```

Se a liquidação ou o cancelamento de execução tornar um registro `reserved` terminal enquanto
`createAndDeliver` está em andamento, uma entrega bem-sucedida posterior não pode reativá-lo.
O adapter desabilita esse card entregue de forma best-effort e retorna sem
chamar o respondedor novamente.

A ordem dos callbacks é autoritativa:

1. Localizar o registro por `outTrackId` e correlacionar a requisição e a execução.
2. Parsear o payload de submit ou cancel sem alterar o registro.
3. Validar o dono da ação.
4. Para submit, rejeitar toda chave de resposta de formulário que não está presente no conjunto de perguntas normalizado armazenado.
5. Reivindicar atomicamente o registro `pending` atual como `claimed` antes da primeira operação assíncrona.
6. Reconhecer o callback imediatamente. Callbacks inválidos, duplicados, obsoletos e de dono estrangeiro também são reconhecidos exatamente uma vez após suas verificações síncronas.
7. Chamar o respondedor original.
8. Se o mesmo registro ainda for atual e não terminal, finalizar e projetar o card a partir do resultado do respondedor.

O submit codifica o formulário usando o contrato existente entre clientes:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "<opção allow_once anunciada>"
  },
  "answers": {
    "0": "Beijing staging",
    "1": "Logs, Metrics"
  }
}
```

Valores de seleção única e entrada customizada são strings. Valores de seleção múltipla são juntados com `", "` para corresponder ao comportamento atual da TUI e da Web. O cancel envia apenas um resultado de cancelamento ou de rejeição anunciado, sem respostas. O adapter nunca envia um prompt sintético ou mensagem de entrada.

O card nunca exibe sucesso de submissão antes que o respondedor aceite a resposta:

| Evento                             | Estado local                 | Projeção do card                                                          |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| Respondedor de submit retorna `true` | `submitted`               | Enviado e desabilitado                                                    |
| Respondedor de cancel retorna `true` | `cancelled`               | Cancelado e desabilitado                                                  |
| `respond(...) === false`           | `expired`                    | `card_status=expired` não interativo, "Question no longer available"      |
| `respond(...)` lança exceção       | `expired`                    | Projeção de falha não interativa, desabilitado e sem retry                |
| Liquidação independente não-cancel | `resolved_outside_presenter` | `card_status=expired` não interativo, "Resolved outside this card"      |
| Cancelamento colapsado independente | `cancelled`                | `card_status=cancelled` não interativo, "Cancelled" neutro                |
| Timeout                            | `expired`                    | Expirado e desabilitado                                                   |
| Requisição ou execução destruída   | `cancelled`                  | Cancelado ou Stopped e desabilitado                                       |
| Callback duplicado ou tardio       | Estado terminal existente    | Reconhecer e ignorar                                                      |
| Liquidação em registro terminal    | Estado terminal existente    | Ignorar através do tombstone terminal                                     |

O estado local `resolved_outside_presenter` é entrado apenas a partir de um evento de liquidação independente não-cancel, não inferido de um resultado `false` do respondedor. `false` significa apenas que a resposta de permissão não foi aceita: o mapeamento de requisição pode estar ausente, sua sessão pode ter desaparecido ou outra superfície pode já ter vencido. Ambos os casos, portanto, usam a projeção `expired` não interativa sem reivindicar cancelamento pelo usuário.

A bridge do daemon existente consome o mapeamento de requisição para sessão quando `respondToPermission()` lança exceção, e `ChannelBase` remove a requisição pendente no mesmo caminho. Um `permissionResolved` posterior do daemon não é mais um sinal confiável de limpeza porque a bridge pode rejeitá-lo como uma requisição desconhecida. O DingTalk, portanto, registra a falha no log, remove seu registro pendente, retém o tombstone terminal e imediatamente faz uma projeção best-effort de não sucesso. Ele não libera a reivindicação nem promete retry de callback.

`AcpBridge` emite `permissionResolved` sincronicamente antes que um `respondToPermission()` bem-sucedido retorne. Enquanto a reivindicação do respondedor do DingTalk está em andamento, o adapter, portanto, adia a projeção de liquidação correspondente até que o resultado do respondedor e a ação do callback sejam conhecidos. Um submit aceito torna-se `submitted`; um cancel aceito torna-se `cancelled`; `false` e lançamentos de exceção usam as linhas terminais acima. Uma liquidação recebida sem uma reivindicação de respondedor local segue as linhas cientes de resultado acima. A bridge do daemon emite sua liquidação bem-sucedida depois, após reter um mapeamento de requisição respondida; se o card já está terminal, o tombstone ignora esse evento. O timer local do DingTalk primeiro finaliza o card ao vivo como `expired` e então chama o respondedor, para que o cancelamento colapsado da bridge não possa re-rotulá-lo. Um cancelamento de execução conhecido localmente similarmente finaliza como `run_cancelled` antes da limpeza da bridge. Cancelamentos colapsados desconhecidos permanecem o `cancelled` neutro. Esta arbitragem reutiliza a reivindicação transitória e não adiciona nenhum estado público de processamento, fila de retry ou taxonomia de erro.

Uma atualização de instância é uma projeção de UI, não a transação de permissão. Se o respondedor tiver sucesso mas a atualização de card subsequente falhar, a permissão permanece resolvida, o registro local permanece terminal, callbacks duplicados permanecem rejeitados e o adapter registra a projeção de UI falha no log.

Diferente da implementação de referência do OpenClaw, o Qwen Code não injeta uma mensagem de entrada sintética. Ele responde diretamente à requisição de permissão original. Uma segunda requisição na mesma execução ao vivo usa o fallback de texto e deixa o primeiro card nativo respondível.

## Configuração e templates embutidos — mudança apenas DingTalk

A configuração da capacidade é local ao DingTalk. Ela é parseada pelo adapter DingTalk e não adiciona um conceito de card entre canais ao `ChannelConfig`:

```json
{
  "interactiveCards": {
    "enabled": true,
    "statusCard": {
      "enabled": true
    },
    "questionCard": {
      "enabled": true,
      "timeoutMs": 270000
    }
  }
}
```

O tempo de vida efetivo da pergunta é o menor entre o timeout configurado e o tempo de vida da permissão do host.

IDs de template são assets embutidos do Canal DingTalk, não configuração do usuário. O plugin de referência usa esses IDs com as próprias credenciais DingTalk do bot instalado; eles não são tratados como recursos de propriedade do AppKey do repositório de referência:

- Card de status: `675cde2f-f526-40cb-b828-f5b2b57b8b77.schema`
- Card de pergunta: `c2a6355b-9724-4f7e-9653-d33fcb3311bb.schema`

O design não adiciona configuração de template fornecida pelo usuário nem verificação de saúde na inicialização. Uma rejeição de OpenAPI no primeiro uso é um erro estruturado proeminente contendo o ID do template e o código de erro do DingTalk, e então entra no caminho de degradação documentado.

Evidências para o contrato de assets embutidos e o fluxo de callback:

- [soimy/openclaw-channel-dingtalk#583](https://github.com/soimy/openclaw-channel-dingtalk/pull/583) está mergeado e registra entrega de card em dispositivo real, callback de submit, callback de cancel e verificação de continuação de tarefa.
- [soimy/openclaw-channel-dingtalk#585](https://github.com/soimy/openclaw-channel-dingtalk/pull/585) está mergeado, entrega o asset final de template de card de pergunta e foi aprovado pelo mantenedor.
- [OpenClaw main em `a8fb6f80e7`](https://github.com/soimy/openclaw-channel-dingtalk/commit/a8fb6f80e7360ce0ffee2d4a8007951bd85b23a4) fornece a referência atual de disputa de entrega reserve/activate/claim/terminal.

Essas fontes fornecem evidência de Card OpenAPI, template e concorrência. O Qwen Code não copia sua ferramenta separada, `AsyncLocalStorage`, armazenamento persistente de ciclo de vida, reinjeção de mensagem sintética, supersessão de pergunta, verificação de dono fail-open ou timing de ACK após await de callback.

## Comportamento de degradação — mudança apenas DingTalk

O design inicial não adiciona uma fila de retry em segundo plano e não retém um estado persistente `presentation_failed`.

| Situação                                            | Comportamento                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card de status desabilitado ou criação/atualização final falha | Usar a entrega de resposta Markdown aguardada existente e registrar um erro estruturado de card. Falha de atualização intermediária para escritas adicionais de streaming e preserva texto limitado para a entrega final. |
| Card de status entregue mas abertura do streaming falha | Desabilitar o card em branco de forma best-effort, parar escritas de card para a execução e usar a entrega de resposta Markdown aguardada existente.                                             |
| `blockStreaming === 'on'`                           | Pular o card de status; reter o caminho de entrega existente do `BlockStreamer`. Cards de pergunta permanecem independentemente elegíveis.                                                        |
| Card de pergunta criado                             | Retornar `presented`; manter a permissão original pendente.                                                                                                                                       |
| A mesma execução já tem uma pergunta nativa pendente | Retornar `unsupported` para a requisição mais nova; manter o primeiro card ativo e usar o fallback de permissão por texto existente para a requisição mais nova.                                 |
| Card de pergunta desabilitado ou criação falha      | Enviar Markdown semântico legível, declarar que a pergunta foi cancelada e pode ter retry, cancelar a requisição original, retornar `handled` e registrar a falha ciente de template no log.      |
| Nenhuma execução ativa atual de propriedade do Canal | Tratar a apresentação como `unsupported`; pular ambos os cards do DingTalk e preservar o caminho de permissão existente.                                                                         |
| Cancelamento de execução exata retorna `false`      | Liberar a reivindicação transitória apenas se o mesmo registro permanecer atual e não terminal; manter o card de status ativo para que o Stop possa ter retry.                                    |
| Respondedor de pergunta retorna `false`             | Terminar com a projeção de cancelamento existente e uma mensagem neutra "Permission no longer pending".                                                                                          |
| Respondedor de pergunta lança exceção               | Remover o registro pendente, finalizar o registro reivindicado como cancelado, reter um tombstone, projetar não sucesso imediatamente e não anunciar retry de callback.                           |
| Outro caminho resolve primeiro                      | Quando nenhuma reivindicação de respondedor local está em andamento, classificar um cancelamento colapsado como `cancelled` neutro; usar `resolved_outside_presenter` apenas para um resultado não-cancel. |
| Requisição/execução é destruída                     | Liquidar como cancelamento de requisição/execução; projetar o card como cancelado ou Stopped.                                                                                                    |
| Outro adapter IM é dono da sessão                   | Retornar `unsupported` e preservar sua mensagem e comandos de permissão existentes.                                                                                                               |
| Permissão comum                                     | Manter `/approve`, `/approve-always` e `/deny` inalterados.                                                                                                                                       |

Para uma pergunta apresentada por card, `/approve` e `/approve-always` permanecem reconhecidos, mas não chamam o respondedor; eles instruem o usuário a enviar através do card porque a aprovação não pode fornecer o objeto `answers` necessário. `/deny [requestId]` permanece uma saída de emergência porque a negação já está completa sem respostas. `ChannelBase` exige que o remetente do comando corresponda ao remetente do prompt originário e então roteia a negação através do mesmo respondedor de contexto de uso único, para que a liquidação do card, a limpeza do registry e a semântica de primeiro-respondedor-vence permaneçam intactas. Requisições ambíguas retêm o prompt existente de ID de requisição explícito. Outras permissões e adapters mantêm seu comportamento de comando atual. O design inicial não promete retry automático de callback.

## Impacto nos clientes — clientes existentes permanecem inalterados

| Cliente ou superfície                                    | Impacto                | Comportamento após esta proposta                                                              |
| -------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| Execução de propriedade do Canal DingTalk                | Mudança apenas DingTalk | Criar e atualizar o card de status em streaming.                                             |
| Requisição de pergunta de propriedade do Canal DingTalk  | Mudança apenas DingTalk | Apresentar o card de callback de formulário ou o fallback semântico local do DingTalk.       |
| Requisição roteada pelo DingTalk sem execução ativa de propriedade do Canal | Sem mudança de comportamento | Nenhum card do DingTalk; preservar o caminho de permissão existente.              |
| CLI/TUI                                                  | Sem mudança            | Continuar usando o diálogo de pergunta nativo.                                               |
| Web/Desktop                                              | Sem mudança            | Continuar usando o componente de pergunta nativo e o transporte de ação existente.           |
| IDE/ACP                                                  | Sem mudança            | Continuar usando a UI de pergunta ACP nativa; sem mudança de schema.                         |
| Clientes SDK e ACP customizados                          | Sem mudança            | Continuar usando o protocolo existente de requisição e resposta de permissão.                |
| Outros adapters IM                                       | Sem mudança direta     | Herdar `unsupported`; reter seu comportamento de permissão atual e limitação conhecida.      |
| Permissões comuns                                        | Sem mudança            | Manter a UI de aprovação e os comandos existentes em todo cliente.                           |

A resolução de permissão permanece primeiro-respondedor-vence. A reivindicação transitória do DingTalk apenas serializa callbacks para um card e arbitra uma liquidação correspondente que chega durante sua chamada de respondedor; ela não substitui a liquidação compartilhada. Se uma liquidação independente chega sem uma reivindicação local, o DingTalk classifica seu resultado sem reivindicar qual cliente respondeu. Se o respondedor do card retorna `true`, a ação do callback seleciona `submitted` ou `cancelled`, e um `permissionResolved` correspondente é limpeza em vez de evidência de que outra superfície venceu.

## Critérios de aceitação da implementação

A implementação está completa apenas quando o seguinte comportamento estiver coberto. Esses testes exercitam as camadas alteradas; suítes inalteradas de Core, ACP, daemon, Web, IDE e outros adapters não são trabalho de feature desta proposta.

### Testes do Canal compartilhado — mudança necessária

- Todo prompt de propriedade do Canal recebe um `runId` único; todos os eventos de ciclo de vida para esse prompt carregam o mesmo ID, e um prompt posterior na mesma sessão recebe um ID diferente.
- O cancelamento de execução exata tem sucesso apenas para o ID atual. IDs ausentes, obsoletos e divergentes retornam `false` e nunca recaem para o cancelamento apenas por sessão.
- O normalizador semântico aceita o `_meta.qwenInteractionKind` canônico mais `_meta.qwenQuestions`, atribui chaves de resposta string ordenadas e normaliza `multiSelect` ausente para `false`.
- O caminho de compatibilidade aceita `rawInput.questions` apenas para uma ferramenta AskUserQuestion identificada e não classifica incorretamente outra ferramenta com um argumento `questions`.
- A normalização de opção de submit aceita `kind: allow_once` e a opção legada atual `proceed_once` sem `kind`, e nunca inventa um ID de opção.
- `presented`, `handled` e `unsupported` seguem cada um seu comportamento declarado de propriedade de pendência.
- Prompts de loop e webhook são inelegíveis para apresentação de card semântico mesmo emitindo eventos de ciclo de vida comuns.
- Uma pergunta apresentada por card não pode ser aprovada por `/approve` ou `/approve-always`; `/deny [requestId]` apenas do dono usa o mesmo respondedor de uso único, enquanto permissões comuns retêm todos os comandos.
- Listeners de liquidação recebem apenas valores tipados de `UserInputSettlementReason`; o cancelamento de execução conhecido localmente vence sobre um cancelamento colapsado posterior da bridge.
- Resposta direta, `permissionResolved` externo, timeout, cancelamento, morte de sessão, substituição de bridge e falha de envio liquidam e removem o registro pendente exatamente uma vez.

### Testes do adapter DingTalk — mudança apenas DingTalk

- Um evento `started` real humano do DingTalk vincula uma execução elegível a partir da sua mensagem de entrada e dono; IDs de mensagem sintéticos, desconhecidos, de loop e de webhook não criam nenhuma execução elegível ou card.
- Com block streaming desligado, um card de status coalesce chunks com no máximo uma escrita em andamento e um snapshot pendente limitado; a entrega de completed aguarda a finalização e faz fallback para Markdown. Com block streaming ligado, nenhum card de status é criado e a entrega de bloco existente permanece autoritativa.
- O Stop valida o dono e a identidade do card, reivindica uma vez, cancela apenas o `runId` correspondente, rejeita duplicados e permanece com retry possível apenas após um resultado `false` não terminal.
- Uma requisição de permissão cria um card de pergunta contendo todas as perguntas e suas chaves de resposta ordenadas; uma segunda requisição na mesma execução recai para o texto enquanto o primeiro card permanece interativo, e diferentes usuários e sessões permanecem independentes.
- Uma pergunta é reservada antes da entrega, ativa apenas se ainda ao vivo após a entrega e nunca revive após liquidação em andamento ou cancelamento de execução.
- O submit seleciona a opção `allow_once` anunciada original, codifica respostas únicas, de seleção múltipla e customizadas como `Record<string, string>` e resolve diretamente a requisição original.
- Um submit contendo qualquer chave de resposta fora do conjunto de perguntas normalizado armazenado é rejeitado antes que o respondedor seja chamado.
- O transporte de callback é reconhecido exatamente uma vez após parse, correlação, autorização e reivindicação síncronos, e antes de qualquer await de respondedor ou Card OpenAPI.
- Submit, cancel, timeout, cancelamento de execução, destruição de requisição, resolução externa, callback duplicado, `false` do respondedor, lançamento de exceção do respondedor e falha de projeção de card todos usam `finalizeQuestion`, limpam o conjunto de pendência de nível de execução e nunca reabrem um registro terminal.
- Um usuário de callback estrangeiro ou não identificável falha de forma fail closed e não pode modificar nenhum dos registries.
- Conteúdo de streaming, duração de Card OpenAPI e tombstones terminais obedecem aos seus limites fixos de tamanho/tempo; registros terminais não contêm respondedor, respostas, perguntas, timers, assinaturas ou conteúdo enfileirado.
- Desabilitar cards ou rejeitar um template segue o caminho de degradação de status ou pergunta documentado sem expor o JSON bruto da requisição.

### Verificação de revisor ponta a ponta — comportamento alterado do DingTalk

- Em um cliente DingTalk real, verificar as projeções de criação de card de status, streaming ordenado, conclusão, falha e cancelamento.
- Verificar que uma ação Stop cancela sua execução ativa exata e que um card antigo não pode cancelar uma execução mais nova na mesma sessão.
- Verificar cards de uma e múltiplas perguntas, seleção única, seleção múltipla, entrada customizada, cancel, timeout e continuação de tarefa com as respostas enviadas.
- Anexar Web ou IDE à mesma sessão do daemon, resolver a pergunta ali primeiro e verificar que o card do DingTalk torna-se não interativo sem reivindicar que o DingTalk a enviou.
- Desabilitar cada tipo de card independentemente e verificar o comportamento Markdown documentado e a continuação da execução de tarefa ou cancelamento da pergunta.
- Com `blockStreaming=on`, verificar que a resposta de bloco existente permanece autoritativa enquanto cards de pergunta ainda podem ser enviados com sucesso.

## Capítulo 2: Impacto atual em outros adapters IM — sem mudança direta

O hook compartilhado é uma costura opt-in, não uma distribuição do comportamento do DingTalk. Adapters Feishu, QQ, Telegram, WeCom, Weixin e plugin não leem configuração, IDs de template, ações de callback ou estados de card do DingTalk. Sua formatação e comandos de permissão existentes permanecem inalterados.

A limitação existente permanece explícita: `/approve` não pode carregar respostas de `ask_user_question`. Esta proposta não cancela silenciosamente perguntas nem expõe o JSON bruto da requisição em outros adapters IM.

## Capítulo 3: Blueprint de extensão futura — sem mudança nesta proposta

Um adapter IM futuro pode sobrescrever explicitamente o hook semântico para uma requisição vinculada ao seu próprio `ActivePrompt` atual. Um adapter retornando `presented` deve ser dono da sua apresentação de plataforma, parser de callback ou resposta estruturada, registry de pendências, verificações de dono e execução, timeout, liquidação ciente de causa, idempotência e resposta direta à requisição original. Ele não deve injetar uma mensagem de usuário sintética apenas para retomar a execução.

Cada adapter deve optar por participar através de uma mudança separada, para que sua capacidade específica de plataforma e propriedade de estado possam ser revisadas independentemente.

## Riscos e limites de escopo

A primeira implementação é intencionalmente local ao daemon. Registries de cards pendentes ao vivo estão vinculados ao tempo de vida do processo; recuperação segura a reinícios e roteamento de callback multi-instância não aderente exigem um design de persistência separado. Um registro terminal é compactado para apenas correlação de callback, estado terminal e metadata de expiração, retido por 10 minutos para reentrega de callback e armazenado em mapas ordenados por inserção limitados a 1.000 entradas por tipo de card. A expiração e a evicção da entrada mais antiga o recuperam; nenhum respondedor, payload de pergunta, payload de resposta, timer, assinatura ou conteúdo enfileirado sobrevive à terminalização.

Esta implementação não adiciona propriedade de execução ou mapeamento de identidade entre clientes, um protocolo de resposta por texto entre canais, parsing de resposta livre, injeção de mensagem sintética, um framework geral de cards entre canais, um sistema de retry de callback ou uma nova máquina de estado de processamento/erro.
