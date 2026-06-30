# Design für Output-Token-Limits und Eskalation

> Standardmäßig wird das vom Modell deklarierte Output-Limit verwendet, es sei denn, der Benutzer oder die Umgebung konfiguriert `max_tokens`. Eskalation und Multi-Turn-Recovery werden nur dann eingesetzt, wenn eine Antwort weiterhin `MAX_TOKENS` erreicht.

## Problem

Jede API-Anfrage reserviert einen festen GPU-Slot proportional zu `max_tokens`. Ein niedriger Standardwert kann die Slot-Reservierung reduzieren, erhöht aber auch die Wahrscheinlichkeit, dass normale, große Antworten abgeschnitten werden. Bei Workflows zum Schreiben von Dateien kann dies zu unvollständigen Tool-Call-Argumenten führen und den Scheduler zwingen, das partielle Schreiben abzulehnen.

## Lösung

Verwende standardmäßig das vom Modell deklarierte Output-Limit. Wenn eine Antwort abgeschnitten wird (das Modell erreicht `max_tokens`):

1. **Eskalation** auf das volle Output-Limit des Modells (mit 64K als Untergrenze, wenn das aktuelle Limit niedriger ist)
2. Wenn sie immer noch abgeschnitten ist, führe ein **Recovery** durch, indem du die partielle Antwort im Verlauf behältst und eine Fortsetzungsnachricht injizierst, bis zu 3 Mal
3. Wenn das Recovery ausgeschöpft ist, greife auf die Truncation-Anweisungen des Tool-Schedulers zurück

Dies priorisiert die Korrektheit bei großen Generierungs- und Datei-Bearbeitungsaufgaben. Operatoren, die eine niedrigere Reservierung benötigen, können weiterhin `QWEN_CODE_MAX_OUTPUT_TOKENS` setzen, und dieser explizite Wert wird berücksichtigt.

## Architektur

```
Anfrage (max_tokens = Benutzer-/Umgebungswert oder Modell-Output-Limit)
│
▼
┌─────────────────────────┐
│ Antwort abgeschnitten?  │──── Nein ──▶ Fertig ✓
│ (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Ja
            ▼
┌──────────────────────────────────────────────────┐
│ Ebene 1: Eskalation auf Modell-Output-Limit      │
│ ┌────────────────────────────────────────────┐   │
│ │ Partielle Antwort aus Verlauf entfernen    │   │
│ │ RETRY (isContinuation: false → UI zurück-  │   │
│ │ setzen)                                    │   │
│ │ Erneut senden mit max(64K, Modell-Output-  │   │
│ │ Limit)                                     │   │
│ └────────────────────────────────────────────┘   │
└───────────┬──────────────────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│ Immer noch abgeschnitten│──── Nein ──▶ Fertig ✓
│ (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Ja
            ▼
┌──────────────────────────────────────────────────┐
│ Ebene 2: Multi-Turn-Recovery (bis zu 3×)         │
│ ┌────────────────────────────────────────────┐   │
│ │ Partielle Antwort im Verlauf behalten      │   │
│ │ Benutzernachricht pushen: "Direkt fort-    │   │
│ │ setzen..."                                 │   │
│ │ RETRY (isContinuation: true → UI-Puffer    │   │
│ │ behalten)                                  │   │
│ │ Erneut senden mit aktualisiertem Verlauf   │   │
│ │ Modell setzt dort an, wo es aufgehört hat  │   │
│ └──────────────┬─────────────────────────────┘   │
│                │                                 │
│         ┌──────┴──────┐                          │
│         │ Erfolgreich?│── Ja ──▶ Fertig ✓        │
│         └──────┬──────┘                          │
│                │ Nein (immer noch abgeschnitten) │
│                ▼                                 │
│         Versuch < 3? ── Ja ──▶ Schleife zurück ↑ │
└───────────┬──────────────────────────────────────┘
            │ Nein (ausgeschöpft)
            ▼
┌──────────────────────────────────────────────────┐
│ Ebene 3: Tool-Scheduler-Fallback                 │
│ ┌────────────────────────────────────────────┐   │
│ │ Abgeschnittene Edit/Write-Tool-Calls       │   │
│ │ ablehnen                                   │   │
│ │ Anweisung zurückgeben: "Du MUSST in        │   │
│ │ kleinere Teile aufteilen – schreibe zuerst │   │
│ │ das Skelett und bearbeite es dann          │   │
│ │ inkrementell."                             │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

## Bestimmung des Token-Limits

Das effektive `max_tokens` wird in der folgenden Prioritätsreihenfolge aufgelöst:

| Priorität   | Quelle                                               | Wert (bekanntes Modell)      | Wert (unbekanntes Modell)        | Eskalationsverhalten                            |
| ----------- | ---------------------------------------------------- | ---------------------------- | -------------------------------- | ----------------------------------------------- |
| 1 (höchste) | Benutzerkonfiguration (`samplingParams.max_tokens`)  | `min(userValue, modelLimit)` | `userValue`                      | Keine Eskalation                                |
| 2           | Umgebungsvariable (`QWEN_CODE_MAX_OUTPUT_TOKENS`)    | `min(envValue, modelLimit)`  | `envValue`                       | Keine Eskalation                                |
| 3 (niedrigste)| Modell-/Standard-Output-Limit                      | `modelLimit`                 | `DEFAULT_OUTPUT_TOKEN_LIMIT` = 32K | Eskaliert auf Modell-Limit (64K Untergrenze) + Recovery |

Ein "bekanntes Modell" ist eines, das einen expliziten Eintrag in `OUTPUT_PATTERNS` hat (geprüft über `hasExplicitOutputLimit()`). Bei bekannten Modellen wird der effektive Wert immer auf das vom Modell deklarierte Output-Limit begrenzt, um API-Fehler zu vermeiden. Unbekannte Modelle (benutzerdefinierte Deployments, selbst gehostete Endpunkte) geben den Wert des Benutzers direkt weiter, da das Backend größere Limits unterstützen könnte.

Diese Logik ist in drei Content-Generatoren implementiert:

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — OpenAI-kompatible Provider
- `DashScopeProvider` — erbt `applyOutputTokenLimit()` vom Standard-Provider
- `AnthropicContentGenerator.buildSamplingParameters()` — Anthropic-Provider

## Eskalationsmechanismus

Die Eskalationslogik befindet sich in `geminiChat.ts` und ist **außerhalb** der Haupt-Retry-Schleife platziert. Dies ist absichtlich so:

1. Die Retry-Schleife behandelt transiente Fehler (Rate Limits, ungültige Streams, Content-Validierung)
2. Truncation ist kein Fehler – es ist eine erfolgreiche Antwort, die vorzeitig beendet wurde
3. Fehler aus dem eskalierten Stream sollten direkt an den Aufrufer weitergegeben und nicht von der Retry-Logik abgefangen werden

### Eskalationsschritte (geminiChat.ts)

```
1. Stream wird erfolgreich abgeschlossen (lastError === null)
2. Letzter Chunk hat finishReason === MAX_TOKENS
3. Guard-Checks bestanden:
   - maxTokensEscalated === false (verhindert unendliche Eskalation)
   - hasUserMaxTokensOverride === false (berücksichtigt Benutzerabsicht)
4. Eskaliertes Limit berechnen: max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Partielle Modellantwort aus dem Chat-Verlauf entfernen
6. RETRY-Event yielden (isContinuation: false) → UI verwirft partielle Ausgabe und setzt Puffer zurück
7. Dieselbe Anfrage erneut senden mit maxOutputTokens: escalatedLimit
```

### Recovery-Schritte (geminiChat.ts)

Wenn die eskalierte Antwort ebenfalls abgeschnitten ist (`finishReason === MAX_TOKENS`), läuft die Recovery-Schleife bis zu `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) Mal:

```
1. Partielle Modellantwort befindet sich bereits im Verlauf (gepusht von processStreamResponse)
2. Recovery-Benutzernachricht pushen: OUTPUT_RECOVERY_MESSAGE
3. RETRY-Event yielden (isContinuation: true) → UI behält Textpuffer für die Fortsetzung
4. Erneut senden mit aktualisiertem Verlauf (Modell sieht seine partielle Ausgabe + Recovery-Anweisung)
5. Wenn immer noch abgeschnitten und Versuche übrig, zurückspringen zu Schritt 1
6. Wenn der Recovery-Versuch einen Fehler wirft (leere Antwort, Netzwerkfehler):
   - Hängende Recovery-Nachricht aus dem Verlauf entfernen
   - Recovery-Schleife abbrechen
```

### State-Bereinigung bei RETRY (turn.ts)

Wenn die `Turn`-Klasse ein RETRY-Event empfängt, bereinigt sie den angesammelten State, um Inkonsistenzen zu vermeiden:

- `pendingToolCalls` — bereinigt, um doppelte Tool-Calls zu vermeiden, falls die erste abgeschnittene Antwort abgeschlossene Tool-Calls enthielt, die in der eskalierten Antwort wiederholt werden
- `pendingCitations` — bereinigt, um doppelte Zitate zu vermeiden
- `finishReason` — auf `undefined` zurückgesetzt, damit der `finishReason` der neuen Antwort verwendet wird

Das `isContinuation`-Flag wird an die UI weitergereicht, damit diese entscheiden kann, ob Textpuffer zurückgesetzt (Eskalation) oder beibehalten werden sollen (Recovery).

## Konstanten

Definiert in `geminiChat.ts` und `tokenLimits.ts`:

| Konstante                    | Wert   | Zweck                                           |
| ---------------------------- | ------ | ----------------------------------------------- |
| `ESCALATED_MAX_TOKENS`       | 64.000 | Untergrenze für die Eskalation, wenn das Modell-Limit niedrig ist |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS`| 3     | Maximale Multi-Turn-Recovery-Versuche nach der Eskalation |

Das effektive eskalierte Limit ist `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))`:

| Modell           | Eskaliertes Limit |
| ---------------- | ----------------- |
| Claude Opus 4.6  | 131.072 (128K)    |
| GPT-5 / o-series | 131.072 (128K)    |
| Qwen3.x          | 65.536 (64K)      |
| Unbekannte Modelle| 64.000 (Untergrenze)|

## Designentscheidungen

### Warum nicht standardmäßig 8K verwenden?

- Ein 8K-Standardwert ist eine Slot-Reservierungs-/Kapazitätsoptimierung, keine Korrektheitsanforderung. Er tauscht Korrektheit (große Antworten werden abgeschnitten) gegen Backend-Durchsatz (eine Anfrage reserviert einen GPU-Slot proportional zu `max_tokens`, ein niedrigerer Wert reserviert also weniger über).
- Große Datei-Generierungen und Edit-Tool-Calls können berechtigterweise 8K überschreiten, sodass ein 8K-Standardwert eine normale Anfrage in einen "Abschneiden → Eskalieren"-Roundtrip (und im schlimmsten Fall in eine Retry-Schleife) verwandelt.
- Claude Code behält dieselbe 8K-Obergrenze bei, schaltet sie aber hinter einem Feature-Flag (`tengu_otk_slot_v1`), das für Third-Party-Provider standardmäßig deaktiviert ist ("nicht auf Bedrock/Vertex validiert") – d. h. sein Standardverhalten für Non-First-Party-Serving ist exakt "verwende das vom Modell deklarierte Limit". Die Provider von qwen-code sind alle Third-Party / OpenAI-kompatibel / selbst gehostet, daher ist die Anpassung an dieses Verhalten "standardmäßig deaktiviert" die sichere Wahl; anzunehmen, dass der niedrige Standardwert für jedes Backend sicher ist, ist es nicht.
- Der Kapazitäts-Kompromiss geht nicht verloren, er wird nur opt-in gemacht: Operatoren auf einem kapazitätsbeschränkten, selbst gehosteten Backend können `QWEN_CODE_MAX_OUTPUT_TOKENS` (z. B. `8000`) setzen, um die niedrigere Pro-Anfrage-Reservierung wiederherzustellen. Ein Feature-Flag im GrowthBook-Stil wird absichtlich nicht wieder eingeführt – qwen-code verfügt nicht über eine solche Infrastruktur, und die Umgebungsvariable deckt den Bedarf bereits ab.

### Warum auf das Modell-Limit eskalieren statt auf feste 64K?

- Modelle mit höheren Output-Limits (Claude Opus 128K, GPT-5 128K) wurden unnötigerweise auf 64K beschränkt
- Die Verwendung des tatsächlichen Modell-Limits erfasst die überwiegende Mehrheit der langen Ausgaben ohne einen zweiten Retry
- `ESCALATED_MAX_TOKENS` (64K) dient als Untergrenze für unbekannte Modelle, bei denen `tokenLimit()` den Standardwert 32K zurückgibt

### Warum Multi-Turn-Recovery statt progressiver Eskalation?

- Progressive Eskalation (zum Beispiel 16K -> 32K -> 64K) erfordert jedes Mal die Neugenerierung der vollständigen Antwort
- Multi-Turn-Recovery behält die partielle Antwort und lässt das Modell fortfahren, was Tokens und Latenz spart
- Recovery-Nachrichten sind günstig (~40 Tokens pro Nachricht) im Vergleich zur Neugenerierung großer Antworten
- Das Limit von 3 Versuchen verhindert Endlosschleifen und deckt gleichzeitig die meisten praktischen Fälle ab

### Warum ist die Eskalation außerhalb der Retry-Schleife?

- Truncation ist ein Erfolgsfall, kein Fehler
- Fehler aus dem eskalierten Stream (Rate Limits, Netzwerkfehler) sollten direkt weitergegeben werden, anstatt stillschweigend mit falschen Parametern wiederholt zu werden
- Hält die Retry-Schleife fokussiert auf ihren ursprünglichen Zweck (Wiederherstellung nach transienten Fehlern)
- Recovery-Fehler werden separat abgefangen, um ein Abbrechen der gesamten Konversation zu vermeiden