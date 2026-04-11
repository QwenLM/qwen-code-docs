# Проектирование подсказок запросов (NES)

> Предсказывает, что пользователь введет следующим после завершения ответа ИИ, и отображает это в виде ghost text в поле ввода.
>
> Статус реализации: `prompt-suggestion-implementation.md`. Движок спекулятивного выполнения: `speculation-design.md`.

## Обзор

**Подсказка запроса** (Next-step Suggestion / NES) — это краткое предсказание (2–12 слов) следующего ввода пользователя, генерируемое вызовом LLM после каждого ответа ИИ. Оно отображается в виде ghost text в поле ввода. Пользователь может принять его с помощью Tab/Enter/Right Arrow или отклонить, начав печатать.

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Responding → Idle transition                               │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Guard Conditions (11 categories)                    │    │
│  │  settings, interactive, sdk, plan mode, dialogs,    │    │
│  │  elicitation, API error                             │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams available? ───┐               │    │
│  │  │                                  │               │    │
│  │  ▼ YES                         NO ▼                 │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (cache-aware)         (standalone fallback)        │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12 filter rules ──────                        │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (framework-agnostic)            │    │
│  │  300ms delay → show as ghost text                   │    │
│  │                                                     │    │
│  │  Tab    → accept (fill input)                       │    │
│  │  Enter  → accept + submit                           │    │
│  │  Right  → accept (fill input)                       │    │
│  │  Type   → dismiss + abort speculation               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Telemetry (PromptSuggestionEvent)                  │    │
│  │  outcome, accept_method, timing, similarity,        │    │
│  │  keystroke, focus, suppression reason, prompt_id     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Генерация подсказок

### Промпт для LLM

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

| Правило            | Пример блокировки                                |
| ------------------ | ------------------------------------------------ |
| done               | "done"                                           |
| meta_text          | "nothing found", "no suggestion", "silence"      |
| meta_wrapped       | "(silence)", "[no suggestion]"                   |
| error_message      | "api error: 500"                                 |
| prefixed_label     | "Suggestion: commit"                             |
| too_few_words      | "hmm" (но разрешает "yes", "commit", "push" и т.д.)  |
| too_many_words     | > 12 слов                                        |
| too_long           | >= 100 символов                                  |
| multiple_sentences | "Run tests. Then commit."                        |
| has_formatting     | переносы строк, жирный текст markdown            |
| evaluative         | "looks good", "thanks" (с границами слов \b)     |
| ai_voice           | "Let me...", "I'll...", "Here's..."              |

### Guard Conditions

**AppContainer useEffect (13 проверок в коде):**

| Условие                | Проверка                                            |
| ---------------------- | --------------------------------------------------- |
| Переключатель настроек | `enableFollowupSuggestions`                         |
| Неинтерактивный режим  | `config.isInteractive()`                            |
| Режим SDK              | `!config.getSdkMode()`                              |
| Переход потоковой передачи | `Responding → Idle` (2 проверки)              |
| Ошибка API (история)   | `historyManager.history[last]?.type !== 'error'`    |
| Ошибка API (ожидание)  | `!pendingGeminiHistoryItems.some(type === 'error')` |
| Диалоги подтверждения  | shell + general + loop detection (3 проверки)       |
| Диалог разрешений      | `isPermissionsDialogOpen`                           |
| Запрос уточнений       | `settingInputRequests.length === 0`                 |
| Режим планирования     | `ApprovalMode.PLAN`                                 |

**Внутри generatePromptSuggestion():**

| Условие              | Проверка       |
| -------------------- | -------------- |
| Начало диалога       | `modelTurns < 2` |

**Отдельные feature flags (не в блоке guard):**

| Флаг                 | Управление                                            |
| -------------------- | ----------------------------------------------------- |
| `enableCacheSharing` | Использовать ли forked-запрос или fallback на generateJson |
| `enableSpeculation`  | Запускать ли спекулятивное выполнение при отображении подсказки |

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

Фреймворк-агностичный контроллер, общий для CLI (Ink) и WebUI (React):

- `setSuggestion(text)` — отложенный показ на 300 мс, `null` очищает немедленно
- `accept(method)` — очищает состояние, вызывает `onAccept` через микротаск, блокировка debounce на 100 мс
- `dismiss()` — очищает состояние, логирует телеметрию `ignored`
- `clear()` — полный сброс состояния и таймеров
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` предотвращает случайную мутацию

## Взаимодействие с клавиатурой

| Клавиша     | CLI                         | WebUI                                |
| ----------- | --------------------------- | ------------------------------------ |
| Tab         | Заполняет ввод (без отправки)      | Заполняет ввод (без отправки)               |
| Enter       | Заполняет + отправляет               | Заполняет + отправляет (`explicitText` param) |
| Right Arrow | Заполняет ввод (без отправки)      | Заполняет ввод (без отправки)               |
| Ввод текста | Отклоняет + прерывает спекуляцию | Отклоняет                              |
| Вставка     | Отклоняет + прерывает спекуляцию | Отклоняет                              |

### Примечание по привязке клавиш

Обработчик Tab явно использует `key.name === 'tab'` (а не матчер `ACCEPT_SUGGESTION`), потому что `ACCEPT_SUGGESTION` также совпадает с Enter, который должен передаваться дальше в обработчик `SUBMIT`.

## Телеметрия

### PromptSuggestionEvent

| Поле                       | Тип                         | Описание                          |
| -------------------------- | --------------------------- | --------------------------------- |
| outcome                    | accepted/ignored/suppressed | Итоговый результат                |
| prompt_id                  | string                      | По умолчанию: 'user_intent'       |
| accept_method              | tab/enter/right             | Способ принятия пользователем     |
| time_to_accept_ms          | number                      | Время от показа до принятия       |
| time_to_ignore_ms          | number                      | Время от показа до отклонения     |
| time_to_first_keystroke_ms | number                      | Время до первого нажатия клавиши во время показа |
| suggestion_length          | number                      | Количество символов               |
| similarity                 | number                      | 1.0 при принятии, 0.0 при отклонении |
| was_focused_when_shown     | boolean                     | Терминал был в фокусе             |
| reason                     | string                      | Для suppressed: имя правила фильтрации |

### SpeculationEvent

| Поле                     | Тип                     | Описание                  |
| ------------------------ | ----------------------- | ------------------------- |
| outcome                  | accepted/aborted/failed | Результат спекуляции      |
| turns_used               | number                  | Количество API round-trips|
| files_written            | number                  | Файлы в оверлее           |
| tool_use_count           | number                  | Выполненные инструменты   |
| duration_ms              | number                  | Реальное время выполнения |
| boundary_type            | string                  | Что остановило спекуляцию |
| had_pipelined_suggestion | boolean                 | Следующая подсказка сгенерирована |

## Feature Flags и настройки

| Настройка                   | Тип     | По умолчанию | Описание                                                                       |
| --------------------------- | ------- | ------------ | ------------------------------------------------------------------------------ |
| `enableFollowupSuggestions` | boolean | true         | Главный переключатель подсказок запросов                                       |
| `enableCacheSharing`        | boolean | true         | Использовать кэш-ориентированные forked-запросы                                |
| `enableSpeculation`         | boolean | false        | Движок предсказательного выполнения                                            |
| `fastModel` (верхний уровень) | string  | ""           | Модель для всех фоновых задач (пусто = использовать основную модель). Устанавливается через `/model --fast` |

### Фильтрация внутренних Prompt ID

Фоновые операции используют выделенные prompt ID (`INTERNAL_PROMPT_IDS` в `utils/internalPromptIds.ts`), чтобы их API-трафик и вызовы инструментов не отображались в пользовательском интерфейсе:

| Prompt ID           | Используется               |
| ------------------- | -------------------------- |
| `prompt_suggestion` | Генерация подсказок        |
| `forked_query`      | Кэш-ориентированные forked-запросы |
| `speculation`       | Движок спекулятивного выполнения |

**Применяемая фильтрация:**

- `loggingContentGenerator` — пропускает `logApiRequest` и логирование взаимодействия с OpenAI для внутренних ID
- `logApiResponse` / `logApiError` — пропускает `chatRecordingService.recordUiTelemetryEvent`
- `logToolCall` — пропускает `chatRecordingService.recordUiTelemetryEvent`
- `uiTelemetryService.addEvent` — **не фильтруется** (обеспечивает работу отслеживания токенов в `/stats`)

### Thinking Mode

Режим мышления/рассуждений явно отключен (`thinkingConfig: { includeThoughts: false }`) для всех путей фоновых задач:

- **Путь forked-запроса** (`createForkedChat`) — переопределяет `thinkingConfig` в клонированном `generationConfig`, охватывая как генерацию подсказок, так и спекуляцию
- **Fallback-путь BaseLlm** (`generateViaBaseLlm`) — конфигурация на каждый запрос переопределяет настройки мышления базового генератора контента

Это безопасно, потому что:

- Префикс кэша определяется `systemInstruction` + `tools` + `history`, а не `thinkingConfig` — попадания в кэш не затрагиваются
- Все бэкенды (Gemini, OpenAI-compatible, Anthropic) обрабатывают `includeThoughts: false`, опуская поле мышления — ошибок API на моделях без поддержки мышления не возникает
- Генерация подсказок и спекуляция не получают преимуществ от токенов рассуждений