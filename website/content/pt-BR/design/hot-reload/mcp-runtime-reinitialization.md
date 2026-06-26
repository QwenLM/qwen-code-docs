# Design de Hot-Reload do Runtime MCP: reconexão incremental orientada por configurações (Sub-tarefa 3 da Issue #3696)

> [!note] Nota: o escopo original da sub-tarefa 3 é "reconexão em tempo de execução MCP/LSP"; este MR entrega **apenas MCP**. LSP mantém apenas um esboço + TODO na Parte C, adiado para um MR posterior.

## Contexto

A Issue #3696 é a issue abrangente que rastreia o sistema de hot-reload. A Sub-tarefa 1
(`SettingsWatcher` detecção de alterações em arquivos) foi mesclada, mas **ainda não possui assinante** —
`gemini.tsx:784` inicia o watcher, e o [design da Sub-tarefa 1](./settings-change-detection.md)
explicitamente deixou a conexão dos listeners para as sub-tarefas 2–6. Atualmente, adicionar/remover/editar um servidor MCP
em `settings.json` (ou instalar uma extensão) exige reiniciar toda a sessão, perdendo o
contexto da conversa.

Este MR foca em **MCP** e entrega duas coisas: (a) um ponto de entrada em tempo de execução que envia
configurações recarregadas para o `Config` ativo; (b) reconexão incremental MCP impulsionada pelo
`SettingsWatcher`. A reconexão em tempo de execução do LSP pertence a esta sub-tarefa, mas não está implementada aqui,
deixando apenas um TODO na Parte C.

**Observação central**: a reconciliação incremental "reconectar por diff" já existe no código
(`discoverAllMcpToolsIncremental` de sessão única, `runDiscoverAllMcpToolsViaPool` de pool compartilhado,
tocando apenas servidores alterados pela impressão digital `connectionIdOf`). A única lacuna é que
o `Config` não pode atualizar seu snapshot de configurações após a inicialização (`addMcpServers()` lança exceção,
`config.ts:3200`). Adicionar esse ponto de entrada em tempo de execução é a **Parte A**; acioná-lo a partir do watcher
é a **Parte B** — essa é a totalidade deste MR. Duas compensações firmes: reutilizar a reconciliação
incremental existente em vez do `restartMcpServers()` (que limpa tudo e causa uma lacuna de "0 ferramentas");
e o caminho do pool compartilhado deve adicionar a porta de aprovação `isMcpServerPendingApproval` para corresponder
ao caminho de sessão única (item 4 da Parte A). Consulte "Arquitetura" abaixo para a visão geral dos componentes e
"Design" para o fluxo passo a passo e detalhes.

---

## Arquitetura

Em uma linha: **conectar a reconciliação incremental já existente às alterações no arquivo de configurações** e
preencher o limite de confiança e feedback de UI ao longo do caminho. A mudança é dividida por responsabilidade
entre os pacotes CLI / Core, desacoplados através de métodos do `Config` e um evento de UI:

```text
                    Pacote CLI                                   Pacote Core
 ┌──────────────────────────────────────────┐       ┌────────────────────────────────────┐
 │ SettingsWatcher  (sub-tarefa 1, mesclado)  │       │ Config                              │
 │   └─[Parte B] hot-reload.ts                  │ chama │   └─[Parte A] reinitializeMcpServers │
 │       quando disparar · recomputar bloqueio · portão│ ────▶ │       setMcpServers + reconcil. incr.│
 │                                             │       │         (McpClientManager pool/único)     │
 │   └─[Parte D] useMcpApproval · modal de aprovação│ ◀──── │   └─[Parte A④] portão de pendência do pool│
 │       pendente no meio da sessão → re-prompt│ evento │                                     │
 │   └─[Parte E] visão /mcp status                │       └────────────────────────────────────┘
 │       mostrar motivo "pulado devido à aprovação"│
 └──────────────────────────────────────────┘
```

- **Princípio de camadas**: o core não deve entender `settings.json` / semântica do watcher.
  "Quando disparar" pertence ao CLI (Parte B), "como atualizar + reconciliar" pertence ao Core
  (Parte A), consistente com a sub-tarefa 1; a Parte B é o único consumidor da Parte A, interagindo apenas
  através de métodos do `Config`.
- **Caminho principal**: alteração nas configurações → Parte B reconstrói a lista desejada + listas de bloqueio,
  portão com debounce → chama Parte A → Core faz reconciliação incremental (incluindo a porta de aprovação do caminho do pool) →
  emite `mcp-client-update` para atualizar os indicadores de status.
- **Ramo de aprovação**: se a reconciliação deixar um servidor bloqueado como `pendente`, a Parte D aciona o modal
  de aprovação através do evento `McpPendingApprovalChanged`; o motivo da omissão é exibido pela Parte E na
  visão `/mcp`.
- **Pré-requisito crítico**: as três chaves de esquema `mcpServers` / `mcp.allowed` / `mcp.excluded` devem
  ser configuradas como recarregáveis a quente; caso contrário, o portão de supressão de reinicialização necessária do watcher
  engole edições apenas de MCP e toda a cadeia fica inerte (consulte a nota ⚠️ no início de "Design").

| Parte | Responsabilidade                                                                                                                                 | Camada       | Status            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------- |
| **A** | Configuração MCP atualizável em tempo de execução no `Config` + reconciliação incremental + portão de aprovação do caminho do pool             | Core         | este MR           |
| **B** | Assinar watcher, recomputar bloqueio, portão com debounce, chamar Parte A                                                                      | CLI          | este MR           |
| **C** | Reinicialização LSP                                                                                                                            | Core         | TODO (MR futuro)  |
| **D** | Pendência no meio da sessão aciona o modal de aprovação (e corrige prompt perdido #6)                                                           | CLI          | acompanhamento    |
| **E** | `/mcp` mostra o motivo "pulado devido à aprovação"                                                                                             | CLI          | acompanhamento    |
| **F** | Semântica de admissão: lista de permissões do CLI é um limite superior, `mcp.allowed: []` = negar todos, e ferramenta não encontrada explica _por que_ um servidor está indisponível | CLI + Core   | acompanhamento    |

"Design" abaixo fornece o fluxo de dados passo a passo, do arquivo em disco à conexão ativa, além dos
detalhes de implementação de cada parte.

---

## Design

O diagrama abaixo é o fluxo de dados completo de uma alteração nas configurações, desde o "arquivo em disco" até a "conexão
entrar em vigor" (`[CLI]` = Parte B, `[Core]` = Parte A, `[sub-tarefa 1]` = o watcher mesclado):

```text
① Usuário edita .qwen/settings.json (adiciona/remove/edita mcpServers, ou mcp.excluded / mcp.allowed)
       │
       ▼
② [sub-tarefa 1] SettingsWatcher detecta a alteração no arquivo
       │   · debounce de 300ms: coalesce salvamentos consecutivos
       │   · diff semântico do arquivo inteiro: notifica apenas se o conteúdo realmente mudou (auto-escrita / formatação pura → sem notificação)
       ▼
③ [CLI · Parte B] o callback registrado por registerMcpHotReload dispara (qualquer alteração nas configurações o atinge)
       │
       ├─ a. assembleMcpServers(settings.merged.mcpServers, cwd, topTier)
       │        → mescla por prioridade na lista completa de servidores `next` (incluindo .mcp.json / --mcp-config / sessão)
       ├─ b. recomputa as listas de bloqueio de conexão nextGating = { excluded, allowed, pending }
       └─ c. portão: mcpServersEqual(old, next) AND mcpGatingEqual(old, nextGating) ambos "inalterados"
                → retorno antecipado (ignora tema / skills e outras edições irrelevantes para MCP)
       │ (continua apenas se mcpServers OU as listas de bloqueio mcp mudaram ↓)
       ▼
④ [CLI→Core] envia as listas de bloqueio para o config primeiro (a descoberta as lê durante a reconciliação):
       config.setExcludedMcpServers / setAllowedMcpServers / setPendingMcpServers
       │
       ▼
⑤ [Core · Parte A] config.reinitializeMcpServers(next)
       │   (envolto por um guarda "reconciliação em andamento" para evitar corrida com /reload)
       ├─ a. setMcpServers(next): substitui o snapshot da camada de configurações (camadas de extensão / runtime intactas)
       └─ b. discoverAllMcpToolsIncremental: reconciliação incremental no estilo reconciliação
                · calcula a impressão digital connectionIdOf de cada servidor, compara "desejado" vs "online"
                · adicionado → conectar; removido → desconectar + descartar ferramentas/prompts;
                  impressão digital alterada → desconectar + descartar ferramentas/prompts antigos, depois reconectar com nova configuração; inalterado → manter
                · pula desabilitados / pendentes / diretório não confiável; emite mcp-client-update
       │
       ▼
⑥ [CLI · Parte B] Finalização da UI: mcp-client-update atualiza os indicadores de status MCP;
       (opcional) Prompts MCP alterados → reloadCommands(); define needsRefresh (sub-tarefa 6)
```

> **Momento do disparo**: `registerMcpHotReload` é executado apenas uma vez na inicialização (anexa o listener,
> retorna um disposer); o callback que ele registra é o que dispara **em cada alteração nas configurações** através do
> watcher (ou seja, a partir do passo ③ em diante) — é quando a reconciliação realmente é executada.

> ⚠️ **Pré-requisito crítico: três chaves de esquema MCP devem ser configuradas como recarregáveis a quente (o
> switch oculto no passo ②).** O watcher tem um "portão de supressão de reinicialização necessária": se **todas** as chaves
> tocadas por uma alteração tiverem `requiresRestart: true`, ele **não emite nenhum evento**. Mas
> `mcpServers` / `mcp.allowed` / `mcp.excluded` estavam todas como `true` — então uma edição apenas de MCP nunca dispara o callback e
> a Parte B fica inerte. Este MR **deve** alterar essas **três folhas** para `false`; o nó pai `mcp`
> e a configuração apenas de inicialização `mcp.serverCommand` permanecem `true` (a correspondência usa `isRestartRequiredKey`
> correspondência de prefixo mais longo + `flattenSchema`, a folha vence). Todas as três têm `showInDialog: false`, então a
> alteração não muda o prompt de reinicialização da caixa de diálogo de configurações; o raio de explosão é apenas o caminho do watcher.

Os parágrafos a seguir descrevem a Parte A (capacidades do Core), Parte B (conexão do CLI) e Parte C (LSP, apenas TODO neste
MR) em sequência.

### Parte A — Core: tornar o Config atualizável em tempo de execução para configuração MCP e acionar reconciliação incremental

**Arquivo: `packages/core/src/config/config.ts`**

1. Adicionar um setter pós-inicialização que atualiza o snapshot de configurações que a reconciliação lê:

   ```ts
   /**
    * Substituição em tempo de execução (hot-reload) do mapa de servidores MCP da camada de configurações.
    * Ao contrário de addMcpServers(), ignora o guarda `initialized` e é uma SUBSTITUIÇÃO
    * (não uma mesclagem), portanto remoções entram em vigor. A sobreposição
    * em tempo de execução (addRuntimeMcpServer) e as contribuições de extensão não são afetadas —
    * getMcpServers() ainda as adiciona por cima.
    */
   setMcpServers(servers: Record<string, MCPServerConfig> | undefined): void {
     this.mcpServers = servers;
   }
   ```

   `getMcpServers()` (`:3128`) já adiciona extensões + `runtimeMcpServers` por cima de
   `this.mcpServers`, portanto substituir apenas a camada de configurações é seguro para entradas de runtime/extension.

2. **Listas de bloqueio de conexão**: as três listas de nomes que decidem se cada servidor MCP pode se
   conectar — `excluded` (bloqueado), `allowed` (se definido, apenas estes se conectam), `pending` (fonte bloqueada,
   precisa de aprovação do usuário antes de conectar). Elas são separadas de `mcpServers` (configuração do servidor):
   a primeira rege "**se** conectar", a segunda "**quais servidores e como**". Adicione setters
   para essas três listas que `getMcpServers()` / discovery consultam: `setExcludedMcpServers()`
   existe (`:3167`); adicione `setAllowedMcpServers()` (o campo é atualmente `readonly` e usado como um
   filtro dentro de `getMcpServers()`) mais um setter para o conjunto de aprovação pendente.

3. Adicionar um método de orquestração leve: atualizar o config primeiro, depois conduzir a
   reconciliação incremental existente, envolto por um guarda compartilhado "reconciliação em andamento" para que `/reload`
   (sub-tarefa 5) e o watcher não entrem em corrida:

   ```ts
   /**
    * Aplica um novo mapa MCP da camada de configurações e reconcilia incrementalmente as conexões ativas
    * (conecta adicionados, desconecta removidos, reinicia alterados; mantém inalterados intactos).
    * Chamar antes de initialize() é um no-op seguro.
    */
   async reinitializeMcpServers(servers: Record<string, MCPServerConfig> | undefined): Promise<void> {
     this.setMcpServers(servers);
     const registry = this.getToolRegistry();
     await registry.getMcpClientManager().discoverAllMcpToolsIncremental(this);
   }
   ```

   `discoverAllMcpToolsIncremental` já verifica `isTrustedFolder()`, lida com servidores desabilitados/SDK,
   e emite `mcp-client-update` para atualizar os indicadores de status da UI. Servidor removido →
   liberar + descartar ferramentas/prompts; impressão digital alterada → liberar + readquirir; inalterado → manter.

4. **Adicionar a verificação de aprovação pendente ao caminho do pool compartilhado** (limite de confiança, obrigatório neste
   MR): o caminho de sessão única pula servidores com aprovação pendente, mas quando um pool compartilhado existe,
   `discoverAllMcpToolsIncremental` delega para `runDiscoverAllMcpToolsViaPool`, e **o caminho do pool
   pula apenas desabilitados/SDK, não `isMcpServerPendingApproval`** (por volta de
   `mcp-client-manager.ts:1461`). Sem essa correção, no modo daemon / pool compartilhado, um hot-reload que
   adiciona/edita um servidor bloqueado `.mcp.json` / workspace adquiriria uma conexão do pool e iniciaria o processo
   **antes** da aprovação do usuário, contornando a porta de aprovação #4615. Correção: adicionar
   a verificação `isMcpServerPendingApproval` no caminho do pool **antes de construir `desiredIds` e antes de
   adquirir**, fazendo com que sua semântica de admissão corresponda ao caminho de sessão única.

### Parte B — CLI: assinar SettingsWatcher → reconciliação MCP

**Novo arquivo: `packages/cli/src/config/hot-reload.ts`**, conectado após
`settingsWatcher.startWatching()` (`:785`) em `gemini.tsx`.

```ts
export function registerMcpHotReload(
  watcher: SettingsWatcher,
  settings: LoadedSettings,
  config: Config,
  topTierMcpServers: Record<string, MCPServerConfig> | undefined,
): () => void {
  return watcher.addChangeListener(async (events) => {
    // Reconstruir exatamente como o Config boot fez — incluindo fontes de nível superior (CLI/sessão).
    const next = assembleMcpServers(
      settings.merged.mcpServers,
      config.getTargetDir(),
      topTierMcpServers,
    );
    // Recomputar as listas de bloqueio (excluded/allowed/pending)—[configurações no momento do hot-reload vencem],
    // veja a decisão de "postura de admissão" abaixo; pending é sempre recomputado conforme a porta #4615.
    const nextGating = {
      excluded: recomputeExcluded(settings, next),
      allowed: recomputeAllowed(settings, next),
      pending: recomputePending(settings, next),
    };
    // portão: reconciliar apenas se mcpServers OU as listas de bloqueio mcp mudaram;
    // se ambos inalterados, retorno antecipado (ignora tema / skills e outras edições irrelevantes para MCP).
    const serversChanged = !mcpServersEqual(
      config.getSettingsMcpServers(),
      next,
    );
    const gatingChanged = !mcpGatingEqual(config.getMcpGating(), nextGating);
    if (!serversChanged && !gatingChanged) return;
    // Enviar as listas de bloqueio para o config antes da reconciliação (a descoberta dentro de reinitializeMcpServers as lê).
    config.setExcludedMcpServers(nextGating.excluded);
    config.setAllowedMcpServers(nextGating.allowed);
    config.setPendingMcpServers(nextGating.pending);
    await config.reinitializeMcpServers(next);
    // Notificar UI: prompts MCP alterados → reloadCommands(); definir needsRefresh (sub-tarefa 6).
  });
}
```

> **Decisão de postura de admissão (deliberada)**: hot-reload faz **as configurações atuais vencerem _dentro_ do
> limite `--allowed-mcp-server-names` da inicialização** — uma edição em tempo de execução de `mcp.allowed` / `mcp.excluded` em
> `settings.json` entra em vigor imediatamente, mas **apenas restringe a admissão, nunca a amplia além do
> flag de inicialização** (consulte a Parte F para a regra de limite superior e a semântica de `mcp.allowed: []`). Se nenhum
> flag `--allowed-mcp-server-names` foi passado, as configurações dirigem totalmente a admissão. **A porta de aprovação
> pendente (#4615) nunca cede**, independentemente: um servidor bloqueado deve sempre ser aprovado primeiro (item 4 da Parte A).
>
> > _Histórico_: uma revisão anterior permitia que uma edição em tempo de execução das configurações ampliasse a admissão além do
> > flag de inicialização (tratando o flag como uma mera conveniência de filtro por nome). Uma revisão adversarial apontou isso como
> > um afrouxamento silencioso de um limite de inicialização; a Parte F (item K) reverte isso — o flag agora é um
> > limite superior imutável.

Reutilizar helpers existentes — **não** reimplementar a lógica de mesclagem:

- `assembleMcpServers(settings.mcpServers, cwd, topTierMcpServers)` —
  `packages/cli/src/config/mcpServers.ts:27` (correspondendo à chamada de inicialização do Config em
  `packages/cli/src/config/config.ts:1812`).
- `SettingsWatcher.addChangeListener` retorna uma função de cancelamento de assinatura (`settingsWatcher.ts:253`).
- `config.getSettingsMcpServers()` (`:3124`) como a pré-imagem para o diff de `mcpServers`;
  `config.getMcpGating()` como a pré-imagem para o diff das listas de bloqueio (um pequeno novo getter retornando
  `{ excluded, allowed, pending }`, emparelhado com os setters da Parte A).

O portão usa duas funções puras pequenas para restringir a superfície de disparo (evitar tema / skills e
outras edições irrelevantes acionarem reconciliação redundante, consistente com o próprio diff semântico do watcher),
ambas **reutilizando `fast-deep-equal`** (o pacote cli deve promovê-lo de uma dependência transitiva para uma
dependência direta):

- `mcpServersEqual(a, b)`: ordem das chaves do objeto irrelevante (elimina falsos positivos de ordenação de servidores /
  campos), ordem do array sensível (`args` e outra ordem de argumentos de comando tem significado);
  `undefined` ≡ `{}`.
- `mcpGatingEqual(a, b)`: `excluded` / `allowed` / `pending` comparados como **conjuntos** (ordenar cópias
  primeiro); `undefined` ≡ `[]`. É precisamente o que permite que "editar apenas `mcp.excluded` / `mcp.allowed`,
  deixar `mcpServers` intocado" ainda dispare a reconciliação — fechando a lacuna onde diffs apenas
  de `mcpServers` perderiam alterações de bloqueio.

A finalização da UI atualiza os indicadores de status através do evento existente `mcp-client-update`, definindo
`needsRefresh` quando necessário (sub-tarefa 6). O mínimo para esta sub-tarefa: a reconciliação no nível do config
é concluída + a emissão existente atualiza o status.

### Parte C — Reinicialização LSP (não implementada neste MR, TODO)

A configuração LSP vem de `.lsp.json` + configuração de extensão (**não** `settings.json`), portanto **não é
acionada automaticamente pelo SettingsWatcher**; sua reconexão em tempo de execução deve ser acionada manualmente pelo comando
`/reload` posterior (sub-tarefa 5). `NativeLspService` (bloqueado por `--experimental-lsp`) já possui
métodos de ciclo de vida `discoverAndPrepare` / `start` / `stop`, suficientes para implementar uma primitiva `reinitialize()`
exposta para `/reload` através de `LspClient.reinitialize?()` + `Config.reinitializeLsp()`,
sem grandes alterações.

> **TODO (próximo MR)**: implementar `NativeLspService.reinitialize()` e sua exposição via
> `Config.reinitializeLsp()`, com um design detalhado na documentação desse MR (incluindo que
> `discoverAndPrepare()` primeiro chama `clearServerHandles()`, prevenindo um diff incremental, então v1
> usa parar todos → iniciar todos, etc.). **Este MR não contém alterações de código LSP.**

### Parte D — Acompanhamento: hot-reload aciona o modal de aprovação em tempo de execução para servidores bloqueados (conecta-se a #4615)

> Esta seção foi adicionada depois que as Partes A/B foram entregues, durante a depuração de "alterei a URL de um servidor bloqueado mas
> ele não reconecta". Corrige a quebra onde "hot-reload marca um servidor bloqueado como pendente mas a UI não mostra
> nenhum modal de aprovação", e incidentalmente corrige um prompt perdido causado pela lógica de decisão
> (problema #6 abaixo).

#### Contexto: o modal de aprovação era computado apenas uma vez na inicialização

Um servidor de fonte bloqueada (`.mcp.json` do `project` e `.qwen/settings.json` do `workspace`, consulte
`isGatedMcpScope`) tem sua aprovação do usuário **vinculada ao hash da configuração** (`mcpApprovals.ts`'s
`getState`: nenhum registro, ou um registro cujo hash difere da configuração atual → `pending`). Portanto, se um
hot-reload altera a configuração de um servidor bloqueado (mesmo apenas `httpUrl`), sua alteração de hash invalida
a aprovação antiga e ele se torna `pending` novamente.

A cadeia das Partes A/B lida com isso **corretamente**: `recomputeMcpGating` o coloca em `pending`,
`setPendingMcpServers` o envia para a descoberta, e a reconciliação o pula (sem conexão, estado
`disconnected`). Mas **a UI não mostra nenhum modal de aprovação** — a causa raiz é que `useMcpApproval`
(o hook que controla o modal de aprovação) computa sua fila apenas **na montagem** via
`useEffect(…, [config])`, e a referência `config` é estável durante a sessão → o efeito nunca é
executado novamente. Ou seja:

- core marca o servidor como pendente (a descoberta o pula) ✓
- a fila de aprovação da UI nunca é recomputada → **nenhum modal** ✗ (o usuário vê apenas `disconnected`, sem forma de aprovar)
Os dois caminhos estão **desconectados** em tempo de execução.

#### Correção: conectar core→UI via um evento, entregar a decisão para a UI

1. **Adicionar evento** `AppEvent.McpPendingApprovalChanged` (`packages/cli/src/utils/events.ts`). Como
   `appEvents` está na camada CLI e `hot-reload.ts` também, o ouvinte pode emitir diretamente, sem
   **nenhuma alteração no core**.

2. **`hot-reload.ts` emite após a reconciliação** (posicionado após `await reinitializeMcpServers`, para que
   `config.getMcpServers()` já reflita o novo mapa; emitir independentemente de sucesso/falha da reconciliação—
   um servidor que ficou pendente ainda precisa de uma decisão do usuário).

3. **`useMcpApproval` extrai `computePending()`**: calcular uma vez na montagem (comportamento existente)
   **mais** recalcular a fila após assinar `McpPendingApprovalChanged` → uma fila não vazia
   mostra o modal. `computePending` recalcula a partir de fontes autoritativas (o mapa de servidores ativos
   + o arquivo de aprovação persistido), portanto servidores já aprovados/já rejeitados não são
   reapresentados.

#### Design chave: direcionar a emissão por "pendente estrito", não por diferença de conjunto de nomes (problema #6 / decisão A1)

Observe que os dois predicados são **deliberadamente diferentes**, o que é o cerne desta seção:

| Função                           | Predicado                                          | Uso                                                    |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `getPendingGatedMcpServers`      | `state !== 'approved'` (**inclui rejeitado**)      | alimenta a descoberta: rejeitado deve continuar sendo **ignorado** |
| `getPromptableMcpServers` (novo) | `state === 'pending'` (**exclui rejeitado**)       | alimenta o modal: rejeitado **não é mais exibido**     |

A decisão inicial de emissão usava "a diferença de conjunto de nomes de `nextGating.pending` vs última vez" para
decidir se mostrava o modal, o que causava uma omissão de prompt (revisar problema #6):

- um servidor **rejeitado** permanece na lista `pending` por causa de `!== 'approved'`;
- o usuário então **re-edita a configuração daquele mesmo servidor** (o hash muda → ele genuinamente fica
  `pending` novamente e deveria ser re-perguntado), mas seu nome já estava na lista → a diferença de conjunto
  está vazia → **nenhum evento → prompt perdido**.

Correção A1: usar `getPromptableMcpServers(next, cwd)` (estrito `=== 'pending'`) para decidir a emissão, passando
a verdade da decisão para `computePending`. Efeito:

- após rejeitar, **editar a configuração do mesmo servidor** (hash muda) → `pending` novamente → **re-prompt** ✓ (corrige #6)
- após rejeitar, uma edição **não relacionada** (hash inalterado) → ainda `rejected` → não promptável → **nenhum prompt** ✓
- já `approved` → nenhum prompt; um novo servidor gated não decidido → prompt ✓

#### Semântica de rejeição (confirmada após revisão)

`handleMcpApprovalSelect(REJECT)`: persiste `rejected` (vinculado ao hash atual), **não**
chama `reconnect`, **não** toca em `config.pendingMcpServers` → a descoberta continua ignorando → o
servidor permanece `disconnected`. Não há necessidade de derrubar ativamente a conexão antiga: a emissão ocorre após
o `await reinitializeMcpServers`, então no momento em que o modal aparece a reconciliação já a derrubou.
Após um reinício de sessão, `computePending` lê `rejected` → não enfileirado, permanece desconectado, comportamento
consistente.

#### Adendo ao fluxo de dados (continua após ⑥ no diagrama geral do capítulo)

```text
⑥' [CLI · Parte D] após a reconciliação, se existir um servidor gated estritamente pendente:
        hot-reload → appEvents.emit(McpPendingApprovalChanged)
        → useMcpApproval.computePending() recalcula a fila → mostra o modal de aprovação
        → usuário aprova: approveMcpServerForSession + discoverToolsForServer (conecta com nova configuração)
          usuário rejeita: persiste rejeitado, permanece desconectado
```

#### Arquivos chave (Parte D)

| Arquivo                                          | Alteração                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/cli/src/utils/events.ts`               | adicionar `AppEvent.McpPendingApprovalChanged`                                                                            |
| `packages/cli/src/config/mcpApprovals.ts`        | adicionar `getPromptableMcpServers()` (estrito `=== 'pending'`, distinto de `getPendingGatedMcpServers` que inclui rejeitado) |
| `packages/cli/src/config/hot-reload.ts`          | após reconciliação, decidir via `getPromptableMcpServers`; se não vazio, `appEvents.emit(McpPendingApprovalChanged)`      |
| `packages/cli/src/ui/hooks/useMcpApproval.ts`    | extrair `computePending()`; calcular uma vez na montagem + recalcular no evento                                            |

#### Verificação (Parte D)

- `hot-reload.test.ts`: um servidor gated recém-pendente → emitir; alteração não gated → nenhuma emissão;
  **rejeitar→editar config → emitir novamente** (a antiga diferença de conjunto de nomes seria 0 vezes, travando
  a regressão #6); rejeitar→edição não relacionada → nenhuma emissão.
- `mcpApprovals.test.ts`: a suíte `getPromptableMcpServers` — sem decisão não faz prompt, rejeitado não faz prompt
  (vs `getPendingGatedMcpServers` ainda ignorando), re-prompt após mudança de hash, aprovado não faz prompt.
- `useMcpApproval.test.ts`: um evento no meio da sessão faz um novo servidor gated mostrar o modal; um
  já aprovado não é reapresentado.

#### Problema conhecido / TODO retrospectivo (NÃO tratado aqui)

1. **Inconsistência de chave `getTargetDir()` vs `getWorkingDir()` (risco B)**: o recálculo de gating
   (`recomputeMcpGating` → `getPendingGatedMcpServers`) usa `config.getTargetDir()` como
   projectRoot, enquanto `useMcpApproval` lê/escreve aprovação usando `config.getWorkingDir()`. Eles
   geralmente são iguais; uma vez que divergem (cwd customizado, ou diferenças de realpath de symlink), a aprovação é
   escrita sob a chave do cwd enquanto o gating consulta a chave do targetDir → **após aprovar, o gating ainda
   ignora e nunca conecta**. Um problema preexistente, não introduzido pela Parte D. Recomenda-se unificar em
   uma única raiz (tendendo a `getWorkingDir()`, ou seja, o lado da escrita da aprovação), ou primeiro adicionar uma
   assertiva de que são iguais em tempo de execução.

### Parte E — Acompanhamento: mostrar em `/mcp` por que um servidor gated foi ignorado para aprovação

> Esta seção foi adicionada após a Parte D ser implantada, durante a depuração de "após rejeitar um servidor gated e
> depois deletá-lo e readicioná-lo identicamente, `/mcp` mostra Desconectado sem nenhuma dica". Conclusão primeiro:
> **isso não é um bug no ciclo de vida do registro; o único defeito é que o motivo da omissão é invisível**,
> então apenas adicionamos visibilidade e não tocamos na lógica de armazenamento de aprovação / reconciliação.

#### Por que "não perguntar novamente" é como projetado

Um registro de aprovação é vinculado a **(projectRoot, serverName, hash)** e é **independente de se o
servidor está atualmente presente na configuração** — nada deleta um registro quando um servidor desaparece da
configuração. Portanto:

- **aprovado já persiste entre remover/readicionar**: aprovar (hash H) → deletar → readicionar
  identicamente (ainda hash H) → `getState` retorna `approved` → reconexão silenciosa. Uma conveniência
  intencional.
- **rejeitado que corresponde àquela rejeição consolidada no mesmo "readicionar idêntico" é simétrico e
  consistente**: uma rejeição consolidada permanece em vigor enquanto o hash da configuração não mudar; o
  único modo de reexibi-lo é **editar a configuração (mudar o hash)** (ou seja, o caminho de re-prompt estrito-pendente
  da Parte D `getPromptableMcpServers`).

> Portanto, **deliberadamente não introduzimos "esquecer o registro na remoção"**: isso permitiria que
> transições de presença mutassem decisões persistentes, violando o princípio de que as decisões mudam
> apenas via hash ou ação explícita, e criando uma assimetria entre aprovado / rejeitado.

#### O defeito real e a correção (apenas visibilidade)

`/mcp` (`ServerListStep` / `ServerDetailStep`) renderizava um `Disconnected` simples, tornando "eu rejeitei /
aguardando aprovação" indistinguível de "uma falha de conexão genuína", então o usuário não sabia o
caminho de recuperação (editar configuração para mudar o hash → re-prompt). Correção: adicionar
`approvalState?: 'pending' | 'rejected'` a `MCPServerDisplayInfo`, calculado em
`MCPManagementDialog.fetchServerData` usando `loadMcpApprovals` + `isGatedMcpScope`, chaveado por
**`config.getWorkingDir()`** (deixado vazio para não-gated / aprovado); as visualizações de lista / detalhe,
usando o padrão existente de override `needsAuth`, mostram o motivo primeiro
(`rejected → "rejeitado — edite a configuração para re-aprovar"`, `pending → "precisa de aprovação"`, amarelo
de aviso), e excluem esses skips de aprovação não-erro da dica de rodapé "veja logs de erro".

> Chavear pelo lado de escrita `getWorkingDir()` aqui é exatamente a direção recomendada pelo "Problema
> conhecido 1 (risco B)" da Parte D—ler e escrever aprovação com a mesma raiz. A consulta de gating existente
> em `hot-reload.ts` ainda usa `getTargetDir()` (eles são iguais hoje); esta seção não altera seu
> comportamento. Ela **não toca** no armazenamento de `mcpApprovals.ts`, no caminho de remoção/reconexão de
> `hot-reload.ts`, e não adiciona nenhuma ação de aprovação.

#### Arquivos chave (Parte E)

| Arquivo                                                           | Alteração                                                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/mcp/types.ts`                     | `MCPServerDisplayInfo` adiciona `approvalState?: 'pending' \| 'rejected'`                |
| `packages/cli/src/ui/components/mcp/MCPManagementDialog.tsx`      | `fetchServerData` calcula `approvalState`, chaveado por `getWorkingDir()`                |
| `packages/cli/src/ui/components/mcp/steps/ServerListStep.tsx`     | renderizar o motivo da aprovação; excluir skips de aprovação da dica "veja logs de erro" |
| `packages/cli/src/ui/components/mcp/steps/ServerDetailStep.tsx`   | renderizar o motivo da aprovação (consistente com a lista)                                |

#### Verificação (Parte E)

- `ServerListStep.test.tsx`: gated `rejected` → mostra o texto de dica para re-aprovar; `pending` → "precisa de
  aprovação"; um skip de aprovação **não** mostra a dica "veja logs de erro", enquanto uma conexão genuinamente
  com falha **ainda** mostra.
- Manual: rejeitar um servidor de workspace → `/mcp` mostra o motivo (não um "Desconectado" simples) → editar sua
  configuração para mudar o hash → o modal da Parte D reaparece (o caminho de recuperação existente, inalterado aqui).

### Parte F — Acompanhamento: semântica de admissão (limite superior da CLI, deny-all, motivos de indisponibilidade)

> Adicionado após uma terceira rodada de revisão adversarial nas Partes A/B. Três refinamentos de admissão relacionados,
> agrupados porque compartilham a superfície de "quais servidores podem conectar, e como explicamos quando um não pode".
> Itens rotulados K / H / B após seus threads de revisão.

#### K — a flag de inicialização `--allowed-mcp-server-names` é um limite superior imutável

Inverte a postura anterior de "configurações sempre vencem" (veja a nota da Parte B). Na inicialização, `loadCliConfig`
dá precedência à flag sobre `settings.mcp.allowed`; mas o recálculo do hot-reload lia `allowed`
apenas das configurações, então qualquer alteração nas configurações descartava silenciosamente uma restrição de nome
definida na inicialização — afrouxando, durante a sessão, um limite que um operador definiu precisamente para restringir
quais comandos MCP locais podem ser executados.

Correção: capturar o **valor da flag sozinho** como um limite imutável em `Config`
(parâmetro `cliAllowedMcpServerNames` → `getCliAllowedMcpServerNames()`; distinto do mutável
`allowedMcpServers` que o hot-reload sobrescreve). `recomputeMcpGating` então limita a lista de permissões derivada
das configurações a ele:

- flag passada + configurações têm `mcp.allowed` → **interseção** (configurações podem restringir dentro do limite);
- flag passada + sem `mcp.allowed` nas configurações → a **flag por completo**;
- sem flag → configurações dirigem a admissão totalmente (inalterado).

Portanto, uma edição em tempo de execução pode apenas restringir a admissão MCP abaixo da flag de inicialização, nunca
ampliá-la além dela. `mcp.excluded` ainda restringe ainda mais no momento da descoberta, consistente com "apenas mais rigoroso, nunca mais brando".

#### H — `mcp.allowed: []` é negar tudo, consistentemente entre inicialização e hot-reload

A inicialização trata uma lista de permissões vazia como negar tudo (`getMcpServers()` filtra sempre que `allowedMcpServers`
é truthy, e `[]` é truthy). O recálculo do hot-reload costumava colapsar `[]` → `undefined`
("permitir tudo") — então editar `mcp.allowed` para `[]` esperando negar tudo deixava todos os servidores acessíveis. Correção:
`recomputeMcpGating` preserva `[]` (apenas uma chave **ausente** produz `undefined`), e `mcpGatingEqual`
distingue ausente (permitir tudo) de `[]` (negar tudo) para `allowed` — caso contrário, a alteração seria
comparada como igual e nunca reconciliaria. `excluded` / `pending` mantêm `undefined ≡ []` (ambos "sem entradas").

#### B — ferramenta não encontrada explica _por que_ um servidor está indisponível

`getMcpToolUnavailableMessage` anteriormente distinguia apenas "removido nesta sessão" vs "não configurado".
Com a admissão por gating, agora classifica o servidor proprietário via uma única API do core,
`Config.getMcpServerUnavailableReason(name)`, cobrindo todos os gates:

| reason             | meaning                                       | recovery the message suggests                     |
| ------------------ | --------------------------------------------- | ------------------------------------------------- |
| `removed`          | deletado da configuração mesclada nesta sessão | readicione-o às configurações                      |
| `not_allowed`      | filtrado por `mcp.allowed` / o limite da CLI  | adicione-o a `mcp.allowed`                         |
| `excluded`         | listado em `mcp.excluded`                     | remova-o de `mcp.excluded`                         |
| `pending_approval` | servidor gated aguardando aprovação (#4615)   | aprove-o (execute `/mcp`)                          |
| _(nenhum)_         | configurado e admitido                        | "ferramenta não encontrada" genuína (desconectada / renomeada) |

Duas alterações de suporte: um `getMergedMcpServers()` privado (a mesclagem **sem** o filtro da lista de permissões)
para que "configurado" possa ser distinguido de "filtrado"; e o rastreamento de remoção agora diferencia aquele
**mapa mesclado independente de gating**, o que significa que um servidor filtrado por uma lista de permissões restrita
não é mais relatado incorretamente como `removed` (é `not_allowed`). Isso também permite que o
parâmetro `prevEffectiveServerNames` adicionado para a correção anterior de restrição da lista de permissões seja removido
— o diff do mapa mesclado não é afetado pelos setters de gating que o chamador aplica imediatamente antes da reconciliação.

#### Arquivos chave (Parte F)

| Arquivo                                               | Alteração                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts` (`loadCliConfig`) | passar o valor da flag `--allowed-mcp-server-names` sozinho como `cliAllowedMcpServerNames`                                                                                                                                                                                                                               |
| `packages/core/src/config/config.ts`                  | campo `cliAllowedMcpServerNames` + `getCliAllowedMcpServerNames()` (K); `getMergedMcpServers()` (sem filtro) + `getMcpServerNames()`; `McpServerUnavailableReason` + `getMcpServerUnavailableReason()` (B); o rastreamento de remoção diff o mapa mesclado e `reinitializeMcpServers` remove o parâmetro `prevEffectiveServerNames` |
| `packages/cli/src/config/hot-reload.ts`               | `recomputeMcpGating` limita `allowed` ao limite da inicialização (K) e preserva `[]` (H); `mcpGatingEqual` faz `allowed` ausente ≠ `[]` (H)                                                                                                                                                                               |
| `packages/core/src/core/coreToolScheduler.ts`         | `getMcpToolUnavailableMessage` roteia por `getMcpServerUnavailableReason` (B)                                                                                                                                                                                                                                             |

#### Verificação (Parte F)

- `hot-reload.test.ts`: **K** — com uma flag de inicialização e nenhuma lista de permissões nas configurações, aplica a flag
  por completo; uma lista de permissões nas configurações é limitada à flag (não pode ampliar) e pode restringir dentro dela;
  sem a flag, as configurações vencem sem limites. **H** — `mcp.allowed: []` é propagado como negar tudo;
  `mcpGatingEqual` trata `allowed` ausente vs `[]` como diferentes (mas `excluded` undefined ≡ `[]`).
- `config.test.ts`: `getMcpServerUnavailableReason` retorna `not_allowed` / `excluded` /
  `pending_approval` / `removed` para cada gate, e `undefined` para um servidor configurado-admitido ou
  nunca configurado.
- `coreToolScheduler.test.ts`: a mensagem de ferramenta não encontrada nomeia o servidor correto e a ação de recuperação
  por motivo.

---

## Fora do escopo (outras sub-tarefas)

- **A reconexão completa do runtime LSP** (`NativeLspService.reinitialize()` +
  `Config.reinitializeLsp()` + fiação)—adiada para um MR posterior, veja o TODO da Parte C.
- O comando de barra `/reload` (#5)—chama `config.reinitializeMcpServers(currentSettings)` (a parte
  LSP se conecta quando sua primitiva chegar em um MR posterior) + recarga de skill/comando.
- `clearAllCaches()` (#4) e a notificação UI `needsRefresh` (#6).

## Arquivos chave

| Arquivo                                           | Alteração                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/config/config.ts`             | `setMcpServers()`, `setAllowedMcpServers()` + setter de pendente, `getMcpGating()` (retorna `{ excluded, allowed, pending }`), `reinitializeMcpServers()` (com um guarda de reconciliação em andamento)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/core/src/tools/mcp-client-manager.ts` | ① adicionar `removePromptsByServer()` a `removeServer()` e `removeRuntimeMcpServer()`; ② no caminho de pool compartilhado `runDiscoverAllMcpToolsViaPool` (`:1461`), adicionar a verificação `isMcpServerPendingApproval` antes de construir `desiredIds` / antes de adquirir (correspondendo à admissão de sessão única); ③ **adicionar diff de fingerprint ao caminho de sessão única**: um novo mapa `connectionFingerprints`; `discoverAllMcpToolsIncremental` também dispara desconexão+reconexão para um servidor que está "conectado mas seu `connectionIdOf` fingerprint mudou" (alinhado com o `desiredIds` do caminho de pool), limpando o mapa em cada caminho de teardown; ④ **limpar ferramentas/prompts antigos antes de reconectar**: quando `discoverMcpToolsForServerInternal` substitui um cliente existente, `removeMcpToolsByServer` + `removePromptsByServer` antes da rediscovery—porque `disconnect()` não toca no registro e `discover()` apenas anexa/sobrescreve por nome, caso contrário ferramentas removidas/renomeadas por uma mudança de configuração permaneceriam vinculadas a um cliente fechado (e permaneceriam também em caso de falha na rediscovery), correspondendo à limpeza existente em `removeServer` / `addRuntimeMcpServer` |
| `packages/cli/src/config/settingsSchema.ts`      | **pré-requisito**: virar as três chaves `mcpServers` (`:274`), `mcp.allowed`, `mcp.excluded` de `requiresRestart: true` para `false`, para que o watcher não suprime mais edições exclusivas de MCP; o pai `mcp` e `mcp.serverCommand` permanecem `true` (veja a nota "Pré-requisito duro" acima)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `packages/cli/src/config/hot-reload.ts` _(novo)_ | `registerMcpHotReload()`: reconstruir via `assembleMcpServers(..., topTierMcpServers)`; recalcular as listas de gating a partir das configurações atuais (veja "decisão de postura de admissão"); aplicar gating via `mcpServersEqual` + `mcpGatingEqual` (construídos sobre `fast-deep-equal`); debounce + coalescer e re-verificar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `packages/cli/package.json`                     | promover `fast-deep-equal` de dependência transitiva para **direta**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `packages/cli/src/gemini.tsx`                     | chamar `registerMcpHotReload` após `:785`; registrar o disposer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Testes _(junto com a virada do schema)_          | `settingsSchema.test.ts` fixa os valores de `requiresRestart` das três chaves MCP (incluindo `mcp` / `mcp.serverCommand` permanecendo `true`); `settingsWatcher.test.ts` adiciona duas regressões positivas ("editar apenas `mcpServers` / apenas `mcp.excluded` → ainda notificar"); `settingsUtils.test.ts` usa seu **próprio schema mock**, não relacionado à virada real, nenhuma alteração necessária                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
> Arquivos relacionados ao LSP (`NativeLspService.ts` / `NativeLspClient.ts` / `lsp/types.ts`) permanecem inalterados neste MR, veja o TODO da Parte C.

## Verificação

### A. Testes unitários de capacidade principal (core, `config.test.ts` / `mcp-client-manager.test.ts`)

1. `setMcpServers` é uma **substituição (não merge)** e entra em vigor após a inicialização (não lança mais exceção através da guarda `initialized`).
2. `reinitializeMcpServers` chama `setMcpServers` primeiro e depois `discoverAllMcpToolsIncremental`; chamar antes de `initialize()` é um **no-op seguro** (sem exceção, sem conexão).
3. Afirme que `removeServer()` / `removeRuntimeMcpServer()` agora chamam `removePromptsByServer()` (guarda de regressão de vazamento de prompts). Reutilize as fixtures de `mcp-client-manager.test.ts` (que já importam `connectionIdOf`).
   3b. **Diff de fingerprint de sessão única**: um cliente mock cujo `getStatus()` é sempre `CONNECTED`, execute `discoverAllMcpToolsIncremental` três vezes—a primeira conexão registra o fingerprint; a mesma config repetida **não** provoca churn (`connect` ainda 1×); alterar `args` in-place (fingerprint muda) → desconecta+reconecta (`disconnect` 1×, `connect` 2×). Garante que o caminho de sessão única não trata mais "conectado mas config mudou" como no-op (alinhado com `desiredIds` do pool compartilhado). Também afirme que esta execução chama `removeMcpToolsByServer` + `removePromptsByServer` para aquele servidor antes da rediscovery—garantindo "limpar ferramentas/prompts antigos antes de reconectar", evitando que ferramentas removidas/renomeadas por uma mudança de config persistam.

### A'. Guarda de integração watcher↔schema (cli, `settingsSchema.test.ts` / `settingsWatcher.test.ts`)

> Esses dois são quebras de integração de **alta** gravidade: uma edição apenas MCP é engolida pela comporta de supressão de restart-necessário do watcher, então o callback da Parte B nunca dispara. **Deve** haver cobertura real da camada do watcher; chamar diretamente o callback em `hot-reload.test.ts` não consegue capturar essa falha.

3c. **Pinçamento de schema** (`settingsSchema.test.ts`): `mcpServers` / `mcp.allowed` / `mcp.excluded` têm `requiresRestart` `false`; o pai `mcp` e `mcp.serverCommand` são `true`. Impede que alguém altere chaves MCP de volta para restart-necessário e mate silenciosamente todo o hot-reload.
3d. **Watcher real não suprime mais** (`settingsWatcher.test.ts`, com um `SettingsWatcher` real - mock fs): editar apenas `mcpServers` / apenas `mcp.excluded` cada um dispara **um** `SettingsChangeEvent` (seria suprimido antes da alteração). Esta é a guarda de regressão de ponta a ponta que garante que o listener da sub-tarefa 3 possa realmente disparar.

### B. Testes unitários dos ramos da comporta do assinante (cli, `hot-reload.test.ts`)

Simule um `SettingsWatcher`, cobrindo cada ramo da comporta:

4. **Mudanças em `mcpServers`** → chame `reinitializeMcpServers` com o mapa **montado** (incluindo top-tier).
5. **Editar apenas `mcp.excluded` (ou `mcp.allowed` / pending), deixar `mcpServers` intocado** → **ainda** dispara reconcile, e antes do reconcile já chamou `setExcludedMcpServers` / `setAllowedMcpServers` / `setPendingMcpServers`. Isso verifica o ramo `mcpGatingEqual`—a lacuna corrigida: diferenciar apenas `mcpServers` perderia essa mudança.
6. **Nem `mcpServers` nem as listas de comporta `mcp` mudaram** (ex.: edição de tema / skills) → **não** chama `reinitializeMcpServers` (verifica o retorno antecipado quando ambas as comportas estão "inalteradas").
7. **Duas mudanças disparadas durante um reconcile em andamento** → coalesce-and-recheck executa mais uma vez (reentrância).
8. **Debounce**: múltiplos salvamentos consecutivos (< 300ms) disparam reconcile **uma vez** (alinhado com o debounce de 300ms do watcher).

### C. Testes unitários de funções puras auxiliares de comporta (cli, `hot-reload.test.ts`)

9. `mcpServersEqual`: ordem de chaves diferente, mesmos valores → `true`; campos de config aninhados (`args` / `env` / `headers`) mudam → `false`; `undefined` vs `{}` → `true`; adicionar/remover um servidor → `false`; ordem do array `args` muda → `false` (a ordem dos argumentos de comando tem significado).
10. `mcpGatingEqual`: as três listas comparam "independente de ordem" (`['a','b']` vs `['b','a']` → `true`); adicionar/remover um item em qualquer lista → `false`; `undefined` vs `[]` → `true`.

### D. Casos de borda de limite de confiança (cli + core)

> Ambos são pontos de limite de confiança de **alta** gravidade. O item 11 verifica o limite de admissão (Parte F item K — as configurações restringem dentro, nunca ampliam além do flag de inicialização); o item 12 corresponde ao item 4 da Parte A (verificação pendente do caminho do pool).

11. **Admissão hot-reload restringe dentro — mas nunca amplia além — do flag de inicialização** (o limite da Parte F item K; substitui a postura anterior de "configurações podem ampliar"). Inicie com `--allowed-mcp-server-names=a,b`; então uma mudança de configuração define `mcp.allowed` como `[a, b, c]`. **Afirme**: após reconcile, `c` **ainda está excluído** (limitado ao limite de inicialização) enquanto `a` é admitido; uma edição de configurações restringindo para `[a]` entra em vigor; sem flag de inicialização, a lista de permissão das configurações vence sem limites. (Veja Parte F → Verificação para a matriz completa.)
    _Guarda_: `recomputeMcpGating` faz interseção da lista de permissão das configurações com `getCliAllowedMcpServerNames()` e nunca amplia além dela.

12. **A comporta de aprovação pendente não é contornada no modo de pool compartilhado** (alto risco: conectar um servidor com comporta antes da aprovação). No modo daemon / pool compartilhado (`runDiscoverAllMcpToolsViaPool`), deixe um hot-reload de configurações adicionar/editar um servidor pendente de aprovação (`.mcp.json` / workspace). **Afirme**: antes da aprovação do usuário, ele **não** adquire uma conexão de pool nem inicia o processo; um servidor com comporta rejeitado permanece desconectado. Comparado ao caminho de sessão única que já pula pendentes, este teste guarda o caminho do pool.
    _Guarda_: Parte A item 4—a verificação `isMcpServerPendingApproval` do caminho do pool antes de construir `desiredIds` / antes de adquirir.

### E. Casos de borda de reconcile (cobertura recomendada, verificando "incremental, não limpeza total")

13. **Vazio ↔ não vazio**: de 0 servidores para 1 (o primeiro), de 1 para 0 (o último) ambos reconciliam corretamente, sem deixar conexão / ferramentas / prompts residuais.
14. **Uma mudança de fingerprint afeta apenas aquele servidor**: alterar `command` / `url` / `env` / `headers` de um servidor → apenas ele desconecta+reconecta, **todas as outras conexões mantidas** (verifica que não há limpeza total, nem lacuna de "0 ferramentas").
15. **Diretório não confiável**: quando `isTrustedFolder()` é falso, hot-reload é um no-op (não estabelece conexão).
16. **Alternância de `mcp.excluded`**: adicionar um servidor online ao excluído → ele desconecta + ferramentas/prompts limpos; removê-lo do excluído → ele reconecta.