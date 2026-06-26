# Entwurf der Sitzungszusammenfassung

> Eine kurze (1–2 Sätze) Zusammenfassung zum Thema „Wo war ich stehen geblieben?“, die dem Benutzer angezeigt wird, wenn er zu einer inaktiven Sitzung zurückkehrt – entweder auf Abruf (`/recap`) oder nachdem das Terminal für 5+ Minuten unscharf war.

## Übersicht

Wenn ein Benutzer Tage später eine alte Sitzung `/resume`t, ist das Zurückscrollen durch Seiten von Verlauf, um sich zu erinnern, **was er gerade gemacht hat und was als Nächstes kommt**, ein echter Reibungspunkt. Das einfache erneute Laden von Nachrichten löst dieses UX-Problem nicht.

Ziel ist es, proaktiv eine kurze Zusammenfassung von 1–2 Sätzen einzublenden, wenn der Benutzer zurückkehrt:

- **Übergeordnete Aufgabe** (was wird getan) → **nächster Schritt** (was als Nächstes zu tun ist).
- Visuell deutlich von echten Assistentenantworten abgesetzt, damit sie nie mit neuer Modellausgabe verwechselt wird.
- **Best-Effort**: Fehler müssen stillschweigend erfolgen und dürfen den Hauptablauf niemals unterbrechen.

## Auslöser

| Auslöser        | Bedingungen                                                                                | Implementierung                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manuell**     | Benutzer führt `/recap` aus                                                                | `recapCommand.ts` ruft denselben zugrunde liegenden Dienst auf                                                                                      |
| **Automatisch** | Terminal unscharf (DECSET 1004 Fokusprotokoll) für ≥ 5 Min. + Fokus kehrt zurück + Stream ist `Idle` | `useAwaySummary.ts` – 5-Min.-Unscharf-Timer + `useFocus`-Ereignis-Listener                                                                                  |
| **Daemon HTTP** | Remote-Client ruft `POST /session/:id/recap` auf                                           | `server.ts`-Route → `bridge.generateSessionRecap` (Ext-Method-Roundtrip) → `acpAgent.ts` ruft `generateSessionRecap(session.getConfig(), signal)` auf |

Alle drei Pfade münden in dieselbe Funktion `generateSessionRecap()` in `core/services/sessionRecap.ts`, um identisches Verhalten zu gewährleisten. Der automatische Auslöser wird durch `general.showSessionRecap` gesteuert (Standard: aus – explizites Opt-in, damit LLM-Aufrufe im Hintergrund niemals stillschweigend der Rechnung des Benutzers hinzugefügt werden); der manuelle Befehl und die Daemon-HTTP-Route ignorieren diese Einstellung (der Aufrufer stellt eine explizite Anfrage).

### Daemon-Zugriffspfad

Die Daemon-Route ist nicht streng abgeschirmt (entspricht der Haltung von `/session/:id/prompt` – Recap kostet Tokens, verändert aber keinen Zustand). Das Fähigkeiten-Tag `session_recap` bewirbt die Route unter `/capabilities.features`. SDK-Helfer: `DaemonClient.recapSession(sessionId, opts)` und `DaemonSessionClient.recap(opts)`. Siehe `docs/developers/qwen-serve-protocol.md` § `POST /session/:id/recap` für den Wire-Vertrag und das Fehler-Envelope.

Ein **Abbruch ist in v1 nicht vorhanden**. Die Route lauscht nicht auf HTTP-Client-Trennung, es wird kein `AbortSignal` in `bridge.generateSessionRecap` eingefädelt, und der ACP-Child-Handler übergibt ein nie abgebrochenes `AbortController().signal` an den Kern-Helfer (noch keine abteilungsübergreifende Abbruch-Installation). Die einzigen Obergrenzen sind der 60-Sekunden-`SESSION_RECAP_TIMEOUT_MS`-Backstop der Bridge und das Transport-geschlossene-Rennen gegen den ACP-Kanal-Tod. Ein isoliertes Verdrahten eines HTTP-seitigen AbortController wäre kosmetisch – der LLM-Aufruf auf der Child-Seite würde trotzdem bis zum Ende laufen, sodass ein Ende-zu-Ende-Abbruch ohne das abteilungsübergreifende Abbruch-Stück nicht realisierbar ist. Dies ist für v1 akzeptabel, da Recap kurz ist (einzelner Versuch, Nebenabfrage, `maxOutputTokens: 300`, typisch ~1–5 s). Eine zukünftige anforderungs-ID-basierte Cancel-Ext-Method kann den vollständigen Ende-zu-Ende-Abbruch implementieren, falls/wenn die Bandbreitenkosten dies rechtfertigen.

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

| Datei                                                         | Verantwortung                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                  | Einmaliger LLM-Aufruf + Verlaufsfilter + Tag-Extraktion                          |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                 | React-Hook zum automatischen Auslösen                                            |
| `packages/cli/src/ui/commands/recapCommand.ts`                | Manueller Einstiegspunkt über `/recap`                                           |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx`  | Renderer für `AwayRecapMessage` (`※` + fett `recap:` + kursiver Inhalt, alles gedimmt) |
| `packages/cli/src/ui/types.ts`                                | Typ `HistoryItemAwayRecap`                                                       |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`       | Leitet `away_recap`-Verlaufselemente an den Renderer weiter                      |
| `packages/cli/src/config/settingsSchema.ts`                   | `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes`-Einstellungen |

## Prompt-Design

### System-Prompt

`generationConfig.systemInstruction` ersetzt das System-Prompt des
Hauptagenten für diesen einzelnen Aufruf, sodass das Modell sich nur
als Zusammenfassungsgenerator und nicht als Code-Assistent verhält.

Beachte, dass `GeminiClient.generateContent()` intern den Prompt durch
`getCustomSystemPrompt()` laufen lässt, der den Benutzerspeicher
(QWEN.md / verwalteter Auto-Speicher) als Suffix anhängt. Der finale
System-Prompt ist daher `Zusammenfassungs-Prompt + Benutzerspeicher` —
nützlicher Projektkontext für die Zusammenfassung, kein Leck.

Die folgenden Punkte entsprechen 1:1 `RECAP_SYSTEM_PROMPT`:

- Unter 40 Wörtern, 1–2 einfache Sätze (kein Markdown / Listen / Überschriften). Für Chinesisch: Budget beträgt etwa 80 Zeichen insgesamt.
- Erster Satz: die übergeordnete Aufgabe. Danach: der konkrete nächste Schritt.
- Explizit verboten: Aufzählen, was getan wurde; Wiedergeben von Tool-Aufrufen; Statusberichte.
- Die vorherrschende Sprache der Unterhaltung verwenden (Englisch oder Chinesisch).
- Ausgabe in `<recap>...</recap>` einschließen; nichts außerhalb der Tags.

### Strukturierte Ausgabe + Extraktion

Das Modell wird angewiesen, seine Antwort in `<recap>...</recap>` zu verpacken:

```
<recap>Refactoring von loopDetectionService.ts zur Behebung von OOM bei langen Sitzungen. Nächster Schritt: Option B implementieren.</recap>
```

Warum: Einige Modelle (GLM-Familie, Reasoning-Modelle) schreiben einen
"Denk"-Absatz vor der endgültigen Antwort. Die Rohausgabe auszugeben
würde dieses Denken in die UI durchsickern lassen.

`extractRecap()` hat drei Fallback-Ebenen:

1. Beide Tags vorhanden: Nimm den Inhalt zwischen `<recap>...</recap>` (bevorzugt).
2. Nur das öffnende Tag (z. B. wenn `maxOutputTokens` das schließende Tag abgeschnitten hat): Nimm alles nach dem öffnenden Tag.
3. Tag vollständig fehlend: Leeren String zurückgeben → Service gibt `null` zurück → UI rendert nichts.

Die dritte Ebene ist "lieber auslassen, als das Falsche anzeigen" – das Vorwort mit dem Denken des Modells anzuzeigen ist schlimmer, als gar keine Zusammenfassung zu zeigen.

### Aufrufparameter

| Parameter           | Wert                             | Grund                                                    |
| ------------------- | -------------------------------- | -------------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()`   | Zusammenfassung braucht kein Frontier-Modell             |
| `tools`             | `[]`                             | Einmalige Abfrage, keine Tool-Nutzung                    |
| `maxOutputTokens`   | `300`                            | Spielraum für 1–2 kurze Sätze + Tags                     |
| `temperature`       | `0.3`                            | Meist deterministisch, mit etwas natürlicher Variation   |
| `systemInstruction` | Das reine Zusammenfassungs-Prompt (siehe oben) | Ersetzt die Rollendefinition des Hauptagenten            |

## Verlaufsfilterung

`geminiClient.getChat().getHistory()` gibt ein `Content[]` zurück, das
Folgendes enthält:

- `user`- / `model`-Textnachrichten
- `model`- `functionCall`-Teile
- `user`- `functionResponse`-Teile (die vollständige Dateiinhalte enthalten können)
- `model`-Denkteile (`part.thought` / `part.thoughtSignature`, das verborgene Reasoning des Modells)

`filterToDialog()` behält nur `user`- / `model`-Teile, die **nicht leeren Text haben und keine Gedanken sind**. Zwei Gründe:

- **Tool-Aufrufe / Antworten**: Ein einzelner `functionResponse` kann 10K+ Tokens umfassen.
  30 solcher Nachrichten würden das Zusammenfassungs-LLM in irrelevanten Details ertränken,
  sowohl Tokens verschwenden als auch die Zusammenfassung in Richtung Implementierungsrauschen
  wie "hat X-Tool aufgerufen, um Y-Datei zu lesen" verzerren.
- **Denkteile**: Enthalten das interne Reasoning des Modells. Sie einzubeziehen birgt die
  Gefahr, dass die verborgene Gedankenkette als Dialog behandelt und im Zusammenfassungstext
  angezeigt wird.

Nachdem leere Nachrichten entfernt wurden, schneidet `takeRecentDialog` die letzten 30
Nachrichten ab und weigert sich, das Segment auf einer hängenden Modell-/Tool-Antwort beginnen zu lassen.
## Nebenläufigkeit und Randfälle

### Zustandsmaschine des automatischen Auslöse-Hooks

`useAwaySummary` verwaltet drei Refs:

| Ref               | Bedeutung                                                  |
| ----------------- | ---------------------------------------------------------- |
| `blurredAtRef`    | Startzeitpunkt der Unschärfe (wird erst bei Rückkehr des Fokus gelöscht) |
| `recapPendingRef` | Gibt an, ob ein LLM-Aufruf läuft                            |
| `inFlightRef`     | Aktueller in Bearbeitung befindlicher `AbortController`    |

`useEffect`-Dependencies: `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`.

| Ereignis                                                         | Aktion                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                          | Laufenden Aufruf abbrechen + `inFlightRef` leeren + `blurredAtRef` leeren                                                             |
| `!isFocused` und `blurredAtRef === null`                          | Setze `blurredAtRef = Date.now()`                                                                                                    |
| `isFocused` und `blurredAtRef === null`                          | Früh beenden (kein Unschärfe-Zyklus zu verarbeiten – erster Render oder direkt nach einem kurzen Unschärfe-Reset)                    |
| `isFocused` und Unschärfe-Dauer < 5 Minuten                      | `blurredAtRef` leeren, auf nächsten Unschärfe-Zyklus warten                                                                          |
| `isFocused` und Unschärfe ≥ 5 Minuten und `recapPendingRef`      | Beenden (Deduplizierung)                                                                                                              |
| `isFocused` und Unschärfe ≥ 5 Minuten und `!isIdle`              | **Behalte** `blurredAtRef` und warte, bis der Durchlauf beendet ist (`isIdle` ist in den Dependencies, daher feuert der Effekt erneut, wenn das Streaming abgeschlossen ist) |
| `isFocused` und Unschärfe ≥ 5 Minuten und `shouldFireRecap` gibt `false` zurück | `blurredAtRef` leeren und beenden – die Konversation hat sich seit der letzten Zusammenfassung nicht genug bewegt (≥ 2 Benutzer-Durchläufe erforderlich, spiegelt Claude Code) |
| `isFocused` und alle Bedingungen erfüllt                          | `blurredAtRef` leeren, `recapPendingRef = true` setzen, `AbortController` erstellen, LLM-Anfrage senden                                |

Der `.then`-Callback **prüft erneut** `isIdleRef.current`: Wenn der Benutzer
während der LLM-Ausführung eine neue Runde gestartet hat, wird die spät
eintreffende Zusammenfassung verworfen, um eine Einfügung mitten in der Runde zu vermeiden.

Der `.finally`-Block löscht `recapPendingRef` und löscht `inFlightRef` nur
dann, wenn `inFlightRef.current === controller` (damit kein neuerer
Controller überschrieben wird).

Ein zweiter `useEffect` bricht den laufenden Controller beim Unmount ab.

### `/recap`-Sperre

`CommandContext.ui.isIdleRef` gibt den aktuellen Stream-Zustand preis
(spiegelt das bestehende `btwAbortControllerRef`-Muster wider). Im
interaktiven Modus verweigert `recapCommand` die Ausführung, wenn `!isIdleRef.current`
**oder** `pendingItem !== null` gilt. Allein `pendingItem` reicht nicht,
da eine normale Modellantwort mit `streamingState === Responding` und
einem null-`pendingItem` läuft.

## Konfiguration und Modellauswahl

### Benutzersichtbare Einstellungen

| Einstellung                               | Standard | Hinweise                                                                                 |
| ----------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `general.showSessionRecap`                | `false`  | Nur automatische Auslösung. Manuelles `/recap` ignoriert dies.                            |
| `general.sessionRecapAwayThresholdMinutes`| `5`      | Minuten Unschärfe, bevor bei Fokus-Rückkehr die automatische Zusammenfassung ausgelöst wird. Entspricht dem Standard von Claude Code. |
| `fastModel`                               | nicht gesetzt | Empfohlen (z.B. `qwen3-coder-flash`) für schnelle und günstige Zusammenfassungen.      |

### Modell-Fallback

`config.getFastModel() ?? config.getModel()`:

- Der Benutzer hat ein `fastModel` gesetzt und es ist für den aktuellen Authentifizierungstyp gültig
  → `fastModel` verwenden.
- Andernfalls → Fallback auf das Hauptsitzungsmodell (funktioniert, ist aber teurer
  und langsamer).

## Beobachtbarkeit

`createDebugLogger('SESSION_RECAP')` gibt aus:

- abgefangene Ausnahmen aus dem Recap-Pfad (`debugLogger.warn`).

Alle Fehler sind für den Benutzer **völlig transparent** – die Zusammenfassung ist eine
Hilfsfunktion und wirft niemals Fehler in die UI. Entwickler können nach dem
`[SESSION_RECAP]`-Tag in der Debug-Logdatei suchen: standardmäßig geschrieben nach
`~/.qwen/debug/<sessionId>.txt` (`latest.txt` verweist per Symlink auf die aktuelle
Sitzung); deaktivieren über `QWEN_DEBUG_LOG_FILE=0`.

## Außerhalb des Rahmens

| Punkt                                           | Warum nicht                                                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Fortschrittsanzeige für `/recap` (Spinner / pendingItem) | 3-5 Sekunden Wartezeit sind akzeptabel; erhöht die Komplexität.                                                                        |
| Automatisierte Tests                            | Der Service ist klein (~150 Zeilen), zuerst manuell end-to-end getestet; Unit-Tests können in einem separaten PR eingebracht werden.    |
| Lokalisierte Prompts                            | Der System-Prompt ist für das Modell; Englisch ist die zuverlässigste Grundlage. Das Modell wählt die Ausgabesprache aus der Konversation. |
| `QWEN_CODE_ENABLE_AWAY_SUMMARY`-Umgebungsvariable | Claude Code verwendet sie, um die Funktion bei deaktivierter Telemetrie aktiv zu halten; Qwen Codes aktuelles Telemetriemodell benötigt dies nicht. |
| Automatische Zusammenfassung nach `/resume`-Abschluss | Ein naheliegendes Folgefeature, benötigt aber einen Hook-Punkt in `useResumeCommand`; nicht im Rahmen dieses PRs.                      |
