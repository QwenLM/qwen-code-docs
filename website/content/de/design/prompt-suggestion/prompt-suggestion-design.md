# Design der Prompt-Vorschläge (NES)

> Sagt voraus, was der Benutzer nach Abschluss einer KI-Antwort natürlich als Nächstes eingeben würde, und zeigt dies als Ghost-Text im Eingabeprompt an.
>
> Implementierungsstatus: `prompt-suggestion-implementation.md`. Speculation-Engine: `speculation-design.md`.

## Übersicht

Ein **Prompt-Vorschlag** (Next-step Suggestion / NES) ist eine kurze Vorhersage (2–12 Wörter) der nächsten Benutzereingabe, die nach jeder KI-Antwort durch einen LLM-Aufruf generiert wird. Er wird als Ghost-Text im Eingabeprompt angezeigt. Der Benutzer kann ihn mit Tab/Eingabe/Pfeil rechts akzeptieren oder durch Tippen verwerfen.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Responding → Idle transition                               │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Guard Conditions (11 categories)                    │    │
│  │  settings, interactive, sdk, plan mode, dialogs,    │    │
│  │  elicitation, API error                             │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams available? ───┐               │    │
│  │  │                                  │               │    │
│  │  ▼ YES                         NO ▼                 │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (cache-aware)         (standalone fallback)        │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12 filter rules ──────                        │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (framework-agnostic)            │    │
│  │  300ms delay → show as ghost text                   │    │
│  │                                                     │    │
│  │  Tab    → accept (fill input)                       │    │
│  │  Enter  → accept + submit                           │    │
│  │  Right  → accept (fill input)                       │    │
│  │  Type   → dismiss + abort speculation               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Telemetry (PromptSuggestionEvent)                  │    │
│  │  outcome, accept_method, timing, similarity,        │    │
│  │  keystroke, focus, suppression reason, prompt_id     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Vorschlagsgenerierung

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

| Regel              | Blockiertes Beispiel                               |
| ------------------ | -------------------------------------------------- |
| done               | "done"                                             |
| meta_text          | "nothing found", "no suggestion", "silence"        |
| meta_wrapped       | "(silence)", "[no suggestion]"                     |
| error_message      | "api error: 500"                                   |
| prefixed_label     | "Suggestion: commit"                               |
| too_few_words      | "hmm" (erlaubt aber "yes", "commit", "push" etc.)  |
| too_many_words     | > 12 Wörter                                        |
| too_long           | >= 100 Zeichen                                     |
| multiple_sentences | "Run tests. Then commit."                          |
| has_formatting     | Zeilenumbrüche, Markdown-Fett                      |
| evaluative         | "looks good", "thanks" (mit \b-Wortgrenzen)        |
| ai_voice           | "Let me...", "I'll...", "Here's..."                |

### Guard Conditions

**AppContainer useEffect (13 Checks im Code):**

| Guard                | Check                                               |
| -------------------- | --------------------------------------------------- |
| Settings-Toggle      | `enableFollowupSuggestions`                         |
| Non-interactive      | `config.isInteractive()`                            |
| SDK-Modus            | `!config.getSdkMode()`                              |
| Streaming-Übergang   | `Responding → Idle` (2 Checks)                      |
| API-Fehler (Verlauf) | `historyManager.history[last]?.type !== 'error'`    |
| API-Fehler (ausstehend) | `!pendingGeminiHistoryItems.some(type === 'error')` |
| Bestätigungsdialoge  | shell + general + loop detection (3 Checks)         |
| Berechtigungsdialog  | `isPermissionsDialogOpen`                           |
| Elicitation          | `settingInputRequests.length === 0`                 |
| Plan-Modus           | `ApprovalMode.PLAN`                                 |

**Innerhalb von `generatePromptSuggestion()`:**

| Guard              | Check            |
| ------------------ | ---------------- |
| Frühes Gespräch    | `modelTurns < 2` |

**Separate Feature-Flags (nicht im Guard-Block):**

| Flag                 | Steuert                                                     |
| -------------------- | ----------------------------------------------------------- |
| `enableCacheSharing` | Ob eine Forked Query verwendet wird oder auf generateJson zurückgefallen wird |
| `enableSpeculation`  | Ob die Speculation bei Anzeige des Vorschlags gestartet wird |

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

- `setSuggestion(text)` — verzögerte Anzeige nach 300 ms, null löscht sofort
- `accept(method)` — löscht Zustand, feuert `onAccept` via Microtask, 100-ms-Debounce-Sperre
- `dismiss()` — löscht Zustand, protokolliert `ignored`-Telemetry
- `clear()` — Hard-Reset aller Zustände + Timer
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` verhindert unbeabsichtigte Mutation

## Tastaturinteraktion

| Taste       | CLI                         | WebUI                                |
| ----------- | --------------------------- | ------------------------------------ |
| Tab         | Eingabe füllen (kein Senden)      | Eingabe füllen (kein Senden)               |
| Enter       | Füllen + Senden               | Füllen + Senden (`explicitText`-Parameter) |
| Pfeil rechts | Eingabe füllen (kein Senden)      | Eingabe füllen (kein Senden)               |
| Tippen      | Verwerfen + Speculation abbrechen | Verwerfen                              |
| Einfügen    | Verwerfen + Speculation abbrechen | Verwerfen                              |

### Hinweis zu Tastenbindungen

Der Tab-Handler verwendet explizit `key.name === 'tab'` (nicht den `ACCEPT_SUGGESTION`-Matcher), da `ACCEPT_SUGGESTION` auch Enter matcht, welches zum SUBMIT-Handler durchfallen muss.

## Telemetry

### PromptSuggestionEvent

| Feld                       | Typ                         | Beschreibung                        |
| -------------------------- | --------------------------- | ----------------------------------- |
| outcome                    | accepted/ignored/suppressed | Endergebnis                         |
| prompt_id                  | string                      | Standard: 'user_intent'             |
| accept_method              | tab/enter/right             | Wie der Benutzer akzeptiert hat     |
| time_to_accept_ms          | number                      | Zeit von Anzeige bis Akzeptanz      |
| time_to_ignore_ms          | number                      | Zeit von Anzeige bis Verwerfen      |
| time_to_first_keystroke_ms | number                      | Zeit bis zum ersten Tastendruck während der Anzeige |
| suggestion_length          | number                      | Zeichenanzahl                       |
| similarity                 | number                      | 1.0 für Akzeptanz, 0.0 für Ignorieren |
| was_focused_when_shown     | boolean                     | Terminal hatte Fokus                |
| reason                     | string                      | Bei unterdrückt: Name der Filterregel |

### SpeculationEvent

| Feld                     | Typ                     | Beschreibung              |
| ------------------------ | ----------------------- | ------------------------- |
| outcome                  | accepted/aborted/failed | Speculation-Ergebnis      |
| turns_used               | number                  | API-Roundtrips            |
| files_written            | number                  | Dateien im Overlay        |
| tool_use_count           | number                  | Ausgeführte Tools         |
| duration_ms              | number                  | Echtzeit (Wall-Clock)     |
| boundary_type            | string                  | Was die Speculation gestoppt hat |
| had_pipelined_suggestion | boolean                 | Nächster Vorschlag generiert |

## Feature-Flags und Einstellungen

| Einstellung                 | Typ     | Standard | Beschreibung                                                                     |
| --------------------------- | ------- | -------- | -------------------------------------------------------------------------------- |
| `enableFollowupSuggestions` | boolean | true     | Master-Toggle für Prompt-Vorschläge                                              |
| `enableCacheSharing`        | boolean | true     | Verwendung von Cache-aware Forked Queries                                        |
| `enableSpeculation`         | boolean | false    | Predictive Execution Engine                                                      |
| `fastModel` (Top-Level)     | string  | ""       | Modell für alle Hintergrundaufgaben (leer = Hauptmodell verwenden). Wird über `/model --fast` gesetzt |

### Internes Prompt-ID-Filtering

Hintergrundoperationen verwenden dedizierte Prompt-IDs (`INTERNAL_PROMPT_IDS` in `utils/internalPromptIds.ts`), um zu verhindern, dass ihr API-Traffic und ihre Tool-Aufrufe in der für Benutzer sichtbaren UI erscheinen:

| Prompt-ID           | Verwendet von                |
| ------------------- | ---------------------------- |
| `prompt_suggestion` | Vorschlagsgenerierung        |
| `forked_query`      | Cache-aware Forked Queries   |
| `speculation`       | Speculation-Engine           |

**Angewendetes Filtering:**

- `loggingContentGenerator` — überspringt `logApiRequest` und OpenAI-Interaktions-Logging für interne IDs
- `logApiResponse` / `logApiError` — überspringt `chatRecordingService.recordUiTelemetryEvent`
- `logToolCall` — überspringt `chatRecordingService.recordUiTelemetryEvent`
- `uiTelemetryService.addEvent` — **nicht gefiltert** (stellt sicher, dass `/stats`-Token-Tracking funktioniert)

### Thinking-Modus

Thinking/Reasoning ist für alle Hintergrundpfade explizit deaktiviert (`thinkingConfig: { includeThoughts: false }`):

- **Forked-Query-Pfad** (`createForkedChat`) — überschreibt `thinkingConfig` im geklonten `generationConfig`, deckt sowohl Vorschlagsgenerierung als auch Speculation ab
- **BaseLlm-Fallback-Pfad** (`generateViaBaseLlm`) — Per-Request-Konfiguration überschreibt die Thinking-Einstellungen des Basis-Content-Generators

Dies ist sicher, weil:

- Der Cache-Präfix wird durch systemInstruction + tools + history bestimmt, nicht durch `thinkingConfig` — Cache-Hits bleiben unberührt
- Alle Backends (Gemini, OpenAI-kompatibel, Anthropic) verarbeiten `includeThoughts: false`, indem sie das Thinking-Feld weglassen — keine API-Fehler bei Modellen ohne Thinking-Support
- Vorschlagsgenerierung und Speculation profitieren nicht von Reasoning-Tokens