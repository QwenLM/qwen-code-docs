# Camada de Abstração DaemonTransport

> Branch alvo: `main`. Autor: arnoo.gao. Data: 2026-06-12. Status: **Design v4 — revisão**.
> Fluxo de trabalho design-first por repositório: este documento é finalizado antes do PR de implementação.

---

## 0. TL;DR

`DaemonClient` codifica REST+SSE rigidamente. Integrações de terceiros que desejam ACP
WebSocket precisam dar fork na pilha do provider (~8 arquivos). Esta proposta adiciona uma
**interface `DaemonTransport`** com métodos `fetch` + `subscribeEvents`,
além de detecção automática e fallback em tempo de execução, permitindo transports
plugáveis com **zero mudanças que quebrem compatibilidade**.

**Mudança total: ~1300 linhas** em um único PR de implementação. Consumidores
existentes intocados — `new DaemonClient({ baseUrl, token })` = comportamento atual.

---

## 1. Contexto

### 1.1 Arquitetura atual

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← codificado rigidamente
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67 métodos públicos, cada um construindo URLs REST e ramificando com base em status
HTTP. `fetch` já é injetável via `DaemonClientOptions.fetch`, mas
`subscribeEvents` tem lógica específica de SSE inline (verificação de content-type, parsing de SSE,
timeout de fase de conexão) que não pode ser trocada apenas com injeção de fetch.

### 1.2 O problema para terceiros

Quando um terceiro (ex.: `agent-web`) cria um `AcpSessionProvider` para usar
WebSocket em vez de REST+SSE:

- **Se eles substituírem** `DaemonSessionProvider`: componentes que leem
  `DaemonStoreContext` (ex.: TerminalView) perdem seu contexto → crash.
- **Se eles mantiverem ambos os providers**: duas fontes de eventos, duas stores, dessincronização.
- **Se eles injetarem eventos** na store do SDK: `DaemonSessionProvider` também
  assina SSE internamente → eventos duplicados.

**Causa raiz**: alterar o transporte requer substituir o provider, porque
`subscribeEvents` do `DaemonClient` está codificado rigidamente como SSE.

### 1.3 Alvo

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → mapeia URL+verbo para JSON-RPC via WS
  └─ transport.subscribeEvents → demux notificações WS → DaemonEvent
```

Um provider, uma store, transporte é um detalhe interno. Terceiros passam
`transport` para `DaemonClient`; todo o resto funciona inalterado.

---

## 2. Design

### 2.1 Interface

```typescript
interface DaemonTransportFetchOptions {
  timeout?: number; // 0 = sem timeout. undefined = padrão do transporte.
}

interface DaemonTransportSubscribeOptions {
  lastEventId?: number;
  maxQueued?: number;
  signal?: AbortSignal;
  connectTimeoutMs?: number;
}

interface DaemonTransport {
  /**
   * Envia uma requisição e retorna uma Response.
   *
   * Contrato:
   * - Response DEVE suportar .json(), .text(), .ok, .status,
   *   .headers.get(), .body?.cancel()
   * - .status DEVE ser um código de status HTTP preciso
   *   (200, 201, 202, 204, 404, etc.)
   * - Corpos de erro DEVEM preservar a forma estruturada do daemon
   * - Chamável sem configuração prévia; o transporte manipula init internamente
   *   (padrão lazy-init / init-once deferred)
   * - Lança DaemonTransportClosedError quando a conexão está morta
   * - Quando init.signal aborta: para requisições de prompt, o transporte DEVE
   *   cancelar o prompt em andamento na rede (WS: enviar session/cancel
   *   RPC; HTTP: abortar fetch). Para requisições comuns, abortar apenas
   *   rejeita/cancela a requisição pendente sem efeitos colaterais.
   *   Resposta pendente rejeita com AbortError.
   */
  fetch(
    url: string,
    init: RequestInit,
    opts?: DaemonTransportFetchOptions,
  ): Promise<Response>;

  /**
   * Assina eventos de sessão.
   *
   * Contrato:
   * - Eventos com id DEVEM ter ids inteiros monotônicos; quadros sintéticos/terminais
   *   (ex.: stream_error) PODEM omitir id (DaemonEvent.id é opcional)
   * - DEVE entregar TODOS os tipos de evento (sessão + workspace) em um único stream
   * - Abortar signal DEVE parar apenas este gerador, NÃO a conexão
   * - Quando a conexão morre, todos os geradores pendentes DEVEM lançar
   *   DaemonTransportClosedError (o transporte mantém referências aos geradores)
   * - DEVE aplicar connectTimeoutMs apenas à fase de conexão
   * - O transporte DEVE declarar se replay baseado em lastEventId é suportado;
   *   se não, o consumidor DEVE usar session/load para ressincronização total na reconexão
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** Identidade do transporte para switching exaustivo. */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** Se este transporte suporta replay baseado em Last-Event-ID na reconexão.
   *  Quando false, o consumidor DEVE usar session/load para ressincronização total. */
  readonly supportsReplay: boolean;

  /** False após queda de conexão ou dispose(). */
  readonly connected: boolean;

  /** Desmontagem idempotente. */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 Por que dois métodos (fetch + subscribeEvents), não apenas fetch

`subscribeEvents` tem semânticas de rede fundamentalmente diferentes por transporte:

| Transporte | Mecanismo de rede                                                    |
| ---------- | -------------------------------------------------------------------- |
| REST       | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent`   |
| ACP HTTP   | `GET /acp` (SSE com escopo de sessão) → desempacotamento de notificação JSON-RPC |
| ACP WS     | Demux de notificações de socket compartilhado por sessionId          |
Forçar essas operações em um formato `fetch` exige recodificação/decodificação SSE
(WS → SSE texto fictício → `parseSseStream` → DaemonEvent) — ineficiente e frágil.

Todos os outros 66 métodos funcionam via `fetch` porque seguem semânticas
requisição→resposta independentemente do transporte.

### 2.3 Por que no nível fetch, e não no dispatch de métodos

Os 67 métodos do DaemonClient contêm ramificações HTTP por método:

- `prompt()`: verificação de status 202 vs 200
- `deleteWorkspaceAgent()`: 204 vs 404 com inspeção do body
- `respondToPermission()`: 200 vs 404 para detecção de concorrência
- 6 métodos ignoram `fetchWithTimeout` chamando `_fetch` diretamente

Uma interface de dispatch de métodos (`request<T>(method, params)`) força a duplicação
de toda essa lógica em cada transporte. O nível fetch mantém o DaemonClient inalterado.

### 2.4 Mudanças no DaemonClient (~40 linhas)

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch; // Mantido
  fetchTimeoutMs?: number; // Mantido
  transport?: DaemonTransport; // NOVO — substituição opcional
}
```

Mudanças internas:

- Construtor: `this.transport = opts.transport ?? new RestSseTransport(...)`
- `fetchWithTimeout`: delegar para `this.transport.fetch(url, init, { timeout })`
- 6 locais de `this._fetch` direto (prompt, promptNonBlocking, recapSession,
  btwSession, shellCommand, subscribeEvents): substituir por
  `this.transport.fetch(url, init, { timeout: 0 })`
- `subscribeEvents`: switch exaustivo em `this.transport.type`:
  - `'rest'`: delegar para `this.transport.subscribeEvents(sessionId, opts)`
  - padrão: mesma delegação (cada transporte lida com seu próprio formato de rede)
- Remover campo `private _fetch` (substituído pelo transport)

### 2.5 Ponto de injeção do Provider

`DaemonWorkspaceProvider` e `DaemonSessionProvider` ambos constroem
`DaemonClient` internamente. Para permitir que terceiros injetem um transporte sem
contornar o provider:

```typescript
// DaemonWorkspaceProvider — adicionar prop opcional de transport
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // NOVO — repassado para DaemonClient
  // ...props existentes
}

// DaemonSessionProvider — herda do contexto do workspace
// Nenhuma prop de transport necessária; lê do contexto do workspace
```

Quando `transport` é fornecido, o provider o passa para `DaemonClient`:

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

Quando omitido: comportamento atual (REST+SSE). ~5 linhas de mudança no provider.

### 2.5 RestSseTransport (~80 linhas)

Encapsula `globalThis.fetch` + extrai a lógica SSE atual de
`DaemonClient.subscribeEvents`:

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSE suporta Last-Event-ID
  readonly connected = true; // REST é sem estado

  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly _fetch: typeof globalThis.fetch,
  ) {}

  fetch(url, init, opts?) {
    return this._fetch(url, init);
  }

  async *subscribeEvents(sessionId, opts) {
    // Lógica atual de DaemonClient.subscribeEvents movida para cá:
    // - construir URL a partir de this.baseUrl + sessionId
    // - definir cabeçalho Authorization a partir de this.token
    // - timeout de fase de conexão de opts.connectTimeoutMs
    // - fetch → validar content-type → parseSseStream → yield
  }

  dispose() {} // no-op
}
```

### 2.6 Detalhes internos do transporte ACP

**AcpWsTransport** (~400-600 linhas):

- Inicialização preguiçosa: primeira chamada `fetch` abre WS + envia `initialize`
- Tabela de mapeamento URL→JSON-RPC: `/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- Multiplexador de requisições: `Map<id, {resolve, reject}>` para requisições pendentes
- `subscribeEvents`: filtra stream compartilhada de notificações por sessionId
- `connected`: monitora estado readyState do WS
- `supportsReplay`: false (WS não tem Last-Event-ID; consumidor deve usar `session/load`)
- Sintetiza objetos `Response` com `.status`/`.json()`/`.text()` corretos

**AcpHttpTransport** (~800-1000 linhas):

- Inicialização preguiçosa: primeira chamada `fetch` envia `POST /acp {initialize}`
- Gerencia streams SSE escopo-conexão + escopo-sessão internamente
- Mesmo mapeamento URL→JSON-RPC + correlação de requisições
- `supportsReplay`: true (SSE de sessão suporta Last-Event-ID)

### 2.7 Detecção automática de transporte

O servidor anuncia os transportes suportados em `GET /capabilities`:

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...campos de capabilities existentes...
}
```

O SDK fornece uma factory estática de uso único:

```typescript
// Sonda uma vez antes da renderização React, nunca alterna no meio da sessão
const transport = await DaemonTransport.negotiate(baseUrl, token);
// Retorna o melhor disponível: acp-ws > acp-http > rest (fallback)
```

Implementação:

1. `GET /capabilities` → ler array `transports`
2. Se `acp-ws` estiver na lista → tentar upgrade WS; em caso de sucesso, retornar `AcpWsTransport`
3. Se WS falhar ou não estiver na lista → tentar `acp-http`; em caso de sucesso, retornar `AcpHttpTransport`
4. Fallback → `RestSseTransport`

Nenhuma API existente é afetada: `GET /capabilities` adiciona um novo campo (aditivo);
consumidores existentes ignoram campos desconhecidos.
### 2.8 Fallback em tempo de execução (WS → REST na desconexão)

Quando um transporte não-REST desconecta no meio da sessão:

```
AcpWsTransport (connected=true)
  │
  ├── WS drops (network, server restart, idle timeout)
  │
  ├── connected = false
  ├── All pending fetch() calls → reject with DaemonTransportClosedError
  ├── All subscribeEvents generators → throw DaemonTransportClosedError
  │
  └── Consumer (Provider / third party) detects disconnect:
        1. Create new RestSseTransport (guaranteed to work if daemon is up)
        2. Create new DaemonClient({ transport: newTransport })
        3. For each active session: session/load to re-attach
        4. Resume event subscription
```

**Restrição principal**: o fallback em tempo de execução é **orientado pelo consumidor, não interno ao transporte**.
O transporte não alterna silenciosamente entre protocolos — ele falha de forma explícita
(`DaemonTransportClosedError`) e o consumidor decide se deve reconstruir.

Justificativa:

- O desligamento do WS destrói todas as sessões próprias no lado do servidor (`registry.delete` →
  `conn.destroy`). Uma alternância silenciosa esconderia essa perda de dados.
- `session/load` reconecta-se à sessão bridge existente (transcrições preservadas),
  mas o prompt em andamento é abortado. O consumidor deve lidar com isso
  explicitamente (repetir ou exibir ao usuário).
- Ainda não há retomada de `Last-Event-ID` entre transportes (Fase 4). Eventos entre
  a desconexão e a reconexão podem ser perdidos. O consumidor deve solicitar uma
  ressincronização completa de estado via `session/load` (que reproduz o histórico).

**AutoReconnectTransport** (~150 linhas, wrapper opcional):

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // On DaemonTransportClosedError from inner transport:
  // 1. Try to re-create preferred transport
  // 2. If preferred fails, fallback to REST
  // 3. Re-initialize connection
  // Caller still needs to session/load — this wrapper only
  // handles transport-level reconnect, not session-level.
}
```

Este wrapper é opt-in. Consumidores existentes que não desejam reconexão automática
simplesmente capturam `DaemonTransportClosedError` e lidam com isso por conta própria.

**Impacto na funcionalidade existente**: zero. Todo o código de detecção automática e fallback
é aditivo e opt-in. `new DaemonClient({ baseUrl, token })` sem
`transport` = comportamento REST atual, sem detecção automática, sem lógica de fallback.

---

## 3. Auditoria de mudanças disruptivas

### Veredito: zero mudanças disruptivas

| API pública                              | Mudança                                   | Disruptiva? |
| ---------------------------------------- | ----------------------------------------- | :---------: |
| `new DaemonClient({ baseUrl, token })`   | Sem alteração                             |     ❌      |
| `DaemonClientOptions.*`                  | Tudo mantido, `transport` adicionado      |     ❌      |
| `DaemonHttpError`                        | Inalterado                                |     ❌      |
| `DaemonSessionClient`                    | Zero alterações (delega para DaemonClient)|     ❌      |
| Todas as exportações de tipo (100+)      | Inalterados                               |     ❌      |

### Impacto por consumidor

| Consumidor                     | Impacto                                  |
| ------------------------------ | ---------------------------------------- |
| webui (25 arquivos)            | Zero alterações de código                |
| web-shell (4 arquivos)         | Zero alterações de código                |
| vscode-ide-companion (1 arquivo)| Zero alterações de código               |
| Terceiros                      | Zero para REST; passe `transport` para ACP|

---

## 4. Decisões de design

| Decisão                                                      | Justificativa                                                                                                                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeEvents` no transporte, não apenas `fetch`          | A re-codificação de SSE via fetch é ineficiente e frágil                                                                                                                             |
| `connected: boolean` no transporte                           | O loop de reconexão do provedor precisa distinguir 'transporte morto' de '500 transitório'                                                                                           |
| Inicialização preguiçosa (sem `connect()` explícito)         | Mantém a construção do DaemonClient síncrona; o padrão `new RestSseTransport()` não precisa de inicialização                                                                          |
| Detecção automática é única, não durante a sessão            | `negotiate()` testa uma vez na inicialização; o fallback em tempo de execução é orientado pelo consumidor via `DaemonTransportClosedError`, não alternância interna silenciosa        |
| Nenhum pré-requisito de taxonomia de erros                   | Os transportes ACP mapeiam erros para códigos de status equivalentes HTTP internamente; `DaemonHttpError` funciona como está                                                          |
| Provedor recebe a prop `transport`                           | `DaemonWorkspaceProvider` ganha a prop opcional `transport` (~5 linhas), encaminhada ao construtor de `DaemonClient`. Terceiros definem esta prop; omiti-la = comportamento REST atual |
---

## 5. Alternativas consideradas

### 5.1 Injeção personalizada de fetch (sem nova interface)

Passar um `fetch` baseado em WS via o `DaemonClientOptions.fetch` existente.

**Rejeitado**: `subscribeEvents` valida `content-type: text/event-stream` e
usa `parseSseStream`. Um fetch personalizado precisaria recodificar frames WS como texto SSE, e
então o SDK os decodificaria de volta — conversão desnecessária de ida e volta. Além disso,
`capabilities()` e `initialize` têm formatos de resposta diferentes, exigindo uma camada de mapeamento de formato.

### 5.2 Interface formal completa (4 PRs, ~2750 linhas)

Taxonomia de erros → Interface → AcpHttp → AcpWs como PRs separados.

**Rejeitado**: engenharia excessiva. Taxonomia de erros é desnecessária (transportes ACP podem
mapear para códigos de status equivalentes HTTP). PRs separados aumentam o custo de troca de contexto de revisão
para uma abstração coesa única.

### 5.3 Provedor duplo com BridgeContext

`AcpSessionProvider` + `ChatBridgeContext` + `SessionBridgeContext` em paralelo.

**Rejeitado**: causa dessincronização de armazenamento, requer ~8 arquivos, não funciona sem alterações no SDK.

---

## 6. Plano de implementação (PR único)

Todas as alterações são incluídas em um único PR. Estimado ~1300 linhas no total.

| Arquivo                                                            | Alteração                                                                | Linhas   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`           | Interface + tipos + `DaemonTransportClosedError` + fábrica `negotiate()` | ~110     |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`          | Encapsula `globalThis.fetch` + lógica SSE extraída do DaemonClient        | ~80      |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`            | Multiplexador WS + mapeamento URL→JSON-RPC + correlação de requisições   | ~400     |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`          | POST /acp + gerenciamento de SSE de conexão/sessão                       | ~300     |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`      | Mapeamento de notificação JSON-RPC → evento DaemonEvent                   | ~150     |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`    | Encapsulamento opcional: reconexão + fallback                             | ~150     |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`              | Construtor + 6 locais `_fetch` + reescrita de subscribeEvents            | ~40 net  |
| `packages/sdk-typescript/src/daemon/index.ts`                     | Exportar novos tipos                                                     | ~10      |
| `packages/cli/src/serve/server.ts`                                | Adicionar campo `transports` em `GET /capabilities`                      | ~5       |
| `packages/sdk-typescript/src/daemon/types.ts`                     | Adicionar `transports` ao tipo `DaemonCapabilities`                      | ~3       |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx` | Adicionar prop opcional `transport`, repassar para `DaemonClient`        | ~5       |
| Testes                                                            | Testes de unidade + integração do transporte                             | ~200     |

**Compatibilidade com versões anteriores**: `new DaemonClient({ baseUrl, token })` sem
`transport` = comportamento REST+SSE idêntico. Todos os testes existentes passam sem alterações.

---

## 7. Verificação

1. **Compatibilidade com versões anteriores**: `npm run test` em sdk-typescript e webui — zero
   alterações nos testes necessárias. `new DaemonClient({ baseUrl, token })` = comportamento idêntico.
2. **Extração do RestSseTransport**: comportamento SSE bit a bit equivalente confirmado
   pela suíte de testes existente.
3. **AcpWsTransport**: teste de integração conectando-se a um daemon real via WS. Verificar:
   - `subscribeEvents` produz as mesmas formas de `DaemonEvent` que o SSE via REST
   - o branching prompt 202/200 funciona com a Response sintetizada
   - voto de permissão viaja corretamente
   - `connected` transita para `false` na queda do WS
   - sinal de aborto no prompt → WS envia RPC session/cancel
4. **AcpHttpTransport**: mesma verificação do WS, mas via HTTP+SSE.
5. **Detecção automática**: `negotiate()` retorna o melhor transporte; fallback para REST em falha do WS.
6. **Fallback em tempo de execução**: `AutoReconnectTransport` captura `DaemonTransportClosedError`,
   reconstrói o transporte, consumidor chama `session/load` para ressincronizar.
7. **Provedor**: `DaemonWorkspaceProvider` com prop `transport` — ChatView e
   TerminalView ambos leem do mesmo armazenamento.
8. **Ponta a ponta**: Terceiro passa `transport={new AcpWsTransport(url, token)}`
   para `DaemonWorkspaceProvider`. Todos os hooks do SDK e o armazenamento de transcrição funcionam sem alterações.

---

## 8. Riscos

| Risco                                             | Mitigação                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Manutenção da tabela de mapeamento URL→JSON-RPC   | Tabela colocalizada com o transporte; mudanças nas rotas do daemon exigem atualização do transporte                       |
| Fidelidade da Response sintetizada do ACP WS      | Fornecer auxiliar `syntheticResponse(status, json)`; documentar contrato (`.json()`, `.text()`, `.status`, `.body?.cancel()`) |
| Monotonicidade de `DaemonEvent.id` para WS        | As notificações JSON-RPC do servidor ACP carregam id do evento; o transporte expõe diretamente                           |
| Prompt 202 vs 200 para WS                         | Transporte mapeia resposta JSON-RPC → 200 com corpo do resultado (caminho bloqueante); eventos ainda fluem via `subscribeEvents` |
| Detecção de queda de conexão WS                   | `connected: boolean` + `DaemonTransportClosedError` lançado de `fetch`                                                   |
