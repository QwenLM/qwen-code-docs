# Design der adaptiven Ausgabe-Token-Erhöhung

> Reduziert die Überreservierung von GPU-Slots um etwa das 4-fache durch eine Strategie „niedriger Standardwert + Erhöhung bei Abschneidung“ für Ausgabe-Tokens, mit mehrfacher Wiederherstellung für Antworten, die selbst den erhöhten Grenzwert überschreiten.

## Problem

Jede API-Anfrage reserviert einen festen GPU-Slot proportional zu `max_tokens`. Der bisherige Standardwert von 32K Tokens bedeutet, dass jede Anfrage einen 32K-Ausgabe-Slot reserviert, aber 99% der Antworten liegen unter 5K Tokens. Dies führt zu einer 4- bis 6-fachen Überreservierung der GPU-Kapazität, schränkt die Server-Konkurrenz ein und erhöht die Kosten.

## Lösung

Verwende einen gedeckelten Standardwert von **8K** Ausgabe-Tokens. Wenn eine Antwort abgeschnitten wird (das Modell erreicht `max_tokens`):

1. **Erhöhe** auf das volle Ausgabe-Limit des Modells (mit 64K als Untergrenze für unbekannte Modelle)
2. Falls immer noch abgeschnitten, **stelle wieder her**, indem die partielle Antwort im Verlauf behalten und eine Fortsetzungsnachricht eingefügt wird (bis zu 3 Mal)
3. Falls die Wiederherstellung erschöpft ist, falle auf die Abschneidungs-Anleitung des Tool-Schedulers zurück

Da weniger als 1% der Anfragen tatsächlich abgeschnitten werden, reduziert dies die durchschnittliche Slot-Reservierung erheblich, während die Ausgabequalität für lange Antworten erhalten bleibt.

## Architektur

```
Anfrage (max_tokens = 8K)
│
▼
┌─────────────────────────────┐
│  Antwort abgeschnitten?      │──── Nein ──▶ Erledigt ✓
│  (MAX_TOKENS)                │
└───────────┬─────────────────┘
            │ Ja
            ▼
┌──────────────────────────────────────────────────────┐
│  Ebene 1: Erhöhung auf das Ausgabe-Limit des Modells │
│  ┌────────────────────────────────────────────────┐  │
│  │ Partielle Antwort aus dem Verlauf entfernen    │  │
│  │ WIEDERHOLEN (isContinuation: false → UI zur.)  │  │
│  │ Erneutes Senden mit max(64K, Modell-Ausgabelimit)│  │
│  └────────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────┐
│  Immer noch abgeschnitten?   │──── Nein ──▶ Erledigt ✓
│  (MAX_TOKENS)                │
└───────────┬─────────────────┘
            │ Ja
            ▼
┌──────────────────────────────────────────────────────┐
│  Ebene 2: Mehrfache Wiederherstellung (bis zu 3×)    │
│  ┌────────────────────────────────────────────────┐  │
│  │ Partielle Antwort im Verlauf behalten          │  │
│  │ Benutzernachricht einfügen: "Fahre direkt...   │  │
│  │ WIEDERHOLEN (isContinuation: true → UI erhält) │  │
│  │ Erneutes Senden mit aktualisiertem Verlauf     │  │
│  │ Modell fährt ab der Abbruchstelle fort         │  │
│  └──────────────┬─────────────────────────────────┘  │
│                 │                                     │
│          ┌──────┴──────┐                              │
│          │ Erfolg?     │── Ja ──▶ Erledigt ✓          │
│          └──────┬──────┘                              │
│                 │ Nein (immer noch abgeschnitten)      │
│                 ▼                                     │
│          Versuch < 3? ── Ja ──▶ zurückschleifen ↑     │
└───────────┬──────────────────────────────────────────┘
            │ Nein (erschöpft)
            ▼
┌──────────────────────────────────────────────────────┐
│  Ebene 3: Tool-Scheduler-Fallback                    │
│  ┌────────────────────────────────────────────────┐  │
│  │ Abgelehnte abgeschnittene Edit/Write-Toolcalls │  │
│  │ Anleitung: "Du MUSST in kleinere Teile         │  │
│  │ aufteilen – schreibe zuerst das Grundgerüst,   │  │
│  │ dann bearbeite schrittweise."                  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Bestimmung des Token-Limits

Das effektive `max_tokens` wird in der folgenden Prioritätsreihenfolge aufgelöst:

| Priorität    | Quelle                                             | Wert (bekanntes Modell)         | Wert (unbekanntes Modell) | Erhöhungsverhalten                           |
| ------------ | -------------------------------------------------- | ------------------------------- | ------------------------- | -------------------------------------------- |
| 1 (höchste)  | Benutzerkonfiguration (`samplingParams.max_tokens`) | `min(userValue, modelLimit)`    | `userValue`               | Keine Erhöhung                               |
| 2            | Umgebungsvariable (`QWEN_CODE_MAX_OUTPUT_TOKENS`)  | `min(envValue, modelLimit)`     | `envValue`                | Keine Erhöhung                               |
| 3 (niedrigste) | Gedeckelter Standardwert                         | `min(modelLimit, 8K)`           | `min(32K, 8K)` = 8K       | Erhöhung auf Modell-Limit (64K Untergrenze) + Wiederherstellung |

Ein „bekanntes Modell“ ist eines, das einen expliziten Eintrag in `OUTPUT_PATTERNS` hat (geprüft über `hasExplicitOutputLimit()`). Bei bekannten Modellen wird der effektive Wert immer auf das deklarierte Ausgabe-Limit des Modells begrenzt, um API-Fehler zu vermeiden. Unbekannte Modelle (benutzerdefinierte Deployments, selbst gehostete Endpunkte) geben den Benutzerwert direkt weiter, da das Backend möglicherweise größere Limits unterstützt.

Diese Logik ist in drei Content-Generatoren implementiert:

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — OpenAI-kompatible Anbieter
- `DashScopeProvider` — erbt `applyOutputTokenLimit()` vom Standard-Anbieter
- `AnthropicContentGenerator.buildSamplingParameters()` — Anthropic-Anbieter

## Erhöhungsmechanismus

Die Erhöhungslogik befindet sich in `geminiChat.ts`, **außerhalb** der Haupt-Wiederholungsschleife. Dies ist beabsichtigt:

1. Die Wiederholungsschleife behandelt flüchtige Fehler (Ratenbegrenzungen, ungültige Streams, Inhaltsvalidierung)
2. Abschneidung ist kein Fehler – es ist eine erfolgreiche Antwort, die vorzeitig beendet wurde
3. Fehler aus dem erhöhten Stream sollten direkt an den Aufrufer weitergegeben werden, nicht von der Wiederholungslogik abgefangen werden

### Erhöhungsschritte (geminiChat.ts)

```
1. Stream wird erfolgreich abgeschlossen (lastError === null)
2. Letzter Chunk hat finishReason === MAX_TOKENS
3. Sicherheitsprüfungen bestehen:
   - maxTokensEscalated === false (unendliche Erhöhung verhindern)
   - hasUserMaxTokensOverride === false (Benutzerabsicht respektieren)
4. Erhöhtes Limit berechnen: max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Partielle Modellantwort aus dem Chat-Verlauf entfernen
6. RETRY-Ereignis ausgeben (isContinuation: false) → UI verwirft partielle Ausgabe und setzt Puffer zurück
7. Gleiche Anfrage erneut senden mit maxOutputTokens: escalatedLimit
```

### Wiederherstellungsschritte (geminiChat.ts)

Wenn die erhöhte Antwort ebenfalls abgeschnitten ist (finishReason === MAX_TOKENS), wird die Wiederherstellungsschleife bis zu `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) Mal durchlaufen:

```
1. Partielle Modellantwort befindet sich bereits im Verlauf (von processStreamResponse eingefügt)
2. Wiederherstellungs-Benutzernachricht einfügen: OUTPUT_RECOVERY_MESSAGE
3. RETRY-Ereignis ausgeben (isContinuation: true) → UI behält Textpuffer für Fortsetzung
4. Erneutes Senden mit aktualisiertem Verlauf (Modell sieht seine partielle Ausgabe + Fortsetzungsanweisung)
5. Falls immer noch abgeschnitten und Versuche übrig, zurück zu Schritt 1
6. Falls der Wiederherstellungsversuch einen Fehler wirft (leere Antwort, Netzwerkfehler):
   - Die verwaiste Wiederherstellungsnachricht aus dem Verlauf entfernen
   - Wiederherstellungsschleife abbrechen
```

### Zustandsbereinigung bei RETRY (turn.ts)

Wenn die `Turn`-Klasse ein RETRY-Ereignis erhält, bereinigt sie angesammelten Zustand, um Inkonsistenzen zu vermeiden:

- `pendingToolCalls` — zurückgesetzt, um doppelte Tool-Aufrufe zu vermeiden, falls die erste abgeschnittene Antwort abgeschlossene Tool-Aufrufe enthielt, die in der erhöhten Antwort wiederholt werden
- `pendingCitations` — zurückgesetzt, um doppelte Zitationen zu vermeiden
- `finishReason` — auf `undefined` zurückgesetzt, damit der Finish-Grund der neuen Antwort verwendet wird

Das `isContinuation`-Flag wird an die UI weitergegeben, damit diese entscheiden kann, ob Textpuffer zurückgesetzt (Erhöhung) oder behalten (Wiederherstellung) werden sollen.

## Konstanten

Definiert in `geminiChat.ts` und `tokenLimits.ts`:

| Konstante                       | Wert    | Zweck                                                  |
| ------------------------------- | ------- | ------------------------------------------------------ |
| `CAPPED_DEFAULT_MAX_TOKENS`     | 8.000   | Standard-Ausgabe-Token-Limit, wenn keine Benutzerüberschreibung gesetzt ist |
| `ESCALATED_MAX_TOKENS`          | 64.000  | Untergrenze für die Erhöhung (wenn das Modell-Limit unbekannt ist) |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS`  | 3       | Maximale Anzahl mehrfacher Wiederherstellungsversuche nach der Erhöhung |

Das effektive erhöhte Limit ist `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))`:

| Modell             | Erhöhtes Limit |
| ------------------ | -------------- |
| Claude Opus 4.6   | 131.072 (128K) |
| GPT-5 / o-Serie   | 131.072 (128K) |
| Qwen3.x           | 65.536 (64K)   |
| Unbekannte Modelle | 64.000 (Untergrenze) |

## Entwurfsentscheidungen

### Warum 8K als Standard?

- 99% der Antworten liegen unter 5K Tokens
- 8K bietet ausreichend Spielraum für etwas längere Antworten, ohne unnötige Wiederholungen auszulösen
- Reduziert die durchschnittliche Slot-Reservierung von 32K auf 8K (4-fache Verbesserung)

### Warum auf das Modell-Limit erhöhen statt auf feste 64K?

- Modelle mit höheren Ausgabelimits (Claude Opus 128K, GPT-5 128K) wurden unnötig auf 64K beschränkt
- Die Verwendung des tatsächlichen Modell-Limits erfasst die überwiegende Mehrheit langer Ausgaben ohne eine zweite Wiederholung
- `ESCALATED_MAX_TOKENS` (64K) dient als Untergrenze für unbekannte Modelle, bei denen `tokenLimit()` den Standardwert 32K zurückgibt

### Warum mehrfache Wiederherstellung statt schrittweiser Erhöhung?

- Schrittweise Erhöhung (8K → 16K → 32K → 64K) erfordert jedes Mal eine vollständige Neugenerierung der Antwort
- Mehrfache Wiederherstellung behält die partielle Antwort und lässt das Modell fortfahren, spart Tokens und Latenz
- Wiederherstellungsnachrichten sind günstig (~40 Tokens pro Stück) im Vergleich zur Neugenerierung großer Antworten
- Die Begrenzung auf 3 Versuche verhindert Endlosschleifen und deckt die meisten praktischen Fälle ab

### Warum liegt die Erhöhung außerhalb der Wiederholungsschleife?

- Abschneidung ist ein Erfolgsfall, kein Fehler
- Fehler aus dem erhöhten Stream (Ratenbegrenzungen, Netzwerkausfälle) sollten direkt weitergegeben werden, anstatt stillschweigend mit falschen Parametern wiederholt zu werden
- Hält die Wiederholungsschleife auf ihren ursprünglichen Zweck fokussiert (Wiederherstellung bei flüchtigen Fehlern)
- Wiederherstellungsfehler werden separat abgefangen, um ein Abbrechen der gesamten Konversation zu vermeiden