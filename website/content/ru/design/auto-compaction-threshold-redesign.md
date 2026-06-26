# Перепроектирование порогов автоматического сжатия

**Статус:** Черновик · 2026-05-14

## Предыстория

> В этом разделе описывается состояние **до** внедрения данного PR (поведение до редизайна). Используемые далее `COMPRESSION_TOKEN_THRESHOLD`, `thinkingConfig.includeThoughts = true`, `hasFailedCompressionAttempt`, а также конкретные ссылки file:line относятся к коду до слияния PR #4345 — после слияния эти символы/номера строк станут неактуальны.

Текущая реализация автоматического сжатия в qwen-code использует только единый пропорциональный порог `COMPRESSION_TOKEN_THRESHOLD = 0.7` (`chatCompressionService.ts:33`), общий для всех размеров окна. По сравнению с «абсолютной токенной лестницей» claude-code (`autoCompact.ts:62-65`), у qwen-code есть три конкретные проблемы:

1. **Избыточный резерв при больших окнах**: Для модели с 1M порог в 70% срабатывает при 700K, оставляя 300K, что значительно превышает ~33K, реально необходимые для резюме + вывода.
2. **Постоянная блокировка после 1-го сбоя**: После `hasFailedCompressionAttempt = true` авто-сжатие больше не предпринимается в течение всей сессии (`geminiChat.ts:504`), что строже, чем «автоматический выключатель после 3-х последовательных сбоев» в claude-code.
3. **Разрыв между системой подсказок и авто-порогом**: Три подсказки `context-*` в `tipRegistry.ts` используют фиксированные проценты 50/80/95, полностью независимые от порога авто-сжатия (70%). Это означает, что подсказки 80%/95% редко срабатывают на основном пути, где «авто работает нормально», и лишены семантики, согласованной с порогом, на пограничных путях, где «авто не удалось / срабатывает реактивное резервирование».
4. **Отсутствие контроля бюджета вывода в самом вызове сжатия**: [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) явно включает `thinkingConfig.includeThoughts = true` (комментарий: «Качество сжатия определяет каждый последующий основной ход»), при этом вызов sideQuery не имеет ограничения `maxOutputTokens`. Комментарий в коде ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) также признает, что `compressionOutputTokenCount may include non-persisted tokens (thoughts)`. При приближении сжатия к верху окна общий объем вывода может увеличиться, что делает резерв буфера непредсказуемым.<br/><br/>Хуже того, поведение不一致 у разных провайдеров: thinking budget в Anthropic полностью независим от max_tokens; reasoning токены в OpenAI не ограничены max_completion_tokens; поведение Gemini варьируется в зависимости от версии модели. Это означает, что «простое добавление maxOutputTokens для контроля общего вывода» не работает в таком мультипровайдерном проекте, как qwen-code.

5. **Систематическое занижение `lastPromptTokenCount`, используемого для проверки порога.** [geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217) показывает, что это число берется из `usageMetadata.totalTokenCount` предыдущего ответа API. Два разрыва: (а) не включает пользовательское сообщение, добавляемое в текущем раунде, поэтому каждая дешевая проверка порога видит промпт меньше реального на один сегмент; (б) начальное значение равно 0, поэтому при восстановлении огромного сеанса через `--continue` или наследовании большой истории суб-агентом первый send всегда обходит все пороги. Для сравнения, `tokenCountWithEstimation` в claude-code ([query.ts:638](src/query.ts:638)), использующий двухколейную систему «API usage последнего ответа ассистента + оценка последующих сообщений», устраняет оба этих разрыва.

## Цели дизайна

- Ввести гибридный порог «пропорция + абсолютное значение», чтобы для моделей с большим окном работало абсолютное значение, а для маленьких окон оставался запасной вариант по пропорции.
- Добавить два уровня: warn / hard (auto остается основным триггером), формируя трехступенчатую лестницу.
- Переписать систему подсказок так, чтобы они следовали за новыми условиями срабатывания порогов.
- Модернизировать обработку сбоев с «постоянной блокировки после 1 сбоя» на «автоматический выключатель после 3 сбоев + автоматическое восстановление».
- **Отключить thinking в вызове сжатия и добавить ограничение `maxOutputTokens`**: В соответствии с claude-code, чтобы общий вывод контролировался одним параметром, а бюджет буфера был предсказуем; принять потенциальное снижение качества сжатия.
- **Добавить компенсацию оценки токенов**: Устранить два систематических занижения `lastPromptTokenCount` — «запаздывание на один раунд» и «начальное значение 0», чтобы проверка порога точнее соответствовала реальному размеру промпта.
- Удалить точку входа конфигурации `contextPercentageThreshold` в настройках (внутренняя константа PCT остается).
- **Не вводить** канал переопределения через env, **не добавлять** новый явный переключатель enabled.

## Трехступенчатая лестница порогов

```
                       window  (сырое окно контекста)
                          │
                          │  ← SUMMARY_RESERVE = 20K
                          ▼
                    effectiveWindow
                          │
                          │  ← HARD_BUFFER = 3K
                          ▼
              hard_threshold = effectiveWindow - 3K
                          │
                          │  ← (AUTOCOMPACT_BUFFER - HARD_BUFFER) = 10K
                          ▼
auto_threshold = max(PCT * window, effectiveWindow - AUTOCOMPACT_BUFFER)
                          │
                          │  ← WARN_BUFFER = 20K
                          ▼
warn_threshold = max((PCT - WARN_OFFSET) * window, auto_threshold - WARN_BUFFER)
                          │
                          ▼
                          0
```

### Семантика трех уровней

| Уровень     | Условие срабатывания              | Поведение                                                                  |
| ----------- | --------------------------------- | -------------------------------------------------------------------------- |
| **warn**    | `tokenCount >= warn_threshold`    | Подсказка в UI «Осталось X токенов до авто-сжатия», поведение send не меняется |
| **auto**    | `tokenCount >= auto_threshold`    | Вызов `tryCompress(force=false)` перед send, обычный процесс сжатия        |
| **hard**    | `tokenCount >= hard_threshold`    | Вызов `tryCompress(force=true)` перед send, сброс блокировки сбоев, принудительное сжатие |

Уровень `hard` фактически переносит существующее резервное поведение реактивного переполнения (`geminiChat.ts:711`) на этап перед send, избегая одного неудачного round-trip oversized запроса.

## Внутренние константы

```ts
// chatCompressionService.ts
const DEFAULT_PCT = 0.7; // запасной вариант по пропорции для auto
const WARN_PCT_OFFSET = 0.1; // пропорция для warn = PCT - WARN_OFFSET = 0.6
const COMPACT_MAX_OUTPUT_TOKENS = 20_000; // жесткий лимит вывода sideQuery сжатия (thinking + резюме вместе)
const SUMMARY_RESERVE = 20_000; // резерв вывода, вычитаемый из вершины окна в лестнице порогов = maxOutput
const AUTOCOMPACT_BUFFER = 13_000; // расстояние между auto и effectiveWindow
const WARN_BUFFER = 20_000; // расстояние между warn и auto
const HARD_BUFFER = 3_000; // расстояние между hard и effectiveWindow
const MAX_CONSECUTIVE_FAILURES = 3; // порог срабатывания автоматического выключателя
```

Источник значений: все взяты из实测ных значений claude-code ([autoCompact.ts:30,62-65](src/services/compact/autoCompact.ts:30)).

`SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS` — это ключевое соотношение: модель ограничена жестким лимитом `maxOutputTokens`, вывод не может превысить 20K, поэтому резерву не нужен дополнительный запас прочности. Примечание: это равенство выполняется при отключенном thinking в данном дизайне (весь бюджет вывода отдается резюме). Если бы thinking был сохранен, `thinking + резюме` делили бы общий бюджет (семантика `maxOutputTokens` в Gemini SDK / большинстве провайдеров), и модель распределяла бы его между ними самостоятельно, делая фактическое доступное пространство для резюме меньше 20K (см. пункты 1 и 2 в «Риски и примечания»).

## Функция вычисления

```ts
export interface CompactionThresholds {
  warn: number;
  auto: number;
  hard: number; // если hard < auto, то равно auto (деградация для маленьких окон)
  effectiveWindow: number;
}

export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto); // для маленьких окон деградирует до auto

  return { warn, auto, hard, effectiveWindow };
}
```

### Тестовые данные

| Окно    | warn          | auto          | hard           | Примечание                                     |
| ------- | ------------- | ------------- | -------------- | ---------------------------------------------- |
| 32K     | 19.2K (pct)   | 22.4K (pct)   | 22.4K (деград) | Запасной вариант по пропорции                  |
| 64K     | 38.4K (pct)   | 44.8K (pct)   | 44.8K (деград) | Запасной вариант по пропорции                  |
| 128K    | 76.8K (pct)   | 95K (abs)     | 105K (abs)     | Смешанный (warn=pct, auto/hard=abs)            |
| 200K    | 147K (abs)    | 167K (abs)    | 177K (abs)     | Абсолютное значение接管                        |
| 256K    | 203K (abs)    | 223K (abs)    | 233K (abs)     | Абсолютное значение接管                        |
| 1M      | 947K (abs)    | 967K (abs)    | 977K (abs)     | Все абсолютное                                 |

`(pct)` означает, что уровень определяется формулой пропорции, `(abs)` — формулой абсолютного значения.

## Конфигурация пользователя

### Изменения ChatCompressionSettings

```ts
// packages/core/src/config/config.ts:217
export interface ChatCompressionSettings {
  /** Сохраняется (не относится к данному дизайну, используется compactionInputSlimming) */
  imageTokenEstimate?: number;
}
```

**Удаляется:** поле `contextPercentageThreshold`. Причины:

1.  При новой формуле для основных окон (>= 128K) это поле почти не влияет — работает абсолютное значение.
2.  Для маленьких окон настройка пользователя может, наоборот, заставить порог срабатывать «раньше», что противоречит интуиции экономии токенов.
3.  В claude-code это поле не раскрыто, нет аналогичного прецедента пользовательской конфигурации.

### Обработка breaking change

**Для пользователя:** При запуске `Config` обнаруживает наличие `chatCompression.contextPercentageThreshold`:

-   Выводит в stderr предупреждение: `"chatCompression.contextPercentageThreshold has been removed and is now controlled by built-in thresholds."`
-   **Не** вызывает ошибку, **не** блокирует запуск.
-   Значение поля игнорируется.

**Для SDK (R5.4):** Поле `hasFailedCompressionAttempt: boolean` в `CompressOptions` переименовывается в `consecutiveFailures: number`. Два отличия:

|       | Старое поле                      | Новое поле                                                         |
| ----- | -------------------------------- | ------------------------------------------------------------------ |
| Имя   | `hasFailedCompressionAttempt`    | `consecutiveFailures`                                              |
| Тип   | `boolean`                        | `number`                                                           |
| Семантика | `true` = навсегда отключает auto-compact | `>= MAX_CONSECUTIVE_FAILURES` (по умолчанию 3) = временно отключает до успешного сброса через force |

Внутри репозитория есть только один внутренний потребитель — `GeminiChat.tryCompress`, поэтому риск внутренней миграции низок; но `@qwen-code/qwen-code-core` — это опубликованный пакет, `CompressOptions` виден в d.ts, поэтому код нижестоящих SDK, напрямую вызывающий `service.compress({ ..., hasFailedCompressionAttempt: true })`, получит ошибку компиляции TypeScript. **Руководство по миграции:** Замените `true` на `MAX_CONSECUTIVE_FAILURES` (или любое целое >= 3), `false` на `0`. Если вызывающая сторона ведет свой собственный счетчик сбоев, можно передавать его напрямую.

## Компенсация оценки токенов

`lastPromptTokenCount` в qwen-code берется из `usageMetadata.totalTokenCount` предыдущего ответа API ([geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217)). Это приводит к:

1.  **Запаздыванию на один раунд**: cheap-gate использует `lastPromptTokenCount` для проверки, но фактический промпт текущего send = он + пользовательское сообщение этого раунда. Недосчитанная часть может привести к ложноотрицательному результату проверки порога.
2.  **Начальному значению 0**: Исходное значение равно 0, поэтому первый send не запускает ни один порог, независимо от размера истории (включая сценарии восстановления через `--continue` / наследования суб-агентом).

Вводится легковесная локальная функция оценки `estimatePromptTokens`, которая восполняет эти два недостающих сегмента при проверках cheap-gate / hard перед send:

```ts
// chatCompressionService.ts (или новый файл packages/core/src/services/tokenEstimation.ts)

const BYTES_PER_TOKEN = 4; // общая оценка char/4 (claude-code использует ту же)
const BYTES_PER_TOKEN_JSON = 2; // JSON / tool_call input более плотные

/**
 * Оценивает количество токенов для набора Content, чтобы компенсировать
 * запаздывание метаданных usage API.
 * Для image / document переиспользует существующий imageTokenEstimate (по умолчанию 1600).
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  // Переиспользует estimateContentChars (compactionInputSlimming.ts), затем делит на bytesPerToken
  // Внутри для functionCall / functionResponse использует BYTES_PER_TOKEN_JSON
  // ...
}

/**
 * Единая точка входа для проверок cheap-gate и hard.
 * Основной путь: точный lastPromptTokenCount + оценка пользовательского сообщения текущего раунда
 * Путь первого раунда: оценка полной истории
 */
export function estimatePromptTokens(
  history: Content[],
  userMessage: Content,
  lastPromptTokenCount: number,
): number {
  if (lastPromptTokenCount > 0) {
    return lastPromptTokenCount + estimateContentTokens([userMessage]);
  }
  return estimateContentTokens([...history, userMessage]);
}
```

Места применения:

-   Cheap-gate в `chatCompressionService.compress()`: заменить источник `originalTokenCount` на `estimatePromptTokens(history, userMessage, lastPromptTokenCount)`.
-   Проверка hard на входе в `geminiChat.sendMessageStream` (см. следующий раздел).

**Оценка используется только для раннего срабатывания, а не для пропуска срабатывания.** Поскольку char/4 — это грубая нижняя оценка, она безопасна на стороне ложноположительного результата (лучше сжать немного раньше), но ненадежна на стороне ложноотрицательного.

## Изменения в цепочке срабатывания

### chatCompressionService.ts

1.  **Экспортировать `computeThresholds`** для повторного использования в cheap-gate / UI / командах.
2.  **Cheap-gate в `compress()`** (строки 221-249):
    ```ts
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !force) {
      return NOOP;
    }
    const { auto } = computeThresholds(contextLimit);
    const effectiveTokens = estimatePromptTokens(
      curatedHistory,
      userMessage,
      originalTokenCount,
    );
    if (!force && effectiveTokens < auto) return NOOP;
    ```
3.  **Вызов `runSideQuery` в `compress()`** (строки 356-380): Отключить thinking + добавить `maxOutputTokens`:

    ```ts
    const summaryResult = await runSideQuery(config, {
      // ...
      config: {
        thinkingConfig: { includeThoughts: false }, // Отключаем thinking (в соответствии с claude-code)
        maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS, // Жесткий лимит 20K
      },
      // ...
    });
    ```

    Или просто удалить `thinkingConfig`, позволив сработать значению по умолчанию `runSideQuery` ([sideQuery.ts:118](packages/core/src/utils/sideQuery.ts:118) по умолчанию `includeThoughts: false`).

    При отключенном thinking `maxOutputTokens` напрямую ограничивает общий вывод (нет проблемы отдельного бюджета для thinking), и `SUMMARY_RESERVE = maxOutput = 20K` становится чистым жестким соотношением.

    Одновременно обновить комментарий в [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) с «Качество сжатия определяет каждый последующий основной ход — оставить рассуждения включенными» на объяснение, что это сделано для обеспечения предсказуемого лимита вывода у разных провайдеров, в соответствии с дизайном claude-code.

    Комментарий про token math ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) «может включать несохраняемые токены (мысли)» также можно синхронно почистить.

### geminiChat.ts: вход `sendMessageStream` (строка 562)

```ts
// Было: tryCompress(force=false)
// Стало: используем оценку токенов для определения срабатывания hard, решаем флаг force

const { hard } = computeThresholds(contextLimit);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  createUserContent(params.message),
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;

if (shouldForceFromHard) {
  // Сбрасываем автоматический выключатель, равносильно force compress
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
);
```

### Модернизация обработки сбоев (`geminiChat.ts:504-510`)

```ts
// Было
hasFailedCompressionAttempt: boolean;

// Стало
consecutiveFailures: number; // По умолчанию 0

// Ветка сбоя
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1;
  }
}

// Ветка успеха
this.consecutiveFailures = 0;
```

Сбой при `force=true` не учитывается в счетчике (сохраняется семантика «реактивный / ручной вызов не расходует лимит»).

## Изменения в UI

### Переписывание трех подсказок context-* в tipRegistry.ts

Три уровня порогов идеально сопоставляются с тремя подсказками. Соответствие (по возрастанию количества токенов):

| ID подсказки        | Текущее условие                                | Новое условие                                                         | Изменение текста                                                                   |
| ------------------- | ---------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `compress-intro`    | `pct >= 50 && < 80 && sessionPromptCount > 5`  | `tokenCount >= warn && tokenCount < auto && sessionPromptCount > 5`   | Без изменений                                                                      |
| `context-high`      | `pct >= 80 && < 95`                            | `tokenCount >= auto && tokenCount < hard`                             | Без изменений                                                                      |
| `context-critical`  | `pct >= 95`                                    | `tokenCount >= hard`                                                  | Добавить фразу «Auto-compact will force on next send.» отражающую поведение нового уровня hard |

**Влияние на частоту срабатывания:**

-   Основной путь (auto работает нормально): `tokenCount` пересекает auto, сразу запускается сжатие, на следующем раунде `tokenCount` падает, поэтому `context-high` видна лишь короткое время между «срабатыванием» и «эффектом сжатия».
-   Пограничные пути (auto не удался / автоматический выключатель / реактивное резервирование не успело): `tokenCount` продолжает расти, последовательно проходя через warn → auto → hard, запуская три подсказки, что соответствует пользовательскому восприятию «контекст становится все более плотным».
-   При срабатывании `context-critical` уровень hard уже выполняет force compress перед send (см. раздел spec «Изменения в цепочке срабатывания»), поэтому эта подсказка фактически является «пост-спасательным уведомлением», а не «пред-спасательным предупреждением», в текст добавляется соответствующее пояснение.

Добавить в интерфейс `TipContext`:

```ts
export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  // Новое: чтобы функция isRelevant могла получить пороги.
  // computeThresholds вычисляется на стороне вызывающего и передается, избегая прямой зависимости tipRegistry от core.
  thresholds?: CompactionThresholds;
}
```

В `AppContainer.tsx:1150` при создании `TipContext` синхронно внедрять пороги.

### Синхронизация команды /context (`contextCommand.ts:177-183`)

```ts
// Заменить жестко закодированное (1 - threshold) * contextWindowSize
const { warn, auto, hard, effectiveWindow } =
  computeThresholds(contextWindowSize);

// Показать четыре строки:
//   Effective window:   180K   (window − 20K reserve)
//   Warn threshold:     147K   (...)
//   Auto threshold:     167K   ← текущая позиция
//   Hard threshold:     177K
// Отметить, на каком уровне находится текущее количество токенов
```

### Постоянная подсказка в Footer (опционально, follow-up)

Данный spec не требует обязательной реализации постоянной подсказки в footer по следующим причинам:

-   Существующая система подсказок уже может давать подсказки в истории.
-   Постоянная подсказка в footer потребует изменения рендеринга ink и увеличения частоты перерисовки.
-   Это можно оставить как последующий follow-up к данному spec (отдельный PR).

Если в будущем это будет реализовано, рекомендуется условие срабатывания `tokenCount >= warn && tokenCount < auto`; после превышения auto подсказку скрывать (сжатие уже началось).

## Тестовое покрытие

### Модульные тесты (chatCompressionService.test.ts)

-   `computeThresholds(32K)` → ветка запасного варианта по пропорции (warn и auto оба pct, hard деградирует)
-   `computeThresholds(128K)` → смешанная ветка (warn=pct, auto=abs, hard=abs)
-   `computeThresholds(200K)` → ветка абсолютного接管 (warn/auto/hard все abs)
-   `computeThresholds(1M)` → ветка все абсолютное
-   `computeThresholds(window=10K)` → очень маленькое окно (абсолютные значения все отрицательны), формула не ломается
-   Трехуровневые пороги всегда удовлетворяют `warn <= auto <= hard`
-   Формула max() стабильна в граничных точках (pct * window == abs)

### Модульные тесты (tokenEstimation.test.ts)

-   `estimateContentTokens` для plain text / json / functionCall / functionResponse / image / document использует соответствующий bytesPerToken
-   `estimatePromptTokens` при `lastPromptTokenCount > 0` идет по «основному пути», при равенстве 0 — по «пути первого раунда»
-   Большое пользовательское сообщение, добавленное на этапе cheap-gate, может пересечь порог auto
-   Отклонение оценки от реального usage API находится в пределах ±30% (регрессия на реальных исторических выборках)

### Интеграционные тесты (geminiChat.test.ts / chatCompressionService.test.ts)

-   После 3 последовательных сбоев cheap-gate возвращает NOOP; следующий вызов force восстанавливает работу
-   Одиночный сбой больше не блокирует постоянно
-   Пересечение порога hard оценочными токенами запускает автоматический force compress при send
-   Параметры вызова sideQuery сжатия `maxOutputTokens = COMPACT_MAX_OUTPUT_TOKENS` правильно передаются в `runSideQuery`, `thinkingConfig.includeThoughts` равен `false` (или переопределяется значением по умолчанию sideQuery)
-   **Покрытие первого раунда**: Создать чат с `lastPromptTokenCount = 0`, но огромной историей (имитация восстановления через `--continue`); при первом send порог auto должен сработать через оценочный путь

### Тесты совместимости

-   Запуск с настройкой `contextPercentageThreshold = 0.5` → предупреждение в stderr + поле игнорируется, поведение определяется внутренней константой PCT

### Тесты системы подсказок (tipRegistry.test.ts)

-   Три подсказки context-* правильно срабатывают при пересечении warn/auto/hard, диапазоны не перекрываются
-   В основном пути после срабатывания порога auto и запуска сжатия `context-high` не остается постоянно видимой
-   В пограничном пути (автоматический выключатель + токены продолжают расти) три подсказки срабатывают последовательно
-   Поведение TipContext при отсутствии `thresholds` (fallback) разумно

## Поэтапное внедрение

| Фаза | Содержание                                                                                   | Независимость         |
| ---- | -------------------------------------------------------------------------------------------- | --------------------- |
| 1    | Внутренние константы + `computeThresholds` + изменения cheap-gate (без компенсации оценки)   | Можно объединить независимо |
| 2    | Модернизация обработки сбоев (1 → 3 автоматический выключатель)                             | Можно объединить независимо |
| 3    | Упреждающий force compress на уровне hard                                                    | Зависит от P1 + P7    |
| 4    | Изменения на стороне конфигурации + предупреждение о breaking change                         | Зависит от P1         |
| 5    | UI (переписывание подсказок + /context)                                                      | Зависит от P1         |
| 6    | Отключение thinking в sideQuery сжатия + добавление лимита `maxOutputTokens`                 | Независима, может быть реализована до P1 |
| 7    | Компенсация оценки токенов (`estimateContentTokens` + `estimatePromptTokens`, применение к cheap-gate / hard) | Независима, может быть параллельна P1 |

Каждая фаза может быть отдельным PR. Рекомендуемый порядок слияния **P6 → P7 → P1 → P2 → P4 → P3 → P5**: сначала добавить лимит `maxOutputTokens` в вызов сжатия (сделать предположение о буфере надежным); затем добавить компенсацию оценки (сделать оценку количества токенов более надежной); затем внедрить инфраструктуру порогов; затем сделать автоматический выключатель сбоев, изменения на стороне конфигурации; и только в конце включить упреждающее спасение на уровне hard (к этому моменту будут надежные данные о токенах и автоматический выключатель). Каждый PR можно независимо проверить и откатить.

## Риски и примечания

1.  **Отключение thinking может повлиять на качество резюме.** Исходный комментарий автора «Качество сжатия определяет каждый последующий основной ход — оставить рассуждения включенными» выражал обеспокоенность по этому поводу. Решение в данном spec — приоритет «предсказуемого лимита токенов» над «максимизацией качества», но после внедрения необходимо наблюдать за распределением `compression_input_token_count` / `compression_output_token_count` в телеметрии, а также за изменениями качества в основном диалоге после сжатия (отзывы пользователей, уровень статусов `COMPRESSION_FAILED_*`). Если качество упадет значительно, можно рассмотреть возврат к включенному thinking с контролем provider-specific thinkingBudget.

2.  **Достижение лимита `maxOutputTokens` может привести к усечению резюме.** При отключенном thinking 20K напрямую ограничивают тело резюме; claude-code实测 p99.99 ≈ 17K, оставляя запас ~3K. Однако промпт сжатия qwen-code отличается от claude-code, распределение требует наблюдения. Рекомендуется в ветке сбоя сжатия ([chatCompressionService.ts:464-491](packages/core/src/services/chatCompressionService.ts:464)) добавить путь NOOP при обнаружении `finish_reason = MAX_TOKENS`, чтобы избежать сохранения неполного резюме.

3.  **Различия в отображении maxOutputTokens у разных провайдеров.** OpenAI compat (dashscope) → `max_tokens`, Anthropic → `max_tokens`, Gemini SDK → `maxOutputTokens`. В текущем qwen-code уже есть такое отображение ([contentGenerator.ts:94](packages/core/src/core/contentGenerator.ts:94) и т.д.), необходимо при реализации P6 убедиться, что поле `maxOutputTokens` на пути sideQuery действительно передается в тело запроса для всех провайдеров.

4.  **Оценка токенов — это грубая нижняя граница, ее не следует использовать в обратном направлении как основание для «пропуска срабатывания».** Отклонение `char/4` от реального токенизатора провайдера может достигать ±30%. Данный spec использует оценку только для того, чтобы «заставить порог сработать раньше» (направление ложноположительного результата, лучше сжать раньше, чем позже). Все пути кода, которые «уменьшают счетчик токенов / пропускают сжатие», по-прежнему должны использовать `lastPromptTokenCount` (авторитетное значение API).

5.  **Связь новой функции оценки с существующей `estimateContentChars`.** В [compactionInputSlimming.ts](packages/core/src/services/compactionInputSlimming.ts) уже есть `estimateContentChars` (используется для вычисления точки разделения при сжатии). Новая `estimateContentTokens` должна переиспользовать ее (делить на bytesPerToken), а не писать новую с нуля, чтобы избежать расхождения между двумя системами оценки.

## Что не входит в scope данного spec

-   Канал переопределения через env-переменные (вариант D): сохраняем принцип «минимальной конфигурационной поверхности».
-   Постоянная визуализация в footer: оставляем как follow-up.
-   Улучшение промпта для резюме, настройка `MIN_COMPRESSION_FRACTION`: ортогонально дизайну порогов.

## Открытые вопросы (ожидают review)

1.  **Сила breaking change**: предупреждение + игнорирование поля vs. ошибка при запуске. Сейчас выбран вариант с предупреждением. Необходимо подтверждение, что это достаточно удобно для корпоративных развертываний / командных конфигураций.

## Закрытые вопросы

2.  **Для маленьких окон (≤ ~76.7K) hard и auto деградируют до одного значения** — решено **не указывать это явно в `/context`**. Причина:
    -   Диапазон коллапса — не только 32K; коллапс происходит для всех окон, где `effectiveWindow - HARD_BUFFER ≤ 0.7 × window` (включая 64K).
    -   Поведение пользователя не меняется: в коллапсированном окне `currentTier` пропускает `'auto'` и показывает сразу `'hard'` (`contextCommand.ts:43-44` сначала проверяет `>= hard`), а полоса `context-high` (`auto ≤ t < hard`) становится пустой. Отсутствие одной ступени подсказки в маленьком окне оправдано — окно само по себе маленькое, пользователи, скорее всего, управляют контекстом вручную.
    -   Если в будущем появятся реальные сообщения пользователей «в маленьком окне не видно промежуточную подсказку», можно будет принять решение о добавлении UI-маркировки или настройке условия срабатывания `context-high` (это работа UI, а не spec). В текущем варианте сложность UI не увеличивается.