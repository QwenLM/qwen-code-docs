# Generation-Timing-Metriken in `/stats`

> Ein späteres GenAI-Alignment fügt zusätzlich zum bestehenden privaten
> `ttft_ms` das unabhängige Span-Attribut `gen_ai.response.time_to_first_chunk`
> hinzu. Der in diesem Dokument beschriebene Datenfluss von
> `ApiResponseEvent.ttft_ms` und die Semantik „erste für den Nutzer sichtbare
> Ausgabe" bleiben unverändert; `/stats` konsumiert das
> Standard-First-Chunk-Attribut nicht.

## Kontext

Issue #4252 verlangt, dass `/stats` das Generation-Timing getrennt von der
Session-Wall-Time und der Ende-zu-Ende-API-Latenz anzeigt. Das Low-Level-Timing
existiert bereits:

- `LoggingContentGenerator` misst `ttftMs` vom Request-Dispatch bis zum ersten
  für den Nutzer sichtbaren gestreamten Chunk.
- `endLLMRequestSpan` leitet `sampling_ms` und `output_tokens_per_second` ab.
- `ApiResponseEvent` transportiert bereits Request-Dauer, Modell, Prompt-Id und
  Output-Token-Anzahl in den `UiTelemetryService`.

Das fehlende Bindeglied ist, den bestehenden TTFT-Wert für die
Inhalt-freien Session-Metriken verfügbar zu machen, die `/stats` nutzt.

## Scope

Diese Änderung fügt Live-, Session-scoped Generation-Metriken hinzu in:

- dem interaktiven `/stats`-Session-Tab;
- der nicht-interaktiven `/stats`-Textantwort.

Sie fügt keinen zweiten Timer hinzu, persistiert kein Timing in den
täglichen/monatlichen Token-Nutzungsdateien, ändert keine Exporte und ändert
nicht das Daemon-/WebShell-Statistikschema.

## Datenfluss

```text
LoggingContentGenerator.loggingStreamWrapper
  -> ApiResponseEvent(ttft_ms)
  -> logApiResponse
  -> UiTelemetryService
  -> SessionMetrics.generation
  -> SessionContext
  -> /stats
```

`ttft_ms` ist optional. Nicht-streamende Antworten und Streams, die ohne
für den Nutzer sichtbaren Inhalt enden, behalten das aktuelle Verhalten und
erzeugen kein Generation-Sample.

## Metriken und Semantik

Für jede erfolgreiche gestreamte Antwort mit TTFT:

- **TTFT** ist die bestehende `ttftMs`-Messung.
- **Generation time** ist `max(0, duration_ms - ttft_ms)`, gemessen vom ersten
  für den Nutzer sichtbaren gestreamten Inhalt bis zum Abschluss.
- **TPS** ist `output_token_count / generation_time_seconds`. Nicht verfügbar,
  wenn die Generation-Zeit null ist.

`SessionMetrics.generation` wird lazy erzeugt und enthält:

- Modell, TTFT, Generation-Zeit und Output-Token-Anzahl des letzten
  abgeschlossenen Requests;
- die Gesamtzahl getimter Requests und deren TTFT sowie Generation-Zeit und
  Output-Tokens der throughput-berechtigten Requests.

Der Session-Durchschnitts-TTFT ist das arithmetische Mittel über die getimten
Requests. Der Session-TPS ist gewichteter Durchsatz: Output-Tokens gesamt
geteilt durch die Generation-Zeit gesamt. Requests mit Generation-Zeit null
fließen in die TTFT-Statistik ein, aber in keine der beiden Seiten der
Session-TPS-Berechnung. Das vermeidet Division durch null und eine
Überbewertung kurzer Requests.

Interne Helper-Prompts sind von den Generation-Metriken ausgeschlossen. Sie
werden nicht im resumable Transkript aufgezeichnet, und ihre Aufnahme würde
Nutzer überraschen und dafür sorgen, dass die Werte von Live- und resumed
Sessions auseinanderlaufen. Main-Conversation- und Subagent-Requests bleiben
enthalten, analog zu den bestehenden Session-Level-Modellstatistiken.

## Kompatibilität

- `ApiResponseEvent.ttft_ms` und `SessionMetrics.generation` sind additiv und
  optional.
- Bestehende aufgezeichnete Events und Aufrufer bleiben gültig.
- Bestehende Tages-/Monatsdatensätze enthalten weiterhin nur Token- und
  API-Dauer-Daten und wahren damit die Ownership-Grenze, die in
  `issue-4479-token-usage-stats-coordination.md` dokumentiert ist.
- Die Clone-/Equality-Logik des Session-Context kopiert und vergleicht das
  optionale Generation-Objekt, damit sich das interaktive Dashboard bei jedem
  abgeschlossenen getimten Request aktualisiert.

## Validierung

- Core-Tests beweisen Aggregation, Ausschluss interner Prompts, Behandlung von
  Generation-Zeit null, Session-Isolation und Reset-Verhalten.
- LoggingContentGenerator-Tests beweisen, dass der erfasste TTFT
  `ApiResponseEvent` erreicht und bei nicht sichtbaren Streams weiterhin fehlt.
- CLI-Tests beweisen nicht-interaktive Ausgabe und interaktives
  Session-Tab-Rendering.
- i18n-Tests decken jede eingebaute Locale für die neuen stark sichtbaren
  Labels ab.
