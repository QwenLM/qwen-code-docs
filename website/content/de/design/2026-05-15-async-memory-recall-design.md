# Async Memory Recall — Design-Spezifikation

**Datum:** 2026-05-15
**Status:** Genehmigt
**Zugehörige Issues:** #3761, #3759
**Zugehörige PRs:** #3814, #3866

---

## Problem

`relevanceSelector.ts` verwendet `AbortSignal.timeout(1_000)` (eingeführt durch #3866). Bei Kaltstarts der ersten Sitzung benötigt qwen3.5-flash durchschnittlich ~908 ms – das liegt beständig knapp über der 1‑s‑Schwelle. Die äußere 2,5‑s‑Frist in `resolveAutoMemoryWithDeadline` führt dazu, dass jede UserQuery bis zu 2,5 s blockieren kann, selbst wenn der Rückruf immer fehlschlägt.

Ursache: Der Haupt‑Agent‑Request-Pfad wartet mit `await` auf das Recall-Ergebnis, bevor es an das Modell gesendet wird. Jede Verzögerung in der Nebenabfrage des Recalls schlägt sich direkt auf die für den Benutzer sichtbare Latenz nieder.

---

## Design

### Kernidee

Den Recall bei UserQuery auslösen und niemals darauf warten. Das Ergebnis an zwei opportunistischen Stellen konsumieren – je nachdem, welche zuerst eintritt:

1. **UserQuery-Verbrauchspunkt** – Synchroner `settledAt !== null`‑Check unmittelbar vor `turn.run()`. Null‑Wartezeit: Wenn bereits abgeschlossen, verwenden; falls nicht, überspringen.
2. **ToolResult-Einfügepunkt** – Gleicher Check bei jeder ToolResult‑Runde. Das Memory wird als `system-reminder` **angefügt nach** den functionResponse‑Teilen in `requestToSend` – das gibt dem Modell den Speicherkontext vor seiner nächsten Antwort. (Anfügen, nicht voranstellen: Die Qwen‑API verlangt, dass functionResponse unmittelbar auf den functionCall des Modells folgt – siehe den bestehenden IDE‑Kontext‑Skip für `hasPendingToolCall` aufgrund derselben Einschränkung.)

Dies entspricht dem Muster von Claude Code upstream (`startRelevantMemoryPrefetch` / `settledAt`‑Polling in `query.ts`).

---

## Datenstrukturen

### Neuer Typ `MemoryPrefetchHandle` (in `client.ts`)

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** Wird von promise.finally() gesetzt. null, bis das Promise abgeschlossen ist. */
  settledAt: number | null;
  /** True, nachdem Memory eingefügt wurde – verhindert doppeltes Einfügen. */
  consumed: boolean;
  controller: AbortController;
};
```

### Feldänderung an `GeminiClient`

| Entfernen                                                     | Hinzufügen                                               |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `pendingRecallAbortController: AbortController \| undefined`  | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined` |

---

## Änderungen

### 1. `client.ts` – Entfernen von `resolveAutoMemoryWithDeadline`

Funktion vollständig löschen. Sie wird durch den `settledAt`‑Flag‑Mechanismus ersetzt.

### 2. `client.ts` – UserQuery-Auslösepfad

Ersetze den Aufruf von `resolveAutoMemoryWithDeadline` durch:

```typescript
// Bricht einen laufenden Prefetch einer vorherigen UserQuery ab, bevor
// der neue Handle installiert wird (verhindert verwaiste Nebenabfragen,
// wenn der Benutzer erneut tippt, bevor der Recall abgeschlossen ist).
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// Verbindet das Signal des Aufrufers mit dem Prefetch‑Controller, sodass
// ein Benutzerabbruch (Strg‑C / Esc) der übergeordneten Runde auch die
// Recall‑Nebenabfrage beendet.
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
      debugLogger.warn('Managed auto-memory recall prefetch failed.', error);
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
// kein await – sofort fortfahren
```

### 3. `client.ts` – UserQuery-Verbrauchspunkt (ersetzt `await relevantAutoMemoryPromise`)

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
    // unshift, nicht push: Memory an den Anfang von systemReminders setzen,
    // damit es bei UserQuery‑Runden den system‑reminder‑Block anführt. (Bei
    // ToolResult‑Runden wird stattdessen an requestToSend angefügt, um die
    // Paarung functionCall / functionResponse zu bewahren – siehe unten.)
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` – ToolResult-Einfügepunkt (neu)

Nachdem `requestToSend` zusammengestellt wurde, vor `turn.run()` einfügen:

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
      // Anfügen (nicht voranstellen), damit functionResponse‑Teile zuerst
      // kommen und die Paarung functionCall/functionResponse auf dem
      // nativen Gemini‑Pfad nicht zerstört wird.
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```
### 5. `client.ts` — Bereinigung von Pfaden

Das Handle wird durch zwei unterschiedliche Mechanismen freigegeben:

**5 Abbruch-und-Lösch-Stellen** (der Prefetch ist noch ausstehend, breche den Controller ab, bevor die Referenz gelöscht wird). Ersetze `pendingRecallAbortController?.abort()` + `= undefined` durch:

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

Stellen: `resetChat()`, frühe Rückgabe von `MaxSessionTurns`, frühe Rückgabe von `boundedTurns=0`, frühe Rückgabe von `SessionTokenLimitExceeded`, frühe Rückgabe des Arena-Steuerungssignals. Der Ausführungspfad selbst führt ebenfalls diesen Abbruch-und-Ersetz-Vorgang durch, wenn eine neue UserQuery eintrifft, während der vorherige Prefetch noch läuft.

**2 Nur-Lösch-Stellen** (der Prefetch ist bereits abgeschlossen und wir verarbeiten ihn — kein Controller zum Abbrechen, nur die Referenz löschen):

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

Stellen: Verwendungspunkt von UserQuery, Einspeisepunkt von ToolResult.

### 6. `relevanceSelector.ts` — Entferne `AbortSignal.timeout(1_000)`

Entferne das kombinierte `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` und übergib `callerAbortSignal` direkt.

---

## Verhaltensvergleich

| Szenario                                           | Vorher                          | Nachher                                                   |
| -------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| Abruf abgeschlossen vor Modellvorbereitung         | Einspeisung bei UserQuery, ~0 Wartezeit | Einspeisung bei UserQuery, ~0 Wartezeit                   |
| Abruf langsam (Kaltstart)                           | Blockierung bis zu 2,5 s        | UserQuery überspringen, Einspeisung bei erstem ToolResult |
| Abruf Zeitüberschreitung (1 s)                     | Abbruch, leeres Ergebnis, kein Speicher | Keine harte Zeitüberschreitung; Einspeisung sobald abgeschlossen |
| Keine Tool-Aufrufe, Abruf langsam                  | Blockierung bis zu 2,5 s, dann überspringen | UserQuery überspringen, keine ToolResult-Gelegenheit — Fehlschlag |
| Benutzer sendet zweite Nachricht bevor Abruf abgeschlossen | Zweiter Abruf konkurriert mit erstem Handle | Erstes Handle wird abgebrochen, wenn zweite UserQuery neues Handle auslöst |

---

## Nicht im Geltungsbereich

- Änderung des Speicher-Einspeisungsformats von `system-reminder` zu `tool-result`-Anhang (CC-Stil)
- Pro-Sitzung Byte-Budget-Überspringungs-Gate
- Ein-Wort-Aufforderungs-Überspringungs-Gate
