# Documento de Design Técnico da Phase 1: Reconstrução da Infraestrutura

## 1. Objetivos e Restrições do Design

### 1.1 Objetivos

- Estabelecer um modelo unificado de metadados de comandos, cobrindo quatro dimensões: origem (`source`), tipo de execução (`commandType`), capacidades de modo (`supportedModes`) e visibilidade (`userInvocable` / `modelInvocable`)
- Substituir a whitelist hardcoded em `non-interactive`/`acp` por filtragem baseada em capacidades
- Fornecer uma interface de base estável para a expansão de capacidades nas Phases 2/3

### 1.2 Restrições Rígidas

- **Zero alteração de comportamento**: o conjunto de comandos disponíveis nos modos `non-interactive` e `acp` permanece inalterado (exceção: correção do bug onde `MCP_PROMPT` era interceptado incorretamente)
- **Compatibilidade com versões anteriores**: novos campos na interface `SlashCommand` são todos opcionais ou possuem valores padrão razoáveis, sem exigir modificações imediatas no código dos comandos existentes
- **Sem criação de novos executores**: não criar novas arquiteturas de execução como `ModeAdapter` / `CommandExecutor`; apenas estender o `CommandService` e a lógica de filtragem existentes
- **Sem alteração nas capacidades dos comandos existentes**: não adicionar subcomandos `local` a nenhum comando, nem modificar a implementação de `action` de qualquer comando

---

## 2. Definições de Novos Tipos

### 2.1 Localização do Arquivo

Todas as novas definições de tipo estão em `packages/cli/src/ui/commands/types.ts`, no mesmo arquivo da interface `SlashCommand` existente.

### 2.2 `ExecutionMode`

```typescript
/**
 * 运行模式枚举。
 * - interactive：React/Ink UI 模式（终端交互）
 * - non_interactive：无交互 CLI 模式（文本/JSON 输出）
 * - acp：ACP/Zed 集成模式
 */
export type ExecutionMode = 'interactive' | 'non_interactive' | 'acp';
```

### 2.3 `CommandSource`

```typescript
/**
 * 命令来源枚举，用于 Help 分组、补全 badge、ACP available commands。
 *
 * 与 CommandKind 的区别：
 * - CommandKind 是内部加载器分类（4 种），影响加载逻辑
 * - CommandSource 是面向用户的来源分类（9 种），影响展示和心智模型
 *
 * 两者可能重叠，但职责不同，不合并。
 */
export type CommandSource =
  | 'builtin-command' // 内置命令（BuiltinCommandLoader）
  | 'bundled-skill' // 随包分发的 skill（BundledSkillLoader）
  | 'skill-dir-command' // 用户/项目 .qwen/commands/ 下的文件命令（FileCommandLoader，非插件）
  | 'plugin-command' // 插件提供的命令（FileCommandLoader，extensionName 不为空）
  | 'mcp-prompt'; // MCP server 提供的 prompt（McpPromptLoader）
// 以下来源预留，Phase 1 不实现对应 Loader，但 schema 先定义：
// | 'workflow-command'
// | 'plugin-skill'
// | 'dynamic-skill'
// | 'builtin-plugin-skill'
// | 'mcp-skill'
```

### 2.4 `CommandType`

```typescript
/**
 * 命令执行类型，描述命令"怎么执行"。
 *
 * - prompt：产生 submit_prompt，将内容提交给模型。适用于 skill、file command、MCP prompt。
 *   默认 supportedModes 为所有模式，默认 modelInvocable 为 true。
 *
 * - local：在本地执行逻辑，不依赖 React/Ink UI。可返回 message、stream_messages、
 *   submit_prompt、tool 等类型。适用于查询类、配置类、状态类 built-in 命令。
 *   默认 supportedModes 为 ['interactive']，需显式声明 supportedModes 才能开放给其他模式。
 *   这与 Claude Code 的 supportsNonInteractive: true 语义一致——非交互支持需要显式声明，而非自动推断。
 *
 * - local-jsx：依赖 React/Ink UI 的命令（打开 dialog、渲染 JSX 组件等）。
 *   默认 supportedModes 仅为 ['interactive']。
 */
export type CommandType = 'prompt' | 'local' | 'local-jsx';
```

### 2.5 扩展 `SlashCommand` 接口

在现有接口上追加新字段，**全部为可选**以保证向后兼容：

```typescript
export interface SlashCommand {
  // ── 现有字段（保持不变） ──────────────────────────────────────────────
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

  // ── Phase 1 新增：来源与执行类型 ──────────────────────────────────────
  /**
   * 命令来源，用于 Help 分组、补全 badge、ACP available commands 展示。
   * 由各 Loader 填充，不由命令自身声明。
   * 未来废弃 CommandKind 时，source 将成为唯一来源标识。
   */
  source?: CommandSource;

  /**
   * 展示用的来源标签，面向用户。
   * - builtin-command → "Built-in"
   * - bundled-skill → "Skill"
   * - skill-dir-command → "Custom"
   * - plugin-command → "Plugin: <extensionName>"
   * - mcp-prompt → "MCP: <serverName>"
   * 由各 Loader 填充，可被命令自身覆盖。
   */
  sourceLabel?: string;

  /**
   * 命令执行类型。
   * - 由各 Loader 填充默认值（prompt/local-jsx）
   * - built-in 命令由各命令文件自身声明（local 或 local-jsx）
   * 未声明时的默认策略见 getEffectiveCommandType()。
   */
  commandType?: CommandType;

  // ── Phase 1 新增：模式能力 ──────────────────────────────────────────
  /**
   * 此命令在哪些运行模式下可用。
   * 未声明时根据 commandType 推断默认值（见 getEffectiveSupportedModes()）。
   * 显式声明优先于推断值。
   */
  supportedModes?: ExecutionMode[];

  // ── Phase 1 新增：可见性 ──────────────────────────────────────────────
  /**
   * 用户是否可通过 slash command 调用此命令。
   * 默认 true（几乎所有命令都是 userInvocable）。
   */
  userInvocable?: boolean;

  /**
   * 模型是否可通过 tool call 调用此命令。
   * 默认 false。prompt 类型的命令（skill、file command、MCP prompt）应设为 true。
   * built-in commands 不允许模型调用（始终为 false）。
   */
  modelInvocable?: boolean;

  // ── Phase 3 预留：体验元数据（Phase 1 仅定义，不使用）──────────────────
  /**
   * 参数提示，显示在补全菜单命令名后。
   * 示例："<model-id>" / "show|list|set <id>" / "[--fast] [<model-id>]"
   */
  argumentHint?: string;

  /**
   * 供模型理解何时调用此命令的说明。
   * 将被注入 modelInvocable 命令的 description 中。
   */
  whenToUse?: string;

  /**
   * 使用示例，供 Help 目录和补全展示。
   */
  examples?: string[];
}
```

---

## 3. Regras de Preenchimento de Campos por Loader

### 3.1 Princípios de Preenchimento

- `source` e `sourceLabel` são preenchidos pelo Loader durante a construção do `SlashCommand`; o comando em si não os declara
- `commandType`: o Loader preenche o valor padrão; comandos built-in são declarados pelo próprio arquivo do comando
- `supportedModes`: inferido via `getEffectiveSupportedModes()`, não requer preenchimento explícito (exceto para sobrescrever o padrão)
- `modelInvocable`: preenchido pelo Loader; comandos built-in são sempre `false`, comandos do tipo prompt são `true`

### 3.2 `BuiltinCommandLoader`

```typescript
// 不填充 source/sourceLabel/commandType — 由各命令文件自声明
// 因为 built-in 命令的 commandType 是 local 或 local-jsx，需要逐个标注

// 注入 source 和 sourceLabel：
for (const cmd of rawCommands) {
  enrichedCommands.push({
    ...cmd,
    source: 'builtin-command',
    sourceLabel: 'Built-in',
    userInvocable: cmd.userInvocable ?? true,
    modelInvocable: false, // built-in 命令不允许模型调用
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
// 在 createSlashCommandFromDefinition 中：
return {
  name: baseCommandName,
  description,
  kind: CommandKind.FILE,
  extensionName,
  // source 根据 extensionName 决定：
  source: extensionName ? 'plugin-command' : 'skill-dir-command',
  sourceLabel: extensionName ? `Plugin: ${extensionName}` : 'Custom',
  commandType: 'prompt',
  userInvocable: true,
  modelInvocable: !extensionName, // 插件命令暂不允许模型调用，用户/项目命令允许
  action: async (...) => { ... },
};
```

> **注**：插件命令（plugin-command）暂不标记为 `modelInvocable`，避免安全隐患。后续 Phase 可以按需开放，由用户通过配置控制。

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
  // ... 其余现有字段
};
```

---

## 4. Regras de Declaração de `commandType` para Comandos Built-in

### 4.1 Critérios de Classificação

| commandType | Critério de Julgamento                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | A `action` usa apenas `ui.addItem` (tipos de texto), retorna `message` / `stream_messages` / `submit_prompt` / `tool`, sem depender de renderização de componentes React                                               |
| `local-jsx` | A `action` retorna `dialog`, ou chama `ui.addItem` com tipos complexos contendo JSX (ex: `HistoryItemHelp`, `HistoryItemStats`), ou depende de `confirm_action` / `load_history` / `quit` |

> **Nota**: `ui.addItem(message/error/info 类型)` é `local`; `ui.addItem(help/stats/tools/about 等复杂 UI 类型)` é `local-jsx`.

### 4.2 Tabela de Classificação de Comandos Built-in

**Categoria `local`** (declara `commandType: 'local'`, `supportedModes` inferido para todos os modos):

| Arquivo do Comando             | Nome do Comando     | Descrição                                                    |
| -------------------- | ---------- | ------------------------------------------------------- |
| `btwCommand.ts`      | `btw`      | Retorna `submit_prompt` ou `stream_messages`               |
| `bugCommand.ts`      | `bug`      | Retorna `submit_prompt` ou `stream_messages`               |
| `compressCommand.ts` | `compress` | Já possui adaptação de executionMode, retorna `message`/`submit_prompt` |
| `contextCommand.ts`  | `context`  | Retorna `message` (contém renderização de UI, mas é substituível por texto)                |
| `exportCommand.ts`   | `export`   | I/O de arquivo, retorna `message`                                |
| `initCommand.ts`     | `init`     | Retorna `submit_prompt`/`message`/`confirm_action`         |
| `memoryCommand.ts`   | `memory`   | Subcomandos retornam `message` (I/O de arquivo)                        |
| `planCommand.ts`     | `plan`     | Retorna `submit_prompt`                                    |
| `summaryCommand.ts`  | `summary`  | Já possui adaptação de executionMode, retorna `submit_prompt`/`message` |
| `insightCommand.ts`  | `insight`  | Retorna `stream_messages`                                  |

> **Nota**: `contextCommand` e `insightCommand`, embora atualmente retornem chamadas `addItem`, são essencialmente conteúdo de texto e pertencem a `local`.

**Categoria `local-jsx`** (declara `commandType: 'local-jsx'`, `supportedModes` inferido para `['interactive']`):

| Arquivo do Comando                  | Nome do Comando           | Motivo para não suportar headless                       |
| ------------------------- | ---------------- | ------------------------------------------ |
| `aboutCommand.ts`         | `about`          | `addItem(HistoryItemAbout)` — componente de UI complexo |
| `agentsCommand.ts`        | `agents`         | `dialog: subagent_create/subagent_list`    |
| `approvalModeCommand.ts`  | `approval-mode`  | `dialog: approval-mode`                    |
| `arenaCommand.ts`         | `arena`          | `dialog: arena_*`                          |
| `authCommand.ts`          | `auth`           | `dialog: auth`                             |
| `clearCommand.ts`         | `clear`          | `ui.clear()` opera diretamente no terminal                  |
| `copyCommand.ts`          | `copy`           | Operação de área de transferência, sem caminho headless               |
| `directoryCommand.tsx`    | `directory`      | Componente JSX                                   |
| `docsCommand.ts`          | `docs`           | Abre o navegador                                 |
| `editorCommand.ts`        | `editor`         | `dialog: editor`                           |
| `extensionsCommand.ts`    | `extensions`     | `dialog: extensions_manage`                |
| `helpCommand.ts`          | `help`           | `addItem(HistoryItemHelp)` — UI de Help complexa  |
| `hooksCommand.ts`         | `hooks`          | `dialog: hooks`                            |
| `ideCommand.ts`           | `ide`            | Detecção e interação com processo IDE                         |
| `languageCommand.ts`      | `language`       | `dialog` + `reloadCommands`                |
| `mcpCommand.ts`           | `mcp`            | `dialog: mcp`                              |
| `modelCommand.ts`         | `model`          | `dialog: model/fast-model`                 |
| `permissionsCommand.ts`   | `permissions`    | `dialog: permissions`                      |
| `quitCommand.ts`          | `quit`           | Tipo de resultado `quit`                           |
| `restoreCommand.ts`       | `restore`        | Tipo de resultado `load_history`                 |
| `resumeCommand.ts`        | `resume`         | `dialog: resume`                           |
| `settingsCommand.ts`      | `settings`       | `dialog: settings`                         |
| `setupGithubCommand.ts`   | `setup-github`   | `confirm_shell_commands` + operação interativa      |
| `skillsCommand.ts`        | `skills`         | `addItem(HistoryItemSkillsList)` — UI complexa |
| `statsCommand.ts`         | `stats`          | `addItem(HistoryItemStats)` — UI complexa      |
| `statuslineCommand.ts`    | `statusline`     | Configuração de status da UI                                |
| `terminalSetupCommand.ts` | `terminal-setup` | Assistente de configuração do terminal                               |
| `themeCommand.ts`         | `theme`          | `dialog: theme`                            |
| `toolsCommand.ts`         | `tools`          | `addItem(HistoryItemTools)` — UI complexa      |
| `trustCommand.ts`         | `trust`          | `dialog: trust`                            |
| `vimCommand.ts`           | `vim`            | `toggleVimEnabled()` — estado da UI             |

---

## 5. Regras de Inferência do `getEffectiveSupportedModes`

Esta função é a lógica central da Phase 1, substituindo a whitelist original, e será chamada por `filterCommandsForMode`.

```typescript
/**
 * 获取命令的实际支持模式列表。
 *
 * 推断优先级（从高到低）：
 * 1. 命令显式声明的 supportedModes（最高优先级）
 * 2. 基于 commandType 的推断
 * 3. 基于 CommandKind 的兜底（向后兼容）
 */
export function getEffectiveSupportedModes(cmd: SlashCommand): ExecutionMode[] {
  // 优先级 1：显式声明
  if (cmd.supportedModes !== undefined) {
    return cmd.supportedModes;
  }

  // 优先级 2：基于 commandType 推断
  if (cmd.commandType !== undefined) {
    switch (cmd.commandType) {
      case 'prompt':
        // prompt 类型无 UI 依赖，天然全模式可用
        return ['interactive', 'non_interactive', 'acp'];
      case 'local':
        // local 类型保守默认：仅 interactive。
        // 需要非交互支持的命令须显式声明 supportedModes（对应 Claude Code 的 supportsNonInteractive: true）。
        // Phase 2 中逐个验证并解锁，防止未适配的命令意外暴露给 headless 调用者。
        return ['interactive'];
      case 'local-jsx':
        return ['interactive'];
    }
  }

  // 优先级 3：兜底（基于 CommandKind，向后兼容旧代码）
  switch (cmd.kind) {
    case CommandKind.BUILT_IN:
      // built-in 命令未声明 commandType 时保守默认（interactive only）
      // 这个分支在 Phase 1 完成后应不再被命中（所有 built-in 都有 commandType）
      return ['interactive'];
    case CommandKind.FILE:
    case CommandKind.SKILL:
    case CommandKind.MCP_PROMPT:
      // 这三类命令的 action 天然无 UI 依赖，历史行为也是全模式可用
      return ['interactive', 'non_interactive', 'acp'];
    default:
      return ['interactive'];
  }
}
```

```typescript
/**
 * 根据 supportedModes 过滤适合当前模式的命令。
 * 替代原 filterCommandsForNonInteractive 函数。
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

## 6. Extensão da Interface `CommandService`

Adicione dois novos métodos em `packages/cli/src/services/CommandService.ts`:

```typescript
export class CommandService {
  // ── 现有方法（保持不变）────────────────────────────────────────────────
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  // ── Phase 1 新增方法 ──────────────────────────────────────────────────

  /**
   * 返回在指定执行模式下可用的命令列表。
   * 替代原有白名单 + filterCommandsForNonInteractive 的组合。
   *
   * @param mode 目标运行模式
   * @returns 适合该模式的命令列表（不含 hidden 命令）
   */
  getCommandsForMode(mode: ExecutionMode): readonly SlashCommand[] {
    return this.commands.filter((cmd) => {
      if (cmd.hidden) return false;
      return getEffectiveSupportedModes(cmd).includes(mode);
    });
  }

  /**
   * 返回所有 modelInvocable 为 true 的命令。
   * Phase 2 中 SkillTool 将消费此方法；Phase 1 仅提供接口。
   *
   * @returns 模型可调用的命令列表
   */
  getModelInvocableCommands(): readonly SlashCommand[] {
    return this.commands.filter(
      (cmd) => !cmd.hidden && cmd.modelInvocable === true,
    );
  }
}
```

> **Nota**: `getEffectiveSupportedModes` e `filterCommandsForMode` devem ser funções utilitárias para uso interno do `CommandService`, ou extraídas para um arquivo independente `packages/cli/src/services/commandUtils.ts` e exportadas, facilitando testes e reuso.

---

## 7. Refatoração do `nonInteractiveCliCommands.ts`

### 7.1 Conteúdo a Ser Removido

```typescript
// ❌ 删除
export const ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE = [
  'init', 'summary', 'compress', 'btw', 'bug', 'context',
] as const;

// ❌ 删除
function filterCommandsForNonInteractive(
  commands: readonly SlashCommand[],
  allowedBuiltinCommandNames: Set<string>,
): SlashCommand[] { ... }
```

### 7.2 Conteúdo a Ser Adicionado

```typescript
// ✅ 新增（或从 commandUtils 导入）
import { filterCommandsForMode } from '../services/commandUtils.js';
```

### 7.3 Alteração na Assinatura da Função `handleSlashCommand`

```typescript
// ❌ 旧签名
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<NonInteractiveSlashCommandResult>

// ✅ 新签名（移除 allowedBuiltinCommandNames）
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
): Promise<NonInteractiveSlashCommandResult>
```

### 7.4 Alteração na Implementação Interna

```typescript
// 旧：
const filteredCommands = filterCommandsForNonInteractive(
  allCommands,
  allowedBuiltinSet,
);

// 新：
const executionMode = isAcpMode ? 'acp' : 'non_interactive';
const filteredCommands = filterCommandsForMode(allCommands, executionMode);
```

### 7.5 Alteração na Assinatura da Função `getAvailableCommands`

```typescript
// ❌ 旧签名
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<SlashCommand[]>

// ✅ 新签名
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  mode: ExecutionMode = 'acp',
): Promise<SlashCommand[]>
```

> O novo parâmetro `mode` substitui o antigo parâmetro de whitelist. A sessão ACP pode especificar explicitamente `'acp'`, enquanto chamadas non-interactive especificam `'non_interactive'`.

---

## 8. Alterações nas Chamadas em `Session.ts` (ACP)

```typescript
// ❌ 旧调用
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
  // 不传，使用默认白名单
);

// ✅ 新调用（无变化，移除了不再存在的默认参数）
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
);

// ─────────────────────────────────────────

// ❌ 旧调用
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
);

// ✅ 新调用（明确指定 mode）
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
  'acp',
);
```

---

## 9. Visão Geral das Alterações nos Arquivos

### 9.1 Arquivos Modificados

| Arquivo                                                                    | Conteúdo da Modificação                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/cli/src/ui/commands/types.ts`                                 | Adiciona tipos `ExecutionMode`, `CommandSource`, `CommandType`; estende interface `SlashCommand`              |
| `packages/cli/src/services/CommandService.ts`                           | Adiciona métodos `getCommandsForMode()`, `getModelInvocableCommands()`                                  |
| `packages/cli/src/nonInteractiveCliCommands.ts`                         | Remove constante de whitelist e função de filtro antiga; atualiza assinaturas de duas funções exportadas; importa `filterCommandsForMode`                 |
| `packages/cli/src/acp-integration/session/Session.ts`                   | Atualiza chamadas para `handleSlashCommand` e `getAvailableCommands`                                         |
| `packages/cli/src/services/BuiltinCommandLoader.ts`                     | Injeta `source: 'builtin-command'`, `sourceLabel: 'Built-in'`, `modelInvocable: false` durante a construção do comando |
| `packages/cli/src/services/BundledSkillLoader.ts`                       | Injeta `source: 'bundled-skill'`, `commandType: 'prompt'`, `modelInvocable: true`                  |
| `packages/cli/src/services/FileCommandLoader.ts` / `command-factory.ts` | Injeta `source`, `commandType: 'prompt'`, `modelInvocable` (com base em `extensionName`)                   |
| `packages/cli/src/services/McpPromptLoader.ts`                          | Injeta `source: 'mcp-prompt'`, `commandType: 'prompt'`, `modelInvocable: true`                     |
| **Arquivos de comandos built-in (10 local + 27 local-jsx)**               | Declara `commandType: 'local'` ou `commandType: 'local-jsx'`                                        |

### 9.2 Arquivos Adicionados

| Arquivo                                        | Conteúdo                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/cli/src/services/commandUtils.ts` | Funções utilitárias `getEffectiveSupportedModes()`, `filterCommandsForMode()` e suas exportações |

### 9.3 Arquivos Inalterados

- `packages/cli/src/utils/commands.ts` (`parseSlashCommand` não requer alterações)
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts` (caminho interativo não requer alterações)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (UI stub não requer alterações)
- Implementações de `action` de todos os comandos (a Phase 1 não modifica o comportamento de nenhum comando)

---

## 10. Análise de Impacto no Comportamento

### 10.1 Resumo das Alterações

| Cenário                                 | Comportamento Anterior                       | Novo Comportamento                                                   | Natureza        |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------- | ----------- |
| Execução de `/init` em non-interactive       | ✅ Permitido (whitelist)            | ✅ Permitido (`commandType: local`)                          | Sem alteração      |
| Execução de `/summary` em non-interactive    | ✅ Permitido                      | ✅ Permitido                                                  | Sem alteração      |
| Execução de `/compress` em non-interactive   | ✅ Permitido                      | ✅ Permitido                                                  | Sem alteração      |
| Execução de `/btw` em non-interactive        | ✅ Permitido                      | ✅ Permitido                                                  | Sem alteração      |
| Execução de `/bug` em non-interactive        | ✅ Permitido                      | ✅ Permitido                                                  | Sem alteração      |
| Execução de `/context` em non-interactive    | ✅ Permitido                      | ✅ Permitido                                                  | Sem alteração      |
| Execução de `/model` em non-interactive      | ❌ Não suportado               | ❌ Não suportado (`commandType: local-jsx`)               | Sem alteração      |
| Execução de file command em non-interactive  | ✅ Permitido (CommandKind.FILE)  | ✅ Permitido (`commandType: prompt`)                         | Sem alteração      |
| Execução de bundled skill em non-interactive | ✅ Permitido (CommandKind.SKILL) | ✅ Permitido (`commandType: prompt`)                         | Sem alteração      |
| Execução de MCP prompt em non-interactive    | ❌ Interceptado por CommandKind       | ✅ Permitido (`commandType: prompt`)                         | **Correção de bug** |
| Execução de `/export` em non-interactive     | ❌ Fora da whitelist                | ❌ Não permitido (`commandType: local`, padrão interactive only) | Sem alteração      |
| Execução de `/memory` em non-interactive     | ❌ Fora da whitelist                | ❌ Não permitido (`commandType: local`, padrão interactive only) | Sem alteração      |
| Execução de `/plan` em non-interactive       | ❌ Fora da whitelist                | ❌ Não permitido (`commandType: local`, padrão interactive only) | Sem alteração      |

> **Sobre a estratégia padrão conservadora para comandos `local`**: o `supportedModes` padrão para `commandType: 'local'` é `['interactive']`, alinhado com o design do Claude Code — comandos do tipo `local` precisam declarar explicitamente `supportsNonInteractive: true` para rodar em modo não interativo. Na Phase 1, os 6 comandos na whitelist (`init`, `summary`, `compress`, `btw`, `bug`, `context`) substituem o efeito da whitelist original declarando explicitamente `supportedModes: ['interactive', 'non_interactive', 'acp']`. Na Phase 2, comandos que precisam ser expandidos (ex: `/export`, `/memory`, `/plan`) serão liberados um a um após validar que a implementação da `action` é compatível com headless.

---

### 10.2 Comandos com Diferenças de Modo na Phase 2: Padrão de Registro Duplo

Para comandos na Phase 2 que exigem "UI no modo interativo e saída de texto no modo não interativo" (ex: `/model`), deve-se adotar o **padrão de registro duplo**, em vez de ramificar dentro da `action` de um único comando.

Este é o padrão do Claude Code. Tomando `/context` como exemplo (veja `src/commands/context/index.ts`): dois objetos `Command` com o mesmo nome, um `local-jsx` apenas para `interactive` e outro `local` apenas para `non-interactive`, com exclusividade mútua via `isEnabled()`.

O Qwen Code deve adotar uma abordagem equivalente na Phase 2, usando `supportedModes` no lugar de `isEnabled()` para garantir a exclusividade mútua:

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

Ambos os objetos compartilham o mesmo nome, com `supportedModes` mutuamente exclusivos. O `filterCommandsForMode` seleciona automaticamente a versão correta. Comparado à exclusividade via `isEnabled()` do Claude Code, a filtragem por `supportedModes` é mais explícita, mais fácil de testar e não requer detecção de ambiente em tempo de execução.

**A Phase 1 não implementa nenhum comando com registro duplo**; este padrão é apenas uma especificação de implementação reservada para a Phase 2.

---

## 11. Estratégia de Testes

### 11.1 Testes para Novas Funções Utilitárias

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

### 11.2 Atualização do `nonInteractiveCliCommands.test.ts`

- Remover todas as referências a `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Remover casos de teste para o parâmetro `allowedBuiltinCommandNames`
- Adicionar: validar que comandos com `commandType: local` passam pelo filtro em `non-interactive`
- Adicionar: validar que comandos com `commandType: local-jsx` são filtrados em `non-interactive`
- Manter: validar que file commands / skill commands passam pelo filtro em `non-interactive`

### 11.3 Atualização do `CommandService.test.ts`

- Adicionar casos de teste para `getCommandsForMode`
- Adicionar casos de teste para `getModelInvocableCommands`

### 11.4 Testes para Cada Loader

- `BuiltinCommandLoader.test.ts`: validar que todos os comandos possuem `source: 'builtin-command'`
- `BundledSkillLoader.test.ts`: validar `source: 'bundled-skill'` e `modelInvocable: true`
- `FileCommandLoader.test.ts`: validar que comandos de usuário possuem `source: 'skill-dir-command'` e comandos de plugin possuem `source: 'plugin-command'`
- `McpPromptLoader.test.ts`: validar `source: 'mcp-prompt'` e `modelInvocable: true`

---

## 12. Ordem de Implementação

Recomenda-se a implementação na seguinte ordem, onde cada etapa pode ser commitada e revisada independentemente:

**Etapa 1** (~30min): Modificar `types.ts`, adicionar `ExecutionMode`, `CommandSource`, `CommandType` e novos campos em `SlashCommand`
→ Alteração puramente de tipos, verificação de compilação TypeScript

**Etapa 2** (~1h): Criar `commandUtils.ts`, implementar `getEffectiveSupportedModes` e `filterCommandsForMode`, criar simultaneamente `commandUtils.test.ts`
→ Cobertura de testes unitários para a lógica central

**Etapa 3** (~1h): Refatorar `nonInteractiveCliCommands.ts`, remover a whitelist, introduzir `filterCommandsForMode`, atualizar assinaturas de funções
→ Equivalência de comportamento (estratégia conservadora da Phase 1: comandos `local` declaram explicitamente `supportedModes: ['interactive']`)

**Etapa 4** (~30min): Atualizar `CommandService.ts`, adicionar dois novos métodos

**Etapa 5** (~2h): Adicionar declaração de `commandType` a todos os arquivos de comandos built-in
→ Confirmar a precisão da classificação um a um

**Etapa 6** (~1.5h): Atualizar todos os Loaders, injetar `source`, `sourceLabel`, `commandType`, `modelInvocable`

**Etapa 7** (~30min): Atualizar assinaturas de chamada em `Session.ts`

**Etapa 8** (~1h): Executar todos os testes, corrigir falhas, atualizar snapshots

**Etapa 9** (~30min): Auto-revisão de CR: confirmar que a whitelist foi completamente removida, sem chamadas remanescentes

---

## 13. Checklist de Aceitação

- [ ] Compilação TypeScript sem erros (`npm run typecheck`)
- [ ] `npm run lint` sem novos erros de lint
- [ ] Todos os testes existentes passam (`cd packages/cli && npx vitest run`)
- [ ] Novos testes em `commandUtils.test.ts` passam integralmente
- [ ] `getEffectiveSupportedModes` cobre todos os 7 casos
- [ ] `filterCommandsForMode` cobre os três modos: interactive / non_interactive / acp
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` não possui nenhuma referência em toda a base de código (verificar com `grep`)
- [ ] Função `filterCommandsForNonInteractive` não possui nenhuma referência em toda a base de código
- [ ] Todos os comandos built-in possuem o campo `commandType`
- [ ] Comandos gerados por todos os Loaders possuem os campos `source` e `sourceLabel`
- [ ] Comandos gerados por `BundledSkillLoader` / `FileCommandLoader` (comandos de usuário) / `McpPromptLoader` possuem `modelInvocable: true`
- [ ] Comandos gerados por `BuiltinCommandLoader` possuem `modelInvocable: false`
- [ ] `CommandService.getCommandsForMode('non_interactive')` retorna o conjunto de comandos equivalente ao anterior à refatoração
- [ ] Comandos MCP prompt não são mais interceptados incorretamente no modo `non-interactive`