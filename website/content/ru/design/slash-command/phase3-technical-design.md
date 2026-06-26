# Фаза 3. Технический дизайн-документ: Согласование пользовательского опыта

## 1. Цели и ограничения дизайна

### 1.1 Цели

Фаза 3, основываясь на реализованных в Фазе 1/2 метаданных команд, кроссплатформенной фильтрации и вызовах модели через prompt command, дополняет пользовательский опыт slash-команд:

- В меню автодополнения отображаются источник, подсказка по аргументам, совпадение по алиасу, а также вводится сортировка по частоте использования в рамках сессии.
- Дорабатывается ghost-текст, подсказка по аргументам, отображение источника и подсветка валидных токенов для slash-команд в середине строки.
- Команда `/help` перерабатывается из текущего беспорядочного списка команд в стилизованную панель помощи с вкладками, подобную Claude Code, обеспечивающую чёткость и удобство.
- Расширяются метаданные команд в ACP-событии `available_commands_update`.
- Подтверждается, что `/doctor` уже реализован и не требует повторной реализации; `/release-notes` не включается в данную фазу.

### 1.2 Жёсткие ограничения

- **Код имеет приоритет**: если документация Фазы 1/2 расходится с реализацией, истиной считается код из текущей основной ветки.
- **Не вводить новую архитектуру выполнения**: продолжаем использовать существующие компоненты `SlashCommand`, `CommandService`, `handleSlashCommand`, `useSlashCompletion` и `Help`; не создавать `CommandDescriptor` / `CommandExecutor` / `ModeAdapter`.
- **Не восстанавливать `commandType`**: текущая реализация удалила поле `commandType` из раннего дизайна Фазы 1; Фаза 3 не вводит это поле заново.
- **Недавно использованные на уровне сессии**: сортировка по частоте использования действует только в рамках текущей CLI-сессии, не сохраняется на диск.
- **Интерактивное поведение не должно деградировать**: автодополнение, help, doctor и другие существующие интерактивные функции остаются работоспособными; Фаза 3 только улучшает отображение и дополняет недостающие команды.
- **Обратная совместимость ACP**: существующие поля `availableCommands[].name`, `description`, `input` остаются без изменений; новые метаданные добавляются в поля, совместимые со старыми версиями, или в `_meta`, чтобы не сломать существующие ACP-клиенты.

---

## 2. Базовая линия текущей реализации (выводы по аудиту кода)

### 2.1 Существующие метаданные и поведение загрузчиков

`packages/cli/src/ui/commands/types.ts` — текущий тип `SlashCommand` уже содержит:

- `source?: CommandSource`
- `sourceLabel?: string`
- `supportedModes?: ExecutionMode[]`
- `userInvocable?: boolean`
- `modelInvocable?: boolean`
- `argumentHint?: string`
- `whenToUse?: string`
- `examples?: string[]`

`CommandSource` сейчас поддерживает:

```typescript
export type CommandSource =
  | 'builtin-command'
  | 'bundled-skill'
  | 'skill-dir-command'
  | 'plugin-command'
  | 'mcp-prompt';
```

Текущие отображаемые данные от загрузчиков:

| Загрузчик                                | source                                 | sourceLabel                              | argumentHint     | modelInvocable                                   |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------ |
| `BuiltinCommandLoader`                   | `builtin-command`                      | `Built-in`                               | Большинство не объявлено | `false`                                          |
| `BundledSkillLoader`                     | `bundled-skill`                        | `Skill`                                  | Из скилла        | `!disableModelInvocation`                        |
| `FileCommandLoader` / `command-factory`  | `skill-dir-command` / `plugin-command` | `Custom` / `Plugin: <extensionName>`     | Из frontmatter   | По умолчанию true для пользователя/проекта; у плагинов требуется `description`/`whenToUse` |
| `SkillCommandLoader`                     | `skill-dir-command` / `plugin-command` | `User` / `Project` / `Extension: <name>` | Из скилла        | По умолчанию true для пользователя/проекта; у плагинов требуется `description`/`whenToUse` |
| `McpPromptLoader`                        | `mcp-prompt`                           | `MCP: <serverName>`                      | Не генерируется  | Явно не установлено `modelInvocable`             |

> Примечание: дорожная карта Фазы 1 требовала для MCP prompt `modelInvocable: true`, но в текущей реализации это явно не установлено. Фаза 3 не меняет путь вызова модели для MCP prompt; MCP prompt по-прежнему вызывается через собственный механизм MCP, а не через `SkillTool`.

### 2.2 Возможности Фазы 3, уже реализованные

| Возможность                                           | Текущее состояние                                                                                         | Ключевые файлы                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Базовый ghost-текст для slash в середине строки       | Частично реализовано, только префиксное дополнение для команд с `modelInvocable`                          | `ui/utils/commandUtils.ts`, `ui/hooks/useCommandCompletion.tsx`    |
| Ghost-текст для аргументов при вводе команды в начале строки | Частично реализовано: когда команда полностью совпадает и нет аргументов, показывается `argumentHint`      | `ui/hooks/useCommandCompletion.tsx`                                |
| Участие алиасов в сопоставлении                       | Сопоставление и сортировка реализованы, но отображение всегда показывает все алиасы, не различая совпавший | `ui/hooks/useSlashCompletion.ts`                                   |
| Бейдж источника                                       | Только MCP отображает `[MCP]`                                                                             | `ui/components/SuggestionsDisplay.tsx`, `ui/components/Help.tsx`   |
| `/help`                                               | Текущая реализация считается незавершённой: хотя есть попытки группировки, но команды представлены списком, не обладая качеством панели помощи с вкладками в стиле Claude Code | `ui/components/Help.tsx`                                           |
| ACP `argumentHint`                                    | Уже отображается в `availableCommands[].input.hint`                                                        | `acp-integration/session/Session.ts`                               |
| ACP source/supportedModes/subcommands/modelInvocable  | Не раскрываются                                                                                           | `acp-integration/session/Session.ts`                               |
| Обработка конфликтов                                  | При конфликте имён команд расширения они переименовываются в `extensionName.commandName`; при конфликте не-расширений загруженный позже перезаписывает загруженный раньше | `services/CommandService.ts`                                       |
| `/doctor`                                             | Реализован, поддерживает `interactive` / `non_interactive` / `acp`                                        | `ui/commands/doctorCommand.ts`, `utils/doctorChecks.ts`            |

### 2.3 Что можно позаимствовать у Claude Code

См. исходный код `/Users/mochi/code/claude-code`:

- `src/types/command.ts`: модель команды содержит поля `argumentHint`, `whenToUse`, `aliases`, `loadedFrom`, `kind`, `immediate`, `isSensitive`, `userFacingName`, `supportsNonInteractive` и др. для отображения/функциональности.
- `src/utils/suggestions/commandSuggestions.ts`: сортировка подсказок учитывает точное совпадение, совпадение по алиасу, префикс, нечёткий поиск, использование скилла; при совпадении по алиасу отображается только фактически совпавший алиас.
- `src/utils/suggestions/commandSuggestions.ts`: для slash-команд в середине строки используется `findMidInputSlashCommand()`, `getBestCommandMatch()` и `findSlashCommandPositions()` для поддержки ghost-текста и подсветки.
- `src/components/HelpV2/Commands.tsx`: Help V2 — это каталог команд с возможностью навигации, отображающий описание с указанием источника.
- `src/commands.ts`: Claude Code включает встроенные команды `/doctor`, `/release-notes` и др. Qwen Code уже реализовал `/doctor`; `/release-notes` в этой фазе не реализуется.

Фаза 3 использует подход «согласование опыта, не копирование архитектуры» и заимствует перечисленные выше моменты.

---

## 3. Общий план

### 3.1 Обзор изменений файлов

| Файл                                                       | Изменения                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/SuggestionsDisplay.tsx`    | Расширение типа `Suggestion`, отображение бейджа источника, `argumentHint`, `aliasHit` |
| `packages/cli/src/ui/hooks/useSlashCompletion.ts`          | Генерация расширенных элементов автодополнения; сортировка с учётом недавно использованных; сохранение информации о совпадении по алиасу |
| `packages/cli/src/ui/hooks/useCommandCompletion.tsx`       | Ghost-текст в середине строки использует улучшенное сопоставление; возвращает метаданные аргумента/источника для отображения в UI |
| `packages/cli/src/ui/utils/commandUtils.ts`                | Добавление вспомогательных функций для подсветки slash-токенов или расширение существующих для возврата валидности команды |
| `packages/cli/src/ui/components/InputPrompt.tsx`           | Рендеринг подсветки валидных slash-токенов; сохранение принятия ghost-текста по Tab |
| `packages/cli/src/ui/components/Help.tsx`                  | Переработка в панель помощи с вкладками в стиле Claude Code, избегая простого списка команд |
| `packages/cli/src/ui/commands/helpCommand.ts`              | Если требуется текст помощи для non-interactive/acp, расширение action; иначе только поддержка interactive UI |
| `packages/cli/src/acp-integration/session/Session.ts`      | Раскрытие расширенных метаданных в ACP update |
| `packages/cli/src/ui/commands/*Command.ts`                 | Дополнение `argumentHint` для часто используемых встроенных команд |

### 3.2 Новый общий инструмент отображения

Предлагается создать `packages/cli/src/services/commandMetadata.ts`, который будет централизованно обрабатывать логику отображения, необходимую для Help, Completion и ACP:

```typescript
export function getCommandSourceBadge(cmd: SlashCommand): string | null;
export function getCommandSourceGroup(cmd: SlashCommand): CommandSourceGroup;
export function formatSupportedModes(cmd: SlashCommand): string;
export function getCommandDisplayName(cmd: SlashCommand): string;
export function getCommandSubcommandNames(cmd: SlashCommand): string[];
```

Не рекомендуется помещать эти отображающие функции в Loader, чтобы не нагружать загрузчики UI-логикой.

---

## 4. Фаза 3.1: Улучшение автодополнения

### 4.1 Расширение структуры `Suggestion`

Текущая:

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;
}
```

Предлагается расширить до:

```typescript
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;

  // Фаза 3
  source?: CommandSource;
  sourceLabel?: string;
  sourceBadge?: string;
  argumentHint?: string;
  matchedAlias?: string;
  supportedModes?: ExecutionMode[];
  modelInvocable?: boolean;
}
```

Для автодополнения файлов (режимы, отличные от `'slash'`) и обратного поиска эти поля заполнять не нужно.

### 4.2 Отображение бейджа источника

Сейчас `SuggestionsDisplay` добавляет `[MCP]` только для `CommandKind.MCP_PROMPT`. Фаза 3 меняет подход: бейдж генерируется универсально на основе `source` / `sourceLabel`:

| source / sourceLabel              | badge                                            |
| --------------------------------- | ------------------------------------------------ |
| `builtin-command`                 | `[Built-in]` (опционально: по умолчанию не показывать, чтобы снизить шум)|
| `bundled-skill` / `Skill`         | `[Skill]`                                        |
| `skill-dir-command` / `User`      | `[User]`                                         |
| `skill-dir-command` / `Project`   | `[Project]`                                      |
| `skill-dir-command` / `Custom`    | `[Custom]`                                       |
| `plugin-command` / `Plugin: x`    | `[Plugin]` или `[Plugin: x]`                    |
| `plugin-command` / `Extension: x` | `[Extension]` или `[Extension: x]`              |
| `mcp-prompt`                      | `[MCP]`                                          |

Рекомендуемая реализация:

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

> Показывать ли `[Built-in]` — решается исходя из читаемости UI. В Help группа Built-in обязательна; в меню автодополнения можно опустить бейдж для встроенных, оставив его только для команд не-встроенных источников.

### 4.3 Отображение подсказки по аргументам

В меню автодополнения после имени команды серым цветом добавляется `argumentHint`:

```text
/model <model-id>              Switch model
/export md|html|json|jsonl     Export current session
/review [pr-number] [--comment] [Skill] Review changed code
```

Рекомендации по реализации:

- `useSlashCompletion` заполняет `argumentHint: cmd.argumentHint` в `finalSuggestions`
- `SuggestionsDisplay` отображает `argumentHint` после метки, используя `theme.text.secondary`
- `commandColumnWidth` вычисляется с учётом метки + подсказки + бейджа, чтобы избежать смещения колонки описания
- Поддержка `argumentHint` также для подкоманд

Сначала необходимо дополнить `argumentHint` для часто используемых встроенных команд. Предлагаемый начальный список:

| Команда           | argumentHint                         |
| ----------------- | ------------------------------------ |
| `/model`          | `[--fast] [<model-id>]`             |
| `/approval-mode`  | `<mode>`                             |
| `/language`       | `ui | output <language>`             |
| `/export`         | `md | html | json | jsonl [path]`    |
| `/memory`         | `show | add | refresh`               |
| `/mcp`            | `desc | nodesc | schema | auth | noauth` |
| `/stats`          | `[model | tools]`                    |
| `/docs`           | Пусто или не установлено             |
| `/doctor`         | Пусто или не установлено             |

### 4.4 Сортировка по недавно использованным

#### 4.4.1 Хранение состояния

В `useSlashCommandProcessor` или `AppContainer` поддерживается состояние недавно использованных команд на уровне сессии:

```typescript
type RecentSlashCommand = {
  name: string;
  usedAt: number;
  count: number;
};
```

Предлагается хранить в `Map<string, RecentSlashCommand>`, где ключ — итоговое имя команды (после обработки конфликтов, т.е. `cmd.name`).

#### 4.4.2 Момент записи

В `useSlashCommandProcessor.handleSlashCommand`, после успешного нахождения `commandToExecute`, записывать использование:

- Если команда не найдена — не записывать.
- Скрытые команды можно не записывать.
- Вызов по алиасу записывать по каноническому имени `commandToExecute.name`.
- Для вызова подкоманды рекомендуется записывать полный путь от родительской до листовой; в первой версии допустимо записывать только листовую.

#### 4.4.3 Вес сортировки

Текущий порядок сортировки `compareRankedCommandMatches()`:

1. matchStrength
2. completionPriority
3. fzf score
4. match start
5. item length
6. original index

Фаза 3 вставляет `recentScore`:

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

Предлагаемый расчёт `recentScore`:

```typescript
const RECENT_DECAY_MS = 10 * 60 * 1000;
const recentScore = count * 10 + Math.max(0, 10 - ageMs / RECENT_DECAY_MS);
```

Если запрос пуст (пользователь ввёл только `/`), недавно использованные команды поднимаются наверх; если запрос не пуст — вес добавляется только при равной силе совпадения, чтобы недавние не перекрывали явно более точные.

### 4.5 Отображение совпадения по алиасу

Сейчас алиасы уже участвуют в `AsyncFzf` и fallback по префиксу, но `formatSlashCommandLabel()` всегда показывает все алиасы:

```text
help (?)
compress (summarize)
```

Фаза 3 меняет поведение:

- Если пользователь ввёл имя команды (основное) — алиасы не отображаются дополнительно, либо сохраняется компактный формат.
- Если пользователь ввёл алиас — показывается `help (alias: ?)`.
- `Suggestion.matchedAlias` заполняется на этапе сопоставления.

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

В результатах FZF, если `result.item` получен из `altNames`, его можно напрямую установить как `matchedAlias`; то же самое в fallback по префиксу.

---

## 5. Фаза 3.2: Полноценная поддержка slash-команд в середине строки

### 5.1 Текущее поведение

Сейчас `findMidInputSlashCommand()` распознаёт только токены `/xxx`, разделённые пробелами, и требует, чтобы курсор находился в конце токена; `getBestSlashCommandMatch()` выполняет только префиксное сопоставление по алфавиту среди команд с `modelInvocable`.

Это соответствует целям базовой версии Фазы 2, но Фаза 3 должна дополнить отображение и подсветку.

### 5.2 Улучшение ghost-текста

Сохраняем текущую стратегию: mid-input slash подсказывает только команды с `modelInvocable`, так как встроенные команды в тексте не выполняются как slash-команды.

Улучшения:

- Алгоритм сопоставления меняется с простого префиксного на использование правил сортировки из `useSlashCompletion` (как минимум, `completionPriority` и недавно использованные).
- Расширенная возвращаемая структура:

```typescript
export type BestSlashCommandMatch = {
  suffix: string;
  fullCommand: string;
  command: SlashCommand;
  sourceBadge?: string;
  argumentHint?: string;
};
```

### 5.3 Бейдж источника и подсказка по аргументам в середине строки

Поскольку место для ghost-текста ограничено, не рекомендуется вставлять бейдж и подсказку прямо в тело ghost-текста. Предлагаемые правила отображения:

- Ghost-текст по-прежнему рендерит только суффикс имени команды, например, при вводе `please /rev` показывает `iew`.
- Когда токен полностью совпадает с командой и у команды есть `argumentHint`, после курсора отображается бледная подсказка по аргументам, например `/review [pr-number] [--comment]`.
- Бейдж источника отображается только в выпадающем списке или в индикации состояния; если mid-input не вызывает выпадающий список, бейдж можно не показывать.

### 5.4 Подсветка валидных токенов команд

По аналогии с `findSlashCommandPositions()` в Claude Code, в `InputPrompt.renderLineWithHighlighting()` раскрашиваются валидные slash-токены в тексте.

Предлагается новая вспомогательная функция:

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
- Токен имеет форму `/[a-zA-Z][a-zA-Z0-9:_-]*`.
- Для подсветки в середине строки валидными считаются только команды с `modelInvocable`.
- Для токена в начале строки валидными считаются все интерактивно видимые команды.
- Валидные токены окрашиваются акцентным цветом; невалидные — обычным текстом, чтобы не помечать пути вида `/usr/bin` как команды.

---

## 6. Фаза 3.3: Переработка каталога Help

### 6.1 Текущие проблемы

`Help.tsx` сейчас выводит:

- Основы (Basics)
- `Commands:` одной строкой
- Пояснение к `[MCP]`
- Сочетания клавиш (Keyboard Shortcuts)

Проблемы:

- Все источники смешаны, скиллы, кастомные, плагины, MCP трудно различить.
- Не отображается `argumentHint`.
- Не отображаются `supportedModes`.
- Не отображается `modelInvocable`.
- Подкоманды показаны только с одним отступом, без указания источника/режима.

### 6.2 Дизайн группировки

Группировка по `source` / `sourceLabel`:

1. **Built-in Commands**: `source === 'builtin-command'`
2. **Bundled Skills**: `source === 'bundled-skill'`
3. **Custom Commands**: `source === 'skill-dir-command'`, включая `Custom` / `User` / `Project`
4. **Plugin Commands**: `source === 'plugin-command'`, включая `Plugin:*` / `Extension:*`
5. **MCP Commands**: `source === 'mcp-prompt'`
6. **Other Commands**: запасной вариант для команд без source

Внутри каждой группы команды сортируются по имени; скрытые команды не отображаются.

### 6.3 Поля отображения для каждой команды

Предлагаемый формат:

```text
/model [--fast] [<model-id>]  Switch model
  source: Built-in  modes: interactive, non_interactive, acp

/review [pr-number] [--comment]  Review changed code
  source: Skill  modes: interactive, non_interactive, acp  model: yes
```

Чтобы Help не был слишком широким, предлагается сжать до одной строки:

```text
 /review [pr-number] [--comment] [Skill] [all] [model] - Review changed code
```

Предлагаемый бейдж режима:

| supportedModes                      | badge            |
| ----------------------------------- | ---------------- |
| только `interactive`                | `[interactive]`  |
| `interactive, non_interactive, acp` | `[all]`          |
| `non_interactive, acp`              | `[headless]`     |
| Другие комбинации                   | `[i] [ni] [acp]` |

### 6.4 Расширение `/help` на headless

Дорожная карта требует только вывода `/help` с группировкой по источнику; явно не требует non-interactive/acp поддержки. Сейчас `/help` имеет `supportedModes: ['interactive']`.

Фаза 3 предлагает добавить headless-маршрут, но как отдельную подзадачу:

- `supportedModes` меняется на все режимы.
- interactive: продолжает рендерить `HistoryItemHelp`.
- non_interactive/acp: возвращает текстовый (plain-text) каталог с группировкой в поле `message`.

Если требуется сузить scope, можно сначала переработать только интерактивный компонент `Help`, а headless `/help` отложить.

---

## 7. Фаза 3.4: Расширение метаданных доступных команд в ACP

### 7.1 Текущий вывод ACP

`Session.sendAvailableCommandsUpdate()` в настоящее время преобразует `SlashCommand[]` в:

```typescript
{
  name: cmd.name,
  description: cmd.description,
  input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
}
```

где `argumentHint` уже раскрывается через `input.hint`.

### 7.2 План расширения

Если тип `AvailableCommand` в протоколе ACP не позволяет напрямую добавлять поля, используется `_meta` для сохранения совместимости:

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

Если тип `AvailableCommand` допускает расширение полей, предпочтительнее выводить как поля первого уровня:

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

Однако рекомендуется также на некоторое время сохранить `_meta` для плавной миграции старых клиентов.

### 7.3 Стратегия рекурсии для подкоманд

Критерий приёмки требует только список имён `subcommands`. В первой версии достаточно вывести подкоманды первого уровня:

```typescript
subcommands: cmd.subCommands?.map((sub) => sub.name) ?? [];
```

Если в будущем ACP-клиентам понадобится многоуровневое дерево, можно расширить до:

```typescript
type AcpSubcommandMeta = {
  name: string;
  description?: string;
  argumentHint?: string;
  subcommands?: AcpSubcommandMeta[];
};
```

---

## 8. Фаза 3.5: Дополнение отсутствующих команд из Claude Code

### 8.1 `/doctor`: уже реализован, повторно не реализовывать

Текущая команда `doctorCommand` уже существует:

- Файл: `packages/cli/src/ui/commands/doctorCommand.ts`
- Регистрация: `BuiltinCommandLoader`
- Режимы: `['interactive', 'non_interactive', 'acp']`
- interactive: отображает `HistoryItemDoctor`
- non_interactive/acp: возвращает JSON в поле `message`
- Логика диагностики: `packages/cli/src/utils/doctorChecks.ts`

Фаза 3 должна только корректно отображать источник и режим для `/doctor` в Help и автодополнении. При желании можно оптимизировать JSON для headless в более читаемый Markdown, но это не обязательно.

### 8.2 `/release-notes`: не включать в данную фазу

`/release-notes` больше не является требованием Фазы 3. На этом этапе не добавляются новые команды, не производится их регистрация как встроенных, не пишутся соответствующие тесты, чтобы не вводить команду без чётких продуктовых требований.

---

## 9. Подтверждение и отображение стратегии разрешения конфликтов

Текущая стратегия `CommandService`:

- Команды расширений/плагинов, если конфликтуют с существующими, переименовываются в `extensionName.commandName`.
- При повторном конфликте добавляется числовой суффикс: `extensionName.commandName1`.
- При конфликте команд, не являющихся расширениями, загруженная позже перезаписывает загруженную раньше.

Фаза 3 не меняет семантику выполнения, только чётко отображает итоговые имена и источники в Help/Completion.

Рекомендуется дополнить тестами, чтобы убедиться:

- Переименованная команда плагина отображается в автодополнении с итоговым именем и бейджем `[Plugin]`.
- В Help она группируется в Plugin Commands с итоговым именем.
- ACP использует итоговое имя.

> Приоритет, указанный в дорожной карте («built-in > bundled/skill-dir > plugin > mcp»), не полностью совпадает с текущей реализацией («не-расширения: загруженный позже перезаписывает загруженный раньше»). Документация Фазы 3 опирается на текущий код `CommandService` и не меняет семантику конфликтов в этой фазе. Если необходимо строго настроить приоритет, это следует делать как отдельную фазу, чтобы не сломать существующее поведение перезаписи пользовательских/проектных команд.

---

## 10. Стратегия тестирования

### 10.1 Тесты автодополнения

Обновить или добавить:

- `packages/cli/src/ui/hooks/useSlashCompletion.test.ts`
- `packages/cli/src/ui/hooks/useCommandCompletion.test.ts`
- `packages/cli/src/ui/components/SuggestionsDisplay.test.tsx` (если файла нет — создать)

Покрыть:

- Бейдж источника: корректное отображение для Skill/Custom/Plugin/MCP.
- `argumentHint`: подсказка отображается после имени команды, и ширина колонки не нарушает описание.
- Недавно использованные: при вводе только `/` недавние команды идут первыми; при вводе явного запроса точное совпадение имеет приоритет.
- Совпадение по алиасу: при вводе `?` показывается `help (alias: ?)`, при вводе `he` подсказка об алиасе не отображается.
- Ghost-текст в середине строки: ввод `/rev` в тексте подсказывает суффикс для `modelInvocable` команды `/review`.
- Mid-input не предлагает built-in: ввод `/sta` в тексте не подсказывает `/stats` (если только будущий дизайн не разрешит встраивать выполнение built-in в текст).
### 10.2 Help 测试

Обновление: `packages/cli/src/ui/components/Help.test.tsx`

Покрытие:

- Группировка по Built-in / Bundled Skills / Custom / Plugin / MCP
- Скрытые команды не отображаются
- Подкоманды отображаются в виде списка имён
- `argumentHint`, source badge, mode badge, model badge корректно отображаются
- `altNames` всё ещё отображаются, но не мешают основному имени команды

### 10.3 ACP 测试

Обновление: `packages/cli/src/acp-integration/session/Session.test.ts`

Покрытие:

- `availableCommands[].input.hint` сохраняет существующее поведение
- Новые метаданные включают `argumentHint`, `source`, `sourceLabel`, `supportedModes`, `subcommands`, `modelInvocable`
- Для команд без `argumentHint` поле `input: null` остаётся совместимым
- Вызов `getAvailableCommands(config, signal, 'acp')` остаётся без изменений

### 10.4 Тестирование новых команд

На данном этапе не добавляются новые встроенные команды (вроде `/release-notes`), поэтому добавлять новые тесты для команд не требуется. Сохраняются только существующие регрессионные тесты для `/doctor`.

### 10.5 План E2E-тестирования

Phase 3 одновременно изменяет TUI-дополнения, выполнение slash-команд и метаданные ACP command; модульные тесты не могут покрыть полный пользовательский путь. Проверка E2E проводится по трём категориям:

1. **Сборка локального CLI**: сначала выполнить `npm run build && npm run bundle`, затем использовать `node dist/cli.js` для проверки локальной реализации.
2. **Интерактивный / tmux сценарий**: используется для проверки меню дополнений, ghost text, принятия через Tab, отображения Help и других TUI-поведений.
3. **Headless / JSON сценарий**: используется для проверки вывода неинтерактивных slash-команд, без TUI.
4. **ACP integration сценарий**: используется для проверки метаданных `available_commands_update`.

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

При отправке ввода разделяйте текст и перевод строки, чтобы TUI не «проглотил» отправку:

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

#### 10.5.2 Чек-лист E2E

| Сценарий                          | Режим             | Шаги                                                                                    | Ожидаемый результат                                                                                                                                |
| --------------------------------- | ----------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Дополнение с source badge         | interactive/tmux  | Введите `/`, наблюдайте меню дополнений                                                 | Команды skill/custom/plugin/MCP отображают соответствующий source badge; built-in команды могут не показывать badge                               |
| Дополнение с argument hint        | interactive/tmux  | Введите `/model`, `/export`                                                             | После имени команды отображается `argumentHint`; команды без аргументов не показывают лишнего hint                                                 |
| Сортировка «недавно использованные» | interactive/tmux  | Сначала выполните `/help`, затем введите `/`                                            | `/help` при равной степени совпадения появляется раньше; точное совпадение с query всё равно имеет приоритет                                      |
| Отображение совпадения с alias    | interactive/tmux  | Введите `/?`                                                                           | В элементе дополнения отображается `help (alias: ?)`; при вводе `/he` не показывается сообщение о совпадении с alias                               |
| Ghost text на середине ввода      | interactive/tmux  | В тексте введите `please /rev`                                                          | Появляется ghost text суффикс `/review`, можно принять через Tab                                                                                   |
| Подсветка token на середине ввода | interactive/tmux  | Введите текст, содержащий `/review`                                                    | Допустимые model-invocable slash token подсвечиваются командой; пути вида `/usr/bin` не подсвечиваются как команды                                |
| Группировка в Help                | interactive/tmux  | Выполните `/help`                                                                       | Вывод содержит группы Built-in Commands, Bundled Skills, Custom Commands, Plugin Commands, MCP Commands; каждая команда показывает source/mode/hint |
| Headless регрессия `/doctor`      | headless/json     | Выполните `node dist/cli.js "/doctor" --approval-mode yolo --output-format json 2>/dev/null` | Возвращает `message`, не вызывает ошибки TUI-only компонентов                                                                                      |
| ACP metadata                      | integration       | Запустите ACP session и вызовите `available_commands_update`                            | Каждая команда содержит `name`, `description`, `input.hint`, а также `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`   |

#### 10.5.3 Пример headless-команды

`/release-notes` не входит в данный этап; headless регрессия ограничивается проверкой существующих команд, таких как `/doctor`.

### 10.6 Команды регрессионного тестирования

Согласно AGENTS.md, в первую очередь выполнять тесты для отдельных файлов:

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

### 11.1 Меню дополнений

- [ ] Меню дополнений отображает source badge (как минимум `[MCP]`, `[Skill]`, `[Custom]`, `[Plugin]`)
- [ ] Меню дополнений отображает `argumentHint`
- [ ] Недавно использованные команды в сессии появляются в приоритете при вводе только `/`
- [ ] При совпадении с alias отображается `alias: <alias>`, при несовпадении с alias лишняя информация не показывается
- [ ] Команды, переименованные из-за конфликта plugin/extension, отображаются в дополнениях с финальным именем и источником

### 11.2 Mid-input slash

- [ ] При вводе в тексте команды вида `/review` (model-invocable) корректно отображается ghost text
- [ ] Клавиша Tab принимает ghost text на середине ввода
- [ ] Действительные mid-input slash command token подсвечиваются
- [ ] Встроенные команды не ошибочно подсказываются в тексте как выполнимые встроенные команды
- [ ] Подсказка аргументов отображается при полном совпадении команды и отсутствии аргументов

### 11.3 Help

- [ ] `/help` группирует команды по источникам
- [ ] Для каждой команды отображается имя, `argumentHint`, описание, source, метки supportedModes
- [ ] Model-invocable команды имеют явную метку
- [ ] Подкоманды отображаются в виде списка имён или вложенных элементов
- [ ] Скрытые команды не отображаются

### 11.4 ACP

- [ ] ACP `available_commands_update` по-прежнему содержит `name`, `description`, `input.hint`
- [ ] Метаданные ACP command содержат `argumentHint`, `source`, `supportedModes`, `subcommands`, `modelInvocable`
- [ ] Старые клиенты игнорируют новые поля без проблем

### 11.5 Отсутствующие команды

- [ ] `/doctor` всё ещё доступен и в неинтерактивном режиме возвращает `message`
- [ ] Не добавляется `/release-notes`; команда больше не требуется ни в документации, ни в тестах, ни в критериях приёмки

---

## 12. Не входит в объём

Следующие элементы не относятся к Phase 3:

- Не реализуются новый loader для workflow command / dynamic skill / mcp skill
- Не вводится постоянное отслеживание использования команд (persistent command usage tracking)
- Не изменяется протокол вызова моделей `SkillTool`
- Не изменяется путь вызова моделей для MCP prompt
- Не рефакторится executor команд или mode adapter
- Не изменяется существующая семантика переопределения user/project команды

---

## 13. Рекомендуемый порядок реализации

1. **Структура данных дополнений и отображение badge/hint**: сначала расширить `Suggestion` и `SuggestionsDisplay` — низкий риск, наглядная обратная связь.
2. **Добавление `argumentHint` для built-in команд**: чтобы существующий ghost text и ACP `input.hint` сразу принесли пользу.
3. **Сортировка «недавно использованные»**: добавить recent score в `useSlashCompletion`, дополнить тесты.
4. **Отображение совпадения с alias**: адаптировать FZF/prefix-сопоставление для сохранения `matchedAlias`.
5. **Рефакторинг Help с разделением на вкладки**: по аналогии с Claude Code сделать чёткие панели General / Commands / Custom Commands, чтобы избежать нагромождения команд.
6. **Расширение метаданных ACP**: расширить `Session.sendAvailableCommandsUpdate()`, сохраняя совместимость `_meta`.
7. **Улучшение подсветки на середине ввода**: обрабатывать слой рендеринга в последнюю очередь, чтобы избежать слишком больших параллельных изменений логики дополнений.