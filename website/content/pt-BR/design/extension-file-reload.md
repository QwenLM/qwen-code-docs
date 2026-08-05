# Design de Recarregamento de Arquivos de Extensão

## Contexto

As alterações de extensão atualmente entram no runtime a partir de duas direções
diferentes. Mutações de UI iniciadas pelo usuário, como habilitar, desabilitar,
instalar, desinstalar e atualizar, já passam pelo `ExtensionManager` e podem
atualizar o estado do runtime diretamente. Alterações fora de banda do sistema de
arquivos, como editar `skills/`, `commands/`, `hooks/` ou `qwen-extension.json` de
uma extensão instalada, não são de propriedade de uma única ação da UI e,
portanto, precisam de um caminho orientado por watcher.

Este design adiciona esse caminho de watcher ausente enquanto preserva o caminho
de mutação direta. Ele segue o mesmo camadas usado pelos designs de hot-reload do
MCP e LSP:

- a CLI decide quando alterações do sistema de arquivos devem disparar um
  recarregamento ou uma notificação ao usuário;
- o Core é proprietário de como o estado do runtime de extensão é atualizado;
- componentes de UI consomem um pequeno objeto de evento/estado em vez de fazer
  polling de arquivos de extensão diretamente.

A restrição chave é que nem todo arquivo de extensão pode ser aplicado com
segurança a quente da mesma forma. Arquivos de capability do tipo conteúdo podem
ser atualizados automaticamente, mas alterações de nível de pacote devem pedir ao
usuário para executar `/reload-plugins` para que o cache de extensão, ferramentas
do runtime, hooks, arquivos de contexto e lista de comandos slash sejam
reconstruídos a partir de um único snapshot coerente.

## Avaliação do Código Atual

- O `ExtensionManager` já carrega manifestos de extensão, diretórios de convenção,
  metadados de instalação, estado de habilitação, estado de fonte de marketplace,
  comandos, skills, agentes, hooks, declarações MCP e declarações LSP.
- Operações de extensão da UI já chamam `ExtensionManager.refreshTools()` após
  alterar estado relevante ao runtime. Esse caminho atualiza MCP, skills,
  subagentes, hooks e memória hierárquica por meio do Core.
- O autocompletar de comandos slash é construído por `CommandService.create()` a
  partir de carregadores. Comandos de extensão e comandos slash baseados em skill
  não aparecem automaticamente a menos que `reloadCommands()` reconstrua esse
  serviço de comandos.
- Gerenciadores de skill e subagente têm APIs de atualização de cache, mas esses
  caches são separados do autocompletar de comandos slash.
- Hooks são de propriedade de `HookSystem` e `HookRegistry`. Recriar todo o
  sistema de hooks perderia hooks temporários com escopo de agente, então o
  recarregamento deve mirar apenas hooks configurados.
- `SettingsWatcher` e watchers MCP/LSP existentes não cobrem conteúdo de pacote de
  extensão instalada. Arquivos específicos de extensão precisam de seu próprio
  watcher.
- Extensões vinculadas podem viver fora do diretório de extensões do usuário,
  então observar apenas `~/.qwen/extensions` perde fluxos de trabalho de
  desenvolvimento ativo.

## Objetivos

Fazer alterações de extensão terem efeito na sessão interativa atual sem uma
reinicialização completa da CLI:

- manter mutações de extensão da UI imediatamente efetivas;
- detectar edições, adições e remoções manuais de extensão sob o diretório de
  extensões do usuário;
- detectar edições em diretórios de origem de extensão vinculados;
- atualizar automaticamente arquivos de capability de nível de conteúdo sob
  `commands/`, `skills/` e `agents/`;
- pedir ao usuário para executar `/reload-plugins` para alterações de nível de
  pacote;
- atualizar hooks como parte do recarregamento do runtime sem perder hooks com
  escopo de agente;
- manter o autocompletar de comandos slash em sincronia com alterações de comando
  e skill;
- suprimir notificações de watcher para alterações escritas pelas próprias
  mutações de extensão do Qwen;
- surfacar falhas de recarregamento de MCP e hook em vez de reportar um resumo de
  recarregamento bem-sucedido enganoso.

## Não objetivos

- Não tornar edições de arquivos de hook auto-atualizáveis como conteúdo.
  Comportamento de hook pode afetar execução de comandos e fluxos de trabalho
  sensíveis à segurança, então edições de hook são tratadas como alterações de
  nível de pacote.
- Não recarregar a quente arquivos de extensão arbitrários. Arquivos desconhecidos
  são ignorados a menos que sejam arquivos de contexto resolvidos.
- Não adicionar reinício MCP incremental por extensão. Este design continua a usar
  o ponto de entrada de reinicialização MCP existente.
- Não alterar descoberta de extensão, conversão, análise de fonte de instalação ou
  semânticas de marketplace.
- Não suportar alternância em runtime do modo bare. O watcher simplesmente não é
  iniciado no modo bare.

## Estrutura de Código

A implementação é intencionalmente dividida por camada.

```text
packages/core/src/extension/
  extensionManager.ts
    Extension mutation lifecycle events.
    UI mutation methods still own direct runtime refresh.

  extension-runtime-refresh.ts
    Core runtime refresh contract for extension mutations.

packages/core/src/hooks/
  hookRegistry.ts
    Reload configured hooks while preserving agent-scoped hooks.

  hookSystem.ts
    Public hook reload facade used by extension runtime refresh.

packages/cli/src/config/
  extension-refresh-state.ts
    Shared event/state object for watcher, slash processor, and reload command.

  extension-file-watcher.ts
    Filesystem watcher and path classifier.

  extension-runtime-reload.ts
    CLI reload helpers for /reload-plugins and content auto-refresh.

packages/cli/src/ui/commands/
  reload-plugins-command.ts
    Interactive slash command for package-level extension reload.

packages/cli/src/ui/hooks/
  slashCommandProcessor.ts
    Event consumers for stale notifications and content auto-refresh.

packages/cli/src/
  gemini.tsx
  ui/AppContainer.tsx
  ui/startInteractiveUI.tsx
    Startup and dependency injection for ExtensionRefreshState and watcher.
```

## Design

### 1. Classificar Alterações do Sistema de Arquivos

`ExtensionFileWatcher` mapeia um evento chokidar para um dos três resultados:

```ts
type RefreshAction = 'auto' | 'stale' | false;
```

A classificação é deliberadamente conservadora.

| Classe de caminho                  | Ação    | Razão                                                                                          |
| ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `commands/**`                      | `auto`  | Carregadores de comando slash podem reconstruir a partir do cache de extensão existente.      |
| `skills/**`                        | `auto`  | Cache de skill e carregadores de comando slash podem reconstruir sem alterar identidade do pacote. |
| `agents/**`                        | `auto`  | Cache de subagente pode reconstruir sem alterar identidade do pacote.                          |
| `hooks/**`                         | `stale` | Comportamento de execução de hook deve ser recarregado de um snapshot de pacote coerente.      |
| `qwen-extension.json`              | `stale` | Manifesto pode alterar comandos, skills, agentes, hooks, MCP, LSP, nomes de arquivos de contexto e metadados. |
| `.qwen-extension-install.json`     | `stale` | Metadados de instalação afetam raízes de origem vinculadas e identidade do pacote.             |
| arquivos de contexto configurados  | `stale` | Contexto do modelo pode mudar e deve ser recarregado explicitamente.                           |
| adição/remoção de diretório de extensão | `stale` | Topologia de extensão instalada mudou.                                                    |
| arquivos de config de extensão de nível superior | `stale` | Habilitação, preferências ou marketplaces mudaram fora do caminho de mutação da UI. |
| arquivos desconhecidos             | ignorado | Evita atualizar por artefatos de build ou dados não relacionados.                          |

O mesmo classificador é usado para extensões instaladas pelo usuário e raízes de
origem de extensão vinculadas. Para raízes vinculadas, o watcher primeiro encontra
a extensão vinculada proprietária e então classifica o caminho relativo àquela
raiz de origem.

### 2. Observar Raízes de Extensão do Usuário e Vinculadas

`ExtensionFileWatcher.startWatching()` constrói raízes de observação a partir de:

1. `Storage.getUserExtensionsDir()`, quando existe;
2. caminhos de origem de extensão vinculados ativos a partir de metadados de
   instalação;
3. o pai do diretório de extensões do usuário, apenas quando o diretório de
   extensão ainda não existe.

O watcher de bootstrap pai cobre a primeira instalação de extensão ou criação
manual do diretório de extensão após a inicialização. Quando o diretório aparece,
o watcher marca o estado de extensão como obsoleto e agenda `restartWatching()` em
uma microtarefa. Agendar o reinício evita fechar o watcher de bootstrap enquanto o
chokidar ainda está despachando o evento.

Opções do watcher:

```ts
watchFs(roots, {
  ignoreInitial: true,
  followSymlinks: false,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 50,
  },
  ignored: (filePath) => this.isIgnored(filePath),
});
```

`followSymlinks: false` impede que uma extensão faça o Qwen observar caminhos
externos arbitrários por meio de symlinks. O filtro de ignore pula `node_modules`,
`.git`, arquivos comuns de backup de editor, arquivos de troca, arquivos
temporários e `.DS_Store`.

### 3. Compartilhar Estado de Recarregamento por meio de ExtensionRefreshState

`ExtensionRefreshState` é o pequeno primitivo de evento/estado compartilhado pelo
watcher, o processador de comandos slash e `/reload-plugins`.

Métodos chave:

```ts
markExtensionsChanged(reason?: string): boolean;
markExtensionContentChanged(reason?: string): boolean;
clearExtensionsChanged(): void;
notifyExtensionsReloadStarted(): void;
needsExtensionRefresh(): boolean;
beginSuppression(onSettle?: () => void): () => void;
suppressNotifications<T>(fn: () => T, onSettle?: () => void): T;
```

Eventos:

| Evento                    | Produtor                                | Consumidor                  | Significado                                                             |
| ------------------------- | --------------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| `ExtensionContentChanged` | `ExtensionFileWatcher`                  | `useSlashCommandProcessor`  | Arquivos de nível de conteúdo mudaram; agendar atualização automática.  |
| `ExtensionRefreshNeeded`  | `ExtensionFileWatcher`                  | `useSlashCommandProcessor`  | Estado de nível de pacote mudou; dizer ao usuário para executar `/reload-plugins`. |
| `ExtensionsReloadStarted` | `/reload-plugins`                       | `useSlashCommandProcessor`  | Cancelar timers de atualização de conteúdo pendentes antes do recarregamento manual. |
| `ExtensionsReloaded`      | `/reload-plugins`, caminho de reinício do watcher | watcher e processador slash | Limpar flags obsoletos e reiniciar/cancelar trabalho pendente. |

`markExtensionsChanged()` deduplica notificações obsoletas até que o estado seja
limpo. Notificações de alteração de conteúdo não são deduplicadas por este objeto
de estado, porque o processador de comandos slash é proprietário do debounce e da
serialização.

### 4. Suprimir Ruído do Watcher Durante Mutações Programáticas

`ExtensionManager` expõe:

```ts
interface ExtensionMutationEvent {
  id: number;
  phase: 'start' | 'end';
  operation: string;
}

addMutationListener(listener: ExtensionMutationListener): () => void;
```

Métodos de mutação relevantes ao runtime chamam `beginMutation()` e sempre emitem
um evento de fim correspondente em `finally`.

Métodos que emitem eventos de mutação:

- `enableExtension()`
- `disableExtension()`
- `installExtension()`
- `uninstallExtension()`
- `updateExtension()`
- `addSource()`
- `removeSource()`
- `setExtensionScope()`
- `setMcpServerDisabled()`

Métodos que não emitem eventos de mutação:

- `toggleFavorite()`
- `markSourceUpdated()`

O watcher mantém `mutation id -> callback de supressão de fim` em um `Map`. Isso é
importante porque a instalação pode disparar habilitação internamente, e mutações
separadas podem se sobrepor. Emparelhar por id evita depender da ordem da pilha.

Quando a profundidade de supressão externa chega a zero, o watcher reinicia. Isso
atualiza raízes de origem vinculadas, nomes de arquivos de contexto e metadados de
extensão ativa após a mutação se estabilizar.

### 5. Atualizar Estado do Runtime a partir do Core

`refreshExtensionRuntime()` é o ponto de entrada de atualização do runtime no lado
do Core usado por mutações de UI de extensão.

Ele atualiza nesta ordem:

1. `config.reinitializeMcpServers(config.getSettingsMcpServers())`
2. `config.getSkillManager()?.refreshCache()`
3. `config.getSubagentManager().refreshCache()`
4. `config.getHookSystem()?.reload()`
5. `config.refreshHierarchicalMemory()`

A reinicialização do MCP é executada primeiro porque descrições de ferramentas de
skill e subagente podem depender da lista de ferramentas MCP atualizada.

Skills, subagentes e hooks são executados por meio de `Promise.allSettled()` para
que uma perna rejeitada não impeça as outras de serem aplicadas. Falha de
recarregamento de hook é armazenada e relançada após a memória hierárquica ter
tido a chance de atualizar. Isso mantém falhas de hook visíveis enquanto ainda
aplica atualizações de cache em melhor esforço.

Contrato de falha:

- Falha de MCP propaga imediatamente e pernas subsequentes do runtime não são
  executadas.
- Falha de recarregamento de hook propaga após as pernas de atualização paralela e
  atualização de memória se estabilizarem.
- Falha de atualização de skill é logada e em melhor esforço.
- Falha de atualização de subagente é logada e em melhor esforço.
- Falha de atualização de memória hierárquica é logada e em melhor esforço.

### 6. Recarregar Alterações de Nível de Pacote com /reload-plugins

`reloadPluginsRuntime()` é o helper de recarregamento do runtime no lado da CLI
usado pelo comando slash:

```ts
async function reloadPluginsRuntime(options: {
  config: Config;
  reloadCommands?: () => void | Promise<void>;
}): Promise<ReloadPluginsSummary>;
```

Fluxo:

1. `config.getExtensionManager().refreshCache()`
2. `config.getExtensionManager().refreshTools()`
3. `reloadCommands()`
4. resumir capabilities de extensão ativas

O resumo conta declarações de extensão ativas para:

- extensões;
- comandos;
- skills;
- agentes;
- hooks;
- servidores MCP de extensão;
- servidores LSP de extensão.

`/reload-plugins` é proprietário do comportamento do comando voltado ao usuário:

1. exige `config`;
2. emite `ExtensionsReloadStarted`;
3. chama `reloadPluginsRuntime()`;
4. chama `clearExtensionsChanged()` em sucesso ou falha;
5. retorna um resumo informativo localizado ou uma mensagem de erro.

Limpar o estado obsoleto em falha é intencional. Se um recarregamento com falha
deixasse `extensionRefreshNeeded = true`, notificações futuras do watcher de
arquivos seriam deduplicadas e a atualização automática de conteúdo continuaria a
contornar a si mesma.

### 7. Atualizar Automaticamente Alterações de Nível de Conteúdo

`refreshExtensionContentRuntime()` é usado para alterações de sistema de arquivos
apenas de conteúdo.

Fluxo:

1. atualizar cache de extensão;
2. atualizar cache de skill;
3. atualizar cache de subagente;
4. recarregar comandos slash;
5. agregar erros e lançar uma única mensagem se qualquer perna falhou.

O processador de comandos slash escuta `ExtensionContentChanged` e faz debounce da
atualização em 250 ms. Ele serializa atualizações com:

```ts
extensionContentRefreshRunningRef;
extensionContentRefreshPendingRef;
```

Se um evento de conteúdo chega enquanto uma atualização está em execução, o
processador marca outra passada como pendente e executa essa passada após a atual
terminar. Um pequeno limite superior impede que um editor ou processo de build
ruidoso mantenha a mesma tarefa de atualização viva indefinidamente.

Se `ExtensionRefreshState.needsExtensionRefresh()` é verdadeiro, a atualização
automática de conteúdo sai cedo. O recarregamento de nível de pacote deve ser
executado primeiro para que estado de comando, skill, agente, hook, MCP, LSP e
contexto sejam reconstruídos a partir de um snapshot de cache de extensão.

### 8. Recarregar Hooks sem Descartar Hooks com Escopo de Agente

`HookRegistry.reloadConfiguredHooks()` substitui apenas entradas de hook
configuradas. Ele preserva entradas com `agentScope !== undefined`, porque essas
são hooks temporários registrados para execução de subagente.

Fluxo:

1. salvar `previousEntries`;
2. manter `agentEntries`;
3. definir entradas do registro como `agentEntries`;
4. executar `processHooksFromConfig()`;
5. em falha, restaurar `previousEntries` e relançar.

`HookSystem.reload()` é uma fachada estreita que delega para
`hookRegistry.reloadConfiguredHooks()`. O recarregamento do runtime, portanto, não
precisa recriar todo o sistema de hooks.

Este caminho de recarregamento não relê arquivos de configurações de usuário ou
projeto do disco. `processHooksFromConfig()` reprocessa os valores atuais de
`Config` para hooks de usuário/projeto e os valores atualizados de configuração de
extensão. O recarregamento de arquivos de configurações permanece de propriedade
do caminho de recarregamento de configurações; `/reload-plugins` tem escopo no
estado do runtime de extensão.

### 9. Integrar o Estado na UI Interativa

A inicialização interativa cria um `ExtensionRefreshState` compartilhado:

```ts
const extensionRefreshState = new ExtensionRefreshState();
const extensionFileWatcher = isBareMode(argv.bare)
  ? undefined
  : new ExtensionFileWatcher(config, undefined, extensionRefreshState);
```

Esse estado é passado por meio de:

```text
gemini.tsx
  -> startInteractiveUI(...)
    -> AppContainer
      -> useSlashCommandProcessor
      -> CommandContext.services.extensionRefreshState
```

`AppContainer` cria um `ExtensionRefreshState` de fallback apenas quando um não
foi fornecido. Isso mantém testes e pontos de entrada de UI alternativos simples
enquanto o caminho interativo principal compartilha estado entre o watcher e o
processamento de comandos slash.

A limpeza desregistra o listener de recarregamento e para o watcher.

## Fluxos de Eventos

### Edição de Arquivo de Conteúdo

```text
edit extension commands/skills/agents file
  -> ExtensionFileWatcher classifies as auto
  -> ExtensionRefreshState.markExtensionContentChanged()
  -> useSlashCommandProcessor schedules debounced refresh
  -> refreshExtensionContentRuntime()
      -> ExtensionManager.refreshCache()
      -> SkillManager.refreshCache()
      -> SubagentManager.refreshCache()
      -> reloadCommands()
```

### Edição de Arquivo de Nível de Pacote

```text
edit qwen-extension.json/hooks/context/install metadata/topology
  -> ExtensionFileWatcher classifies as stale
  -> ExtensionRefreshState.markExtensionsChanged()
  -> useSlashCommandProcessor prints:
       "Extensions changed on disk. Run /reload-plugins to apply updates."
  -> user runs /reload-plugins
  -> reloadPluginsRuntime()
      -> ExtensionManager.refreshCache()
      -> ExtensionManager.refreshTools()
      -> reloadCommands()
```

### Mutação da UI

```text
user enables/disables/installs/uninstalls/updates extension
  -> ExtensionManager emits mutation start
  -> ExtensionRefreshState begins suppression
  -> ExtensionManager writes disk/runtime state
  -> ExtensionManager.refreshTools()
      -> refreshExtensionRuntime()
  -> ExtensionManager emits mutation end
  -> suppression settles
  -> ExtensionFileWatcher restarts with fresh roots/context files
```

## Concorrência e Ordenação

- Reinícios de watcher são protegidos por guarda de geração. Eventos de uma
  instância antiga de watcher são ignorados após `watchGeneration` mudar.
- Supressão de mutação é emparelhada por id de mutação, não ordem da pilha.
- `stopWatching()` encerra todas as supressões pendentes antes de descartar
  referências de watcher, de modo que a profundidade de supressão não possa vazar
  quando o watcher é parado enquanto uma mutação está em andamento.
- Atualização automática de conteúdo é serializada no processador de comandos
  slash. Eventos concorrentes coalescem em no máximo uma reexecução pendente.
- `/reload-plugins` emite `ExtensionsReloadStarted` e `ExtensionsReloaded` para que
  timers de atualização de conteúdo pendentes sejam cancelados em torno do
  recarregamento manual.
- Estado obsoleto de nível de pacote vence sobre atualização automática de
  conteúdo. Se um recarregamento obsoleto é necessário, a atualização automática
  de conteúdo sai e aguarda `/reload-plugins`.

## Semânticas de Falha

| Caminho                                               | Comportamento                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Reinicialização de MCP em mutação ou `/reload-plugins` | Propaga. Uma mensagem de sucesso seria enganosa porque ferramentas MCP de extensão podem estar indisponíveis.                          |
| Recarregamento de hook em mutação ou `/reload-plugins` | Propaga após outras pernas de atualização paralela se estabilizarem. Um resumo de sucesso seria enganoso porque hooks configurados podem não estar registrados. |
| Atualização de cache de skill durante mutação         | Logada e em melhor esforço.                                                                                                                |
| Atualização de cache de subagente durante mutação     | Logada e em melhor esforço.                                                                                                                |
| Atualização de memória hierárquica durante mutação    | Logada e em melhor esforço. Não deve fazer rollback de estado de extensão já escrito.                                                     |
| Falha de atualização automática de conteúdo           | Agregada e mostrada na UI com um fallback de `/reload-plugins`.                                                                            |
| Falha de `/reload-plugins`                            | Retorna uma mensagem de erro e limpa o estado obsoleto para que notificações futuras do watcher possam disparar novamente.                 |
| Falha de recarregamento do registro de hooks          | Restaura entradas de hook anteriores e relança.                                                                                            |
| Erro de watcher                                       | Logado pelo logger de depuração; a sessão continua.                                                                                        |

## Testes

### Testes do Core

`packages/core/src/extension/extension-runtime-refresh.test.ts`

- retorna cedo sem config;
- atualiza MCP antes de skills/subagentes/hooks/memória;
- propaga falhas de reconciliação de MCP;
- mantém falha de atualização de skill em melhor esforço;
- propaga falhas de recarregamento de hook após outras pernas de atualização se
  estabilizarem;
- mantém falha de memória hierárquica em melhor esforço.

`packages/core/src/extension/extensionManager.test.ts`

- emite início/fim de mutação em torno de desabilitação;
- emite fim de mutação quando a desabilitação falha;
- emite início/fim de mutação em torno de instalação, incluindo eventos de
  habilitação aninhados;
- emite início/fim de mutação em torno de desinstalação;
- emite início/fim de mutação em torno de falha de diretório temporário de
  atualização;
- não emite eventos de mutação para alterações de favorito ou atualizações de
  timestamp de origem;
- preserva cobertura existente de carregamento de extensão, descoberta de
  comandos, carregamento de hooks e refreshTools.

`packages/core/src/hooks/hookRegistry.test.ts`

- recarrega hooks configurados;
- preserva hooks com escopo de agente durante o recarregamento;
- restaura entradas anteriores quando o recarregamento de hook configurado falha.

`packages/core/src/hooks/hookSystem.test.ts`

- delega recarregamento ao registro de hooks.

### Testes da CLI

`packages/cli/src/config/extension-refresh-state.test.ts`

- emite eventos de atualização obsoleta uma vez até serem limpos;
- emite eventos de atualização de conteúdo;
- suprime notificações durante supressão de mutação;
- limpa estado obsoleto e janelas de supressão corretamente.

`packages/cli/src/config/extension-file-watcher.test.ts`

- classifica commands, skills e agents como atualização automática;
- classifica manifestos, metadados de instalação, hooks, arquivos de contexto e
  alterações de topologia de extensão como obsoletos;
- ignora arquivos desconhecidos e diretórios ignorados;
- observa origens de extensão vinculadas;
- suprime notificações durante mutação programática;
- reinicia observação após estabilização da mutação;
- trata criação tardia do diretório de extensão.

`packages/cli/src/config/extension-runtime-reload.test.ts`

- recarrega cache de extensão, ferramentas do runtime e comandos slash para
  `/reload-plugins`;
- resume capabilities de extensão ativas;
- atualiza componentes do runtime de conteúdo;
- agrega falhas de atualização automática de conteúdo.

`packages/cli/src/ui/commands/reload-plugins-command.test.ts`

- registra o comando como comportamento apenas interativo;
- retorna um erro quando config está ausente;
- recarrega o runtime e limpa o estado obsoleto em sucesso;
- limpa o estado obsoleto em falha e retorna um erro.

`packages/cli/src/services/BuiltinCommandLoader.test.ts`

- inclui `/reload-plugins` no carregamento de comandos embutidos.

### Verificação Manual

A verificação manual deve cobrir:

1. Habilitar uma extensão da UI e confirmar que comandos, skills, agentes, MCP,
   hooks e contexto são atualizados sem reiniciar.
2. Desabilitar a mesma extensão e confirmar que capabilities do runtime são
   removidas ou não são mais oferecidas.
3. Editar um arquivo de comando sob `commands/` e confirmar que o autocompletar
   de comandos slash é atualizado automaticamente.
4. Editar um arquivo de skill sob `skills/` e confirmar que o autocompletar de
   comandos slash baseados em skill é atualizado automaticamente.
5. Editar um arquivo de agente sob `agents/` e confirmar que o comportamento do
   cache de agente reflete a alteração.
6. Editar `hooks/hooks.json`, `qwen-extension.json`, metadados de instalação,
   arquivos de contexto ou topologia de diretório de extensão e confirmar que a
   UI pede `/reload-plugins`.
7. Executar `/reload-plugins` e confirmar que o resumo reporta extensões,
   comandos, skills, agentes, hooks, servidores MCP de extensão e servidores LSP
   de extensão.
8. Forçar uma falha de recarregamento e confirmar que a UI reporta o erro, então
   uma alteração posterior do sistema de arquivos ainda pode disparar outra
   notificação.

## Compromissos

- Hooks são tratados como alterações obsoletas de nível de pacote mesmo que uma
  API de recarregamento de hook configurado exista. Isso evita alterar
  silenciosamente o comportamento de execução de hook a partir de um evento de
  sistema de arquivos em segundo plano.
- Atualização de MCP permanece reinicialização completa do runtime. Reinício MCP
  incremental por extensão reduziria custo mas expandiria este PR para lógica de
  propriedade e reconciliação de MCP.
- O watcher classifica arquivos desconhecidos como ignorados em vez de obsoletos.
  Isso reduz ruído para artefatos de build mas significa que autores de extensão
  devem colocar arquivos de capability do runtime nos diretórios de convenção
  suportados.
- Raízes de extensão vinculadas são observadas diretamente. Isso melhora a
  ergonomia de autoria mas pode aumentar a contagem de watcher para usuários com
  muitas extensões vinculadas.

## Trabalho Futuro

- Adicionar reconciliação MCP incremental por extensão.
- Adicionar diagnósticos visíveis ao usuário para erros fatais de watcher como
  `ENOSPC` ou `EMFILE`.
- Considerar um resultado de recarregamento tipado de `refreshExtensionRuntime()`
  se chamadores precisarem de resumos de sucesso parcial.
- Otimizar busca de origem de extensão vinculada com um mapa de raízes
  pré-computado se muitas extensões vinculadas se tornarem comuns.
- Revisitar atualização automática de conteúdo de hook apenas se o recarregamento
  de hook puder ser tornado explícito, observável e seguro o suficiente para
  aplicação em segundo plano.
