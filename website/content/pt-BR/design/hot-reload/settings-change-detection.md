# Detecção de Alterações no Arquivo de Configurações (Issue #3696 Sub-tarefa 1)

## Contexto

O Qwen Code atualmente não possui um mecanismo de detecção de alterações no arquivo de configurações. Os usuários precisam reiniciar a sessão após modificar `settings.json` para que as alterações tenham efeito. Esta proposta implementa a camada de infraestrutura para o sistema de recarga a quente (hot-reload) da #3696 — detecção automática e despacho de eventos para alterações no arquivo de configurações.

**Escopo**: Esta sub-tarefa é responsável apenas por "detectar alterações no arquivo → recarregar → notificar os ouvintes". O `Config` copia muitos campos de configurações no momento da construção (`approvalMode`, `mcpServers`, `telemetry`, etc.), e esses snapshots NÃO são atualizados automaticamente por esta sub-tarefa. Apenas consumidores que leem `LoadedSettings.merged` em tempo real (por exemplo, o hook `useSettings()`, `disabledSkillNamesProvider`) verão as alterações imediatamente. Outras sub-tarefas (reconexão MCP, comando `/reload`) são responsáveis por enviar atualizações para o estado interno do `Config`.

## Decisões de Arquitetura

### Localização do Módulo: `packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` e os caminhos dos arquivos de configuração estão ambos em `packages/cli`
- `reloadScopeFromDisk()` é um método em `LoadedSettings`
- O pacote principal recebe apenas uma interface de ciclo de vida mínima `{ stopWatching(): void }`, sem importar tipos CLI como `SettingScope`
- O despacho de eventos de alteração e a lógica de atualização downstream são inteiramente conectados na camada CLI

### Estratégia de Monitoramento: Observar Diretório Pai + Filtragem Estrita de Caminho

O fluxo de escrita `writeWithBackupSync` é `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)`, o que faz com que o arquivo alvo desapareça brevemente. Observar diretamente o caminho do arquivo faria com que o chokidar perdesse o monitoramento. Portanto, observamos o diretório pai (`depth: 0`) e filtramos por **correspondência exata do nome do arquivo**, respondendo apenas a eventos do arquivo `settings.json` e ignorando `.tmp`, `.orig`, arquivos temporários do editor, etc. O backup `.orig` é uma rede de segurança durante a operação e é **removido em caso de sucesso** (etapa final `unlink`), portanto nunca permanece no diretório do usuário.

### Tratamento Preguiçoso de Diretório: Nunca Criar `.qwen/` na Inicialização

> **Efeito colateral no sistema de arquivos na inicialização (intencionalmente evitado).** O observador (watcher) nunca deve criar `<projeto>/.qwen/` (ou `~/.qwen/`) apenas para poder observá-lo. Uma versão anterior chamava `mkdirSync({ recursive: true })` para qualquer diretório de configurações ausente, o que significava que uma inicialização normal não-bare criava silenciosamente `<projeto>/.qwen/` mesmo em projetos que nunca tiveram configurações do Qwen — poluindo o workspace e o status do git. A criação de diretórios é de propriedade exclusiva da _persistência_ de configurações (`saveSettings()` faz seu próprio `mkdirSync` quando o usuário realmente escreve configurações).

Para ainda detectar um `settings.json` adicionado posteriormente na sessão sem criar o diretório e sem percorrer recursivamente a árvore do projeto, o observador usa uma estratégia de dois estágios, por escopo, baseada na existência do **diretório**:

- **`.qwen` existe na inicialização** → observá-lo diretamente (`watchTargetDir`, a estratégia acima).
- **`.qwen` ausente** → **observação de inicialização (bootstrap) do pai** (`watchParentForDir`): `chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })` onde o predicado `ignored` `(p) => p !== parentDir && basename(p) !== '.qwen'` permite **apenas** a entrada `.qwen`. Isso suprime toda a agitação não relacionada no nível superior e nunca percorre recursivamente. Quando `.qwen` aparece, o observador **promove**: fecha o observador de inicialização e inicia um observador alvo em `.qwen`, então agenda uma atualização para capturar um `settings.json` que já pode estar lá dentro.

Detalhes de robustez:

- **Proteção TOCTOU**: após armar o observador de inicialização (que usa `ignoreInitial`), `existsSync(dir)` é verificado novamente; se `.qwen` foi criado na lacuna, a promoção ocorre imediatamente.
- **Rebaixamento na remoção**: se o próprio `.qwen` for excluído (`unlinkDir`), o observador alvo rebaixa de volta para um observador de inicialização pai para que uma recriação posterior ainda seja detectada.
- **Proteção de geração**: `close()` do chokidar é assíncrono, então um callback `'all'` obsoleto de um observador sendo derrubado poderia, de outra forma, reativar a promoção e empilhar observadores. Um token de geração monotônico por escopo (incrementado em cada promoção/rebaixamento e em `stopWatching`) faz com que callbacks obsoletos não tenham efeito, garantindo no máximo um observador ativo por escopo.

### Detecção de Alterações: Diferença Semântica como Mecanismo Primário de Deduplicação

Cada vez que o observador dispara, ele primeiro tira um snapshot **do estado atual em memória antes da recarga** (`JSON.stringify(file.settings)`), então chama `reloadScopeFromDisk()` para recarregar, e finalmente compara os snapshots antes/depois. Os ouvintes são notificados apenas quando o conteúdo semântico realmente mudou.

Ponto-chave: a comparação é entre o estado em memória **antes e depois da recarga**, não contra um snapshot histórico armazenado. Isso porque `setValue()` atualiza sincronamente `file.settings` em memória antes de escrever no disco, então quando o observador dispara uma recarga, o estado em memória já contém o valor autoescrito — recarregar produz o mesmo conteúdo → sem diferença → sem notificação.
Isso suprime naturalmente:

- Eventos duplicados de autoescritas (`setValue()` já atualizou a memória, o recarregamento produz conteúdo idêntico → sem diff → sem notificação)
- Alterações apenas de formatação/comentários (as configurações resolvidas não incluem comentários)
- Salvamentos do editor sem modificação de conteúdo
- Eventos chokidar duplicados

Limitação conhecida: `JSON.stringify` é sensível à ordenação de chaves. Se um usuário reorganizar manualmente as chaves no settings.json sem alterar valores, isso acionará uma notificação extra inofensiva. Isso é aceitável; não há necessidade de introduzir uma dependência de deep-equal.

## Implementação

### 1. Nova classe `SettingsWatcher`

**Arquivo**: `packages/cli/src/config/settingsWatcher.ts`

```typescript
export interface SettingsChangeEvent {
  scope: SettingScope;
  path: string;
  changeType: 'modified' | 'created' | 'deleted';
}

export type SettingsChangeListener = (
  events: SettingsChangeEvent[],
) => void | Promise<void>;

export class SettingsWatcher {
  private readonly settings: LoadedSettings;
  private readonly watchers: Map<SettingScope, FSWatcher> = new Map();
  // 'bootstrap' = watching parent for `.qwen`; 'target' = watching `.qwen`
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // Monotonic token per scope; bumped on promote/demote to void stale callbacks
  private readonly watchGeneration: Map<SettingScope, number> = new Map();
  private readonly changeListeners: Set<SettingsChangeListener> = new Set();
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingScopeChanges: Set<SettingScope> = new Set();
  private processing: boolean = false; // serialization guard
  private started: boolean = false;

  static readonly DEBOUNCE_MS = 300;
  static readonly LISTENER_TIMEOUT_MS = 30_000;
}
```

**Métodos Principais**:

#### `startWatching()`

- Itera sobre ambos os escopos User e Workspace
- Ramifica com base na existência do **diretório**: monitora `.qwen` diretamente se existir, caso contrário, monitora o pai em modo bootstrap (veja [Manipulação Preguiçosa de Diretório](#lazy-directory-handling-never-create-qwen-at-startup))
- **Nunca** cria o diretório — sem `mkdirSync`
- `ignoreInitial: true`, `depth: 0` em toda parte
- Não é chamado no modo bare

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // Never create the directory; settings persistence (saveSettings) owns that.
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` é o observador de diretório pai + nome base estrito descrito acima (ele também rebaixa para um observador bootstrap se o próprio `.qwen` for removido). `watchParentForDir` arma o observador bootstrap apenas `.qwen` e promove assim que `.qwen` aparecer:

```typescript
private watchParentForDir(scope: SettingScope, settingsPath: string): void {
  const dir = path.dirname(settingsPath);
  const parentDir = path.dirname(dir);
  const dirBasename = path.basename(dir); // ".qwen"
  const gen = this.bumpGeneration(scope);

  const watcher = watchFs(parentDir, {
    ignoreInitial: true,
    depth: 0,
    ignored: (filePath: string) =>
      filePath !== parentDir && path.basename(filePath) !== dirBasename,
  })
    .on('all', (_event: string, changedPath: string) => {
      if (this.watchGeneration.get(scope) !== gen) return; // stale callback
      if (path.basename(changedPath) !== dirBasename) return;
      void this.promoteScope(scope, settingsPath);
    })
    .on('error', (error: unknown) => {
      debugLogger.warn(`Settings bootstrap watcher error for ${parentDir}:`, error);
    });

  this.watchers.set(scope, watcher);
  this.watchStage.set(scope, 'bootstrap');

  // TOCTOU guard: `.qwen` may have appeared between the existence check and here.
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // guard double-promote
  await this.replaceWatcher(scope); // bumps generation + awaits async close()
  if (!this.started) return;
  this.watchTargetDir(scope, settingsPath);
  this.scheduleRefresh(scope); // pick up a settings.json already inside .qwen
}
```

#### `stopWatching()` — Desligamento idempotente

```typescript
stopWatching(): void {
  if (!this.started) return;
  this.started = false;
  for (const [, watcher] of this.watchers) {
    watcher.close().catch((err) => debugLogger.warn('Watcher close error:', err));
  }
  this.watchers.clear();
  if (this.refreshTimer) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
  this.pendingScopeChanges.clear();
}
```

#### `scheduleRefresh(scope)` — Debounce de 300ms + acumulação de escopos

```typescript
private scheduleRefresh(scope: SettingScope): void {
  this.pendingScopeChanges.add(scope);
  if (this.refreshTimer) clearTimeout(this.refreshTimer);
  this.refreshTimer = setTimeout(() => {
    this.refreshTimer = null;
    void this.drainPendingChanges();
  }, SettingsWatcher.DEBOUNCE_MS);
}
```
#### `drainPendingChanges()` — Processamento serializado para evitar reentrância

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // previous round still running; it will drain on exit
  this.processing = true;
  try {
    while (this.pendingScopeChanges.size > 0) {
      const scopes = new Set(this.pendingScopeChanges);
      this.pendingScopeChanges.clear();
      await this.handleChange(scopes);
    }
  } finally {
    this.processing = false;
  }
}
```

#### `handleChange(scopes)` — Recarregamento + diff semântico + notificação

```typescript
private async handleChange(changedScopes: Set<SettingScope>): Promise<void> {
  const events: SettingsChangeEvent[] = [];

  for (const scope of changedScopes) {
    const file = this.settings.forScope(scope);

    // Snapshot the current in-memory state before reload (includes setValue() mutations)
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk has internal try/catch; on parse failure it preserves old state
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // Semantic diff: only notify when content actually changed
    // Self-write suppression: setValue() already updated memory → reload matches → no notification
    if (afterSettings === beforeSettings) continue;

    events.push({
      scope,
      path: file.path,
      changeType: !existedBefore && existsNow ? 'created'
                : existedBefore && !existsNow ? 'deleted'
                : 'modified',
    });
  }

  if (events.length > 0) {
    await this.notifyListeners(events);
  }
}
```

#### `notifyListeners(events)` — `Promise.allSettled()` + timeout de 30s

Reutiliza o padrão de notificação de listeners do `SkillManager` (`packages/core/src/skills/skill-manager.ts:188-236`): cada listener é encapsulado em uma corrida de timeout de 30s, executada em paralelo via `Promise.allSettled`, falhas não se propagam.

#### `addChangeListener(listener)` — Retorna uma função de cancelamento de inscrição

### 2. Modificações em `LoadedSettings`

**Arquivo**: `packages/cli/src/config/settings.ts`

**Nenhuma modificação necessária**. O mecanismo de diff semântico está completamente contido no watcher. `setValue()` atualiza a memória síncronamente → `saveSettings()` escreve no disco → watcher dispara → `reloadScopeFromDisk()` recarrega → a comparação de diff encontra conteúdo idêntico → nenhuma notificação. A cadeia se fecha naturalmente.

### 3. Integração de Config (Interface Mínima)

**Arquivo**: `packages/core/src/config/config.ts`

Adicionar a `ConfigParameters`:

```typescript
/** Lifecycle handle for an external file watcher. Stopped during shutdown. */
settingsWatcher?: { stopWatching(): void };
```

Em `Config.shutdown()`, parar o watcher **antes** da verificação de `initialized`:

```typescript
async shutdown(): Promise<void> {
  try {
    // Stop the external watcher regardless of initialization state
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... remaining cleanup logic ...
  }
}
```

**Nenhum `settingsChangeListeners` é adicionado à Config**. O despacho de eventos de mudança é tratado inteiramente na camada CLI, onde os listeners chamam diretamente métodos de atualização do core (ex.: `skillManager.refreshCache()`, `toolRegistry.restartMcpServers()`). Isso mantém o core alheio à semântica de mudanças de configuração.

### 4. Configuração Inicial (Wiring)

**Arquivo**: `packages/cli/src/gemini.tsx`

Após `loadSettings()` e `loadCliConfig()`:

```typescript
// Create watcher (skip in bare mode)
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// Pass watcher lifecycle handle when loading CLI config
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// Register change listener (future sub-tasks will add actual refresh logic here)
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Settings changed:', events.map(e => `${e.scope}:${e.changeType}`));
  // Sub-tasks 2-6 will add:
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - needsRefresh flag
});
```

**Mudança na assinatura de `loadCliConfig`** (`packages/cli/src/config/config.ts`): Adicionar um parâmetro opcional para passar `settingsWatcher` para `ConfigParameters`.

## Tratamento de Casos Extremos

| Cenário                                   | Tratamento                                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Diretório `.qwen` não existe              | **Nunca criado.** Observa o pai com bootstrap (`depth: 0`, filtro apenas `.qwen`), promove quando `.qwen` aparece    |
| `.qwen` criado após a inicialização       | O watcher bootstrap captura `addDir`, promove para um watcher alvo + agenda uma atualização                          |
| `.qwen` deletado após a promoção          | O watcher alvo captura `unlinkDir` → rebaixa de volta para um watcher bootstrap pai                                  |
| Arquivo deletado                          | `reloadScopeFromDisk` detecta `!existsSync`, redefine para `{}`, diff dispara evento `deleted`                       |
| Arquivo criado após inicialização (dir existia) | O watcher de diretório captura evento `add`, `reloadScopeFromDisk` lê o novo arquivo                          |
| Callback obsoleto durante promoção/rebaixamento | Token de geração por escopo faz com que o callback em andamento do watcher sendo fechado seja um no-op (sem empilhamento de watchers) |
| Gravação atômica do editor                | Observação de diretório + filtro rigoroso de nome base (exclui `.tmp`/`.orig`) + coalescência com debounce de 300ms |
| Eventos de arquivo `.tmp`/`.orig`         | O filtro de nome base corresponde exatamente a `settings.json`, todos os outros nomes são ignorados                  |
| Auto-escrita (`setValue` → `saveSettings`) | Diff semântico: conteúdo recarregado corresponde ao snapshot em memória → nenhuma notificação                        |
| Auto-escrita concorrente com edição externa | Edição externa altera conteúdo → diff detecta a mudança → notifica corretamente                                     |
| Mudanças apenas de formatação/comentários | `reloadScopeFromDisk` resolve configurações sem comentários → diff corresponde → nenhuma notificação                 |
| Eventos duplicados do chokidar            | Coalescência com debounce + diff semântico oferecem proteção dupla                                                  |
| Redirecionamento de `QWEN_HOME`           | `getUserSettingsPath()` já resolve o caminho; o watcher usa o caminho resolvido                                      |
| Modo bare                                 | `startWatching()` nunca é chamado, overhead zero                                                                     |
| Falha na criação do watcher               | Exceção capturada, aviso registrado; esse escopo perde detecção em tempo real, mas a funcionalidade não é afetada    |
| Falha de parsing em `reloadScopeFromDisk` | try/catch interno (`settings.ts:501`) preserva estado anterior → diff antes/depois corresponde → nenhuma notificação |
| Mudança na ordem de chaves (sem mudança de valor) | `JSON.stringify` é sensível à ordem das chaves; pode produzir uma notificação extra inofensiva                     |
| Falha na inicialização da Config          | `shutdown()` para o watcher antes da verificação de `initialized`, prevenindo vazamentos                            |
| Reentrância (listener ainda em execução)  | Flag `processing` + loop `drainPendingChanges` serializam o processamento                                            |
| JSON inválido                             | try/catch interno de `reloadScopeFromDisk` preserva estado anterior                                                  |
## Análise de Performance

- No máximo 1 observador por escopo (≤ 2 no total), cada um com `depth: 0` — sobrecarga mínima de descritores de arquivo; promova/destitua observadores de troca, nunca os empilhe
- `depth: 0` significa **nenhuma varredura recursiva** da árvore do projeto, mesmo para o observador bootstrap pai em um monorepo grande. O custo é limitado aos filhos diretos do diretório pai: alterações não relacionadas no nível superior acordam o chokidar para uma passagem de `readdir` + filtro `ignored` (`O(entradas do nível superior)`) antes do evento ser suprimido — nunca é uma varredura recursiva
- Debounce de 300ms garante que salvamentos rápidos do editor não disparem múltiplos recarregamentos
- `reloadScopeFromDisk` usa `readFileSync` síncrono, < 1ms por chamada
- A comparação `JSON.stringify` é O(n), mas os objetos de configuração normalmente têm < 10KB; nenhum armazenamento adicional de snapshot necessário
- A notificação do ouvinte é executada em paralelo via `Promise.allSettled`
- Sem polling — puramente orientado a eventos

## Arquivos para Criar/Modificar

**Novos arquivos**:

- `packages/cli/src/config/settingsWatcher.ts` — classe do observador
- `packages/cli/src/config/settingsWatcher.test.ts` — testes unitários

**Arquivos modificados**:

- `packages/core/src/config/config.ts` — adicionar campo `settingsWatcher` a `ConfigParameters`, chamar `stopWatching()` antes da verificação `initialized` em `Config.shutdown()`
- `packages/cli/src/config/config.ts` (`loadCliConfig`) — adicionar parâmetro opcional para passar `settingsWatcher`
- `packages/cli/src/gemini.tsx` — instanciar observador + fiação

**Nenhuma modificação necessária**: `packages/cli/src/config/settings.ts` (o diff semântico é autocontido e não requer cooperação de `LoadedSettings`)

## Plano de Testes

### Testes Unitários (`settingsWatcher.test.ts`)

Mock do chokidar (reutilizando o padrão de mock de `skill-manager.test.ts`):

1. **Ciclo de vida**: `startWatching` cria observadores, `stopWatching` fecha observadores, ambos são idempotentes
2. **Filtragem de caminhos**: Apenas eventos do nome base `settings.json` disparam atualização; arquivos `.tmp`/`.orig`/outros são ignorados
3. **Debounce**: Múltiplos eventos rápidos coalescem em um único recarregamento (`vi.useFakeTimers()`)
4. **Diff semântico**: Conteúdo inalterado → ouvinte não chamado; conteúdo alterado → ouvinte chamado com eventos corretos
5. **Supressão de auto-escrita**: Eventos do observador disparados por `setValue()` são naturalmente filtrados pelo diff idêntico
6. **Serialização**: Novos eventos durante `handleChange` são acumulados, esvaziados após o processamento ser concluído
7. **Isolamento de erros**: Erros do chokidar não travam; exceções do ouvinte não afetam outros ouvintes; falhas de `reloadScopeFromDisk` são capturadas
8. **Timeout do ouvinte**: Proteção de timeout de 30s
9. **Observação preguiçosa de diretório**: quando `.qwen` está ausente, `mkdirSync` nunca é chamado; um observador bootstrap é armado no diretório pai e seu predicado `ignored` permite apenas a entrada `.qwen`
10. **Promover / TOCTOU**: `.qwen` aparecendo (via `addDir` ou a re-verificação pós-armamento) fecha o observador bootstrap e abre um observador alvo em `.qwen` + agenda uma atualização
11. **Destituir / recriar**: remover `.qwen` (`unlinkDir`) re-bootstraps no pai; uma subsequente recriação promove novamente
12. **Proteção de geração**: um callback obsoleto de um observador bootstrap já fechado não cria um segundo observador alvo

### Verificação de Regressão

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### Verificação Manual

Edite `~/.qwen/settings.json` durante uma sessão em execução e observe a saída do log de depuração para eventos de alteração.

---

## Sub-tarefa de Acompanhamento: Suprimir Eventos para Configurações que Exigem Reinicialização e Configurações Sensíveis

> **Status: porta de supressão implementada; duas correções de esquema ainda
> pendentes de pesquisa.** A sub-tarefa 1 acima emitiu um único `SettingsChangeEvent` por escopo
> para _qualquer_ alteração semântica. Este acompanhamento adiciona um filtro para que alterações
> confinadas a configurações que não podem realmente entrar em vigor sem uma reinicialização — ou que são
> sensíveis (credenciais) — **não** notifiquem os ouvintes.
>
> - **Feito:** a porta de supressão baseada em `requiresRestart` em
>   `SettingsWatcher.handleChange()` mais testes unitários (veja Mecanismo abaixo).
> - **Pendente:** as duas correções de esquema `requiresRestart`
>   (`modelProviders` → `true`, `permissions.*` → manter recarregável a quente), cada
>   uma dependente de verificar o caminho de leitura em tempo de execução primeiro.

### Motivação

Algumas configurações são lidas exatamente uma vez durante a inicialização do processo (`Config.initialize()`,
construção do gerador de conteúdo/cliente, criação de processos filhos, flags de runtime do Node).
Exemplos que o usuário explicitamente mencionou: **tokens de API, `env` e provedores de modelo**.
Emitir um evento de recarga a quente para esses é ativamente enganoso — o
ouvinte "atualizaria" mas o novo valor não se aplicaria até que o usuário
reinicie `qwen-code`. Valores sensíveis (credenciais) adicionalmente não deveriam
ser replumbados através de uma sessão em execução.

### Decisão: Reutilizar o sinalizador `requiresRestart` do esquema (fonte única da verdade)

`settingsSchema.ts` já declara `requiresRestart: boolean` em **cada** chave,
e `packages/cli/src/utils/settingsUtils.ts` já expõe as consultas:
- `requiresRestart(key: string): boolean` — sinalizador para uma chave de caminho com pontos
- `getFlattenedSchema()` — mapa completo simplificado `chave → definição`
- `getRestartRequiredSettings()` — todas as chaves com `requiresRestart: true`

Vamos **reutilizar este sinalizador como o sinal de supressão** em vez de manter uma lista de negação separada e curada manualmente (que inevitavelmente se distanciaria do esquema). `requiresRestart: true` já significa precisamente "não terá efeito sem uma reinicialização", que é exatamente a condição sob a qual um evento deve ser suprimido.

### Mecanismo (implementado em `SettingsWatcher.handleChange()`)

A antiga proteção fazia um diff `JSON.stringify` do arquivo inteiro e não conseguia dizer _quais_ chaves foram alteradas. Ela é substituída por um diff no nível da folha + classificação por chave:

1. **`collectChangedKeys(before, after)`** captura o estado em memória antes do recarregamento (`structuredClone`), então percorre before/after e coleta o caminho com pontos de cada folha cujo valor difere. Objetos simples são percorridos recursivamente; arrays e primitivos são comparados por inteiro (correspondendo a chaves de array do esquema como `permissions.allow`). Chaves adicionadas/removidas aparecem como folhas alteradas, então criação/exclusão de arquivo é coberta sem uma verificação de existência separada.
2. **`isRestartRequiredKey(path)`** resolve cada caminho alterado contra o esquema usando a **chave de esquema mais longa que seja um prefixo de (ou igual a)** o caminho. Configurações de objeto de forma livre (`env`, `modelProviders`) são chaves de esquema de folha, então `env.FOO` resolve para a definição de `env`. Chaves desconhecidas padrão **não** exigem reinicialização, portanto uma alteração que não conseguimos classificar nunca é suprimida silenciosamente.
3. O escopo notifica **apenas se pelo menos uma chave alterada for recarregável a quente** (`!isRestartRequiredKey`). Se todas as chaves alteradas exigirem reinicialização, o escopo não produz evento algum.

A forma de `SettingsChangeEvent` permanece inalterada (ainda `{ scope, path, changeType }`); carregar as chaves alteradas sobreviventes no evento fica como uma possível melhoria futura. A supressão de auto-escrita (diff vazio → nenhum evento), debounce, serialização e comportamento de tempo limite do ouvinte permanecem todos inalterados.

### Dois ajustes no esquema para pesquisar e aplicar

Estes dois valores de `requiresRestart` devem ser corrigidos para que a abordagem de reutilização se comporte conforme o esperado. **Cada um requer verificar o caminho real de leitura em tempo de execução antes de virar o sinalizador.**

1. **`modelProviders`: `false` → `true`** (`settingsSchema.ts:294`)
   - Hoje está marcado como `requiresRestart: false`, então com a abordagem de reutilização ele _não_ seria suprimido — contradizendo o requisito de que alterações no provedor não sejam recarregadas a quente.
   - A configuração do provedor (incluindo `apiKey` / `baseUrl` por provedor) é consumida quando o cliente de modelo / gerador de conteúdo é construído durante a inicialização.
   - **Item de pesquisa:** confirmar se não há uma releitura em tempo de execução de `modelProviders` (pesquisar construção do gerador de conteúdo / cliente). Resultado esperado: o `false` é um bug latente; virar para `true`.

2. **`permissions.*`: manter recarregável a quente** (`settingsSchema.ts:1560`, subárvore inteira atualmente `requiresRestart: true`)
   - As regras de permissão (`negar > perguntar > permitir`) são avaliadas por chamada de ferramenta e são intencionadas a serem as configurações que os usuários mais desejam que entrem em vigor imediatamente.
   - Toda a subárvore de `permissions` tem `showInDialog: false`, então seu sinalizador `requiresRestart` atualmente **não tem significado na interface** — forte indício de que o `true` foi um padrão em vez de uma decisão deliberada de "precisa reiniciar", então o raio de impacto de virá-lo é baixo.
   - **Item de pesquisa:** confirmar que o tempo de execução lê as permissões em tempo real (por exemplo, via `config.getXxx()` no momento da avaliação) em vez de a partir de um instantâneo da inicialização. Se confirmado, definir a subárvore `permissions` para `requiresRestart: false` para que **não** seja suprimida pelo mecanismo de reutilização.

> Nota: como `requiresRestart` também é exibido na interface de configurações / prompts de reinicialização, virar esses sinalizadores também altera esse comportamento. Isso é aceitável e, possivelmente, mais correto, mas deve ser mencionado na descrição do PR.

### Aceitação

- Uma alteração que toque apenas chaves sensíveis ou que exigem reinicialização (`security.auth.*`, `env`, `modelProviders`, `mcpServers`, `proxy`, …) emite **nenhum** `SettingsChangeEvent`.
- Uma alteração em uma chave recarregável a quente (`ui.*`, `model.name`, `permissions.*` após a virada, …) ainda emite um evento.
- Uma alteração mista (uma chave que exige reinicialização + uma chave recarregável a quente) ainda emite um evento (a parte recarregável a quente precisa legitimamente ser atualizada).
- Uma alteração de chave desconhecida (não presente no esquema) ainda emite, em vez de ser suprimida silenciosamente.

Status do teste:

- **Feito** — bloco `restart-required suppression` em `settingsWatcher.test.ts` cobre todos os casos de supressão (`env`, `security.auth.apiKey`), todos permitidos (`ui.theme`), mistos e chave desconhecida.
- **Pendente (com as viradas do esquema)** — asserções em `settingsSchema.test.ts` fixando os dois valores corrigidos de `requiresRestart`, e um teste do watcher afirmando que `permissions.*` não é mais suprimida após a virada.
