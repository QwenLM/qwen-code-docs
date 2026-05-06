# Техническое описание Phase 1: Реконструкция инфраструктуры

## 1. Цели и ограничения дизайна

### 1.1 Цели

- Создать единую модель метаданных команд, охватывающую четыре измерения: источник (source), тип выполнения (commandType), возможности режимов (supportedModes), видимость (userInvocable / modelInvocable)
- Заменить жестко заданные белые списки в non-interactive/acp на фильтрацию на основе возможностей (capability-based)
- Предоставить стабильный низкоуровневый интерфейс для расширения возможностей в Phase 2/3

### 1.2 Жесткие ограничения

- **Нулевое изменение поведения**: набор доступных команд в режимах non-interactive и acp остается неизменным (исключение: исправление ошибочного перехвата MCP_PROMPT, относится к bug fix)
- **Обратная совместимость**: новые поля в интерфейсе `SlashCommand` полностью опциональны или имеют разумные значения по умолчанию, существующий код команд не требует немедленных изменений
- **Без новых исполнителей**: не создавать новую архитектуру исполнителей (ModeAdapter / CommandExecutor и т.д.), только расширить существующие `CommandService` и логику фильтрации
- **Без изменения существующих возможностей команд**: не добавлять локальные подкоманды (local subcommands) для каких-либо команд, не изменять реализации `action` существующих команд

---

## 2. Новые определения типов

### 2.1 Расположение файлов

Все новые определения типов находятся в `packages/cli/src/ui/commands/types.ts`, в том же файле, что и существующий интерфейс `SlashCommand`.

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

### 2.5 Расширение интерфейса `SlashCommand`

В существующий интерфейс добавляются новые поля, **все опциональны** для обеспечения обратной совместимости:

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

## 3. Правила заполнения полей для каждого Loader

### 3.1 Принципы заполнения

- `source` и `sourceLabel` заполняются Loader при создании `SlashCommand`, сами команды их не объявляют
- `commandType`: Loader заполняет значение по умолчанию; built-in команды объявляют его в своих файлах
- `supportedModes`: выводится через `getEffectiveSupportedModes()`, явное заполнение не требуется (если только не нужно переопределить значение по умолчанию)
- `modelInvocable`: заполняется Loader, для built-in команд всегда `false`, для команд типа prompt — `true`

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

> **Примечание**: команды плагинов (`plugin-command`) временно не помечаются как `modelInvocable` во избежание проблем с безопасностью. В следующих фазах их можно будет открывать по мере необходимости, управляя через конфигурацию пользователя.

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

## 4. Правила объявления `commandType` для built-in команд

### 4.1 Критерии классификации

| commandType | Критерий                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | `action` использует только `ui.addItem` (текстовые типы), возвращает `message` / `stream_messages` / `submit_prompt` / `tool`, не зависит от рендеринга React-компонентов                                               |
| `local-jsx` | `action` возвращает `dialog`, или при вызове `ui.addItem` передаются сложные типы с JSX (например, `HistoryItemHelp`, `HistoryItemStats`), или зависит от `confirm_action` / `load_history` / `quit` |

> **Важно**: `ui.addItem(message/error/info типы)` относится к `local`; `ui.addItem(help/stats/tools/about и другие сложные UI типы)` относится к `local-jsx`.

### 4.2 Таблица классификации built-in команд

**Категория `local`** (объявляется `commandType: 'local'`, `supportedModes` выводится как all modes):

| Файл команды             | Имя команды     | Описание                                                    |
| -------------------- | ---------- | ------------------------------------------------------- |
| `btwCommand.ts`      | `btw`      | Возвращает `submit_prompt` или `stream_messages`               |
| `bugCommand.ts`      | `bug`      | Возвращает `submit_prompt` или `stream_messages`               |
| `compressCommand.ts` | `compress` | Уже адаптирован под executionMode, возвращает `message`/`submit_prompt` |
| `contextCommand.ts`  | `context`  | Возвращает `message` (содержит UI-рендеринг, но заменяем текстом)                |
| `exportCommand.ts`   | `export`   | Файловый I/O, возвращает `message`                                |
| `initCommand.ts`     | `init`     | Возвращает `submit_prompt`/`message`/`confirm_action`         |
| `memoryCommand.ts`   | `memory`   | Подкоманды возвращают `message` (файловый I/O)                        |
| `planCommand.ts`     | `plan`     | Возвращает `submit_prompt`                                    |
| `summaryCommand.ts`  | `summary`  | Уже адаптирован под executionMode, возвращает `submit_prompt`/`message` |
| `insightCommand.ts`  | `insight`  | Возвращает `stream_messages`                                  |

> **Важно**: `contextCommand` и `insightCommand`, хотя сейчас возвращают вызов `addItem`, по сути являются текстовым контентом и относятся к `local`.

**Категория `local-jsx`** (объявляется `commandType: 'local-jsx'`, `supportedModes` выводится как `['interactive']`):

| Файл команды                  | Имя команды           | Причина невозможности работы в headless                       |
| ------------------------- | ---------------- | ------------------------------------------ |
| `aboutCommand.ts`         | `about`          | `addItem(HistoryItemAbout)` — сложный UI-компонент |
| `agentsCommand.ts`        | `agents`         | `dialog: subagent_create/subagent_list`    |
| `approvalModeCommand.ts`  | `approval-mode`  | `dialog: approval-mode`                    |
| `arenaCommand.ts`         | `arena`          | `dialog: arena_*`                          |
| `authCommand.ts`          | `auth`           | `dialog: auth`                             |
| `clearCommand.ts`         | `clear`          | `ui.clear()` напрямую управляет терминалом                  |
| `copyCommand.ts`          | `copy`           | Операции с буфером обмена, нет headless-пути               |
| `directoryCommand.tsx`    | `directory`      | JSX-компонент                                   |
| `docsCommand.ts`          | `docs`           | Открывает браузер                                 |
| `editorCommand.ts`        | `editor`         | `dialog: editor`                           |
| `extensionsCommand.ts`    | `extensions`     | `dialog: extensions_manage`                |
| `helpCommand.ts`          | `help`           | `addItem(HistoryItemHelp)` — сложный Help UI  |
| `hooksCommand.ts`         | `hooks`          | `dialog: hooks`                            |
| `ideCommand.ts`           | `ide`            | Проверка и взаимодействие с процессом IDE                         |
| `languageCommand.ts`      | `language`       | `dialog` + `reloadCommands`                |
| `mcpCommand.ts`           | `mcp`            | `dialog: mcp`                              |
| `modelCommand.ts`         | `model`          | `dialog: model/fast-model`                 |
| `permissionsCommand.ts`   | `permissions`    | `dialog: permissions`                      |
| `quitCommand.ts`          | `quit`           | Тип результата `quit`                         |
| `restoreCommand.ts`       | `restore`        | Тип результата `load_history`                 |
| `resumeCommand.ts`        | `resume`         | `dialog: resume`                           |
| `settingsCommand.ts`      | `settings`       | `dialog: settings`                         |
| `setupGithubCommand.ts`   | `setup-github`   | `confirm_shell_commands` + интерактивные операции      |
| `skillsCommand.ts`        | `skills`         | `addItem(HistoryItemSkillsList)` — сложный UI |
| `statsCommand.ts`         | `stats`          | `addItem(HistoryItemStats)` — сложный UI      |
| `statuslineCommand.ts`    | `statusline`     | Настройка UI-статуса                                |
| `terminalSetupCommand.ts` | `terminal-setup` | Мастер настройки терминала                               |
| `themeCommand.ts`         | `theme`          | `dialog: theme`                            |
| `toolsCommand.ts`         | `tools`          | `addItem(HistoryItemTools)` — сложный UI      |
| `trustCommand.ts`         | `trust`          | `dialog: trust`                            |
| `vimCommand.ts`           | `vim`            | `toggleVimEnabled()` — состояние UI             |

---

## 5. Правила вывода `getEffectiveSupportedModes`

Эта функция является ключевой логикой Phase 1, заменяет исходный белый список и будет вызываться из `filterCommandsForMode`.

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

## 6. Расширение интерфейса `CommandService`

В `packages/cli/src/services/CommandService.ts` добавляются два новых метода:

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

> **Важно**: `getEffectiveSupportedModes` и `filterCommandsForMode` должны использоваться как внутренние утилиты `CommandService` или быть вынесены в отдельный файл `packages/cli/src/services/commandUtils.ts` и экспортированы для удобства тестирования и повторного использования.

---

## 7. Рефакторинг `nonInteractiveCliCommands.ts`

### 7.1 Удаляемый код

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

### 7.2 Добавляемый код

```typescript
// ✅ 新增（或从 commandUtils 导入）
import { filterCommandsForMode } from '../services/commandUtils.js';
```

### 7.3 Изменение сигнатуры функции `handleSlashCommand`

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

### 7.4 Изменения во внутренней реализации

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

### 7.5 Изменение сигнатуры функции `getAvailableCommands`

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

> Новый параметр `mode` заменяет старый параметр белого списка. При вызове из ACP Session можно явно указать `'acp'`, при non-interactive вызове — `'non_interactive'`.

---

## 8. Изменения вызовов в `Session.ts` (ACP)

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

## 9. Обзор изменений файлов

### 9.1 Измененные файлы

| Файл                                                                    | Изменения                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/cli/src/ui/commands/types.ts`                                 | Добавлены типы `ExecutionMode`, `CommandSource`, `CommandType`; расширен интерфейс `SlashCommand`              |
| `packages/cli/src/services/CommandService.ts`                           | Добавлены методы `getCommandsForMode()`, `getModelInvocableCommands()`                                  |
| `packages/cli/src/nonInteractiveCliCommands.ts`                         | Удалены константы белого списка и старая функция фильтрации; обновлены сигнатуры двух экспортируемых функций; добавлен импорт `filterCommandsForMode`                 |
| `packages/cli/src/acp-integration/session/Session.ts`                   | Обновлены вызовы `handleSlashCommand` и `getAvailableCommands`                                         |
| `packages/cli/src/services/BuiltinCommandLoader.ts`                     | При создании команд внедряются `source: 'builtin-command'`, `sourceLabel: 'Built-in'`, `modelInvocable: false` |
| `packages/cli/src/services/BundledSkillLoader.ts`                       | Внедряются `source: 'bundled-skill'`, `commandType: 'prompt'`, `modelInvocable: true`                  |
| `packages/cli/src/services/FileCommandLoader.ts` / `command-factory.ts` | Внедряются `source`, `commandType: 'prompt'`, `modelInvocable` (в зависимости от extensionName)                   |
| `packages/cli/src/services/McpPromptLoader.ts`                          | Внедряются `source: 'mcp-prompt'`, `commandType: 'prompt'`, `modelInvocable: true`                     |
| **Файлы built-in команд (10 local + 27 local-jsx)**               | Объявляется `commandType: 'local'` или `commandType: 'local-jsx'`                                        |

### 9.2 Новые файлы

| Файл                                        | Содержание                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/cli/src/services/commandUtils.ts` | Утилиты `getEffectiveSupportedModes()`, `filterCommandsForMode()` и их экспорт |

### 9.3 Неизмененные файлы

- `packages/cli/src/utils/commands.ts` (`parseSlashCommand` не требует изменений)
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts` (interactive-путь не требует изменений)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (stub UI не требует изменений)
- Реализации `action` всех команд (Phase 1 не изменяет поведение команд)

---

## 10. Анализ влияния на поведение

### 10.1 Сводка изменений

| Сценарий                                 | Старое поведение                       | Новое поведение                                                   | Характер        |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------- | ----------- |
| Выполнение `/init` в non-interactive       | ✅ Разрешено (белый список)            | ✅ Разрешено (`commandType: local`)                          | Без изменений      |
| Выполнение `/summary` в non-interactive    | ✅ Разрешено                      | ✅ Разрешено                                                  | Без изменений      |
| Выполнение `/compress` в non-interactive   | ✅ Разрешено                      | ✅ Разрешено                                                  | Без изменений      |
| Выполнение `/btw` в non-interactive        | ✅ Разрешено                      | ✅ Разрешено                                                  | Без изменений      |
| Выполнение `/bug` в non-interactive        | ✅ Разрешено                      | ✅ Разрешено                                                  | Без изменений      |
| Выполнение `/context` в non-interactive    | ✅ Разрешено                      | ✅ Разрешено                                                  | Без изменений      |
| Выполнение `/model` в non-interactive      | ❌ unsupported               | ❌ unsupported (`commandType: local-jsx`)               | Без изменений      |
| Выполнение file command в non-interactive  | ✅ Разрешено (CommandKind.FILE)  | ✅ Разрешено (`commandType: prompt`)                         | Без изменений      |
| Выполнение bundled skill в non-interactive | ✅ Разрешено (CommandKind.SKILL) | ✅ Разрешено (`commandType: prompt`)                         | Без изменений      |
| Выполнение MCP prompt в non-interactive    | ❌ Блокируется по CommandKind       | ✅ Разрешено (`commandType: prompt`)                         | **Bug fix** |
| Выполнение `/export` в non-interactive     | ❌ Не в белом списке                | ❌ Запрещено (`commandType: local`, по умолчанию interactive only) | Без изменений      |
| Выполнение `/memory` в non-interactive     | ❌ Не в белом списке                | ❌ Запрещено (`commandType: local`, по умолчанию interactive only) | Без изменений      |
| Выполнение `/plan` в non-interactive       | ❌ Не в белом списке                | ❌ Запрещено (`commandType: local`, по умолчанию interactive only) | Без изменений      |

> **О консервативной стратегии по умолчанию для команд `local`**: значение `supportedModes` по умолчанию для `commandType: 'local'` равно `['interactive']`, что соответствует дизайну Claude Code — команды типа `local` требуют явного объявления `supportsNonInteractive: true` для работы в неинтерактивном режиме. В Phase 1 шесть команд из белого списка (`init`, `summary`, `compress`, `btw`, `bug`, `context`) эквивалентно заменяют эффект старого белого списка за счет явного объявления `supportedModes: ['interactive', 'non_interactive', 'acp']`. Команды, которые необходимо расширить в Phase 2 (например, `/export`, `/memory`, `/plan`), будут разблокированы по одной после проверки их реализации `action` на совместимость с headless-режимом.

---

## 10.2 Команды с различиями по режимам в Phase 2: паттерн двойной регистрации

Для команд в Phase 2, которым требуется "UI в интерактивном режиме, текстовый вывод в неинтерактивном" (например, `/model`), следует использовать **паттерн двойной регистрации**, а не ветвление внутри `action` одной команды.

Это стандартный паттерн Claude Code, на примере `/context` (см. `src/commands/context/index.ts`): два объекта `Command` с одинаковым именем, один `local-jsx` только для interactive, другой `local` только для non-interactive, взаимно исключающие через `isEnabled()`.

Qwen Code в Phase 2 должен использовать эквивалентный подход, заменяя `isEnabled()` на `supportedModes` для взаимного исключения:

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

Два объекта с одинаковым именем, `supportedModes` взаимно исключают друг друга, `filterCommandsForMode` автоматически выбирает правильную версию. По сравнению с взаимным исключением через `isEnabled()` в Claude Code, фильтрация через `supportedModes` более явная, проще тестируется и не требует проверки среды выполнения.

**Phase 1 не реализует никаких команд с двойной регистрацией**, этот паттерн указан здесь только как спецификация для Phase 2.

---

## 11. Стратегия тестирования

### 11.1 Тесты новых утилит

В `packages/cli/src/services/commandUtils.test.ts` (новый файл):

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

### 11.2 Обновление `nonInteractiveCliCommands.test.ts`

- Удалить все ссылки на `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Удалить тест-кейсы для параметра `allowedBuiltinCommandNames`
- Добавить: проверку прохождения команд `commandType: local` через фильтр в non-interactive
- Добавить: проверку фильтрации команд `commandType: local-jsx` в non-interactive
- Сохранить: проверку прохождения file command / skill command через фильтр в non-interactive

### 11.3 Обновление `CommandService.test.ts`

- Добавить тест-кейсы для `getCommandsForMode`
- Добавить тест-кейсы для `getModelInvocableCommands`

### 11.4 Тесты для каждого Loader

- `BuiltinCommandLoader.test.ts`: проверка наличия `source: 'builtin-command'` у всех команд
- `BundledSkillLoader.test.ts`: проверка `source: 'bundled-skill'` и `modelInvocable: true`
- `FileCommandLoader.test.ts`: проверка `source: 'skill-dir-command'` для пользовательских команд, `source: 'plugin-command'` для команд плагинов
- `McpPromptLoader.test.ts`: проверка `source: 'mcp-prompt'` и `modelInvocable: true`

---

## 12. Порядок реализации

Рекомендуется реализовывать в следующем порядке, каждый шаг можно коммитить и ревьюить отдельно:

**Шаг 1** (~30 мин): Изменить `types.ts`, добавить `ExecutionMode`, `CommandSource`, `CommandType` и новые поля `SlashCommand`
→ Только изменения типов, проверка компиляции TypeScript

**Шаг 2** (~1 ч): Создать `commandUtils.ts`, реализовать `getEffectiveSupportedModes` и `filterCommandsForMode`, параллельно создать `commandUtils.test.ts`
→ Юнит-тесты покрывают основную логику

**Шаг 3** (~1 ч): Рефакторинг `nonInteractiveCliCommands.ts`, удалить белый список, внедрить `filterCommandsForMode`, обновить сигнатуры функций
→ Эквивалентность поведения (консервативная стратегия Phase 1: для команд local явно указать `supportedModes: ['interactive']`)

**Шаг 4** (~30 мин): Обновить `CommandService.ts`, добавить два метода

**Шаг 5** (~2 ч): Добавить объявление `commandType` во все файлы built-in команд
→ Пошаговая проверка корректности классификации

**Шаг 6** (~1,5 ч): Обновить все Loader, внедрить `source`, `sourceLabel`, `commandType`, `modelInvocable`

**Шаг 7** (~30 мин): Обновить сигнатуры вызовов в `Session.ts`

**Шаг 8** (~1 ч): Запустить все тесты, исправить упавшие, обновить снапшоты

**Шаг 9** (~30 мин): Самопроверка CR: убедиться, что белый список полностью удален, нет забытых вызовов

---

## 13. Чек-лист приемки

- [ ] Ошибок компиляции TypeScript нет (`npm run typecheck`)
- [ ] `npm run lint` не выдает новых lint-ошибок
- [ ] Все существующие тесты проходят (`cd packages/cli && npx vitest run`)
- [ ] Все новые тесты в `commandUtils.test.ts` проходят
- [ ] `getEffectiveSupportedModes` покрывает все 7 кейсов
- [ ] `filterCommandsForMode` покрывает три режима: interactive / non_interactive / acp
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` нигде не используется в кодовой базе (проверка через `grep`)
- [ ] Функция `filterCommandsForNonInteractive` нигде не используется в кодовой базе
- [ ] У всех built-in команд есть поле `commandType`
- [ ] У команд, выводимых всеми Loader, есть поля `source` и `sourceLabel`
- [ ] У команд, выводимых `BundledSkillLoader` / `FileCommandLoader` (пользовательские команды) / `McpPromptLoader`, установлено `modelInvocable: true`
- [ ] У команд, выводимых `BuiltinCommandLoader`, установлено `modelInvocable: false`
- [ ] `CommandService.getCommandsForMode('non_interactive')` возвращает набор команд, эквивалентный состоянию до рефакторинга
- [ ] Команды MCP prompt больше не ошибочно блокируются в режиме non-interactive