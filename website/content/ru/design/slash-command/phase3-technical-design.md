# Phase 3 技术设计文档：体验对齐

## 1. 设计目标与约束

### 1.1 目标

Phase 3 在 Phase 1/2 已落地的命令元数据、跨模式过滤和 prompt command 模型调用基础上，补齐用户可感知的 slash command 体验：

- 补全菜单展示来源、参数提示、alias 命中，并引入 session 级最近使用排序
- 完善 mid-input slash command 的 ghost text、参数提示、来源展示和有效 token 高亮
- 将 `/help` 从当前不可用的命令堆砌重构为 Claude Code 风格的分 tab、清晰、美观的帮助面板
- 增强 ACP `available_commands_update` 的命令元数据
- 确认已实现的 `/doctor` 不重复实现；`/release-notes` 不纳入本阶段

### 1.2 硬性约束

- **代码为准**：Phase 1/2 文档与实现存在差异时，以当前主分支源码为准。
- **不引入新执行架构**：继续复用现有 `SlashCommand`、`CommandService`、`handleSlashCommand`、`useSlashCompletion` 和 `Help` 组件，不新建 `CommandDescriptor` / `CommandExecutor` / `ModeAdapter`。
- **不恢复 `commandType`**：当前实现已删除 Phase 1 早期设计中的 `commandType` 字段，Phase 3 不重新引入该字段。
- **session 级 recently used**：最近使用排序只在当前 CLI session 内生效，不持久化到磁盘。
- **interactive 行为不退化**：补全、help、doctor 等已有 interactive 行为保持可用；Phase 3 只增强展示与补齐缺失命令。
- **ACP 向后兼容**：`availableCommands[].name`、`description`、`input` 三个已有字段保持不变；新增元数据放在兼容字段或 `_meta` 中，避免破坏已有 ACP 客户端。

---

## 2. 当前实现基线（源码审计结论）

### 2.1 已有元数据与 Loader 行为

`packages/cli/src/ui/commands/types.ts` 当前 `SlashCommand` 已包含：

- `source?: CommandSource`
- `sourceLabel?: string`
- `supportedModes?: ExecutionMode[]`
- `userInvocable?: boolean`
- `modelInvocable?: boolean`
- `argumentHint?: string`
- `whenToUse?: string`
- `examples?: string[]`

`CommandSource` 当前支持：

```typescript
export type CommandSource =
  | 'builtin-command'
  | 'bundled-skill'
  | 'skill-dir-command'
  | 'plugin-command'
  | 'mcp-prompt';
```

各 Loader 当前已填充的展示信息：

| Loader                                  | source                                 | sourceLabel                              | argumentHint     | modelInvocable                                   |
| --------------------------------------- | -------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------ |
| `BuiltinCommandLoader`                  | `builtin-command`                      | `Built-in`                               | 多数未声明       | `false`                                          |
| `BundledSkillLoader`                    | `bundled-skill`                        | `Skill`                                  | 来自 skill       | `!disableModelInvocation`                        |
| `FileCommandLoader` / `command-factory` | `skill-dir-command` / `plugin-command` | `Custom` / `Plugin: <extensionName>`     | 来自 frontmatter | 用户/项目默认 true；插件需 description/whenToUse |
| `SkillCommandLoader`                    | `skill-dir-command` / `plugin-command` | `User` / `Project` / `Extension: <name>` | 来自 skill       | 用户/项目默认 true；插件需 description/whenToUse |
| `McpPromptLoader`                       | `mcp-prompt`                           | `MCP: <serverName>`                      | 未生成           | 当前未显式设置 `modelInvocable`                  |

> 注意：Phase 1 路线图曾要求 MCP prompt `modelInvocable: true`，但当前实现没有显式设置。Phase 3 不改变 MCP prompt 的模型调用路径；MCP prompt 仍通过 MCP 原生机制调用，不通过 `SkillTool` 中转。

### 2.2 当前已实现的 Phase 3 相关能力

| 能力                                                 | 当前状态                                                                                                | 关键文件                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| mid-input slash 基础 ghost text                      | 已部分实现，仅对 `modelInvocable` 命令做前缀补全                                                        | `ui/utils/commandUtils.ts`、`ui/hooks/useCommandCompletion.tsx`  |
| line-start 命令 argument ghost text                  | 已部分实现，命令完全匹配且无 args 时展示 `argumentHint`                                                 | `ui/hooks/useCommandCompletion.tsx`                              |
| alias 参与匹配                                       | 已实现匹配与排序，但展示总是显示全部 alias，不区分命中 alias                                            | `ui/hooks/useSlashCompletion.ts`                                 |
| source badge                                         | 仅 MCP 展示 `[MCP]`                                                                                     | `ui/components/SuggestionsDisplay.tsx`、`ui/components/Help.tsx` |
| `/help`                                              | 当前实现视为未完成：虽有分组尝试，但仍是命令堆砌，不具备 Claude Code 风格的分 tab、清晰可读帮助面板体验 | `ui/components/Help.tsx`                                         |
| ACP `argumentHint`                                   | 已映射到 `availableCommands[].input.hint`                                                               | `acp-integration/session/Session.ts`                             |
| ACP source/supportedModes/subcommands/modelInvocable | 未暴露                                                                                                  | `acp-integration/session/Session.ts`                             |
| 冲突处理                                             | extension 命令冲突时已重命名为 `extensionName.commandName`，非 extension 同名为后加载覆盖前加载         | `services/CommandService.ts`                                     |
| `/doctor`                                            | 已实现，支持 `interactive` / `non_interactive` / `acp`                                                  | `ui/commands/doctorCommand.ts`、`utils/doctorChecks.ts`          |
### 2.3 Claude Code 可借鉴点

参考 `/Users/mochi/code/claude-code` 源码：

- `src/types/command.ts`：命令模型包含 `argumentHint`、`whenToUse`、`aliases`、`loadedFrom`、`kind`、`immediate`、`isSensitive`、`userFacingName`、`supportsNonInteractive` 等展示/能力字段。
- `src/utils/suggestions/commandSuggestions.ts`：补全排序同时考虑精确命中、别名命中、前缀、模糊匹配、技能使用量；别名命中时只展示用户实际命中的别名。
- `src/utils/suggestions/commandSuggestions.ts`：输入中斜杠使用 `findMidInputSlashCommand()`、`getBestCommandMatch()` 和 `findSlashCommandPositions()` 支持幻影文本与高亮。
- `src/components/HelpV2/Commands.tsx`：Help V2 是可浏览的命令目录，展示描述时会附带来源信息。
- `src/commands.ts`：Claude Code 内置 `/doctor`、`/release-notes` 等命令，Qwen Code 当前已实现 `/doctor`；本阶段不实现 `/release-notes`。

Phase 3 采用“体验对齐，不复制架构”的方式借鉴上述点。

---

## 3. 总体方案

### 3.1 文件变更总览

| 文件                                                    | 变更内容                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/SuggestionsDisplay.tsx` | 扩展 `Suggestion` 类型，展示来源标签、参数提示、命中别名                   |
| `packages/cli/src/ui/hooks/useSlashCompletion.ts`       | 生成增强补全项；排序接入最近使用；保留别名命中信息              |
| `packages/cli/src/ui/hooks/useCommandCompletion.tsx`    | 输入中幻影文本复用增强匹配；输出参数/来源元数据供 UI 展示  |
| `packages/cli/src/ui/utils/commandUtils.ts`             | 增加斜杠令牌高亮辅助函数，或扩展现有函数返回命令有效性               |
| `packages/cli/src/ui/components/InputPrompt.tsx`        | 渲染有效斜杠命令令牌高亮；保留 Tab 接受幻影文本               |
| `packages/cli/src/ui/components/Help.tsx`               | 重构为 Claude Code 风格的分标签帮助面板，避免命令堆砌                    |
| `packages/cli/src/ui/commands/helpCommand.ts`           | 如需非交互式/ACP 帮助文本，扩展动作；否则仅保持交互式 UI |
| `packages/cli/src/acp-integration/session/Session.ts`   | 在 ACP 更新中暴露增强元数据                                            |
| `packages/cli/src/ui/commands/*Command.ts`              | 为常用内置命令补充 `argumentHint`                                   |

### 3.2 新增共享展示工具

建议新增 `packages/cli/src/services/commandMetadata.ts`，集中处理 Help、Completion、ACP 共同需要的展示逻辑：

```typescript
export function getCommandSourceBadge(cmd: SlashCommand): string | null;
export function getCommandSourceGroup(cmd: SlashCommand): CommandSourceGroup;
export function formatSupportedModes(cmd: SlashCommand): string;
export function getCommandDisplayName(cmd: SlashCommand): string;
export function getCommandSubcommandNames(cmd: SlashCommand): string[];
```

不建议把这些展示函数放入 Loader，避免 Loader 承担 UI 逻辑。

---

## 4. Phase 3.1：补全体验增强

### 4.1 扩展 `Suggestion` 数据结构

当前：

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;
}
```

建议扩展为：

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;

  // Phase 3
  source?: CommandSource;
  sourceLabel?: string;
  sourceBadge?: string;
  argumentHint?: string;
  matchedAlias?: string;
  supportedModes?: ExecutionMode[];
  modelInvocable?: boolean;
}
```

`mode !== 'slash'` 的文件补全、反向搜索不需要填充这些字段。

### 4.2 来源标签展示

当前 `SuggestionsDisplay` 只对 `CommandKind.MCP_PROMPT` 追加 `[MCP]`。Phase 3 改为使用 `source` / `sourceLabel` 统一生成标签：

| source / sourceLabel              | 标签                                      |
| --------------------------------- | ------------------------------------------ |
| `builtin-command`                 | `[Built-in]`（可选：默认不展示，降低噪音） |
| `bundled-skill` / `Skill`         | `[Skill]`                                  |
| `skill-dir-command` / `User`      | `[User]`                                   |
| `skill-dir-command` / `Project`   | `[Project]`                                |
| `skill-dir-command` / `Custom`    | `[Custom]`                                 |
| `plugin-command` / `Plugin: x`    | `[Plugin]` 或 `[Plugin: x]`                |
| `plugin-command` / `Extension: x` | `[Extension]` 或 `[Extension: x]`          |
| `mcp-prompt`                      | `[MCP]`                                    |

推荐实现：

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

> 是否展示 `[Built-in]` 由 UI 可读性决定。Help 中必须展示 Built-in 分组；补全菜单中可以省略 built-in 标签，只对非内置来源展示标签。

### 4.3 参数提示展示

补全菜单中命令名后追加灰色 `argumentHint`：

```text
/model <model-id>              Switch model
/export md|html|json|jsonl     Export current session
/review [pr-number] [--comment] [Skill] Review changed code
```
### Реализационные предложения:

- `useSlashCompletion` заполняет `argumentHint: cmd.argumentHint` в `finalSuggestions`.
- `SuggestionsDisplay` отображает `argumentHint` после label цветом `theme.text.secondary`.
- `commandColumnWidth` рассчитывается с учётом label + hint + badge, чтобы избежать смещения колонки описания.
- Автодополнение подкоманд также поддерживает `argumentHint`.

Необходимо сначала дополнить `argumentHint` для часто используемых встроенных команд. Рекомендуемый первый набор:

| Команда           | argumentHint                 |
| ----------------- | ---------------------------- |
| `/model`          | `[--fast] [<model-id>]`      |
| `/approval-mode`  | `<mode>`                     |
| `/language`       | `ui | output <language>`     |
| `/export`         | `md | html | json | jsonl [path]` |
| `/memory`         | `show | add | refresh`       |
| `/mcp`            | `desc | nodesc | schema | auth | noauth` |
| `/stats`          | `[model | tools]`            |
| `/docs`           | пусто или не задано          |
| `/doctor`         | пусто или не задано          |

### 4.4 Сортировка по недавнему использованию

#### 4.4.1 Хранение состояния

В `useSlashCommandProcessor` или `AppContainer` поддерживается состояние недавнего использования на уровне сессии:

```typescript
type RecentSlashCommand = {
  name: string;
  usedAt: number;
  count: number;
};
```

Рекомендуется хранить в `Map<string, RecentSlashCommand>`, где ключ — итоговое имя команды (т.е. `cmd.name` после разрешения конфликтов).

#### 4.4.2 Момент записи

Запись использования происходит после успешного разрешения `commandToExecute` в `useSlashCommandProcessor.handleSlashCommand`:

- Если команда не найдена — не записывать.
- Скрытые (hidden) команды можно не записывать.
- Вызов через alias записывается по каноническому `commandToExecute.name`.
- Для вызовов подкоманд рекомендуется записывать полный путь родительской и листовой команды; на первом этапе допустима запись только листовой команды.

#### 4.4.3 Вес сортировки

Текущий порядок сортировки `compareRankedCommandMatches()`:

1. matchStrength
2. completionPriority
3. fzf score
4. match start
5. item length
6. original index

В Phase 3 вставляется `recentScore`:

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

Рекомендуемый `recentScore`:

```typescript
const RECENT_DECAY_MS = 10 * 60 * 1000;
const recentScore = count * 10 + Math.max(0, 10 - ageMs / RECENT_DECAY_MS);
```

Когда запрос пуст (пользователь ввёл только `/`), недавно использованные команды выводятся в начало; когда запрос не пуст, взвешивание применяется только при равной силе совпадения, чтобы недавние команды не перевешивали более точные.

### 4.5 Отображение совпадений по alias

В настоящее время alias уже участвуют в `AsyncFzf` и prefix fallback, но `formatSlashCommandLabel()` всегда отображает все alias:

```text
help (?)
compress (summarize)
```

В Phase 3 изменяется:

- Если пользователь ввёл основное имя: не показывать дополнительные alias, либо сохранить текущий компактный формат.
- Если пользователь ввёл alias: показывать `help (alias: ?)`.
- `Suggestion.matchedAlias` записывается на этапе сопоставления.

Ключевые моменты реализации:

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

В результатах FZF, если `result.item` происходит из `altNames`, его можно сразу использовать как `matchedAlias`; аналогично в prefix fallback.

---

## 5. Phase 3.2: Полноценная версия slash-команды в середине ввода

### 5.1 Текущее поведение

Сейчас `findMidInputSlashCommand()` распознаёт только токены `/xxx`, разделённые пробелами, и требует, чтобы курсор находился в конце токена; `getBestSlashCommandMatch()` выполняет только префиксное совпадение по алфавиту среди `modelInvocable` команд.

Это соответствует целям базовой версии Phase 2, но Phase 3 требует дополнения отображения и подсветки.

### 5.2 Улучшение ghost text

Сохраняется текущая стратегия: mid-input slash подсказывает только `modelInvocable` команды, так как встроенные команды в тексте не выполняются как slash-команды.

Улучшения:

- Алгоритм сопоставления меняется с префиксного по алфавиту на переиспользование правил сортировки `useSlashCompletion` (как минимум с учётом `completionPriority` и недавно использованных).
- Возвращаемая структура расширяется:

```typescript
export type BestSlashCommandMatch = {
  suffix: string;
  fullCommand: string;
  command: SlashCommand;
  sourceBadge?: string;
  argumentHint?: string;
};
```

### 5.3 Source badge и подсказка аргумента для mid-input

Из-за ограниченного места в ghost text не рекомендуется вставлять badge и hint непосредственно в тело ghost text. Рекомендуемые правила отображения:

- ghost text по-прежнему отображает только суффикс имени команды, например, при вводе `please /rev` показывается `iew`.
- Когда токен полностью совпадает с командой и у команды есть `argumentHint`, после курсора отображается бледная подсказка с аргументами, например `/review [pr-number] [--comment]`.
- Source badge отображается только в выпадающем списке или в статусной подсказке; если mid-input не вызывает выпадающий список, badge можно не отображать.

### 5.4 Подсветка валидных командных токенов

По аналогии с `findSlashCommandPositions()` в Claude Code, в `InputPrompt.renderLineWithHighlighting()` раскрашиваются валидные slash-токены в тексте.

Предлагается добавить вспомогательную функцию:

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

Правила:

- Токен должен находиться в начале строки или после пробела.
- Токен имеет вид `/[a-zA-Z][a-zA-Z0-9:_-]*`.
- Для подсветки mid-input валидными считаются только `modelInvocable` команды.
- Для токена в начале строки валидными считаются все интерактивные видимые команды.
- Валидные токены окрашиваются акцентным цветом; невалидные остаются обычным текстом, чтобы не помечать пути `/usr/bin` как команды.

---

## 6. Phase 3.3: Реструктуризация справки

### 6.1 Текущие проблемы

`Help.tsx` сейчас выводит:

- Basics
- Плоский список `Commands:`
- Пояснение `[MCP]`
- Сочетания клавиш

Проблемы:

- Все источники перемешаны: skill, custom, plugin, MCP трудно различить.
- Не отображается `argumentHint`.
- Не отображается `supportedModes`.
- Не отображается `modelInvocable`.
- Подкоманды только с отступом на один уровень, без указания источника/режима.

### 6.2 Дизайн группировки

Группировка по `source` / `sourceLabel`:

1. **Встроенные команды**: `source === 'builtin-command'`
2. **Встроенные навыки (Bundled Skills)**: `source === 'bundled-skill'`
3. **Пользовательские команды**: `source === 'skill-dir-command'`, включая `Custom` / `User` / `Project`
4. **Команды плагинов**: `source === 'plugin-command'`, включая `Plugin:*` / `Extension:*`
5. **MCP команды**: `source === 'mcp-prompt'`
6. **Прочие команды**: для обратной совместимости при отсутствии source
Каждая группа сортируется по имени команды; скрытые (hidden) команды не показываются.

### 6.3 Поля отображения каждой команды

Рекомендуемый формат:

```text
/model [--fast] [<model-id>]  Switch model
  source: Built-in  modes: interactive, non_interactive, acp

/review [pr-number] [--comment]  Review changed code
  source: Skill  modes: interactive, non_interactive, acp  model: yes
```

Чтобы Help не был слишком широким, рекомендуется сжать в одну строку:

```text
 /review [pr-number] [--comment] [Skill] [all] [model] - Review changed code
```

Рекомендация для mode badge:

| supportedModes                      | badge            |
| ----------------------------------- | ---------------- |
| только `interactive`                  | `[interactive]`  |
| `interactive, non_interactive, acp` | `[all]`          |
| `non_interactive, acp`              | `[headless]`     |
| другие комбинации                   | `[i] [ni] [acp]` |

### 6.4 Должен ли `/help` распространяться на headless

В roadmap требуется только, чтобы вывод `/help` группировался по источнику; нет явного требования для non-interactive/acp. Сейчас `/help` имеет `supportedModes: ['interactive']`.

Phase 3 рекомендует добавить headless-путь, но как отдельную подзадачу:

- `supportedModes` изменить на all modes
- interactive: продолжить рендерить `HistoryItemHelp`
- non_interactive/acp: возвращать plain-text группированный каталог `message`

Если нужно сузить область, можно сначала реорганизовать только interactive-компонент `Help`, а headless `/help` отложить.

---

## 7. Phase 3.4: Расширение метаданных ACP available commands

### 7.1 Текущий вывод ACP

`Session.sendAvailableCommandsUpdate()` сейчас преобразует `SlashCommand[]` в:

```typescript
{
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
}
```

где `argumentHint` уже раскрывается через `input.hint`.

### 7.2 Схема расширения

Если тип `AvailableCommand` в протоколе ACP не позволяет напрямую добавлять поля, используем `_meta` для обратной совместимости:

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

Если тип `AvailableCommand` допускает расширение полей, выводим их как first-class поля:

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

Но все же рекомендуется сохранить `_meta` в качестве зеркала на некоторое время, чтобы старые клиенты могли постепенно мигрировать.

### 7.3 Стратегия рекурсии для subcommands

Критерий приемки требует только список имен `subcommands`. На первом этапе достаточно вывести имена подкоманд первого уровня:

```typescript
subcommands: cmd.subCommands?.map((sub) => sub.name) ?? [];
```

Если в будущем клиенту ACP потребуется многоуровневое дерево, можно расширить до:

```typescript
type AcpSubcommandMeta = {
  name: string;
  description?: string;
  argumentHint?: string;
  subcommands?: AcpSubcommandMeta[];
};
```

---

## 8. Phase 3.5: Дополнение недостающих команд Claude Code

### 8.1 `/doctor`: уже реализована, повторно не реализуем

Сейчас команда `doctorCommand` уже существует:

- Файл: `packages/cli/src/ui/commands/doctorCommand.ts`
- Регистрация: `BuiltinCommandLoader`
- Режимы: `['interactive', 'non_interactive', 'acp']`
- interactive: отображает `HistoryItemDoctor`
- non_interactive/acp: возвращает JSON `message`
- Логика диагностики: `packages/cli/src/utils/doctorChecks.ts`

Phase 3 заключается лишь в корректном отображении источника и режимов для `/doctor` в Help и автодополнении; при желании можно улучшить headless JSON до более читаемого Markdown, но это не обязательно.

### 8.2 `/release-notes`: не включаем в данный этап

`/release-notes` больше не является требованием Phase 3. На этом этапе не добавляем новых команд, не регистрируем built-in, не пишем связанные тесты, чтобы не вводить команды без четкого продуктового запроса.

---

## 9. Подтверждение стратегии разрешения конфликтов и её отображение

Текущая стратегия `CommandService`:

- Если команда расширения/плагина совпадает по имени с существующей, она переименовывается в `extensionName.commandName`
- При повторном конфликте добавляется числовой суффикс: `extensionName.commandName1`
- При совпадении имени не-extension команды, загруженная позже перезаписывает загруженную ранее

Phase 3 не меняет семантику выполнения, только четко показывает конечное имя и источник в Help/Completion.

Рекомендуется добавить тесты, чтобы убедиться, что:

- Переименованная команда плагина в автодополнении отображается с конечным именем и значком `[Plugin]`
- Help группирует по Plugin Commands и показывает конечное имя
- Вывод ACP использует конечное имя

> Приоритет "built-in > bundled/skill-dir > plugin > mcp" из roadmap не полностью совпадает с текущей реализацией "не-extension: загруженная позже перезаписывает загруженную ранее". Документация Phase 3 опирается на текущий исходный код `CommandService`; на этом этапе семантика конфликтов не меняется. Если нужно строго выстроить приоритет, это следует сделать отдельным Phase, чтобы не нарушить существующее поведение перезаписи команд пользователя/проекта.

---

## 10. Стратегия тестирования

### 10.1 Тесты автодополнения

Обновить или добавить:

- `packages/cli/src/ui/hooks/useSlashCompletion.test.ts`
- `packages/cli/src/ui/hooks/useCommandCompletion.test.ts`
- `packages/cli/src/ui/components/SuggestionsDisplay.test.tsx` (если файла нет, создать)

Покрытие:

- source badge: правильное отображение Skill/Custom/Plugin/MCP
- argumentHint: подсказка отображается после имени команды, ширина колонки не ломает описание
- recently used: при вводе только `/` недавние команды показываются вверху; при явном запросе точное совпадение имеет приоритет
- alias match: при вводе `?` показывается `help (alias: ?)`, при вводе `he` подсказка по псевдониму не показывается
- mid-input ghost: в тексте `/rev` подсказывает суффикс `modelInvocable /review`
- mid-input не подсказывает built-in: в тексте `/sta` не подсказывается `/stats` (если только будущий дизайн не разрешит встроенное выполнение built-in)

### 10.2 Тесты Help

Обновить: `packages/cli/src/ui/components/Help.test.tsx`

Покрытие:

- Группировка по Built-in/Bundled Skills/Custom/Plugin/MCP
- Скрытые (hidden) команды не показываются
- Список имен подкоманд отображается
- `argumentHint`, source badge, mode badge, model badge присутствуют правильно
- altNames все ещё могут отображаться, но не мешают основному имени команды

### 10.3 Тесты ACP

Обновить: `packages/cli/src/acp-integration/session/Session.test.ts`

Покрытие:

- `availableCommands[].input.hint` сохраняет текущее поведение
- Новые метаданные включают `argumentHint`, `source`, `sourceLabel`, `supportedModes`, `subcommands`, `modelInvocable`
- Для команд без `argumentHint` поле `input: null` сохраняет совместимость
- Вызов `getAvailableCommands(config, signal, 'acp')` остаётся без изменений

### 10.4 Тесты новых команд

На этом этапе не добавляется `/release-notes` или других built-in команд, поэтому новые тесты команд не требуются. Сохраняются только существующие регрессионные тесты `/doctor`.

### 10.5 План E2E-тестов

Phase 3 одновременно изменяет TUI-автодополнение, выполнение slash-команд и метаданные ACP. Модульные тесты не покрывают полный пользовательский путь. E2E-проверка делится на три категории:

1. **Сборка локального CLI**: сначала выполнить `npm run build && npm run bundle`, затем использовать `node dist/cli.js` для проверки локальной реализации.
2. **Interactive / tmux сценарии**: для проверки меню автодополнения, ghost text, принятия через Tab, рендеринга Help и других TUI-поведений.
3. **Headless / JSON сценарии**: для проверки вывода non-interactive slash-команд, не зависящих от TUI.
4. **Сценарии ACP integration**: для проверки метаданных `available_commands_update`.
#### 10.5.1 Предварительные шаги E2E

```bash
npm run build && npm run bundle
```

Для интерактивных сценариев рекомендуется использовать отдельную временную директорию, чтобы не загрязнять текущий репозиторий:

```bash
tmux new-session -d -s qwen-slash-phase3 -x 200 -y 50 \
  "cd /tmp/qwen-slash-phase3 && /Users/mochi/code/qwen-code-test/dist/cli.js --approval-mode yolo"
sleep 3
```

При отправке ввода разделяйте текст и нажатие Enter, чтобы TUI не «проглотил» отправку:

```bash
tmux send-keys -t qwen-slash-phase3 "/help"
sleep 0.5
tmux send-keys -t qwen-slash-phase3 Enter
```

Захват вывода:

```bash
tmux capture-pane -t qwen-slash-phase3 -p -S -100
```

Очистка:

```bash
tmux kill-session -t qwen-slash-phase3
```

#### 10.5.2 Чек-лист E2E-тестирования

| Сценарий                          | Режим            | Шаги                                                                          | Ожидаемый результат                                                                                                                        |
| --------------------------------- | ---------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Автодополнение source badge       | interactive/tmux | Введите `/`, наблюдайте меню автодополнения                                  | Команды skill/custom/plugin/MCP отображают соответствующий source badge; built-in команды могут не показывать badge                        |
| Автодополнение argument hint      | interactive/tmux | Введите `/model`, `/export`                                                   | После имени команды отображается `argumentHint`; для команд без параметров hint не показывается                                             |
| Сортировка «недавно использованные» | interactive/tmux | Сначала выполните `/help`, затем введите `/`                                 | `/help` появляется раньше при равных условиях совпадения; точный запрос по-прежнему имеет приоритет над query                              |
| Отображение совпадения с alias     | interactive/tmux | Введите `/?`                                                                 | В элементе автодополнения отображается `help (alias: ?)`; при вводе `/he` alias не отображается ошибочно                                    |
| Ghost text при mid-input           | interactive/tmux | Введите `please /rev` в основном тексте                                      | Появляется суффикс ghost text для `/review`, принимается по Tab                                                                             |
| Подсветка токена mid-input         | interactive/tmux | Введите текст, содержащий `/review`                                          | Валидный model-invocable slash токен подсвечивается как команда; пути вроде `/usr/bin` не подсвечиваются как команды                        |
| Группировка справки                | interactive/tmux | Выполните `/help`                                                             | Вывод содержит группы: Built-in Commands, Bundled Skills, Custom Commands, Plugin Commands, MCP Commands; каждая команда показывает source/mode/hint |
| Регрессия `/doctor` headless       | headless/json    | Выполните `node dist/cli.js "/doctor" --approval-mode yolo --output-format json 2>/dev/null` | Возвращается `message`, не возникает ошибок, связанных с TUI-компонентами                                                                   |
| Метаданные ACP                    | integration      | Запустите ACP-сессию и вызовите `available_commands_update`                  | Каждая команда содержит `name`, `description`, `input.hint`, а также `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable` |

#### 10.5.3 Пример headless-команды

`/release-notes` не включается в данный этап; регрессия headless проверяет только уже существующие команды, такие как `/doctor`.

### 10.6 Команды регрессионного тестирования

Согласно AGENTS.md, в первую очередь выполняются однофайловые тесты:

```bash
cd packages/cli && npx vitest run src/ui/hooks/useSlashCompletion.test.ts
cd packages/cli && npx vitest run src/ui/hooks/useCommandCompletion.test.ts
cd packages/cli && npx vitest run src/ui/components/Help.test.tsx
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

Финальная проверка:

```bash
npm run build && npm run typecheck
npm run build && npm run bundle
```

---

## 11. Критерии приёмки

### 11.1 Меню автодополнения

- [ ] Меню автодополнения отображает source badge (как минимум `[MCP]`, `[Skill]`, `[Custom]`, `[Plugin]`)
- [ ] Меню автодополнения отображает `argumentHint`
- [ ] Недавно использованные команды в рамках сессии появляются первыми при вводе только `/`
- [ ] При совпадении с alias отображается `alias: <alias>`, при отсутствии совпадения с alias не выводится лишняя информация
- [ ] Команды, переименованные из-за конфликтов plugin/extension, отображаются в автодополнении с финальным именем и источником

### 11.2 Mid-input slash

- [ ] При вводе в основном тексте команд типа `/review` (model-invocable) корректно отображается ghost text
- [ ] Tab принимает ghost text при mid-input
- [ ] Валидные mid-input slash command токены подсвечиваются
- [ ] Built-in команды не ошибочно предлагаются как встраиваемые команды в основном тексте
- [ ] Подсказки аргументов отображаются при полном совпадении команды и отсутствии аргументов

### 11.3 Справка

- [ ] `/help` выводит команды, сгруппированные по источнику
- [ ] Каждая команда показывает имя, `argumentHint`, описание, source, метки supportedModes
- [ ] Model-invocable команды имеют явную метку
- [ ] Подкоманды отображаются в виде списка имён или вложенных элементов
- [ ] Скрытые команды не отображаются

### 11.4 ACP

- [ ] ACP `available_commands_update` продолжает содержать `name`, `description`, `input.hint`
- [ ] Метаданные команды ACP включают `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`
- [ ] Старые клиенты, игнорирующие новые поля, не затрагиваются

### 11.5 Отсутствующие команды

- [ ] `/doctor` по-прежнему доступен и в non-interactive режиме возвращает `message`
- [ ] Команда `/release-notes` не добавляется; она не требуется ни в документации, ни в тестах, ни в критериях приёмки

---

## 12. Невключённые цели

Следующие элементы не входят в Phase 3:

- Не реализуются workflow command / dynamic skill / новый загрузчик mcp skill
- Не вводится постоянное отслеживание использования команд
- Не изменяется протокол вызова модели `SkillTool`
- Не изменяется путь вызова модели для подсказок MCP
- Не рефакторится исполнитель команд или адаптер режимов
- Не изменяется семантика переопределения существующих user/project команд
---

## 13. Рекомендуемый порядок внедрения

1. **Завершение структуры данных и отображение badge/hint**: сначала расширить `Suggestion` и `SuggestionsDisplay` — низкий риск, наглядная обратная связь.
2. **Дополнение встроенного `argumentHint`**: чтобы существующие ghost text и ACP `input.hint` сразу получили преимущества.
3. **Сортировка «недавно использованные»**: ввести recent score в `useSlashCompletion`, дополнить тестами.
4. **Отображение совпадений alias**: настроить FZF/prefix-сопоставление для сохранения `matchedAlias`.
5. **Рефакторинг Help с вкладками**: в стиле Claude Code предоставить чистые панели General / Commands / Custom Commands и т.д., избегая нагромождения команд.
6. **Улучшение метаданных ACP**: расширить `Session.sendAvailableCommandsUpdate()`, сохраняя совместимость с `_meta`.
7. **Улучшение подсветки mid-input**: обработать уровень рендеринга в последнюю очередь, чтобы избежать больших параллельных изменений с логикой дополнения.
