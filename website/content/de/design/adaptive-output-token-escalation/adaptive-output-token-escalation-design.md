# Adaptive Ausgabe-Token-Eskalation – Entwurf

> Reduziert die Überreservierung von GPU-Slots um etwa das 4-fache durch eine „niedriger Standardwert + Eskalation bei Kürzung“-Strategie für Ausgabe-Token, mit mehrfacher Wiederaufnahme für Antworten, die selbst den eskalierten Grenzwert überschreiten.

## Problem

Jede API-Anfrage reserviert einen festen GPU-Slot proportional zu `max_tokens`. Der bisherige Standardwert von 32K Token bedeutet, dass jede Anfrage einen 32K-Ausgabe-Slot reserviert, aber 99% der Antworten unter 5K Token liegen. Dies überreserviert die GPU-Kapazität um das 4- bis 6-fache, schränkt die Server-Konkurrenz ein und erhöht die Kosten.

## Lösung

Verwenden Sie einen begrenzten Standardwert von **8K** Ausgabe-Token. Wenn eine Antwort abgeschnitten wird (das Modell erreicht `max_tokens`):

1. **Eskalieren** Sie auf das volle Ausgabelimit des Modells (mit 64K als unterer Schranke für unbekannte Modelle)
2. Falls weiterhin abgeschnitten, **Wiederholen** Sie die Anfrage, indem Sie die partielle Antwort im Verlauf behalten und eine Fortsetzungsnachricht einfügen, bis zu 3 Mal
3. Falls alle Wiederholungen ausgeschöpft sind, greifen Sie auf die Kürzungsanleitung des Tool-Schedulers zurück

Da weniger als 1% der Anfragen tatsächlich abgeschnitten werden, reduziert dies die durchschnittliche Slot-Reservierung erheblich, während die Ausgabequalität für lange Antworten erhalten bleibt.

## Architektur

```
Anfrage (max_tokens = 8K)
│
▼
┌─────────────────────────────────┐
│  Antwort abgeschnitten?         │──── Nein ──▶ Erledigt ✓
│  (MAX_TOKENS)                   │
└───────────┬─────────────────────┘
            │ Ja
            ▼
┌─────────────────────────────────────────────────────┐
│  Ebene 1: Auf Modell-Ausgabelimit eskalieren        │
│  ┌───────────────────────────────────────────────┐  │
│  │ Partielle Antwort aus Verlauf entfernen       │  │
│  │ ERNEUT (isContinuation: false → UI zurücks.)  │  │
│  │ Erneut senden mit max(64K, Modell-Ausgabelim.)│  │
│  └───────────────────┬───────────────────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────┐
│  Noch abgeschnitten?            │──── Nein ──▶ Erledigt ✓
│  (MAX_TOKENS)                   │
└───────────┬─────────────────────┘
            │ Ja
            ▼
┌─────────────────────────────────────────────────────┐
│  Ebene 2: Mehrfache Wiederaufnahme (bis zu 3×)      │
│  ┌───────────────────────────────────────────────┐  │
│  │ Partielle Antwort im Verlauf behalten         │  │
│  │ Benutzernachricht einfügen: "Fahren Sie       │  │
│  │ direkt fort..."                               │  │
│  │ ERNEUT (isContinuation: true → UI-Puffer     │  │
│  │ beibehalten)                                  │  │
│  │ Erneut senden mit aktualisiertem Verlauf      │  │
│  │ Modell fährt dort fort, wo es aufhörte        │  │
│  └──────────────────┬────────────────────────────┘  │
│                     │                                │
│          ┌──────────┴──────────┐                     │
│          │ Erfolgreich?        │── Ja ──▶ Erledigt ✓ │
│          └──────────┬──────────┘                     │
│                     │ Nein (weiter abgeschnitten)     │
│                     ▼                                │
│          Versuch < 3? ── Ja ──▶ zurückschleifen ↑    │
└───────────────────────┬──────────────────────────────┘
                        │ Nein (ausgeschöpft)
                        ▼
┌─────────────────────────────────────────────────────┐
│  Ebene 3: Tool-Scheduler-Fallback                   │
│  ┌───────────────────────────────────────────────┐  │
│  │ Abgeschnittene Edit/Schreiben-Tool-Aufrufe    │  │
│  │ ablehnen                                      │  │
│  │ Anleitung zurückgeben: "Sie MÜSSEN in         │  │
│  │ kleinere Teile aufteilen – schreiben Sie      │  │
│  │ zuerst das Gerüst, dann bearbeiten Sie        │  │
│  │ inkrementell."                                │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Bestimmung des Token-Limits

Das effektive `max_tokens` wird in der folgenden Prioritätsreihenfolge ermittelt:

| Priorität    | Quelle                                             | Wert (bekanntes Modell)          | Wert (unbekanntes Modell) | Eskalationsverhalten                            |
| ------------ | -------------------------------------------------- | -------------------------------- | ------------------------- | ----------------------------------------------- |
| 1 (höchste)  | Benutzerkonfiguration (`samplingParams.max_tokens`) | `min(userValue, modelLimit)`     | `userValue`               | Keine Eskalation                                |
| 2            | Umgebungsvariable (`QWEN_CODE_MAX_OUTPUT_TOKENS`)  | `min(envValue, modelLimit)`      | `envValue`                | Keine Eskalation                                |
| 3 (niedrige) | Begrenzter Standardwert                            | `min(modelLimit, 8K)`            | `min(32K, 8K)` = 8K       | Eskaliert auf Modell-Limit (64K Untergrenze) + Wiederaufnahme |

Ein „bekanntes Modell“ ist eines, das einen expliziten Eintrag in `OUTPUT_PATTERNS` hat (geprüft über `hasExplicitOutputLimit()`). Bei bekannten Modellen wird der effektive Wert immer auf das deklarierte Ausgabelimit des Modells begrenzt, um API-Fehler zu vermeiden. Unbekannte Modelle (benutzerdefinierte Bereitstellungen, selbst gehostete Endpunkte) geben den Benutzerwert direkt weiter, da das Backend möglicherweise größere Limits unterstützt.

Diese Logik ist in drei Inhaltsgeneratoren implementiert:

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` – OpenAI-kompatible Anbieter
- `DashScopeProvider` – erbt `applyOutputTokenLimit()` vom Standard-Anbieter
- `AnthropicContentGenerator.buildSamplingParameters()` – Anthropic-Anbieter
## Eskalationsmechanismus

Die Eskalationslogik befindet sich in `geminiChat.ts`, **außerhalb** der Haupt-Wiederholungsschleife. Dies ist beabsichtigt:

1. Die Wiederholungsschleife behandelt vorübergehende Fehler (Ratenbegrenzungen, ungültige Streams, Inhaltsvalidierung)
2. Eine Kürzung (Truncation) ist kein Fehler – es ist eine erfolgreiche Antwort, die vorzeitig abgeschnitten wurde
3. Fehler aus dem eskalierten Stream sollten direkt an den Aufrufer weitergegeben werden, nicht von der Wiederholungslogik abgefangen werden

### Eskalationsschritte (geminiChat.ts)

```
1. Stream wird erfolgreich abgeschlossen (lastError === null)
2. Letzter Chunk hat finishReason === MAX_TOKENS
3. Guards bestehen die Prüfungen:
   - maxTokensEscalated === false (verhindert Endlos-Eskalation)
   - hasUserMaxTokensOverride === false (respektiert Benutzerabsicht)
4. Berechne eskalierten Grenzwert: max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Entferne die partielle Modellantwort aus dem Chat-Verlauf (pop)
6. Sende RETRY-Ereignis (isContinuation: false) → UI verwirft die partielle Ausgabe und setzt Puffer zurück
7. Sende dieselbe Anfrage erneut mit maxOutputTokens: escalatedLimit
```

### Wiederherstellungsschritte (geminiChat.ts)

Falls die eskalierte Antwort ebenfalls gekürzt wurde (finishReason === MAX_TOKENS), läuft die Wiederherstellungsschleife bis zu `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) Mal:

```
1. Die partielle Modellantwort befindet sich bereits im Verlauf (von processStreamResponse eingefügt)
2. Füge eine Wiederherstellungs-Benutzernachricht ein: OUTPUT_RECOVERY_MESSAGE
3. Sende RETRY-Ereignis (isContinuation: true) → UI behält den Textpuffer für die Fortsetzung
4. Sende erneut mit aktualisiertem Verlauf (Modell sieht seine partielle Ausgabe + Wiederherstellungsanweisung)
5. Falls immer noch gekürzt und Versuche übrig, gehe zurück zu Schritt 1
6. Falls der Wiederherstellungsversuch fehlschlägt (leere Antwort, Netzwerkfehler):
   - Entferne die nicht abgeschlossene Wiederherstellungsnachricht aus dem Verlauf (pop)
   - Verlasse die Wiederherstellungsschleife
```

### Zustandsbereinigung bei RETRY (turn.ts)

Wenn die `Turn`-Klasse ein RETRY-Ereignis empfängt, löscht sie den angesammelten Zustand, um Inkonsistenzen zu vermeiden:

- `pendingToolCalls` – gelöscht, um doppelte Tool-Aufrufe zu vermeiden, falls die erste gekürzte Antwort abgeschlossene Tool-Aufrufe enthielt, die in der eskalierten Antwort wiederholt werden
- `pendingCitations` – gelöscht, um doppelte Zitationen zu vermeiden
- `finishReason` – zurückgesetzt auf `undefined`, sodass der Grund für den Abschluss der neuen Antwort verwendet wird

Das `isContinuation`-Flag wird an die UI weitergegeben, damit diese entscheiden kann, ob die Textpuffer zurückgesetzt (Eskalation) oder behalten (Wiederherstellung) werden sollen.

## Konstanten

Definiert in `geminiChat.ts` und `tokenLimits.ts`:

| Konstante                       | Wert   | Zweck                                                 |
| ------------------------------- | ------ | ----------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS`     | 8.000  | Standard-Ausgabe-Token-Limit ohne benutzerseitige Überschreibung |
| `ESCALATED_MAX_TOKENS`          | 64.000 | Untergrenze für Eskalation (wenn Modell-Limit unbekannt)       |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS`  | 3      | Maximale Anzahl mehrfacher Wiederherstellungsversuche nach Eskalation |

Das effektive eskalierte Limit ist `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))`:

| Modell             | Eskaliertes Limit |
| ------------------ | ----------------- |
| Claude Opus 4.6    | 131.072 (128K)    |
| GPT-5 / o-Serie    | 131.072 (128K)    |
| Qwen3.x            | 65.536 (64K)      |
| Unbekannte Modelle | 64.000 (Untergrenze) |

## Designentscheidungen

### Warum 8K Standard?

- 99% der Antworten liegen unter 5K Token
- 8K bietet ausreichend Spielraum für etwas längere Antworten, ohne unnötige Wiederholungsversuche auszulösen
- Reduziert die durchschnittliche Slot-Reservierung von 32K auf 8K (4-fache Verbesserung)

### Warum auf Modell-Limit eskalieren statt auf feste 64K?

- Modelle mit höheren Ausgabelimits (Claude Opus 128K, GPT-5 128K) wurden unnötigerweise auf 64K begrenzt
- Die Verwendung des tatsächlichen Modell-Limits erfasst die überwiegende Mehrheit langer Ausgaben ohne einen zweiten Wiederholungsversuch
- `ESCALATED_MAX_TOKENS` (64K) dient als Untergrenze für unbekannte Modelle, bei denen `tokenLimit()` den Standardwert 32K zurückgibt

### Warum mehrfache Wiederherstellung statt progressiver Eskalation?

- Progressive Eskalation (8K → 16K → 32K → 64K) erfordert jedes Mal die vollständige Neugenerierung der Antwort
- Mehrfache Wiederherstellung behält die partielle Antwort und lässt das Modell fortfahren, spart Token und Latenz
- Wiederherstellungsnachrichten sind günstig (~40 Token pro Stück) im Vergleich zur Neugenerierung großer Antworten
- Das 3-Versuche-Limit verhindert Endlosschleifen und deckt gleichzeitig die meisten praktischen Fälle ab

### Warum liegt die Eskalation außerhalb der Wiederholungsschleife?

- Kürzung ist ein Erfolgsfall, kein Fehler
- Fehler aus dem eskalierten Stream (Ratenbegrenzungen, Netzwerkfehler) sollten direkt weitergegeben werden, anstatt mit falschen Parametern stillschweigend wiederholt zu werden
- Hält die Wiederholungsschleife auf ihren ursprünglichen Zweck fokussiert (Behandlung vorübergehender Fehler)
- Wiederherstellungsfehler werden separat abgefangen, um ein vorzeitiges Abbrechen der gesamten Unterhaltung zu vermeiden
