# Дорожная карта рефакторинга Slash Command

## Общая цель

С использованием внутреннего архитектурного стиля Qwen предоставить платформу команд, которая на 95% соответствует Claude Code по внешнему опыту, одновременно устранив три основные проблемы: расщепление трёх режимов, единый источник команд и невозможность вызова prompt-команд моделью.

---

## Основные принципы проектирования

1. **Каждый Phase можно выпускать независимо**: после завершения поведение самосогласовано и не требует последующих Phase для работы.
2. **Phase 1 — чистая инфраструктура**: за исключением исправления ошибочной блокировки MCP_PROMPT, не вносит изменений в существующий набор доступных команд.
3. **Изменения поведения отделены от изменений архитектуры**: Phase 1 занимается архитектурой, Phase 2 — расширением возможностей.
4. **Не копировать внутреннюю архитектуру Claude Code**: но обеспечить соответствие воспринимаемому пользователем функционалу.

---

## Phase 1: Перестройка инфраструктуры (чистая архитектура, нулевые изменения поведения)

### Цель

Создать единую модель метаданных команд и механизм управления между режимами, обеспечив базовую поддержку для всех последующих Phase.

### Функциональные точки

#### 1.1 Расширение метамодели `SlashCommand`

Добавить следующие поля в существующий интерфейс `SlashCommand`:

**Поля источника**

- `source: CommandSource`: перечисление источников команд (`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt` и т.д.)
- `sourceLabel?: string`: метка источника для отображения (например, `"Built-in"` / `"MCP: github-server"`)

**Поля возможностей режимов**

- `supportedModes: ExecutionMode[]`: объявляет, в каких режимах выполнения доступна команда (`interactive` / `non_interactive` / `acp`)

**Поля типа выполнения**

- `commandType: CommandType`: объявляет тип выполнения (`prompt` / `local` / `local-jsx`)

**Поля видимости**

- `userInvocable: boolean`: может ли пользователь вызвать команду через slash command (по умолчанию `true`)
- `modelInvocable: boolean`: может ли модель вызвать команду через tool call (по умолчанию `false`)

**Вспомогательные поля метаданных** (зарезервированы для Phase 3, в Phase 1 только определяются, не используются)

- `argumentHint?: string`: подсказка по аргументам, например `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string`: описание, когда вызывать эту команду (для использования моделью)
- `examples?: string[]`: примеры использования

#### 1.2 Загрузчики заполняют поля source/commandType

Каждый загрузчик при построении `SlashCommand` должен заполнять поля `source` и `commandType`:

| Loader                           | source              | commandType                           |
| -------------------------------- | ------------------- | ------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | объявляется каждой командой (`local` / `local-jsx`) |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                              |
| `FileCommandLoader` (пользователь/проект) | `skill-dir-command` | `prompt`                              |
| `FileCommandLoader` (плагин)      | `plugin-command`    | `prompt`                              |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                              |

#### 1.3 Встроенные команды объявляют `supportedModes` и `commandType`

Явно объявить для всех встроенных команд:

- `commandType`: `local` (без UI-зависимости) или `local-jsx` (зависимость от dialog/React)
- `supportedModes`: команды типа `local` объявляют `['interactive', 'non_interactive', 'acp']`; команды типа `local-jsx` объявляют `['interactive']`

#### 1.4 Замена жёстко заданного белого списка на фильтрацию на основе возможностей

- Удалить константу `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Удалить функцию `filterCommandsForNonInteractive`
- Добавить функцию `filterCommandsForMode(commands, mode)`, фильтрующую на основе поля `supportedModes`
- Добавить служебную функцию `getEffectiveSupportedModes(cmd)` (учитывающую стратегию по умолчанию для CommandKind)
- Изменить сигнатуры функций `handleSlashCommand` / `getAvailableCommands`, удалив параметр `allowedBuiltinCommandNames`

#### 1.5 CommandService становится единым реестром

- Добавить метод `getCommandsForMode(mode: ExecutionMode)`
- Добавить метод `getModelInvocableCommands()` (будет использоваться в Phase 2/3, в Phase 1 предоставляется интерфейс)
- Существующий метод `getCommands()` остаётся без изменений (используется в интерактивном режиме)

### Критерии приёмки

- [ ] Интерфейс `SlashCommand` содержит все новые поля, TypeScript компилируется
- [ ] Все загрузчики заполняют поля `source` и `commandType`
- [ ] Все встроенные команды объявляют `commandType` и `supportedModes`
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` удалена, заменена фильтром возможностей
- [ ] **Набор доступных команд в неинтерактивном режиме полностью совпадает с состоянием до рефакторинга** (существующие тесты не ломаются)
- [ ] MCP prompt-команды корректно выполняются в режимах non_interactive/acp (исправлено прежнее ошибочное ограничение)
- [ ] `CommandService.getCommandsForMode('non_interactive')` возвращает правильный набор команд
- [ ] Все существующие тесты проходят

---

## Phase 2: Расширение возможностей (упорядочивание команд и вызов prompt-команд моделью)

### Цель

На основе метаданных Phase 1 расширить область доступности команд во всех трёх режимах и проложить путь для вызова prompt-команд моделью.

### Функциональные точки

#### 2.1 Расширение набора доступных команд в non-interactive / acp

**Принципы проектирования семантики ACP**

Перед расширением команд на режимы ACP/non-interactive необходимо соблюдать следующие принципы:

1. **Получатель разный**: в режиме ACP получателем сообщений является IDE (плагин Zed/VS Code), а не конечный пользователь. Содержимое сообщения должно быть в формате обычного текста или Markdown и не должно содержать терминальных ANSI-стилей.
2. **Стратегия реализации — добавление ветвления по режимам, а не замена**: правильный подход — добавить проверку режима внутри `action` команды: для интерактивного пути сохранить существующую логику рендеринга UI, для non_interactive/acp вернуть `message` или `submit_prompt`, пригодные для машинного потребления. Два пути сосуществуют в одной функции `action`.
3. **Состояние-зависимые операции должны документировать семантику**: при единичном неинтерактивном вызове (например, параметр `-p` CLI) изменения в командах с состоянием, таких как `/model set`, `/language set`, действуют только в рамках текущего сеанса; это следует указывать в тексте ответа команды.
4. **Только чтение vs с побочными эффектами**: команды только для чтения (например, `/about`, `/stats`) возвращают текущий текст состояния; команды с побочными эффектами (например, `/model set`, `/language set`) должны подтверждать результат операции в ответе.
5. **Избегать окружение-зависимых побочных эффектов**: операции, требующие графического окружения (открытие браузера (`/docs`, `/insight`), работа с буфером обмена (`/copy`)), в путях non_interactive/acp следует пропускать, вместо этого возвращая в тексте ответа соответствующий URL или само содержимое.

**Обзор команд, подлежащих расширению**

> Примечание: `btw`, `bug`, `compress`, `context`, `init`, `summary` уже расширены на все режимы в Phase 1 и не входят в список данного этапа.

Следующие 13 команд будут расширены на режимы `non_interactive` и `acp` в Phase 2:

**Класс A: action уже возвращает `message` или `submit_prompt`, требуется только расширить `supportedModes` и спроектировать содержимое сообщения для ACP**

| Команда       | Тип возврата     | Ключевые моменты обработки ACP/non-interactive                      |
| ------------- | ---------------- | ------------------------------------------------------------------- |
| `/copy`       | `message`        | В режиме ACP нет буфера обмена; вместо этого вернуть содержимое в тексте ответа или подсказку |
| `/export`     | `message`        | Вернуть полный путь к экспортированному файлу                        |
| `/plan`       | `submit_prompt`  | Изменений не требуется, просто расширить режимы                     |
| `/restore`    | `message`        | Вернуть описание результата операции восстановления                  |
| `/language`   | `message`        | Вернуть текущую настройку языка или подтверждение изменения          |
| `/statusline` | `submit_prompt`  | Изменений не требуется, просто расширить режимы                     |

**Класс A': с параметрами — нормальное выполнение, без параметров — вызов диалога (требуется добавить обработку пути без параметров для non-interactive)**
| 命令               | 无参数 interactive 行为             | 无参数 non_interactive/acp 行为                 |
| ----------------- | ----------------------------------- | ----------------------------------------------- |
| `/model`          | 打开模型选择对话框                  | 返回当前模型名称及说明文本                      |
| `/approval-mode`  | 打开审批模式对话框                  | 返回当前审批模式及说明文本                      |

**B 类：action 内部使用 `context.ui.addItem()` 渲染 React 组件，需增加模式分支返回纯文本**

| 命令       | interactive 行为                    | non_interactive/acp 返回内容                                                                    |
| ---------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/about`   | 渲染版本/配置 React 组件            | 版本号、当前模型、关键配置的纯文本摘要                                                          |
| `/stats`   | 渲染 token/费用统计组件             | session 统计数据的纯文本格式                                                                    |
| `/insight` | 渲染分析组件 + 打开浏览器           | `non_interactive` 同步生成返回文件路径；`acp` 通过 `stream_messages` 推送进度和结果               |
| `/docs`    | 渲染文档入口 + 打开浏览器           | 返回文档 URL，不打开浏览器                                                                      |

**C 类：特殊处理**

| 命令     | interactive 行为                    | non_interactive/acp 行为                                                                        |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/clear` | 调用 `context.ui.clear()` 清空终端显示 | 返回上下文边界标记 message，内容为 `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 prompt command 模型调用打通

- 在 `CommandService`（或 `CommandRegistry`）中实现 `getModelInvocableCommands()`，返回所有 `modelInvocable: true` 的命令
- 将 `BundledSkillLoader`、`FileCommandLoader`（用户/项目命令）加载的命令标记为 `modelInvocable: true`
- **MCP prompt 不标记为 `modelInvocable`**：MCP prompt 通过独立的 MCP tool call 机制由模型调用，无需经过 `SkillTool` 中转
- 改造 `SkillTool`：从只消费 `SkillManager.listSkills()` 改为同时消费 `CommandService.getModelInvocableCommands()`
- 构建统一的模型可调用命令描述，注入 `SkillTool` 的 description

#### 2.3 mid-input slash command 检测（基础版）

- 在 `InputPrompt` 中检测光标附近的 slash token（不限于行首）
- 检测到 slash token 后通过 inline ghost text 提示最佳匹配命令名（Tab 接受）
- **不**包含 dropdown 补全菜单、argument hints、source badge 等（Phase 3 做）
- ghost text 候选集仅限 `modelInvocable: true` 的命令（skill / file command）

### 验收标准

**2.1 命令扩展**

- [ ] A 类：`/copy`、`/export`、`/plan`、`/restore`、`/language`、`/statusline` 在 non-interactive 和 acp 模式下可正常执行并返回有意义的文本输出
- [ ] A' 类：`/model`、`/approval-mode` 无参数时在 non-interactive/acp 下返回当前状态文本（不触发 dialog）；有参数时执行变更并返回确认文本
- [ ] B 类：`/about`、`/stats`、`/docs` 在 non-interactive/acp 下返回纯文本，`/docs` 不打开浏览器；`/insight` 在 `non_interactive` 下同步生成并返回文件路径 message，在 `acp` 下通过 `stream_messages` 推送进度
- [ ] C 类：`/clear` 在 non-interactive/acp 下返回上下文边界标记 message，不调用 `context.ui.clear()`
- [ ] 所有扩展命令在 interactive 模式下行为与重构前完全一致（无退化）

**2.2 模型调用**

- [ ] 模型在对话中可以通过 `SkillTool` 调用 bundled skill、file command（用户/项目）
- [ ] MCP prompt 不经过 `SkillTool`，通过 MCP tool call 机制由模型原生调用
- [ ] 模型不可以调用 built-in commands（`userInvocable: true`，`modelInvocable: false`）
- [ ] `SkillTool` 的 description 包含所有 `modelInvocable` 命令的描述

**2.3 mid-input slash**

- [ ] mid-input slash：在正文中输入 `/` 后通过 inline ghost text 提示最佳匹配命令（Tab 接受）

---

## Phase 3：体验对齐（补全增强 + Claude Code 命令补齐）

### 目标

在 Phase 1/2 的元数据和命令能力基础上，补齐补全体验，并补充 Claude Code 中存在而 Qwen Code 缺失的命令。

### 功能点

#### 3.1 补全体验增强

**source badge**

- 在补全菜单中展示命令来源标签（`[MCP]` 已有，扩展为 `[Skill]`、`[Custom]` 等）
- 使用 `source` / `sourceLabel` 字段渲染

**argument hint**

- 补全菜单中命令名后展示 `argumentHint`（如 `set <model-id>`）
- `argumentHint` 由 Phase 1 元数据字段提供

**recently used 排序**

- 记录用户最近使用的命令（session 级别，无需持久化）
- 在补全排序中给近期使用的命令加权

**alias 命中高亮**

- 当补全命中 `altNames` 而非主名时，在展示时注明（如 `help (alias: ?)`）

**冲突策略对齐**

- 明确优先级：built-in > bundled/skill-dir > plugin > mcp
- 冲突时将低优先级命令重命名（如 `pluginName.commandName`）

#### 3.2 mid-input slash command 完整版

- 在 Phase 2 基础版上增加 argument hints 和 source badge 展示
- ghost text 提示（输入 `/he` 时显示 `/help` 的淡色提示）
- 有效命令 token 高亮（已完成匹配的 slash command 显示不同颜色）

#### 3.3 Help 目录重构

将 `/help` 从平铺列表改为分组目录：

- **Built-in Commands**（local + local-jsx，注明 mode）
- **Bundled Skills**
- **Custom Commands**（用户/项目 file commands）
- **Plugin Commands**
- **MCP Commands**

每条命令展示：名称、argumentHint、description、source、supportedModes 标记

#### 3.4 ACP available commands 元数据增强

在 `sendAvailableCommandsUpdate()` 中将更多元数据暴露给 ACP 客户端：

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands`（名称列表）
- `modelInvocable`

#### 3.5 Claude Code 缺失命令补齐

确认并回归 Qwen Code 已有的 `/doctor` 命令；`/release-notes` 不纳入本阶段，避免引入无明确产品需求的 built-in 命令表面。

| 命令      | 类型    | 说明                                   |
| --------- | ------- | -------------------------------------- |
| `/doctor` | `local` | 环境自检，输出配置/连接/工具状态诊断   |

> 注：`/review`、`/commit` 等任务类命令以 bundled skill 形式提供，不在此列。

### 验收标准

- [ ] 补全菜单展示 source badge（`[MCP]`、`[Skill]`、`[Custom]`）
- [ ] 补全菜单展示 argumentHint（如 `set <model-id>`）
- [ ] 近期使用的命令在补全列表中优先出现
- [ ] alias 命中时在补全项中注明原名
- [ ] mid-input slash：ghost text 提示正确渲染
- [ ] `/help` 以 Claude Code 风格分 tab 展示，避免命令堆砌，并在命令页展示支持模式标记
- [ ] ACP available commands 包含 `argumentHint`、`source`、`subcommands` 字段
- [ ] `/doctor` 命令可用
- [ ] `/doctor` 在 non-interactive 模式下可执行（返回 `message`）
- [ ] 不新增 `/release-notes`
---

## Зависимости фаз

```
Phase 1（元数据 + 统一过滤）
    │
    ├──► Phase 2（能力扩展）
    │        │
    │        ├──► slash command 子命令拆分
    │        └──► prompt command 模型调用（需要 getModelInvocableCommands()）
    │
    └──► Phase 3（体验对齐）
             │
             ├──► source badge（需要 Phase 1 source 字段）
             ├──► argument hint（需要 Phase 1 argumentHint 字段）
             └──► Help 分组（需要 Phase 1 source 字段）
```

Фазы 2 и 3 не зависят друг от друга, их можно разрабатывать параллельно (или менять порядок подзадач в зависимости от приоритета).
