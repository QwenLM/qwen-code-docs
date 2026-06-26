# Session Recap Design

> Eine kurze (1-2 Sätze) „Wo bin ich stehen geblieben?"-Zusammenfassung, die dem Benutzer angezeigt wird,
> wenn er zu einer inaktiven Sitzung zurückkehrt – entweder auf Abruf (`/recap`) oder nachdem das
> Terminal für 5+ Minuten unscharf (blurred) war.

## Übersicht

Wenn ein Benutzer Tage später eine alte Sitzung mit `/resume` fortsetzt und durch Seiten von Verlauf
zurückscrollen muss, um sich zu erinnern, **was er getan hat und was als Nächstes kam**, ist das ein echter
Reibungspunkt. Das bloße Neuladen von Nachrichten löst dieses UX-Problem nicht.

Ziel ist es, proaktiv eine kurze 1-2-Satz-Zusammenfassung einzublenden, wenn der Benutzer zurückkehrt:

- **Übergeordnete Aufgabe** (was er tut) → **Nächster Schritt** (was als Nächstes zu tun ist).
- Visuell unterscheidbar von echten Assistentenantworten, damit sie nie mit neuer Modellausgabe verwechselt wird.
- **Best-Effort**: Fehler müssen still erfolgen und dürfen den Hauptablauf nie unterbrechen.

## Auslöser

| Auslöser        | Bedingungen                                                                                         | Implementierung                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manuell**     | Benutzer führt `/recap` aus                                                                         | `recapCommand.ts` ruft denselben zugrunde liegenden Service auf                                                                                       |
| **Automatisch** | Terminal unscharf (DECSET 1004 Fokusprotokoll) für ≥ 5 Min. + Fokus kehrt zurück + Stream ist `Idle` | `useAwaySummary.ts` – 5-Min.-Unschärfe-Timer + `useFocus`-Event-Listener                                                                              |
| **Daemon HTTP** | Remote-Client ruft `POST /session/:id/recap` auf                                                     | `server.ts`-Route → `bridge.generateSessionRecap` (Ext-Method-Roundtrip) → `acpAgent.ts` ruft `generateSessionRecap(session.getConfig(), signal)` auf |

Alle drei Pfade münden in dieselbe `generateSessionRecap()`-Funktion in
`core/services/sessionRecap.ts`, um identisches Verhalten zu garantieren. Der
Auto-Trigger wird durch `general.showSessionRecap` gesteuert (Standard: aus –
explizites Opt-in, damit keine LLM-Aufrufe im Hintergrund unbemerkt auf die
Rechnung des Benutzers kommen); der manuelle Befehl und die Daemon-HTTP-Route
ignorieren diese Einstellung (der Aufrufer stellt eine explizite Anforderung).

### Daemon-Zugriffspfad

Die Daemon-Route ist nicht streng abgeschirmt (spiegelt die Haltung von
`/session/:id/prompt` wider – Recap kostet Token, verändert aber keinen Zustand).
Das Capability-Tag `session_recap` bewirbt die Route unter `/capabilities.features`.
SDK-Helfer: `DaemonClient.recapSession(sessionId, opts)` und
`DaemonSessionClient.recap(opts)`. Siehe
`docs/developers/qwen-serve-protocol.md` § `POST /session/:id/recap`
für den Wire-Contract und das Fehler-Envelope.

Der Abbruch ist **in v1 nicht vorhanden**. Die Route lauscht nicht auf
HTTP-Client-Disconnect, kein `AbortSignal` wird in
`bridge.generateSessionRecap` eingefädelt, und der ACP-Child-Handler übergibt
ein nie abgebrochenes `AbortController().signal` an den Kern-Helper (es gibt
noch keine Cross-Process-Abbruch-Infrastruktur). Die einzigen Grenzen sind der
60-Sekunden-`SESSION_RECAP_TIMEOUT_MS`-Backstop der Bridge und das
Transport-geschlossene-Rennen gegen den ACP-Channel-Tod. Ein bloßes
HTTP-seitiges `AbortController` einzubauen wäre kosmetisch – der
Child-seitige LLM-Aufruf würde trotzdem bis zum Ende laufen, also ist ein
Ende-zu-Ende-Abbruch ohne das Cross-Process-Abbruchstück nicht erreichbar.
Das ist für v1 akzeptabel, da Recap kurz ist (einmalige Seitenabfrage,
`maxOutputTokens: 300`, typischerweise ~1–5 s). Eine zukünftige
Request-ID-basierte Abbruch-Ext-Methode kann vollständigen Ende-zu-Ende-Abbruch
ermöglichen, falls die Kosten dies rechtfertigen.

## Architektur

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContainer.tsx                              │
│   isFocused = useFocus()                                               │
│   isIdle = streamingState === Idle                                     │
│       │                                                                │
│       ├─→ useAwaySummary({enabled, config, isFocused, isIdle,          │
│       │       │             addItem})                                  │
│       │       └─→ 5-Min.-Unschärfe-Timer + Idle/Dedupe-Gates          │
│       │              │                                                 │
│       │              ↓                                                 │
│       └─→ recapCommand (Slash) ─→ generateSessionRecap(config, signal) │
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
│       └─ AwayRecapMessage wird inline wie jedes andere History-Item    │
│         gerendert (※ + fett „recap: " + kursiver Inhalt, alles dim);  │
│         scrollt natürlich mit der Konversation. Spiegelt Claude        │
│         Codes away_summary-Systemnachricht.                            │
└────────────────────────────────────────────────────────────────────────┘
```

### Dateien

| Datei                                                                     | Verantwortung                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                              | Einmaliger LLM-Aufruf + Verlaufsfilter + Tag-Extraktion                               |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                             | Auto-Trigger React-Hook                                                               |
| `packages/cli/src/ui/commands/recapCommand.ts`                            | Manueller `/recap`-Einstiegspunkt                                                      |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx`              | `AwayRecapMessage`-Renderer (`※` + fett `recap:` + kursiver Inhalt, alles dim)        |
| `packages/cli/src/ui/types.ts`                                            | `HistoryItemAwayRecap`-Typ                                                            |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`                   | Leitet `away_recap`-History-Items an den Renderer weiter                              |
| `packages/cli/src/config/settingsSchema.ts`                               | Einstellungen `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` |

## Prompt-Design

### System-Prompt

`generationConfig.systemInstruction` ersetzt für diesen einzelnen Aufruf den
System-Prompt des Hauptagenten, sodass sich das Modell nur als Recap-Generator
und nicht als Code-Assistent verhält.

Beachten Sie, dass `GeminiClient.generateContent()` den Prompt intern über
`getCustomSystemPrompt()` ausführt, welches das Benutzergedächtnis
(QWEN.md / verwaltetes Auto-Memory) als Suffix anhängt. Der finale System-Prompt
ist daher `Recap-Prompt + Benutzergedächtnis` – nützlicher Projektkontext
für das Recap, kein Leck.

Die Aufzählungspunkte unten entsprechen 1:1 `RECAP_SYSTEM_PROMPT`:

- Unter 40 Wörtern, 1-2 einfache Sätze (kein Markdown / Listen / Überschriften).
  Für Chinesisch beträgt das Budget grob 80 Zeichen insgesamt.
- Erster Satz: die übergeordnete Aufgabe. Dann: der konkrete nächste Schritt.
- Explizit verboten: aufzulisten, was getan wurde, Tool-Aufrufe wiederzugeben,
  Statusberichte zu machen.
- Die dominierende Sprache der Konversation verwenden (Englisch oder Chinesisch).
- Ausgabe in `<recap>...</recap>` einwickeln; nichts außerhalb der Tags.

### Strukturierte Ausgabe + Extraktion

Das Modell wird angewiesen, seine Antwort in `<recap>...</recap>` zu verpacken:

```
<recap>Refactoring loopDetectionService.ts, um OOM bei langen Sitzungen zu beheben. Nächster Schritt ist die Implementierung von Option B.</recap>
```

Warum: Einige Modelle (GLM-Familie, Reasoning-Modelle) schreiben vor der
endgültigen Antwort einen „Denk"-Absatz. Würde man den rohen Text zurückgeben,
würde dieses Reasoning in die UI durchsickern.

`extractRecap()` hat drei Fallback-Stufen:

1. Beide Tags vorhanden: Nimm den Inhalt zwischen `<recap>...</recap>` (bevorzugt).
2. Nur der öffnende Tag (z. B. hat `maxOutputTokens` den schließenden Tag abgeschnitten):
   Nimm alles nach dem öffnenden Tag.
3. Tag komplett fehlend: Gib leeren String zurück → Service gibt `null` zurück
   → UI rendert nichts.

Die dritte Stufe bedeutet „lieber überspringen als das Falsche anzeigen" – das
Einblenden des Reasoning-Preamble des Modells ist schlimmer, als gar kein Recap
zu zeigen.

### Aufrufparameter

| Parameter           | Wert                           | Grund                                                        |
| ------------------- | ------------------------------ | ------------------------------------------------------------ |
| `model`             | `getFastModel() ?? getModel()` | Recap braucht kein Frontier-Modell                           |
| `tools`             | `[]`                           | Einmalige Abfrage, keine Tool-Nutzung                        |
| `maxOutputTokens`   | `300`                          | Spielraum für 1-2 kurze Sätze + Tags                         |
| `temperature`       | `0.3`                          | Größtenteils deterministisch, mit etwas natürlicher Variation |
| `systemInstruction` | Der obige Recap-Only-Prompt    | Ersetzt die Rollendefinition des Hauptagenten                |

## Verlaufsfilterung

`geminiClient.getChat().getHistory()` gibt ein `Content[]` zurück, das
Folgendes enthält:

- `user` / `model`-Textnachrichten
- `model`-`functionCall`-Teile
- `user`-`functionResponse`-Teile (die vollständige Dateiinhalte enthalten können)
- `model`-Thought-Teile (`part.thought` / `part.thoughtSignature`,
  das verborgene Reasoning des Modells)

`filterToDialog()` behält nur `user` / `model`-Teile, die **nicht leeren Text
haben und keine Thoughts sind**. Zwei Gründe:

- **Tool-Aufrufe/-Antworten**: Eine einzelne `functionResponse` kann 10K+
  Token enthalten. 30 solcher Nachrichten würden das Recap-LLM in irrelevanten
  Details ertränken, sowohl Token verschwenden als auch das Recap in Richtung
  Implementierungsrauschen wie „Tool X aufgerufen, um Datei Y zu lesen" lenken.
- **Thought-Teile**: Sie tragen das interne Reasoning des Modells. Wenn man sie
  aufnimmt, besteht die Gefahr, dass versteckte Chain-of-Thought als Dialog
  behandelt und im Recap-Text eingeblendet wird.

Nach dem Entfernen leerer Nachrichten schneidet `takeRecentDialog` auf die
letzten 30 Nachrichten zu und weigert sich, den Ausschnitt mit einer
hängigen Model/Tool-Antwort zu beginnen.

## Nebenläufigkeit und Randfälle

### Zustandsmaschine des Auto-Trigger-Hooks

`useAwaySummary` verwaltet drei Refs:

| Ref                | Bedeutung                                                |
| ------------------ | -------------------------------------------------------- |
| `blurredAtRef`     | Startzeitpunkt der Unschärfe (wird erst bei Fokus gelöscht) |
| `recapPendingRef`  | Ob ein LLM-Aufruf läuft                                  |
| `inFlightRef`      | Der aktuelle laufende `AbortController`                  |

`useEffect`-Deps: `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`.

| Ereignis                                                          | Aktion                                                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                           | Laufenden Aufruf abbrechen + `inFlightRef` löschen + `blurredAtRef` löschen                                                               |
| `!isFocused` und `blurredAtRef === null`                          | `blurredAtRef = Date.now()` setzen                                                                                                        |
| `isFocused` und `blurredAtRef === null`                           | Früh zurückkehren (kein Unschärfe-Zyklus zu behandeln – erster Render oder direkt nach einem Reset einer kurzen Unschärfe)                |
| `isFocused` und Unschärfe-Dauer < 5 Min.                          | `blurredAtRef` löschen, auf nächsten Unschärfe-Zyklus warten                                                                              |
| `isFocused` und Unschärfe ≥ 5 Min. und `recapPendingRef`          | Zurückkehren (Deduplizierung)                                                                                                             |
| `isFocused` und Unschärfe ≥ 5 Min. und `!isIdle`                   | **`blurredAtRef` beibehalten** und auf Ende des Turn warten (`isIdle` ist in den Deps, daher wird der Effekt neu ausgelöst, wenn Streaming abgeschlossen ist) |
| `isFocused` und Unschärfe ≥ 5 Min. und `shouldFireRecap` gibt `false` zurück | `blurredAtRef` löschen und zurückkehren – die Konversation hat sich seit dem letzten Recap nicht ausreichend bewegt (≥ 2 Benutzer-Turns erforderlich, spiegelt Claude Code) |
| `isFocused` und alle Bedingungen erfüllt                          | `blurredAtRef` löschen, `recapPendingRef = true` setzen, `AbortController` erstellen, LLM-Anfrage senden                                    |

Der `.then`-Callback **prüft erneut** `isIdleRef.current`: wenn der Benutzer
während der LLM-Berechnung einen neuen Turn gestartet hat, wird das spät
eintreffende Recap verworfen, um ein Einfügen mitten im Turn zu vermeiden.

Der `.finally` löscht `recapPendingRef` und löscht `inFlightRef` nur dann,
wenn `inFlightRef.current === controller` (damit kein neuerer Controller
überschrieben wird).

Ein zweiter `useEffect` bricht den laufenden Controller beim Unmount ab.

### `/recap`-Absicherung

`CommandContext.ui.isIdleRef` gibt den aktuellen Stream-Status bekannt
(spiegelt das bestehende `btwAbortControllerRef`-Muster). Im
interaktiven Modus verweigert `recapCommand` die Ausführung, wenn
`!isIdleRef.current` **oder** `pendingItem !== null`. `pendingItem` allein
ist nicht ausreichend, da eine normale Modellantwort mit
`streamingState === Responding` und einem `null`-`pendingItem` läuft.

## Konfiguration und Modellauswahl

### Vom Benutzer einstellbare Stellschrauben

| Einstellung                                   | Standard | Hinweise                                                                                      |
| --------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `general.showSessionRecap`                    | `false`  | Nur Auto-Trigger. Manuelles `/recap` ignoriert diese Einstellung.                              |
| `general.sessionRecapAwayThresholdMinutes`    | `5`      | Minuten der Unschärfe, bevor beim Fokuserhalt automatisch ein Recap ausgelöst wird. Entspricht Claude Codes Standard. |
| `fastModel`                                   | nicht gesetzt | Empfohlen (z. B. `qwen3-coder-flash`) für schnelle und günstige Recaps.                     |

### Modell-Fallback

`config.getFastModel() ?? config.getModel()`:

- Benutzer hat ein `fastModel` gesetzt und es ist für den aktuellen Authentifizierungstyp gültig
  → `fastModel` verwenden.
- Andernfalls → auf das Hauptsitzungsmodell zurückfallen (funktioniert, nur teurer und langsamer).

## Beobachtbarkeit

`createDebugLogger('SESSION_RECAP')` gibt Folgendes aus:

- abgefangene Ausnahmen aus dem Recap-Pfad (`debugLogger.warn`).

Alle Fehler sind für den Benutzer **vollständig transparent** – Recap ist ein
Hilfsfeature und wirft nie in die UI. Entwickler können nach dem
`[SESSION_RECAP]`-Tag in der Debug-Logdatei suchen: standardmäßig geschrieben
nach `~/.qwen/debug/<sessionId>.txt` (`latest.txt` ist ein Symlink auf die
aktuelle Sitzung); deaktivieren über `QWEN_DEBUG_LOG_FILE=0`.

## Nicht im Umfang

| Punkt                                            | Warum nicht                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Fortschrittsanzeige für `/recap` (Spinner / pendingItem) | 3-5 Sekunden warten ist tolerierbar; erhöht die Komplexität.                                                                              |
| Automatisierte Tests                             | Service ist klein (~150 Zeilen), wird zuerst manuell Ende-zu-Ende getestet; Unit-Tests können in einem separaten PR landen.               |
| Lokalisierte Prompts                             | Der System-Prompt ist für das Modell; Englisch ist das zuverlässigste Substrat. Das Modell wählt die Ausgangssprache aus der Konversation. |
| `QWEN_CODE_ENABLE_AWAY_SUMMARY`-Umgebungsvariable | Claude Code verwendet sie, um das Feature bei deaktiviertem Telemetrie zu behalten; Qwen Codes aktuelles Telemetriemodell benötigt dies nicht. |
| Auto-Recap bei `/resume`-Abschluss               | Eine natürliche Folgemaßnahme, benötigt aber einen Hook-Punkt in `useResumeCommand`; außerhalb des Rahmens dieses PR.                      |