# RFC: "qwen tag" — um agente persistente, multiplayer e residente de canal para o qwen-code (priorizando o DingTalk)

**Status:** Rascunho (v2)
**Data:** 2026-06-25
**Autor:** (qwen-code)

---

## Changelog (v1 → v2)

Esta revisão encerra todas as Open Decisions da v1 (agora **Resolved Decisions**, §9) e corrige sete defeitos de correção/consistência levantados na revisão. As duas mudanças estruturais:

- **OD-1 não é mais um gate — é uma arquitetura confirmada.** A Fase 0 é entregue no caminho atual do `AcpBridge`; a **Fase 1+ migra a hospedagem do canal para o daemon `qwen serve`** (via `DaemonChannelBridge` / um runner de canal do daemon) para reutilizar o `promptQueue` FIFO por sessão, `MultiClientPermissionMediator`, `eventBus`, `/workspace/memory` e rate-limit. Cada seção que antes dizia "OD-1 aberta / bloqueia tudo" agora é lida como decidida, e o compromisso com o daemon é propagado através de §1, §4, §5, §6.1, §6.2, §6.3, §6.4 e §7.
- **O caminho de disparo proativo (proactive fire-path) foi redesenhado para o caminho do daemon no qual ele realmente será executado.** O `dispatchProactive` da v1 foi escrito para a semântica do `AcpBridge` (`sessionQueues` no lado do canal). Sob a migração do daemon, `DaemonChannelBridge.prompt()` **lança `Prompt already in flight`** em caso de sobreposição (`DaemonChannelBridge.ts:257-261`) em vez de enfileirar. A v2 serializa prompts proativos através de `ChannelBase.sessionQueues` para **ambas** as variantes, para que o throw-guard nunca seja acionado, e declara o invariante never-cancellable explicitamente (§6.2).

Resoluções e correções incorporadas:

- **OD-2** decidida: um processo por workspace/canal.
- **OD-3** decidida: `first-responder` na Fase 1 + `clientId` único no nível do canal; `consensus`/`designated` na Fase 2 após a existência de um roster `senderId→clientId` + ciclo de vida; auto-deny de ferramentas de alto risco em turnos proativos.
- **OD-4** decidida: em um grupo compartilhado (thread), `/clear` requer um `confirm` explícito e é restrito a `config.allowedUsers` quando essa lista está definida; `/status` é read-only. (Um `/clear-channel` com hífen não é analisável pela gramática de slash; um owner-gate real por membro aguarda o modelo de identidade — OD-3/OD-11.)
- **OD-5** decidida: corrigir o JSDoc obsoleto em `types.ts:42` para `'steer'`; o perfil do grupo de tags define `dispatchMode: 'followup'` explicitamente.
- **OD-6** decidida: prefixo `[senderName]` por turno, **sem** gate por `instructedSessions`; **um novo campo opcional `alreadyPrefixed` no `Envelope`** para que a reentrada sintética no modo `collect` pule a reprefixação. (Corrige a afirmação da v1 de "nenhum novo campo no envelope" — Fix #2.)
- **OD-7** resolvida usando fatos verificados da API do DingTalk (§6.2/§6.5), itens de baixa confiança ainda sinalizados.
- **OD-8** decidida: o scheduler do gateway/daemon é o **único** proprietário do cron; uma sessão de tag **não** inicia seu cron `Session` in-session; os dois stores de cron vivem em caminhos disjuntos, de modo que a colisão só é possível se ambos os schedulers forem executados para os mesmos jobs.
- **OD-9** decidida: rollup de "org" por processo + janelas por canal, strictest-wins, janela diária fixa; a v1 estima tokens no lado do canal e lê o caminho de uso do daemon uma vez que ele está hospedado no daemon.
- **OD-10** decidida: adicionar um escopo `channel` (+`channelKey`) ao `writeContextFile.ts`; a base do canal obtém escrita/leitura via um **callback de camada CLI injetado através de `ChannelBaseOptions`** (sem dependência `channel-base → core`); localização global do usuário `~/.qwen/channels/memory/`.
- **OD-11** decidida: `senderName` apenas consultivo; `clientId` como o único principal de segurança; ring de auditoria em memória + um arquivo de acompanhamento append-only `~/.qwen`.
- **OD-12** decidida: exigir `--require-auth` + token para qualquer deployment suportado por daemon que não seja loopback.

Correções de consistência além das resoluções de OD:

- **Fix #1 — concorrência do caminho de disparo proativo** redesenhada para o caminho do daemon (§6.2), com o invariante never-cancellable aplicado tanto para a variante `AcpBridge` da Fase 0 quanto para a variante do daemon da Fase 1+.
- **Fix #2 — contradição interna** removida: §6.1/G2 não afirma mais "nenhum novo campo no envelope"; reconhece o único campo `alreadyPrefixed`.
- **Fix #3 — fiação da memória projetada** (§6.3): a mudança exata em `ChannelBaseOptions` (callbacks `readChannelMemory`/`writeChannelMemory`) e quem os constrói/injeta em `start.ts`, com a leitura de bootstrap uma vez por sessão reutilizando o gate `instructedSessions`.
- **Fix #4 — flag de capacidade `canColdSend` projetada** (§6.2): onde é declarada, como DingTalk/Feishu a definem e como o scheduler emite falhas de forma explícita.
- **Fix #5 — esclarecimento de store disjunto da OD-8** (§6.2): o store do gateway e o store `Session` são caminhos diferentes; o único risco de colisão é uma sessão de tag também executar o cron in-session — fechado pelo gate da OD-8.
- **Fix #6 — aplicação de orçamento estimado** (§6.4): uma estimativa pode gerar WARN/alerta, mas nunca deve recusar rigidamente (hard-decline) um prompt do usuário; recusar rigidamente apenas com base em números reais de uso do daemon.
- **Fix #7 — atribuição de auditoria sob `followup`** (§6.4): carregar `senderId` _com_ o prompt enfileirado para que uma chamada de ferramenta/permissão seja atribuída ao turno que está realmente executando, e não ao remetente enfileirado mais recentemente.

Os fatos concretos e verificados da v1 (topologia do AcpBridge, auto-approve do AcpBridge, `sendMessage` abstrato, escopos, padrões do parser) são preservados inalterados.

---

## 1. Resumo

**"qwen tag"** é um agente compartilhado do qwen-code que vive dentro de um canal de chat — primeiro um grupo do DingTalk, depois do Feishu — e que qualquer membro desse canal convoca mencionando-o com `@`. Uma vez convocado, ele executa o loop completo do agente qwen-code (ferramentas, edições de arquivo, shell, MCP) em um workspace vinculado, transmite seu trabalho de volta para o canal à medida que avança, **lembra do canal entre turnos e reinicializações** e pode agir **proativamente ou em um cronograma** sem esperar ser solicitado. Isso espelha o formato do Claude Tag — um único agente multiplayer persistente que é _residente_ da sala em vez de um bot de DM 1:1 — mas é construído inteiramente na stack de adaptadores de canal existente do qwen-code (`qwen channel start`, `packages/channels/*`) e no daemon `qwen serve`, não em um novo serviço hospedado.

O enquadramento deliberado deste RFC é que **a metade reativa do formato já está em grande parte entregue, e a metade proativa/de memória não está.** As peças que tornam um agente de _resposta_ no estilo Claude Tag difícil — um processo de longa duração que multiplexa sessões, um transporte de agente que preserva o invariante de um prompt por sessão, roteamento de sessão multiplayer, controle de acesso por canal, renderização de cards em streaming e persistência de sessão durável — já existem e são exercitadas pelos adaptadores de canal atuais. O que está _faltando_ é um conjunto bem delimitado de capacidades que transformam um bot de resposta reativo em um agente residente: atribuição de remetente em sessões compartilhadas, um caminho de saída proativo/agendado, memória por sala e governança multiplayer. Este RFC escopo essa lacuna em **quatro áreas de construção** e as especifica nas Fases 0–2.

> Nota sobre "80%": rascunhos anteriores enquadraram isso como "~80% entregue." Essa cifra é inverificável e exagera o caso — todo o motor proativo (Área de Construção 2) e a memória por sala (Área de Construção 3) são totalmente novos, e especificamente no DingTalk não existe _nenhum_ caminho de iniciação de saída. Em vez disso, enquadraremos como "o caminho reativo está construído; os caminhos proativo e de memória não estão."

### Um fato de topologia que restringe todo o RFC

Existem **duas maneiras distintas de conectar um adaptador de canal a um agente qwen**, em **dois processos diferentes**, e confundi-los é o erro mais comum nos rascunhos anteriores:

- **`qwen channel start <name>` (o caminho de entrega).** `start.ts` constrói **`new AcpBridge(bridgeOpts)`** (`start.ts:213,268,356,435`), e `AcpBridge.start()` **gera um processo filho** `node <cliEntryPath> --acp` (`AcpBridge.ts:53-70`), falando ACP sobre NDJSON em **stdio**. Este filho é um _agente independente_, não o daemon HTTP `qwen serve`. Nesta topologia, **não há daemon HTTP, nenhuma rota `/workspace/memory`, nenhum `MultiClientPermissionMediator`, nenhum ring de replay `eventBus` e nenhum `promptQueue` do daemon** — todos eles vivem em `packages/acp-bridge` + `packages/cli/src/serve`, que o `qwen channel start` nunca instancia. A serialização de prompts aqui é feita inteiramente **no lado do canal** pelo `ChannelBase` (mutex `activePrompts` em `ChannelBase.ts:356-391` + cadeia `sessionQueues` em `:394-470`) e pelo próprio invariante de um prompt por sessão do ACP do filho. `AcpBridge.requestPermission` **auto-aprova cada chamada de ferramenta** (`AcpBridge.ts:108-118`).
- **`qwen serve` + `DaemonChannelBridge` (hospedado no daemon).** `DaemonChannelBridge` (`packages/channels/base/src/DaemonChannelBridge.ts`) é uma bridge in-process cujo `sessionFactory` produz objetos `Session` do daemon. Este caminho executa canais dentro do daemon e, portanto, herda o `promptQueue` FIFO do `acp-bridge` (`bridge.ts:232,2855,3082`), `MultiClientPermissionMediator`, `eventBus` e as rotas HTTP. **O `qwen channel start` não o instancia hoje** (zero referências em `start.ts`). Uma aresta afiada que molda o design proativo: `DaemonChannelBridge.prompt()` **não enfileira — ele lança `Prompt already in flight`** em caso de sobreposição (`DaemonChannelBridge.ts:257-261`); o `promptQueue` FIFO que ele eventualmente alcança está no lado do daemon/acp-bridge, _atrás_ desse throw-guard in-process. O motor proativo deve, portanto, serializar na camada do canal (§6.2).

**Arquitetura confirmada (era OD-1, agora decidida):** a maquinaria do daemon multi-cliente é reutilizada **migrando a hospedagem do canal para o daemon `qwen serve`** da Fase 1 em diante.

- A **Fase 0** é entregue no caminho atual do `AcpBridge` (a injeção de identidade não precisa de rotas HTTP nem do mediador).
- A **Fase 1+** executa canais sob o daemon `qwen serve` (via `DaemonChannelBridge` ou um runner de canal do daemon), porque o motor proativo, a persistência de memória por sala e a governança desejam a durabilidade, rotas, `promptQueue`, mediador e barramento de eventos do daemon.

Isso não é mais "aberto" ou "bloqueante": a fiação da Fase 0 adiciona o caminho de anexo do `DaemonChannelBridge` (ou uma flag `--daemon <url>`) para que a migração esteja disponível no momento em que a Fase 1 começar. O scheduler de propriedade do gateway (§6.2) é construído para ser **neutro em relação à migração**, de modo que seja executado de forma idêntica antes e depois do cutover.

### O que é o "qwen tag", concretamente

Um deployment "qwen tag" é um único processo de agente vinculado a um workspace, mais um adaptador `qwen channel start dingtalk`, configurado para que um grupo inteiro compartilhe **uma** sessão de agente. Dois **conceitos de escopo distintos** devem estar alinhados:

1. **Escopo de roteamento de canal** (`ChannelConfig.sessionScope`, consumido por `SessionRouter.routingKey()`): decide como as mensagens de entrada mapeiam para uma chave de roteamento. Para uma tag, isso deve ser `'thread'` para que o grupo inteiro compartilhe uma chave de roteamento (`channel:(threadId||chatId)`, `SessionRouter.ts:53`). **O padrão do parser é `'user'`, não `'thread'`** (`config-utils.ts:91-92`), então a receita da tag deve defini-lo explicitamente.
2. **Escopo de sessão Bridge/ACP** (`sessionScope` do `DaemonChannelBridge` / `acp-bridge`): decide como o daemon compartilha uma sessão ACP subjacente. `DaemonChannelBridge.newSession()` define isso como `'thread'` por padrão (`DaemonChannelBridge.ts:229,240`); o caminho in-process do `acp-bridge` define como `'single'` por padrão (`bridge.ts:709`). Esta é uma **alavanca separada** do escopo de roteamento de canal e _não_ está no caminho do `qwen channel start` (`AcpBridge.newSession(cwd)` aceita apenas `cwd`, `AcpBridge.ts:131`).

Com isso em vigor:

- **Um agente por sala, convocado por menção.** `GroupGate` aplica `requireMention` (padrão `true`, `GroupGate.ts:49`), então o agente permanece em silêncio até ser mencionado com `@` ou ser uma resposta ao bot (`GroupGate.ts:51`). A chave multiplayer é `sessionScope: 'thread'`, mapeando para `channel:(threadId||chatId)` (`SessionRouter.ts:50-53`), para que cada membro reutilize o mesmo `sessionId` independentemente do remetente.
- **Trabalho real em múltiplos estágios com ferramentas.** Mensagens de entrada se tornam prompts via `ChannelBase.handleInbound()`, que constrói `promptText` a partir do texto da mensagem, contexto de citação de resposta, caminhos de arquivos de anexo e (uma vez por sessão) `config.instructions` (`ChannelBase.ts:316-347`), então despacha via `bridge.prompt(sessionId, promptText, { imageBase64, imageMimeType })` (`ChannelBase.ts:425` — `promptText` é um arg posicional; o objeto de opções carrega apenas os campos de imagem).
- **Transmite seu trabalho de volta para a sala.** Adaptadores renderizam a saída incremental como cards nativos da plataforma (Feishu create/update/finalize, `markdown.ts`; fragmentação de markdown do DingTalk, `DingtalkAdapter.ts:144-169`).
- **Lembra do canal.** `SessionRouter.persist()` / `restoreSessions()` armazenam duravelmente `sessionId`, alvo e `cwd` e reidratam via `bridge.loadSession()` entre reinicializações (`SessionRouter.ts:168-244`); a memória do workspace (`QWEN.md` / `~/.qwen/QWEN.md`) é lida/escrita através de `GET` / `POST /workspace/memory` (`workspace-memory.ts`). Esta memória tem escopo de workspace/global, não por sala — veja a Área de Construção 3.
- **Pode agir proativamente / em um cronograma.** Esta é a metade que _ainda_ não existe de ponta a ponta e é o coração da Fase 1.

---

## 2. Motivação

A infraestrutura que um agente de _resposta_ multiplayer residente normalmente requer já está consolidada neste repositório. O trabalho genuinamente ausente são quatro áreas de construção.

| Capacidade que o formato Tag precisa                 | Já presente (citação)                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Processo de longa duração e multi-sessão                  | `AcpBridge` gera um filho `--acp` de longa duração (`AcpBridge.ts:53-70`); o caminho do daemon adiciona `promptQueue` FIFO por sessão (`bridge.ts:232,2855,3082`)                                                           |
| Roteamento multiplayer "uma sala, uma sessão"          | Escopo `'thread'` do `SessionRouter` (`SessionRouter.ts:53`), override por canal `setChannelScope()` (`SessionRouter.ts:40`)                                                                                  |
| Semântica de convocação por menção                          | `requireMention` padrão `true` do `GroupGate` (`GroupGate.ts:49-52`)                                                                                                                                          |
| Controle de acesso + onboarding                          | Allowlist do `SenderGate` + fluxo de pairing-code; gates aplicados grupo-então-remetente (`ChannelBase.ts:240-252`)                                                                                                      |
| Mapeamento de sessão durável entre reinicializações              | Persistência do `SessionRouter` (`SessionRouter.ts:168-244`)                                                                                                                                                    |
| Leitura/escrita de memória do workspace                          | `GET` / `POST /workspace/memory` (`workspace-memory.ts`); apenas escopos workspace + global; apenas no daemon                                                                                                       |
| Controle de permissão multi-ator + auditoria (apenas no daemon) | Quatro políticas do `MultiClientPermissionMediator` incl. quórum `consensus` (`permissionMediator.ts:621-637`); ring de auditoria de permissão separado (`permission-audit.ts`)                                            |
| Autenticação, rate limiting, segurança de loopback (apenas no daemon)   | Bearer token global (`auth.ts:259-266`) + rate limit em camadas por clientId/IP (`rate-limit.ts`)                                                                                                               |
| Primitiva de push in-session (tarefas em background)         | Fila de notificação do `Session` + `setNotificationCallback()` alimenta saída de tarefas em background/monitor/shell na sessão aberta (`Session.ts:688-689,2638-2668`); `isIdle()` considera isso (`Session.ts:777`) |
| Entrega na plataforma (DingTalk + Feishu)                | Adaptadores funcionais com cards em streaming, mídia, reações (`DingtalkAdapter.ts`, `FeishuAdapter.ts`)                                                                                                          |

Como a Fase 1+ é executada sob o daemon (arquitetura confirmada, §1), as linhas apenas-no-daemon acima se tornam capacidades disponíveis para o motor proativo, persistência de memória e governança — não meramente "alvos se migrarmos".

As quatro áreas de construção, desenvolvidas em detalhes no §6:

1. **Config + identidade para _declarar_ uma tag (Fase 0).** Uma receita de configuração documentada — `sessionScope: 'thread'`, `groupPolicy`, `requireMention`, `instructions`, `dispatchMode` — mais a **lacuna de atribuição de remetente**: `handleInbound()` deliberadamente **não** injeta `senderName` em `promptText` (`ChannelBase.ts:316-347`; `senderName` é usado apenas para controle de acesso em `ChannelBase.ts:246`). Em uma sessão `'thread'` compartilhada, o agente não consegue dizer _quem_ está falando. A Fase 0 injeta um marcador de remetente, da mesma forma que o contexto de citação de resposta já é (`ChannelBase.ts:318`).
2. **Um motor proativo / de iniciação de saída (Fase 1).** Hoje **não há caminho proativo algum na fronteira do canal**: `ChannelBase.sendMessage()` é abstrato (`ChannelBase.ts:81`) e só é invocado de dentro de uma resposta. No DingTalk, `sendMessage()` só pode responder através de um `sessionWebhook` de curta duração armazenado em cache por `conversationId` na entrada (`DingtalkAdapter.ts:134-142`), então um **grupo frio não pode receber mensagens** (`DingtalkAdapter.ts:137-141` retorna silenciosamente). A Fase 1 adiciona um scheduler residente no daemon e um caminho de envio proativo do DingTalk.
3. **Memória residente no canal + recuperação (Fase 2, metade da memória).** A memória do workspace é **global do workspace, não por sala**: `POST /workspace/memory` aceita apenas `scope: 'workspace' | 'global'` (`workspace-memory.ts:118-125`) e é uma **rota de mutação de autenticação estrita** (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`). Uma tag que "lembra _deste_ canal" precisa de um namespace de memória por sala.
4. **Governança + segurança multiplayer (Fase 2, metade da governança).** Política de permissão apropriada para grupos, guardrails de ação proativa e auditoria forense, construindo sobre a maquinaria existente no nível de `clientId` (não no nível de identidade humana).

---

## 3. Objetivos e Não-Objetivos

### Objetivos

- **G1 — Documentar e entregar a configuração "tag"** no DingTalk: uma receita `channels.dingtalk` copiável e colável (`sessionScope: 'thread'` explícito, `groupPolicy: 'allowlist'` com o ID do grupo listado, `requireMention: true`, `instructions` e um `dispatchMode` escolhido deliberadamente) produzindo um agente multiplayer residente funcional, reutilizando `parseChannelConfig()` e os gates existentes. A receita deve destacar a distinção entre escopo de roteamento e escopo ACP e que o padrão do parser `'user'` deve ser sobrescrito.
- **G2 — Atribuição de remetente em sessões compartilhadas.** Injetar um marcador de remetente por mensagem em `promptText` para que o agente possa distinguir os falantes em um grupo com escopo `'thread'`, sem quebrar a injeção de `instructions` uma vez por sessão rastreada por `instructedSessions` (`ChannelBase.ts:344-346`). O marcador é **por mensagem** (o falante muda a cada turno) e NÃO deve ter gate por `instructedSessions`. Isso requer **um novo campo opcional `alreadyPrefixed` no `Envelope`** (`types.ts`), para que a reentrada sintética no modo `collect` não prefixe duas vezes — veja §6.1. (A v1 descreveu isso incorretamente como "apenas formato, sem novo campo".)
- **G3 — Um motor proativo.** Um mecanismo para (a) iniciar saída para um canal que não acabou de enviar mensagens, e (b) disparar em um cronograma independente de qualquer sessão interativa aberta, entregando através do caminho de notificação por sessão existente quando possível — incluindo a API de envio proativo do DingTalk e um store persistido de `openConversationId`, com um proprietário de refresh de token definido. Deve respeitar o invariante de um prompt por sessão do ACP (NG6) serializando através de `ChannelBase.sessionQueues` (nunca cancelar um turno humano com `steer`), sob ambas as topologias.
- **G4 — Memória residente no canal.** Um namespace de memória por sala e caminho de recuperação em camadas sobre a maquinaria existente de `/workspace/memory` e mecanismo de `instructions`. O design adiciona um novo escopo `channel` (+`channelKey`) ao `writeContextFile.ts` e o alcança a partir de `channel-base` via um **callback de camada CLI injetado através de `ChannelBaseOptions`** (sem dependência `channel-base → core`).
- **G5 — Governança multiplayer.** Política de permissão apropriada para grupos, guardrails de ação proativa e auditoria, construindo sobre o `MultiClientPermissionMediator` e o ring de auditoria de permissão. Deve levar em conta o fato de que os votos são atribuídos ao `clientId`, não à identidade humana, e que em uma única sessão `'thread'` compartilhada, cada membro do grupo é o _mesmo_ cliente do daemon.
- **G6 — Paridade com o Feishu** para tudo em G1–G5, tratado como um acompanhamento. O `tenant_access_token` estável do Feishu já suporta envios proativos para qualquer chat apenas com um `chatId` (`FeishuAdapter.ts:622-651`), então o Feishu não precisa de _nenhuma_ nova API de envio para G3 — apenas o mecanismo de wake/schedule no nível do daemon. O Feishu declara `canColdSend = true`.
- **G7 — Reutilização em vez de reinvenção.** Cada área de construção estende um mecanismo existente (gates, roteador, bridge, mediador, rotas de memória, caminho de notificação in-session, cron) em vez de introduzir um subsistema paralelo.
### Não Objetivos

- **NG1 — Não é um SaaS hospedado e multi-tenant.** Um "qwen tag" é um processo de agente vinculado a **um** workspace (`serve.ts:165-171`; multi-workspace = um daemon por workspace em portas separadas). Sem plano de controle central.
- **NG2 — Sem identidade por pessoa, faturamento ou orçamentos de custos neste RFC.** O modelo de identidade do daemon é um **único bearer token global** (`auth.ts:259-266`) e atribuição no nível de `clientId` em todo o event bus e permission audit. Adicionamos _marcações de remetente nos prompts_ (G2), mas **não** introduzimos principais autenticados por usuário, cotas por usuário ou rastreamento de custos. As marcações de remetente são texto de prompt consultivo, não uma fronteira de autenticação — cada membro do grupo compartilha as credenciais de workspace únicas do daemon e, em uma sessão `'thread'` compartilhada, é o _mesmo_ `clientId` do daemon.
- **NG3 — O gateway multi-identidade da Fase 3 está fora do escopo** aqui, mencionado apenas como uma referência futura. Este RFC cobre as Fases 0–2.
- **NG4 — O Feishu é secundário, não co-primário.** O DingTalk é a implementação de referência e a fonte de todos os exemplos práticos.
- **NG5 — Slack e outras plataformas ocidentais estão fora do escopo.** Os tipos de canal registrados são `telegram`, `weixin`, `dingtalk`, `feishu` e `qq` (`channel-registry.ts:10-14`); não existe adaptador para Slack.
- **NG6 — Não altera o invariante de um prompt por sessão do ACP.** Um prompt agendado/proativo é apenas outra entrada nas `sessionQueues` do canal; ele não pode rodar concorrentemente com um turno de usuário na mesma sessão, nem pode cancelar um.
- **NG7 — Sem novo mecanismo de armazenamento de memória com escopo de chat.** A memória residente no canal (G4) adiciona _namespacing_ sobre os arquivos `QWEN.md`/`AGENTS.md` existentes com suporte a arquivo; sem vector DB ou banco de dados por sala.

---

## 4. Avaliação do Estado Atual

Construído (B), parcial (P), ausente (M). "Arquivo" cita o símbolo de referência. "Topologia" indica se o recurso existe no caminho do canal `AcpBridge` (A), no caminho do daemon `qwen serve` (D) ou em ambos — e, como a Fase 1+ está comprometida a rodar sob o daemon, uma nota "→D" onde a migração é o que libera o recurso.

| Recurso                                | qwen-code hoje (arquivo / símbolo)                                                               | Topologia                             | Lacuna                                                                                                                                                                          | Tamanho           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Roteamento um-sala-uma-sessão          | `SessionRouter.routingKey()` `'thread'` (`SessionRouter.ts:44-60`)                               | A+D                                   | Escopo padrão é `'user'` (`config-utils.ts:91-92`); o operador deve definir `'thread'`                                                                                          | Config (S)        |
| Invocação por menção                   | `GroupGate.requireMention` padrão `true` (`GroupGate.ts:49-52`)                                  | A+D                                   | Nenhuma — já está correto                                                                                                                                                       | —                 |
| Controle de acesso / onboarding        | `SenderGate` allowlist + pairing (`ChannelBase.ts:240-252`)                                      | A+D                                   | Nenhuma                                                                                                                                                                         | —                 |
| Mapeamento de sessão durável           | `SessionRouter.persist`/`restoreSessions` (`SessionRouter.ts:168-244`)                           | A+D                                   | Nenhuma                                                                                                                                                                         | —                 |
| **Atribuição de remetente no prompt**  | `handleInbound()` constrói promptText sem `senderName` (`ChannelBase.ts:316-347`)                | A+D                                   | `senderName` nunca é injetado; o agente não consegue identificar quem falou; precisa de um novo `Envelope.alreadyPrefixed`                                                      | Código (S)        |
| Serialização de prompt                 | `ChannelBase.sessionQueues`/`activePrompts` (`:356-470`); daemon `promptQueue` (`bridge.ts:2855`)| A (canal) / D (daemon)                | `DaemonChannelBridge.prompt()` lança exceção (THROWS) em sobreposição (`:257-261`) — o motor proativo deve serializar no lado do canal; `dispatchMode` padrão `'steer'` cancela pares (`:354,371-379`) | Config + Código (S) |
| **Iniciação de saída / envio proativo**| `ChannelBase.sendMessage()` abstrato (`:81`); DingTalk apenas webhook (`DingtalkAdapter.ts:134-142`)| A+D                                   | Sem ponto de extensão proativo; grupo frio do DingTalk não pode receber mensagens; precisa da flag de capacidade `canColdSend`                                                  | Código (L)        |
| **Agendador no nível do daemon**       | Cron tem escopo de sessão (`Session.ts:667-668`), morre no `dispose()` (`:790-812`)              | A+D (gateway) → D (reuso de auditoria/fila) | Sem endpoint de agendador no daemon em `serve/` ou `channels/`; o agendador do gateway é o único proprietário (OD-8)                                                            | Código (L)        |
| Primitiva de push na sessão            | `setNotificationCallback` (`Session.ts:2638-2668`)                                               | A+D                                   | Entrega apenas em uma sessão _ativa_; não consegue acordar uma sessão coletada (reaped)                                                                                         | (reuso)           |
| **Memória por sala**                   | `/workspace/memory` escopos `workspace\|global` (`workspace-memory.ts:118-125`)                  | Apenas D                              | Sem escopo de chat/canal; novo escopo `channel` + callback na camada CLI (sem dependência do core)                                                                              | Código (M)        |
| Votação de permissão multi-ator        | `MultiClientPermissionMediator` 4 políticas (`permissionMediator.ts:621-637`)                    | D (herdado Fase 1+)                   | `AcpBridge` aprova automaticamente (`AcpBridge.ts:108-118`); votos são por `clientId`, um cliente por canal                                                                     | Código (L)        |
| Trilha de auditoria                    | `PermissionAuditRing` FIFO 512 (`permission-audit.ts`)                                           | D + ring no lado do canal             | Sem `senderId` humano; em memória, perdido na reinicialização; `~/.qwen` append-only como acompanhamento                                                                       | Código (M)        |
| **Orçamento de token / custo**         | nenhum (rate-limit é apenas contagem de requisições, `rate-limit.ts`)                            | ledger no lado do canal + uso D       | Sem medidor de gastos; estimativas v1 (consultivas), débito real apenas quando hospedado no daemon                                                                              | Código (M)        |
| Escopo de ferramenta/MCP por canal     | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`); filtro allow MCP (`:3327-3333`) | por `Config`                          | Sem caminho de spawn-arg do canal para o filho `--acp` (AcpBridge); `Config` por daemon uma vez hospedado                                                                       | Código (M)        |
| Envio proativo do DingTalk             | não implementado (apenas `robot/emotion`, `messageFiles/download`)                               | A+D                                   | Novo endpoint + `openConversationId` persistido + atualização de token (contrato verificado, §6.2)                                                                              | Código (L)        |
| Envio proativo do Feishu               | `sendMessage()` sobre `tenant_access_token` (`FeishuAdapter.ts:622-676`)                         | A+D                                   | Nenhuma — `canColdSend = true`                                                                                                                                                  | —                 |

Legenda de tamanho: S = configuração/código pequeno, M = um módulo + mudança de interface, L = mudança em múltiplos pacotes ou novo subsistema.

---

## 5. Arquitetura

O `qwen tag` **não é um novo runtime**. São quatro camadas finas enxertadas na stack de adaptadores existente. A camada base já fornece um agente capaz de multiplayer, execução de ferramentas e equipado com MCP, acessível por um canal de chat. As quatro novas camadas mapeiam 1:1 para as lacunas: (1) **quem está falando** — a identidade do remetente nunca chega ao prompt; (2) **agir sem ser provocado** — sem caminho de iniciação de saída, o cron na sessão morre com a sessão; (3) **lembrar do canal** — a memória é global do workspace; (4) **governar um cérebro compartilhado** — a autenticação é um token global único, sem orçamento por canal.

Cada camada abaixo declara qual topologia ela assume (ver §1). A **divisão comprometida**: Fase 0 no `AcpBridge`; Fase 1+ no daemon `qwen serve` via `DaemonChannelBridge`.

### Camada base (existente) — topologia `qwen channel start` (Fase 0)

```
                              one host, one workspace
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk                                                   │
│                                                                                │
│  ┌────────────────────┐    Envelope     ┌───────────────────────────────────┐ │
│  │ DingtalkAdapter     │ ──────────────▶ │ ChannelBase.handleInbound()       │ │
│  │ (stream client,     │                 │  1 GroupGate.check (mention/      │ │
│  │  webhooks map by     │ ◀────────────── │    policy/allowlist)             │ │
│  │  conversationId)     │   text/markdown │  2 SenderGate.check (pairing)    │ │
│  │  sendMessage()       │                 │  3 slash / "!" commands          │ │
│  └────────────────────┘                 │  4 router.resolve(...)           │ │
│        ▲  sessionWebhook (expires,       │  5 dispatchMode (steer default)  │ │
│        │  per inbound msg only)          └───────────────┬───────────────────┘ │
│        │                                                 │ sessionId            │
│        │                                ┌────────────────▼──────────────────┐ │
│        │                                │ SessionRouter                      │ │
│        │                                │  routingKey(): user|thread|single  │ │
│        │                                │  persist() → JSON (crash recovery)  │ │
│        │                                └────────────────┬──────────────────┘ │
│        │   textChunk / toolCall events  ┌────────────────▼──────────────────┐ │
│        └─────────────────────────────── │ AcpBridge (NOT the HTTP daemon)    │ │
│                                         │  spawns child `node <cli> --acp`   │ │
│                                         │  ClientSideConnection over stdio    │ │
│                                         │  requestPermission AUTO-APPROVES    │ │
│                                         └────────────────┬──────────────────┘ │
└──────────────────────────────────────────────────────────┼─────────────────────┘
                                                             │ ACP / NDJSON (stdio)
                                          ┌──────────────────▼─────────────────────┐
                                          │ child agent process (`--acp`)           │
                                          │  one prompt-in-flight per ACP session   │
                                          │  in-session cron (Session.ts) — DISABLED│
                                          │  for tag sessions (OD-8); MCP, tools.   │
                                          │  NO promptQueue/eventBus/mediator       │
                                          └─────────────────────────────────────────┘
```

### Topologia hospedada no daemon (Fase 1+) — `qwen serve` + `DaemonChannelBridge`

```
                              one host, one workspace, ONE daemon
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk  (channels hosted IN the daemon)                  │
│  ┌────────────────────┐  Envelope   ┌────────────────────────────────────────┐│
│  │ DingtalkAdapter     │ ──────────▶ │ ChannelBase.handleInbound()            ││
│  │ pushProactive()     │ ◀────────── │  gates → governor.admit → router       ││
│  │ canColdSend = false*│             │  → sessionQueues (FIFO, serialization)  ││
│  └────────────────────┘             └───────────────┬────────────────────────┘│
│         ▲ proactive group-send                       │ bridge.prompt()          │
│         │ (openConversationId)        ┌───────────────▼────────────────────────┐│
│  ┌──────┴────────────┐               │ DaemonChannelBridge                      ││
│  │ ChannelCronSched   │──fire────────▶│  prompt() THROWS on overlap (:257-261)  ││
│  │ (gateway-owned,    │ dispatchProa- │  → so all prompts MUST arrive serialized││
│  │  sole cron owner)  │ ctive via     │     via sessionQueues                   ││
│  └────────────────────┘ sessionQueues └───────────────┬────────────────────────┘│
│                                                        │ in-process Session       │
│                                       ┌────────────────▼────────────────────────┐│
│                                       │ daemon: acp-bridge FIFO promptQueue,     ││
│                                       │  MultiClientPermissionMediator, eventBus, ││
│                                       │  /workspace/memory + /channel routes,     ││
│                                       │  rate-limit, bearer auth                  ││
│                                       └──────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
* DingTalk canColdSend flips true once the proactive-send path ships (§6.2).
```

Invariantes chave nos quais nos baseamos (verificados):

- **O escopo de thread é a chave para o multiplayer.** `routingKey()` retorna `${channelName}:${threadId || chatId}` sob `'thread'` (`SessionRouter.ts:53`); `resolve()` reutiliza a chave (`:79-83`). O escopo padrão é `'user'` (`:25`); `qwen channel start` define o escopo por canal via `router.setChannelScope(name, config.sessionScope)` (`start.ts:361-362`) no caminho multi-canal, ou via o construtor `ChannelBase` a partir de `config.sessionScope` (`ChannelBase.ts:62-64`) no caminho de canal único. **O multiplayer exige que o operador defina `sessionScope: "thread"`.**
- **Serialização de prompt.** No `AcpBridge`, `newSession(cwd)` aceita apenas `cwd` (`AcpBridge.ts:131`) e `AcpBridge.prompt()` não tem guarda de concorrência — a serialização é o `dispatchMode` do `ChannelBase`: `collect` armazena em buffer (`:361-370,445-463`), `steer` cancela o prompt em andamento (`:371-379`), `followup` encadeia nas `sessionQueues` (`:381-383,394-470`). O **padrão do runtime é `'steer'`** (`:354`); o JSDoc em `types.ts:42` diz `'collect'` — **desatualizado; a v2 corrige para `'steer'` (OD-5).** No caminho do daemon, `DaemonChannelBridge.prompt()` **lança exceção** em sobreposição (`:257-261`); a FIFO `promptQueue` do daemon (`bridge.ts:2855,3082`) vive _atrás_ dessa guarda de exceção. Consequência (fundamental para §6.2): todos os prompts — humanos e proativos — devem chegar ao `bridge.prompt()` já serializados pelo `ChannelBase.sessionQueues`.
- **`sendMessage` é abstrato.** `ChannelBase.sendMessage()` é `abstract` (`:81`); `DingtalkAdapter.sendMessage()` (`:134-170`) envia via um `sessionWebhook` por `conversationId` armazenado em cache apenas na entrada (`:516-517`) e que expira — um grupo frio não tem webhook em cache e a chamada **retorna silenciosamente** (`:137-141`).
- **Invariantes do daemon herdados na Fase 1+.** `MultiClientPermissionMediator` (`permissionMediator.ts:621-637`), ring de replay do `eventBus` (`eventBus.ts:92`), FIFO `promptQueue` por `SessionEntry` (`bridge.ts:2855-3082`) ficam disponíveis assim que os canais são hospedados sob o `qwen serve` (comprometido, §1).

### As quatro novas camadas

```
            ┌───────────── governance (Layer 4) ─────────────┐
            │  per-channel turn/cost budget gate              │
            │  proactive allowlist, quiet hours, kill switch  │
            └───────────────────────┬─────────────────────────┘
                                     │ wraps all inbound + outbound
 inbound  ┌──────────────────────────▼─────────────────────────┐  outbound
 ───────▶ │  identity injection (Layer 1)                       │ ────────▶
          │  prefix promptText with speaker + channel context   │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  channel memory (Layer 3)                           │
          │  per-channel fragment, injected at session start;    │
          │  persisted via CLI-layer callback (core helper)      │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  proactive engine (Layer 2)                         │
          │  gateway scheduler → sessionQueues → bridge.prompt → │
          │  channel.pushProactive() w/ cold-group fallback      │
          └─────────────────────────────────────────────────────┘
```

**Camada 1 — Injeção de identidade.** _Topologia: ambas; não precisa de daemon._ `handleInbound()` nunca coloca `senderName` no `promptText` (`ChannelBase.ts:246` o lê apenas para `SenderGate.check()`; `Envelope.senderName` existe em `types.ts:69`). Design: um ponto de injeção controlado por configuração em `handleInbound()`, após o prefixo `referencedText` (`:316-319`), condicionado a `envelope.isGroup`, mais uma nova flag `Envelope.alreadyPrefixed` para reentrada do `collect`. Detalhado em §6.1.

**Camada 2 — Motor proativo.** _Topologia: agendador pertencente ao gateway, neutro para migração; roda sob o daemon na Fase 1+._ O cron na sessão morre no `dispose()` (`Session.ts:790-803`); não há endpoint de agendador no daemon. `DingtalkAdapter.sendMessage()` não consegue alcançar um grupo frio (`:137-141`). Design: um agendador residente no gateway que injeta um disparo através do `ChannelBase.sessionQueues` (nunca `steer`) e roteia a conclusão para `channel.pushProactive()`. Detalhado em §6.2.

**Camada 3 — Memória do canal.** _Topologia: caminho de persistência via callback na camada CLI; injeção no lado do canal._ A memória é apenas global do workspace (`workspace-memory.ts:86-303`). Design: um fragmento de memória por canal injetado no início da sessão (reutilizando o gate `instructions` uma vez por sessão) mais um novo escopo `channel` no caminho de escrita, acessado a partir de `channel-base` através de callbacks injetados (sem dependência `channel-base → core`). Detalhado em §6.3.

**Camada 4 — Governança.** _Topologia: wrapper de gate no lado do canal; rate-limiter no lado do daemon na Fase 1+._ O daemon tem um único bearer token global (`auth.ts:259-266`), rate limiting por `clientId`/IP, e sem orçamento por canal. Design: um `ChannelGovernor`/`BudgetLedger` envolvendo `handleInbound()` e o agendador. Detalhado em §6.4.
### Fluxo de dados 1 — `@qwen` recebido em uma thread de grupo

Este fluxo tem a mesma forma em ambas as topologias; a única diferença é onde a serialização e a permissão residem. No `AcpBridge` (Fase 0), a serialização é `ChannelBase.sessionQueues` e a permissão é aprovada automaticamente pelo processo filho; no daemon (Fase 1+), a serialização _ainda_ é `ChannelBase.sessionQueues` (o throw-guard do daemon nunca é acionado porque a camada do canal já serializou) e a permissão flui através do `MultiClientPermissionMediator`.

1. **DingTalk → adaptador.** Um membro posta "@qwen summarize today's incidents". O cliente de stream entrega `DingTalkMessageData` com `conversationId`, `sessionWebhook`, sender, `isInAtList`. O `DingtalkAdapter` armazena em cache `webhooks.set(conversationId, sessionWebhook)` (`:516-517`) e emite um `Envelope` com `isGroup:true`, `isMentioned:true`, `chatId = conversationId`.
2. **Governor (L4).** `ChannelGovernor`/`BudgetLedger.admit()` verifica o orçamento de turno/custo do canal (consultivo até que o uso real esteja disponível, §6.4) e o kill switch. Hard kill / limite explícito com números reais → recusar e responder; estimativa acima do limite → WARN, nunca recusa forçada (Fix #6).
3. **Gates.** `GroupGate.check()` passa (a menção satisfaz o padrão `requireMention:true`); `SenderGate.check()` passa (`:246`).
4. **Roteamento.** `router.resolve(...)` computa `dingtalk:<conversationId>` sob o escopo `'thread'` (**requer `sessionScope:"thread"`**), retorna o `sessionId` compartilhado do grupo. `persist()` o registra.
5. **Memória (L3) + identidade (L1).** No primeiro turno, a memória por canal + `config.instructions` são prefixados uma vez (`instructedSessions`, `:344-347`). A injeção de identidade prefixa `[Alice]` por mensagem.
6. **Captura de atribuição.** O `senderId`/`senderName` resolvido é registrado **no item da fila** carregado em `sessionQueues` (Fix #7), não unido posteriormente por timestamp.
7. **Dispatch.** O perfil da tag define `followup` (nunca `steer`); a mensagem concorrente de Bob entra na fila de `sessionQueues` (`:394-470`).
8. **Bridge.** `bridge.prompt(sessionId, promptText, {imageBase64, imageMimeType})` encaminha via stdio ACP (`AcpBridge.prompt`, `AcpBridge.ts:147`) ou para a sessão do daemon (`DaemonChannelBridge.prompt`) — alcançado apenas quando o turno anterior esvaziou `activePrompts`, então o throw-guard do daemon (`:257-261`) nunca é acionado.
9. **Stream de volta.** `textChunk` → `onChunk` (`:416-422`); `onResponseComplete → DingtalkAdapter.sendMessage()` usa o `sessionWebhook` em cache (grupo ativo).

### Fluxo de dados 2 — push proativo agendado para um grupo frio

1. **Agendamento dispara.** O `ChannelCronScheduler`, residente no gateway, acorda às 09:00 para `daily-standup → dingtalk:<convA>`. Não é o cron in-session (desabilitado para sessões de tag, OD-8/§6.2; e morto de qualquer forma quando uma sessão é coletada — `dispose()` limpa `cronQueue`, `Session.ts:790-803`).
2. **Governor (L4).** Verifica a allowlist proativa e as horas de silêncio (fonte de fuso horário explícita). Fora da janela / não está na allowlist → pular + log. O agendador verifica `adapter.canColdSend` antes de tentar a entrega; se for falso, ele **falha de forma explícita** (logs + registra `lastError`), nunca falha silenciosamente (Fix #4).
3. **Envelope sintético.** `senderId:'__cron__'`, `chatId: convA`, `isGroup:true`, `isMentioned:true`, sem `messageId`. O prompt sintético carrega sua própria atribuição (`createdBy`) no item da fila.
4. **Serializar, nunca preemptar.** `dispatchProactive` entra na cadeia de `ChannelBase.sessionQueues` e aguarda qualquer turno humano em andamento (`activePrompts.get(sessionId)?.done`). Ele **nunca** chama `steer`/`cancelSession`, e **nunca** chama `bridge.prompt()` enquanto `activePrompts` estiver retido — então o throw `Prompt already in flight` do daemon (`:257-261`) não pode ser disparado (§6.2, Fix #1).
5. **Envio para grupo frio.** `pushProactive(convA, text)` encontra `webhooks.get(convA)` como undefined e recorre ao novo caminho proativo: `openConversationId` persistido, token de credenciais de app novo, POST `https://api.dingtalk.com/v1.0/robot/groupMessages/send` com `robotCode = config.clientId`, `msgKey:'sampleMarkdown'`, `msgParam` (uma _string_ JSON). (No Feishu, o passo 5 é o `sendMessage()` existente sobre `tenant_access_token`; `canColdSend = true`.)
6. **Orçamento + auditoria.** O turno proativo consome o bucket de orçamento do canal (débito consultivo até que o uso hospedado no daemon esteja disponível); registrado com `createdBy` como a identidade de origem e `originatorClientId` no nível de transporte (nenhuma identidade humana inventada, `eventBus.ts:60`).

### Por que este formato (reutilização em vez de invenção)

Cada nova camada é anexada em uma junção existente: identidade no local de construção do `promptText`, proativo em `sessionQueues` + `pushProactive()`, memória na maquinaria de `instructions`/`writeContextFile`, governança como um wrapper sobre a cadeia de gates. O único **pré-requisito estrutural** — a reutilização da maquinaria do daemon pelas Camadas 2–4 — é satisfeito pela migração de daemon comprometida (§1): a Fase 0 é lançada no `AcpBridge`; a Fase 1+ é executada sob `qwen serve`.

---

## 6. Design Detalhado

### 6.1 Multiplayer e Identidade (Build Area 1)

Uma "tag do qwen" vive em um chat de grupo. Cada membro fala com o _mesmo_ agente, que deve (a) manter uma conversa compartilhada para todo o canal, (b) saber _quem_ está falando em cada turno, (c) não permitir que a mensagem de um membro destrua a tarefa em execução de outro, e (d) idealmente pedir ao _grupo_ aprovação para chamadas de ferramentas arriscadas. O qwen-code tem primitivos para (a)–(c) hoje; (d) é um trabalho da Fase 1+ hospedado no daemon (migração comprometida, §1).

#### Sessão compartilhada do grupo: `sessionScope: 'thread'`

Sob `'thread'`, o `senderId` sai da chave de roteamento, então cada membro resolve para um único `sessionId` (`SessionRouter.ts:53,72-92`) — o que torna o agente uma entidade compartilhada e residente no canal, em vez de N bots privados.

- **Escopo por canal, não uma mudança global.** O padrão do roteador é `'user'` (`:25`) e o padrão da configuração do canal é `'user'` (`config-utils.ts:91-92`). DMs e canais de usuário único permanecem `'user'`. O perfil da tag define `sessionScope: 'thread'` em `settings.json`, aplicado por canal via `setChannelScope()` (multi-canal, `start.ts:361-362`) ou pelo construtor `ChannelBase` (canal único, `ChannelBase.ts:62-64`).
- **Estabilidade do `threadId`/`chatId` do DingTalk.** O adaptador do DingTalk nunca define `Envelope.threadId` (`DingtalkAdapter.ts:541-551`), então `routingKey()` usa o fallback `threadId || chatId` para `chatId`, colapsando um grupo em uma sessão por `chatId` (desejado). **Ressalva:** `chatId = conversationId || sessionWebhook` (`:534`). Para mensagens de grupo reais, `conversationId` está presente e é estável; se uma mensagem chegar sem ele, `chatId` recorre à URL _expirável_ do `sessionWebhook` e a chave da thread se desestabiliza. O perfil trata um `conversationId` ausente como um erro fatal (descarta a mensagem), e não usa silenciosamente o webhook como chave.

A persistência cobre a recuperação de falhas (`SessionRouter.ts:168-244`): uma reinicialização do daemon reconecta o grupo à mesma sessão compartilhada via `bridge.loadSession()`.

#### Novo risco: `/clear` e `/status` com escopo de thread são globais no canal

O handler compartilhado de `/clear` chama `router.removeSession(this.name, senderId, chatId)` (`ChannelBase.ts:147-152`) e `/status` chama `router.hasSession(...)` (`:203-208`); ambos roteiam através de `routingKey()`, que **ignora o `senderId` sob `'thread'`**. Assim, o `/clear` de qualquer membro apaga a sessão compartilhada de todo o canal e reseta `instructedSessions` — uma armadilha de resetar todos com um único toque.

**Resolvido (OD-4):** em um **grupo compartilhado (thread)**, `/clear` (e seus aliases) exigem um token `confirm` explícito e são restritos a `config.allowedUsers` quando essa lista está definida; caso contrário, eles limpam diretamente (DMs e grupos por usuário afetam apenas a sessão do próprio chamador, então nenhum gate é necessário). O comando mantém o nome `/clear` porque o parser de slash aceita apenas `[a-zA-Z0-9_]` (um `/clear-channel` com hífen seria parseado como `clear` + arg `-channel`); o `confirm` explícito é o indicativo de ação destrutiva. Um owner-gate real por membro (distinguindo admins de membros independentemente da allowlist do chat) depende do modelo de identidade (OD-3/OD-11). **`/status` permanece somente leitura** na sessão compartilhada.

#### A lacuna de atribuição do remetente e a correção

`handleInbound()` constrói `promptText` a partir de `envelope.text`, o prefixo de citação `referencedText`, caminhos de anexos e `config.instructions` uma vez por sessão (`ChannelBase.ts:315-347`); `envelope.senderName` é lido apenas para `SenderGate.check()` (`:246`). Em um grupo `'thread'`, o agente vê um fluxo indiferenciado.

**Correção (OD-6) — prefixar `[senderName]` para turnos de grupo, no topo da construção do prompt (`:315-316`), a cada turno:**

```ts
let promptText = envelope.text;

// Multiplayer attribution: in a thread-shared session, tag each turn with the
// speaker. Skip 1:1 sessions (sender is invariant). Must fire EVERY turn —
// not gated by instructedSessions (the speaker changes each message). The
// alreadyPrefixed flag lets collect-mode synthetic re-entry skip this step.
if (envelope.isGroup && !envelope.alreadyPrefixed) {
  const who = envelope.senderName || envelope.senderId || 'unknown';
  promptText = `[${who}] ${promptText}`;
}

if (envelope.referencedText) {
  promptText = `[Replying to: "${envelope.referencedText}"]\n\n${promptText}`;
}
```

- **Gate em `envelope.isGroup`** (`types.ts:75`), não no escopo.
- **Prefixar antes de `referencedText`** para que a ordem seja lida como `[Alice] [Replying to: "..."] <text>`.
- **Usar `senderName`, não `senderId`.** No DingTalk, `senderName = data.senderNick || 'Unknown'` (`DingtalkAdapter.ts:544`), nunca vazio; a cadeia `senderId → 'unknown'` é defensiva.
- **Risco de prefixo duplo no modo `collect`, resolvido por um novo campo.** A reentrada coalescida constrói um `syntheticEnvelope` cujo `text` é a string coalescida já prefixada e reentra em `handleInbound()` (`:449-462`), o que prefixaria o prefixo **novamente**. **A v2 adiciona um novo campo opcional ao `Envelope`, `alreadyPrefixed?: boolean` (`types.ts`)**; o envelope sintético do `collect` o define como `true`, e a etapa de prefixo acima é ignorada quando ele está definido. (Isso corrige a afirmação da v1 de que a mudança é "apenas de formato, sem novo campo de envelope" — Fix #2. É o único novo campo de envelope que esta RFC introduz; o protocolo bridge/ACP não foi alterado.)

#### `dispatchMode` padrão do grupo: `steer` → `followup`

`steer` (padrão de runtime, `:354`) cancela o prompt em andamento via `bridge.cancelSession()` (`:371-379`). Em um grupo compartilhado, se Bob enviar qualquer coisa enquanto o agente trabalha na solicitação de Alice, `steer` _cancela a tarefa de Alice_ — uma negação de serviço acidental. **O perfil da tag define `dispatchMode: 'followup'`** para que a mensagem de Bob entre na fila atrás da tarefa de Alice (`sessionQueues` FIFO, `:381-383,394-470`). Defina isso no perfil do grupo (`groups["*"].dispatchMode = "followup"`), e não alterando o padrão global — DMs mantêm a UX de autointerrupção do `steer`. **Nenhuma alteração de código é necessária** além de um padrão de perfil documentado; a v2 **corrige o JSDoc desatualizado de `types.ts:42` para `'steer'`** para que o código e o comentário concordem (OD-5). `collect` é aceitável para grupos de tráfego muito alto (limita a profundidade da fila) ao custo de borrar a atribuição.

Como o perfil da tag é **sempre `followup` (nunca `steer`)** para grupos, o mecanismo proativo herda um invariante limpo: não há corrida entre steer e proativo, porque nenhum caminho em um grupo de tag cancela um prompt em andamento. Este invariante é reafirmado e aplicado na §6.2.

#### Handoff — "continuar de onde a última pessoa parou"

Com `'thread'` + prefixos `[senderName]` + `followup`, o handoff _é_ o comportamento padrão: a sessão mantém o histórico completo de múltiplos falantes. Dois complementos ergonômicos: um comando **`/who`** somente leitura (via `protected registerCommand(name, handler)`, `:141-143` — não o mapa privado `commands`) que relata o `sessionId`/`cwd`/resumo da tarefa ativo; e reconexão idempotente na reinicialização (já coberto por `restoreSessions()`).

#### Aprovações de múltiplos membros — fases (OD-3, decidido)

A intenção está correta: chamadas de ferramentas arriscadas devem ser aprováveis pelo grupo, e o qwen-code inclui o `MultiClientPermissionMediator` com quatro políticas (`permissionMediator.ts:348,621-637`). **Mas nada disso é acessível a partir do canal no caminho `AcpBridge` da Fase 0:**

1. **`qwen channel start` conecta o `AcpBridge`, cujo `requestPermission` aprova automaticamente** cada solicitação (`AcpBridge.ts:108-118`). Nenhum prompt de aprovação.
2. O mediador vive na camada de serve HTTP do daemon. A única bridge de canal capaz de lidar com permissões é a `DaemonChannelBridge` (`respondToPermission`, `:346-374`) — alcançada quando a Fase 1 migra a hospedagem do canal para o daemon (comprometido, §1).
3. `config.approvalMode` é um **campo morto** — parseado (`config-utils.ts:94`) e tipado (`types.ts:36`), mas não lido por nenhum adaptador ou bridge.

**Fases decididas:**

- **Fase 0:** sem aprovações de grupo. Controle o risco com allowlist de remetente + `requireMention` + um conjunto de ferramentas de agente conservador. Não afirme que `approvalMode` faz alguma coisa.
- **Fase 1:** o canal é executado no caminho daemon-bridge (migração comprometida); exibe `permission_request` como um card do DingTalk; lança **`first-responder` com um único `clientId` no nível do canal** (o toque de qualquer membro permitido resolve; atribuição na granularidade do canal). Não precisa de mapa `senderId → clientId`. **Negar automaticamente ferramentas de alto risco em turnos proativos** (um turno originado por `__cron__` não pode responder a um prompt de permissão).
- **Fase 2:** adicionar `consensus`/`designated` por membro assim que o mapeamento `senderId → clientId` e o ciclo de vida do `clientId` (coleta, limites de refcount) existirem. Nota: um `clientId` sintético por `senderId` cresce ilimitadamente o mapa de refcount de `clientIds` e deve ser coletado.

#### Resumo de mudanças concretas (Build Area 1)

| Mudança                                                                  | Onde                                                    | Tipo          |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| Perfil do grupo define `sessionScope: 'thread'`                             | `settings.json` + `setChannelScope` (`start.ts:359-363`) | Config        |
| Tratar `conversationId` ausente do DingTalk como erro                        | `DingtalkAdapter.ts` ~`:534`                             | Código (S)      |
| Prefixo `[senderName]` para turnos de grupo                                   | `ChannelBase.handleInbound` ~`:316`                      | Código (S)      |
| Novo campo opcional `Envelope.alreadyPrefixed`                           | `types.ts` (Envelope)                                    | Código (S)      |
| Definir `alreadyPrefixed` na reentrada sintética do `collect`                   | `ChannelBase.ts:449-462`                                 | Código (S)      |
| `/clear confirm` + gate de allowlist em grupos compartilhados; `/status` somente leitura | comandos compartilhados (`:147-217`)                             | Código (S)      |
| Perfil do grupo define `dispatchMode: 'followup'`                           | `groups["*"]` em `settings.json`                         | Config        |
| Corrigir JSDoc desatualizado de `dispatchMode` → `'steer'`                              | `types.ts:42`                                            | Correção de comentário   |
| Comando de handoff `/who`                                                  | `registerCommand` (`:141`)                               | Código (S)      |
| Migração daemon-bridge substitui a aprovação automática do `AcpBridge`               | Hospedagem `DaemonChannelBridge` (comprometida)                | Fase 1 (L)   |
| Votação de aprovação por membro + card do DingTalk                              | novo encanamento da bridge + `respondToPermission`              | Fase 1/2 (L) |

### 6.2 Mecanismo Proativo: agendador + push de saída (O NÚCLEO)

#### Decisão: um agendador pertencente ao gateway, neutro para migração

**Adotar um agendador que vive no processo gateway do `qwen channel start`.** O gateway é dono do `SessionRouter` (com recuperação via `restoreSessions()` — `start.ts:275,444`), mantém cada instância de adaptador e sua bridge, e é o único lugar onde `ChannelBase.pushProactive()` (e o `sendMessage()` abstrato subjacente, `:81`) pode ser invocado. O agente (seja o processo filho `--acp` gerado na Fase 0 ou a sessão do daemon na Fase 1+) permanece um executor de prompt puro: o agendador dispara enfileirando em `ChannelBase.sessionQueues`, que chama `bridge.prompt()` apenas quando o turno anterior for esvaziado — **nenhum novo método de bridge, nenhum canal reverso, nenhuma rota de push do daemon.**

> **Nota de topologia (arquitetura comprometida).** O agendador é **neutro para migração por construção**: ele serializa através de `ChannelBase.sessionQueues`, independentemente de qual bridge está por baixo. Na Fase 0, ele aciona `AcpBridge.prompt()` via stdio; na Fase 1+, ele aciona `DaemonChannelBridge.prompt()` (hospedado no daemon). Como a auditoria do `eventBus` do daemon e a `promptQueue` FIFO são desejadas para a governança da Fase 1+, o canal é executado sob `qwen serve` a partir da Fase 1 — mas a lógica do próprio agendador não muda no limite da migração.

Por que não as alternativas:

- **Cron in-`Session`:** rejeitado — `cronQueue`/`cronProcessing` vivem na `Session` em processo (`Session.ts:667-668`), disparam apenas enquanto uma sessão está aberta e morrem no `dispose()` na coleta de ociosidade de 30 min (`:790-812`). Exatamente a falha que o agendador do gateway evita. **E o agendador do gateway é o ÚNICO dono do cron (OD-8): uma sessão de tag nunca inicia seu cron in-session** (mecanismo de gate abaixo).
- **Processo independente:** rejeitado — um segundo processo de longa duração duplicando credenciais do DingTalk, incapaz de reutilizar o `SessionRouter` em processo e a bridge já conectada.

#### Componentes e posicionamento

| Componente                          | Arquivo                                                                        | Responsabilidade                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChannelCronStore`                 | `packages/channels/base/src/ChannelCronStore.ts` (novo)                      | Tabela de trabalhos durável, JSON irmão de `sessions.json`. `atomicWriteJSON` (`atomicFileWrite.ts:385`) + `Mutex` `async-mutex` por arquivo.                                                       |
| `ChannelCronScheduler`             | `packages/channels/base/src/ChannelCronScheduler.ts` (novo)                  | Único `setTimeout` rearmado (timer-wheel-of-one); próximo disparo via `nextFireTime`; recuperação na reinicialização; tick do reconciliador de 60s. Um por gateway; único dono do cron.                                |
| Primitivos de Cron                    | `packages/core/src/utils/cronParser.ts` (reutilização)                             | `parseCron`/`matches`/`nextFireTime` (`:104,141,168`). Não reimplementar.                                                                                                               |
| `dispatchProactive`                | `ChannelBase.ts` (estender)                                                   | Injeta um disparo através de `sessionQueues`; aguarda o `activePrompts.get(sessionId)?.done` de qualquer turno humano em andamento; nunca `steer`; nunca chama `bridge.prompt()` enquanto `activePrompts` estiver retido. |
| `pushProactive`                    | `ChannelBase.ts` (estender; padrão base = `sendMessage`) + override do DingTalk | Entrega de saída; overrides do DingTalk para grupos frios. Controlado pela capacidade `canColdSend`.                                                                                                |
| `canColdSend`                      | propriedade `ChannelBase` (padrão `false`)                                    | Flag de capacidade que o agendador verifica antes de um cold-send; o DingTalk muda para `true` assim que o caminho da API proativa é lançado; o Feishu é `true`.                                                      |
| Envio proativo do DingTalk            | `packages/channels/dingtalk/src/proactive.ts` (novo) + `DingtalkAdapter.ts`  | Mensagens proativas em massa via `robotCode` + `openConversationId` armazenado (contrato VERIFICADO abaixo).                                                                                                   |
| Integração                             | `start.ts` (estender `startSingle`/`startAll`)                                | Construir + iniciar agendador após `router.restoreSessions()` (`:275,444`); passar a flag `isTagSession` para a construção da sessão (OD-8).                                              |
| Ferramenta `/schedule` + `schedule_task` | `ChannelBase.handleInbound()` (estender, após gates `:240-252`)              | Comando determinístico primeiro; ferramenta do modelo depois.                                                                                                                                          |
#### Flag de capacidade `canColdSend` (Fix #4)

O critério de MVP multiplataforma ("a mesma tarefa é entregue no DingTalk e no Feishu") precisa de uma flag de capacidade para que o scheduler possa avaliar a alcançabilidade em vez de descobri-la por meio de falhas silenciosas.

- **Declarado como uma propriedade em `ChannelBase`:** `protected readonly canColdSend: boolean = false;`. (Colocado na classe base, não em um registro `ChannelPlugin` separado, porque o scheduler já mantém a instância do adaptador e `pushProactive`/`sendMessage` são métodos de instância — colocar a flag junto com o método que ela protege mantém ambos no mesmo tipo.)
- **DingTalk:** `canColdSend = false` até que o caminho de envio proativo (`proactive.ts`) seja lançado e um `openConversationId` utilizável seja persistido; muda para `true` assim que `pushProactive` for implementado. Enquanto for `false`, o DingTalk ainda pode responder a turnos quentes (webhook) — `canColdSend` governa apenas a entrega em _grupos frios_.
- **Feishu:** `canColdSend = true` (envio proativo nativo via `tenant_access_token`, `FeishuAdapter.ts:622-676`).
- **Scheduler falha de forma explícita (fails loud):** antes de entregar um disparo (fire), o scheduler verifica `adapter.canColdSend`. Se for `false`, ele **não** tenta `pushProactive`; ele registra um erro visível para o operador, define `job.lastStatus='error'` + `lastError='adapter cannot cold-send'`, exibe isso em `/schedule list` e (conforme a política) incrementa `consecutiveFailures`. Ele nunca falha silenciosamente (no-op).

#### Armazenamentos de cron disjuntos + o gate OD-8 (Fix #5)

Existem dois caminhos de persistência de cron, e **eles residem em caminhos de sistema de arquivos disjuntos**, portanto, nunca podem ler ou gravar as mesmas tarefas:

- **Gateway store (novo):** `path.join(Storage.getGlobalQwenDir(), 'channels', 'cron.json')` — global do canal, irmão de `sessionsPath()` (`start.ts:56-58`), pertencente ao usuário, fora da árvore de trabalho.
- **Session store (existente):** o cron `Session` por sessão usa um diretório com **hash por projeto** `~/.qwen/tmp/<hash>/scheduled_tasks.json` (`cronTasksFile.ts:1-9`).

Como os caminhos são disjuntos, a única maneira de uma tarefa durável ser disparada duas vezes é se uma **sessão tag também executar seu cron `Session` interno** além do scheduler do gateway. **OD-8 fecha essa brecha:** o scheduler do gateway é o único proprietário do cron; uma sessão hospedada no canal ("tag") **não** inicia seu cron interno.

**Mecanismo de gate — como uma sessão descobre que é uma sessão tag.** Uma sessão tag é construída com uma flag explícita passada pelo host do canal:

- No caminho do daemon da Fase 1+, `DaemonChannelSessionFactory` já recebe um pacote de opções estruturado (`{ workspaceCwd, modelServiceId, sessionScope }`, `DaemonChannelBridge.ts:226-241`). Adicione `isTagSession: true` a esse pacote; a `Session` do daemon o lê na construção e **ignora `startCronScheduler()`** (o local de chamada que, de outra forma, armaria `cronQueue`, `Session.ts:667-668`). O descarte já limpa o cron no reap (`:790-803`), então uma sessão tag simplesmente nunca o arma.
- No caminho `AcpBridge` da Fase 0, o agente filho também não deve armar o cron interno para um workspace tag; passe a mesma flag por uma opção de spawn `--acp` (um novo campo `AcpBridgeOptions` encaminhado como uma flag para `Config`). Até que esse encaminhamento de flag seja implementado, a Fase 0 simplesmente não registra nenhuma tarefa de cron interna (o comando `/schedule` tem como alvo o gateway store), então não há nada para ser disparado duas vezes.

Isso torna o risco restante puramente operacional: "não execute ambos os schedulers para as mesmas tarefas" — e o gate garante que uma sessão tag nunca inicie o segundo.

#### Esquema do armazenamento durável e recuperação de reinicialização

O esquema é paralelo a `DurableCronTask` (`cronTasksFile.ts:19-26`: `id`/`cron`/`prompt`/`recurring`/`createdAt`/`lastFiredAt` — o campo é `cron`, **não** `cronExpr`):

```ts
interface ChannelCronJob {
  id: string; // randomUUID()
  channelName: string;
  target: {
    // mirrors SessionRouter PersistedEntry (SessionRouter.ts:5-9)
    channelName: string;
    senderId: string; // "__cron__" for system jobs
    chatId: string; // DingTalk openConversationId — the DURABLE cold-group id
    threadId?: string;
  };
  cwd: string; // validated == bound workspace on load
  cron: string; // 5-field (parseCron) OR "@once:<epochMs>"
  prompt: string;
  label?: string;
  recurring: boolean;
  enabled: boolean;
  createdBy: string; // senderId; advisory under single-token model; carried into the fire's attribution
  createdAt: number;
  lastFiredAt: number | null;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
  consecutiveFailures: number; // auto-disable after N (e.g. 5)
}
```

Escrita via `atomicWriteJSON` sob um `Mutex` `async-mutex` por arquivo. **Recuperação de reinicialização** em `start.ts` _após_ `router.restoreSessions()` (`:275`/`:444`):

1. `bridge.start()` → `restoreSessions()` recarrega `sessions.json` e `bridge.loadSession()` por entrada.
2. `store.load()`; descarta entradas cujo `cwd !== boundWorkspace`.
3. `scheduler.start()`: calcula `nextFireTime(job.cron, new Date())` por tarefa habilitada. **Política de disparo perdido (decisão do RFC): tarefas recorrentes atrasadas durante o tempo de inatividade são disparadas uma vez imediatamente e depois retomam — nunca reprocessam um backlog** (uma inundação de backlog em um grupo ativo é um incidente de spam). Tarefas únicas (one-shots) no passado são disparadas uma vez e depois excluídas. `cronScheduler.ts` distingue `{ kind: 'catch-up'; ids }` (recorrentes) de `{ kind: 'missed'; tasks }` (únicas, confirmar primeiro) em `:81-89,608-707`; adotamos a coalescência para uma para as recorrentes.
4. Arma um único `setTimeout` para a tarefa mais próxima; rearma após cada disparo. Adiciona um tick de reconciliador de 60s (precedente: `lockProbeTimer`, `cronScheduler.ts:229,507-538`) recalculando a partir de `Date.now()` para absorver a distorção do relógio de suspensão/retomada — nunca acumula intervalos.

#### Caminho de disparo: injeção na sessão de grupo COMPARTILHADA (Fix #1 — o principal)

O invariante de um prompt ativo por sessão difere conforme a topologia e o `dispatchProactive` da v1 errou no caminho do daemon:

- **Fase 0 (`AcpBridge`):** `AcpBridge.prompt()` (`:147-180`) **não tem sua própria proteção de concorrência**; a única serialização é `ChannelBase.sessionQueues`/`activePrompts` (`:29-35,394,466`) e a própria sessão ACP do filho `--acp`.
- **Fase 1+ (`DaemonChannelBridge`):** `DaemonChannelBridge.prompt()` **lança `Prompt already in flight`** quando `activePrompts.has(sessionId)` (`:257-261`) — ele **não** enfileira. O `promptQueue` FIFO (`bridge.ts:2855,3082`) fica do lado do daemon/acp-bridge, _atrás_ dessa proteção de lançamento em processo. Portanto, chamar `DaemonChannelBridge.prompt()` enquanto um turno humano está ativo **lança uma exceção** em vez de esperar.

**O redesign (correto sob ambas as topologias): nunca chame `bridge.prompt()` enquanto um turno estiver em andamento; serialize na camada do canal através de `sessionQueues`, aguardando `activePrompts` primeiro.** Como `sessionQueues` encadeia a execução proativa _após_ a execução anterior ser resolvida, no momento em que `bridge.prompt()` é invocado, `activePrompts.get(sessionId)` está limpo — então, no caminho do daemon, a proteção de lançamento nunca é acionada, e no caminho `AcpBridge`, o `prompt()` sem proteção também nunca se sobrepõe.

```ts
// ChannelBase.ts — reuses private sessionQueues/activePrompts (:29-35).
// Works identically for AcpBridge (Phase 0) and DaemonChannelBridge (Phase 1+):
// the chain guarantees bridge.prompt() runs only after the prior turn drains,
// so DaemonChannelBridge's `Prompt already in flight` throw (:257-261) cannot fire.
async dispatchProactive(sessionId: string, promptText: string): Promise<string> {
  const prev = this.sessionQueues.get(sessionId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const active = this.activePrompts.get(sessionId);
    if (active) await active.done;            // wait out a human turn — never steer-cancel (:371-379)
    return this.bridge.prompt(sessionId, promptText);   // only now is activePrompts clear
  });
  this.sessionQueues.set(sessionId, run.then(() => {}, () => {}));
  return run;
}
```

**Invariante: um turno proativo nunca pode ser cancelado por um turno humano posterior, e nunca cancela um turno humano.** Aplicação, declarada para ambas as variantes:

- **Sem cancelamento proativo→humano:** `dispatchProactive` nunca chama `steer`/`cancelSession`. Ele apenas faz `await` de `activePrompts.get(sessionId)?.done` e então enfileira atrás dele.
- **Sem cancelamento humano→proativo:** o perfil do grupo tag é **`followup` (nunca `steer`)** (§6.1). Como `steer` é o único `dispatchMode` que chama `bridge.cancelSession()` (`:371-379`), e os grupos tag nunca o selecionam, um turno humano recebido só pode encadear _atrás_ de um turno proativo em andamento via `sessionQueues` — ele não pode cancelá-lo. (No caminho do daemon, `DaemonChannelBridge.cancelSession` (`:332`) é alcançado apenas a partir do branch `steer`, que é excluído para grupos tag.)
- **Proteção de lançamento nunca acionada:** em ambos os caminhos, `bridge.prompt()` é invocado apenas no final da cadeia `sessionQueues`, após a execução anterior ser resolvida e (para turnos humanos) `activePrompts` ser drenado — portanto, o lançamento de sobreposição do `DaemonChannelBridge` (`:257-261`) é estruturalmente inalcançável para o tráfego tag.

No disparo:

1. **Resolve a sessão compartilhada** via `router.resolve(target.channelName, target.senderId, target.chatId, target.threadId, job.cwd)` (`SessionRouter.ts:72`). `'thread'` → um `sessionId` para todo o grupo, então o disparo cai no contexto que os humanos veem. Se a sessão restaurada caiu, `resolve()` cria + persiste uma nova.
2. **Enfileira, nunca preempta** (followup via `sessionQueues`). Deliberadamente não é `steer`.
3. **Marcador + atribuição (Fix #7).** Prefixo `[Scheduled task "<label>" set by <createdBy>]\n`. A identidade `createdBy` é **carregada na execução enfileirada**, não unida por timestamp posteriormente, para que qualquer chamada de ferramenta/permissão levantada durante este disparo seja atribuída a _este_ turno proativo (§6.4).
4. **Captura + push.** `dispatchProactive` retorna o texto de conclusão; o scheduler verifica `adapter.canColdSend` e então chama `channel.pushProactive(target.chatId, text)` (falha de forma explícita se for `false`).

#### Push de grupo frio no DingTalk

**Limitação verificada:** `DingtalkAdapter.sendMessage()` envia apenas via `sessionWebhook` em cache por `conversationId` (`:84,134-142`), populado apenas na entrada (`:505-517`). Grupo frio → retorno silencioso (`:137-141`).

**Correção — `pushProactive` via a API de envio em massa de mensagens proativas do DingTalk (contrato agora VERIFICADO, OD-7 resolvido).** O formato da chamada também tem precedentes no repositório (`emotionApi` faz POST para `api.dingtalk.com/v1.0/robot/...` com o header `x-acs-dingtalk-access-token` e body `{ robotCode, openConversationId, ... }`, `:188-197`).

**Endpoint e parâmetros verificados** (veja §6.5 para notas completas de origem; confiança observada por item):

- **Endpoint:** `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(confiança alta; doc oficial de envio + aliyun ask/559227)_.
- **`robotCode`** (OBRIGATÓRIO, string): o identificador do robô ao instalá-lo no grupo; mesmo espaço de valores que `appKey` para robôs internos da empresa → use `config.clientId` (`:184,435`). Nenhuma credencial nova. _(confiança alta)_
- **`openConversationId`** (OBRIGATÓRIO, string): o ID de conversa aberta prefixado com `cid` do grupo alvo; os códigos de erro `miss.openConversationId`/`invalid.openConversationId` confirmam que é obrigatório e validado. Persista em `ChannelCronJob.target.chatId` — estável entre reinicializações, ao contrário de `sessionWebhook`. _(confiança alta)_
- **`msgKey`** (OBRIGATÓRIO, string): chave do modelo de mensagem; **`'sampleMarkdown'`** para markdown (`'sampleText'` para texto simples). _(confiança alta; doc de tipo de mensagem + aliyun ask/585232)_
- **`msgParam`** (OBRIGATÓRIO, **uma _string_ codificada em JSON**, não um objeto aninhado): para `sampleMarkdown` a string é `"{\"title\":\"<preview title>\",\"text\":\"<markdown body, max ~5000 chars>\"}"`. _(confiança alta; campos de título/texto do markdown do doc de tipo de mensagem, exemplo de texto literal do aliyun ask/585232)_
- **`coolAppCode`** (OPCIONAL): apenas quando o robô é instalado como um cool app de grupo (群聊酷应用); não é necessário para um robô de aplicativo interno da empresa simples. _(confiança média)_
- **`conversationId` == `openConversationId`?** Para o callback @ de grupo padrão, **trate o `conversationId` do callback (prefixado com cid) como diretamente utilizável como `openConversationId`** — corroborado por fontes da comunidade + formato `cid` correspondente. **Sinalizado (confiança média):** os docs oficiais não contêm uma frase literal igualando-os para um robô padrão (não cool-app). O caminho garantido pelo doc é a API de conversão `chatId → openConversationId` (ou capturando-o da API de criação de grupo / JSAPI `chooseChat` / um callback de cool app que entrega `openConversationId`+`coolAppCode` diretamente). **Regra de fallback:** se um envio retornar `invalid.openConversationId`, faça fallback para a API de conversão `chatId → openConversationId`.

```ts
const GROUP_SEND = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'; // verified high

async pushProactive(chatId: string, text: string): Promise<void> {        // DingtalkAdapter override
  const token = await this.tokenManager.get();        // refreshed independently of SDK connect lifecycle
  const robotCode = this.config.clientId;
  if (!token || !robotCode) { /* refresh once; else set lastError + return */ return; }
  for (const chunk of normalizeDingTalkMarkdown(text)) {  // reuse chunker IF the template length budget matches
    const msgParam = JSON.stringify({ title: extractTitle(text), text: chunk });  // msgParam is a STRING
    await sendGroupMessage({ token, robotCode, openConversationId: chatId,
      msgKey: 'sampleMarkdown', msgParam });            // on invalid.openConversationId → convert via chatId API, retry
  }
}
```

`sendMessage()` se torna: tente o `sessionWebhook` em cache primeiro (barato, sem gasto de token); caso contrário, faça fallback para `pushProactive()`. **Padrão base** `pushProactive = (chatId, text) => this.sendMessage(chatId, text)`, então **o Feishu não precisa de override** (`FeishuAdapter.sendMessage()` já faz envios proativos para qualquer `chatId` com um `tenant_access_token` estável, `:622-676`; `canColdSend = true`). O DingTalk é o único adaptador divergente — a assimetria DingTalk-first. A flag `canColdSend` (acima) permite que o motor **falhe de forma explícita** em um adaptador apenas reativo em vez de descartar silenciosamente.

**Restrições rígidas de deploy (não código):** o bot da organização deve ser (a) um bot interno da empresa publicado, (b) ter a permissão de mensagem proativa em grupo concedida, (c) ser um membro do grupo alvo (instalado via cool app de grupo / aplicativo interno da empresa / aplicativo de terceiros, mantendo seu `robotCode`) _(confiança alta de que uma permissão deve ser habilitada; confiança alta de que bot-instalado + robotCode são pré-requisitos)_, (d) ter seu `openConversationId` registrado. Persistimos `conversationId` na primeira vez que o bot vê _qualquer_ entrada em um grupo, então "frio" = _ocioso_, não _nunca visto_; um grupo verdadeiramente nunca visto não pode receber push até que seu `openConversationId` seja obtido via API de conversão (limite rígido). **Alteração necessária no adaptador:** hoje apenas `sessionWebhook` é armazenado em cache (`:516-517`); também devemos persistir `conversationId` (armazenamento recomendado: um `~/.qwen/channels/dingtalk-groups.json` separado, desacoplado do tempo de vida da sessão para que grupos frios e cron-sem-sessão-ativa sejam representáveis).

> **AINDA SINALIZADO (baixa confiança) — manter visível conforme OD-7:** (1) o **código/nome de exibição exato do ponto de permissão** para "enviar mensagem de grupo proativamente" no console 权限管理 do aplicativo DingTalk não foi fixado a partir dos docs — o DingTalk o mostra no 权限管理 do aplicativo como uma permissão de robô/envio de mensagem (comumente a família de mensagens de robô, ex.: `qyapi_robot_sendmsg` / 企业机器人发送消息权限); confirme no console, não afirme o código de forma rígida. (2) A única frase oficial e autoritativa igualando o `conversationId` do callback com `openConversationId` para um robô padrão (não cool-app) não foi encontrada literalmente nesta sessão — atalho de alta probabilidade, mas o caminho de obtenção garantido pelo doc é a API de conversão `chatId → openConversationId`. As páginas da plataforma aberta do DingTalk são renderizadas via JS e não puderam ser totalmente raspadas nesta sessão; os fatos de endpoint/params/token foram cruzados e confirmados via o espelho de docs do apifox e o Q&A de desenvolvedores do Aliyun citando os exemplos oficiais de requisição.

#### Auth e ciclo de vida do token (verificado; o risco de viabilidade estrutural)

**Header de Auth (confiança alta).** Todas as chamadas v1.0 (incluindo `groupMessages/send`) passam o token no header da requisição `x-acs-dingtalk-access-token: <accessToken>` mais `Content-Type: application/json` — exatamente o header que `emotionApi()` (`:188-207`) e `downloadMedia()` (`media.ts:36-43`) já usam.

**Obtenção do token (confiança alta).** Aplicativo interno da empresa, estilo v1.0: `POST https://api.dingtalk.com/v1.0/oauth2/accessToken` com body JSON `{"appKey":"<appKey>","appSecret":"<appSecret>"}` → `{ "accessToken": "...", "expireIn": 7200 }`. (O equivalente legado `GET https://oapi.dingtalk.com/gettoken?appkey=..&appsecret=..` retorna `{access_token, expires_in:7200}`, mas esse token legado é para os endpoints `oapi` antigos; para as APIs v1.0 de `api.dingtalk.com` use o `accessToken` v1.0 no header `x-acs-dingtalk-access-token`.)

**Expiração e cache (confiança alta).** Os tokens expiram em **7200 s (~2 h)** e DEVEM ser buscados novamente após a expiração; dentro da janela de validade, buscas repetidas retornam o mesmo token e o renovam. **Cache por aplicativo; não chame o endpoint de token em cada requisição** (chamadas frequentes sofrem throttling).

**Por que este é o risco estrutural.** O Stream SDK busca o `access_token` **uma vez no momento da conexão** via `GET .../gettoken` dentro de `getEndpoint()` (`client.mjs:85-87`) e **nunca o atualiza**; `getAccessToken()` retorna o valor em cache (`DingtalkAdapter.ts:172-174`). `autoReconnect` apenas busca novamente no _fechamento_ do socket (`client.mjs:157-163`) — um socket estável de longa duração mantém um token obsoleto após o TTL de ~2 h, e qualquer envio proativo (e os caminhos existentes de emoção/mídia) falha silenciosamente assim que ele expira. **O recurso proativo deve ser dono da atualização do token:** um `tokenManager` que busca via o endpoint v1.0 `oauth2/accessToken` em um timer (antes da expiração de ~2 h) e/ou em um 401, fazendo cache por aplicativo independentemente do ciclo de vida de conexão do SDK (OD-7). Esta é a falha mais provável de "funciona na demo, morre após 2 horas".

**Limites de taxa (verificado, confiança mista — manter sinalizado):** (1) concorrência de API do lado do servidor por aplicativo de ~20 QPS no DingTalk Standard, com uma cota mensal de Open API de ~10.000/mês (Professional ~500k, Dedicated ~5M) _(média-alta)_. (2) Um limite frequentemente citado de **20 mensagens/minuto → ~10 min de throttle** por robô é documentado para **robôs de webhook de grupo personalizados**; é comumente aplicado como um guia prático para o caminho de envio do robô orgapp, mas **não** foi confirmado explicitamente na página `groupMessages/send` nesta sessão — **trate a figura exata de 20/min para `groupMessages/send` como confiança baixa/média.** Além disso: não chame o endpoint de token em excesso (throttle separado). O scheduler deve limitar a taxa de seus próprios envios de forma conservadora e fazer backoff em respostas de throttle.

#### Instruções permanentes (solicitações recorrentes em NL → store → consume)

Captura de dois níveis em `handleInbound()` após os gates passarem (`:240-252`): um comando explícito **`/schedule "0 9 * * 1-5" post the open PR list`** (analisado com `parseCron`, sem round-trip do modelo), e uma ferramenta de modelo da Fase 2 `schedule_task(cron, prompt, recurring, label)`. Ambos chamam `store.add({...})` → persiste → `scheduler.reschedule(job)`, e então respondem no canal. `/schedule list|cancel <id>|disable <id>` leem/escrevem no store. **Persistência fail-closed:** recuse ack de `/schedule` se a escrita lançar exceção.

#### Modos de falha

- **Gateway fora do ar no momento do disparo:** a recuperação coalesce disparos recorrentes atrasados em uma única recuperação; tarefas únicas (one-shots) passadas são disparadas uma vez e depois excluídas.
- **Crash do agente no meio do disparo:** `bridge.prompt()` rejeita; `attachDisconnectHandler` (`start.ts:241,403`) recria (Fase 0) / o daemon reconecta (Fase 1+). O scheduler define `lastError`, não marca `lastFiredAt` para recorrentes → tentado novamente. Pelo menos uma vez (at-least-once); chave de disparo arredondada por minuto + `lastFiredAt` deduplica.
- **Sessão coletada (reaped) / `loadSession` falha:** `resolve()` cria uma nova (transcrição do grupo perdida; instruções permanentes devem ser autossuficientes). A memória do canal (§6.3) é o piso de recuperação.
- **Adaptador não pode enviar a frio (`canColdSend=false`):** o scheduler registra + grava `lastError`, exibido em `/schedule list`; nunca silencioso.
- **Push de grupo frio para grupo removido/permissão revogada:** não-2xx → `lastError`; `invalid.openConversationId` → tenta conversão `chatId → openConversationId` + tenta novamente uma vez.
- **Token expirado:** `tokenManager` atualiza uma vez + backoff; `consecutiveFailures` ≥ N → desativação automática com um registro visível para o operador.
- **Dois gateways em um workspace:** `checkDuplicateInstance()` (`start.ts:170-179`) protege a instância única; adicionalmente registra um token de lock em `cron.json`.
### 6.3 Memória e Aprendizado no Escopo do Canal (Área de Construção 3)

Uma tag deve _lembrar do grupo ao longo do tempo_ sem vazar para um grupo irmão. Hoje, a memória do qwen-code é **global para o workspace**: não há eixo de chat/canal/grupo/sessão.

> **Fatos de topologia / dependência (Fix #3).** Duas restrições rígidas moldam a fiação: (1) Na topologia padrão `AcpBridge` **não há daemon `qwen serve` nem rota `POST /workspace/memory`** — o filho `--acp` não tem cliente HTTP; mesmo após a migração do daemon da Fase 1+, a rota de memória é **exclusiva do daemon e de auth estrita** (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`). (2) `@qwen-code/channel-base` depende apenas de `@agentclientprotocol/sdk` (`packages/channels/base/package.json`), **não** de `@qwen-code/qwen-code-core`, então `ChannelBase` **não pode** fazer `import { writeWorkspaceContextFile }`. O design corrigido, portanto, escreve/lê a memória do canal **em processo via o helper do core, acessado a partir de `channel-base` através de callbacks injetados pela camada CLI** (`packages/cli`, que _pode_ depender do core) — não via HTTP, e não adicionando uma dependência do core ao `channel-base`.

#### Estado atual: dois escopos, nenhum por conversa

`POST /workspace/memory` aceita apenas `scope: 'workspace' | 'global'` (`workspace-memory.ts:118-125`), resolvendo através de `resolveContextFilePath()` (`writeContextFile.ts:223-240`): `workspace → <root>/QWEN.md`, `global → ~/.qwen/QWEN.md`. O modo append é agrupado sob `## Qwen Added Memories` (`MEMORY_SECTION_HEADER`, `const.ts:29`); um mutex por arquivo com deadline de 30s serializa as escritas (`writeContextFile.ts:48-57,159-162`); o writer recusa um arquivo existente > 16 MB no append (`MAX_EXISTING_FILE_BYTES`, `:255`). A rota é **strict-auth** (`deps.mutate({ strict: true })`, `:114`) — ela recusa mesmo em loopback sem token. Consequência: todo grupo em um workspace compartilha um único `QWEN.md`.

#### Design: um escopo de memória `channel` com chave `(channelName, chatId)`

A unidade de isolamento é o **target de roteamento**, não a sessão (sessões são ceifadas por ociosidade, `DEFAULT_SESSION_IDLE_TIMEOUT_MS` 30 min, `run-qwen-serve.ts:94`). A chave já existe: `SessionTarget { channelName, senderId, chatId, threadId }` (`types.ts:88-93`). Para memória de grupo, a chave é `(channelName, chatId)`.

**Layout de armazenamento** espelha a árvore existente `~/.qwen/channels/`:

```
~/.qwen/channels/
  sessions.json
  memory/
    <channelName>/                  # sanitize: reject /, .., NUL
      <hash(chatId)>/               # sha256(chatId).slice(0,16) — path-safe, no collision/escape
        QWEN.md                     # group-scoped "learning over time"
        meta.json                   # { channelName, chatId, displayName?, createdAt, lastWriteAt }
```

O nome do arquivo respeita `getCurrentGeminiMdFilename()` (`const.ts:49`). Isso mantém a memória do canal fora da árvore de trabalho, fora do workspace vinculado e fora do caminho de descoberta hierárquica do `QWEN.md` (para que nunca vaze entre grupos).

#### Caminho de escrita (estenda o helper do core, não faça um fork)

Em `packages/core/src/memory/writeContextFile.ts`:

- Estenda `WriteContextFileScope` (`:80`) de `'workspace' | 'global'` para adicionar `'channel'`.
- Estenda `WriteContextFileOptions` (`:83-97`) com `channelKey?: { channelName: string; chatId: string }`; valide a presença quando `scope === 'channel'` (espelhe a guarda de caminho absoluto de `:142-146`). `projectRoot` continua obrigatório pela interface — passe `config.cwd` mesmo que não seja usado para o escopo do canal.
- Em `resolveContextFilePath()` (`:223-240`) adicione um branch `channel` retornando `path.join(Storage.getGlobalQwenDir(), 'channels', 'memory', sanitize(channelName), hash(chatId), getCurrentGeminiMdFilename())`. **A assinatura atual da função é `(scope, projectRoot)` — ela deve ganhar um parâmetro `channelKey`** (função privada, mudança local). O mutex por arquivo usa como chave o caminho resolvido, então dois grupos escrevem concorrentemente sem contenção.

**A mudança exata em `ChannelBaseOptions` + quem a injeta (Fix #3).** `channel-base` não pode importar o core, então a camada CLI fornece leitura/escrita como callbacks. Estenda o pacote de opções (`ChannelBase.ts:9-12` — a interface real hoje é apenas `{ router?: SessionRouter; proxy?: string }`; `config` e `bridge` são **args posicionais do construtor** em `:40-46`, não membros do pacote). O pacote já carrega `router`:

```ts
// packages/channels/base/src/ChannelBase.ts — ChannelBaseOptions (SEM nova dependência do core)
export interface ChannelBaseOptions {
  // ...membros existentes hoje: router?: SessionRouter; proxy?: string
  /** Lê a memória destilada deste canal; null se ainda não houver. Injetado pela camada CLI. */
  readChannelMemory?: (target: SessionTarget) => Promise<string | null>;
  /** Adiciona/substitui a memória deste canal. Injetado pela camada CLI. */
  writeChannelMemory?: (
    target: SessionTarget,
    content: string,
    mode: 'append' | 'replace',
  ) => Promise<void>;
}
```

**Quem constrói e injeta eles:** `packages/cli/src/commands/channel/start.ts` (que depende do core). Quando `start.ts` constrói o pacote de opções para cada adaptador, ele faz um closure sobre o `writeWorkspaceContextFile` do core/o helper de leitura e resolve o `(channelName, chatId)` confiável do servidor a partir de `router.getTarget(sessionId)` (`SessionRouter.ts:94`) — o adaptador nunca fornece `chatId` a partir da rede:

```ts
// packages/cli/src/commands/channel/start.ts — Camada CLI (PODE depender do core)
import {
  writeWorkspaceContextFile,
  readChannelContextFile,
} from '@qwen-code/qwen-code-core';

const baseOpts: ChannelBaseOptions = {
  router, // config & bridge são args posicionais de createChannel(name, config, bridge, baseOpts) — não são membros do pacote
  readChannelMemory: (target) =>
    readChannelContextFile({
      channelKey: { channelName: target.channelName, chatId: target.chatId },
    }),
  writeChannelMemory: (target, content, mode) =>
    writeWorkspaceContextFile({
      scope: 'channel',
      channelKey: { channelName: target.channelName, chatId: target.chatId },
      mode,
      content,
      projectRoot: config.cwd, // projectRoot não usado para escopo de canal, mas obrigatório pela interface
    }),
};
// adaptador é criado posicionalmente com o pacote por último: plugin.createChannel(name, config, bridge, baseOpts)
```

O adaptador nunca toca no sistema de arquivos e `channel-base` não ganha nenhuma nova dependência. (Alternativa do daemon da Fase 2: uma rota com escopo `POST /channel/:sessionId/memory` que resolve `channelKey` no lado do servidor; ela não pode reutilizar `POST /workspace/memory`, que valida rigidamente `scope ∈ {workspace, global}` e encaminha um `projectRoot` fixo, `:118-125,185-190`. Adie até que o motor proativo já precise de buscas `sessionId → target` no lado do daemon.)

**Fan-out de eventos.** `publishWorkspaceEvent` está no `AcpSessionBridge` **do lado do daemon** (`bridge.ts:3610`), não do lado do canal. Sob `AcpBridge` (Fase 0) **não há** evento `memory_changed` (e nenhum é necessário — um processo é dono da escrita e leitura). Sob a topologia do daemon, `publishWorkspaceEvent` faz fan-out para **cada** barramento de sessão ativo indiscriminadamente (`bridge.ts:3649-3675`); `BridgeEvent.data` é de forma livre (`eventBus.ts:51`) então um evento `memory_changed` _pode_ carregar `{ scope:'channel', channelName, chatId }`, mas **filtragem no lado do assinante** é necessária — o publicador não pode limitar o escopo da entrega.

#### Caminho de leitura (memória → prompt) — bootstrap uma vez por sessão reutilizando `instructedSessions`

Estenda o bloco `instructions` de uma vez por sessão (`ChannelBase.ts:343-347`, controlado por `instructedSessions`): na primeira mensagem de uma sessão cujo target tenha `(channelName, chatId)`, chame o `readChannelMemory(target)` injetado e prependa seu resultado junto com `config.instructions`, então marque a sessão em `instructedSessions` exatamente como hoje. Como o escopo `'thread'` compartilha um `sessionId`, isso carrega a memória **uma vez por tempo de vida da sessão** (o mesmo portão que já previne a reinjeção de `config.instructions`). Nenhuma dependência do core é adicionada — a leitura passa pelo callback injetado. A memória do canal **nunca** está no caminho de descoberta hierárquica; ela é injetada por sessão por este hook.

```ts
// ChannelBase.handleInbound() — bootstrap do primeiro turno (reutiliza instructedSessions)
if (!this.instructedSessions.has(sessionId)) {
  const parts: string[] = [];
  if (this.options.readChannelMemory) {
    const mem = await this.options.readChannelMemory(target); // target de router.getTarget(sessionId)
    if (mem) parts.push(mem);
  }
  if (config.instructions) parts.push(config.instructions);
  if (parts.length) promptText = `${parts.join('\n\n')}\n\n${promptText}`;
  this.instructedSessions.add(sessionId);
}
```

#### Relação com persist/restore do SessionRouter e o transcript

| Camada                    | Persiste                                            | Tempo de vida                                   | Proprietário                             |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| Transcript da sessão       | Turnos de conversa ACP                              | Até ser ceifado / `/clear confirm` / reinício  | `Session` (o agente)             |
| Persistência do `SessionRouter`  | `key → { sessionId, target, cwd }` (`:5-9,224-244`) | Entre reinícios do bridge, via `loadSession()` | `SessionRouter` (`sessions.json`) |
| **Memória do canal (nova)** | Fatos duráveis destilados sobre o grupo             | Indefinido                                 | `~/.qwen/channels/memory/`        |

Quando `restoreSessions()` falha em recarregar uma sessão (`:196`), o transcript é perdido, mas o `QWEN.md` do grupo está intacto — a leitura de bootstrap re-hidrata o conhecimento do agente na próxima mensagem. **A memória do canal é o piso de recuperação para o transcript.** "Aprender ao longo do tempo" é um loop de _destilação_, não persistência bruta de transcript: o agente (ou um job acionado) resume periodicamente fatos salientes no `QWEN.md` do grupo em modo append.

#### Isolamento, tamanho e fases

O isolamento se mantém no nível do caminho (`sales` e `eng` resolvem para diretórios/arquivos/mutexes `hash(chatId)` diferentes) desde que o caminho de escrita sempre carregue o `chatId` confiável do servidor. Este é um isolamento de **conteúdo**, não uma fronteira de auth (o processo ainda tem um único token global, sem identidade por usuário). Para isolamento rígido de tenant, execute um processo por workspace/tenant (OD-2).

Guardrails de tamanho (reutilize a maquinaria existente): o limite de 16 MB para arquivo existente no append é herdado de graça (mapeie `WorkspaceMemoryFileTooLargeError` para um "memória do grupo está cheia, execute uma passada de compactação" visível para o usuário); uma rota da Fase 2 reutiliza o limite de 1 MB por escrita (`MAX_MEMORY_CONTENT_BYTES`, `workspace-memory.ts:79`); compactação em modo replace (`writeContextFile.ts:202-211`) é a resposta de longo prazo para crescimento ilimitado.

- **Fase 0/1:** adicione o escopo `channel` + `channelKey` ao `writeContextFile.ts`; entregue `~/.qwen/channels/memory/` + `meta.json`; conecte os callbacks `readChannelMemory`/`writeChannelMemory` da camada CLI via `ChannelBaseOptions` e a leitura de bootstrap acima. Nenhuma nova rota HTTP, nenhuma dependência `channel-base → core`.
- **Fase 2:** adicione a rota com escopo `POST /channel/:sessionId/memory` (topologia do daemon) e `memory_changed` com filtragem no lado do assinante; adicione um gatilho de destilação e uma CLI `qwen channel memory <name> <chatId>`. **Restrição de destilação:** o cron tem escopo de sessão e morre no `dispose()` (`Session.ts:791,799-803,1056`); a destilação deve disparar enquanto uma sessão estiver ativa — na conclusão do turno, em um `/remember` explícito, ou em uma sessão mantida aquecida — nunca a partir de um agendador de fundo independente.

### 6.4 Governança: Orçamentos de Tokens e Log de Auditoria (Área de Construção 4)

Um agente residente em canal que qualquer membro pode dirigir — e que pode agir proativamente — precisa de limites de gastos, um trilha de auditoria registrando _quem_ pediu _o quê_, e isolamento por identidade. O qwen-code entrega três das quatro primitivas: `rate-limit.ts` (token buckets por chave), o anel `permission-audit.ts`, e `MultiClientPermissionMediator`. Esta área os compõe e preenche as lacunas (nenhum orçamento de custo em lugar algum; nenhuma linha de auditoria carrega um remetente humano). Princípio guia: **recuse, não trunque** — mas, conforme o Fix #6, um orçamento _estimado_ nunca recusa rigidamente um prompt de usuário; ele apenas avisa (WARN).

#### Qual processo é dono da governança?

| Implantação                                          | Bridge                                                  | Qual maquinaria de `serve/` está disponível                                                            |
| --------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Fase 0 — `qwen channel start` / `AcpBridge`**    | gera seu próprio filho stdio `--acp` (`start.ts:213,356`) | **Nenhuma.** Sem servidor Express, sem `rate-limit.ts`, sem rotas HTTP, sem anel `permission-audit.ts`. |
| **Fase 1+ — `qwen serve` + `DaemonChannelBridge`** | canais hospedados no daemon                           | Toda a `serve/`: uso real, mediador, rate-limit, anel de auditoria, rotas.                          |

Resolução: **admissão de orçamento + recusa vivem em `@qwen-code/channel-base`** (o ponto de estrangulamento comum `ChannelBase.handleInbound()`), em um novo **`packages/channels/base/src/BudgetLedger.ts`** — _não_ `serve/budget.ts`, porque o processo de canal da Fase 0 nunca carrega `serve/`, e a camada de canal é o único lugar com contexto de remetente humano. **Auditoria + atribuição** também se originam na camada de canal. No caminho do daemon da Fase 1+, o ledger lê o uso real e é _adicionalmente_ exposto via uma rota; no caminho da Fase 0, ele estima e é exposto via um comando de canal (`/audit`).

#### Onde a governança se acopla hoje (e as lacunas)

| Aspecto                     | Mecanismo existente                                                                                                                                                    | Lacuna                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Limitação de taxa de requisições     | token buckets por `(clientId\|ip)`, 3 níveis (`rate-limit.ts`)                                                                                                         | Sem tokens/custo, apenas contagem de requisições; apenas `serve/`                                |
| Log de decisões pós-fato | anel FIFO limitado, 5 tipos de registro (`permission-audit.ts`)                                                                                                             | Sem `senderId` humano, apenas `clientId`; sem rota GET; anel mantido por closure (`:17-25`) |
| Aprovação real por ação    | quatro políticas + quórum de consenso (`permissionMediator.ts:621-637`)                                                                                                    | Votos atribuídos a `clientId`, não ao humano; um canal = um cliente          |
| Escopo de ferramenta/dados por canal | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`); `getPermissionsAllow()` (`:3158`); `getPermissionsDeny()` (`:3182`); MCP allow-filter (`:3327-3333`) | Escopo é por `Config`/processo; sem caminho de spawn-arg para o filho `--acp`          |

Dois fatos estruturais: (1) **o daemon não tem identidade humana** (`BridgeEvent.originatorClientId`, todo `PermissionVote.clientId` são identificadores de transporte; `senderName` sobrevive apenas até `SenderGate.check()`), então qualquer correlação humano↦`clientId`↦`sessionId` deve ser estabelecida na fronteira do canal; (2) **auth e rate-limit são globais do daemon** (token bearer único `auth.ts:259-266`; rate-limit com chave `(clientId, ip)`), então a governança por canal deve se originar no adaptador.

#### Orçamentos de tokens e custos — um novo `BudgetLedger`, consultivo até que o uso real exista (Fix #6)

**De onde vem o uso — ressalva (OD-9).** Um orçamento de tokens só pode debitar números _reais_ uma vez que o modelo reporta o uso. Na sessão, `Session.#recordPromptTokenCount()` (`Session.ts:2078-2087`) armazena `usageMetadata.promptTokenCount` em `lastPromptTokenCount`, **sobrescrito a cada turno** — _não_ é um medidor de cobrança cumulativo. No caminho `AcpBridge` da Fase 0, o stream ACP `session/update` não carrega `usageMetadata`, então **a v1 não pode debitar contagens reais de tokens** lá. No caminho do daemon da Fase 1+, o daemon observa o uso em processo e _pode_ debitar com precisão.

**Regra de aplicação (Fix #6 — estrutural):**

- **Orçamentos estimados são APENAS CONSULTIVOS.** Quando o único número disponível é uma estimativa do lado do canal (contagem de caracteres de prompt+resposta ÷ uma constante de caracteres por token), o ledger **avisa/alerta** nos limites e pode anexar um aviso à resposta — ele **nunca recusa rigidamente um prompt de usuário**. Uma estimativa falso-positiva não deve silenciar uma requisição real de usuário.
- **Recusa RÍGIDA apenas em números reais.** Um orçamento pode _recusar_ um prompt (recusar-não-truncar) **apenas** quando a fonte de débito é o caminho de uso real do daemon (hospedado no daemon da Fase 1+). Até lá, o orçamento é observabilidade + alerta, não um portão.

Isso torna o orçamento da v1 honesto: ele avisa cedo em todos os lugares e aplica limites rígidos exatamente onde os números são confiáveis.

**Módulo `BudgetLedger.ts`**, modelado em `rate-limit.ts` (factory, Map-of-buckets com GC, overflow fail-open):

```ts
export type BudgetUnit = 'tokens' | 'usd'; // 'usd' = tokens × per-model rate
export type UsageSource = 'estimate' | 'daemon'; // 'estimate' => advisory; 'daemon' => may hard-decline
export interface BudgetLedger {
  // allowed=false only when source==='daemon'; estimates return allowed=true + warn flags
  admit(key: string): {
    allowed: boolean;
    spent: number;
    limit: number;
    advisory: boolean;
  };
  debit(
    key: string,
    amount: number,
    unit: BudgetUnit,
    source: UsageSource,
  ): void; // fires threshold alerts
  snapshot(): Record<
    string,
    { spent: number; limit: number; ratio: number; source: UsageSource }
  >;
  reset(): void;
  dispose(): void;
}
```

- **Semântica de herança padrão + rollup de org strictest-wins (OD-9).** `admit(key)` resolve a janela efetiva com o fallback estilo `GroupGate` `channel → '*' → built-in`. Um prompt deve passar **tanto** pela janela por canal quanto pelo **rollup de "org" por processo** (strictest-wins, debita ambos). "org" = rollup _deste único processo_; um limite de org verdadeiro entre processos precisa de um armazenamento compartilhado (fora do escopo). **Janela diária fixa.**
- **Alertas de 75%/95%.** `debit()` dispara `onAlert` uma vez por limite por janela, usando o idiom de histerese do event-bus (`WARN_THRESHOLD_RATIO`/`WARN_RESET_RATIO`, `eventBus.ts:101-103`). **Postar o alerta é um envio proativo** — uma dependência rígida da Área de Construção 2 (ressalva de grupo frio do DingTalk; Feishu posta livremente). Degradar para "anexar o aviso à próxima resposta" quando não houver canal proativo.
- **Recusar-não-truncar (apenas quando `source==='daemon'`).** Verificado na admissão, _antes_ de `bridge.prompt()` (`:425`). Em um `!allowed` de uso real, o adaptador chama `sendMessage(chatId, refusal)` e retorna — ele **não** entra no caminho de steer/cancel, então um prompt em andamento termina e o _próximo_ é recusado. Em uma estimativa, `allowed` é sempre true (consultivo).
- **Custo (`usd`)** multiplica tokens por uma tabela de taxas por modelo fornecida pelo operador (qwen-code é multi-modelo; sem preço único). Entrada faltando → fallback para `tokens` + aviso único.
- **Config.** `ChannelConfig` (`types.ts:27-51`) ganha `budget?: { unit; limit; windowMs; reset? }`, parseado por `parseChannelConfig`. No caminho do daemon, `ServeOptions` ganha `--budget-org-daily`/`--budget-unit`, e `daemon-status.ts` (que já reporta `rateLimit`, `:295-297`) ganha um bloco `budget` paralelo.
#### Audit log — `senderId` humano carregado com o turno (Fix #7)

`PermissionAuditRing` (`permission-audit.ts:128-172`, FIFO 512) é o substrato correto, mas cada linha tem a chave `clientId`. **Design — um binding sender↦turn no lado do canal** (`RequestAttributionRing.ts`, mesmo formato FIFO).

**O join ingênuo por timestamp está errado sob `followup` (Fix #7).** A v1 propunha fazer o join de uma linha de permissão com "a linha de atribuição mais recente para aquele `sessionId` cujo `recordedAtMs` precede o `issuedAtMs` da permissão." Sob `followup`, múltiplos senders enfileiram em **um** `sessionId` via `sessionQueues`; o sender enfileirado mais recentemente com frequência **não** é aquele cujo turno está sendo _executado_ quando o tool-call/permissão dispara. Portanto, o join por timestamp atribui incorretamente de forma sistemática.

**Fix: carregar o `senderId` COM o prompt enfileirado.** Quando `handleInbound()` enfileira em `sessionQueues` (e quando o scheduler enfileira um disparo proativo), o item da fila / contexto de turno sintético carrega seu próprio `{ senderId, senderName, requestSeq }`. A atribuição para qualquer tool-call/permissão gerada durante um turno é lida a partir do **turno em execução no momento** (a cabeça da FIFO), e não de uma varredura por timestamp. Concretamente: a cadeia `sessionQueues` aplica um `currentTurnAttribution.set(sessionId, {senderId, ...})` por turno no momento em que a execução chega à cabeça (logo antes de `bridge.prompt()`), e a limpa quando a execução é resolvida; as linhas de audit leem esse mapa. Disparos proativos aplicam `createdBy` da mesma forma (§6.2 passo 3). Isso é exato para o turno em execução e imune à ordem de enfileiramento.

Adicionar um sexto tipo de linha **`task.requested { sessionId, senderId, channelName, chatId, promptDigest, requestedAtMs }`** na admissão, para que o audit responda "quem iniciou esta tarefa" mesmo para trabalho read-only. A união `PermissionAuditEntry` (`:57-104`) é **fechada** e os consumidores fazem switch em `kind`, portanto ampliá-la (ou adicionar um ring irmão) afeta todos os consumidores.

**Caminho de query.** Daemon da Phase-1+: adicionar `GET /workspace/audit` (bearer + `createMutationGate` estrito, `auth.ts:356`), expondo o ring a partir do closure da bridge (a documentação do cabeçalho do arquivo antecipa isso, `:22-25`). `AcpBridge` da Phase-0: um comando de canal `/audit` via `sendMessage`. **Durabilidade:** o ring tem 512 entradas em memória, **perdidas no restart** — uma limitação conhecida da v1; o follow-up (OD-11) persiste um **audit de join append-only em `~/.qwen`**.

**Votantes de consenso não são humanos.** `votersAtIssue` são `clientId`s aplicados pelo daemon, e um canal = um `clientId`, então o "consenso" out-of-the-box em um grupo do DingTalk é um consenso entre _clientes do daemon_. A votação em nível humano precisa de uma lista de aprovadores registrados mapeando `senderId` → um voto distinto — o requisito da Phase-2 do OD-3, não um recurso resolvido.

#### Isolamento de ferramenta e dados por identidade

1. **Allow/deny de ferramentas por canal.** `Config` suporta `coreTools`/`allowedTools`/`excludeTools` (`:727-729`), expostos via `getPermissionsAllow()`/`getPermissionsDeny()`/`getCoreTools()`. (**Não** existe `getAllowedTools()`/`getBlockedTools()`.) Na Phase 0, o caminho `AcpBridge` gera um child por canal, mas `AcpBridgeOptions` carrega apenas `{ cliEntryPath, cwd, model }` (`:17-21`) e `start()` encaminha apenas `--acp`+`--model` (`:56-63`). Entregar o escopo por canal requer NOVOS campos em `AcpBridgeOptions`, NOVAS flags `--acp` em `Config`, além de novos campos em `ChannelConfig`. No caminho do daemon da Phase-1+, há um `Config` por daemon, então o escopo é por daemon (por workspace, OD-2) e não por child de canal.
2. **Escopo de MCP por canal.** `Config.getMcpServers()` filtra por `allowedMcpServers` (`:3327-3333`), definido na construção. Adicionar `allowMcpServers?: string[]` a `ChannelConfig`, integrado ao mesmo caminho de spawn-arg (ou ao array `mcpServers` que `AcpBridge.newSession()` passa — hard-coded como `[]` em `:133`).
3. **`sessionScope` como limite de dados.** `'thread'` faz com que um grupo compartilhe uma working tree/contexto; o isolamento entre _canais_ é aplicado por routing keys com namespace de `channelName`. Por design, o isolamento por sender dentro de um grupo `'thread'` _não_ existe.

**Limitação honesta:** a auth é um único token global do daemon sem principal por usuário, então o isolamento é por **canal**, não por humano. O verdadeiro isolamento de ferramentas por humano requer a Phase-3.

#### Caminho de admissão

```
Entrada do DingTalk
  → ChannelBase.handleInbound()
     1. GroupGate.check() + SenderGate.check()                 [existente :240-252]
     2. budget.admit('channel:<name>') && budget.admit('org')  [NOVO]
            ↳ source==='daemon' && !allowed: sendMessage(refusal); return  (NÃO entra em steer/cancel)
            ↳ source==='estimate': allowed sempre true → apenas WARN (Fix #6)
     3. enfileira em sessionQueues COM {senderId, senderName, requestSeq}  [NOVO — Fix #7]
        + linha task.requested
     4. na cabeça da FIFO, aplica currentTurnAttribution → bridge.prompt(...)   [existente :425]
            ↳ tool call → permission (auto-aprovado no AcpBridge Phase 0; mediador no daemon Phase 1+)
                ↳ linha de audit lê currentTurnAttribution[sessionId]  (o turno em EXECUÇÃO)
     5. na conclusão: uso conhecido (daemon) ou estimado (AcpBridge) → budget.debit(..., source)  [NOVO]
            ↳ post de alerta de 75%/95% é proativo → depende da Build Area 2
```

Dependências rígidas a destacar: (1) o débito real de tokens (e, portanto, o hard-decline) precisa do caminho de uso do daemon da Phase-1+ — até lá, os orçamentos são consultivos (Fix #6); (2) os alertas proativos de orçamento precisam da Build Area 2; (3) a votação de consenso em nível humano e a atribuição de audit em nível humano precisam da lista de aprovadores registrados do OD-3.

### 6.5 Plataforma DingTalk (primária) + follow-up do Feishu

> **Nota de wiring (arquitetura confirmada).** Phase 0: `qwen channel start` constrói `AcpBridge` (`start.ts:213,350`; `AcpBridge.ts:38`), que gera `node <cli> --acp` e expõe `newSession(cwd)`/`loadSession(sessionId, cwd)` (`:131,137`); o escopo da sessão é de propriedade do `SessionRouter`, não da bridge. Phase 1+: os canais são hospedados sob `qwen serve` via `DaemonChannelBridge` (seus defaults de `'thread'` em `:229,240`; seu overlap-throw em `:257-261`). A migração é confirmada, não opcional (§1).

#### O problema da expiração do sessionWebhook

O modo Stream do DingTalk entrega cada entrada com um `sessionWebhook` de curta duração; o adapter faz o cache dele com a chave `conversationId` (`:84`, populado em `onMessage()` `:517`), e `sendMessage()` (`:134-170`) o busca, registrando `No webhook for chatId` no log e retornando silenciosamente se estiver ausente (`:137-141`). Dois fatos fatais para o uso proativo: (1) o webhook **expira** (o tipo do SDK `RobotMessageBase` carrega `sessionWebhookExpiredTime`, `constants.d.ts:13`, mas a interface `DingTalkMessageData` do adapter o omite e nunca o lê — um webhook em cache pode estar obsoleto mesmo dentro da janela ativa); (2) o mapa é populado **apenas** por tráfego de entrada, então um grupo frio não tem entrada.

#### Push de grupo frio via API de mensagem proativa do robô (主动消息) — VERIFICADO (OD-7)

A solução é a API de mensagem proativa do bot do DingTalk — **`POST https://api.dingtalk.com/v1.0/robot/groupMessages/send`** _(endpoint verificado com alta confiança)_. Ao contrário do webhook, ele é endereçado por um **`openConversationId`** durável _(verificado com alta confiança)_, autentica-se com o header **`x-acs-dingtalk-access-token`** _(verificado com alta confiança — já usado por `emotionApi()` `:188-207` e `downloadMedia()` `media.ts:36-43`)_, e carrega o **`robotCode`** do bot _(verificado com alta confiança; = `config.clientId`, `:184,435`)_. O body é um par `msgKey`/`msgParam` _(verificado com alta confiança)_ onde **`msgParam` é em si uma string codificada em JSON** (não um objeto aninhado), por exemplo, para `msgKey:'sampleMarkdown'`:

```jsonc
{
  "robotCode": "ding...", // = config.clientId
  "openConversationId": "cid6KeBBLov...", // id de grupo durável (do conversationId de entrada; converter se inválido)
  "msgKey": "sampleMarkdown",
  "msgParam": "{\"title\":\"<título de pré-visualização>\",\"text\":\"# oi\\n...markdown ≤ ~5000 caracteres\"}",
}
```

Este é um **novo método ao lado de `sendMessage()`**, não uma alteração nele (esboço no §6.2). `ChannelBase.sendMessage()` continua abstrato (`:81`); o motor proativo precisa da nova seam de saída `pushProactive?(target, text)` — totalmente nova e a entrega central da plataforma. **`verificado [alta confiança] conforme doc oficial de envio + aliyun ask/559227, ask/585232 + doc de tipo de mensagem`** para o formato de endpoint/params/`msgParam`.

**Pré-requisito de permissão:** uma permissão de robô/mensagem de "enviar mensagem proativa de chat em grupo" deve ser concedida ao app interno da empresa antes que `groupMessages/send` funcione (o doc de envio lista este pré-requisito) _(verificado com alta confiança que uma permissão deve ser habilitada)_. **AINDA SINALIZADO (baixa confiança):** o nome de exibição/código exato do ponto de permissão não foi fixado a partir dos docs nesta sessão — o console do DingTalk o mostra sob o 权限管理 do app como uma permissão de envio de robô/mensagem (comumente a família robot-message, ex.: `qyapi_robot_sendmsg` / 企业机器人发送消息权限); confirme no console, **não** asserte o código rigidamente. O adapter deve registrar no log `resp.status` + body em `!resp.ok`/throw — o empty-catch atual de `emotionApi` (`:214-216`) é o anti-padrão que ocultaria uma má configuração de permissão ausente.

#### Adquirindo e persistindo openConversationId

Duas fontes: (1) **coletar da entrada** — cada mensagem carrega `conversationId` (`:506`), encaminhado como `openConversationId` para a emotion API (`:197`); persista-o no momento em que o virmos. **`verificado [confiança média] conforme aliyun ask/559227, ask/585233 + formato 'cid' correspondente`** que o `conversationId` do callback (prefixado com cid) é usável diretamente como `openConversationId` para o callback @ de grupo padrão. **AINDA SINALIZADO:** nenhuma frase oficial e literal os iguala para um robô non-cool-app; o caminho de obtenção garantido pelo doc é a **API de conversão `chatId → openConversationId`** (`obtain-group-openconversationid`), ou captura da API de criação de grupo / JSAPI `chooseChat`, ou um callback de cool-app (que entrega `openConversationId`+`coolAppCode` diretamente). **Fallback:** em `invalid.openConversationId`, converta via a API `chatId` e tente novamente. (2) **eventos de bot-adicionado-ao-grupo** via `registerAllEventListener` (`client.mjs:58-61`): os eventos fluem `onEvent → onEventReceived` sob o `topic:'*'` padrão (`client.mjs:14-19,241-254`), enquanto o adapter instala apenas o _callback_ do robô (`:107`), então os eventos de org/bot são atualmente recebidos e descartados no default no-op (`client.mjs:35-37`). O topic do evento e o campo `openConversationId` no momento da instalação estão **não verificados** — não hard-code o nome de um evento.

**Persistência.** Use um store **separado `~/.qwen/channels/dingtalk-groups.json`**, não o alvo do `SessionRouter`: o ID do grupo deve sobreviver a qualquer sessão (o push de grupo frio driven por cron dispara sem sessão ativa), e um `PersistedEntry` só existe quando uma sessão é criada para a routing key — acoplar a identidade do grupo ao tempo de vida da sessão deixa os grupos frios sem representação.

#### O escopo multiplayer é opt-in, não o default

O escopo `'thread'` (`:53`) é o que fornece um agente compartilhado por grupo, mas `parseChannelConfig()` define o default de `sessionScope` como `'user'` (`config-utils.ts:91-92`), o que fornece sessões _por membro_. O operador deve definir explicitamente `sessionScope: 'thread'`. Quando definido, duas consequências multiplayer se aplicam: (a) o default `dispatchMode: 'steer'` **cancela** o trabalho em andamento quando qualquer membro envia uma mensagem (`:371-379`) — o perfil da tag define `'followup'` (§6.1); (b) a lacuna de atribuição de sender (§6.1).

#### Parsing de @ de entrada

O group gating funciona: `GroupGate` usa `envelope.isMentioned`, definido a partir de `data.isInAtList` (`:520`). A limpeza de texto remove apenas o **primeiro** `@token` (`:527-529`), posicional e não baseado em identidade — `@qwen @alice` está correto, mas uma menção humana primeiro removeria a do humano. Um follow-up de hardening remove pelo próprio `chatbotUserId` do bot. O contexto de reply/quote é extraído (`extractQuotedContext()`, `:272-298`), com `isReplyToBot` computado em relação a `chatbotUserId` (`:280,292`), e `referencedText` injetado como `[Replying to: "…"]` (`ChannelBase.ts:317-319`). **A atribuição de sender é fechada no §6.1** via o prefixo `[senderName]`.

#### Renderização de Markdown / card

`markdown.ts` já faz a normalização de plataforma que o caminho proativo reutiliza: tabelas → texto com pipe (`convertTables()`, `:44-80`), chunking em 3800 caracteres com balanceamento de fence (`splitChunks()`, `:84-188`; `CHUNK_LIMIT=3800`, `:10`), extração de título fatiada em 20 caracteres com fallback `'Reply'` (`extractTitle()`, `:190-195`). A reutilização é **condicional** ao template `sampleMarkdown` aceitar o mesmo subconjunto de markdown e um body de até **~5000 caracteres** _(verificado com alta confiança — doc de tipo de mensagem)_; mantenha `CHUNK_LIMIT` ≤ esse orçamento. Streaming interactive cards (o caminho `TOPIC_CARD`, `constants.d.ts:4`) — o análogo do streaming card do Feishu — estão **fora do escopo** para o marco primário; o proativo da v1 é baseado em mensagem markdown.

#### Follow-up do Feishu (conciso)

O Feishu está à frente exatamente no eixo que importa: **o envio proativo é nativo** (`sendMessage(chatId, text)` para qualquer `chat_id`, `:622-676` — sem problema de grupo frio; `canColdSend = true`), **`tenant_access_token` estável** com refresh rastreando expiração (`refreshToken()`, `:581-620` — o trabalho que o DingTalk ainda precisa), **assinatura de eventos flexível** (WebSocket ou webhook HMAC, `:146-176`), e **streaming cards de primeira classe** (`markdown.ts`, `:742-792`). **Mas os problemas compartilhados de `ChannelBase`/`SessionRouter` — escopo `'thread'` opt-in, cancelamento de `dispatchMode`, atribuição de sender ausente, a nova seam de saída — aplicam-se identicamente ao Feishu.** O Feishu resolve _alcance_, não _quem-disse-o-quê_ ou _um-membro-cancela-o-outro_. Portar o motor proativo para o Feishu reutiliza o `sendMessage()` existente diretamente (o default base de `pushProactive`); o único trabalho novo de plataforma é mapear o grupo alvo do motor para um `chat_id` persistido e, opcionalmente, rotear pelo caminho do streaming-card.

---

## 7. Rollout em Fases (Phase 0–2) e MVP

Cada fase é mergeável independentemente, termina demonstrável e é limitada por critérios de aceitação explícitos. A **Phase 0** faz com que a stack existente se comporte como um agente residente compartilhado — config mais algumas pequenas alterações de código, no `AcpBridge`. A **Phase 1** migra a hospedagem de canais para `qwen serve` (arquitetura confirmada) e adiciona o motor proativo e o único loop fechado do MVP. A **Phase 2** adiciona memória de canal, orçamentos e audit.

### Topologia: migração de daemon confirmada (era OD-1)

A decisão está **tomada**, não pendente: a Phase 0 é entregue no `AcpBridge`; a **Phase 1+ executa canais sob `qwen serve`** (via `DaemonChannelBridge` ou um daemon channel runner), porque a persistência de memória por sala, o mediador de permissão, o audit do event-bus, a `promptQueue` FIFO e as rotas de query de orçamento/audit todos querem o daemon. O scheduler de propriedade do gateway (§6.2) é **neutro para migração** — ele serializa através de `ChannelBase.sessionQueues` independentemente da bridge — então ele é entregue na Phase 1 e não é afetado pelo cut-over. **O wiring da Phase 0 adiciona o caminho de attach do `DaemonChannelBridge` (ou uma flag `--daemon <url>`)** para que a migração seja uma etapa de configuração no limite da Phase-1, não uma reescrita. Observe a aresta afiada em torno da qual o scheduler foi projetado: `DaemonChannelBridge.prompt()` **não** enfileira — ele _lança_ `Prompt already in flight` em sobreposição (`:257-261`); a `promptQueue` FIFO do daemon fica do lado da acp-bridge (`bridge.ts:2855,3082`); a serialização do lado do canal é `ChannelBase.sessionQueues` (`:394`), razão pela qual o motor proativo nunca chama `prompt()` enquanto um turno está ativo (§6.2, Fix #1).

### Phase 0 — Config + Injeção de Identidade (no AcpBridge)

**Objetivo.** Um grupo do DingTalk onde qualquer membro menciona o bot com `@`, todo membro compartilha uma sessão, o agente sabe quem está falando, e uma tarefa em andamento não é destruída pelo follow-up de um colega de equipe.

**0.1 — O perfil de config "qwen tag"** (majoritariamente `settings.json`):

```jsonc
// settings.json → channels."team-eng"
{
  "team-eng": {
    "type": "dingtalk",
    "clientId": "$DINGTALK_CLIENT_ID",
    "clientSecret": "$DINGTALK_CLIENT_SECRET",
    "cwd": "/srv/repos/our-service",

    // Multiplayer: TODO o grupo compartilha UM sessionId. routingKey → `${name}:${threadId||chatId}` (:53).
    // O DingTalk não define threadId (:541-551) → a chave faz fallback para chatId = conversationId||sessionWebhook (:534).
    // Uma mensagem sem conversationId usaria o webhook TRANSIENT como chave — trate como um hard error.
    "sessionScope": "thread",

    // groupPolicy tem default "disabled" (GroupGate :13; config-utils :98) — DEVE ser definido ou todas as msgs de grupo serão descartadas.
    // No modo allowlist, "*" NÃO é um wildcard de membership (GroupGate :42); liste cada chatId. "*" fornece apenas DEFAULTS.
    "groupPolicy": "allowlist",
    "groups": {
      "cidXXXXXXXX": { "requireMention": true, "dispatchMode": "followup" },
      "*": { "requireMention": true, "dispatchMode": "followup" },
    },
    "senderPolicy": "open",
    "instructions": "Você é o agente de engenharia compartilhado da equipe neste grupo do DingTalk...",
  },
}
```

Notas ligadas à verdade real: `requireMention` tem default `true` (`GroupGate.ts:49`); `sessionScope` tem default `'user'` (`config-utils.ts:92`) — `'thread'` é todo o mecanismo multiplayer; o default de grupo para `dispatchMode` deve ser `'followup'` (não o `'steer'` de runtime, `:354`).

**0.2 — Atribuição de sender.** O prefixo `[senderName]` na seed de `promptText` (`ChannelBase.ts:316`), condicionado a `isGroup`, **disparado a cada turno** (não condicionado por `instructedSessions`), com a **nova flag `Envelope.alreadyPrefixed`** protegendo a reentrada de `collect`. Veja §6.1.

**0.3 — Reconciliação de `dispatchMode`.** Defina o `dispatchMode` por grupo explicitamente; corrija o JSDoc obsoleto em `types.ts:42` (`'collect'` → `'steer'`) para que o código e o comentário concordem (OD-5).

**Arquivos alterados (Phase 0).** `start.ts` (adicionar o caminho de attach opcional do `DaemonChannelBridge` para que a migração confirmada da Phase 1 esteja a uma flag de distância); `ChannelBase.ts` (seed de `senderName` + proteção `alreadyPrefixed` + gate de confirm+allowlist para `/clear` + `/who`); `types.ts` (novo campo `Envelope.alreadyPrefixed` + correção de JSDoc); `docs/` (a receita + pegadinhas).

**Critérios de aceitação.**

- [ ] Dois membros mencionam o bot com `@`; ambos resolvem para o **mesmo** `sessionId` (assert via mapas do `SessionRouter`); a routing key é `team-eng:<conversationId>`, não uma URL de webhook.
- [ ] O agente usa atribuição de sender (`[senderName]` presente para grupo, ausente para 1:1); a reentrada de `collect` não duplica o prefixo (asserts no caminho de `alreadyPrefixed`).
- [ ] Uma mensagem de grupo sem menção é descartada (motivo `mention_required`); um grupo não allowlisted é descartado (`not_allowlisted`).
- [ ] Com `dispatchMode: 'followup'`, o membro B enviando mensagem durante a tarefa do membro A não cancela A; a mensagem de B executa após A.
- [ ] Em um grupo compartilhado (thread), `/clear` requer `confirm` e é restrito a `config.allowedUsers` quando definido (não é um reset livre); `/status` permanece read-only.
- [ ] Testes unitários no nível de hook (sem testes de UI com `wait(ms)`): igualdade de routing-key entre senders; presença do prefixo de promptText para `isGroup` true vs false; skip de `alreadyPrefixed`.

### Phase 1 — Migração de Daemon + Motor Proativo + o Loop Fechado do MVP

**Definição do MVP.** Um **único loop fechado de digest agendado**: um operador registra um job no estilo cron para um canal; ao disparar, o gateway resolve a sessão com escopo de thread do canal, executa um prompt com ferramentas, e **posta o resultado de volta no canal frio sem ser solicitado**. Um job, um canal, um caminho de entrega. Comportamentos mais ricos estão fora do escopo do MVP.

**Migração confirmada.** A Phase 1 hospeda canais sob `qwen serve` via `DaemonChannelBridge` (a decisão do OD-1), herdando a `promptQueue` FIFO, mediador, eventBus e rotas. O motor proativo é o §6.2 (scheduler de propriedade do gateway, neutro para migração; `dispatchProactive` serializado através de `sessionQueues`; fallback de cold-send do DingTalk via a API verificada `groupMessages/send`; refresh do `tokenManager`; flag de capacidade `canColdSend`). Três fatos tornam isso não trivial: o cron hoje tem escopo de sessão e morre no dispose (fechado pelo gate de sole-owner do OD-8); o DingTalk não pode enviar mensagens para um grupo frio (fechado pela API proativa verificada + `openConversationId` persistido); e o prompt proativo deve serializar através de `sessionQueues` e **nunca** chamar `bridge.prompt()` enquanto `activePrompts` estiver retido — caso contrário, `DaemonChannelBridge` lança `Prompt already in flight` (`:257-261`).
**Pacotes alterados.** `ChannelCronStore.ts`/`ChannelCronScheduler.ts` (novo, channel-base); `cronParser.ts` (reutilização); `ChannelBase.ts` (`dispatchProactive`, `pushProactive`, flag `canColdSend`, `/schedule`); `DingtalkAdapter.ts` + `dingtalk/src/proactive.ts` (novo cold-send + `openConversationId` persistido + `tokenManager`); `FeishuAdapter.ts` (sem alterações; adaptador de referência com capacidade proativa, `canColdSend = true`); `start.ts` (hospedar sob o daemon; construir + iniciar o agendador após `restoreSessions()`; passar `isTagSession` para a construção da sessão para que o cron in-session seja desabilitado — OD-8); construção da sessão (pular `startCronScheduler()` para sessões de tag, `Session.ts:667-668`).

**Critérios de aceitação.**

- [ ] Os canais rodam sob o `qwen serve` (hospedados pelo daemon); uma chamada de ferramenta expõe um `permission_request` (mediador acessível), confirmando a migração.
- [ ] Um operador registra um job de resumo; ele persiste após a reinicialização do gateway (recarregado de `~/.qwen/channels/cron.json`).
- [ ] Quando o job é disparado com **nenhuma sessão aberta**, o gateway resolve a sessão com escopo de thread, executa o prompt com ferramentas e entrega no grupo inativo do DingTalk via o caminho de cold-send — provando a entrega em cold-group. O motor **falha de forma explícita** (registra em log, grava `lastError`, não faz no-op silencioso) quando `canColdSend = false`.
- [ ] O mesmo job entrega no Feishu via `tenant_access_token`, provando a abstração `canColdSend`.
- [ ] Um job disparado não viola a regra de um-prompt-por-sessão: se um membro estiver no meio de uma conversa, o prompt proativo entra na fila atrás dele via `sessionQueues` (aguarda `activePrompts.get(sessionId)?.done`), nunca cancelando via `steer`, e nunca acionando o erro de sobreposição do `DaemonChannelBridge`.
- [ ] Um turno proativo não é cancelável por um turno humano posterior (grupos de tag são `followup`, nunca `steer`).
- [ ] O `tokenManager` atualiza o `accessToken` v1.0 antes da expiração de ~2 h e em caso de 401, para que um envio após o socket estar aberto por > 2 h ainda seja bem-sucedido.
- [ ] Sem disparo duplo de nenhum job durável: o agendador do gateway é o único proprietário; uma sessão de tag não arma seu cron in-session (OD-8); os dois stores estão em caminhos disjuntos.
- [ ] Excluir o job interrompe disparos futuros.
- [ ] Testes de hook/nível de serviço (agendador contra um relógio falso; cold-send contra um cliente HTTP mockado) — sem `wait(ms)`.

### Fase 2 — Memória do Canal + Orçamentos de Token + Log de Auditoria

**2.1 — Memória com escopo de canal** (§6.3): adicionar o escopo `'channel'` + `channelKey` ao `writeContextFile.ts` (`WriteContextFileScope` `:80`, `WriteContextFileOptions` `:83-97`, `resolveContextFilePath` `:223-240`); entregar `~/.qwen/channels/memory/<channelName>/<hash(chatId)>/QWEN.md`; conectar os callbacks da camada CLI `readChannelMemory`/`writeChannelMemory` via `ChannelBaseOptions` + leitura de bootstrap reutilizando `instructedSessions`. Rota do daemon da Fase 2 `POST /channel/:sessionId/memory` apenas sob a topologia de daemon.

**2.2 — Orçamentos de token por canal** (§6.4): `BudgetLedger.ts` chaveado por canal, **consultivo (apenas WARN) na estimativa do lado do canal, recusa rígida apenas no uso real do daemon** (Fix #6/OD-9); rollup de org por processo + janelas por canal, o mais restrito vence, janela diária fixa; alertas de 75%/95% (dependência de envio proativo).

**2.3 — Log de auditoria** (§6.4): `RequestAttributionRing` + linha `task.requested`; **atribuição carregada com o turno em execução (`currentTurnAttribution` por turno), não um join por timestamp** (Fix #7); comando `GET /workspace/audit` (daemon) ou `/audit` do canal. FIFO em memória de 512, perdido na reinicialização (limitação conhecida da v1; arquivo de acompanhamento append-only em `~/.qwen`, OD-11).

**Arquivos alterados.** `writeContextFile.ts`, `workspace-memory.ts` (validação de escopo + GET walker, caminho do daemon); `BudgetLedger.ts`, `RequestAttributionRing.ts` (channel-base); `permission-audit.ts` (fonte do padrão) / novo `channel-audit.ts` (daemon); `ChannelBase.ts` (carregar `senderId`/`senderName` em turnos enfileirados + `currentTurnAttribution`; hooks de orçamento); `server.ts` (montar rotas após `express.json` `:2025`, bloquear mutações com `mutate({ strict: true })`).

**Critérios de aceitação.**

- [ ] `scope: 'channel'` escreve em `~/.qwen/channels/memory/<channel>/<hash(chatId)>/QWEN.md`; dois grupos recebem arquivos **independentes**; o `QWEN.md` do workspace compartilhado não é alterado; a escrita passa pelo callback injetado (sem dependência `channel-base → core`).
- [ ] O acréscimo de memória do canal é idempotente sob concorrência (mutex por arquivo) e emite `memory_changed` apenas em mutação real (caminho do daemon; filtragem no lado do assinante).
- [ ] No caminho do **daemon**, após um canal exceder seu limite de janela de uso real, o próximo prompt de entrada é recusado (não truncado) e os jobs proativos pausam; os contadores resetam na virada da janela diária; os orçamentos são independentes por canal. Em um caminho de **apenas estimativa**, o orçamento gera um WARN, mas nunca recusa rigidamente (Fix #6).
- [ ] Uma chamada de ferramenta/permissão levantada enquanto o turno enfileirado do remetente A é executado é atribuída a **A**, mesmo que B tenha entrado na fila depois sob `followup` (Fix #7).
- [ ] Cada disparo proativo, escrita de memória do canal e evento de orçamento cai no anel de auditoria com `senderId`/`senderName` de melhor esforço, legível via superfície de auditoria, **não** transmitido no barramento SSE.
- [ ] Testes unitários de ring/route/resolver (evicção FIFO, resolução de caminho de escopo, matemática de limite de orçamento, atribuição do turno em execução) — sem testes de UI/timing.

### Limite da fase e direcionamento futuro

As fases 0→1→2 são aditivas: multiplayer + identidade (no `AcpBridge`) → migração para daemon + MVP proativo → memória + orçamentos + auditoria. O **gateway multi-identidade da Fase 3** (identidades/credenciais de bot distintas por canal, verdadeiros principais por usuário, tokens por canal) está _fora do escopo_, sendo o próximo passo natural que remove as restrições de token global único / um workspace por daemon. Mesmo dentro das Fases 0–2, o "qwen tag" requer **um processo de agente por workspace** (OD-2); um deployment servindo múltiplos repositórios executa múltiplos processos.

---

## 8. qwen tag vs Claude Tag (tradeoffs)

O Claude Tag é um agente hospedado e multi-tenant: a Anthropic opera o runtime, a identidade e a medição por usuário; o app do canal é um thin client. O `qwen tag` é o inverso — ele roda em infraestrutura controlada pelo operador sobre os adaptadores do qwen-code. Essa inversão é toda a proposta de valor e toda a superfície de risco.

### Onde o qwen vence

- **Aberto / auto-hospedado, os dados permanecem internos.** O agente roda localmente — via stdio na Fase 0 (`AcpBridge.start()` executa `node <cli> --acp`), in-process sob o `qwen serve` a partir da Fase 1 — nunca uma API de fornecedor. O conteúdo do repositório, o tráfego do modelo e as transcrições permanecem nos hosts do operador. O Claude Tag não pode fazer essa afirmação.
- **MCP / any-tool.** Superconjunto estrito da superfície de ferramentas de um agente hospedado fechado.
- **Votação de permissão por ação — _um recurso da Fase 1+ quando hospedado pelo daemon_.** O qwen-code entrega o `MultiClientPermissionMediator` (quatro políticas, quórum de consenso `floor(M/2)+1`, anel de auditoria separado). Genuinamente um diferencial — **inalcançável no caminho `AcpBridge` da Fase 0** (`requestPermission` auto-aprova, `:108-118`), alcançável quando a Fase 1 hospedar os canais no daemon; mesmo lá, os votos são chaveados por `clientId` e um canal é um _único_ cliente até que o roster da OD-3 chegue. O campo morto `ChannelConfig.approvalMode` (`types.ts:36`) confirma o que foi planejado, mas está ausente.
- **Estado durável e inspecionável.** Persistência do `SessionRouter`, arquivos simples `QWEN.md`/`AGENTS.md` e (daemon, Fase 1+) um anel de replay de Last-Event-ID. Nada opaco.

### Onde diverge e precisa compensar

1. **Workspace único + token global único + sem identidade humana.** Um processo vincula um workspace; multi-workspace = N processos (OD-2). O token global único se aplica ao _daemon HTTP_; o caminho do canal `AcpBridge` da Fase 0 não tem superfície HTTP e nem token (seu limite é `SenderGate`/`GroupGate`). Sem identidade humana em lugar nenhum — `senderName` é apenas texto de prompt consultivo (OD-11). _Compensação:_ um processo por workspace/equipe; injetar atribuição de remetente na camada do canal; manter `clientId` como limite de segurança; exigir `--require-auth` + token em qualquer daemon não-loopback (OD-12).
2. **Mensagens proativas / de canal frio não uniformes.** Apenas resposta reativa no DingTalk (`sessionWebhook` que expira); o Feishu envia livremente via `tenant_access_token`. _Compensação:_ envio proativo de grupo verificado da Fase 1 em `openConversationId` persistido (DingTalk, `canColdSend` vira true); o Feishu não precisa de nada.
3. **O agendador tem escopo de sessão, não de daemon.** O cron morre no `dispose()` na coleta de 30 min de inatividade. _Compensação:_ agendador de propriedade do gateway (§6.2) — longa duração, sobrevive à coleta, único proprietário do cron (OD-8).
4. **A memória é global do workspace, não por canal.** _Compensação:_ um processo por canal (zero código) ou o escopo `channel` da Fase 2 (OD-10).
5. **Multi-identidade / multi-tenant verdadeiro fora do escopo** (Fase 3). Modelado como multi-processo nas Fases 0–2.

### Riscos e mitigações

| #   | Risco                                                                                                                                                   | Severidade | Mitigação                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Chamadas de ferramentas da stack de canal são **auto-aprovadas** no caminho `AcpBridge` da Fase 0 (`AcpBridge.ts:108-118`) — um canal vazado executa qualquer ferramenta sem bloqueio. | Alta     | A migração para o daemon da Fase 1 comprometida traz o mediador; até lá, restringir o conjunto de ferramentas + host confiável.                                                           |
| R2  | Vazamento do token global único do daemon concede acesso total ao workspace (caminho do daemon HTTP; o caminho `AcpBridge` não tem token).                                    | Alta     | Loopback por padrão + bearer gate; `--require-auth` em não-loopback (OD-12); host confiável; rotação via reinicialização; bloquear ferramentas destrutivas atrás de `consensus` uma vez conectado. |
| R3  | O padrão `'steer'` de `dispatchMode` cancela o trabalho em andamento na mensagem de qualquer membro (o JSDoc dizia `'collect'`, agora corrigido para `'steer'`, `types.ts:42`).       | Alta     | Grupos de tag definem `'followup'`; JSDoc reconciliado (OD-5).                                                                                                             |
| R4  | Falta de atribuição de remetente → o agente confunde os falantes.                                                                                                 | Alta     | Injeção de `[senderName]` da Fase 0 para turnos de grupo (+ `alreadyPrefixed`, OD-6).                                                                                     |
| R5  | A proatividade de cold-group / webhook expirado do DingTalk falha silenciosamente (`:137-141`).                                                                         | Média   | Envio proativo de grupo verificado da Fase 1 em `openConversationId` persistido; `canColdSend` falha de forma explícita; expor degradações.                                           |
| R6  | O cron/notificação morre na coleta da sessão (30 min, `run-qwen-serve.ts:94`); também precisa de um caminho de saída (R5).                                             | Média   | Agendador de propriedade do gateway (§6.2); gate de proprietário único da OD-8.                                                                                                             |
| R7  | `requireMention` true → mensagens de grupo não mencionadas são descartadas silenciosamente (`GroupGate.ts:51-52`).                                                            | Baixa/Média  | Manter o padrão; documentar; dica opcional na primeira mensagem.                                                                                                          |
| R8  | A memória do workspace compartilhado contamina cruzadamente grupos colocalizados.                                                                                           | Média   | Um processo por canal ou escopo `channel` da Fase 2 (OD-10).                                                                                                       |
| R9  | O rate-limit é por `clientId`/IP, não por usuário (caminho do daemon); o caminho `AcpBridge` não tem nenhum.                                                                | Baixa      | Aceitável para single-tenant; a medição por usuário é a Fase 3.                                                                                                       |
| R10 | O conjunto de votantes de consenso é tirado um snapshot no momento da requisição; os membros do canal não são `clientId`s distintos hoje.                                                    | Baixa      | OD-3: `first-responder` Fase 1; resolver o mapeamento `senderId`→voto antes do consenso.                                                                                  |
| R11 | O SDK do DingTalk nunca atualiza o token de acesso de ~2 h a menos que o socket feche — proativo/emoção/mídia falham silenciosamente.                                   | Alta     | `tokenManager` de propriedade do recurso proativo, atualizando via o endpoint `oauth2/accessToken` v1.0 (§6.2, verificado).                                            |
| R12 | O disparo proativo chamando `DaemonChannelBridge.prompt()` durante um turno humano **lançaria** `Prompt already in flight` (`:257-261`).                     | Alta     | `dispatchProactive` serializa através de `sessionQueues` e aguarda `activePrompts` antes de `bridge.prompt()` — o throw-guard é estruturalmente inalcançável (Fix #1, §6.2). |
| R13 | Falso positivo de orçamento estimado poderia recusar um prompt legítimo do usuário.                                                                                | Média   | Estimativas geram apenas WARN; recusa rígida apenas no uso real do daemon (Fix #6, §6.4).                                                                                       |
| R14 | O enfileiramento `followup` atribui incorretamente chamadas de ferramentas ao remetente enfileirado mais recentemente.                                                                    | Média   | Carregar `senderId` no turno enfileirado; a auditoria lê o turno em execução (Fix #7, §6.4).                                                                               |

---

## 9. Decisões Resolvidas

Todas as Open Decisions da v1 estão resolvidas abaixo com suas respostas escolhidas. Os **únicos itens genuinamente em aberto restantes** são detalhes de baixa confiança da API do DingTalk sob a OD-7, destacados na linha final.

| ID                        | Questão                                                                                       | **Decisão**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OD-1**                  | Migrar a hospedagem do canal para o `qwen serve` na Fase 1+, ou ficar no `AcpBridge`?                | **RESOLVIDO — Migrar.** A Fase 0 é entregue no `AcpBridge`; **a Fase 1+ hospeda os canais sob o `qwen serve` via `DaemonChannelBridge` / um runner de canal do daemon**, herdando o FIFO `promptQueue`, `MultiClientPermissionMediator`, `eventBus`, `/workspace/memory` e rate-limit. A Fase 0 adiciona o caminho de attach (ou `--daemon <url>`) para que a transição seja uma etapa de configuração. O agendador do gateway (§6.2) é neutro em relação à migração. Não é mais um gate — arquitetura comprometida.                                                                                                                                                                                                                                                                                                                                                                                |
| **OD-2**                  | Unidade de deployment = um processo por workspace/canal?                                           | **RESOLVIDO — Sim.** Um processo por workspace/canal: memória por canal + isolamento de segredos, limitando o raio de explosão do token global único. Colocalizar múltiplos canais é uma preocupação da Fase 3 (precisa do escopo `channel` + governor).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **OD-3**                  | Política de permissão para uma tag multiplayer (um canal = um `clientId` do daemon)?                 | **RESOLVIDO — Fase 1: `first-responder` com um único `clientId` no nível do canal** (qualquer membro permitido resolve; atribuição granular do canal; sem mapa `senderId→clientId`). **Fase 2: `consensus`/`designated`** uma vez que exista um roster `senderId→clientId` + ciclo de vida (coleta, limites de refcount). **Auto-negar ferramentas de alto risco em turnos proativos.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-4**                  | `/clear`/`/status` com escopo de thread são de todo o canal.                                             | **RESOLVIDO — em um grupo compartilhado (thread) o `/clear` requer `confirm` e é restrito a `config.allowedUsers` quando definido** (um `/clear-channel` hifenizado não é parseável; um gate de proprietário por membro é adiado para o modelo de identidade, OD-3/OD-11); o `/status` permanece somente leitura na sessão compartilhada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-5**                  | Incompatibilidade do padrão de `dispatchMode` (JSDoc `'collect'` vs runtime `'steer'`).                      | **RESOLVIDO — Corrigir o JSDoc em `types.ts:42` para `'steer'`** (compatível com o runtime); o perfil do grupo de tag define `dispatchMode: 'followup'` explicitamente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OD-6**                  | Formato do marcador de remetente + prefixo duplo do `collect`.                                                | **RESOLVIDO — Prefixo `[senderName]` por turno, NÃO controlado por `instructedSessions`**, mais **UM novo campo opcional `Envelope` chamado `alreadyPrefixed`** (`types.ts`) para que a reentrada sintética do modo `collect` pule a reprefixação. (Corrige a afirmação da v1 de "nenhum campo novo".)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **OD-7**                  | Envio proativo do DingTalk: endpoint/permissão, equivalência de `openConversationId`, atualização de token. | **RESOLVIDO com fatos verificados (§6.2/§6.5):** endpoint `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(alto)_; corpo `{ robotCode=config.clientId, openConversationId, msgKey:'sampleMarkdown', msgParam:<JSON string {title,text}> }` _(alto)_; header de auth `x-acs-dingtalk-access-token` com um token `oauth2/accessToken` v1.0, TTL de ~7200 s, cacheado e atualizado por um `tokenManager` de propriedade do recurso _(alto)_; persistir `openConversationId` em `~/.qwen/channels/dingtalk-groups.json`; callback `conversationId`≈`openConversationId` _(médio; fallback para a API de conversão `chatId→openConversationId` em `invalid.openConversationId`)_. **Em aberto restante (baixa confiança): código/nome de exibição exato do ponto de permissão; frase oficial de equivalência literal; se o throttle de 20/min se aplica a `groupMessages/send`.** |
| **OD-8**                  | Disparo duplo de cron entre os agendadores do gateway e da sessão.                                       | **RESOLVIDO — O agendador do gateway é o ÚNICO proprietário do cron.** Uma sessão hospedada no canal (tag) **não** inicia seu cron `Session` in-session; ela descobre que é uma sessão de tag via uma flag `isTagSession` passada do host do canal na construção da sessão (pacote de opções `DaemonChannelSessionFactory` Fase 1+; uma opção de spawn `--acp` Fase 0), que pula `startCronScheduler()` (`Session.ts:667-668`). Os dois stores de cron estão em **caminhos disjuntos** (gateway `~/.qwen/channels/cron.json` vs sessão `~/.qwen/tmp/<hash>/scheduled_tasks.json`), então o único risco de colisão é executar ambos os agendadores para os mesmos jobs — eliminado pelo gate.                                                                                                                                                                                     |
| **OD-9**                  | Escopo do orçamento de token, fonte da verdade, janela.                                                   | **RESOLVIDO — Rollup de "org" por processo + janelas por canal, o mais restrito vence, janela diária fixa.** A v1 estima tokens do lado do canal (consultivo, apenas WARN — nunca recusa rigidamente, Fix #6) e lê o **caminho de uso do daemon** para débito preciso (e recusa rígida) uma vez hospedado pelo daemon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OD-10**                 | Namespacing de memória por sala + autoridade de escrita.                                                 | **RESOLVIDO — Adicionar um escopo `channel` (+`channelKey`) ao `writeContextFile.ts`; o channel-base obtém escrita/leitura via um callback da camada CLI injetado através de `ChannelBaseOptions` (`readChannelMemory`/`writeChannelMemory`) — SEM dependência `channel-base → core`.** Localização global do usuário `~/.qwen/channels/memory/`. O agente adiciona via uma intent `save_memory`; a leitura de bootstrap reutiliza o gate `instructedSessions`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **OD-11**                 | Modelo de identidade humana + durabilidade da auditoria.                                                       | **RESOLVIDO — `senderName` é apenas consultivo; `clientId` permanece como o único principal de segurança.** Atribuição de melhor esforço carregada com o turno em execução (Fix #7); **anel de auditoria FIFO em memória de 512 + um arquivo de acompanhamento append-only em `~/.qwen`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OD-12**                 | Endurecimento de token para deployments com daemon não-loopback.                                    | **RESOLVIDO — Exigir `--require-auth` + token para qualquer deployment com daemon não-loopback.** Apenas loopback é exclusivo para dev; `--require-auth` é a postura padrão documentada (`run-qwen-serve.ts` já impõe token em não-loopback).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OPEN (only remaining)** | Detalhes de baixa confiança da API do DingTalk sob a OD-7.                                                | **AINDA EM ABERTO — verificar no console / contra docs ativos antes de codificar:** (1) código/nome de exibição exato do ponto de permissão para "enviar mensagem de grupo proativamente" (baixo); (2) frase oficial autoritativa equiparando o callback `conversationId` com `openConversationId` para um robô padrão não-cool-app (médio; o caminho garantido por doc é a API de conversão `chatId→openConversationId`); (3) se o limite de "20 mensagens/minuto → ~10 min de throttle" se aplica literalmente a `groupMessages/send` (baixo/médio — documentado para robôs de webhook personalizados, não confirmado na página de envio do orgapp).                                                                                                                                                                                                                                                            |
---

## 10. Riscos e Mitigações

Consulte a tabela consolidada na §8. Os riscos críticos, em ordem de prioridade:

1. **R1 — auto-approve no caminho do canal da Fase 0.** Até que a migração do daemon da Fase 1, já comprometida, implemente o transporte mediado, um agente residente no canal executa _qualquer_ ferramenta sem proteção. Esta é a lacuna de segurança mais importante; mitigue com um conjunto de ferramentas conservador + host confiável até a Fase 1.
2. **R12 — exceção de sobreposição proativa.** Chamar `DaemonChannelBridge.prompt()` durante um turno humano lança `Prompt already in flight` (`:257-261`). Resolvido serializando através de `sessionQueues` (Fix #1) — a peça central da §6.2.
3. **R11 — expiração do token do DingTalk.** A falha do "funciona na demo, morre após 2 horas". O recurso proativo possui um `tokenManager` (endpoint v1.0 verificado, TTL de ~7200 s) antes que qualquer recurso de longa duração seja lançado.
4. **R5 — falha silenciosa em grupos frios do DingTalk.** A saída proativa para grupos inativos é impossível sem o caminho de envio verificado; `canColdSend` falha de forma explícita em vez de simplesmente descartar.
5. **R3 — cancelamento de `steer` em grupos.** Um DoS acidental multiplayer sob o padrão do runtime; o perfil de tag define `followup`.
6. **R13/R14 — falsos positivos e atribuição incorreta de budget.** Estimativas apenas WARN (Fix #6); a atribuição é carregada com o turno em execução (Fix #7).
7. **R8 — contaminação cruzada de memória compartilhada.** Um processo por canal é a mitigação sem código; o escopo `channel` é a solução colocalizada.

Cada risco mapeia para uma fase: R1/R3/R4 são Fase 0–1, R5/R6/R11/R12 são Fase 1, R8/R13/R14 e os riscos de audit/budget são Fase 2.

---

## 11. Apêndice: Índice de Arquivos e Símbolos

### Channel base (`packages/channels/base/src/`)

- `SessionRouter.ts` — `routingKey()` (`:44-60`, thread `:53`, single `:55`, user `:58`), default scope `'user'` (`:25`), `setChannelScope()` (`:40-42`), `resolve()` (`:72-92`), `getTarget()` (`:94`), `persist()`/`restoreSessions()` (`:168-244`), `PersistedEntry` (`:5-9`).
- `ChannelBase.ts` — `handleInbound()` (`:238-471`), construção do prompt (`:316-347`), chamada `bridge.prompt()` (`:425`), gates (`:240-252`), resolução de `dispatchMode` (`:353-354`), steer (`:371-379`), collect (`:361-370,445-463`), followup (`:381-383,394-470`), `activePrompts` (`:32-35,356`), `sessionQueues` (`:394,466`), `sendMessage()` abstrato (`:81`), `registerCommand()` (`:141-143`), router do construtor (`:62-64`), `ChannelBaseOptions` (`:9-22,46`), `/clear`/`/status` (`:147-217`).
- `AcpBridge.ts` — spawn `--acp` (`:53-70`), `newSession(cwd)` (`:131`), `prompt()` (`:147-180`), auto-approve `requestPermission` (`:108-118`), `AcpBridgeOptions` (`:17-21`).
- `DaemonChannelBridge.ts` — `newSession`/`loadSession` sessionScope `'thread'` (`:229,240`), conjunto de opções da factory de sessão (`:226-241`), proteção `activePrompts` / **lança `Prompt already in flight`** (`:257-261`), `cancelSession` (`:332`), `respondToPermission` (`:346-374`), eventos de permissão (`:557-633`).
- `GroupGate.ts` — `requireMention` padrão true (`:49`), membership (`:42`), mention gating (`:51-52`), cadeia de fallback (`:48`), política padrão `'disabled'` (`:13`).
- `SenderGate.ts` — `check()` + pareamento (`:42`).
- `types.ts` — `GroupConfig` (`:10-13`), `ChannelConfig` (`:27-51`), `approvalMode` (`:36`), JSDoc de `dispatchMode` corrigido para `'steer'` (`:42`), `senderName` (`:69`), novo campo `alreadyPrefixed`, `isGroup` (`:75`), `SessionTarget` (`:88-93`).

### DingTalk (`packages/channels/dingtalk/src/`)

- `DingtalkAdapter.ts` — map `webhooks` (`:84`), `sendMessage()` (`:134-170`, retorno sem webhook `:137-141`), cache de webhook (`:516-517`), `getAccessToken()` (`:172-174`), `emotionApi()` (`:188-207`, robotCode `:184`, openConversationId `:197`, anti-padrão de catch vazio `:214-216`), media robotCode (`:435`), `conversationId` de entrada (`:506`), remoção de menção (`:527-529`), `isMentioned` (`:520`), `senderName` (`:544`), `extractQuotedContext()` (`:272-298`), `chatId` (`:534`), sem `threadId` (`:541-551`).
- `proactive.ts` (novo) — `sendGroupMessage()` para `POST /v1.0/robot/groupMessages/send` (`robotCode`+`openConversationId`+`msgKey:'sampleMarkdown'`+`msgParam` string JSON), `tokenManager` (v1.0 `oauth2/accessToken`, TTL de ~7200 s, timer + refresh em 401), fallback de conversão `chatId→openConversationId`.
- `markdown.ts` — `convertTables()` (`:44-80`), `splitChunks()` (`:84-188`), `CHUNK_LIMIT=3800` (`:10`; ≤ o budget de ~5000 caracteres do `sampleMarkdown`), `extractTitle()` (`:190-195`), `normalizeDingTalkMarkdown()` (`:198-201`).
- `media.ts` — header `downloadMedia` (`:39`), body `:42`.
- SDK: `client.mjs` gettoken (`:85-87`), reconnect (`:157-163`), separação event/callback (`:14-19,35-37,58-61,241-257`); `constants.d.ts` `sessionWebhookExpiredTime` (`:13`), `robotCode` (`:19`), `TOPIC_CARD` (`:4`).

### Feishu (`packages/channels/feishu/src/`)

- `FeishuAdapter.ts` — `sendMessage()` proativo (`:622-676`, endpoint `:651`; `canColdSend = true`), `refreshToken()` (`:581-620`), modos `connect()` (`:146-176`), `updateCard()` (`:742-792`), deduplicação de ingestão (`:1633-1870`).
- `markdown.ts` — conteúdo do card schema-v2 (`:69-189`), `splitChunks()` (`:198-256`).

### Core (`packages/core/src/`)

- `memory/writeContextFile.ts` — `WriteContextFileScope` (`:80`, +`'channel'`), `WriteContextFileOptions` (`:83-97`, +`channelKey`), `resolveContextFilePath()` (`:223-240`, +branch `channel` + parâmetro `channelKey`), mutex por arquivo (`:48-57,159-162`), proteção de caminho absoluto (`:142-146`), `MAX_EXISTING_FILE_BYTES` (`:255`), modo de substituição (`:202-211`).
- `utils/cronParser.ts` — `parseCron`/`matches`/`nextFireTime` (`:104,141,168`).
- `utils/cronTasksFile.ts` — `DurableCronTask` (`:19-26`), caminho hasheado por projeto (`:1-9`).
- `Session.ts` — declarações de campo `cronQueue`/`cronProcessing` (`:667-668`), `startCronScheduler()` (`:758`, ignorado para sessões de tag conforme OD-8), limpeza de cron `dispose()` (`:790-812`), `#recordPromptTokenCount()` (`:2078-2087`), `setNotificationCallback()` (`:2638-2668`), `isIdle()` (`:777`).

### Serve / daemon (`packages/cli/src/serve/`, `packages/acp-bridge/src/`)

- `bridge.ts` — `promptQueue` FIFO por `SessionEntry` (`:232,2855,3082`), `publishWorkspaceEvent` (`:3610,3649-3675`).
- `eventBus.ts` — `BridgeEvent.data` em formato livre (`:51`), `originatorClientId` (`:60`), limites de histerese (`:101-103`), ring de replay (`:92`).
- `permissionMediator.ts` — quatro políticas + quórum de consenso (`:348,621-637`).
- `permission-audit.ts` — `PermissionAuditRing` FIFO 512 (`:128-172`), união de entradas fechadas (`:57-104`), documentação do cabeçalho antecipando uma superfície GET (`:22-25`).
- `rate-limit.ts` — token buckets por `(clientId|ip)`; `X-Qwen-Client-Id` (`:110`).
- `auth.ts` — bearer token global (`:259-266`), `createMutationGate` estrito (`:356`).
- `workspace-memory.ts` — escopos `workspace|global` (`:118-125`), mutação com autenticação estrita (`:114`), limite por escrita `MAX_MEMORY_CONTENT_BYTES` (`:79`), encaminhamento fixo de `projectRoot` (`:185-190`).

### Comandos de canal da CLI (`packages/cli/src/commands/channel/`)

- `start.ts` — `startCommand` (`:479-499`), construção `AcpBridge` (`:213,268,356,435`), `setChannelScope` (`:361-362`), `restoreSessions` (`:275,444`), `sessionsPath()` (`:56-58`), `checkDuplicateInstance()` (`:170-179`), handler de desconexão (`:241,403`); caminho de attach do daemon da Fase 1+; injeção na camada da CLI de `readChannelMemory`/`writeChannelMemory`.
- `config-utils.ts` — `parseChannelConfig()` (`:81-100`, sessionScope padrão `:91-92`, approvalMode `:94`, groupPolicy `:98`), `resolveEnvVars()` (`:6-18`).
- `channel-registry.ts` — `ensureBuiltins()` (`:6-32`), tipos de canal (`:10-14`).