# Session-Recap-Design

> Eine kurze (1–2 Sätze) Zusammenfassung zum Stand der Dinge („Wo habe ich aufgehört?“), die angezeigt wird, wenn der Nutzer zu einer inaktiven Sitzung zurückkehrt, entweder auf Abruf (`/recap`) oder nachdem das Terminal für mindestens 5 Minuten den Fokus verloren hat.

## Übersicht

Wenn ein Nutzer eine alte Sitzung Tage später mit `/resume` fortsetzt, ist das Zurückscrollen durch Seiten voller Verlauf, um sich daran zu erinnern, **was er getan hat und was als Nächstes kommt**, ein echter Reibungspunkt. Das bloße Neuladen von Nachrichten löst dieses UX-Problem nicht.

Das Ziel ist es, beim Zurückkehren des Nutzers proaktiv eine kurze 1- bis 2-sätzige Zusammenfassung anzuzeigen:

- **Übergeordnete Aufgabe** (was getan wird) → **nächster Schritt** (was als Nächstes zu tun ist).
- Visuell klar von echten Assistant-Antworten abgegrenzt, damit sie niemals mit neuer Modellausgabe verwechselt wird.
- **Best-Effort**: Fehler müssen still behandelt werden und dürfen niemals den Hauptablauf unterbrechen.

## Trigger

| Trigger    | Bedingungen                                                                                   | Implementierung                                                    |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Manuell** | Nutzer führt `/recap` aus                                                                           | `recapCommand.ts` ruft denselben zugrunde liegenden Service auf               |
| **Automatisch**   | Terminal verliert Fokus (DECSET 1004 Focus Protocol) für ≥ 5 Min. + Fokus kehrt zurück + Stream ist `Idle` | `useAwaySummary.ts` — 5-Min.-Blur-Timer + `useFocus`-Event-Listener |

Beide Pfade münden in einer einzigen Funktion — `generateSessionRecap()` —, um identisches Verhalten zu garantieren. Der Auto-Trigger wird durch `general.showSessionRecap` gesteuert (Standard: aus – explizites Opt-in, damit Hintergrund-LLM-Aufrufe niemals unbemerkt auf der Nutzerrechnung landen); der manuelle Befehl ignoriert diese Einstellung.

## Architektur

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContainer.tsx                              │
│   isFocused = useFocus()                                               │
│   isIdle = streamingState === Idle                                     │
│       │                                                                │
│       ├─→ useAwaySummary({enabled, config, isFocused, isIdle,          │
│       │       │             addItem})                                  │
│       │       └─→ 5 min blur timer + idle/dedupe gates                 │
│       │              │                                                 │
│       │              ↓                                                 │
│       └─→ recapCommand (slash) ─→ generateSessionRecap(config, signal) │
│                                          │                             │
│                                          ↓                             │
│                              ┌─────────────────────────┐               │
│                              │ packages/core/services/ │               │
│                              │   sessionRecap.ts       │               │
│                              └─────────────────────────┘               │
│                                          │                             │
│                                          ↓                             │
│                              GeminiClient.generateContent              │
│                              (fastModel + tools:[])                    │
│                                                                        │
│   addItem({type: 'away_recap', text}) ─→ HistoryItemDisplay            │
│       └─ AwayRecapMessage rendered inline like any other history       │
│         item (※ + bold "recap: " + italic content, all dim);           │
│         scrolls naturally with the conversation. Mirrors Claude        │
│         Code's away_summary system message.                            │
└────────────────────────────────────────────────────────────────────────┘
```

### Dateien

| Datei                                                         | Verantwortung                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                 | Einmaliger LLM-Aufruf + Verlauf-Filter + Tag-Extraktion                              |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                | Auto-Trigger React Hook                                                          |
| `packages/cli/src/ui/commands/recapCommand.ts`               | Manueller Einstiegspunkt für `/recap`                                                      |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx` | `AwayRecapMessage`-Renderer (`※` + fett `recap:` + kursiver Inhalt, alles abgedunkelt)      |
| `packages/cli/src/ui/types.ts`                               | `HistoryItemAwayRecap`-Typ                                                      |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`      | Leitet `away_recap`-Verlaufselemente an den Renderer weiter                            |
| `packages/cli/src/config/settingsSchema.ts`                  | Einstellungen `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` |

## Prompt-Design

### System-Prompt

`generationConfig.systemInstruction` ersetzt für diesen einzelnen Aufruf den System-Prompt des Haupt-Agents, sodass sich das Modell ausschließlich als Recap-Generator und nicht als Coding-Assistant verhält.

Beachte, dass `GeminiClient.generateContent()` den Prompt intern durch `getCustomSystemPrompt()` laufen lässt, welches den User-Memory (`QWEN.md` / verwalteter Auto-Memory) als Suffix anhängt. Der finale System-Prompt lautet daher `Recap-Prompt + User-Memory` – nützlicher Projektkontext für den Recap, kein Leak.

Die folgenden Punkte entsprechen 1:1 dem `RECAP_SYSTEM_PROMPT`:

- Unter 40 Wörtern, 1–2 einfache Sätze (kein Markdown / keine Listen / keine Überschriften). Für Chinesisch gilt ein Budget von ca. 80 Zeichen insgesamt.
- Erster Satz: die übergeordnete Aufgabe. Dann: der konkrete nächste Schritt.
- Explizit verboten: Auflisten der erledigten Aufgaben, Wiedergeben von Tool-Aufrufen, Statusberichte.
- An die Hauptsprache der Konversation anpassen (Englisch oder Chinesisch).
- Ausgabe in `<recap>...</recap>` einschließen; nichts außerhalb der Tags.

### Strukturierte Ausgabe + Extraktion

Das Modell wird angewiesen, seine Antwort in `<recap>...</recap>` einzuschließen:

```
<recap>Refactoring loopDetectionService.ts to address long-session OOM. Next step is to implement option B.</recap>
```

Warum: Einige Modelle (GLM-Familie, Reasoning-Modelle) schreiben einen „Thinking“-Absatz vor der finalen Antwort. Die Rückgabe des Raw-Texts würde diese Reasoning-Schritte in die UI leaken.

`extractRecap()` verfügt über drei Fallback-Stufen:

1. Beide Tags vorhanden: Inhalt zwischen `<recap>...</recap>` übernehmen (bevorzugt).
2. Nur öffnendes Tag vorhanden (z. B. `maxOutputTokens` hat das schließende Tag abgeschnitten): Alles nach dem öffnenden Tag übernehmen.
3. Tag komplett fehlt: Leeren String zurückgeben → Service gibt `null` zurück → UI rendert nichts.

Die dritte Stufe folgt dem Prinzip „Lieber nichts anzeigen als Falsches“ – das Anzeigen des Reasoning-Preambles des Modells ist schlimmer als gar kein Recap.

### Aufrufparameter

| Parameter           | Wert                          | Grund                                                |
| ------------------- | ------------------------------ | ----------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()` | Recap benötigt kein Frontier-Modell                   |
| `tools`             | `[]`                           | Einmalige Abfrage, keine Tool-Nutzung                           |
| `maxOutputTokens`   | `300`                          | Puffer für 1–2 kurze Sätze + Tags               |
| `temperature`       | `0.3`                          | Überwiegend deterministisch, mit etwas natürlicher Variation |
| `systemInstruction` | Der obige Recap-only-Prompt    | Ersetzt die Rollendefinition des Haupt-Agents             |

## Verlauf-Filterung

`geminiClient.getChat().getHistory()` gibt ein `Content[]` zurück, das Folgendes enthält:

- `user` / `model`-Textnachrichten
- `model` `functionCall`-Parts
- `user` `functionResponse`-Parts (können vollständige Dateiinhalte enthalten)
- `model` Thought-Parts (`part.thought` / `part.thoughtSignature`, das versteckte Reasoning des Modells)

`filterToDialog()` behält nur `user` / `model`-Parts mit **nicht-leerem Text und ohne Thought-Parts**. Zwei Gründe:

- **Tool-Aufrufe / -Antworten**: Eine einzelne `functionResponse` kann 10K+ Tokens umfassen. 30 solcher Nachrichten würden das Recap-LLM in irrelevanten Details ersticken, was sowohl Tokens verschwendet als auch den Recap hin zu Implementierungsrauschen wie „Tool X aufgerufen, um Datei Y zu lesen“ verzerrt.
- **Thought-Parts**: enthalten das interne Reasoning des Modells. Ihre Einbeziehung birgt das Risiko, verstecktes Chain-of-Thought als Dialog zu behandeln und im Recap-Text anzuzeigen.

Nach dem Entfernen leerer Nachrichten schneidet `takeRecentDialog` auf die letzten 30 Nachrichten zu und vermeidet es, den Slice mit einer hängenden Model-/Tool-Antwort zu beginnen.

## Nebenläufigkeit und Edge Cases

### State Machine des Auto-Trigger Hooks

`useAwaySummary` verwaltet drei Refs:

| Ref               | Bedeutung                                           |
| ----------------- | ------------------------------------------------- |
| `blurredAtRef`    | Startzeit des Blur (wird erst gelöscht, wenn Fokus zurückkehrt) |
| `recapPendingRef` | Ob ein LLM-Aufruf gerade läuft                  |
| `inFlightRef`     | Der aktuell laufende `AbortController`           |

`useEffect`-Dependencies: `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`.

| Event                                                            | Aktion                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                          | Laufenden Aufruf abbrechen + `inFlightRef` löschen + `blurredAtRef` löschen                                                                      |
| `!isFocused` und `blurredAtRef === null`                         | Setze `blurredAtRef = Date.now()`                                                                                                        |
| `isFocused` und `blurredAtRef === null`                          | Frühzeitig zurückkehren (kein Blur-Zyklus zu verarbeiten – erster Render oder direkt nach einem kurzen Blur-Reset)                                                |
| `isFocused` und Blur-Dauer < 5 Min.                            | Lösche `blurredAtRef`, warte auf nächsten Blur-Zyklus                                                                                         |
| `isFocused` und Blur ≥ 5 Min. und `recapPendingRef`               | Zurückkehren (Deduplizierung)                                                                                                                        |
| `isFocused` und Blur ≥ 5 Min. und `!isIdle`                       | **Behalte** `blurredAtRef` und warte, bis der Turn abgeschlossen ist (`isIdle` ist in den Dependencies, daher feuert der Effect erneut, wenn das Streaming abgeschlossen ist) |
| `isFocused` und Blur ≥ 5 Min. und `shouldFireRecap` gibt `false` zurück | Lösche `blurredAtRef` und kehre zurück – Konversation hat sich seit dem letzten Recap nicht genug verändert (≥ 2 User-Turns erforderlich, entspricht Claude Code) |
| `isFocused` und alle Bedingungen erfüllt                               | Lösche `blurredAtRef`, setze `recapPendingRef = true`, erstelle `AbortController`, sende LLM-Anfrage                                     |

Der `.then`-Callback **prüft erneut** `isIdleRef.current`: Wenn der Nutzer einen neuen Turn gestartet hat, während das LLM lief, wird der verspätet eintreffende Recap verworfen, um eine Einfügung mitten im Turn zu vermeiden.

Der `.finally`-Block löscht `recapPendingRef` und löscht `inFlightRef` nur, wenn `inFlightRef.current === controller` gilt (damit kein neuerer Controller überschrieben wird).

Ein zweiter `useEffect` bricht den laufenden Controller beim Unmount ab.

### `/recap`-Gating

`CommandContext.ui.isIdleRef` macht den aktuellen Stream-Status verfügbar (entspricht dem bestehenden `btwAbortControllerRef`-Pattern). Im interaktiven Modus lehnt `recapCommand` ab, wenn `!isIdleRef.current` **oder** `pendingItem !== null`. `pendingItem` allein ist nicht ausreichend, da eine normale Modellantwort mit `streamingState === Responding` und einem `null` `pendingItem` läuft.

## Konfiguration und Modellauswahl

### Nutzerseitige Einstellungen

| Einstellung                                    | Standard | Hinweise                                                                               |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `general.showSessionRecap`                 | `false` | Nur Auto-Trigger. Manueller `/recap` ignoriert dies.                                    |
| `general.sessionRecapAwayThresholdMinutes` | `5`     | Minuten ohne Fokus, bevor Auto-Recap bei Fokus-Rückkehr feuert. Entspricht dem Standard von Claude Code. |
| `fastModel`                                | nicht gesetzt   | Empfohlen (z. B. `qwen3-coder-flash`) für schnelle und kostengünstige Recaps.                   |

### Modell-Fallback

`config.getFastModel() ?? config.getModel()`:

- Nutzer hat ein `fastModel` konfiguriert und es ist für den aktuellen Auth-Typ gültig → verwende `fastModel`.
- Andernfalls → Fallback auf das Haupt-Sitzungsmodell (funktioniert, ist nur teurer und langsamer).

## Observability

`createDebugLogger('SESSION_RECAP')` emittiert:

- abgefangene Exceptions aus dem Recap-Pfad (`debugLogger.warn`).

Alle Fehler sind für den Nutzer **vollständig transparent** – Recap ist ein Zusatzfeature und wirft niemals Exceptions in die UI. Entwickler können im Debug-Log-File nach dem `[SESSION_RECAP]`-Tag greppen: standardmäßig geschrieben nach `~/.qwen/debug/<sessionId>.txt` (`latest.txt` symlinkt auf die aktuelle Sitzung); deaktivierbar über `QWEN_DEBUG_LOG_FILE=0`.

## Nicht im Scope

| Item                                             | Warum nicht                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Progress-UI für `/recap` (Spinner / `pendingItem`) | Wartezeit von 3–5 Sekunden ist tolerabel; erhöht die Komplexität.                                                                                           |
| Automatisierte Tests                                  | Service ist klein (~150 Zeilen), zunächst manuell End-to-End getestet; Unit-Tests können in einem separaten PR landen.                                   |
| Lokalisierte Prompts                                | Der System-Prompt ist für das Modell; Englisch ist die zuverlässigste Basis. Das Modell wählt die Ausgabesprache basierend auf der Konversation. |
| Umgebungsvariable `QWEN_CODE_ENABLE_AWAY_SUMMARY`          | Claude Code nutzt dies, um das Feature bei deaktivierter Telemetry aktiv zu halten; Qwen Codes aktuelles Telemetry-Modell benötigt dies nicht.            |
| Auto-Recap nach Abschluss von `/resume`               | Ein natürlicher nächster Schritt, benötigt aber einen Hook-Punkt in `useResumeCommand`; nicht im Scope dieses PRs.                                              |