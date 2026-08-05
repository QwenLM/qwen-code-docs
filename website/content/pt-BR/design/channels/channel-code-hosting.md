# Adaptadores de Canal de Hospedagem de Código — Design

## Visão Geral

O adaptador de polling do GitHub permite que agentes de IA monitorem o GitHub
em busca de tarefas fazendo polling da API de notificações e postando
respostas do agente como comentários de issue/PR. Diferentemente dos
adaptadores IM (webhooks/long-poll em tempo real), este adaptador faz polling
em intervalos.

## Arquitetura: Notificação como Sinal de Ativação

O insight central: notificações de plataforma são **em nível de thread** e
**mutáveis** — qualquer atividade (comentário, push, mudança de label) eleva o
`updated_at`. Notificações não podem ser usadas como um fluxo de eventos
confiável por comentário.

Em vez disso, notificações servem apenas como um **sinal de ativação**
("algo aconteceu neste thread"). O adaptador então enumera os comentários
reais via API de comentários da plataforma, usando uma marca d'água por
thread para determinar quais comentários são novos.

## GitHub: Janela de Comentários Baseada em Cursor

### Desacoplamento de Timestamps de Notificação/Comentário

Um problema crítico de timing: **`updated_at` da notificação e `updated_at`
do comentário são desacoplados**.

- `notification.updated_at` é elevado por _qualquer_ atividade do thread
  (comentário, push, mudança de label) e está sujeito a atraso de entrega
- `comment.updated_at` reflete quando o comentário foi realmente criado/editado

Esses timestamps não têm relação causal. Uma notificação pode chegar 16
segundos depois do comentário que a disparou e pode ser elevada novamente por
atividade não relacionada. Usar timestamps de notificação para controlar a
enumeração de comentários, portanto, produz dois modos de falha:

1. **Respostas duplicadas** — `PUT /notifications` é assíncrono (202
   Accepted) com um corte de `last_read_at`. A resposta do bot eleva o
   `updated_at` além do corte antes que o servidor processe a marcação, então
   a notificação nunca é marcada como lida. O próximo polling a busca de novo
   e reprocessa os mesmos comentários.
2. **Respostas perdidas** — o cursor avança para
   `max(notification.updated_at)`, o que pode saltar comentários de
   notificações que chegam atrasadas. Quando essas notificações finalmente
   chegam, seus comentários ficam abaixo da janela do cursor e são excluídos
   silenciosamente.

### Design

A corretude vem de uma **janela de comentários baseada em cursor**, não do
estado de leitura da notificação:

Ciclo de polling:

1. `GET /notifications?since={cursor-1s}` — descobre threads não lidos
2. Salva `windowSince = cursor.lastProcessedAt` (o cursor **antes** deste
   polling avançá-lo)
3. `markNotificationsAsRead(maxUpdatedAt)` — marcação global best-effort
   (limpa notificações que não são de issue)
4. Avança o cursor global para `max(notification.updated_at)`
5. Por thread: `listComments(since=windowSince)` — enumera comentários
6. Exclui: comentários do próprio bot; comentários com
   `created_at > maxUpdatedAt` (acima da janela); comentários com
   `created_at <= windowSince` (abaixo da janela)
7. Processa: detecção de menção → envelope → `handleInbound`

A janela efetiva de comentários é `(windowSince, maxUpdatedAt]`. Comentários
processados em um polling anterior têm `created_at <= windowSince` (o
`maxUpdatedAt` do polling anterior) e são excluídos. Isso evita duplicatas
independentemente de `PUT /notifications` ter sucesso. Edições de comentário
não re-disparam o processamento — apenas `created_at` é usado para pertinência
à janela.

A marcação global ainda é chamada (passo 3) para limpar notificações que não
são de issue/PR e reduzir a lista de não lidos, mas ela não é essencial para
a deduplicação.

### Limitação Conhecida: Entrega Atrasada de Notificação

Como o cursor é global (não por thread), uma notificação que chega em um
polling posterior ao `created_at` dos seus comentários pode ter esses
comentários excluídos pela janela do cursor. Isso requer que a entrega da
notificação seja atrasada através de uma fronteira de polling E que comentários
de outro thread avancem o cursor além deles nesse intervalo. Na prática essa
janela é estreita (a entrega de notificação tipicamente se completa dentro de
um intervalo de polling); o usuário pode mencionar novamente para tentar de
novo.

### Limitação Conhecida: Comentários de Review de PR

`issues.listComments` retorna apenas comentários de conversa geral, não
comentários de review de PR (comentários de diff por linha). Uma @-menção em
um comentário de review de PR é descartada silenciosamente. Use um comentário
de conversa geral no PR em vez disso.

### Comportamento por Cenário

| Cenário                          | Comportamento                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Novo thread (@bot em comentário)      | Aparece (não lido) → enumera desde o cursor → processa                                                                           |
| Thread existente, novo comentário      | Reaparece (não lido) → enumera desde o cursor → comentários antigos excluídos por `<= windowSince` → apenas novos                            |
| Atividade sem comentário (push/label) | Aparece → zero novos comentários na janela → pula                                                                                  |
| Usuário marca como lido em github.com     | Desaparece da API → não processado                                                                                           |
| markNotificationsAsRead falha     | A janela do cursor ainda evita duplicatas → nenhum impacto na corretude                                                            |
| Crash após markRead, antes de concluir | Cursor não salvo → próxima inicialização busca as mesmas notificações → lote do crash reprocessado, não perdido                          |
| Bot responde a um thread           | `updated_at` elevado → notificação pode permanecer não lida → próximo polling a busca → comentários excluídos pela janela do cursor → sem duplicata |
| Nova issue com @bot no corpo       | Sem comentários → corpo contém menção → corpo alimenta o gatilho (deduplicado via `dispatchedBodies`)                                   |

## PollingChannelBase

`PollingChannelBase<Cursor>` (em `packages/channels/base/`) estende
`ChannelBase` e fornece a infraestrutura de loop de polling:

- **Loop de polling**: inicia/para via `startPollLoop()`/`stopPollLoop()`,
  chamado de `connect()`/`disconnect()`
- **Intervalo de polling**: lido da configuração do canal `pollInterval` (ms),
  validado como número positivo finito, padrão 60000
- **Persistência de cursor**: cursor JSON salvo atomicamente após cada
  `pollOnce()` bem-sucedido; carregado na construção (data corrompida ou não
  analisável → fallback para `createInitialCursor()`)
- **Validação de cursor**: hook virtual `validateCursor()` — a base rejeita
  não objetos e arrays; subclasses adicionam verificações de forma (ex.:
  GitHub rejeita data `lastProcessedAt` ausente/inválida)
- **Backoff**: exponencial de 2s → 30s em erros de polling, reiniciado em
  sucesso
- **Sleep abortável**: `abortableSleep(ms)` exposto como método protegido —
  intervalo de polling e backoff de erro são interrompíveis via `disconnect()`

Subclasses implementam apenas:

- `pollOnce()` — executa o trabalho, muta `this.cursor`
- `createInitialCursor()` — valor padrão de primeira execução

O genérico `Cursor` é qualquer objeto serializável em JSON. GitHub usa
`{ lastProcessedAt: string; dispatchedBodies?: string[] }` (o último limita a
deduplicação de corpo de primeiro contato às 500 entradas mais recentes).

## Detecção de Menção

Regex baseada em corpo, sem distinção de maiúsculas/minúsculas. Funções
separadas para detecção (`testBotMention`) e remoção (`stripBotMention`):

- Detecção: correspondência explícita de regex retornando booleano — nunca
  inferida por comparação antes/depois da remoção (diferenças de espaço em
  branco causam falsos positivos)
- Remoção: remove apenas `@bot`, preserva toda a outra formatação (sem
  colapso de espaços em branco)

## Escopo de Sessão

Adaptadores de polling usam escopo `chat_thread`: chave de roteamento =
`channel:chatId:threadId`. Isso evita colisão de sessão entre repositórios
(`repo-a/issue:42` vs `repo-b/issue:42`).

## Tratamento de Erros

A entrega é **best-effort**. Em falha de `handleInbound`, um comentário de
erro é postado por thread por ciclo de polling (então `break` sai do loop de
comentários — evita N comentários de erro idênticos); o usuário menciona
novamente para tentar de novo. Erros de API por notificação usam `continue` —
uma notificação falha não bloqueia o restante do lote. Notificações sem
`subject.url` (tipos Discussion, SecurityAlert) são puladas silenciosamente.

Se o processo sofrer crash no meio do processamento, o cursor não é salvo (ele
é persistido apenas após `pollOnce()` completar), então a próxima
inicialização busca novamente as mesmas notificações — mas a janela de
comentários baseada em cursor exclui comentários já processados, evitando
duplicatas.

A prevenção de duplicatas **não** depende de `PUT /notifications` ter
sucesso. A marcação global é limpeza best-effort; a janela do cursor é o
mecanismo de deduplicação essencial.
