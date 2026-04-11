# Design der Speculation Engine

> Führt den akzeptierten Vorschlag spekulativ aus, bevor der Benutzer ihn bestätigt, und nutzt dabei eine Copy-on-Write-Dateiisolierung. Die Ergebnisse erscheinen sofort, wenn der Benutzer Tab drückt.

## Übersicht

Wenn ein Prompt-Vorschlag angezeigt wird, startet die **Speculation Engine** sofort die Ausführung im Hintergrund, indem sie einen geforkten GeminiChat verwendet. Dateischreibvorgänge werden in ein temporäres Overlay-Verzeichnis umgeleitet. Akzeptiert der Benutzer den Vorschlag, werden die Overlay-Dateien in das echte Dateisystem kopiert und die spekulierte Konversation in den Haupt-Chatverlauf eingefügt. Gibt der Benutzer stattdessen etwas anderes ein, wird die Spekulation abgebrochen und das Overlay bereinigt.

## Architektur

```
User sees suggestion "commit this"
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  startSpeculation()                                          │
│                                                              │
│  ┌─────────────────┐    ┌────────────────────┐               │
│  │ Forked GeminiChat│    │  OverlayFs          │              │
│  │ (cache-shared)   │    │  /tmp/qwen-         │              │
│  │                  │    │   speculation/       │              │
│  │  systemInstruction│   │   {pid}/{id}/        │              │
│  │  + tools          │   │                      │              │
│  │  + history prefix │   │  COW: first write    │              │
│  │                  │    │  copies original     │              │
│  └────────┬─────────┘    └──────────┬───────────┘             │
│           │                         │                         │
│           ▼                         │                         │
│  ┌──────────────────────────────────┴──────────────────────┐  │
│  │  Speculative Loop (max 20 turns, 100 messages)          │  │
│  │                                                         │  │
│  │  Model response                                         │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  speculationToolGate                             │   │  │
│  │  │                                                  │   │  │
│  │  │  Read/Grep/Glob/LS/LSP → allow (+ overlay read) │   │  │
│  │  │  Edit/WriteFile → redirect to overlay            │   │  │
│  │  │    (only in auto-edit/yolo mode)                 │   │  │
│  │  │  Shell → AST check read-only? allow : boundary   │   │  │
│  │  │  WebFetch/WebSearch → boundary                   │   │  │
│  │  │  Agent/Skill/Memory/Ask → boundary               │   │  │
│  │  │  Unknown/MCP → boundary                          │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  Tool execution: toolRegistry.getTool → build → execute │  │
│  │  (bypasses CoreToolScheduler — gated by toolGate)       │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  On completion → generatePipelinedSuggestion()               │
└──────────────────────────────────────────────────────────────┘
           │
           │  User presses Tab / Enter
           ▼
     ┌─── status === 'completed'? ───┐
     │ YES                      NO (boundary) │
     ▼                                ▼
┌─────────────────────────┐  ┌────────────────────────┐
│  acceptSpeculation()    │  │  Discard speculation    │
│                         │  │  abort + cleanup        │
│  1. applyToReal()       │  │  Submit query normally  │
│  2. ensureToolPairing() │  │  (addMessage)           │
│  3. addHistory()        │  └────────────────────────┘
│  4. render tool_group   │
│  5. cleanup overlay     │
│  6. pipelined suggest   │
└─────────────────────────┘
           │
           │  User types instead
           ▼
┌──────────────────────────────────────────────────────────────┐
│  abortSpeculation()                                          │
│                                                              │
│  1. abortController.abort() — cancel LLM call               │
│  2. overlayFs.cleanup() — delete temp directory              │
│  3. Update speculation state (no telemetry on abort)         │
└──────────────────────────────────────────────────────────────┘
```

## Copy-on-Write-Overlay

```
Real CWD: /home/user/project/
Overlay:  /tmp/qwen-speculation/12345/a1b2c3d4/

Write to src/app.ts:
  1. Copy /home/user/project/src/app.ts → overlay/src/app.ts (first time only)
  2. Tool writes to overlay/src/app.ts

Read from src/app.ts:
  - If in writtenFiles → read from overlay/src/app.ts
  - Otherwise → read from /home/user/project/src/app.ts

New file (src/new.ts):
  - Create overlay/src/new.ts directly (no original to copy)

Accept:
  - copyFile(overlay/src/app.ts → /home/user/project/src/app.ts)
  - copyFile(overlay/src/new.ts → /home/user/project/src/new.ts)
  - rm -rf overlay/

Abort:
  - rm -rf overlay/
```

## Tool-Gate-Sicherheit

| Tool                                                       | Action   | Condition                                    |
| ---------------------------------------------------------- | -------- | -------------------------------------------- |
| read_file, grep, glob, ls, lsp                             | allow    | Read paths resolved through overlay          |
| edit, write_file                                           | redirect | Only in auto-edit / yolo approval mode       |
| edit, write_file                                           | boundary | In default / plan approval mode              |
| shell                                                      | allow    | `isShellCommandReadOnlyAST()` returns true   |
| shell                                                      | boundary | Non-read-only commands                       |
| web_fetch, web_search                                      | boundary | Network requests require user consent        |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | boundary | Cannot interact with user during speculation |
| Unknown / MCP tools                                        | boundary | Safe default                                 |

### Pfad-Umschreibung

- **Write-Tools**: `rewritePathArgs()` leitet `file_path` über `overlayFs.redirectWrite()` zum Overlay um
- **Read-Tools**: `resolveReadPaths()` leitet `file_path` über `overlayFs.resolveReadPath()` zum Overlay um, falls zuvor geschrieben
- **Fehler bei Umschreibung**: Wird als Boundary behandelt (z. B. löst ein absoluter Pfad außerhalb des cwd in `redirectWrite` einen Fehler aus)

## Boundary-Handling

Wenn während eines Turns eine Boundary erreicht wird:

1. Bereits ausgeführte Tool-Aufrufe bleiben erhalten (indexbasierte Verfolgung, nicht namensbasiert)
2. Nicht ausgeführte Funktionsaufrufe werden aus der Modell-Nachricht entfernt
3. Teilweise Tool-Antworten werden zum Verlauf hinzugefügt
4. `ensureToolResultPairing()` validiert die Vollständigkeit vor der Injektion

## Pipelined Suggestion

Nach Abschluss der Spekulation (ohne Boundary) generiert ein zweiter LLM-Aufruf den **nächsten** Vorschlag:

```
Context: original conversation + "commit this" + speculated messages
→ LLM predicts: "push it"
→ Stored in state.pipelinedSuggestion
→ On accept: setPromptSuggestion("push it") — appears instantly
```

Dies ermöglicht Tab-Tab-Tab-Workflows, bei denen jede Akzeptanz sofort den nächsten Schritt anzeigt.

Der pipelined Vorschlag verwendet die exportierte `SUGGESTION_PROMPT`-Konstante aus `suggestionGenerator.ts` erneut (keine lokale Kopie), um eine konsistente Qualität mit den ursprünglichen Vorschlägen zu gewährleisten.

## Fast Model

`startSpeculation` akzeptiert einen optionalen `options.model`-Parameter, der durch `runSpeculativeLoop` und `generatePipelinedSuggestion` bis zu `runForkedQuery` durchgereicht wird. Konfiguriert über die `fastModel`-Einstellung auf oberster Ebene (leer = Hauptmodell verwenden). Dasselbe `fastModel` wird für alle Hintergrundaufgaben verwendet: Vorschlagsgenerierung, Spekulation und pipelined Vorschläge. Festlegbar über `/model --fast <name>` oder `settings.json`.

## UI-Rendering

Nach Abschluss der Spekulation rendert `acceptSpeculation` die Ergebnisse über `historyManager.addItem()`:

- **Benutzernachrichten**: werden als `type: 'user'`-Elemente gerendert
- **Modelltext**: wird als `type: 'gemini'`-Elemente gerendert
- **Tool-Aufrufe**: werden als `type: 'tool_group'`-Elemente mit strukturierten `IndividualToolCallDisplay`-Einträgen gerendert (Tool-Name, Argumentbeschreibung, Ergebnistext, Status)

Dies zeigt dem Benutzer die vollständige Spekulationsausgabe einschließlich der Tool-Aufrufdetails, nicht nur reinen Text.

## Forked Query (Cache-Sharing)

### CacheSafeParams

```typescript
interface CacheSafeParams {
  generationConfig: GenerateContentConfig; // systemInstruction + tools
  history: Content[]; // curated, max 40 entries
  model: string;
  version: number; // increments on config changes
}
```

- Wird nach jedem erfolgreichen Haupt-Turn in `GeminiClient.sendMessageStream()` gespeichert
- Wird bei `startChat()` / `resetChat()` gelöscht, um sessionübergreifendes Leakage zu verhindern
- Verlauf auf 40 Einträge gekürzt; `createForkedChat` verwendet flache Kopien (Parameter sind bereits tief kopierte Snapshots)
- Thinking-Modus explizit deaktiviert (`thinkingConfig: { includeThoughts: false }`) — Reasoning-Tokens werden für die Spekulation nicht benötigt und würden Kosten/Latenz verschwenden. Dies hat keine Auswirkungen auf das Cache-Prefix-Matching (wird nur durch systemInstruction + tools + history bestimmt)
- Versionserkennung durch `JSON.stringify`-Vergleich von systemInstruction + tools

### Cache-Mechanismus

DashScope aktiviert Prefix-Caching bereits über:

- `X-DashScope-CacheControl: enable`-Header
- `cache_control: { type: 'ephemeral' }`-Annotationen für Nachrichten und Tools

Der geforkte `GeminiChat` verwendet eine identische `generationConfig` (einschließlich Tools) und dasselbe Verlaufsprefix, sodass der bestehende Cache-Mechanismus von DashScope automatisch Cache-Hits erzeugt.

## Konstanten

| Konstante                | Wert  | Beschreibung                             |
| ------------------------ | ----- | ---------------------------------------- |
| MAX_SPECULATION_TURNS    | 20    | Maximale API-Roundtrips                  |
| MAX_SPECULATION_MESSAGES | 100   | Maximale Nachrichten im spekulierten Verlauf |
| SUGGESTION_DELAY_MS      | 300   | Verzögerung vor der Anzeige des Vorschlags |
| ACCEPT_DEBOUNCE_MS       | 100   | Debounce-Sperre für schnelle Akzeptanzen |
| MAX_HISTORY_FOR_CACHE    | 40    | Im CacheSafeParams gespeicherte Verlaufseinträge |

## Dateistruktur

```
packages/core/src/followup/
├── followupState.ts          # Framework-agnostischer State-Controller
├── suggestionGenerator.ts    # LLM-basierte Vorschlagsgenerierung + 12 Filterregeln
├── forkedQuery.ts            # Cache-bewusste Forked-Query-Infrastruktur
├── overlayFs.ts              # Copy-on-Write-Overlay-Dateisystem
├── speculationToolGate.ts    # Tool-Boundary-Durchsetzung
├── speculation.ts            # Speculation Engine (start/accept/abort)
└── index.ts                  # Modul-Exports
```