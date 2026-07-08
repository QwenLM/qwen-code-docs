# Дизайн: таймаут неактивности стрима для OpenAI-совместимого пайплайна

- **Дата:** 2026-06-24
- **Компонент:** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **Статус:** Утвержденный дизайн (прошел 7 раундов аудита), готов к TDD
- **Область применения:** только меры #1 + #2 (watchdog + abort + синтетический ETIMEDOUT). Вне области: терминальное SSE-событие в UI (#9), нестриминговый путь.

## Проблема

Инцидент с DataAgent («всё время работает и не возвращает результат»), корневая причина которого заключалась в том, что шлюз модели (Aliyun PrivateLink → DashScope/Bailian `compatible-mode`, qwen3.7-max) принимал запрос (HTTP 200), но затем **ничего не стримил** — тело SSE оставалось открытым и молчало около 595 секунд без `finish_reason`.

У qwen-code не было эффективного механизма восстановления:

- Таймаут клиента OpenAI (`DEFAULT_TIMEOUT = 120_000`) работает **на уровне запроса** (подключение + получение объекта ответа). После того как `chat.completions.create({stream:true})` возвращает стрим после быстрого 200, неактивность между чанками в цикле `for await` **не ограничена**.
- Единственный таймер неактивности (`STREAM_IDLE_TIMEOUT_MS = 5min` в `loggingContentGenerator.ts`) предназначен **только для телеметрии** — он закрывает OTel-спэн, чтобы тот не утекал, но **не прерывает** запрос и не выбрасывает ошибку.

В результате стрим, получивший 200 и затем замолчавший, висит до тех пор, пока не умрет соединение или не истечет 30-минутный TTL взаимодействия, а цикл повторных попыток для контента (`NO_FINISH_REASON`) никогда не срабатывает, потому что стрим никогда не завершается.

## Ключевая идея

Транспортный уровень _должен был_ сгенерировать `ETIMEDOUT` для неактивного сокета, но не сделал этого (сокет оставался открытым без данных). Решение заключается в том, чтобы **добавить таймаут неактивности, которого не хватает транспорту, и синтезировать `ETIMEDOUT`, который он не смог эмитировать** — это сделает тихую паузу неотличимой от реального таймаута чтения, который уже обрабатывается существующим стеком retry/backoff/fallback.

## Проверенные механики (аудит)

1. `pipeline.executeStream` создает `perRequestAc = createChildAbortController(parentSignal)` и передает `perRequestAc.signal` в SDK. Именно этот контроллер фактически отменяет fetch. Обертка для логирования уровнем выше имеет только сигнал только для чтения — поэтому watchdog должен находиться в **пайплайне**.
2. `classifyRetryError` проверяет `isRetryAbortError` (isAbortError || name==='CanceledError') **в первую очередь** → любой abort = `{kind:'abort', diagnosis:'fail-fast'}` = **не подлежит повторной попытке (not retryable)**. Поэтому watchdog НЕ ДОЛЖЕН пробрасывать сырой AbortError.
3. `getTransportCode(err)` читает `err.code` / `err.cause.code`; обычный `Object.assign(new Error(...), {code:'ETIMEDOUT'})` → `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}`.
4. stream-transport-retry в geminiChat срабатывает, когда `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT} && !streamYieldedChunk` (`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`). Таким образом, таймаут **первого байта / нулевого чанка** (именно то, что было в инциденте) автоматически повторяется; пауза **после** чанков проявляется как транспортная ошибка (без retry — что приемлемо).

## Принятые решения (зафиксированы)

| Решение | Выбор |
| --- | --- |
| Значение и конфиг таймаута | Новый `contentGenerator.streamIdleTimeoutMs`, по умолчанию **120000 мс** |
| При таймауте | **Abort + синтетический ETIMEDOUT** (переиспользование transport-retry) |
| Область PR | **Только #1 + #2** (терминальное SSE-событие — это отдельный PR) |
| 5-минутный телеметрический таймер неактивности | **Оставить как страховку** (без изменений) |

## Дизайн

Все изменения в `packages/core/src/core/openaiContentGenerator/`.

### 1. Конфигурация

Добавить `streamIdleTimeoutMs?: number` в `ContentGeneratorConfig` (`contentGenerator.ts`). Пайплайн резолвит его как `this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS` (`120_000`). Значение `<= 0` отключает watchdog (прозрачная передача).

### 2. Генератор таймаута неактивности (`pipeline.ts`)

Приватный асинхронный генератор оборачивает **сырой стрим чанков SDK** перед `processStreamWithLogging`:

```ts
async function* withStreamInactivityTimeout(
  source: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
  idleMs: number,
  abortRequest: () => void, // aborts perRequestAc → frees the socket
  parentSignal: AbortSignal | undefined,
): AsyncGenerator<OpenAI.Chat.ChatCompletionChunk> {
  const it = source[Symbol.asyncIterator]();
  const streamStartedAt = Date.now();
  let chunksReceived = 0;
  try {
    while (true) {
      const nextPromise = it.next();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // User cancel takes precedence over our timeout relabel.
          // Use a plain Error (NOT DOMException): error redaction clones via
          // Object.create(getPrototypeOf(err)), which corrupts a DOMException
          // (its `name` is an internal-slot getter the clone lacks). `name ===
          // 'AbortError'` satisfies isAbortError.
          if (parentSignal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          } else {
            abortRequest(); // abort perRequestAc → fetch tears down
            reject(
              new StreamInactivityTimeoutError(
                idleMs,
                chunksReceived,
                Date.now() - streamStartedAt,
              ),
            ); // code: 'ETIMEDOUT'
          }
        }, idleMs);
        timer.unref?.();
      });
      let result: IteratorResult<OpenAI.Chat.ChatCompletionChunk>;
      try {
        result = await Promise.race([nextPromise, timeout]);
      } catch (err) {
        // After we abort, the orphaned nextPromise rejects with AbortError;
        // swallow it so it is not an unhandled rejection.
        void Promise.resolve(nextPromise).catch(() => {});
        throw err;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) return;
      chunksReceived += 1;
      yield result.value; // a chunk arrived → next loop starts a fresh timer
    }
  } finally {
    abortRequest();
    try {
      await it.return?.();
    } catch {
      // The abort above is the cleanup that matters; ignore return failures.
    }
  }
}
```

Таймер **сбрасывается на каждом сыром чанке** (включая дельты thinking/reasoning), поэтому модель, которая долго думает и стримит рассуждения, никогда не будет ошибочно прервана; срабатывает только реальная тишина (отсутствие чанка в течение `idleMs`).

```ts
class StreamInactivityTimeoutError extends Error {
  readonly code = 'ETIMEDOUT' as const;

  constructor(
    readonly idleMs: number,
    readonly chunksReceived: number,
    readonly streamLifetimeMs: number,
  ) {
    super(`No stream activity for ${idleMs}ms (inactivity timeout)`);
    this.name = 'StreamInactivityTimeoutError';
  }
}
```

### 3. Подключение в `executeStream`

После того как Этап 1 создает `stream`, оборачиваем его перед Этапом 2. Стриминговые запросы всегда используют per-request контроллер, чтобы watchdog мог отменить запрос SDK, даже если вызывающая сторона не предоставила родительский сигнал:

```ts
const idleMs =
  this.contentGeneratorConfig.streamIdleTimeoutMs ??
  DEFAULT_STREAM_IDLE_TIMEOUT_MS;
const guarded =
  idleMs > 0
    ? withStreamInactivityTimeout(
        stream,
        idleMs,
        () => perRequestAc.abort(),
        parentSignal,
      )
    : stream;
// ...processStreamWithLogging(guarded, context, request) as today,
// keeping the existing drainThenCleanup wrapper.
```

## Поведение после изменений

- 200 и затем тишина (ноль чанков) → через `idleMs`: abort fetch + выброс ETIMEDOUT → `{transport, retryable}` → transport-retry (×2, `!streamYieldedChunk`) → автоматическое восстановление; при исчерпании попыток проявляется как транспортная ошибка.
- Пауза после нескольких чанков → выбрасывается ETIMEDOUT; `streamYieldedChunk` равен true, поэтому **не** повторяется через transport-retry — проявляется как ошибка (без рискованного повторного воспроизведения в середине генерации).
- Активный стрим (включая thinking) → таймер сбрасывается на каждом чанке; никогда не срабатывает.
- Abort от родителя/пользователя → AbortError пробрасывается без изменений (fail-fast отмена пользователем).
- 5-минутный телеметрический таймер неактивности становится страховкой, которую ~120-секундный watchdog перехватывает; остается без изменений.

## Вне области применения

- Терминальное SSE `turn_error` при исчерпании retry (#9) — отдельный PR.
- Нестриминговый `execute()` — уже ограничен 120-секундным таймаутом на уровне запроса.

## Тестирование (TDD)

В `pipeline.test.ts`, используя `vi.useFakeTimers()` и управляемый мок-стрим (отдает N чанков, затем `next()` возвращает promise, который никогда не резолвится):

1. **Пауза без чанков** → потребление стрима отклоняется с ошибкой, у которой `code === 'ETIMEDOUT'`, после продвижения времени на `idleMs`.
2. **Пауза после чанков** → отданные чанки проходят, затем отклоняется с `code === 'ETIMEDOUT'`.
3. **Активный стрим сбрасывает таймер** → чанки, поступающие в пределах `idleMs`, никогда не активируют watchdog; стрим завершается нормально.
4. **Приоритет abort от родителя** → если родительский сигнал прерывается в момент таймаута, ошибка является AbortError, а не ETIMEDOUT.
5. **Отключено при `streamIdleTimeoutMs <= 0`** → висящий стрим не выбрасывает ошибку при продвижении таймера (прозрачная передача).
6. **Кастомный `streamIdleTimeoutMs`** → сконфигурированное значение соблюдается (срабатывает на настроенных мс, а не на дефолтных).
7. **Потерянное отклонение SDK `next()`** → после того как watchdog отменяет запрос, последующее отклонение SDK `AbortError` от ожидающего `next()` проглатывается и не генерирует `unhandledRejection`.