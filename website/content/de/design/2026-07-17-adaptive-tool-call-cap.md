# Adaptive per-turn tool-call cap

Datum: 2026-07-17
Status: Implementiert
Bereich: `packages/core` Loop-Detection

## Problem

Das Always-on-Tool-Call-Limit pro Turn (`model.maxToolCallsPerTurn`, Standard 100) ist ein grober Circuit-Breaker: Es hält den Turn beim 101. Tool-Call an, unabhängig davon, ob das Modell tatsächlich festhängt oder produktive Arbeit leistet. Große Multi-Package-Implementierungs-Turns überschreiten 100 Tool-Calls legitimerweise, sodass das Limit produktive Arbeit beendet — ein False Positive.

Konkreter Fall: Session `80db472f-…` (qwen-code-x1, „Web Shell git status/diff chip"). Der `继续Phase 2`-Turn machte exakt 100 Tool-Calls und wurde mitten in `npm run build` hart angehalten, ohne Abschlusszusammenfassung. Analyse dieses Turns und seiner Geschwister:

| Turn | Tool-Calls | unterschiedliche (tool,args)-Schlüssel | maximale Wiederholung eines Schlüssels | längste Gleichnamens-Serie |
| ---- | ---------- | ------------------------- | --------------------- | -------------------- |
| 7    | 96         | 96                        | 1                     | 7                    |
| 8    | 100        | 99                        | 2                     | 3                    |
| 9    | 95         | 95                        | 1                     | 7                    |

Produktive Turns sind sehr vielfältig: Kein einzelner `(tool, args)`-Call wiederholt sich mehr als zweimal. Ein wirklich festhängender Turn wiederholt denselben Call viele Male.

## Design

Das Verhalten hängt davon ab, ob `maxToolCallsPerTurn` **explizit konfiguriert** wurde (verfolgt durch `Config.isMaxToolCallsPerTurnExplicit()`):

- **Expliziter Wert `N`** → ein **hartes Limit** (der veröffentlichte Vertrag): Der Turn wird bei dem Call angehalten, der `N` überschreitet, ohne adaptive Verlängerung. Das bewahrt die Abwärtskompatibilität — ein Benutzer, der den Wert gesetzt hat, um unbeaufsichtigte Kosten zu begrenzen, erhält genau diese Grenze. (v0.19.10 lieferte das Limit als hartes Limit aus; eine frühere Iteration dieses PRs multiplizierte explizite Werte mit 3, was eine brechende Änderung war — zurückgezogen.)
- **Standard (nicht gesetzt, `S = 100`)** → **adaptiv**: einen produktiven langen Turn von einem festhängenden anhand eines Wiederholungssignals unterscheiden und nur Letzteren hart anhalten (plus ein absoluter Backstop). Moderne Modelle machen legitimerweise Hunderte von Calls pro Aufgabe, daher darf der Standard produktive lange Turns nicht hart anhalten.

Zwei Schwellen für das adaptive (Standard-)Limit:

- **Softes Limit `S`** (100): Wenn der Turn `S` Tool-Calls überschreitet, nur anhalten, wenn ein Festhängen-Wiederholungssignal vorhanden ist; andernfalls den Turn als produktiv behandeln und weiterlaufen lassen.
- **Hartes Limit `S * ADAPTIVE_CAP_HARD_MULTIPLIER`** (Multiplikator 10 → 1000): absoluter Backstop. Unabhängig von Wiederholung anhalten, sobald überschritten, damit ein Durchgehen, das bei jedem Call die Argumente variiert (das kein Wiederholungssignal erfasst), weiterhin begrenzt ist. Der Multiplikator ist hoch genug, dass produktive Turns mit Hunderten von Calls keine False Positives erzeugen.

Festhängen-Wiederholungssignal: Die maximale Anzahl, wie oft ein einzelner `(tool, args)`-Schlüssel im Turn vorgekommen ist, erreicht `GLOBAL_DUPLICATE_THRESHOLD` (6). Dies verwendet die bestehende Global-Duplicate-Semantik wieder und hat einen breiten Sicherheitsabstand (beobachtete produktive Turns ≤ 2).

Die Gleichnamens-Serie wird bewusst NICHT als Gate-Signal verwendet: parallele Tool-Batches (z. B. mehrere `read_file` verschiedener Dateien in einer Assistant-Nachricht) erzeugen legitimerweise Gleichnamens-Serien von 6–7, zu nah an der Aktions-Stagnations-Schwelle von 8.

### Always-on-Verfolgung

Das Limit ist Always-on (nicht gegatet durch `skipLoopDetection`), aber die bestehende `globalToolCallCounts`-Map wird nur innerhalb des gegateten Heuristik-Pfads gepflegt. Um das Always-on-Limit unabhängig vom gegateten Pfad zu halten, pflegt das Limit seinen eigenen kleinen Always-on-Tracker:

- `capKeyCounts: Map<string, number>` — Pro-`(tool,args)`-Zählungen in diesem Turn.
- `capMaxKeyRepeat: number` — laufendes Maximum der Zählung eines einzelnen Schlüssels.

Wird in `checkAlwaysOnSafeties` für jeden `ToolCallRequest` gepflegt, in `reset()` und bei `Retry` geleert (konsistent damit, wie der Heuristik-Pfad `globalToolCallCounts` bei einem Retry leert).

## Verhaltensmatrix

Expliziter Wert `N` (hartes Limit):

| Calls gesamt | Ergebnis      |
| ----------- | ----------- |
| `≤ N`       | erlauben       |
| `> N`       | anhalten (hart) |

Standard (nicht gesetzt), softes Limit `S = 100`, hartes Limit `H = 1000`:

| Calls gesamt     | Wiederholungssignal    | Ergebnis             |
| --------------- | -------------------- | ------------------ |
| `≤ S`           | beliebig                  | erlauben              |
| `S < gesamt ≤ H` | maximale Schlüssel-Wiederholung `< 6` | erlauben (produktiv) |
| `S < gesamt ≤ H` | maximale Schlüssel-Wiederholung `≥ 6` | anhalten (festhängend)       |
| `> H`           | beliebig                  | anhalten (Backstop)    |

Wenn `S ≤ 0`, ist das Limit deaktiviert (`getMaxToolCallsPerTurn()` liefert `Infinity` zurück); das Verhalten ist unverändert (feuert nie).

## Geänderte Dateien

- `packages/core/src/config/config.ts` — Verfolgung von `maxToolCallsPerTurnExplicit` + Getter `isMaxToolCallsPerTurnExplicit()`.
- `packages/core/src/services/loopDetectionService.ts` — Explizit-vs-Standard-Limit-Logik + Always-on-Tracker + kanonisierter Tool-Call-Schlüssel.
- `packages/core/src/services/loopDetectionService.test.ts` — Explizites-Hartlimit-Regression + adaptive (Standard-)Fälle.
- `packages/core/src/core/client.test.ts` — Stop-Hook-Budget-Test (explizites hartes Limit).
- `packages/core/src/config/config.test.ts` — Verfolgung des Explizit-Flags.
- `packages/cli/src/config/settingsSchema.ts` — `maxToolCallsPerTurn`-Beschreibung.
- `docs/users/configuration/settings.md` — dito.

## Nicht-Ziele / Follow-ups

- Einen angehaltenen Turn an Ort und Stelle fortsetzen (architektonisch nicht machbar: Der Turn ist bereits zurückgegeben, wenn der Dialog erscheint).
- Ändern des Loop-Detected-Dialog-UIs (separate Verbesserung).
- Ein separater Config-Knopf für das harte Limit (vom soften Limit abgeleitet; eine Erhöhung von `maxToolCallsPerTurn` skaliert beide).
- Ein Recency-Fenster-basiertes oder ergebnisbewusstes Festhängen-Signal. Das aktuelle Signal ist ein monotones Pro-Turn-Maximum: dasselbe `(tool, args)`, irgendwo im Turn 6-mal wiederholt, markiert ihn als festhängend, selbst wenn diese Wiederholungen legitim sind (z. B. denselben Build/Test nach aufeinanderfolgenden Fixes erneut ausführen). Das ist niemals eine Regression — das Signal wirkt nur jenseits des soften Limits, wo das alte Limit immer anhielt — aber diese produktive Klasse profitiert nicht. Der Beleg „produktive Turns wiederholen ≤ 2" stammt aus drei Turns einer einzigen Session; dies mit einem Fenster-basierten Signal erneut aufgreifen, wenn die Telemetrie dieses Falsch-Festhängen-Muster zeigt.
- Telemetrie-Differenzierung der zwei Anhaltegründe. Sowohl Softes-Limit-Festhängen als auch Hart-Backstop emittieren `TURN_TOOL_CALL_CAP`; ein Boolescher Wert/ein Attribut auf `LoopDetectedEvent` würde verraten, welches in der Praxis feuerte (nützlich, um den 10×-Multiplikator zu validieren). Die Headless-Nachricht deckt bereits beide ab.
- Der ACP-/Daemon-Pfad (`recordDaemonToolCalls` in `packages/cli/src/acp-integration/session/Session.ts`) hat sein eigenes grobes Pro-Turn-Limit, das `LoopDetectionService` nicht verwendet. Er behandelt den Wert unabhängig von Wiederholung immer als hartes Limit. Ihn an den adaptiven Standard anzugleichen ist ein separates Follow-up (er verfolgt Tool-Calls in Batches und bräuchte seine eigene Pro-`(tool,args)`-Wiederholverfolgung). Der interaktive TUI-Pfad, der das gemeldete False Positive erzeugte, wird hier behoben.
