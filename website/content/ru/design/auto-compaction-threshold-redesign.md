# Auto-Compaction Threshold Redesign

**Status:** Draft · 2026-05-14

## 背景

> В этом разделе описывается состояние **до** внедрения данного PR (pre-redesign behavior). Все упоминания `COMPRESSION_TOKEN_THRESHOLD`, `thinkingConfig.includeThoughts = true`, `hasFailedCompressionAttempt` и конкретные ссылки на file:line относятся к коду до слияния PR #4345 — после слияния эти символы/строки перестанут быть актуальными.

Текущая реализация автоматической компрессии в qwen-code использует только единый порог `COMPRESSION_TOKEN_THRESHOLD = 0.7` (`chatCompressionService.ts:33`), единый для всех размеров окна. По сравнению с «абсолютной токеновой лестницей» claude-code (`autoCompact.ts:62-65`), у qwen-code есть четыре конкретные проблемы:

1. **Избыточный запас при больших окнах**: при модели 1M порог 70% срабатывает на 700K, остаётся 300K, что намного превышает реальные ~33K, необходимые для сводки + вывода
2. **Блокировка после первого сбоя**: после установки `hasFailedCompressionAttempt = true` сессия больше не пытается выполнить авто-компресс (`geminiChat.ts:504`), что более жёстко, чем «отключение после 3 последовательных сбоев» в claude-code
3. **Система tip-ов отвязана от порога авто-компрессии**: три tip-а `context-*` в `tipRegistry.ts` используют фиксированные проценты 50/80/95, полностью независимые от порога авто-компрессии (70%). Это означает, что на основном пути, где авто работает нормально, tip-ы 80%/95% срабатывают редко, а на периферийных путях, где авто не работает или происходит реактивный откат, они не имеют выровненной семантики
4. **Сам вызов компрессии не имеет контроля бюджета вывода**: в [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374-376) явно включён `thinkingConfig.includeThoughts = true` (комментарий: «Compression quality drives every subsequent main turn»), при этом вызов sideQuery не имеет ограничения `maxOutputTokens`. Комментарий в коде ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) признаёт, что `compressionOutputTokenCount may include non-persisted tokens (thoughts)`. Когда компрессия близка к заполнению окна, общий вывод может расширяться, что делает резервирование буфера непредсказуемым.<br/><br/>Что ещё хуже, поведение различается между провайдерами: у Anthropic thinking budget и max_tokens полностью независимы; reasoning tokens у OpenAI не ограничены параметром max_completion_tokens; поведение Gemini зависит от версии модели. Это означает, что «просто добавить maxOutputTokens для контроля общего вывода» не работает в проекте с несколькими провайдерами, как qwen-code

5. **`lastPromptTokenCount`, используемый для проверки порога, систематически занижен.** В [geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217) показано, что это значение берётся из `usageMetadata.totalTokenCount` предыдущего ответа API. Два пробела: (a) оно не включает user message, добавляемый в текущем раунде, поэтому каждая дешёвая проверка порога меньше реального промпта на один сегмент; (b) начальное значение в первом раунде равно 0, поэтому при `--continue` с большой сессией или при наследовании большого объёма истории sub-agent-ом первый send всегда обходит все пороги. В claude-code используется `tokenCountWithEstimation` ([query.ts:638](src/query.ts:638)), работающий по двухрежимной схеме «использование API последнего ассистента + оценка последующих добавленных сообщений», что закрывает оба этих пробела

## Дизайнерские цели

- Ввести смешанный порог «пропорция + абсолют», чтобы для моделей с большим окном преобладал абсолют, а для маленьких окон оставалась пропорция
- Добавить два уровня: warn и hard (авто остаётся основной точкой срабатывания), формируя трёхуровневую лестницу
- Переработать систему tip-ов, чтобы они соответствовали новым порогам
- Обновить обработку сбоев с «блокировки после первого сбоя» на «отключение после 3 сбоев с автоматическим восстановлением»
- **Отключить thinking в вызове компрессии и добавить верхнюю границу `maxOutputTokens`**: выровнять с claude-code, чтобы общий вывод был ограничен одним параметром, а бюджет буфера стал предсказуемым; принять возможное снижение качества компрессии
- **Добавить компенсацию оценки токенов**: устранить систематическое занижение `lastPromptTokenCount` из-за «задержки на один раунд» и «нулевого начального значения», приблизив проверку порога к реальному размеру промпта
- Удалить конфигурационный вход `contextPercentageThreshold` в настройках (внутренняя константа PCT остаётся)
- **Не вводить** каналы переопределения через env, **не добавлять** явный переключатель enabled

## Трёхуровневая лестница порогов

```
                       window  (raw context window)
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

### Семантика трёх уровней

| Уровень  | Условие срабатывания                  | Поведение                                                                 |
| -------- | ------------------------------------- | ------------------------------------------------------------------------- |
| **warn** | `tokenCount >= warn_threshold`        | UI-подсказка «Осталось X токенов до авто-компрессии», не меняет поведение send |
| **auto** | `tokenCount >= auto_threshold`        | Перед send вызывается `tryCompress(force=false)`, обычный процесс компрессии |
| **hard** | `tokenCount >= hard_threshold`        | Перед send вызывается `tryCompress(force=true)`, сброс блокировки сбоя и принудительная компрессия |

Уровень `hard` по сути переносит существующую логику реактивного переполнения (`geminiChat.ts:711`) на этап до send, избегая неудачной круглой поездки запроса с превышением размера.

## Внутренние константы

```ts
// chatCompressionService.ts
const DEFAULT_PCT = 0.7; // пропорция для авто
const WARN_PCT_OFFSET = 0.1; // пропорция warn = PCT - WARN_OFFSET = 0.6
const COMPACT_MAX_OUTPUT_TOKENS = 20_000; // жёсткий лимит вывода компрессионного sideQuery (thinking + summary вместе)
const SUMMARY_RESERVE = 20_000; // резерв вывода, вычитаемый из вершины окна для лестницы порогов = maxOutput
const AUTOCOMPACT_BUFFER = 13_000; // расстояние между auto и effectiveWindow
const WARN_BUFFER = 20_000; // расстояние между warn и auto
const HARD_BUFFER = 3_000; // расстояние между hard и effectiveWindow
const MAX_CONSECUTIVE_FAILURES = 3; // порог отключения при сбоях
```

Значения взяты: все заимствованы из проверенных значений claude-code ([autoCompact.ts:30,62-65](src/services/compact/autoCompact.ts:30)).

`SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS` – ключевая зависимость: модель ограничена жёстким лимитом `maxOutputTokens`, вывод не может превысить 20K, поэтому резерву не нужен дополнительный запас безопасности. Примечание: в данной разработке с отключением thinking это равенство выполняется (весь бюджет вывода отдаётся сводке); если сохранить thinking, то `thinking + summary` делят общий бюджет (семантика `maxOutputTokens` в Gemini SDK / у большинства провайдеров), и модель сама распределяет их, поэтому фактическое пространство для summary меньше 20K (см. «Риски и примечания», пункты 1 и 2).

## Функция вычисления

```ts
export interface CompactionThresholds {
  warn: number;
  auto: number;
  hard: number; // когда hard < auto, равно auto (деградация для маленьких окон)
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
### Экспериментальные данные

| Окно  | warn           | auto           | hard              | Примечание                                        |
| ----- | -------------- | -------------- | ----------------- | ------------------------------------------------- |
| 32K   | 19.2K (pct)    | 22.4K (pct)    | 22.4K (деградация)| Запас по процентной формуле                       |
| 64K   | 38.4K (pct)    | 44.8K (pct)    | 44.8K (деградация)| Запас по процентной формуле                       |
| 128K  | 76.8K (pct)    | 95K (abs)      | 105K (abs)        | Смешанный (warn=pct, auto/hard=abs)               |
| 200K  | 147K (abs)     | 167K (abs)     | 177K (abs)        | Абсолютное управление                             |
| 256K  | 203K (abs)     | 223K (abs)     | 233K (abs)        | Абсолютное управление                             |
| 1M    | 947K (abs)     | 967K (abs)     | 977K (abs)        | Полностью абсолютное                              |

`(pct)` означает, что для этого уровня используется процентная формула, `(abs)` — абсолютная формула.

## Пользовательская конфигурация

### Изменения ChatCompressionSettings

```ts
// packages/core/src/config/config.ts:217
export interface ChatCompressionSettings {
  /** Сохраняется (не относится к данному дизайну, используется compactionInputSlimming) */
  imageTokenEstimate?: number;
}
```

**Удалено:** поле `contextPercentageThreshold`. Причина:

1. При новой формуле для основных окон (>= 128K) это поле практически не влияет — управление переходит к абсолютным значениям
2. На малых окнах пользовательская настройка может привести к более раннему сжатию, что противоречит интуитивному желанию экономить токены
3. В claude-code это поле не было доступно, нет прецедента подобной пользовательской конфигурации

### Обработка критических изменений (Breaking change)

**Пользовательская сторона:** при загрузке `Config` во время запуска, если обнаружено `chatCompression.contextPercentageThreshold`:

- Запись предупреждения в stderr: `"chatCompression.contextPercentageThreshold has been removed and is now controlled by built-in thresholds."`
- **Не** вызывает ошибку, **не** блокирует запуск
- Значение поля игнорируется

**SDK сторона (R5.4):** поле `hasFailedCompressionAttempt: boolean` в `CompressOptions` переименовано в `consecutiveFailures: number`. Два отличия:

|        | Старое поле                     | Новое поле                                                               |
| ------ | ------------------------------- | ------------------------------------------------------------------------ |
| Имя    | `hasFailedCompressionAttempt`   | `consecutiveFailures`                                                    |
| Тип    | `boolean`                       | `number`                                                                 |
| Смысл  | `true` = навсегда отключает auto-compact | `>= MAX_CONSECUTIVE_FAILURES` (по умолчанию 3) = временное отключение до успешного force сброса |

В репозитории только один внутренний потребитель — `GeminiChat.tryCompress`, поэтому риск внутренней миграции низок; однако `@qwen-code/qwen-code-core` — это опубликованный пакет, `CompressOptions` виден в d.ts, и код, напрямую вызывающий `service.compress({ ..., hasFailedCompressionAttempt: true })` от нижестоящего SDK, получит ошибку компиляции TypeScript. **Руководство по миграции:** замените `true` на `MAX_CONSECUTIVE_FAILURES` (или любое целое число >= 3), `false` на `0`. Если вызывающая сторона ведет собственный счетчик неудач, просто передавайте его.

## Компенсация оценки токенов

`lastPromptTokenCount` в qwen-code берётся из `usageMetadata.totalTokenCount` предыдущего API-ответа ([geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217)). Это приводит к:

1. **Задержка на один раунд**: cheap-gate использует `lastPromptTokenCount` для оценки, но фактический промпт текущей отправки = он + сообщение пользователя текущего раунда. Недосчитанная часть может привести к ложноотрицательному результату при проверке порога.
2. **Первый раунд равен 0**: начальное значение 0, поэтому при первой отправке независимо от объёма истории не сработает ни один порог (включая сценарии восстановления через `--continue` / наследования sub-agent).

Вводится лёгкая локальная функция оценки `estimatePromptTokens`, которая восполняет эти недостающие части в проверках cheap-gate / hard перед отправкой:

```ts
// chatCompressionService.ts（或新文件 packages/core/src/services/tokenEstimation.ts）

const BYTES_PER_TOKEN = 4; // 通用 char/4 估算（claude-code 同此）
const BYTES_PER_TOKEN_JSON = 2; // JSON / tool_call input 更密集

/**
 * 估算一组 Content 的 token 数，用于补偿 API usage metadata 的滞后。
 * 对 image / document 复用现有 imageTokenEstimate（默认 1600）。
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  // 复用 estimateContentChars（compactionInputSlimming.ts），再除以 bytesPerToken
  // 内部对 functionCall / functionResponse 用 BYTES_PER_TOKEN_JSON
  // ...
}

/**
 * cheap-gate 与 hard 判断的统一入口。
 * 主路径：lastPromptTokenCount 准 + 本轮 user message 估算
 * 首轮路径：full history 估算
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

- cheap-gate в `chatCompressionService.compress()`: заменить источник `originalTokenCount` на `estimatePromptTokens(history, userMessage, lastPromptTokenCount)`
- проверка hard на входе `geminiChat.sendMessageStream` (см. следующий раздел)

**Оценка используется только для раннего срабатывания, а не для пропуска срабатывания.** Поскольку char/4 — это грубая нижняя граница, она безопасна на стороне ложноположительных результатов (лучше сжать раньше), но ненадёжна для ложноотрицательных.

## Изменения в цепочке срабатывания

### chatCompressionService.ts

1. **Экспорт `computeThresholds`** для повторного использования в cheap-gate / UI / командах
2. **`compress()` cheap-gate** (строки 221-249):
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
3. **Вызов `runSideQuery` в `compress()`** (строки 356-380): отключение thinking + добавление `maxOutputTokens`:

   ```ts
   const summaryResult = await runSideQuery(config, {
     // ...
     config: {
       thinkingConfig: { includeThoughts: false }, // 关闭 thinking（与 claude-code 一致）
       maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS, // 硬上限 20K
     },
     // ...
   });
   ```

   Или просто удалить `thinkingConfig`, чтобы по умолчанию `runSideQuery` (в [sideQuery.ts:118](packages/core/src/utils/sideQuery.ts:118) по умолчанию `includeThoughts: false`) взял управление.
После отключения `thinking`, `maxOutputTokens` напрямую ограничивает общий вывод (без отдельного бюджета для thinking), и `SUMMARY_RESERVE = maxOutput = 20K` — это четкая жесткая зависимость.

Также обновить комментарий в [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) с «Compression quality drives every subsequent main turn — keep reasoning on» на «Для обеспечения предсказуемого верхнего предела вывода у разных провайдеров, в соответствии с дизайном claude-code».

Комментарий «may include non-persisted tokens (thoughts)» в разделе token math ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) также можно синхронно почистить.

### geminiChat.ts: точка входа `sendMessageStream` (строка 562)

```ts
// Было: tryCompress(force=false)
// Стало: оценка токенов для определения hard и установка флага force

const { hard } = computeThresholds(contextLimit);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  createUserContent(params.message),
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;

if (shouldForceFromHard) {
  // Сбрасываем счетчик отказов, эквивалентно force compress
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
);
```

### Улучшение обработки ошибок (`geminiChat.ts:504-510`)

```ts
// Было
hasFailedCompressionAttempt: boolean;

// Стало
consecutiveFailures: number;  // по умолчанию 0

// Ветка ошибки
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1;
  }
}

// Ветка успеха
this.consecutiveFailures = 0;
```

Вызов с `force=true` в случае ошибки не увеличивает счетчик (сохраняет семантику, когда reactive / manual не «занимают квоту»).

## Изменения в UI

### Переписывание трех tip-ов `context-*` в tipRegistry.ts

Три пороговых уровня соответствуют трем tip-ам один к одному. Сопоставление (по возрастанию числа токенов):

| Tip ID             | Текущее условие                                 | Новое условие                                                        | Изменения в тексте                                                   |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `compress-intro`   | `pct >= 50 && < 80 && sessionPromptCount > 5`   | `tokenCount >= warn && tokenCount < auto && sessionPromptCount > 5`  | Без изменений                                                        |
| `context-high`     | `pct >= 80 && < 95`                             | `tokenCount >= auto && tokenCount < hard`                            | Без изменений                                                        |
| `context-critical` | `pct >= 95`                                     | `tokenCount >= hard`                                                 | Добавить фразу «Auto-compact will force on next send.» для отражения нового поведения hard-уровня |

**Влияние на частоту срабатывания:**

- Основной путь (auto работает нормально): `tokenCount` пересекает auto, сразу запускается сжатие, на следующем шаге `tokenCount` снижается, поэтому `context-high` виден лишь короткое время между «запуском сжатия и его применением»
- Граничный путь (auto не сработал / предохранитель / reactive не успел): `tokenCount` продолжает расти, последовательно проходя warn → auto → hard и запуская три tip-а, что согласуется с пользовательским восприятием «контекст становится всё больше»
- При срабатывании `context-critical` hard-уровень уже запускает force compress перед send (см. изменения в цепочке spec), так что этот tip — по сути «уведомление post-rescue», а не «предупреждение pre-rescue»; текст дополнен соответствующим пояснением

Добавить в интерфейс `TipContext`:

```ts
export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  // Новое поле: чтобы функция isRelevant имела доступ к порогам.
  // computeThresholds вычисляется на стороне вызывающего кода и передается,
  // чтобы tipRegistry не зависел напрямую от core.
  thresholds?: CompactionThresholds;
}
```

В `AppContainer.tsx:1150` при конструировании `TipContext` синхронно передавать его.

### Синхронизация команды /context (`contextCommand.ts:177-183`)

```ts
// Вместо жестко заданного (1 - threshold) * contextWindowSize
const { warn, auto, hard, effectiveWindow } =
  computeThresholds(contextWindowSize);

// Отображать четыре строки:
//   Effective window:   180K   (window − 20K reserve)
//   Warn threshold:     147K   (...)
//   Auto threshold:     167K   ← текущая позиция
//   Hard threshold:     177K
// Показывать, на каком уровне находится текущее количество токенов
```

### Постоянное отображение в Footer (опционально, follow-up)

Данная спецификация **не требует** обязательной реализации постоянного отображения в Footer. Причины:

- Существующая система tip-ов уже показывает подсказки в истории
- Постоянное отображение в Footer потребует изменения рендеринга ink и увеличения частоты перерисовки
- Это может быть реализовано как follow-up к данной спецификации (отдельный PR)

Если делать позже, предлагается условие срабатывания `tokenCount >= warn && tokenCount < auto`; скрывать после превышения auto (сжатие уже началось).

## Покрытие тестами

### Модульные тесты (chatCompressionService.test.ts)

- `computeThresholds(32K)` → ветка с процентным запасом (warn/auto — pct, hard — деградация)
- `computeThresholds(128K)` → смешанная ветка (warn=pct, auto=abs, hard=abs)
- `computeThresholds(200K)` → ветка абсолютного замещения (warn/auto/hard — все abs)
- `computeThresholds(1M)` → ветка со всеми абсолютными значениями
- `computeThresholds(window=10K)` → минимальное окно (все абсолютные значения отрицательны), формула не ломается
- Три порога всегда удовлетворяют `warn <= auto <= hard`
- Формула max() стабильна на граничных точках (pct \* window == abs)

### Модульные тесты (tokenEstimation.test.ts)

- `estimateContentTokens` для plain text / json / functionCall / functionResponse / image / document — соответствующий bytesPerToken
- `estimatePromptTokens` при `lastPromptTokenCount > 0` идет по «основному пути», при равенстве 0 — по «пути первого раунда»
- Большое сообщение пользователя на этапе cheap-gate добавляется так, что превышает порог auto
- Отклонение оценки от реального API usage в пределах ±30% (регрессия на реальных исторических выборках)

### Интеграционные тесты (geminiChat.test.ts / chatCompressionService.test.ts)

- После 3 последовательных ошибок cheap-gate — NOOP; после следующего force — восстановление
- Одиночная ошибка больше не блокирует навсегда
- При превышении оценки токенов порога hard send принудительно запускает force compress
- При сжатии вызов sideQuery с `maxOutputTokens = COMPACT_MAX_OUTPUT_TOKENS` корректно передается в `runSideQuery`, `thinkingConfig.includeThoughts` равен `false` (или задается значением по умолчанию для sideQuery)
- **Покрытие первого раунда**: создается чат с `lastPromptTokenCount = 0`, но с огромной историей (симуляция восстановления через `--continue`); при первом send порог auto должен срабатывать через путь оценки.
### 兼容性测试

- 设置 `contextPercentageThreshold = 0.5` 启动 → stderr 警告 + 字段被忽略，行为以内部 PCT 常量为准

### Tip 系统测试（tipRegistry.test.ts）

- 三条 context-\* tip 在跨越 warn/auto/hard 时正确触发，且区间不重叠
- 主路径下 auto 阈值触发压缩后 `context-high` 不持续可见
- 边缘路径（熔断 + token 继续涨）下三条 tip 依次触发
- TipContext 缺 `thresholds` 时（fallback）行为合理

## 实施分阶段

| Phase | 内容                                                                                         | 独立性             |
| ----- | -------------------------------------------------------------------------------------------- | ------------------ |
| 1     | 内部常量 + `computeThresholds` + cheap-gate 改动（不含估算补偿）                             | 可独立合并         |
| 2     | 失败处理升级（1 → 3 熔断）                                                                   | 可独立合并         |
| 3     | hard 层 force compress 提前                                                                  | 依赖 P1 + P7       |
| 4     | 配置面变更 + breaking change 警告                                                            | 依赖 P1            |
| 5     | UI（tip 重写 + /context）                                                                    | 依赖 P1            |
| 6     | 压缩 sideQuery 关 thinking + 加 `maxOutputTokens` 上限                                       | 独立可先于 P1 落地 |
| 7     | Token 估算补偿（`estimateContentTokens` + `estimatePromptTokens`，应用到 cheap-gate / hard） | 独立可与 P1 并行   |

每个 Phase 可独立 PR。建议合并顺序 **P6 → P7 → P1 → P2 → P4 → P3 → P5**：先给压缩调用打上 `maxOutputTokens` 上限（让 buffer 假设可信）；再加估算补偿（让 token 数判断更可靠）；再把阈值基础设施落地；再做失败熔断、配置面变更；最后才打开 hard 层主动救场（这时已有可靠的 token 数 + 熔断器）。每个 PR 都能独立验证、独立回滚。

## 风险与注意事项

1. **关 thinking 可能影响摘要质量。** 原作者注释 "Compression quality drives every subsequent main turn — keep reasoning on" 表达过对此的担忧。本 spec 的判断是「可预测的 token 上限」优先于「最大化质量」，但落地后需要观察 telemetry 里 `compression_input_token_count` / `compression_output_token_count` 的分布，以及主对话在压缩后的质量变化（用户反馈、`COMPRESSION_FAILED_*` 状态率）。如果质量下降明显，再考虑回退到 thinking 开启 + provider-specific thinkingBudget 控制。

2. **`maxOutputTokens` 触顶可能导致 summary 被截断。** 关 thinking 后，20K 直接限制 summary 主体；claude-code 实测 p99.99 ≈ 17K，留 ~3K 安全冗余。但 qwen-code 的压缩 prompt 与 claude-code 不同，分布需要观测。建议在压缩失败分支（[chatCompressionService.ts:464-491](packages/core/src/services/chatCompressionService.ts:464)）追加「检测到 finish_reason = MAX_TOKENS」的 NOOP 路径，避免持久化半截 summary。

3. **跨 provider 的 maxOutputTokens 映射差异。** OpenAI compat (dashscope) → `max_tokens`、Anthropic → `max_tokens`、Gemini SDK → `maxOutputTokens`。当前 qwen-code 已有这层映射（[contentGenerator.ts:94](packages/core/src/core/contentGenerator.ts:94) 等），需要在 P6 实现时验证 sideQuery 路径上 `maxOutputTokens` 字段确实贯穿到所有 provider 的请求体。

4. **Token 估算是粗略下界，不应反向用作"跳过触发"的依据。** `char/4` 与各 provider 真实 tokenizer 偏差可能 ±30%。本 spec 只用估算来「让阈值更早触发」（false-positive 方向，宁可早压不可晚压）。所有「降低 token 计数 / 跳过压缩」的代码路径仍应使用 `lastPromptTokenCount`（API 权威值）。

5. **估算函数与现有 `estimateContentChars` 的关系。** [compactionInputSlimming.ts](packages/core/src/services/compactionInputSlimming.ts) 已经有 `estimateContentChars`（用于压缩 split point 计算），新增的 `estimateContentTokens` 应复用它（除以 bytesPerToken）而非新写一套，避免两套估算口径出现分歧。

## 不在本 spec 范围

- Env 变量覆盖通道（D 方案）：维持「配置面最小」原则
- Footer 常驻可视化：留作 follow-up
- 摘要 prompt 改进、`MIN_COMPRESSION_FRACTION` 调整：与阈值设计正交

## 开放问题（等 review）

1. **breaking change 强度**：警告 + 忽略字段 vs 启动报错。当前选警告，需要确认对企业部署/团队配置是否够友好

## 已结案

2. **小窗口（≤ ~76.7K）下 hard 与 auto 退化为同一值** — 决定**不在 `/context` 明示**。理由：
   - 塌缩范围不只是 32K，所有 `effectiveWindow - HARD_BUFFER ≤ 0.7 × window` 的窗口都塌缩（包括 64K）
   - 用户行为不变：塌缩窗口上 `currentTier` 跳过 `'auto'` 直接报 `'hard'`（`contextCommand.ts:43-44` 先判 `>= hard`），`context-high` band（`auto ≤ t < hard`）变成空带，少一档提示在小窗口上是合理的——窗口本身就小，用户大概率手动管理上下文
   - 如果未来有真实用户报告"小窗口看不到中间档提示"，再决定加 UI 标注或调整 `context-high` 触发条件（这是 UI 工作，不是 spec 工作）。当前选不增加 UI 复杂度
