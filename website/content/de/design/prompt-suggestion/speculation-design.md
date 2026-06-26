# Design der Speculation-Engine

> Führt den akzeptierten Vorschlag spekulativ aus, bevor der Benutzer bestätigt, unter Verwendung von Copy-on-Write-Dateiisolierung. Ergebnisse erscheinen sofort, wenn der Benutzer die Tabulatortaste drückt.

## Übersicht

Wenn ein Prompt-Vorschlag angezeigt wird, beginnt die **Speculation-Engine** sofort mit der Ausführung im Hintergrund, unter Verwendung eines abgezweigten GeminiChat. Dateischreibvorgänge erfolgen in ein temporäres Overlay-Verzeichnis. Wenn der Benutzer den Vorschlag akzeptiert, werden die Overlay-Dateien in das reale Dateisystem kopiert und die spekulierte Unterhaltung in den Haupt-Chat-Verlauf eingefügt. Wenn der Benutzer etwas anderes eingibt, wird die Spekulation abgebrochen und das Overlay bereinigt.

## Architektur

```
Benutzer sieht Vorschlag "commit this"
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  startSpeculation()                                          │
│                                                              │
│  ┌─────────────────┐    ┌────────────────────┐               │
│  │ Abgezweigter     │    │  OverlayFs          │              │
│  │ GeminiChat       │    │  /tmp/qwen-         │              │
│  │ (Cache-geteilt)  │    │   speculation/       │              │
│  │                  │    │   {pid}/{id}/        │              │
│  │  systemInstruction│   │                      │              │
│  │  + tools          │   │  COW: erste Kopie    │              │
│  │  + history prefix │   │  vom Original        │              │
│  │                  │    │                      │              │
│  └────────┬─────────┘    └──────────┬───────────┘             │
│           │                         │                         │
│           ▼                         │                         │
│  ┌──────────────────────────────────┴──────────────────────┐  │
│  │  Spekulationsschleife (max 20 Runden, 100 Nachrichten)  │  │
│  │                                                         │  │
│  │  Modellantwort                                           │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  speculationToolGate                             │   │  │
│  │  │                                                  │   │  │
│  │  │  Read/Grep/Glob/LS/LSP → erlauben (+ Overlay-Lesen)│ │  │
│  │  │  Edit/WriteFile → zum Overlay umleiten            │   │  │
│  │  │    (nur im Auto-Edit/Yolo-Modus)                 │   │  │
│  │  │  Shell → AST-Prüfung nur-Lesen? erlauben : Boundary │  │
│  │  │  WebFetch/WebSearch → Boundary                   │   │  │
│  │  │  Agent/Skill/Memory/Ask → Boundary               │   │  │
│  │  │  Unbekannt/MCP → Boundary                         │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  Tool-Ausführung: toolRegistry.getTool → build → execute │ │
│  │  (umgeht CoreToolScheduler — durch toolGate gesteuert)   │  │
│  │                                                         │  │
│  │  Bei Abschluss → generatePipelinedSuggestion()          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  Bei Abschluss → generatePipelinedSuggestion()               │
└──────────────────────────────────────────────────────────────┘
           │
           │  Benutzer drückt Tab / Enter
           ▼
     ┌─── status === 'completed'? ───┐
     │ JA                      NEIN (Boundary) │
     ▼                                ▼
┌─────────────────────────┐  ┌────────────────────────┐
│  acceptSpeculation()    │  │  Spekulation verwerfen  │
│                         │  │  abort + cleanup        │
│  1. applyToReal()       │  │  Abfrage normal senden  │
│  2. ensureToolPairing() │  │  (addMessage)           │
│  3. addHistory()        │  └────────────────────────┘
│  4. render tool_group   │
│  5. cleanup overlay     │
│  6. pipelined suggest   │
└─────────────────────────┘
           │
           │  Benutzer tippt stattdessen
           ▼
┌──────────────────────────────────────────────────────────────┐
│  abortSpeculation()                                          │
│                                                              │
│  1. abortController.abort() — LLM-Aufruf abbrechen         │
│  2. overlayFs.cleanup() — temporäres Verzeichnis löschen    │
│  3. Spekulationsstatus aktualisieren (keine Telemetrie bei Abbruch) │
└──────────────────────────────────────────────────────────────┘
```

## Copy-on-Write-Overlay

```
Reales CWD: /home/user/project/
Overlay:    /tmp/qwen-speculation/12345/a1b2c3d4/

Schreiben in src/app.ts:
  1. Kopiere /home/user/project/src/app.ts → overlay/src/app.ts (nur beim ersten Mal)
  2. Tool schreibt in overlay/src/app.ts

Lesen von src/app.ts:
  - Wenn in writtenFiles → lese von overlay/src/app.ts
  - Sonst → lese von /home/user/project/src/app.ts

Neue Datei (src/new.ts):
  - Erstelle overlay/src/new.ts direkt (kein Original zum Kopieren)

Akzeptieren:
  - copyFile(overlay/src/app.ts → /home/user/project/src/app.ts)
  - copyFile(overlay/src/new.ts → /home/user/project/src/new.ts)
  - rm -rf overlay/

Abbrechen:
  - rm -rf overlay/
```

## Tool-Gate-Sicherheit

| Tool                                                       | Aktion    | Bedingung                                    |
| ---------------------------------------------------------- | --------- | -------------------------------------------- |
| read_file, grep, glob, ls, lsp                             | erlauben  | Lese-Pfade werden durch Overlay aufgelöst    |
| edit, write_file                                           | umleiten  | Nur im Auto-Edit-/Yolo-Zustimmungsmodus      |
| edit, write_file                                           | Boundary  | Im Standard-/Plan-Zustimmungsmodus           |
| shell                                                      | erlauben  | `isShellCommandReadOnlyAST()` gibt true zurück |
| shell                                                      | Boundary  | Nicht-schreibgeschützte Befehle              |
| web_fetch, web_search                                      | Boundary  | Netzwerkaufrufe erfordern Benutzerzustimmung |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | Boundary  | Kann während der Spekulation nicht mit Benutzer interagieren |
| Unknown / MCP tools                                        | Boundary  | Sicheres Standardverhalten                   |

### Pfad-Umschreibung

- **Schreibwerkzeuge**: `rewritePathArgs()` leitet `file_path` über `overlayFs.redirectWrite()` zum Overlay um
- **Lesewerkzeuge**: `resolveReadPaths()` leitet `file_path` über `overlayFs.resolveReadPath()` zum Overlay um, falls zuvor geschrieben
- **Fehlschlag der Umschreibung**: Wird als Boundary behandelt (z.B. absoluter Pfad außerhalb des CWD löst in `redirectWrite` einen Fehler aus)

## Boundary-Handling

Wenn mitten in einer Runde ein Boundary erreicht wird:

1. Bereits ausgeführte Tool-Aufrufe werden beibehalten (indexbasiertes Tracking, nicht namensbasiert)
2. Nicht ausgeführte Funktionsaufrufe werden aus der Modellnachricht entfernt
3. Partielle Tool-Antworten werden zum Verlauf hinzugefügt
4. `ensureToolResultPairing()` validiert die Vollständigkeit vor dem Einfügen

## Pipelined Suggestion

Nach Abschluss der Spekulation (ohne Boundary) generiert ein zweiter LLM-Aufruf den **nächsten** Vorschlag:

```
Kontext: ursprüngliche Unterhaltung + "commit this" + spekulierte Nachrichten
→ LLM sagt vorher: "push it"
→ Gespeichert in state.pipelinedSuggestion
→ Bei Annahme: setPromptSuggestion("push it") — erscheint sofort
```

Dies ermöglicht Tab-Tab-Tab-Workflows, bei denen jede Annahme sofort den nächsten Schritt anzeigt.

Der pipelined Vorschlag verwendet die exportierte Konstante `SUGGESTION_PROMPT` aus `suggestionGenerator.ts` (keine lokale Kopie), um eine gleichbleibende Qualität wie bei anfänglichen Vorschlägen sicherzustellen.

## Fast Model

`startSpeculation` akzeptiert einen optionalen Parameter `options.model`, der durch `runSpeculativeLoop` und `generatePipelinedSuggestion` an `runForkedQuery` weitergereicht wird. Konfiguriert über die `fastModel`-Einstellung auf oberster Ebene (leer = Hauptmodell verwenden). Dasselbe `fastModel` wird für alle Hintergrundaufgaben verwendet: Vorschlagsgenerierung, Spekulation und pipelined Vorschläge. Setzen über `/model --fast <name>` oder `settings.json`.

## UI-Rendering

Wenn die Spekulation abgeschlossen ist, rendert `acceptSpeculation` die Ergebnisse über `historyManager.addItem()`:

- **Benutzernachrichten**: gerendert als `type: 'user'`-Elemente
- **Modelltext**: gerendert als `type: 'gemini'`-Elemente
- **Tool-Aufrufe**: gerendert als `type: 'tool_group'`-Elemente mit strukturierten `IndividualToolCallDisplay`-Einträgen (Werkzeugname, Argumentbeschreibung, Ergebnistext, Status)

Dies zeigt dem Benutzer die vollständige Spekulationsausgabe einschließlich Details zu Tool-Aufrufen, nicht nur reinen Text.

## Abgezweigte Abfrage (Cache-Sharing)

### CacheSafeParams

```typescript
interface CacheSafeParams {
  generationConfig: GenerateContentConfig; // systemInstruction + tools
  history: Content[]; // curated, max 40 entries
  model: string;
  version: number; // increments on config changes
}
```

- Gespeichert nach jedem erfolgreichen Hauptdurchlauf in `GeminiClient.sendMessageStream()`
- Gelöscht bei `startChat()` / `resetChat()`, um sessionübergreifende Lecks zu verhindern
- Verlauf auf 40 Einträge gekürzt; `createForkedChat` verwendet flache Kopien (Parameter sind bereits tiefgeklonte Snaphots)
- Denkmodus explizit deaktiviert (`thinkingConfig: { includeThoughts: false }`) — Reasoning-Token werden für die Spekulation nicht benötigt und würden Kosten/Latenz verschwenden. Dies beeinträchtigt nicht den Cache-Präfix-Abgleich (bestimmt nur durch systemInstruction + tools + history)
- Versionserkennung durch `JSON.stringify`-Vergleich von systemInstruction + tools

### Cache-Mechanismus

DashScope ermöglicht bereits Prefix-Caching über:

- `X-DashScope-CacheControl: enable`-Header
- `cache_control: { type: 'ephemeral' }`-Annotationen auf Nachrichten und Tools

Der abgezweigte `GeminiChat` verwendet identische `generationConfig` (einschließlich Tools) und denselben Verlaufspräfix, sodass DashScopes bestehender Cache-Mechanismus automatisch Cache-Treffer erzeugt.

## Konstanten

| Konstante                 | Wert | Beschreibung                              |
| ------------------------- | ---- | ----------------------------------------- |
| MAX_SPECULATION_TURNS     | 20   | Maximale API-Roundtrips                  |
| MAX_SPECULATION_MESSAGES  | 100  | Maximale Nachrichten im spekulierten Verlauf |
| SUGGESTION_DELAY_MS       | 300  | Verzögerung vor Anzeige des Vorschlags    |
| ACCEPT_DEBOUNCE_MS        | 100  | Entprell-Sperre für schnelle Annahmen     |
| MAX_HISTORY_FOR_CACHE     | 40   | Im CacheSafeParams gespeicherte Verlaufseinträge |

## Dateistruktur

```
packages/core/src/followup/
├── followupState.ts          # Framework-unabhängiger Zustandscontroller
├── suggestionGenerator.ts    # LLM-basierte Vorschlagsgenerierung + 12 Filterregeln
├── forkedQuery.ts            # Cache-bewusste Infrastruktur für abgezweigte Abfragen
├── overlayFs.ts              # Copy-on-Write-Overlay-Dateisystem
├── speculationToolGate.ts    # Tool-Grenzdurchsetzung
├── speculation.ts            # Speculation-Engine (start/accept/abort)
└── index.ts                  # Modul-Exporte
```