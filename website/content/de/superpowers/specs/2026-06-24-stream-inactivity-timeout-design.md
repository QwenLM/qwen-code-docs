# Design: Inaktivitäts-Timeout für Streaming in der OpenAI-kompatiblen Pipeline

- **Datum:** 2026-06-24
- **Komponente:** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **Status:** Genehmigtes Design (7 Runden geprüft), bereit für TDD
- **Umfang:** nur Maßnahmen #1 + #2 (Watchdog + Abbruch + synthetischer ETIMEDOUT). Außerhalb des Umfangs: Terminal-SSE-Event an die UI (#9), Nicht-Streaming-Pfad.

## Problem

Ein DataAgent-Vorfall („läuft immer, gibt aber nichts zurück“) hatte seine Ursache im Modell-Gateway (Aliyun PrivateLink → DashScope/Bailian `compatible-mode`, qwen3.7-max), das eine Anfrage akzeptierte (HTTP 200), dann aber **nichts streamte** — der SSE-Body blieb für ~595s offen und still, ohne `finish_reason`.

qwen-code hatte keine wirksame Wiederherstellung:

- Der OpenAI-Client-`timeout` (`DEFAULT_TIMEOUT = 120_000`) ist **Request-Ebene** (Verbindungsaufbau + Abruf des Response-Objekts). Sobald `chat.completions.create({stream:true})` den Stream nach einem schnellen 200 zurückgibt, ist die Inaktivität zwischen den Chunks während `for await` **unbegrenzt**.
- Der einzige Inaktivitäts-Timer (`STREAM_IDLE_TIMEOUT_MS = 5min` in `loggingContentGenerator.ts`) ist **nur für Telemetrie** — er schließt den OTel-Span (damit er nicht leckt), bricht die Anfrage jedoch **nicht** ab und wirft auch nichts.

Ein 200-dann-stiller Stream hängt also, bis die Verbindung stirbt oder das 30-minütige Interaktions-TTL erreicht ist, und die Content-Wiederholungsschleife (`NO_FINISH_REASON`) wird nie aktiv, weil der Stream nie abschließt.

## Zentrale Erkenntnis

Die Transportschicht hätte eigentlich einen `ETIMEDOUT` auf einem inaktiven Socket erzeugen sollen, tat es aber nicht (der Socket blieb ohne Daten offen). Die Lösung besteht darin, **das Inaktivitäts-Timeout hinzuzufügen, das der Transport vermissen lässt, und den `ETIMEDOUT` zu synthetisieren, den er nicht ausgelöst hat** — eine stille Blockade wird so von einem echten Lese-Timeout ununterscheidbar, was der vorhandene Retry/Backoff/Fallback-Stack bereits handhabt.

## Geprüfte Mechanik (Audit)

1. `pipeline.executeStream` erstellt `perRequestAc = createChildAbortController(parentSignal)` und übergibt `perRequestAc.signal` an das SDK. Dies ist der Controller, der tatsächlich den Fetch abbricht. Der Logging-Wrapper eine Ebene darüber hat nur das schreibgeschützte Signal – der Watchdog muss also in der **Pipeline** leben.
2. `classifyRetryError` prüft `isRetryAbortError` (isAbortError || name==='CanceledError') **zuerst** → jeder Abbruch = `{kind:'abort', diagnosis:'fail-fast'}` = **nicht wiederholbar**. Daher darf der Watchdog keinen rohen AbortError ausliefern.
3. `getTransportCode(err)` liest `err.code` / `err.cause.code`; ein einfaches `Object.assign(new Error(...), {code:'ETIMEDOUT'})` → `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}`.
4. Der Stream-Transport-Retry von geminiChat feuert, wenn `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT} && !streamYieldedChunk` (`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`). Ein **erstes-Byte / Null-Chunk**-Timeout (genau der Vorfall) wiederholt sich automatisch; eine Blockade **nach** Chunks erscheint als Transportfehler (kein Retry – akzeptabel).

## Entscheidungen (festgelegt)

| Entscheidung                    | Wahl                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| Timeout-Wert & Konfiguration    | Neuer `contentGenerator.streamIdleTimeoutMs`, Standard **120000ms** |
| Bei Timeout                     | **Abbruch + synthetischer ETIMEDOUT** (Transport-Retry wiederverwenden) |
| PR-Umfang                       | **Nur #1 + #2** (Terminal-SSE-Event ist separater PR)         |
| 5-Min-Telemetrie-Idle-Timer     | **Als Backstop behalten** (unverändert)                       |

## Design

Alle Änderungen in `packages/core/src/core/openaiContentGenerator/`.

### 1. Konfiguration

Füge `streamIdleTimeoutMs?: number` zu `ContentGeneratorConfig` hinzu (`contentGenerator.ts`). Die Pipeline löst es auf als `this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS` (`120_000`). Ein Wert `<= 0` deaktiviert den Watchdog (Passthrough).

### 2. Inaktivitäts-Timeout-Generator (`pipeline.ts`)

Ein privater asynchroner Generator umschließt den **rohen SDK-Chunk-Stream** vor `processStreamWithLogging`:

```ts
async function* withStreamInactivityTimeout(
  source: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
  idleMs: number,
  abortRequest: () => void, // bricht perRequestAc ab → gibt den Socket frei
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
          // User-Abbruch hat Vorrang vor unserem Timeout-Rela bel.
          // Verwende einen einfachen Error (KEIN DOMException): Die Fehlerbereinigung klont via
          // Object.create(getPrototypeOf(err)), was eine DOMException beschädigt
          // (ihr `name` ist ein Internal-Slot-Getter, den der Klon nicht hat). `name ===
          // 'AbortError'` erfüllt isAbortError.
          if (parentSignal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          } else {
            abortRequest(); // bricht perRequestAc ab → Fetch beenden
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
        // Nach unserem Abbruch lehnt die verwaiste nextPromise mit AbortError ab;
        // schlucken, damit es keine unbehandelte Zurückweisung gibt.
        void Promise.resolve(nextPromise).catch(() => {});
        throw err;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) return;
      chunksReceived += 1;
      yield result.value; // Ein Chunk ist angekommen → nächster Schleifendurchlauf startet neuen Timer
    }
  } finally {
    abortRequest();
    try {
      await it.return?.();
    } catch {
      // Der Abbruch oben ist die entscheidende Bereinigung; Fehler von return ignorieren.
    }
  }
}
```

Der Timer **setzt bei jedem rohen Chunk zurück** (einschließlich Thinking/Reasoning-Deltas), sodass ein langes denkendes Modell, das Reasoning streamt, niemals fälschlich abgebrochen wird; nur echte Stille (kein Chunk für `idleMs`) löst ihn aus.

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

### 3. Einbindung in `executeStream`

Nachdem Stufe 1 den `stream` erstellt hat, wird er vor Stufe 2 umschlossen. Streaming-Anfragen verwenden immer einen anforderungsspezifischen Controller, damit der Watchdog die SDK-Anfrage auch dann abbrechen kann, wenn der Aufrufer kein parent-Signal bereitgestellt hat:

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
// ...processStreamWithLogging(guarded, context, request) wie bisher,
// wobei der vorhandene drainThenCleanup-Wrapper erhalten bleibt.
```

## Verhalten nach der Änderung

- 200-dann-still (null Chunks) → nach `idleMs`: Fetch abbrechen + ETIMEDOUT werfen → `{transport, retryable}` → Transport-Retry (×2, `!streamYieldedChunk`) → automatische Wiederherstellung; bei Erschöpfung erscheint es als Transportfehler.
- Blockade nach einigen Chunks → ETIMEDOUT geworfen; `streamYieldedChunk` ist true, daher wird es **nicht** transport-retried — erscheint als Fehler (kein riskantes Wiederholen während der Generierung).
- Aktiver Stream (einschließlich Thinking) → Timer setzt sich pro Chunk zurück; nie ausgelöst.
- Parent/User-Abbruch → AbortError unverändert weitergegeben (Fail-Fast User-Cancel).
- Der 5-Min-Telemetrie-Idle-Timer wird zum Backstop, den der ~120s-Watchdog vorwegnimmt; bleibt unverändert.

## Außerhalb des Umfangs

- Terminales `turn_error`-SSE bei Erschöpfung der Wiederholungen (#9) — separater PR.
- Nicht-Streaming `execute()` — bereits durch das 120s-Request-Timeout begrenzt.

## Testen (TDD)

In `pipeline.test.ts`, mit `vi.useFakeTimers()` und einem steuerbaren Mock-Stream (gibt N Chunks aus, dann gibt `next()` ein nie aufgelöstes Promise zurück):

1. **Null-Chunk-Blockade** → das Konsumieren des Streams lehnt mit einem Fehler ab, dessen `code === 'ETIMEDOUT'` ist, nachdem `idleMs` vergangen ist.
2. **Blockade nach Chunks** → die ausgegebenen Chunks kommen durch, dann lehnt es mit `code === 'ETIMEDOUT'` ab.
3. **Aktiver Stream setzt Timer zurück** → Chunks, die innerhalb von `idleMs` eintreffen, lösen den Watchdog nie aus; der Stream schließt normal ab.
4. **Parent-Abbruch hat Vorrang** → wenn das parent-Signal beim Timeout abgebrochen ist, ist der Fehler ein AbortError, kein ETIMEDOUT.
5. **Deaktiviert bei `streamIdleTimeoutMs <= 0`** → ein hängender Stream wirft beim Timer-Fortschritt nichts aus (Passthrough).
6. **Benutzerdefiniertes `streamIdleTimeoutMs`** → der konfigurierte Wert wird eingehalten (löst nach den konfigurierten ms aus, nicht nach dem Standard).
7. **Verwaiste SDK-`next()`-Zurückweisung** → nachdem der Watchdog die Anfrage abgebrochen hat, wird eine spätere SDK-`AbortError`-Zurückweisung des ausstehenden `next()` geschluckt und löst kein `unhandledRejection` aus.