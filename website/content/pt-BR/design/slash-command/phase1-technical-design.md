# Documento de Design Técnico da Fase 1: Reestruturação da Infraestrutura

## 1. Objetivos e Restrições de Design

### 1.1 Objetivos

- Estabelecer um modelo unificado de metadados de comandos, cobrindo quatro dimensões: origem (source), tipo de execução (commandType), capacidade de modo (supportedModes) e visibilidade (userInvocable / modelInvocable)
- Substituir as listas brancas hardcoded no modo non-interactive/acp por um filtro baseado em capacidade (capability-based)
- Fornecer uma interface de base estável para as extensões de capacidade da Fase 2/3

### 1.2 Restrições Rígidas

- **Zero mudança de comportamento**: o conjunto de comandos disponíveis nos modos non-interactive e acp permanece o mesmo (exceção: corrigir o bloqueio incorreto do MCP_PROMPT, o que é um bug fix)
- **Compatibilidade retroativa**: todos os novos campos da interface `SlashCommand` são opcionais ou possuem valores padrão razoáveis; o código de comando existente não precisa ser modificado imediatamente
- **Nenhum novo executor**: não criar novas arquiteturas de execução como ModeAdapter / CommandExecutor; apenas estender o CommandService e a lógica de filtragem existentes
- **Não alterar capacidades de comandos existentes**: não adicionar subcomandos `local` a nenhum comando; não modificar a implementação de `action` de nenhum comando

---

## 2. Novas Definições de Tipo

### 2.1 Localização do Arquivo

Todas as novas definições de tipo ficam em `packages/cli/src/ui/commands/types.ts`, no mesmo arquivo da interface `SlashCommand` existente.

### 2.2 `ExecutionMode`

```typescript
/**
 * Enumeração dos modos de execução.
 * - interactive: modo React/Ink UI (interação no terminal)
 * - non_interactive: modo CLI sem interação (saída texto/JSON)
 * - acp: modo ACP/Zed integration
 */
export type ExecutionMode = 'interactive' | 'non_interactive' | 'acp';
```

### 2.3 `CommandSource`

```typescript
/**
 * Enumeração da origem do comando, usada para agrupamento no Help,
 * badge de completação e comandos disponíveis no ACP.
 *
 * Diferença em relação ao CommandKind:
 * - CommandKind é uma classificação interna do carregador (4 tipos), afeta a lógica de carregamento
 * - CommandSource é uma classificação de origem voltada ao usuário (9 tipos), afeta a exibição e o modelo mental
 *
 * Ambos podem se sobrepor, mas têm responsabilidades diferentes; não são mesclados.
 */
export type CommandSource =
  | 'builtin-command' // Comandos internos (BuiltinCommandLoader)
  | 'bundled-skill' // Skills distribuídas com o pacote (BundledSkillLoader)
  | 'skill-dir-command' // Comandos de arquivo do usuário/projeto .qwen/commands/ (FileCommandLoader, não é plugin)
  | 'plugin-command' // Comandos fornecidos por plugins (FileCommandLoader, extensionName não vazio)
  | 'mcp-prompt'; // Prompts fornecidos por servidores MCP (McpPromptLoader)
// As seguintes origens estão reservadas; a Fase 1 não implementa Loaders correspondentes, mas o schema é definido antecipadamente:
// | 'workflow-command'
// | 'plugin-skill'
// | 'dynamic-skill'
// | 'builtin-plugin-skill'
// | 'mcp-skill'
```

### 2.4 `CommandType`

```typescript
/**
 * Tipo de execução do comando, descreve "como o comando é executado".
 *
 * - prompt: produz submit_prompt, envia o conteúdo para o modelo. Aplicável a skills, file commands, MCP prompts.
 *   O padrão de supportedModes são todos os modos; o padrão de modelInvocable é true.
 *
 * - local: executa lógica localmente, sem depender de React/Ink UI. Pode retornar message, stream_messages,
 *   submit_prompt, tool, etc. Adequado para comandos internos de consulta, configuração, estado.
 *   O padrão de supportedModes é ['interactive']; é necessário declarar explicitamente supportedModes para liberar para outros modos.
 *   Isso é consistente com a semântica de supportsNonInteractive: true do Claude Code — o suporte a não interativo precisa ser declarado explicitamente, não inferido automaticamente.
 *
 * - local-jsx: comandos que dependem de React/Ink UI (abrir dialog, renderizar componentes JSX, etc.).
 *   O padrão de supportedModes é apenas ['interactive'].
 */
export type CommandType = 'prompt' | 'local' | 'local-jsx';
```

### 2.5 Extensão da Interface `SlashCommand`

Novos campos adicionados à interface existente, **todos opcionais** para garantir compatibilidade retroativa:

```typescript
export interface SlashCommand {
  // ── Campos existentes (permanecem inalterados) ──────────────────────────────────────────────
  name: string;
  altNames?: string[];
  description: string;
  hidden?: boolean;
  completionPriority?: number;
  kind: CommandKind;
  extensionName?: string;
  action?: (...) => ...;
  completion?: (...) => ...;
  subCommands?: SlashCommand[];

  // ── Novos campos da Fase 1: origem e tipo de execução ──────────────────────────────────────
  /**
   * Origem do comando, usado para agrupamento no Help, badge de completação e exibição de comandos disponíveis no ACP.
   * Preenchido por cada Loader, não declarado pelo próprio comando.
   * Quando CommandKind for descontinuado no futuro, source será o único identificador de origem.
   */
  source?: CommandSource;

  /**
   * Rótulo de origem voltado ao usuário.
   * - builtin-command → "Built-in"
   * - bundled-skill → "Skill"
   * - skill-dir-command → "Custom"
   * - plugin-command → "Plugin: <extensionName>"
   * - mcp-prompt → "MCP: <serverName>"
   * Preenchido por cada Loader, pode ser sobrescrito pelo próprio comando.
   */
  sourceLabel?: string;

  /**
   * Tipo de execução do comando.
   * - Preenchido por cada Loader com valor padrão (prompt/local-jsx)
   * - Comandos internos: declarado pelo próprio arquivo de comando (local ou local-jsx)
   * Estratégia padrão quando não declarado: veja getEffectiveCommandType().
   */
  commandType?: CommandType;

  // ── Novos campos da Fase 1: capacidade de modo ──────────────────────────────────────────
  /**
   * Em quais modos de execução este comando está disponível.
   * Quando não declarado, o valor padrão é inferido com base em commandType (veja getEffectiveSupportedModes()).
   * Declaração explícita tem prioridade sobre o valor inferido.
   */
  supportedModes?: ExecutionMode[];

  // ── Novos campos da Fase 1: visibilidade ──────────────────────────────────────────────
  /**
   * Se o usuário pode invocar este comando via slash command.
   * Padrão true (quase todos os comandos são userInvocable).
   */
  userInvocable?: boolean;

  /**
   * Se o modelo pode invocar este comando via tool call.
   * Padrão false. Comandos do tipo prompt (skill, file command, MCP prompt) devem ser marcados como true.
   * Comandos internos (built-in) não permitem invocação pelo modelo (sempre false).
   */
  modelInvocable?: boolean;

  // ── Reservado para Fase 3: metadados de experiência (Fase 1 apenas define, não usa)──────────────────
  /**
   * Dica de parâmetros, exibida no menu de completação após o nome do comando.
   * Exemplo: "<model-id>" / "show|list|set <id>" / "[--fast] [<model-id>]"
   */
  argumentHint?: string;

  /**
   * Instrução para o modelo entender quando invocar este comando.
   * Será injetada na descrição de comandos modelInvocable.
   */
  whenToUse?: string;

  /**
   * Exemplos de uso, para exibição no catálogo Help e na completação.
   */
  examples?: string[];
}
```

---

## 3. Especificação de Preenchimento de Campos por Loader

### 3.1 Princípios de Preenchimento

- `source` e `sourceLabel` são preenchidos pelo Loader ao construir o `SlashCommand`; o comando em si não declara
- `commandType`: o Loader preenche o valor padrão; comandos internos declaram por conta própria
- `supportedModes`: inferido por `getEffectiveSupportedModes()`, não precisa ser preenchido explicitamente (a menos que seja necessário sobrescrever o padrão)
- `modelInvocable`: preenchido pelo Loader; comandos internos sempre `false`, comandos do tipo prompt sempre `true`

### 3.2 `BuiltinCommandLoader`

```typescript
// Não preenche source/sourceLabel/commandType — cada arquivo de comando declara por conta própria
// Porque o commandType de comandos internos é local ou local-jsx, precisa ser anotado individualmente

// Injeta source e sourceLabel:
for (const cmd of rawCommands) {
  enrichedCommands.push({
    ...cmd,
    source: 'builtin-command',
    sourceLabel: 'Built-in',
    userInvocable: cmd.userInvocable ?? true,
    modelInvocable: false, // Comandos internos não permitem invocação pelo modelo
  });
}
```

### 3.3 `BundledSkillLoader`

```typescript
return skills.map((skill) => ({
  name: skill.name,
  description: skill.description,
  kind: CommandKind.SKILL,
  source: 'bundled-skill' as CommandSource,
  sourceLabel: 'Skill',
  commandType: 'prompt' as CommandType,
  userInvocable: true,
  modelInvocable: true,
  action: async (...) => { ... },
}));
```

### 3.4 `FileCommandLoader`

```typescript
// Em createSlashCommandFromDefinition:
return {
  name: baseCommandName,
  description,
  kind: CommandKind.FILE,
  extensionName,
  // source é determinado por extensionName:
  source: extensionName ? 'plugin-command' : 'skill-dir-command',
  sourceLabel: extensionName ? `Plugin: ${extensionName}` : 'Custom',
  commandType: 'prompt',
  userInvocable: true,
  modelInvocable: !extensionName, // Comandos de plugin temporariamente não permitem invocação pelo modelo; comandos do usuário/projeto permitem
  action: async (...) => { ... },
};
```

> **Nota**: Comandos de plugin (plugin-command) temporariamente não são marcados como `modelInvocable` para evitar riscos de segurança. Em fases futuras, podem ser liberados conforme necessário, controlados por configuração do usuário.

### 3.5 `McpPromptLoader`

```typescript
const newPromptCommand: SlashCommand = {
  name: commandName,
  description: prompt.description || `Invoke prompt ${prompt.name}`,
  kind: CommandKind.MCP_PROMPT,
  source: 'mcp-prompt',
  sourceLabel: `MCP: ${serverName}`,
  commandType: 'prompt',
  userInvocable: true,
  modelInvocable: true,
  // ... demais campos existentes
};
```

---

## 4. Especificação de Declaração de `commandType` para Comandos Internos

### 4.1 Critérios de Classificação

| commandType | Critério                                                                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | `action` usa apenas `ui.addItem` (tipo texto), retorna `message` / `stream_messages` / `submit_prompt` / `tool`, não depende de renderização de componente React                          |
| `local-jsx` | `action` retorna `dialog`, ou `action` chama `ui.addItem` passando tipos complexos com JSX (exemplo: `HistoryItemHelp`, `HistoryItemStats`), ou depende de `confirm_action` / `load_history` / `quit` |

> **Atenção**: `ui.addItem(tipo message/error/info)` é `local`; `ui.addItem(tipo help/stats/tools/about ou outros UIs complexos)` é `local-jsx`.

### 4.2 Tabela de Classificação de Comandos Internos

**Classe `local`** (declaram `commandType: 'local'`, `supportedModes` inferido como todos os modos):

| Arquivo de comando       | Nome do comando | Descrição                                                         |
| ------------------------ | --------------- | ----------------------------------------------------------------- |
| `btwCommand.ts`          | `btw`           | Retorna `submit_prompt` ou `stream_messages`                      |
| `bugCommand.ts`          | `bug`           | Retorna `submit_prompt` ou `stream_messages`                      |
| `compressCommand.ts`     | `compress`      | Já possui adaptação executionMode, retorna `message`/`submit_prompt` |
| `contextCommand.ts`      | `context`       | Retorna `message` (embora contenha renderização UI, pode ser substituído por texto) |
| `exportCommand.ts`       | `export`        | I/O de arquivo, retorna `message`                                 |
| `initCommand.ts`         | `init`          | Retorna `submit_prompt`/`message`/`confirm_action`                |
| `memoryCommand.ts`       | `memory`        | Subcomandos retornam `message` (I/O de arquivo)                   |
| `planCommand.ts`         | `plan`          | Retorna `submit_prompt`                                           |
| `summaryCommand.ts`      | `summary`       | Já possui adaptação executionMode, retorna `submit_prompt`/`message` |
| `insightCommand.ts`      | `insight`       | Retorna `stream_messages`                                         |

> **Atenção**: `contextCommand` e `insightCommand`, embora atualmente retornem chamadas `addItem`, sua essência é conteúdo textual, portanto pertencem a `local`.

**Classe `local-jsx`** (declaram `commandType: 'local-jsx'`, `supportedModes` inferido como `['interactive']`):

| Arquivo de comando              | Nome do comando      | Motivo de não poder ser headless                               |
| ------------------------------- | -------------------- | -------------------------------------------------------------- |
| `aboutCommand.ts`               | `about`              | `addItem(HistoryItemAbout)` — componente UI complexo            |
| `agentsCommand.ts`              | `agents`             | `dialog: subagent_create/subagent_list`                        |
| `approvalModeCommand.ts`        | `approval-mode`      | `dialog: approval-mode`                                        |
| `arenaCommand.ts`               | `arena`              | `dialog: arena_*`                                              |
| `authCommand.ts`                | `auth`               | `dialog: auth`                                                 |
| `clearCommand.ts`               | `clear`              | `ui.clear()` opera diretamente no terminal                      |
| `copyCommand.ts`                | `copy`               | Operação de área de transferência, sem caminho headless          |
| `directoryCommand.tsx`          | `directory`          | Componente JSX                                                  |
| `docsCommand.ts`                | `docs`               | Abre navegador                                                  |
| `editorCommand.ts`              | `editor`             | `dialog: editor`                                                |
| `extensionsCommand.ts`          | `extensions`         | `dialog: extensions_manage`                                     |
| `helpCommand.ts`                | `help`               | `addItem(HistoryItemHelp)` — Help UI complexo                   |
| `hooksCommand.ts`               | `hooks`              | `dialog: hooks`                                                 |
| `ideCommand.ts`                 | `ide`                | Detecção e interação com processo IDE                           |
| `languageCommand.ts`            | `language`           | `dialog` + `reloadCommands`                                     |
| `mcpCommand.ts`                 | `mcp`                | `dialog: mcp`                                                   |
| `modelCommand.ts`               | `model`              | `dialog: model/fast-model`                                      |
| `permissionsCommand.ts`         | `permissions`        | `dialog: permissions`                                           |
| `quitCommand.ts`                | `quit`               | Tipo de resultado `quit`                                        |
| `restoreCommand.ts`             | `restore`            | Tipo de resultado `load_history`                                |
| `resumeCommand.ts`              | `resume`             | `dialog: resume`                                                |
| `settingsCommand.ts`            | `settings`           | `dialog: settings`                                              |
| `setupGithubCommand.ts`         | `setup-github`       | `confirm_shell_commands` + operações interativas                |
| `skillsCommand.ts`              | `skills`             | `addItem(HistoryItemSkillsList)` — UI complexo                   |
| `statsCommand.ts`               | `stats`              | `addItem(HistoryItemStats)` — UI complexo                       |
| `statuslineCommand.ts`          | `statusline`         | Configuração de estado da UI                                    |
| `terminalSetupCommand.ts`       | `terminal-setup`     | Assistente de configuração de terminal                          |
| `themeCommand.ts`               | `theme`              | `dialog: theme`                                                 |
| `toolsCommand.ts`               | `tools`              | `addItem(HistoryItemTools)` — UI complexo                       |
| `trustCommand.ts`               | `trust`              | `dialog: trust`                                                 |
| `vimCommand.ts`                 | `vim`                | `toggleVimEnabled()` — estado da UI                             |

---

## 5. Regras de Inferência de `getEffectiveSupportedModes`

Esta função é a lógica central da Fase 1, substituindo a lista branca original; será chamada por `filterCommandsForMode`.

```typescript
/**
 * Obtém a lista real de modos suportados pelo comando.
 *
 * Prioridade de inferência (da maior para a menor):
 * 1. supportedModes declarados explicitamente pelo comando (maior prioridade)
 * 2. Inferência baseada em commandType
 * 3. Fallback baseado em CommandKind (compatibilidade retroativa)
 */
export function getEffectiveSupportedModes(cmd: SlashCommand): ExecutionMode[] {
  // Prioridade 1: declaração explícita
  if (cmd.supportedModes !== undefined) {
    return cmd.supportedModes;
  }

  // Prioridade 2: inferência baseada em commandType
  if (cmd.commandType !== undefined) {
    switch (cmd.commandType) {
      case 'prompt':
        // Comandos do tipo prompt não têm dependência de UI, naturalmente disponíveis em todos os modos
        return ['interactive', 'non_interactive', 'acp'];
      case 'local':
        // Comandos do tipo local, padrão conservador: apenas interactive.
        // Comandos que precisam de suporte a não interativo devem declarar explicitamente supportedModes
        // (correspondente a supportsNonInteractive: true do Claude Code).
        // Na Fase 2, cada um será verificado e desbloqueado individualmente para evitar que comandos não adaptados
        // sejam expostos acidentalmente a chamadores headless.
        return ['interactive'];
      case 'local-jsx':
        return ['interactive'];
    }
  }

  // Prioridade 3: fallback (baseado em CommandKind, compatibilidade retroativa com código antigo)
  switch (cmd.kind) {
    case CommandKind.BUILT_IN:
      // Comandos internos sem commandType declarado: padrão conservador (apenas interactive)
      // Este ramo não deve mais ser atingido após a conclusão da Fase 1 (todos os comandos internos terão commandType)
      return ['interactive'];
    case CommandKind.FILE:
    case CommandKind.SKILL:
    case CommandKind.MCP_PROMPT:
      // Esses três tipos de comando têm action naturalmente sem dependência de UI; comportamento histórico também é disponível em todos os modos
      return ['interactive', 'non_interactive', 'acp'];
    default:
      return ['interactive'];
  }
}
```

```typescript
/**
 * Filtra comandos adequados para o modo atual com base em supportedModes.
 * Substitui a função original filterCommandsForNonInteractive.
 */
export function filterCommandsForMode(
  commands: readonly SlashCommand[],
  mode: ExecutionMode,
): SlashCommand[] {
  return commands.filter((cmd) =>
    getEffectiveSupportedModes(cmd).includes(mode),
  );
}
```

---

## 6. Extensão da Interface de `CommandService`

Dois novos métodos em `packages/cli/src/services/CommandService.ts`:

```typescript
export class CommandService {
  // ── Método existente (permanece inalterado)────────────────────────────────────────────────
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  // ── Novos métodos da Fase 1 ──────────────────────────────────────────────────

  /**
   * Retorna a lista de comandos disponíveis no modo de execução especificado.
   * Substitui a combinação anterior de lista branca + filterCommandsForNonInteractive.
   *
   * @param mode Modo de execução alvo
   * @returns Lista de comandos adequados para aquele modo (excluindo comandos ocultos)
   */
  getCommandsForMode(mode: ExecutionMode): readonly SlashCommand[] {
    return this.commands.filter((cmd) => {
      if (cmd.hidden) return false;
      return getEffectiveSupportedModes(cmd).includes(mode);
    });
  }

  /**
   * Retorna todos os comandos com modelInvocable igual a true.
   * Na Fase 2, SkillTool consumirá este método; na Fase 1, apenas fornece a interface.
   *
   * @returns Lista de comandos que podem ser invocados pelo modelo
   */
  getModelInvocableCommands(): readonly SlashCommand[] {
    return this.commands.filter(
      (cmd) => !cmd.hidden && cmd.modelInvocable === true,
    );
  }
}
```

> **Nota**: `getEffectiveSupportedModes` e `filterCommandsForMode` devem ser funções utilitárias internas de `CommandService`, ou extraídas para um arquivo independente `packages/cli/src/services/commandUtils.ts` e exportadas, para facilitar testes e reuso.

---

## 7. Reestruturação de `nonInteractiveCliCommands.ts`

### 7.1 Conteúdo a ser removido

```typescript
// ❌ Remover
export const ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE = [
  'init', 'summary', 'compress', 'btw', 'bug', 'context',
] as const;

// ❌ Remover
function filterCommandsForNonInteractive(
  commands: readonly SlashCommand[],
  allowedBuiltinCommandNames: Set<string>,
): SlashCommand[] { ... }
```

### 7.2 Conteúdo a ser adicionado

```typescript
// ✅ Adicionar (ou importar de commandUtils)
import { filterCommandsForMode } from '../services/commandUtils.js';
```

### 7.3 Alteração de assinatura de `handleSlashCommand`

```typescript
// ❌ Assinatura antiga
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<NonInteractiveSlashCommandResult>

// ✅ Nova assinatura (removido allowedBuiltinCommandNames)
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
): Promise<NonInteractiveSlashCommandResult>
```

### 7.4 Alteração da implementação interna

```typescript
// Antigo:
const filteredCommands = filterCommandsForNonInteractive(
  allCommands,
  allowedBuiltinSet,
);

// Novo:
const executionMode = isAcpMode ? 'acp' : 'non_interactive';
const filteredCommands = filterCommandsForMode(allCommands, executionMode);
```

### 7.5 Alteração de assinatura de `getAvailableCommands`

```typescript
// ❌ Assinatura antiga
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<SlashCommand[]>

// ✅ Nova assinatura
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  mode: ExecutionMode = 'acp',
): Promise<SlashCommand[]>
```

> Adicionado o parâmetro `mode` substituindo o parâmetro de lista branca. A sessão ACP pode especificar explicitamente `'acp'`, e chamadas non-interactive podem especificar `'non_interactive'`.

---

## 8. Alterações na Chamada de `Session.ts` (ACP)

```typescript
// ❌ Chamada antiga
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
  // Não passava, usava a lista branca padrão
);

// ✅ Nova chamada (sem alteração, parâmetro padrão removido)
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
);

// ─────────────────────────────────────────

// ❌ Chamada antiga
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
);

// ✅ Nova chamada (modo explicitamente especificado)
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
  'acp',
);
```

---

## 9. Resumo de Alterações de Arquivos

### 9.1 Arquivos Modificados

| Arquivo                                                                 | Conteúdo da modificação                                                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/commands/types.ts`                                 | Adiciona tipos `ExecutionMode`, `CommandSource`, `CommandType`; estende interface `SlashCommand`                           |
| `packages/cli/src/services/CommandService.ts`                           | Adiciona métodos `getCommandsForMode()`, `getModelInvocableCommands()`                                                    |
| `packages/cli/src/nonInteractiveCliCommands.ts`                         | Remove constantes de lista branca e função de filtragem antiga; atualiza assinatura de duas funções exportadas; introduz `filterCommandsForMode` |
| `packages/cli/src/acp-integration/session/Session.ts`                   | Atualiza chamadas de `handleSlashCommand` e `getAvailableCommands`                                                        |
| `packages/cli/src/services/BuiltinCommandLoader.ts`                     | Injeta `source: 'builtin-command'`, `sourceLabel: 'Built-in'`, `modelInvocable: false` ao construir comandos              |
| `packages/cli/src/services/BundledSkillLoader.ts`                       | Injeta `source: 'bundled-skill'`, `commandType: 'prompt'`, `modelInvocable: true`                                         |
| `packages/cli/src/services/FileCommandLoader.ts` / `command-factory.ts` | Injeta `source`, `commandType: 'prompt'`, `modelInvocable` (baseado em extensionName)                                     |
| `packages/cli/src/services/McpPromptLoader.ts`                          | Injeta `source: 'mcp-prompt'`, `commandType: 'prompt'`, `modelInvocable: true`                                            |
| **Arquivos de comandos internos (10 local + 27 local-jsx)**              | Declaram `commandType: 'local'` ou `commandType: 'local-jsx'`                                                             |

### 9.2 Novos Arquivos

| Arquivo                                   | Conteúdo                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/cli/src/services/commandUtils.ts` | Funções utilitárias `getEffectiveSupportedModes()`, `filterCommandsForMode()` e suas exportações |

### 9.3 Arquivos Inalterados

- `packages/cli/src/utils/commands.ts` (`parseSlashCommand` não precisa ser modificado)
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts` (caminho interactive não precisa ser modificado)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (UI stub não precisa ser modificada)
- Implementações de `action` de todos os comandos (Fase 1 não modifica o comportamento de nenhum comando)

---

## 10. Análise de Impacto no Comportamento

### 10.1 Resumo de Alterações

| Cenário                                  | Comportamento antigo          | Comportamento novo                                            | Natureza      |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------- | ------------- |
| Executar `/init` no non-interactive       | ✅ Permitido (lista branca)    | ✅ Permitido (`commandType: local`)                           | Sem alteração |
| Executar `/summary` no non-interactive    | ✅ Permitido                  | ✅ Permitido                                                  | Sem alteração |
| Executar `/compress` no non-interactive   | ✅ Permitido                  | ✅ Permitido                                                  | Sem alteração |
| Executar `/btw` no non-interactive        | ✅ Permitido                  | ✅ Permitido                                                  | Sem alteração |
| Executar `/bug` no non-interactive        | ✅ Permitido                  | ✅ Permitido                                                  | Sem alteração |
| Executar `/context` no non-interactive    | ✅ Permitido                  | ✅ Permitido                                                  | Sem alteração |
| Executar `/model` no non-interactive      | ❌ Não suportado              | ❌ Não suportado (`commandType: local-jsx`)                   | Sem alteração |
| Executar file command no non-interactive  | ✅ Permitido (CommandKind.FILE) | ✅ Permitido (`commandType: prompt`)                          | Sem alteração |
| Executar bundled skill no non-interactive | ✅ Permitido (CommandKind.SKILL) | ✅ Permitido (`commandType: prompt`)                          | Sem alteração |
| Executar MCP prompt no non-interactive    | ❌ Interceptado por CommandKind | ✅ Permitido (`commandType: prompt`)                          | **Bug fix**   |
| Executar `/export` no non-interactive     | ❌ Não está na lista branca    | ❌ Não permitido (`commandType: local`, padrão interactive only) | Sem alteração |
| Executar `/memory` no non-interactive     | ❌ Não está na lista branca    | ❌ Não permitido (`commandType: local`, padrão interactive only) | Sem alteração |
| Executar `/plan` no non-interactive       | ❌ Não está na lista branca    | ❌ Não permitido (`commandType: local`, padrão interactive only) | Sem alteração |
> **Sobre a política conservadora padrão do comando `local`**: o `supportedModes` padrão de `commandType: 'local'` é `['interactive']`, o que está alinhado com o design do Claude Code – comandos do tipo `local` precisam declarar explicitamente `supportsNonInteractive: true` para executar em modo não interativo. Na Fase 1, os 6 comandos da lista de permissões (`init`, `summary`, `compress`, `btw`, `bug`, `context`) substituem o efeito da lista de permissões original declarando explicitamente `supportedModes: ['interactive', 'non_interactive', 'acp']`. Na Fase 2, comandos que precisam ser estendidos (como `/export`, `/memory`, `/plan`) serão desbloqueados individualmente após verificar que a implementação `action` é headless-friendly.

---

## 10.2 Comandos com diferenças de modo na Fase 2: Padrão de registro duplo

Para comandos na Fase 2 que precisam de "UI no modo interativo, saída de texto no modo não interativo" (como `/model`), deve-se adotar o **padrão de registro duplo**, em vez de ramificar internamente a `action` de um único comando.

Este é o padrão do Claude Code, usando `/context` como exemplo (veja `src/commands/context/index.ts`): dois objetos `Command` com o mesmo nome, um `local-jsx` apenas interativo, outro `local` apenas não interativo, mutuamente exclusivos via `isEnabled()`.

O Qwen Code deve adotar a abordagem equivalente na Fase 2, substituindo `isEnabled()` por `supportedModes` para exclusão mútua:

```typescript
// ① 交互模式版：local-jsx，仅 interactive
export const modelCommandInteractive: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local-jsx',
  supportedModes: ['interactive'], // 显式限定
  // action: 打开 dialog 选择 model
};

// ② 非交互/acp 版：local，显式开放给 headless 调用者
export const modelCommandHeadless: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local',
  supportedModes: ['non_interactive', 'acp'], // 显式限定
  // action: 读取/设置 model，返回 message（纯文本）
};
```

Ambos os objetos têm o mesmo nome, `supportedModes` são mutuamente exclusivos, e `filterCommandsForMode` seleciona automaticamente a versão correta. Comparado à exclusão mútua via `isEnabled()` do Claude Code, a filtragem por `supportedModes` é mais explícita, mais fácil de testar e não requer detecção de ambiente em tempo de execução.

**A Fase 1 não implementa nenhum comando de registro duplo**; este padrão é mantido aqui apenas como especificação de implementação para a Fase 2.

---

## 11. Estratégia de Testes

### 11.1 Testes das novas funções utilitárias

Em `packages/cli/src/services/commandUtils.test.ts` (novo arquivo):

```typescript
describe('getEffectiveSupportedModes', () => {
  it('显式 supportedModes 优先于 commandType 推断', () => {
    const cmd: SlashCommand = {
      name: 'test', description: '', kind: CommandKind.BUILT_IN,
      commandType: 'local',
      supportedModes: ['interactive'], // 显式限制
    };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: local 推断为 all modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType: local-jsx 推断为 interactive only', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local-jsx' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: prompt 推断为 all modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.SKILL, commandType: 'prompt' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('未声明 commandType 且 CommandKind.BUILT_IN，兜底为 interactive', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('未声明 commandType 且 CommandKind.FILE，兜底为 all modes', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.FILE };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('未声明 commandType 且 CommandKind.MCP_PROMPT，兜底为 all modes（修复原有限制）', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.MCP_PROMPT };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });
});

describe('filterCommandsForMode', () => {
  it('正确过滤 non_interactive 模式下的命令', () => { ... });
  it('正确过滤 acp 模式下的命令', () => { ... });
  it('不过滤 hidden 命令（filterCommandsForMode 不处理 hidden，CommandService 处理）', () => { ... });
});
```

### 11.2 Atualizar `nonInteractiveCliCommands.test.ts`

- Remover todas as referências a `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Remover casos de teste para o parâmetro `allowedBuiltinCommandNames`
- Novo: Verificar que comandos com `commandType: local` passam pelo filtro em non-interactive
- Novo: Verificar que comandos com `commandType: local-jsx` são filtrados em non-interactive
- Manter: Verificar que comandos file / skill command passam pelo filtro em non-interactive

### 11.3 Atualizar `CommandService.test.ts`

- Novo: Casos de teste para `getCommandsForMode`
- Novo: Casos de teste para `getModelInvocableCommands`

### 11.4 Testes de cada Loader

- `BuiltinCommandLoader.test.ts`: Verificar que todos os comandos possuem `source: 'builtin-command'`
- `BundledSkillLoader.test.ts`: Verificar `source: 'bundled-skill'` e `modelInvocable: true`
- `FileCommandLoader.test.ts`: Verificar que comandos de usuário têm `source: 'skill-dir-command'` e comandos de plug-in têm `source: 'plugin-command'`
- `McpPromptLoader.test.ts`: Verificar `source: 'mcp-prompt'` e `modelInvocable: true`

---

## 12. Ordem de Implementação

Recomenda-se implementar na seguinte ordem, cada etapa pode ser commitada e revisada independentemente:

**Etapa 1** (~30min): Modificar `types.ts`, adicionar novos campos `ExecutionMode`, `CommandSource`, `CommandType` e `SlashCommand`
→ Apenas mudanças de tipo, verificação de compilação TypeScript

**Etapa 2** (~1h): Criar `commandUtils.ts`, implementar `getEffectiveSupportedModes` e `filterCommandsForMode`, criar simultaneamente `commandUtils.test.ts`
→ Testes unitários cobrindo a lógica central

**Etapa 3** (~1h): Refatorar `nonInteractiveCliCommands.ts`, remover lista de permissões, introduzir `filterCommandsForMode`, atualizar assinatura da função
→ Comportamento equivalente (Estratégia conservadora da Fase 1: comandos do tipo `local` escrevem explicitamente `supportedModes: ['interactive']`)

**Etapa 4** (~30min): Atualizar `CommandService.ts`, adicionar dois métodos

**Etapa 5** (~2h): Adicionar declaração `commandType` a todos os arquivos de comando built-in
→ Confirmar a correção da classificação um por um

**Etapa 6** (~1.5h): Atualizar todos os Loaders, injetar `source`, `sourceLabel`, `commandType`, `modelInvocable`

**Etapa 7** (~30min): Atualizar a assinatura de chamada de `Session.ts`

**Etapa 8** (~1h): Executar todos os testes, corrigir casos com falha, atualizar snapshots

**Etapa 9** (~30min): Auto-revisão CR: Confirmar que a lista de permissões foi completamente removida, sem chamadas perdidas

---

## 13. Checklist de Aceitação

- [ ] Compilação TypeScript sem erros (`npm run typecheck`)
- [ ] `npm run lint` sem novos erros de lint
- [ ] Todos os testes existentes passam (`cd packages/cli && npx vitest run`)
- [ ] Todos os testes novos em `commandUtils.test.ts` passam
- [ ] `getEffectiveSupportedModes` cobre todos os 7 casos
- [ ] `filterCommandsForMode` cobre os três modos: interactive / non_interactive / acp
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` não tem nenhuma referência em todo o código (verificar com `grep`)
- [ ] A função `filterCommandsForNonInteractive` não tem nenhuma referência em todo o código
- [ ] Todos os comandos built-in possuem o campo `commandType`
- [ ] Todos os comandos emitidos pelos Loaders possuem os campos `source` e `sourceLabel`
- [ ] Comandos emitidos por `BundledSkillLoader` / `FileCommandLoader` (comandos de usuário) / `McpPromptLoader` possuem `modelInvocable: true`
- [ ] Comandos emitidos por `BuiltinCommandLoader` possuem `modelInvocable: false`
- [ ] `CommandService.getCommandsForMode('non_interactive')` retorna o conjunto de comandos equivalente ao anterior à refatoração
- [ ] Comandos MCP prompt não são mais bloqueados incorretamente no modo non-interactive