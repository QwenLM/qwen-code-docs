# Tarefas de Memória do Workspace do Daemon — Memória Gerenciada Sem Sessão

> **Status**: Proposto — implementação no [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884) (branch `codex/sessionless-daemon-remember`), ainda não integrado.

---

## 1. Declaração do Problema

O sistema de memória gerenciada do daemon (extração automática, agente dream) anteriormente exigia uma sessão de chat ativa para gravar memórias. Isso criava dois problemas:

1. **A UI de configurações não pode gravar memórias** — o painel de configurações do web-shell precisa salvar fatos fornecidos pelo usuário (ex.: "sempre usar o modo estrito do TypeScript") sem criar ou poluir uma sessão de chat visível.
2. **Poluição da lista de sessões** — criar uma sessão descartável apenas para executar um comando `/remember` adiciona ruído à lista de sessões e confunde os usuários que veem sessões fantasma que nunca abriram.

A solução é uma **API de tarefas de memória no nível do workspace sem sessão** que enfileira tarefas de remember, forget e dream, executa-as sem criar uma sessão visível e expõe o status via polling.

---

## 2. Visão Geral do Design

```
┌──────────────┐  POST /workspace/memory/{task}      ┌─────────────────────────┐
│  SDK / UI    │ ─────────────────────────────────►  │  workspace-remember.ts  │
│  client      │                                     │  (WorkspaceRemember-    │
│              │  GET  /workspace/memory/{task}/:id  │   TaskLane)             │
│              │ ─────────────────────────────────►  │                         │
└──────────────┘                                     └────────────┬────────────┘
                                                                  │ bridge.runWorkspaceMemory*
                                                     ┌────────────▼────────────┐
                                                     │  HttpAcpBridge          │
                                                     │  extMethod(             │
                                                     │    'qwen/control/       │
                                                     │     workspace/memory/   │
                                                     │     {task}')            │
                                                     └────────────┬────────────┘
                                                                  │ ACP stdio (JSON-RPC)
                                                     ┌────────────▼────────────┐
                                                     │  qwen --acp child       │
                                                     │  (QwenAgent.extMethod)  │
                                                     │  → remember / forget /  │
                                                     │    dream core logic     │
                                                     └─────────────────────────┘
```

Propriedades principais:

- **Nenhuma sessão necessária** — a bridge garante que o ACP child seja inicializado, mas não cria/carrega/resume nenhuma sessão ACP.
- **Execução serial** — as tarefas são executadas uma de cada vez via uma lane de promise-chain, evitando escritas concorrentes no sistema de arquivos de memória gerenciada.
- **Oculto** — remember/dream são executados através de agentes ocultos e forget usa uma configuração de memória oculta; nenhuma das operações cria sessões visíveis.
- **Capacidade anunciada** — `workspace_memory_remember`, `workspace_memory_forget` e `workspace_memory_dream` na resposta `/capabilities` do daemon. Remember também anuncia `modes: ['workspace', 'clean']`.

---

## 3. Endpoints da API

### 3.1 `POST /workspace/memory/remember`

Enfileira uma nova tarefa de remember.

**Requisição:**

```json
{
  "content": "The user prefers dark mode in all editors",
  "contextMode": "workspace"
}
```

| Campo         | Tipo     | Obrigatório | Descrição                                                                                                 |
| ------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `content`     | `string` | sim         | O fato a ser lembrado. Máx. 64 KiB (tamanho em bytes UTF-8).                                              |
| `contextMode` | `string` | não         | `"workspace"` (padrão) — o agente vê o contexto de memória do workspace. `"clean"` — o agente não vê memória prévia do usuário. |

**Headers:**

- `Authorization: Bearer <token>` (obrigatório)
- `X-Qwen-Client-Id: <clientId>` (opcional — define o escopo de visibilidade da tarefa)

**Resposta `202 Accepted`:**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z"
}
```

**Respostas de erro:**

| Status | Código                       | Condição                                          |
| ------ | ---------------------------- | ------------------------------------------------- |
| 400    | `invalid_content`            | Conteúdo ausente, vazio ou com tamanho excedido   |
| 400    | `invalid_context_mode`       | Valor de contextMode não reconhecido              |
| 400    | `invalid_client_id`          | X-Qwen-Client-Id não registrado na bridge         |
| 409    | `managed_memory_unavailable` | Memória gerenciada não configurada para o workspace |
| 429    | `remember_queue_full`        | 16 tarefas pendentes já enfileiradas              |
| 500    | `remember_failed`            | Verificação de disponibilidade falhou inesperadamente |

### 3.2 `GET /workspace/memory/remember/:taskId`

Consulta o status da tarefa.

**Headers:**

- `Authorization: Bearer <token>` (obrigatório)
- `X-Qwen-Client-Id: <clientId>` (opcional — deve corresponder ao originador para ver a tarefa)

**Resposta `200 OK` (queued/running):**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "result": null,
  "error": null
}
```

- `status` será `"queued"` ou `"running"` dependendo se a tarefa iniciou a execução.
- `result`: presente apenas (não nulo) quando `status === "completed"`.
- `error`: presente apenas (não nulo) quando `status === "failed"`.

**Resposta `200 OK` (completed):**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "completed",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:05.000Z",
  "result": {
    "summary": "Saved dark-mode preference to user memory.",
    "filesTouched": ["~/.qwen/memories/user/user.md"],
    "touchedScopes": ["user"]
  }
}
```

**Resposta `200 OK` (failed):**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "failed",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:03.000Z",
  "error": {
    "code": "remember_path_escape",
    "message": "Remember agent touched a path outside managed memory."
  }
}
```

**Respostas de erro:**

| Status | Código                    | Condição                                               |
| ------ | ------------------------- | ------------------------------------------------------ |
| 400    | `invalid_client_id`       | X-Qwen-Client-Id não registrado                        |
| 404    | `remember_task_not_found` | A tarefa não existe ou pertence a um cliente diferente |

---

### 3.3 `POST /workspace/memory/forget`

Enfileira uma tarefa de forget. O daemon seleciona as entradas de auto-memória gerenciada correspondentes e as remove sem criar uma sessão.

**Requisição:**

```json
{
  "query": "old preference"
}
```

| Campo   | Tipo     | Obrigatório | Descrição                                                             |
| ------- | -------- | ----------- | --------------------------------------------------------------------- |
| `query` | `string` | sim         | Descrição em linguagem natural para esquecer. Máx. 64 KiB (tamanho em bytes UTF-8). |

A resposta inicial é `202 Accepted` com um id de tarefa `forget-...`. Faça polling de `GET /workspace/memory/forget/:taskId` até o estado terminal.

**Resultado concluído:**

```json
{
  "summary": "Forgot 1 memory entry.",
  "removedEntries": [
    {
      "topic": "project",
      "summary": "old preference",
      "filePath": "/path/to/memory.md"
    }
  ],
  "touchedTopics": ["project"]
}
```

### 3.4 `GET /workspace/memory/forget/:taskId`

Consulta o status da tarefa de forget. O formato corresponde ao polling da tarefa de remember, exceto que não há o campo `contextMode` e falhas terminais usam `forget_task_not_found` para ids de tarefa desconhecidos ou não autorizados.

### 3.5 `POST /workspace/memory/dream`

Enfileira uma tarefa de dream. O daemon executa o fluxo de compactação dream da auto-memória gerenciada sem criar uma sessão.

**Requisição:** objeto JSON vazio ou sem body.

A resposta inicial é `202 Accepted` com um id de tarefa `dream-...`. Faça polling de `GET /workspace/memory/dream/:taskId` até o estado terminal.

**Resultado concluído:**

```json
{
  "summary": "Managed auto-memory dream completed.",
  "touchedTopics": ["project"],
  "dedupedEntries": 1
}
```

### 3.6 `GET /workspace/memory/dream/:taskId`

Consulta o status da tarefa de dream. O formato corresponde ao polling da tarefa de remember, exceto que não há o campo `contextMode` e falhas terminais usam `dream_task_not_found` para ids de tarefa desconhecidos ou não autorizados.

---

## 4. Ciclo de Vida da Tarefa

```
            enqueue()
               │
               ▼
  ┌─────────────────────┐
  │       queued         │   (awaiting serial lane slot)
  └──────────┬──────────┘
             │  lane picks up
             ▼
  ┌─────────────────────┐
  │       running        │   (bridge.runWorkspaceMemoryRemember in progress)
  └──────────┬──────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌──────────┐    ┌──────────┐
│ completed│    │  failed  │
└──────────┘    └──────────┘
```

- **queued** — a tarefa é criada e aguarda na lane serial.
- **running** — a chamada da bridge está em andamento; o agente derivado está executando.
- **completed** — o agente terminou com sucesso; `result` é preenchido.
- **failed** — o agente lançou uma exceção ou atingiu o timeout; `error` é preenchido.

A lane armazena até **1000 tarefas** no total (tarefas terminais são removidas em FIFO quando o limite é atingido). No máximo **16 tarefas** podem estar pendentes (queued + running) a qualquer momento. As tarefas de forget e dream compartilham um limite menor de **8 tarefas pendentes** para que a manutenção manual em rajadas não consuma todos os slots necessários para o trabalho automático de remember.

---

## 5. Detalhes de Implementação

### 5.1 Lane Serial de Tarefas (`WorkspaceRememberTaskLane`)

Localizado em `packages/cli/src/serve/workspace-remember.ts`. Mantém um `Map<taskId, TaskRecord>` e uma única promise chain (`this.tail`). Cada `enqueue()` anexa uma função `run` que:

1. Define o status como `running`.
2. Chama o método correspondente da bridge: `runWorkspaceMemoryRemember`, `runWorkspaceMemoryForget` ou `runWorkspaceMemoryDream`.
3. Em caso de sucesso: define o status como `completed`, preenche `result` e publica um evento `memory_changed` quando a tarefa realmente alterou a memória gerenciada.
4. Em caso de falha: define o status como `failed`, preenche `error` com um código de erro público estável.

A lane garante serialização estrita — apenas uma tarefa de memória do workspace é executada por vez, evitando escritas concorrentes no sistema de arquivos de memória gerenciada.

### 5.2 Camada da Bridge (`HttpAcpBridge`)

Métodos de memória do workspace adicionados à `BridgeInterface` (`packages/acp-bridge/src/bridgeTypes.ts`):

- `isWorkspaceMemoryRememberAvailable()` — chama o ext-method `qwen/control/workspace/memory/remember/availability` no child. Retorna `boolean`. Usado para falha rápida `409` antes de enfileirar.
- `runWorkspaceMemoryRemember(request)` — chama o ext-method `qwen/control/workspace/memory/remember`. Tempo limite de **300 s** (`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`). NÃO cria ou carrega uma sessão.
- `runWorkspaceMemoryForget(request)` — chama o ext-method `qwen/control/workspace/memory/forget` e usa o mesmo tempo limite da bridge. NÃO cria ou carrega uma sessão.
- `runWorkspaceMemoryDream()` — chama o ext-method `qwen/control/workspace/memory/dream` e usa o mesmo tempo limite da bridge. NÃO cria ou carrega uma sessão.

Ambos os métodos chamam `ensureChannel()` (inicializando o ACP child se necessário) e reiniciam o timer de inatividade em seguida se não houver sessões ativas.
### 5.3 Execução do Child ACP (`QwenAgent.extMethod`)

Em `packages/cli/src/acp-integration/acpAgent.ts`, o handler para
`workspaceMemoryRemember`, `workspaceMemoryForget` e `workspaceMemoryDream`:

1. Valida a entrada específica da tarefa (`content`/`contextMode` para remember,
   `query` para forget).
2. Verifica `config.isManagedMemoryAvailable()`.
3. Chama a operação core correspondente com um sinal de abort de **295 s**
   (`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` — um pouco menor que o timeout
   da bridge para garantir que o child aborte antes do backstop da bridge). Para o forget,
   o sinal é propagado através do `MemoryManager.forget`, seleção, query do lado do modelo
   e mutações do sistema de arquivos no momento da aplicação.

### 5.4 Lógica Core de Remember (`packages/core/src/memory/remember.ts`)

`runManagedRememberByAgent()`:

1. Constrói um prompt de sistema de memória limpo a partir do índice de memória gerenciada do projeto.
2. Opcionalmente, remove a memória anterior do usuário (se `contextMode === 'clean'`).
3. Cria um `memoryScopedAgentConfig` que restringe a E/S de arquivos apenas aos diretórios de memória.
4. Executa um **agente headless forked** (`runForkedAgent`) com:
   - Nome: `managed-auto-memory-remember`
   - Ferramentas: `read_file`, `grep`, `ls`, `write_file`, `edit`
   - Máximo de turnos: 6
   - Tempo máximo: 5 minutos
5. Valida se todos os arquivos tocados estão dentro dos caminhos de memória permitidos
   (`classifyTouchedScopes`). Lança `remember_path_escape` se o agente escreveu
   fora dos diretórios de memória.
6. Reconstrói os índices de memória para quaisquer escopos tocados.
7. Retorna `{ summary, filesTouched, touchedScopes }`.

### 5.5 Configuração do Agente com Escopo de Memória (`packages/core/src/memory/memory-scoped-agent-config.ts`)

`createMemoryScopedAgentConfig()` cria um wrapper `Config` com permissões restritas que:

- **Ferramentas de escrita** (`write_file`, `edit`): permitidas apenas dentro da raiz
  auto-memory do projeto ou da raiz de memória do usuário (`~/.qwen/memories`).
- **Ferramentas de leitura** (`read_file`, `grep`, `ls`): quando `restrictReadsToMemoryPaths`
  é true, permitidas apenas dentro dos diretórios de memória.
- **Shell**: desabilitado por padrão; se habilitado, apenas comandos read-only são permitidos.
- Resolve symlinks para prevenir escapes de path-traversal.

---

## 6. Eventos

### `memory_changed` (scope: `managed`)

Publicado no stream de eventos SSE do daemon (`GET /session/:id/events`) como um
evento `memory_changed` com `scope: 'managed'` quando uma tarefa de memória do workspace
é concluída com sucesso e realmente toca na memória gerenciada. Clientes inscritos
no stream de eventos por sessão recebem esta notificação.

**Payload:**

```json
{
  "type": "memory_changed",
  "data": {
    "scope": "managed",
    "source": "workspace_memory_remember",
    "taskId": "remember-a1b2c3d4-...",
    "touchedScopes": ["user", "project"]
  }
}
```

| Campo           | Tipo        | Descrição                                                                               |
| --------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `scope`         | `"managed"` | Discrimina de eventos `memory_changed` baseados em arquivo                                |
| `source`        | `string`    | `"workspace_memory_remember"`, `"workspace_memory_forget"` ou `"workspace_memory_dream"`  |
| `taskId`        | `string`    | Correlaciona com a tarefa retornada pelo POST                                             |
| `touchedScopes` | `string[]`  | Quais escopos de memória foram escritos: `"user"`, `"project"`                            |

O `originatorClientId` (se fornecido no momento do POST) é anexado ao envelope do evento
para que o event bus possa roteá-lo para o cliente de origem.

---

## 7. Tratamento de Erros

### Códigos de Erro

| Código                       | Origem              | Significado                                                |
| ---------------------------- | ------------------- | ---------------------------------------------------------- |
| `invalid_content`            | Rota HTTP           | Conteúdo ausente, vazio ou excede 64 KiB                   |
| `invalid_context_mode`       | Rota HTTP           | contextMode não é `"workspace"` ou `"clean"`               |
| `invalid_query`              | Rota HTTP           | Query de forget ausente, vazia ou excede 64 KiB            |
| `invalid_client_id`          | Rota HTTP           | Header Client-Id não está no conjunto conhecido da bridge  |
| `managed_memory_unavailable` | Bridge / Child ACP  | Workspace não configurado para memória gerenciada          |
| `remember_queue_full`        | Task lane           | Limite de 16 tarefas pendentes atingido                    |
| `remember_path_escape`       | Lógica core de remember | O agente escreveu em um caminho fora dos diretórios de memória gerenciada |
| `remember_failed`            | Catch-all           | Falha de agente não classificada, timeout ou erro interno  |
| `remember_task_not_found`    | Rota HTTP           | GET para ID de tarefa desconhecido ou não autorizado       |
| `forget_task_not_found`      | Rota HTTP           | GET para ID de tarefa de forget desconhecido ou não autorizado |
| `dream_task_not_found`       | Rota HTTP           | GET para ID de tarefa de dream desconhecido ou não autorizado |

### Cadeia de Timeout

```
Runner de agente forked:   5 min maxTimeMinutes
Sinal de abort do child:   295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Timeout da bridge:         300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

O child aborta antes que a bridge atinja o timeout, garantindo que um erro limpo seja propagado
em vez de um timeout no nível do transporte.

---

## 8. Integração com o SDK

### SDK TypeScript (`@qwen-code/sdk-typescript`)

Métodos de memória do workspace no `DaemonClient`:

```typescript
// Enfileira uma tarefa de remember
const task = await client.rememberWorkspaceMemory(
  'The project uses pnpm workspaces',
  { contextMode: 'workspace' },
);
// task.taskId, task.status === 'queued'

// Faz polling até o estado terminal
const result = await client.getWorkspaceMemoryRememberTask(task.taskId);
// result.status === 'completed' | 'failed'

const forget = await client.forgetWorkspaceMemory('old preference');
const forgetResult = await client.getWorkspaceMemoryForgetTask(forget.taskId);

const dream = await client.dreamWorkspaceMemory();
const dreamResult = await client.getWorkspaceMemoryDreamTask(dream.taskId);
```

### Normalização de Eventos da UI

O normalizador do SDK mapeia o evento SSE bruto `memory_changed` (com
`scope: 'managed'`) para um `DaemonUiWorkspaceMemoryChangedEvent`:

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

Isso estende o tipo de evento `workspace.memory.changed` existente, que
anteriormente carregava apenas `scope: 'workspace' | 'global'` para escritas em QWEN.md baseadas em arquivo.

---

## 9. Justificativa de Design

### Por que sem sessão (sessionless)?

O comando slash `/remember` na CLI já funciona dentro de uma sessão. Mas a UI de Configurações e os chamadores programáticos do SDK não devem precisar criar uma sessão apenas para persistir um fato. Uma sessão implica histórico de conversação, rastreamento de turnos e visibilidade na lista de sessões — nenhuma das quais se aplica a uma escrita de memória do tipo fire-and-forget.

### Por que execução serial?

O sistema de memória gerenciada armazena fatos em arquivos markdown com índices. Escritas concorrentes de múltiplas tarefas de remember poderiam corromper os índices ou produzir conflitos de merge. Uma lane single-threaded é a solução correta mais simples.

### Por que uma fila de tarefas (e não síncrono)?

As escritas de memória envolvem um agente LLM decidindo _onde_ e _como_ armazenar o fato (escolhendo entre escopo de usuário vs. projeto, selecionando o arquivo certo, formatando). Isso leva de 2 a 30 segundos. Uma requisição HTTP síncrona atingiria o timeout ou bloquearia o cliente. O padrão de fila assíncrona + polling mantém o contrato HTTP simples e permite que os clientes mostrem uma UI de progresso.

### Por que contextMode?

- `"workspace"` (padrão) — o agente de remember vê as memórias existentes como contexto, permitindo desduplicar ou atualizar entradas existentes.
- `"clean"` — o agente não vê nenhuma memória anterior do usuário, útil quando o chamador quer forçar uma escrita fresca sem lógica de desduplicação (ex: importação em massa).

### Por que restringir leituras aos caminhos de memória?

O agente de remember deve apenas ler/escrever dentro dos diretórios de memória gerenciada. Isso previne um cenário de prompt-injection onde um `content` elaborado engana o agente para ler arquivos sensíveis do projeto e vazá-los nas entradas de memória.