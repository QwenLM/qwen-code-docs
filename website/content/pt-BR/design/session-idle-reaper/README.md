# Session Idle Reaper — Documento de Design

**Status:** Rascunho  
**Autor:** qinqi  
**Data:** 2026-06-08  
**Escopo:** `packages/acp-bridge/src/bridge.ts`, `packages/cli/src/serve/server.ts`

---

## 1. Declaração do Problema

### 1.1 Comportamento atual

Uma vez criada, uma sessão da bridge permanece em memória (`byId: Map<string, SessionEntry>`) indefinidamente. Ela só é destruída quando:

1. Um cliente chama explicitamente `DELETE /session/:id` (`closeSession`)
2. O processo filho compartilhado `qwen --acp` falha (handler `channel.exited`)
3. O processo daemon recebe `SIGTERM` / `SIGINT` (`shutdown`)

**Não há timeout automático de ociosidade** para sessões. Os timestamps de heartbeat (`sessionLastSeenAt`, `clientLastSeenAt`) são registrados por `recordHeartbeat`, mas nunca são consumidos para fins de evicção (o comentário do campo referencia uma futura "política de revogação (PR 24)" que ainda não foi implementada).

### 1.2 Impacto

| Cenário                                                                      | Sintoma                                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Usuário abre várias abas do navegador, as fecha sem chamar `DELETE /session` | Sessões acumulam em `byId`, cada uma mantendo um ring buffer do EventBus (~2-4 MB)              |
| 20 sessões (`maxSessions` padrão) acumulam                                   | `SessionLimitExceededError` ao tentar `spawnOrAttach` — usuário fica bloqueado                  |
| Daemon de longa duração com troca frequente de abas                          | Crescimento ilimitado de memória nos ring buffers do EventBus e estado da sessão no lado do ACP |
| Extensão IDE reinicia / falha                                                | Sessões órfãs nunca são limpas                                                                  |

### 1.3 Por que agora

O daemon está sendo cada vez mais usado como um servidor de workspace de longa duração (app desktop, extensões IDE, web UI). Falhas de cliente e picos de rede são normais — depender de `DELETE` explícito para limpeza é insustentável.

---

## 2. Objetivos do Design

1. **Reclamar automaticamente sessões ociosas** cujos clientes desapareceram e que não têm trabalho em andamento ativo.
2. **Nunca destruir uma sessão que tenha um prompt ativo** — fazer isso mataria silenciosamente trabalho visível ao usuário.
3. **Preservar dados de sessão persistidos** — apenas o estado da bridge em memória é liberado; as transcrições em disco (`SessionService`) não são tocadas. Usuários podem usar `session/load` ou `session/resume` para restaurar.
4. **Observável** — emitir um evento SSE distinto para que os clientes saibam POR QUE a sessão foi fechada (timeout de ociosidade vs. fechamento explícito vs. falha).
5. **Configurável** — operadores e testes podem ajustar timeouts ou desabilitar o reaper completamente.
6. **Zero novas dependências / componentes** — implementar inteiramente dentro do closure da bridge existente.

### Não-objetivos

- Gerenciamento de sessão entre workspaces (isso seria preocupação do gateway).
- Evicção LRU no limite de `maxSessions` (valioso, mas trabalho separado — registrado como follow-up).
- Compactação do ring buffer do EventBus para sessões ociosas (baixa prioridade dado o limite de 20 sessões; registrado como follow-up).
- Pressão adaptativa baseada em RSS (requer polling de `process.memoryUsage()` e design de política; registrado como follow-up).

---

## 3. Arquitetura

### 3.1 Visão Geral

```
Bridge closure (createHttpAcpBridge)
│
├─ byId: Map<sessionId, SessionEntry>     ← existente
├─ channelInfo: ChannelInfo               ← existente
├─ idleTimer (nível do canal)            ← existente
│
└─ sessionReaper: NodeJS.Timeout          ← NOVO
     │
     ├─ varre byId a cada REAP_INTERVAL_MS
     ├─ pula sessões com prompt ativo
     ├─ pula sessões com assinantes SSE ativos
     ├─ fecha sessões que excederam o TTL de ociosidade
     └─ emite session_closed { reason: 'idle_timeout' }
```

### 3.2 Relação com mecanismos existentes

| Mecanismo                                | Escopo                    | O que gerencia                                                                                |
| ---------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `channelIdleTimeoutMs` + `startIdleTimer` | Canal (processo filho)    | Mata o filho `qwen --acp` quando TODAS as sessões se forem                                    |
| **Session reaper** (este design)         | Sessão (entrada em memória) | Fecha sessões individuais quando ociosas                                                      |
| Varredura do `ConnectionRegistry`        | Conexão ACP-over-HTTP     | Recolhe conexões da camada de transporte `/acp` (camada diferente)                            |
| `writerIdleTimeoutMs`                    | Assinante SSE             | Remove um único assinante SSE travado                                                         |
| Disconnect reaper (server.ts)            | Handshake de spawn        | Recolhe sessões cujo dono do spawn desconectou DURANTE o handshake POST /session               |

Dois mecanismos trabalham juntos para cobrir o ciclo de vida da limpeza de sessões:

1. **Fechar ao último desanexar** (principal) — quando `detachClient` remove o último cliente registrado E não restam assinantes SSE, a sessão é fechada imediatamente via `closeSessionImpl`. Isso cobre o caminho normal: usuário fecha aba → limpeza React → `POST /session/:id/detach`.

2. **Session idle reaper** (garantia) — varredura periódica por sessões sem prompt ativo e sem assinantes SSE que não receberam heartbeat dentro do TTL configurado. Isso cobre o caminho de falha: navegador morto, rede perdida, `kill -9` — a requisição de detach nunca foi enviada, então `clientIds` ainda mostra clientes registrados, mas a sessão está efetivamente órfã.

---

## 4. Design Detalhado

### 4.1 Novas opções de configuração (`BridgeOptions`)

```typescript
interface BridgeOptions {
  // ... campos existentes ...

  /**
   * Com que frequência o session reaper varre `byId` em busca de sessões
   * ociosas, em milissegundos. Padrão: 60_000 (1 minuto). Defina como 0 ou
   * Infinity para desabilitar o reaper completamente. O timer é `.unref()`'d.
   */
  sessionReapIntervalMs?: number;

  /**
   * Uma sessão com ZERO assinantes SSE ativos E ZERO clientes registrados
   * que não recebeu um heartbeat por esta quantidade de milissegundos é
   * considerada ociosa e será recolhida.
   *
   * Padrão: 30 * 60_000 (30 minutos).
   * Defina como 0 ou Infinity para desabilitar a coleta por ociosidade.
   */
  sessionIdleTimeoutMs?: number;
}
```

**Superfície CLI** (flags do `qwen serve`):

```
--session-reap-interval-ms <ms>   Intervalo de varredura do reaper (padrão 60000, 0=desabilitar)
--session-idle-timeout-ms <ms>    Limite de ociosidade (padrão 1800000, 0=desabilitar)
```

### 4.2 Predicado de sessão ociosa

Uma sessão é elegível para coleta quando **todas** as seguintes condições forem verdadeiras:

1. **Sem prompt ativo**: `entry.promptActive === false`
2. **Sem assinantes SSE ativos**: `entry.events.subscriberCount === 0`
3. **Duração de ociosidade excedida**: `now - lastActivity(entry) > sessionIdleTimeoutMs`

Nota: o reaper intencionalmente NÃO verifica `clientIds.size`. Ele cobre o caminho de falha onde o detach nunca foi enviado — `clientIds` ainda mostra clientes registrados, mas a sessão está efetivamente órfã. O caminho normal (cliente envia detach) é tratado pelo fechamento ao último desanexar.

Onde `lastActivity(entry)` é definido como:

```typescript
function lastActivity(entry: SessionEntry): number {
  // `sessionLastSeenAt` está em epoch-ms (de Date.now());
  // `createdAt` é uma string ISO 8601 — fazer parse para epoch-ms como fallback.
  return entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
}
```

Nota: `entry.createdAt` é tipado como `string` (ISO 8601), não um número. `Date.parse` é seguro aqui — o formato é sempre `new Date().toISOString()` (veja `createSessionEntry`, bridge.ts:1883).

**Justificativa para cada guarda:**

| Guarda                         | Por que                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sem prompt ativo               | Um prompt headless / autônomo (ex: pipe CLI, cron job) pode estar rodando sem assinante SSE. Recolhê-lo mataria trabalho.                          |
| Sem assinantes SSE             | Um cliente conectado está escutando ativamente. Mesmo que não tenha enviado heartbeat, a própria conexão SSE prova atividade.                      |
| Duração de ociosidade          | Período de carência para que clientes brevemente desconectados possam reconectar sem perder a sessão.                                              |

### 4.3 Ação de coleta

Para cada sessão que passa no predicado de ociosidade, o reaper chama:

```typescript
await closeSession(sessionId, { reason: 'idle_timeout' });
```

Isso reutiliza o caminho `closeSession` existente que:

1. Remove de `byId` / `defaultEntry`
2. Cancela permissões pendentes via `permissionMediator.forgetSession`
3. Publica evento `session_closed` (com `reason: 'idle_timeout'`)
4. Fecha o EventBus
5. Envia `connection.cancel()` para o filho ACP (melhor esforço)
6. Dispara `startIdleTimer` no canal se for a última sessão

**Por que `closeSession` e não `killSession`?**

`killSession` é o caminho interno de coleta forçada projetado para a condição de corrida do handshake de spawn (guarda `requireZeroAttaches`, túmulo `spawnOwnerWantedKill`). `closeSession` é o caminho documentado voltado ao cliente que publica `session_closed` (não `session_died`) e lida com telemetria corretamente. O reaper é um "fechamento gracioso em nome de um cliente ausente", então `closeSession` é a semântica correta.

### 4.4 Estendendo `closeSession` para aceitar um motivo de fechamento

Atualmente, `closeSession` fixa `reason: 'client_close'` no evento `session_closed`. Precisamos tornar isso parametrizável.

**Abordagem:** Adicionar um novo parâmetro `opts` opcional a `closeSession`, em vez de sobrecarregar `BridgeClientRequestContext` (que é um tipo com escopo de requisição do cliente — adicionar `reason` a ele seria uma violação de camada, pois "motivo" é uma decisão do lado do servidor, não algo que um cliente passa em um cabeçalho).

```typescript
// bridgeTypes.ts — novo tipo + mudança de assinatura:
export interface CloseSessionOpts {
  /** Substitui o 'client_close' padrão no evento session_closed. */
  reason?: string;
}

closeSession(
  sessionId: string,
  context?: BridgeClientRequestContext,
  opts?: CloseSessionOpts,
): Promise<void>;
```

```typescript
// bridge.ts — mudança de implementação:
async closeSession(sessionId, context, opts) {
  // ...
  const reason = opts?.reason ?? 'client_close';
  entry.events.publish({
    type: 'session_closed',
    data: { sessionId, reason, ... },
  });
}
```

Os chamadores existentes (rota `DELETE /session/:id`) não passam `opts`, usando o padrão `'client_close'`. O reaper passa `{ reason: 'idle_timeout' }`.

### 4.5 Ciclo de vida do reaper

```typescript
// Dentro do closure createHttpAcpBridge:

const resolvedReapIntervalMs = resolvePositiveMs(
  opts.sessionReapIntervalMs,
  60_000,
);
const resolvedIdleTimeoutMs = resolvePositiveMs(
  opts.sessionIdleTimeoutMs,
  30 * 60_000,
);

let sessionReaper: ReturnType<typeof setInterval> | undefined;

function startSessionReaper(): void {
  if (resolvedReapIntervalMs <= 0 || resolvedIdleTimeoutMs <= 0) return;
  sessionReaper = setInterval(() => {
    if (shuttingDown) return;
    const now = Date.now();
    for (const [id, entry] of byId) {
      if (entry.promptActive) continue;
      if (entry.events.subscriberCount > 0) continue;
      const lastActive = entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
      const idle = now - lastActive;
      if (idle < resolvedIdleTimeoutMs) continue;
      writeStderrLine(
        `qwen serve: reaping idle session ${JSON.stringify(id)} ` +
          `(idle for ${Math.round(idle / 1000)}s, threshold ${Math.round(resolvedIdleTimeoutMs / 1000)}s)`,
      );
      // Passar context `undefined` (sem cliente) e opts `{ reason }`.
      bridgeImpl
        .closeSession(id, undefined, { reason: 'idle_timeout' })
        .catch((err) => {
          writeStderrLine(
            `qwen serve: session reaper failed to close ${JSON.stringify(id)}: ${String(err)}`,
          );
        });
    }
  }, resolvedReapIntervalMs);
  sessionReaper.unref();
}

function stopSessionReaper(): void {
  if (sessionReaper !== undefined) {
    clearInterval(sessionReaper);
    sessionReaper = undefined;
  }
}
```

Nota: `bridgeImpl` refere-se ao objeto bridge retornado por `createHttpAcpBridge`, de modo que `closeSession` tenha acesso total ao estado do closure. Na prática, isso é implementado como uma chamada direta à função interna do closure `closeSessionImpl`.

**Integração com o ciclo de vida:**

- `startSessionReaper()` é chamado no momento da construção da bridge (após validação de opções, junto com a configuração existente de `channelIdleTimeoutMs`).
- `stopSessionReaper()` é chamado tanto em `shutdown()` quanto em `killAllSync()`.

### 4.6 Interação com chamadores existentes de `closeSession`

| Chamador                      | Impacto                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| Rota `DELETE /session/:id`    | Nenhum — sem `opts` passado, usa o padrão `reason: 'client_close'`        |
| Session reaper (este design)  | Passa `opts: { reason: 'idle_timeout' }`                                  |
| Coleta diferida de `detachClient` | Chama `killSession` (não `closeSession`), não afetado                     |
| Handler `channel.exited`      | Publica `session_died`, não afetado                                       |
| `shutdown()`                  | Publica `session_died` com motivo `daemon_shutdown`, não afetado          |

### 4.7 Segurança de concorrência

O callback do reaper roda no event loop do Node.js. Considerações principais:

- **A iteração `for...of` é síncrona.** O reaper avalia o predicado de ociosidade de cada entrada sincronamente, então dispara `closeSession(...).catch(...)` para as entradas correspondentes. Sem `await` no corpo do loop — todos os fechamentos são despachados em um único limite de microtask, então o loop termina.
- **`byId.delete` é adiado.** Dentro de `closeSession`, `byId.delete` roda APÓS o primeiro `await` (`notifyAgentSessionClose`). Isso significa que as deleções ocorrem em microtasks após o loop `for...of` ter terminado. Como cada `closeSession` opera em uma chave distinta, não há aliasing. E `for...of` já terminou de iterar, então deleção no meio da iteração não é uma preocupação.
- **Condição de corrida de fechamento duplo.** Se um cliente chama `DELETE /session/:id` para a mesma sessão entre a verificação do predicado do reaper e a execução assíncrona de `closeSession`, o `closeSession` do reaper lançará `SessionNotFoundError` (capturado por `.catch()`). Seguro.
- **Condição de corrida de reconexão.** Se um cliente reconectar a uma sessão (registra clientId / abre SSE) entre a verificação do predicado do reaper e a execução de `closeSession`, `closeSession` ainda prosseguirá e fechará a sessão. O cliente recebe `session_closed` e deve recarregar. Essa janela é extremamente estreita (um tick síncrono de `setInterval`) e a consequência é benigna — nenhuma perda de dados, apenas um prompt de recarga. O TTL padrão de 30 minutos torna isso extremamente raro.
- Um `spawnOrAttach` concorrente que cria uma nova sessão enquanto o reaper está varrendo não será visto (iteramos as entradas de `byId` no início de cada tick). Isso é seguro — novas sessões estão frescas e não atingirão o limite de ociosidade.

### 4.8 Mudança no formato do wire

O campo `data.reason` do evento `session_closed` já existe com valor `'client_close'`. Adicionamos dois novos valores:

- `'idle_timeout'` — emitido pelo reaper de ociosidade (garantia para clientes que falharam)
- `'last_client_detached'` — emitido pelo fechamento ao último desanexar (fechamento normal de aba)

Isso é compatível com versões anteriores — o código SDK existente que verifica `reason === 'client_close'` simplesmente não corresponderá aos novos valores, e o handler genérico de frame terminal (`isTerminalLifecycleEvent`) já lida com `session_closed` independentemente do motivo.

---

## 5. Plano de Testes

### 5.1 Testes unitários (`bridge.test.ts`)

| #   | Teste                                                               | Descrição                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sessão ociosa é recolhida após timeout                              | Criar uma sessão, avançar o tempo além de `sessionIdleTimeoutMs`, disparar o tick do reaper, verificar se a sessão foi removida de `byId` e se o evento `session_closed` foi publicado com `reason: 'idle_timeout'` |
| 2   | Sessão com prompt ativo NÃO é recolhida                             | Criar uma sessão, iniciar um prompt, avançar o tempo, verificar se a sessão sobrevive ao tick do reaper                                                                                           |
| 3   | Sessão com assinante SSE ativo NÃO é recolhida                      | Criar uma sessão, assinar seu EventBus, avançar o tempo, verificar se a sessão sobrevive                                                                                                          |
| 4   | Sessão com cliente registrado NÃO é recolhida                       | Criar uma sessão, registrar um clientId, avançar o tempo, verificar se a sessão sobrevive                                                                                                         |
| 5   | Reaper desabilitado quando intervalo = 0                            | Passar `sessionReapIntervalMs: 0`, verificar se nenhum `setInterval` foi armado                                                                                                                   |
| 6   | Reaper desabilitado quando timeout = 0                              | Passar `sessionIdleTimeoutMs: 0`, verificar se nenhum `setInterval` foi armado                                                                                                                    |
| 7   | Reaper interrompido no shutdown                                     | Chamar `shutdown()`, verificar se `clearInterval` foi chamado                                                                                                                                     |
| 8   | closeSession reason padrão é 'client_close'                         | Chamar `closeSession` sem motivo explícito, verificar se o evento publicado tem `reason: 'client_close'`                                                                                          |
| 9   | closeSession com motivo explícito                                   | Chamar `closeSession` com `reason: 'idle_timeout'`, verificar evento publicado                                                                                                                    |
| 10  | Múltiplas sessões ociosas recolhidas em um único tick               | Criar 3 sessões ociosas, avançar o tempo, disparar o tick, verificar se todas as 3 foram recolhidas                                                                                               |
| 11  | Sessão com heartbeat dentro do TTL sobrevive                        | Criar uma sessão, registrar heartbeat, avançar o tempo para pouco abaixo do TTL, verificar se a sessão sobrevive                                                                                  |
| 12  | Timer de ociosidade do canal disparado após a última sessão ser recolhida | Criar 1 sessão (última no canal), recolhê-la, verificar se `startIdleTimer` foi chamado no canal                                                                                              |

### 5.2 Testes de integração (`server.test.ts`)

| #   | Teste                                                                  | Descrição                                                                                               |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | `GET /health?deep=1` reflete contagem de sessões limpas pelo reaper    | Iniciar daemon, criar sessões, avançar o tempo, verificar se endpoint health mostra contagem reduzida   |
| 2   | Assinante SSE recebe `session_closed` com `reason: 'idle_timeout'`     | Abrir SSE, desconectar, reconectar antes do TTL, então deixar o TTL expirar, verificar evento           |
---

## 6. Padrões de Configuração

| Opção                    | Padrão              | Justificativa                                                                                                                       |
| ------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `sessionReapIntervalMs`  | 60.000 (1 min)      | Frequente o suficiente para evitar acúmulo longo, barato (simples varredura de Map) para executar com frequência                    |
| `sessionIdleTimeoutMs`   | 1.800.000 (30 min)  | Período de carência generoso para reconexão. Corresponde a `ConnectionRegistry.idleTtlMs` para consistência do modelo mental        |

---

## 7. Observabilidade

- **Log stderr**: `qwen serve: reapando sessão ociosa "<id>" (ociosa por Nms)` a
  cada varredura, mantendo a convenção de prefixo `qwen serve:` existente.
- **Evento de telemetria**: `session.close` com operação
  `qwen-code.daemon.bridge.operation: 'session.close'` (reutiliza o caminho de
  telemetria `closeSession` existente).
- **Métrica de telemetria**: `sessionLifecycle('close')` (reutiliza contador existente).
- **Evento SSE**: `session_closed` com `data.reason: 'idle_timeout'`.

---

## 8. Trabalhos Futuros (Fora do Escopo)

| Item                                     | Descrição                                                                                      | Prioridade |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| Remoção LRU em `maxSessions`             | Em vez de rejeitar novas sessões, remover a sessão ociosa menos recentemente ativa             | P1         |
| Compactação do anel do EventBus          | Reduzir o anel para sessões com 0 assinantes para economizar memória                           | P2         |
| Pressão adaptativa baseada em RSS        | Monitorar `process.memoryUsage().rss` e reduzir o TTL ocioso quando a memória estiver apertada | P2         |
| Verificação de atividade baseada em heartbeat | Remover automaticamente clientes que perderem N janelas consecutivas de heartbeat              | P2         |

---

## 9. Riscos e Mitigações

| Risco                                                                                 | Mitigação                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O reaper fecha uma sessão que um cliente headless está prestes a reconectar           | O TTL padrão de 30 minutos é generoso; clientes headless devem enviar heartbeats. O transcript em disco é preservado — `session/load` o restaura.                                     |
| `closeSession` dentro do reaper lança exceção, envenenando o loop de varredura        | Cada fechamento está em seu próprio `.catch()` — uma falha não bloqueia as outras                                                                                                     |
| Iteração do reaper sobre `byId` durante `closeSession` concorrente vindo de outro caminho | A iteração do Map ES2015 tolera remoção de chaves atuais/anteriores. Fechamento duplo é idempotente (`byId.get` retorna undefined → `SessionNotFoundError` capturado pelo `.catch` do reaper). |
| Desempenho de varrer 20 sessões a cada 60s                                           | Trivial — 20 leituras de Map + 4 verificações de campo cada. Sem E/S.                                                                                                                |
| Interação com o timer ocioso do canal                                                | Quando a última sessão é removida, `closeSession` já chama `startIdleTimer` no canal. Nenhuma lógica adicional necessária.                                                            |