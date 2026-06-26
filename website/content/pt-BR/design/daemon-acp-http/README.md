# Daemon ACP-over-HTTP → Transporte HTTP Streamable Oficial do ACP

> Alvo `daemon_mode_b_main`. Branch: `feat/daemon-acp-http-streamable`.
> Autor: arnoo.gao. Data: 2026-05-24. Status: **Design v1 → implementação**.
> Workflow de design-first por repositório: este documento é enviado antes/junto com o PR de implementação para que o contrato de transporte seja revisável.

---

## 0. TL;DR

O daemon (`qwen serve`) atualmente fala um dialeto **REST + SSE personalizado** para clientes web/SDK, enquanto fala **ACP JSON-RPC real sobre stdio** para o processo filho `qwen --acp` gerado. Esta proposta adiciona um **segundo transporte northbound** que implementa o **transporte HTTP Streamable oficial do ACP** (RFD #721) em um único endpoint `/acp`, para que qualquer cliente nativo ACP (Zed, Goose, SDKs futuros) possa conduzir o daemon diretamente sobre o protocolo padrão — sem necessidade de conhecimento REST específico do qwen.

**Decisão: transporte duplo, aditivo.** O novo endpoint `/acp` é montado junto com a superfície REST existente, reutilizando o mesmo `HttpAcpBridge` + `EventBus` por baixo. A API REST _não_ é removida. Racional na §6.

**Decisão: namespace de extensão = `_qwen/…`** (prefixo de sublinhado simples, a forma reservada pela especificação ACP para métodos personalizados) para recursos do daemon que não possuem método ACP padrão (troca de modelo, introspecção de workspace, heartbeat, política de permissão multi-cliente, ajuste de backpressure SSE). Racional na §5.

Uma implementação de referência completa e executável localmente acompanha este PR (`packages/cli/src/serve/acp-http/`) mais um harness de verificação (`scripts/acp-http-smoke.mjs`).

---

## 1. Background — o que "ACP sobre HTTP" significa hoje

Três camadas (verificadas no commit `0c0430939`):

```
┌──────────────┐  REST + SSE personalizado (HTTP/1.1)  ┌────────────┐  ACP JSON-RPC   ┌──────────────┐
│ cliente web  │ ────────────────────────────────────► │  qwen      │  (stdio NDJSON) │ qwen --acp   │
│ / SDK        │ ◄─── GET /session/:id/events ──────── │  serve     │ ◄─────────────► │ filho (Agent)│
│ (cliente ACP)│       (text/event-stream)             │  (daemon)  │  ndJsonStream   │              │
└──────────────┘                                       └────────────┘                 └──────────────┘
        northbound: NÃO é fio ACP                          ponte            southbound: ACP real
```

### 1.1 Northbound (cliente ↔ daemon) — personalizado, hoje

- Aplicativo Express 5 em `packages/cli/src/serve/server.ts` (~30 rotas).
- Verbos REST discretos, **não** JSON-RPC:
  - `POST /session` (criar), `POST /session/:id/prompt` (prompt), `POST /session/:id/cancel` (cancelar),
    `POST /session/:id/load|resume` (carregar/retomar), `POST /session/:id/model` (modelo),
    `POST /session/:id/permission/:requestId` (permissão), `POST /session/:id/heartbeat` (batimento cardíaco),
    `DELETE /session/:id` (excluir), além de `/workspace/*`, `/capabilities`, `/health`.
- Streaming servidor→cliente: `GET /session/:id/events` → `text/event-stream`.
  - Quadros: `id: <n>\nevent: <type>\ndata: <json>\n\n` (`server.ts:formatSseFrame`, ~2626).
  - Por sessão **`id` monotônico** + retomada `Last-Event-ID` suportada por um `EventBus` de buffer circular (`acp-bridge/src/eventBus.ts`).
  - Tipos de evento: `session_update`, `client_evicted`, `slow_client_warning`, `state_resync_required`, `stream_error`, …
- Auth: `Authorization: Bearer <token>` (`serve/auth.ts`), negação CORS + lista de permissão de hosts.
- Backpressure: cadeia de escrita serializada por conexão + comentários de heartbeat de 15 s.

### 1.2 Southbound (daemon ↔ filho) — já ACP

- `acp-bridge/src/spawnChannel.ts` gera `qwen --acp`, envolve stdin/stdout com `ndJsonStream` do `@agentclientprotocol/sdk` (`^0.14.1`).
- `acp-bridge/src/bridge.ts:729` `new ClientSideConnection(() => client, channel.stream)` — o daemon é o **cliente** ACP, o filho é o **agente** ACP.
- Métodos de extensão já em uso nesta perna: `unstable_setSessionModel`, `unstable_resumeSession`, `unstable_listSessions` (`acp-integration/acpAgent.ts`).

### 1.3 Por que migrar o northbound

- Cada cliente (webui, TS SDK, Java SDK, Python SDK, companion VSCode) reimplementa o mapeamento REST personalizado. Um endpoint padrão ACP permite que editores nativos ACP se conectem sem nenhum código específico do qwen.
- Alinha a superfície remota do daemon com o protocolo que ele já fala internamente.

---

## 2. Alvo: ACP Streamable HTTP (RFD #721)

RFD **Rascunho** mesclado (`agentclientprotocol/agent-client-protocol#721`, mesclado em 2026-04-22). Ainda não normativo; ainda não em nenhum SDK. Implementamos de acordo com o design de fio do RFD.

### 2.1 Endpoint e verbos (único `/acp`)

| Verbo          | Comportamento                                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /acp`    | Enviar JSON-RPC. `initialize` → **`200`** + corpo JSON (capabilities) e define `Acp-Connection-Id`. Todas as outras solicitações/notificações → **`202 Accepted`**, corpo vazio; a _resposta_ (se houver) é entregue no stream SSE de longa duração correspondente. |
| `GET /acp`     | Abrir um stream **SSE** de longa duração. (`Upgrade: websocket` → WebSocket; **adiado**, veja §7.)                                                                                                                                                   |
| `DELETE /acp`  | Encerrar a conexão → `202`.                                                                                                                                                                                                                           |
### 2.2 Streams de longa duração em dois níveis

- **Stream com escopo de conexão**: `GET /acp` com cabeçalho `Acp-Connection-Id`, sem cabeçalho de sessão. Carrega respostas de nível de conexão (`session/new`, `session/load`, `authenticate`) e notificações de nível de conexão.
- **Stream com escopo de sessão**: `GET /acp` com `Acp-Connection-Id` **e** `Acp-Session-Id`. Carrega notificações `session/update`, **requisições agente→cliente** (`session/request_permission`, `fs/read_text_file`, …) e respostas a POSTs de sessão (`session/prompt`, `session/cancel`).

### 2.3 Identidade (3 camadas)

- `Acp-Connection-Id` (cabeçalho HTTP) — vínculo de transporte, criado no `initialize`.
- `Acp-Session-Id` (cabeçalho HTTP) — obrigatório em GET com escopo de sessão e POSTs de sessão.
- `sessionId` (parâmetro JSON-RPC) — dentro dos parâmetros do método (deve corresponder ao cabeçalho).

### 2.4 Divergências do MCP StreamableHTTP

ACP usa **streams de longa duração** (não SSE por requisição), **dois** cabeçalhos de ID (conexão vs sessão), `202`-para-não-initialize, HTTP/2 obrigatório, WebSocket obrigatório para cliente. Pegamos emprestado o esqueleto de endpoint único + POST/GET-SSE + cabeçalho de sessão, mas adaptamos ao modelo de longa duração com dois IDs. **Não** reutilizamos o `StreamableHTTPServerTransport` do `@modelcontextprotocol/sdk` (seu modelo de stream por requisição e único `Mcp-Session-Id` não se adequam).

### 2.5 Métodos padrão (confirmados do esquema atual)

- Requisições Cliente→Agente: `initialize`, `authenticate`, `session/new`, `session/load`, `session/prompt`, `session/resume`, `session/close`, `session/list`, `session/set_mode`, `session/set_config_option`, `logout`.
- Notificação Cliente→Agente: `session/cancel`.
- Requisições Agente→Cliente: `fs/read_text_file`, `fs/write_text_file`, `session/request_permission`, `terminal/create|output|wait_for_exit|kill|release`.
- Notificação Agente→Cliente: `session/update`.

---

## 3. Arquitetura do novo transporte

O daemon deve apresentar uma **superfície ACP Agent sobre HTTP** no sentido norte, enquanto permanece um **cliente** ACP para o filho no sentido sul. A camada `/acp` é, portanto, um **roteador JSON-RPC** que termina o transporte HTTP e faz a ponte para o `HttpAcpBridge` existente.

```
            POST /acp (requisições/respostas/notificações JSON-RPC)
cliente  ──────────────────────────────────────────────►  ┌───────────────────────────┐
(editor)                                                  │  AcpHttpTransport         │
        ◄── GET /acp  (SSE com escopo de conexão) ─────  │  - registro de conexão    │
        ◄── GET /acp  (SSE com escopo de sessão) ───────  │  - correlação de id JSON-RPC│
                                                          │  - despacho de métodos    │
                                                          └────────────┬──────────────┘
                                                                       │ reutiliza
                                                          ┌────────────▼──────────────┐
                                                          │  HttpAcpBridge + EventBus  │  (inalterado)
                                                          └────────────┬──────────────┘
                                                                       │ ACP stdio (inalterado)
                                                                 qwen --acp child
```

### 3.1 Novo layout de módulos (`packages/cli/src/serve/acp-http/`)

| Arquivo                   | Responsabilidade                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                | `mountAcpHttp(app, bridge, opts)` — registra as rotas `/acp` no aplicativo Express existente.                                                                                                       |
| `connection-registry.ts`  | `Acp-Connection-Id` → `AcpConnection` (escritor SSE da conexão, `Map<sessionId, SessionStream>`, requisições agente→cliente pendentes por id JSON-RPC, alocador de id monotônico). Limpeza por TTL + DELETE. |
| `json-rpc.ts`             | Auxiliares de análise/validação/serialização JSON-RPC 2.0; códigos de erro (`-32600` etc.); guarda do namespace `_qwen/`.                                                                                |
| `dispatch.ts`             | Mapeia métodos JSON-RPC de entrada → chamadas `HttpAcpBridge`. Mapeia eventos `BridgeEvent` → quadros JSON-RPC de saída. A tabela de tradução (§4).                                                         |
| `sse-stream.ts`           | Escritor SSE de longa duração (reutiliza o padrão de backpressure/heartbeat de `server.ts`). Distinto do REST `/events` (enquadramento diferente: objetos JSON-RPC completos, não envelopes de evento qwen). |

Nenhuma alteração em `bridge.ts` / `eventBus.ts` (apenas consumidor aditivo).

### 3.2 Ciclo de vida da conexão e da sessão

1. `POST /acp {initialize}` → cria `connectionId`, cria `AcpConnection`, responde `200` com `{protocolVersion, agentCapabilities, _meta:{qwen:{…}}}` + cabeçalho `Acp-Connection-Id`.
2. Cliente abre `GET /acp` (escopo de conexão) portando `Acp-Connection-Id`.
3. `POST /acp {session/new}` → `202`; daemon chama `bridge.createSession(...)`; envia a resposta JSON-RPC (com `sessionId`) pelo stream de **conexão**.
4. Cliente abre `GET /acp` (escopo de sessão) com `Acp-Connection-Id`+`Acp-Session-Id`; daemon `bridge.subscribeEvents(sessionId)` e canaliza quadros traduzidos.
5. `POST /acp {session/prompt}` → `202`; `bridge.sendPrompt(...)`; notificações `session/update` fluem ao vivo no stream de sessão; a **resposta** final do prompt (`{id, result:{stopReason}}`) é enviada no stream de sessão quando se estabiliza.
6. Uma requisição agente→cliente (ex.: `session/request_permission`) é emitida como uma **requisição** JSON-RPC no stream de sessão com um id alocado pelo daemon; o cliente responde via `POST /acp {id, result}`; `dispatch` a resolve através da API de permissão da bridge.
7. `DELETE /acp` (ou fechamento do stream de conexão + TTL) derruba sessões/assinaturas.
## 4. Tabela de tradução (bridge ⇄ ACP/HTTP)

### 4.1 Entrada (POST do cliente → bridge)

| Método ACP                                   | Chamada bridge                                          | Roteado para                           |
| --------------------------------------------- | ------------------------------------------------------- | -------------------------------------- | ----------------- |
| `initialize`                                  | (nenhuma; capacidades de `capabilities.ts`)             | inline `200`                           |
| `authenticate`                                | provedor de autenticação existente (`serve/auth/*`)     | stream da conexão                      |
| `session/new`                                 | `bridge.createSession`                                  | stream da conexão                      |
| `session/load` / `session/resume`             | `bridge.restoreSession('load'                           | 'resume')`                             | stream da conexão |
| `session/prompt`                              | `bridge.sendPrompt`                                     | stream da sessão (adiado até estabilizar) |
| `session/cancel` (notif)                      | `bridge.cancel`                                         | —                                      |
| `session/list`                                | `bridge.listSessions` (`unstable_listSessions`)         | stream da conexão                      |
| `session/set_mode`                            | lógica de rota do modo de aprovação                     | stream da sessão                       |
| JSON-RPC **resposta** (para req agente→cliente)| resolver pendente (§4.3)                               | —                                      |
| `_qwen/session/set_model`                     | `bridge.setSessionModel` (`unstable_setSessionModel`)   | stream da sessão                       |
| `_qwen/workspace/list` etc.                   | rotas de introspecção do workspace                      | stream da conexão                      |
| `_qwen/session/heartbeat`                     | `bridge.heartbeat`                                      | stream da conexão                      |

### 4.2 Saída (BridgeEvent → JSON-RPC na stream da sessão)

| Tipo BridgeEvent                                                   | Emitido como                                                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `session_update`                                                   | notificação `{method:"session/update", params:<data>}`                |
| solicitação de permissão                                            | requisição `{id:<n>, method:"session/request_permission", params}`    |
| `client_evicted` / `slow_client_warning` / `state_resync_required` | notificação `{method:"_qwen/notify", params:{kind,…}}`                |
| `stream_error`                                                     | resposta de erro JSON-RPC no id do prompt ativo (ou `_qwen/notify`)   |
| estabilização de prompt                                            | `{id:<promptId>, result:{stopReason}}`                                |

### 4.3 Requisições pendentes agente→cliente

`AcpConnection` mantém um `Map<jsonRpcId, {sessionId, kind, bridgeRequestId, resolve}>`. Quando o cliente faz POST de um objeto de resposta JSON-RPC, `dispatch` encontra o `id` e então chama o caminho de resolução da bridge (por exemplo, o equivalente interno de permissão `POST /session/:id/permission/:requestId`).

> **Status v1:** apenas o round-trip agente→cliente de `session/request_permission` está implementado. O encaminhamento agente→cliente de `fs/*` e `terminal/*` está **adiado** (§7) — o daemon ainda não anuncia a negociação de capacidades do cliente `fs`/`terminal` via `/acp`, portanto, clientes ACP não devem assumir semânticas de sistema de arquivos/terminal sobre este transporte na v1. O estado final pretendido (encaminhar `fs/*` para o cliente; recorrer ao sistema de arquivos do workspace do daemon quando o cliente não tiver a capacidade `fs`) é o acompanhamento descrito na §7.

---

## 5. Estratégia de extensão (requisito #2)

ACP reserva qualquer método começando com `_` para extensões personalizadas e fornece `_meta` em todos os tipos. A perna sul (southbound) do código já usa nomes de método `unstable_*`.

**Escolha northbound:** nomes de método com namespace do fornecedor **`_qwen/<area>/<verb>`** (prefixo `_` compatível com a especificação). Capacidades anunciadas em `agentCapabilities._meta.qwen` no `initialize` para que os clientes façam detecção de recursos antes do uso.

| Necessidade                                                    | Sem método ACP padrão? | Extensão                                               |
| ------------------------------------------------------------- | ---------------------- | ------------------------------------------------------ |
| Troca de modelo                                               | sim                    | `_qwen/session/set_model`                              |
| Introspecção de MCP/skills/providers/env do workspace         | sim                    | `_qwen/workspace/list`, `_qwen/workspace/<area>`       |
| Heartbeat / última visualização                               | sim                    | `_qwen/session/heartbeat`                              |
| Política de permissão multi-cliente (consenso/designado)      | parcial                | `session/request_permission` + `_meta.qwen.policy`     |
| Ajuste de contrapressão SSE (`maxQueued`)                     | sim                    | Cabeçalho `Acp-Qwen-Max-Queued` no GET da sessão       |
| Cursor de retomada (ring `Last-Event-ID`)                     | RFD Phase 4            | Cabeçalho `Last-Event-ID` + `_meta.qwen.eventId` nos frames |
Métodos padrão nunca são renomeados; extensões são estritamente aditivas e ignoráveis.

---

## 6. Transporte duplo vs. substituição (requisito #4)

**Decisão: transporte duplo (aditivo).**

- O transporte oficial é um **Draft** RFD, não normativo e ausente em todos os SDKs —
  uma substituição direta nos acoplaria a um design não ratificado e quebraria o webui + 3 SDKs +
  o VSCode companion de uma só vez.
- A superfície REST possui funcionalidades sem um mapeamento ACP limpo ainda (introspecção
  de workspace, mediação de permissão multi-cliente, retomada com ring-buffer, registro de
  capacidades). Elas degradam para extensões `_qwen/*` em `/acp`, mas a superfície REST
  permanece autoritativa até que o RFD seja ratificado.
- Ambos os transportes compartilham uma **única** instância `HttpAcpBridge` + `EventBus`,
  então não há duplicação de estado — `/acp` e `/session/*` podem até conduzir a mesma
  sessão ativa simultaneamente (o bridge já suporta multi-cliente).
- Alternância (v1, já enviada): ativada por padrão; `QWEN_SERVE_ACP_HTTP=0` desabilita o
  ponto de montagem. Uma flag de CLI `--no-acp-http` e uma tag `acp_http` em `/capabilities`
  para detecção de funcionalidade pelo cliente são **adiadas** para um follow-up (não na
  v1) — até lá, os clientes detectam o transporte sondando `POST /acp {initialize}`.

Caminho de migração: uma vez que o RFD seja ratificado e os SDKs enviados, as rotas REST
podem ser reformuladas como um shim de compatibilidade fino sobre `/acp` (PR separado,
posterior).

---

## 7. Escopo do PR de implementação

**No escopo (executável e verificado localmente):**

- Despacho de `POST /acp` para `initialize`, `session/new`, `session/prompt`,
  `session/cancel`, `session/load`, tratamento de resposta JSON-RPC.
- Streams SSE `GET /acp` com escopo de conexão + escopo de sessão, com enquadramento JSON-RPC.
- Streaming de `session/update` + correlação da resposta final do prompt.
- Round-trip agente→cliente de `session/request_permission`.
- Extensão `_qwen/session/set_model` como exemplo trabalhado do #2.
- Reutilização de autenticação Bearer + lista de permissões de host (mesmo middleware do REST).
- Testes unitários (`acp-http/*.test.ts`) + script de smoke driver preto real que dirige um daemon real.

**Adiado (documentado, não construído agora):**

- Caminho de atualização WebSocket (capacidade de cliente exigida pelo RFD; SSE é suficiente
  para verificação local).
- Multiplexação HTTP/2 (executamos HTTP/1.1; POST e GET de longa duração usam sockets
  separados, o que funciona para clientes CLI/Node e navegadores com ≤6 conexões). Divergência
  documentada.
- Encaminhamento completo agente→cliente de `fs/*` + `terminal/*` (o caminho de permissão
  prova o mecanismo; o restante é follow-up mecânico).
- Paridade de robustez de retomabilidade SSE com o ring buffer (Fase 4 no RFD).

---

## 8. Plano de verificação local

1. `npm run build` (ou build do workspace de `cli` + `acp-bridge`).
2. Iniciar daemon: `qwen serve --listen 127.0.0.1:0 --token <t>` (ou token de ambiente).
3. Executar `node scripts/acp-http-smoke.mjs`:
   - `POST /acp {initialize}` → afirmar `200` + `Acp-Connection-Id`.
   - Abrir SSE de conexão; `POST {session/new}` → afirmar resposta no stream.
   - Abrir SSE de sessão; `POST {session/prompt:"say hi"}` → afirmar ≥1 `session/update`
     e depois um `{result:{stopReason}}` final.
   - Disparar uma ferramenta que precise de permissão → afirmar requisição
     `session/request_permission`, POST de uma resposta de concessão → afirmar conclusão do prompt.
   - `POST {_qwen/session/set_model}` → afirmar troca de modelo + `session/update`.
4. Vitest: `acp-http/*.test.ts` verde.

---

## 9. Riscos

| Risco                                 | Mitigação                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Mudanças no RFD antes da ratificação  | Atrás de tag de capacidade + namespace `_qwen`; módulo isolado; fácil de revisar. |
| HTTP/1.1 vs. HTTP/2 exigido           | Clientes localhost/CLI não afetados; documentado; h2 é uma troca de transporte posterior. |
| Dois transportes em um bridge com corrida | Bridge já suporta multi-cliente; reutiliza seu travamento.                    |
| Encaminhamento `fs/*` vs. FS local do daemon | Controlado por capacidade: encaminha quando o cliente declara `fs`, senão local. |

---

## 10. Log de implementação e verificação (v1)

Implementado em `packages/cli/src/serve/acp-http/` (`json-rpc.ts`, `sse-stream.ts`,
`connection-registry.ts`, `dispatch.ts`, `index.ts`), montado a partir de `server.ts`
via `mountAcpHttp(app, bridge, { boundWorkspace })`.

### Automatizado (`packages/cli/src/serve/acp-http/*.test.ts`)

`transport.test.ts` inicializa um servidor Express real + o `mountAcpHttp` real sobre
um bridge falso controlável e o dirige com `fetch` + análise manual de SSE.
15 testes verdes, cobrindo: `initialize` 200 + `Acp-Connection-Id`; conn-desconhecida
400; resposta de `session/new` no stream da conexão; prompt → stream `session/update`
+ correlação do resultado final; round-trip agente→cliente→agente de
`session/request_permission`; `_qwen/session/set_model`; método não encontrado;
desmontagem via `DELETE`.

### Daemon ao vivo (modelo real)

Inicializado `qwen serve --port 8767 --token … --workspace …` (entrada do bundle para que o
filho `qwen --acp` gerado seja autocontido) e executado `scripts/acp-http-smoke.mjs`:

```
✓ initialize: connectionId=… protocolVersion=1
✓ session/new: sessionId=…
→ prompt: "Reply with the single word: pong"
pong
✓ prompt complete: 10 session/update frames, stopReason=end_turn
✓ DELETE /acp — connection closed
ALL CHECKS PASSED ✅
```
O caminho de erro também foi confirmado ao vivo: quando o filho falhou ao iniciar, o timeout da bridge
apareceu para o cliente como um frame de erro JSON-RPC no stream da conexão
(`{"id":2,"error":{"code":-32603,…}}`), comprovando a correlação de id + a
divisão 202/SSE sob falha.

### Revisão incorporada — clientId emitido pela bridge (encontrado na verificação ao vivo)

A primeira execução ao vivo falhou em `session/prompt` com _"client id … is not registered for
session"_. Causa raiz: `spawnOrAttach`/`loadSession` **ignoram** um clientId fornecido pelo chamador
que a bridge nunca emitiu e geram um novo (retornado em
`BridgeSession.clientId`); o dispatcher estava ecoando o próprio id (não registrado) da conexão em
`sendPrompt`. Correção: persistir o id emitido pela bridge no
`SessionBinding` e ecoá-lo em toda chamada por sessão (`sessionCtx`). Re-verificado
verde acima.

---

## 11. Rodada de revisão 2 — incorporações

Duas revisões independentes (corretude/concorrência + conformidade de protocolo/segurança) mais uma auto-leitura.
Todas as correções verificadas pelo conjunto de testes vitest expandido (**18 testes**) + uma nova execução de teste ao vivo
(21 frames `session/update` → `stopReason=end_turn`).

| #   | Gravidade | Descoberta                                                                                                                                                                                                                                           | Correção                                                                                                                                                                                    |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P0**   | **Reconexão do stream de sessão estava permanentemente morta**: `SessionBinding.abort` foi criado uma vez e reutilizado; ao fechar o stream, ele era abortado para sempre, então uma reconexão `subscribeEvents(signal)` recebia um sinal já abortado e não recebia eventos. | `attachSessionStream` agora instala um **novo** `AbortController` por stream (e fecha qualquer stream anterior); `index.ts` bombeia a partir desse novo sinal.                                      |
| R2  | **P0**   | `await dispatcher.handle()` executava **após** `res.end(202)`; uma chamada de bridge que lançava exceção (notavelmente o caminho `isResponse` sem try/catch) rejeitaria e apareceria como uma rejeição não tratada → possível crash do daemon.                                        | Envolveu o caminho `isResponse` em try/catch; `.catch()` no `handle(...)` aguardado e no `pumpSessionEvents(...)`.                                                                   |
| R3  | **P1**   | **Nenhuma propriedade de sessão para conexão**: qualquer conexão autenticada poderia abrir o SSE da sessão, ou _prompt_, em _qualquer_ sessionId do workspace (ouvir bisbilhotando; o prompt só era bloqueado incidentalmente pelo erro de clientId não registrado).          | `AcpConnection.ownedSessions` populado por `session/new`/`load`/`resume`; o stream de sessão retorna `403` e os POSTs por sessão retornam `INVALID_PARAMS` para ids não pertencentes (`requireOwned`). |
| R4  | **P1**   | O handle `mountAcpHttp` era descartado → timer de varredura TTL + streams SSE ao vivo vazavam no desligamento.                                                                                                                                                      | Handle estacionado em `app.locals`; o hook de fechamento `runQwenServe` chama `dispose()` antes de `bridge.shutdown()` (espelha o registry de device-flow).                                              |
| R5  | **P1**   | **Vazamento de permissão pendente**: fechar uma sessão/conexão com uma permissão pendente deixava a bridge bloqueada aguardando um voto.                                                                                                                 | `closeSessionStream`/`destroy` cancelam requisições pendentes correspondentes através de um `onAbandonPending` injetado → `cancelAbandonedPermission`.                                                      |
| R6  | **P1**   | Buffers de frame pré-attach (`connBuffer`/`binding.buffer`) eram ilimitados.                                                                                                                                                                          | Limitados a 256 frames (descartar o mais antigo), igual ao `maxQueued` do EventBus.                                                                                                                 |
| R7  | **P2**   | `initialize` ignorava o `protocolVersion` solicitado pelo cliente.                                                                                                                                                                                    | Negocia `min(requested, 1)`.                                                                                                                                                        |
| R8  | **P2**   | Sem verificação cruzada de `Acp-Session-Id` ↔ `params.sessionId` (RFD §2.3).                                                                                                                                                                                 | POST verifica se concordam; divergência → `INVALID_PARAMS`.                                                                                                                                  |
| R9  | **P2**   | O formulário de requisição `session/cancel` (com id) nunca era respondido; `_meta.qwen` duplicado no nível superior.                                                                                                                                                         | Responder quando um id está presente; único `agentCapabilities._meta.qwen`.                                                                                                                                            |
### Aceito / documentado (não corrigido na v1)

- **Ordenação prompt-result vs `session/update` consecutivos** (P2): `handlePrompt` aguarda `sendPrompt` e então
  escreve o frame de resultado, enquanto as atualizações fluem concorrentemente. Na prática, a ponte publica todas
  as `session/update`s no barramento antes de `sendPrompt` resolver e ambas compartilham uma cadeia ordenada de
  escrita SSE, então o resultado chega por último (confirmado: 21 atualizações depois o resultado). Uma barreira
  estrita é um possível endurecimento futuro se um redutor de cliente se mostrar sensível.
- **`EventSource` do navegador não pode definir `Authorization`** — os streams GET `/acp` exigem o cabeçalho bearer,
  então navegadores precisam do caminho WebSocket adiado (§7); clientes CLI/Node não são afetados.
- A verdadeira fronteira de confiança do daemon continua sendo o **token bearer + vínculo de workspace único** (assim como a
  superfície REST); a verificação de propriedade da R3 é defesa em profundidade + correção contratual, não um limite de locatário.

---

## 12. Revisão da rodada 3 — integrações do bot de PR (#4472)

Dois revisores automatizados de PR mais o bot de resumo.
Todas as correções verificadas pelo conjunto (agora **22 testes**) + uma execução ao vivo recente (16 `session/update` → `end_turn`).

| #   | Gravidade | Constatação                                                                                                                                                                                                                                  | Correção                                                                                                                                                                     | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| B1  | **P0**   | O `AbortController` de `handlePrompt` nunca era abortado — um cliente desconectando/cancelando deixava o agente rodando (queimava cota de modelo, bloqueava o FIFO da sessão). Sinalizado por ambos os bots + 5 sub-agentes.                                        | `promptAbort` armazenado em `SessionBinding`; abortado por `session/cancel` e pela desconexão de sessão/conexão (`closeSessionStream`/`destroy`).                                  |
| B2  | **P0**   | `sessionCtx` sem `fromLoopback` — todo voto de permissão ACP tratado como remoto; a política `local-only` rejeitaria clientes loopback.                                                                                                       | Captura loopback em `initialize` (endereço remoto do kernel, não cabeçalhos forjáveis) → `AcpConnection.fromLoopback` → passado por `sessionCtx`.                            |
| B3  | **P0**   | Falhas de escrita SSE engolidas silenciosamente → streams zumbi (heartbeats disparam, zero eventos entregues, sem logs).                                                                                                                   | A primeira falha de escrita é logada + fecha o stream.                                                                                                                               |
| B4  | **P0**   | Varredura ociosa destruía conexões sem log + sem limite de conexões (inundação de initialize).                                                                                                                                                        | Varredura loga cada remoção; `pumpSessionEvents` chama `touch()` (prompts longos silenciosos não são removidos); limite `maxConnections` (64) → `503`.                                            |
| B5  | **P1**   | `sessionCtx` silenciosamente recorria ao clientId não registrado da conexão quando o vínculo não tinha um (não testado, sempre disparado em `FakeBridge`).                                                                                             | Lançar exceção ao faltar clientId carimbado (violação de invariante); `FakeBridge` agora carimba um.                                                                                       |
| B6  | **P1**   | `session/new` \| `load` \| `resume` `accepted` `cwd` não validado (REST valida string/comprimento/absoluto — amplificação DoS). | `parseOptionalWorkspaceCwd` compartilhado (string, ≤4096, absoluto). |
| B7  | **P1**   | `session/prompt` encaminhava um `prompt` não validado para a ponte.                                                                                                                                                                           | `validatePrompt` (array não vazio de objetos), espelhando REST.                                                                                                              |
| B8  | **P1**   | Mensagens de erro brutas da ponte ecoadas para o cliente.                                                                                                                                                                                             | `toRpcError` mapeia erros conhecidos da ponte para formas codificadas e seguras ao cliente; desconhecido → `Internal error` genérico (detalhes completos ainda no stderr).                                       |
| B9  | **P1**   | `nextId` usava negativos sequenciais — um cliente usando ids negativos legalmente poderia colidir em `pending`.                                                                                                                                        | Ids originados no daemon agora são strings (`_qwen_perm_N`), disjuntas de qualquer id de cliente.                                                                                        |
| B10 | **P2**   | `resolveClientResponse` parâmetro não incluía `JsonRpcError`; stream SSE de escopo de conexão não tinha `onClose`; `DELETE` sem cabeçalho era um 202 silencioso; `SseStream.close` executava `onClose` fora de try/catch; `session/load`·`resume`·`close` não testados. | Parâmetro ampliado para `JsonRpcResponse`; stream de conexão loga ao fechar; `DELETE` sem cabeçalho → `400`; `onClose` encapsulado em try/catch; adicionados testes de load/resume/close + DELETE-400. |
Fora do escopo (branch base `daemon_mode_b_main`, não este diff) — o segundo revisor sinalizou erros de typecheck em `acpAgent.ts` (`entryCount`/`entrySummary`/`sessionClose`) e outros itens pré-existentes que ele atribuiu explicitamente à branch base (introduzidos por #4353). Rastreado separadamente; não alterado aqui.

**Ainda adiado** (documentado): segredo por conexão para `DELETE`/propriedade da conexão (o token continua sendo o limite); WebSocket + HTTP/2 (§7); barreira estrita entre resultado de prompt e atualização posterior (§11).

---

## 13. Rodada de revisão 4 — incorporações do PR (rebaseada sobre #4469)

Branch rebaseada sobre `daemon_mode_b_main` (#4353 + #4469) — **limpa, sem conflitos**. Dois revisores de PR (GPT-5 + qwen3.7-max). Suíte agora com **25 testes**; reverificado ao vivo (125 `session/update` → `end_turn`).

| #   | Gravidade | Achado                                                                                                                                                                                     | Correção                                                                                                                                                                                           |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **P0**    | O tratamento de falha de escrita SSE da Rodada 3 foi documentado mas NÃO implementado — `SseStream` ainda deixava a responsabilidade para os chamadores descartarem (streams zumbis).      | `writeRaw` agora assume a responsabilidade: primeira rejeição de escrita registra uma vez + executa `close()`; `doWrite` também escuta `'error'` (rejeita prontamente em vez de esperar até `'close'`); `onClose` envolvido em try/catch. |
| C2  | **P1**    | `fromLoopback` capturado apenas na `initialize` + auxiliar mais restrito que REST → votos `local-only` de um POST posterior mal julgados.                                                   | Loopback por requisição passado através de `handle`→`sessionCtx`/`resolveClientResponse`; `isLoopbackReq` ampliado para `127.0.0.0/8` + `::ffff:127.*` + `::1` (igual ao REST).                    |
| C3  | **P1**    | Roteamento de erros inferia stream a partir de `params.sessionId` → falhas de métodos com escopo de conexão (`session/load`/`resume`/`close`/`heartbeat`) eram roteadas erroneamente para um stream de sessão inexistente (perda silenciosa). | Conjunto `CONN_ROUTED_METHODS`; erros roteados da mesma forma que o caminho de sucesso.                                                                                                            |
| C4  | **P1**    | `bridge.detachClient` nunca chamado na finalização → IDs de cliente antigos com carimbo da bridge permanecem em `knownClientIds()`/conjuntos de votantes.                                  | O registry recebe um `DetachSessionFn`; `closeSessionStream`/`destroy` desanexam cada sessão possuída (melhor esforço).                                                                            |
| C5  | **P1**    | `session/close` pulava a limpeza local se `bridge.closeSession` lançasse exceção.                                                                                                          | `closeSessionStream` movido para um `finally`.                                                                                                                                                     |
| C6  | **P2**    | `cwd` do Windows (`C:\…`) rejeitado pelo `startsWith('/')`.                                                                                                                                | `path.isAbsolute` (ciente da plataforma), igual ao REST.                                                                                                                                           |
| C7  | **P2**    | `protocolVersion` podia negociar `0`/negativo.                                                                                                                                             | Limitar com `Math.max(1, Math.min(requested, 1))`; testes para 0/neg/grande/inválido.                                                                                                             |
| C8  | **P2**    | `session/load`/`resume` aceitavam `sessionId` vazio.                                                                                                                                       | Rejeitar vazio com `INVALID_PARAMS`.                                                                                                                                                               |
| C9  | **P2**    | Erros no formato de notificação de `session/prompt` desapareciam silenciosamente.                                                                                                          | Registrar no caminho sem ID.                                                                                                                                                                       |
| C10 | **P2**    | SSE de sessão liberava quadros em buffer antes dos cabeçalhos/`retry:`.                                                                                                                     | `open()` antes de `attachSessionStream`.                                                                                                                                                           |
| C11 | **P2**    | `logStderr` local duplicado.                                                                                                                                                               | `writeStderrLine` compartilhado de `utils/stdioHelpers`.                                                                                                                                           |
| C12 | **P2**    | A documentação anunciava a flag `--no-acp-http`, a tag de capacidade `acp_http` e o encaminhamento `fs/*` que não estão na v1.                                                              | Documentação alinhada à superfície entregue (apenas toggle por env-var; `fs/*`+`terminal/*` + flag + tag marcados como adiados).                                                                   |
Ainda adiado (inalterado): WebSocket + HTTP/2; segredo por conexão para `DELETE`/propriedade
(token + workspace único permanece como limite); barreira rígida de ordenação prompt-resultado; os
casts `as never` de limite da ponte (direcionados, observados para um acompanhamento de tipos adaptadores).

---

## 14. Rodada de revisão 5 — PR fold-ins

Mais uma passagem de revisor (qwen3.7-max). Suíte **26 testes**, re-verificada ao vivo.

| #   | Gravidade | Constatação                                                                                                                                                                                                                                                                                                                                                                              | Correção                                                                                                                                                           |
| --- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **P0**    | `resolveClientResponse` deletava a entrada pendente ANTES de chamar `respondToSessionPermission`. Um voto malformado (`result: {}`) faz o mediador da ponte lançar exceção — e com a entrada pendente já removida, o `abandonPendingForSession` da finalização não pode cancelá-la, então o prompt do agente trava em um voto que nunca resolve (um portador de token pode travar uma sessão com um único POST inválido). | Envolver o voto em try/catch; em qualquer falha, cair em `cancelAbandonedPermission` para que o mediador seja sempre liberado. Novo teste cobre o caminho do voto malformado. |
| D2  | **P1**    | O `onClose` do fluxo de sessão abortava apenas a bomba de eventos, não `binding.promptAbort` — uma desconexão do cliente (aba fechada / queda de rede) deixava o prompt em andamento executando (quota + FIFO) até o TTL ocioso.                                                                                                                                                          | `onClose` agora também aborta o `promptAbort` da sessão.                                                                                                            |
| D3  | **P1**    | Quando `pumpSessionEvents` rejeitava, o `.catch` apenas registrava — o fluxo SSE permanecia aberto enviando heartbeats mas sem entregar nada (zumbi, sem sinal de reconexão).                                                                                                                                                                                                            | `.catch` agora também fecha `closeSessionStream(sessionId)`.                                                                                                        |

---

## 15. Rodada de revisão 6 — PR fold-ins

Mais uma passagem de revisor (qwen3.7-max). Suíte **28 testes**, re-verificada ao vivo.

| #   | Gravidade | Constatação                                                                                                                                                                                                                              | Correção                                                                                                                                                                                                                                                                                                                                    |
| --- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **P0**    | `handlePrompt` sobrescrevia `binding.promptAbort` sem abortar o controlador anterior — dois `session/prompt` simultâneos para uma mesma sessão órfanavam o primeiro (executa até o fim na FIFO da ponte, não abortável por `session/cancel`). | Abortar o `promptAbort` anterior antes de instalar o novo. Teste adicionado.                                                                                                                                                                                                                                                                |
| E2  | **P0**    | O caminho de `subscribeEvents` que lança exceção enviava um notify `stream_error` e então `return`ava (resolvido) — o `.catch` do chamador nunca disparava, deixando um fluxo SSE zumbi (heartbeats, sem eventos, sem sinal de reconexão). | Relançar a exceção após o notify para que o `.catch` do chamador feche o fluxo. Teste afirma o fechamento do prompt.                                                                                                                                                                                                                       |
| E3  | **P1**    | O heartbeat do SSE não marcava a conexão como ativa — um prompt longo sem eventos intermediários por >30 min era ceifado pelo idle-reaper (fluxos + prompts mortos).                                                                      | `SseStream` recebe um hook `onHeartbeat`; ambos os handlers GET passam `() => conn.touch()`.                                                                                                                                                                                                                                               |
| E4  | **P2**    | O `.catch` de `pumpSessionEvents` fechava por sessionId — uma reconexão entre o lançamento da exceção e a microtask podia matar o NOVO fluxo.                                                                                              | Guarda de identidade: fechar apenas se `binding.stream` ainda é este fluxo.                                                                                                                                                                                                                                                                |
| E6  | **P2**    | `sendSession` criava automaticamente um binding — um frame tardio de pump/reply após `closeSessionStream` ressuscitava um binding fantasma que armazenava em buffer até 256 frames para sempre.                                            | `sendSession` agora é apenas de consulta: descarta frames quando a sessão não tem binding ativo.                                                                                                                                                                                                                                           |
| E5  | aceito    | `session/load`/`resume` não rejeitam quando outra conexão ativa possui a sessão ("hijack").                                                                                                                                               | **Aceito, não alterado:** o limite de confiança do daemon é o token de portador + vinculação de workspace único, e a anexação de múltiplos clientes é intencional (a ponte é multi-cliente por design; REST tem a mesma propriedade). Um portador de token não ganha capacidade que não possui via REST. Rastreado com os outros itens de limite de token (propriedade DELETE, §13). |
---

## 16. Rodada de revisão 7 — PR fold-ins

Outra passagem de revisor (qwen3.7-max). Suíte **30 testes**, re-verificada ao vivo.

| #   | Gravidade | Descoberta                                                                                                                                                                                                                        | Correção                                                                                                                                                                                                                                     |
| --- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **P0**    | TOCTOU concorrente em `session/close`: `ownedSessions.delete` só executava no `finally` (após o await), então dois closes concorrentes ambos passavam `requireOwned` → erro enganoso para o 2º + close redundante da bridge.       | Remover a guarda de propriedade SINCRONAMENTE antes do await; o close da bridge ocorre uma vez. Teste adicionado.                                                                                                                              |
| F2  | **P1**    | Ciclo de vida da pump: um final de iterador CLEAN (subprocesso encerrado, `done`) resolvia → o `.catch` nunca disparava → stream zumbi; e um erro de iterador NO MEIO DO STREAM não enviava `stream_error`.                            | `pumpSessionEvents` envolve o loop inteiro (erros síncronos e no meio do stream enviam `stream_error` e relançam); o consumidor `.then(onDone, onErr)` fecha o stream em AMBOS os caminhos (protegido por identidade). Testes adicionados.      |
| F3  | **P2**    | Rejeição por limite de conexões 503 não tinha log no stderr.                                                                                                                                                                       | `writeStderrLine` com o valor do limite.                                                                                                                                                                                                       |
| F4  | **P2**    | O spread de `_qwen/notify stream_error` fazia `event.data.kind` sobrescrever o discriminador.                                                                                                                                      | Fazer o spread primeiro, depois `kind: 'stream_error'`.                                                                                                                                                                                       |
| F5  | **P2**    | `MAX_WORKSPACE_PATH_LENGTH` redeclarado (`= 4096`) em vez do canônico `fs/paths.js`.                                                                                                                                                | Importar de `../fs/paths.js` (sem divergência).                                                                                                                                                                                                |
| F6  | **P2**    | `isObjectParams` duplicado de `json-rpc.isObject`.                                                                                                                                                                                  | Importar `isObject`.                                                                                                                                                                                                                          |
| F7  | **P2**    | `process.stderr.write` cru em `index.ts`/`sse-stream.ts` vs `writeStderrLine` em outros lugares.                                                                                                                                   | Unificado em `writeStderrLine` em todo o módulo.                                                                                                                                                                                               |

---

## 17. Alinhamento de equivalência REST + Implementação da auditoria do plano de extensão (round 8)

Objetivo: tornar `/acp` um **substituto equivalente** ao REST+SSE. Este lote reestrutura o plano de extensão com base nas conclusões da auditoria e completa **todas as capacidades já expostas pela bridge**; as capacidades que a bridge ainda não possui (I/O de arquivos, streams de dispositivo, CRUD de agents/memória) são **primeiro completadas pela acp-bridge** conforme a correção arquitetural (ver §17.3).

### 17.1 Auditoria do plano de extensão → Implementação (substitui o plano antigo da §5)

Conferido com base no **SDK real do repositório `@agentclientprotocol/sdk@0.14.1`** (não apenas no site oficial):

- `session/set_config_option` é um método de **primeira classe (não `unstable_`)**, requisição `{sessionId, configId, value}`, `category` inclui `model`/`mode`/`thought_level`; enquanto `set_model` ainda usa `unstable_setSessionModel`.
- A especificação reserva o prefixo `_` para extensões, com exemplo no formato de domínio `_zed.dev/…`; dados de fornecedores vão em `_meta` com chaves por domínio.

Implementado:

- **Namespace `_qwen/` → domínio reverso `_qwen/`**; `_meta` unificado como `_meta:{ "qwen": … }` (incluindo anúncio de capacidades no `initialize` e o `requestId` de `session/request_permission`).
- **Modelo + modo de aprovação → `session/set_config_option` padrão** (`configId:"model"|"mode"`), roteado para os `bridge.setSessionModel`/`setSessionApprovalMode` existentes; o resultado de `session/new` **anuncia `configOptions`** (obtido do estado do processo filho `getSessionContextStatus().state.configOptions`, já no formato ACP). **Removido** o método de fornecedor `_qwen/session/set_model`.
- REST(http+sse) **não requer modificação síncrona**: os dois transports compartilham a mesma bridge, o estado é naturalmente consistente.
### 17.2 Novos métodos `/acp` neste lote (bridge já suporta, alinhamento 1:1 com REST)

| REST                                                  | `/acp`                                             | bridge                                   |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `POST /session/:id/model` / `approval-mode`           | **Padrão** `session/set_config_option` (model/mode) | setSessionModel / setSessionApprovalMode |
| `GET /session/:id/context`                            | `_qwen/session/context`                            | getSessionContextStatus                   |
| `GET /session/:id/supported-commands`                 | `_qwen/session/supported_commands`                 | getSessionSupportedCommandsStatus         |
| `PATCH /session/:id/metadata`                         | `_qwen/session/update_metadata`                    | updateSessionMetadata                     |
| `GET /workspace/{mcp,skills,providers,env,preflight}` | `_qwen/workspace/{…}`                              | getWorkspace\*Status                      |
| `POST /workspace/init`                                | `_qwen/workspace/init`                             | initWorkspace                             |
| `POST /workspace/tools/:name/enable`                  | `_qwen/workspace/set_tool_enabled`                 | setWorkspaceToolEnabled                   |
| `POST /workspace/mcp/:server/restart`                 | `_qwen/workspace/restart_mcp_server`               | restartMcpServer                          |

(Já existentes: session/new·load·resume·close·list·prompt·cancel, heartbeat, permission, events estão alinhados.)

### 17.3 Lacunas restantes → Exigir que acp-bridge complete primeiro (correção arquitetural)

As **operações de I/O de arquivo** do REST (`/file /glob /list /stat /file/write /file/edit`), **login por fluxo de dispositivo** (`/workspace/auth/*`), **CRUD de agents** (`/workspace/agents`) e **CRUD de memória** (`/workspace/memory`) **atualmente não estão no `HttpAcpBridge`** — as rotas REST chamam diretamente serviços de nível de rota (`WorkspaceFileSystemFactory`, `DeviceFlowRegistry`, `SubagentManager`, `writeWorkspaceContextFile`), ignorando o bridge.

**Decisão (adotando feedback de revisão/proprietário)**: Não permitir que o transporte `/acp` se conecte diretamente a esses serviços de nível de rota (isso replicaria o desvio arquitetural do REST e duplicaria o acoplamento do transporte). **A abordagem correta é primeiro completar essas capacidades no `HttpAcpBridge` do `@qwen-code/acp-bridge`** (ex.: `readWorkspaceFile`/`writeWorkspaceFile`/`globWorkspace`, `startDeviceFlow`/`pollDeviceFlow`, `listAgents`/`upsertAgent`/`deleteAgent`, `readMemory`/`writeMemory`), fazendo com que tanto REST quanto `/acp` passem pelo bridge. Nesse momento, `/acp` adicionará `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` (a leitura de arquivo não possui método padrão ACP client→agent, sendo uma extensão legítima do fornecedor).

**Equivalência completa = este lote (capacidades já existentes no bridge) + lote subsequente após acp-bridge preencher as lacunas**.

---

## 18. Review round 9 — PR fold-ins

| #   | Severidade           | Descoberta                                                                                                                                                                                                                                                                                                       | Correção                                                                                                                                                                              |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **P1 (regressão)**   | A reconexão do stream da sessão abortou o prompt em andamento: `attachSessionStream` fechou o stream ANTIGO antes de instalar o novo, e o `onClose` do stream antigo abortou incondicionalmente o `promptAbort` — então um cliente reconectando (falha de rede/roaming) perdeu o prompt em execução.                | Instalar o novo stream ANTES de fechar o antigo; proteger com guarda de identidade o aborto de prompt no `onClose` (abortar apenas se ESTE ainda for o stream ativo da sessão). Teste adicionado (prompt sobrevive à reconexão). |
| G2  | **P2**               | `session/cancel` passou `undefined` como corpo do `CancelNotification`, descartando os campos de cancelamento fornecidos pelo cliente (reason/context) que o REST encaminha.                                                                                                                                     | Encaminhar `{ ...params, sessionId }` (espelha o REST).                                                                                                                               |

Rebaseado no último `daemon_mode_b_main` (#4473/#4483/#4484/#4500), sem conflitos. Suíte de **33 testes**, reverificado ao vivo.

---

## 19. Roteiro / PRs subsequentes (para não esquecer)

Este PR (#4472) = Transporte ACP Streamable HTTP + **alinhamento completo de capacidades via bridge** + esquema de extensão oficial. Já marcado como **pronto**. Para atingir «`/acp` completamente equivalente a REST+SSE» ainda é necessário:

1. **PR subsequente 1 — Complemento de capacidades do acp-bridge (pré-requisito / bridge-first)**: Adicionar métodos de I/O de arquivo, fluxo de dispositivo, CRUD de agents e CRUD de memória no `HttpAcpBridge`; rotas REST passarem a usar o bridge (eliminando o desvio de chamadas diretas a serviços de nível de rota).
2. **PR subsequente 2 — Alinhamento restante do `/acp` (dependente do PR 1)**: `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` → equivalência completa com REST.
Acompanhamento: #3803 (open decisions), #4175 (Mode B roadmap) já comentados.

Deferred: itens de endurecimento adiados — veja a descrição do PR "Known deferred".

---

## 20. Renomeação de namespace de extensão + análise de transporte SDK (rodada 11)

- **Namespace `_qwen.ai/` → `_qwen/`**: a única regra rígida do ACP é o `_` inicial; o segmento de domínio `_zed.dev/` é uma convenção por exemplo, não um MUST. Como `qwen` é distintivo, usamos a forma nua mais curta. A chave `_meta` também fica como `"qwen"`. (Pesquisa de agentes reais: Zed/gemini-cli usam principalmente `_meta` em métodos padrão + os `unstable_*` do ACP; métodos `_` personalizados simples são raros — nossos `_qwen/*` são operações genuinamente novas de workspace/sessão sem equivalente padrão, então um método `_` é a ferramenta certa.)
- **Por que transporte feito sob medida (não baseado em SDK)**: o TS SDK fornece apenas `ndJsonStream` (stdio); RFD #721 HTTP é SDK Fase 3 (não implementado). O `Connection` do SDK é um fluxo duplex único; nosso transporte é multi-fluxo (POSTs + conexão-SSE + SSE por sessão) e precisa de demux de saída por sessionId — que nosso dispatcher já conhece no momento do roteamento. Uma reescrita completa do SDK luta contra esse modelo e não removeria a maior parte (tradução de ponte, ciclo de vida SSE, propriedade, EventBus→JSON-RPC). **Melhoria pragmática (acompanhamento candidato): adotar os validadores de esquema Zod do SDK + tipos para validação de parâmetros, mantendo o transporte feito sob medida.** Clientes SDK que usam `extMethod('_qwen/…')` interoperam com nossos manipuladores (formato de fio idêntico).
