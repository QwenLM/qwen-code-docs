# Daemon ACP-sobre-HTTP → Transporte HTTP Streamable Oficial do ACP

> Alvo: `daemon_mode_b_main`. Ramo: `feat/daemon-acp-http-streamable`.
> Autor: arnoo.gao. Data: 2026-05-24. Status: **Design v1 → implementação**.
> Fluxo de trabalho design-first por repositório: este documento chega antes/com o PR de implementação para que o contrato de comunicação seja revisável.

---

## 0. TL;DR

O daemon (`qwen serve`) hoje fala um dialeto **REST + SSE** personalizado para clientes web/SDK,
enquanto fala **ACP JSON-RPC real sobre stdio** para o processo filho `qwen --acp`
gerado. Esta proposta adiciona um **segundo transporte northbound** que implementa o
**transporte HTTP Streamable oficial do ACP** (RFD #721) em um único endpoint `/acp`,
de modo que qualquer cliente nativo ACP (Zed, Goose, SDKs futuros) possa acionar o daemon diretamente
pelo protocolo padrão — sem necessidade de conhecimento REST específico do qwen.

**Decisão: transporte duplo, aditivo.** O novo endpoint `/acp` é montado
junto com a superfície REST existente, reutilizando o mesmo `HttpAcpBridge` +
`EventBus` internamente. A API REST **não** é removida. Justificativa na §6.

**Decisão: namespace de extensão = `_qwen/…`** (prefixo com sublinhado simples, a
forma reservada pela especificação ACP para métodos personalizados) para funcionalidades do daemon que não possuem
método ACP padrão (troca de modelo, introspecção de workspace, heartbeat,
política de permissão para múltiplos clientes, ajuste de backpressure SSE). Justificativa na §5.

Uma implementação de referência completa e executável localmente acompanha este PR
(`packages/cli/src/serve/acp-http/`) mais um harness de verificação
(`scripts/acp-http-smoke.mjs`).

---

## 1. Contexto — o que "ACP sobre HTTP" significa hoje

Três níveis (verificados no commit `0c0430939`):

```
┌──────────────┐  REST + SSE personalizado (HTTP/1.1)   ┌────────────┐  ACP JSON-RPC   ┌──────────────┐
│ cliente web  │ ──────────────────────────────────────► │  qwen      │  (stdio NDJSON) │ qwen --acp   │
│ / SDK        │ ◄─── GET /session/:id/events ────────── │  serve     │ ◄─────────────► │ filho (Agent)│
│ (cliente ACP)│       (text/event-stream)               │  (daemon)  │  ndJsonStream   │              │
└──────────────┘                                         └────────────┘                 └──────────────┘
        northbound: NÃO é fio ACP                            ponte          southbound: ACP real
```

### 1.1 Northbound (cliente ↔ daemon) — personalizado, hoje

- App Express 5 em `packages/cli/src/serve/server.ts` (~30 rotas).
- Verbos REST discretos, **não** JSON-RPC:
  - `POST /session` (criar), `POST /session/:id/prompt`, `POST /session/:id/cancel`,
    `POST /session/:id/load|resume`, `POST /session/:id/model`,
    `POST /session/:id/permission/:requestId`, `POST /session/:id/heartbeat`,
    `DELETE /session/:id`, mais `/workspace/*`, `/capabilities`, `/health`.
- Streaming servidor→cliente: `GET /session/:id/events` → `text/event-stream`.
  - Quadros: `id: <n>\nevent: <type>\ndata: <json>\n\n` (`server.ts:formatSseFrame`, ~2626).
  - `id` **monotônico** por sessão + retomada `Last-Event-ID` apoiada por um
    ring-buffer `EventBus` (`acp-bridge/src/eventBus.ts`).
  - `type`s de evento: `session_update`, `client_evicted`, `slow_client_warning`,
    `state_resync_required`, `stream_error`, …
- Autenticação: `Authorization: Bearer <token>` (`serve/auth.ts`), negação de CORS + lista de permissão de hosts.
- Backpressure: cadeia de escrita serializada por conexão + comentários de heartbeat de 15 s.

### 1.2 Southbound (daemon ↔ filho) — já é ACP

- `acp-bridge/src/spawnChannel.ts` gera `qwen --acp`, envolve stdin/stdout com
  `ndJsonStream` do `@agentclientprotocol/sdk` (`^0.14.1`).
- `acp-bridge/src/bridge.ts:729` `new ClientSideConnection(() => client, channel.stream)`
  — o daemon é o **cliente** ACP, o filho é o **agente** ACP.
- Métodos de extensão já em uso neste segmento: `unstable_setSessionModel`,
  `unstable_resumeSession`, `unstable_listSessions` (`acp-integration/acpAgent.ts`).

### 1.3 Por que migrar o northbound

- Cada cliente (webui, TS SDK, Java SDK, Python SDK, complemento VSCode) reimplementa
  o mapeamento REST personalizado. Um endpoint padrão ACP permite que editores nativos ACP se conectem
  com zero código de cola específico do qwen.
- Alinha a superfície remota do daemon com o protocolo que ele já fala internamente.

---

## 2. Alvo: ACP Streamable HTTP (RFD #721)

RFD **Rascunho** mesclado (`agentclientprotocol/agent-client-protocol#721`, mesclado em 2026-04-22).
Ainda não normativo; ainda não em nenhum SDK. Implementamos de acordo com o design de fio do RFD.

### 2.1 Endpoint e verbos (único `/acp`)

| Verbo          | Comportamento                                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /acp`    | Enviar JSON-RPC. `initialize` → **`200`** + corpo JSON (capacidades) e define `Acp-Connection-Id`. Todas as outras requisições/notificações → **`202 Accepted`**, corpo vazio; a _resposta_ (se houver) é entregue no fluxo SSE de longa duração correspondente. |
| `GET /acp`     | Abrir um fluxo **SSE** de longa duração. (`Upgrade: websocket` → WebSocket; **adiado**, veja §7.)                                                                                                                                                     |
| `DELETE /acp`  | Encerrar a conexão → `202`.                                                                                                                                                                                                                           |

### 2.2 Fluxos de longa duração em dois níveis

- **Fluxo com escopo de conexão**: `GET /acp` com cabeçalho `Acp-Connection-Id`, sem cabeçalho
  de sessão. Carrega respostas de nível de conexão (`session/new`, `session/load`,
  `authenticate`) e notificações de nível de conexão.
- **Fluxo com escopo de sessão**: `GET /acp` com `Acp-Connection-Id` **e** `Acp-Session-Id`.
  Carrega notificações `session/update`, **requisições agente→cliente**
  (`session/request_permission`, `fs/read_text_file`, …) e respostas a POSTs de sessão
  (`session/prompt`, `session/cancel`).

### 2.3 Identidade (3 camadas)

- `Acp-Connection-Id` (cabeçalho HTTP) — vínculo de transporte, criado em `initialize`.
- `Acp-Session-Id` (cabeçalho HTTP) — necessário no GET com escopo de sessão + POSTs de sessão.
- `sessionId` (parâmetro JSON-RPC) — dentro dos parâmetros do método (deve corresponder ao cabeçalho).

### 2.4 Divergências do MCP StreamableHTTP

ACP usa fluxos **de longa duração** (não SSE por requisição), **dois** cabeçalhos de ID (conexão
vs sessão), `202`-para-não-initialize, HTTP/2 obrigatório, WebSocket obrigatório-cliente. Nós
tomamos emprestado o esqueleto de endpoint único + POST/GET-SSE + cabeçalho de sessão, mas adaptamos ao
modelo de ID duplo de longa duração. **Não** reutilizamos o `StreamableHTTPServerTransport`
do `@modelcontextprotocol/sdk` (seu modelo de fluxo por requisição e único
`Mcp-Session-Id` não se encaixam).

### 2.5 Métodos padrão (confirmados do esquema atual)

- Requisições Cliente→Agente: `initialize`, `authenticate`, `session/new`, `session/load`,
  `session/prompt`, `session/resume`, `session/close`, `session/list`,
  `session/set_mode`, `session/set_config_option`, `logout`.
- Notificação Cliente→Agente: `session/cancel`.
- Requisições Agente→Cliente: `fs/read_text_file`, `fs/write_text_file`,
  `session/request_permission`, `terminal/create|output|wait_for_exit|kill|release`.
- Notificação Agente→Cliente: `session/update`.

---

## 3. Arquitetura do novo transporte

O daemon deve apresentar uma **superfície de Agente ACP sobre HTTP** northbound, enquanto
permanece um **cliente** ACP para o filho southbound. A camada `/acp` é portanto um
**roteador JSON-RPC** que termina o transporte HTTP e faz a ponte para o `HttpAcpBridge`
existente.

```
            POST /acp (requisições/respostas/notificações JSON-RPC)
cliente ──────────────────────────────────────────────►  ┌───────────────────────────┐
(editor)                                                  │  AcpHttpTransport         │
        ◄── GET /acp  (SSE com escopo de conexão) ──────  │  - registro de conexão   │
        ◄── GET /acp  (SSE com escopo de sessão) ───────  │  - correlação de id JSON-RPC│
                                                          │  - despacho de métodos   │
                                                          └────────────┬──────────────┘
                                                                       │ reutiliza
                                                          ┌────────────▼──────────────┐
                                                          │  HttpAcpBridge + EventBus  │  (inalterado)
                                                          └────────────┬──────────────┘
                                                                       │ ACP stdio (inalterado)
                                                                 qwen --acp filho
```

### 3.1 Novo layout do módulo (`packages/cli/src/serve/acp-http/`)

| Arquivo                   | Responsabilidade                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                | `mountAcpHttp(app, bridge, opts)` — registra rotas `/acp` no app Express existente.                                                                                                             |
| `connection-registry.ts`  | `Acp-Connection-Id` → `AcpConnection` (escritor SSE da conexão, `Map<sessionId, SessionStream>`, requisições pendentes agente→cliente por id JSON-RPC, alocador de id monotônico). Limpeza por TTL + DELETE. |
| `json-rpc.ts`             | Helpers para análise/validação/serialização JSON-RPC 2.0; códigos de erro (`-32600` etc.); guarda de namespace `_qwen/`.                                                                        |
| `dispatch.ts`             | Mapeia métodos JSON-RPC recebidos → chamadas `HttpAcpBridge`. Mapeia `BridgeEvent`s → quadros JSON-RPC de saída. A tabela de tradução (§4).                                                          |
| `sse-stream.ts`           | Escritor SSE de longa duração (reutiliza o padrão de backpressure/heartbeat de `server.ts`). Distinto do REST `/events` (framing diferente: objetos JSON-RPC completos, não envelopes de evento qwen). |

Nenhuma alteração em `bridge.ts` / `eventBus.ts` (apenas consumidor aditivo).

### 3.2 Ciclo de vida da conexão e sessão

1. `POST /acp {initialize}` → cria `connectionId`, cria `AcpConnection`, responde `200`
   com `{protocolVersion, agentCapabilities, _meta:{qwen:{…}}}` + cabeçalho `Acp-Connection-Id`.
2. Cliente abre `GET /acp` (escopo de conexão) carregando `Acp-Connection-Id`.
3. `POST /acp {session/new}` → `202`; daemon chama `bridge.createSession(...)`; envia
   a resposta JSON-RPC (com `sessionId`) pelo fluxo **da conexão**.
4. Cliente abre `GET /acp` (escopo de sessão) com `Acp-Connection-Id`+`Acp-Session-Id`;
   daemon `bridge.subscribeEvents(sessionId)` e canaliza quadros traduzidos.
5. `POST /acp {session/prompt}` → `202`; `bridge.sendPrompt(...)`; notificações `session/update`
   são transmitidas ao vivo no fluxo da sessão; a **resposta** final do prompt
   (`{id, result:{stopReason}}`) é enviada no fluxo da sessão quando é concluída.
6. Requisição agente→cliente (ex.: `session/request_permission`) é emitida como uma **requisição** JSON-RPC
   no fluxo da sessão com um id alocado pelo daemon; o cliente responde via
   `POST /acp {id, result}`; `dispatch` resolve através da API de permissão da ponte.
7. `DELETE /acp` (ou fechamento do fluxo da conexão + TTL) encerra sessões/assinaturas.

---

## 4. Tabela de tradução (ponte ⇄ ACP/HTTP)

### 4.1 Entrada (POST do cliente → ponte)

| Método ACP                                  | Chamada da ponte                                        | Resposta roteada para                  |
| ------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| `initialize`                                | (nenhuma; capacidades de `capabilities.ts`)             | inline `200`                           |
| `authenticate`                              | provedor de autenticação existente (`serve/auth/*`)     | fluxo da conexão                       |
| `session/new`                               | `bridge.createSession`                                  | fluxo da conexão                       |
| `session/load` / `session/resume`           | `bridge.restoreSession('load'                           | 'resume')`                             | fluxo da conexão |
| `session/prompt`                            | `bridge.sendPrompt`                                     | fluxo da sessão (adiado até conclusão) |
| `session/cancel` (notificação)              | `bridge.cancel`                                         | —                                      |
| `session/list`                              | `bridge.listSessions` (`unstable_listSessions`)         | fluxo da conexão                       |
| `session/set_mode`                          | lógica de rota de modo de aprovação                     | fluxo da sessão                        |
| **resposta** JSON-RPC (para req agente→cli) | resolver pendente (`§4.3`)                              | —                                      |
| `_qwen/session/set_model`                   | `bridge.setSessionModel` (`unstable_setSessionModel`)   | fluxo da sessão                        |
| `_qwen/workspace/list` etc.                 | rotas de introspecção de workspace                      | fluxo da conexão                       |
| `_qwen/session/heartbeat`                   | `bridge.heartbeat`                                      | fluxo da conexão                       |

### 4.2 Saída (BridgeEvent → JSON-RPC no fluxo da sessão)

| BridgeEvent.type                                                   | Emitido como                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `session_update`                                                   | notificação `{method:"session/update", params:<data>}`               |
| requisição de permissão                                            | requisição `{id:<n>, method:"session/request_permission", params}`   |
| `client_evicted` / `slow_client_warning` / `state_resync_required` | notificação `{method:"_qwen/notify", params:{kind,…}}`               |
| `stream_error`                                                     | resposta de erro JSON-RPC no id do prompt ativo (ou `_qwen/notify`)  |
| conclusão do prompt                                                | `{id:<promptId>, result:{stopReason}}`                               |

### 4.3 Requisições pendentes agente→cliente

`AcpConnection` mantém `Map<jsonRpcId, {sessionId, kind, bridgeRequestId, resolve}>`.
Quando o cliente POSTa um objeto de resposta JSON-RPC, `dispatch` corresponde ao `id`, então chama o caminho
de resolução da ponte (ex.: equivalente interno de `POST /session/:id/permission/:requestId`).

> **Status v1:** apenas o ida-e-volta `session/request_permission` agente→cliente está
> implementado. O encaminhamento agente→cliente de `fs/*` e `terminal/*` é **adiado** (§7) — o
> daemon ainda não anuncia negociação de capacidade de cliente `fs`/`terminal` em `/acp`,
> portanto clientes ACP não devem assumir semânticas de sistema de arquivos/terminal neste transporte
> na v1. O estado final pretendido (encaminhar `fs/*` para o cliente; cair no FS do workspace do daemon quando
> o cliente não tiver a capacidade `fs`) é o acompanhamento descrito na §7.

---

## 5. Estratégia de extensão (requisito #2)

ACP reserva qualquer método iniciado com `_` para extensões personalizadas e fornece `_meta`
em todos os tipos. O segmento southbound do código já usa nomes de método `unstable_*`.

**Escolha northbound:** nomes de método **`_qwen/<area>/<verb>`** com namespace do fornecedor
(prefixo `_` compatível com a especificação). Capacidades anunciadas sob
`agentCapabilities._meta.qwen` em `initialize` para que clientes façam detecção de funcionalidades antes de usar.

| Necessidade                                                  | Não tem método ACP padrão? | Extensão                                                |
| ------------------------------------------------------------ | -------------------------- | ------------------------------------------------------- |
| Troca de modelo                                              | sim                        | `_qwen/session/set_model`                               |
| Introspecção de workspace (MCP/skills/providers/env)         | sim                        | `_qwen/workspace/list`, `_qwen/workspace/<area>`        |
| Heartbeat / último visto                                     | sim                        | `_qwen/session/heartbeat`                               |
| Política de permissão para múltiplos clientes (consenso/designado) | parcial               | `session/request_permission` + `_meta.qwen.policy`      |
| Ajuste de backpressure SSE (`maxQueued`)                     | sim                        | Cabeçalho `Acp-Qwen-Max-Queued` no GET de sessão        |
| Cursor de retomada (ring `Last-Event-ID`)                    | Fase 4 do RFD              | Cabeçalho `Last-Event-ID` + `_meta.qwen.eventId` nos quadros |

Métodos padrão **nunca** são renomeados; extensões são estritamente aditivas e ignoráveis.

---

## 6. Transporte duplo vs. substituir (requisito #4)

**Decisão: transporte duplo (aditivo).**

- O transporte oficial é um RFD **Rascunho**, não normativo e ausente de todos os SDKs —
  substituir diretamente nos acoplaria a um design não ratificado e quebraria webui + 3 SDKs +
  complemento VSCode de uma vez.
- A superfície REST carrega funcionalidades sem mapeamento ACP limpo ainda (introspecção
  de workspace, mediação de permissão para múltiplos clientes, retomada com ring-buffer, registro
  de capacidades). Elas são rebaixadas para extensões `_qwen/*` no `/acp`, mas a superfície REST permanece
  autoritativa até o RFD ser ratificado.
- Ambos os transportes compartilham **uma** instância de `HttpAcpBridge` + `EventBus`,
  portanto não há duplicação de estado — `/acp` e `/session/*` podem até conduzir a mesma sessão ativa
  simultaneamente (múltiplos clientes já são suportados pela ponte).
- Alternância (v1, incluída): ativado por padrão; **`QWEN_SERVE_ACP_HTTP=0`** desabilita a montagem. Uma
  flag de CLI `--no-acp-http` e uma tag `acp_http` em `/capabilities` para detecção de funcionalidades
  do cliente são **adiadas** para um acompanhamento (não na v1) — até lá, os clientes detectam o
  transporte sondando `POST /acp {initialize}`.

Caminho de migração: uma vez que o RFD seja ratificado e os SDKs sejam lançados, as rotas REST podem ser reformuladas como
um shim de compatibilidade fino sobre `/acp` (PR separado e posterior).

---

## 7. Escopo do PR de implementação

**No escopo (executável + verificado localmente):**

- Despacho `POST /acp` para `initialize`, `session/new`, `session/prompt`,
  `session/cancel`, `session/load`, tratamento de resposta JSON-RPC.
- Fluxos SSE `GET /acp` com escopo de conexão e sessão com enquadramento JSON-RPC.
- Streaming `session/update` + correlação da resposta final do prompt.
- Ida-e-volta `session/request_permission` agente→cliente.
- Extensão `_qwen/session/set_model` como exemplo trabalhado do #2.
- Reutilização de autenticação Bearer + lista de permissão de hosts (mesmo middleware do REST).
- Testes unitários (`acp-http/*.test.ts`) + script de teste de caixa preta acionando um daemon real.

**Adiado (documentado, não construído agora):**

- Caminho de upgrade para WebSocket (capacidade de cliente exigida pelo RFD; SSE é suficiente para verificação local).
- Multiplexação HTTP/2 (rodamos HTTP/1.1; POST e GET de longa duração usam sockets separados,
  o que funciona para clientes CLI/Node e navegadores com ≤6 conexões). Divergência documentada.
- Encaminhamento completo agente→cliente de `fs/*` + `terminal/*` (o caminho de permissão prova o
  mecanismo; o restante é acompanhamento mecânico).
- Robustez de retomabilidade SSE em paridade com o ring buffer (Fase 4 no RFD).
---

## 8. Plano de verificação local

1. `npm run build` (ou build do workspace de `cli` + `acp-bridge`).
2. Iniciar daemon: `qwen serve --listen 127.0.0.1:0 --token <t>` (ou token via env).
3. Executar `node scripts/acp-http-smoke.mjs`:
   - `POST /acp {initialize}` → verificar `200` + `Acp-Connection-Id`.
   - Abrir conexão SSE; `POST {session/new}` → verificar resposta no stream.
   - Abrir sessão SSE; `POST {session/prompt:"say hi"}` → verificar ≥1 `session/update`
     depois um final `{result:{stopReason}}`.
   - Acionar uma ferramenta que requer permissão → verificar requisição `session/request_permission`,
     POST uma resposta de concessão → verificar que o prompt é concluído.
   - `POST {_qwen/session/set_model}` → verificar troca de modelo + `session/update`.
4. Vitest: `acp-http/*.test.ts` verde.

---

## 9. Riscos

| Risco                                        | Mitigação                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Mudanças no RFD antes da ratificação         | Sob tag de capacidade + namespace `_qwen`; módulo isolado; fácil de revisar.                   |
| HTTP/1.1 vs HTTP/2 obrigatório               | Clientes localhost/CLI não afetados; documentado; h2 é uma troca de transporte futura.         |
| Dois transportes em uma ponte (race)         | A bridge já suporta multi-cliente; reutilize seu travamento.                                   |
| Encaminhamento `fs/*` vs FS local do daemon  | Controlado por capacidade: encaminha quando o cliente declara `fs`, senão local.               |

---

## 10. Registro de implementação e verificação (v1)

Implementado em `packages/cli/src/serve/acp-http/` (`json-rpc.ts`, `sse-stream.ts`,
`connection-registry.ts`, `dispatch.ts`, `index.ts`), montado a partir de `server.ts`
via `mountAcpHttp(app, bridge, { boundWorkspace })`.

### Automated (`packages/cli/src/serve/acp-http/*.test.ts`)

`transport.test.ts` inicializa um servidor Express real + o `mountAcpHttp` real sobre uma
bridge falsa controlável e o conduz com `fetch` + análise manual de SSE. 15 testes verdes,
cobrindo: `initialize` 200 + `Acp-Connection-Id`; conexão desconhecida 400; resposta
`session/new` no stream da conexão; prompt → stream `session/update` + correlação do
resultado final; `session/request_permission` ida e volta agente→cliente→agente;
`_qwen/session/set_model`; método não encontrado; `DELETE` limpeza.

### Daemon ao vivo (modelo real)

Iniciou `qwen serve --port 8767 --token … --workspace …` (entrada do bundle para que o
filho `qwen --acp` seja independente) e executou `scripts/acp-http-smoke.mjs`:

```
✓ initialize: connectionId=… protocolVersion=1
✓ session/new: sessionId=…
→ prompt: "Reply with the single word: pong"
pong
✓ prompt complete: 10 session/update frames, stopReason=end_turn
✓ DELETE /acp — connection closed
ALL CHECKS PASSED ✅
```

O caminho de erro também foi confirmado ao vivo: quando o filho falhou ao iniciar, o timeout
da bridge foi apresentado ao cliente como um frame de erro JSON-RPC no stream da conexão
(`{"id":2,"error":{"code":-32603,…}}`), provando a correlação de id + a divisão 202/SSE
sob falha.

### Revisão incorporada — clientId emitido pela bridge (descoberto na verificação ao vivo)

A primeira execução ao vivo falhou `session/prompt` com _"client id … is not registered for
session"_. Causa raiz: `spawnOrAttach`/`loadSession` **ignoram** um clientId fornecido pelo
chamador que a bridge nunca emitiu e carimba um novo (retornado em `BridgeSession.clientId`);
o dispatcher estava ecoando o próprio id da conexão (não registrado) em `sendPrompt`.
Correção: persistir o id carimbado pela bridge no `SessionBinding` e ecoá-lo em toda chamada
por sessão (`sessionCtx`). Re-verificado verde acima.

---

## 11. Rodada de revisão 2 — incorporações

Duas revisões independentes (correção/concorrência + conformidade de protocolo/segurança)
mais uma auto-leitura. Todas as correções verificadas pela suíte vitest expandida
(**18 testes**) + uma nova execução de fumaça ao vivo (21 frames `session/update` →
`stopReason=end_turn`).

| #   | Gravidade | Descoberta                                                                                                                                                                                                                     | Correção                                                                                                                                                                                        |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P0**    | O **reconexão do stream de sessão estava permanentemente morta**: `SessionBinding.abort` foi criado uma vez e reutilizado; ao fechar o stream, ele era abortado para sempre, então um `subscribeEvents(signal)` de reconexão recebia um sinal já abortado e recebia zero eventos. | `attachSessionStream` agora instala um `AbortController` **novo** por stream (e fecha qualquer stream anterior); `index.ts` bombeia nesse sinal novo.                                           |
| R2  | **P0**    | `await dispatcher.handle()` rodou **após** `res.end(202)`; uma chamada de bridge que lança exceção (notavelmente o caminho `isResponse` sem try/catch) rejeitaria e apareceria como uma rejeição não tratada → possível crash do daemon. | Envolveu o caminho `isResponse` em try/catch; `.catch()` no `handle(...)` aguardado e no `pumpSessionEvents(...)`.                                                                              |
| R3  | **P1**    | **Nenhuma propriedade conexão→sessão**: qualquer conexão autenticada poderia abrir o SSE da sessão para, ou fazer prompt, _qualquer_ sessionId no workspace (espiada de leitura; prompt era bloqueado apenas incidentalmente pelo erro de clientId não registrado). | `AcpConnection.ownedSessions` populado por `session/new`/`load`/`resume`; stream de sessão retorna `403` e POSTs por sessão retornam `INVALID_PARAMS` para ids não pertencentes (`requireOwned`). |
| R4  | **P1**    | O handle de `mountAcpHttp` foi descartado → timer de varredura TTL + streams SSE ao vivo vazaram no desligamento.                                                                                                               | Handle estacionado em `app.locals`; o hook de fechamento de `runQwenServe` chama `dispose()` antes de `bridge.shutdown()` (espelha o registro de fluxo de dispositivo).                         |
| R5  | **P1**    | **Vazamento de permissão pendente**: fechar uma sessão/conexão com uma permissão pendente deixava a bridge bloqueada aguardando um voto.                                                                                        | `closeSessionStream`/`destroy` cancelam requisições pendentes correspondentes via um `onAbandonPending` injetado → `cancelAbandonedPermission`.                                                |
| R6  | **P1**    | Buffers de frames pré-anexação (`connBuffer`/`binding.buffer`) eram ilimitados.                                                                                                                                                 | Limitados a 256 frames (descarta os mais antigos), combinando com o `maxQueued` do EventBus.                                                                                                   |
| R7  | **P2**    | `initialize` ignorava o `protocolVersion` solicitado pelo cliente.                                                                                                                                                              | Negocia `min(solicitado, 1)`.                                                                                                                                                                   |
| R8  | **P2**    | Nenhuma verificação cruzada `Acp-Session-Id` ↔ `params.sessionId` (RFD §2.3).                                                                                                                                                   | POST verifica se concordam; incompatibilidade → `INVALID_PARAMS`.                                                                                                                               |
| R9  | **P2**    | `session/cancel` formulário de requisição (com id) nunca respondido; `_meta.qwen` duplicado no nível superior.                                                                                                                  | Responder quando um id está presente; único `agentCapabilities._meta.qwen`.                                                                                                                     |

### Aceito / documentado (não corrigido na v1)

- **Ordenação do resultado do prompt vs `session/update` final** (P2): `handlePrompt` aguarda `sendPrompt` e então escreve o frame de resultado, enquanto as atualizações fluem concorrentemente. Na prática, a bridge publica todos os `session/update`s no bus antes de `sendPrompt` resolver e ambos compartilham uma cadeia ordenada de escrita SSE, então o resultado chega por último (confirmado: 21 atualizações e depois o resultado). Uma barreira estrita é um possível endurecimento futuro se um reducer de cliente se mostrar sensível.
- **O `EventSource` do navegador não pode definir `Authorization`** — streams GET `/acp` exigem o header bearer, então navegadores precisam do caminho WebSocket adiado (§7); clientes CLI/Node não são afetados.
- A fronteira de confiança real do daemon permanece o **token bearer + vinculação de workspace único** (mesmo que a superfície REST); a verificação de propriedade do R3 é defesa em profundidade + correção contratual, não uma fronteira de inquilino.

---

## 12. Rodada de revisão 3 — incorporações de bots de PR (#4472)

Dois revisores de PR automatizados mais o bot de resumo. Todas as correções verificadas
pela suíte (agora **22 testes**) + uma nova execução ao vivo (16 `session/update` →
`end_turn`).

| #   | Gravidade | Descoberta                                                                                                                                                                                                                                               | Correção                                                                                                                                                                                                       |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **P0**    | O `AbortController` de `handlePrompt` nunca era abortado — um cliente desconectando/cancelando deixava o agente rodando (queimando cota de modelo, bloqueando o FIFO da sessão). Sinalizado por ambos os bots + 5 subagentes.                             | `promptAbort` estacionado no `SessionBinding`; abortado por `session/cancel` e pela finalização de sessão/conexão (`closeSessionStream`/`destroy`).                                                           |
| B2  | **P0**    | `sessionCtx` sem `fromLoopback` → cada voto de permissão ACP tratado como remoto; a política `local-only` rejeitaria clientes loopback.                                                                                                                   | Capturar loopback no `initialize` (kernel `remoteAddress`, não headers falsificáveis) → `AcpConnection.fromLoopback` → encadeado através de `sessionCtx`.                                                    |
| B3  | **P0**    | Falhas de escrita SSE engolidas silenciosamente → streams zumbis (heartbeats disparam, zero eventos entregues, sem logs).                                                                                                                                | Primeira falha de escrita registra + fecha o stream.                                                                                                                                                          |
| B4  | **P0**    | Varredura ociosa destruía conexões sem log + sem limite de conexões (inundação de initialize).                                                                                                                                                           | Varredura registra cada eliminação; `pumpSessionEvents` chama `touch()` (prompts longos e silenciosos não são eliminados); limite `maxConnections` (64) → `503`.                                              |
| B5  | **P1**    | `sessionCtx` silenciosamente recaía ao clientId não registrado da conexão quando o binding não tinha um (não testado, sempre disparado no `FakeBridge`).                                                                                                 | Lançar exceção quando faltar clientId carimbado (violação de invariante); `FakeBridge` agora carimba um.                                                                                                      |
| B6  | **P1**    | `session/new                                                                                                                                                                                                                                            | load                                                                                                                                                                                                           | resume`'accepted`cwd` não validado (REST valida string/tamanho/absoluto — DoS de amplificação). | Compartilhado `parseOptionalWorkspaceCwd` (string, ≤4096, absoluto). |
| B7  | **P1**    | `session/prompt` encaminhava um `prompt` não validado para a bridge.                                                                                                                                                                                    | `validatePrompt` (array não vazio de objetos), espelhando REST.                                                                                                                                               |
| B8  | **P1**    | Mensagens de erro brutas da bridge ecoadas para o cliente.                                                                                                                                                                                               | `toRpcError` mapeia erros conhecidos da bridge para formas codificadas e seguras para o cliente; desconhecido → `Internal error` genérico (detalhe completo ainda para stderr).                               |
| B9  | **P1**    | `nextId` usava negativos sequenciais — um cliente usando legalmente ids negativos poderia colidir em `pending`.                                                                                                                                          | Ids originados pelo daemon agora são strings (`_qwen_perm_N`), disjuntos de qualquer id de cliente.                                                                                                            |
| B10 | **P2**    | O tipo do parâmetro de `resolveClientResponse` excluía `JsonRpcError`; o stream SSE escopo de conexão não tinha `onClose`; `DELETE` sem header era um 202 silencioso; `SseStream.close` executava `onClose` fora de try/catch; `session/load`·`resume`·`close` não testados. | Ampliou o parâmetro para `JsonRpcResponse`; stream de conexão registra ao fechar; `DELETE` sem header → `400`; `onClose` envolto em try/catch; adicionados testes de load/resume/close + DELETE-400.         |

**Fora do escopo (branch base `daemon_mode_b_main`, não este diff)** — o segundo revisor
sinalizou erros de typecheck em `acpAgent.ts` (`entryCount`/`entrySummary`/`sessionClose`)
e outros itens pré-existentes que ele explicitamente atribuiu à branch base (introduzidos
por #4353). Rastreados separadamente; não tocados aqui.

**Ainda adiados** (documentados): segredo por conexão para `DELETE`/propriedade de conexão
(token permanece a fronteira); WebSocket + HTTP/2 (§7); barreira estrita resultado-prompt
vs atualização final (§11).

---

## 13. Rodada de revisão 4 — incorporações de PR (rebaseado em #4469)

Branch rebaseado em `daemon_mode_b_main` (#4353 + #4469) — **limpo, sem conflitos**. Dois
revisores de PR (GPT-5 + qwen3.7-max). Suíte agora **25 testes**; re-verificado ao vivo
(125 `session/update` → `end_turn`).

| #   | Gravidade | Descoberta                                                                                                                                                                                                 | Correção                                                                                                                                                                                                       |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **P0**    | O "tratamento de falha de escrita SSE" da rodada 3 foi documentado mas NÃO implementado — `SseStream` ainda deixava para chamadores descartarem (streams zumbis).                                           | `writeRaw` agora assume isso: primeira rejeição de escrita registra uma vez + fecha; `doWrite` também escuta `'error'` (rejeita prontamente em vez de esperar `'close'`); `onClose` envolto em try/catch.     |
| C2  | **P1**    | `fromLoopback` capturado apenas no `initialize` + helper mais restrito que REST → votos `local-only` de um POST posterior julgados incorretamente.                                                          | Loopback por requisição encadeado através de `handle`→`sessionCtx`/`resolveClientResponse`; `isLoopbackReq` ampliado para `127.0.0.0/8` + `::ffff:127.*` + `::1` (corresponde ao REST).                      |
| C3  | **P1**    | Roteamento de erro inferia stream de `params.sessionId` → falhas de método escopo de conexão (`session/load`/`resume`/`close`/`heartbeat`) eram roteadas erroneamente para um stream de sessão inexistente (perda silenciosa). | Conjunto `CONN_ROUTED_METHODS`; erros roteados da mesma forma que o caminho de sucesso.                                                                                                                       |
| C4  | **P1**    | `bridge.detachClient` nunca chamado na finalização → ids de cliente carimbados pela bridge obsoletos permanecem em `knownClientIds()`/conjuntos de votantes.                                                | Registro aceita um `DetachSessionFn`; `closeSessionStream`/`destroy` desanexam cada sessão possuída (melhor esforço).                                                                                         |
| C5  | **P1**    | `session/close` pulava limpeza local se `bridge.closeSession` lançasse exceção.                                                                                                                            | `closeSessionStream` movido para um `finally`.                                                                                                                                                                 |
| C6  | **P2**    | `cwd` do Windows (`C:\…`) rejeitado por `startsWith('/')`.                                                                                                                                                  | `path.isAbsolute` (ciente de plataforma), combinando com REST.                                                                                                                                                |
| C7  | **P2**    | `protocolVersion` poderia negociar `0`/negativo.                                                                                                                                                            | Limitar `Math.max(1, Math.min(requested, 1))`; testes para 0/neg/grande/inválido.                                                                                                                             |
| C8  | **P2**    | `session/load`/`resume` aceitavam `sessionId` vazio.                                                                                                                                                        | Rejeitar vazio com `INVALID_PARAMS`.                                                                                                                                                                           |
| C9  | **P2**    | Erros de `session/prompt` no formato notificação desapareciam silenciosamente.                                                                                                                              | Registrar no caminho sem id.                                                                                                                                                                                   |
| C10 | **P2**    | SSE de sessão liberava frames armazenados antes dos headers/`retry:`.                                                                                                                                       | `open()` antes de `attachSessionStream`.                                                                                                                                                                       |
| C11 | **P2**    | `logStderr` local duplicado.                                                                                                                                                                                | Compartilhado `writeStderrLine` de `utils/stdioHelpers`.                                                                                                                                                       |
| C12 | **P2**    | Docs anunciavam flag `--no-acp-http`, tag de capacidade `acp_http` e encaminhamento `fs/*` que não estão na v1.                                                                                            | Doc alinhado à superfície entregue (apenas toggle via env-var; `fs/*`+`terminal/*` + flag + tag marcados como adiados).                                                                                       |
Ainda adiado (inalterado): WebSocket + HTTP/2; segredo por conexão para `DELETE`/propriedade
(token + workspace único continua sendo o limite); barreira estrita de ordenação prompt-resultado; os
casts `as never` de limite de ponte (direcionados, anotados para um acompanhamento de tipos de adaptador).

---

## 14. Rodada de revisão 5 — incorporações de PR

Mais uma passagem de revisor (qwen3.7-max). Suíte **26 testes**, reverificado ao vivo.

| #   | Severidade | Descoberta                                                                                                                                                                                                                                                                                                                                                                              | Correção                                                                                                                                                          |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **P0**     | `resolveClientResponse` deletou a entrada pendente ANTES de chamar `respondToSessionPermission`. Um voto malformado (`result: {}`) faz o mediador da ponte lançar uma exceção — e com a entrada pendente já removida, o `abandonPendingForSession` do teardown não consegue cancelá-la, então o prompt do agente trava em um voto que nunca resolve (um titular de token pode travar uma sessão com um único POST inválido). | Envolver o voto em try/catch; em qualquer falha, recorrer a `cancelAbandonedPermission` para que o mediador seja sempre liberado. Novo teste cobre o caminho do voto malformado. |
| D2  | **P1**     | `onClose` do fluxo da sessão abortou apenas a bomba de eventos, não `binding.promptAbort` — uma desconexão do cliente (fechamento de aba / queda de rede) deixou o prompt em execução (cota + FIFO) até o TTL ocioso.                                                                                                                                                                    | `onClose` agora também aborta o `promptAbort` da sessão.                                                                                                           |
| D3  | **P1**     | Quando `pumpSessionEvents` rejeitava, o `.catch` apenas registrava — o fluxo SSE permanecia aberto enviando heartbeats, mas sem entregar nada (zumbi, sem sinal de reconexão).                                                                                                                                                                                                          | `.catch` agora também chama `closeSessionStream(sessionId)`.                                                                                                               |

---

## 15. Rodada de revisão 6 — incorporações de PR

Mais uma passagem de revisor (qwen3.7-max). Suíte **28 testes**, reverificado ao vivo.

| #   | Severidade | Descoberta                                                                                                                                                                                                                              | Correção                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **P0**     | `handlePrompt` sobrescreveu `binding.promptAbort` sem abortar o controlador anterior — dois `session/prompt`s concorrentes para uma mesma sessão órfãos o primeiro (executa até o fim na FIFO da ponte, não pode ser abortado por `session/cancel`). | Abortar o `promptAbort` anterior antes de instalar o novo. Teste adicionado.                                                                                                                                                                                                                                                                    |
| E2  | **P0**     | O caminho onde `subscribeEvents` lança exceção enviava uma notificação `stream_error` e depois fazia `return` (resolvia) — o `.catch` do chamador nunca disparava, deixando um fluxo SSE zumbi (heartbeats, sem eventos, sem sinal de reconexão). | Relançar a exceção após a notificação para que o `.catch` do chamador feche o fluxo. Teste afirma o fechamento do prompt.                                                                                                                                                                                                                       |
| E3  | **P1**     | O heartbeat SSE não marcava a conexão como ativa — um prompt longo sem eventos intermediários por >30 min era interrompido por ociosidade (fluxos + prompts mortos).                                                                                  | `SseStream` recebe um hook `onHeartbeat`; ambos os handlers GET passam `() => conn.touch()`.                                                                                                                                                                                                                                                    |
| E4  | **P2**     | O `.catch` de `pumpSessionEvents` fechava por sessionId — uma reconexão entre o lançamento da exceção e a microtask poderia matar o NOVO fluxo.                                                                                                        | Guarda de identidade: só fechar se `binding.stream` ainda for este fluxo.                                                                                                                                                                                                                                                                       |
| E6  | **P2**     | `sendSession` criava um binding automaticamente — um frame tardio de pump/reply após `closeSessionStream` ressuscitava um binding fantasma que armazenava em buffer até 256 frames para sempre.                                                                        | `sendSession` agora é apenas consulta: descarta frames quando a sessão não tem um binding ativo.                                                                                                                                                                                                                                                |
| E5  | aceito     | `session/load`/`resume` não rejeitam quando outra conexão ativa possui a sessão ("sequestro").                                                                                                                                       | **Aceito, não alterado:** o limite de confiança do daemon é o bearer token + vinculação de workspace único, e a anexação de múltiplos clientes é intencional (a ponte é multi-cliente por design; o REST tem a mesma propriedade). Um titular de token não ganha nenhuma capacidade que já não tenha via REST. Rastreado com os outros itens de limite de token (propriedade DELETE, §13). |

---

## 16. Rodada de revisão 7 — incorporações de PR

Mais uma passagem de revisor (qwen3.7-max). Suíte **30 testes**, reverificado ao vivo.

| #   | Severidade | Descoberta                                                                                                                                                                                                        | Correção                                                                                                                                                                                                         |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **P0**     | TOCTOU concorrente em `session/close`: `ownedSessions.delete` executava apenas no `finally` (após o await), então dois closes concorrentes ambos passavam `requireOwned` → erro enganoso para o 2º + close redundante da ponte. | Deletar a porta de propriedade SINCRONAMENTE antes do await; o close da ponte executa uma vez. Teste adicionado.                                                                                                |
| F2  | **P1**     | Ciclo de vida da bomba: um fim de iterador CLEAN (subprocesso encerrado, `done`) resolvia → o `.catch` nunca disparava → fluxo zumbi; e um erro de iterador MEIO-DO-FLUXO não enviava `stream_error`.                                   | `pumpSessionEvents` envolve o loop inteiro (erros síncronos e de meio-do-fluxo enviam `stream_error` e depois relançam); o consumidor `.then(onDone, onErr)` fecha o fluxo em AMBOS os caminhos (com guarda de identidade). Testes adicionados. |
| F3  | **P2**     | A rejeição por limite de conexão 503 não tinha log no stderr.                                                                                                                                                                | `writeStderrLine` com o valor do limite.                                                                                                                                                                        |
| F4  | **P2**     | O spread em `_qwen/notify stream_error` permitia que `event.data.kind` sombreasse o discriminador.                                                                                                                             | Fazer o spread primeiro, depois `kind: 'stream_error'`.                                                                                                                                                                  |
| F5  | **P2**     | `MAX_WORKSPACE_PATH_LENGTH` redeclarada (`= 4096`) vs a canônica em `fs/paths.js`.                                                                                                                              | Importar de `../fs/paths.js` (sem divergência).                                                                                                                                                               |
| F6  | **P2**     | `isObjectParams` duplicava `json-rpc.isObject`.                                                                                                                                                               | Importar `isObject`.                                                                                                                                                                                          |
| F7  | **P2**     | `process.stderr.write` cru em `index.ts`/`sse-stream.ts` vs `writeStderrLine` em outros lugares.                                                                                                                       | Unificado em `writeStderrLine` em todo o módulo.                                                                                                                                                             |

---

## 17. Alinhamento de equivalência REST + implementação do plano de extensão auditado (rodada 8)

Objetivo: tornar `/acp` um **substituto equivalente** a REST+SSE. Este lote reconstrói o plano de extensão com base nas conclusões da auditoria e complementa **todas as capacidades já expostas pela ponte**; capacidades que a ponte ainda não possui (E/S de arquivo, fluxos de dispositivo, CRUD de agents/memory) são **primeiro implementadas pelo acp-bridge** conforme a correção arquitetural (ver §17.3).

### 17.1 Auditoria do plano de extensão → implementação (substitui o plano antigo da §5)

Conforme verificado com o **SDK implementado no repositório `@agentclientprotocol/sdk@0.14.1`** (não apenas no site oficial):

- `session/set_config_option` é um método **de primeira classe (não `unstable_`)**, requisição `{sessionId, configId, value}`, `category` contém `model`/`mode`/`thought_level`; enquanto `set_model` ainda usa `unstable_setSessionModel`.
- A especificação reserva o prefixo `_` para extensões, com exemplo no formato de domínio `_zed.dev/…`; dados de fornecedor vão em `_meta` com chaves por domínio.

Implementação:

- **Namespace `_qwen/` → domínio reverso `_qwen/`**; `_meta` unificado como `_meta:{ "qwen": … }` (contém anúncio de capacidade no `initialize` e requestId de `session/request_permission`).
- **Modelo + modo de aprovação → `session/set_config_option` padrão** (`configId:"model"|"mode"`), roteando para `bridge.setSessionModel`/`setSessionApprovalMode` existentes; resultado de `session/new` **anuncia `configOptions`** (obtido do estado da sessão do subprocesso `getSessionContextStatus().state.configOptions`, que já está no formato ACP). **Removido** o método proprietário `_qwen/session/set_model`.
- REST(http+sse) **não precisa de modificação síncrona**: os dois transports compartilham a mesma ponte, o estado é naturalmente consistente.

### 17.2 Novos métodos `/acp` deste lote (ponte já suporta, alinhamento 1:1 com REST)

| REST                                                  | `/acp`                                             | bridge                                   |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `POST /session/:id/model` / `approval-mode`           | `session/set_config_option` **padrão** (model/mode) | setSessionModel / setSessionApprovalMode |
| `GET /session/:id/context`                            | `_qwen/session/context`                            | getSessionContextStatus                  |
| `GET /session/:id/supported-commands`                 | `_qwen/session/supported_commands`                 | getSessionSupportedCommandsStatus        |
| `PATCH /session/:id/metadata`                         | `_qwen/session/update_metadata`                    | updateSessionMetadata                    |
| `GET /workspace/{mcp,skills,providers,env,preflight}` | `_qwen/workspace/{…}`                              | getWorkspace\*Status                     |
| `POST /workspace/init`                                | `_qwen/workspace/init`                             | initWorkspace                            |
| `POST /workspace/tools/:name/enable`                  | `_qwen/workspace/set_tool_enabled`                 | setWorkspaceToolEnabled                  |
| `POST /workspace/mcp/:server/restart`                 | `_qwen/workspace/restart_mcp_server`               | restartMcpServer                         |

(Os já existentes: session/new·load·resume·close·list·prompt·cancel, heartbeat, permission, events já estão alinhados.)

### 17.3 Lacunas restantes → exigir que acp-bridge implemente primeiro (correção arquitetural)

Os **E/S de arquivo** do REST (`/file /glob /list /stat /file/write /file/edit`), **login por fluxo de dispositivo** (`/workspace/auth/*`), **CRUD de agents** (`/workspace/agents`), **CRUD de memory** (`/workspace/memory`) atualmente **não estão em `HttpAcpBridge`** — as rotas REST chamam diretamente serviços de nível de rota (`WorkspaceFileSystemFactory`, `DeviceFlowRegistry`, `SubagentManager`, `writeWorkspaceContextFile`), ignorando a ponte.

**Decisão (adotando opinião do revisor/proprietário)**: não fazer o transport `/acp` conectar-se diretamente a esses serviços de nível de rota (isso replicaria a deriva arquitetural do REST e dobraria o acoplamento do transport). **A abordagem correta é primeiro implementar essas capacidades no `HttpAcpBridge` do `@qwen-code/acp-bridge`** (ex.: `readWorkspaceFile`/`writeWorkspaceFile`/`globWorkspace`, `startDeviceFlow`/`pollDeviceFlow`, `listAgents`/`upsertAgent`/`deleteAgent`, `readMemory`/`writeMemory`), fazendo tanto REST quanto `/acp` passarem pela ponte. Nesse ponto, `/acp` adicionará `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` (leitura de arquivo, por não haver método padrão ACP client→agent, é uma extensão proprietária legítima).

**Equivalência completa = este lote (capacidades já existentes na ponte) + lotes subsequentes após acp-bridge preencher as lacunas**.

---

## 18. Rodada de revisão 9 — incorporações de PR

| #   | Severidade            | Descoberta                                                                                                                                                                                                                                                                             | Correção                                                                                                                                                                                     |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **P1 (regressão)**    | A reconexão do fluxo da sessão abortou o prompt em execução: `attachSessionStream` fechava o fluxo ANTIGO antes de instalar o novo, e o `onClose` do fluxo antigo abortava incondicionalmente `promptAbort` — então um cliente se reconectando (falha de rede/roaming) perdia seu prompt em execução. | Instalar o novo fluxo ANTES de fechar o antigo; usar guarda de identidade no aborto de prompt do `onClose` (só abortar se ESTE ainda for o fluxo ativo da sessão). Teste adicionado (prompt sobrevive à reconexão). |
| G2  | **P2**              | `session/cancel` passava `undefined` como corpo do `CancelNotification`, descartando campos de cancelamento fornecidos pelo cliente (reason/context) que o REST encaminha.                                                                                                                   | Encaminhar `{ ...params, sessionId }` (espelha REST).                                                                                                                                      |

Rebaseado no `daemon_mode_b_main` mais recente (#4473/#4483/#4484/#4500), sem conflitos. Suíte **33 testes**, reverificado ao vivo.

---

## 19. Roadmap / PRs subsequentes (para não esquecer)

Este PR (#4472) = Transporte HTTP Streamable ACP + **alinhamento completo de capacidades apoiadas pela ponte** + plano de extensão oficial. Já marcado como **ready**. Para atingir "`/acp` completamente equivalente a REST+SSE" ainda é necessário:

1. **PR subsequente 1 — Complemento de capacidades do acp-bridge (pré-requisito / ponte primeiro)**: Adicionar métodos de E/S de arquivo, fluxo de dispositivo, CRUD de agents, CRUD de memory no `HttpAcpBridge`; rotas REST passarem a usar a ponte (eliminando a deriva de conexão direta a serviços de nível de rota).
2. **PR subsequente 2 — Alinhamento restante de `/acp` (dependente do PR 1)**: `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` → equivalência completa com REST.

Rastreamento: #3803 (decisões em aberto), #4175 (roadmap Modo B) já comentados.
Itens adiados a serem endurecidos estão na descrição do PR "adiados conhecidos".

---

## 20. Renomeação de namespace de extensão + análise de transport SDK (rodada 11)

- **Namespace `_qwen.ai/` → `_qwen/`**: A única regra rígida do ACP é o `_` inicial; o segmento de domínio `_zed.dev/` é uma convenção por exemplo, não um MUST. Como `qwen` é distintivo, usamos a forma abreviada simples. A chave `_meta` também será `"qwen"`. (Pesquisa de agentes reais: Zed/gemini-cli usam principalmente `_meta` em métodos padrão + `unstable_*` do próprio ACP; métodos `_` personalizados são raros — nossos `_qwen/*` são operações de workspace/sessão genuinamente novas sem equivalente padrão, então um método `_` é a ferramenta correta.)
- **Por que transport artesanal (não baseado em SDK)**: o SDK em TS fornece apenas `ndJsonStream` (stdio); o HTTP do RFD #721 é SDK Fase 3 (não implementado). A `Connection` do SDK é um único fluxo duplex; nosso transport é multi-fluxo (POSTs + conexão-SSE + sessão-SSE por sessão) e precisa de demux de saída por sessionId — que nosso dispatcher já conhece no momento do roteamento. Uma reescrita completa com o SDK lutaria contra esse modelo e não removeria a maior parte (tradução da ponte, ciclo de vida SSE, propriedade, EventBus→JSON-RPC). **Melhoria pragmática (candidata a PR subsequente): adotar os validadores de esquema Zod + tipos do SDK para validação de parâmetros, mantendo o transport artesanal.** Clientes SDK usando `extMethod('_qwen/…')` interoperam com nossos handlers (formato de transmissão idêntico).