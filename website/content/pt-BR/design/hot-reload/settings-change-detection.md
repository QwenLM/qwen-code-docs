# Detecção de Alterações no Arquivo de Configurações (Sub-tarefa 1 da Issue #3696)

## Contexto

O Qwen Code atualmente não possui um mecanismo de detecção de alterações no arquivo de configurações. Os usuários precisam reiniciar a sessão após modificar o `settings.json` para que as alterações tenham efeito. Esta proposta implementa a camada de infraestrutura para o sistema de hot-reload #3696 — detecção automática e despacho de eventos para alterações no arquivo de configurações.

**Escopo**: Esta sub-tarefa é responsável apenas por "detectar alterações no arquivo → recarregar → notificar listeners". O `Config` copia muitos campos de configurações no momento da construção (`approvalMode`, `mcpServers`, `telemetry`, etc.), e esses snapshots NÃO são automaticamente atualizados por esta sub-tarefa. Apenas consumidores que leem `LoadedSettings.merged` em tempo real (ex.: o hook `useSettings()`, `disabledSkillNamesProvider`) verão as alterações imediatamente. Outras sub-tarefas (reconexão MCP, comando `/reload`) são responsáveis por enviar atualizações para o estado interno do `Config`.

## Decisões de Arquitetura

### Localização do Módulo: `packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` e os caminhos dos arquivos de configurações estão ambos em `packages/cli`
- `reloadScopeFromDisk()` é um método de `LoadedSettings`
- O pacote core recebe apenas uma interface de ciclo de vida mínima `{ stopWatching(): void }`, sem importar tipos do CLI como `SettingScope`
- O despacho de eventos de alteração e a lógica de atualização downstream são completamente configurados na camada CLI

### Estratégia de Observação: Observar o Diretório Pai + Filtragem Estrita por Caminho

O fluxo de escrita `writeWithBackupSync` é `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)`, o que faz com que o arquivo alvo desapareça brevemente. Observar o caminho do arquivo diretamente faria com que o chokidar perdesse o watch. Portanto, observamos o diretório pai (`depth: 0`) e filtramos por **correspondência exata do basename**, respondendo apenas a eventos do arquivo `settings.json` e ignorando arquivos `.tmp`, `.orig`, arquivos temporários do editor, etc. O backup `.orig` é uma rede de segurança durante a operação e é **removido em caso de sucesso** (etapa final `unlink`), portanto nunca permanece no diretório do usuário.

### Tratamento Preguiçoso de Diretórios: Nunca Criar `.qwen/` na Inicialização

> **Efeito colateral no sistema de arquivos na inicialização (intencionalmente evitado).** O watcher **nunca** deve criar `<projeto>/.qwen/` (ou `~/.qwen/`) apenas para poder observá-lo. Uma versão anterior chamava `mkdirSync({ recursive: true })` para qualquer diretório de configurações ausente, o que significava que uma inicialização normal não bare criava silenciosamente `<projeto>/.qwen/` mesmo em projetos que nunca tiveram configurações do Qwen — poluindo o workspace e o status do git. A criação do diretório é de responsabilidade exclusiva da _persistência_ de configurações (`saveSettings()` faz seu próprio `mkdirSync` quando o usuário efetivamente escreve as configurações).

Para ainda detectar um `settings.json` adicionado posteriormente na sessão sem criar o diretório e sem percorrer recursivamente a árvore do projeto, o watcher usa uma estratégia de dois estágios, por escopo, baseada na **existência** do diretório:

- **`.qwen` existe na inicialização** → observá-lo diretamente (`watchTargetDir`, a estratégia acima).
- **`.qwen` ausente** → **observar o pai de forma bootstrap** (`watchParentForDir`): `chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })` onde o predicado `ignored` `(p) => p !== parentDir && basename(p) !== '.qwen'` permite apenas a entrada `.qwen`. Isso suprime toda a agitação não relacionada no nível superior e nunca faz recursão. Uma vez que `.qwen` aparece, o watcher **promove**: fecha o watcher bootstrap e inicia um watcher alvo em `.qwen`, então agenda uma atualização para capturar um `settings.json` que já pode estar dentro.

Detalhes de robustez:

- **Proteção TOCTOU**: após armar o watcher bootstrap (que usa `ignoreInitial`), `existsSync(dir)` é re-verificado; se `.qwen` foi criado na lacuna, a promoção acontece imediatamente.
- **Rebaixamento na remoção**: se o próprio `.qwen` for deletado (`unlinkDir`), o watcher alvo rebaixa de volta para um watcher bootstrap pai, para que uma recriação posterior ainda seja capturada.
- **Proteção de geração**: o `close()` do chokidar é assíncrono, então um callback `'all'` obsoleto de um watcher sendo derrubado poderia re-triggerar a promoção e empilhar watchers. Um token de geração monotônico por escopo (incrementado em cada promoção/rebaixamento e em `stopWatching`) faz com que callbacks obsoletos não façam nada, garantindo no máximo um watcher ativo por escopo.

### Detecção de Alterações: Diff Semântico como Mecanismo Primário de Deduplicação

Cada vez que o watcher dispara, ele primeiro tira um snapshot **do estado atual em memória antes da recarga** (`JSON.stringify(file.settings)`), então chama `reloadScopeFromDisk()` para recarregar e, finalmente, compara os snapshots antes/depois. Os listeners são notificados apenas quando o conteúdo semântico realmente mudou.

Ponto-chave: a comparação é entre o estado em memória **antes e depois da recarga**, não contra um snapshot histórico armazenado. Isso ocorre porque `setValue()` atualiza sincronamente `file.settings` em memória antes de escrever no disco, então quando o watcher dispara uma recarga, o estado em memória já contém o valor auto-escrito — a recarga produz o mesmo conteúdo → sem diff → sem notificação.

Isso naturalmente suprime:

- Eventos duplicados de auto-escritas (`setValue()` já atualizou a memória, recarga produz conteúdo idêntico → sem diff → sem notificação)
- Alterações apenas de formatação/comentários (as configurações resolvidas não incluem comentários)
- Salvamentos do editor sem modificação de conteúdo
- Eventos duplicados do chokidar

Limitação conhecida: `JSON.stringify` é sensível à ordenação das chaves. Se um usuário reordenar manualmente as chaves no settings.json sem alterar valores, isso disparará uma notificação extra inofensiva. Isso é aceitável; não há necessidade de introduzir uma dependência de deep-equal.

## Implementação

### 1. Nova Classe `SettingsWatcher`

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
  // 'bootstrap' = observando o pai por `.qwen`; 'target' = observando `.qwen`
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // Token monotônico por escopo; incrementado ao promover/rebaixar para anular callbacks obsoletos
  private readonly watchGeneration: Map<SettingScope, number> = new Map();
  private readonly changeListeners: Set<SettingsChangeListener> = new Set();
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingScopeChanges: Set<SettingScope> = new Set();
  private processing: boolean = false; // trava de serialização
  private started: boolean = false;

  static readonly DEBOUNCE_MS = 300;
  static readonly LISTENER_TIMEOUT_MS = 30_000;
}
```

**Métodos Principais**:

#### `startWatching()`

- Itera sobre os escopos de Usuário e Workspace
- Ramifica com base na **existência** do diretório: observa `.qwen` diretamente se existir, caso contrário observa o pai de forma bootstrap (veja [Tratamento Preguiçoso de Diretórios](#tratamento-preguiçoso-de-diretórios-nunca-criar-qwen-na-inicialização))
- **Nunca** cria o diretório — sem `mkdirSync`
- `ignoreInitial: true`, `depth: 0` em todo lugar
- Não é chamado no modo bare

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // Nunca criar o diretório; a persistência de configurações (saveSettings) é responsável por isso.
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` é o watcher de diretório pai + basename estrito descrito acima (ele também rebaixa de volta para um watcher bootstrap se o próprio `.qwen` for removido). `watchParentForDir` arma o watcher bootstrap apenas para `.qwen` e promove quando `.qwen` aparece:

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
      if (this.watchGeneration.get(scope) !== gen) return; // callback obsoleto
      if (path.basename(changedPath) !== dirBasename) return;
      void this.promoteScope(scope, settingsPath);
    })
    .on('error', (error: unknown) => {
      debugLogger.warn(`Erro no watcher bootstrap de configurações para ${parentDir}:`, error);
    });

  this.watchers.set(scope, watcher);
  this.watchStage.set(scope, 'bootstrap');

  // Proteção TOCTOU: `.qwen` pode ter aparecido entre a verificação de existência e aqui.
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // protege contra dupla promoção
  await this.replaceWatcher(scope); // incrementa geração + aguarda close() assíncrono
  if (!this.started) return;
  this.watchTargetDir(scope, settingsPath);
  this.scheduleRefresh(scope); // captura um settings.json já dentro de .qwen
}
```

#### `stopWatching()` — Desligamento Idempotente

```typescript
stopWatching(): void {
  if (!this.started) return;
  this.started = false;
  for (const [, watcher] of this.watchers) {
    watcher.close().catch((err) => debugLogger.warn('Erro ao fechar watcher:', err));
  }
  this.watchers.clear();
  if (this.refreshTimer) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
  this.pendingScopeChanges.clear();
}
```

#### `scheduleRefresh(scope)` — Debounce de 300ms + acúmulo de escopos

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

#### `drainPendingChanges()` — Processamento Serializado para Evitar Reentrância

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // rodada anterior ainda em execução; ela drenará ao sair
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

#### `handleChange(scopes)` — Recarga + diff semântico + notificação

```typescript
private async handleChange(changedScopes: Set<SettingScope>): Promise<void> {
  const events: SettingsChangeEvent[] = [];

  for (const scope of changedScopes) {
    const file = this.settings.forScope(scope);

    // Snapshot do estado atual em memória antes da recarga (inclui mutações do setValue())
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk tem try/catch interno; em caso de falha de parse, preserva o estado antigo
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // Diff semântico: notifica apenas quando o conteúdo realmente mudou
    // Supressão de auto-escrita: setValue() já atualizou a memória → recarga coincide → sem notificação
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

Reutiliza o padrão de notificação do SkillManager (`packages/core/src/skills/skill-manager.ts:188-236`): cada listener é encapsulado em uma corrida de timeout de 30s, executado em paralelo via `Promise.allSettled`, falhas não propagam.

#### `addChangeListener(listener)` — Retorna uma função de cancelamento

### 2. Modificações no `LoadedSettings`

**Arquivo**: `packages/cli/src/config/settings.ts`

**Nenhuma modificação necessária**. O mecanismo de diff semântico está completamente contido no watcher. `setValue()` atualiza a memória sincronamente → `saveSettings()` escreve no disco → watcher dispara → `reloadScopeFromDisk()` recarrega → a comparação de diff encontra conteúdo idêntico → sem notificação. A cadeia se fecha naturalmente.

### 3. Integração com Config (Interface Mínima)

**Arquivo**: `packages/core/src/config/config.ts`

Adicionar a `ConfigParameters`:

```typescript
/** Handle de ciclo de vida para um watcher de arquivo externo. Parado durante o desligamento. */
settingsWatcher?: { stopWatching(): void };
```

Em `Config.shutdown()`, parar o watcher **antes** da verificação de `initialized`:

```typescript
async shutdown(): Promise<void> {
  try {
    // Parar o watcher externo independentemente do estado de inicialização
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... lógica de limpeza restante ...
  }
}
```

**Nenhum `settingsChangeListener` é adicionado ao `Config`**. O despacho de eventos de alteração é tratado inteiramente na camada CLI, onde os listeners chamam diretamente métodos de atualização do core (ex.: `skillManager.refreshCache()`, `toolRegistry.restartMcpServers()`). Isso mantém o core alheio às semânticas de alteração de configurações.

### 4. Configuração na Inicialização

**Arquivo**: `packages/cli/src/gemini.tsx`

Após `loadSettings()` e `loadCliConfig()`:

```typescript
// Criar watcher (pular no modo bare)
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// Passar handle de ciclo de vida do watcher ao carregar a config do CLI
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// Registrar listener de alteração (sub-tarefas futuras adicionarão lógica de atualização real aqui)
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Configurações alteradas:', events.map(e => `${e.scope}:${e.changeType}`));
  // Sub-tarefas 2-6 adicionarão:
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - flag needsRefresh
});
```

**Mudança de assinatura de `loadCliConfig`** (`packages/cli/src/config/config.ts`): Adicionar um parâmetro opcional para passar `settingsWatcher` para `ConfigParameters`.

## Tratamento de Casos Extremos

| Cenário                                 | Tratamento                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Diretório `.qwen` não existe            | **Nunca criado.** Observar o pai de forma bootstrap (`depth: 0`, filtro apenas `.qwen`), promover quando `.qwen` aparecer |
| `.qwen` criado após a inicialização     | O watcher bootstrap captura `addDir`, promove para um watcher alvo + agenda uma atualização                        |
| `.qwen` deletado após promoção          | O watcher alvo captura `unlinkDir` → rebaixa de volta para um watcher bootstrap pai                               |
| Arquivo deletado                        | `reloadScopeFromDisk` detecta `!existsSync`, redefine para `{}`, diff dispara evento `deleted`                    |
| Arquivo criado após inicialização (diretório existia) | O watcher do diretório captura evento `add`, `reloadScopeFromDisk` lê o novo arquivo               |
| Callback obsoleto durante promoção/rebaixamento | Token de geração por escopo faz com que o callback em andamento do watcher sendo fechado não faça nada (sem empilhamento de watchers) |
| Escritas atômicas do editor             | Observação de diretório + filtragem estrita de basename (exclui `.tmp`/`.orig`) + coalescência de debounce de 300ms          |
| Eventos de arquivos `.tmp`/`.orig`      | O filtro de basename corresponde exatamente a `settings.json`, todos os outros nomes de arquivo são ignorados                |
| Auto-escrita (`setValue` → `saveSettings`) | Diff semântico: conteúdo recarregado coincide com snapshot em memória → sem notificação                                    |
| Auto-escrita concorrente com edição externa | Edição externa altera o conteúdo → diff detecta a mudança → notifica corretamente                                  |
| Alterações apenas de formatação/comentários | `reloadScopeFromDisk` resolve configurações sem comentários → diff coincide → sem notificação                     |
| Eventos duplicados do chokidar          | Coalescência de debounce + diff semântico fornecem dupla proteção                                                   |
| Redirecionamento `QWEN_HOME`            | `getUserSettingsPath()` já resolve o caminho; o watcher usa o caminho resolvido                                     |
| Modo bare                               | `startWatching()` nunca é chamado, zero de overhead                                                              |
| Falha na criação do watcher             | Exceção capturada, warning registrado, aquele escopo fica sem detecção em tempo real, mas a funcionalidade não é afetada       |
| Falha de parse no `reloadScopeFromDisk` | Try/catch interno (`settings.ts:501`) preserva estado antigo → diff antes/depois coincide → sem notificação      |
| Mudança de ordem de chaves (sem alteração de valor) | `JSON.stringify` é sensível à ordem das chaves; pode produzir uma notificação extra inofensiva                       |
| Falha na inicialização do Config        | `shutdown()` para o watcher antes da verificação de `initialized`, prevenindo vazamentos                                       |
| Reentrância (listener ainda em execução) | Flag `processing` + loop `drainPendingChanges` serializa o processamento                                          |
| JSON inválido                           | Try/catch interno de `reloadScopeFromDisk` preserva estado antigo                                                  |

## Análise de Performance

- No máximo 1 watcher por escopo (≤ 2 no total), cada um em `depth: 0` — overhead mínimo de descritores de arquivo; promoção/rebaixamento trocam watchers, nunca os empilham
- `depth: 0` significa **sem varredura recursiva** da árvore do projeto, mesmo para o watcher bootstrap pai em um grande monorepo. O custo é limitado aos filhos diretos do diretório pai: agitação não relacionada no nível superior acorda o chokidar para uma passagem de `readdir` + filtro `ignored` (`O(entradas de nível superior)`) antes que o evento seja suprimido — nunca uma varredura recursiva
- Debounce de 300ms garante que salvamentos rápidos do editor não disparem múltiplas recargas
- `reloadScopeFromDisk` usa `readFileSync` síncrono, < 1ms por chamada
- Comparação `JSON.stringify` é O(n), mas os objetos de configurações são tipicamente < 10KB; nenhum armazenamento adicional de snapshot é necessário
- Notificação de listeners é executada em paralelo via `Promise.allSettled`
- Sem polling — puramente baseado em eventos

## Arquivos para Criar/Modificar

**Novos arquivos**:

- `packages/cli/src/config/settingsWatcher.ts` — classe do watcher
- `packages/cli/src/config/settingsWatcher.test.ts` — testes unitários

**Arquivos modificados**:

- `packages/core/src/config/config.ts` — adicionar campo `settingsWatcher` a `ConfigParameters`, chamar `stopWatching()` antes da verificação de `initialized` em `Config.shutdown()`
- `packages/cli/src/config/config.ts` (`loadCliConfig`) — adicionar parâmetro opcional para passar `settingsWatcher`
- `packages/cli/src/gemini.tsx` — instanciar watcher + configuração

**Nenhuma modificação necessária**: `packages/cli/src/config/settings.ts` (o diff semântico é autocontido e não requer cooperação do `LoadedSettings`)
## Plano de Testes

### Testes Unitários (`settingsWatcher.test.ts`)

Mock do chokidar (reutilizando o padrão de mock do `skill-manager.test.ts`):

1. **Ciclo de vida**: `startWatching` cria watchers, `stopWatching` fecha watchers, ambos são idempotentes
2. **Filtragem de caminho**: Apenas eventos do nome base `settings.json` disparam refresh; arquivos `.tmp`/`.orig`/outros são ignorados
3. **Debounce**: Múltiplos eventos rápidos coalescem em um único recarregamento (`vi.useFakeTimers()`)
4. **Diff semântico**: Conteúdo inalterado → listener não chamado; conteúdo alterado → listener chamado com eventos corretos
5. **Supressão de auto-escrita**: Eventos do watcher disparados por `setValue()` são naturalmente filtrados pelo diff idêntico
6. **Serialização**: Novos eventos durante `handleChange` são acumulados, drenados após o processamento completo
7. **Isolamento de erros**: Erros do chokidar não crasham; exceções do listener não afetam outros listeners; falhas de `reloadScopeFromDisk` são capturadas
8. **Timeout do listener**: Proteção de timeout de 30s
9. **Observação preguiçosa de diretórios**: quando `.qwen` está ausente, `mkdirSync` nunca é chamado; um watcher de inicialização é armado no diretório pai e seu predicado `ignored` permite apenas a entrada `.qwen`
10. **Promover / TOCTOU**: `.qwen` aparecendo (via `addDir` ou a re-verificação pós-armamento) fecha o watcher de inicialização e abre um watcher alvo em `.qwen` + agenda um refresh
11. **Rebaixar / recriar**: remover `.qwen` (`unlinkDir`) rearmazena o watcher de inicialização no diretório pai; uma recriação subsequente promove novamente
12. **Proteção de geração**: um callback obsoleto de um watcher de inicialização já fechado não cria um segundo watcher alvo

### Verificação de Regressão

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### Verificação Manual

Edite `~/.qwen/settings.json` durante uma sessão em execução e observe a saída de log de depuração para eventos de alteração.

---

## Sub-tarefa de Acompanhamento: Suprimir Eventos para Configurações que Exigem Reinício & Configurações Sensíveis

> **Status: porta de supressão implementada; duas inversões de schema ainda
> pendentes de pesquisa.** A sub-tarefa 1 acima emitia um único `SettingsChangeEvent` por escopo
> para _qualquer_ alteração semântica. Este acompanhamento adiciona um filtro para que alterações
> restritas a configurações que realmente não podem ser aplicadas sem um reinício — ou que
> são sensíveis (credenciais) — **não** notifiquem os listeners.
>
> - **Feito:** a porta de supressão baseada em `requiresRestart` no
>   `SettingsWatcher.handleChange()` mais testes unitários (veja Mecanismo abaixo).
> - **Pendente:** as duas correções de schema `requiresRestart`
>   (`modelProviders` → `true`, `permissions.*` → manter hot-reloadable), cada
>   uma condicionada à verificação do caminho de leitura em tempo de execução primeiro.

### Motivação

Algumas configurações são lidas exatamente uma vez durante a inicialização do processo (`Config.initialize()`,
construção do content-generator/cliente, criação de processos-filho, flags do runtime Node).
Exemplos que o usuário explicitamente mencionou: **tokens de API, `env` e provedores de modelo**.
Emitir um evento de hot-reload para esses é ativamente enganoso — o
listener "atualizaria" mas o novo valor não seria realmente aplicado até que o
usuário reinicie o `qwen-code`. Valores sensíveis (credenciais) adicionalmente não devem
ser re-plumbados através de uma sessão em execução.

### Decisão: Reutilizar a flag `requiresRestart` do schema (fonte única de verdade)

`settingsSchema.ts` já declara `requiresRestart: boolean` em **cada** chave,
e `packages/cli/src/utils/settingsUtils.ts` já expõe as consultas:

- `requiresRestart(key: string): boolean` — flag para uma chave de caminho pontilhado
- `getFlattenedSchema()` — mapa completo achatado `chave → definição`
- `getRestartRequiredSettings()` — todas as chaves com `requiresRestart: true`

Vamos **reutilizar esta flag como o sinal de supressão** em vez de manter uma
lista de negação separada e manual (que inevitavelmente se desviaria do schema).
`requiresRestart: true` já significa precisamente "não terá efeito sem um
reinício", que é exatamente a condição sob a qual um evento deve ser
suprimido.

### Mecanismo (implementado em `SettingsWatcher.handleChange()`)

A porta antiga fazia um diff de `JSON.stringify` do arquivo inteiro e não conseguia dizer
_quais_ chaves mudaram. Ela é substituída por um diff ao nível da folha + classificação por chave:

1. **`collectChangedKeys(before, after)`** captura o estado em memória antes
   do recarregamento (`structuredClone`), então percorre before/after e coleta o caminho pontilhado
   de cada folha cujo valor difere. Objetos comuns são percorridos recursivamente; arrays e
   primitivos são comparados por inteiro (correspondendo às chaves de array do schema como
   `permissions.allow`). Chaves adicionadas/removidas surgem como folhas alteradas, então
   criação/exclusão de arquivo é coberta sem uma verificação de existência separada.
2. **`isRestartRequiredKey(path)`** resolve cada caminho alterado contra o
   schema usando a **chave de schema mais longa que é um prefixo de (ou igual a)** o
   caminho. Objetos de formato livre (`env`, `modelProviders`) são chaves
   de schema folha, então `env.FOO` resolve para a definição de `env`. Chaves desconhecidas usam como
   padrão **não** exigir reinício, então uma alteração que não podemos classificar nunca é suprimida silenciosamente.
3. O escopo notifica **apenas se pelo menos uma chave alterada for hot-reloadable**
   (`!isRestartRequiredKey`). Se toda chave alterada exigir reinício, o
   escopo não produz nenhum evento.

A forma de `SettingsChangeEvent` permanece inalterada (ainda `{ scope, path, changeType }`);
carregar as chaves alteradas sobreviventes no evento é deixado como uma possível melhoria
futura. A supressão de auto-escrita (diff vazio → nenhum evento), debounce,
serialização e comportamento de timeout do listener permanecem inalterados.

### Duas correções de schema a pesquisar e aplicar

Estes dois valores de `requiresRestart` devem ser corrigidos para que a abordagem de reutilização
se comporte como pretendido. **Cada um requer verificar o caminho de leitura real em tempo de execução
antes de inverter a flag.**

1. **`modelProviders`: `false` → `true`** (`settingsSchema.ts:294`)
   - Hoje está marcado como `requiresRestart: false`, então sob a abordagem de reutilização
   ele _não_ seria suprimido — contradizendo o requisito de que alterações de provedor
   não devem fazer hot-reload.
   - A configuração do provedor (incluindo `apiKey` / `baseUrl` por provedor) é
   consumida quando o cliente de modelo / content-generator é construído durante a inicialização.
   - **Item de pesquisa:** confirmar que não há uma releitura em tempo de execução de `modelProviders`
     (pesquisar construção do content-generator / cliente). Resultado esperado: o
     `false` é um bug latente; inverter para `true`.

2. **`permissions.*`: manter hot-reloadable** (`settingsSchema.ts:1560`, subárvore
   inteira atualmente `requiresRestart: true`)
   - As regras de permissão (`deny > ask > allow`) são avaliadas por chamada de ferramenta e
   são as configurações que os usuários mais desejam que tenham efeito imediato.
   - A subárvore inteira `permissions` é `showInDialog: false`, então sua
   flag `requiresRestart` atualmente **não tem significado de UI** — forte indício de que
   o `true` foi um padrão em vez de uma decisão deliberada de "precisa de reinício", então
   o raio de impacto de inverter é baixo.
   - **Item de pesquisa:** confirmar que o tempo de execução relê as permissões ao vivo (ex. via
     `config.getXxx()` no momento da avaliação) em vez de a partir de um snapshot da inicialização.
     Se confirmado, definir a subárvore `permissions` como `requiresRestart: false` para que
     ela **não** seja suprimida pelo mecanismo de reutilização.

> Nota: como `requiresRestart` também é exibido na UI de configurações / prompts de
> reinício, inverter essas flags também altera esse comportamento. Isso é aceitável
> e possivelmente mais correto, mas deve ser mencionado na descrição do PR.

### Aceitação

- Uma alteração tocando apenas chaves que exigem reinício/sensíveis (`security.auth.*`,
  `env`, `modelProviders`, `mcpServers`, `proxy`, …) não emite **nenhum**
  `SettingsChangeEvent`.
- Uma alteração em uma chave hot-reloadable (`ui.*`, `model.name`, `permissions.*` uma vez
  invertida, …) ainda emite um evento.
- Uma alteração mista (uma chave que exige reinício + uma chave hot-reloadable) ainda emite
  um evento (a parte hot-reloadable legitima precisa ser atualizada).
- Uma alteração de chave desconhecida (não schema) ainda emite, em vez de ser
  suprimida silenciosamente.

Status dos testes:

- **Feito** — bloco `supressão de exigência de reinício` em `settingsWatcher.test.ts`
  cobre todos suprimidos (`env`, `security.auth.apiKey`), todos permitidos
  (`ui.theme`), mistos e casos de chave desconhecida.
- **Pendente (com as inversões de schema)** — asserções em `settingsSchema.test.ts`
  fixando os dois valores corrigidos de `requiresRestart`, e um teste do watcher
  afirmando que `permissions.*` não é mais suprimido uma vez invertido.