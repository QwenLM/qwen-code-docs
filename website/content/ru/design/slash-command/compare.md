# План рефакторинга модуля команд Qwen Code

## 1. Определение целей

Данный план основан на единственном принципе:

- **Архитектура кода не обязана копировать Claude Code**
- **Но основные функции, пользовательский опыт и интерактивность системы команд должны соответствовать Claude Code на 95%**

Под «соответствием» здесь понимаются возможности, напрямую воспринимаемые пользователем, включая:

1. Покрытие источников команд
2. Справка по командам и их обнаруживаемость
3. Автодополнение команд и опыт работы с mid-input slash command
4. Доступность в режимах ACP / non-interactive
5. Возможность вызова моделей через prompt command / skill

Этот рефакторинг — не просто добавление нескольких полей и не косметическая правка существующего `SlashCommand`. Это апгрейд модуля команд из «дополнительной функции интерактивного UI» до «единой платформы команд для interactive / ACP / non-interactive / model».

---

## 2. Выводы после пересмотра

Проблема текущей системы команд Qwen не в полном отсутствии функциональности, а в следующем:

1. Полноценно работает только в основном interactive-пути
2. Типизированная модель слишком упрощена и не поддерживает продуктовые возможности уровня Claude
3. ACP / non-interactive зависят от белого списка, что крайне плохо масштабируется
4. Источники команд существуют, но не формируют единого понятного представления для пользователя
5. Разрозненность между prompt command и системой экспорта model skills

Поэтому новый план должен одновременно решить четыре задачи:

1. **Восполнить функциональные возможности Claude Code**
2. **Сохранить инженерные преимущества единой модели outcome в Qwen**
3. **Создать единую архитектуру registry / resolver / executor / adapter**
4. **Обеспечить использование единого набора метаданных для справки, автодополнения, ACP available commands и документации**

---

## 3. Принципы рефакторинга

### 3.1 Функциональное соответствие важнее соответствия реализации

Допускаются различия в:

- Именах внутренних классов
- Способе разделения модулей
- Реализации исполнителей (executors)
- Структуре effect / outcome

Не допускаются различия в:

- Заметном сокращении покрытия источников команд
- Заметном ухудшении опыта работы со справкой и автодополнением команд
- Заметном снижении доступности в режимах ACP / non-interactive
- Заметном ухудшении интеграции prompt command с возможностями моделей

При необходимости выбора приоритеты следующие:

1. Соответствие пользовательского опыта
2. Соответствие покрытия возможностей команд
3. Соответствие согласованности режимов
4. Простота внутренней реализации

### 3.2 Сохранение единой модели outcome в Qwen

Не рекомендуется механически копировать реализацию выполнения из Claude.

Текущая единая модель результатов Qwen по-прежнему заслуживает сохранения, так как она идеально подходит для:

- Управления UI
- Утверждения/подтверждения
- Диспетчеризации инструментов (tools)
- Отправки промптов
- Адаптации между режимами

Однако её необходимо обновить, чтобы она могла поддерживать возможности команд уровня Claude, а не оставаться упрощенным фреймворком UI-команд.

### 3.3 Полное разделение типов, источников, режимов и видимости

Новая модель команд должна как минимум разделять следующие аспекты:

1. **Тип**: как выполняется команда
2. **Источник**: откуда берется команда
3. **Возможности режимов**: в каких средах выполнения доступна
4. **Видимость**: видна пользователю или модели

---

## 4. Возможности Claude Code, требующие соответствия

### 4.1 Типы команд

Qwen должен явно поддерживать три типа команд:

1. `prompt`
2. `local`
3. `local-jsx`

### 4.2 Источники команд

Схема команд Qwen с первого этапа должна покрывать следующие источники:

1. built-in commands
2. bundled skills
3. skill dir commands
4. workflow commands
5. plugin commands
6. plugin skills
7. dynamic skills
8. mcp prompts
9. mcp skills

Здесь нельзя откатываться к подходу «сначала поддержим только те, что уже есть».

### 4.3 Метаданные команд

Необходимо как минимум добавить следующие поля:

1. `argumentHint`
2. `whenToUse`
3. `examples`
4. `sourceLabel`
5. `userFacingName`
6. `alias`
7. `immediate`
8. `isSensitive`
9. `userInvocable`
10. `modelInvocable`
11. `supportedModes`
12. `requiresUi`

### 4.4 Возможности пользовательского опыта

Необходимо как минимум реализовать следующие элементы опыта:

1. Автодополнение при совпадении с alias
2. source badge
3. Подсказки по аргументам
4. Сортировка по recently used
5. Обнаружение и автодополнение mid-input slash command
6. Справка в виде каталога команд
7. Полное представление ACP available commands

---

## 5. Новая модель команд

## 5.1 Базовая структура

Рекомендуется ввести единый `CommandDescriptor` в качестве формата регистрации для всех команд.

Он должен содержать как минимум четыре части:

1. `identity`
2. `metadata`
3. `capabilities`
4. `handler`

### `identity`

- `id`
- `name`
- `altNames`
- `canonicalPath`

### `metadata`

- `description`
- `argumentHint`
- `whenToUse`
- `examples`
- `group`
- `source`
- `sourceLabel`
- `userFacingName`
- `hidden`

### `capabilities`

- `type`: `prompt | local | local-jsx`
- `supportedModes`: `interactive | acp | non_interactive`
- `requiresUi`
- `supportsDialog`
- `supportsStreaming`
- `supportsToolInvocation`
- `supportsConfirmation`
- `remoteSafe`
- `readOnly`
- `immediate`
- `isSensitive`
- `userInvocable`
- `modelInvocable`

### `handler`

- `resolveArgs()`
- `execute()`
- `completion()`
- `fallback()`

---

## 5.2 Ответственность трех типов команд

### `prompt`

Используется для:

- skills
- file commands
- workflow prompt commands
- plugin skills
- mcp prompt / skill

Особенности:

- Генерирует артефакты prompt / skill
- По умолчанию поддерживает interactive / ACP / non-interactive
- Может вызываться как пользователем, так и моделью

### `local`

Используется для:

- Команд запросов
- Команд конфигурации
- Команд состояния, выполняемых в headless-режиме
- Основного entry point выполнения для большинства built-in commands

Особенности:

- Не зависит от UI
- Должен стать основным типом для ACP / non-interactive

### `local-jsx`

Используется для:

- picker
- панелей
- wizard
- interactive UI shell

Особенности:

- Обрабатывает только interactive UI
- Больше не может быть единственным entry point выполнения
- Должен предоставлять fallback или соответствующую локальную подкоманду

---

## 6. Модель источников команд

## 6.1 Модель внешних источников

Это модель источников для пользователя, она должна максимально соответствовать ментальной модели Claude Code:

- `builtin-command`
- `bundled-skill`
- `skill-dir-command`
- `workflow-command`
- `plugin-command`
- `plugin-skill`
- `dynamic-skill`
- `builtin-plugin-skill`
- `mcp-prompt`
- `mcp-skill`

Этот набор полей будет напрямую использоваться для:

- Группировки в справке
- Completion source badge
- ACP available commands
- Экспорта документации

## 6.2 Модель внутренней нормализации

Чтобы не зависеть от внешних имен, добавим внутренний слой полей реализации:

- `providerType`
- `artifactType`
- `activationMode`
- `builtinProvided`
- `originPath`
- `namespace`

Это позволит:

- Соответствовать внешнему опыту Claude
- Сохранить поддерживаемость внутренней реализации в Qwen

## 6.3 Стратегия разрешения конфликтов

Единое управление через стабильный `id`, разделение отображаемого и вводимого имени:

1. `id`: стабильный уникальный идентификатор
2. `name`: основное имя для ввода
3. `userFacingName`: имя для отображения в справке/автодополнении

Рекомендуемые приоритеты при конфликтах:

1. built-in
2. bundled / skill-dir / workflow
3. plugin / builtin-plugin
4. dynamic
5. mcp с отдельным namespace

---

## 7. Единая архитектура выполнения

## 7.1 `CommandRegistry`

Ответственность:

1. Агрегация всех loader/provider
2. Создание многомерных индексов
3. Вывод представлений для справки, автодополнения, ACP и документации
4. Предоставление отдельных представлений для команд, видимых пользователю, и команд, видимых модели

Обязательные для поддержки provider:

1. `BuiltinCommandLoader`
2. `BundledSkillLoader`
3. `FileCommandLoader`
4. `McpPromptLoader`
5. `WorkflowCommandLoader`
6. `PluginCommandLoader`
7. `PluginSkillLoader`
8. `DynamicSkillProvider`
9. `BuiltinPluginSkillLoader`

Даже если некоторые provider не будут полностью реализованы на первом этапе, schema и API должны их поддерживать заранее.

## 7.2 `CommandResolver`

Ответственность:

1. Парсинг slash command
2. Парсинг alias
3. Парсинг subcommand path
4. Распознавание mid-input slash token
5. Вывод canonical resolved command

## 7.3 `CommandExecutor`

Ответственность:

1. Проверка capabilities
2. Выполнение `prompt | local | local-jsx`
3. Единая генерация outcome
4. Обработка fallback / unsupported

## 7.4 `ModeAdapter`

Необходимо выделить три adapter:

1. `InteractiveModeAdapter`
2. `AcpModeAdapter`
3. `NonInteractiveModeAdapter`

Это позволит трем режимам использовать единые command registry и executor, вместо хардкода для каждого.

---

## 8. Принципы рефакторинга UI-команд: разделение ядра команды и интерактивной оболочки

Это ключевой момент для реальной доступности в ACP и non-interactive.

Все команды, которые по сути сейчас «открывают dialog», должны быть преобразованы в:

1. Один interactive shell
2. Набор локальных подкоманд

### Первый набор команд, подлежащих разделению

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

### Пример целевой структуры

#### `/model`

- `/model`
- `/model show`
- `/model list`
- `/model set <id>`

#### `/permissions`

- `/permissions`
- `/permissions show`
- `/permissions set <mode>`
- `/permissions allow <tool>`
- `/permissions deny <tool>`

#### `/mcp`

- `/mcp`
- `/mcp list`
- `/mcp show <server>`
- `/mcp enable <server>`
- `/mcp disable <server>`

---

## 9. Единый дизайн Prompt Command / Skill

Это задача P0 в рамках рефакторинга, а не дополнительная возможность.

## 9.1 Цель

Создать единый **Model-Invocable Prompt Command Registry**, объединяющий следующие артефакты в единое представление, вызываемое моделью:

1. bundled skills
2. file commands
3. workflow prompt commands
4. plugin skills
5. mcp prompts / mcp skills

## 9.2 Ключевые поля

Обязательно добавить:

1. `userInvocable`
2. `modelInvocable`
3. `allowedTools`
4. `whenToUse`
5. `argSchema` или минимальное описание параметров
6. `contextMode: inline | fork`
7. `agent`
8. `effort`

## 9.3 Взаимосвязь с `SkillTool`

После рефакторинга `SkillTool` не должен потреблять только узкий набор skills.

Необходимо изменить на:

1. `CommandRegistry.getModelInvocablePromptCommands()` генерирует единое представление
2. `SkillTool` или будущий единый command tool потребляет это представление
3. Пользовательские slash command и model skill invocation используют единый пул артефактов prompt-command

Только так Qwen сможет приблизиться к опыту Claude в обработке таких возможностей, как `/review`, `/commit`, `/openspec-apply`.

---

## 10. Переработка Help / Completion / Discoverability

## 10.1 Completion

Элементы автодополнения должны как минимум отображать:

1. `label`
2. `description`
3. `argumentHint`
4. `sourceBadge`
5. `modeBadges`
6. `aliasHit`
7. `recentlyUsedScore`

Сортировка должна как минимум учитывать:

1. Точное совпадение
2. Совпадение с alias
3. Недавнее использование
4. Совпадение по префиксу
5. Нечеткое совпадение (fuzzy)

## 10.2 Mid-input slash command

Необходимо реализовать:

1. Обнаружение slash token рядом с курсором
2. Подсказки в ghost text
3. Завершение по Tab
4. Подсветка валидных command token

На первом этапе выравниваем опыт ввода; вопрос внедрения более мощной «семантики встроенного выполнения команд» можно рассмотреть в следующих итерациях.

## 10.3 Help

Help больше не будет плоским списком, а станет полным каталогом команд.

Минимальная группировка:

1. Built-in Commands
2. Bundled Skills
3. Skill Dir Commands
4. Workflow Commands
5. Plugin Commands
6. Plugin Skills
7. Dynamic Skills
8. Builtin Plugin Skills
9. MCP Commands / MCP Skills

Для каждой команды как минимум отображать:

1. Имя
2. Подсказка по аргументам
3. Описание
4. Источник
5. Поддерживаемые режимы
6. Доступность для вызова моделью
7. Сводка по подкомандам

---

## 11. Рефакторинг ACP / Non-Interactive

## 11.1 Полный отказ от подхода с белым списком

Старый подход:

- built-in allowlist
- Специальная обработка FILE / SKILL
- Остальные типы результатов unsupported

Новый подход:

- Каждая команда самостоятельно декларирует свои capabilities
- registry отвечает за фильтрацию
- adapter отвечает за выполнение и fallback

## 11.2 Целевые поддерживаемые outcome

### interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `dialog`
- `load_history`
- `confirm_action`
- `confirm_shell_commands`

### acp

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback`

### non_interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback / structured failure`

## 11.3 Вывод ACP available commands

Должен как минимум содержать:

1. `name`
2. `description`
3. `argumentHint`
4. `source`
5. `examples`
6. `supportedModes`
7. `interactiveOnly`
8. `subcommands`
9. `modelInvocable`

---

## 12. Документация, справка и автодополнение используют единые метаданные

После рефакторинга следующие элементы должны экспортироваться из одного представления registry:

1. Help
2. Completion
3. ACP available commands
4. Экспорт документации

Это решит текущую проблему «рассогласованности трех представлений команд: реализации, справки и документации».

---

## 13. Этапы реализации

## Phase 1: Перестройка фундамента

Результаты:

1. Новый `CommandDescriptor`
2. Полная схема источников
3. Модель capabilities
4. `userInvocable / modelInvocable`
5. `CommandRegistry`
6. `CommandResolver`
7. `CommandExecutor`
8. Три `ModeAdapter`
9. `getModelInvocablePromptCommands()`

## Phase 2: Миграция основных команд

Результаты:

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

Все эти команды должны пройти рефакторинг по схеме «interactive shell + локальные подкоманды».

## Phase 3: Интеграция возможностей моделей

Результаты:

1. Подключение `SkillTool` к единому представлению registry
2. Включение file command / bundled skill / mcp prompt / plugin skill в единое model-invocable множество
3. Полное объединение артефактов prompt command и skill

## Phase 4: Выравнивание уровня опыта с Claude

Результаты:

1. Сортировка по recently used
2. source badge
3. argument hint
4. mode badge
5. Полный каталог help
6. Опыт работы с mid-input slash command
7. Автоматический экспорт или валидация документации

---

## 14. Критерии приемки

После завершения должны быть выполнены как минимум следующие условия:

1. Help, Completion, ACP и документация должны полностью отражать модель источников
2. За исключением чисто UI-оболочек, большинство built-in command должны быть доступны в ACP / non-interactive
3. prompt command и вызов model skill должны использовать единый пул артефактов
4. Опыт работы с командами (справка, автодополнение, отображение источников, подсказки аргументов, mid-input) должен соответствовать уровню Claude Code на 95%
5. Поддержка возможностей команд в ACP / non-interactive больше не должна зависеть от built-in allowlist

---

## 15. Итоговое заключение

Суть этого рефакторинга не в том, чтобы «добавить несколько полей в существующий SlashCommand», а в следующем:

- **Используя внутренний архитектурный стиль Qwen, создать платформу команд, внешний опыт которой соответствует Claude Code на 95%**

Если придется выбирать между:

- Внутренней реализацией, более похожей на Claude
- Внешним опытом, более похожим на Claude

Данный план однозначно выбирает второе.