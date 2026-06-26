# F2: Pool de Transporte MCP Compartilhado — Design v2.2

> Destina-se a `daemon_mode_b_main` (de acordo com a estratégia de ramificação #4175). Substitui #4175 Wave 5 PR 23.
> **Entrega em PR único** conforme orientação do mantenedor para lotes coesos de funcionalidades (2026-05-19).
> Autor: doudouOUC. Data: 2026-05-20. Revisado: 2026-05-20 (v2.2 — incorporações de revisão da implementação).

---

## 0. Changelog

### v2.2 (2026-05-20) — Implementação do PR #4336 + 32 incorporações de revisão

O PR #4336 entregou o F2 como 6 commits atômicos + 6 commits de correção em ~4 horas. O Wenshao revisou cumulativamente em 3 lotes; cada lote gerou correções inline + críticas que foram incorporadas. A tabela abaixo registra o que mudou em relação à v2.1, organizada por lote de revisão.

#### v2.1 → primeiro lote de revisão (commits 1-4, wenshao C1-C7 + S1-S4)

| #   | Local                                                       | Problema                                                                                                                                                                                                            | Commit de incorporação |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| C1  | `acpAgent.ts:269` — caminho de fechamento do IDE            | O drain do pool só era executado no handler SIGTERM; fechamento normal iniciado pelo IDE vazava entradas até o SO limpá-las. Espelhar o drain do pool do SIGTERM em `await connection.closed`                        | `ae0b296c4`            |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                        | `cancelDrainTimer` resetava `maxIdleTimer` a cada oscilação, derrotando o limite rígido da §6.3. Agora limpa apenas `drainTimer`; max-idle sobrevive por toda a vida da entrada                                       | `ae0b296c4`            |
| C3  | `mcp-pool-entry.ts:doRestart`                               | Falha na reconexão deixava a entrada em estado zumbi (`localStatus=CONNECTED`, `state='active'`, snapshot obsoleto). Try/catch + transição para `'failed'` em caso de falha                                          | `ae0b296c4`            |
| C4  | `mcp-pool-entry.ts:forceShutdown`                           | `state='closed'` definido APÓS awaits, então `acquire` concorrente podia observar `'active'` e entregar conexão obsoleta. Definido sincronamente no topo                                                              | `ae0b296c4`            |
| C5  | `mcp-transport-pool.ts:drainAll`                            | `acquire` concorrente podia criar nova entrada durante o drain. Adicionado flag mutex `draining` + `await Promise.allSettled(spawnInFlight)` antes de limpar                                                          | `ae0b296c4`            |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                    | Listener não era filtrado por `serverName`; toda entrada recebia notificações de status de todos os servidores + o próprio `markActive` da entrada ecoava de volta                                                     | `ae0b296c4`            |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`      | Portão de modo pool adicionado a `discoverAllMcpTools` mas não ao `Incremental` — `/mcp refresh` ignorava o pool, criava cliente por sessão                                                                          | `ae0b296c4`            |
| S1  | `session-mcp-view.ts:passesSessionFilter`                   | Documentação não mencionava que `excludeTools` usa igualdade direta (sem suporte a parênteses); divergência com `mcp-client.ts:isEnabled`                                                                            | `ae0b296c4`            |
| S2  | Docstring de `pid-descendants.ts`                           | Afirmava existir um branch `taskkill /F` específico para Windows que não existia — Node polyfills `process.kill('SIGTERM')` para `TerminateProcess`                                                                  | `ae0b296c4`            |
| S3  | Log de depuração de `session-mcp-view.ts:applyTools`        | String continha literal `"N"` em vez de interpolação — operadores viam `applied 12 tools (filtered to N registered)`                                                                                                | `ae0b296c4`            |
| S4  | `mcp-transport-pool.ts:createUnpooledConnection` status cb  | Hardcoded para `() => CONNECTED` então `aggregateStatusByName` mentia após desconexão. Agora `() => client.getStatus()`                                                                                             | `ae0b296c4`            |

#### Lote de auto revisão do Commit-5 (R1-R3 pequenos)

| #   | Local                                            | Problema                                                                                                                                                                                                           | Commit de incorporação |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| R1  | Envelope `/capabilities` no `server.test.ts:918` | Teste afirmava `getAdvertisedServeFeatures()` (sem toggles), mas `server.ts` passa `mcpPoolActive: opts.mcpPoolActive !== false` (padrão ativo). Âncora do toggle                                                  | `3e68c00bc`            |
| R2  | Cobertura padrão ativo de capabilities em `server.test.ts` | Nenhum teste inicializava com opções padrão para verificar se as tags do pool anunciam. Adicionado teste explícito com `mcpPoolActive: false`                                                                      | `3e68c00bc`            |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`     | Documentação dizia que SDKs pré-PR "veriam o novo valor como desconhecido e o exibiriam genericamente" — na verdade `MCP_RESTART_REFUSED_REASONS.has(...)` rejeita → descarte silencioso                            | `3e68c00bc`            |

#### Segundo lote de revisão (commits 1-5, wenshao R1-R10)

| #   | Local                                                | Problema                                                                                                                                                                                                                                                  | Commit de incorporação |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                     | Correção C2 preservou corretamente `maxIdleTimer` entre oscilações, mas a ação de disparo fechava forçadamente independentemente de `refs.size`. Sessão ativa com reconexão dentro da janela de graça perdia ferramentas após 5min                           | `72399f109`            |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`   | `releaseAllPooledConnections` + READQUIRIR TODAS a cada passada deixava janela curta com zero ferramentas MCP registradas E reiniciava todo timer de drain. Difusão contra o desejado `(name, fingerprint)`                                                | `72399f109`            |
| WR3 | Fan-out de snapshot em `mcp-pool-entry.ts:doRestart` | Reinício atualizava `toolsSnapshot`/`promptsSnapshot` e emitia eventos tipados — mas nenhuma instância de `SessionMcpView` se inscrevia nesse fluxo. Iterar `subscribers` diretamente após o snapshot                                                        | `72399f109`            |
| WR4 | `mcp-transport-pool.ts:getSnapshot subprocessCount`  | Contava websocket em `subprocessCount` — websocket dial remoto, sem filho local. Restrito apenas a `'stdio'`                                                                                                                                              | `72399f109`            |
| WR5 | PowerShell `-Filter` em `pid-descendants.ts`         | Interpolava `${pid}` diretamente na string `-Filter`. O guard `Number.isInteger` do ponto de entrada previne injeção hoje; vinculado a `$p` para defesa em profundidade contra futuras relaxações do guard                                                  | `72399f109`            |
| WR6 | Campo `cfg` no ctor de `mcp-pool-entry.ts`           | `readonly cfg: MCPServerConfig` era implicitamente público, expondo chaves de API de env, auth de cabeçalho, campos OAuth. Tornado `private`; novo getter `transportKind` para o único leitor externo                                                       | `72399f109`            |
| WR7 | Exports prematuros em `mcp-pool-events.ts`           | 5 guards de tipo PoolEvent + re-export `Prompt` + `PoolEntryConnectionStatus` tinham zero chamadores. Removidos; mantido `MCPCallInterruptedError` (mandato do design §13.4)                                                                               | `72399f109`            |
| WR8 | Duplicação de drain do pool em `acpAgent.ts:269,300` | SIGTERM + fechamento do IDE tinham blocos idênticos `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }`. Extraído helper `drainPoolBeforeExit(label)`                                                                                   | `72399f109`            |

#### Lote de auto revisão do Commit-6 (R1-R3 race condition crítica)

| #   | Local                                    | Problema                                                                                                                                                                                                                             | Commit de incorporação |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`        | Race de liberação de slot: A termina spawn, B (fingerprint diferente, mesmo nome) inicia spawn, A drena. Close-cb verificava apenas `entries` (B ainda não registrado) → liberação prematura                                           | `0e58a098f`            |
| 6R2 | JSDoc de `events.ts:mcpBudgetWarningCount` | Eventos com escopo de workspace são transmitidos para N sessões → N incrementos do reducer; consumidores agregando entre sessões contam em dobro. Docstring atualizada para mencionar o multiplicador                                   | `0e58a098f`            |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`      | Iterava `this.sessions.keys()` diretamente durante fan-out assíncrono; `killSession` concorrente podia corromper o iterador. Snapshot via `Array.from(...)`                                                                           | `0e58a098f`            |

#### Terceiro lote de revisão (commits 1-6, wenshao W1-W15)

| #   | Local                                                           | Problema                                                                                                                                                                                                                                                | Commit de incorporação |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| W1  | Catch de `mcp-transport-pool.ts:spawnEntry`                    | Falha no spawn vazava `statusChangeListener` permanentemente — apenas `forceShutdown` o remove. Adicionado `entry.forceShutdown('manual')` ao catch                                                                                                     | `4a3c5cd90`            |
| W2  | Verificação cruzada de `mcp-pool-entry.ts:statusChangeListener` | Mapa `serverStatuses` no nível do módulo compartilhado entre entradas com fingerprints diferentes. Erro de transporte de A escrevia DISCONNECTED, listener de B corrompia `localStatus` de B. Adicionada verificação `client.getStatus()`              | `4a3c5cd90`            |
| W3  | Varredura de PID em `mcp-pool-entry.ts:doRestart`               | Reinício ignorava `listDescendantPids` + `sigtermPids` — todo reinício de stdio encapsulado com `npx`/`uvx` órfão o neto MCP real. Adicionada varredura antes de desconectar                                                                             | `4a3c5cd90`            |
| W4  | Race de timer de drain em `mcp-pool-entry.ts:doRestart`         | Timer de drain podia disparar no meio do yield do reinício → `forceShutdown` remove entrada → `client.connect` cria órfão. Adicionado `cancelDrainTimer` + `state→active` no topo de `doRestart`                                                        | `4a3c5cd90`            |
| W5  | Handles mortos em `mcp-client-manager.ts:pooledConnections`     | Quando a entrada transitava para `'failed'`, o manager mantinha `PooledConnection` morta para sempre. Assinar eventos da entrada; remover em `'failed'` (idempotente via guard `get(name) === conn`)                                                    | `4a3c5cd90`            |
| W6  | Reentrância em `mcp-client-manager.ts:discoverAllMcpToolsViaPool` | Duas chamadas intercaladas podiam ambas `set(name, conn)` → primeira conexão vazava. Adicionado mutex `discoveryInFlight`; segundo chamador aguarda a mesma promise. Novo teste de regressão                                                            | `4a3c5cd90`            |
| W9  | Rigor em `acpAgent.ts:parsePoolDrainMs`                         | `Number.parseInt` aceitava `'30000ms'` / `'30000abc'`. Regex estrito `^\d+$`; rejeitar com aviso em stderr + fallback padrão                                                                                                                            | `4a3c5cd90`            |
| W10 | Ordem de `indexAttach` em `mcp-transport-pool.ts:acquire`       | `indexAttach` mutava `sessionToEntries` ANTES de `entry.attach()`. Se `attach` lançasse exceção, mapeamento reverso obsoleto. Movido `indexAttach` após `attach` bem-sucedido (ambos caminhos rápido + in-flight)                                        | `4a3c5cd90`            |
| W13 | JSDoc de `mcp-transport-pool.ts:subprocessCount`                | Documentação ainda afirmava `stdio + websocket` após WR4 restringir para stdio. Atualizada                                                                                                                                                             | `4a3c5cd90`            |
| W14 | Catch de `mcp-transport-pool.ts:createUnpooledConnection`        | Mesmo vazamento de `statusChangeListener` que o W1 no caminho não pool. Mesmo espelho: `forceShutdown` antes de desconectar                                                                                                                             | `4a3c5cd90`            |
| W15 | Resposta de `bridge.ts:restartMcpServer`                        | Cast `as PoolEntries` não era seguro — JSON não tipado vindo de filho ACP. Verificação `Array.isArray` + guard de formato por entrada; entradas malformadas ignoradas com migalha de pão em stderr                                                       | `4a3c5cd90`            |

#### Recusados com resposta (registrados como acompanhamentos do F2)

| #   | Local                                                | Motivo da recusa                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W7  | Lacunas de cobertura de teste (4 caminhos críticos não testados) | 1/4 adicionado (teste de regressão W6); restante adiado para PR focado em cobertura de teste após a fusão da série F2                                                                                                                            |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` não utilizados | Placeholders de compatibilidade futura para reconexão orientada por monitor de saúde adiada (design §6.6); remover e readicionar agita o tipo público                                                                                           |
| W11 | Blocos de attach duplicados (caminho rápido / in-flight) | ✅ Feito no PR A: helpers privados `attachPooledSession` + `rollbackReservationOnSpawnFailure` (commit `2d546efca`)                                                                                                                            |
| W12 | `passesSessionFilter` O(M×N) por `applyTools`       | ✅ Feito no PR A: `applyTools` / `applyPrompts` pré-computam conjuntos `Set` de filtro uma vez por passada; predicado torna-se O(1) por ferramenta (commit `a4a855ab3`)                                                                       |
| R9  | Construtor `McpClientManager` com 7 sentinelas posicionais | ✅ Feito no PR A: construtor com objeto de opções + fábrica de teste `mkManager` (commit `0cb1eaa27`)                                                                                                                                         |
| R10 | Custo `pgrep -P <pid>` por PID por nível             | ✅ Feito no PR A: snapshot único `ps -A -o pid=,ppid=` + varredura BFS em memória; pgrep BFS mantido como fallback para BusyBox <v1.28 / distroless (commit que aterrissa como peça final do PR A)                                               |

#### Contagem de bugs

- **3 lotes × 27 correções críticas / importantes** + 5 dobras de documentação / sugestão = **32 incorporações de revisão** no total
- **2 races críticas pegas apenas no segundo olhar** (6R1 race de liberação de slot durante spawn; W6 reentrância de discovery)
- **0 falhas silenciosas enviadas** — cada correção carrega uma migalha de pão inline `// F2 (#4175 commit X review fix — wenshao YN):` apontando para a revisão original

### v2.1 (2026-05-20) — Estratégia de PR único + 12 incorporações de revisão

| #      | O que mudou                                                                                                                          | Motivo                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V21-1  | Mudou de plano de 6 sub-PRs para **PR único coeso de funcionalidade** com 6 commits atômicos                                        | Conforme orientação do mantenedor (estratégia de ramificação #4175); revisor pode ler commit por commit via `git log -p`                                                      |
| V21-2  | Adicionado índice reverso `sessionToEntries: Map<sid, Set<ConnectionId>>` no pool (§6)                                               | `releaseSession` O(N entries) → O(refs da sessão); necessário para escala de 1000 sessões                                                                                    |
| V21-3  | Parâmetro de consulta `?fingerprint=` na rota de reinício (§13.1)                                                                    | Operador pode querer reiniciar apenas uma entrada quando mesmo nome tem fingerprints diferentes; custo quase zero para adicionar agora                                        |
| V21-4  | Caminho de falha de spawn libera explicitamente o slot reservado (§6.1, §6.5)                                                        | Caso contrário, slots vazam até a próxima passagem do monitor de saúde; bug real sutil                                                                                         |
| V21-5  | Nova §13.4: semântica de chamada de ferramenta em andamento durante reconexão                                                        | `MCPCallInterruptedError`; pool NÃO repete automaticamente (escrita não segura)                                                                                               |
| V21-6  | Nova §10.4: `/mcp disable X` aciona reaplicação de `SessionMcpView`                                                                  | Caso contrário, desativação durante a sessão não remove ferramentas já registradas                                                                                             |
| V21-7  | Rota de status expõe `entryIndex` não fingerprint bruto (§8.3)                                                                       | Evita exposição de canal lateral de rotação de token OAuth via mudança de fingerprint                                                                                          |
| V21-8  | Backoff de reconexão especificado: stdio fixo 5s × 3, HTTP/SSE exponencial 1/2/4/8/16s × 5 (§6.6)                                    | v2 não dizia; HTTP precisa de orçamento de repetição maior para oscilação de rede                                                                                              |
| V21-9  | `canonicalOAuth(o)` normaliza `{enabled: false}` ≡ `undefined` ≡ `null` (§5.1)                                                      | Caso contrário, configurações funcionalmente equivalentes produzem entradas distintas                                                                                          |
| V21-10 | Renomeado helper de fallback do pool de "acquire in-process legado" para `createUnpooledConnection` (§5.3, §6.1)                     | Bypass MCP do SDK é permanente, não legado                                                                                                                                    |
| V21-11 | `drainAll(opts?)` retorna `Promise<void>` com orçamento de parede `timeoutMs` (§17)                                                  | Chamador precisa saber quando o drain termina para ordenação de desligamento                                                                                                   |
| V21-12 | Nomes de campo do reducer do SDK travados (Q1 resolvido): manter `mcpBudgetWarningCount` etc. com semântica de escopo no JSDoc       | Sem renomeação de API pública durante o PR                                                                                                                                     |
| V21-13 | Travados Q3 (pool ativo por padrão, chave de desligamento `--no-mcp-pool`), Q4 (HTTP/SSE opt-in), Q6 (construção eager)              | Entrega em PR único; nenhuma proteção de flag necessária                                                                                                                       |
| V21-14 | Adicionados riscos R9/R10/R11 de PR único (§23)                                                                                      | Fadiga de revisão, conflito de merge de `daemon_mode_b_main`, tempo de CI                                                                                                      |
| V21-15 | Tratamento de entrada órfã por desinstalação de extensão adiado para colheita natural por `MAX_IDLE_MS` (§16.3)                      | Sem `invalidateByExtension` explícito; mantém modelo uniforme                                                                                                                  |

### v2 (2026-05-20) — Incorporações de revisão iniciais do rascunho v1

| #   | O que mudou                                                                                                                       | Motivo                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Pool dissemina **Tools + Prompts** (era: apenas tools)                                                                              | `McpClient` ctor aceita ambos os registros; prompts de outra forma perdidos silenciosamente no modo pool                                                         |
| C2  | Nova seção sobre **coexistência de estado global** (`serverStatuses` / mapas de módulo `mcpServerRequiresOAuth`)                    | Compartilhamento entre sessões já existe hoje; pool herda + formaliza                                                                                            |
| C3  | Caminho de fábrica `connectToMcpServer` **unificado** com a classe `McpClient` no F2-1                                              | v1 refatorava apenas a classe; deixaria um caminho paralelo não pool                                                                                             |
| C4  | Replay de snapshot no attach (estilo earlyEvents) adicionado a `PoolEntry.attach()`                                                 | Nova race: sessão-B attach → servidor emite `tools/list_changed` antes da inscrição ser configurada                                                              |
| C5  | `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` para deduplicação de `acquire` concorrente                                  | v1 mencionado na matriz de teste, mas não no contrato de implementação                                                                                          |
| C6  | Varredura multiplataforma de PIDs descendentes (Linux/macOS pgrep, Windows wmic/PowerShell)                                        | v1 dizia "copiar `pgrep -P` do opencode" — isso é Unix apenas                                                                                                   |
| C7  | Campo `trust` por sessão **cópia** do objeto da ferramenta                                                                         | trust reside em `DiscoveredMCPTool`; instância compartilhada misturaria trust por sessão                                                                         |
| C8  | Transportes HTTP/SSE **opt-in** para pooling (padrão: stdio + websocket apenas)                                                    | Alguns servidores MCP HTTP mantêm estado de sessão por transporte; compartilhamento arrisca vazamento de estado                                                   |
| C9  | Bypass explícito do servidor MCP do SDK (`isSdkMcpServerConfig`)                                                                   | `sendSdkMcpMessage` é por sessão por design                                                                                                                      |
| C10 | Caminho OAuth explicitamente **adiado para F3**                                                                                     | Fluxo OAuth precisa de roteamento estilo PermissionMediator; não é escopo do F2                                                                                  |
| C11 | Semântica da rota de reinício especificada (name → todas as entradas correspondentes)                                               | O PR 17 `/workspace/mcp/:server/restart` era anteriormente inequívoco (1 entrada); agora 1..N                                                                    |
| C12 | Seção de refatoração da rota de status (novo caminho: `QwenAgent.getMcpPoolAccounting()`)                                           | `httpAcpBridge.ts:733-770` atualmente lê o manager da sessão bootstrap — deve mudar                                                                              |
| C13 | Contador de geração em `PoolEntry` para guard de handler obsoleto `tools/list_changed`                                              | Padrão Opencode: `if (s.clients[name] !== client) return`                                                                                                        |
| C14 | Divisão de sub-PR de 4 → **6**                                                                                                      | v1 subestimou; A2/B1/B3/C6 cada um adiciona trabalho real                                                                                                        |
| C15 | Construção lazy do pool (apenas quando N≥2 sessões vistas) — opcional                                                              | `qwen serve --foreground` sessão única não se beneficiará; economiza custo de inicialização                                                                      |
---

## 1. Objetivos / Não objetivos

**Objetivos**

- N sessões em 1 workspace compartilhando 1 processo por configuração de servidor única — identificado por fingerprint
- Visualizações de `ToolRegistry` / `PromptRegistry` por sessão preservadas (filtragem, confiança)
- Ciclo de vida com refcount + grace-drain resiliente a reattach
- Limpeza de pids descendentes multiplataforma
- Guardrails de orçamento evoluem de por sessão para por workspace (PR 14 prometeu isso)
- Compatibilidade retroativa com qwen standalone (sem daemon, pool não é construído ali)

**Não objetivos (escopo F2)**

- Pooling entre workspaces (1 daemon = 1 workspace, invariante da PR #4113 mantida)
- Pooling entre daemons (fora do escopo — território de orquestrador multiprocesso)
- Reformulação do roteamento OAuth (F3 com `PermissionMediator`)
- Persistência do pool após reinício do daemon (apenas em memória)
- Detecção automática de servidores HTTP "seguros para pool" (apenas flag opt-in)
- Diferencial `MCPServerConfig` ao vivo para mutar entradas in-place (mudança de config → nova entrada, antiga drena)

---

## 2. Estado Atual (alvo de substituição)

```
acpAgent.newSession(sessionId)
  → newSessionConfig(cwd, mcpServers)                  // acpAgent.ts:1771
  → loadCliConfig → new Config → config.initialize()
  → ToolRegistry ctor → new McpClientManager(config, ...)   // tool-registry.ts:199
  → for (name, cfg) in config.getMcpServers():
      new McpClient(name, cfg, toolRegistry, promptRegistry, workspaceContext, ...)
      → client.connect() → client.discover(config)
```

**Mapa de acoplamento (o que deve ser quebrado ou roteado através):**

| Acoplamento                                                                       | Localização                                     | Ação no F2                                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `McpClient` ctor liga 1 ToolRegistry + 1 PromptRegistry                           | mcp-client.ts:106-119                           | Pool é dono do transporte; `SessionMcpView` (por sessão) é dono dos registries por sessão        |
| `McpClient.discover()` chama `toolRegistry.registerTool()` inline                 | mcp-client.ts:178-198                           | Dividir: `discoverAndReturn()` retorna snapshot; view registra                                    |
| Handler de `ListRootsRequestSchema` captura `workspaceContext.getDirectories()`   | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | Contexto único vinculado ao workspace do pool                                                     |
| `workspaceContext.onDirectoriesChanged` listener registrado por connect           | mcp-client.ts:907                               | Pool registra uma vez por entrada                                                                |
| `McpClientManager` é instanciado dentro de ToolRegistry                           | tool-registry.ts:199                            | Adicionar parâmetro opcional `pool?` no ctor; injeção a partir do Config                         |
| Execução de orçamento por sessão                                                   | mcp-client-manager.ts:91-95 comment             | Mover máquina de estados para o pool                                                             |
| `serverDiscoveryPromises` deduplica em voo por servidor                            | mcp-client-manager.ts:350                       | Pool tem `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                                   |
| `setMcpBudgetEventCallback` registro por sessão                                    | acpAgent.ts:1851-1899                           | Pool emite → `QwenAgent` transmite para todas as sessões                                         |

**Estado já compartilhado (pool herda, não introduz):**

| Estado                                        | Localização                        | Nota                                                          |
| --------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>` | mcp-client.ts:292 (nível de módulo) | Hoje é a nível de processo; pool chaveia ainda por nome → "qualquer-CONNECTED-ganha" |
| `mcpServerRequiresOAuth: Map<string, boolean>` | mcp-client.ts:302 (nível de módulo) | Mesmo                                                         |
| `MCPOAuthTokenStorage` tokens em disco         | `~/.qwen/mcp-oauth/<name>.json`  | Compartilhado pelo daemon; pool explora mais eficientemente   |

---

## 3. Descobertas de Referência

| Projeto         | Pool?             | Chave                                          | Ciclo de Vida                                                                              | Padrões a roubar                                                                                                               |
| --------------- | ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **claude-code** | Não, por processo | `name + JSON.stringify(cfg)` (lodash.memoize)  | `clearServerCache` + backoff remoto×5; stdio crash → `failed`                              | SHA-256 de chave ordenada `hashMcpConfig` para invalidação/chave                                                               |
| **opencode**    | Sim, por workspace| **apenas nome do servidor** (sem hash do config) | Sem refcount / sem evicção / sem reinício; Effect finalizer + `pgrep -P` recursivo SIGTERM  | Varredura de pids descendentes, guarda de handler obsoleto (`if (s.clients[name] !== client) return`), fan-out `tools/list_changed` via barramento de eventos |

**O que F2 herda de cada um:** hash do config do claude-code (lida com divergências de env/auth por sessão que opencode não lida), varredura de pids descendentes do opencode (wrappers npx/uvx vazam). O que adicionamos: refcount + drain (cliente múltiplo do daemon), reinício automático (daemon de longa duração), fan-out de prompts, guarda de geração.

---

## 4. Arquitetura

### 4.1 Layout de processos

```
Daemon HTTP (packages/cli/src/serve, qwen serve)
  │ spawna
  ▼
Filho ACP (qwen --acp, processo único por workspace)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── novo, escopo do workspace, 1 instância
  │     ├── entries: Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (vinculado ao workspace do daemon)
  │     └── guardrails de orçamento (máquina de estados PR 14, graduada para workspace)
  │
  └── sessions: Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ pool injetado   │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   legado in-process
                                  → SessionMcpView            (standalone qwen)
                                    .applyTools/Prompts
                                    (filtra + registra nos
                                     registries próprios da sessão)
```

**O pool vive no filho ACP**, não no daemon HTTP. O daemon HTTP consulta o estado do pool através da superfície de método ext `bridge.client` existente (`getMcpPoolAccounting`, `restartMcpServer`). O código do F2 fica em **`packages/core/src/tools/`** (par do `mcp-client-manager.ts`), não em `packages/acp-bridge/`.

### 4.2 Diagrama de classes

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (liberação em lote para derrubada de sessão)
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   (escopo do workspace)
  ├─ getBudgetMode/Budget()
  ├─ drainAll() → Promise<void>   (desligamento)
  └─ onBudgetEvent: (event) => void   (definido por QwenAgent)

PoolEntry (interno)
  ├─ refs: Set<sessionId>
  ├─ client: McpClient
  ├─ toolsSnapshot: DiscoveredMCPTool[]
  ├─ promptsSnapshot: Prompt[]
  ├─ generation: number   (++ em reconexão; guarda de evento obsoleto)
  ├─ state: 'spawning' | 'active' | 'draining' | 'closed' | 'failed'
  ├─ drainTimer?: NodeJS.Timeout
  ├─ healthMonitor: { intervalTimer, consecutiveFailures, isReconnecting }
  ├─ subscribers: Map<sid, SessionMcpView>
  ├─ attach(sid, view) → PooledConnection
  └─ detach(sid) → void

PooledConnection (handle retornado ao chamador)
  ├─ id: ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView (por sessão, por servidor)
  ├─ ctor(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   (filtra por include/exclude, decora confiança)
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   (remove seus registros)
```

---

## 5. Chave do Pool (Fingerprint)

### 5.1 Campos canônicos hasheados

```ts
type PoolKey = string; // sha256 hex, primeiros 16 caracteres suficientes (livre de colisões para N realista)
type ConnectionId = `${serverName}::${PoolKey}`;

function fingerprint(cfg: MCPServerConfig): PoolKey {
  const canonical = {
    transport: mcpTransportOf(cfg),
    command: cfg.command ?? null,
    args: cfg.args ?? [],
    cwd: cfg.cwd ?? null,
    env: sortedEntries(cfg.env ?? {}), // [[k,v],...] ordenado por k
    url: cfg.url ?? null,
    httpUrl: cfg.httpUrl ?? null,
    headers: sortedEntries(cfg.headers ?? {}),
    timeout: cfg.timeout ?? null,
    oauth: canonicalOAuth(cfg.oauth),
  };
  return sha256(JSON.stringify(canonical)).slice(0, 16);
}

/**
 * V21-9: normaliza configurações OAuth funcionalmente equivalentes para que
 * colapsem no mesmo fingerprint. `{enabled: false}`, `undefined`,
 * `null` e `{}` significam "sem OAuth" → todos retornam `null`.
 */
function canonicalOAuth(o?: OAuthConfig | null): OAuthConfig | null {
  if (!o || !o.enabled) return null;
  return {
    enabled: true,
    clientId: o.clientId ?? null,
    scopes: o.scopes ? [...o.scopes].sort() : null,
    authorizationUrl: o.authorizationUrl ?? null,
    tokenUrl: o.tokenUrl ?? null,
  };
}

// Campos excluídos (filtros por sessão, NÃO nível de transporte):
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 Gate por classe de transporte

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**`pooledTransports` padrão = {stdio, websocket}**. Operadores optam por HTTP/SSE via:

- CLI: `--mcp-pool-transports=stdio,websocket,http,sse`
- Env: `QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**Por que excluir HTTP/SSE por padrão**: algumas implementações de servidor MCP HTTP vinculam estado (contexto de autenticação, memória de conversa) ao fluxo TCP/SSE; múltiplas sessões ACP compartilhando-o vazariam estado. stdio + websocket são verdadeiros processos de SO cujo estado é observável e isolável.

### 5.3 Bypass SDK MCP

`isSdkMcpServerConfig(cfg)` true → pool retorna um wrapper `PooledConnection` fino via `createUnpooledConnection(name, cfg, sid)` que constrói um `McpClient` imediatamente, sem compartilhamento, nenhuma entrada armazenada no pool. Motivo: `sendSdkMcpMessage` é por sessão por design (roteia através do plano de controle ACP de volta para a sessão de origem). Mesmo caminho usado para HTTP/SSE quando o transporte não está em `pooledTransports` (§10.3).

V21-10: o nome é `createUnpooledConnection`, não `legacyInProcessAcquire` — SDK MCP e HTTP opt-out são decisões de design permanentes, não código legado.

---

## 6. Ciclo de Vida

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2: índice reverso, releaseSession O(refs) em vez de O(entries). */
  private sessionToEntries = new Map<string, Set<ConnectionId>>();

  async acquire(
    name: string,
    cfg: MCPServerConfig,
    sid: string,
  ): Promise<PooledConnection> {
    if (!isPoolable(cfg, this.opts)) {
      return this.createUnpooledConnection(name, cfg, sid);
    }
    const id: ConnectionId = `${name}::${fingerprint(cfg)}`;

    if (this.entries.has(id)) {
      this.indexAttach(sid, id);
      return this.entries.get(id)!.attach(sid);
    }
    let inFlight = this.spawnInFlight.get(id);
    if (!inFlight) {
      const slot = this.tryReserveSlot(name);
      if (slot === 'refused') {
        throw new BudgetExhaustedError(
          name,
          this.clientBudget!,
          this.reservedSlots.size,
        );
      }
      inFlight = this.spawnEntry(name, cfg, id)
        .catch((err) => {
          // V21-4: libera slot reservado em falha de spawn. Sem
          // isso, o slot vaza até que o caminho de liberação do
          // monitor de saúde seja executado (o que não acontece,
          // pois não há entrada para monitorar).
          if (slot === 'reserved') this.releaseSlotName(name);
          throw err;
        })
        .finally(() => this.spawnInFlight.delete(id));
      this.spawnInFlight.set(id, inFlight);
    }
    const entry = await inFlight;
    this.indexAttach(sid, id);
    return entry.attach(sid);
  }

  release(id: ConnectionId, sid: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.detach(sid);
    this.indexDetach(sid, id);
    if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
  }

  /** V21-2: O(refs desta sessão), não O(todas as entries). */
  releaseSession(sid: string): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      entry.detach(sid);
      if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
    }
    this.sessionToEntries.delete(sid);
  }

  private indexAttach(sid: string, id: ConnectionId): void {
    let ids = this.sessionToEntries.get(sid);
    if (!ids) {
      ids = new Set();
      this.sessionToEntries.set(sid, ids);
    }
    ids.add(id);
  }

  private indexDetach(sid: string, id: ConnectionId): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    ids.delete(id);
    if (ids.size === 0) this.sessionToEntries.delete(sid);
  }
}
```

### 6.2 Deduplicação de acquire concorrente (`spawnInFlight`)

Espelha `McpClientManager.serverDiscoveryPromises` (mcp-client-manager.ts:350). Sem ela, 5 sessões iniciando ao mesmo tempo todas veem `entries.has(id) === false` e competem para spawnar 5 processos filhos.

### 6.3 Grace de drain + limite ocioso

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // grace após último release
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // limite rígido (defesa contra loop de cancelamento de drain)
```

Máquina de estados em `PoolEntry`:

```
spawning ──spawn ok──► active ──último detach──► draining ──timeout──► closed
   │                     │                       │
   │                     │                       └──attach──► active (cancela timer)
   spawn fail───────────►failed
                          │
                          └──reinício manual──► spawning
```

Limite ocioso rígido: o timer de drain pode ser cancelado+reiniciado indefinidamente (flap acquire/release). `MAX_IDLE_MS` é um timer separado iniciado **no primeiro idle** e nunca redefinido; quando dispara, força fechamento mesmo que o drain esteja atualmente em grace ativo. Previne entradas de pool zumbi de clientes bugados que fazem thrash de acquire/release.

### 6.4 Varredura de pids descendentes multiplataforma

**R10 / R23 T7 / PR A update (2026-05-22)**: mudou de BFS por pid (um subprocesso `pgrep -P <pid>` / `Get-CimInstance -Filter` por nó) para um único snapshot da tabela de processos seguido de caminhada em árvore em memória. Duas motivações: (1) um fork em vez de B^D forks no caminho quente de shutdown do pool; (2) consistência do snapshot — o BFS pré-correção podia perder descendentes que foram criados entre níveis adjacentes do BFS. Caminho por pid mantido como fallback para BusyBox `ps` <v1.28 (sem suporte a `-o`) e contêineres distroless sem `ps`.

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // SO recolhe órfãos; shutdown do pool ainda prossegue.
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* cai no fallback */
  }
  if (tree) return walkDescendants(tree, root); // O(descendentes), 1 fork
  return await listDescendantPidsUnixPgrepFallback(root); // BFS legado
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A: todos os processos (POSIX, equivalente a -e mas sem ambiguidade no BSD).
  // -o pid=,ppid=: colunas pid + ppid, o `=` final suprime cabeçalhos.
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // cobre hosts patológicos com >250k processos
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* parse, insere em childrenByPpid */
  }
  return childrenByPpid;
}

// Windows: snapshot único Get-CimInstance Win32_Process | ConvertTo-Csv
// de todas as linhas (ProcessId, ParentProcessId) + caminhada em memória;
// `Get-CimInstance -Filter "ParentProcessId=$p"` por pid mantido como fallback.
```

Chamado de `PoolEntry.shutdown()` antes de `client.disconnect()`. Lida com vazamentos de wrappers `npx @modelcontextprotocol/server-X`, `uvx ...`, `pnpm dlx ...`. Limites MAX_DESCENDANTS=256 / MAX_DEPTH=8 preservados.

### 6.5 Tratamento de falha de spawn

Se `spawnEntry` rejeitar após múltiplos assinantes terem se anexado (via `spawnInFlight`):

- Todos os awaiters recebem a rejeição
- `tryReserveSlot` liberado **via braço `.catch` explícito em `acquire`** (V21-4); sem essa correção o slot vazava até a próxima passagem do monitor de saúde, que nunca executava porque não existia entrada para monitorar.
- Entrada com falha NÃO armazenada em `entries`
- Os caminhos de código dos assinantes tratam como se `acquire` tivesse falhado originalmente (lógica catch existente de `discoverMcpToolsForServer` por sessão permanece válida)

### 6.6 Backoff de reconexão (V21-8)

Quando um `PoolEntry` entra em reconexão após queda de transporte:

| Família de transporte | Estratégia                                       | Limite                                                    |
| --------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| stdio                 | Fixo 5s × 3 tentativas                            | Conforme `DEFAULT_HEALTH_CONFIG.reconnectDelayMs` existente |
| websocket             | Fixo 5s × 3 tentativas                            | Mesmo que stdio                                            |
| http (opt-in)         | Exponencial 1s, 2s, 4s, 8s, 16s × 5 tentativas   | Endpoints remotos flutuam em problemas de rede transitórios; orçamento maior |
| sse (opt-in)          | Exponencial 1s, 2s, 4s, 8s, 16s × 5 tentativas   | Mesmo que http                                             |

Após esgotamento do limite: entrada transita para estado `failed`; assinantes recebem evento `failed`; novo `acquire` para o mesmo `ConnectionId` tenta spawn uma vez, depois lança erro. Reinício do operador (§13) redefine o estado.
---

## 7. Discovery / SessionMcpView

### 7.1 Fan-out duplo de Tools + Prompts

```ts
// packages/core/src/tools/mcp-client.ts — dividir discover em puro
async discoverAndReturn(cliConfig: Config): Promise<{
  tools: DiscoveredMCPTool[];
  prompts: Prompt[];
}> {
  if (this.status !== MCPServerStatus.CONNECTED) throw new Error('Client is not connected.');
  try {
    const [prompts, tools] = await Promise.all([
      discoverPrompts(this.serverName, this.client, /* no registry */),
      discoverTools(this.client, this.serverConfig, this.serverName, this.debugMode, this.workspaceContext),
    ]);
    if (prompts.length === 0 && tools.length === 0) {
      throw new Error('No prompts or tools found on the server.');
    }
    return { tools, prompts };
  } catch (e) {
    this.updateStatus(MCPServerStatus.DISCONNECTED);
    throw e;
  }
}

// Legacy discover() mantida, delega para discoverAndReturn + registra (para qwen standalone)
async discover(cliConfig: Config): Promise<void> {
  const { tools, prompts } = await this.discoverAndReturn(cliConfig);
  for (const t of tools) this.toolRegistry.registerTool(t);
  for (const p of prompts) this.promptRegistry.registerPrompt(p);
}
```

```ts
class SessionMcpView {
  applyTools(snapshot: DiscoveredMCPTool[]) {
    this.sessionToolRegistry.removeToolsByServer(this.serverName);
    for (const tool of snapshot) {
      if (!this.passesFilter(tool)) continue;
      // C7: cópia por sessão da confiança (não mutar o snapshot compartilhado)
      const localTool = tool.withTrust(this.cfg.trust);
      this.sessionToolRegistry.registerTool(localTool);
    }
  }
  applyPrompts(snapshot: Prompt[]) {
    this.sessionPromptRegistry.removePromptsByServer(this.serverName);
    for (const p of snapshot) this.sessionPromptRegistry.registerPrompt(p);
  }
}
```

### 7.2 Replay de snapshot ao attach (estilo earlyEvents)

```ts
class PoolEntry {
  attach(sid: string): PooledConnection {
    this.refs.add(sid);
    this.cancelDrainTimer();
    const view = new SessionMcpView(...);
    this.subscribers.set(sid, view);
    // Imediatamente reproduz o snapshot atual para que o assinante não perca
    // atualizações que ocorreram entre a conclusão do discovery in-flight e
    // o attach.
    if (this.state === 'active') {
      view.applyTools(this.toolsSnapshot);
      view.applyPrompts(this.promptsSnapshot);
    }
    return this.makeHandle(sid, view);
  }
}
```

Espelha o padrão `BridgeClient.earlyEvents` do PR 14b fix #1 — resolve a condição de corrida análoga para attach de pool.

### 7.3 Guarda de handler obsoleto (contador de geração)

```ts
class PoolEntry {
  private generation = 0;

  private async reconnect(): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    await this.client.disconnect();
    await this.client.connect();
    if (myGen !== this.generation) return; // substituído por outro reconnect
    const snap = await this.client.discoverAndReturn(this.cfg);
    if (myGen !== this.generation) return;
    this.toolsSnapshot = snap.tools;
    this.promptsSnapshot = snap.prompts;
    this.fanOut('toolsChanged');
    this.fanOut('promptsChanged');
  }

  private onServerToolsListChanged = () => {
    const myGen = this.generation;
    this.client
      .discoverAndReturn(this.cfg)
      .then((snap) => {
        if (myGen !== this.generation) return;
        this.toolsSnapshot = snap.tools;
        this.fanOut('toolsChanged');
      })
      .catch(/* engolir + log */);
  };
}
```

Sem isso, um handler obsoleto de uma instância do Client anterior ao reconnect poderia sobrescrever o snapshot pós-reconnect com dados desatualizados.

**Invariante de monotonicidade** (esclarecimento V21): `generation` só incrementa, nunca reseta. Qualquer operação in-flight captura `myGen` na entrada, e após `await` verifica `myGen === this.generation`. Equivalente a "nenhum evento superveniente ocorreu desde que comecei". Limitado por Number.MAX_SAFE_INTEGER (~285 mil anos a 1 Hz de reconnect), sem preocupação com overflow.

### 7.4 Unificação de caminhos (expansão de escopo F2-1)

`packages/core/src/tools/mcp-client.ts` tem DOIS caminhos de conexão ao servidor:

1. Classe `McpClient` (mcp-client.ts:100) — usado por `McpClientManager`
2. Função fábrica `connectToMcpServer` (mcp-client.ts:875) — usado por `discoverMcpTools` (linha 560) e `connectAndDiscover` (linha 607)

O F2-1 deve convergir ambos por trás de `McpClient.discoverAndReturn` (com `connectToMcpServer` tornando-se um helper privado de `McpClient` ou ambos chamando uma primitiva `establishConnection()` compartilhada). Caso contrário, o pool cobre apenas o caminho da classe; o caminho da fábrica permanece por sessão e compromete todo o esforço.

---

## 8. Coexistência de Estado Global

### 8.1 `serverStatuses` (mcp-client.ts:292) — escrita tolerante a colisão

`Map<serverName, MCPServerStatus>` no nível do módulo. O `ConnectionId` do pool é `name::hash`, mas `updateMCPServerStatus(name, status)` escreve por nome. **Múltiplas entradas de pool para o mesmo nome (fingerprints diferentes, ex. divergência de token) sobrescreveriam o status umas das outras.**

**Resolução**: o pool intercepta as escritas de status:

```ts
class PoolEntry {
  updateStatus(s: MCPServerStatus) {
    this.localStatus = s;
    const aggregated = this.pool.aggregateStatusByName(this.serverName);
    updateMCPServerStatus(this.serverName, aggregated);
  }
}

class McpTransportPool {
  aggregateStatusByName(name: string): MCPServerStatus {
    // Qualquer CONNECTED → CONNECTED
    // Senão, qualquer CONNECTING → CONNECTING
    // Senão DISCONNECTED
    const entries = [...this.entries.values()].filter(
      (e) => e.serverName === name,
    );
    if (entries.some((e) => e.localStatus === CONNECTED)) return CONNECTED;
    if (entries.some((e) => e.localStatus === CONNECTING)) return CONNECTING;
    return DISCONNECTED;
  }
}
```

A rota de status expõe `entryCount: number` para que operadores vejam quando name → múltiplas entradas.

### 8.2 Armazenamento de token OAuth

`MCPOAuthTokenStorage` escreve em `~/.qwen/mcp-oauth/<serverName>.json` — já compartilhado pelo host do daemon. O pool se beneficia incidentalmente (OAuth da primeira sessão completa → token em disco → reconnect da entrada do pool pega o token → todas as outras sessões se aproveitam).

**Ressalva — caso multi-fingerprint**: 2 entradas para o mesmo nome (headers/env diferentes) mas mesmo provedor OAuth → ambas leem o mesmo arquivo de token. Se os tokens são escopados por servidor (típico OAuth), funciona. Se os tokens são escopados por ambiente (raro), é necessária extensão explícita da chave de armazenamento. **Adiar para F3** com uma limitação conhecida documentada.

### 8.3 `entryCount` no snapshot

Célula por servidor em `GET /workspace/mcp` adiciona:

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // NOVO — N entradas de pool para este nome
  entrySummary?: [                        // NOVO — detalhamento opaco por entrada
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7**: `entrySummary[].entryIndex` é um **inteiro opaco estável** atribuído na criação da entrada (ordem de inserção dentro do grupo de nome), NÃO o fingerprint bruto. Justificativa: o fingerprint muda quando tokens OAuth ou env vars rotacionam, o que vazaria essa informação através de diffs do snapshot (o operador poderia inferir "token rotacionado em T+5min" a partir da transição `'a3b1' → 'f972'`). `entryIndex` é monotônico dentro do grupo de nome, mas permanece estável entre rotações porque a entrada antiga é drenada e a nova entrada recebe o próximo índice.

Clientes SDK antigos ignoram campos desconhecidos por contrato do PR 14; clientes novos usam `entryCount` para badges. O caminho de reinicialização por fingerprint usa um token opaco retornado apenas via extMethod privilegiado, não exposto no snapshot HTTP.

---

## 9. WorkspaceContext / ListRoots

### 9.1 Registro único

As instâncias de `McpClient` do pool compartilham **um** `WorkspaceContext` — o contexto de workspace vinculado ao daemon (invariante do PR #4113). O handler de `ListRootsRequestSchema` de `connectToMcpServer` captura esse único contexto.

O listener `onDirectoriesChanged` é registrado **uma vez por entrada**, não uma vez por `acquire`. Desanexado no encerramento da entrada.

### 9.2 Fan-up de `roots/list_changed`

Servidor notifica o cliente sobre novas raízes → pool faz fan-out:

- Pool redescobre (o servidor pode reportar conjunto de ferramentas diferente sob novas raízes) → evento `toolsChanged` → todas as views assinantes re-aplicam

### 9.3 `updateWorkspaceDirectories` por sessão

**Contrato**: no Modo B, adições de diretório por sessão são uma dica suave, não autoritativa. O `WorkspaceContext` do pool é do nível do daemon.

Duas opções de implementação:

- **v1 simples**: ignorar adições por sessão, logar aviso quando detectado
- **v2 união**: pool mantém `extraRoots: Map<sessionId, Set<dir>>`, handler de ListRoots retorna união do workspace vinculado + todos os extras. Remoção por sessão dispara `roots/list_changed`. Adiciona 50-80 LOC de complexidade.

**Escolher v1 simples para F2**; v2 união como follow-up se surgir dor do usuário.

---

## 10. Injeção por Sessão

### 10.1 `mcpServers` a partir de `newSession({mcpServers})`

`newSessionConfig(cwd, mcpServers, ...)` mescla a lista injetada com `settings.merged.mcpServers` (acpAgent.ts:1778-1831). O pool consome a **visão mesclada por sessão**:

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...existing setMcpBudgetEventCallback REMOVIDO — pool lida com broadcast diretamente
}
```

Quando duas sessões injetam um servidor de mesmo nome com env/headers diferentes → fingerprints diferentes → duas entradas no pool. O compartilhamento do pool só ocorre quando as sessões concordam exatamente.

### 10.2 Divergência de autenticação

Os mcpServers estáticos de `~/.qwen/settings.json` são idênticos entre sessões → todos compartilham → 80% dos casos. mcpServers injetados por sessão com tokens por usuário → fingerprints únicos → sem compartilhamento. Ambos seguros.

### 10.3 Opt-in de transporte HTTP (recapitulação da §5.2)

Padrão `pooledTransports = {stdio, websocket}`. Servidores HTTP/SSE passam pelo caminho `createUnpooledConnection` (um McpClient por sessão) a menos que o operador opte.

### 10.4 `/mcp disable X` no meio da sessão (V21-6)

Quando o operador executa `/mcp disable github` contra uma sessão ativa:

1. `Config.disableMcpServer('github')` adiciona ao conjunto `disabledMcpServers` por Config
2. **Hook F2**: `Config.onDisabledMcpServersChanged` dispara; `SessionMcpView` para aquele nome chama `teardown()` (remove seus registros de ferramenta/prompt dos registros da sessão)
3. A entrada do pool **pode permanecer viva** se outras sessões ainda a referenciarem (refcount > 0) — apenas a view da sessão desabilitante se desanexa
4. Se todas as sessões desabilitarem → refcount → 0 → timer de dreno inicia

Sem o passo 2, desabilitar no meio da sessão deixaria ferramentas já registradas no `ToolRegistry` da sessão até a próxima reinicialização da sessão. O teste 21.4 cobre isso.

`/mcp enable github` é o inverso: dispara um novo `pool.acquire` para a sessão, anexa nova view, re-aplica snapshot.

---

## 11. Graduação das Salvaguardas de Orçamento

### 11.1 Máquina de estados migra para o pool

`tryReserveSlot` / `releaseSlotName` / histerese de 75% / coalescência de refused_batch / `bulkPassDepth` / `pendingRefusalNames` — todos migram de `McpClientManager` para `McpTransportPool`. `McpClientManager` retém o estado apenas quando executando standalone (sem pool injetado).

### 11.2 Escopo da célula do snapshot

```ts
{
  kind: 'mcp_budget',
  scope: 'workspace',          // NOVO valor (PR 14 v1 retornava 'session')
  liveCount: 5,
  clientBudget: 10,
  budgetMode: 'enforce',
  status: 'ok',
}
```

Por contrato do PR 14: "Consumidores DEVEM tolerar entradas adicionais com valores de escopo não reconhecidos (ignorar, não falhar)." Clientes SDK antigos veem `scope: 'workspace'`, renderizam como desconhecido (ou fallback para números do nível superior). Clientes novos adicionam helper `isWorkspaceScopedBudget(cell)`.

### 11.3 Fan-out de eventos

```ts
class QwenAgent {
  constructor() {
    this.mcpPool = new McpTransportPool({
      onBudgetEvent: (event) => this.broadcastBudgetEvent(event),
    });
  }

  private broadcastBudgetEvent(event: McpBudgetEvent) {
    for (const [sid, session] of this.sessions) {
      const enriched = {
        ...event,
        scope: 'workspace' as const,
        sessionId: sid,
      };
      session.connection
        .extNotification('qwen/notify/session/mcp-budget-event', enriched)
        .catch((err) =>
          debugLogger.debug('falha na entrega de evento de orçamento', { sid, err }),
        );
    }
  }
}
```

### 11.4 Mudanças no contrato de tipos do SDK

O PR 14b exportou estes (devem ser estendidos de forma aditiva):

- `DaemonMcpBudgetWarningData` — adicionar `scope?: 'workspace' | 'session'` (opcional para compatibilidade reversa; ausente = 'session')
- `DaemonMcpChildRefusedBatchData` — mesma extensão `scope?`
- `DaemonMcpGuardrailEvent` — discriminador inalterado

Novos helpers do SDK:

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

Estado do redutor em `DaemonSessionViewState`:

- **Nenhum novo campo** — `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` incrementam independentemente do escopo (escopo é uma propriedade de cada evento, não um stream separado)
- Documentar que sob F2 essas contagens refletem eventos de workspace distribuídos para cada sessão — elas incrementarão **simultaneamente em todas as sessões anexadas** quando houver pressão de orçamento

**V21-12 (Q1 resolvido, travado na v2.1)**: manter os nomes de campo existentes (`mcpBudgetWarningCount`, `mcpChildRefusedBatchCount`, `lastMcpBudgetWarning`, `lastMcpChildRefusedBatch`) com semântica de escopo estendida documentada no JSDoc:

```ts
/**
 * Contagem de eventos `mcp_budget_warning` que a sessão observou.
 * Sob F2 (`scope: 'workspace'`), isso incrementa simultaneamente
 * em todas as sessões anexadas porque eventos de orçamento são
 * distribuídos no nível do workspace. Use
 * `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)` para
 * inspecionar o escopo do evento mais recente.
 */
mcpBudgetWarningCount: number;
```

Justificativa: o PR 14b já enviou esses nomes como superfície pública do SDK; renomear é uma mudança de quebra pior do que a semântica levemente imprecisa.

---

## 12. OAuth — Adiamento Explícito para F3

O fallback de 401 OAuth em `connectToMcpServer` (mcp-client.ts:950-1010) precisa de resolução interativa (abrir navegador ou device-flow). O daemon do Modo B **não deve abrir um navegador** (por design do PR 21 — teste de grep estático de fontes falha na build com `open`/`xdg-open`/`shell.openExternal`).

**Comportamento F2 em servidor que requer OAuth**:

1. Primeiro acquire dispara `connectToMcpServer` → 401 detectado
2. Pool captura exceção de OAuth requerido, marca entrada como `failed_auth_required`
3. Rota de status exibe `errorKind: 'auth_env_error'` (errorKind existente do PR 13)
4. Pool **não tenta novamente automaticamente**
5. Operador executa `/mcp auth <name>` (CLI existente) OU usa a rota device-flow do PR 21 para obter um token em disco → próximo acquire da sessão tenta novamente e tem sucesso

**F3 substituirá os passos 4-5** com `PermissionMediator` roteando requisição de conclusão OAuth para sessões anexadas para primeiro respondedor.

Isso evita que F2 se misture com o trabalho da máquina de estados de autenticação.

---

## 13. Semântica da Rota de Reinicialização

### 13.1 `POST /workspace/mcp/:server/restart` sob pool

Hoje (PR 17): reinicializar no manager da sessão bootstrap = reinicializar a única entrada para aquele nome.

Sob pool: nome → possivelmente múltiplas entradas (fingerprints diferentes para o mesmo nome = sessões diferentes com configs diferentes).

**Comportamento especificado**:

| Requisição                                           | Comportamento                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST /workspace/mcp/:server/restart`                | Reiniciar **todas** as entradas correspondentes a `serverName` (paralelo via `Promise.allSettled`)    |
| `POST /workspace/mcp/:server/restart?entryIndex=0`   | V21-3: reiniciar apenas a entrada #0 (o índice opaco do snapshot §8.3); 404 se não encontrada        |
| `POST /workspace/mcp/:server/restart?entryIndex=*`   | "Todas" explícito (mesmo que sem parâmetro)                                                          |

Formato da resposta:

```ts
type RestartResult = {
  entryIndex: number;        // V21-7: índice opaco, não fingerprint bruto
  restarted: boolean;
  durationMs?: number;
  reason?: string;           // 'budget_would_exceed' | 'not_connected' | 'in_flight'
};
POST /workspace/mcp/:server/restart → { entries: RestartResult[] }
```

Formato antigo `{restarted: true, durationMs}` mantido quando `entries.length === 1` E nenhum parâmetro de query `entryIndex` para compatibilidade reversa; clientes podem detectar o novo formato verificando `'entries' in response`.

### 13.2 Deducão de reinicialização in-flight

```ts
class PoolEntry {
  private restartInFlight?: Promise<void>;
  async restart(): Promise<void> {
    if (this.restartInFlight) return this.restartInFlight;
    this.restartInFlight = this.doRestart().finally(() => {
      this.restartInFlight = undefined;
    });
    return this.restartInFlight;
  }
}
```

### 13.3 Verificação de orçamento (preserva comportamento do PR 17)

Pré-reinicialização, o pool verifica orçamento: se desconectar+reconectar ainda couber, OK. A semântica atual do PR 17 `{restarted:false, skipped:true, reason:'budget_would_exceed'}` é preservada (agora aplicada por entrada).

### 13.4 Chamada de ferramenta in-flight durante reconnect (V21-5, novo)

Sessão A invoca `pool.callTool('git.commit', args)` → requisição atinge stdin do processo filho subjacente → processo filho crasha no meio da escrita → entrada transiciona para reconnect:

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // geração pré-reconnect
  readonly args: unknown;              // args originais, para o chamador tentar novamente se seguro
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**Especificação**:

- A promise da chamada in-flight rejeita com `MCPCallInterruptedError` assim que a queda do transporte é detectada (não esperar pelo reconnect)
- O pool **NÃO faz auto-retry** da chamada; semântica insegura para escritas (commit, edição de arquivo, etc.) e o pool não consegue distinguir leitura de escrita
- O chamador (tipicamente a camada de execução de ferramentas no loop do agente) captura esse erro e decide: tentar novamente / exibir para o usuário / abortar
- Após o reconnect: sessão A pode chamar novamente (mesmo `PooledConnection.callTool`); o pool roteia para a nova instância de transporte transparentemente
- `MCPCallInterruptedError.clientGeneration` permite que o chamador correlacione com evento `reconnected` subsequente, se necessário

O teste 21.6 deve cobrir: spawnar um MCP stdio de longa duração, enviar chamada de ferramenta, matar o processo filho no meio da chamada, afirmar rejeição `MCPCallInterruptedError` com `clientGeneration` não zero.

---

## 14. Refatoração da Rota de Status

### 14.1 Novo caminho de consulta

```ts
// httpAcpBridge.ts:733 buildWorkspaceMcpStatus — substituir fonte de dados
let accounting: McpClientAccounting | undefined;
try {
  // NOVO: consultar pool diretamente via extMethod da bridge, não sessão bootstrap
  accounting = await this.bridge.client.getMcpPoolAccounting();
} catch (err) {
  // Fallback para caminho legado da sessão bootstrap para daemon sem pool
  const manager = config.getToolRegistry()?.getMcpClientManager();
  if (manager) accounting = manager.getMcpClientAccounting();
}
```

`QwenAgent` expõe `getMcpPoolAccounting()`:

```ts
class QwenAgent {
  getMcpPoolAccounting(): McpClientAccounting | undefined {
    return this.mcpPool?.getAccounting();
  }
}
```

Processos filhos ACP fazem a ponte através de `extMethod` para o daemon chamar.

### 14.2 entryCount + entrySummary

Conforme §8.3.

### 14.3 Caso sem sessão bootstrap

Hoje (PR 12), quando o daemon está ocioso (nenhuma sessão ainda), `GET /workspace/mcp` retorna `initialized: false` porque não há sessão bootstrap para consultar.

Sob pool: pool existe desde o construtor de `QwenAgent` → rota de status pode retornar accounting ativo **mesmo com zero sessões**. Célula `initialized: true` mesmo antes da primeira sessão. **Mudança de comportamento documentada** na descrição do PR; não é regressão.

---

## 15. Interação loadSession / resume (PR 6 #4222)

### 15.1 Cancelamento de dreno ao resume

```
sessão-A ativa, mantém ref da entrada-X
sessão-A desconecta (sem close explícito) → eventualmente killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → timer de dreno inicia (30s)
sessão-A resume dentro de 30s → novo newSessionConfig → pool.acquire retorna entry-X → attach cancela dreno
sessão-A resume após 30s → entry-X já fechada → pool cria nova entrada (cold start)
```
### 15.2 Janela de cache do `restoreState` (5min, do PR 6)

`acpAgent.restoreState` fica retido por 5 min após a desconexão. Drenagem do pool (padrão 30s) < janela de restauração (5min) → retomar entre 30s e 5min incorre em cold start do MCP. Trade-off aceitável (a retomada em si é um caminho raro).

Alternativa: o pool lê a configuração da janela de restauração do daemon e estende a drenagem para coincidir. Adiciona acoplamento entre o pool e a máquina de estados da sessão; **adiar para follow-up a menos que usuários relatem dor com cold start**.

### 15.3 Interação com `pendingRestoreIds`

`acpAgent.killSession()` deve chamar `pool.releaseSession(sid)` APÓS limpar `pendingRestoreIds`. Ordem:

1. Sessão marcada como restaurável (`pendingRestoreIds.add(sid)`)
2. Session.close() — mas a referência do pool ainda está retida
3. Após `RESTORE_WINDOW_MS` expirar sem retomada: `killSession` limpa permanentemente → `pool.releaseSession(sid)` aciona a drenagem

Evita que a drenagem dispare durante a janela de restauração.

---

## 16. Recarregamento a Quente de Configuração

### 16.1 Recarregamento implícito via alteração de fingerprint

O usuário edita `~/.qwen/settings.json` em pleno voo, altera o env de um servidor:

1. Sessões antigas mantêm o snapshot antigo de `Config`/`McpServers` → continuam adquirindo fingerprint antiga → referência a entry-OLD persiste
2. Nova sessão lê as configurações atualizadas → nova fingerprint → entry-NEW criada → coexiste com entry-OLD
3. Sessões antigas fecham naturalmente → entry-OLD é drenada → eventualmente fechada
4. Estado estável: apenas entry-NEW permanece

**Sem mutação ao vivo de conexões em execução** — separação limpa entre sessões em versões diferentes de configuração.

### 16.2 Rota de recarregamento forçado (opcional)

```
POST /workspace/mcp/reload-all
  → para cada sessão: recarregar configurações, trocar Config.mcpServers
  → para cada entrada não mais referenciada: agendar remoção
```

Útil para "mudei variáveis de ambiente e quero efeito imediato em todas as sessões." Adiar para follow-up do F2 (não bloqueante).

### 16.3 Desinstalação de extensão remove entradas órfãs (V21-15)

Cenário: extensão `foo-ext` registra servidor MCP `foo-server`. Operador executa `/extension uninstall foo-ext`. O ciclo de vida da extensão remove `foo-server` de `extensionMcpServers`, de modo que futuras chamadas `loadCliConfig` não o incluam. Mas:

- Sessões ativas mantêm snapshots de `Config` que ainda incluem `foo-server` → essas sessões continuam usando a entrada
- Novas sessões após a desinstalação não adquirem (servidor não está mais em seus mcpServers mesclados) → nenhum incremento de refcount

**Resolução**: confiar na drenagem natural. Conforme as sessões antigas fecham, o refcount cai; eventualmente a entrada atinge `MAX_IDLE_MS = 5min` e é fechada à força. **Nenhuma API `pool.invalidateByExtension(name)` explícita** — mantém o modelo uniforme com recarregamento a quente de configuração (§16.1).

Trade-off: o servidor da extensão pode executar por até 5min após a desinstalação se uma sessão longa o mantiver ativo. Aceitável; operadores podem executar `/mcp restart foo-server` e depois matar a sessão se houver urgência.

---

## 17. Ordem de Desligamento

Sequência de `QwenAgent.close()` (deve ser imposta):

```
1. Definir acceptingNewSessions = false; rejeitar novas requisições POST /session
2. Para cada prompt em andamento: sinalizar cancelamento, aguardar conclusão (ciclo de vida existente do PR 11)
3. Para cada sessão: acionar close → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← ignora a carência de 30s
   ├── Para cada entrada: cancelar timers de drenagem e health, marcar como drenando
   ├── Para cada entrada em paralelo: listDescendantPids → SIGTERM nos filhos
   ├── Para cada entrada em paralelo: client.disconnect()
   └── Promise.race contra timeoutMs; entradas abandonadas recebem SIGKILL
5. Fechamento do canal da bridge
6. Saída do processo
```

**V21-11**: assinatura de `drainAll`:

```ts
async drainAll(opts?: {
  force?: boolean;       // padrão false; true ignora o timer de carência de 30s
  timeoutMs?: number;    // padrão 10_000; orçamento de relógio de parede; SIGKILL nos retardatários após
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // entradas que desconectaram limpa e corretamente
  forced: number;        // entradas que receberam SIGKILL após timeout
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

O chamador usa `DrainResult` para registro de desligamento; se `forced > 0`, registrar um aviso para que o operador saiba que um servidor não foi desligado de forma limpa.

---

## 18. Estrutura de Arquivos

**Arquivos novos:**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool principal (~700 LOC)
  mcp-pool-key.ts              # fingerprint + helpers de canonicalização (~150 LOC)
  mcp-pool-entry.ts            # PoolEntry: refcount + drenagem + health + geração (~500 LOC)
  session-mcp-view.ts          # SessionMcpView: filtro + registro de ferramentas/prompts (~200 LOC)
  mcp-pool-events.ts           # União discriminada PoolEvent (~80 LOC)
  pid-descendants.ts           # listDescendantPids multi-plataforma (~150 LOC, incluindo testes)

packages/core/src/tools/
  mcp-transport-pool.test.ts   # ~900 LOC
  mcp-pool-entry.test.ts       # ~400 LOC
  session-mcp-view.test.ts     # ~250 LOC
  mcp-pool-key.test.ts         # ~150 LOC
  pid-descendants.test.ts      # ~200 LOC (Unix + Windows com skip condicional)
```

**Arquivos modificados:**

```
packages/core/src/tools/mcp-client.ts            # divisão de discoverAndReturn(); connectToMcpServer unificado
packages/core/src/tools/mcp-client-manager.ts    # parâmetro opcional pool; estado de budget condicional
packages/core/src/tools/tool-registry.ts         # encadeia pool da configuração para McpClientManager
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # construção de QwenAgent.mcpPool; broadcastBudgetEvent;
                                                 # newSessionConfig conecta pool ao Config;
                                                 # killSession chama pool.releaseSession
packages/cli/src/serve/run-qwen-serve.ts           # passa --mcp-pool-transports + env de budget para o filho ACP
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus lê pool;
                                                 # restartMcpServer extMethod retorna RestartResult[]
packages/cli/src/serve/capabilities.ts           # anuncia mcp_workspace_pool
packages/sdk/src/daemon/mcpEvents.ts             # scope?: campo opcional; helper isWorkspaceScopedBudgetEvent
```

---

## 19. Entrega em PR Único — Divisão de Commits (V21-1)

Seguindo a orientação de lote coeso por funcionalidade do mantenedor (#4175 estratégia de branching 2026-05-19), o F2 é enviado como **um PR com 6 commits atômicos**. O revisor pode percorrer com `git log -p HEAD~6..HEAD` e revisar commit por commit.

| Commit # | Título                                                                                      | Escopo                                                                                                                                                                                                                                                                                                                                                                                                             | Arquivos tocados                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1        | `refactor(core): split McpClient.discover into pure tool/prompt list and unify connect paths` | Adicionar `discoverAndReturn()`; extrair `establishConnection()` compartilhada usada tanto por `McpClient.connect()` quanto pela factory `connectToMcpServer()`; `discover()` legada se torna um wrapper fino que registra (preserva comportamento standalone do qwen). Nenhuma mudança observável de comportamento.                                                                                               | `mcp-client.ts`, `mcp-client.test.ts`                                                                                    |
| 2        | `feat(core): McpTransportPool + SessionMcpView`                                               | Núcleo do pool: `fingerprint`, refcount, deduplicação de `spawnInFlight`, índice reverso `sessionToEntries`, máquina de estados de drenagem, reprodução de snapshot ao anexar, proteção de geração, fan-out duplo de ferramentas+prompts, cópia de confiança por sessão. McpClient mockado para testes unitários. Nenhuma conexão com produção.                                                                     | novos `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + testes |
| 3        | `feat(core): cross-platform descendant pid sweep + pool health monitor`                       | `listDescendantPids` (Unix `pgrep -P` recursivo, Windows PowerShell CIM); monitor de saúde unificado dentro de `PoolEntry` (verificação por intervalo + contagem de falhas + backoff de reconexão conforme §6.6); testes de integração de spawn de subprocesso protegidos por `QWEN_INTEGRATION === '1'`.                                                                                                         | novo `pid-descendants.ts` + testes; `mcp-pool-entry.ts`                                                                  |
| 4        | `feat(serve): wire McpTransportPool into QwenAgent daemon mode`                               | `Config.setMcpTransportPool` + `getMcpTransportPool`; `ToolRegistry` encadeia pool no `McpClientManager`; `McpClientManager` com parâmetro opcional `pool?` no construtor; `acpAgent.QwenAgent` constrói pool na inicialização; injeção de `newSessionConfig`; `killSession` chama `pool.releaseSession`; SDK MCP + HTTP/SSE bypass via `createUnpooledConnection`; flags de CLI `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`. | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                               |
| 5        | `feat(serve): pool-aware status + restart routes`                                             | `QwenAgent.getMcpPoolAccounting` extMethod; `httpAcpBridge.buildWorkspaceMcpStatus` priorizando pool + fallback para bootstrap-session; `restartMcpServer` aceita `?entryIndex=` e retorna `RestartResult[]`; `entryCount` + `entrySummary[].entryIndex` na célula; tags de capacidade `mcp_workspace_pool` + `mcp_pool_restart`.                                                                                  | `httpAcpBridge.ts`, `capabilities.ts`, tipos do SDK                                                                      |
| 6        | `feat(serve): graduate MCP budget guardrails to workspace scope`                              | Mover `tryReserveSlot`/`releaseSlotName`/máquina de estados de histerese de `McpClientManager` para o pool; remover conexão de `setMcpBudgetEventCallback` por sessão em `acpAgent.newSessionConfig`; fan-out de `QwenAgent.broadcastBudgetEvent`; célula do snapshot com `scope: 'workspace'`; campo aditivo `scope?` no SDK; helper `isWorkspaceScopedBudgetEvent`; atualizações de documentação inline.        | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                 |

**Estimativa total de LOC**: ~4100 produção + ~1900 testes = ~6000 LOC (estimativa v2 ~3850; crescimento absorve correções do V21).

**Alvo de merge**: PR único em `daemon_mode_b_main`. Merge em lote periódico para `main` conforme estratégia #4175.

**Processo de auto-revisão antes de abrir o PR**:

1. Após cada commit, executar o agente `code-reviewer` no diff do commit; incorporar descobertas adotadas no mesmo commit
2. Para os commits 2/4/6 (maior risco de design), executar adicionalmente `silent-failure-hunter` + `type-design-analyzer`
3. Após todos os 6 commits estarem prontos: 3 passagens completas de revisão por diferentes combinações de agentes no diff completo do PR
4. Executar suíte de testes completa + typecheck + lint em todos os pacotes tocados

Espelhar o padrão de pré-revisão especializada do PR 21.

---

## 20. Tags de Capacidade + Mudanças no Contrato do SDK

### 20.1 Novas tags de capacidade (anunciadas atomicamente no v0.16, V21-1)

Como o F2 é enviado como um PR, todas as três tags são anunciadas juntas. Consumidores do pool podem assumir que **`mcp_workspace_pool` anunciado ⇒ todos os campos `entryCount`/`entrySummary`/`scope?` estão presentes**; nenhuma verificação de capacidade por campo é necessária.

| Tag                        | Quando anunciada                                                                                       | Significado                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `mcp_workspace_pool`       | Quando `QwenAgent.mcpPool !== undefined` (sempre verdadeiro no modo daemon a menos que `--no-mcp-pool` kill switch) | `GET /workspace/mcp` reflete estado do pool; campos `entryCount` + `entrySummary` presentes            |
| `mcp_pool_restart`         | Sempre quando `mcp_workspace_pool` está ativo                                                          | `POST /workspace/mcp/:server/restart` aceita `?entryIndex=` e pode retornar `entries: RestartResult[]`  |
| (estende `mcp_guardrails`) | inalterado                                                                                             | Mesma tag, payload estendido com `scope` (`'workspace'` no F2)                                          |

### 20.2 Superfície aditiva do SDK

```ts
// @qwen-code/sdk — apenas aditivo
export interface DaemonMcpBudgetWarningData {
  // campos existentes...
  scope?: 'workspace' | 'session'; // NOVO — ausente em daemons antigos (significa 'session')
}

export interface DaemonMcpChildRefusedBatchData {
  // campos existentes...
  scope?: 'workspace' | 'session';
}

export interface ServeWorkspaceMcpServerStatus {
  // campos existentes...
  entryCount?: number;
  entrySummary?: Array<{
    fingerprint: string;
    refs: number;
    status: MCPServerStatus;
  }>;
}

export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

`EVENT_SCHEMA_VERSION` permanece em `1` (aditivo).

---

## 21. Matriz de Testes

### 21.1 Chave do pool (F2-2)

- Mesma cfg → mesma chave (permutação de chave de env estável, permutação de chave de cabeçalho estável)
- Diferença de 1 byte no valor de env → chave diferente
- Diferença no valor do cabeçalho `Authorization` → chave diferente
- `includeTools`/`excludeTools`/`trust` modificados → MESMA chave (filtro por sessão)
- Dois `new MCPServerConfig(...)` com conteúdo idêntico → mesma chave (hash canônico, não identidade)

### 21.2 Ciclo de vida (F2-2)

- 3 sessões adquirem a mesma chave → 1 spawn (verificar via spy em `client.connect`)
- Sequência de liberação n,n-1,...,1 → timer de drenagem inicia apenas em 1→0
- Drenagem de 30s: adquirir aos 25s cancela o timer; adquirir aos 35s gera uma nova entrada
- `MAX_IDLE_MS` (5min) fecha à força mesmo se a drenagem estiver oscilando
- Falha no spawn durante in-flight: todos os awaiters recebem erro; slot liberado; nenhuma entrada armazenada

### 21.3 Aquisição concorrente (F2-2)

- 5 aquisições simultâneas `acquire(mesmaChave)` enquanto nenhuma entrada existe → exatamente 1 chamada a `spawnEntry`, todos os 5 obtêm a mesma entrada
- Spawn rejeita → todos os 5 awaiters rejeitam com o mesmo erro; aquisições subsequentes geram novo spawn

### 21.4 Isolamento por sessão (F2-2)

- Sessão A com `excludeTools: ['foo']`, Sessão B sem exclusão → ToolRegistry de A omite foo, B tem; ambos a partir do mesmo `toolsSnapshot`
- Sessão A com `trust: true`, Sessão B com `trust: false` → `DiscoveredMCPTool.trust === true` para A, `false` para B; verificar que NÃO é referência compartilhada (mutar um não afeta o outro)
- Sessão A adquire servidor apenas de prompt → PromptRegistry de A populado, ToolRegistry vazio para aquele servidor

### 21.5 Mudança na lista de ferramentas/prompts (F2-2)

- Servidor emite `notifications/tools/list_changed` → todos os assinantes têm `applyTools` chamado com novo snapshot
- Handler obsoleto de geração anterior à reconexão NÃO sobrescreve o snapshot
- Análogo para `notifications/prompts/list_changed`

### 21.6 Crash + reconexão (F2-2)

- Matar subprocesso via `process.kill` → assinantes recebem evento `disconnected`
- 3 tentativas de reconexão (usando `MCPHealthMonitorConfig` existente) → sucesso → `reconnected` + snapshot atualizado
- Tentativas esgotadas → todos os assinantes recebem evento `failed`; entrada transiciona para estado `failed`; novas aquisições tentam novamente uma vez e depois lançam erro

### 21.7 Varredura de pids descendentes (F2-2b)

- Linux/macOS: spawn `bash -c "sleep 60 & sleep 60"` como comando stdio → matar raiz → verificar que ambos os descendentes foram coletados (poll em `/proc/<pid>/status`, ou `kill(0, pid) === false`)
- Windows: spawn wrapper `cmd /c "ping -t localhost"` → matar → verificar que subprocesso ping desapareceu
- `pgrep` indisponível (PATH ausente) → degradação graciosa: log de aviso, apenas SIGTERM na raiz, sem quebra

### 21.8 Budget no escopo do workspace (F2-4)

- 4 sessões × `--mcp-client-budget=2` com 3 servidores MCP estáticos → total do workspace = 3 (não 12); célula do snapshot `scope: 'workspace'`, `liveCount: 3`
- Aviso de budget dispara uma vez por cruzamento de 75% para cima em todo o workspace; transmite para todas as 4 sessões simultaneamente
- Re-arm da histerese: cair para 37,5% → próximo cruzamento dispara novamente

### 21.9 Compatibilidade reversa (F2-3)

- `qwen` standalone (sem daemon) → `mcpPool === undefined` → todos os testes existentes de `mcp-client-manager.test.ts` passam inalterados
- Flag `--no-mcp-pool` do daemon → cai para comportamento por sessão, todos os testes e2e existentes do daemon passam

### 21.10 Isolamento de credenciais (F2-3)

- Sessão A injeta `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}`, Sessão B `tokenB` → 2 processos separados; verificar por snapshot `entryCount: 2`; verificar que chamadas de ferramenta de A passam pelo transporte de A (por inspeção de cabeçalho em stdin/log)

### 21.11 LoadSession / retomada (F2-3)

- Sessão fecha → drenagem inicia → retomada dentro de 30s → entrada do pool reutilizada (sem cold start, afirmado por contagem de spy em `client.connect`)
- Retomada após 30s mas antes da expiração da janela de restauração → cold start do pool; conteúdo de `restoreState` ainda preservado

### 21.12 Rota de restart (F2-3b)

- 1 entrada para o nome → `POST /workspace/mcp/foo/restart` retorna formato legado `{restarted: true, durationMs}`
- 2 entradas para o nome (fingerprints diferentes) → retorna `{entries: [{fingerprint, restarted, ...}, ...]}`
- Restart enquanto outro restart está em andamento → segunda chamada retorna a mesma promise (deduplicada)
- Restart quando o budget seria excedido → `{restarted: false, skipped: true, reason: 'budget_would_exceed'}` por entrada

### 21.13 Rota de status (F2-3b)

- Daemon ocioso (sem sessões) mas pool com entradas em cache da sessão anterior → `GET /workspace/mcp` retorna `initialized: true` com contabilidade ativa
- Bootstrap session inexistente → fallback para caminho direto do pool; nenhum erro
- Consulta ao pool lança exceção → fallback para caminho da bootstrap-session; nunca quebra o snapshot

### 21.14 Redutor do SDK (F2-4)

- `mcpBudgetWarningCount` incrementa simultaneamente em todas as sessões assinantes quando evento de workspace é transmitido
- `isWorkspaceScopedBudgetEvent(e)` identifica corretamente o escopo a partir do payload
- Daemon antigo (sem campo `scope`) → interpretação padrão como 'session'

### 21.15 Recarregamento a quente de configuração (F2-3)

- Mudança no settings.json em pleno voo → sessão antiga mantém entrada antiga, nova sessão cria nova entrada, ambas coexistem; antiga é drenada naturalmente quando a última sessão antiga fecha
- 0 sessões após o fechamento da sessão antiga → timer de drenagem dispara → entrada antiga é coletada → apenas a nova entrada permanece

### 21.16 Ordem de desligamento (F2-3)

- `QwenAgent.close()` dispara em ordem: parar de aceitar → drenar prompts → fechar sessões → `pool.drainAll` → sem pids zumbis em `pgrep -P <acpChildPid>` após a saída
---

## 22. Perguntas em Aberto

A V21 travou Q1/Q3/Q4/Q6 nos padrões de design (entrega em PR único). Q2/Q5/Q7/Q8/Q9 permanecem.

| #     | Pergunta                                                                                                          | Padrão de design F2                                                                       | Decisão necessária antes de |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Q1 ✅ | Nomes dos campos do reducer do SDK — renomear ou manter?                                                           | **TRAVADO v2.1**: manter `mcpBudgetWarningCount` etc. com semântica de escopo estendida no JSDoc | resolvido               |
| Q2    | Capacidade `mcp_workspace_pool` — avançar `protocolVersions` ('v1' → 'v1.1'), ou permanecer aditivo no 'v1'?      | **Permanecer aditivo no 'v1'** (consistente com o precedente do PR 14b)                   | commit 5               |
| Q3 ✅ | Flag `--no-mcp-pool` — ativada por padrão ou opt-in?                                                              | **TRAVADO v2.1**: ativada por padrão; `--no-mcp-pool` é o kill switch                     | resolvido               |
| Q4 ✅ | Padrão HTTP/SSE — pool desligado ou ligado?                                                                       | **TRAVADO v2.1**: pool desligado; opt-in via `--mcp-pool-transports`                      | resolvido               |
| Q5    | `POST /workspace/mcp/reload-all` — incluir no F2 ou em follow-up?                                                 | **Follow-up**                                                                             | n/a (adiado)            |
| Q6 ✅ | Construção lazy do pool — vale a pena a condicional?                                                              | **TRAVADO v2.1**: eager (sempre construir no construtor de `QwenAgent`)                   | resolvido               |
| Q7    | `restoreState` window vs dreno do pool — manter separados, alinhar ou ler das configurações?                      | **Manter padrão separado de 30s** + knob de configuração `--mcp-pool-drain-ms`            | commit 4               |
| Q8    | Tratamento OAuth — confirmar adiamento para F3, documentar workaround?                                            | **Adiado para F3**, documentar workaround `/mcp auth <name>`                              | commit 4               |
| Q9    | Exposição de `entrySummary` — incluir sempre ou atrás de flag verbose?                                            | **Incluir sempre** (payload pequeno, útil para operações)                                 | commit 5               |
| Q10   | Atualizar `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` decisão #3 — coordenar com @wenshao? | A descrição do PR F2 linka o PR do codeagents; dois PRs revisados independentemente       | PR aberto                |

---

## 23. Riscos

### Alto

- **R1 (Estado global A2)**: Colisão de `serverStatuses` em múltiplas entradas de mesmo nome. Mitigado pela função de status agregado; risco remanescente é consumidores do SDK lerem o Map global bruto (improvável — usado apenas via accessor `getMCPServerStatus(name)`).
- **R2 (Simetria do PromptRegistry)**: Esquecer o fan-out de prompts em qualquer caminho de código silenciosamente descarta prompts. Mitigado pelo F2-2 teste 21.4 terceiro bullet + teste de integração verificando paridade de prompts vs pré-F2.
- **R3 (Vazamento de estado no transporte HTTP)**: Optar pelo pool HTTP para um servidor que mantém estado por transporte corrompe contextos de sessão. Mitigado por desligado por padrão + documentação; não é possível detectar automaticamente.

### Médio

- **R4 (Unificação de caminhos F2-1)**: A factory `connectToMcpServer` e a classe `McpClient` possuem diferenças comportamentais sutis (ex.: capacidades anunciadas no momento da construção vs. conexão). Mitigado por F2-1 ser um PR de refatoração puro com cobertura completa de regressão antes do início do trabalho no pool.
- **R5 (Processo filho no Windows)**: `Get-CimInstance` do PowerShell pode ser lento (custo de spawn) ou bloqueado pelo AppLocker. Mitigado por timeout de 2s + degradação graciosa.
- **R6 (Amplificação de broadcasts de eventos do pool)**: Fan-out de aviso de orçamento para 100 sessões causa 100 chamadas `extNotification` em loop apertado. Mitigado por paralelização com `Promise.all` + `catch` por sessão (padrão existente do PR 14b).

### Baixo

- **R7 (Estabilidade da fingerprint entre versões do MCPServerConfig)**: Campos futuros adicionados a `MCPServerConfig` não incluídos na fingerprint poderiam silenciosamente permitir compartilhamento incorreto. Mitigado por função de canonicalização explícita + teste que enumera todos os campos de `MCPServerConfig` e verifica cobertura.
- **R8 (Condições de corrida do contador de geração)**: Ciclos rápidos de reinicialização poderiam exaurir a precisão numérica do JS (≈ 2^53 = ~285k anos a 1/seg). Não é uma preocupação prática.

### Específicos do PR único (V21-14)

- **R9 (Fadiga de revisão em PR único de ~6000 LOC)**: Largura de banda do revisor se torna caminho crítico. F3 bloqueado pela merge de F2 → bloqueando outros contribuidores. Mitigação: (a) pré-revisão com 3 agentes especialistas e incorporar P0/P1 antes de abrir, espelhando o padrão do PR 21; (b) estruturar como 6 commits atômicos para o revisor poder percorrer passo a passo; (c) coordenar janela de revisão com @wenshao com antecedência via comentário na #4175.
- **R10 (Acúmulo de conflitos de merge no `daemon_mode_b_main`)**: F2 toca em `acpAgent.ts`, `httpAcpBridge.ts`, `capabilities.ts`, `mcp-client*.ts` — todos caminhos críticos. Contribuidores do F3/F4 que estiverem aterrissando concorrentemente correm risco de conflitos durante a janela de revisão de 1–2 semanas do F2. Mitigação: `git rebase origin/daemon_mode_b_main` diário; coordenar via atualização na #4175 informando que o F2 está em andamento + pedir para F3/F4 adiarem alterações em arquivos críticos até o merge do F2.
- **R11 (Tempo de execução do CI)**: ~1900 LOC de novos testes incluindo spawn de subprocesso + varredura de pid multiplataforma pode elevar o CI de 30min para 50min. Mitigação: (a) proteger testes de subprocesso atrás de `process.env.QWEN_INTEGRATION === '1'`, executar subconjunto no CI do PR + conjunto completo no nightly; (b) paralelismo Vitest ≥ 4; (c) testes de varredura de pid no Windows com skip protegido apenas no runner Windows do GHA.

---

## 24. Atualizações de Documentação

| Documento                                                                       | Atualização                                                                                                                                             | Quando                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`              | Decisão #3 "Tempo de vida do servidor MCP": atualmente "por sessão"; atualizar para "pool por workspace com chave de hash de configuração no modo daemon; independente por sessão" | F2-3 merge (coordenar com @wenshao PR do codeagents) |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                              | Wave 5 PR 23 → marcar como série F2; linkar para PRs                                                                                                    | F2-3 merge                                           |
| `packages/cli/src/serve/README.md` (se existir) ou novo `docs/serve/mcp-pool.md`| Nova seção: semântica do pool, chave de fingerprint, opt-in de transporte, semântica de reinicialização, interpretação do snapshot de status            | F2-3b                                                |
| `packages/sdk/README.md`                                                        | Campo `scope?` em eventos de guardrail, `entryCount` no status do servidor, helper `isWorkspaceScopedBudgetEvent`                                       | F2-4                                                 |
| Issue #4175 body                                                                | Atualizar entrada do F2 com tabela de sub-PRs, link para o design v2 (este documento)                                                                   | Antes de F2-1 abrir                                  |
| Issue #3803 body                                                                | Linha da Decisão #3: atualizar "Atualmente por sessão" → "Pool por workspace no daemon (F2)"                                                            | Após merge de F2-3                                   |
| Comentário inline `acpAgent.ts:869-936`                                         | Remover referência futura "Wave 5 PR 23"; atualizar para "graduado pelo F2 para `scope: 'workspace'`"                                                   | PR F2-4                                              |
| CHANGELOG / notas de release (Wave 6 / F5)                                     | Manchete "Processos MCP agora compartilhados entre sessões em um workspace"                                                                             | Release F5                                           |

---

## 25. Template de Descrição de PR (entrega em PR único)

```markdown
## feat(serve): shared MCP transport pool (workspace-scoped) [F2]

PR único e coeso de funcionalidade por estratégia de branching #4175 (2026-05-19).
Substitui o que era originalmente planejado como Wave 5 PR 23 + sub-PRs F2-1..F2-4.

### Escopo

~4100 LOC de produção + ~1900 LOC de testes em 6 commits atômicos.
Percorra com `git log -p HEAD~6..HEAD` para revisão commit a commit.

### Documento de design

Veja `docs/design/f2-mcp-transport-pool.md` (v2.1).

### Agentes especialistas de pré-revisão (por padrão do PR 21)

Incorporados no primeiro commit antes de abrir:

- code-reviewer: N achados, todos adotados
- silent-failure-hunter: N achados, todos adotados
- type-design-analyzer: N achados, todos adotados

### Closes

(nenhum — entrada do F2 na #4175 permanece aberta até o PR fazer merge no main batch)

### Relacionados

- #3803 atualização da decisão #3 (PR do codeagents <link>)
- PR 14b (#4271 merged) — base do guardrail de orçamento; F2 gradua escopo para workspace
- F1 (#4319 merged) — pacote acp-bridge; F2 depende das seams de injeção

### Compatibilidade reversa

- `qwen` standalone (não-daemon): pool não é construído; comportamento existente preservado
- Daemon `qwen serve --no-mcp-pool`: kill switch reverte para por sessão
- SDK: todos os novos campos são aditivos (`entryCount`, `scope?`); EVENT_SCHEMA_VERSION permanece em 1
- Clientes SDK antigos: `scope: 'workspace'` desconhecido ignorado por contrato do PR 14
- Daemons antigos: consumidores do SDK podem detectar ausência da capacidade `mcp_workspace_pool` e reverter

### Plano de teste

- [ ] Chave do pool: estabilidade de permutações de env, divergência de cabeçalho, exclusão de filtro por sessão
- [ ] Ciclo de vida: compartilhamento de 3 sessões, graça de dreno, deduplicação de aquisição concorrente, liberação de slot em falha de spawn
- [ ] Fan-out duplo de Tools + Prompts, cópia de trust por sessão, replay de snapshot ao anexar
- [ ] Guarda de geração: handler de pré-reconexão não sobrescreve snapshot pós-reconexão
- [ ] Crash + reconexão com backoff stdio (5s × 3) e backoff HTTP (1/2/4/8/16s × 5)
- [ ] Varredura de pid descendente: recursão pgrep Linux/macOS, PowerShell CIM Windows
- [ ] Orçamento em escopo de workspace: 4 sessões × orçamento=2 → 3 no máximo (não 12); fan-out para todas anexadas
- [ ] Retomada de LoadSession dentro da janela de dreno: entrada do pool reutilizada, sem cold start
- [ ] Recarga de configuração a quente: entradas antigas/novas coexistem; antigas drenam naturalmente
- [ ] Rota de reinicialização: seletividade `?entryIndex=`; formato de resposta de entrada única legado preservado
- [ ] Chamada de tool em voo durante reconexão: rejeição `MCPCallInterruptedError`
- [ ] qwen standalone: todos os testes existentes do mcp-client-manager passam inalterados
```

## Resumo

F2 v2.1 = PR único com 6 commits atômicos (~6000 LOC), direcionado a `daemon_mode_b_main`. Pilares chave do design:

1. **`McpTransportPool`** em `packages/core` (lado filho do ACP), escopo por workspace, refcount + dreno de 30s
2. **Chave de fingerprint** SHA-256 sobre configuração canônica incluindo env/cabeçalhos (padrão claude-code), excluindo filtros por sessão (includeTools/trust)
3. **`SessionMcpView`** projeção do registro de ferramentas+prompts por sessão com cópia de trust
4. **Replay de snapshot + guarda de geração** para race de attach e notificações obsoletas
5. **Varredura de pid descendente multiplataforma** (padrão opencode + port para Windows)
6. **Opt-in HTTP/SSE**, bypass do SDK MCP, OAuth adiado para F3
7. **Máquina de estado de orçamento** gradua para escopo de workspace; célula de snapshot + eventos push estendem aditivamente (`scope?`)
8. **Rotas de status e reinicialização** refatoradas: pool-first com fallback para bootstrap-session; `entryCount` + `RestartResult[]`

**Perguntas em aberto Q1–Q10** na §22 precisam de decisões dos mantenedores antes dos respectivos sub-PRs abrirem. Recomenda-se resolver Q1–Q4 antes de F2-3 começar (esses itens definem a direção geral); Q5–Q10 podem ser resolvidos incrementalmente.