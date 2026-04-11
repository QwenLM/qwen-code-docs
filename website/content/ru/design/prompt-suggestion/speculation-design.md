# Проектирование механизма спекулятивного выполнения

> Спекулятивно выполняет предложенное действие до подтверждения пользователя, используя изоляцию файлов по принципу copy-on-write. Результаты отображаются мгновенно при нажатии Tab.

## Обзор

При отображении предложения в промпте **механизм спекулятивного выполнения** немедленно начинает его фоновое выполнение с использованием форкнутого `GeminiChat`. Запись файлов направляется во временную директорию overlay. Если пользователь принимает предложение, файлы из overlay копируются в реальную файловую систему, а спекулятивный диалог добавляется в основную историю чата. Если пользователь вводит другой текст, спекулятивное выполнение прерывается, а overlay очищается.

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

## Overlay с copy-on-write

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

## Безопасность и контроль инструментов (Tool Gate)

| Инструмент                                                       | Действие   | Условие                                    |
| ---------------------------------------------------------- | -------- | -------------------------------------------- |
| read_file, grep, glob, ls, lsp                             | разрешено    | Пути чтения разрешаются через overlay          |
| edit, write_file                                           | перенаправление | Только в режимах auto-edit / yolo       |
| edit, write_file                                           | граница (boundary) | В режимах по умолчанию / plan              |
| shell                                                      | разрешено    | `isShellCommandReadOnlyAST()` возвращает true   |
| shell                                                      | граница (boundary) | Команды, не являющиеся read-only                       |
| web_fetch, web_search                                      | граница (boundary) | Сетевые запросы требуют согласия пользователя        |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | граница (boundary) | Взаимодействие с пользователем во время спекуляции запрещено |
| Unknown / MCP tools                                        | граница (boundary) | Безопасное поведение по умолчанию                                 |

### Переопределение путей

- **Инструменты записи**: `rewritePathArgs()` перенаправляет `file_path` в overlay через `overlayFs.redirectWrite()`
- **Инструменты чтения**: `resolveReadPaths()` перенаправляет `file_path` в overlay через `overlayFs.resolveReadPath()`, если файл ранее записывался
- **Ошибка переопределения**: Считается границей (например, абсолютный путь за пределами cwd вызовет ошибку в `redirectWrite`)

## Обработка границ (Boundary)

При достижении границы в середине хода:

1. Уже выполненные вызовы инструментов сохраняются (отслеживание по индексу, а не по имени)
2. Невыполненные вызовы функций удаляются из сообщения модели
3. Частичные ответы инструментов добавляются в историю
4. `ensureToolResultPairing()` проверяет полноту перед добавлением в историю

## Конвейерные предложения (Pipelined Suggestion)

После завершения спекуляции (без достижения границы) второй вызов LLM генерирует **следующее** предложение:

```
Context: original conversation + "commit this" + speculated messages
→ LLM predicts: "push it"
→ Stored in state.pipelinedSuggestion
→ On accept: setPromptSuggestion("push it") — appears instantly
```

Это позволяет использовать рабочий процесс Tab-Tab-Tab, где каждое принятие сразу показывает следующий шаг.

Конвейерное предложение повторно использует экспортированную константу `SUGGESTION_PROMPT` из `suggestionGenerator.ts` (а не локальную копию), чтобы обеспечить согласованное качество с начальными предложениями.

## Быстрая модель (Fast Model)

`startSpeculation` принимает необязательный параметр `options.model`, который передаётся через `runSpeculativeLoop` и `generatePipelinedSuggestion` в `runForkedQuery`. Настраивается через параметр верхнего уровня `fastModel` (пустое значение = использовать основную модель). Одна и та же `fastModel` применяется для всех фоновых задач: генерации предложений, спекулятивного выполнения и конвейерных предложений. Устанавливается через `/model --fast <name>` или `settings.json`.

## Отрисовка в UI

После завершения спекуляции `acceptSpeculation` отображает результаты через `historyManager.addItem()`:

- **Сообщения пользователя**: отображаются как элементы `type: 'user'`
- **Текст модели**: отображается как элементы `type: 'gemini'`
- **Вызовы инструментов**: отображаются как элементы `type: 'tool_group'` со структурированными записями `IndividualToolCallDisplay` (имя инструмента, описание аргументов, текст результата, статус)

Это позволяет пользователю видеть полный результат спекуляции, включая детали вызовов инструментов, а не только обычный текст.

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

- Сохраняется после каждого успешного основного хода в `GeminiClient.sendMessageStream()`
- Очищается при `startChat()` / `resetChat()` для предотвращения утечки данных между сессиями
- История обрезается до 40 записей; `createForkedChat` использует поверхностные копии (параметры уже являются глубокими копиями-снимками)
- Режим мышления явно отключён (`thinkingConfig: { includeThoughts: false }`) — токены рассуждений не нужны для спекуляции и только увеличат затраты/задержку. Это не влияет на сопоставление префиксов кэша (определяется только `systemInstruction` + `tools` + `history`)
- Определение версии через сравнение `JSON.stringify` для `systemInstruction` + `tools`

### Механизм кэширования

DashScope уже включает префиксное кэширование через:

- заголовок `X-DashScope-CacheControl: enable`
- аннотации `cache_control: { type: 'ephemeral' }` в сообщениях и инструментах

Форкнутый `GeminiChat` использует идентичный `generationConfig` (включая инструменты) и префикс истории, поэтому существующий механизм кэширования DashScope автоматически обеспечивает попадание в кэш.

## Константы

| Константа                 | Значение | Описание                              |
| ------------------------ | ----- | ---------------------------------------- |
| MAX_SPECULATION_TURNS    | 20    | Максимальное количество запросов к API                  |
| MAX_SPECULATION_MESSAGES | 100   | Максимальное количество сообщений в спекулятивной истории   |
| SUGGESTION_DELAY_MS      | 300   | Задержка перед отображением предложения          |
| ACCEPT_DEBOUNCE_MS       | 100   | Debounce-блокировка для быстрых подтверждений          |
| MAX_HISTORY_FOR_CACHE    | 40    | Записи истории, сохраняемые в CacheSafeParams |

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