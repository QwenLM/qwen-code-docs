# Дизайн: тайм-аут бездействия при потоковой передаче для OpenAI-совместимого пайплайна

- **Дата:** 2026-06-24
- **Компонент:** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **Статус:** Дизайн утверждён (аудит 7 раундов), готов к TDD
- **Область:** только меры #1 + #2 (watchdog + abort + синтезированный ETIMEDOUT). Вне области: терминальное SSE-событие для UI (#9), не-потоковый путь.

## Проблема

Инцидент с DataAgent («запрос выполняется, но не возвращает ответ») был вызван шлюзом модели (Aliyun PrivateLink → DashScope/Bailian `compatible-mode`, qwen3.7-max), который принял запрос (HTTP 200), но **ничего не передавал** — SSE-соединение оставалось открытым и молчало в течение ~595 секунд без `finish_reason`.

qwen-code не имел эффективного механизма восстановления:

- Тайм-аут `timeout` клиента OpenAI (`DEFAULT_TIMEOUT = 120_000`) — это **тайм-аут на уровне запроса** (соединение + получение объекта ответа). Как только
  `chat.completions.create({stream:true})` возвращает поток после быстрого ответа 200,
  бездействие между чанками во время `for await` становится **неограниченным**.
- Единственный таймер бездействия (`STREAM_IDLE_TIMEOUT_MS = 5min` в
  `loggingContentGenerator.ts`) — **только для телеметрии** — он закрывает OTel-спан,
  чтобы избежать утечки, но **не прерывает запрос и не выбрасывает исключение**.

Таким образом, поток с 200-ответом, а затем тишиной зависает до разрыва соединения или истечения 30-минутного TTL взаимодействия, и цикл повторных попыток (`NO_FINISH_REASON`) никогда не срабатывает, потому что поток никогда не завершается.

## Ключевая идея

Транспортный уровень _должен был_ сгенерировать `ETIMEDOUT` при бездействии сокета, но не сделал этого (сокет оставался открытым без данных). Исправление заключается в том, чтобы **добавить тайм-аут бездействия, которого не хватает на уровне транспорта, и синтезировать `ETIMEDOUT`, который он не смог сгенерировать** — сделать тихую зависшую ситуацию неотличимой от реального тайм-аута чтения, который уже обрабатывается существующим стеком повторных попыток/задержки/отката.

## Проверенные механизмы (аудит)

1. `pipeline.executeStream` создаёт `perRequestAc = createChildAbortController(parentSignal)`
   и передаёт `perRequestAc.signal` в SDK. Это контроллер, который
   фактически отменяет fetch. Обёртка логирования на уровень выше имеет только
   сигнал только для чтения — поэтому watchdog должен находиться в **пайплайне**.
2. `classifyRetryError` сначала проверяет `isRetryAbortError` (isAbortError ||
   name==='CanceledError') → любая отмена = `{kind:'abort',
diagnosis:'fail-fast'}` = **не повторяемая**. Поэтому watchdog НЕ должен выдавать
   сырой AbortError.
3. `getTransportCode(err)` читает `err.code` / `err.cause.code`; простой
   `Object.assign(new Error(...), {code:'ETIMEDOUT'})` →
   `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}`.
4. Повторная попытка транспорта потока geminiChat срабатывает, когда
   `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT}
&& !streamYieldedChunk` (`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`). Таким образом, тайм-аут **первого байта / нулевого чанка** (именно такой был в инциденте) автоматически повторяется; зависание **после** чанков обрабатывается как ошибка транспорта (без повторных попыток — приемлемо).

## Решения (зафиксированы)

| Решение                           | Выбор                                                             |
| --------------------------------- | ----------------------------------------------------------------- |
| Значение тайм-аута и конфигурация | Новый `contentGenerator.streamIdleTimeoutMs`, по умолчанию **120000ms** |
| При срабатывании тайм-аута        | **Прерывание + синтезированный ETIMEDOUT** (использовать транспортную повторную попытку) |
| Область PR                        | **Только #1 + #2** (терминальное SSE-событие — отдельный PR)      |
| 5-минутный таймер телеметрии      | **Оставить как запасной** (без изменений)                          |

## Дизайн

Все изменения в `packages/core/src/core/openaiContentGenerator/`.

### 1. Конфигурация

Добавить `streamIdleTimeoutMs?: number` в `ContentGeneratorConfig`
(`contentGenerator.ts`). Пайплайн разрешает его как
`this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS`
(`120_000`). Значение `<= 0` отключает watchdog (пропускает).

### 2. Генератор тайм-аута бездействия (`pipeline.ts`)

Приватный асинхронный генератор оборачивает **сырой поток чанков SDK** до
`processStreamWithLogging`:

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

Таймер **сбрасывается при каждом сыром чанке** (включая дельты размышления/рассуждения), поэтому модель, которая долго размышляет и передаёт чанки размышлений, никогда не будет ошибочно прервана; только истинное молчание (отсутствие чанка в течение `idleMs`) сработает.

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

После того, как Stage 1 создаёт `stream`, обернуть его до Stage 2. Потоковые запросы всегда используют контроллер на запрос, чтобы watchdog мог прервать запрос SDK, даже если вызывающий код не предоставил родительский сигнал:

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

## Поведение после изменения

- Ответ 200, затем тишина (нулевое количество чанков) → через `idleMs`: прерывание fetch + выброс ETIMEDOUT →
  `{transport, retryable}` → транспортная повторная попытка (×2, `!streamYieldedChunk`) →
  автоматическое восстановление; при исчерпании попыток — ошибка транспорта.
- Зависание после некоторых чанков → выброс ETIMEDOUT; `streamYieldedChunk` равно true, поэтому
  **не выполняется** транспортная повторная попытка — ошибка (без рискованного повторного воспроизведения середины генерации).
- Активный поток (включая размышления) → таймер сбрасывается при каждом чанке; никогда не срабатывает.
- Прерывание родителем/пользователем → AbortError передаётся без изменений (быстрая отмена пользователем).
- 5-минутный таймер телеметрии становится запасным, который предваряется watchdog'ом с ~120с; остаётся без изменений.

## Вне области

- Терминальное SSE `turn_error` при исчерпании повторных попыток (#9) — отдельный PR.
- Не-потоковый `execute()` — уже ограничен тайм-аутом на уровне запроса 120с.

## Тестирование (TDD)

В `pipeline.test.ts`, с использованием `vi.useFakeTimers()` и управляемого мок-потока (выдаёт N чанков, затем `next()` возвращает никогда не разрешающееся обещание):

1. **Зависание без чанков** → потребление потока завершается ошибкой с `code === 'ETIMEDOUT'` после продвижения на `idleMs`.
2. **Зависание после чанков** → выданные чанки доставляются, затем ошибка с `code === 'ETIMEDOUT'`.
3. **Активный поток сбрасывает таймер** → чанки, поступающие в течение `idleMs`, никогда не срабатывают watchdog; поток завершается нормально.
4. **Приоритет прерывания родителем** → при прерванном родительском сигнале в момент тайм-аута ошибка является AbortError, а не ETIMEDOUT.
5. **Отключено при `streamIdleTimeoutMs <= 0`** → зависший поток не выбрасывает ошибку при продвижении таймера (пропускает).
6. **Пользовательский `streamIdleTimeoutMs`** → используется заданное значение (срабатывает через настроенное количество мс, а не по умолчанию).
7. **Подавление отказа SDK-запроса `next()`** → после того, как watchdog прерывает запрос, последующий отказ SDK с `AbortError` от ожидающего `next()` подавляется и не вызывает `unhandledRejection`.