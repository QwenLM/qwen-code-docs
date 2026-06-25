# Session Idle Reaper — Documento de Design

**Status:** Rascunho  
**Autor:** qinqi  
**Data:** 2026-06-08  
**Escopo:** `packages/acp-bridge/src/bridge.ts`, `packages/cli/src/serve/server.ts`

---

## 1. Declaração do Problema

### 1.1 Comportamento atual

Depois de criada, uma sessão bridge vive em memória (`byId: Map<string, SessionEntry>`) 
indefinidamente. Ela só é destruída quando:

1. Um cliente chama explicitamente `DELETE /session/:id` (`closeSession`)
2. O processo filho compartilhado `qwen --acp` trava (handler `channel.exited`)
3. O processo daemon recebe `SIGTERM` / `SIGINT` (`shutdown`)

Não há **timeout de inatividade automático** para sessões. Os timestamps de heartbeat
(`sessionLastSeenAt`, `clientLastSeenAt`) são registrados por `recordHeartbeat`, mas 
nunca consumidos para fins de remoção (o comentário do campo referencia uma futura 
"política de revogação (PR 24)" que nunca foi implementada).

### 1.2 Impacto

| Cenário                                                                          | Sintoma                                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Usuário abre várias abas do navegador, fecha-as sem chamar `DELETE /session`     | Sessões acumulam-se em `byId`, cada uma mantendo um ring do EventBus (~2-4 MB)   |
| 20 sessões (padrão `maxSessions`) acumulam-se                                    | `SessionLimitExceededError` em novo `spawnOrAttach` — usuário fica bloqueado      |
| Daemon de longa duração com rotatividade de abas                                 | Crescimento ilimitado de memória nos rings de replay do EventBus e estado da sessão no ACP |
| Extensão IDE reinicia / trava                                                    | Sessões órfãs nunca são limpas                                                    |

### 1.3 Por que agora

O daemon está sendo cada vez mais usado como um servidor de workspace de longa duração (app desktop,
extensões IDE, interface web). Travamentos de cliente e falhas de rede são normais — confiar
em `DELETE` explícito para limpeza é insustentável.

---

## 2. Objetivos de Design

1. **Recuperar automaticamente sessões inativas** cujos clientes se foram e que não
   têm trabalho ativo em andamento.
2. **Nunca destruir uma sessão que tenha um prompt ativo** — fazer isso iria
   silenciosamente matar trabalho visível ao usuário.
3. **Preservar dados de sessão persistidos** — apenas o estado bridge em memória é liberado;
   as transcrições em disco (`SessionService`) não são tocadas. Usuários podem usar
   `session/load` ou `session/resume` para restaurar.
4. **Observável** — emitir um evento SSE distinto para que os clientes saibam POR QUE a
   sessão foi fechada (timeout de inatividade vs. fechamento explícito vs. travamento).
5. **Configurável** — operadores e testes podem ajustar timeouts ou desabilitar o
   reaper completamente.
6. **Zero novas dependências / componentes** — implementar inteiramente dentro do
   closure bridge existente.

### Não-objetivos

- Gerenciamento de sessão entre workspaces (isso seria uma preocupação de gateway).
- Remoção LRU no limite `maxSessions` (valioso, mas trabalho separado — rastreado
  como acompanhamento).
- Compactação dos rings do EventBus para sessões inativas (baixa prioridade dado o limite de 20 sessões;
  rastreado como acompanhamento).
- Pressão adaptativa baseada em RSS (requer polling de `process.memoryUsage()` e
  design de política; rastreado como acompanhamento).

---

## 3. Arquitetura

### 3.1 Visão Geral

```
Closure Bridge (createHttpAcpBridge)
│
├─ byId: Map<sessionId, SessionEntry>     ← existente
├─ channelInfo: ChannelInfo               ← existente
├─ idleTimer (nível de canal)              ← existente
│
└─ sessionReaper: NodeJS.Timeout          ← NOVO
     │
     ├─ varre byId a cada REAP_INTERVAL_MS
     ├─ pula sessões com prompt ativo
     ├─ pula sessões com assinantes SSE ativos
     ├─ fecha sessões que excedem o TTL de inatividade
     └─ emite session_closed { reason: 'idle_timeout' }
```

### 3.2 Relação com mecanismos existentes

| Mecanismo                                 | Escopo                    | O que gerencia                                                                       |
| ----------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `channelIdleTimeoutMs` + `startIdleTimer` | Canal (processo filho)    | Mata o filho `qwen --acp` quando TODAS as sessões se foram                           |
| **Reaper de sessão** (este design)        | Sessão (entrada em memória) | Fecha sessões individuais quando inativas                                            |
| Varredura do `ConnectionRegistry`         | Conexão ACP-over-HTTP     | Recolhe conexões da camada de transporte `/acp` (camada diferente)                   |
| `writerIdleTimeoutMs`                     | Assinante SSE             | Remove um único assinante SSE travado                                                |
| Reaper de desconexão (server.ts)          | Handshake de spawn        | Recolhe sessões cujo dono do spawn desconectou DURANTE o handshake POST /session     |

Dois mecanismos trabalham juntos para cobrir a limpeza do ciclo de vida da sessão:
1. **Close-on-last-detach** (primário) — quando `detachClient` remove o último
   cliente registrado E não restam assinantes SSE, a sessão é fechada
   imediatamente via `closeSessionImpl`. Isso lida com o caminho normal: usuário
   fecha uma aba → limpeza do React → `POST /session/:id/detach`.

2. **Session idle reaper** (backstop) — varredura periódica por sessões sem
   prompt ativo e sem assinantes SSE que não receberam um heartbeat dentro do
   TTL configurado. Isso captura o caminho de crash: navegador morto,
   rede interrompida, `kill -9` — a requisição de detach nunca foi enviada,
   então `clientIds` ainda mostra clientes registrados, mas a sessão está
   efetivamente órfã.

---

## 4. Design Detalhado

### 4.1 Novas opções de configuração (`BridgeOptions`)

```typescript
interface BridgeOptions {
  // ... existing fields ...

  /**
   * How often the session reaper scans `byId` for idle sessions, in
   * milliseconds. Default: 60_000 (1 minute). Set to 0 or Infinity to
   * disable the reaper entirely. The timer is `.unref()`'d.
   */
  sessionReapIntervalMs?: number;

  /**
   * A session with ZERO live SSE subscribers AND ZERO registered clients
   * that has not received a heartbeat for this many milliseconds is
   * considered idle and will be reaped.
   *
   * Default: 30 * 60_000 (30 minutes).
   * Set to 0 or Infinity to disable idle reaping.
   */
  sessionIdleTimeoutMs?: number;
}
```

**Superfície CLI** (flags `qwen serve`):

```
--session-reap-interval-ms <ms>   Intervalo de varredura do reaper (padrão 60000, 0=desabilitar)
--session-idle-timeout-ms <ms>    Limiar de inatividade (padrão 1800000, 0=desabilitar)
```

### 4.2 Predicado de sessão inativa

Uma sessão é elegível para ser ceifada quando **todas** as seguintes condições são verdadeiras:

1. **Sem prompt ativo**: `entry.promptActive === false`
2. **Sem assinantes SSE ativos**: `entry.events.subscriberCount === 0`
3. **Duração da inatividade excedida**: `now - lastActivity(entry) > sessionIdleTimeoutMs`

Nota: o reaper intencionalmente NÃO verifica `clientIds.size`. Ele cobre
o caminho de crash onde o detach nunca foi enviado — `clientIds` ainda mostra
clientes registrados, mas a sessão está efetivamente órfã. O caminho normal
(cliente envia detach) é tratado pelo close-on-last-detach.

Onde `lastActivity(entry)` é definida como:

```typescript
function lastActivity(entry: SessionEntry): number {
  // `sessionLastSeenAt` é epoch-ms (de Date.now());
  // `createdAt` é uma string ISO 8601 — converte para epoch-ms como fallback.
  return entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
}
```

Nota: `entry.createdAt` é tipada como `string` (ISO 8601), não um número.
`Date.parse` é seguro aqui — o formato é sempre `new Date().toISOString()`
(veja `createSessionEntry`, bridge.ts:1883).

**Justificativa para cada guarda:**

| Guarda                    | Por quê                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Sem prompt ativo          | Um prompt headless/autônomo (ex.: pipe CLI, cron job) pode estar rodando sem assinante SSE. Ceifá-lo mataria o trabalho.               |
| Sem assinantes SSE        | Um cliente conectado está ouvindo ativamente. Mesmo que não tenha enviado um heartbeat, a própria conexão SSE prova a atividade.        |
| Duração da inatividade    | Período de carência para que clientes brevemente desconectados possam reconectar sem perder a sessão.                                 |

### 4.3 Ação de ceifa

Para cada sessão que passa pelo predicado de inatividade, o reaper chama:

```typescript
await closeSession(sessionId, { reason: 'idle_timeout' });
```

Isso reutiliza o caminho existente `closeSession` que:

1. Remove de `byId` / `defaultEntry`
2. Cancela permissões pendentes via `permissionMediator.forgetSession`
3. Publica evento `session_closed` (com `reason: 'idle_timeout'`)
4. Fecha o EventBus
5. Envia `connection.cancel()` para o processo filho ACP (melhor esforço)
6. Dispara `startIdleTimer` no canal se foi a última sessão

**Por que `closeSession` e não `killSession`?**

`killSession` é o caminho interno de ceifa forçada projetado para a condição de
corrida de desconexão no handshake de spawn (guarda `requireZeroAttaches`,
tombstone `spawnOwnerWantedKill`). `closeSession` é o caminho documentado voltado
para o cliente que publica `session_closed` (não `session_died`) e lida
corretamente com telemetria. O reaper é um "fechamento gracioso em nome de um
cliente ausente", então `closeSession` é a semântica correta.

### 4.4 Estendendo `closeSession` para aceitar um motivo de fechamento

Atualmente `closeSession` define `reason: 'client_close'` no evento
`session_closed`. Precisamos tornar isso parametrizável.

**Abordagem:** Adicionar um novo parâmetro `opts` opcional a `closeSession` em
vez de sobrecarregar `BridgeClientRequestContext` (que é um tipo com escopo de
requisição do cliente — adicionar `reason` a ele seria uma violação de camada,
já que "motivo" é uma decisão do lado do servidor, não algo que um cliente
passa em um cabeçalho).

```typescript
// bridgeTypes.ts — novo tipo + mudança de assinatura:
export interface CloseSessionOpts {
  /** Substitui o motivo padrão 'client_close' no evento session_closed. */
  reason?: string;
}

closeSession(
  sessionId: string,
  context?: BridgeClientRequestContext,
  opts?: CloseSessionOpts,
): Promise<void>;
```
```typescript
// bridge.ts — mudança na implementação:
async closeSession(sessionId, context, opts) {
  // ...
  const reason = opts?.reason ?? 'client_close';
  entry.events.publish({
    type: 'session_closed',
    data: { sessionId, reason, ... },
  });
}
```

Chamadores existentes (rota `DELETE /session/:id`) não passam `opts`, assumindo o padrão `'client_close'`. O reaper passa `{ reason: 'idle_timeout' }`.

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
        `qwen serve: reapando sessão ociosa ${JSON.stringify(id)} ` +
          `(ociosa por ${Math.round(idle / 1000)}s, limite ${Math.round(resolvedIdleTimeoutMs / 1000)}s)`,
      );
      // Passa `undefined` como contexto (sem cliente) e `{ reason }` como opts.
      bridgeImpl
        .closeSession(id, undefined, { reason: 'idle_timeout' })
        .catch((err) => {
          writeStderrLine(
            `qwen serve: reaper de sessão falhou ao fechar ${JSON.stringify(id)}: ${String(err)}`,
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

Nota: `bridgeImpl` refere-se ao objeto bridge retornado por `createHttpAcpBridge`, de modo que `closeSession` tem acesso total ao estado no escopo do closure. Na prática, isso é implementado como uma chamada direta à função interna `closeSessionImpl` do closure.

**Integração no ciclo de vida:**

- `startSessionReaper()` é chamado no momento da construção da bridge (após a validação das opções, junto com a configuração existente `channelIdleTimeoutMs`).
- `stopSessionReaper()` é chamado tanto em `shutdown()` quanto em `killAllSync()`.

### 4.6 Interação com chamadores existentes de `closeSession`

| Chamador                       | Impacto                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| Rota `DELETE /session/:id`     | Nenhum — nenhum `opts` passado, assume `reason: 'client_close'`     |
| Reaper de sessão (este design) | Passa `opts: { reason: 'idle_timeout' }`                            |
| Reap adiado de `detachClient`  | Chama `killSession` (não `closeSession`), não afetado               |
| Manipulador `channel.exited`   | Publica `session_died`, não afetado                                 |
| `shutdown()`                   | Publica `session_died` com reason `daemon_shutdown`, não afetado    |

### 4.7 Segurança de concorrência

O callback do reaper é executado no loop de eventos do Node.js. Considerações principais:

- **A iteração `for...of` é síncrona.** O reaper avalia o predicado de inatividade de cada entrada de forma síncrona, então dispara `closeSession(...).catch(...)` para as entradas correspondentes. Nenhum `await` no corpo do loop — todos os closes são despachados em um único limite de microtask, então o loop sai.
- **`byId.delete` é adiado.** Dentro de `closeSession`, `byId.delete` é executado APÓS o primeiro `await` (`notifyAgentSessionClose`). Isso significa que as exclusões ocorrem em microtasks após o loop `for...of` ter sido concluído. Como cada `closeSession` opera em uma chave distinta, não há aliasing. E `for...of` já terminou de iterar, então a exclusão no meio da iteração não é uma preocupação.
- **Condição de corrida de double-close.** Se um cliente chamar `DELETE /session/:id` para a mesma sessão entre a verificação do predicado do reaper e a execução assíncrona de `closeSession`, o `closeSession` do reaper lançará `SessionNotFoundError` (capturado por `.catch()`). Seguro.
- **Condição de corrida de reconexão.** Se um cliente reconectar a uma sessão (registra clientId / abre SSE) entre a verificação do predicado do reaper e a execução de `closeSession`, `closeSession` ainda prosseguirá e fechará a sessão. O cliente recebe `session_closed` e deve recarregar. Essa janela é extremamente estreita (um tique síncrono de `setInterval`) e a consequência é benigna — sem perda de dados, apenas um prompt de recarga. O TTL padrão de 30 minutos torna isso extremamente raro.
- Um `spawnOrAttach` concorrente que cria uma nova sessão enquanto o reaper está varrendo não será visto (iteramos as entradas `byId` no início de cada tique). Isso é seguro — novas sessões estão frescas e não atenderão ao limite de inatividade.
### 4.8 Mudança no formato do fio

O campo `data.reason` do evento `session_closed` já existe com o valor `'client_close'`. Adicionamos dois novos valores:

- `'idle_timeout'` — emitido pelo reaper ocioso (backstop para clientes que falharam)
- `'last_client_detached'` — emitido pelo fechamento na última desconexão (fechamento normal de aba)

Isso é compatível com versões anteriores — o código SDK existente que verifica `reason === 'client_close'` simplesmente não corresponderá aos novos valores, e o manipulador genérico de quadro terminal (`isTerminalLifecycleEvent`) já lida com `session_closed` independentemente do motivo.

---

## 5. Plano de Testes

### 5.1 Testes unitários (`bridge.test.ts`)

| #   | Teste                                                              | Descrição                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sessão ociosa é removida após timeout                              | Criar uma sessão, avançar o tempo além de `sessionIdleTimeoutMs`, acionar o tick do reaper, verificar se a sessão foi removida de `byId` e se o evento `session_closed` foi publicado com `reason: 'idle_timeout'` |
| 2   | Sessão com prompt ativo NÃO é removida                             | Criar uma sessão, iniciar um prompt, avançar o tempo, verificar se a sessão sobrevive ao tick do reaper                                                                                      |
| 3   | Sessão com assinante SSE ativo NÃO é removida                      | Criar uma sessão, assinar seu EventBus, avançar o tempo, verificar se a sessão sobrevive                                                                                                     |
| 4   | Sessão com cliente registrado NÃO é removida                       | Criar uma sessão, registrar um clientId, avançar o tempo, verificar se a sessão sobrevive                                                                                                    |
| 5   | Reaper desabilitado quando interval = 0                            | Passar `sessionReapIntervalMs: 0`, verificar que nenhum `setInterval` está armado                                                                                                            |
| 6   | Reaper desabilitado quando timeout = 0                             | Passar `sessionIdleTimeoutMs: 0`, verificar que nenhum `setInterval` está armado                                                                                                             |
| 7   | Reaper interrompido ao desligar                                    | Chamar `shutdown()`, verificar que `clearInterval` foi chamado                                                                                                                               |
| 8   | O motivo do closeSession padrão é 'client_close'                   | Chamar `closeSession` sem motivo explícito, verificar que o evento publicado tem `reason: 'client_close'`                                                                                    |
| 9   | closeSession com motivo explícito                                  | Chamar `closeSession` com `reason: 'idle_timeout'`, verificar o evento publicado                                                                                                             |
| 10  | Múltiplas sessões ociosas removidas em um único tick               | Criar 3 sessões ociosas, avançar o tempo, acionar o tick, verificar que todas as 3 foram removidas                                                                                           |
| 11  | Sessão com heartbeat dentro do TTL sobrevive                       | Criar uma sessão, gravar heartbeat, avançar o tempo para pouco abaixo do TTL, verificar se a sessão sobrevive                                                                                |
| 12  | Timer ocioso do canal acionado após a última sessão ser removida   | Criar 1 sessão (última no canal), removê-la, verificar se `startIdleTimer` é chamado no canal                                                                                                |

### 5.2 Testes de integração (`server.test.ts`)

| #   | Teste                                                                       | Descrição                                                                                             |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `GET /health?deep=1` reflete a contagem de sessões limpas pelo reaper       | Iniciar o daemon, criar sessões, avançar o tempo, verificar que o endpoint de health mostra contagem reduzida |
| 2   | Assinante SSE recebe `session_closed` com `reason: 'idle_timeout'`          | Abrir SSE, desconectar, reconectar antes do TTL, depois deixar o TTL expirar, verificar o evento       |

---

## 6. Padrões de Configuração

| Opção                    | Padrão            | Justificativa                                                                                                                   |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `sessionReapIntervalMs` | 60.000 (1 min)    | Frequente o suficiente para evitar acúmulo longo, barato o suficiente (simples varredura de Map) para executar com frequência   |
| `sessionIdleTimeoutMs`  | 1.800.000 (30 min)| Período de carência generoso para reconexão. Corresponde a `ConnectionRegistry.idleTtlMs` para consistência do modelo mental   |
---

## 7. Observabilidade

- **stderr log**: `qwen serve: reaping idle session "<id>" (idle for Nms)` a
  cada encerramento, seguindo a convenção existente do prefixo `qwen serve:`.
- **Evento de telemetria**: `session.close` com operação
  `qwen-code.daemon.bridge.operation: 'session.close'` (reutiliza o caminho de telemetria existente do `closeSession`).
- **Métrica de telemetria**: `sessionLifecycle('close')` (reutiliza o contador existente).
- **Evento SSE**: `session_closed` com `data.reason: 'idle_timeout'`.

---

## 8. Trabalho Futuro (Fora do Escopo)

| Item                            | Descrição                                                                      | Prioridade |
| ------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| Remoção LRU em `maxSessions`    | Em vez de rejeitar novas sessões, remover a sessão ociosa menos recentemente ativa | P1         |
| Compressão do anel do EventBus  | Comprimir o anel para sessões com 0 assinantes para economizar memória          | P2         |
| Pressão adaptativa baseada em RSS | Monitorar `process.memoryUsage().rss` e reduzir o TTL ocioso quando a memória estiver baixa | P2         |
| Vitalidade do cliente baseada em heartbeat | Remover automaticamente clientes que perdem N janelas consecutivas de heartbeat | P2         |

---

## 9. Riscos e Mitigações

| Risco                                                                            | Mitigação                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O reaper encerra uma sessão que um cliente headless está prestes a reconectar    | O TTL padrão de 30 minutos é generoso; clientes headless devem enviar heartbeats. A transcrição em disco é preservada — `session/load` a restaura.                                            |
| `closeSession` dentro do reaper lança exceção, envenenando o loop de varredura  | Cada encerramento está em seu próprio `.catch()` — uma falha não bloqueia as outras                                                                                                            |
| Iteração do reaper sobre `byId` durante `closeSession` concorrente de outro caminho | A iteração do Map do ES2015 tolera exclusão de chaves atuais/anteriores. Fechamento duplo é idempotente (`byId.get` retorna `undefined` → `SessionNotFoundError` capturado pelo `.catch` do reaper). |
| Desempenho de escanear 20 sessões a cada 60s                                   | Trivial — 20 leituras de Map + 4 verificações de campo cada. Sem E/S.                                                                                                                             |
| Interação do temporizador ocioso do canal                                       | Quando a última sessão é encerrada, `closeSession` já chama `startIdleTimer` no canal. Nenhuma lógica adicional necessária.                                                        |
