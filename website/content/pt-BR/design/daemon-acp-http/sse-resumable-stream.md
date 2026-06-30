# ACP-over-HTTP — Stream de eventos de sessão retomável (`Last-Event-ID`)

> Status: design + implementação neste PR.
> Fecha a lacuna de retomabilidade rastreada como RFD Phase 4 em
> [`README.md`](./README.md) §7 / linha "Resume cursor (ring `Last-Event-ID`)".

## Problema

O stream de eventos de sessão Streamable-HTTP `/acp` (`GET /acp` com um header `Acp-Session-Id`) é **apenas ao vivo (live-only)**: não emite uma sequência SSE `id:` nem respeita um header de requisição `Last-Event-ID` na reconexão.

Quando um proxy do control-plane fecha por inatividade a conexão SSE de longa duração no meio de um turno (o próprio daemon envia `retry: 3000`, e proxies de ingress cortam SSEs longos com frequência), o cliente reconecta e readquire a propriedade, mas **todo frame de conteúdo produzido pelo daemon durante a lacuna é perdido** — notificações `session/update` contendo `agent_thought_chunk` / `agent_message_chunk`. O turno ainda atinge um estado terminal (um `turn_complete` é produzido / sintetizado), então a UI mostra "concluído" com um corpo vazio ou truncado. Reenviar o mesmo prompt funciona, o que é o indício: a perda está na lacuna de transporte, não no modelo.

Sintomas e evidências de campo estão catalogados nas notas de integração como **§1.8** (`sdk-known-issues.md`).

## O que já existe (e por que isso é pequeno)

O motor de replay **já está construído e testado em produção** — a lacuna é apenas que o transporte `/acp` não está conectado a ele.

`packages/acp-bridge/src/eventBus.ts`:

- `id` monótico por sessão, começando em 1 (`nextId`, atribuído em `publish()`).
- Ring buffer limitado por sessão (`DEFAULT_RING_SIZE = 8000`, substituição pelo operador `qwen serve --event-ring-size`).
- `subscribeEvents(sessionId, { lastEventId, signal })` faz o replay dos frames do ring buffer com `id > lastEventId` antes que os eventos ao vivo fluam, e emite os frames de controle sintéticos `replay_complete`, `state_resync_required` (evictado do ring / reset de epoch na reinicialização do daemon), `client_evicted`, `slow_client_warning`.

A superfície **REST** `GET /session/:id/events` já consome tudo isso: lê `last-event-id` (`server.ts` → `parseLastEventId`), passa para `subscribeEvents` e serializa cada frame com uma linha SSE `id:` (`formatSseFrame`). O bug é que o transporte **`/acp`** não faz nada disso:

| Camada                                      | REST `/session/:id/events` | `/acp` GET (hoje)                           |
| ------------------------------------------- | -------------------------- | ------------------------------------------- |
| lê o header `Last-Event-ID`                 | sim                        | **não**                                     |
| passa `lastEventId` para `subscribeEvents`  | sim                        | **não** (`dispatch.ts pumpSessionEvents`)   |
| emite linha SSE `id:`                       | sim (`formatSseFrame`)     | **não** (`SseStream.send` escreve apenas `data:`) |

O `acp-http/sse-stream.ts` até diz isso em um comentário: _"sem sequência `id:` de ring-buffer — a retomabilidade é RFD Phase 4, postergada."_ Este PR remove essa postergação.

## Decisão de wire — linha SSE `id:` (não `_meta` no payload)

As duas superfícies SSE carregam **payloads diferentes**:

- Streams REST **envelopes `BridgeEvent`** (`{ id, v, type, data, _meta }`). O parser do SDK (`sdk-typescript/src/daemon/sse.ts`) extrai o cursor do **campo `id` do envelope JSON** (ele lê apenas as linhas `data:`).
- Streams `/acp` **objetos JSON-RPC 2.0 brutos** (notificações `session/update`, requisições `session/request_permission`, respostas). Estes não têm um `id` de envelope para carregar um cursor de barramento (bus), e um `id` JSON-RPC significa outra coisa (id da requisição).

Portanto, para `/acp`, o cursor de retomada é a **linha padrão SSE `id:`**:

- É nativo do EventSource — um cliente SSE compatível com a especificação (incluindo o `AcpHttpTransport` vendored) rastreia automaticamente o último `id:` e o reenvia automaticamente como o header `Last-Event-ID` na reconexão.
- Mantém o payload JSON-RPC limpo (sem injeção não padrão de `_meta.qwen.eventId` nos frames do protocolo).
- Espelha o que `formatSseFrame` já emite no REST, então ambas as superfícies compartilham os **mesmos** ids do `eventBus` e a mesma semântica de `Last-Event-ID`.

Apenas frames **originados no barramento** carregam um `id:` (`session/update`, `session/request_permission`, notificações enviadas pelo daemon). **Respostas JSON-RPC** que trafegam no stream da sessão _não_ são eventos do barramento e **não** carregam `id:` — elas não estão no ring buffer e intencionalmente não são rastreadas para replay (uma _resposta_ de prompt em trânsito perdida é a preocupação §1.7 rastreada separadamente, fora do escopo aqui; §1.8 é sobre frames de _conteúdo_ perdidos, que são todos eventos `session/update` do barramento).

Frames terminais sintéticos (`client_evicted`, `stream_error`, …) não têm `id` de barramento e, portanto, não emitem linha `id:` — correspondendo ao REST, para que não consumam um slot na sequência monótica da qual o cliente retoma.

## Alterações

1. **`transport-stream.ts`** — `send(message, id?: number)`. O `id` opcional é o id do evento do barramento para rastreamento do cursor SSE.
2. **`sse-stream.ts`** — `send(message, id?)` prefixa `id: ${id}\n` antes da linha `data:` quando `id !== undefined` (espelha `formatSseFrame`).
3. **`ws-stream.ts`** — `send(message, id?)` aceita e **ignora** o `id`: WebSocket é uma conexão com estado, sem replay SSE (consistente com `AcpWsTransport.supportsReplay = false`).
4. **`connection-registry.ts`** — `sendSession(sessionId, frame, id?)` encadeia o `id` para `stream.send`. O **buffer** pré-attach por sessão armazena pares `{ frame, id? }` para que um frame em buffer mantenha seu cursor quando liberado (flush) no attach. (O buffer com escopo de conexão não foi alterado — esses frames são respostas JSON-RPC sem id de barramento.)
5. **`dispatch.ts`**
   - `translateEvent` passa o `event.id` por cada chamada `sendSession` / `binding.stream.send` para eventos do barramento.
   - `pumpSessionEvents(conn, sessionId, signal, lastEventId?)` encaminha o `lastEventId` para `subscribeEvents` — reutilizando diretamente o replay do ring buffer existente.
6. **`index.ts`** — a branch do session-stream `GET /acp` lê o header `Last-Event-ID` (via um `parseLastEventId` estrito, mesma regra de aceitar apenas dígitos decimais do REST) e o passa para `pumpSessionEvents`.

Nenhuma alteração no `eventBus`/bridge — o motor é reutilizado integralmente.

## Fazendo a retomada funcionar de fato (grace/reclaim do session-stream)

O encadeamento de `id:`/`Last-Event-ID` acima é necessário, mas **não suficiente** — por si só, ele nunca é disparado no fluxo real. Anteriormente, quando um stream SSE de sessão fechava no nível de transporte, o handler GET executava o teardown **completo** de `closeSessionStream`: removia a sessão de `ownedSessions`, abortava o prompt em trânsito e desanexava o cliente bridge. Na ordem real do EventSource/proxy (o socket antigo fecha _primeiro_, depois o cliente reconecta), isso significa que uma reconexão portando `Last-Event-ID` é rejeitada com **403** pela verificação de propriedade antes que o cursor seja lido — e o prompt que produzia o conteúdo já havia sido abortado. O motor de replay não teria a que se reconectar.

Portanto, um fechamento de session-stream no nível de transporte agora **desanexa** em vez de fazer o teardown (`AcpConnection.detachSessionStream`): ele para apenas o stream + sua assinatura de eventos e **mantém o binding, a propriedade, o prompt em trânsito e o registro do cliente bridge** ativos por uma janela de grace (`SESSION_GRACE_MS`, espelhando `CONN_GRACE_MS`). Uma reconexão dentro da janela reanexa (`attachSessionStream` limpa o timer de grace — reclaim) e o replay do ring buffer preenche a lacuna. Se nenhuma reconexão chegar, o timer de grace executa o teardown completo — limitando o custo de prompts descontrolados. O teardown completo permanece imediato para um `session/close` explícito e para o teardown de conexão (`destroy`). O handler GET ramifica com base em `stream.isClosed`: um fechamento de transporte → detach-with-grace; um pump que termina enquanto o stream ainda está aberto (subprocesso concluído / erro de iterador) → fechamento completo (zombie stream).

### Duas proteções de correção de replay que isso desbloqueia

Ambas estão latentes até que a retomada seja realmente executada; o grace/reclaim acima as torna alcançáveis, então elas são entregues juntas:

- **Sem entrega dupla E sem perda silenciosa (buffer ↔ ring).** Um evento de barramento em buffer _também_ está no ring buffer do EventBus (ele foi publicado lá para obter seu id). Portanto, em uma retomada (`Last-Event-ID` presente), o `attachSessionStream` recebe o cursor e **não faz flush de frames em buffer que portam id** — o replay do ring buffer (iniciado no cursor do cliente) é o único caminho de entrega para cada evento de barramento após o cursor. Isso deliberadamente _não_ é "fazer flush do buffer e então avançar o cursor de replay além dele": um frame enviado para o socket agora morto, mas nunca recebido pelo cliente, tem um id _abaixo_ dos ids do buffer, mas _acima_ do cursor do cliente, então avançar o cursor além do buffer **o descartaria silenciosamente**. Deixar o ring buffer ser o dono de todos os eventos do barramento entrega cada um exatamente uma vez, sem lacunas. Frames sem _id_ (respostas JSON-RPC roteadas via `replySession`) não são eventos do ring buffer, então o ring não os reentregará — mas eles também não devem sofrer flush no attach: um _resultado_ de `session/prompt` em buffer que sofresse flush antes do replay chegaria antes dos chunks de conteúdo que o precederam (o cliente vê "concluído" antes do corpo — exatamente a falha de corpo truncado que a §1.8 corrige). Portanto, na retomada, os frames sem id são **adiados**: deixados no buffer, e o pump de eventos os libera (`flushBufferedSessionFrames`) assim que o replay esvaziar — **apenas** no `replay_complete`, preservando a ordem original do stream. Crucial: NÃO no `state_resync_required`: o EventBus emite esse frame _antes_ dos frames de replay (e então ainda emite `replay_complete` no final), então fazer flush nele colocaria a resposta à frente do conteúdo reenviado. O caso apenas ao vivo (sem `Last-Event-ID` ⇒ sem replay ⇒ sem `replay_complete`) é coberto pelo flush de segurança pós-loop do pump. (Uma conexão nova sem `Last-Event-ID` não tem âncora no ring buffer, então faz flush de todo o buffer imediatamente, em ordem, como antes.)
- **`permission_request` idempotente sob replay.** Um `permission_request` é um evento do ring buffer que porta id, então uma reconexão cujo cursor precede uma permissão ainda não respondida faz o replay dela. `translateEvent` agora reutiliza a entrada `conn.pending` existente para aquele `bridgeRequestId` (reenviando o mesmo id JSON-RPC de saída para alcançar) em vez de cunhar um segundo id + entrada — sem pending órfão, sem prompt duplo para um cliente que deduplica em `_meta.requestId`.

`parseLastEventId` é extraído para um `serve/sse-last-event-id.ts` compartilhado, usado por ambas as superfícies REST e `/acp`, para que suas regras estritas de aceitação/rejeição e logs do operador não divirjam.

## Compatibilidade com versões anteriores

- **Clientes antigos que não enviam `Last-Event-ID`** → `lastEventId` é `undefined` → `subscribeEvents` inicia ao vivo, exatamente como hoje.
- **Adicionar linhas `id:` é SSE compatível com versões anteriores** — um cliente que ignora o campo não é afetado; um baseado em EventSource começa a rastreá-lo gratuitamente.
- **O `AcpHttpTransport` vendored do SDK opta pelo replay neste PR** — ele define `supportsReplay = true` e reenvia `Last-Event-ID` na reconexão, então os frames da lacuna são reenviados do ring buffer e a perda de conteúdo da §1.8 é resolvida **sem necessidade de mais alterações no daemon**. (A alteração separada do transporte externo `agent-web` continua postergada — veja Fora do escopo.) A alteração no daemon permanece inerte para qualquer consumidor que ainda reporte `supportsReplay = false` e omita o header.
- A superfície REST não foi alterada.

## Plano de testes

- `sse-stream.test.ts` — `send(msg, 7)` emite `id: 7\n` antes de `data:`; `send(msg)` (sem id) omite a linha `id:`; ordenação `id:` → `data:` → linha em branco.
- `transport.test.ts` (ponta a ponta sobre o transporte `/acp`):
  - frames `session/update` ao vivo agora chegam com uma linha `id:`;
  - um `GET /acp` portando `Last-Event-ID: N` flui o cursor para `subscribeEvents`; um stream novo sem header comporta-se como hoje;
  - um `Last-Event-ID` com overflow (> `MAX_SAFE_INTEGER`) → apenas ao vivo;
  - **ordem real de fechamento e depois reconexão**: feche o SSE antigo _primeiro_, depois reconecte com `Last-Event-ID` — asserção de **200 e não 403** (propriedade mantida) e o prompt **não** é abortado (grace/reclaim);
  - um `permission_request` reenviado reutiliza a entrada pending (mesmo id de saída).
- `connection-registry.test.ts` — um attach sem retomada faz flush de todo o buffer encadeando o `id` de cada frame; um attach de **retomada** (cursor presente) pula os frames que portam id (o replay do ring buffer é dono deles), mas ainda faz flush de respostas JSON-RPC sem id; `detachSessionStream` mantém a propriedade/prompt através da janela de grace e então faz o teardown na expiração; uma reconexão dentro da janela faz o reclaim (cancela o teardown pendente).
- `ws-stream.test.ts` — `send(msg, id)` ignora o id: o frame de wire do WS é o JSON puro, nenhum framing SSE `id:` vaza.

## Fora do escopo (ainda postergado)

- Transportes WebSocket / HTTP/2.
- Resolução de permissão entre conexões da §1.7 (um voto postado em um `Acp-Connection-Id` diferente daquele que transmitiu o prompt) — uma preocupação separada e sensível à segurança, rastreada como um follow-up próprio. Este PR torna a tradução de `permission_request` idempotente sob replay (acima), mas não adiciona a resolução de requestId global da sessão. Ele também não adiciona **idempotência de replay de resposta para uma permissão JÁ RESOLVIDA**: uma vez que o cliente votou, a entrada pending é consumida, então uma reconexão posterior que faz o replay do `permission_request` (ainda no ring buffer) reenvia o prompt com o mesmo `_meta.requestId`. Um cliente em conformidade deduplica nesse id (o contrato do qual o caminho de replay já depende) e a entrada pending órfã residual é coletada no teardown — o agente nunca trava — mas registrar resultados resolvidos em um LRU limitado por sessão para reenviar o voto registrado (idempotência total para clientes que não deduplicam) pertence a este mesmo follow-up de coordenação de permissões, já que adiciona estado de permissão resolvida ao caminho de voto.
- A _resposta de prompt_ em trânsito perdida no stream da sessão — todos os frames de conteúdo recuperados fluem através do ring buffer do `eventBus`; uma resposta JSON-RPC não é um evento do ring buffer.
- Alteração do `supportsReplay` no lado do consumidor no `AcpHttpTransport` externo do `agent-web` (vive em um repositório diferente; desbloqueado por este PR).
- **Votação de permissão através dos transportes exportados do SDK.** O `AcpHttpTransport`/`AcpWsTransport` exportado expõe `session/request_permission` como um evento `permission_request`, mas as APIs de voto do SDK (`respondToPermission` / `respondToSessionPermission`) mapeiam para uma requisição `session/permission` para a qual o daemon ACP não tem handler — ele só aceita um voto de permissão como a _resposta_ JSON-RPC ecoando o id de saída `_qwen_perm_N`. Conectar o round-trip do voto faz parte do follow-up de coordenação de permissões da §1.7. Uma faceta relacionada: o **reply pump** de sessão sem assinante (`ensureSessionReplyPump`) abre um stream de sessão `GET /acp` real, que o daemon trata como um stream ao vivo — então um `permission_request` do agente gerado enquanto apenas o reply pump está anexado é ROTEADO para esse stream e descartado pelo pump (ele encaminha apenas respostas JSON-RPC), travando o mediador, enquanto que sem nenhum stream o daemon cancela e nega (cancel-denies) e o agente prossegue. Tanto a distinção no lado do daemon "isso é um consumidor real ou apenas um reply pump?" quanto o tratamento no lado do SDK (negar localmente / expor a um callback de permissão) pertencem ao mesmo follow-up de coordenação de permissões, já que o pump não pode votar por si só. Consumidores que precisam de tratamento de permissões devem abrir `subscribeEvents` antes de emitir RPCs de sessão (o contrato documentado), o que dá ao daemon um stream de consumidor real.
- **RPCs de sessão emitidos de dentro do loop `subscribeEvents` no `AcpHttpTransport` exportado.** O stream `/acp` da sessão é de leitor único: enquanto o gerador assíncrono de um consumidor está estacionado entre `yield`s, o leitor não está drenando. Se o consumidor der `await` em um RPC roteado para a sessão (`session/set_model`, `session/prompt`, …) de dentro de seu próprio loop de tratamento de eventos, `sendRequest` suprime o reply pump de fundo (uma assinatura está "ativa"), mas o gerador estacionado nunca lê a resposta — a chamada trava até que o consumidor puxe o próximo evento. A correção robusta é tornar o leitor da sessão um pump de fundo que sempre drena respostas JSON-RPC e enfileira apenas `DaemonEvent`s para o iterador; postergado como um follow-up focado, pois é uma mudança estrutural em um transporte opt-in recém-exportado e não afeta o transporte REST padrão.
- **Guarda automatizada para a divergência entre `SESSION_STREAM_REPLY_METHODS` ⇄ `replySession`.** O conjunto `SESSION_STREAM_REPLY_METHODS` do SDK deve espelhar os locais de chamada `replySession(...)` do daemon em `dispatch.ts` (um pacote diferente); um método adicionado lá sem adicioná-lo aqui não abre reply pump e um `sendRequest` sem assinante para ele trava até o abort. O sistema de tipos de nenhum dos pacotes impõe isso. Uma guarda de CI (um script leve ou vitest que extrai os nomes dos métodos de resposta de sessão do daemon e faz um diff com o conjunto do SDK) é a correção certa, mas a ferramenta de análise estática entre pacotes é uma tarefa focada própria — e não um grep trivial: um extrator correto precisa de uma análise de fluxo de dados leve, porque a resposta de `session/prompt` NÃO é emitida dentro de seu bloco `case 'session/prompt'`. O prompt é iniciado de forma assíncrona e seu `replySession(...)` é disparado posteriormente pelo handler de conclusão do prompt (um local de chamada diferente), então uma varredura ingênua de "quais blocos `case` contêm `replySession`" EXCLUIRIA erroneamente `session/prompt` e falharia no build contra um conjunto correto. O conjunto é pequeno e estável por enquanto, e o JSDoc na constante documenta o invariante; a correção robusta de longo prazo é fazer com que o daemon anuncie seus nomes de métodos roteados para sessão (uma fonte única de verdade) em vez de fazer scrape de `dispatch.ts`.