# Design de Hot Reload do Runtime LSP

## Contexto

Este design segue a mesma camada usada por
`mcp-runtime-reinitialization.md`: a CLI decide quando acionar os reloads, e
o Core decide como atualizar o estado do runtime. Ele também reutiliza os princípios
do watcher de `settings-change-detection.md`: sem efeitos colaterais no sistema de arquivos
na inicialização, alterações com debounce, diffs semânticos, listeners serializados
e falhas de listeners que não afetam a sessão principal.

A principal diferença entre LSP e MCP é que a configuração do servidor LSP não
fica em `settings.json`. Atualmente, o serviço nativo de LSP usa o `LspConfigLoader` para
ler o `.lsp.json` do workspace e as declarações `lspServers` das extensões habilitadas,
escreve o resultado no `LspServerManager` de sessão única via
`NativeLspService.discoverAndPrepare()` e, finalmente, inicia todos os servidores
configurados com `start()`. Portanto, o `SettingsWatcher` sozinho não consegue detectar
alterações no `.lsp.json` do workspace.

## Avaliação do Código Atual

- A inicialização do LSP é controlada apenas por `--experimental-lsp` em
  `packages/cli/src/config/config.ts`. Atualmente, não há uma flag
  `--allowed-lsp-server-names` ou parâmetro equivalente de allow-list na CLI do LSP;
  a flag existente `--allowed-mcp-server-names` é exclusiva do MCP.
- O `NativeLspService` é construído uma vez durante o carregamento da configuração da CLI. O caminho
  de inicialização chama `discoverAndPrepare()`, depois `start()`, em seguida envolve o serviço no
  `NativeLspClient` e o anexa ao `Config`.
- `Config.setLspClient()` e `Config.setLspInitializationError()` atualmente
  lançam exceções após a inicialização, portanto, o hot reload em runtime não deve substituir o
  objeto client. Ele deve manter o `NativeLspClient` existente e apenas
  reconciliar incrementalmente o serviço por trás dele.
- O `LspConfigLoader` lê apenas o `.lsp.json` do workspace e os `lspServers` das extensões
  ativas. O `.lsp.json` do workspace sobrescreve a configuração da extensão pelo nome do servidor.
- `LspServerManager.setServerConfigs()` atualmente limpa todos os handles; ainda
  não suporta reconciliação incremental.
- O repositório atual não tem um caminho de pool compartilhado para LSP. Cada sessão possui seu
  próprio `NativeLspService` e conexões de subprocesso/socket. O design deve deixar uma
  fronteira para um pool compartilhado futuro, mas a v1 implementa apenas o modo de sessão única.

## Objetivos

Fazer com que as alterações na configuração do servidor LSP tenham efeito sem reiniciar a
sessão atual do Qwen Code:

- iniciar um servidor quando ele for adicionado;
- parar um servidor quando ele for removido e removê-lo do status e do roteamento de ferramentas;
- reiniciar apenas o servidor alterado quando sua configuração mudar;
- manter os servidores inalterados conectados e preservar seu estado de warm-up;
- nunca iniciar servidores que não sejam confiáveis ou não permitidos;
- permitir que as ferramentas LSP e o status `/lsp` observem o novo estado do runtime através do
  objeto client existente.

## Não Objetivos

- Não adicionar um pool de processos LSP compartilhado nesta alteração.
- Não suportar a alternância de `--experimental-lsp` em runtime. Se o LSP não foi
  habilitado na inicialização, não há serviço para recarregar.
- Não monitorar completamente as alterações de instalação/desinstalação de extensões que afetam
  `lspServers`; o `/reload` manual cobrirá as alterações de configuração de extensões.

## Design

### 1. Identificar Cada Servidor LSP Com um Hash Estável

Adicione um pequeno helper perto do código de configuração do LSP:

```ts
export function lspServerConfigHash(config: LspServerConfig): string;
```

O hash deve ser estável e baseado na configuração de runtime normalizada produzida pelo
`LspConfigLoader`:

- `name`
- `languages`
- `transport`
- `command`
- `args`
- `env`
- `initializationOptions`
- `settings`
- `extensionToLanguage`
- `workspaceFolder`
- `rootUri`
- `startupTimeout`
- `shutdownTimeout`
- `restartOnCrash`
- `maxRestarts`
- `trustRequired`
- `socket`

As chaves do objeto devem ser ordenadas para que a ordem das propriedades JSON não cause
reinicializações desnecessárias. A ordem do array permanece significativa porque a ordem dos argumentos do comando
e a prioridade do idioma podem ser relevantes. Não inclua campos de runtime como
id do processo, status, contagem de reinicializações, diagnósticos ou estado de warm-up.

Para compatibilidade futura com pool compartilhado, defina a identidade do pool como:

```text
lsp:<workspaceRoot>:<serverName>:<configHash>
```

O gerenciador de sessão única da v1 precisa apenas manter `serverName -> configHash`,
mas o mesmo hash pode ser reutilizado posteriormente diretamente na chave do pool.

### 2. Adicionar Reconciliação Incremental ao `LspServerManager`

O hot reload não deve reutilizar `setServerConfigs()`, que limpa todos os handles.
Adicione:

```ts
async reconcileServerConfigs(
  configs: LspServerConfig[],
): Promise<LspReconcileResult>
```

Fluxo:

1. Construa os mapas desejados: `name -> config` e `name -> hash`.
2. Para handles existentes cujo servidor não existe mais, chame o
   `stopServer()` existente e, em seguida, exclua o handle.
3. Para handles existentes cujo hash mudou, chame `stopServer()`, substitua o
   handle por `{ config, status: 'NOT_STARTED' }` e, em seguida, inicie-o.
4. Para novos servidores, crie `{ config, status: 'NOT_STARTED' }` e inicie-os.
5. Para servidores cujo hash não mudou, não faça nada e mantenha o handle
   existente.

Adicione um campo privado:

```ts
private serverConfigHashes = new Map<string, string>();
```

Limpe-o em `stopAll()` e `clearServerHandles()`.

Retorne:

```ts
interface LspReconcileResult {
  added: string[];
  removed: string[];
  restarted: string[];
  unchanged: string[];
  failed: string[];
}
```

`skipped` não faz parte do resultado do `LspServerManager`. O gerenciador lida apenas
com configurações que passaram na admissão; servidores rejeitados pela admissão são agregados
ao resultado no nível de serviço pelo `NativeLspService.reinitialize()`.

Concorrência:

- Adicione uma fila de reconciliação no `LspServerManager` ou no `NativeLspService` para
  que as reconciliações sejam executadas em série. Parar e iniciar o mesmo processo não deve ter condições de corrida.
- Se uma nova configuração chegar enquanto um servidor ainda estiver iniciando, aguarde o
  `handle.startingPromise` antes de pará-lo. Reutilize o lock de inicialização
  existente em vez de adicionar um lock extra por servidor.
- O próprio `stopServer()` deve aguardar o `handle.startingPromise` após definir
  `stopRequested`, para que os caminhos de `stopAll()`, remoção e reinicialização cubram todas as reinicializações
  por falha que ainda estão atribuindo sua conexão/processo.

Comportamento em caso de falha:

- Se um servidor recém-adicionado ou alterado falhar ao iniciar, mantenha o handle e marque-o
  como `FAILED` para que o `/lsp` possa explicar a falha.
- Não conte uma inicialização com falha como `added` ou `restarted`; reporte-a em
  `failed`.
- Não faça cache do hash de configuração para uma inicialização com falha. Um salvamento posterior com a mesma
  configuração deve tentar novamente em vez de ser classificado como `unchanged`.
- Se a inicialização falhar após a criação de uma conexão ou processo, libere essa
  conexão/processo antes de retornar. Uma inicialização com falha não deve deixar um processo de servidor de linguagem
  ou conexão de socket ativo por trás de um handle `FAILED`.
- Se a inicialização falhar antes da criação da conexão, incluindo rejeição de confiança,
  caminho de comando inseguro ou comando ausente, limpe o hash de configuração em cache. Uma reconciliação
  posterior com a mesma configuração deve tentar novamente em vez de tratar o handle com falha como inalterado.
- Se um servidor removido registrar um erro durante o desligamento, ainda assim exclua-o do
  mapa de handles.
- A falha na inicialização de um servidor não deve bloquear a reconciliação de outros servidores.

Limpeza de recursos:

- `stopServer()` deve liberar ambos os lados de um servidor próprio: desligar graciosamente
  e encerrar a conexão LSP, depois encerrar (kill) o processo gerado se ele ainda estiver
  vivo. Isso é importante para transportes `tcp`/`socket` que foram iniciados com um
  `command`; fechar apenas o socket não é suficiente.
- `process.kill()` deve ser isolado com seu próprio tratamento de erro. Um processo que
  sai durante a limpeza não deve abortar o restante da reconciliação.
- O desligamento gracioso deve sempre ter uma espera limitada. Se a configuração do servidor não
  especificar `shutdownTimeout`, use o tempo limite de desligamento padrão em vez de
  aguardar `connection.shutdown()` para sempre.
- Os timers de tempo limite de desligamento devem ser limpos quando o desligamento for concluído ou falhar, para que
  um tempo limite grande não retenha o handle por mais tempo do que o necessário.
- A promise `shutdown()` subjacente deve ser observada mesmo quando o tempo limite
  ganhar a corrida, para que uma rejeição tardia do lado do servidor não apareça como uma
  rejeição não tratada.
- `stopAll()` deve participar da mesma fila de reconciliação que o hot reload. Não
  é suficiente aguardar a fila atual e depois iterar os handles, porque uma nova reconciliação
  poderia entrar entre a espera e a limpeza dos handles.
- `NativeLspService.stop()` também deve cancelar qualquer operação `reinitialize()` em andamento ou na
  fila antes de parar os servidores. A implementação usa cancelamento cooperativo com
  `AbortController`: o stop marca o serviço como parando, aborta o reload ativo e
  cada reload na fila verifica o sinal antes de carregar a configuração, reconciliar, limpar o rastreamento
  de documentos, reproduzir documentos ou aguardar atrasos de reprodução. Isso evita que o desligamento bloqueie
  indefinidamente em um reload lento e também impede que um reload cancelado inicie novos processos LSP
  após o `stopAll()`.
- As reinicializações por falha (crash) também devem ser serializadas através da fila de reconciliação, ou limpar o
  hash quando falharem permanentemente. Elas não devem iniciar um processo substituto em
  paralelo com uma reconciliação de alteração de configuração.
- O reset de reinicialização por falha deve isolar os erros de `connection.end()` e `process.kill()`.
  O reset é executado quando a conexão/processo antigo já pode estar quebrado, e
  as falhas de limpeza não devem impedir que a reinicialização na fila continue.
- `NativeLspService.stop()` deve limpar `openedDocuments` e `lastConnections`
  após `serverManager.stopAll()` para que um serviço parado não retenha conjuntos de documentos antigos
  ou objetos de conexão.

### 3. Adicionar `NativeLspService.reinitialize()`

Adicione:

```ts
async reinitialize(): Promise<LspServiceReinitializeResult>
```

Fluxo:

1. Se `requireTrustedWorkspace` for true e `!config.isTrustedFolder()`, chame
   `serverManager.stopAll()` e retorne. Isso evita que processos LSP antigos
   continuem após o workspace se tornar não confiável.
2. Use o `LspConfigLoader` existente para carregar o `.lsp.json` do workspace e
   as configurações das extensões.
3. Mescle as configurações usando a precedência atual.
4. Aplique o filtro de admissão do LSP antes da reconciliação.
5. Chame `serverManager.reconcileServerConfigs(serverConfigs)`.
6. Limpe `openedDocuments` e `lastConnections` apenas para servidores removidos e
   reiniciados com sucesso; preserve o estado dos documentos para servidores inalterados e
   com falha. Servidores com falha mantêm seu rastreamento de documentos para que uma reinicialização
   bem-sucedida posterior possa reproduzir os mesmos documentos abertos.
7. Para servidores reiniciados com sucesso, reproduza `textDocument/didOpen` para
   documentos que estavam abertos antes da reinicialização. Isso dá ao servidor
   substituto o mesmo contexto de documento sem esperar que a próxima solicitação de hover,
   conclusão ou diagnóstico reabra cada arquivo preguiçosamente. Após reproduzir
   um ou mais documentos para um servidor, aguarde o mesmo atraso de abertura de documento
   usado pelo `ensureDocumentOpen()` preguiçoso antes de relatar a conclusão do reload.

O snapshot de documentos abertos deve ser tirado após o retorno de `reconcileServerConfigs()`
e deve ter o escopo de `reconcile.restarted`. Documentos abertos enquanto a reconciliação
está pendente são então incluídos no snapshot de reprodução antes que o rastreamento seja
limpo para os servidores reiniciados.

A descoberta inicial deve usar o mesmo filtro de admissão antes de chamar
`setServerConfigs()`. Isso mantém o status de inicialização e hot reload consistente para a filtragem
`trustRequired` por servidor em workspaces não confiáveis.

Falhas de parse do `.lsp.json` precisam de tratamento especial: não trate a falha de parse como
configuração vazia. O watcher deve reportar um evento de configuração inválida para que a CLI possa
mostrar um erro visível ao usuário, mas não deve chamar `reinitialize()` para esse evento.
`reinitialize()` deve preservar o estado antigo do runtime, pular a reconciliação e
gravar o erro nos status/logs. Apenas excluir o arquivo ou fazer o parse de uma configuração JSON
vazia válida significa que a configuração desejada está vazia.

Cold startup e hot reload usam intencionalmente diferentes rigores de parse de configuração do usuário:

- `loadUserConfigs()` permanece leniente para compatibilidade de inicialização. Ele ignora entradas
  de servidor inválidas e retorna as entradas válidas que podem ser construídas.
- `loadUserConfigsStrict()` é usado pelo hot reload. Se o `.lsp.json`
  existente for sintaticamente válido, mas contiver uma forma de nível superior inválida ou uma entrada de servidor
  que não pode ser construída, ele retorna um erro e `reinitialize()` não
  reconcilia. Isso preserva o estado do LSP em execução para edições inválidas.
  O caminho estrito não deve introduzir validação no nível de campo que a cold startup
  também não aplique, porque isso tornaria uma configuração válida na inicialização, mas
  inválida no próximo salvamento. O aperto da validação de campos conhecidos deve ser tratado
  como uma decisão de compatibilidade separada para a inicialização e o hot reload. Se o
  arquivo estiver ausente ou for excluído durante o carregamento estrito, trate esse `ENOENT` como uma
  configuração de usuário vazia válida, porque excluir `.lsp.json` é a maneira explícita de
  remover todos os servidores LSP de usuário do workspace.
`NativeLspService.reinitialize()` retorna um resultado no nível do serviço:

```ts
interface LspServiceReinitializeResult {
  reconcile: LspReconcileResult;
  skipped: Array<{
    name: string;
    reason: 'server_trust_required';
  }>;
}
```

Adicione um método opcional `reinitialize()` ao `NativeLspClient` e delegue ao serviço. Para evitar asserções de tipo opacas em `Config.reinitializeLsp()`, estenda a interface `LspClient` diretamente:

```ts
reinitialize?: () => Promise<LspServiceReinitializeResult>;
```

Adicione ao `Config`:

```ts
async reinitializeLsp(): Promise<LspServiceReinitializeResult | undefined>
```

Quando o LSP está desabilitado ou não existe nenhum cliente, esta é uma operação nula (no-op). Este método não deve substituir o cliente após `Config.initialize()`.

Como `setLspInitializationError()` atualmente rejeita chamadas após a inicialização, adicione um setter de estado privado seguro para runtime:

```ts
private setRuntimeLspInitializationError(error: Error | string | undefined): void
```

`reinitializeLsp()` o utiliza para expor falhas de recarga através de `getLspStatusSnapshot()` sem afrouxar a API pública de mutação de cliente pós-inicialização. Um resultado de reconciliação retornado com servidores `failed` é uma falha parcial, não um sucesso limpo. `reinitializeLsp()` deve definir `initializationError` para esse caso e limpar o erro apenas quando a recarga não tiver servidores com falha.

### 4. Limite de Admissão e Permissão

As verificações de segurança atuais do LSP incluem:

- `--experimental-lsp` é o único switch de habilitação;
- a confiança do workspace é verificada antes da descoberta/inicialização;
- o `trustRequired` de cada servidor tem como padrão true;
- a existência do comando e a segurança do caminho do comando são verificadas antes do spawn;
- `workspaceFolder` é restrito à raiz do workspace.

O hot reload deve preservar essas verificações e concluí-las antes de iniciar um novo servidor ou reiniciar um servidor alterado. A regra principal é: não faça o spawn primeiro para decidir se o servidor é permitido depois.

O `.lsp.json` do workspace é uma entrada controlada pelo workspace. Portanto, as configurações do usuário devem sempre ser tratadas como `trustRequired: true`, mesmo que o arquivo declare explicitamente `"trustRequired": false`. As configurações de LSP fornecidas por extensões ainda podem usar seu valor declarado de `trustRequired`. Isso impede que um workspace não confiável reduza seu próprio limite de confiança.

As variáveis de ambiente do `.lsp.json` também são controladas pelo workspace. O spawn em runtime pode mesclar substituições de ambiente permitidas, mas variáveis de injeção de código como `NODE_OPTIONS`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES` e `DYLD_LIBRARY_PATH` não devem ser substituídas pela configuração do LSP. O `PATH` é permitido para o processo real do servidor para preservar configurações comuns de toolchain. O sondeamento de existência de comando pode manter valores de ambiente regulares fornecidos pela configuração que as sondas possam precisar, mas não deve usar o `PATH` fornecido pela configuração ao resolver nomes de comandos puros. Isso impede que um `PATH` malicioso do workspace redirecione uma sonda como `clangd --version` para um executável não intencional antes do caminho de inicialização real. A filtragem de chaves de ambiente sensíveis, incluindo o filtro de `PATH` apenas para sondas, deve ser case-insensitive (não diferenciar maiúsculas de minúsculas) para que nomes de ambiente case-insensitive no estilo do Windows, como `Path`, `node_options` ou `Ld_PreLoad`, não possam contornar a denylist.

Limite da allow-list:

- O repositório atual não suporta uma allow-list de CLI para nomes de servidores LSP. Confirmei que o LSP possui apenas `--experimental-lsp`; os parâmetros de allow-list são exclusivos do MCP.
- Se este recurso adicionar `--allowed-lsp-server-names`, ele deve se comportar como a allow-list de inicialização do MCP e atuar como um limite superior para todo o tempo de vida da sessão. A configuração de runtime pode restringir este conjunto, mas não deve expandir além do limite superior de inicialização da CLI.
- Armazene o limite superior de inicialização em `ConfigParameters.lsp`:

```ts
cliAllowedLspServerNames?: string[];
```

Exponha um getter para ele. Não leia o limite superior de configurações mutáveis.

A admissão deve ser extraída para uma função pura:

```ts
filterLspServerConfigs(configs, {
  workspaceTrusted,
  requireTrustedWorkspace,
  cliAllowedServerNames,
}): {
  admitted: LspServerConfig[];
  skipped: Array<{
    name: string;
    reason: 'server_trust_required';
  }>;
}
```

Embora não haja um repositório de aprovação de LSP ou uma allow-list de CLI hoje, este helper torna o limite de segurança explícito e deixa espaço para futuros gates de aprovação baseados em hash. Se uma futura flag `--allowed-lsp-server-names` for adicionada, ela deve adicionar um motivo de skip `not_allowed` naquele momento, em vez de carregar um caminho de allow-list não conectado na v1.

A semântica de confiança deve corresponder ao caminho de inicialização atual:

- Se `requireTrustedWorkspace` for true e o workspace não for confiável, `NativeLspService.reinitialize()` para todos os servidores na camada de serviço e retorna. Ele não entra no filtro de admissão e não preserva os servidores antigos.
- Se `requireTrustedWorkspace` for false, o serviço não faz um short-circuit globalmente, mas o filtro de admissão ainda pula servidores individuais com `trustRequired: true`.
- Se o workspace for confiável, `trustRequired` não bloqueia o servidor.

### 5. Acionamento

Dois caminhos de acionamento são necessários.

#### Acionamento Automático do Workspace `.lsp.json`

Adicione um `LspConfigWatcher` restrito na CLI, modelado após o `SettingsWatcher`, mas com uma responsabilidade menor:

- observe apenas a raiz do workspace e corresponda estritamente ao basename `.lsp.json`;
- não crie nenhum diretório ou arquivo;
- faça debounce por 300 ms;
- compare o `.lsp.json` antes/depois usando parse + canonicalize para que alterações apenas de formatação não acionem a recarga;
- trate `ENOENT` como exclusão;
- diferencie falhas de parse de JSON de outras falhas de leitura. Ambas devem notificar o listener com um evento de configuração inválida visível para o usuário e preservar o estado de runtime antigo, mas a mensagem de erro deve refletir se o arquivo era um JSON inválido ou ilegível;
- a exclusão do arquivo é um evento separado e deve notificar o listener de recarga, produzindo uma configuração de workspace vazia;
- execute callbacks em série;
- use timeout de listener e isolamento de falha correspondentes ao `SettingsWatcher`;
- avance o snapshot semântico armazenado apenas após a notificação do listener ser bem-sucedida. Se o listener lançar um erro ou expirar o tempo, retenha o snapshot anterior para que salvar o mesmo conteúdo novamente tente a recarga.

Registre o watcher apenas quando `config.isLspEnabled()` e o cliente suportar `reinitialize()`. Na mudança, chame:

```ts
await config.reinitializeLsp();
```

Em seguida, emita um evento de runtime explícito como `AppEvent.LspStatusChanged`. Superfícies de UI como `/lsp`, `/about` ou `/status` podem se inscrever nesse evento para atualizar. Se a reconciliação retornar falhas parciais, emita o evento de alteração de status antes de lançar o erro de volta para o watcher; isso permite que a UI observe os servidores reiniciados com sucesso enquanto o watcher ainda retém o snapshot semântico antigo para nova tentativa. Em caso de falha, mostre também um erro visível para o usuário através de `AppEvent.LogError`; inclua a mensagem de erro subjacente do parser/inicialização quando disponível, e não escreva apenas um log de debug.

#### Acionamento Manual `/reload`

Quando o futuro comando `/reload` for implementado, ele deve chamar ambos:

```ts
await config.reinitializeMcpServers(...);
await config.reinitializeLsp();
```

A recarga manual também fornece o caminho de fallback para alterações em `lspServers` de extensões, pois essas alterações podem não mapear para um evento de arquivo `.lsp.json` do workspace.

## Sessão Única e Pool Compartilhado

Estado atual: apenas o modo de sessão única existe. O repositório não possui um equivalente LSP para o pool de transporte do MCP.

v1: implementar reconciliação incremental dentro do `LspServerManager`. Cada sessão possui seu próprio processo e socket.

Pool compartilhado futuro: manter o `NativeLspService` como consumidor e substituir os internos do `LspServerManager` com acquire/release de:

```text
lsp:<workspaceRoot>:<name>:<hash>
```

entradas do pool. A filtragem de admissão ainda deve ocorrer antes do acquire, correspondendo à correção do pool compartilhado do MCP, para que servidores não permitidos ou não confiáveis não possam ser iniciados através do caminho do pool.

## Plano de Testes Unitários

Priorize testes unitários. Testes de integração contra servidores LSP reais são lentos e dependentes do ambiente, portanto não são obrigatórios.

### Testes do Core

`packages/core/src/lsp/configHash.test.ts`

- o hash ignora a ordem das chaves do objeto;
- alterações em command, ordem de args, env, settings, pasta do workspace, socket e requisito de confiança alteram o hash;
- o hash exclui campos de status/process/runtime.

`packages/core/src/lsp/LspServerManager.test.ts`

- adicionar um servidor o inicia exatamente uma vez;
- remover um servidor o desliga e o exclui dos handles;
- alterações de hash param o handle antigo e iniciam um novo handle;
- hash inalterado não para/inicia e preserva a identidade do handle;
- falha na inicialização após a criação da conexão libera a conexão e o processo proprietário;
- parar um servidor `tcp`/`socket` iniciado por `command` fecha a conexão e encerra o processo proprietário;
- timers de timeout de shutdown são limpos quando o shutdown é concluído primeiro;
- `shutdownTimeout` ausente ainda usa o timeout de shutdown padrão e não pode bloquear a reconciliação para sempre;
- `stopAll()` aguarda a inicialização em andamento antes de liberar recursos;
- `stopAll()` é serializado através da fila de reconciliação e não pode ser executado concorrentemente com uma reconciliação posterior;
- erros de `process.kill()` são registrados em log e não abortam a limpeza;
- a falha na inicialização de um servidor não afeta a reconciliação de outro servidor;
- reconciliações concorrentes são executadas em série;
- `stopAll()` e `clearServerHandles()` limpam o hash map;
- inicializações com falha são reportadas em `failed`, não são reportadas como adicionadas/reiniciadas e não armazenam em cache seu hash de configuração;
- falhas iniciais de inicialização limpam o hash em cache para que uma reconciliação posterior com a mesma configuração faça uma nova tentativa;
- reinicializações por crash serializam com a reconciliação e limpam hashes em cache em caso de falha permanente;
- o reset de reinicialização por crash ignora erros de limpeza de conexão/processo e continua a reinicialização enfileirada;
- o sondeamento de existência de comando mantém valores de ambiente regulares fornecidos pela configuração, mas não usa o `PATH` fornecido pela configuração, e substituições de ambiente de injeção de código são filtradas antes do spawn;
- o valor de retorno da reconciliação contém added/removed/restarted/unchanged/failed, não admission skipped.

Faça mock de `createLspConnection`, inicialização e shutdown nos testes. Não inicie servidores de linguagem reais.

`packages/core/src/lsp/NativeLspService.test.ts`

- `reinitialize()` carrega a configuração do workspace e da extensão e passa a configuração mesclada para a reconciliação do manager;
- falha no parse do `.lsp.json` preserva o estado de runtime antigo e não chama a reconciliação do manager;
- o hot reload estrito rejeita formas de nível superior inválidas e entradas de servidor que não podem ser construídas sem reconciliação, enquanto a inicialização a frio continua carregando entradas válidas do mesmo arquivo;
- excluir o `.lsp.json` trata a configuração do workspace como vazia e aciona a reconciliação;
- o carregamento estrito trata `ENOENT` como uma configuração de usuário vazia, incluindo a race condition de exclusão onde o arquivo desaparece entre a notificação do watcher e a recarga;
- workspace não confiável para todos os servidores e não reconcilia/inicia;
- a descoberta inicial aplica o mesmo filtro de admissão `trustRequired` por servidor que o hot reload;
- o `.lsp.json` do workspace não pode desativar o `trustRequired`;
- se uma allow-list de CLI for implementada, o limite superior filtra as configurações admitidas;
- o valor de retorno no nível do serviço agrega os motivos de admissão pulada;
- servidores reiniciados/removidos limpam apenas seu próprio rastreamento de documentos.
- servidores com falha não limpam o rastreamento de documentos e podem reproduzir esses documentos após uma reinicialização bem-sucedida posterior.
- servidores reiniciados reproduzem `textDocument/didOpen` para documentos abertos anteriormente após o servidor substituto estar pronto, e então aguardam o atraso de processamento de abertura de documento.
- documentos abertos enquanto a reconciliação está pendente são incluídos no snapshot de reprodução para servidores reiniciados.
- `stop()` cancela o atraso de reprodução em andamento e chamadas de `reinitialize()` enfileiradas antes que possam iniciar novos servidores.
- `stop()` limpa os caches de rastreamento de documentos após parar todos os servidores.

`packages/core/src/config/config.test.ts`

- `reinitializeLsp()` é uma operação nula (no-op) quando desabilitado ou quando não existe nenhum cliente;
- quando habilitado e o cliente suporta `reinitialize`, ele delega a chamada;
- quando reinitialize lança um erro, o snapshot de status expõe o erro de inicialização/recarga.
- quando reinitialize retorna falhas parciais, o snapshot de status expõe um erro de inicialização/recarga até que uma recarga totalmente bem-sucedida posterior o limpe.
### Testes de CLI

`packages/cli/src/config/lspConfigWatcher.test.ts`

- não cria `.lsp.json`;
- detecta criação/modificação/exclusão;
- ignora arquivos não relacionados;
- ignora alterações apenas de formatação após o parse canônico;
- falha no parse emite uma notificação de configuração inválida para feedback visível ao usuário
  e não aciona a reinicialização do LSP;
- falha de leitura não-ENOENT emite uma mensagem de falha de leitura visível ao usuário e não
  aciona a reinicialização do LSP;
- excluir `.lsp.json` aciona o listener de reload;
- eventos de arquivo duplicados sofrem debounce;
- listeners lentos são executados em série;
- falha no listener não avança o snapshot armazenado e o mesmo conteúdo pode
  ser tentado novamente por uma notificação posterior.

`packages/cli/src/ui/AppContainer.test.tsx` ou o teste de evento correspondente

- `AppEvent.LspStatusChanged` aciona a atualização da UI;
- falha no reload emite um erro visível ao usuário através do `AppEvent.LogError`.
- falha parcial na reconciliação ainda emite `AppEvent.LspStatusChanged` antes que o
  listener rejeite, para que o estado da UI possa refletir as partes bem-sucedidas do reload.

`packages/cli/src/config/config.test.ts`

- preservar a asserção existente de que `--experimental-lsp` constrói e
  inicia o LSP nativo;
- se `--allowed-lsp-server-names` for adicionado, o parser suporta valores
  separados por vírgula e flags repetidas, e os armazena como o limite superior de inicialização.

`packages/cli/src/ui/commands/lspCommand.test.ts`

- se `LspStatusSnapshot` expuser os motivos de skip, a saída de status poderá mostrar
  servidores ignorados/não permitidos.

Metas de cobertura: novas funções puras devem ter quase 100%; a cobertura de branches do watcher
deve ser comparável à do `SettingsWatcher`; a reconciliação do manager deve cobrir
adição/remoção/alteração/inalterado/falha/concorrência.

## Revisão Rigorosa

### Conclusão

1. **A v1 não deve usar stop-all/start-all.**
   Essa implementação é a mais simples, mas cada salvamento reiniciaria
   servidores de linguagem inalterados e perderia o estado aquecido. O manager atual já possui
   métodos de ciclo de vida por servidor, e a reconciliação incremental é uma quantidade gerenciável
   de código adicional.

2. **Não coloque as alterações de `.lsp.json` no `SettingsWatcher`.**
   O `SettingsWatcher` é responsável por reloads no escopo de configurações. Fazê-lo observar
   arquivos arbitrários do workspace tornaria o contrato ambíguo e tornaria o comportamento
   de MCP/configurações mais difícil de compreender. Um watcher separado e restrito para `.lsp.json` é
   mais claro.

3. **Não substitua o `NativeLspClient` após a inicialização.**
   `Config.setLspClient()` proíbe explicitamente mutações pós-inicialização. Atualizar o
   serviço por trás do adaptador evita a expansão da API de ciclo de vida.

4. **A admissão deve ocorrer antes do spawn do processo ou da aquisição do pool.**
   Este é o mesmo risco apontado no design de pool compartilhado do MCP. Embora
   o LSP não tenha um pool hoje, os resultados de reload no nível de serviço devem retornar
   os motivos de skip da filtragem pré-inicialização, para que um futuro caminho de pool não inicie acidentalmente um
   servidor rejeitado.

5. **Uma nova allow-list de CLI para LSP é opcional, mas se adicionada, deve ser um limite
   superior.**
   O código atual não possui uma allow-list de LSP. O design não deve permitir que as configurações
   expandam as restrições da linha de comando em tempo de execução, caso contrário, seria mais fraco que a
   semântica de segurança de hot-reload do MCP.

### Riscos Restantes

- Os `lspServers` da extensão podem mudar sem que o `.lsp.json` mude. O watcher
  automático não cobre todas as alterações no sistema de arquivos da extensão; o `/reload` manual
  cobre esse caminho.
- Alguns servidores de linguagem não toleram bem reinicializações rápidas. A reconciliação
  serializada e o debounce reduzem o risco, mas os testes devem cobrir alterações
  consecutivas rápidas.
- Servidores TCP/socket podem ser daemons gerenciados externamente. A reconciliação deve fechar
  a conexão, mas só deve assumir a propriedade do processo quando este
  processo tiver feito o spawn do servidor via `command`.