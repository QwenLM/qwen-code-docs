```markdown
# Documento de Design Técnico da Fase 3: Alinhamento de Experiência

## 1. Objetivos e Restrições de Design

### 1.1 Objetivos

Com base nos metadados de comandos, filtragem entre modos e chamadas de modelo por prompt command implementados nas Fases 1/2, a Fase 3 completa a experiência de slash command perceptível pelo usuário:

- Menu de autocompletar exibindo fonte, dica de argumento, alias correspondente e introduzindo ordenação por uso recente no nível da sessão
- Aprimorar o ghost text do slash command em meio à digitação, dicas de argumento, exibição de fonte e destaque de tokens válidos
- Reestruturar o `/help` de uma pilha de comandos atualmente inutilizável para um painel de ajuda no estilo Claude Code, com abas, claro e bonito
- Enriquece os metadados de comando do ACP `available_commands_update`
- Confirma que o `/doctor` já implementado não será reimplementado; `/release-notes` não está incluído nesta fase

### 1.2 Restrições Obrigatórias

- **O código é a referência**: Quando houver diferenças entre a documentação das Fases 1/2 e a implementação, o código-fonte do branch principal atual é a verdade.
- **Não introduzir nova arquitetura de execução**: Continuar reutilizando os componentes `SlashCommand`, `CommandService`, `handleSlashCommand`, `useSlashCompletion` e `Help` existentes, sem criar novos `CommandDescriptor` / `CommandExecutor` / `ModeAdapter`.
- **Não restaurar `commandType`**: A implementação atual já removeu o campo `commandType` do design inicial da Fase 1. A Fase 3 não reintroduzirá esse campo.
- **Uso recente no nível da sessão**: A ordenação por uso recente só é válida dentro da sessão CLI atual, sem persistência em disco.
- **Comportamento interativo não deve regredir**: Funcionalidades existentes como autocompletar, help, doctor, etc., devem continuar funcionando; a Fase 3 apenas aprimora a exibição e complementa comandos faltantes.
- **Compatibilidade retroativa do ACP**: Os campos existentes `availableCommands[].name`, `description` e `input` permanecem inalterados; novos metadados são adicionados em campos compatíveis ou em `_meta` para evitar quebrar clientes ACP existentes.

---

## 2. Linha de Base da Implementação Atual (Conclusões da Auditoria de Código)

### 2.1 Metadados Existentes e Comportamento do Loader

`packages/cli/src/ui/commands/types.ts` atualmente já contém em `SlashCommand`:

- `source?: CommandSource`
- `sourceLabel?: string`
- `supportedModes?: ExecutionMode[]`
- `userInvocable?: boolean`
- `modelInvocable?: boolean`
- `argumentHint?: string`
- `whenToUse?: string`
- `examples?: string[]`

`CommandSource` atualmente suporta:

```typescript
export type CommandSource =
  | 'builtin-command'
  | 'bundled-skill'
  | 'skill-dir-command'
  | 'plugin-command'
  | 'mcp-prompt';
```

Informações de exibição já preenchidas por cada Loader:

| Loader                                  | source                                 | sourceLabel                              | argumentHint     | modelInvocable                                   |
| --------------------------------------- | -------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------ |
| `BuiltinCommandLoader`                  | `builtin-command`                      | `Built-in`                               | A maioria não declarado | `false`                                          |
| `BundledSkillLoader`                    | `bundled-skill`                        | `Skill`                                  | Vindo da skill   | `!disableModelInvocation`                        |
| `FileCommandLoader` / `command-factory` | `skill-dir-command` / `plugin-command` | `Custom` / `Plugin: <extensionName>`     | Vindo do frontmatter | Usuário/projeto default true; plugin requer description/whenToUse |
| `SkillCommandLoader`                    | `skill-dir-command` / `plugin-command` | `User` / `Project` / `Extension: <name>` | Vindo da skill   | Usuário/projeto default true; plugin requer description/whenToUse |
| `McpPromptLoader`                       | `mcp-prompt`                           | `MCP: <serverName>`                      | Não gerado       | Atualmente não define `modelInvocable` explicitamente |

> [!note]
> O roadmap da Fase 1 exigia `modelInvocable: true` para MCP prompts, mas a implementação atual não define isso explicitamente. A Fase 3 não altera o caminho de chamada de modelo para MCP prompts; MCP prompts ainda são chamados pelo mecanismo nativo MCP, não via `SkillTool`.

### 2.2 Capacidades da Fase 3 Já Implementadas

| Capacidade                                                 | Status Atual                                                                                                | Arquivos Chave                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Ghost text básico para slash em meio à digitação            | Parcialmente implementado, apenas para comandos `modelInvocable` com prefixo                                 | `ui/utils/commandUtils.ts`, `ui/hooks/useCommandCompletion.tsx`    |
| Ghost text de argumento para comando no início da linha    | Parcialmente implementado, exibe `argumentHint` quando comando corresponde exatamente e sem argumentos       | `ui/hooks/useCommandCompletion.tsx`                                |
| Participação de alias na correspondência                     | Correspondência e ordenação implementadas, mas a exibição sempre mostra todos os alias, sem distinguir o alias correspondido | `ui/hooks/useSlashCompletion.ts`                                   |
| Badge de origem                                              | Apenas MCP exibe `[MCP]`                                                                                    | `ui/components/SuggestionsDisplay.tsx`, `ui/components/Help.tsx`   |
| `/help`                                                      | Implementação atual considerada incompleta: embora haja tentativa de agrupamento, ainda é uma pilha de comandos, sem a experiência de painel de ajuda com abas, clara e legível ao estilo Claude Code | `ui/components/Help.tsx`                                           |
| ACP `argumentHint`                                           | Já mapeado para `availableCommands[].input.hint`                                                             | `acp-integration/session/Session.ts`                               |
| ACP source/supportedModes/subcommands/modelInvocable         | Não expostos                                                                                                | `acp-integration/session/Session.ts`                               |
| Tratamento de conflitos                                      | Comandos de extensão com nomes conflitantes são renomeados para `extensionName.commandName`; conflitos não-extension sobrepõem o carregamento anterior pelo posterior | `services/CommandService.ts`                                       |
| `/doctor`                                                    | Implementado, suporta `interactive` / `non_interactive` / `acp`                                             | `ui/commands/doctorCommand.ts`, `utils/doctorChecks.ts`            |

### 2.3 Pontos de Referência do Claude Code

Consultando o código-fonte em `/Users/mochi/code/claude-code`:

- `src/types/command.ts`: O modelo de comando inclui campos de exibição/capacidade como `argumentHint`, `whenToUse`, `aliases`, `loadedFrom`, `kind`, `immediate`, `isSensitive`, `userFacingName`, `supportsNonInteractive`.
- `src/utils/suggestions/commandSuggestions.ts`: A ordenação de autocompletar considera correspondência exata, correspondência de alias, prefixo, fuzzy, uso de skill; quando um alias é correspondido, apenas o alias realmente usado pelo usuário é exibido.
- `src/utils/suggestions/commandSuggestions.ts`: Para slash em meio à digitação, usa `findMidInputSlashCommand()`, `getBestCommandMatch()` e `findSlashCommandPositions()` para suportar ghost text e destaque.
- `src/components/HelpV2/Commands.tsx`: Help V2 é um catálogo de comandos navegável, exibindo informações de origem junto com a descrição.
- `src/commands.ts`: Claude Code inclui comandos built-in como `/doctor`, `/release-notes`; Qwen Code já implementou `/doctor` atualmente; `/release-notes` não será implementado nesta fase.

A Fase 3 adota a abordagem "alinhamento de experiência, sem copiar a arquitetura" para se inspirar nos pontos acima.

---

## 3. Plano Geral

### 3.1 Visão Geral das Alterações de Arquivos

| Arquivo                                                  | Conteúdo da Alteração                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/SuggestionsDisplay.tsx`  | Estender o tipo `Suggestion` para exibir badge de origem, argumentHint, aliasHit     |
| `packages/cli/src/ui/hooks/useSlashCompletion.ts`        | Gerar itens de autocompletar aprimorados; ordenação integrada com uso recente; manter info de alias correspondido |
| `packages/cli/src/ui/hooks/useCommandCompletion.tsx`     | Ghost text em meio à digitação reutiliza correspondência aprimorada; retorna metadados de argumento/origem para exibição na UI |
| `packages/cli/src/ui/utils/commandUtils.ts`              | Adicionar funções auxiliares para destaque de token slash, ou estender funções existentes para retornar validade do comando |
| `packages/cli/src/ui/components/InputPrompt.tsx`         | Renderizar destaque de token de slash command válido; manter aceitação de ghost text via Tab |
| `packages/cli/src/ui/components/Help.tsx`                | Reestruturar para um painel de ajuda no estilo Claude Code com abas, evitando pilha de comandos |
| `packages/cli/src/ui/commands/helpCommand.ts`            | Se necessário texto de ajuda para non-interactive/acp, estender a ação; caso contrário, apenas manter a UI interativa |
| `packages/cli/src/acp-integration/session/Session.ts`    | Expor metadados aprimorados na atualização do ACP                                    |
| `packages/cli/src/ui/commands/*Command.ts`               | Complementar `argumentHint` para comandos built-in comuns                             |

### 3.2 Nova Ferramenta de Exibição Compartilhada

Sugere-se criar `packages/cli/src/services/commandMetadata.ts` para centralizar a lógica de exibição necessária para Help, Completion e ACP:

```typescript
export function getCommandSourceBadge(cmd: SlashCommand): string | null;
export function getCommandSourceGroup(cmd: SlashCommand): CommandSourceGroup;
export function formatSupportedModes(cmd: SlashCommand): string;
export function getCommandDisplayName(cmd: SlashCommand): string;
export function getCommandSubcommandNames(cmd: SlashCommand): string[];
```

Não é recomendado colocar essas funções de exibição dentro dos Loaders, para evitar que os Loaders assumam responsabilidades de UI.

---

## 4. Fase 3.1: Aprimoramento da Experiência de Autocompletar

### 4.1 Estendendo a Estrutura de Dados `Suggestion`

Atual:

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;
}
```

Sugere-se estender para:

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;

  // Fase 3
  source?: CommandSource;
  sourceLabel?: string;
  sourceBadge?: string;
  argumentHint?: string;
  matchedAlias?: string;
  supportedModes?: ExecutionMode[];
  modelInvocable?: boolean;
}
```

Sugestões de arquivo (para comandos não-slash) não precisam preencher esses campos.

### 4.2 Exibição do Badge de Origem

Atualmente, `SuggestionsDisplay` só adiciona `[MCP]` para `CommandKind.MCP_PROMPT`. A Fase 3 muda para usar `source` / `sourceLabel` para gerar badges uniformemente:

| source / sourceLabel              | badge                                      |
| --------------------------------- | ------------------------------------------ |
| `builtin-command`                 | `[Built-in]` (opcional: não exibir por padrão para reduzir ruído) |
| `bundled-skill` / `Skill`         | `[Skill]`                                  |
| `skill-dir-command` / `User`      | `[User]`                                   |
| `skill-dir-command` / `Project`   | `[Project]`                                |
| `skill-dir-command` / `Custom`    | `[Custom]`                                 |
| `plugin-command` / `Plugin: x`    | `[Plugin]` ou `[Plugin: x]`                |
| `plugin-command` / `Extension: x` | `[Extension]` ou `[Extension: x]`          |
| `mcp-prompt`                      | `[MCP]`                                    |

Implementação recomendada:

```typescript
function getCommandSourceBadge(cmd: SlashCommand): string | null {
  switch (cmd.source) {
    case 'bundled-skill':
      return '[Skill]';
    case 'skill-dir-command':
      return cmd.sourceLabel === 'User'
        ? '[User]'
        : cmd.sourceLabel === 'Project'
          ? '[Project]'
          : '[Custom]';
    case 'plugin-command':
      return '[Plugin]';
    case 'mcp-prompt':
      return '[MCP]';
    case 'builtin-command':
    default:
      return null;
  }
}
```

> [!note]
> A decisão de exibir ou não `[Built-in]` depende da legibilidade da UI. No Help, o agrupamento Built-in deve ser exibido; no menu de autocompletar, o badge built-in pode ser omitido, exibindo badge apenas para origens não built-in.

### 4.3 Exibição da Dica de Argumento

No menu de autocompletar, após o nome do comando, adicionar o `argumentHint` em cinza:

```text
/model <model-id>              Switch model
/export md|html|json|jsonl     Export current session
/review [pr-number] [--comment] [Skill] Review changed code
```

Sugestões de implementação:

- `useSlashCompletion` preenche `argumentHint: cmd.argumentHint` em `finalSuggestions`
- `SuggestionsDisplay` renderiza `argumentHint` após o label com `theme.text.secondary`
- `commandColumnWidth` calcula incluindo label + hint + badge, para evitar desalinhamento da coluna de descrição
- Autocompletar de subcomandos também suporta `argumentHint`

É necessário primeiro complementar `argumentHint` para comandos built-in comuns. Sugere-se o primeiro lote:

| Comando           | argumentHint            |
| ----------------- | ----------------------- |
| `/model`          | `[--fast] [<model-id>]` |
| `/approval-mode`  | `<mode>`                |
| `/language`       | `ui                     | output <language>` |
| `/export`         | `md                     | html               | json     | jsonl [path]` |
| `/memory`         | `show                   | add                | refresh` |
| `/mcp`            | `desc                   | nodesc             | schema   | auth          | noauth` |
| `/stats`          | `[model                 | tools]`            |
| `/docs`           | Vazio ou não definido   |
| `/doctor`         | Vazio ou não definido   |

### 4.4 Ordenação por Uso Recente

#### 4.4.1 Armazenamento de Estado

Manter o estado de uso recente no nível da sessão em `useSlashCommandProcessor` ou `AppContainer`:

```typescript
type RecentSlashCommand = {
  name: string;
  usedAt: number;
  count: number;
};
```

Sugere-se armazenar como `Map<string, RecentSlashCommand>`, usando a chave como nome final do comando (ou seja, `cmd.name` após tratamento de conflitos).

#### 4.4.2 Momento de Registro

Registrar o uso após `useSlashCommandProcessor.handleSlashCommand` resolver com sucesso `commandToExecute`:

- Se comando não encontrado, não registrar
- Comandos ocultos podem não ser registrados
- Chamadas via alias são registradas pelo nome canônico `commandToExecute.name`
- Chamadas de subcomandos: sugere-se registrar o caminho completo do comando pai e folha; na primeira versão, apenas o comando folha é aceitável

#### 4.4.3 Peso na Ordenação

A ordem atual de `compareRankedCommandMatches()` é:

1. matchStrength
2. completionPriority
3. fzf score
4. match start
5. item length
6. original index

Na Fase 3, insere `recentScore`:

```typescript
return (
  right.matchStrength - left.matchStrength ||
  right.completionPriority - left.completionPriority ||
  right.recentScore - left.recentScore ||
  right.score - left.score ||
  left.start - right.start ||
  left.itemLength - right.itemLength ||
  left.originalIndex - right.originalIndex
);
```

Sugestão para `recentScore`:

```typescript
const RECENT_DECAY_MS = 10 * 60 * 1000;
const recentScore = count * 10 + Math.max(0, 10 - ageMs / RECENT_DECAY_MS);
```

Quando a query está vazia (usuário só digitou `/`), comandos usados recentemente são colocados no topo; quando a query não está vazia, a ponderação só ocorre na mesma intensidade de correspondência, para evitar que comandos recentes sobreponham comandos significativamente mais precisos.

### 4.5 Exibição de Alias Correspondido

Atualmente, o alias já participa do `AsyncFzf` e do fallback de prefixo, mas `formatSlashCommandLabel()` sempre mostra todos os alias:

```text
help (?)
compress (summarize)
```

Na Fase 3, mudar para:

- Quando o usuário digita o nome principal: não exibir alias extra, ou manter formato conciso atual
- Quando o usuário digita um alias: exibir `help (alias: ?)`
- `Suggestion.matchedAlias` é preenchido na fase de correspondência

Pontos de implementação:

```typescript
function findMatchedAlias(
  cmd: SlashCommand,
  query: string,
): string | undefined {
  return cmd.altNames?.find((alt) =>
    alt.toLowerCase().startsWith(query.toLowerCase()),
  );
}
```

Nos resultados FZF, se `result.item` vier de `altNames`, pode-se defini-lo diretamente como `matchedAlias`; o mesmo vale para o fallback de prefixo.

---

## 5. Fase 3.2: Versão Completa do Slash Command em Meio à Digitação

### 5.1 Comportamento Atual

Atualmente, `findMidInputSlashCommand()` só reconhece tokens `/xxx` separados por espaços em branco, e requer que o cursor esteja no final do token; `getBestSlashCommandMatch()` só faz correspondência de prefixo alfabético entre comandos `modelInvocable`.

Isso atende ao objetivo básico da Fase 2, mas a Fase 3 precisa complementar a exibição e o destaque.

### 5.2 Aprimoramento do Ghost Text

Manter a estratégia atual: ghost text para slash em meio à digitação só sugere comandos `modelInvocable`, pois comandos built-in no corpo do texto não serão executados como slash command.

Pontos de aprimoramento:

- O algoritmo de correspondência muda de prefixo alfabético para reutilizar as regras de ordenação de `useSlashCompletion` (pelo menos considerando `completionPriority` e uso recente)
- A estrutura de retorno é estendida para:

```typescript
export type BestSlashCommandMatch = {
  suffix: string;
  fullCommand: string;
  command: SlashCommand;
  sourceBadge?: string;
  argumentHint?: string;
};
```

### 5.3 Badge de Origem e Dica de Argumento em Meio à Digitação

Devido ao espaço limitado no ghost text, não é recomendado colocar badge e hint diretamente no corpo do ghost text. Regras de exibição sugeridas:

- Ghost text ainda renderiza apenas o sufixo do nome do comando, por exemplo, ao digitar `please /rev` mostra `iew`
- Quando o token já corresponde exatamente a um comando e o comando tem `argumentHint`, exibir a dica de parâmetro em tom claro após o cursor, por exemplo, `/review [pr-number] [--comment]`
- Badge de origem é exibido apenas no dropdown ou em dica de status; se o meio da digitação não abrir dropdown, o badge não precisa ser exibido obrigatoriamente

### 5.4 Destaque de Token de Comando Válido

Inspirando-se em `findSlashCommandPositions()` do Claude Code, colorir tokens de slash command válidos no corpo do texto em `InputPrompt.renderLineWithHighlighting()`.

Sugere-se adicionar função utilitária:

```typescript
export type SlashCommandToken = {
  start: number;
  end: number;
  commandName: string;
  valid: boolean;
};

export function findSlashCommandTokens(
  text: string,
  commands: readonly SlashCommand[],
): SlashCommandToken[];
```

Regras:

- O token deve estar no início da string ou ser precedido por caractere de espaço em branco
- Token no formato `/[a-zA-Z][a-zA-Z0-9:_-]*`
- Para destaque em meio à digitação, apenas comandos `modelInvocable` são considerados válidos
- Token no início da linha pode considerar todos os comandos interativos visíveis como válidos
- Tokens válidos usam cor de destaque; tokens inválidos mantêm texto normal, evitando marcar caminhos como `/usr/bin` erroneamente como comandos

---

## 6. Fase 3.3: Reestruturação do Catálogo de Ajuda

### 6.1 Problemas Atuais

`Help.tsx` atualmente exibe:

- Basics
- Comandos em lista plana `Commands:`
- Explicação `[MCP]`
- Atalhos de Teclado

Problemas:

- Todas as origens misturadas, difícil distinguir skill, custom, plugin, MCP
- Não exibe `argumentHint`
- Não exibe `supportedModes`
- Não exibe `modelInvocable`
- Subcomandos apenas recuados um nível, sem exibir origem/modo

### 6.2 Design de Agrupamento

Agrupar por `source` / `sourceLabel`:

1. **Built-in Commands**: `source === 'builtin-command'`
2. **Bundled Skills**: `source === 'bundled-skill'`
3. **Custom Commands**: `source === 'skill-dir-command'`, incluindo `Custom` / `User` / `Project`
4. **Plugin Commands**: `source === 'plugin-command'`, incluindo `Plugin:*` / `Extension:*`
5. **MCP Commands**: `source === 'mcp-prompt'`
6. **Other Commands**: fallback de compatibilidade para comandos sem source

Dentro de cada grupo, ordenar por nome do comando; comandos ocultos não são exibidos.

### 6.3 Campos Exibidos por Comando

Formato sugerido:

```text
/model [--fast] [<model-id>]  Switch model
  source: Built-in  modes: interactive, non_interactive, acp

/review [pr-number] [--comment]  Review changed code
  source: Skill  modes: interactive, non_interactive, acp  model: yes
```

Para evitar que o Help fique muito largo, sugere-se comprimir em uma única linha:

```text
 /review [pr-number] [--comment] [Skill] [all] [model] - Review changed code
```

Badge de modo sugerido:

| supportedModes                      | badge            |
| ----------------------------------- | ---------------- |
| `interactive` apenas                | `[interactive]`  |
| `interactive, non_interactive, acp` | `[all]`          |
| `non_interactive, acp`              | `[headless]`     |
| Outras combinações                  | `[i] [ni] [acp]` |

### 6.4 Extensão do `/help` para Headless

O roadmap exige apenas que `/help` exiba saída agrupada por origem, sem exigir explicitamente non-interactive/acp. Atualmente, `/help` tem `supportedModes: ['interactive']`.

A Fase 3 sugere adicionar um caminho headless, mas como subtarefa independente:

- `supportedModes` alterado para todos os modos
- interactive: continua renderizando `HistoryItemHelp`
- non_interactive/acp: retorna um diretório agrupado em texto simples (`message`)

Se o escopo precisar ser reduzido, pode-se primeiro reestruturar apenas o componente `Help` interativo, adiando o `/help` headless.

---

## 7. Fase 3.4: Aprimoramento dos Metadados de Comandos Disponíveis no ACP

### 7.1 Saída Atual do ACP

`Session.sendAvailableCommandsUpdate()` atualmente mapeia `SlashCommand[]` para:

```typescript
{
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
}
```

Onde `argumentHint` já é exposto via `input.hint`.

### 7.2 Plano de Aprimoramento

Se o tipo `AvailableCommand` do protocolo ACP não puder ter campos adicionados diretamente, usar `_meta` para manter compatibilidade:

```typescript
const availableCommands: AvailableCommand[] = slashCommands.map((cmd) => ({
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
  _meta: {
    argumentHint: cmd.argumentHint,
    source: cmd.source,
    sourceLabel: cmd.sourceLabel,
    supportedModes: cmd.supportedModes ?? getEffectiveSupportedModes(cmd),
    subcommands: cmd.subCommands
      ?.filter((sub) => !sub.hidden)
      .map((sub) => sub.name),
    modelInvocable: cmd.modelInvocable === true,
  },
}));
```

Se o tipo `AvailableCommand` permitir extensão de campos, priorizar a saída como campos de primeira classe:

```typescript
{
  name,
  description,
  input,
  argumentHint,
  source,
  supportedModes,
  subcommands,
  modelInvocable,
}
```

Mas ainda é recomendado manter `_meta` como espelho por um tempo, para facilitar a migração gradual de clientes antigos.

### 7.3 Estratégia de Subcomandos Recursivos

Os critérios de aceitação exigem apenas a lista de nomes de `subcommands`. Na primeira versão, basta expor subcomandos de primeiro nível:

```typescript
subcommands: cmd.subCommands?.map((sub) => sub.name) ?? [];
```

Futuramente, se clientes ACP precisarem de árvore multinível, pode-se estender para:

```typescript
type AcpSubcommandMeta = {
  name: string;
  description?: string;
  argumentHint?: string;
  subcommands?: AcpSubcommandMeta[];
};
```

---

## 8. Fase 3.5: Complementação de Comandos Faltantes do Claude Code

### 8.1 `/doctor`: Já Implementado, não Reimplementar

Atualmente, `doctorCommand` já existe:

- Arquivo: `packages/cli/src/ui/commands/doctorCommand.ts`
- Registro: `BuiltinCommandLoader`
- Modos: `['interactive', 'non_interactive', 'acp']`
- interactive: exibe `HistoryItemDoctor`
- non_interactive/acp: retorna `message` em JSON
- Lógica de diagnóstico: `packages/cli/src/utils/doctorChecks.ts`

A Fase 3 só precisa garantir que `/doctor` exiba corretamente origem e modo no Help e no autocompletar; se necessário otimizar, pode-se alterar o JSON headless para Markdown mais legível, mas isso não é obrigatório.

### 8.2 `/release-notes`: Não Incluso nesta Fase

`/release-notes` não é mais um requisito da Fase 3. Esta fase não adicionará novos comandos, não registrará built-in nem escreverá testes relacionados, evitando introduzir comandos superficiais sem requisitos de produto claros.

---

## 9. Confirmação e Exibição da Estratégia de Conflitos

Estratégia de conflitos atual do `CommandService`:

- Comandos de extensão/plugin com nomes conflitantes com comandos existentes são renomeados para `extensionName.commandName`
- Se houver segundo conflito, adiciona sufixo numérico: `extensionName.commandName1`
- Comandos não-extension com o mesmo nome: o carregamento posterior substitui o anterior

A Fase 3 não altera a semântica de execução, apenas garante que o nome final e a origem sejam exibidos claramente no Help/Completion.

Sugere-se complementar testes para garantir:

- Comandos de plugin renomeados são exibidos com o nome final e badge `[Plugin]` no autocompletar
- No Help, são exibidos no grupo Plugin Commands com o nome final
- A saída ACP usa o nome final

> [!note]
> A prioridade "built-in > bundled/skill-dir > plugin > mcp" do roadmap não é totalmente consistente com a implementação atual "não-extension: o carregamento posterior substitui o anterior". A documentação da Fase 3 considera o código-fonte atual do `CommandService` como referência, e não alterará a semântica de conflitos nesta fase; se for necessário ajustar rigorosamente a prioridade, isso deve ser tratado como uma fase separada para evitar alterar o comportamento de substituição de comandos de usuário/projeto existentes.

---

## 10. Estratégia de Testes

### 10.1 Testes de Autocompletar

Atualizar ou adicionar:

- `packages/cli/src/ui/hooks/useSlashCompletion.test.ts`
- `packages/cli/src/ui/hooks/useCommandCompletion.test.ts`
- `packages/cli/src/ui/components/SuggestionsDisplay.test.tsx` (criar se não existir)

Cobertura:

- Badge de origem: exibir corretamente Skill/Custom/Plugin/MCP
- argumentHint: exibir hint após o nome do comando, e a largura da coluna não prejudicar a descrição
- Uso recente: quando apenas `/` é digitado, comandos recentes aparecem primeiro; quando uma query clara é digitada, correspondência exata tem prioridade
- Alias correspondido: ao digitar `?`, exibir `help (alias: ?)`; ao digitar `he`, não exibir dica de alias correspondido
- Ghost text em meio à digitação: `/rev` no corpo sugere sufixo de `/review` (modelInvocable)
- Em meio à digitação, não sugerir built-in: `/sta` no corpo não sugere `/stats` (a menos que design futuro permita execução de built-in embutida)

```
### 10.2 Testes do Help

Atualização: `packages/cli/src/ui/components/Help.test.tsx`

Cobertura:

- Agrupamento por Built-in / Bundled Skills / Custom / Plugin / MCP
- Comandos ocultos (`hidden`) não são exibidos
- Subcomandos exibem lista de nomes
- `argumentHint`, source badge, mode badge e model badge aparecem corretamente
- `altNames` ainda podem ser exibidos, mas sem interferir no nome principal do comando

### 10.3 Testes ACP

Atualização: `packages/cli/src/acp-integration/session/Session.test.ts`

Cobertura:

- `availableCommands[].input.hint` mantém o comportamento atual
- Novos metadados incluem `argumentHint`, `source`, `sourceLabel`, `supportedModes`, `subcommands` e `modelInvocable`
- Comandos sem `argumentHint` mantêm `input: null` para compatibilidade
- A chamada `getAvailableCommands(config, signal, 'acp')` permanece inalterada

### 10.4 Testes de novos comandos

Nesta fase não serão adicionados comandos built-in como `/release-notes`, portanto não é necessário criar novos testes de comando. Apenas mantêm-se os testes de regressão existentes para `/doctor`.

### 10.5 Plano de testes E2E

A Fase 3 modifica simultaneamente a completação TUI, a execução de slash commands e os metadados do comando ACP. Testes unitários não cobrem todo o caminho do usuário. A validação E2E é dividida em três categorias:

1. **Build local da CLI**: primeiro execute `npm run build && npm run bundle`, depois use `node dist/cli.js` para validar a implementação local.
2. **Cenário Interactive / tmux**: usado para validar o menu de compleção, ghost text, aceitação com Tab, renderização do Help e outros comportamentos TUI.
3. **Cenário Headless / JSON**: usado para validar a saída non-interactive de slash commands, sem depender da TUI.
4. **Cenário de integração ACP**: usado para validar os metadados `available_commands_update`.

#### 10.5.1 Pré‑requisitos E2E

```bash
npm run build && npm run bundle
```

Para o cenário interactive, recomenda-se usar um diretório temporário isolado para não poluir o repositório atual:

```bash
tmux new-session -d -s qwen-slash-phase3 -x 200 -y 50 \
  "cd /tmp/qwen-slash-phase3 && /Users/mochi/code/qwen-code-test/dist/cli.js --approval-mode yolo"
sleep 3
```

Ao enviar entrada, separe o texto do Enter para evitar que a TUI engula o envio:

```bash
tmux send-keys -t qwen-slash-phase3 "/help"
sleep 0.5
tmux send-keys -t qwen-slash-phase3 Enter
```

Captura da saída:

```bash
tmux capture-pane -t qwen-slash-phase3 -p -S -100
```

Limpeza:

```bash
tmux kill-session -t qwen-slash-phase3
```

#### 10.5.2 Lista de verificação E2E

| Cenário                       | Modo                | Passos                                                                                          | Resultado esperado                                                                                                                                                             |
| ----------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compleção – source badge      | interactive/tmux    | Digite `/`, observe o menu de compleção                                                         | Comandos skill/custom/plugin/MCP exibem o source badge correspondente; comandos built-in podem não exibir badge                                                                |
| Compleção – argument hint     | interactive/tmux    | Digite `/model`, `/export`                                                                      | O argumentHint é exibido após o nome do comando; comandos sem parâmetros não exibem hint poluente                                                                              |
| Ordenação – usado recentemente| interactive/tmux    | Execute `/help`, depois digite `/`                                                              | `/help` aparece em primeiro lugar quando o grau de correspondência é igual; uma query exata continua priorizando a correspondência à query                                     |
| Exibição de alias encontrado  | interactive/tmux    | Digite `/?`                                                                                     | O item de compleção exibe `help (alias: ?)`; ao digitar `/he` não deve exibir incorretamente que um alias foi encontrado                                                        |
| Ghost text no meio do texto   | interactive/tmux    | No corpo da mensagem digite `please /rev`                                                       | O sufixo ghost text de `/review` deve aparecer, e ao pressionar Tab deve ser aceito                                                                                            |
| Destaque de token no meio     | interactive/tmux    | Digite um corpo contendo `/review`                                                              | Tokens de slash command válidos e invocáveis por modelo devem ser realçados com a cor de comando; caminhos como `/usr/bin` não devem ser realçados como comandos                |
| Painéis de agrupamento do Help| interactive/tmux    | Execute `/help`                                                                                  | A saída contém os grupos Built-in Commands, Bundled Skills, Custom Commands, Plugin Commands e MCP Commands; cada comando exibe source/mode/hint                               |
| Regressão headless `/doctor`  | headless/json       | Execute `node dist/cli.js "/doctor" --approval-mode yolo --output-format json 2>/dev/null`      | Retorna `message`, sem disparar erros de componentes exclusivos da TUI                                                                                                         |
| Metadados ACP                 | integration         | Inicie uma sessão ACP e dispare `available_commands_update`                                     | Cada comando mantém `name`, `description`, `input.hint`, e inclui `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`                                  |

#### 10.5.3 Exemplo de comando headless

`/release-notes` não faz parte desta fase; a regressão headless fica restrita a comandos existentes como `/doctor`.

### 10.6 Comandos de teste de regressão

Conforme AGENTS.md, execute primeiro os testes de arquivo único:

```bash
cd packages/cli && npx vitest run src/ui/hooks/useSlashCompletion.test.ts
cd packages/cli && npx vitest run src/ui/hooks/useCommandCompletion.test.ts
cd packages/cli && npx vitest run src/ui/components/Help.test.tsx
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

Validação final:

```bash
npm run build && npm run typecheck
npm run build && npm run bundle
```

---

## 11. Critérios de aceitação

### 11.1 Menu de compleção

- [ ] O menu de compleção exibe source badge (pelo menos `[MCP]`, `[Skill]`, `[Custom]`, `[Plugin]`)
- [ ] O menu de compleção exibe `argumentHint`
- [ ] Comandos usados recentemente na sessão aparecem primeiro quando apenas `/` é digitado
- [ ] Quando um alias é encontrado, exibe `alias: <alias>`; quando não é alias, não exibe poluição visual
- [ ] Comandos renomeados por conflito com plugins/extensões exibem no menu o nome final e a origem

### 11.2 Slash command no meio do texto

- [ ] Ao digitar comandos invocáveis por modelo como `/review` no corpo do texto, o ghost text é exibido corretamente
- [ ] A tecla Tab aceita o ghost text no meio do texto
- [ ] Tokens de slash command válidos no meio do texto são realçados
- [ ] Comandos built-in não são sugeridos erroneamente como comandos executáveis inline no corpo do texto
- [ ] A dica de argumento é exibida quando o comando foi completamente correspondido e não há argumentos

### 11.3 Ajuda (Help)

- [ ] `/help` exibe comandos agrupados por origem
- [ ] Cada comando exibe nome, `argumentHint`, descrição, origem e marcadores de `supportedModes`
- [ ] Comandos invocáveis por modelo têm marcador claro
- [ ] Subcomandos são exibidos como lista de nomes ou itens indentados
- [ ] Comandos ocultos (`hidden`) não são exibidos

### 11.4 ACP

- [ ] ACP `available_commands_update` continua incluindo `name`, `description` e `input.hint`
- [ ] Os metadados do comando ACP incluem `argumentHint`, `source`, `supportedModes`, `subcommands` e `modelInvocable`
- [ ] Clientes antigos ignoram os novos campos sem sofrer impacto

### 11.5 Comandos ausentes

- [ ] `/doctor` ainda funciona e, em modo non-interactive, retorna `message`
- [ ] Não é adicionado `/release-notes`; documentação, testes e critérios de aceitação não exigem mais esse comando

---

## 12. Não escopo

Os itens a seguir **não** fazem parte da Fase 3:

- Não implementar workflow command / dynamic skill / novo Loader para mcp skill
- Não introduzir rastreamento persistente de uso de comandos
- Não alterar o protocolo de invocação de modelo do `SkillTool`
- Não alterar o caminho de invocação de modelo dos prompts MCP
- Não refatorar o executor de comandos ou o mode adapter
- Não alterar a semântica de sobrescrita de comandos user/project existentes

---

## 13. Ordem de implementação sugerida

1. **Estrutura de dados de compleção e exibição de badge/hint**: primeiro expanda `Suggestion` e `SuggestionsDisplay` – baixo risco, feedback imediato.
2. **Complementar `argumentHint` dos built-ins**: para que o ghost text existente e o `input.hint` do ACP sejam beneficiados imediatamente.
3. **Ordenação por uso recente**: introduza o recent score em `useSlashCompletion` e adicione testes.
4. **Exibição de alias encontrado**: ajuste a correspondência FZF/prefix para preservar `matchedAlias`.
5. **Reestruturação do Help em abas**: forneça painéis claros no estilo Claude Code (General / Commands / Custom Commands), evitando aglomeração de comandos.
6. **Aprimoramento dos metadados ACP**: expanda `Session.sendAvailableCommandsUpdate()`, mantendo compatibilidade via `_meta`.
7. **Aprimoramento do destaque no meio do texto**: trate a camada de renderização por último, para evitar grandes alterações em paralelo com a lógica de compleção.