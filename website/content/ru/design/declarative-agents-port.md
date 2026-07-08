# Декларативные определения агентов — портирование из Claude Code 2.1.168

Внутренний проектный документ по портированию схемы декларативных агентов (markdown +
YAML frontmatter) из Claude Code в qwen-code. Решает задачу [#4821][i4821] и
координируется с портированием workflow в задаче [#4721][i4721] / PR [#4732][p4732].

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## Статус реализации (вертикальные срезы)

PR [#4842][p4842] выпустил поля с end-to-end runtime-путём на тот момент. PR [#4870][p4870]
затем заменил YAML-парсер для поддержки блочных скаляров. Этот follow-up PR
строится на обоих: он заменяет YAML-**сериализатор** (в PR #4870 он был написан
вручную — см. `docs/design/yaml-parser-replacement.md`), выводит `mcpServers` + `hooks` в
`SubagentConfig` и подключает их к runtime, чтобы per-agent MCP-серверы
и хуки действительно срабатывали при запуске подагента.

| Поле              | Статус                  | Примечания                                                                                                                                                          |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | **выпущено (#4842)**    | связывается с существующим в qwen `approvalMode` на этапе парсинга                                                                                                  |
| `maxTurns`        | **выпущено (#4842)**    | подключено к существующему runtime-пути `runConfig.max_turns`                                                                                                       |
| `color` allowlist | **выпущено (#4842)**    | ужесточает существующее поле до набора `_Y` из CC + обработка legacy-сентинела `auto`                                                                               |
| `mcpServers`      | **выпущено (follow-up)**| вложенный YAML безопасен при round-trip благодаря eemeli/`yaml` stringify; runtime-переопределение объединяет серверы сессии и агента через Config-обёртку подагента + принудительная пересборка tool-registry |
| `hooks`           | **выпущено (follow-up)**| эфемерные записи HookRegistry регистрируются при создании подагента, удаляются через `onStop`; v1 срабатывает глобально (без фильтра по области действия агента)    |
| `effort`          | отложено                | в провайдерах qwen пока нет параметра `effort` на уровне модели                                                                                                     |
| `memory`          | отложено                | в auto-memory qwen пока нет разделения на области `user`/`project`/`local`                                                                                          |
| `isolation`       | отложено                | runtime принадлежит workflow из PR #4732; дефолтное значение для агента появится вместе с ним                                                                       |
| `initialPrompt`   | отложено                | требует CLI-флаг `--agent` (в qwen нет инфраструктуры main-session-agent)                                                                                           |
| `skills`          | отложено                | требует потребления `config.skills` через SkillManager                                                                                                              |

Полная запись обратного инжиниринга ниже сохранена как проектный эталон
для отложенных полей — константы схемы, семантика DL7/Ig5, сообщения
об ошибках и матрица координации с workflow по-прежнему критичны для этой работы.

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## Фаза 0 — Границы

| Пункт                    | Значение                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Проверенный upstream     | Claude Code **2.1.168** (задача #4821 ссылается на ≥ 2.1.167, мы на один релиз выше)                                                     |
| Нативный бинарник        | `/private/tmp/cc-2.1.168/package/claude` (220 МБ)                                                                                         |
| Извлечённые строки       | `/private/tmp/cc-2.1.168/claude.strings` (~342 тыс. строк)                                                                                |
| Worktree                 | `.claude/worktrees/gifted-hamilton-684741`                                                                                                |
| Ветка                    | `lazzy/gifted-hamilton-684741` от `main @ 45efb1d3a`                                                                                      |
| Вне скоупа               | Код workflow из PR #4732 (отдельный worktree `lazzy/lucid-pare-974192`) — координируемся только через интерфейс                           |
| Правило авторства        | Автор — **LaZzyMan**; **никаких** `Co-Authored-By` или трейлеров AI-инструментов в коммитах, PR, задачах или комментариях (согласно `~/.claude/CLAUDE.md`) |

---

## Фаза 1 — Результаты обратного инжиниринга

Все утверждения здесь были независимо проверены через grep по `claude.strings` и
выдержали состязательное опровержение. Уровни уверенности: **C** = Confirmed (подтверждено,
есть прямые доказательства в бинарнике), **I** = Inferred (выведено из нескольких
подтверждённых фактов), **O** = Open (открыто, всё ещё не определено).

### Схема — 15 полей, опровергнутых и подтверждённых

Теневая схема frontmatter агента — это `Ig5`, используется внутри `ug5.agent`
для телеметрии `tengu_frontmatter_shadow_unknown_key` / `_mismatch`.
**Продакшн-загрузчик — это `DL7`** (`parseAgentFromMarkdown`), который выполняет
написанную вручную попольную валидацию с кастомными сообщениями об ошибках. Отдельная
**JSON-схема `JL7`** (используется `fL7` / `parseAgentFromJson`) более строгая,
но это другой путь кода (используется для `--agents <json>` и
`settings.agents`).

| #   | Поле              | Тип (Ig5 / DL7)                         | Обязательно | По умолчанию | Enum / Ограничение                                                                                                                      | Уверенность                                 |
| --- | ----------------- | --------------------------------------- | ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `name`            | string, non-empty                       | **да**      | —            | нет — DL7: `if(!T\|\|typeof T!=="string")return null`                                                                                   | **C** strings:308120, 309074                |
| 2   | `description`     | string, non-empty                       | **да**      | —            | JL7: `.min(1, "Description cannot be empty")`                                                                                           | **C** strings:308120, 309074, 309076        |
| 3   | `model`           | string                                  | нет         | undefined    | `inherit` (case-insensitive) нормализуется в литерал `"inherit"`; иначе передаётся как есть с trim                                      | **C** strings:308120, 309075, 309076        |
| 4   | `tools`           | string\|array (MDH union)               | нет         | undefined    | одиночный токен `*` → `undefined` (означает "наследовать все"); дублируется через `AXH`/`FbK`                                           | **C** strings:308120 (MDH/AXH), 309075      |
| 5   | `disallowedTools` | string\|array (MDH)                     | нет         | undefined    | "Игнорируется, если задан `tools`" (согласно описанию); применяется вызывающим кодом                                                    | **C** strings:308120, 309075                |
| 6   | `effort`          | string\|integer                         | нет         | undefined    | enum `GN=["low","medium","high","xhigh","max"]` ИЛИ `int`; алиас `P37={med:"medium"}`                                                   | **C** strings:308120, 309075, GN/P37 inline |
| 7   | `permissionMode`  | string                                  | нет         | undefined    | enum `$E = Gmq = [...kc]`, где `kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]` (6 значений)                  | **C** strings:307649 (kc), 308120, 309075   |
| 8   | `mcpServers`      | `z.unknown()` (Ig5); `array(jL7)` (JL7)| нет         | undefined    | каждый элемент: string ИЛИ `record(string, MCPServerSpec)`; попольный `safeParse` в DL7                                                 | **C** strings:308120, 309075, 309076        |
| 9   | `hooks`           | `z.unknown()` (Ig5); `_u()` (JL7)       | нет         | undefined    | валидируется лениво в runtime через `TKO` → `_u().safeParse` (форма хуков из settings.json)                                             | **C** strings:308120, 309073 (TKO), 309076  |
| 10  | `maxTurns`        | `union(number, string, null)`           | нет         | undefined    | положительное целое число (парсится через `W46` — принимает число или числовую строку)                                                  | **C** strings:308120, 309075 (W46), 309076  |
| 11  | `skills`          | string\|array (MDH)                     | нет         | `[]` (в выводе)| нормализуется через `ml(q.skills) = FbK(H) ?? []`; нет wildcard `*` (в отличие от `tools`)                                              | **C** strings:308120, 309075                |
| 12  | `initialPrompt`   | string                                  | нет         | undefined    | только пробелы → undefined; авто-сабмитится только если агент является **основной сессией** (через `--agent` / settings), игнорируется как подагент | **C** strings:308120, 309075                |
| 13  | `memory`          | string                                  | нет         | undefined    | enum `["user","project","local"]`                                                                                                       | **C** strings:308120, 309075, 309076        |
| 14  | `background`      | string\|bool (eiH=EL8)                  | нет         | undefined    | принимает `true` / `false` / `"true"` / `"false"`; только truthy нормализуется в `true`, иначе `undefined`                              | **C** strings:308120, 309075                |
| 15  | `isolation`       | string                                  | нет         | undefined    | enum **только** `["worktree"]` (НЕ `["none","worktree"]` — это другая схема в strings:313284 для настроек background-session)           | **C** strings:308120, 309075, 309076        |

Тонкое наблюдение, выдержавшее опровержение: хотя `skills` и является "опциональным",
emit-выражение в DL7 выглядит как `...I !== void 0 && {skills: I}`, а `ml(undefined)`
возвращает `[]` (не undefined), поэтому **итоговая выгружаемая запись будет содержать
`skills: []`, даже если поле отсутствует во frontmatter**. Это влияет на проверки
на равенство ниже по коду — учтите это при портировании в qwen-code.

### Возможные дополнительные поля помимо 15

| #   | Поле        | Тип    | По умолчанию | Enum / Ограничение                                                                                                                                                                                                                                                 | Уверенность                              |
| --- | ----------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 16  | **`color`** | string | undefined    | enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; описывается как `"@internal — display color in the agents UI"`; значения вне `_Y` молча отбрасываются при парсинге (DL7 выводит `...z && typeof z === "string" && _Y.includes(z) && {color: z}`) | **C** strings:308120, 309075, \_Y inline |
Это **единственное** новое поле agent-frontmatter сверх списка из #4821. Поля, которые искали, но **НЕ** нашли в `Ig5` / `JL7`: `version`, `tags`, `labels`, `category`, `icon`, `alias` / `aliases`, `experimental`, `deprecated`, `owner`, `author`, `homepage`, `displayName`, `shortDescription` (все они встретились только в схеме skill `bg5` или в нерелевантных идентификаторах).

### Loader — карта файлов и функций

| Задача | Функция | Расположение | Conf |
| --- | --- | --- | --- |
| Сборщик реестра верхнего уровня | `QL` (экспортируется как `getAgentDefinitionsWithOverrides`) | strings:309076 | **C** |
| Обходчик файловой системы (общий для skills/commands/output-styles) | `Gm` (мемоизируется через `h6`) | strings:312887 | **C** |
| Обнаружение для каждого `.md` | `d_q` (= `loadMarkdownFiles`, ripgrep с `--files --hidden --follow --no-ignore --glob *.md`, 3 с `AbortSignal.timeout`, фоллбэк `wY3` при `__("true")`) | strings:312887 | **C** |
| Парсер для каждого файла (markdown) | `DL7` (= `parseAgentFromMarkdown`) | strings:309074 | **C** |
| Парсер для каждого файла (JSON) | `fL7` (= `parseAgentFromJson`), использует схему `JL7` | strings:309073 | **C** |
| Загрузчик плагинов агентов | `b0_` → для каждой директории `oR7` → для каждого файла `sR7` | strings:308780, 308779 | **C** |
| Встроенные | `naH()` — возвращает `[JqH=general-purpose, KL7=statusline-setup, …]` плюс неявный `YI=fork` | strings:309073, 308663 | **C** |
| Резолвер переопределений | `DS()` (= `getActiveAgentsFromList`) — см. порядок разрешения | strings:309073 | **C** |
| Инвалидация кэша | `u0_()` (= `clearAgentDefinitionsCache`) — очищает `QL.cache` + `Gm.cache` | strings:309073 | **C** |
| Вотчер ФС (chokidar) | `s_T()` → `Q4_=s_T()` при инициализации модуля (`WB6`) | strings:316417 | **C** |

`Gm("agents", _)` читает три базовые директории (`policySettings`, `userSettings`, `projectSettings`), помечая каждую в записи, затем дедуплицирует по **inode** (отбрасывает дубликаты с одинаковым inode от симлинков / хардлинков, логирует `Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)`). Телеметрия: `tengu_dir_search` с параметрами `managedFilesFound`, `userFilesFound`, `projectFilesFound`, `projectDirsSearched`, `subdir`.

### Порядок разрешения (Resolution order) — окончательный приоритет

Функция `DS()` фильтрует входные данные по `source`, затем итерирует массив фиксированного порядка в `Map`, где ключом выступает `agentType`. Поскольку `Map.set` перезаписывает значения, **побеждает ПОСЛЕДНИЙ затронутый бакет**:

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  highest precedence
```

| Источник | Происхождение | Приоритет переопределения | Conf |
| --- | --- | --- | --- |
| `built-in` | `naH()` (захардкожено в бинарнике) | 1 (самый низкий) | **C** strings:309073 |
| `plugin` | `b0_` → для каждого плагина `agentsPath`/`agentsPaths` | 2 | **C** strings:308780 |
| `userSettings` | `~/.claude/agents/` (`CLAUDE_CONFIG_DIR` или `~/.claude`) | 3 | **C** strings:312887, 307489 |
| `projectSettings` | `<cwd>/.claude/agents/` ПЛЮС обход `iV_()` вверх до homedir / git root | 4 | **C** strings:312887, iV\_ inline |
| `flagSettings` | CLI-флаг `--agents <json>` (схема `qKO = h.record(h.string(), JL7())`) | 5 | **C** strings:330190, 309076 |
| `policySettings` | системная директория: macOS `/Library/Application Support/ClaudeCode/.claude/agents`, Linux `/etc/claude-code/.claude/agents`, Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6 (самый высокий) | **C** strings:307649 (H2), 312887 |

Коллизии разрешаются **молча** — срабатывает только телеметрическое событие `tengu_plugin_name_collision` (`winner_source: T.at(-1)`); пользователю не показывается предупреждение "X overrides built-in". (strings:308742 `hMH`.)

Тонкий момент в поведении: `iV_()` обходит директории **от самых вложенных**, поднимаясь вверх от `cwd`, но поскольку в Map.set побеждает последнее значение, **`.claude/agents/` из внешнего дерева переопределяет внутреннее дерево** в рамках projectSettings. Это неожиданно — вынесено в открытые вопросы.

### Парсер frontmatter

| Вопрос | Ответ | Conf |
| --- | --- | --- |
| Используется ли библиотека? | **Нет** — самописный сплиттер `lz`, вызывающий `Bun.YAML.parse` (через обёртку `l5H`). В бинарнике нет `gray-matter`, `js-yaml` или `front-matter`. | **C** strings:307902 (l5H), 307905 (lz), 110303 (ошибки Bun.YAML) |
| Регулярное выражение | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/` | **C** strings:307905 |
| Обработка ошибок | Ошибка парсинга YAML → повторная попытка с нормализацией табов в 2 пробела; если снова ошибка, логировать `Failed to parse YAML frontmatter in <file>: <err>` на уровне warn и вернуть `{frontmatter: {}, content: body}` (НИКОГДА не выбрасывает исключение) | **C** strings:307905, 151839 |
| Извлечение тела | Простой срез строки `H.slice(K[0].length)` после закрывающего `---`; позже нормализуется через `v$H` (вероятно, удаление начального перевода строки) | **C** strings:307905 |
| Используется ли совместно для agents / skills / commands / output-styles? | **Да** — тот же `lz` переиспользуется в `Iq_` (загрузчик skills), `f13` (загрузчик устаревших commands) и загрузчике агентов через `Gm` → `d_q` | **C** strings:312690 |
| Валидатор схемы | **Zod v4** (встроен). Присутствуют маркеры только для v4: `looseObject`, `treeifyError`, `prettifyError`, `toJSONSchema` | **C** strings:141270-141395, 141586 |
| Режим валидации | **Теневой** — `ahH("agent", frontmatter)` запускает `ug5.agent().strict().safeParse()` **только** для телеметрии; DL7 игнорирует результат и продолжает собственную валидацию по полям. Мягкий объект frontmatter является источником истины в рантайме. | **C** strings:308120 (ahH/ug5), 309074 (DL7 вызывает, но игнорирует) |
| События телеметрии | `tengu_frontmatter_shadow_unknown_key`, `tengu_frontmatter_shadow_mismatch` (дедупликация через внутрипроцессный `Set A37`) | **C** strings:154634, 154636 |

### Связывание — Agent tool + CLI-флаг

| Слой | Что делает | Conf |
| --- | --- | --- |
| Схема Task/Agent tool (`$_3`) | Объявляет `subagent_type: string.optional()`; если пропущено, используется фоллбэк на `general-purpose` (или `fork`, если `AI()` возвращает true) | **C** strings:~309220 |
| Поиск подагента | `activeAgents.find(a => a.agentType === requestedType)` по `toolUseContext.options.agentDefinitions.activeAgents` | **C** strings:~309220 |
| Нечёткий фоллбэк | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")`; неоднозначное совпадение → `AgentTypeError`; точное повторное совпадение → `tengu_subagent_type_normalized` | **C** strings:~309220 |
| Гейт разрешений | `lV_(toolPermissionContext, "Task", agentType)` — при отказе → `Agent type '<x>' has been denied by permission rule 'Task(<x>)' from <source>.` | **C** strings:~309220 |
| Источник системного промпта | Тело Markdown становится `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope) when memory enabled)` — замыкание захватывается во время парсинга | **C** strings:309074-6 (DL7) |
| Рендер в главном потоке | `Pp({mainThreadAgentDefinition, …})` — если у агента `appendSystemPrompt: true` (универсальный встроенный `claude`), тело добавляется к дефолтному; иначе **ЗАМЕНЯЕТ** дефолтное | **C** strings:311015 |
| CLI `--agent <name>` | Объявляется через Commander; обработчик действия `if(I) process.env.CLAUDE_CODE_AGENT = I;` — записывает в переменную окружения, которая в другом месте читается в `appState.agent`. Также записывается в pid-файл. | **C** strings:330190, 142138 |
| CLI `--agents <json>` | Отдельный флаг; JSON-запись `{name: {description, prompt, …}}` валидируется через `qKO = h.record(h.string(), JL7())`; присоединяется к тому же реестру `activeAgents` с `source: flagSettings` | **C** strings:330190, 309076 |
### Жизненный цикл — холодная загрузка + горячая перезагрузка

| Аспект                          | Поведение                                                                                                                                                                                                                  | Conf                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Холодная загрузка               | Ленивая — `QL` мемоизируется через `h6` (обертка кэша); первый доступ читает файловую систему + плагины, последующие доступы возвращают кэшированное                                                                                               | **C** strings:309076         |
| Механизм горячей перезагрузки   | **chokidar watcher** `s_T()` регистрируется при инициализации модуля (`WB6`); отслеживает `.claude/agents` (пользовательские + проектные), а также директории skills и commands                                                                                      | **C** strings:316417         |
| Флаги watcher                   | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4` (macOS true), события `add`/`change`/`unlink` | **C** strings:316417         |
| Дебаунс                         | 300 мс (`l_T = 300`); обработчик вызывает `RIH(), Vv(), u0_(), …` — `u0_()` инвалидирует кэш агентов                                                                                                                              | **C** strings:316417, 309073 |
| Адаптивный опрос                | активный = интервал `n_T = 2000 мс`; неактивный (нет взаимодействия в течение `r_T = 60000 мс`) → `i_T = 30000 мс`; пересоздает экземпляр chokidar при переключении                                                                                   | **C** strings:316417         |
| Слэш-команда `/agents`          | UI на `local-jsx` для управления агентами (Library/create/edit/delete/run) — **НЕ** команда пересканирования                                                                                                                             | **C** strings:314593         |
| Слэш-команда `/reload-plugins`  | Повторно запускает `QL(W8())`, пересчитывает агентов; охватывает агентов из плагинов (которые chokidar **НЕ** отслеживает)                                                                                                                         | **C** strings:314595, 190948 |
| Другие пути инвалидации         | `clearSessionCaches` (используется в `/clear`) также вызывает `u0_()`                                                                                                                                                                 | **C** strings:313246         |

### Открытые вопросы (Фаза 1)

| #   | Вопрос                                                                                                                                  | Conf  | Путь решения                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| Q1  | Является ли отсутствие `color` в #4821 намеренным (он помечен как `@internal`) или это упущение?                                                            | **O** | Считать **намеренным** — портировать поле, но пометить как internal/UI-only  |
| Q2  | Является ли мягкое поведение `DL7` (background принимает строки, maxTurns принимает строки) задокументированной функцией для пользователей или хаком для обратной совместимости? | **O** | Зеркально отразить для паритета, но предупредить в документации по портированию                             |
| Q3  | Почему enum `isolation` `["worktree"]` предназначен только для агентов, в то время как схема настроек фоновых сессий принимает `["none","worktree"]`?        | **O** | Вероятно, "no isolation" = пропущенное поле; явно задокументировать              |
| Q4  | Намеренно ли `--agents <json>` (flagSettings) имеет приоритет 5 (выше проекта, ниже политики)?                                    | **O** | qwen-code может пропустить этот флаг в v1, отложив решение                   |
| Q5  | Push от внутреннего к внешнему через `iV_` + Map.set (побеждает последний) → **побеждает внешнее дерево** при коллизиях projectSettings. Это скрытая угроза или намеренное поведение?           | **O** | qwen-code следует выбрать семантику **победы внутреннего** (innermost-wins), чтобы избежать скрытой угрозы |

---

## Фаза 2 — План реализации для qwen-code

### Текущее состояние — обзор в одном абзаце

qwen-code уже поставляется с обширной инфраструктурой подагентов:
`SubagentManager` (`packages/core/src/subagents/subagent-manager.ts`) реализует
CRUD над файлами markdown+YAML frontmatter в `.qwen/agents/` (проектные) и
`~/.qwen/agents/` (пользовательские), опираясь на кастомный YAML-парсер
(`packages/core/src/utils/yaml-parser.ts` — без зависимостей `gray-matter` / `yaml`,
что подтверждено в `package.json`). `SubagentConfig`
(`packages/core/src/subagents/types.ts:41-122`) уже содержит `name`,
`description`, `tools`, `disallowedTools`, `approvalMode`, `systemPrompt`,
`model`, `runConfig`, `color`, `background`. `SubagentLevel` уже поддерживает
пять областей видимости (session, project, user, extension, builtin) с приоритетом
`session > project > user > extension > builtin`
(`subagent-manager.ts:189-220`). Инструмент Agent
(`packages/core/src/tools/agent/agent.ts`) объявляет `subagent_type` и
динамически обновляет enum своей схемы через `subagentManager.changeListener`.
Мост `convertClaudeAgentConfig()` уже существует в
`packages/core/src/extension/claude-converter.ts:162-220` с маппингом имен инструментов
и маппингом `permissionMode → approvalMode`. **Пробел** заключается в следующем: (a) в схеме
отсутствуют 8 полей из #4821 (`effort`, `permissionMode` как первоклассное поле,
`mcpServers`, `hooks`, `maxTurns` как поле верхнего уровня,
`skills`, `initialPrompt`, `memory`, `isolation`); (b) нет CLI-флага `--agent <name>`;
(c) нет горячей перезагрузки в стиле chokidar (инвалидация в стиле расширений
есть, но не для файловых систем агентов); (d) `maxTurns` сейчас вложен в
`runConfig.max_turns` — его нужно поднять на верхний уровень согласно #2409.

### Архитектурные решения

#### D1. Переиспользовать существующий yaml-parser для frontmatter

**Решение:** Переиспользовать `packages/core/src/utils/yaml-parser.ts` (уже используется в
`SubagentManager.parseSubagentContent` и загрузчике skills).
**Обоснование:** `lz` в Claude Code — это тот же общий парсер, используемый для skills +
commands + agents; qwen-code уже повторяет этот паттерн. Добавление `gray-matter`
или `js-yaml` — это лишние изменения. Существующий парсер обрабатывает разделение `--- … ---`
и молчалив при некорректном вводе (соответствует подходу `lz`
`warn-and-return-empty`).

#### D2. Порядок разрешения / приоритетов

**Решение:** Использовать `session > project (.qwen/agents/) > user (~/.qwen/agents/) > extension > builtin` — т.е. **сохранить существующий порядок SubagentLevel в qwen-code, НЕ зеркалировать бакеты `flagSettings`/`policySettings` из Claude Code в v1**.
**Обоснование:** `policySettings` в Claude Code (управляемая директория) — это корпоративный сценарий развертывания, которого нет в qwen-code. Инжектируемые через флаги агенты (`--agents <json>`) — это фича для продвинутых пользователей, которую можно отложить до P4. Существующий пятиуровневый приоритет qwen-code уже покрывает случаи, важные для #4821: проект переопределяет пользователя, пользователь переопределяет встроенное. Уровень `extension` чисто встраивается между user и builtin.

#### D3. Валидация — оставить существующий SubagentValidator

**Решение:** Расширить `SubagentValidator`
(`packages/core/src/subagents/`) для валидации восьми новых полей. **НЕ**
внедрять zod, если пайплайн skillManager его еще не использует; если
существующий валидатор написан вручную, оставить его таким.
**Обоснование:** `Ig5` в Claude Code работает только в тени — рантайм-валидация
реализована вручную через `DL7`. Следование этому паттерну сохраняет читаемость
сообщений об ошибках (например, `Agent file <path> has invalid permissionMode '<x>'. Valid options: …`)
без привлечения еще одной зависимости. Если skillManager уже использует zod, следуйте этому
выбору для согласованности — TBD при чтении кода skills в рамках подготовки к P1.

#### D4. Горячая перезагрузка — отложить; полагаться на холодную загрузку + явную перезагрузку

**Решение:** v1 **НЕ** поставляется с chokidar watcher. Хуки инвалидации
кэша уже существуют (у `subagentManager` есть `changeListener` и явное
обновление, управляемое CRUD). Перезагрузка на уровне проекта происходит при старте сессии;
редактирование внутри сессии через UI `/agents` вызывает инвалидацию. Слэш-команда `/reload-agents`
(или использование `/reload-plugins`) может быть добавлена в P4, если будет запрос от пользователей.
**Обоснование:** Горячая перезагрузка через FS watcher ресурсоемка (chokidar добавляет цикл опроса
с адаптивным планированием — одна только реализация в Claude Code занимает ~150
строк служебного кода). Холодная загрузка при старте вполне достаточна для v1 и соответствует тому, как
`SubagentManager` подключен сегодня. Оставляем дверь открытой для P4.

#### D5. Подключить CLI-флаг --agent <name> — в скоупе v1

**Решение:** Добавить `--agent <name>` в CliArgs файла `packages/cli/src/config/config.ts`.
Поведение: искать в разрешенном реестре, устанавливать агента как
агента основного потока, выбрасывать понятную ошибку, если имя не разрешается. Соответствовать
семантике Claude Code (заменять системный промпт по умолчанию, если только у агента нет
`appendSystemPrompt: true`). **НЕ** использовать косвенную передачу через env-переменную
`CLAUDE_CODE_AGENT` — объект `Config` в qwen-code может хранить его напрямую.
**Обоснование:** Это точка входа для пользователя в #4821 — без нее декларативные
агенты доступны только через параметр `subagent_type` инструмента Agent, что
слишком косвенно для сценария "установить мой агент по умолчанию". `--agents <json>`
(во множественном числе) можно отложить до P4.

#### D6. Координация Workflow.agentType — контракт интерфейса

**Решение:** Предоставить стабильный интерфейс резолвера, который сможет вызывать
`createProductionDispatch` из PR #4732, когда он будет смержен. В частности:

| Контракт                                                                                                                                                                                                                                                                                                     | Владелец                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Frontmatter `name` — это и есть строка workflow `agentType` (равенство ключей, с учетом регистра)                                                                                                                                                                                                                         | этот PR              |
| Жестко заданный минимум `disallowedTools` в workflow (`[SEND_MESSAGE, EXIT_PLAN_MODE]`, зеркально от upstream `Tg8`; подтверждено в PR #4732 как `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) **ОБЪЕДИНЯЕТСЯ** (UNION) с `disallowedTools` на уровне агента — минимум применяется всегда, даже если в определении агента заданы `tools` | потребляется PR workflow |
| `opts.isolation` для каждого вызова переопределяет значение по умолчанию `isolation: 'worktree'` на уровне агента                                                                                                                                                                                                                                | потребляется PR workflow |
| Значения `model`, `effort`, `permissionMode`, `maxTurns` из определения агента переопределяют значения по умолчанию workflow, если они заданы                                                                                                                                                                                                    | потребляется PR workflow |
| Тело агента становится `systemPrompt` подагента; `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` workflow используется как фоллбэк, если `agentType` не разрешается                                                                                                                                                             | потребляется PR workflow |
| Если `agentType` не задан или не разрешается, workflow откатывается к встроенному подагенту workflow (корректно, без выброса ошибки)                                                                                                                                                                                        | потребляется PR workflow |
**Разрешение противоречия #4721 / #4821** (приоритет `tools` над `disallowedTools`): при этом портировании реестр агентов записывается так, что `disallowedTools` **всегда передается отдельно** от `tools`. Правило «игнорируется, если задан tools» из таблицы #4821 **применяется вызывающими сторонами Agent-tool** (т. е. при создании `ToolConfig` подагента), а не на этапе парсинга. Это позволяет рабочему процессу всегда объединять свой базовый набор с `disallowedTools` независимо от того, задан ли у агента `tools`. Реестр агентов выступает **пассивным переносчиком данных**; правила приоритета находятся в точке диспетчеризации. Это разрешает кажущийся конфликт между правилом «игнорируется» из #4821 и правилом «объединение» из #4721.

**Канонизация имен инструментов:** Используйте `ToolNames.SEND_MESSAGE` и `ToolNames.EXIT_PLAN_MODE` (проверено по диффу PR #4732), экспортируемые как именованные константы из `packages/core/src/agents/runtime/workflow-orchestrator.ts` после его слияния. Самому порту declarative-agents НЕ нужно импортировать их — это базовый набор рабочего процесса, применяемый в точке диспетчеризации рабочего процесса.

### Структура модулей

| Путь                                                               | Новый / Изменен | Назначение                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                             | **Изменен**   | Добавить 8 новых полей в `SubagentConfig`: `effort`, `permissionMode` (уже маппится через `approvalMode` — оставить оба? см. D7 ниже), `mcpServers`, `hooks`, `maxTurns` (вынести на верхний уровень, объявить `runConfig.max_turns` устаревшим), `skills`, `initialPrompt`, `memory`, `isolation` |
| `packages/core/src/subagents/subagent-manager.ts`                  | **Изменен**   | Расширить `parseSubagentContent` / `serializeSubagent` для полного цикла (чтения и записи) новых полей; расширить вызовы `SubagentValidator`                                                                                                                                                            |
| `packages/core/src/subagents/subagent-validator.ts` (предполагаемый путь) | **Изменен**   | Добавить валидацию для каждого поля в соответствии с сообщениями об ошибках из DL7: `Agent file <path> has invalid permissionMode '<x>'. Valid options: …` и т.д.                                                                                                                                       |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`          | **Новый**       | Единый источник истины для констант перечислений: `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES`. Зеркалирует Claude Code 2.1.168 без изменений.                                                                                           |
| `packages/core/src/subagents/builtin-agents.ts`                    | **Изменен**   | Новые поля по умолчанию равны undefined; изменения поведения нет                                                                                                                                                                                                                      |
| `packages/core/src/tools/agent/agent.ts`                           | **Изменен**   | Читать новые поля из разрешенного `SubagentConfig` при создании опций подагента (`model`, `maxTurns`, `permissionMode`, `effort`); пробросить семантику переопределения `isolation` для каждого вызова для #4721                                                                              |
| `packages/cli/src/config/config.ts`                                | **Изменен**   | Добавить флаг `--agent <name>`; разрешать его через `SubagentManager` при запуске; выдавать ошибку, если имя не разрешается                                                                                                                                                                    |
| `packages/cli/src/config/config.test.ts`                           | **Изменен**   | Тесты для разрешения флага `--agent` + пути обработки ошибок                                                                                                                                                                                                                          |
| `packages/core/src/extension/claude-converter.ts`                  | **Изменен**   | Добавить маппинг для новых полей при импорте `.md` файлов Claude (`mcpServers`, `hooks`, `maxTurns` на верхнем уровне, `memory`, `isolation` и т.д.)                                                                                                                                   |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`     | **Новый**       | Snapshot-тесты для списков перечислений; тесты полного цикла парсинга/сериализации                                                                                                                                                                                                           |
| `packages/core/src/subagents/subagent-manager.test.ts`             | **Изменен**   | Тесты для валидации новых полей, приоритетов, сообщений об ошибках                                                                                                                                                                                                                |
| `packages/core/src/tools/agent/agent.test.ts`                      | **Изменен**   | Тесты для проброса новых полей в runtime подагента                                                                                                                                                                                                                        |
| `docs/cli/agents.md` (если существует) или `docs/declarative-agents.md`   | **Новый**       | Пользовательская справка: схема из 16 полей + примеры                                                                                                                                                                                                                         |

### D7. permissionMode против approvalMode — создаем мост, а не заменяем

**Решение:** Принимать ОБА варианта: `permissionMode` (совместимый с Claude) и существующий `approvalMode` (совместимый с qwen) в frontmatter. При парсинге, если задан `permissionMode`, маппить его в `approvalMode` с использованием существующей таблицы в `claude-converter.ts:195-208` (`default → default`, `plan → plan`, `acceptEdits → auto-edit`, `dontAsk → default`, `bypassPermissions → yolo`). Если заданы оба, выигрывает `approvalMode` (более специфичный для qwen-code), и генерируется телеметрическое событие в стиле `tengu_frontmatter_shadow_*`, указывающее, что были заданы оба значения. **Обоснование:** Сохраняется обратная совместимость с существующими `.qwen/agents/*.md`, использующими `approvalMode`, при этом `permissionMode` из Claude Code принимается без изменений, чтобы пользователи могли использовать файлы агентов Claude Code без правок.

### Таблица маппинга схемы

| Поле Claude Code 2.1.168  | Поле qwen-code                                    | Адаптация                                                                                                   | Примечания                                                                                                    |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `name`                     | `name`                                             | нет                                                                                                         | идентично, обязательно                                                                                      |
| `description`              | `description`                                      | нет                                                                                                         | идентично, обязательно                                                                                      |
| `model`                    | `model`                                            | принимать `inherit`, `fast`, `haiku`, `sonnet`, `opus` или `authType:model-id`                                  | qwen-code уже поддерживает более широкий словарь; `inherit` — новое                                      |
| `tools`                    | `tools`                                            | принимать string\|array; `*` → undefined (inherit-all)                                                          | уже поддерживается как array; добавить обработку string и `*`                                                    |
| `disallowedTools`          | `disallowedTools`                                  | принимать string\|array; **всегда передается отдельно от `tools`**                                             | правило приоритета (#4821 «игнорируется, если задан tools») применяется **вызывающими сторонами**, а не парсером                    |
| `effort`                   | `effort` (новое)                                     | перечисление `low/medium/high/xhigh/max` + целое число; алиас `med → medium`                                             | эффект в runtime специфичен для qwen (маппится на существующий регулятор thinking-effort, если есть, иначе сохраняется и игнорируется) |
| `permissionMode`           | `permissionMode` (новое) + мостик к `approvalMode` | перечисление `acceptEdits/auto/bypassPermissions/default/dontAsk/plan`; таблица маппинга согласно D7                         | принимать в формате Claude без изменений                                                                            |
| `mcpServers`               | `mcpServers` (новое)                                 | массив (string \| `{name: spec}`); валидация по элементам, отбрасывание некорректных записей с предупреждением                           | интеграция с MCP runtime в P4                                                                            |
| `hooks`                    | `hooks` (новое)                                      | объект, соответствующий форме hooks в settings.json                                                                    | интеграция с hook runtime в P4                                                                           |
| `maxTurns`                 | `maxTurns` (новое поле верхнего уровня)                         | положительное целое число; для совместимости принимается числовая строка                                                           | **выносится из `runConfig.max_turns`**; вложенная форма сохраняется как устаревший алиас                             |
| `skills`                   | `skills` (новое)                                     | массив имен скиллов; также принимается строка, разделенная запятыми                                                   | runtime: предзагрузка через skillManager при запуске агента                                                      |
| `initialPrompt`            | `initialPrompt` (новое)                              | строка; состоящая только из пробелов → undefined; срабатывает только когда агент является основной сессией                                   | пробрасывается через путь флага `--agent`                                                                            |
| `memory`                   | `memory` (новое)                                     | перечисление `user/project/local`; загружается из `.qwen/agent-memory/<name>/` и т.д.                                      | runtime в P4                                                                                            |
| `background`               | `background`                                       | принимать bool или строку `"true"/"false"`; только truthy → true                                                   | уже поддерживается; ослабить правила парсинга                                                                    |
| `isolation`                | `isolation` (новое)                                  | перечисление **только** `["worktree"]`                                                                                 | runtime принадлежит workflow PR (#4732 P3+); реестр просто переносит поле                                |
| `color` (недокументированное #16) | `color`                                            | перечисление `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; значения вне списка тихо отбрасываются | уже есть в qwen `SubagentConfig`; ужесточить валидацию до allowlist из Claude Code                      |
### План тестирования TDD

| Блок                           | Тестовый файл                            | Что проверяется                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Константы перечислений схемы   | `agent-frontmatter-schema.test.ts` (новый) | `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES` совпадают с Claude Code 2.1.168 байт в байт (снэпшот)                                                   |
| Парсер — успешный сценарий     | `subagent-manager.test.ts`               | Полный цикл парсинга `.qwen/agents/test.md` со всеми 16 полями → сгенерированная запись имеет ожидаемую структуру                                                                                       |
| Парсер — обязательные поля     | `subagent-manager.test.ts`               | Отсутствие `name` возвращает null + warn-лог; отсутствие `description` возвращает null + warn-лог                                                                                                       |
| Парсер — валидация перечислений| `subagent-manager.test.ts`               | Некорректные `permissionMode` / `memory` / `isolation` / `effort` / `color` вызывают специфичное предупреждение (соответствующее формулировке DL7), поле отбрасывается                                  |
| Парсер — нестрогие типы полей  | `subagent-manager.test.ts`               | `background: "true"` → `true`; `maxTurns: "5"` → `5`; `effort: "med"` → `"medium"`; `tools: "Read,Edit"` → `["Read","Edit"]`; `tools: "*"` → undefined                                                  |
| Парсер — белый список цветов   | `subagent-manager.test.ts`               | `color: "magenta"` тихо отбрасывается (без ошибки), `color: "blue"` сохраняется                                                                                                                         |
| Особенность поля skills        | `subagent-manager.test.ts`               | пропуск `skills` приводит к `skills: []` (соответствует поведению генерации Claude Code DL7)                                                                                                            |
| Приоритет разрешения           | `subagent-manager.test.ts`               | Одинаковый `name` в project + user → побеждает project; в user + builtin → побеждает user; в extension + builtin → побеждает extension                                                                  |
| Дедупликация по inode          | `subagent-manager.test.ts`               | Два пути к одному inode (симлинк) → только одна запись, выводится лог                                                                                                                                   |
| Бридж permissionMode           | `subagent-manager.test.ts`               | `permissionMode: bypassPermissions` → разрешается в `approvalMode: yolo`; заданы оба → побеждает `approvalMode` + телеметрия                                                                            |
| CLI-флаг `--agent`             | `packages/cli/src/config/config.test.ts` | Флаг устанавливает агент главного потока; неразрешенное имя выбрасывает ошибку с текстом `Agent type '<x>' not found. Available agents: …`                                                              |
| Нечеткий фоллбэк инструмента Agent | `agent.test.ts`                      | `subagent_type: "Test_Engineer"` разрешается в зарегистрированный `test-engineer` через нормализацию NFKC-lowercase                                                                                     |
| Ошибка "не найдено" для инструмента Agent | `agent.test.ts`               | Неразрешенный `subagent_type` → сообщение об ошибке соответствует `Agent type '<x>' not found. Available agents: <list>`                                                                                |
| Контракт workflow              | `agent-frontmatter-schema.test.ts`       | Экспортируемый интерфейс `getAgentByName(name)` возвращает полный `SubagentConfig`, включая `isolation`, `disallowedTools`, `model`, `effort`, `permissionMode`, `maxTurns` (может использоваться в workflow PR #4732) |

### Поэтапный план PR

| Этап   | Название                                                                                                                       | Объем изменений                                                                                                                                        | Блокировки                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **P1** | `feat(core): declarative agent schema fields (effort, permissionMode, maxTurns top-level, memory, isolation, color allowlist)` | Добавить поля в `SubagentConfig`; расширить парсер + валидатор + сериализатор; пометить `runConfig.max_turns` как устаревшее; добавить модуль констант перечислений; тесты | Нет                                |
| **P2** | `feat(core): wire new agent fields into Agent tool runtime`                                                                    | Пробросить `model`, `effort`, `maxTurns`, бридж `permissionMode`/`approvalMode` в место вызова `AgentTool.execute()` → `AgentHeadless.create()`; тесты | P1                                 |
| **P3** | `feat(cli): --agent flag for main-thread agent selection`                                                                      | Добавить `--agent <name>` в `CliArgs`; разрешать при запуске; обработка ошибок; тесты                                                                  | P1                                 |
| **P4** | (опционально, расширение скоупа) `feat(core): mcpServers + hooks + skills + initialPrompt + memory runtime`                    | Подключить четыре поля "только метаданные в v1" к реальным эффектам в рантайме                                                                         | P1, плюс подсистемы skill/MCP/hook |

Цель для каждого PR — дельта ≤ 800 LOC (без учета тестов); P1 самый большой, около 600 LOC валидатора + тесты.

---

## Этап 3 — Матрица координации с портированием workflow (#4721 / PR #4732)

| Фича декларативных агентов                                         | Взаимодействие с workflow                                                                                                                                                              | Владелец                                                            | Блокируется                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| Поле `name` как ключ реестра                                       | Строка поиска `opts.agentType` в workflow ([#4721][i4721] явно)                                                                                                                        | **этот PR** определяет контракт реестра; **workflow PR** потребляет | нет — форма реестра может стабилизироваться первой |
| Поле `disallowedTools` в агенте                                    | Workflow делает UNION с жестко заданным базовым набором `[SEND_MESSAGE, EXIT_PLAN_MODE]` (согласно [#4721][i4721] §2 — проверено по диффу PR #4732: `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) | **этот PR** содержит поле; **workflow PR** делает UNION при диспатче | мердж P3 workflow PR #4732                   |
| Поле `tools` в агенте                                              | Workflow передает как есть в `ToolConfig.tools` подагента                                                                                                                              | **этот PR** содержит поле; **workflow PR** пробрасывает             | P3 workflow PR #4732                         |
| Поле `model` в агенте                                              | `opts.model` из workflow переопределяется при каждом вызове; `model` агента используется по умолчанию                                                                                  | **этот PR** содержит поле; **workflow PR** разрешает приоритет      | P3 workflow PR #4732                         |
| Поле `effort` в агенте                                             | Переопределение в месте вызова workflow имеет приоритет; fallback на значение по умолчанию агента                                                                                      | **этот PR** содержит поле; **workflow PR** разрешает                | P3 workflow PR #4732                         |
| Поле `permissionMode` в агенте                                     | Маппится в `approvalMode` подагента при диспатче; переопределение в месте вызова workflow имеет приоритет                                                                              | **этот PR** содержит поле через D7-бридж; **workflow PR** пробрасывает | P3 workflow PR #4732                         |
| Поле `maxTurns` в агенте                                           | Заменяет жестко заданное `WORKFLOW_SUBAGENT_MAX_TURNS = 50` в workflow, если задано в агенте                                                                                           | **этот PR** содержит поле; **workflow PR** разрешает приоритет      | P3 workflow PR #4732                         |
| Поле `isolation: 'worktree'` в агенте                              | По умолчанию; переопределяется `opts.isolation` при каждом вызове ([#4721][i4721] §3)                                                                                                  | **этот PR** содержит поле; **workflow PR** владеет рантаймом        | P3+ workflow PR #4732 (сейчас падает в P1)   |
| Поле `initialPrompt` в агенте                                      | Workflow **не** использует его (срабатывает только когда агент является главной сессией через `--agent`)                                                                               | **этот PR** + **CLI**                                               | нет (независимо)                             |
| `memory`, `mcpServers`, `hooks`, `skills`                          | Workflow не имеет специальной обработки, кроме передачи в рантайм подагента                                                                                                          | **этот PR** содержит поля; подключение к рантайму в P4 / в будущем  | будущие PR                                   |
| Обновления `EXCLUDED_TOOLS_FOR_SUBAGENTS`                          | Workflow PR #4732 добавляет `WORKFLOW` в набор (согласно контексту issue/PR — хотя при критическом разборе отмечено, что этого еще НЕТ в `agent-core.ts` в main, только в worktree) | **workflow PR** владеет; этот PR не затронут                        | нет                                          |
| Каноническая форма имени инструмента для базового набора workflow (`ToolNames.SEND_MESSAGE`) | Этот PR не импортирует базовые константы; он только содержит строки `disallowedTools` в исходном виде. Канонизацией занимается workflow PR.                                            | **workflow PR**                                                     | workflow PR #4732                            |
| Порядок релиза                                                     | Этот PR (P1+P2+P3) релизится независимо от workflow. P3 workflow PR #4732 заблокирован до тех пор, пока резолвер типа `getAgentByName()` из этого PR не станет импортируемым.          | параллельно до P3 workflow                                          | P3 workflow читает из экспортов этого PR     |
**Без циклических блокировок:** этот PR и PR для workflow могут быть смержены параллельно на этапах P1/P2. Они синхронизируются на этапе workflow-P3, которому требуется резолвер реестра из этого PR. Если этот PR будет смержен первым, workflow-P3 будет читать данные из него. Если первым будет смержен PR для workflow, он будет выпущен с существующим поиском по `subagent_type` (возвращая значения по умолчанию для workflow при промахе) и переключится на более расширенный резолвер после того, как этот PR будет смержен.

---

## Этап 4 — Риски и открытые вопросы

### Риски

| #   | Риск                                                                                                                                                                                                | Меры по снижению рисков                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Расхождение схем между минорными релизами Claude Code (2.1.168 → 2.1.x)                                                                                                                                   | Зафиксировать модуль констант enum с комментарием "проверено на 2.1.168"; повторно запускать strings-grep для новых релизов в рамках скилла `feature-reverse` |
| R2  | `runConfig.max_turns` → `maxTurns` верхнего уровня — это breaking change схемы для существующих файлов `.qwen/agents/*.md`                                                                                     | Сохранить вложенную форму как устаревший алиас с одним циклом депрекейта; выводить предупреждение при парсинге, задокументировать в CHANGELOG                                                     |
| R3  | Потери при круговом преобразовании `permissionMode` ↔ `approvalMode` (в Claude 6 режимов, в qwen около 4)                                                                                                            | Явно мапить оба направления согласно D7; отправлять телеметрию при двойной установке; НЕ переписывать молча при сохранении                                                             |
| R4  | Новые поля (`hooks`, `mcpServers`, `skills`, `memory`) перенесены в реестр, но не поддерживаются рантаймом в v1 → пользователи могут их задать, но они молча не сработают                                                     | Четко описать скоуп v1 в документации; выводить одноразовый info-лог для каждого агента, если поле "перенесено, но пока не поддерживается рантаймом" не пустое                                          |
| R5  | Adversarial-verify отметил, что `EXCLUDED_TOOLS_FOR_SUBAGENTS` НЕ включает `WORKFLOW` в `main` — это может означать, что порт workflow еще не смержен или отсутствует защита от recursive-fanout | Уточнить у автора PR для workflow (LaZzyMan = я), что защита будет добавлена в PR #4732, а не в этом порте                                                     |
| R6  | Поведение projectSettings, при котором внешнее дерево побеждает внутреннее (Q5), может привести к ошибкам, если его скопировать                                                                                                             | qwen-code явно выбирает принцип **побеждает самое внутреннее**; протестировано с помощью фикстуры R5                                                                                         |
| R7  | Поле `color` задокументировано как `@internal` в описании бинарника — возможно, мы портируем то, что Anthropic явно не поддерживает                                                        | Портировать его, но также пометить как `@internal` в документации qwen-code; считать только UI-элементом; не выводить в пользовательскую справочную документацию                                             |

### Открытые вопросы — предлагаемые решения

| #   | Вопрос                                                                                                                                                       | Решение                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Намеренно ли `color` исключен из #4821?                                                                                                                  | **Считать намеренным**. Портировать поле; НЕ упоминать в пользовательской документации, кроме как "доступно, internal".                                                                                                                                                                                                                                            |
| Q2  | Мягкое поведение DL7: документировать или сделать хак?                                                                                                                       | **Зеркалить**. Принимать `background: "true"`, `maxTurns: "5"`, `effort: "med"` для паритета, даже если это не задокументировано. Добавить тесты.                                                                                                                                                                                                                                |
| Q3  | Почему enum isolation отличается в схеме агента и схеме background-session?                                                                                 | **Задокументировать расхождение в комментарии к коду**; "no isolation" = поле отсутствует, а не является значением enum.                                                                                                                                                                                                                                                          |
| Q4  | Должен ли `--agents <json>` (множественное число, flagSettings) попасть в v1?                                                                                                    | **Отложить до P4**. CLI-интерфейс для продвинутых пользователей; v1 включает только `--agent <name>` (единственное число), что и требуется в #4821.                                                                                                                                                                                                                                 |
| Q5  | Приоритет внутреннего и внешнего дерева для вложенных `.qwen/agents/`?                                                                                                | **Побеждает самое внутреннее**. Переопределить случайное поведение Claude Code, где побеждает внешнее. Тестовая фикстура в P1.                                                                                                                                                                                                                                                          |
| Q6  | Приоритет `tools` и `disallowedTools`: #4821 говорит "игнорируется, если задан tools"; #4721 говорит "объединение с минимумом workflow"                                          | **Реестр — это просто данные**. Парсер сохраняет оба поля независимо. Правила приоритета находятся в точке диспатча (Agent tool / workflow). Разрешает противоречие.                                                                                                                                                                                   |
| Q7  | Каноническая форма имени инструмента для минимума workflow disallowedTools — проверено по PR #4732 как `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`            | **Не касается этого PR** — это зона ответственности PR для workflow. Задокументировать только в матрице координации.                                                                                                                                                                                                                                                              |
| Q8  | Влияет ли close-resolution из #2409 на что-либо?                                                                                                                   | **Наследовать гайдлайн из #2409 "повысить model + maxTurns до верхнего уровня"**. Уже учтено в этом плане.                                                                                                                                                                                                                                                      |
| Q9  | Должны ли агенты уровня `extension` в существующем приоритете `SubagentLevel` qwen-code оставаться выше `builtin` (как сейчас) или ниже (в Claude Code нет аналога)? | **Оставить `extension > builtin`**. Расширения устанавливаются пользователем; встроенные — по умолчанию от вендора. Установленные пользователем побеждают.                                                                                                                                                                                                                                        |
| Q10 | Полностью ли определены issues #4821, #4721, #4732 для контракта, предлагаемого этим документом?                                                                             | **Оставить координационный комментарий в #4821** со ссылкой на этот документ, кратким описанием решений по каждому полю и просьбой к мейнтейнерам подтвердить: (a) паритет схем с 16 полями Claude Code 2.1.168, (b) мост D7 `permissionMode`/`approvalMode`, (c) порядок приоритетов D2, (d) разрешение противоречия `tools`/`disallowedTools` через концепцию "реестр — это просто данные". |

### Задачи по координации

| #   | Действие                                                                       | Где                                                |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | Опубликовать краткое описание по каждому полю + 5 решений в #4821 для подтверждения мейнтейнерами        | комментарий в #4821                                     |
| A2  | Добавить перекрестную ссылку на этот документ из #4721 с упоминанием матрицы Этапа 3                         | комментарий в #4721                                     |
| A3  | После того как P1 этого порта будет смержен, пингануть #4732 для переключения на более расширенный резолвер          | комментарий в PR #4732 (когда будет готов)                     |
| A4  | Повторно запустить strings-grep для следующего минорного релиза Claude Code для обнаружения расхождений схем | cron-задача скилла `feature-reverse` (вручную до этого момента) |