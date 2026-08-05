# Anotações de entrada de mensagens do usuário do WebShell

## Contexto

A capacidade `@` do WebShell já suporta renderizar arquivos selecionados, extensões, recursos MCP e itens de provider customizado do host como chips na caixa de entrada. Os chips na caixa de entrada vêm de widgets inline do CodeMirror; o widget mantém o `WebShellComposerTag` completo, então é possível obter de forma estável `id`, `kind`, `label`, `value`, `serialized`, `removable` e o icon injetado pelo host via `composerTagIcons`.

A primeira implementação do PR1 atual não alterou a cadeia de envio; ela apenas reanalisa referências `@...` a partir do texto de `content` na fase de renderização da mensagem do usuário e renderiza as referências built-in reconhecíveis como chips. Isso resolve parte dos cenários reversíveis, como `@.qwen/`, `@ext:name`, `@mcp:name`, mas depende de adivinhação por texto e não consegue cobrir todas as entradas reais.

O feedback de review expôs o problema fundamental dessa direção:

- `@Makefile`, `@LICENSE`, `@src/Makefile` são referências de arquivo legítimas, mas apenas com texto não é possível distingui-las de forma estável de menções comuns ou tokens com aparência de package.
- Referências de custom provider como `@dataset:users` têm apenas texto restante após o envio; a renderização padrão não consegue obter o `kind`, `label`, `value` e icon originais.
- Os limites entre escaped MCP resource e pontuação subsequente só podem ser tratados por heurística; continuar adicionando regras tornaria o parser cada vez mais complexo e ainda assim não provaria correção completa.

Portanto, o PR1 precisa expandir o escopo: sem alterar o texto de prompt que o modelo recebe, preservar o metadata estruturado de entrada que o composer já possui ao longo das cadeias de submissão, transcript, mensagem local e replay. A renderização da mensagem do usuário usa apenas o metadata para renderizar chips; mensagens antigas ou mensagens sem metadata continuam exibindo o texto original, sem tentar adivinhar referências a partir de texto puro.

O novo campo não pode ser nomeado `composerTags`. `composerTag` é um detalhe de implementação do chip `@` atual, mas a entrada do usuário do WebShell também tem slash command `/`, skill command, custom command, system command, local command e outras entradas estruturadas. O novo metadata de envio deve expressar "anotações estruturadas na entrada do usuário"; nesta iteração apenas anotações de referência `@` são gravadas, e anotações de comando `/` podem ser adicionadas ao mesmo campo posteriormente.

## Objetivos

- Os chips de referência `@` que o usuário vê na caixa de entrada mantêm uma renderização de chip consistente na bolha de mensagem do usuário após o envio.
- Suportar tags built-in de arquivo, extensão e MCP, incluindo arquivos sem extensão e escaped MCP resource.
- Suportar a renderização de chip padrão de providers customizados do host, desde que o provider forneça `composerTag` no item aceito.
- Manter o conteúdo do prompt do lado do modelo inalterado; o daemon/modelo continua recebendo a string gerada pelo `buildComposerPrompt(text, tags)` atual.
- Manter a capacidade de override de `renderUserMessageContent`; se o host customizar o conteúdo da mensagem do usuário, ele ainda pode assumir totalmente a renderização.
- Manter compatibilidade com transcripts antigos, daemons antigos e mensagens sem metadata: o conteúdo continua exibido como está, apenas sem renderizar chips adicionais.
- Reservar um ponto de extensão unificado para entradas estruturadas subsequentes, como comando `/`, skill command e custom command.

## Não Objetivos

- Não alterar o protocolo de registro de providers `@`.
- Não adicionar suporte `@skill:` para skills; o WebShell atualmente referencia skills via `/`.
- Não gravar URLs de icon no transcript persistido. Os icons continuam sendo resolvidos por `composerTagIcons` por `kind` no momento da renderização.
- Não passar metadata para o modelo, nem alterar a semântica de parsing de prompt do daemon.
- Não tentar restaurar 100% de todas as referências de custom provider ou arquivos sem extensão a partir de texto puro.
- Não alterar a renderização de comando `/` nesta iteração; apenas projetar o campo de metadata para que possa carregar anotações de comando `/`.
- Não adicionar reconstrução de anotação para retry com Ctrl+Y nesta iteração; o retry reutiliza a mensagem original do usuário, sem adicionar novo user echo duplicado.
- Não adicionar rollback de anotação após falha de `onSubmitBefore` nesta iteração; em caso de falha o prompt não entra na cadeia de envio, mantendo o comportamento atual de cancelamento.

## Decisões de Escopo

- Nesta iteração é aceito modificar simultaneamente `packages/web-shell`, `packages/webui`, `packages/sdk-typescript` e `packages/acp-bridge`. Os três primeiros são responsáveis por submissão, echo local, tipos de transcript/mensagem e renderização; `packages/acp-bridge` é responsável por gravar o user echo do daemon no `user_message_chunk.update._meta` replicável, caso contrário a anotação não pode ser recuperada após atualizar/reabrir a sessão.
- Tanto o envio comum quanto o prompt enfileirado precisam suportar anotação. O prompt enfileirado também exibe esta entrada na área de mensagem do usuário; sem carregar metadata, haveria inconsistência com o envio comum.
- `renderUserMessageContent` precisa ter seus parâmetros de entrada estendidos para que o renderer customizado do host possa ler `inputAnnotations`. O renderer padrão usa o metadata para renderizar chips; o renderer do host ainda mantém o override final.
- Remover o fallback que infere chips `@` a partir de texto puro, evitando continuar mantendo um parser heurístico que não pode ser completamente correto.
- Nesta iteração apenas anotações de referência `@` são geradas e renderizadas; comando `/`, skill command e custom command apenas têm espaço reservado na estrutura de dados, sem implementação de renderização de chip após o envio.

## Capacidades de entrada estruturada pesquisadas

O lado de entrada do WebShell atual tem pelo menos as seguintes capacidades estruturadas:

- Referências `@`: fornecidas por `useAtMentionMenu`, incluindo arquivo built-in, extensão, servidor/recurso MCP, além de providers customizados injetados pelo host via `atProviders`. Após aceitação, um `WebShellComposerTag` é gerado e o CodeMirror renderiza o chip via widget inline.
- Slash commands `/`: `slashCompletion.ts` fornece o autocomplete. Os comandos de nível superior vêm de `session.available_commands` do daemon, local commands do WebShell, custom commands, skill commands e system commands.
- Subcomandos `/`: `slashCompletion.ts` suporta `subcommands` explícitos, árvore de subcomandos embutida e árvore de subcomandos implícita. Por exemplo, `/mcp desc`, `/stats model`, `/memory show`, `/skills <skill-name>`.
- Categoria de comando: `commandDisplay.ts` classifica os comandos em `custom`, `skill`, `system`. `App.tsx` marca o comando correspondente como categoria skill com base em `connection.skills`.
- Local slash commands: `localCommands.ts` define comandos locais como `help`, `theme`, `language`, `model`, `mcp`, `skills`, `memory`, `context`, `agents`, `goal`, `tasks`, `extensions`.
- Shell mode / `!`: o composer pode submeter `!${prompt}` em shell mode, que é outra semântica de entrada do usuário, mas não está no escopo de renderização desta iteração.

Essas capacidades indicam que o novo campo de metadata deve ser uma lista de anotações genérica, em vez de uma lista de tags servindo apenas ao `@`.

## Cadeia atual

### Dentro da caixa de entrada

`useComposerCore` mantém tags inline na caixa de entrada. Na submissão já é possível obter o `WebShellComposerTag[]` completo via `tagsOverride ?? composerTagsRef.current`. Essas tags são usadas por `buildComposerPrompt(text, tags)` e acabam mescladas no texto de prompt enviado ao daemon.

### Envio e echo local

`sendPrompt` do `App.tsx` recebe apenas `text` e `images`, e `sessionActions.sendPrompt(text, options)` também envia apenas o texto do prompt. Para exibição otimista ou echo de comando local, o WebShell chama `store.appendLocalUserMessage(text, images)`.

`appendLocalUserMessage` atualmente grava apenas `text/images` no `DaemonTextTranscriptBlock`, sem carregar metadata estruturado de entrada.

### Replay para o componente de mensagem

`transcriptBlocksToDaemonMessages` converte o user block do transcript em `DaemonUserMessage`, mantendo atualmente apenas `content`, `images`, `timestamp` e `source`. `UserMessage` só consegue obter `content/images`, então a primeira implementação só podia re-adivinhar tags via parser de texto.

## Visão geral da solução

Adicionar uma nova cadeia de metadata apenas para UI. Ela se divide em dois caminhos adjacentes, mas com responsabilidades diferentes: o echo otimista da página atual e o echo persistido do transcript do daemon.

```text
CodeMirror inline tags
  -> submitText / submitPromptFromEditor
  -> sendPrompt options
  -> sessionActions.sendPrompt / sessionActions.submitPrompt options
  -> A. store.appendLocalUserMessage(text, images, { inputAnnotations })
     -> chip da mensagem do usuário exibido imediatamente na aba atual
  -> B. PromptRequest._meta.inputAnnotations
     -> bridge echoPromptToSessionBus mesclado em user_message_chunk.update._meta
     -> replay/load obtém o mesmo lote de eventos session_update
     -> normalizeDaemonEvent gera user.text.delta.meta.inputAnnotations
     -> reduceDaemonTranscriptEvents grava em DaemonTextTranscriptBlock.meta.inputAnnotations
     -> transcriptBlocksToDaemonMessages
     -> DaemonUserMessage.inputAnnotations
     -> renderer padrão do UserMessage
```

`content` continua sendo o texto de prompt que o modelo e o daemon precisam processar. `inputAnnotations` descreve apenas a entrada estruturada necessária para renderização de UI, sem participar da entrada do modelo.

## Estrutura de dados

Adicionar uma nova estrutura genérica de anotação de entrada, com o campo de nível superior nomeado `inputAnnotations`:

```ts
interface DaemonUserMessage {
  id: string;
  role: 'user';
  content: string;
  images?: Array<{ data: string; mimeType: string }>;
  source?: string;
  inputAnnotations?: DaemonInputAnnotation[];
}
```

`DaemonInputAnnotation` expressa "a semântica estruturada correspondente a um trecho do texto em content". O princípio de design é adicionar apenas um wrapper externo de annotation, reutilizando ao máximo os formatos de objeto existentes de `@` e `/` no payload interno, evitando um novo protocolo paralelo a `WebShellComposerTag` e `CommandInfo`. Nesta iteração apenas `type: 'reference'` é implementado; comandos `/` subsequentes podem reutilizar o mesmo array para continuar estendendo:

```ts
interface DaemonInputReferenceAnnotation {
  type: 'reference';
  start: number;
  end: number;
  text: string;
  reference: DaemonInputReference;
}

interface DaemonInputReference {
  id: string;
  kind?: string;
  label?: string;
  value?: string;
  serialized?: string;
  removable?: boolean;
}

type DaemonInputAnnotation = DaemonInputReferenceAnnotation;
```

`start/end` são offsets UTF-16 relativos ao `content` final, consistentes com o processamento de strings atual do React/CodeMirror. Isso evita que a renderização subsequente dependa novamente de `serialized` para localizar a posição dentro de `content` por busca reversa, e também deixa espaço para múltiplas referências idênticas, comandos idênticos e texto inline misturado.

Nesta iteração, o payload de referência `@` reutiliza diretamente o `WebShellComposerTag` existente:

```ts
interface WebShellComposerTag {
  id: string;
  kind?: string;
  label?: string;
  value?: string;
  serialized?: string;
  removable?: boolean;
}
```

No futuro, o payload de comando `/` reutiliza diretamente o `CommandInfo` existente, adicionando apenas `subcommandPath` na camada de annotation:

```ts
interface CommandInfo {
  name: string;
  description: string;
  argumentHint?: string;
  subcommands?: string[];
  source?: string;
  displayCategory?: 'custom' | 'skill' | 'system';
}
```

Armazenar o mesmo `inputAnnotations` no `meta` do transcript block do SDK:

```ts
interface DaemonTextDeltaMeta {
  inputAnnotations?: DaemonInputAnnotation[];
}
```

Na implementação, o pacote SDK não deve importar tipos do client do WebShell. O SDK define uma estrutura mínima de meta compatível com os campos de `WebShellComposerTag` e `CommandInfo`, e o adapter do WebShell converte essa estrutura nos tipos necessários para renderização do client. Isso evita a dependência reversa do SDK em relação ao WebShell, mantendo o formato dos campos consistente com os formatos existentes de `@` / `/`.

## Pontos-chave de modificação

### 1. A cadeia de submissão carrega inputAnnotations

Ajustar a forma dos parâmetros de submissão do editor para que `sendPrompt` possa obter o `DaemonInputAnnotation[]` da submissão.

Sugestão de adicionar um campo leve de options:

```ts
interface SendPromptInputMetadata {
  inputAnnotations?: DaemonInputAnnotation[];
}
```

`useComposerCore.submitText()` já conhece `tags` e `prompt` final ao gerar o texto do prompt. Ele precisa converter as tags `@` desta iteração em anotações `reference` e então chamar o `onSubmit` superior:

- `promptText`: o texto enviado atualmente ao daemon, inalterado.
- `images`: as imagens atuais.
- `inputAnnotations`: o snapshot das anotações estruturadas de entrada no momento da submissão.

Se a assinatura atual de `onSubmit` não for adequada para extensão direta, pode-se adicionar um quarto parâmetro de metadata, evitando quebrar chamadas existentes:

```ts
onSubmit(promptText, images, commitAccepted, { inputAnnotations });
```

Regras de geração de anotação desta iteração:

- Calcular `start/end` para o prefixo de tag gerado por `buildComposerPrompt(text, tags)`.
- Cada tag corresponde a uma anotação `type: 'reference'`.
- `annotation.text` usa o texto serialized real no prompt final.
- `annotation.reference` preserva os campos mínimos seguros do `WebShellComposerTag` original: `id/kind/label/value/serialized/removable`.
- Não preservar URLs de icon; os icons continuam sendo resolvidos por `kind + composerTagIcons` no momento da renderização.

Se no futuro comandos `/` também precisarem de renderização estruturada, pode-se gerar uma anotação `type: 'command'` no momento do accept do slash completion, ou gerar anotações de comando na fase de submissão com base no `CommandInfo` atingido. O payload de comando preserva diretamente os campos existentes de `CommandInfo`, e as informações de subcomando são colocadas em `subcommandPath` do wrapper de annotation.

### 2. O echo local do transcript preserva metadata

Estender o transcript store do SDK:

```ts
appendLocalUserMessage(
  text: string,
  images?: Array<{ data: string; mimeType: string }>,
  meta?: { inputAnnotations?: DaemonInputAnnotation[] },
): void;
```

`appendLocalUserTranscriptMessage` recebe `meta` de forma sincronizada:

```ts
appendLocalUserTranscriptMessage(state, text, { images, meta });
```

Gravar após a criação do user text block:

```ts
if (opts.meta) {
  block.meta = { ...block.meta, ...opts.meta };
}
```

Esta cadeia apenas garante que a mensagem otimista do usuário no store frontend atual tenha chips imediatamente. Ela não garante por si só que o metadata ainda esteja disponível após atualizar ou reabrir a sessão, pois o transcript após a atualização vem do replay do daemon, e não do append local na memória da aba atual.

Local slash commands sem input annotations continuam passando metadata vazia, sem alterar o comportamento existente.

### 3. O prompt echo do daemon persiste metadata

`PromptRequest` já suporta atualmente `_meta?: Record<string, unknown> | null`. No envio, gravar o mesmo `inputAnnotations` em `PromptRequest._meta.inputAnnotations`:

```ts
const promptRequest = {
  prompt: toDaemonPromptContent(text, normalizedImages),
  _meta: inputAnnotations.length > 0 ? { inputAnnotations } : undefined,
};
```

A bridge, dentro de `sendPrompt`, entrega o request ao agent prompt e ao mesmo tempo publica `user_message_chunk` via `echoPromptToSessionBus`. Aqui é necessário mesclar o `_meta.inputAnnotations` do request no `update._meta` do echo:

```ts
_meta: {
  ...pickUserInputEchoMeta(req._meta),
  serverTimestamp,
  source: 'bridge-echo',
}
```

`pickUserInputEchoMeta` preserva apenas `inputAnnotations`, sem gravar meta de request desconhecido como está no transcript da mensagem do usuário. Isso evita expor dados não-UI como telemetry, requestId e retry ao `UserMessage`.

No replay, `DaemonSessionProvider` re-normaliza `compactedReplay/liveJournal` em eventos de UI; `normalizeDaemonEvent` já coloca `user_message_chunk.update._meta` em `user.text.delta.meta`; o transcript reducer já grava o `meta` do evento de texto em `DaemonTextTranscriptBlock.meta`. Portanto, desde que o evento de echo do daemon carregue `inputAnnotations`, a renderização de chips pode ser recuperada após atualizar e reabrir a mesma sessão.

### 4. O transcript adapter encaminha metadata

`transcriptBlocksToDaemonMessages` atualmente já lê `meta.source` do user block. No mesmo local, ler `meta.inputAnnotations`, validar como array e gravar em `DaemonUserMessage.inputAnnotations`.

Aqui é necessária validação estrutural mínima para evitar que meta desconhecido do transcript afete a renderização:

- Deve ser um array.
- Cada annotation deve ter `id/type/text` como string não vazia.
- `start` e `end` devem ser números finitos e satisfazer `0 <= start < end <= content.length`.
- Nesta iteração apenas anotações `type: 'reference'` são geradas e renderizadas; anotações de comando subsequentes podem ser estendidas sob o mesmo campo.
- O payload de referência passa por sanitização mínima conforme os campos de `WebShellComposerTag`, aceitando apenas valores string para `id/kind/label/value/serialized` e valor boolean para `removable`.
- O payload de comando passa por sanitização mínima conforme os campos de `CommandInfo`, aceitando apenas valores string para `name/description/argumentHint/source/displayCategory` e array de strings para `subcommands`.
- Não preservar campos desconhecidos.

### 5. UserMessage usa inputAnnotations com prioridade

Adicionar às props de `UserMessage`:

```ts
inputAnnotations?: DaemonInputAnnotation[];
```

Os parâmetros de entrada de `renderUserMessageContent` recebem o campo de mesmo nome de forma sincronizada:

```ts
renderUserMessageContent?.({ content, images, inputAnnotations });
```

A lógica de renderização padrão passa a ser:

1. Se `inputAnnotations` contiver uma anotação `type: 'reference'` válida, dividir `content` por `start/end` e renderizar chips.
2. Se o metadata estiver ausente ou não houver anotação válida, renderizar diretamente o texto original.
3. Se o host fornecer `renderUserMessageContent`, continuar usando o renderer do host com prioridade.

A renderização por metadata não adivinha mais o tipo de tag a partir de `content`, nem precisa buscar posição pelo texto serialized. Quando ranges forem inválidos ou se sobrepuserem, a annotation correspondente é ignorada, garantindo que nenhum conteúdo do usuário seja ocultado.

### 6. Remover o fallback do parser de texto

`splitComposerTagContent` não é mais mantido. O motivo é que o parser antigo só podia adivinhar o tipo de referência pela forma da string:

- `@Makefile` e `@alice` podem ambos ser texto legítimo.
- `@dataset:users` precisa do metadata do provider para conhecer label/value/icon.
- A pontuação final de escaped MCP resource é difícil de provar correta por regras genéricas.

Portanto, a mensagem padrão do usuário renderiza chips apenas quando a annotation existe; na ausência de annotation, exibe o texto original. Assim, o problema de `@Makefile` no review não depende mais de heurística, pois novas mensagens obtêm uma file tag explícita do metadata.

## Comportamento de custom provider

Se o provider fornecer no item aceito:

```ts
composerTag: {
  id: 'dataset:users',
  kind: 'dataset',
  label: 'Dataset',
  value: 'users',
  serialized: '@dataset:users',
}
```

Após o envio, a mensagem padrão do usuário pode renderizar:

- label: `Dataset`
- value: `users`
- icon: resolvido via `composerTagIcons.dataset`

Se o provider não fornecer `composerTag`, após o envio restará apenas texto puro; o renderer padrão não se compromete a reconhecer automaticamente custom providers. O host ainda pode usar `renderUserMessageContent` para tratar por conta própria.

## Compatibilidade

- Transcripts antigos não têm `meta.inputAnnotations` e continuam exibidos como texto original.
- Novo client lendo eventos de daemon antigo não tem mudança de comportamento.
- Client antigo lendo transcript com `meta.inputAnnotations` ignora o meta desconhecido.
- `content` não muda, então o parsing de prompt do daemon, a entrada do modelo, o texto de slash command e o conteúdo histórico de prompts não são afetados.
- A prioridade de `renderUserMessageContent` não muda; a renderização customizada do host não é sobrescrita pelos chips padrão.

## Plano de testes

### Unit tests

- `appendLocalUserTranscriptMessage` preserva `meta.inputAnnotations`.
- `createDaemonTranscriptStore().appendLocalUserMessage` consegue receber e preservar o metadata.
- `sessionActions.sendPrompt` e `sessionActions.submitPrompt` conseguem gravar `inputAnnotations` em `PromptRequest._meta`.
- `echoPromptToSessionBus` da bridge apenas mescla `inputAnnotations` em `user_message_chunk.update._meta`, sem gravar meta de request desconhecido no transcript echo.
- `user_message_chunk.update._meta.inputAnnotations` do replay consegue ser gravado em `DaemonTextTranscriptBlock.meta.inputAnnotations` via `normalizeDaemonEvent` e reducer.
- `transcriptBlocksToDaemonMessages` converte `meta.inputAnnotations` do user block em `DaemonUserMessage.inputAnnotations`.
- `transcriptBlocksToDaemonMessages` filtra meta de annotation inválido.
- `UserMessage` renderiza `@Makefile`, `@LICENSE`, `@src/Makefile` usando reference annotation.
- `UserMessage` renderiza tag de custom provider usando reference annotation e resolve `composerTagIcons`.
- `UserMessage` mantém a exibição de texto original quando o metadata está ausente.
- `UserMessage` ignora a annotation quando o range é inválido ou sobreposto, sem perder o texto original.
- O tipo reservado de command annotation pode ser preservado pela validação de schema, mas a renderização padrão desta iteração o ignora, sem afetar a renderização de reference.

### Integration / verificação em navegador

- No WebShell local, selecionar `.qwen/`, `Makefile` ou `LICENSE`; após o envio, a mensagem do usuário ainda exibe o file chip.
- Selecionar um MCP resource; após o envio, a mensagem do usuário exibe o chip MCP e caracteres escapados no resource não são aparados incorretamente.
- Injetar um custom provider, selecionar e enviar; a mensagem do usuário exibe custom label/value/icon.
- Atualizar a página ou reabrir a mesma sessão; os chips da mensagem do usuário ainda estão presentes.

## Riscos e controles

- Risco: o aumento de tipos entre pacotes amplia a área do PR. O controle é definir o `DaemonInputAnnotation` mínimo no SDK, evitando que o SDK importe tipos do client do WebShell.
- Risco: inconsistência entre metadata e `content` causa desalinhamento de renderização. O controle é o UserMessage usar apenas ranges válidos e não sobrepostos, ignorando diretamente anotações inválidas, sem ocultar nenhum conteúdo do usuário.
- Risco: informações persistidas de custom provider podem conter campos customizados do host. O controle é preservar apenas `id/kind/label/value/serialized/removable`, sem preservar campos desconhecidos nem URLs de icon.
- Risco: o custo de review sobe após a expansão do escopo do PR1. O controle é explicitar a motivação na descrição da submissão: isso resolve a causa raiz de o parser de texto puro não conseguir restaurar corretamente a identidade file/custom/MCP, mantendo ao mesmo tempo o prompt voltado ao modelo inalterado.
- Risco: um nome de metadata de nível top muito restrito limita capacidades subsequentes de `/`. O controle é usar `inputAnnotations` como entrada unificada, gravando apenas `type: 'reference'` nesta iteração.

## Ordem de implementação

1. Adicionar a estrutura mínima de meta de input annotation nos tipos de transcript do SDK.
2. Estender `appendLocalUserTranscriptMessage` e `DaemonTranscriptStore.appendLocalUserMessage`.
3. Estender as options de submissão do WebShell, passando `inputAnnotations` de `useComposerCore` até `App.sendPrompt` e a submissão de prompt enfileirado.
4. Ao gravar o echo otimista em `store.appendLocalUserMessage`, incluir `inputAnnotations`.
5. Gravar `inputAnnotations` no `PromptRequest._meta` do daemon e fazer o user echo da bridge mesclá-lo em `user_message_chunk.update._meta`.
6. Encaminhar e sanitizar `meta.inputAnnotations` em `transcriptBlocksToDaemonMessages`.
7. Estender a cadeia de props de `DaemonUserMessage`, `MessageList` até `UserMessage`.
8. Estender os parâmetros de entrada de `renderUserMessageContent`, expondo `inputAnnotations` ao renderer do host.
9. A renderização padrão de `UserMessage` usa apenas o metadata; sem metadata, exibir o texto como está.
10. Completar unit tests e capturas de aceitação em navegador.

## Pontos-chave da descrição do PR

A descrição do PR precisa explicar:

- Isso não altera o prompt do modelo; é a preservação do metadata de UI input annotation que o WebShell já possui.
- Um parser de texto puro não consegue distinguir de forma confiável formatos como `@Makefile`, `@alice`, `@dataset:users`, portanto o metadata é necessário.
- Mensagens antigas continuam compatíveis com exibição como texto original; custom providers só desfrutam da renderização de chip padrão quando fornecem `composerTag`.
- O novo campo é nomeado `inputAnnotations`; nesta iteração ele carrega apenas referências `@`, e futuramente poderá carregar comandos `/`, skill commands, custom commands e outras entradas estruturadas.
- `renderUserMessageContent` continua sendo o ponto final de override do host.
