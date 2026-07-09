# Design: Streaming-Inaktivitäts-Timeout für die OpenAI-kompatible Pipeline

- **Datum:** 2026-06-24
- **Komponente:** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **Status:** Genehmigtes Design (7 Runden geprüft), bereit für TDD
- **Umfang:** nur Maßnahmen #1 + #2 (Watchdog + Abort + synthetisches ETIMEDOUT). Nicht im Umfang: terminales SSE-Event an die UI (#9), Non-Streaming-Pfad.

## Problem

Ein DataAgent-Vorfall ("läuft endlos ohne Rückmeldung") wurde auf das Model-Gateway (Aliyun PrivateLink → DashScope/Bailian `compatible-mode`, qwen3.7-max) zurückgeführt, das eine Anfrage (HTTP 200) akzeptierte, aber dann **nichts streamte** – der SSE-Body blieb für ~595s offen und still, ohne `finish_reason`.

qwen-code verfügte über keine effektive Recovery:

- Der OpenAI-Client `timeout` (`DEFAULT_TIMEOUT = 120_000`) ist **request-level** (Connect + Abrufen des Response-Objekts). Sobald `chat.completions.create({stream:true})` den Stream nach einem schnellen 200 zurückgibt, ist die Inaktivität zwischen den Chunks während `for await` **unbegrenzt**.
- Der einzige Inaktivitäts-Timer (`STREAM_IDLE_TIMEOUT_MS = 5min` in `loggingContentGenerator.ts`) ist **reine Telemetrie** – er schließt den OTel-Span, damit er nicht leakt, er **bricht die Anfrage nicht ab** und wirft keinen Fehler.

Daher hängt ein Stream, der nach einem 200 verstummt, bis die Verbindung abbricht oder die 30-minütige Interaktions-TTL abläuft. Die Content-Retry-Schleife (`NO_FINISH_REASON`) greift nicht, da der Stream nie abgeschlossen wird.

## Wichtige Erkenntnis

Die Transport-Schicht _hätte_ bei einem inaktiven Socket ein `ETIMEDOUT` erzeugen sollen, tat es aber nicht (der Socket blieb ohne Daten offen). Die Lösung besteht darin, **das fehlende Inaktivitäts-Timeout des Transports hinzuzufügen und das `ETIMEDOUT` zu synthetisieren, das er nicht ausgegeben hat** – wodurch ein stilles Hängenbleiben nicht mehr von einem echten Read-Timeout zu unterscheiden ist, welches der bestehende Retry/Backoff/Fallback-Stack bereits verarbeitet.

## Verifizierte Mechanik (Audit)

1. `pipeline.executeStream` erstellt `perRequestAc = createChildAbortController(parentSignal)` und übergibt `perRequestAc.signal` an das SDK. Dies ist der Controller, der den Fetch tatsächlich abbricht. Der Logging-Wrapper eine Ebene höher hat nur das read-only Signal – der Watchdog muss also in der **Pipeline** leben.
2. `classifyRetryError` prüft `isRetryAbortError` (isAbortError || name==='CanceledError') **zuerst** → jeder Abort = `{kind:'abort', diagnosis:'fail-fast'}` = **nicht retryable**. Der Watchdog darf also keinen rohen AbortError an die Oberfläche bringen.
3. `getTransportCode(err)` liest `err.code` / `err.cause.code`; ein einfaches `Object.assign(new Error(...), {code:'ETIMEDOUT'})` → `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}`.
4. Der stream-transport-retry von geminiChat feuert, wenn `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT} && !streamYieldedChunk` (`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`). Ein **First-Byte / Zero-Chunk**-Timeout (genau der Vorfall) wird also automatisch retried; ein Hängenbleiben **nach** Chunks tritt als Transport-Fehler auf (kein Retry – akzeptabel).

## Entscheidungen (festgelegt)

| Entscheidung | Wahl |
| -------------------------- | ---------------------------------------------------------------- |
| Timeout-Wert & Konfiguration | Neues `contentGenerator.streamIdleTimeoutMs`, Standard **120000ms** |
| Bei Timeout | **Abort + synthetisches ETIMEDOUT** (Wiederverwendung von transport-retry) |
| PR-Umfang | **nur #1 + #2** (terminales SSE-Event ist ein separater PR) |
| 5-Min-Telemetrie-Idle-Timer | **Als Backstop beibehalten** (unverändert) |

## Design

Alle Änderungen in `packages/core/src/core/openaiContentGenerator/`.

### 1. Konfiguration

Füge `streamIdleTimeoutMs?: number` zu `ContentGeneratorConfig` (`contentGenerator.ts`) hinzu. Die Pipeline löst es auf als `this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS` (`120_000`). Ein Wert `<= 0` deaktiviert den Watchdog (Passthrough).

### 2. Inaktivitäts-Timeout-Generator (`pipeline.ts`)

Ein privater Async-Generator umschließt den **rohen SDK-Chunk-Stream** vor `processStreamWithLogging`:

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

Der Timer wird bei jedem rohen Chunk **zurückgesetzt** (einschließlich Thinking/Reasoning-Deltas), sodass ein langsam denkendes Modell, das Reasoning streamt, nie fälschlicherweise abgebrochen wird; nur echte Stille (kein Chunk für `idleMs`) löst ihn aus.

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

### 3. Verdrahtung in `executeStream`

Nachdem Stage 1 den `stream` erstellt hat, wrappe ihn vor Stage 2. Streaming-Anfragen verwenden immer einen Per-Request-Controller, damit der Watchdog die SDK-Anfrage abbrechen kann, auch wenn der Caller kein Parent-Signal bereitgestellt hat:

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

## Verhalten nach der Änderung

- 200-then-silent (null Chunks) → nach `idleMs`: Fetch abbrechen + ETIMEDOUT werfen → `{transport, retryable}` → transport-retry (×2, `!streamYieldedChunk`) → automatische Erholung; bei Erschöpfung tritt es als Transport-Fehler auf.
- Hängenbleiben nach einigen Chunks → ETIMEDOUT wird geworfen; `streamYieldedChunk` ist true, daher wird es **nicht** per transport-retry wiederholt – tritt als Fehler auf (kein riskantes Mid-Generation-Replay).
- Aktiver Stream (inkl. Thinking) → Timer wird bei jedem Chunk zurückgesetzt; läuft nie ab.
- Parent/User-Abort → AbortError wird unverändert propagiert (Fail-Fast-User-Abbruch).
- Der 5-Min-Telemetrie-Idle-Timer wird zu einem Backstop, das der ~120s-Watchdog aussticht; bleibt unverändert.

## Außerhalb des Umfangs

- Terminales `turn_error`-SSE bei erschöpften Retries (#9) – separater PR.
- Non-Streaming `execute()` – bereits durch den 120s-Request-Level-Timeout begrenzt.

## Tests (TDD)

In `pipeline.test.ts`, mit `vi.useFakeTimers()` und einem kontrollierbaren Mock-Stream (gibt N Chunks aus, dann gibt `next()` ein nie-auflösendes Promise zurück):

1. **Zero-Chunk-Hängenbleiben** → das Konsumieren des Streams rejected mit einem Fehler, dessen `code === 'ETIMEDOUT'` ist, nachdem `idleMs` vorgespult wurde.
2. **Hängenbleiben nach Chunks** → die gelieferten Chunks kommen durch, dann rejected mit `code === 'ETIMEDOUT'`.
3. **Aktiver Stream setzt Timer zurück** → Chunks, die innerhalb von `idleMs` eintreffen, lösen den Watchdog nie aus; der Stream wird normal abgeschlossen.
4. **Vorrang des Parent-Aborts** → wenn das Parent-Signal beim Timeout abgebrochen wird, ist der Fehler ein AbortError, nicht ETIMEDOUT.
5. **Deaktiviert wenn `streamIdleTimeoutMs <= 0`** → ein hängender Stream wirft keinen Fehler beim Vorspulen des Timers (Passthrough).
6. **Benutzerdefiniertes `streamIdleTimeoutMs`** → der konfigurierte Wert wird eingehalten (läuft bei den konfigurierten ms ab, nicht beim Standard).
7. **Verwaiste SDK `next()`-Rejection** → nachdem der Watchdog die Anfrage abgebrochen hat, wird eine spätere SDK `AbortError`-Rejection vom ausstehenden `next()` verschluckt und erzeugt kein `unhandledRejection`.