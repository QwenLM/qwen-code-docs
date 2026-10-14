# Mods experimentais

O Qwen Code pode executar um pequeno subconjunto da API Claude Code Mod em sessões headless.
Este recurso é opt-in e requer um workspace confiável e uma extensão Claude ou
Qwen nativa habilitada. Pacotes Agent Plugins v1 continuam a ignorar hooks.

Adicione esta configuração às suas configurações do Qwen:

```json
{
  "experimental": { "mods": true }
}
```

Crie um diretório de plugin com estes arquivos:

```text
hello-mod/
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.js
```

`.claude-plugin/plugin.json`:

```json
{ "name": "hello-mod", "version": "1.0.0" }
```

`hooks/hooks.json` (caminhos de módulo são relativos a este arquivo):

```json
{ "modules": ["./register.js"] }
```

`hooks/register.js`:

```javascript
let calls = 0;

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hello',
      description: 'Say hello without a model request',
    });
    return next(e);
  });

  on('command.run', { command: 'hello' }, ($, e) => ({
    text: `Hello ${e.args || 'world'}! Call ${++calls}.`,
  }));

  on('session.end', ($, e, next) => {
    $.ui.log(`Finished ${e.sessionId}`, { to: 'debug' });
    return next(e);
  });
}
```

Instale o plugin e execute seu comando:

```bash
qwen extensions install ./hello-mod --consent
qwen -p '/hello Qwen' --output-format json
```

A configuração normal de autenticação CLI ainda é necessária na inicialização. O comando
Mod em si não faz nenhuma requisição ao modelo. Saída headless em Text, JSON e stream-json
é suportada. Um processo stream-json retém variáveis de módulo entre turnos.

## Subconjunto suportado

| Superfície  | Comportamento                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empacotamento | Uma entrada ESM `.js`, `.mjs`, `.cjs`, `.ts`, `.mts` ou `.cts`; imports e re-exports estáticos relativos dentro do plugin instalado                                                    |
| Entrada     | `register(on, options)`; registro assíncrono é aguardado; opções tipadas não secretas são copiadas e congeladas profundamente                                                          |
| Ciclo de vida | Todos os módulos registram antes da cadeia inicial de `session.start`; `session.end` na saída e substituição de conversa; clear/resume não recarregam módulos                           |
| Comandos    | Registro durante `session.start` usando nome, descrição e argumentHint opcional; intercepta comandos Mod registrados entre plugins; retorna `{text}` ou `{}`                            |
| Ferramentas | Intercepta ferramentas existentes da sessão principal com `tool.call`; inspeciona e restringe decisões de permissão nativas com `tool.check`                                            |
| Middleware  | Padrões e matchers recursivos; `next(e)` explícito e repetível; `.catch` e recuperação de falha por plugin; entrada congelada e identidade do host                                     |
| Eventos de API | Chamadas de `command.register` e `ui.log` passam pela cadeia de middleware com origem fornecida pelo host                                                                             |
| Logging     | `$.ui.log` retorna void e enfileira a entrega; logs de transcrição usam stderr no modo texto ou `system/ui_log` nos modos JSON; logs de debug permanecem no logger de debug; nenhum se torna entrada do modelo |
| Isolamento  | Ambiente QuickJS separado por plugin dentro de um worker de sessão; sem APIs de Node, sistema de arquivos ou rede; limites de memória, stack, origem/saída e execução                   |

Este é um subconjunto suportado, não compatibilidade total com os Claude Mods existentes.
JSX/TSX, imports de pacotes em runtime, interceptação de comandos integrados, registro de ferramentas e APIs `$.tool` ativas, contexto,
state/store, renderização, eventos de streaming e hot reload não estão implementados.
Comandos ainda não podem retornar `context`, `exitCode` ou referências do engine.

Dois Mods não podem registrar o mesmo nome de comando: o registro posterior é rejeitado.
Um conflito com um comando integrado do Qwen ainda usa a política de conflito de comandos do Qwen:
o comando da extensão é renomeado para `extensionName.commandName`. Nomes de comando slash
desabilitados são comparados com o nome resultante.

## Middleware e recuperação

Padrões selecionam entre `session.start`, `session.end`, `command.run`,
`command.register`, `ui.log`, `tool.call` e `tool.check`. Use um nome exato, um prefixo como `command.*`,
`*`, ou uma única negação como `!session.*`. Outros eventos concretos e os
padrões `!*` e `!!...` são rejeitados.

Matchers são objetos parciais. Todos os campos especificados devem corresponder; arrays são
alternativas, objetos aninhados correspondem a seus próprios campos, e expressões regulares
testam a representação em string do campo. Matchers são copiados durante o registro.
Permitem no máximo oito níveis e 256 nós. Regexes com estado `g`/`y` e quantificadores
aninhados são rejeitados; entradas de regex com mais de 65.536 caracteres correspondem
conservadoramente, deixando a decisão para o hook. Objetos aninhados são dados, não
operadores como `startsWith`.

Um evento exato pode ter um registro sem matcher e múltiplos
registros com matchers, incluindo matchers iguais. Cada wildcard ou padrão negado
pode ser registrado uma vez. Dentro de um plugin, a ordem de registro determina
a cadeia; consumidores executam antes de seus provedores de dependência declarados. Um handler
pode responder cedo, inclusive em `session.start`, impedindo handlers posteriores de
executar. Apenas `args` de comando podem ser reescritos em `command.run`; campos de identidade
de ciclo de vida e comando permanecem fixados.

## Interceptação de ferramentas

`tool.call` recebe os argumentos da ferramenta do Qwen como campos planos ao lado de `tool`
e `tool_use_id`. Nomes, esquemas de argumentos e registros de saída usam contratos nativos
do Qwen, então um Mod escrito para as ferramentas integradas do Claude pode precisar de adaptação.
Não há um evento `tool.result` separado; inspecione ou altere o valor retornado
por `await next(e)`:

```javascript
export function register(on) {
  on('tool.call', { tool: 'write_file' }, async ($, e, next) => {
    if (!e.file_path.endsWith('.txt'))
      return { deny: 'Only text files are allowed' };
    return next({ ...e, content: e.content.trim() });
  });

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e);
    if (e.tool === 'run_shell_command') {
      return { decision: 'deny', reason: 'Shell is disabled by this Mod' };
    }
    return verdict;
  });
}
```

Cada `tool.call` ordinário next inicia uma nova tentativa de ferramenta nativa: validação,
hooks clássicos, permissões, aprovações e guardas de invocação ainda se aplicam.
Tentativas adicionais contam contra `--max-tool-calls`; replay de catch não adiciona
tentativa. Sessões com middleware de ferramenta serializam chamadas de ferramenta, incluindo chamadas
next paralelas, porque argumentos reescritos podem introduzir efeitos colaterais. Uma chamada raiz
permite no máximo 64 tentativas nativas e 32 operações de host pendentes.
O limite raiz de 60 segundos inclui execução nativa e tempo gasto aguardando
aprovação. Retornar antes de um next pendente completar cancela esse trabalho e
aguarda sua liquidação.

`tool.check` recebe `{tool, input, tool_use_id}` após validação nativa e
reescritas clássicas de entrada. Todos os campos são fixados. Seu next retorna um
`{decision: 'allow' | 'ask' | 'deny', reason?}` declarativo sem executar a ferramenta.
O Qwen mescla a resposta restritivamente: um Mod não pode promover um deny ou
ask nativo para allow. Um ask de Mod segue o fluxo de decisão existente do modo de aprovação
atual; interação humana obrigatória e asks forçados clássicos permanecem autoritativos.
Isso é deliberadamente mais estrito que as substituições de permissão do consumidor do Claude.
Se um hook nativo de PermissionRequest reconstruir os argumentos, eles são verificados
novamente. Uma `rule`, `hook` ou `ceiling` criada por Mod não pode criar permissões de host.

Retorne `{deny: reason}` para bloquear, ou `{result: value}` para fornecer um resultado JSON
sem executar. O next nativo retorna `{ref, result, text, isError?}`.
`result` é o registro de resposta da função nativa, comumente `{output: ...}` ou
`{error: ...}`. Um ref retornado com resultado inalterado retém a saída original,
incluindo imagens e metadados de saída; alterar texto ou flags de erro ao lado dessa
referência não a modifica. Fatos de execução do host são retidos em todas as tentativas
mesmo quando um resultado anterior é selecionado. Para alterar a saída,
retorne um novo resultado:
`{result: {output: 'Replacement text'}}`. Registros contendo apenas campos `output`/`error`
em string mantêm essa forma; outro JSON é serializado completamente em uma string `output`
para que os orçamentos de saída nativos ainda se apliquem. O host possui a resposta da
função: JSON nunca é interpretado como IDs, partes de mídia ou fatos de execução.
Refs desconhecidos e declarações `isReadOnly` não concedem procedência. Resultados grandes
demais para a carga do Mod contêm um aviso de omissão e um ref; retornar esse par
inalterado preserva a resposta nativa completa.

Erros nativos, requisitos de aprovação e cancelamento não podem ser transformados em
execução bem-sucedida alterando o resultado do Mod. Uma negação após next não pode
desfazer os efeitos de uma ferramenta: o Qwen reporta que a ferramenta já executou. O mesmo se aplica
quando uma tentativa anterior executou e uma tentativa posterior foi recusada. Injeção de contexto
e metadados de requisição não são suportados.

Identidade da ferramenta, IDs de invocação, consentimento e metadados do host são fixados. Nomes
de argumentos nativos que colidem com `tool`, `tool_use_id`, `agentId`, `consent`,
`requestMeta` ou `$shadowed` são preservados em um registro `$shadowed` fixado criado pelo host
e restaurados para execução. Requisições `tool_call` diferidas válidas expõem o nome e
argumentos do alvo resolvido enquanto retêm os gates de permissão nativos do wrapper.
Wrappers inválidos, ferramentas desconhecidas, chamadas de política fixa e a ferramenta terminal
sintética `structured_output` permanecem em seus caminhos originais.
`tool_search` e `search_memory` também permanecem nativos para que resultados criados por guest não possam
herdar suas isenções de orçamento de saída nativo.
Chamadas de ferramenta de Goal também mantêm o caminho nativo: este estágio não permite que resultados
criados por Mod entrem no catálogo de um Goal como evidência externa.
Agentes filhos e schedulers de code-mode aninhados não herdam este middleware.

## Recuperação de comandos

```javascript
export function register(on) {
  on('command.run', { command: /^hello/ }, async ($, e, next) => {
    const result = await next({ ...e, args: e.args.trim() });
    return { text: `[wrapped] ${result.text || ''}` };
  }).catch(($, e, next) => next(e));
}
```

O `next` ordinário executa downstream em cada chamada. Os registros de um plugin formam
uma camada, compartilhando um registro de falha e orçamento de tempo. Em um throw, timeout ou
resultado inválido, seus catches são tentados na ordem de registro até que um retorne uma
resposta não-undefined ou chame `next`. Um catch que retorna undefined ou lança sem chamar
`next` permite que o próximo catch correspondente execute. Como no Claude Code
2.1.296, uma resposta inválida ou uma falha após `next` encerra a seleção de catch e usa
o registro de fallback compartilhado; não tenta catches posteriores. `next.called` em catch
significa que o plugin cruzou para o próximo plugin antes da recuperação começar, não meramente
para outro registro próprio.

Se o plugin já chamou downstream, a recuperação aguarda e faz replay da última
chamada iniciada, incluindo sua rejeição, ignorando argumentos de replay. Se não tinha,
o primeiro `next` do catch executa downstream uma vez e chamadas subsequentes fazem replay. Um
catch com falha usa o mesmo registro. Sem um catch bem-sucedido, o plugin é
ignorado ou seu resultado registrado retido. Um comando registrado que ninguém responde
falha explicitamente; não é enviado ao modelo.

`next` expõe `event`, `is(pattern)`, `origin` congelado, `signal`, e um snapshot congelado
fresco de `budget` com `ms` e `remainingMs`. Catch adicionalmente recebe `called`
e `error.kind` (`throw`, `timeout` ou `re-entry`). Eventos do engine usam origem
`{ plugin: 'engine', tier: 'core' }`; eventos de API Mod identificam o plugin chamador
com tier `user`. `next.to` de tier gerenciado, rastreamento e recuperação `lent` de namespace
personalizado não estão disponíveis.

Eventos de API começam na cabeça da cadeia. Sua entrada é a especificação do comando ou
a carga de log `{text, to}`. Retorne `next(e)`, `{value}` para responder, ou `{deny: reason}`
para rejeitar a chamada de API. Auto-reentrada imediata pula aquele registro; registros
ancestrais ativos podem usar seu catch. Catch de reentrada não pode chamar APIs,
e seu `next` reusa o evento original uma vez. `ui.log` permanece uma notificação void:
`await $.ui.log(...)` não aguarda interceptadores. O limite headless drena
notificações enfileiradas antes de retornar a saída.

Uma camada normal de plugin tem 10 segundos de tempo próprio, excluindo tempo de espera por
`next` entre plugins ou chamadas de API. Notificações void pendentes de `ui.log` não pausam
o orçamento do chamador. Recuperação de catch e reentrada usam um orçamento de um segundo.
Dispatch de reentrada compartilha este orçamento menor com outros registros naquele
plugin. O Qwen adicionalmente limita cada dispatch raiz a 60 segundos e cada fatia de execução
guest ininterrupta a 10 segundos. Todo trabalho de `session.end` compartilha
1,5 segundos. Um handler externo que termina cedo abandona trabalho downstream pendente;
cancelamento nunca inicia uma operação de fallback. Funções next/API retidas não podem
realizar trabalho após o fim de sua invocação. Um worker que não consegue reconhecer
cancelamento dentro de 250 milissegundos é terminado, requerendo uma nova sessão.

Há no máximo 32 ambientes Mod, 64 comandos registrados, 128 registros
por plugin, e 4.096 cadeias de eventos raiz/API por chamada raiz. Passar por outro
plugin não consome um evento extra. Cada ambiente tem um limite de memória
de 64 MiB. Logs e cargas de mensagens também são limitados. Falhas de registro, compilação
e configuração ainda rejeitam a inicialização; falha ordinária de hook
pode recuperar sem resetar o estado do módulo. Jobs de promise guest executam apenas enquanto uma
requisição do host está ativa, incluindo seu dreno de notificação enfileirada.

Mods não executam em pontos de entrada TUI, ACP, gerenciado/SSH, sandbox ou session-agent
nesta versão. Modo seguro, modo bare e `disableAllHooks` também impedem o carregamento.
Reinicie após alterar código do plugin, opções ou ativação de extensão. Um comando já carregado
reconfere cada plugin participante antes da execução e recusa uma cadeia de middleware
alterada ou desabilitada. Edições externas de configurações têm efeito após reinício.
Extensões nativas do Qwen com caminho de manifesto de hooks absoluto ou externo continuam
a usar apenas o carregador de hooks clássico. Caminhos de hooks do Claude que a conversão já
ignora por serem absolutos ou fora da extensão também são pulados pela
descoberta de Mod. Manifestos Mod devem ser caminhos relativos dentro da extensão.

## TypeScript e imports relativos

Altere a entrada de hooks para `./register.ts` para usar TypeScript. Imports e
re-exports podem usar caminhos relativos, caminhos sem extensão, arquivos `index` de diretório,
ou grafias JavaScript de arquivos TypeScript (`./helper.js` pode resolver para
`helper.ts`). Arquivos exatos vencem. Depois vêm substituições `.js` → `.ts`, `.mjs` → `.mts`, e
`.cjs` → `.cts`, seguidas por candidatos `.ts`, `.js`, `.mjs`, `.cjs`, `.mts`,
`.cts`, tentando cada arquivo e depois seu index de diretório. Todos os seis
sufixos usam ESM, incluindo `.cjs` e `.cts`. Ciclos de módulo e estado importado
compartilhado dentro de um plugin são suportados.

A compilação usa opções fixas dentro do worker cancelável; não faz
type-check nem carrega `tsconfig.json`, resolvedores de pacotes ou plugins de build. Imports
apenas de tipo, incluindo tipos de `claude-code`, são apagados. Imports de valor em runtime
de `claude-code` requerem APIs fora deste subconjunto e são rejeitados, assim como
imports de pacote/Node/URL, imports dinâmicos, `require`, JSX e `await` no nível superior
importado. Código guest continua a executar apenas em QuickJS.

## Opções do plugin

Declare `userConfig` no manifesto do plugin:

```json
{
  "name": "hello-mod",
  "version": "1.0.0",
  "userConfig": {
    "greeting": {
      "type": "string",
      "title": "Greeting",
      "description": "Greeting used by /hello",
      "default": "Hello"
    }
  }
}
```

Defina opções nas configurações de usuário ou sistema, depois leia `options.greeting` do
segundo argumento de `register`:

```json
{
  "experimental": { "mods": true },
  "pluginConfigs": {
    "hello-mod": { "options": { "greeting": "Welcome" } }
  }
}
```

Campos requerem `type`, `title` e `description`. Tipos suportados são `string`,
`number`, `boolean`, `directory` e `file`. Restrições opcionais incluem
`required`, `default`, `min`/`max` numérico, `multiple` de string, e escolhas de
`options` de string. Valores de arquivo e diretório são strings, sem verificação de existência
ou acesso adicional ao sistema de arquivos. `sensitive: true` é explicitamente não suportado,
inclusive quando um default é fornecido; não há armazenamento de segredos ou UI de configuração.

O Qwen usa a precedência SystemDefaults → User → System, mesclando chaves de opção
individuais. Configurações de workspace são ignoradas mesmo em workspaces confiáveis. O Qwen mapeia
extensões sem procedência de marketplace para a identidade inline. Elas aceitam
`name` e `name @inline`; o último vence dentro de cada fonte de configurações.
Plugins de marketplace usam sua identidade real `name @marketplace`. Uma fonte de maior
prioridade vence qualquer alias local de uma fonte de menor prioridade.

Como na implementação inspecionada do Claude, valores opcionais ausentes se tornam `''`
a menos que tenham defaults; `''` opcional também ignora verificações de tipo. Valores
obrigatórios rejeitam ausentes ou `''`, enquanto `false` e `0` permanecem válidos. Escolhas de string
armazenadas inválidas recorrem a defaults. Com um esquema não vazio, chaves de opção
desconhecidas também passam, limitadas a strings, números, booleanos ou arrays de string.
Um esquema ausente ou vazio recebe `{}`. Opções permanecem congeladas até o reinício.

## Dependências instaladas

O `dependencies` do manifesto aceita nomes de plugin, `name @marketplace`, ou objetos
como `{ "name": "base", "marketplace": "team", "version": "^1.0.0" }`.
Nomes nus referem-se ao marketplace do consumidor. Um plugin inline instalado com
o mesmo nome pode sobrepor uma dependência de marketplace, sem verificação de versão.
Caso contrário, intervalos de versão são verificados contra a versão do manifesto da extensão instalada.
Extensões ordinárias sem Mods podem satisfazer dependências.
Suas dependências transitivas são verificadas quando alcançáveis a partir de um Mod selecionado;
declarações de dependência de extensões ordinárias não relacionadas não participam.

Dependências já devem estar instaladas, habilitadas e selecionadas para esta invocação.
O Qwen não busca, instala ou habilita automaticamente. Mods selecionados são
registrados em ordem estável de consumidor-antes-de-dependência para dependências diretas
entre Mods; provedores ordinários não são nós de registro. Cada Mod tem um
realm separado; eventos passam por seus handlers nesta ordem, permitindo
interceptação entre plugins sem compartilhar variáveis de módulo.

Dependências ausentes, ambíguas, incompatíveis ou cíclicas rejeitam a inicialização antes
de qualquer worker Mod iniciar. Opções Mod inválidas também rejeitam a inicialização. Isso difere
da promoção seletiva de dependências e fallback de ordem de ciclo do Claude; o Qwen
retém a política de falha de inicialização de sessão inteira do subconjunto experimental.

## Limites de recursos

O leitor aceita arquivos regulares de até 256 KiB dentro da extensão instalada e
rejeita links simbólicos dentro dessa raiz. Grafos são limitados a 64 arquivos, 1 MiB
de entrada e 1 MiB de código compilado. Esses limites e a rejeição de symlinks são
mais estritos que os do Claude. Cada guest tem um limite de memória de 64 MiB e limite de stack de 1 MiB.
Os orçamentos de execução descritos acima incluem um limite de inicialização de 60 segundos para toda
inicialização de worker, compilação e hooks de inicialização juntos. O limite de memória
guest não cobre a memória do host do compilador.

A API do autor é baseada nas declarações do Claude Code 2.1.296 e na
[documentação oficial do Mod](https://code.claude.com/docs/en/plugins/mods/create).