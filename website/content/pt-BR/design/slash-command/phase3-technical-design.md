# Phase 3: Documento de Design Técnico – Alinhamento da Experiência

## 1. Objetivos e Restrições de Design

### 1.1 Objetivo

Com base nos metadados de comando, filtragem entre modos e invocação do modelo prompt command já implementados nas Fases 1/2, a Fase 3 completa a experiência de comandos barra (slash commands) perceptível pelo usuário:

- Exibir fonte, dicas de argumentos e correspondência de alias no menu de autocompletar, e introduzir ordenação por uso recente no nível da sessão
- Aprimorar o ghost text, dicas de argumentos, exibição de fonte e destaque de token válido para comandos barra no meio da entrada (mid-input)
- Reestruturar `/help` de um amontoado de comandos atualmente inutilizável para um painel de ajuda com abas, claro e esteticamente agradável, no estilo do Claude Code
- Melhorar os metadados de comando do ACP `available_commands_update`
- Confirmar que `/doctor` já implementado não será reimplementado; `/release-notes` não será incluído nesta fase

### 1.2 Restrições Obrigatórias

- **O código é a referência**: quando houver diferença entre a documentação das Fases 1/2 e a implementação, o código-fonte do branch principal atual é a referência.
- **Não introduzir nova arquitetura de execução**: continuar reutilizando os componentes existentes `SlashCommand`, `CommandService`, `handleSlashCommand`, `useSlashCompletion` e `Help`, sem criar novos `CommandDescriptor` / `CommandExecutor` / `ModeAdapter`.
- **Não restaurar `commandType`**: a implementação atual já removeu o campo `commandType` do design inicial da Fase 1; a Fase 3 não reintroduz esse campo.
- **Uso recente em nível de sessão**: a ordenação por uso recente é válida apenas na sessão CLI atual, não é persistida em disco.
- **O comportamento interativo não deve ser degradado**: as funcionalidades interativas existentes, como autocompletar, help, doctor, devem permanecer utilizáveis; a Fase 3 apenas melhora a exibição e completa comandos faltantes.
- **Compatibilidade retroativa do ACP**: os três campos existentes `availableCommands[].name`, `description` e `input` permanecem inalterados; novos metadados devem ser colocados em campos compatíveis ou em `_meta`, para evitar quebrar clientes ACP existentes.

---

## 2. Linha de Base da Implementação Atual (Conclusões da Auditoria de Código)

### 2.1 Metadados Existentes e Comportamento dos Loaders

`packages/cli/src/ui/commands/types.ts` atualmente `SlashCommand` já contém:

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

Informações de exibição atualmente preenchidas por cada Loader:

| Loader                                  | source                                 | sourceLabel                              | argumentHint     | modelInvocable                                   |
| --------------------------------------- | -------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------ |
| `BuiltinCommandLoader`                  | `builtin-command`                      | `Built-in`                               | A maioria não declarado | `false`                                          |
| `BundledSkillLoader`                    | `bundled-skill`                        | `Skill`                                  | Vindo da skill   | `!disableModelInvocation`                        |
| `FileCommandLoader` / `command-factory` | `skill-dir-command` / `plugin-command` | `Custom` / `Plugin: <extensionName>`     | Vindo do frontmatter | Usuário/projeto padrão true; plugin precisa de description/whenToUse |
| `SkillCommandLoader`                    | `skill-dir-command` / `plugin-command` | `User` / `Project` / `Extension: <name>` | Vindo da skill   | Usuário/projeto padrão true; plugin precisa de description/whenToUse |
| `McpPromptLoader`                       | `mcp-prompt`                           | `MCP: <serverName>`                      | Não gerado        | Atualmente não definido explicitamente `modelInvocable` |

> [!NOTE]
> O roadmap da Fase 1 exigia `modelInvocable: true` para MCP prompts, mas a implementação atual não define isso explicitamente. A Fase 3 não altera o caminho de invocação do modelo para MCP prompts; MCP prompts continuam sendo chamados pelo mecanismo nativo do MCP, não via `SkillTool`.

### 2.2 Capacidades Relacionadas à Fase 3 Já Implementadas

| Capacidade                                                             | Estado Atual                                                                                                           | Arquivos-Chave                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Ghost text básico para comandos barra no meio da entrada               | Parcialmente implementado, apenas preenchimento de prefixo para comandos `modelInvocable`                              | `ui/utils/commandUtils.ts`, `ui/hooks/useCommandCompletion.tsx`    |
| Ghost text de argumento para comando no início da linha                | Parcialmente implementado: quando o comando corresponde exatamente e não há argumentos, exibe `argumentHint`           | `ui/hooks/useCommandCompletion.tsx`                                 |
| Alias participando da correspondência                                  | Já implementado correspondência e ordenação, mas a exibição sempre mostra todos os aliases, sem distinguir o alias correspondido | `ui/hooks/useSlashCompletion.ts`                                   |
| Badge de fonte                                                         | Apenas MCP exibe `[MCP]`                                                                                               | `ui/components/SuggestionsDisplay.tsx`, `ui/components/Help.tsx`    |
| `/help`                                                                | A implementação atual é considerada incompleta: embora haja tentativa de agrupamento, ainda é um amontoado de comandos, sem a experiência de painel de ajuda com abas no estilo Claude Code | `ui/components/Help.tsx`                                            |
| `argumentHint` do ACP                                                  | Já mapeado para `availableCommands[].input.hint`                                                                       | `acp-integration/session/Session.ts`                                |
| ACP source / supportedModes / subcommands / modelInvocable             | Não exposto                                                                                                            | `acp-integration/session/Session.ts`                                |
| Tratamento de conflitos                                                | Comandos de extensão conflitantes são renomeados para `extensionName.commandName`; comandos não de extensão com mesmo nome: o último carregado substitui o anterior | `services/CommandService.ts`                                        |
| `/doctor`                                                              | Já implementado, suporta `interactive` / `non_interactive` / `acp`                                                     | `ui/commands/doctorCommand.ts`, `utils/doctorChecks.ts`             |
### 2.3 Pontos de inspiração do Claude Code

Referência ao código-fonte em `/Users/mochi/code/claude-code`:

- `src/types/command.ts`: O modelo de comando inclui campos de exibição/capacidade como `argumentHint`, `whenToUse`, `aliases`, `loadedFrom`, `kind`, `immediate`, `isSensitive`, `userFacingName`, `supportsNonInteractive`.
- `src/utils/suggestions/commandSuggestions.ts`: A ordenação das sugestões considera tanto correspondência exata, correspondência por alias, prefixo, fuzzy, e uso de skills; quando um alias é correspondido, exibe apenas o alias que o usuário realmente usou.
- `src/utils/suggestions/commandSuggestions.ts`: O uso de barra no meio da entrada (`mid-input slash`) utiliza `findMidInputSlashCommand()`, `getBestCommandMatch()` e `findSlashCommandPositions()` para suportar ghost text e destaque.
- `src/components/HelpV2/Commands.tsx`: O Help V2 é um diretório navegável de comandos, exibindo informações da fonte ao mostrar a descrição.
- `src/commands.ts`: O Claude Code inclui comandos internos como `/doctor`, `/release-notes`, etc. O Qwen Code já implementou `/doctor`; nesta fase não implementamos `/release-notes`.

A Fase 3 adota esses pontos com a abordagem "alinhar experiência, sem copiar arquitetura".

---

## 3. Visão Geral

### 3.1 Resumo das Alterações de Arquivos

| Arquivo                                                  | Alterações                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/SuggestionsDisplay.tsx`  | Estender o tipo `Suggestion` para exibir source badge, argumentHint, aliasHit                  |
| `packages/cli/src/ui/hooks/useSlashCompletion.ts`        | Gerar itens de sugestão aprimorados; ordenação com uso recente; preservar info do alias usado  |
| `packages/cli/src/ui/hooks/useCommandCompletion.tsx`     | Ghost text no meio da entrada reutilizando matching aprimorado; fornecer metadados de argumento/source para exibição na UI |
| `packages/cli/src/ui/utils/commandUtils.ts`              | Adicionar funções auxiliares para destaque de token slash, ou estender funções existentes para retornar validade do comando |
| `packages/cli/src/ui/components/InputPrompt.tsx`         | Renderizar destaque de token de comando slash válido; manter aceitação de ghost text com Tab   |
| `packages/cli/src/ui/components/Help.tsx`                | Refatorar para painel de ajuda com abas no estilo Claude Code, evitando empilhamento de comandos |
| `packages/cli/src/ui/commands/helpCommand.ts`            | Se necessário texto de ajuda non-interactive/acp, estender ação; caso contrário, manter apenas UI interativa |
| `packages/cli/src/acp-integration/session/Session.ts`    | Expor metadados aprimorados na atualização ACP                                                |
| `packages/cli/src/ui/commands/*Command.ts`               | Adicionar `argumentHint` para comandos internos comuns                                         |

### 3.2 Nova Ferramenta de Exibição Compartilhada

Sugere-se adicionar `packages/cli/src/services/commandMetadata.ts`, centralizando a lógica de exibição necessária para Help, Completion e ACP:

```typescript
export function getCommandSourceBadge(cmd: SlashCommand): string | null;
export function getCommandSourceGroup(cmd: SlashCommand): CommandSourceGroup;
export function formatSupportedModes(cmd: SlashCommand): string;
export function getCommandDisplayName(cmd: SlashCommand): string;
export function getCommandSubcommandNames(cmd: SlashCommand): string[];
```

Não é recomendado colocar essas funções de exibição no Loader, para evitar que o Loader assuma responsabilidades de UI.

---

## 4. Fase 3.1: Aprimoramento da Experiência de Sugestão

### 4.1 Estender a Estrutura de Dados `Suggestion`

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

Sugestão de extensão:

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

Sugestões de arquivo (`mode !== 'slash'`) e pesquisa reversa não precisam preencher esses campos.

### 4.2 Exibição do source badge

Atualmente, `SuggestionsDisplay` adiciona `[MCP]` apenas para `CommandKind.MCP_PROMPT`. Na Fase 3, passamos a usar `source` / `sourceLabel` para gerar o badge de forma unificada:

| source / sourceLabel                | badge                                     |
| ----------------------------------- | ----------------------------------------- |
| `builtin-command`                   | `[Built-in]` (opcional: não exibir por padrão para reduzir ruído) |
| `bundled-skill` / `Skill`           | `[Skill]`                                 |
| `skill-dir-command` / `User`        | `[User]`                                  |
| `skill-dir-command` / `Project`     | `[Project]`                               |
| `skill-dir-command` / `Custom`      | `[Custom]`                                |
| `plugin-command` / `Plugin: x`      | `[Plugin]` ou `[Plugin: x]`               |
| `plugin-command` / `Extension: x`   | `[Extension]` ou `[Extension: x]`         |
| `mcp-prompt`                        | `[MCP]`                                   |

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

> Se exibir `[Built-in]` ou não depende da legibilidade da UI. No Help, é obrigatório mostrar o agrupamento Built-in; no menu de sugestão, pode-se omitir o badge built-in e exibir badges apenas para fontes não internas.

### 4.3 Exibição do argumentHint

No menu de sugestão, após o nome do comando, adicionar `argumentHint` em cinza:

```text
/model <model-id>              Switch model
/export md|html|json|jsonl     Export current session
/review [pr-number] [--comment] [Skill] Review changed code
```
Implementação sugerida:

- `useSlashCompletion` preenche `argumentHint: cmd.argumentHint` em `finalSuggestions`
- `SuggestionsDisplay` renderiza `argumentHint` em `theme.text.secondary` após o label
- `commandColumnWidth` calcula incluindo label + hint + badge, evitando desalinhamento da coluna de descrição
- Completamento de subcomandos também suporta `argumentHint`

Primeiro é necessário adicionar `argumentHint` para comandos built-in comuns. Sugestão inicial:

| Comando          | argumentHint                  |
| ---------------- | ----------------------------- | ------------------ | -------- | ------------- | ------- |
| `/model`         | `[--fast] [<model-id>]`       |
| `/approval-mode` | `<mode>`                      |
| `/language`      | `ui \| output <language>`      |
| `/export`        | `md \| html \| json \| jsonl [path]` |
| `/memory`        | `show \| add \| refresh`      |
| `/mcp`           | `desc \| nodesc \| schema \| auth \| noauth` |
| `/stats`         | `[model \| tools]`            |
| `/docs`          | vazio ou não definido         |
| `/doctor`        | vazio ou não definido         |

### 4.4 Ordenação por usados recentemente

#### 4.4.1 Armazenamento de estado

Em `useSlashCommandProcessor` ou `AppContainer`, manter estado de uso recente em nível de sessão:

```typescript
type RecentSlashCommand = {
  name: string;
  usedAt: number;
  count: number;
};
```

Sugere-se armazenar como `Map<string, RecentSlashCommand>`, usando como chave o nome final do comando (ou seja, `cmd.name` após resolução de conflitos).

#### 4.4.2 Momento de registro

Em `useSlashCommandProcessor.handleSlashCommand`, após resolver com sucesso `commandToExecute`, registrar o uso:

- Se o comando não for encontrado, não registrar
- Comandos `hidden` podem não ser registrados
- Chamadas via alias registram pelo nome canônico `commandToExecute.name`
- Chamadas de subcomandos: sugere-se registrar o caminho completo do pai e da folha, mas aceita-se registrar apenas o comando folha na primeira versão

#### 4.4.3 Peso na ordenação

A ordenação atual de `compareRankedCommandMatches()` é:

1. matchStrength
2. completionPriority
3. fzf score
4. match start
5. item length
6. original index

Na Fase 3, inserir `recentScore`:

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

Quando a query está vazia (usuário digitou apenas `/`), comandos usados recentemente ficam no topo; quando a query não está vazia, o peso é aplicado apenas entre resultados de mesma força de correspondência, evitando que comandos recentes sobrepujem comandos claramente mais precisos.

### 4.5 Exibição de alias na correspondência

Atualmente os alias já participam de `AsyncFzf` e do fallback por prefixo, mas `formatSlashCommandLabel()` sempre exibe todos os alias:

```text
help (?)
compress (summarize)
```

Na Fase 3, mudar para:

- Quando o usuário digitar correspondendo ao nome principal: não exibir alias adicional, ou manter formato conciso atual
- Quando o usuário digitar correspondendo a um alias: exibir `help (alias: ?)`
- `Suggestion.matchedAlias` deve ser preenchido pela etapa de correspondência

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

Nos resultados do FZF, se `result.item` vier de `altNames`, pode-se usar diretamente como `matchedAlias`; o mesmo vale para o fallback por prefixo.

---

## 5. Fase 3.2: Comando slash no meio da entrada (versão completa)

### 5.1 Comportamento atual

Atualmente `findMidInputSlashCommand()` identifica apenas "tokens `/xxx` separados por espaço em branco" e exige que o cursor esteja no final do token; `getBestSlashCommandMatch()` faz apenas correspondência de prefixo em ordem alfabética entre comandos `modelInvocable`.

Isso atende ao objetivo da Fase 2 básica, mas a Fase 3 precisa completar a exibição e o destaque.

### 5.2 Melhoria do ghost text

Manter a estratégia atual: mid-input slash sugere apenas comandos `modelInvocable`, pois comandos built-in no corpo do texto não serão executados como slash command.

Pontos de melhoria:

- O algoritmo de correspondência deve passar de prefixo alfabético para reutilizar as regras de ordenação de `useSlashCompletion` (pelo menos considerando `completionPriority` e usados recentemente)
- A estrutura de retorno deve ser expandida para:

```typescript
export type BestSlashCommandMatch = {
  suffix: string;
  fullCommand: string;
  command: SlashCommand;
  sourceBadge?: string;
  argumentHint?: string;
};
```

### 5.3 Badge de origem e dica de argumento no meio da entrada

Como o espaço do ghost text é limitado, não é recomendado colocar badge e hint diretamente no corpo do ghost text. Regra de exibição sugerida:

- O ghost text ainda renderiza apenas o sufixo do nome do comando, por exemplo, digitar `please /rev` mostra `iew`
- Quando o token já corresponde exatamente ao comando e o comando possui `argumentHint`, exibir a dica de parâmetros em tom claro após o cursor, por exemplo, `/review [pr-number] [--comment]`
- O badge de origem é exibido apenas no dropdown ou em indicadores de estado; se o mid-input não abrir dropdown, a exibição do badge não é obrigatória

### 5.4 Destaque de token de comando válido

Inspirado em `findSlashCommandPositions()` do Claude Code, em `InputPrompt.renderLineWithHighlighting()` colorir tokens de slash command válidos no corpo do texto.

Sugere-se adicionar funções utilitárias:

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

- O token deve estar no início da string ou ter um caractere de espaço em branco antes
- Token no formato `/[a-zA-Z][a-zA-Z0-9:_-]*`
- Para destaque no meio da entrada, considerar apenas comandos `modelInvocable` como válidos
- Token no início da linha pode considerar todos os comandos interativos visíveis como válidos
- Token válido usa cor de destaque (accent); token inválido mantém texto normal, evitando marcar caminhos como `/usr/bin` como se fossem comandos

---

## 6. Fase 3.3: Reestruturação da central de ajuda (Help)

### 6.1 Problemas atuais

`Help.tsx` atualmente exibe:

- Básico
- `Comandos:` de forma plana
- Explicação de `[MCP]`
- Atalhos de teclado

Problemas:

- Todas as fontes misturadas: skill, custom, plugin, MCP difíceis de distinguir
- Não exibe `argumentHint`
- Não exibe `supportedModes`
- Não exibe `modelInvocable`
- Subcomandos apenas recuados em um nível, sem exibir fonte/modo

### 6.2 Design de agrupamento

Agrupar por `source` / `sourceLabel`:

1. **Comandos Built-in**: `source === 'builtin-command'`
2. **Skills Empacotados**: `source === 'bundled-skill'`
3. **Comandos Customizados**: `source === 'skill-dir-command'`, incluindo `Custom` / `User` / `Project`
4. **Comandos de Plugin**: `source === 'plugin-command'`, incluindo `Plugin:*` / `Extension:*`
5. **Comandos MCP**: `source === 'mcp-prompt'`
6. **Outros Comandos**: fallback de compatibilidade para fontes ausentes
每组内部按命令名排序；hidden 命令不展示。

### 6.3 每条命令展示字段

格式建议：

```text
/model [--fast] [<model-id>]  Switch model
  source: Built-in  modes: interactive, non_interactive, acp

/review [pr-number] [--comment]  Review changed code
  source: Skill  modes: interactive, non_interactive, acp  model: yes
```

为避免 Help 过宽，建议压缩为单行：

```text
 /review [pr-number] [--comment] [Skill] [all] [model] - Review changed code
```

Mode badge 建议：

| supportedModes                      | badge            |
| ----------------------------------- | ---------------- |
| `interactive` only                  | `[interactive]`  |
| `interactive, non_interactive, acp` | `[all]`          |
| `non_interactive, acp`              | `[headless]`     |
| 其他组合                            | `[i] [ni] [acp]` |

### 6.4 `/help` 是否扩展到 headless

路线图只要求 `/help` 输出按来源分组，没有明确要求 non-interactive/acp。当前 `/help` 是 `supportedModes: ['interactive']`。

Phase 3 建议新增 headless 路径，但作为独立子任务：

- `supportedModes` 改为 all modes
- interactive：继续渲染 `HistoryItemHelp`
- non_interactive/acp：返回纯文本分组目录 `message`

如果 scope 需要收敛，可先只重构 interactive `Help` 组件，headless `/help` 延后。

---

## 7. Phase 3.4：ACP available commands 元数据增强

### 7.1 当前 ACP 输出

`Session.sendAvailableCommandsUpdate()` 当前将 `SlashCommand[]` 映射为：

```typescript
{
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
}
```

其中 `argumentHint` 已通过 `input.hint` 暴露。

### 7.2 增强方案

ACP protocol 的 `AvailableCommand` 类型如果不能直接增加字段，使用 `_meta` 保持兼容：

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

如果 `AvailableCommand` 类型允许扩展字段，则优先输出为一等字段：

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

但仍建议保留 `_meta` 镜像一段时间，便于旧客户端渐进迁移。

### 7.3 subcommands 递归策略

验收标准只要求 `subcommands` 名称列表。首期输出一级子命令即可：

```typescript
subcommands: cmd.subCommands?.map((sub) => sub.name) ?? [];
```

后续如果 ACP 客户端需要多级树，可扩展为：

```typescript
type AcpSubcommandMeta = {
  name: string;
  description?: string;
  argumentHint?: string;
  subcommands?: AcpSubcommandMeta[];
};
```

---

## 8. Phase 3.5：Claude Code 缺失命令补齐

### 8.1 `/doctor`：已实现，不重复实现

当前 `doctorCommand` 已存在：

- 文件：`packages/cli/src/ui/commands/doctorCommand.ts`
- 注册：`BuiltinCommandLoader`
- 模式：`['interactive', 'non_interactive', 'acp']`
- interactive：展示 `HistoryItemDoctor`
- non_interactive/acp：返回 JSON `message`
- 诊断逻辑：`packages/cli/src/utils/doctorChecks.ts`

Phase 3 只需在 Help 和补全中为 `/doctor` 正确展示来源、mode；如需优化，可将 headless JSON 改为更适合人读的 Markdown，但这不是必需项。

### 8.2 `/release-notes`：不纳入本阶段

`/release-notes` 不再作为 Phase 3 需求。本阶段不新增命令、不注册 built-in、不编写相关测试，避免引入无明确产品需求的命令表面。

---

## 9. 冲突策略确认与展示

当前 `CommandService` 冲突策略：

- extension/plugin 命令若与已存在命令同名，重命名为 `extensionName.commandName`
- 若二次冲突，追加数字后缀：`extensionName.commandName1`
- 非 extension 命令同名时，后加载覆盖前加载

Phase 3 不改变执行语义，只在 Help/Completion 中清晰展示最终名称和来源。

建议补充测试确保：

- 被重命名的 plugin command 在补全中显示最终名称和 `[Plugin]` badge
- Help 中按 Plugin Commands 分组展示最终名称
- ACP 输出使用最终名称

> 路线图中“built-in > bundled/skill-dir > plugin > mcp”的优先级，与当前实现“非 extension 后加载覆盖前加载”不完全一致。Phase 3 文档以当前 `CommandService` 源码为准，不在本阶段改冲突语义；如需严格调整优先级，应作为单独 Phase 处理，避免改变已有用户/项目命令覆盖行为。

---

## 10. 测试策略

### 10.1 补全测试

更新或新增：

- `packages/cli/src/ui/hooks/useSlashCompletion.test.ts`
- `packages/cli/src/ui/hooks/useCommandCompletion.test.ts`
- `packages/cli/src/ui/components/SuggestionsDisplay.test.tsx`（如当前无文件则新增）

覆盖：

- source badge：Skill/Custom/Plugin/MCP 正确展示
- argumentHint：命令名后展示 hint，且列宽不破坏描述
- recently used：只输入 `/` 时近期命令排在前面；输入明确 query 时精确命中优先
- alias 命中：输入 `?` 展示 `help (alias: ?)`，输入 `he` 不展示 alias 命中提示
- mid-input ghost：正文 `/rev` 提示 modelInvocable `/review` 后缀
- mid-input 不提示 built-in：正文 `/sta` 不提示 `/stats`（除非未来设计允许内嵌 built-in 执行）

### 10.2 Help 测试

更新：`packages/cli/src/ui/components/Help.test.tsx`

覆盖：

- 按 Built-in/Bundled Skills/Custom/Plugin/MCP 分组
- hidden 命令不展示
- 子命令展示名称列表
- `argumentHint`、source badge、mode badge、model badge 正确出现
- altNames 仍可展示，但不干扰主命令名

### 10.3 ACP 测试

更新：`packages/cli/src/acp-integration/session/Session.test.ts`

覆盖：

- `availableCommands[].input.hint` 保持现有行为
- 新增元数据包含 `argumentHint`、`source`、`sourceLabel`、`supportedModes`、`subcommands`、`modelInvocable`
- 无 `argumentHint` 的命令 `input: null` 保持兼容
- `getAvailableCommands(config, signal, 'acp')` 调用保持不变

### 10.4 新命令测试

本阶段不新增 `/release-notes` 或其他 built-in 命令，因此不需要新增命令测试。仅保留 `/doctor` 既有回归测试。

### 10.5 E2E 测试方案

Phase 3 同时修改 TUI 补全、slash command 执行、ACP command metadata，单元测试不能覆盖完整用户路径。E2E 验证分三类进行：

1. **构建本地 CLI**：先运行 `npm run build && npm run bundle`，后续使用 `node dist/cli.js` 验证本地实现。
2. **Interactive / tmux 场景**：用于验证补全菜单、ghost text、Tab 接受、Help 渲染等 TUI 行为。
3. **Headless / JSON 场景**：用于验证 non-interactive slash command 输出，不依赖 TUI。
4. **ACP integration 场景**：用于验证 `available_commands_update` 元数据。
#### 10.5.1 Passos preliminares E2E

```bash
npm run build && npm run bundle
```

Para cenários interativos, recomenda-se usar um diretório temporário independente para evitar poluir o repositório atual:

```bash
tmux new-session -d -s qwen-slash-phase3 -x 200 -y 50 \
  "cd /tmp/qwen-slash-phase3 && /Users/mochi/code/qwen-code-test/dist/cli.js --approval-mode yolo"
sleep 3
```

Ao enviar a entrada, separe o texto e o Enter para evitar que a TUI engula o envio:

```bash
tmux send-keys -t qwen-slash-phase3 "/help"
sleep 0.5
tmux send-keys -t qwen-slash-phase3 Enter
```

Capturar a saída:

```bash
tmux capture-pane -t qwen-slash-phase3 -p -S -100
```

Limpeza:

```bash
tmux kill-session -t qwen-slash-phase3
```

#### 10.5.2 Lista de testes E2E

| Cenário                                    | Modo             | Passos                                                                                    | Resultado esperado                                                                                                                                                                                    |
| ------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autocompletar o source badge               | interactive/tmux | Digite `/`, observe o menu de autocompletar                                               | Comandos skill/custom/plugin/MCP mostram o source badge correspondente; built-in pode não mostrar badge                                                                                               |
| Autocompletar o argument hint              | interactive/tmux | Digite `/model`, `/export`                                                                | Após o nome do comando, exibe `argumentHint`; comandos sem argumentos não exibem hint de ruído                                                                                                        |
| Ordenação por uso recente                  | interactive/tmux | Execute `/help` primeiro, depois digite `/`                                               | `/help` aparece primeiro sob condições de correspondência iguais; query exata ainda corresponde primeiro                                                                                               |
| Exibição de alias correspondente           | interactive/tmux | Digite `/?`                                                                               | O item de autocompletar mostra `help (alias: ?)`; ao digitar `/he` não mostra falsamente correspondência de alias                                                                                     |
| Texto fantasma no meio da entrada          | interactive/tmux | No texto principal, digite `please /rev`                                                  | Aparece o sufixo ghost text de `/review`; Tab pode aceitar                                                                                                                                            |
| Destaque de token no meio da entrada       | interactive/tmux | Digite um texto contendo `/review`                                                        | Token slash model-invocable válido usa destaque de comando; caminhos como `/usr/bin` não são destacados como comandos                                                                                 |
| Agrupamento do Help                        | interactive/tmux | Execute `/help`                                                                           | Saída contém os grupos Built-in Commands, Bundled Skills, Custom Commands, Plugin Commands, MCP Commands; cada comando mostra source/mode/hint                                                        |
| Regressão headless do `/doctor`            | headless/json    | Execute `node dist/cli.js "/doctor" --approval-mode yolo --output-format json 2>/dev/null` | Retorna `message`, sem acionar erros de componente exclusivo de TUI                                                                                                                                   |
| Metadados ACP                              | integration      | Execute uma sessão ACP e acione `available_commands_update`                               | Cada comando mantém `name`, `description`, `input.hint`, e inclui `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`                                                           |

#### 10.5.3 Exemplos de comandos headless

`/release-notes` não está incluído nesta fase; a regressão headless mantém apenas a verificação de comandos existentes como `/doctor`.

### 10.6 Comandos de teste de regressão

Conforme AGENTS.md, execute primeiro os testes de arquivo único:

```bash
cd packages/cli && npx vitest run src/ui/hooks/useSlashCompletion.test.ts
cd packages/cli && npx vitest run src/ui/hooks/useCommandCompletion.test.ts
cd packages/cli && npx vitest run src/ui/components/Help.test.tsx
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

Verificação final:

```bash
npm run build && npm run typecheck
npm run build && npm run bundle
```

---

## 11. Critérios de aceitação

### 11.1 Menu de autocompletar

- [ ] O menu de autocompletar exibe o source badge (pelo menos `[MCP]`, `[Skill]`, `[Custom]`, `[Plugin]`)
- [ ] O menu de autocompletar exibe `argumentHint`
- [ ] Comandos usados recentemente na sessão aparecem primeiro ao digitar apenas `/`
- [ ] Ao corresponder um alias, exibe `alias: <alias>`; quando não é correspondência de alias, não exibe ruído
- [ ] Comandos renomeados devido a conflitos de plugin/extension exibem o nome final e a origem no autocompletar

### 11.2 mid-input slash

- [ ] Ao digitar comandos model-invocable como `/review` no texto principal, o ghost text é exibido corretamente
- [ ] Tab pode aceitar o ghost text no meio da entrada
- [ ] Token de comando slash no meio da entrada válido é destacado
- [ ] Comandos built-in não são erroneamente sugeridos como comandos incorporados executáveis no texto principal
- [ ] A dica de argumento é exibida quando o comando coincide completamente e não possui args

### 11.3 Help

- [ ] `/help` exibe comandos agrupados por origem
- [ ] Cada comando exibe nome, `argumentHint`, description, source, marcações de supportedModes
- [ ] Comandos model-invocable têm marcação clara
- [ ] Subcomandos são exibidos como lista de nomes ou itens indentados
- [ ] Comandos ocultos não são exibidos

### 11.4 ACP

- [ ] ACP `available_commands_update` continua incluindo `name`, `description`, `input.hint`
- [ ] Os metadados do comando ACP incluem `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`
- [ ] Clientes antigos não são afetados ao ignorar novos campos

### 11.5 Comandos ausentes

- [ ] `/doctor` ainda está disponível e retorna `message` quando non-interactive
- [ ] Não adicionar `/release-notes`; o comando não é mais exigido na documentação, testes e critérios de aceitação

---

## 12. Não objetivos

- Não implementar workflow command / dynamic skill / novo Loader de mcp skill
- Não introduzir rastreamento persistente de uso de comando
- Não alterar o protocolo de chamada de modelo do `SkillTool`
- Não alterar o caminho de chamada de modelo do MCP prompt
- Não refatorar o executor de comando ou o mode adapter
- Não alterar a semântica de sobreposição dos comandos user/project existentes
---

## 13. Ordem de Implementação Sugerida

1. **Complementar estrutura de dados e exibição de badge/hint**: estender `Suggestion` e `SuggestionsDisplay` primeiro, baixo risco e feedback intuitivo.
2. **Adicionar `argumentHint` built-in**: para que o ghost text existente e o ACP `input.hint` se beneficiem imediatamente.
3. **Ordenação por recentemente usados**: introduzir o recent score em `useSlashCompletion`, complementar testes.
4. **Exibição de correspondência de alias**: ajustar a correspondência FZF/prefix para preservar `matchedAlias`.
5. **Reformulação do Help em abas**: fornecer painéis claros como General / Commands / Custom Commands, no estilo Claude Code, evitando empilhar comandos.
6. **Aprimoramento de metadados ACP**: estender `Session.sendAvailableCommandsUpdate()`, mantendo a compatibilidade com `_meta`.
7. **Aprimoramento de destaque mid-input**: processar a camada de renderização por último, para evitar grandes alterações paralelas com a lógica de conclusão.
