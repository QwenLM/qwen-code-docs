# Документ технического дизайна фазы 1: Рефакторинг инфраструктуры

## 1. Цели и ограничения дизайна

### 1.1 Цели

- Создать единую модель метаданных команд, охватывающую четыре измерения: источник (source), тип выполнения (commandType), поддерживаемые режимы (supportedModes), видимость (userInvocable / modelInvocable)
- Заменить жестко закодированные белые списки в non-interactive/acp на фильтрацию на основе возможностей (capability-based)
- Обеспечить стабильный базовый интерфейс для расширения возможностей в фазах 2/3

### 1.2 Жесткие ограничения

- **Нулевое изменение поведения**: набор доступных команд в режимах non-interactive и acp остается неизменным (исключение: исправление ошибки, когда MCP_PROMPT ошибочно блокировался — это баг-фикс)
- **Обратная совместимость**: все новые поля интерфейса `SlashCommand` являются опциональными или имеют разумные значения по умолчанию, существующий код команд не требует немедленных изменений
- **Без создания новых исполнителей**: не создавать новые архитектуры выполнения, такие как ModeAdapter / CommandExecutor, только расширять существующую логику CommandService и фильтрации
- **Без изменения существующих возможностей команд**: не добавлять подкоманды `local` ни для одной команды, не изменять реализацию action ни одной команды

---

## 2. Новые определения типов

### 2.1 Расположение файлов

Все новые определения типов находятся в файле `packages/cli/src/ui/commands/types.ts`, вместе с существующим интерфейсом `SlashCommand`.

### 2.2 `ExecutionMode`

```typescript
/**
 * Перечисление режимов выполнения.
 * - interactive: React/Ink UI режим (терминальное взаимодействие)
 * - non_interactive: неинтерактивный CLI режим (текстовый/JSON вывод)
 * - acp: ACP/Zed режим интеграции
 */
export type ExecutionMode = 'interactive' | 'non_interactive' | 'acp';
```

### 2.3 `CommandSource`

```typescript
/**
 * Перечисление источников команд, используется для группировки в Help, значков автодополнения,
 * доступных команд ACP.
 *
 * Отличие от CommandKind:
 * - CommandKind — это внутренняя классификация загрузчиков (4 типа), влияющая на логику загрузки
 * - CommandSource — это ориентированная на пользователя классификация источника (9 типов),
 *   влияющая на отображение и ментальную модель
 *
 * Между ними возможно пересечение, но обязанности разные, не объединять.
 */
export type CommandSource =
  | 'builtin-command' // Встроенная команда (BuiltinCommandLoader)
  | 'bundled-skill' // Навык, распространяемый с пакетом (BundledSkillLoader)
  | 'skill-dir-command' // Команда из пользовательской/проектной директории .qwen/commands/ (FileCommandLoader, не плагин)
  | 'plugin-command' // Команда, предоставленная плагином (FileCommandLoader, extensionName не пуст)
  | 'mcp-prompt'; // Prompt, предоставленный MCP сервером (McpPromptLoader)
// Следующие источники зарезервированы, в фазе 1 не реализуются соответствующие Loader, но схема определена заранее:
// | 'workflow-command'
// | 'plugin-skill'
// | 'dynamic-skill'
// | 'builtin-plugin-skill'
// | 'mcp-skill'
```

### 2.4 `CommandType`

```typescript
/**
 * Тип выполнения команды, описывает "как выполняется" команда.
 *
 * - prompt: генерирует submit_prompt, отправляет содержимое модели. Подходит для навыков, файловых команд, MCP prompt.
 *   По умолчанию supportedModes — все режимы, modelInvocable по умолчанию true.
 *
 * - local: выполняет логику локально, не зависит от React/Ink UI. Может возвращать message, stream_messages,
 *   submit_prompt, tool и другие типы. Подходит для встроенных команд запроса, конфигурации, состояния.
 *   По умолчанию supportedModes — ['interactive'], необходимо явно объявить supportedModes,
 *   чтобы открыть для других режимов.
 *   Это согласуется с семантикой supportsNonInteractive: true в Claude Code —
 *   поддержка неинтерактивного режима требует явного объявления, а не автоматического вывода.
 *
 * - local-jsx: команды, зависящие от React/Ink UI (открытие диалогов, рендеринг JSX компонентов и т.д.).
 *   По умолчанию supportedModes только ['interactive'].
 */
export type CommandType = 'prompt' | 'local' | 'local-jsx';
```

### 2.5 Расширение интерфейса `SlashCommand`

В существующий интерфейс добавляются новые поля, **все опциональные** для обеспечения обратной совместимости:

```typescript
export interface SlashCommand {
  // ── Существующие поля (остаются без изменений) ──────────────────────────────
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

  // ── Новое в фазе 1: источник и тип выполнения ─────────────────────────────
  /**
   * Источник команды, используется для группировки в Help, значков автодополнения,
   * отображения доступных команд ACP.
   * Заполняется каждым Loader, не объявляется самой командой.
   * В будущем, при отказе от CommandKind, source станет единственным идентификатором источника.
   */
  source?: CommandSource;

  /**
   * Метка источника для отображения, ориентированная на пользователя.
   * - builtin-command → "Built-in"
   * - bundled-skill → "Skill"
   * - skill-dir-command → "Custom"
   * - plugin-command → "Plugin: <extensionName>"
   * - mcp-prompt → "MCP: <serverName>"
   * Заполняется каждым Loader, может быть переопределено самой командой.
   */
  sourceLabel?: string;

  /**
   * Тип выполнения команды.
   * - Заполняется каждым Loader значением по умолчанию (prompt/local-jsx)
   * - Встроенные команды объявляются в каждом файле команды (local или local-jsx)
   * Стратегия по умолчанию при отсутствии объявления описана в getEffectiveCommandType().
   */
  commandType?: CommandType;

  // ── Новое в фазе 1: поддержка режимов ──────────────────────────────────────
  /**
   * В каких режимах выполнения доступна эта команда.
   * При отсутствии объявления выводится по commandType (см. getEffectiveSupportedModes()).
   * Явное объявление имеет приоритет над выводом.
   */
  supportedModes?: ExecutionMode[];

  // ── Новое в фазе 1: видимость ──────────────────────────────────────────────
  /**
   * Может ли пользователь вызвать эту команду через slash command.
   * По умолчанию true (почти все команды userInvocable).
   */
  userInvocable?: boolean;

  /**
   * Может ли модель вызвать эту команду через tool call.
   * По умолчанию false. Команды типа prompt (навыки, файловые команды, MCP prompt) должны быть true.
   * Встроенные команды не разрешают вызов модели (всегда false).
   */
  modelInvocable?: boolean;

  // ── Зарезервировано для фазы 3: метаданные опыта (в фазе 1 только определение, не используется) ───
  /**
   * Подсказка по аргументам, отображается после имени команды в меню автодополнения.
   * Пример: "<model-id>" / "show|list|set <id>" / "[--fast] [<model-id>]"
   */
  argumentHint?: string;

  /**
   * Пояснение для модели, когда вызывать эту команду.
   * Будет внедрено в description команд с modelInvocable.
   */
  whenToUse?: string;

  /**
   * Примеры использования, для отображения в Help и автодополнении.
   */
  examples?: string[];
}
```

---

## 3. Спецификация заполнения полей загрузчиками (Loader)

### 3.1 Принципы заполнения

- `source` и `sourceLabel` заполняются Loader при построении `SlashCommand`, команда сама их не объявляет
- `commandType`: Loader заполняет значения по умолчанию; встроенные команды объявляют в своих файлах
- `supportedModes`: вычисляется через `getEffectiveSupportedModes()`, явное заполнение не требуется (если не нужно переопределить значение по умолчанию)
- `modelInvocable`: заполняется Loader, для встроенных команд всегда `false`, для команд типа prompt — `true`

### 3.2 `BuiltinCommandLoader`

```typescript
// Не заполняет source/sourceLabel/commandType — объявляются в самих файлах команд
// Потому что commandType встроенных команд — local или local-jsx, требуется маркировка каждой

// Внедрение source и sourceLabel:
for (const cmd of rawCommands) {
  enrichedCommands.push({
    ...cmd,
    source: 'builtin-command',
    sourceLabel: 'Built-in',
    userInvocable: cmd.userInvocable ?? true,
    modelInvocable: false, // встроенные команды не разрешают вызов модели
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
// В createSlashCommandFromDefinition:
return {
  name: baseCommandName,
  description,
  kind: CommandKind.FILE,
  extensionName,
  // source определяется по extensionName:
  source: extensionName ? 'plugin-command' : 'skill-dir-command',
  sourceLabel: extensionName ? `Plugin: ${extensionName}` : 'Custom',
  commandType: 'prompt',
  userInvocable: true,
  modelInvocable: !extensionName, // команды плагинов пока не разрешают вызов модели, пользовательские/проектные — разрешают
  action: async (...) => { ... },
};
```

> **Примечание**: команды плагинов (plugin-command) пока не помечаются как `modelInvocable`, чтобы избежать угроз безопасности. В следующих фазах можно будет открыть по требованию, с управлением через конфигурацию пользователя.

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
  // ... остальные существующие поля
};
```

---

## 4. Спецификация объявления `commandType` для встроенных команд

### 4.1 Критерии классификации

| commandType | Критерии                                                                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | action использует только `ui.addItem` (текстовые типы), возвращает `message` / `stream_messages` / `submit_prompt` / `tool`, не зависит от рендеринга React-компонентов                              |
| `local-jsx` | action возвращает `dialog`, или в action при вызове `ui.addItem` передаются сложные типы, содержащие JSX (например, `HistoryItemHelp`, `HistoryItemStats`), или используется `confirm_action` / `load_history` / `quit` |

> **Внимание**: `ui.addItem(тип message/error/info)` — это `local`; `ui.addItem(сложные типы UI, такие как help/stats/tools/about)` — это `local-jsx`.

### 4.2 Таблица классификации встроенных команд

**Класс `local`** (объявляют `commandType: 'local'`, `supportedModes` вычисляется как все режимы):

| Файл команды            | Имя команды | Описание                                                   |
| ----------------------- | ----------- | ---------------------------------------------------------- |
| `btwCommand.ts`         | `btw`       | Возвращает `submit_prompt` или `stream_messages`           |
| `bugCommand.ts`         | `bug`       | Возвращает `submit_prompt` или `stream_messages`           |
| `compressCommand.ts`    | `compress`  | Уже адаптировано для executionMode, возвращает `message`/`submit_prompt` |
| `contextCommand.ts`     | `context`   | Возвращает `message` (содержит рендеринг UI, но текст заменяем)        |
| `exportCommand.ts`      | `export`    | Файловый ввод/вывод, возвращает `message`                              |
| `initCommand.ts`        | `init`      | Возвращает `submit_prompt`/`message`/`confirm_action`                  |
| `memoryCommand.ts`      | `memory`    | Подкоманды возвращают `message` (файловый ввод/вывод)                  |
| `planCommand.ts`        | `plan`      | Возвращает `submit_prompt`                                              |
| `summaryCommand.ts`     | `summary`   | Уже адаптировано для executionMode, возвращает `submit_prompt`/`message`|
| `insightCommand.ts`     | `insight`   | Возвращает `stream_messages`                                             |

> **Внимание**: `contextCommand` и `insightCommand`, хотя в настоящее время возвращают вызовы `addItem`, по своей сути являются текстовым содержимым и относятся к `local`.

**Класс `local-jsx`** (объявляют `commandType: 'local-jsx'`, `supportedModes` вычисляется как `['interactive']`):

| Файл команды                 | Имя команды      | Причина невозможности headless режима                       |
| ---------------------------- | ---------------- | ----------------------------------------------------------- |
| `aboutCommand.ts`            | `about`          | `addItem(HistoryItemAbout)` — сложный UI компонент          |
| `agentsCommand.ts`           | `agents`         | `dialog: subagent_create/subagent_list`                     |
| `approvalModeCommand.ts`     | `approval-mode`  | `dialog: approval-mode`                                     |
| `arenaCommand.ts`            | `arena`          | `dialog: arena_*`                                           |
| `authCommand.ts`             | `auth`           | `dialog: auth`                                              |
| `clearCommand.ts`            | `clear`          | `ui.clear()` напрямую управляет терминалом                  |
| `copyCommand.ts`             | `copy`           | Операция с буфером обмена, нет headless пути                |
| `directoryCommand.tsx`       | `directory`      | JSX компоненты                                              |
| `docsCommand.ts`             | `docs`           | Открытие браузера                                           |
| `editorCommand.ts`           | `editor`         | `dialog: editor`                                            |
| `extensionsCommand.ts`       | `extensions`     | `dialog: extensions_manage`                                 |
| `helpCommand.ts`             | `help`           | `addItem(HistoryItemHelp)` — сложный UI Help                |
| `hooksCommand.ts`            | `hooks`          | `dialog: hooks`                                             |
| `ideCommand.ts`              | `ide`            | Обнаружение и взаимодействие с IDE процессом                |
| `languageCommand.ts`         | `language`       | `dialog` + `reloadCommands`                                 |
| `mcpCommand.ts`              | `mcp`            | `dialog: mcp`                                               |
| `modelCommand.ts`            | `model`          | `dialog: model/fast-model`                                  |
| `permissionsCommand.ts`      | `permissions`    | `dialog: permissions`                                       |
| `quitCommand.ts`             | `quit`           | Тип результата `quit`                                       |
| `restoreCommand.ts`          | `restore`        | Тип результата `load_history`                               |
| `resumeCommand.ts`           | `resume`         | `dialog: resume`                                            |
| `settingsCommand.ts`         | `settings`       | `dialog: settings`                                          |
| `setupGithubCommand.ts`      | `setup-github`   | `confirm_shell_commands` + интерактивные операции           |
| `skillsCommand.ts`           | `skills`         | `addItem(HistoryItemSkillsList)` — сложный UI               |
| `statsCommand.ts`            | `stats`          | `addItem(HistoryItemStats)` — сложный UI                    |
| `statuslineCommand.ts`       | `statusline`     | Конфигурация состояния UI                                   |
| `terminalSetupCommand.ts`    | `terminal-setup` | Мастер настройки терминала                                  |
| `themeCommand.ts`            | `theme`          | `dialog: theme`                                             |
| `toolsCommand.ts`            | `tools`          | `addItem(HistoryItemTools)` — сложный UI                    |
| `trustCommand.ts`            | `trust`          | `dialog: trust`                                             |
| `vimCommand.ts`              | `vim`            | `toggleVimEnabled()` — состояние UI                         |

---

## 5. Правила вывода `getEffectiveSupportedModes`

Эта функция является основной логикой фазы 1, заменяет существующий белый список и будет вызываться из `filterCommandsForMode`.

```typescript
/**
 * Возвращает фактический список поддерживаемых режимов для команды.
 *
 * Приоритет вывода (от высокого к низкому):
 * 1. Явно объявленное supportedModes (наивысший приоритет)
 * 2. Вывод на основе commandType
 * 3. Запасной вариант на основе CommandKind (обратная совместимость)
 */
export function getEffectiveSupportedModes(cmd: SlashCommand): ExecutionMode[] {
  // Приоритет 1: явное объявление
  if (cmd.supportedModes !== undefined) {
    return cmd.supportedModes;
  }

  // Приоритет 2: вывод на основе commandType
  if (cmd.commandType !== undefined) {
    switch (cmd.commandType) {
      case 'prompt':
        // Тип prompt не имеет зависимости от UI, доступен во всех режимах по умолчанию
        return ['interactive', 'non_interactive', 'acp'];
      case 'local':
        // Тип local по умолчанию консервативно: только interactive.
        // Команды, требующие неинтерактивной поддержки, должны явно объявить supportedModes
        // (соответствует supportsNonInteractive: true в Claude Code).
        // В фазе 2 каждая команда будет проверена и разблокирована,
        // чтобы предотвратить случайное раскрытие неадаптированных команд headless-вызывающим.
        return ['interactive'];
      case 'local-jsx':
        return ['interactive'];
    }
  }

  // Приоритет 3: запасной вариант (на основе CommandKind, для обратной совместимости со старым кодом)
  switch (cmd.kind) {
    case CommandKind.BUILT_IN:
      // Встроенная команда без объявленного commandType консервативно только interactive.
      // После завершения фазы 1 эта ветка не должна достигаться (все встроенные команды будут иметь commandType)
      return ['interactive'];
    case CommandKind.FILE:
    case CommandKind.SKILL:
    case CommandKind.MCP_PROMPT:
      // У этих трёх типов команд action по своей природе не зависит от UI,
      // исторически они были доступны во всех режимах
      return ['interactive', 'non_interactive', 'acp'];
    default:
      return ['interactive'];
  }
}
```

```typescript
/**
 * Фильтрует команды по supportedModes для текущего режима.
 * Заменяет исходную функцию filterCommandsForNonInteractive.
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

В файл `packages/cli/src/services/CommandService.ts` добавляются два новых метода:

```typescript
export class CommandService {
  // ── Существующие методы (остаются без изменений) ────────────────────────────────
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  // ── Новые методы фазы 1 ────────────────────────────────────────────────────────

  /**
   * Возвращает список команд, доступных в указанном режиме выполнения.
   * Заменяет комбинацию старого белого списка + filterCommandsForNonInteractive.
   *
   * @param mode Целевой режим выполнения
   * @returns Список команд, подходящих для этого режима (без скрытых команд)
   */
  getCommandsForMode(mode: ExecutionMode): readonly SlashCommand[] {
    return this.commands.filter((cmd) => {
      if (cmd.hidden) return false;
      return getEffectiveSupportedModes(cmd).includes(mode);
    });
  }

  /**
   * Возвращает все команды, у которых modelInvocable равен true.
   * В фазе 2 SkillTool будет использовать этот метод; в фазе 1 только предоставляется интерфейс.
   *
   * @returns Список команд, которые может вызывать модель
   */
  getModelInvocableCommands(): readonly SlashCommand[] {
    return this.commands.filter(
      (cmd) => !cmd.hidden && cmd.modelInvocable === true,
    );
  }
}
```

> **Примечание**: `getEffectiveSupportedModes` и `filterCommandsForMode` должны быть служебными функциями, используемыми внутри `CommandService`, или вынесены в отдельный файл `packages/cli/src/services/commandUtils.ts` и экспортированы для тестирования и повторного использования.

---

## 7. Рефакторинг `nonInteractiveCliCommands.ts`

### 7.1 Удаляемое содержимое

```typescript
// ❌ Удалить
export const ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE = [
  'init', 'summary', 'compress', 'btw', 'bug', 'context',
] as const;

// ❌ Удалить
function filterCommandsForNonInteractive(
  commands: readonly SlashCommand[],
  allowedBuiltinCommandNames: Set<string>,
): SlashCommand[] { ... }
```

### 7.2 Добавляемое содержимое

```typescript
// ✅ Добавить (или импортировать из commandUtils)
import { filterCommandsForMode } from '../services/commandUtils.js';
```

### 7.3 Изменение сигнатуры функции `handleSlashCommand`

```typescript
// ❌ Старая сигнатура
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<NonInteractiveSlashCommandResult>

// ✅ Новая сигнатура (удалён параметр allowedBuiltinCommandNames)
export const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
): Promise<NonInteractiveSlashCommandResult>
```

### 7.4 Изменения внутренней реализации

```typescript
// Старый код:
const filteredCommands = filterCommandsForNonInteractive(
  allCommands,
  allowedBuiltinSet,
);

// Новый код:
const executionMode = isAcpMode ? 'acp' : 'non_interactive';
const filteredCommands = filterCommandsForMode(allCommands, executionMode);
```

### 7.5 Изменение сигнатуры функции `getAvailableCommands`

```typescript
// ❌ Старая сигнатура
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  allowedBuiltinCommandNames: string[] = [...ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE],
): Promise<SlashCommand[]>

// ✅ Новая сигнатура
export const getAvailableCommands = async (
  config: Config,
  abortSignal: AbortSignal,
  mode: ExecutionMode = 'acp',
): Promise<SlashCommand[]>
```

> Добавлен параметр `mode` вместо старого параметра белого списка. При вызове из ACP Session можно явно указать `'acp'`, при вызове из non-interactive — `'non_interactive'`.

---

## 8. Изменения вызовов в `Session.ts` (ACP)

```typescript
// ❌ Старый вызов
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
  // не передаётся, используется белый список по умолчанию
);

// ✅ Новый вызов (без изменений, удалён несуществующий теперь параметр по умолчанию)
const slashCommandResult = await handleSlashCommand(
  inputText,
  abortController,
  this.config,
  this.settings,
);

// ─────────────────────────────────────────

// ❌ Старый вызов
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
);

// ✅ Новый вызов (явно указан mode)
const slashCommands = await getAvailableCommands(
  this.config,
  abortController.signal,
  'acp',
);
```

---

## 9. Сводка изменений файлов

### 9.1 Изменяемые файлы

| Файл                                                                       | Изменения                                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `packages/cli/src/ui/commands/types.ts`                                    | Добавлены типы `ExecutionMode`, `CommandSource`, `CommandType`; расширен интерфейс `SlashCommand`                               |
| `packages/cli/src/services/CommandService.ts`                              | Добавлены методы `getCommandsForMode()`, `getModelInvocableCommands()`                                                         |
| `packages/cli/src/nonInteractiveCliCommands.ts`                            | Удалены константы белого списка и старая функция фильтрации; обновлены сигнатуры двух экспортируемых функций; добавлен импорт `filterCommandsForMode` |
| `packages/cli/src/acp-integration/session/Session.ts`                      | Обновлены вызовы `handleSlashCommand` и `getAvailableCommands`                                                                 |
| `packages/cli/src/services/BuiltinCommandLoader.ts`                        | При построении команд внедряются `source: 'builtin-command'`, `sourceLabel: 'Built-in'`, `modelInvocable: false`              |
| `packages/cli/src/services/BundledSkillLoader.ts`                          | Внедряются `source: 'bundled-skill'`, `commandType: 'prompt'`, `modelInvocable: true`                                         |
| `packages/cli/src/services/FileCommandLoader.ts` / `command-factory.ts`    | Внедряются `source`, `commandType: 'prompt'`, `modelInvocable` (в зависимости от extensionName)                                |
| `packages/cli/src/services/McpPromptLoader.ts`                             | Внедряются `source: 'mcp-prompt'`, `commandType: 'prompt'`, `modelInvocable: true`                                            |
| **Каждый файл встроенных команд (10 local + 27 local-jsx)**                | Объявляется `commandType: 'local'` или `commandType: 'local-jsx'`                                                              |

### 9.2 Добавляемые файлы

| Файл                                         | Содержание                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/cli/src/services/commandUtils.ts`  | Служебные функции `getEffectiveSupportedModes()`, `filterCommandsForMode()` и их экспорт |

### 9.3 Неизменяемые файлы

- `packages/cli/src/utils/commands.ts` (`parseSlashCommand` не требует изменений)
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts` (путь interactive не требует изменений)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (stub UI не требует изменений)
- Все реализации `action` команд (фаза 1 не изменяет поведение ни одной команды)

---

## 10. Анализ влияния на поведение

### 10.1 Сводка изменений

| Сценарий                                 | Старое поведение             | Новое поведение                                             | Характер       |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------------------ | -------------- |
| Выполнение `/init` в non-interactive     | ✅ Разрешено (белый список)  | ✅ Разрешено (`commandType: local`)                          | Без изменений  |
| Выполнение `/summary` в non-interactive  | ✅ Разрешено                 | ✅ Разрешено                                                 | Без изменений  |
| Выполнение `/compress` в non-interactive | ✅ Разрешено                 | ✅ Разрешено                                                 | Без изменений  |
| Выполнение `/btw` в non-interactive      | ✅ Разрешено                 | ✅ Разрешено                                                 | Без изменений  |
| Выполнение `/bug` в non-interactive      | ✅ Разрешено                 | ✅ Разрешено                                                 | Без изменений  |
| Выполнение `/context` в non-interactive  | ✅ Разрешено                 | ✅ Разрешено                                                 | Без изменений  |
| Выполнение `/model` в non-interactive    | ❌ Не поддерживается         | ❌ Не поддерживается (`commandType: local-jsx`)              | Без изменений  |
| Выполнение file command в non-interactive| ✅ Разрешено (CommandKind.FILE) | ✅ Разрешено (`commandType: prompt`)                         | Без изменений  |
| Выполнение bundled skill в non-interactive| ✅ Разрешено (CommandKind.SKILL) | ✅ Разрешено (`commandType: prompt`)                         | Без изменений  |
| Выполнение MCP prompt в non-interactive  | ❌ Блокировалось CommandKind | ✅ Разрешено (`commandType: prompt`)                         | **Исправление бага** |
| Выполнение `/export` в non-interactive   | ❌ Не в белом списке         | ❌ Не разрешено (`commandType: local`, по умолчанию только interactive) | Без изменений  |
| Выполнение `/memory` в non-interactive   | ❌ Не в белом списке         | ❌ Не разрешено (`commandType: local`, по умолчанию только interactive) | Без изменений  |
| Выполнение `/plan` в non-interactive     | ❌ Не в белом списке         | ❌ Не разрешено (`commandType: local`, по умолчанию только interactive) | Без изменений  |
> **О консервативной стратегии по умолчанию для команды `local`**: значение `supportedModes` по умолчанию для `commandType: 'local'` равно `['interactive']`, что соответствует дизайну Claude Code — команды типа `local` должны явно объявлять `supportsNonInteractive: true`, чтобы работать в неинтерактивном режиме. 6 команд из белого списка в Phase 1 (`init`, `summary`, `compress`, `btw`, `bug`, `context`) заменяют эффект старого белого списка за счёт явного указания `supportedModes: ['interactive', 'non_interactive', 'acp']`. Команды, которые нужно расширить в Phase 2 (например, `/export`, `/memory`, `/plan`), будут разблокированы по одной после проверки реализации action на совместимость с headless-режимом.

---

## 10.2 Команды с различиями режимов в Phase 2: двухрегистровый паттерн

Для команд в Phase 2, которые должны «в интерактивном режиме иметь UI, а в неинтерактивном — текстовый вывод» (например, `/model`), следует использовать **двухрегистровый паттерн**, а не ветвление внутри `action` одной команды.

Это стандартный паттерн Claude Code: на примере `/context` (см. `src/commands/context/index.ts`): два объекта `Command` с одинаковым именем — один `local-jsx` только для interactive, другой `local` только для non-interactive, они взаимоисключаемы через `isEnabled()`.

Qwen Code в Phase 2 должен использовать эквивалентный способ, заменяя `isEnabled()` на `supportedModes` для взаимоисключения:

```typescript
// ① Версия для интерактивного режима: local-jsx, только interactive
export const modelCommandInteractive: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local-jsx',
  supportedModes: ['interactive'], // явное ограничение
  // action: открывает диалог выбора модели
};

// ② Версия для неинтерактивного/acp: local, явно открыт для headless-вызовов
export const modelCommandHeadless: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  commandType: 'local',
  supportedModes: ['non_interactive', 'acp'], // явное ограничение
  // action: читает/устанавливает модель, возвращает сообщение (простой текст)
};
```

Два объекта с одинаковым именем, `supportedModes` взаимно исключают друг друга, `filterCommandsForMode` автоматически выбирает правильную версию. По сравнению с взаимоисключением через `isEnabled()` в Claude Code, фильтрация через `supportedModes` более явная, легче тестируется и не требует обнаружения среды выполнения.

**Phase 1 не реализует ни одной команды с двухрегистровым паттерном** — этот паттерн зарезервирован здесь только как спецификация для реализации в Phase 2.

---

## 11. Стратегия тестирования

### 11.1 Тесты новых утилитных функций

В файле `packages/cli/src/services/commandUtils.test.ts` (новый файл):

```typescript
describe('getEffectiveSupportedModes', () => {
  it('явное supportedModes имеет приоритет над выводом из commandType', () => {
    const cmd: SlashCommand = {
      name: 'test', description: '', kind: CommandKind.BUILT_IN,
      commandType: 'local',
      supportedModes: ['interactive'], // явное ограничение
    };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: local выводится как все режимы', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('commandType: local-jsx выводится только как interactive', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN, commandType: 'local-jsx' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('commandType: prompt выводится как все режимы', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.SKILL, commandType: 'prompt' };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('не указан commandType и CommandKind.BUILT_IN, fallback interactive', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.BUILT_IN };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive']);
  });

  it('не указан commandType и CommandKind.FILE, fallback все режимы', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.FILE };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });

  it('не указан commandType и CommandKind.MCP_PROMPT, fallback все режимы (исправление старого ограничения)', () => {
    const cmd: SlashCommand = { name: 'test', description: '', kind: CommandKind.MCP_PROMPT };
    expect(getEffectiveSupportedModes(cmd)).toEqual(['interactive', 'non_interactive', 'acp']);
  });
});

describe('filterCommandsForMode', () => {
  it('правильно фильтрует команды в режиме non_interactive', () => { ... });
  it('правильно фильтрует команды в режиме acp', () => { ... });
  it('не фильтрует скрытые команды (filterCommandsForMode не обрабатывает hidden, этим занимается CommandService)', () => { ... });
});
```

### 11.2 Обновление `nonInteractiveCliCommands.test.ts`

- Удалить все ссылки на `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Удалить тестовые сценарии для параметра `allowedBuiltinCommandNames`
- Добавить: проверить, что команда с commandType: local проходит фильтрацию в non-interactive
- Добавить: проверить, что команда с commandType: local-jsx отфильтровывается в non-interactive
- Оставить: проверить, что file command / skill command проходят фильтрацию в non-interactive

### 11.3 Обновление `CommandService.test.ts`

- Добавить тестовые сценарии для `getCommandsForMode`
- Добавить тестовые сценарии для `getModelInvocableCommands`

### 11.4 Тесты каждого загрузчика

- `BuiltinCommandLoader.test.ts`: проверить, что все команды имеют `source: 'builtin-command'`
- `BundledSkillLoader.test.ts`: проверить `source: 'bundled-skill'` и `modelInvocable: true`
- `FileCommandLoader.test.ts`: проверить, что пользовательские команды имеют `source: 'skill-dir-command'`, а команды плагинов — `source: 'plugin-command'`
- `McpPromptLoader.test.ts`: проверить `source: 'mcp-prompt'` и `modelInvocable: true`

---

## 12. Порядок реализации

Рекомендуется реализовывать в следующем порядке, каждый шаг может быть отдельным коммитом и ревью:

**Шаг 1** (~30 мин): изменить `types.ts`, добавить новые поля `ExecutionMode`, `CommandSource`, `CommandType` и `SlashCommand`
→ только изменения типов, проверка компиляции TypeScript

**Шаг 2** (~1 ч): создать `commandUtils.ts`, реализовать `getEffectiveSupportedModes` и `filterCommandsForMode`, одновременно создать `commandUtils.test.ts`
→ модульные тесты покрывают основную логику

**Шаг 3** (~1 ч): рефакторинг `nonInteractiveCliCommands.ts`, удалить белый список, внедрить `filterCommandsForMode`, обновить сигнатуру функции
→ поведение эквивалентно (консервативная стратегия Phase 1: команды local явно указывают `supportedModes: ['interactive']`)

**Шаг 4** (~30 мин): обновить `CommandService.ts`, добавить два новых метода

**Шаг 5** (~2 ч): добавить объявление `commandType` во все файлы встроенных команд
→ проверка корректности классификации для каждой команды

**Шаг 6** (~1.5 ч): обновить все загрузчики, внедрить `source`, `sourceLabel`, `commandType`, `modelInvocable`

**Шаг 7** (~30 мин): обновить сигнатуру вызова в `Session.ts`

**Шаг 8** (~1 ч): запустить все тесты, исправить упавшие, обновить снепшоты

**Шаг 9** (~30 мин): самопроверка CR: убедиться, что белый список полностью удалён, нет пропущенных вызовов

---

## 13. Чеклист приёмки

- [ ] Компиляция TypeScript без ошибок (`npm run typecheck`)
- [ ] `npm run lint` без новых ошибок lint
- [ ] Все существующие тесты проходят (`cd packages/cli && npx vitest run`)
- [ ] Все новые тесты в `commandUtils.test.ts` проходят
- [ ] `getEffectiveSupportedModes` покрывает все 7 случаев
- [ ] `filterCommandsForMode` покрывает три режима: interactive / non_interactive / acp
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` не упоминается нигде в кодовой базе (проверить `grep`)
- [ ] Функция `filterCommandsForNonInteractive` не упоминается нигде в кодовой базе
- [ ] Все встроенные команды имеют поле `commandType`
- [ ] Все команды, выведенные загрузчиками, имеют поля `source` и `sourceLabel`
- [ ] Команды из `BundledSkillLoader` / `FileCommandLoader` (пользовательские) / `McpPromptLoader` имеют `modelInvocable: true`
- [ ] Команды из `BuiltinCommandLoader` имеют `modelInvocable: false`
- [ ] `CommandService.getCommandsForMode('non_interactive')` возвращает набор команд, эквивалентный тому, что было до рефакторинга
- [ ] Команды MCP prompt больше не ошибочно блокируются в неинтерактивном режиме