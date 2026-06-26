# Дизайн подсказок (NES)

> Предсказывает, что пользователь естественным образом ввел бы следующим после ответа ИИ, и отображает это как призрачный текст в поле ввода.
>
> Статус реализации: `prompt-suggestion-implementation.md`. Механизм спекуляции: `speculation-design.md`.

## Обзор

**Подсказка следующего шага** (Next-step Suggestion / NES) — это краткое предсказание (2–12 слов) следующего ввода пользователя, генерируемое вызовом LLM после каждого ответа ИИ. Отображается как призрачный текст в поле ввода. Пользователь может принять его клавишами Tab/Enter/Стрелка вправо или отклонить, начав печатать.

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Переход Responding → Idle                                  │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Условия-гейты (11 категорий)                        │    │
│  │  настройки, интерактивность, SDK, режим плана,       │    │
│  │  диалоги, уточнение, ошибка API                      │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams доступны? ────┐               │    │
│  │  │                                  │               │    │
│  │  ▼ ДА                           НЕТ ▼               │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (с учётом кэша)       (автономный fallback)        │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12 правил фильтрации ────                     │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (не зависит от фреймворка)       │    │
│  │  задержка 300 мс → показать как призрачный текст     │    │
│  │                                                     │    │
│  │  Tab    → принять (заполнить ввод)                  │    │
│  │  Enter  → принять + отправить                       │    │
│  │  Right  → принять (заполнить ввод)                  │    │
│  │  Печать → отклонить + прервать спекуляцию           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Телеметрия (PromptSuggestionEvent)                  │    │
│  │  outcome, accept_method, timing, similarity,        │    │
│  │  keystroke, focus, suppression reason, prompt_id     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Генерация подсказок

### Промпт LLM

```
[SUGGESTION MODE: Suggest what the user might naturally type next.]

FIRST: Read the LAST FEW LINES of the assistant's most recent message — that's where
next-step hints, tips, and actionable suggestions usually appear. Then check the user's
recent messages and original request.

Your job is to predict what THEY would type - not what you think they should do.
THE TEST: Would they think "I was just about to type that"?

PRIORITY: If the assistant's last message contains a tip or hint like "Tip: type X to ..."
or "type X to ...", extract X as the suggestion. These are explicit next-step hints.

EXAMPLES:
Assistant says "Tip: type post comments to publish findings" → "post comments"
Assistant says "type /review to start" → "/review"
User asked "fix the bug and run tests", bug is fixed → "run the tests"
After code written → "try it out"
Task complete, obvious follow-up → "commit this" or "push it"

Format: 2-12 words, match the user's style. Or nothing.
Reply with ONLY the suggestion, no quotes or explanation.
```

### Правила фильтрации (12)

| Правило              | Пример заблокированного                         |
| -------------------- | ----------------------------------------------- |
| done                 | "done"                                          |
| meta_text            | "nothing found", "no suggestion", "silence"     |
| meta_wrapped         | "(silence)", "[no suggestion]"                  |
| error_message        | "api error: 500"                                |
| prefixed_label       | "Suggestion: commit"                            |
| too_few_words        | "hmm" (но допускается "yes", "commit", "push")  |
| too_many_words       | > 12 слов                                       |
| too_long             | >= 100 символов                                  |
| multiple_sentences   | "Run tests. Then commit."                       |
| has_formatting       | переводы строк, жирный шрифт markdown           |
| evaluative           | "looks good", "thanks" (с границей слова \b)    |
| ai_voice             | "Let me...", "I'll...", "Here's..."             |

### Условия-гейты

**AppContainer useEffect (13 проверок в коде):**

| Гейт                  | Проверка                                           |
| --------------------- | -------------------------------------------------- |
| Переключатель настроек| `enableFollowupSuggestions`                        |
| Неинтерактивный режим | `config.isInteractive()`                           |
| Режим SDK             | `!config.getSdkMode()`                             |
| Переход стриминга     | `Responding → Idle` (2 проверки)                   |
| Ошибка API (история)  | `historyManager.history[last]?.type !== 'error'`   |
| Ошибка API (ожидание) | `!pendingGeminiHistoryItems.some(type === 'error')`|
| Диалоги подтверждения | shell + general + обнаружение циклов (3 проверки)  |
| Диалог разрешений     | `isPermissionsDialogOpen`                          |
| Уточнение             | `settingInputRequests.length === 0`                |
| Режим плана           | `ApprovalMode.PLAN`                                |

**Внутри generatePromptSuggestion():**

| Гейт                    | Проверка               |
| ----------------------- | ---------------------- |
| Начало разговора        | `modelTurns < 2`        |

**Отдельные функциональные флаги (не в блоке гейтов):**

| Флаг                    | Управление                                             |
| ----------------------- | ------------------------------------------------------ |
| `enableCacheSharing`    | Использовать forked-запрос или fallback на generateJson |
| `enableSpeculation`     | Запускать ли спекуляцию при отображении подсказки      |

## Управление состоянием

### FollowupState

```typescript
interface FollowupState {
  suggestion: string | null;
  isVisible: boolean;
  shownAt: number; // timestamp for telemetry
}
```

### FollowupController

Контроллер, не зависящий от фреймворка, общий для CLI (Ink) и WebUI (React):

- `setSuggestion(text)` — отображает с задержкой 300 мс, `null` очищает сразу
- `accept(method)` — очищает состояние, вызывает `onAccept` через microtask, блокировка дебаунса 100 мс
- `dismiss()` — очищает состояние, логирует телеметрию `ignored`
- `clear()` — жёсткий сброс всего состояния и таймеров
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` предотвращает случайную мутацию

## Клавиатурное взаимодействие

| Клавиша         | CLI                         | WebUI                                |
| --------------- | --------------------------- | ------------------------------------ |
| Tab             | Заполнить ввод (без отправки)| Заполнить ввод (без отправки)        |
| Enter           | Заполнить + отправить       | Заполнить + отправить (параметр `explicitText`) |
| Стрелка вправо  | Заполнить ввод (без отправки)| Заполнить ввод (без отправки)        |
| Печать          | Отклонить + прервать спекуляцию | Отклонить                      |
| Вставка         | Отклонить + прервать спекуляцию | Отклонить                      |

### Примечание по привязке клавиш

Обработчик Tab использует явное `key.name === 'tab'` (не `ACCEPT_SUGGESTION`), поскольку `ACCEPT_SUGGESTION` также соответствует Enter, который должен передаваться обработчику SUBMIT.

## Телеметрия

### PromptSuggestionEvent

| Поле                        | Тип                        | Описание                             |
| --------------------------- | -------------------------- | ------------------------------------ |
| outcome                     | accepted/ignored/suppressed | Итоговый результат                   |
| prompt_id                   | string                     | По умолчанию: 'user_intent'          |
| accept_method               | tab/enter/right            | Как пользователь принял подсказку    |
| time_to_accept_ms           | number                     | Время от показа до принятия          |
| time_to_ignore_ms           | number                     | Время от показа до отклонения        |
| time_to_first_keystroke_ms  | number                     | Время до первого нажатия при показе  |
| suggestion_length           | number                     | Количество символов                  |
| similarity                  | number                     | 1.0 для принятия, 0.0 для игнорирования |
| was_focused_when_shown      | boolean                    | Фокус терминала в момент показа      |
| reason                      | string                     | Для suppressed: имя правила фильтра  |

### SpeculationEvent

| Поле                      | Тип                    | Описание                |
| ------------------------- | ---------------------- | ----------------------- |
| outcome                   | accepted/aborted/failed | Результат спекуляции    |
| turns_used                | number                 | Круглых вызовов API     |
| files_written             | number                 | Файлов в overlay        |
| tool_use_count            | number                 | Выполнено инструментов  |
| duration_ms               | number                 | Реальное время          |
| boundary_type             | string                 | Что остановило спекуляцию |
| had_pipelined_suggestion  | boolean                | Сгенерирована следующая подсказка |

## Функциональные флаги и настройки

| Настройка                   | Тип     | По умолчанию | Описание                                                                    |
| --------------------------- | ------- | ------------ | --------------------------------------------------------------------------- |
| `enableFollowupSuggestions` | boolean | true         | Главный включатель подсказок                                                |
| `enableCacheSharing`        | boolean | true         | Использовать forked-запросы с учётом кэша                                   |
| `enableSpeculation`         | boolean | false        | Механизм предсказательного исполнения                                       |
| `fastModel` (верхний уровень)| string  | ""           | Модель для всех фоновых задач (пусто = основная модель). Устанавливается через `/model --fast` |

### Внутренняя фильтрация по prompt ID

Фоновые операции используют специальные prompt ID (`INTERNAL_PROMPT_IDS` в `utils/internalPromptIds.ts`), чтобы их API-трафик и вызовы инструментов не отображались в видимом пользователю интерфейсе:

| Prompt ID          | Используется                      |
| ------------------ | --------------------------------- |
| `prompt_suggestion`| Генерация подсказок               |
| `forked_query`     | Forked-запросы с учётом кэша      |
| `speculation`      | Механизм спекуляции               |

**Фильтрация применяется в:**

- `loggingContentGenerator` — пропускает `logApiRequest` и логирование взаимодействия с OpenAI для внутренних ID
- `logApiResponse` / `logApiError` — пропускает `chatRecordingService.recordUiTelemetryEvent`
- `logToolCall` — пропускает `chatRecordingService.recordUiTelemetryEvent`
- `uiTelemetryService.addEvent` — **не фильтруется** (чтобы работало отслеживание токенов в `/stats`)

### Режим размышлений

Режим размышлений/рассуждений явно отключён (`thinkingConfig: { includeThoughts: false }`) для всех фоновых путей:

- **Путь forked-запроса** (`createForkedChat`) — переопределяет `thinkingConfig` в клонированном `generationConfig`, включая как генерацию подсказок, так и спекуляцию
- **Путь BaseLlm fallback** (`generateViaBaseLlm`) — настройка на запрос переопределяет настройки размышлений базового генератора контента

Это безопасно, потому что:

- Префикс кэша определяется через systemInstruction + tools + history, а не `thinkingConfig` — попадания в кэш не затрагиваются
- Все бэкенды (Gemini, OpenAI-совместимые, Anthropic) обрабатывают `includeThoughts: false`, опуская поле thinking — ошибок API на моделях без поддержки размышлений не возникает
- Генерация подсказок и спекуляция не выигрывают от токенов рассуждений