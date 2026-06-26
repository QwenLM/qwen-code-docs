# Proteções de Orçamento do Workspace MCP

## Visão Geral

`WorkspaceMcpBudget` (`packages/core/src/tools/mcp-workspace-budget.ts`) é o controlador de orçamento do cliente MCP com escopo de workspace do F2 (#4175 commit 6). Ele possui a mesma máquina de estados que o `McpClientManager` carrega inline (reserva de slots, aviso de histerese de 75%, coalescência de recusas em lote durante uma passagem `discoverAllMcpTools*`), mas vive **uma vez por workspace** dentro do `McpTransportPool` em vez de uma vez por sessão dentro do gerenciador de cada filho ACP. O pool delega chamadas `acquire` e `release` aqui, de modo que o limite se aplica ao **workspace**, não a cada sessão.

A mecânica de orçamento legada do `McpClientManager` permanece para servidores MCP qwen standalone e SDK (que ignoram o pool conforme o fix do commit 4). Modo pool → `WorkspaceMcpBudget` aplica; standalone / SDK MCP → mecânica inline do gerenciador aplica. Sem dupla contagem porque a descoberta em modo pool nunca chama o `tryReserveSlot` do gerenciador.

## Responsabilidades

- Rastrear `reservedSlots: Set<string>` dos NOMES de servidores atualmente mantidos (a chave do slot é por NOME, correspondendo ao PR 14 v1).
- `tryReserve(name) → 'reserved' | 'already_held' | 'refused'` — atômico e síncrono, de modo que as aquisições concorrentes com `Promise.all` não podem ultrapassar o limite em um ponto de `await`.
- `release(name) → boolean` — idempotente (semântica de `Set.delete`).
- Disparar `mcp_budget_warning` uma vez ao ultrapassar 75% para cima de `reservedSlots.size / clientBudget`; rearmar apenas após uma ultrapassagem de 37,5% para baixo.
- Coalescer recusas por servidor em uma passagem de descoberta em massa — os métodos `beginBulkPass()` / `endBulkPass()` delimitam a acumulação de recusas em um único evento `mcp_child_refused_batch`.
- Manter `lastRefusedServerNames` para consumidores de snapshot (`GET /workspace/mcp`) — limpo no INÍCIO da próxima passagem em massa, NÃO na emissão, para que um snapshot entre passagens ainda veja o último conjunto de recusas.

## Arquitetura

### Configuração

```ts
new WorkspaceMcpBudget({
  clientBudget?: number,           // undefined = unlimited
  mode: 'off' | 'warn' | 'enforce',
  onEvent?: (event: McpBudgetEvent) => void,
});
```

Semântica do `mode`:

- `off` — todos os métodos são no-ops; `tryReserve` retorna `'reserved'` incondicionalmente; nenhum evento é disparado.
- `warn` — os slots são rastreados e `mcp_budget_warning` é disparado em 75%, mas `tryReserve` NUNCA recusa.
- `enforce` — `tryReserve` recusa além de `clientBudget`; `recordRefusal` enfileira recusas por servidor; `endBulkPass` emite `mcp_child_refused_batch`.

### Constantes de `mcp-client-manager.ts`

- `MCP_BUDGET_WARN_FRACTION = 0.75` — limiar superior.
- `MCP_BUDGET_REARM_FRACTION = 0.375` — rearme da histerese descendente.
- `McpBudgetMode = 'off' | 'warn' | 'enforce'`.

### Estado interno

| State                                              | Purpose                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `reservedSlots: Set<string>`                       | Conjunto de reserva autoritativo; histerese avalia `size / clientBudget`.                                    |
| `pendingRefusalNames: Set<string>`                 | Nomes de recusa acumulados durante a janela atual `beginBulkPass`/`endBulkPass`; drenados em `endBulkPass`.  |
| `pendingRefusalTransports: Map<string, transport>` | Sidecar para que o lote emitido carregue o transport de cada servidor recusado.                              |
| `lastRefusedServerNames: readonly string[]`        | Lista de recusas visível no snapshot da passagem completa mais recente. Limpa no início da próxima passagem. |
| `warnArmed: boolean`                               | Estado de histerese — true = pronto para disparar, false = já disparou desde o último dreno de 37,5%.         |
| `bulkPassDepth: number`                            | Contador de reentrância para passagens em massa aninhadas (passagens aninhadas não devem emitir duas vezes). |

## Fluxo de Trabalho

### `tryReserve`

```mermaid
flowchart TD
    A["tryReserve(serverName)"] --> B{"reservedSlots.has(name)?"}
    B -->|yes| AH["return 'already_held'"]
    B -->|no| C{"budget undefined OR mode == 'off'?"}
    C -->|yes| R["return 'reserved'"]
    C -->|no| D{"mode == 'enforce' AND size >= budget?"}
    D -->|yes| RF["return 'refused'"]
    D -->|no| ADD["reservedSlots.add(name)"]
    ADD --> EV["evaluateState() (hysteresis check)"]
    EV --> R2["return 'reserved'"]
```

`tryReserve` é **síncrono**. O `acquire` do pool é assíncrono, mas a reserva acontece antes de qualquer `await`, então duas aquisições concorrentes com `Promise.all` para nomes diferentes não podem ambas ultrapassar o limite.

### Histerese

```mermaid
flowchart TD
    EV["evaluateState() called after every mutation"] --> R["ratio = reservedSlots.size / clientBudget"]
    R --> U{"warnArmed && ratio >= 0.75?"}
    U -->|yes| FIRE["fire mcp_budget_warning; warnArmed = false"]
    U -->|no| D{"!warnArmed && ratio < 0.375?"}
    D -->|yes| ARM["warnArmed = true"]
    D -->|no| NOOP[no-op]
```

A histerese evita avisos repetidos quando uma carga de trabalho oscila em torno de 75%. A primeira ultrapassagem dispara; ultrapassagens subsequentes sem cair para 37,5% não disparam.

### Coalescência de recusas em lote

```mermaid
sequenceDiagram
    autonumber
    participant POOL as pool.discoverAllMcpToolsViaPool
    participant BDG as WorkspaceMcpBudget
    participant EB as EventBus

    POOL->>BDG: beginBulkPass()
    BDG->>BDG: bulkPassDepth++<br/>clear lastRefusedServerNames if outermost
    loop per server in pass
        POOL->>BDG: tryReserve(name)
        alt refused
            POOL->>BDG: recordRefusal(name, transport)
            BDG->>BDG: pendingRefusalNames.add; pendingRefusalTransports.set
            Note over BDG: NO event yet (coalesce)
        end
    end
    POOL->>BDG: endBulkPass()
    BDG->>BDG: bulkPassDepth--
    alt outermost (depth == 0) AND pending non-empty
        BDG->>EB: emit mcp_child_refused_batch<br/>{refusedServers, budget, liveCount, reservedCount, mode: 'enforce', scope?: 'workspace'}
        BDG->>BDG: lastRefusedServerNames = drain pendingRefusalNames
    end
```

Recusas fora da passagem (por exemplo, spawn lazy de `readResource` que ignora completamente a passagem em massa) emitem lotes de tamanho 1 inline para consistência de formato. Passagens aninhadas (`bulkPassDepth > 0`) não disparam; apenas o fim da passagem mais externa emite o lote coalescido.

## Estado e Ciclo de Vida

- O controlador de orçamento é construído uma vez por workspace na inicialização do pool.
- `clientBudget` é imutável após a construção; alterações em tempo de execução exigem reconstrução do pool.
- `mode` também é imutável (`onEvent` é armazenado como `undefined` quando `mode === 'off'` como defesa em profundidade).
- `warnArmed` começa como true; é redefinido para true via a ultrapassagem descendente de 37,5%.
- `lastRefusedServerNames` NÃO é limpo na emissão de `endBulkPass` — apenas no INÍCIO da próxima passagem em massa. Isso permite que uma rota de snapshot chamada entre passagens ainda reporte o último conjunto de recusas (caso contrário, os dashboards mostrariam recusas vazias imediatamente após um evento de lote recusado ser entregue).

## Dependências

- `packages/core/src/tools/mcp-client-manager.ts` — reutiliza `McpBudgetEvent`, `McpBudgetMode`, `McpRefusedServer`, `MCP_BUDGET_WARN_FRACTION`, `MCP_BUDGET_REARM_FRACTION`, `BudgetExhaustedError` (lançado pelo `acquire` do pool na recusa).
- `packages/core/src/tools/mcp-transport-pool.ts` — consome o orçamento; passa eventos para o EventBus do daemon através da tubulação `onEvent` do pool.
- Rota de snapshot do daemon `GET /workspace/mcp` — lê `getReservedSlots()`, `getRefusedServerNames()`, `getReservedCount()`, `getBudget()`, `getMode()`.

## Configuração

| Source          | Knob                                                                                     | Effect                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Flag            | `--mcp-client-budget=N`                                                                  | Define `clientBudget` para o controlador do workspace.                                        |
| Flag            | `--mcp-budget-mode={off,warn,enforce}`                                                   | Define `mode`. `enforce` requer um `clientBudget` positivo; caso contrário, a inicialização falha explicitamente. |
| Env             | `QWEN_SERVE_MCP_CLIENT_BUDGET`, `QWEN_SERVE_MCP_BUDGET_MODE`                             | Encaminhado para o filho ACP via `childEnvOverrides`; o `readBudgetFromEnv()` do filho os capta. |
| Capability tags | `mcp_guardrails` (always; `modes: ['warn', 'enforce']`), `mcp_guardrail_events` (always) | Veja [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).                      |

## Advertências e Limitações Conhecidas

- **A chave de reserva é por NOME.** Duas entradas de pool com o mesmo nome de servidor, mas fingerprints diferentes (por exemplo, sessões injetando cabeçalhos OAuth divergentes) consomem UM slot juntas. A contabilidade de subprocessos é exposta separadamente via `subprocessCount` do snapshot do pool. Operadores devem pensar no orçamento como "slots de servidor configurados", não "contagem de subprocessos".
- **A histerese dispara com base na contagem de reservas, não na contagem de ativos (CONECTADOS).** As reservas incluem conexões em andamento e sobrevivem a desconexões transitórias, então a histerese permanece estável durante ciclos de reconexão. A contagem de ativos é exposta nos payloads de eventos como `liveCount` para consumidores SDK que desejam essa perspectiva.
- **O modo `warn` nunca recusa.** Ele ainda rastreia reservas e dispara `mcp_budget_warning`, mas `tryReserve` sempre retorna `'reserved'`. As semânticas de recusa são exclusivas do `enforce`.
- **Eventos de orçamento com escopo de workspace carregam `scope: 'workspace'`** para que se propaguem para todas as sessões anexadas simultaneamente. Os `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` dos redutores SDK incrementam em sincronia entre sessões na mesma conexão. Eventos legados por sessão do `McpClientManager` não carregam `scope` (padrão semântico é `'session'`).
- **A chave de desativação `QWEN_SERVE_NO_MCP_POOL=1`** desabilita o pool completamente; o orçamento do workspace também é desabilitado, e o orçamento por sessão do `McpClientManager` assume o controle. O envelope de capacidades remove `mcp_workspace_pool` e `mcp_pool_restart` para reportar isso com precisão.
- **`ServeMcpBudgetStatusCell.scope` é uma forma de lista compatível com versões futuras.** As células de snapshot expõem `budgets[]`, não um único campo `budget?`. PR 14 v1 emite uma célula `scope: 'session'` para cada sessão ACP porque `acpAgent.newSessionConfig()` constrói o `Config` / `McpClientManager` dessa sessão. O escopo `'pool'` é reservado para a célula com escopo de pool do Wave 5 PR 23 que ficará ao lado das células com escopo de sessão. Os consumidores devem tolerar valores adicionais desconhecidos de `scope` descartando-os em vez de falhar.

## Referências

- `packages/core/src/tools/mcp-workspace-budget.ts` (classe inteira)
- `packages/core/src/tools/mcp-client-manager.ts` (`BudgetExhaustedError`, `McpBudgetEvent`, hysteresis constants)
- `packages/core/src/tools/mcp-transport-pool.ts` (local do `acquire` do pool que chama `tryReserve`)
- Documento de design F2 (v2.2): [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md) §11 para orçamento em nível de workspace e as entradas do changelog v2.2 sobre orçamento e acompanhamentos de fingerprint.
- Notas de design F2: issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) commit 6.