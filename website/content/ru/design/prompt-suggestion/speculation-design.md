# Дизайн спекулятивного движка

> Спекулятивно выполняет принятое предложение до подтверждения пользователем, используя изоляцию файлов с копированием при записи (copy-on-write). Результаты отображаются мгновенно, когда пользователь нажимает Tab.

## Обзор

Когда отображается предложение-подсказка, **спекулятивный движок** немедленно начинает выполнять его в фоне, используя форкнутый GeminiChat. Запись файлов направляется во временную overlay-директорию. Если пользователь принимает предложение, overlay-файлы копируются в реальную файловую систему, а спекулятивная беседа встраивается в основную историю чата. Если пользователь вводит что-то другое, спекуляция прерывается и overlay очищается.

## Архитектура

```
User sees suggestion "commit this"
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  startSpeculation()                                          │
│                                                              │
│  ┌─────────────────┐    ┌────────────────────┐               │
│  │ Forked GeminiChat│    │  OverlayFs          │              │
│  │ (cache-shared)   │    │  /tmp/qwen-         │              │
│  │                  │    │   speculation/       │              │
│  │  systemInstruction│   │   {pid}/{id}/        │              │
│  │  + tools          │   │                      │              │
│  │  + history prefix │   │  COW: first write    │              │
│  │                  │    │  copies original     │              │
│  └────────┬─────────┘    └──────────┬───────────┘             │
│           │                         │                         │
│           ▼                         │                         │
│  ┌──────────────────────────────────┴──────────────────────┐  │
│  │  Speculative Loop (max 20 turns, 100 messages)          │  │
│  │                                                         │  │
│  │  Model response                                         │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  speculationToolGate                             │   │  │
│  │  │                                                  │   │  │
│  │  │  Read/Grep/Glob/LS/LSP → allow (+ overlay read) │   │  │
│  │  │  Edit/WriteFile → redirect to overlay            │   │  │
│  │  │    (only in auto-edit/yolo mode)                 │   │  │
│  │  │  Shell → AST check read-only? allow : boundary   │   │  │
│  │  │  WebFetch/WebSearch → boundary                   │   │  │
│  │  │  Agent/Skill/Memory/Ask → boundary               │   │  │
│  │  │  Unknown/MCP → boundary                          │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  Tool execution: toolRegistry.getTool → build → execute │  │
│  │  (bypasses CoreToolScheduler — gated by toolGate)       │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  On completion → generatePipelinedSuggestion()               │
└──────────────────────────────────────────────────────────────┘
           │
           │  User presses Tab / Enter
           ▼
     ┌─── status === 'completed'? ───┐
     │ YES                      NO (boundary) │
     ▼                                ▼
┌─────────────────────────┐  ┌────────────────────────┐
│  acceptSpeculation()    │  │  Discard speculation    │
│                         │  │  abort + cleanup        │
│  1. applyToReal()       │  │  Submit query normally  │
│  2. ensureToolPairing() │  │  (addMessage)           │
│  3. addHistory()        │  └────────────────────────┘
│  4. render tool_group   │
│  5. cleanup overlay     │
│  6. pipelined suggest   │
└─────────────────────────┘
           │
           │  User types instead
           ▼
┌──────────────────────────────────────────────────────────────┐
│  abortSpeculation()                                          │
│                                                              │
│  1. abortController.abort() — cancel LLM call               │
│  2. overlayFs.cleanup() — delete temp directory              │
│  3. Update speculation state (no telemetry on abort)         │
└──────────────────────────────────────────────────────────────┘
```

## Наложение с копированием при записи (Copy-on-Write Overlay)

```
Real CWD: /home/user/project/
Overlay:  /tmp/qwen-speculation/12345/a1b2c3d4/

Write to src/app.ts:
  1. Copy /home/user/project/src/app.ts → overlay/src/app.ts (first time only)
  2. Tool writes to overlay/src/app.ts

Read from src/app.ts:
  - If in writtenFiles → read from overlay/src/app.ts
  - Otherwise → read from /home/user/project/src/app.ts

New file (src/new.ts):
  - Create overlay/src/new.ts directly (no original to copy)

Accept:
  - copyFile(overlay/src/app.ts → /home/user/project/src/app.ts)
  - copyFile(overlay/src/new.ts → /home/user/project/src/new.ts)
  - rm -rf overlay/

Abort:
  - rm -rf overlay/
```

## Безопасность шлюза инструментов (Tool Gate Security)

| Инструмент                                               | Действие  | Условие                                      |
| -------------------------------------------------------- | --------- | -------------------------------------------- |
| read_file, grep, glob, ls, lsp                           | разрешить | Пути чтения разрешаются через overlay        |
| edit, write_file                                         | перенаправить | Только в режиме auto-edit / yolo approval  |
| edit, write_file                                         | граница   | В режиме default / plan approval             |
| shell                                                    | разрешить | `isShellCommandReadOnlyAST()` возвращает true|
| shell                                                    | граница   | Команды не только для чтения                 |
| web_fetch, web_search                                    | граница   | Сетевые запросы требуют согласия пользователя|
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | граница   | Не могут взаимодействовать с пользователем во время спекуляции |
| Неизвестные / MCP инструменты                            | граница   | Безопасное значение по умолчанию             |

### Перезапись путей

- **Инструменты записи**: `rewritePathArgs()` перенаправляет `file_path` в overlay через `overlayFs.redirectWrite()`
- **Инструменты чтения**: `resolveReadPaths()` перенаправляет `file_path` в overlay через `overlayFs.resolveReadPath()`, если файл ранее был записан
- **Ошибка перезаписи**: считается границей (например, абсолютный путь вне cwd вызывает ошибку в `redirectWrite`)

## Обработка границ (Boundary Handling)

Когда граница достигается во время оборота:

1. Уже выполненные вызовы инструментов сохраняются (отслеживание по индексу, а не по имени)
2. Невыполненные вызовы функций удаляются из сообщения модели
3. Частичные ответы инструментов добавляются в историю
4. `ensureToolResultPairing()` проверяет полноту перед встраиванием

## Конвейерное предложение (Pipelined Suggestion)

После завершения спекуляции (без границы) второй вызов LLM генерирует **следующее** предложение:

```
Context: original conversation + "commit this" + speculated messages
→ LLM predicts: "push it"
→ Stored in state.pipelinedSuggestion
→ On accept: setPromptSuggestion("push it") — appears instantly
```

Это позволяет реализовать сценарии Tab-Tab-Tab, когда каждое принятие немедленно показывает следующий шаг.

Конвейерное предложение повторно использует экспортируемую константу `SUGGESTION_PROMPT` из `suggestionGenerator.ts` (а не локальную копию), чтобы обеспечить одинаковое качество с первоначальными предложениями.

## Быстрая модель (Fast Model)

`startSpeculation` принимает опциональный параметр `options.model`, который передаётся через `runSpeculativeLoop` и `generatePipelinedSuggestion` в `runForkedQuery`. Конфигурируется через настройку верхнего уровня `fastModel` (пустое значение = использовать основную модель). Та же `fastModel` используется для всех фоновых задач: генерации предложений, спекуляции и конвейерных предложений. Устанавливается через `/model --fast <name>` или `settings.json`.

## Визуализация в UI

Когда спекуляция завершается, `acceptSpeculation` отображает результаты через `historyManager.addItem()`:

- **Сообщения пользователя**: отображаются как элементы типа `'user'`
- **Текст модели**: отображается как элементы типа `'gemini'`
- **Вызовы инструментов**: отображаются как элементы типа `'tool_group'` с структурированными записями `IndividualToolCallDisplay` (имя инструмента, описание аргументов, текст результата, статус)

Это показывает пользователю полный вывод спекуляции, включая детали вызовов инструментов, а не просто текст.

## Форкнутый запрос (совместное использование кэша)

### CacheSafeParams

```typescript
interface CacheSafeParams {
  generationConfig: GenerateContentConfig; // systemInstruction + tools
  history: Content[]; // curated, max 40 entries
  model: string;
  version: number; // increments on config changes
}
```

- Сохраняется после каждого успешного основного оборота в `GeminiClient.sendMessageStream()`
- Очищается при `startChat()` / `resetChat()` для предотвращения утечки между сессиями
- История усекается до 40 записей; `createForkedChat` использует поверхностные копии (параметры уже являются глубокими клонированными снимками)
- Режим размышлений явно отключён (`thinkingConfig: { includeThoughts: false }`) — токены рассуждений не нужны для спекуляции и увеличивают стоимость/задержку. Это не влияет на сопоставление префиксов кэша (определяется только systemInstruction + tools + history)
- Обнаружение версии через `JSON.stringify` сравнение systemInstruction + tools

### Механизм кэширования

DashScope уже включает префиксное кэширование через:

- Заголовок `X-DashScope-CacheControl: enable`
- Аннотации `cache_control: { type: 'ephemeral' }` на сообщениях и инструментах

Форкнутый `GeminiChat` использует идентичные `generationConfig` (включая инструменты) и префикс истории, поэтому существующий механизм кэша DashScope автоматически обеспечивает попадания в кэш.

## Константы

| Константа                 | Значение | Описание                              |
| ------------------------- | -------- | ------------------------------------- |
| MAX_SPECULATION_TURNS     | 20       | Максимальное количество API-оборотов |
| MAX_SPECULATION_MESSAGES  | 100      | Максимальное количество сообщений в спекулятивной истории |
| SUGGESTION_DELAY_MS       | 300      | Задержка перед отображением предложения |
| ACCEPT_DEBOUNCE_MS        | 100      | Блокировка дребезга для быстрых принятий |
| MAX_HISTORY_FOR_CACHE     | 40       | Записи истории, сохраняемые в CacheSafeParams |

## Структура файлов

```
packages/core/src/followup/
├── followupState.ts          # Framework-agnostic state controller
├── suggestionGenerator.ts    # LLM-based suggestion generation + 12 filter rules
├── forkedQuery.ts            # Cache-aware forked query infrastructure
├── overlayFs.ts              # Copy-on-write overlay filesystem
├── speculationToolGate.ts    # Tool boundary enforcement
├── speculation.ts            # Speculation engine (start/accept/abort)
└── index.ts                  # Module exports
```