# F2: Pool de Transporte MCP Compartilhado — Design v2.2

> Destina-se a `daemon_mode_b_main` (por estratégia de ramificação #4175). Substitui PR 23 da Onda 5 do #4175.
> **Entrega em PR único** conforme orientação de lote coeso de funcionalidades do mantenedor (2026-05-19).
> Autor: doudouOUC. Data: 2026-05-20. Revisado: 2026-05-20 (v2.2 — incorporações de revisão de implementação).

---

## 0. Changelog

### v2.2 (2026-05-20) — PR #4336 implementação + 32 revisões incorporadas

O PR #4336 enviou F2 como 6 commits atômicos + 6 commits de correção em ~4 horas. Wenshao revisou cumulativamente em 3 lotes; cada lote produziu correções inline + críticas que foram revertidas. A tabela abaixo registra o que mudou em relação à v2.1, organizado por lote de revisão.

#### v2.1 → primeiro lote de revisão (commits 1-4, wenshao C1-C7 + S1-S4)

| #   | Local                                                       | O que estava errado                                                                                                                                              | Commit de incorporação |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| C1  | `acpAgent.ts:269` — caminho de fechamento IDE              | O drain do pool só era executado no handler de SIGTERM; o fechamento normal iniciado pelo IDE vazava entradas até o SO recolher. Espelhar o drain do SIGTERM em `await connection.closed` | `ae0b296c4`            |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                       | `cancelDrainTimer` resetava `maxIdleTimer` a cada oscilação, derrotando o limite máximo da §6.3. Agora apenas limpa `drainTimer`; max-idle sobrevive toda a vida da entrada | `ae0b296c4`            |
| C3  | `mcp-pool-entry.ts:doRestart`                              | Falha de reconexão deixava entrada em estado zumbi (`localStatus=CONNECTED`, `state='active'`, snapshot obsoleto). Try/catch + transição para `'failed'` em falha | `ae0b296c4`            |
| C4  | `mcp-pool-entry.ts:forceShutdown`                          | `state='closed'` definido APÓS awaits, então `acquire` concorrente podia observar `'active'` e entregar conexão obsoleta. Definido sincronamente no topo | `ae0b296c4`            |
| C5  | `mcp-transport-pool.ts:drainAll`                           | `acquire` concorrente podia criar nova entrada durante o drain. Adicionado flag mutex `draining` + `await Promise.allSettled(spawnInFlight)` antes de limpar | `ae0b296c4`            |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                   | Listener não era filtrado por `serverName`; cada entrada recebia notificações de status de todos os servidores + o próprio `markActive` da entrada ecoava de volta | `ae0b296c4`            |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`     | Gatilho de modo pool adicionado a `discoverAllMcpTools`, mas faltava em `Incremental` — `/mcp refresh` ignorava o pool, criava cliente por sessão | `ae0b296c4`            |
| S1  | `session-mcp-view.ts:passesSessionFilter`                  | Documentação não mencionava que `excludeTools` usa igualdade direta (sem suporte à forma de parênteses); divergência vs `mcp-client.ts:isEnabled` | `ae0b296c4`            |
| S2  | docstring de `pid-descendants.ts`                          | Afirmava ramo `taskkill /F` específico do Windows que não existia — Node polyfills `process.kill('SIGTERM')` para `TerminateProcess` | `ae0b296c4`            |
| S3  | log de debug de `session-mcp-view.ts:applyTools`           | String continha literal `"N"` em vez de interpolação — operadores viam `applied 12 tools (filtered to N registered)` | `ae0b296c4`            |
| S4  | callback de status de `mcp-transport-pool.ts:createUnpooledConnection` | Fixado em `() => CONNECTED` então `aggregateStatusByName` mentia após desconexão. Agora `() => client.getStatus()` | `ae0b296c4`            |

#### Lote de auto-revisão do Commit-5 (R1-R3 pequenos)

| #   | Local                                            | O que estava errado                                                                                                                                           | Commit de incorporação |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| R1  | `server.test.ts:918` envelope `/capabilities`   | Teste afirmava `getAdvertisedServeFeatures()` (sem alternâncias) mas server.ts passa `mcpPoolActive: opts.mcpPoolActive !== false` (ativado por padrão). Âncora a alternância | `3e68c00bc`            |
| R2  | Cobertura de padrão ativado em `server.test.ts` | Nenhum teste iniciava com opções padrão para verificar se tags de pool são anunciadas. Adicionado teste explícito `mcpPoolActive: false` | `3e68c00bc`            |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`   | Documentação dizia que SDKs pré-PR "veriam novo valor como desconhecido e exibiriam genericamente" — na verdade `MCP_RESTART_REFUSED_REASONS.has(...)` rejeita → descarte silencioso | `3e68c00bc`            |
#### Lote de segunda revisão (commits 1-5, wenshao R1-R10)

| #   | Site                                                | O que estava errado                                                                                                                                                                                                         | Commit de incorporação |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                    | A correção C2 preservou corretamente `maxIdleTimer` durante flutuações, mas a ação de força fechava independentemente de `refs.size`. Uma sessão ativa com reconexão dentro da carência perderia ferramentas após 5min       | `72399f109`            |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`  | `releaseAllPooledConnections` + readquirir TODOS a cada passada deixava uma janela curta sem nenhuma ferramenta MCP registrada E reiniciava cada timer de dreno. Diff contra o desejado `(name, fingerprint)`               | `72399f109`            |
| WR3 | `mcp-pool-entry.ts:doRestart` snapshot fan-out      | O restart atualizava `toolsSnapshot`/`promptsSnapshot` e emitia eventos tipados — mas nenhuma instância de `SessionMcpView` estava inscrita nesse stream. Iterar `subscribers` diretamente após o snapshot                   | `72399f109`            |
| WR4 | `mcp-transport-pool.ts:getSnapshot subprocessCount` | Contava websocket como `subprocessCount` — websocket dial remoto, sem processo filho local. Restrito apenas para `'stdio'`                                                                                                  | `72399f109`            |
| WR5 | `pid-descendants.ts` PowerShell `-Filter`           | `${pid}` interpolado diretamente na string `-Filter`. O guard `Number.isInteger` no ponto de entrada previne injeção hoje; bind para `$p` para defesa em profundidade contra relaxamentos futuros do guard                     | `72399f109`            |
| WR6 | `mcp-pool-entry.ts` ctor `cfg` field                | `readonly cfg: MCPServerConfig` era implicitamente público, expondo chaves de API de env / autenticação de header / campos OAuth. Tornado `private`; novo getter `transportKind` para o único leitor externo                | `72399f109`            |
| WR7 | `mcp-pool-events.ts` premature exports              | 5 type guards de PoolEvent + re-export de `Prompt` + `PoolEntryConnectionStatus` não tinham chamadores. Removidos; mantido `MCPCallInterruptedError` (mandato da seção §13.4)                                               | `72399f109`            |
| WR8 | `acpAgent.ts:269,300` pool drain duplication        | SIGTERM + fechamento da IDE tinham blocos idênticos `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }`. Extraído helper `drainPoolBeforeExit(label)`                                                    | `72399f109`            |

#### Lote de auto-revisão do commit-6 (R1-R3 race crítico)

| #   | Site                                    | O que estava errado                                                                                                                                                                                             | Commit de incorporação |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`        | Race de liberação de slot: A termina spawn, B (fingerprint diferente, mesmo nome) inicia spawn, A drena. Close-cb verificava apenas `entries` (B ainda não registrado) → liberação prematura                      | `0e58a098f`            |
| 6R2 | `events.ts:mcpBudgetWarningCount` JSDoc | Eventos com escopo de workspace vão para N sessões → N incrementos do reducer; consumidores agregando entre sessões contam em dobro. Documentação atualizada para mencionar o multiplicador                       | `0e58a098f`            |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`      | Iterava `this.sessions.keys()` diretamente durante fan-out assíncrono; `killSession` concorrente poderia corromper o iterador. Snapshot via `Array.from(...)`                                                  | `0e58a098f`            |

#### Terceiro lote de revisão (commits 1-6, wenshao W1-W15)

| #   | Site                                                           | O que estava errado                                                                                                                                                                                                                          | Commit de incorporação |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| W1  | `mcp-transport-pool.ts:spawnEntry` catch                       | Falha no spawn vazava `statusChangeListener` permanentemente — apenas `forceShutdown` remove. Adicionado `entry.forceShutdown('manual')` no catch                                                                                            | `4a3c5cd90`            |
| W2  | `mcp-pool-entry.ts:statusChangeListener` cross-check           | Mapa `serverStatuses` no nível do módulo compartilhado entre entradas de múltiplos fingerprints. Erro de transporte de A escrevia DISCONNECTED, listener de B corrompia o `localStatus` de B. Adicionado check `client.getStatus()`          | `4a3c5cd90`            |
| W3  | `mcp-pool-entry.ts:doRestart` pid sweep                        | Restart pulava `listDescendantPids` + `sigtermPids` — todo restart de stdio com wrapper `npx`/`uvx` deixava o neto MCP real órfão. Adicionado sweep antes do disconnect                                                                       | `4a3c5cd90`            |
| W4  | `mcp-pool-entry.ts:doRestart` drain timer race                 | Drain timer podia disparar durante yield do restart → `forceShutdown` remove entry → `client.connect` spawna órfão. Adicionado `cancelDrainTimer` + `state→active` no topo do `doRestart`                                                  | `4a3c5cd90`            |
| W5  | `mcp-client-manager.ts:pooledConnections` dead handles         | Quando a transição da entrada era para `'failed'`, o gerenciador mantinha o `PooledConnection` morto para sempre. Inscrever-se nos eventos da entrada; despejar em `'failed'` (idempotente via guard `get(name) === conn`)                   | `4a3c5cd90`            |
| W6  | `mcp-client-manager.ts:discoverAllMcpToolsViaPool` re-entrancy | Duas passadas intercaladas podiam ambas `set(name, conn)` → primeira conexão vazava. Adicionado mutex `discoveryInFlight`; segundo chamador aguarda a mesma promise. Novo teste de regressão                                                | `4a3c5cd90`            |
| W9  | `acpAgent.ts:parsePoolDrainMs` strictness                      | `Number.parseInt` aceitava `'30000ms'` / `'30000abc'`. Regex estrito `^\d+$`; rejeitar com aviso em stderr + fallback padrão                                                                                                                | `4a3c5cd90`            |
| W10 | `mcp-transport-pool.ts:acquire` indexAttach order              | `indexAttach` modificava `sessionToEntries` ANTES de `entry.attach()`. Se `attach` lançasse, mapeamento reverso obsoleto. Movido `indexAttach` após `attach` bem-sucedido (ambos caminhos rápido + em andamento)                              | `4a3c5cd90`            |
| W13 | `mcp-transport-pool.ts:subprocessCount` JSDoc                  | Documentação ainda dizia `stdio + websocket` após WR4 restringir para stdio. Atualizada                                                                                                                                                      | `4a3c5cd90`            |
| W14 | `mcp-transport-pool.ts:createUnpooledConnection` catch         | Mesmo vazamento de `statusChangeListener` que o W1 no caminho sem pool. Mesmo espelho: `forceShutdown` antes do disconnect                                                                                                                  | `4a3c5cd90`            |
| W15 | `bridge.ts:restartMcpServer` response                          | Cast `as PoolEntries` não era seguro — JSON não tipado vindo do filho ACP. Check `Array.isArray` + validação de formato por entrada; entradas malformadas puladas com breadcrumb em stderr                                                    | `4a3c5cd90`            |
#### Recusado com resposta (registrado como acompanhamentos F2)

| #    | Site                                                | Motivo da recusa                                                                                                                                                             |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W7   | Lacunas de cobertura de teste (4 caminhos críticos não testados) | 1/4 adicionado (teste de regressão W6); restante adiado para PR focado em cobertura de teste após mesclagem da série F2                                                        |
| W8   | `maxReconnectAttempts` / `reconnectStrategy` não utilizados | Placeholders compatíveis com versões futuras para reconexão diferida orientada por monitor de saúde (projeto §6.6); remover + readicionar causa turbulência no tipo público                                          |
| W11  | Blocos de anexo duplicados de caminho rápido / em voo  | ✅ Feito no PR A: `attachPooledSession` + `rollbackReservationOnSpawnFailure` helpers privados (commit `2d546efca`)                                                                |
| W12  | `passesSessionFilter` O(M×N) por `applyTools`       | ✅ Feito no PR A: `applyTools` / `applyPrompts` pré-computam conjuntos `Set` de filtros uma vez por passada; predicado se torna O(1) por ferramenta (commit `a4a855ab3`)                                      |
| R9   | `McpClientManager` ctor com 7 sentinelas posicionais      | ✅ Feito no PR A: ctor com objeto de opções + fábrica de teste `mkManager` (commit `0cb1eaa27`)                                                                                             |
| R10  | Custo por PID por nível de `pgrep -P <pid>`             | ✅ Feito no PR A: snapshot único `ps -A -o pid=,ppid=` + percurso BFS em memória; BFS pgrep mantido como fallback para BusyBox <v1.28 / distroless (commit final da peça do PR A)                                     |

#### Contagem de bugs

- **3 lotes × 27 correções críticas / importantes** + 5 dobras de documento / sugestão = **32 dobras de revisão** no total
- **2 condições de corrida críticas capturadas apenas na segunda análise** (condição de corrida 6R1 de liberação de slot durante spawn; reentrância de descoberta W6)
- **0 falhas silenciosas enviadas** — cada correção carrega uma breadcrumb inline `// F2 (#4175 commit X revisão fix — wenshao YN):` apontando para a revisão original

### v2.1 (2026-05-20) — estratégia de PR único + 12 dobras de revisão

| #      | O que                                                                                                          | Por que                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| V21-1  | Mudou do plano de 6 sub-PRs para **PR único coeso de funcionalidade** com 6 commits atômicos                           | Conforme orientação do mantenedor (#4175 estratégia de ramificação); revisor pode ler commit por commit via `git log -p`         |
| V21-2  | Adicionado índice reverso `sessionToEntries: Map<sid, Set<ConnectionId>>` no pool (§6)                              | `releaseSession` O(N entradas) → O(refs da sessão); necessário para escala de 1000 sessões                               |
| V21-3  | Parâmetro de consulta `?fingerprint=` na rota de reinicialização (§13.1)                                                          | Operador pode querer reiniciar apenas uma entrada quando o mesmo nome tem múltiplas impressões digitais; custo quase zero adicionar agora |
| V21-4  | Caminho de falha de spawn libera explicitamente o slot reservado (§6.1, §6.5)                                             | Caso contrário, slot vaza até a próxima passagem do monitor de saúde; bug real sutil                                            |
| V21-5  | Novo §13.4: semântica de chamada de ferramenta em voo durante reconexão                                                     | `MCPCallInterruptedError`; o pool NÃO reproduz automaticamente (escrita insegura)                                            |
| V21-6  | Novo §10.4: `/mcp disable X` aciona reaplicação de `SessionMcpView`                                                | Caso contrário, desabilitar no meio da sessão não remove ferramentas já registradas                                             |
| V21-7  | Rota de status expõe `entryIndex` não impressão digital bruta (§8.3)                                                  | Evita exposição lateral de rotação de token OAuth via alteração de impressão digital                                     |
| V21-8  | Estratégia de backoff de reconexão especificada: stdio fixo 5s × 3, HTTP/SSE exponencial 1/2/4/8/16s × 5 (§6.6)                     | v2 não dizia; HTTP precisa de orçamento de repetição maior para oscilação de rede                                                  |
| V21-9  | `canonicalOAuth(o)` normaliza `{enabled: false}` ≡ `undefined` ≡ `null` (§5.1)                               | Caso contrário, configurações funcionalmente equivalentes produzem entradas distintas                                              |
| V21-10 | Renomeado helper fallback do pool de "aquisição legada em processo" para `createUnpooledConnection` (§5.3, §6.1)      | Bypass do MCP SDK é permanente, não legado                                                                         |
| V21-11 | `drainAll(opts?)` retorna `Promise<void>` com orçamento de tempo de parede `timeoutMs` (§17)                            | Chamador precisa saber quando o dreno termina para ordenação de desligamento                                                  |
| V21-12 | Nomes de campo do reducer SDK bloqueados (Q1 resolvido): manter `mcpBudgetWarningCount` etc. com semântica de escopo em JSDoc | Sem renomeação de API pública no meio do PR                                                                                     |
| V21-13 | Bloqueado Q3 (pool ligado por padrão, kill switch `--no-mcp-pool`), Q4 (HTTP/SSE opt-in), Q6 (construção eager)       | Entrega em PR único; sem necessidade de proteção por flag                                                                   |
| V21-14 | Adicionados riscos R9/R10/R11 de PR único (§23)                                                                        | Fadiga de revisão, conflito de mesclagem da main do daemon_mode_b, tempo de CI                                                      |
| V21-15 | Tratamento de entrada órfã por desinstalação de extensão adiado para expurgo natural de `MAX_IDLE_MS` (§16.3)                      | Sem `invalidateByExtension` explícito; mantém modelo uniforme
### v2 (2026-05-20) — revisão inicial incorporando ajustes do esboço v1

| #   | O quê                                                                                               | Por quê                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| C1  | O pool distribui **Tools + Prompts** (antes: apenas tools)                                          | O construtor de `McpClient` aceita ambos os registros; caso contrário, prompts são perdidos silenciosamente no modo pool |
| C2  | Nova seção sobre **coexistência de estado global** (`serverStatuses` / `mcpServerRequiresOAuth` maps de módulo) | Compartilhamento entre sessões já existe atualmente; o pool herda e formaliza                     |
| C3  | Caminho da fábrica `connectToMcpServer` **unificado** com a classe `McpClient` no F2-1             | v1 apenas refatorou a classe; deixaria um caminho paralelo sem pool                       |
| C4  | Replay de snapshot ao anexar (estilo earlyEvents) adicionado em `PoolEntry.attach()`                | Nova condição de corrida: sessão-B anexa → servidor emite `tools/list_changed` antes da assinatura ser estabelecida |
| C5  | `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` para deduplicação de aquisição concorrente  | v1 mencionado na matriz de testes, mas ausente no contrato de implementação               |
| C6  | Varredura de PID descendente entre plataformas (Linux/macOS pgrep, Windows wmic/PowerShell)       | v1 dizia "copiar `pgrep -P` do opencode" — isso é apenas Unix                              |
| C7  | Campo `trust` por sessão — **cópia** do objeto tool                                                | trust reside em `DiscoveredMCPTool`; instância compartilhada misturaria trust por sessão    |
| C8  | Transportes HTTP/SSE **opt-in** para pooling (padrão: apenas stdio + websocket)                    | Alguns servidores MCP HTTP mantêm estado de sessão por transporte; compartilhar arrisca vazamento de estado |
| C9  | Servidor MCP SDK (`isSdkMcpServerConfig`) bypass explícito                                         | `sendSdkMcpMessage` é por sessão por design                                               |
| C10 | Caminho OAuth explicitamente **adiado para F3**                                                     | Fluxo OAuth precisa de roteamento no estilo PermissionMediator; não escopo do F2            |
| C11 | Semântica da rota de restart especificada (name → todas as entradas correspondentes)               | `POST /workspace/mcp/:server/restart` do PR 17 anteriormente sem ambiguidade (1 entrada); agora 1..N |
| C12 | Seção de refatoração da rota de status (novo caminho: `QwenAgent.getMcpPoolAccounting()`)          | `httpAcpBridge.ts:733-770` atualmente lê o gerenciador da sessão bootstrap — deve ser alterado |
| C13 | Contador de geração em `PoolEntry` para proteção de handler obsoleto de `tools/list_changed`       | Padrão Opencode: `if (s.clients[name] !== client) return`                                 |
| C14 | Divisão de sub-PRs 4 → **6**                                                                       | v1 subestimou; A2/B1/B3/C6 adicionam trabalho real cada                                  |
| C15 | Construção lazy do pool (somente quando N≥2 sessões vistas) — opcional                             | `qwen serve --foreground` sessão única não se beneficia; economiza custo de inicialização   |

---

## 1. Objetivos / Não objetivos

**Objetivos**

- N sessões em 1 workspace compartilhando 1 processo por configuração de servidor única — chaveada por fingerprint
- Visualizações de `ToolRegistry` / `PromptRegistry` por sessão preservadas (filtragem, trust)
- Ciclo de vida refcount + grace-drain resiliente a reanexação
- Limpeza de PID descendente entre plataformas
- Guardrails de orçamento migram de por sessão para por workspace (PR 14 prometeu isso)
- Compatibilidade retroativa com qwen standalone não-daemon (pool não construído lá)

**Não objetivos (escopo F2)**

- Pooling entre workspaces (invariante de 1 daemon = 1 workspace do PR #4113 mantido)
- Pooling entre daemons (fora do escopo — território de orquestrador multiprocesso)
- Reformulação de roteamento OAuth (F3 com `PermissionMediator`)
- Persistência do pool entre reinicializações do daemon (apenas em memória)
- Detecção automática de servidores HTTP "pool-safe" (apenas flag opt-in)
- Diff ao vivo de `MCPServerConfig` para mutar entradas no lugar (mudança de config → nova entrada, antiga drena)

---

## 2. Estado atual (alvo de substituição)

```
acpAgent.newSession(sessionId)
  → newSessionConfig(cwd, mcpServers)                  // acpAgent.ts:1771
  → loadCliConfig → new Config → config.initialize()
  → ToolRegistry ctor → new McpClientManager(config, ...)   // tool-registry.ts:199
  → for (name, cfg) in config.getMcpServers():
      new McpClient(name, cfg, toolRegistry, promptRegistry, workspaceContext, ...)
      → client.connect() → client.discover(config)
```

**Mapa de acoplamento (o que deve ser quebrado ou encadeado):**
| Acoplamento                                                                         | Localização                                          | Ação no F2                                                                                  |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `McpClient` construtor vincula 1 ToolRegistry + 1 PromptRegistry                     | mcp-client.ts:106-119                                | Pool possui o transporte; `SessionMcpView` (por sessão) possui os registros por sessão      |
| `McpClient.discover()` chama `toolRegistry.registerTool()` inline                    | mcp-client.ts:178-198                                | Dividir: `discoverAndReturn()` retorna snapshot; a view registra                            |
| O manipulador `ListRootsRequestSchema` captura `workspaceContext.getDirectories()`   | mcp-client.ts:142-153 + connectToMcpServer.ts:893    | Contexto único do workspace vinculado ao Pool                                               |
| Listener `workspaceContext.onDirectoriesChanged` registrado por conexão              | mcp-client.ts:907                                    | Pool registra uma vez por entrada                                                           |
| `McpClientManager` instanciado dentro de ToolRegistry                                | tool-registry.ts:199                                 | Adicionar parâmetro opcional `pool?` no construtor; injeção via Config                      |
| Aplicação de orçamento por sessão                                                    | mcp-client-manager.ts:91-95 comment                  | Mover máquina de estado para o pool                                                         |
| `serverDiscoveryPromises` deduplica em andamento por servidor                        | mcp-client-manager.ts:350                            | Pool tem `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                             |
| Registro por sessão de `setMcpBudgetEventCallback`                                   | acpAgent.ts:1851-1899                                | Pool emite → `QwenAgent` transmite para todas as sessões                                    |

**Estado já compartilhado (pool herda, não introduz):**

| Estado                                          | Localização                         | Nota                                                                 |
| ----------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>`  | mcp-client.ts:292 (nível de módulo) | A nível de processo hoje; chave do pool ainda por nome → "qualquer CONECTADO-vence" |
| `mcpServerRequiresOAuth: Map<string, boolean>`  | mcp-client.ts:302 (nível de módulo) | Mesmo                                                                |
| `MCPOAuthTokenStorage` tokens em disco          | `~/.qwen/mcp-oauth/<name>.json`     | Compartilhado pelo daemon host; pool apenas explora mais eficientemente |

---

## 3. Referências de Descobertas

| Projeto         | Pool?              | Chave                                          | Ciclo de vida                                                                               | Padrões para copiar                                                                                                                  |
| --------------- | ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **claude-code** | Não, por processo  | `name + JSON.stringify(cfg)` (lodash.memoize)  | `clearServerCache` + backoff remoto×5; falha no stdio → `failed`                            | SHA-256 de chave ordenada `hashMcpConfig` para invalidação/chaveamento                                                              |
| **opencode**    | Sim, por workspace | apenas **nome** do servidor (sem hash de config)| Sem contagem de ref/remoção/reinício; finalizador de Effect + `pgrep -P` SIGTERM recursivo  | Varredura de PID descendente, proteção de manipulador obsoleto (`if (s.clients[name] !== client) return`), disseminação de `tools/list_changed` via barramento de eventos |

**O que o F2 herda de cada um:** hash de configuração do claude-code (lida com divergência de env/auth por sessão que o opencode não lida), varredura de PID descendente do opencode (wrappers npx/uvx vazam). O que adicionamos: contagem de referência + dreno (daemon multi-cliente), reinicialização automática (daemon de longa duração), disseminação de prompt, proteção de geração.

---

## 4. Arquitetura

### 4.1 Layout de processo

```
HTTP daemon (packages/cli/src/serve, qwen serve)
  │ cria
  ▼
ACP child (qwen --acp, single process per workspace)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── novo, escopo de workspace, 1 instância
  │     ├── entries: Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (vinculado ao workspace do daemon)
  │     └── guardrails de orçamento (máquina de estado PR 14, promovida para workspace)
  │
  └── sessions: Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ pool injetado   │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   legado em processo
                                  → SessionMcpView            (standalone qwen)
                                    .applyTools/Prompts
                                    (filtrar e registrar nos
                                     registros próprios da sessão)
```
**O pool reside no filho do ACP**, não no daemon HTTP. O daemon HTTP consulta o estado do pool através da superfície extMethod `bridge.client` existente (`getMcpPoolAccounting`, `restartMcpServer`). O código F2 reside em **`packages/core/src/tools/`** (par de `mcp-client-manager.ts`), não em `packages/acp-bridge/`.

### 4.2 Diagrama de classes

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (liberação em massa para desmontagem de sessão)
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
  ├─ generation: number   (++ na reconexão; guarda de eventos obsoletos)
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

### 5.1 Campos canônicos hash

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
 * colapsem na mesma fingerprint. `{enabled: false}`, `undefined`,
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

// Campos excluídos (filtros por sessão, NÃO de nível de transporte):
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 Portão da classe de transporte

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**Padrão `pooledTransports = {stdio, websocket}`**. Operadores optam pelo HTTP/SSE via:

- CLI: `--mcp-pool-transports=stdio,websocket,http,sse`
- Env: `QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**Por que excluir HTTP/SSE por padrão**: algumas implementações de servidores MCP HTTP vinculam estado (contexto de autenticação, memória de conversa) ao stream TCP/SSE; múltiplas sessões ACP compartilhando-o causariam vazamento de estado. stdio + websocket são processos de SO reais cujo estado é observável e isolável.

### 5.3 Bypass do SDK MCP

`isSdkMcpServerConfig(cfg)` true → o pool retorna um wrapper fino `PooledConnection` via `createUnpooledConnection(name, cfg, sid)` que constrói um `McpClient` imediatamente, sem compartilhamento, sem entrada armazenada no pool. Motivo: `sendSdkMcpMessage` é por sessão por design (roteia através do plano de controle do ACP de volta para a sessão de origem). Mesmo caminho usado para HTTP/SSE quando o transporte não está em `pooledTransports` (§10.3).

V21-10: o nome é `createUnpooledConnection`, não `legacyInProcessAcquire` — SDK MCP e HTTP-opt-out são escolhas permanentes de design, não código legado.

---

## 6. Ciclo de vida

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
          // V21-4: libera o slot reservado em caso de falha na criação. Sem
          // isso, o slot vaza até que o caminho de liberação do monitor de saúde
          // execute (o que não acontece, pois não há entrada para monitorar).
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

  /** V21-2: O(refs desta sessão), não O(todas as entradas). */
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
### 6.2 Deduplicação de aquisição concorrente (`spawnInFlight`)

Espelha `McpClientManager.serverDiscoveryPromises` (mcp-client-manager.ts:350). Sem isso, 5 sessões sendo geradas na inicialização todas veem `entries.has(id) === false` e competem para gerar 5 processos filhos.

### 6.3 Grace de drenagem + limite de inatividade

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // grace após o último release
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // limite rígido (defesa contra loop de cancelamento de drenagem)
```

Máquina de estados em `PoolEntry`:

```
gerando ──spawn bem-sucedido──► ativo ──último detach──► drenando ──timeout──► fechado
   │                     │                       │
   │                     │                       └──attach──► ativo (cancelar timer)
   spawn falhou──────────►falhou
                          │
                          └──reinício manual──► gerando
```

Limite rígido de inatividade: o timer de drenagem pode ser cancelado+reiniciado indefinidamente (flap de acquire/release). `MAX_IDLE_MS` é um timer separado iniciado **na primeira inatividade** e nunca reiniciado; quando dispara, força o fechamento mesmo se a drenagem estiver atualmente na grace ativa. Impede entradas zumbis no pool causadas por clientes problemáticos que ficam alternando acquire/release.

### 6.4 Varredura de PID descendente multiplataforma

**Atualização R10 / R23 T7 / PR A (2026-05-22)**: mudou de BFS por PID (um `pgrep -P <pid>` / subprocesso `Get-CimInstance -Filter` por nó) para um único snapshot da tabela de processos seguido de caminhada em memória na árvore. Duas motivações: (1) um fork em vez de B^D forks no caminho crítico de shutdown do pool; (2) consistência do snapshot — o BFS anterior podia perder descendentes que forkaram entre níveis adjacentes do BFS. O caminho por PID foi mantido como fallback para BusyBox `ps` <v1.28 (sem suporte a `-o`) e containers distroless sem `ps`.

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // O SO recolhe órfãos; o shutdown do pool prossegue mesmo assim.
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* cai para o fallback */
  }
  if (tree) return walkDescendants(tree, root); // O(descendentes), 1 fork
  return await listDescendantPidsUnixPgrepFallback(root); // BFS legado
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A: todos os processos (POSIX, equivalente a -e mas sem ambiguidade no BSD).
  // -o pid=,ppid=: colunas pid + ppid, o `=` no final suprime cabeçalhos.
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

// Windows: snapshot único de Get-CimInstance Win32_Process | ConvertTo-Csv
// de todas as linhas (ProcessId, ParentProcessId) + caminhada em memória;
// `Get-CimInstance -Filter "ParentProcessId=$p"` por PID mantido como fallback.
```

Chamado a partir de `PoolEntry.shutdown()` antes de `client.disconnect()`. Lida com vazamentos de wrappers como `npx @modelcontextprotocol/server-X`, `uvx ...`, `pnpm dlx ...`. Limites de MAX_DESCENDANTS=256 / MAX_DEPTH=8 preservados.

### 6.5 Tratamento de falhas de spawn

Se `spawnEntry` rejeitar após múltiplos assinantes terem se conectado (via `spawnInFlight`):

- Todos os awaiters recebem a rejeição
- `tryReserveSlot` é liberado **através de um braço explícito `.catch` em `acquire`** (V21-4); sem essa correção, o slot vazava até a próxima passagem do monitor de saúde, que nunca era executada porque não existia entrada a ser monitorada.
- A entrada com falha NÃO é armazenada em `entries`
- Os caminhos de código dos assinantes tratam como se `acquire` tivesse falhado originalmente (a lógica existente de `discoverMcpToolsForServer` por sessão permanece válida)

### 6.6 Backoff de reconexão (V21-8)

Quando uma `PoolEntry` entra em reconexão após queda do transporte:

| Família de transporte | Estratégia                                     | Limite                                                                          |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| stdio                 | Fixo 5s × 3 tentativas                         | Conforme `DEFAULT_HEALTH_CONFIG.reconnectDelayMs` existente                      |
| websocket             | Fixo 5s × 3 tentativas                         | Mesmo que stdio                                                                 |
| http (opt-in)         | Exponencial 1s, 2s, 4s, 8s, 16s × 5 tentativas | Endpoints remotos oscilam em problemas de rede transitórios; orçamento maior    |
| sse (opt-in)          | Exponencial 1s, 2s, 4s, 8s, 16s × 5 tentativas | Mesmo que http                                                                  |
Após exaustão do limite: a entrada transita para o estado `failed`; os assinantes recebem o evento `failed`; uma nova `acquire` para o mesmo `ConnectionId` tenta spawn uma vez e depois lança exceção. A reinicialização do operador (§13) redefine o estado.

---

## 7. Descoberta / SessionMcpView

### 7.1 Fan-out duplo de Tools + Prompts

```ts
// packages/core/src/tools/mcp-client.ts — split discover into pure
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

// Legacy discover() retained, delegates to discoverAndReturn + registers (for standalone qwen)
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
      // C7: per-session copy of trust (don't mutate shared snapshot)
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

### 7.2 Replay de snapshot ao anexar (estilo earlyEvents)

```ts
class PoolEntry {
  attach(sid: string): PooledConnection {
    this.refs.add(sid);
    this.cancelDrainTimer();
    const view = new SessionMcpView(...);
    this.subscribers.set(sid, view);
    // Immediately replay current snapshot so subscriber doesn't miss
    // updates that landed between in-flight discover completion and
    // attach.
    if (this.state === 'active') {
      view.applyTools(this.toolsSnapshot);
      view.applyPrompts(this.promptsSnapshot);
    }
    return this.makeHandle(sid, view);
  }
}
```

Espelha o padrão `BridgeClient.earlyEvents` da correção PR 14b #1 — resolve race análogo para anexação ao pool.

### 7.3 Proteção de handlers obsoletos (contador de geração)

```ts
class PoolEntry {
  private generation = 0;

  private async reconnect(): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    await this.client.disconnect();
    await this.client.connect();
    if (myGen !== this.generation) return; // superseded by another reconnect
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
      .catch(/* swallow + log */);
  };
}
```

Sem isso, um handler obsoleto de uma instância de Client anterior à reconexão poderia sobrescrever o snapshot pós-reconexão com dados desatualizados.

**Invariante de monotonicidade** (esclarecimento V21): `generation` apenas incrementa, nunca é redefinido. Qualquer operação em andamento captura `myGen` na entrada e, após `await`, verifica `myGen === this.generation`. Equivalente a "nenhum evento superveniente ocorreu desde que comecei". Limitado por Number.MAX_SAFE_INTEGER (~285 mil anos a 1Hz de reconexão), sem preocupação de overflow.

### 7.4 Unificação de caminhos (expansão de escopo F2-1)

`packages/core/src/tools/mcp-client.ts` possui DOIS caminhos de conexão ao servidor:

1. Classe `McpClient` (mcp-client.ts:100) — usada por `McpClientManager`
2. Função factory `connectToMcpServer` (mcp-client.ts:875) — usada por `discoverMcpTools` (linha 560) e `connectAndDiscover` (linha 607)

F2-1 deve convergir ambos para trás de `McpClient.discoverAndReturn` (com `connectToMcpServer` se tornando um helper privado de `McpClient` ou ambos chamando uma primitiva compartilhada `establishConnection()`). Caso contrário, o pool cobre apenas o caminho da classe; o caminho da factory permanece por sessão e enfraquece todo o esforço.

---

## 8. Coexistência de Estado Global

### 8.1 `serverStatuses` (mcp-client.ts:292) — escrita tolerante a colisões

Mapa no nível do módulo `Map<serverName, MCPServerStatus>`. O `ConnectionId` do pool é `name::hash`, mas `updateMCPServerStatus(name, status)` escreve por nome. **Múltiplas entradas do pool para o mesmo nome (impressões digitais diferentes, por exemplo, divergência de token) sobrescreveriam o status umas das outras.
**Resolução**: o pool intercepta escritas de status:

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
    // Qualquer CONNECTED ⇒ CONNECTED
    // Caso contrário, qualquer CONNECTING ⇒ CONNECTING
    // Caso contrário, DISCONNECTED
    const entries = [...this.entries.values()].filter(
      (e) => e.serverName === name,
    );
    if (entries.some((e) => e.localStatus === CONNECTED)) return CONNECTED;
    if (entries.some((e) => e.localStatus === CONNECTING)) return CONNECTING;
    return DISCONNECTED;
  }
}
```

A rota de status expõe `entryCount: number` para que operadores vejam quando nome → múltiplas entradas.

### 8.2 Armazenamento de token OAuth

`MCPOAuthTokenStorage` escreve em `~/.qwen/mcp-oauth/<serverName>.json` — já compartilhado pelo daemon-host. O pool se beneficia incidentalmente (o OAuth da primeira sessão completa → token no disco → a reconexão da entrada do pool pega o token → todas as outras sessões pegam carona).

**Ressalva — caso de múltiplas fingerprints**: 2 entradas para o mesmo nome (cabeçalhos/env diferentes) mas mesmo provedor OAuth → ambas leem o mesmo arquivo de token. Se os tokens têm escopo de servidor (típico OAuth), isso funciona. Se os tokens têm escopo de ambiente (raro), é necessária extensão explícita da chave de armazenamento. **Adiar para F3** com uma limitação conhecida documentada.

### 8.3 `entryCount` no snapshot

`GET /workspace/mcp` por servidor adiciona:

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // NOVO — N entradas do pool para este nome
  entrySummary?: [                        // NOVO — detalhamento opaco por entrada
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7**: `entrySummary[].entryIndex` é um **inteiro opaco estável** atribuído na criação da entrada (ordem de inserção dentro do grupo de nomes), NÃO a fingerprint bruta. Motivo: a fingerprint muda quando tokens OAuth ou variáveis de ambiente rodam, o que vazaria essa informação através de diffs do snapshot (operador poderia inferir "token rodado em T+5min" a partir da transição `'a3b1' → 'f972'`). `entryIndex` é monotônico dentro do grupo de nomes, mas permanece estável entre rotações porque a entrada antiga é drenada e a nova entrada recebe o próximo índice.

Clientes SDK antigos ignoram campos desconhecidos conforme contrato PR 14; novos clientes usam `entryCount` para badges. O caminho interno de reinício por fingerprint usa um token opaco retornado apenas via extMethod privilegiado, não exposto no snapshot HTTP.

---

## 9. WorkspaceContext / ListRoots

### 9.1 Registro único

As instâncias de `McpClient` do pool compartilham **um** `WorkspaceContext` — o contexto de workspace vinculado do daemon (invariante PR #4113). O manipulador de `ListRootsRequestSchema` do `connectToMcpServer` captura este único contexto.

O listener `onDirectoriesChanged` é registrado **uma vez por entrada**, não uma vez por `acquire`. Desanexado no desligamento da entrada.

### 9.2 Propagação de `roots/list_changed`

Servidor notifica o cliente de novas raízes → pool propaga:

- Pool redescobre (servidor pode reportar conjunto de ferramentas diferente sob novas raízes) → evento `toolsChanged` → todas as visualizações de assinantes reaplicam

### 9.3 `updateWorkspaceDirectories` por sessão

**Contrato**: no Modo B, adições de diretório por sessão são uma dica suave, não autoritativa. O `WorkspaceContext` do pool é a nível de daemon.

Duas opções de implementação:

- **v1 simples**: ignorar adições por sessão, registrar aviso quando detectado
- **v2 união**: pool mantém `extraRoots: Map<sessionId, Set<dir>>`, o manipulador ListRoots retorna a união do workspace vinculado + todos os extras. Remoção por sessão dispara `roots/list_changed`. Adiciona 50-80 LOC de complexidade.

**Escolher v1 simples para F2**; v2 união como acompanhamento se surgir dor do usuário.

---

## 10. Injeção por sessão

### 10.1 `mcpServers` de `newSession({mcpServers})`

`newSessionConfig(cwd, mcpServers, ...)` mescla a lista injetada com `settings.merged.mcpServers` (acpAgent.ts:1778-1831). O pool consome a **visão mesclada por sessão**:

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...existing setMcpBudgetEventCallback REMOVED — pool trata broadcast diretamente
}
```

Quando duas sessões injetam um servidor de mesmo nome com env/cabeçalhos diferentes → fingerprints diferentes → duas entradas no pool. O compartilhamento do pool só ocorre quando as sessões concordam exatamente.

### 10.2 Divergência de autenticação

`mcpServers` estáticos em `~/.qwen/settings.json` são idênticos entre sessões → todos compartilham → 80% dos casos. `mcpServers` injetados por sessão com tokens por usuário → fingerprints únicas → sem compartilhamento. Ambos seguros.

### 10.3 Opt-in por transporte HTTP (recapitulação da §5.2)

Padrão `pooledTransports = {stdio, websocket}`. Servidores HTTP/SSE passam pelo caminho `createUnpooledConnection` (um McpClient por sessão) a menos que o operador opte por participar.

### 10.4 `/mcp disable X` no meio da sessão (V21-6)

Quando o operador executa `/mcp disable github` em uma sessão ativa:
1. `Config.disableMcpServer('github')` adiciona ao conjunto `disabledMcpServers` por Config
2. **Hook F2**: `Config.onDisabledMcpServersChanged` é disparado; `SessionMcpView` para aquele nome chama `teardown()` (remove seus registros de ferramentas/prompts dos registros da sessão)
3. A entrada do pool **pode permanecer ativa** se outras sessões ainda a referenciarem (refcount > 0) — apenas a visão da sessão que desabilitou se desanexa
4. Se todas as sessões desabilitarem → refcount → 0 → o timer de drenagem inicia

Sem o passo 2, desabilitar no meio da sessão deixaria ferramentas já registradas no `ToolRegistry` da sessão até a próxima reinicialização da sessão. O teste 21.4 cobre isso.

`/mcp enable github` é o inverso: dispara um novo `pool.acquire` para a sessão, anexa uma nova visão, reaplica o snapshot.

---

## 11. Budget Guardrails Graduation

### 11.1 State machine moves to pool

`tryReserveSlot` / `releaseSlotName` / histerese de 75% / coalescência de refused_batch / `bulkPassDepth` / `pendingRefusalNames` — tudo migra de `McpClientManager` para `McpTransportPool`. `McpClientManager` retém o estado apenas quando executado de forma independente (sem pool injetado).

### 11.2 Snapshot cell scope

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

Conforme contrato do PR 14: "Os consumidores DEVEM tolerar entradas adicionais com valores de escopo não reconhecidos (ignorar, não falhar)." Clientes antigos do SDK veem `scope: 'workspace'`, renderizam como desconhecido (ou fallback para números de nível superior). O novo SDK adiciona o helper `isWorkspaceScopedBudget(cell)`.

### 11.3 Event fan-out

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
          debugLogger.debug('budget event delivery failed', { sid, err }),
        );
    }
  }
}
```

### 11.4 SDK type contract changes

O PR 14b exportou estes (devem ser estendidos aditivamente):

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
- Documentar que, sob F2, essas contagens refletem eventos em nível de workspace distribuídos para cada sessão — eles incrementarão **simultaneamente em todas as sessões anexadas** quando ocorrer pressão de orçamento

**V21-12 (Q1 resolvido, bloqueado na v2.1)**: manter os nomes de campo existentes (`mcpBudgetWarningCount`, `mcpChildRefusedBatchCount`, `lastMcpBudgetWarning`, `lastMcpChildRefusedBatch`) com semântica de escopo estendida documentada no JSDoc:

```ts
/**
 * Count of `mcp_budget_warning` events the session has observed.
 * Under F2 (`scope: 'workspace'`), this increments simultaneously
 * across all attached sessions because budget events fan out at
 * workspace level. Use `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)`
 * to inspect scope of the most recent event.
 */
mcpBudgetWarningCount: number;
```

Justificativa: o PR 14b já enviou esses nomes como superfície pública do SDK; renomear é uma mudança disruptiva pior do que a semântica ligeiramente imprecisa.

---

## 12. OAuth — Explicit F3 Deferral

O fallback OAuth 401 em `connectToMcpServer` (mcp-client.ts:950-1010) precisa de resolução interativa (abrir navegador ou fluxo de dispositivo). O daemon Modo B **não deve abrir um navegador** (conforme design do PR 21 — o teste de grep em código-fonte estático falha na build se houver `open`/`xdg-open`/`shell.openExternal`).

**Comportamento F2 em servidor que requer OAuth**:

1. Primeira aquisição dispara `connectToMcpServer` → 401 detectado
2. O pool captura a exceção de OAuth necessário, marca a entrada como `failed_auth_required`
3. A rota de status exibe `errorKind: 'auth_env_error'` (errorKind existente do PR 13)
4. O pool **não tenta novamente automaticamente**
5. O operador executa `/mcp auth <name>` (CLI existente) OU usa a rota de fluxo de dispositivo do PR 21 para obter um token em disco → a próxima aquisição da sessão tenta novamente e é bem-sucedida

**F3 substituirá os passos 4-5** com o `PermissionMediator` roteando a solicitação de conclusão OAuth para as sessões anexadas que responderem primeiro.

Isso evita que F2 se misture ao trabalho da máquina de estados de autenticação.

---

## 13. Restart Route Semantics

### 13.1 `POST /workspace/mcp/:server/restart` under pool

Hoje (PR 17): reiniciar no gerenciador da sessão bootstrap = reiniciar a única entrada para aquele nome.

Sob pool: nome → possivelmente múltiplas entradas (fingerprints diferentes para o mesmo nome = sessões diferentes com configurações diferentes).
**Comportamento especificado**:

| Requisição                                            | Comportamento                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /workspace/mcp/:server/restart`                | Reiniciar **todas** as entradas que correspondem a `serverName` (paralelamente via `Promise.allSettled`) |
| `POST /workspace/mcp/:server/restart?entryIndex=0`   | V21-3: reiniciar apenas a entrada #0 (o índice opaco do snapshot §8.3); 404 se não encontrada       |
| `POST /workspace/mcp/:server/restart?entryIndex=*`   | "Todas" explícito (mesmo que sem parâmetro)                                                         |

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

O formato antigo `{restarted: true, durationMs}` é mantido quando `entries.length === 1` E não há parâmetro de consulta `entryIndex` para compatibilidade reversa; clientes podem detectar o novo formato verificando `'entries' in response`.

### 13.2 Desduplicação de reinicialização em andamento

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

### 13.3 Verificação de orçamento (preserva o comportamento do PR 17)

Antes da reinicialização, o pool verifica o orçamento: se a desconexão+reconexão ainda couber, está OK. A semântica atual do PR 17 `{restarted:false, skipped:true, reason:'budget_would_exceed'}` é preservada (agora aplicada por entrada).

### 13.4 Chamada de ferramenta em andamento durante reconexão (V21-5, novo)

A sessão A invoca `pool.callTool('git.commit', args)` → a requisição atinge o stdin do processo filho → o processo filho trava no meio da escrita → a entrada transita para reconexão:

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // geração pré-reconexão
  readonly args: unknown;              // argumentos originais, para quem chamou tentar novamente se seguro
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**Especificação**:

- A promessa da chamada em andamento rejeita com `MCPCallInterruptedError` assim que a queda do transporte é detectada (não esperar pela reconexão)
- O pool **NÃO faz nova tentativa automática** da chamada; semântica insegura para escritas (commit, edição de arquivo, etc.) e o pool não consegue distinguir leitura de escrita
- Quem chamou (normalmente a camada de execução de ferramentas no loop do agente) captura esse erro e decide: tentar novamente / exibir ao usuário / abortar
- Após reconexão: a sessão A pode chamar novamente (mesmo `PooledConnection.callTool`); o pool roteia para a nova instância de transporte de forma transparente
- `MCPCallInterruptedError.clientGeneration` permite que quem chamou correlacione com evento `reconnected` subsequente, se necessário

O teste 21.6 deve cobrir: iniciar um MCP stdio de longa duração, enviar uma chamada de ferramenta, matar o processo filho no meio da chamada, afirmar rejeição `MCPCallInterruptedError` com `clientGeneration` diferente de zero.

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
  // Fallback para caminho legado de sessão bootstrap para daemon sem pool
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

As bridges ACP filhas passam por `extMethod` para o daemon chamar.

### 14.2 entryCount + entrySummary

Conforme §8.3.

### 14.3 Caso sem sessão bootstrap

Hoje (PR 12), quando o daemon está ocioso (sem sessões ainda), `GET /workspace/mcp` retorna `initialized: false` porque não há sessão bootstrap para consultar.

Com o pool: o pool existe a partir do construtor do `QwenAgent` → a rota de status pode retornar contabilidade ativa **mesmo com zero sessões**. Célula `initialized: true` mesmo antes da primeira sessão. **Mudança de comportamento documentada** na descrição do PR; não é regressão.

---

## 15. Interação loadSession / resume (PR 6 #4222)

### 15.1 Cancelamento de dreno ao retomar

```
session-A ativa, contém referência entry-X
session-A desconecta (sem fechamento explícito) → eventualmente killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → timer de dreno inicia (30s)
session-A retoma dentro de 30s → novo newSessionConfig → pool.acquire retorna entry-X → attach cancela o dreno
session-A retoma após 30s → entry-X já fechada → pool cria nova entrada (início a frio)
```

### 15.2 Janela de cache `restoreState` (5min, do PR 6)
`acpAgent.restoreState` é mantido por 5 min após desconexão. Dreno do pool (30s padrão) < janela de restauração (5min) → retomar entre 30s e 5min paga o *cold start* do MCP. Compensação aceitável (o próprio retorno é um caminho raro).

Alternativa: o pool lê a configuração de janela de restauração do daemon e estende o dreno para corresponder. Adiciona acoplamento entre o pool e a máquina de estado da sessão; **adiar para acompanhamento, a menos que o usuário relate dor de *cold start***.

### 15.3 Interação de `pendingRestoreIds`

`acpAgent.killSession()` deve chamar `pool.releaseSession(sid)` APÓS limpar `pendingRestoreIds`. Ordem:

1. Sessão marcada como restaurável (`pendingRestoreIds.add(sid)`)
2. `Session.close()` — mas a referência do pool ainda é mantida
3. Após `RESTORE_WINDOW_MS` transcorrer sem retomada: `killSession` limpa permanentemente → `pool.releaseSession(sid)` aciona dreno

Evita que o dreno dispare durante uma janela de restauração.

---

## 16. Recarga a Quente de Configuração

### 16.1 Recarga implícita via mudança de *fingerprint*

Usuário edita `~/.qwen/settings.json` em pleno voo, altera o *env* de um servidor:

1. Sessões antigas mantêm snapshot antigo de `Config`/`McpServers` → continuam adquirindo *fingerprint* antigo → referência `entry-OLD` persiste
2. Nova sessão lê configurações atualizadas → novo *fingerprint* → `entry-NEW` criada → coexiste com `entry-OLD`
3. Sessões antigas fecham naturalmente → `entry-OLD` drena → eventualmente fechada
4. Estado estável: apenas `entry-NEW` permanece

**Nenhuma mutação ao vivo de conexões em execução** — separação clara entre sessões em diferentes versões de configuração.

### 16.2 Rota de recarga forçada (opcional)

```
POST /workspace/mcp/reload-all
  → for each session: re-load settings, swap Config.mcpServers
  → for each entry no longer referenced: schedule eviction
```

Útil para "Alterei variáveis de ambiente e quero efeito imediato em todas as sessões." Adiar para acompanhamento F2 (não bloqueante).

### 16.3 Entradas órfãs de desinstalação de extensão (V21-15)

Cenário: extensão `foo-ext` registra servidor MCP `foo-server`. Operador executa `/extension uninstall foo-ext`. O ciclo de vida da extensão remove `foo-server` de `extensionMcpServers` para que futuras chamadas `loadCliConfig` não o incluam. Mas:

- Sessões ativas mantêm snapshots de `Config` que ainda incluem `foo-server` → essas sessões continuam usando a entrada
- Novas sessões após a desinstalação não adquirem (servidor não está mais em seus `mcpServers` mesclados) → nenhum aumento de *refcount*

**Resolução**: confiar no dreno natural. Conforme sessões antigas fecham, *refcount* diminui; eventualmente a entrada atinge `MAX_IDLE_MS = 5min` e é forçada a fechar. **Nenhuma API explícita `pool.invalidateByExtension(name)`** — mantém o modelo uniforme com recarga a quente de configuração (§16.1).

Compensação: o servidor da extensão pode executar até 5min após a desinstalação se uma sessão longa o mantiver ativo. Aceitável; operadores podem `/mcp restart foo-server` e depois encerrar a sessão se houver urgência.

---

## 17. Ordenação de Desligamento

Sequência `QwenAgent.close()` (deve ser aplicada):

```
1. Set acceptingNewSessions = false; reject new POST /session
2. For each in-flight prompt: signal cancel, await completion (existing PR 11 lifecycle)
3. For each session: trigger close → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← bypasses 30s grace
   ├── For each entry: cancel drain + health timers, mark draining
   ├── For each entry in parallel: listDescendantPids → SIGTERM children
   ├── For each entry in parallel: client.disconnect()
   └── Promise.race against timeoutMs; abandoned entries get SIGKILL
5. Bridge channel close
6. Process exit
```

**V21-11**: Assinatura `drainAll`:

```ts
async drainAll(opts?: {
  force?: boolean;       // default false; true bypasses 30s grace timer
  timeoutMs?: number;    // default 10_000; wall-clock budget; SIGKILL stragglers after
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // entries that disconnected cleanly
  forced: number;        // entries SIGKILLed after timeout
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

O chamador usa `DrainResult` para registro de desligamento; se `forced > 0`, registrar um aviso para que o operador saiba que um servidor não foi desligado de forma limpa.

---

## 18. Estrutura de Arquivos

**Novos arquivos:**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool main (~700 LOC)
  mcp-pool-key.ts              # fingerprint + canonicalize helpers (~150 LOC)
  mcp-pool-entry.ts            # PoolEntry: refcount + drain + health + generation (~500 LOC)
  session-mcp-view.ts          # SessionMcpView: filter + register tools/prompts (~200 LOC)
  mcp-pool-events.ts           # PoolEvent discriminated union (~80 LOC)
  pid-descendants.ts           # listDescendantPids cross-platform (~150 LOC, incl. tests)

packages/core/src/tools/
  mcp-transport-pool.test.ts   # ~900 LOC
  mcp-pool-entry.test.ts       # ~400 LOC
  session-mcp-view.test.ts     # ~250 LOC
  mcp-pool-key.test.ts         # ~150 LOC
  pid-descendants.test.ts      # ~200 LOC (Unix + Windows skip-gated)
```

**Arquivos alterados:**

```
packages/core/src/tools/mcp-client.ts            # discoverAndReturn() split; connectToMcpServer unified
packages/core/src/tools/mcp-client-manager.ts    # optional pool param; budget state conditional
packages/core/src/tools/tool-registry.ts         # threads pool from config into McpClientManager
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # QwenAgent.mcpPool construction; broadcastBudgetEvent;
                                                 # newSessionConfig wires pool into Config;
                                                 # killSession calls pool.releaseSession
packages/cli/src/serve/run-qwen-serve.ts           # pass --mcp-pool-transports + budget env to ACP child
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus reads pool;
                                                 # restartMcpServer extMethod returns RestartResult[]
packages/cli/src/serve/capabilities.ts           # advertise mcp_workspace_pool
packages/sdk/src/daemon/mcpEvents.ts             # scope?: optional field; isWorkspaceScopedBudgetEvent helper
```
---

## 19. Entrega em um único PR — Detalhamento de Commits (V21-1)

De acordo com a orientação do mantenedor sobre lotes coesos de funcionalidades (#4175 estratégia de branching 2026-05-19), o F2 é enviado como **um PR com 6 commits atômicos**. O revisor pode percorrer com `git log -p HEAD~6..HEAD` e revisar commit por commit.

| Commit # | Título                                                                                           | Escopo                                                                                                                                                                                                                                                                                                                                                                                                                          | Arquivos afetados                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1        | `refactor(core): split McpClient.discover into pure tool/prompt list and unify connect paths`    | Adiciona `discoverAndReturn()`; extrai `establishConnection()` compartilhada usada por `McpClient.connect()` e pela fábrica `connectToMcpServer()`; o `discover()` legado vira um wrapper fino que registra (preserva o comportamento qwen autônomo). Nenhuma mudança observável no comportamento.                                                                                                                              | `mcp-client.ts`, `mcp-client.test.ts`                                                                                      |
| 2        | `feat(core): McpTransportPool + SessionMcpView`                                                  | Núcleo do pool: `fingerprint`, contagem de referências, desduplicação `spawnInFlight`, índice reverso `sessionToEntries`, máquina de estados de dreno, repetição de snapshot na anexação, guarda de geração, fan-out duplo de ferramentas+prompts, cópia de confiança por sessão. Mock do McpClient para testes unitários. Nenhuma ligação com produção.                                                                         | novos `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + testes |
| 3        | `feat(core): cross-platform descendant pid sweep + pool health monitor`                          | `listDescendantPids` (Unix `pgrep -P` recursivo, Windows PowerShell CIM); monitor de saúde unificado dentro de `PoolEntry` (verificação por intervalo + contagem de falhas + backoff de reconexão conforme §6.6); testes de integração com spawn de subprocesso protegidos por `QWEN_INTEGRATION === '1'`.                                                                                                                       | novos `pid-descendants.ts` + testes; `mcp-pool-entry.ts`                                                                   |
| 4        | `feat(serve): wire McpTransportPool into QwenAgent daemon mode`                                  | `Config.setMcpTransportPool` + `getMcpTransportPool`; `ToolRegistry` encadeia pool no `McpClientManager`; `McpClientManager` parâmetro opcional `pool?` no construtor; `acpAgent.QwenAgent` constrói pool na inicialização; injeção `newSessionConfig`; `killSession` chama `pool.releaseSession`; bypass MCP SDK + HTTP/SSE via `createUnpooledConnection`; flags de CLI `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`. | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                                 |
| 5        | `feat(serve): pool-aware status + restart routes`                                                | `QwenAgent.getMcpPoolAccounting` método de extensão; `httpAcpBridge.buildWorkspaceMcpStatus` priorizando pool + fallback na sessão de bootstrap; `restartMcpServer` aceita `?entryIndex=` e retorna `RestartResult[]`; `entryCount` + `entrySummary[].entryIndex` na célula; tags de capacidade `mcp_workspace_pool` + `mcp_pool_restart`.                                                                                       | `httpAcpBridge.ts`, `capabilities.ts`, tipos do SDK                                                                        |
| 6        | `feat(serve): graduate MCP budget guardrails to workspace scope`                                 | Move `tryReserveSlot`/`releaseSlotName`/máquina de estados de histerese do `McpClientManager` para o pool; remove a fiação `setMcpBudgetEventCallback` por sessão em `acpAgent.newSessionConfig`; fan-out `QwenAgent.broadcastBudgetEvent`; célula de snapshot com `scope: 'workspace'`; campo aditivo `scope?` no SDK; helper `isWorkspaceScopedBudgetEvent`; atualizações na documentação inline.                              | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                   |
**Estimativa total de LOC**: ~4100 produção + ~1900 testes = ~6000 LOC (estimativa v2 ~3850; crescimento absorve correções V21).

**Alvo do merge**: PR único em `daemon_mode_b_main`. Merge em lote periódico para `main` conforme estratégia #4175.

**Processo de auto-revisão antes de abrir o PR**:

1. Após cada commit, execute o agente `code-reviewer` no diff do commit; incorpore os achados adotados no mesmo commit.
2. Para os commits 2/4/6 (maior risco de design), execute adicionalmente `silent-failure-hunter` + `type-design-analyzer`.
3. Depois que todos os 6 commits forem integrados: 3 passes completos de revisão por diferentes combinações de agentes no diff completo do PR.
4. Execute a suíte de testes completa + typecheck + lint em todos os pacotes afetados.

Espelhe o padrão de pré-revisão especializada do PR 21.

---

## 20. Tags de Capacidade + Mudanças no Contrato do SDK

### 20.1 Novas tags de capacidade (anunciadas atomicamente no v0.16, V21-1)

Como o F2 chega como um único PR, as três tags são anunciadas juntas. Consumidores do pool podem assumir **`mcp_workspace_pool` anunciado ⇒ campos `entryCount`/`entrySummary`/`scope?` todos presentes**; nenhuma verificação de capacidade por campo é necessária.

| Tag                        | Quando anunciada                                                                                                     | Significado                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `mcp_workspace_pool`       | Quando `QwenAgent.mcpPool !== undefined` (sempre verdadeiro no modo daemon, a menos que a chave de desativação `--no-mcp-pool` esteja presente) | `GET /workspace/mcp` reflete o estado do pool; campos `entryCount` + `entrySummary` presentes              |
| `mcp_pool_restart`         | Sempre quando `mcp_workspace_pool` está ativo                                                                         | `POST /workspace/mcp/:server/restart` aceita `?entryIndex=` e pode retornar `entries: RestartResult[]`    |
| (estende `mcp_guardrails`) | inalterado                                                                                                          | Mesma tag, payload estendido com `scope` (`'workspace'` no F2)                                            |

### 20.2 Superfície aditiva do SDK

```ts
// @qwen-code/sdk — additive only
export interface DaemonMcpBudgetWarningData {
  // existing fields...
  scope?: 'workspace' | 'session'; // NEW — absent on old daemons (means 'session')
}

export interface DaemonMcpChildRefusedBatchData {
  // existing fields...
  scope?: 'workspace' | 'session';
}

export interface ServeWorkspaceMcpServerStatus {
  // existing fields...
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

- Mesmo cfg → mesma chave (permutação de chave de ambiente estável, permutação de chave de cabeçalho estável)
- valor de ambiente diferente em 1 byte → chave diferente
- valor do cabeçalho `Authorization` diferente → chave diferente
- `includeTools`/`excludeTools`/`trust` modificados → MESMA chave (filtro por sessão)
- Dois `new MCPServerConfig(...)` com conteúdo idêntico → mesma chave (hash canônico, não identidade)

### 21.2 Ciclo de vida (F2-2)

- 3 sessões adquirem mesma chave → 1 spawn (verificar via spy em `client.connect`)
- Sequência de liberação n,n-1,...,1 → timer de drenagem inicia apenas em 1→0
- Drenagem de 30s: aquisição aos 25s cancela o timer; aquisição aos 35s cria nova entrada
- `MAX_IDLE_MS` (5min) fecha forçadamente mesmo se drenagem oscilar
- Spawn falha durante operação pendente: todos os esperadores recebem erro; slot liberado; nenhuma entrada armazenada

### 21.3 Aquisição concorrente (F2-2)

- 5 chamadas simultâneas `acquire(mesmaChave)` enquanto nenhuma entrada existe → exatamente 1 chamada `spawnEntry`, todos os 5 recebem a mesma entrada
- Spawn rejeita → todos os 5 esperadores rejeitam com o mesmo erro; aquisição subsequente faz novo spawn

### 21.4 Isolamento por sessão (F2-2)

- Sessão A `excludeTools: ['foo']`, Sessão B sem exclusão → ToolRegistry de A omite foo, B tem; ambos do mesmo `toolsSnapshot`
- Sessão A `trust: true`, Sessão B `trust: false` → `DiscoveredMCPTool.trust` de A === true, de B false; verificar que NÃO é referência compartilhada (mutar um não afeta o outro)
- Sessão A adquire servidor apenas de prompts → PromptRegistry de A populado, ToolRegistry vazio para aquele servidor

### 21.5 Mudança na lista de ferramentas/prompts (F2-2)

- Servidor emite `notifications/tools/list_changed` → `applyTools` de todos os assinantes chamado com novo snapshot
- Handler obsoleto de geração pré-reconexão NÃO sobrescreve snapshot
- `notifications/prompts/list_changed` análogo

### 21.6 Crash + reconexão (F2-2)

- Matar subprocesso via `process.kill` → assinantes recebem evento `disconnected`
- 3 tentativas de reconexão (usando o `MCPHealthMonitorConfig` existente) → sucesso → `reconnected` + snapshot novo
- Tentativas esgotadas → todos os assinantes recebem `failed`; entrada transita para estado `failed`; novas aquisições tentam uma vez e então lançam erro
### 21.7 Varredura de PID descendente (F2-2b)

- Linux/macOS: spawn `bash -c "sleep 60 & sleep 60"` como comando stdio → mate o processo raiz → verifique se ambos os descendentes foram coletados (poll em `/proc/<pid>/status`, ou `kill(0, pid) === false`)
- Windows: spawn `cmd /c "ping -t localhost"` wrapper → mate → verifique se o subprocesso ping foi encerrado
- `pgrep` indisponível (PATH ausente) → degradação suave: registre aviso, apenas SIGTERM no raiz, não quebre

### 21.8 Orçamento no escopo do workspace (F2-4)

- 4 sessões × `--mcp-client-budget=2` com 3 servidores MCP estáticos → total do workspace = 3 (não 12); snapshot cell `scope: 'workspace'`, `liveCount: 3`
- Aviso de orçamento dispara uma vez a cada cruzamento de 75% para cima em todo o workspace; transmite para todas as 4 sessões simultaneamente
- Re-arm de histerese: cair para 37,5% → próximo cruzamento dispara novamente

### 21.9 Compatibilidade retroativa (F2-3)

- `qwen` standalone (sem daemon) → `mcpPool === undefined` → todos os testes existentes de `mcp-client-manager.test.ts` passam inalterados
- Flag `--no-mcp-pool` do daemon → fallback para por sessão, todos os testes e2e existentes do daemon passam

### 21.10 Isolamento de credenciais (F2-3)

- Sessão A injeta `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}`, Sessão B `tokenB` → 2 processos separados; verifique por snapshot `entryCount: 2`; verifique se as chamadas de ferramenta de A passam pelo transporte de A (por inspeção de cabeçalho em stdin/log)

### 21.11 LoadSession / resume (F2-3)

- Fechamento de sessão → drenagem inicia → resume dentro de 30s → entrada do pool reutilizada (sem cold start, afirmado via contagem de spy em `client.connect`)
- Resume após 30s, mas antes da expiração da janela de restore → cold start do pool; conteúdo de `restoreState` ainda preservado

### 21.12 Rota de restart (F2-3b)

- 1 entrada para nome → `POST /workspace/mcp/foo/restart` retorna formato legado `{restarted: true, durationMs}`
- 2 entradas para nome (fingerprints diferentes) → retorna `{entries: [{fingerprint, restarted, ...}, ...]}`
- Restart enquanto outro restart está em andamento → segunda chamada retorna a mesma promise (deduplicada)
- Restart quando o orçamento seria excedido → `{restarted: false, skipped: true, reason: 'budget_would_exceed'}` por entrada

### 21.13 Rota de status (F2-3b)

- Daemon ocioso (sem sessões), mas pool tem entradas em cache de sessão anterior → `GET /workspace/mcp` retorna `initialized: true` com contabilidade ativa
- Sessão de bootstrap não existe → fallback para caminho direto do pool; sem erro
- Consulta ao pool lança exceção → fallback para caminho da sessão de bootstrap; nunca quebra snapshot

### 21.14 Redutor SDK (F2-4)

- `mcpBudgetWarningCount` incrementa simultaneamente em todas as sessões subscritoras quando o evento do workspace é transmitido
- `isWorkspaceScopedBudgetEvent(e)` identifica corretamente o escopo a partir do payload
- Daemon antigo (sem campo `scope`) → interpretação padrão como 'session'

### 21.15 Recarga de configuração a quente (F2-3)

- Alteração em `settings.json` em pleno voo → sessão antiga mantém entrada antiga, nova sessão cria nova entrada, ambas coexistem; a antiga drena naturalmente quando a última sessão antiga fecha
- 0 sessões após fechamento da sessão antiga → timer de drenagem dispara → entrada antiga é coletada como lixo → apenas a nova entrada permanece

### 21.16 Ordem de desligamento (F2-3)

- `QwenAgent.close()` dispara em ordem: parar de aceitar → drenar prompts → fechar sessões → `pool.drainAll` → sem PIDs zumbis em `pgrep -P <acpChildPid>` após a saída

---

## 22. Perguntas em Aberto

V21 travou Q1/Q3/Q4/Q6 nos defaults de design (entrega em PR único). Q2/Q5/Q7/Q8/Q9 permanecem.

| #   | Pergunta                                                                                                         | Default de design F2                                                                  | Decisão necessária antes de |
| --- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------- |
| Q1 ✅ | Nomes de campos do redutor SDK — renomear ou manter?                                                              | **TRAVADO v2.1**: manter `mcpBudgetWarningCount` etc. com semântica de escopo estendida em JSDoc | resolvido                    |
| Q2    | Capacidade `mcp_workspace_pool` — incrementar `protocolVersions` ('v1' → 'v1.1'), ou manter aditivo em 'v1'?       | **Manter aditivo em 'v1'** (consistente com precedente do PR 14b)                       | commit 5                     |
| Q3 ✅ | Flag `--no-mcp-pool` — padrão ligado ou opt-in?                                                                  | **TRAVADO v2.1**: padrão ligado; `--no-mcp-pool` é chave de desligamento                | resolvido                    |
| Q4 ✅ | Padrão HTTP/SSE — pool desligado ou ligado?                                                                       | **TRAVADO v2.1**: pool desligado; opt-in via `--mcp-pool-transports`                    | resolvido                    |
| Q5    | `POST /workspace/mcp/reload-all` — incluir no F2 ou follow-up?                                                   | **Follow-up**                                                                           | n/a (adiado)                 |
| Q6 ✅ | Construção lazy do pool — vale a pena a condicional?                                                              | **TRAVADO v2.1**: eager (sempre constrói no construtor de `QwenAgent`)                  | resolvido                    |
| Q7    | Janela de `restoreState` vs drenagem do pool — manter separados, alinhar, ou ler das configurações?               | **Manter separados com default 30s** + knob de config `--mcp-pool-drain-ms`             | commit 4                     |
| Q8    | Tratamento OAuth — confirmar adiamento para F3, documentar workaround?                                            | **Adiado para F3**, documentar workaround `/mcp auth <name>`                            | commit 4                     |
| Q9    | Exposição de `entrySummary` — incluir sempre, ou atrás de flag verbose?                                          | **Incluir sempre** (payload pequeno, útil para operações)                               | commit 5                     |
| Q10   | Atualizar decisão #3 em `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` — coordenar com @wenshao? | Descrição do PR F2 linka PR do codeagents; dois PRs revisados independentemente          | PR aberto                    |
---

## 23. Riscos

### Alto

- **R1 (Estado global do A2)**: Colisão em `serverStatuses` para múltiplas entradas com o mesmo nome. Mitigado pela função de status agregado; o risco remanescente é consumidores do SDK lerem o Map global bruto (improvável — usado apenas via accessor `getMCPServerStatus(name)`).
- **R2 (Simetria do PromptRegistry)**: Esquecer o fan-out de prompt em qualquer caminho de código descarta prompts silenciosamente. Mitigado pelo teste F2-2, terceiro bullet da seção 21.4, mais teste de integração que afirma paridade de prompt em relação ao pré-F2.
- **R3 (Vazamento de estado no transporte HTTP)**: Optar pelo pool HTTP para um servidor que mantém estado por transporte corrompe contextos de sessão. Mitigado por desligado por padrão + documentação; não pode ser detectado automaticamente.

### Médio

- **R4 (Unificação de caminhos F2-1)**: A fábrica `connectToMcpServer` e a classe `McpClient` possuem diferenças comportamentais sutis (ex.: capacidades anunciadas no momento da construção vs. momento da conexão). Mitigado pelo F2-1 ser um PR de refatoração pura com cobertura completa de regressão antes do início do trabalho no pool.
- **R5 (PID filho no Windows)**: O `Get-CimInstance` do PowerShell pode ser lento (custo de spawn) ou bloqueado pelo AppLocker. Mitigado por timeout de 2s + degradação graciosa.
- **R6 (Amplificação de broadcast de eventos do pool)**: O aviso de orçamento propagado para 100 sessões causa 100 chamadas `extNotification` em um loop apertado. Mitigado por paralelização `Promise.all` + captura por sessão (padrão existente no PR 14b).

### Baixo

- **R7 (Estabilidade da impressão digital entre versões do MCPServerConfig)**: Campos futuros adicionados a `MCPServerConfig` não incluídos na impressão digital permitiriam compartilhamento incorreto silenciosamente. Mitigado por função de canonicalização explícita + teste que enumera todos os campos de `MCPServerConfig` e afirma cobertura.
- **R8 (Condições de corrida do contador de geração)**: Ciclos rápidos de reinicialização poderiam exaurir a precisão numérica do JS (≈ 2^53 = ~285 mil anos a 1/seg). Não é uma preocupação prática.

### Específico de um único PR (V21-14)

- **R9 (Fadiga de revisão em PR único de ~6000 LOC)**: A largura de banda do revisor se torna um caminho crítico. F3 bloqueado pela mesclagem de F2 → bloqueando outros contribuidores. Mitigação: (a) pré-revisão com 3 agentes especialistas e consolidar P0/P1 antes da abertura, espelhando o padrão do PR 21; (b) estruturar como 6 commits atômicos para que o revisor possa percorrer passo a passo; (c) coordenar janela de revisão com @wenshao com antecedência via comentário no #4175.
- **R10 (Acúmulo de conflitos de mesclagem em `daemon_mode_b_main`)**: F2 toca em `acpAgent.ts`, `httpAcpBridge.ts`, `capabilities.ts`, `mcp-client*.ts` — todos caminhos quentes. Contribuidores de F3/F4 que aterrissam simultaneamente correm risco de conflitos durante a janela de revisão de 1–2 semanas do F2. Mitigação: `git rebase origin/daemon_mode_b_main` diariamente; coordenar via atualização no #4175 informando que F2 está em andamento + pedir que F3/F4 adiem alterações em arquivos quentes até a mesclagem do F2.
- **R11 (Tempo de execução do CI)**: ~1900 LOC de novos testes incluindo spawn de subprocesso + varredura de PID multiplataforma podem aumentar o CI de 30min para 50min. Mitigação: (a) proteger testes de subprocesso atrás de `process.env.QWEN_INTEGRATION === '1'`, executar subconjunto no CI do PR + conjunto completo no CI noturno; (b) paralelismo Vitest ≥ 4; (c) testes de varredura de PID no Windows pulados com proteção apenas no runner Windows do GHA.

---

## 24. Atualizações de Documentação

| Documento                                                                                          | Atualização                                                                                                                                                                                                                                                              | Quando                                                     |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`                                 | Decisão #3 "MCP server lifetime": atualmente "por sessão"; atualizar para "em pool por workspace com chave de hash de configuração no modo daemon; independente por sessão"                                                                                              | F2-3 mescla (coordenar com @wenshao PR do codeagents)      |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                                                 | Onda 5 PR 23 → marcar como série F2; link para PRs                                                                                                                                                                                                                      | F2-3 mescla                                                 |
| `packages/cli/src/serve/README.md` (se existir) ou novo `docs/serve/mcp-pool.md`                   | Nova seção: semântica do pool, chave de impressão digital, opt-in de transporte, semântica de reinicialização, interpretação do snapshot de status                                                                                                                       | F2-3b                                                       |
| `packages/sdk/README.md`                                                                           | Campo `scope?` em eventos de guardrail, `entryCount` no status do servidor, helper `isWorkspaceScopedBudgetEvent`                                                                                                                                                        | F2-4                                                        |
| Corpo da Issue #4175                                                                               | Atualizar entrada F2 com tabela de sub-PRs, link para design v2 (este documento)                                                                                                                                                                                         | Antes da abertura do F2-1                                   |
| Corpo da Issue #3803                                                                               | Linha da Decisão #3: atualizar "Atualmente por sessão" → "Em pool por workspace sob daemon (F2)"                                                                                                                                                                        | Após a mesclagem do F2-3                                    |
| Comentário inline em `acpAgent.ts:869-936`                                                         | Remover referência futura "Wave 5 PR 23"; atualizar para "graduado pelo F2 para `scope: 'workspace'`"                                                                                                                                                                   | PR do F2-4                                                  |
| CHANGELOG / notas de release (Onda 6 / F5)                                                         | "Processos MCP agora compartilhados entre sessões em um workspace" (manchete)                                                                                                                                                                                            | Release do F5                                               |
---

## 25. Modelo de Descrição de PR (entrega em PR único)

```markdown
## feat(serve): shared MCP transport pool (workspace-scoped) [F2]

Single feature-cohesive PR per #4175 branching strategy (2026-05-19).
Replaces what was originally planned as Wave 5 PR 23 + sub-PRs F2-1..F2-4.

### Scope

~4100 LOC production + ~1900 LOC tests across 6 atomic commits.
Step through with `git log -p HEAD~6..HEAD` for commit-by-commit review.

### Design doc

See `docs/design/f2-mcp-transport-pool.md` (v2.1).

### Pre-review specialist agents (per PR 21 pattern)

Folded into first commit before opening:

- code-reviewer: N findings, all adopted
- silent-failure-hunter: N findings, all adopted
- type-design-analyzer: N findings, all adopted

### Closes

(none — F2 entry in #4175 stays open until PR merges into main batch)

### Related

- #3803 decision #3 update (codeagents PR <link>)
- PR 14b (#4271 merged) — budget guardrail base; F2 graduates scope to workspace
- F1 (#4319 merged) — acp-bridge package; F2 depends on injection seams

### Backward compatibility

- Standalone `qwen` (non-daemon): pool not constructed; existing behavior preserved
- Daemon `qwen serve --no-mcp-pool`: kill switch falls back to per-session
- SDK: all new fields additive (`entryCount`, `scope?`); EVENT_SCHEMA_VERSION stays at 1
- Old SDK clients: unknown `scope: 'workspace'` ignored per PR 14 contract
- Old daemons: SDK consumers can detect absence of `mcp_workspace_pool` capability and fall back

### Test plan

- [ ] Pool key: env permutation stability, header divergence, per-session filter exclusion
- [ ] Lifecycle: 3-session sharing, drain grace, concurrent acquire dedupe, spawn failure slot release
- [ ] Tools + Prompts dual fan-out, per-session trust copy, snapshot replay on attach
- [ ] Generation guard: pre-reconnect handler doesn't overwrite post-reconnect snapshot
- [ ] Crash + reconnect with stdio backoff (5s × 3) and HTTP backoff (1/2/4/8/16s × 5)
- [ ] Descendant pid sweep: Linux/macOS pgrep recursion, Windows PowerShell CIM
- [ ] Budget at workspace scope: 4 sessions × budget=2 → 3 max (not 12); fan-out to all attached
- [ ] LoadSession resume within drain window: pool entry reused, no cold start
- [ ] Hot config reload: old/new entries coexist; old drains naturally
- [ ] Restart route: `?entryIndex=` selectivity; legacy single-entry response shape preserved
- [ ] In-flight tool call during reconnect: `MCPCallInterruptedError` rejection
- [ ] Standalone qwen: all existing mcp-client-manager tests pass unchanged
```

## Resumo

F2 v2.1 = PR único com 6 commits atômicos (~6000 LOC), visando `daemon_mode_b_main`. Pilares de design principais:

1. **`McpTransportPool`** em `packages/core` (lado filho ACP), escopo de workspace, refcount + drenagem de 30s
2. **Chave de fingerprint** SHA-256 sobre configuração canônica incluindo env/headers (padrão claude-code), excluindo filtros por sessão (includeTools/trust)
3. **`SessionMcpView`** projeção do registro de ferramentas+prompts por sessão com cópia de trust
4. **Replay de snapshot + guarda de geração** para race de attach e notificações obsoletas
5. **Varredura de pids descendentes entre plataformas** (padrão opencode + porta Windows)
6. **Aceitação HTTP/SSE**, bypass MCP do SDK, OAuth adiado para F3
7. **Máquina de estados de orçamento** gradua para escopo de workspace; célula de snapshot + eventos push se estendem aditivamente (`scope?`)
8. **Refatoração das rotas de status + restart**: pool-first com fallback para bootstrap-session; `entryCount` + `RestartResult[]`

**Perguntas em aberto Q1–Q10** na seção 22 precisam de decisões dos mantenedores antes que os respectivos sub-PRs sejam abertos. Recomenda-se resolver Q1–Q4 antes do início de F2-3 (estas condicionam a direção geral); Q5–Q10 podem ser resolvidas incrementalmente.
