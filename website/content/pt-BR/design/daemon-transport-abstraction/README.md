# Camada de Abstração DaemonTransport

> Branch alvo: `main`. Autor: arnoo.gao. Data: 2026-06-12. Status: **Design v4 — revisão**.
> Fluxo de trabalho design-first por repositório: este documento é publicado antes do PR de implementação.

---

## 0. TL;DR

`DaemonClient` codifica REST+SSE de forma fixa. Integrações de terceiros que desejam usar ACP WebSocket precisam fazer fork da pilha do provedor (~8 arquivos). Esta proposta adiciona uma **interface `DaemonTransport`** com métodos `fetch` + `subscribeEvents`, além de detecção automática e fallback em tempo de execução, permitindo transportes plugáveis com **zero quebras de compatibilidade**.

**Mudança total: ~1300 linhas** em um único PR de implementação. Consumidores existentes não são afetados — `new DaemonClient({ baseUrl, token })` = comportamento atual.

---

## 1. Background

### 1.1 Arquitetura atual

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← codificado
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67 métodos públicos, cada um construindo URLs REST e ramificando com base em códigos de status HTTP. `fetch` já é injetável via `DaemonClientOptions.fetch`, mas `subscribeEvents` possui lógica SSE embutida (verificação de content-type, parsing SSE, timeout de fase de conexão) que não pode ser substituída apenas via injeção de fetch.

### 1.2 O problema para terceiros

Quando um terceiro (ex.: `agent-web`) constrói um `AcpSessionProvider` para usar WebSocket em vez de REST+SSE:

- **Se substituir** `DaemonSessionProvider`: componentes que leem `DaemonStoreContext` (ex.: TerminalView) perdem o contexto → crash.
- **Se manter ambos os provedores**: duas fontes de eventos, dois stores, dessincronização.
- **Se injetar eventos** no store do SDK: `DaemonSessionProvider` também assina SSE internamente → eventos duplicados.

**Causa raiz**: mudar o transporte exige substituir o provedor, porque `subscribeEvents` do `DaemonClient` está codificado para SSE.

### 1.3 Alvo

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → mapeia URL+verbo para JSON-RPC sobre WS
  └─ transport.subscribeEvents → demux notificações WS → DaemonEvent
```

Um provedor, um store, transporte é um detalhe interno. Terceiros passam `transport` para `DaemonClient`; todo o resto funciona inalterado.

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
   * Envia uma requisição e retorna um Response.
   *
   * Contrato:
   * - Response DEVE suportar .json(), .text(), .ok, .status,
   *   .headers.get(), .body?.cancel()
   * - .status DEVE ser um código de status HTTP preciso
   *   (200, 201, 202, 204, 404, etc.)
   * - Corpos de erro DEVEM preservar a estrutura do daemon
   * - Chamável sem configuração prévia; o transporte gerencia init internamente
   *   (padrão lazy-init / init-once deferred)
   * - Lança DaemonTransportClosedError quando a conexão está morta
   * - Quando init.sinal aborta: para requisições de prompt, o transporte DEVE
   *   cancelar o prompt em andamento na rede (WS: enviar RPC session/cancel;
   *   HTTP: abortar fetch). Para requisições comuns, abortar apenas rejeita/cancela
   *   a requisição pendente sem efeitos colaterais.
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
   * - DEVE entregar TODOS os tipos de evento (sessão + workspace) em um único fluxo
   * - Abortar o sinal DEVE parar apenas este generator, NÃO a conexão
   * - Quando a conexão morre, todos os generators pendentes DEVEM lançar
   *   DaemonTransportClosedError (o transporte mantém referências aos generators)
   * - DEVE aplicar connectTimeoutMs apenas à fase de conexão
   * - O transporte DEVE declarar se a repetição baseada em lastEventId é suportada;
   *   se não, o consumidor DEVE usar session/load para ressincronização completa ao reconectar
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** Identidade do transporte para switch exaustivo. */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** Se este transporte suporta repetição baseada em Last-Event-ID ao reconectar.
   *  Quando false, o consumidor DEVE usar session/load para ressincronização completa. */
  readonly supportsReplay: boolean;

  /** False após queda de conexão ou dispose(). */
  readonly connected: boolean;

  /** Encerramento idempotente. */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 Por que dois métodos (fetch + subscribeEvents), não apenas fetch

`subscribeEvents` tem semânticas de rede fundamentalmente diferentes por transporte:

| Transporte | Mecanismo de rede                                                     |
| ---------- | --------------------------------------------------------------------- |
| REST       | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent`    |
| ACP HTTP   | `GET /acp` (SSE com escopo de sessão) → desempacotamento de notificação JSON-RPC |
| ACP WS     | Demux de notificações de socket compartilhado por sessionId           |

Forçar isso através de um buraco em forma de fetch exige recodificar/decodificar SSE (WS → texto SSE falso → `parseSseStream` → DaemonEvent) — ineficiente e frágil.

Todos os outros 66 métodos funcionam através de `fetch` porque seguem semântica requisição→resposta independentemente do transporte.

### 2.3 Por que nível fetch, não dispatch de método

Os 67 métodos do DaemonClient contêm ramificações HTTP por método:

- `prompt()`: verificação de status 202 vs 200
- `deleteWorkspaceAgent()`: 204 vs 404 com inspeção de corpo
- `respondToPermission()`: 200 vs 404 para detecção de condição de corrida
- 6 métodos ignoram `fetchWithTimeout` chamando `_fetch` diretamente

Uma interface de dispatch de método (`request<T>(method, params)`) força a duplicação de toda essa lógica em cada transporte. O nível fetch mantém o DaemonClient inalterado.

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
- 6 locais com `this._fetch` direto (prompt, promptNonBlocking, recapSession,
  btwSession, shellCommand, subscribeEvents): substituir por
  `this.transport.fetch(url, init, { timeout: 0 })`
- `subscribeEvents`: switch exaustivo em `this.transport.type`:
  - `'rest'`: delegar para `this.transport.subscribeEvents(sessionId, opts)`
  - padrão: mesma delegação (cada transporte gerencia seu próprio formato de rede)
- Remover campo `private _fetch` (substituído pelo transporte)

### 2.5 Ponto de injeção do provedor

`DaemonWorkspaceProvider` e `DaemonSessionProvider` constroem `DaemonClient` internamente. Para permitir que terceiros injetem um transporte sem contornar o provedor:

```typescript
// DaemonWorkspaceProvider — adicionar prop opcional transport
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // NOVO — encaminhado para DaemonClient
  // ...props existentes
}

// DaemonSessionProvider — herda do contexto do workspace
// Nenhuma prop transport necessária; lê do contexto do workspace
```

Quando `transport` é fornecido, o provedor o passa para `DaemonClient`:

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

Quando omitido: comportamento atual (REST+SSE). ~5 linhas de mudança no provedor.

### 2.5 RestSseTransport (~80 linhas)

Encapsula `globalThis.fetch` + extrai a lógica SSE atual de `DaemonClient.subscribeEvents`:

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSE suporta Last-Event-ID
  readonly connected = true; // REST é stateless

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
    // - timeout de fase de conexão a partir de opts.connectTimeoutMs
    // - fetch → validar content-type → parseSseStream → yield
  }

  dispose() {} // no-op
}
```

### 2.6 Internals do transporte ACP

**AcpWsTransport** (~400-600 linhas):

- Lazy-init: primeira chamada `fetch` abre WS + envia `initialize`
- Tabela de mapeamento URL→JSON-RPC: `/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- Multiplexador de requisições: `Map<id, {resolve, reject}>` para requisições pendentes
- `subscribeEvents`: filtrar fluxo de notificações compartilhado por sessionId
- `connected`: rastreia readyState do WS
- `supportsReplay`: false (WS não tem Last-Event-ID; consumidor deve usar `session/load`)
- Sintetiza objetos `Response` com `.status`/`.json()`/`.text()` corretos

**AcpHttpTransport** (~800-1000 linhas):

- Lazy-init: primeira chamada `fetch` envia `POST /acp {initialize}`
- Gerencia internamente fluxos SSE com escopo de conexão + escopo de sessão
- Mesmo mapeamento URL→JSON-RPC + correlação de requisições
- `supportsReplay`: true (session SSE suporta Last-Event-ID)

### 2.7 Detecção automática de transporte

O servidor anuncia os transportes suportados em `GET /capabilities`:

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...campos existentes de capabilities...
}
```

O SDK fornece uma factory estática de uso único:

```typescript
// Sondar uma vez antes da renderização React, nunca alternar no meio da sessão
const transport = await DaemonTransport.negotiate(baseUrl, token);
// Retorna o melhor disponível: acp-ws > acp-http > rest (fallback)
```

Implementação:

1. `GET /capabilities` → ler array `transports`
2. Se `acp-ws` na lista → tentar upgrade WS; em caso de sucesso, retornar `AcpWsTransport`
3. Se WS falhar ou não estiver na lista → tentar `acp-http`; em caso de sucesso, retornar `AcpHttpTransport`
4. Fallback → `RestSseTransport`

Nenhuma API existente é afetada: `GET /capabilities` adiciona um novo campo (aditivo),
consumidores existentes ignoram campos desconhecidos.

### 2.8 Fallback em tempo de execução (WS → REST ao desconectar)

Quando um transporte não-REST desconecta no meio da sessão:

```
AcpWsTransport (connected=true)
  │
  ├── WS cai (rede, reinicialização do servidor, timeout de inatividade)
  │
  ├── connected = false
  ├── Todas as chamadas fetch() pendentes → rejeitam com DaemonTransportClosedError
  ├── Todos os generators subscribeEvents → lançam DaemonTransportClosedError
  │
  └── Consumidor (Provedor / terceiro) detecta desconexão:
        1. Criar novo RestSseTransport (garantido funcionar se o daemon estiver ativo)
        2. Criar novo DaemonClient({ transport: newTransport })
        3. Para cada sessão ativa: session/load para reanexar
        4. Retomar assinatura de eventos
```

**Restrição importante**: fallback em tempo de execução é **orientado pelo consumidor, não interno ao transporte**.
O transporte não troca silenciosamente de protocolo — ele falha alto
(`DaemonTransportClosedError`) e o consumidor decide se deve reconstruir.

Justificativa:

- O encerramento do WS destrói todas as sessões no servidor (`registry.delete` →
  `conn.destroy`). Uma troca silenciosa esconderia essa perda de dados.
- `session/load` reanexa à sessão bridge existente (transcrições preservadas),
  mas o prompt em andamento é abortado. O consumidor deve lidar com isso
  explicitamente (re tentar ou exibir ao usuário).
- Nenhuma retomada `Last-Event-ID` entre transportes ainda (Fase 4). Eventos entre
  desconexão e reconexão podem ser perdidos. O consumidor deve solicitar uma
  ressincronização completa de estado via `session/load` (que reproduz o histórico).

**AutoReconnectTransport** (~150 linhas, wrapper opcional):

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // Ao receber DaemonTransportClosedError do transporte interno:
  // 1. Tentar recriar o transporte preferido
  // 2. Se preferido falhar, voltar para REST
  // 3. Reinicializar a conexão
  // O chamador ainda precisa fazer session/load — este wrapper apenas
  // lida com reconexão em nível de transporte, não em nível de sessão.
}
```

Este wrapper é opt-in. Consumidores existentes que não querem reconexão automática
simplesmente capturam `DaemonTransportClosedError` e lidam manualmente.

**Impacto na funcionalidade existente**: zero. Todo o código de detecção automática
e fallback é aditivo e opt-in. `new DaemonClient({ baseUrl, token })` sem
`transport` = comportamento REST atual, sem detecção automática, sem lógica de fallback.

---

## 3. Auditoria de quebras de compatibilidade

### Veredito: zero quebras de compatibilidade

| API Pública                            | Mudança                                   | Quebra? |
| -------------------------------------- | ----------------------------------------- | :-----: |
| `new DaemonClient({ baseUrl, token })` | Sem mudança                               |    ❌   |
| `DaemonClientOptions.*`                | Todos mantidos, `transport` adicionado    |    ❌   |
| `DaemonHttpError`                      | Inalterado                                |    ❌   |
| `DaemonSessionClient`                  | Zero mudanças (delega para DaemonClient)  |    ❌   |
| Todas as exportações de tipo (100+)    | Inalteradas                               |    ❌   |

### Impacto por consumidor

| Consumidor                     | Impacto                                  |
| ------------------------------ | ---------------------------------------- |
| webui (25 arquivos)            | Zero mudanças de código                  |
| web-shell (4 arquivos)         | Zero mudanças de código                  |
| vscode-ide-companion (1 arquivo)| Zero mudanças de código                 |
| Terceiros                      | Zero para REST; passar `transport` para ACP |

---

## 4. Decisões de design

| Decisão                                          | Justificativa                                                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeEvents` no transporte, não apenas `fetch` | Recodificação SSE através de fetch é ineficiente e frágil                                                                                                                          |
| `connected: boolean` no transporte                | Loop de reconexão do provedor precisa distinguir "transporte morto" de "500 transitório"                                                                                           |
| Lazy-init (não `connect()` explícito)             | Mantém a construção do DaemonClient síncrona; `new RestSseTransport()` padrão não precisa de init                                                                                  |
| Detecção automática é única, não no meio da sessão | `negotiate()` sonda uma vez na inicialização; fallback em tempo de execução é orientado pelo consumidor via `DaemonTransportClosedError`, não troca interna silenciosa              |
| Nenhuma taxonomia de erros como pré-requisito      | Transportes ACP mapeiam erros para códigos de status equivalentes HTTP internamente; `DaemonHttpError` funciona como está                                                          |
| Provedor ganha prop `transport`                    | `DaemonWorkspaceProvider` ganha prop opcional `transport` (~5 linhas), encaminhada ao construtor `DaemonClient`. Terceiros definem essa prop; omitir = comportamento REST atual     |

---

## 5. Alternativas consideradas

### 5.1 Injeção de fetch customizado (sem nova interface)

Passar um `fetch` baseado em WS via `DaemonClientOptions.fetch` existente.

**Rejeitado**: `subscribeEvents` valida `content-type: text/event-stream` e
usa `parseSseStream`. Um fetch customizado precisa recodificar quadros WS como texto SSE, então
o SDK decodifica de volta — ida-e-volta codificação-decodificação ineficiente. Além disso,
`capabilities()` e `initialize` têm formas de resposta diferentes, exigindo uma camada de mapeamento de formato.

### 5.2 Interface formal completa (4 PRs, ~2750 linhas)

Taxonomia de erros → Interface → AcpHttp → AcpWs como PRs separados.

**Rejeitado**: superengenharia. Taxonomia de erros é desnecessária (transportes ACP podem
mapear para códigos de status equivalentes HTTP). PRs separados aumentam o custo de troca de contexto
de revisão para uma abstração coesa única.

### 5.3 Provedor duplo com BridgeContext

`AcpSessionProvider` paralelo + `ChatBridgeContext` + `SessionBridgeContext`.

**Rejeitado**: causa dessincronização de store, exige ~8 arquivos, não funciona sem mudanças no SDK.

---

## 6. Plano de implementação (PR único)

Todas as mudanças chegam em um PR. Estimado ~1300 linhas no total.

| Arquivo                                                           | Mudança                                                                 | Linhas  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`           | Interface + tipos + `DaemonTransportClosedError` + factory `negotiate()`| ~110    |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`          | Encapsula `globalThis.fetch` + lógica SSE extraída do DaemonClient      | ~80     |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`            | Multiplexador WS + mapeamento URL→JSON-RPC + correlação de requisições  | ~400    |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`          | POST /acp + gerenciamento SSE de conexão/sessão                         | ~300    |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`      | Mapeamento notificação JSON-RPC → DaemonEvent                           | ~150    |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`    | Wrapper opt-in: reconexão + fallback                                    | ~150    |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`              | Construtor + 6 locais `_fetch` + reescrita de subscribeEvents           | ~40 líquidas |
| `packages/sdk-typescript/src/daemon/index.ts`                     | Exportar novos tipos                                                    | ~10     |
| `packages/cli/src/serve/server.ts`                                | Adicionar campo `transports` a `GET /capabilities`                      | ~5      |
| `packages/sdk-typescript/src/daemon/types.ts`                     | Adicionar `transports` ao tipo `DaemonCapabilities`                     | ~3      |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx` | Adicionar prop opcional `transport`, encaminhar para `DaemonClient`     | ~5      |
| Testes                                                            | Testes unitários + integração do transporte                             | ~200    |

**Compatibilidade reversa**: `new DaemonClient({ baseUrl, token })` sem
`transport` = comportamento REST+SSE idêntico. Todos os testes existentes passam inalterados.

---

## 7. Verificação

1. **Compatibilidade reversa**: `npm run test` em sdk-typescript e webui — zero
   mudanças de teste necessárias. `new DaemonClient({ baseUrl, token })` = comportamento idêntico.
2. **Extração RestSseTransport**: comportamento SSE bit a bit equivalente confirmado
   pela suíte de testes existente.
3. **AcpWsTransport**: teste de integração conectando ao daemon real via WS. Verificar:
   - `subscribeEvents` produz as mesmas formas de `DaemonEvent` que o SSE REST
   - Ramificação 202/200 de prompt funciona com Response sintetizado
   - Round-trip de voto de permissão corretamente
   - `connected` transiciona para `false` na queda de WS
   - Sinal de aborto no prompt → WS envia RPC session/cancel
4. **AcpHttpTransport**: mesma verificação que WS, mas sobre HTTP+SSE.
5. **Detecção automática**: `negotiate()` retorna o melhor transporte; fallback para REST em falha de WS.
6. **Fallback em tempo de execução**: `AutoReconnectTransport` captura `DaemonTransportClosedError`,
   reconstrói transporte, consumidor chama `session/load` para ressincronização.
7. **Provedor**: `DaemonWorkspaceProvider` com prop `transport` — ChatView +
   TerminalView ambos leem de um único store.
8. **Ponta a ponta**: Terceiros passam `transport={new AcpWsTransport(url, token)}`
   para `DaemonWorkspaceProvider`. Todos os hooks do SDK e o store de transcrições funcionam inalterados.
---

## 8. Riscos

| Risco                                  | Mitigação                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Manutenção da tabela de mapeamento URL→JSON-RPC | Tabela co-localizada com o transporte; alterações de rota do daemon exigem atualização do transporte                     |
| Fidelidade da Resposta sintetizada do ACP WS   | Fornecer helper `syntheticResponse(status, json)`; documentar contrato (`.json()`, `.text()`, `.status`, `.body?.cancel()`) |
| Monotonicidade de `DaemonEvent.id` para WS | Notificações JSON-RPC do servidor ACP carregam o id do evento; o transporte o expõe diretamente                         |
| Prompt 202 vs 200 para WS               | Transporte mapeia resposta JSON-RPC → 200 com corpo de resultado (caminho bloqueante); eventos ainda fluem via `subscribeEvents` |
| Detecção de queda de conexão WS         | `connected: boolean` + `DaemonTransportClosedError` lançado de `fetch`                                                  |