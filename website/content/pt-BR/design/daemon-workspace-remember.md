# Daemon Workspace Remember — Ingestão de Memória Sem Sessão

> **Status**: Proposto — implementação no [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884) (branch `codex/sessionless-daemon-remember`), ainda não merged.

---

## 1. Declaração do Problema

O sistema de memória gerenciada do daemon (extração automática, dream agent) anteriormente
exigia uma sessão de chat ativa para gravar memórias. Isso criava dois problemas:

1. **A UI de configurações não pode gravar memórias** — o painel de configurações do web-shell precisa
   salvar fatos fornecidos pelo usuário (ex.: "always use TypeScript strict mode") sem
   criar ou poluir uma sessão de chat visível.
2. **Poluição da lista de sessões** — criar uma sessão descartável apenas para executar um
   comando `/remember` adiciona ruído à lista de sessões e confunde os usuários que veem
   sessões fantasma que nunca abriram.

A solução é um **endpoint de remember no nível do workspace sem sessão** que enfileira
tarefas de gravação de memória, executa-as via um fork oculto do `AgentHeadless` (nenhuma sessão
é criada) e expõe o status via polling.

---

## 2. Visão Geral do Design

```
┌──────────────┐  POST /workspace/memory/remember   ┌─────────────────────────┐
│  SDK / UI    │ ─────────────────────────────────►  │  workspace-remember.ts  │
│  client      │                                     │  (WorkspaceRemember-    │
│              │  GET  /workspace/memory/remember/:id │   TaskLane)             │
│              │ ─────────────────────────────────►  │                         │
└──────────────┘                                     └────────────┬────────────┘
                                                                  │ bridge.runWorkspaceMemoryRemember()
                                                     ┌────────────▼────────────┐
                                                     │  HttpAcpBridge          │
                                                     │  extMethod(             │
                                                     │    'qwen/control/       │
                                                     │     workspace/memory/   │
                                                     │     remember')          │
                                                     └────────────┬────────────┘
                                                                  │ ACP stdio (JSON-RPC)
                                                     ┌────────────▼────────────┐
                                                     │  qwen --acp child       │
                                                     │  (QwenAgent.extMethod)  │
                                                     │  → runManagedRemember-  │
                                                     │    ByAgent (forked)     │
                                                     └─────────────────────────┘
```

Propriedades principais:

- **Nenhuma sessão necessária** — a bridge garante que o filho ACP seja gerado (spawned), mas não
  cria/carrega/resume nenhuma sessão ACP.
- **Execução serial** — as tarefas são executadas uma de cada vez via uma lane de cadeia de promises,
  evitando gravações concorrentes no sistema de arquivos de memória gerenciada.
- **Oculto** — o agente em fork é executado com `name: 'managed-auto-memory-remember'`
  e é invisível para a lista de sessões.
- **Capacidade anunciada** — `workspace_memory_remember` na resposta de `/capabilities` do daemon,
  com `modes: ['workspace', 'clean']` suportados.

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
| `content`     | `string` | sim         | O fato a ser lembrado. Máximo de 64 KiB (tamanho em bytes UTF-8).                                         |
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
| 400    | `invalid_content`            | Conteúdo ausente, vazio ou excedido               |
| 400    | `invalid_context_mode`       | Valor de contextMode não reconhecido              |
| 400    | `invalid_client_id`          | X-Qwen-Client-Id não registrado na bridge         |
| 409    | `managed_memory_unavailable` | Memória gerenciada não configurada para o workspace |
| 429    | `remember_queue_full`        | 16 tarefas pendentes já enfileiradas              |
| 500    | `remember_failed`            | Verificação de disponibilidade lançou uma exceção inesperada |

### 3.2 `GET /workspace/memory/remember/:taskId`

Consulta o status da tarefa (polling).

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
- **running** — a chamada da bridge está em andamento; o agente em fork está executando.
- **completed** — o agente terminou com sucesso; `result` é preenchido.
- **failed** — o agente lançou uma exceção ou atingiu o timeout; `error` é preenchido.

A lane armazena até **1000 tarefas** no total (tarefas terminais são removidas em FIFO quando o
limite é atingido). No máximo **16 tarefas** podem estar pendentes (queued + running) a qualquer
momento.

---

## 5. Detalhes de Implementação

### 5.1 Lane Serial de Tarefas (`WorkspaceRememberTaskLane`)

Localizado em `packages/cli/src/serve/workspace-remember.ts`. Mantém um
`Map<taskId, TaskRecord>` e uma única cadeia de promises (`this.tail`). Cada
`enqueue()` anexa uma função `run` que:

1. Define o status como `running`.
2. Chama `bridge.runWorkspaceMemoryRemember({ content, contextMode })`.
3. Em caso de sucesso: define o status como `completed`, preenche `result`, publica
   o evento `memory_changed`.
4. Em caso de falha: define o status como `failed`, preenche `error` com um código de erro
   público estável.

A lane garante serialização estrita — apenas uma tarefa de remember é executada por
vez, evitando gravações concorrentes no sistema de arquivos de memória gerenciada.

### 5.2 Camada da Bridge (`HttpAcpBridge`)

Dois métodos adicionados ao `BridgeInterface` (`packages/acp-bridge/src/bridgeTypes.ts`):

- `isWorkspaceMemoryRememberAvailable()` — chama
  o ext-method `qwen/control/workspace/memory/remember/availability` no filho.
  Retorna `boolean`. Usado para fast-fail `409` antes de enfileirar.
- `runWorkspaceMemoryRemember(request)` — chama
  o ext-method `qwen/control/workspace/memory/remember`. Atinge o timeout em **300 s**
  (`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`). NÃO cria ou carrega uma sessão.

Ambos os métodos chamam `ensureChannel()` (gerando o filho ACP se necessário) e
reiniciam o timer de inatividade depois, se não houver sessões ativas.

### 5.3 Execução do Filho ACP (`QwenAgent.extMethod`)

Em `packages/cli/src/acp-integration/acpAgent.ts`, o handler para
`workspaceMemoryRemember`:

1. Valida `content` (string não vazia, ≤64 KiB) e `contextMode`.
2. Verifica `config.isManagedMemoryAvailable()`.
3. Chama `runManagedRememberByAgent()` com um sinal de abort de **295 s**
   (`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` — ligeiramente menor que o timeout da bridge
   para garantir que o filho aborte antes do backstop da bridge).

### 5.4 Lógica Principal do Remember (`packages/core/src/memory/remember.ts`)

`runManagedRememberByAgent()`:

1. Constrói um prompt de sistema de memória limpo a partir do índice de memória gerenciada do projeto.
2. Opcionalmente remove a memória prévia do usuário (se `contextMode === 'clean'`).
3. Cria um `memoryScopedAgentConfig` que restringe a I/O de arquivos apenas aos diretórios de memória.
4. Executa um **agente headless em fork** (`runForkedAgent`) com:
   - Nome: `managed-auto-memory-remember`
   - Ferramentas: `read_file`, `grep`, `ls`, `write_file`, `edit`
   - Máximo de turnos: 6
   - Tempo máximo: 5 minutos
5. Valida se todos os arquivos tocados estão dentro dos caminhos de memória permitidos
   (`classifyTouchedScopes`). Lança `remember_path_escape` se o agente gravou
   fora dos diretórios de memória.
6. Reconstrói os índices de memória para quaisquer escopos tocados.
7. Retorna `{ summary, filesTouched, touchedScopes }`.

### 5.5 Configuração do Agente com Escopo de Memória (`packages/core/src/memory/memory-scoped-agent-config.ts`)

`createMemoryScopedAgentConfig()` cria um wrapper `Config` com permissões restritas que:

- **Ferramentas de gravação** (`write_file`, `edit`): permitidas apenas dentro da raiz
  de auto-memória do projeto ou raiz de memória do usuário (`~/.qwen/memories`).
- **Ferramentas de leitura** (`read_file`, `grep`, `ls`): quando `restrictReadsToMemoryPaths`
  é true, permitidas apenas dentro dos diretórios de memória.
- **Shell**: desabilitado por padrão; se habilitado, apenas comandos read-only são permitidos.
- Resolve symlinks para evitar escapes de travessia de caminho (path-traversal).

---

## 6. Eventos

### `memory_changed` (scope: `managed`)

Publicado no stream de eventos SSE do daemon (`GET /session/:id/events`) como um
evento `memory_changed` com `scope: 'managed'` quando uma tarefa de remember é concluída
com sucesso. Clientes inscritos no stream de eventos por sessão recebem esta
notificação.

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

| Campo           | Tipo        | Descrição                                             |
| --------------- | ----------- | ----------------------------------------------------- |
| `scope`         | `"managed"` | Discrimina de eventos `memory_changed` baseados em arquivo |
| `source`        | `string`    | Sempre `"workspace_memory_remember"` para este recurso |
| `taskId`        | `string`    | Correlaciona com a tarefa retornada pelo POST         |
| `touchedScopes` | `string[]`  | Quais escopos de memória foram gravados: `"user"`, `"project"` |

O `originatorClientId` (se fornecido no momento do POST) é anexado ao envelope do evento
para que o barramento de eventos possa roteá-lo para o cliente de origem.

---

## 7. Tratamento de Erros

### Códigos de Erro

| Código                       | Origem              | Significado                                            |
| ---------------------------- | ------------------- | ------------------------------------------------------ |
| `invalid_content`            | Rota HTTP           | Conteúdo ausente, vazio ou excede 64 KiB               |
| `invalid_context_mode`       | Rota HTTP           | contextMode não é `"workspace"` ou `"clean"`           |
| `invalid_client_id`          | Rota HTTP           | Header Client-Id não está no conjunto conhecido da bridge |
| `managed_memory_unavailable` | Bridge / Filho ACP  | Workspace não configurado para memória gerenciada      |
| `remember_queue_full`        | Lane de tarefas     | Limite de 16 tarefas pendentes atingido                |
| `remember_path_escape`       | Lógica principal do remember | O agente gravou em um caminho fora dos diretórios de memória gerenciada |
| `remember_failed`            | Catch-all           | Falha de agente não classificada, timeout ou erro interno |
| `remember_task_not_found`    | Rota HTTP           | GET para ID de tarefa desconhecido ou não autorizado   |

### Cadeia de Timeout

```
Agent forked runner:   5 min maxTimeMinutes
Child abort signal:  295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Bridge timeout:      300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

O filho aborta antes da bridge atingir o timeout, garantindo que um erro limpo seja propagado
em vez de um timeout no nível de transporte.

---

## 8. Integração com o SDK

### SDK TypeScript (`@qwen-code/sdk-typescript`)

Dois novos métodos no `DaemonClient`:

```typescript
// Queue a remember task
const task = await client.rememberWorkspaceMemory(
  'The project uses pnpm workspaces',
  { contextMode: 'workspace' },
);
// task.taskId, task.status === 'queued'

// Poll until terminal
const result = await client.getWorkspaceMemoryRememberTask(task.taskId);
// result.status === 'completed' | 'failed'
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
anteriormente carregava apenas `scope: 'workspace' | 'global'` para gravações de QWEN.md
baseadas em arquivo.

---

## 9. Justificativa do Design

### Por que sem sessão (sessionless)?

O comando slash `/remember` na CLI já funciona dentro de uma sessão. Mas a
UI de Configurações e os chamadores programáticos do SDK não devem precisar criar uma sessão apenas
para persistir um fato. Uma sessão implica histórico de conversação, rastreamento de turnos e
visibilidade na lista de sessões — nenhuma das quais se aplica a uma gravação de memória do tipo fire-and-forget.

### Por que execução serial?

O sistema de memória gerenciada armazena fatos em arquivos markdown com índices. Gravações
concorrentes de múltiplas tarefas de remember poderiam corromper índices ou produzir conflitos
de merge. Uma lane single-threaded é a solução correta mais simples.

### Por que uma fila de tarefas (e não síncrona)?

Gravações de memória envolvem um agente LLM decidindo _onde_ e _como_ armazenar o fato
(escolhendo entre escopo de usuário vs. projeto, selecionando o arquivo certo, formatando).
Isso leva de 2 a 30 segundos. Uma requisição HTTP síncrona atingiria o timeout ou
bloquearia o cliente. O padrão de fila assíncrona + polling mantém o contrato HTTP simples
e permite que os clientes mostrem uma UI de progresso.

### Por que `contextMode`?

- `"workspace"` (padrão) — o agente de remember vê memórias existentes como
  contexto, permitindo desduplicar ou atualizar entradas existentes.
- `"clean"` — o agente não vê memória prévia do usuário, útil quando o chamador deseja
  forçar uma gravação fresca sem lógica de desduplicação (ex.: importação em massa).

### Por que restringir leituras aos caminhos de memória?

O agente de remember deve apenas ler/gravar dentro dos diretórios de memória gerenciada. Isso
previne um cenário de injeção de prompt onde um `content` elaborado engana o agente
para ler arquivos sensíveis do projeto e vazá-los nas entradas de memória.