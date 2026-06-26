# Async Memory Recall — Design-Spezifikation

**Datum:** 2026-05-15
**Status:** Genehmigt
**Zugehörige Issues:** #3761, #3759
**Zugehörige PRs:** #3814, #3866

---

## Problem

`relevanceSelector.ts` verwendet `AbortSignal.timeout(1_000)` (eingeführt in #3866). Bei Kaltstarts der ersten Sitzung benötigt qwen3.5-flash durchschnittlich ~908 ms – und überschreitet damit regelmäßig die 1-Sekunden-Schwelle. Die äußere Frist von 2,5 s in `resolveAutoMemoryWithDeadline` führt dazu, dass jede UserQuery bis zu 2,5 s blockieren kann, selbst wenn der Recall immer fehlschlägt.

Ursache: Der Haupt-Agent-Anfragepfad `await`ed das Recall-Ergebnis, bevor die Anfrage an das Modell gesendet wird. Jede Verzögerung in der Recall-Nebenabfrage wirkt sich direkt auf die für den Benutzer sichtbare Latenz aus.

---

## Design

### Kernidee

Fire den Recall bei UserQuery und `await`e ihn nie. Konsumiere das Ergebnis an zwei opportunistischen Punkten – je nachdem, welcher zuerst feuert:

1. **UserQuery-Konsumpunkt** – synchroner `settledAt !== null`-Check unmittelbar vor `turn.run()`. Keine Wartezeit: Wenn bereits abgeschlossen, verwende es; wenn nicht, überspringe es.
2. **ToolResult-Injektionspunkt** – derselbe Check bei jedem ToolResult-Turn. Injiziere Memory als `system-reminder`, **angefügt nach** den functionResponse-Teilen in `requestToSend`, um dem Modell Memory-Kontext vor seiner nächsten Antwort zu geben. (Anhängen, nicht voranstellen: Die Qwen-API erfordert, dass der functionResponse unmittelbar auf den model-seitigen functionCall folgt – siehe den bestehenden `hasPendingToolCall`-IDE-Kontext-Skip für dieselbe Einschränkung.)

Dies entspricht dem Muster, das upstream von Claude Code verwendet wird (`startRelevantMemoryPrefetch` / `settledAt`-Polling in `query.ts`).

---

## Datenstrukturen

### Neuer Typ `MemoryPrefetchHandle` (in `client.ts`)

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** Wird von promise.finally() gesetzt. null, bis die Promise abgeschlossen ist. */
  settledAt: number | null;
  /** True, nachdem Memory injiziert wurde – verhindert doppelte Injektion. */
  consumed: boolean;
  controller: AbortController;
};
```

### Feldänderung bei `GeminiClient`

| Entfernen                                                     | Hinzufügen                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `pendingRecallAbortController: AbortController \| undefined`  | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined`  |

---

## Änderungen

### 1. `client.ts` – Entferne `resolveAutoMemoryWithDeadline`

Lösche die Funktion vollständig. Sie wird durch den `settledAt`-Flag-Mechanismus ersetzt.

### 2. `client.ts` – UserQuery-Fire-Pfad

Ersetze den Aufruf von `resolveAutoMemoryWithDeadline` durch:

```typescript
// Brich einen laufenden Prefetch von einer vorherigen UserQuery ab,
// bevor der neue Handle installiert wird (verhindert verwaiste
// Nebenabfragen, wenn der Benutzer erneut tippt, bevor der Recall
// abgeschlossen ist).
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// Brücke das Signal des Aufrufers in den Prefetch-Controller,
// sodass ein Benutzerabbruch (Strg-C / Esc) des übergeordneten
// Turns auch die Recall-Nebenabfrage beendet.
const onParentAbort = () => controller.abort();
if (signal.aborted) {
  controller.abort();
} else {
  signal.addEventListener('abort', onParentAbort, { once: true });
}

const promise = this.config
  .getMemoryManager()
  .recall(projectRoot, partToString(request), {
    config: this.config,
    excludedFilePaths: this.surfacedRelevantAutoMemoryPaths,
    abortSignal: controller.signal,
  })
  .catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      debugLogger.warn('Managed auto-memory recall prefetch fehlgeschlagen.', error);
    }
    return EMPTY_RELEVANT_AUTO_MEMORY_RESULT;
  });

const handle: MemoryPrefetchHandle = {
  promise,
  settledAt: null,
  consumed: false,
  controller,
};
void promise.finally(() => {
  handle.settledAt = Date.now();
  signal.removeEventListener('abort', onParentAbort);
});
this.pendingMemoryPrefetch = handle;
// kein await – fahre sofort fort
```

### 3. `client.ts` – UserQuery-Konsumpunkt (ersetzt `await relevantAutoMemoryPromise`)

```typescript
const prefetchHandle = this.pendingMemoryPrefetch;
if (
  prefetchHandle &&
  prefetchHandle.settledAt !== null &&
  !prefetchHandle.consumed
) {
  prefetchHandle.consumed = true;
  this.pendingMemoryPrefetch = undefined;
  const result = await prefetchHandle.promise; // bereits abgeschlossen, kehrt sofort zurück
  if (result.prompt) {
    // unshift, nicht push: halte Memory am Anfang von systemReminders,
    // damit es den system-reminder-Block bei UserQuery-Turns anführt.
    // (ToolResult-Turns hängen stattdessen an requestToSend an, um die
    // functionCall- / functionResponse-Paarung zu erhalten – siehe unten.)
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` – ToolResult-Injektionspunkt (neu)

Nachdem `requestToSend` zusammengestellt wurde, vor `turn.run()`, füge hinzu:

```typescript
if (messageType === SendMessageType.ToolResult) {
  const prefetchHandle = this.pendingMemoryPrefetch;
  if (
    prefetchHandle &&
    prefetchHandle.settledAt !== null &&
    !prefetchHandle.consumed
  ) {
    prefetchHandle.consumed = true;
    this.pendingMemoryPrefetch = undefined;
    const result = await prefetchHandle.promise;
    if (result.prompt) {
      // Anhängen (nicht voranstellen), damit functionResponse-Teile
      // zuerst bleiben und die functionCall-/functionResponse-Paarung
      // des Modells auf dem nativen Gemini-Pfad nicht unterbrochen wird.
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```

### 5. `client.ts` – Bereinigungspfade

Der Handle wird durch zwei verschiedene Mechanismen freigegeben:

**5 Abbruch-und-Lösch-Stellen** (der Prefetch läuft noch, brich den Controller ab, bevor die Referenz gelöscht wird). Ersetze `pendingRecallAbortController?.abort()` + `= undefined` durch:

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

Stellen: `resetChat()`, `MaxSessionTurns`-Frührückgabe, `boundedTurns=0`-Frührückgabe, `SessionTokenLimitExceeded`-Frührückgabe, Arena-Steuersignal-Frührückgabe. Der Fire-Pfad selbst führt ebenfalls diesen Abbruch-und-Ersatz durch, wenn eine neue UserQuery eintrifft, während der vorherige Prefetch noch läuft.

**2 Nur-Lösch-Stellen** (der Prefetch ist bereits abgeschlossen und wir konsumieren ihn – kein Controller zum Abbrechen, lösche einfach die Referenz):

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

Stellen: UserQuery-Konsumpunkt, ToolResult-Injektionspunkt.

### 6. `relevanceSelector.ts` – Entferne `AbortSignal.timeout(1_000)`

Entferne die kombinierte `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` und übergebe `callerAbortSignal` direkt.

---

## Verhaltensvergleich

| Szenario                                        | Vorher                          | Nachher                                                  |
| ----------------------------------------------- | ------------------------------- | -------------------------------------------------------- |
| Recall abgeschlossen vor Modellvorbereitung     | Injektion bei UserQuery, ~0 Wartezeit | Injektion bei UserQuery, ~0 Wartezeit             |
| Recall langsam (Kaltstart)                      | Blockieren bis zu 2,5 s         | UserQuery überspringen, bei erstem ToolResult injizieren |
| Recall zeitüberschreitung (1 s)                 | Abbruch, leeres Ergebnis, kein Memory | Kein hartes Timeout; injizieren, sobald abgeschlossen     |
| Keine Tool-Aufrufe, Recall langsam              | Blockieren bis zu 2,5 s, dann überspringen | UserQuery überspringen, keine ToolResult-Gelegenheit – Fehlschlag |
| Benutzer sendet 2. Nachricht, bevor Recall abgeschlossen | 2. Recall überholt 1. Handle  | 1. Handle wird abgebrochen, wenn 2. UserQuery neuen Handle erzeugt |

---

## Außerhalb des Geltungsbereichs

- Änderung des Memory-Injektionsformats von `system-reminder` zu `tool-result`-Anhang (CC-Stil)
- Byte-Budget-Skip-Gate pro Sitzung
- Ein-Wort-Prompt-Skip-Gate