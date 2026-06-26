# Prompt Suggestion (NES) Design

> Sagt voraus, was der Benutzer nach einer KI-Antwort natürlicherweise als Nächstes eingeben würde, und zeigt dies als Geistertext im Eingabeprompt an.
>
> Implementierungsstatus: `prompt-suggestion-implementation.md`. Spekulationsengine: `speculation-design.md`.

## Überblick

Eine **Prompt Suggestion** (Next-Step Suggestion / NES) ist eine kurze Vorhersage (2–12 Wörter) des nächsten Benutzereingabe, die durch einen LLM-Aufruf nach jeder KI-Antwort generiert wird. Sie erscheint als Geistertext im Eingabefeld. Der Benutzer kann sie mit Tab/Enter/rechtem Pfeil annehmen oder durch Tippen verwerfen.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Übergang Responding → Idle                                 │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Guard-Bedingungen (11 Kategorien)                   │    │
│  │  settings, interactive, sdk, plan mode, dialogs,    │    │
│  │  elicitation, API error                             │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams verfügbar? ────┐               │    │
│  │  │                                  │               │    │
│  │  ▼ JA                          NEIN ▼               │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (cache-bewusst)        (eigenständiger Fallback)   │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12 Filterregeln ────────                      │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (framework-agnostisch)          │    │
│  │  300ms Verzögerung → als Geistertext anzeigen      │    │
│  │                                                     │    │
│  │  Tab    → annehmen (Eingabe füllen)                 │    │
│  │  Enter  → annehmen + absenden                       │    │
│  │  Rechts → annehmen (Eingabe füllen)                 │    │
│  │  Tippen → verwerfen + Spekulation abbrechen        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Telemetrie (PromptSuggestionEvent)                 │    │
│  │  outcome, accept_method, timing, similarity,        │    │
│  │  keystroke, focus, suppression reason, prompt_id     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Suggestion-Generierung

### LLM-Prompt

```
[SUGGESTION MODE: Suggest what the user might naturally type next.]

FIRST: Read the LAST FEW LINES of the assistant's most recent message — that's where
next-step hints, tips, and actionable suggestions usually appear. Then check the user's
recent messages and original request.

Your job is to predict what THEY would type - not what you think they should do.
THE TEST: Would they think "I was just about to type that"?

PRIORITY: If the assistant's last message contains a tip or hint like "Tip: type X to ..."
or "type X to ...", extract X as the suggestion. These are explicit next-step hints.

EXAMPLES:
Assistant says "Tip: type post comments to publish findings" → "post comments"
Assistant says "type /review to start" → "/review"
User asked "fix the bug and run tests", bug is fixed → "run the tests"
After code written → "try it out"
Task complete, obvious follow-up → "commit this" or "push it"

Format: 2-12 words, match the user's style. Or nothing.
Reply with ONLY the suggestion, no quotes or explanation.
```

### Filterregeln (12)

| Regel               | Beispiel blockiert                              |
| ------------------- | ----------------------------------------------- |
| done                | "done"                                          |
| meta_text           | "nothing found", "no suggestion", "silence"     |
| meta_wrapped        | "(silence)", "[no suggestion]"                  |
| error_message       | "api error: 500"                                |
| prefixed_label      | "Suggestion: commit"                            |
| too_few_words       | "hmm" (erlaubt aber "yes", "commit", "push")    |
| too_many_words      | > 12 Wörter                                     |
| too_long            | >= 100 Zeichen                                  |
| multiple_sentences  | "Run tests. Then commit."                       |
| has_formatting      | Zeilenumbrüche, Markdown fett                   |
| evaluative          | "looks good", "thanks" (mit \b Wortgrenzen)      |
| ai_voice            | "Let me...", "I'll...", "Here's..."             |

### Guard-Bedingungen

**AppContainer useEffect (13 Prüfungen im Code):**

| Guard                | Prüfung                                              |
| -------------------- | ---------------------------------------------------- |
| Settings-Toggle      | `enableFollowupSuggestions`                          |
| Nicht-interaktiv     | `config.isInteractive()`                             |
| SDK-Modus            | `!config.getSdkMode()`                               |
| Streaming-Übergang   | `Responding → Idle` (2 Prüfungen)                    |
| API-Fehler (History) | `historyManager.history[last]?.type !== 'error'`     |
| API-Fehler (ausstehend)| `!pendingGeminiHistoryItems.some(type === 'error')`|
| Bestätigungsdialoge  | shell + allgemein + Schleifenerkennung (3 Prüfungen) |
| Berechtigungsdialog  | `isPermissionsDialogOpen`                            |
| Abfrage (Elicitation)| `settingInputRequests.length === 0`                  |
| Plan-Modus           | `ApprovalMode.PLAN`                                  |

**Innerhalb von generatePromptSuggestion():**

| Guard                 | Prüfung           |
| --------------------- | ----------------- |
| Frühes Gespräch       | `modelTurns < 2`  |

**Separate Feature-Flags (nicht im Guard-Block):**

| Flag                 | Steuerung                                                |
| -------------------- | -------------------------------------------------------- |
| `enableCacheSharing` | Ob Forked-Query oder Fallback auf generateJson verwendet wird |
| `enableSpeculation`  | Ob Spekulation beim Anzeigen der Suggestion gestartet wird     |

## Zustandsverwaltung

### FollowupState

```typescript
interface FollowupState {
  suggestion: string | null;
  isVisible: boolean;
  shownAt: number; // timestamp for telemetry
}
```

### FollowupController

Framework-agnostischer Controller, der von CLI (Ink) und WebUI (React) gemeinsam genutzt wird:

- `setSuggestion(text)` — 300ms verzögerte Anzeige, null löscht sofort
- `accept(method)` — löscht den Zustand, löst `onAccept` via Microtask aus, 100ms Debounce-Sperre
- `dismiss()` — löscht den Zustand, protokolliert `ignored` Telemetrie
- `clear()` — hartes Zurücksetzen aller Zustände + Timer
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` verhindert versehentliche Mutationen

## Tastaturinteraktion

| Taste       | CLI                         | WebUI                                |
| ----------- | --------------------------- | ------------------------------------ |
| Tab         | Eingabe füllen (kein Absenden)| Eingabe füllen (kein Absenden)       |
| Enter       | Füllen + Absenden           | Füllen + Absenden (`explicitText`-Parameter) |
| Rechter Pfeil| Eingabe füllen (kein Absenden)| Eingabe füllen (kein Absenden)       |
| Tippen      | Verwerfen + Spekulation abbrechen| Verwerfen                          |
| Einfügen    | Verwerfen + Spekulation abbrechen| Verwerfen                          |

### Tastenzuordnungshinweis

Der Tab-Handler verwendet explizit `key.name === 'tab'` (nicht den `ACCEPT_SUGGESTION`-Matching), da `ACCEPT_SUGGESTION` auch auf Enter passt, das aber zum SUBMIT-Handler durchgereicht werden muss.

## Telemetrie

### PromptSuggestionEvent

| Feld                       | Typ                        | Beschreibung                          |
| -------------------------- | --------------------------- | ------------------------------------- |
| outcome                    | accepted/ignored/suppressed | Endgültiges Ergebnis                  |
| prompt_id                  | string                      | Standard: 'user_intent'               |
| accept_method              | tab/enter/right             | Wie der Benutzer angenommen hat       |
| time_to_accept_ms          | number                      | Zeit von Anzeige bis Annahme          |
| time_to_ignore_ms          | number                      | Zeit von Anzeige bis Verwerfen        |
| time_to_first_keystroke_ms | number                      | Zeit bis zum ersten Tastendruck während Anzeige |
| suggestion_length          | number                      | Zeichenanzahl                         |
| similarity                 | number                      | 1.0 bei Annahme, 0.0 bei Ignorieren   |
| was_focused_when_shown     | boolean                     | Terminal hatte Fokus                  |
| reason                     | string                      | Bei suppressed: Name der Filterregel  |

### SpeculationEvent

| Feld                     | Typ                    | Beschreibung                  |
| ------------------------ | ---------------------- | ---------------------------- |
| outcome                  | accepted/aborted/failed | Ergebnis der Spekulation     |
| turns_used               | number                 | API-Roundtrips                |
| files_written            | number                 | Dateien im Overlay            |
| tool_use_count           | number                 | Ausgeführte Tools             |
| duration_ms              | number                 | Wanduhrzeit                   |
| boundary_type            | string                 | Was die Spekulation gestoppt hat |
| had_pipelined_suggestion | boolean                | Nächste Suggestion generiert? |

## Feature-Flags und Einstellungen

| Einstellung                  | Typ     | Standard | Beschreibung                                                                   |
| ---------------------------- | ------- | -------- | ------------------------------------------------------------------------------ |
| `enableFollowupSuggestions`  | boolean | true     | Hauptschalter für Prompt Suggestions                                           |
| `enableCacheSharing`         | boolean | true     | Cache-bewusste geforkte Abfragen verwenden                                     |
| `enableSpeculation`          | boolean | false    | Predictive Execution Engine                                                    |
| `fastModel` (oberste Ebene)  | string  | ""       | Modell für alle Hintergrundaufgaben (leer = Hauptmodell). Setzen via `/model --fast` |

### Interne Prompt-ID-Filterung

Hintergrundoperationen verwenden dedizierte Prompt-IDs (`INTERNAL_PROMPT_IDS` in `utils/internalPromptIds.ts`), um zu verhindern, dass ihr API-Traffic und ihre Tool-Aufrufe in der benutzersichtbaren UI erscheinen:

| Prompt-ID          | Verwendet von               |
| ------------------ | --------------------------- |
| `prompt_suggestion`| Suggestion-Generierung      |
| `forked_query`     | Cache-bewusste Forked-Queries|
| `speculation`      | Spekulationsengine          |

**Angewandte Filterung:**

- `loggingContentGenerator` — überspringt `logApiRequest` und OpenAI-Interaktionsprotokollierung für interne IDs
- `logApiResponse` / `logApiError` — überspringt `chatRecordingService.recordUiTelemetryEvent`
- `logToolCall` — überspringt `chatRecordingService.recordUiTelemetryEvent`
- `uiTelemetryService.addEvent` — **nicht gefiltert** (stellt `/stats` Token-Tracking sicher)

### Denkmodus

Denken/Reasoning ist explizit deaktiviert (`thinkingConfig: { includeThoughts: false }`) für alle Hintergrundaufgaben-Pfade:

- **Forked-Query-Pfad** (`createForkedChat`) — überschreibt `thinkingConfig` im geklonten `generationConfig`, deckt sowohl Suggestion-Generierung als auch Spekulation ab
- **BaseLlm-Fallback-Pfad** (`generateViaBaseLlm`) — anfragebezogene Konfiguration überschreibt die Denk-Einstellungen des Basis-Content-Generators

Dies ist sicher, weil:

- Das Cache-Präfix durch systemInstruction + Tools + history bestimmt wird, nicht durch `thinkingConfig` — Cache-Treffer bleiben unbeeinflusst
- Alle Backends (Gemini, OpenAI-kompatibel, Anthropic) behandeln `includeThoughts: false` durch Weglassen des Denk-Felds — keine API-Fehler bei Modellen ohne Denkunterstützung
- Suggestion-Generierung und Spekulation profitieren nicht von Reasoning-Tokens