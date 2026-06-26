# Qwen Code Agent Loop RT – Technisches Optimierungskonzept

## 1. Hintergrund und Problemdefinition

### 1.1 Aktueller Stand

Das Agent Loop von Qwen Code verwendet ein strikt serielles Modell:

```
User Prompt → [LLM-Entscheidung] → Tool-Ausführung → [LLM-Entscheidung] → Tool-Ausführung → ... → [LLM-Antwort] → Idle
               ~3-4s                ~Xms-Ns            ~3-4s                ~Xms-Ns              ~3-4s
```

Jeder LLM-Aufruf (inkl. Netzwerk-RTT + Modell-Inferenz) dauert ca. 3–4s und ist der Hauptkostenfaktor für die End-to-End-Reaktionszeit (RT).

### 1.2 Messdaten

Testszenario: „Welche Arbeitsbereiche habe ich?" (3 Agent-Loop-Runden, 2 Tool-Aufrufe, einmalige Messung)

| Phase                            | Dauer     | Anteil |
| -------------------------------- | --------- | ------ |
| LLM Runde 1 (Entscheidung Skill) | 3,8s      | 28%    |
| Skill-Ausführung                 | 1ms       | <1%    |
| LLM Runde 2 (Entscheidung Shell) | 3,0s      | 22%    |
| Shell-Ausführung                 | 2,5s      | 19%    |
| LLM Runde 3 (Textzusammenfassung)| 3,8s      | 28%    |
| Framework-Overhead (Zustandssync, Rendering) | 0,3s | 3%  |
| **Gesamt**                       | **13,4s** | 100%   |

**Schlussfolgerung**: LLM-Aufrufe machen 78% aus, Tool-Ausführung 19%, Framework 3%. Die Optimierung muss sich auf **Reduzierung der LLM-Aufrufe** und **Senkung der Latenz pro LLM-Aufruf** konzentrieren.

> Hinweis: Einmalige Messung, einzelnes Szenario. Die 19% Tool-Ausführung werden durch langsame Shell-Aufrufe dominiert; in read-lastigen Szenarien kann die Tool-Ausführung auf <5% sinken. Vor der Umsetzung des Konzepts müssen Baselines für ≥3 Szenarien (Schreiboperationen, toolübergreifende Argumentation, Fehlerbehebung) erhoben werden.

### 1.3 Wichtige Einschränkungen der aktuellen Architektur

| Einschränkung                      | Code-Stelle                                                                                    | Beschreibung                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tool-Ergebnisse ohne Nachsteuerung| `tools.ts` `ToolResult`-Interface (L422)                                                       | Nur `llmContent`/`returnDisplay`/`error`, keine Möglichkeit, „LLM überspringen" auszudrücken |
| Ergebnisse werden bedingungslos an LLM zurückgegeben | `useGeminiStream.ts` `handleCompletedTools` (L2038) → `submitQuery(ToolResult, …)` (L2355)     | Alle gemini-initiierten Tool-Ergebnisse werden zurückgespielt                         |
| Scheduling erst nach Stream-Ende  | `useGeminiStream.ts` `processGeminiStreamEvents` (L1365)                                       | `scheduleToolCalls` wird erst nach Ende der Stream-Schleife aufgerufen, kein inkrementelles Scheduling |
| Keine Strategieebene für Modellauswahl | `client.ts` `modelOverride ?? getModel()` (L1305, L1598)                                     | Infrastruktur ist bis zu `turn.run(model, …)` (L1707) durchgängig, aber der Aufrufer verwendet sie nur, wenn das Skill explizit ein Modell angibt |

### 1.4 Bereits vorhandene Infrastruktur (wird in diesem Konzept intensiv genutzt)

| Fähigkeit                                      | Ort                                                          | Status                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `fastModel`-Konfiguration + `/model --fast <id>` | `config.ts:684`, `1987`, `2021`                              | Vorhanden                                                              |
| `SendMessageOptions.modelOverride`              | `client.ts:142` → `1598` → `turn.run`                        | End-to-End bis zu `geminiChat.sendMessageStream(model, …)` durchgängig |
| Hook-Ebene `modelOverrideRef` (trägt Skill-Modellauswahl) | `useGeminiStream.ts:376`, `2225`, `1841`                    | Durchgängig                                                            |
| Fast-Model **Nicht-Streaming** Side-Query-Präzedenzfall | `services/toolUseSummary.ts:108` (via `runSideQuery`)       | Produktiv, beweist funktionierende Fast-Modell-Konfiguration; aber **Nicht-Streaming-Pfad** |
| Fast-Model **Streaming** Präzedenzfall          | `followup/speculation.ts:224`                                | Produktiv, aber **nutzt Forked Chat** (`createForkedChat`), isoliert vom Hauptchat |

**Kritische Lücke**: **Kein Produktivcode** führt Streaming mit Fast-Modell im Hauptchat durch. Dieses Konzept (D2) ist der erste Anwendungsfall; vorher muss ein Validierungsexperiment durchgeführt werden (siehe §3.2 Vorbedingungen).

---

## 2. Entwurfsprinzipien

1. **Allgemeingültigkeit**: Das Konzept ist nicht an ein bestimmtes Tool/Skill gebunden.
2. **Rückwärtskompatibilität**: Vorhandene Tools funktionieren ohne Änderungen weiter.
3. **Inkrementell + explizite Signale**: Die Strategie ist standardmäßig konservativ; Tool-Autoren können durch explizite Felder für Optimierungen optieren.
4. **Rückrollbarkeit**: Alle Optimierungen werden über Feature-Flags gesteuert; Benutzer können sie auf individueller Ebene erzwingend deaktivieren.
5. **Ehrliche Abwägungen**: Qualitätsrisiken, Kostenrisiken und Anwendungsgrenzen werden explizit ausgewiesen.

---

## 3. Optimierungskonzept

### 3.1 Richtung Eins: Post-Execution-Direktive für Tool-Ergebnisse (ToolResult Post-Execution Directive)

#### Problem

Das aktuelle `ToolResult` enthält keine Informationen darüber, „was als nächstes zu tun ist". Unabhängig davon, ob ein Tool-Ergebnis selbsterklärend ist, wird bedingungslos eine LLM-Runde ausgelöst.

#### Entwurf

Erweiterung des `ToolResult`-Interface (`packages/core/src/tools/tools.ts` L422):

```typescript
export interface ToolResult {
  llmContent: PartListUnion;
  returnDisplay: ToolResultDisplay;
  error?: { message: string; type?: ToolErrorType };

  // Neu: Post-Execution-Direktive
  postExecution?: {
    /**
     * Das Tool-Ergebnis wird nicht an das LLM zurückgegeben, sondern direkt
     * als endgültige Antwort an den Benutzer angezeigt.
     * Geeignet für Szenarien, in denen das Ergebnis vollständig in sich geschlossen ist
     * und keine erneute Interpretation durch das Modell erfordert.
     * Ist eine lokale Eigenschaft des ToolResult.
     */
    skipLlmRound?: boolean;

    /**
     * Das Tool-Ergebnis ist „in sich geschlossen und direkt dem Benutzer anzeigbar"
     * – d. h., `returnDisplay` ist bereits die endgültige Form, die der Benutzer erwartet,
     * und muss nicht vom Modell nachbearbeitet werden.
     * Ist eine lokale Eigenschaft des ToolResult und **sagt nicht** voraus,
     * „ob die nächste Runde eine Zusammenfassung ist".
     * Wirkt zusammen mit Richtung Drei (Präsentationsentkopplung):
     * true → Übergang in den Zustand „Summarizing" erlaubt Benutzereingabe.
     */
    resultIsTerminal?: boolean;
  };
}
```

> **Entwurfskorrektur**: Eine frühere Version hatte das einzelne Feld `selfExplanatory` für zwei Aufgaben gleichzeitig verwendet: als „Eigenschaft des Tool-Outputs" und als „Vorhersagesignal für den Gesprächsfluss". Beide Aufgaben sind jedoch nicht deckungsgleich (Beispiel: User-Prompt ist „Lies X und repariere dann Y", die read_file-Ausgabe ist in sich geschlossen, aber die nächste Runde ist offensichtlich keine Zusammenfassung). **Vorhersagesignale sind globale Eigenschaften des Gesprächsflusses** und sollten nicht über Tool-Felder ausgedrückt werden – D2 verwendet stattdessen vollständig Heuristiken auf Gesprächsflussebene (siehe §3.2).

#### Verhaltensänderung

In `handleCompletedTools` wird eine neue Prüfung eingefügt:

```
Tool-Batch abgeschlossen
  → Prüfe `postExecution.skipLlmRound` für alle Tools im Batch
  → Alle true?
    → JA: markToolsAsSubmitted, kein submitQuery, direkt Idle
    → NEIN: aktuelles Verhalten beibehalten (submitQuery)
```

**Wichtige Einschränkung**: `skipLlmRound` wirkt nur, wenn **alle Tools im aktuellen Batch** `skip` deklarieren. Bei gemischten Batches wird weiterhin zurückgespielt.

#### Historische Invarianten

Nach dem Überspringen des LLM hat der Verlauf die Form: `user → function_call → function_response → <kein assistant>`.

- Überprüfung, ob `repairOrphanedToolUseTurnsInHistory` (wird beim Session-Laden aufgerufen) diese Form toleriert.
- Überprüfung des Verhaltens der Auto-Kompaktierung bei fehlendem Assistant-Text.
- PR #4176 hat gerade die tool_use↔tool_result-Invariante geschlossen; vor der Auslieferung müssen Unit-Tests die Alternation „nach dem Überspringen nächste User-Nachricht" abdecken.
- API-Stile: Qwen / OpenAI tolerieren; Anthropic erfordert strikte Alternation – falls später eine direkte Anthropic-Anbindung unterstützt wird, ist ein Fallback erforderlich (Einspritzen eines leeren Assistant-Texts in den Verlauf).

> **Einheitlicher Korrekturpunkt**: Sowohl diese Stelle als auch §3.3 (D3 – vorzeitiges Abbrechen von Summarizing) verletzen **dieselbe historische Invariante**. Die Lösung ist eine von zwei Optionen (leeren Assistant einspritzen / Qwen-Toleranz akzeptieren); beide Richtungen müssen dieselbe Wahl treffen.

#### Signalökosystem (Phase 2-Arbeit)

| Tool                                 | `skipLlmRound`        | `resultIsTerminal` | Anmerkung                                                          |
| ------------------------------------ | --------------------- | ------------------ | ------------------------------------------------------------------ |
| `read_file`                          | in Query-Only-Szenarien | true               | Dateiinhalt ist die Antwort                                        |
| `cat` (via Shell)                    | je nach Szenario      | true               | wie read_file                                                      |
| `grep` / `glob` / `ls`               | false                 | **false (Standard)** | Ergebnisse erfordern oft Modellauswahl/Sortierung/Zusammenfassung; Skill-Ebene setzt explizit true in bekannten „reinen Query"-Szenarien |
| `git status` / `git log` (via Shell) | false                 | true               | Ausgabe bereits formatiert                                         |
| Skill-Tools                          | je nach Skill         | je nach Skill      | Query-ähnliche Skills tendenziell true                             |
| MCP-Tools                            | Standard false        | Standard false     | Explizites Opt-In über Allowlist                                   |

Drittanbieter-/MCP-Tools sind nicht vertrauenswürdig, standardmäßig keine Markierung; Aktivierung über `config.toolPostExecAllowlist`.

> `grep/glob/ls` haben standardmäßig false als konservative Wahl: Fehlentscheidungen in Szenarien, die eine Modellzusammenfassung/Sortierung erfordern, werden vermieden.

#### Geeignet und ungeeignet

- **Geeignet**: Terminal-Abfragen (read/cat/print-Typ), in sich geschlossene Ergebnisse (Skill hat bereits formatierte Ausgabe)
- **Ungeeignet**: Zwischenschritte in mehrstufigen Aufgaben, Bestätigung von Schreibvorgängen, komplexe Logs, die interpretiert werden müssen

#### Risiken und Gegenmaßnahmen

| Risiko                                                              | Schwere | Gegenmaßnahme                                                    |
| ------------------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| Tool setzt `skipLlmRound` fälschlich → mehrstufige Aufgabe unterbrochen | Mittel  | Batch-Level-Semantik + `llmContent` bleibt im Verlauf, wiederherstellbar |
| Missbrauch durch Drittanbieter-Tools                                | Mittel  | MCP standardmäßig deaktiviert, Allowlist explizit aktivieren     |
| Verletzung historischer Invarianten                                 | Mittel  | Vor Auslieferung Unit-Tests ergänzen; Session-Load-Wiederholung abdecken |
| Erwartung des Benutzers inkonsistent (erwartet Zusammenfassung, erhält keine) | Niedrig | Einstellung `alwaysSummarize: true` kann überschreiben           |

#### Nutzen

Terminal-Abfrageszenarien sparen 3–4s (Überspringen der letzten LLM-Runde).

---

### 3.2 Richtung Zwei: Fast-Modell-Routing-Strategie für Zusammenfassung (Summary Round)

#### Positionierung

**Diese Richtung führt keine neue Pipeline ein, erfordert jedoch eine Erweiterung des `GeminiChat`-Interface, um einen Modellwechsel zur Laufzeit zu ermöglichen**.

Die Infrastruktur aus §1.4 bietet die Fast-Modell-Konfiguration und den End-to-End-Durchgriff von `modelOverride`, aber **es gibt keinen Präzedenzfall für Fast-Modell + Streaming im Hauptchat**. Erforderlich:

- Entscheidungsfunktion: Wann `config.getFastModel()` als Override weitergegeben wird
- Sicherer Fallback: Neues Interface `GeminiChat.retryStreamWithModel` (behandelt den internen Zustand des Chats)
- Experimentelle Validierung: Wechsel zwischen Fast/Primary im Hauptchat beschädigt weder Kompaktierung noch History-Aufzeichnung

#### Anwendungsbereich

D2 wirkt nur auf:

- **useGeminiStream** (TUI-Hauptpfad) – `sendMessageStream`-Aufrufstelle L1841
- **ACP Session** (IDE-Integrationspfad) – `acp-integration/session/Session.ts:1182`, Umbau in Phase 3 synchron

D2 **wirkt nicht** auf die folgenden Pfade, um zusätzliche Fehlermodi in nicht-interaktiven oder isolierten Kontexten zu vermeiden:

- **Subagent Laufzeit** (`agents/runtime/agent-core.ts:614`): Sub-Agent hat bereits eigene Modellkonfiguration
- **Cron-getriggerter Turn** (`SendMessageType.Cron`, client.ts:127): Nicht interaktiv, keine RT-Dringlichkeit
- **Notification-Turn** (`SendMessageType.Notification`, client.ts:129): Gleicher Grund

#### Hauptschwierigkeit

Zum Zeitpunkt des `submitQuery`-Aufrufs **wissen wir nicht**, ob das Modell nach dem Betrachten der Ergebnisse ein neues Tool aufruft oder einfach nur Text ausgibt. Wenn wir das Fast-Modell verwenden, das Modell aber tatsächlich ein Tool aufrufen müsste – die Konsequenz ist **stumm**: Das Fast-Modell könnte das falsche Tool oder die falschen Parameter wählen, und der Fehler würde kein klares Signal erzeugen.

**Kein Feld auf Tool-Ebene kann zuverlässig vorhersagen**, „ob die nächste Runde eine Zusammenfassung ist", da dies vom Gesprächsfluss (User-Prompt + kumulativer Kontext) abhängt, nicht von einer lokalen Eigenschaft des Tool-Outputs. Beispiel:

```
Benutzer: „Lies utils.ts und ändere dann alle console.log in logger.info"
  → Tool 1: read_file → Ergebnis in sich geschlossen
  → Aber die nächste Runde ist offensichtlich keine Zusammenfassung
```

Daher verwendet D2 ausschließlich **Heuristiken auf Gesprächsflussebene** zur Vorhersage und verlässt sich nicht auf Tool-Felder.

#### Entscheidungsfunktion: Gesprächsfluss-Heuristik + Vetos

```typescript
import { Kind, MUTATOR_KINDS } from '../tools/tools.js';

function selectContinuationTier(
  turn: Turn,
  userPrompt: string,
  batch: ToolCall[],
): 'fast' | 'primary' {
  // ===== Benutzerebene erzwingender Schalter (höchste Priorität) =====
  const userPref = config.getSummaryTierStrategy();
  if (userPref === 'always_primary') return 'primary';
  if (userPref === 'always_fast') return 'fast'; // unterliegt noch Laufzeit-Sicherungen

  // ===== Veto durch Benutzerabsicht =====
  // 1. User-Prompt enthält Aktionsverben → nächste Runde wahrscheinlich wieder Tool-Aufruf
  if (requestImpliesFurtherAction(userPrompt)) return 'primary';

  // 2. Aktueller Batch enthält Mutator-Tool → wahrscheinlich Lesen/Überprüfen als nächstes
  if (batch.some((c) => MUTATOR_KINDS.includes(c.tool.kind))) return 'primary';

  // 3. Aktuelle Runde oder Verlauf enthält ungelösten Fehler → Modell benötigt Primary für Diagnose
  if (hasUnresolvedError(turn.toolResults, batch)) return 'primary';

  // ===== Veto durch Ausgabekomplexität =====
  // 4. User-Prompt erfordert tiefgehende Analyse (erklären/vergleichen/warum-Fragen)
  if (needsDeepReasoning(userPrompt)) return 'primary';

  // 5. Tool-Aufrufe verwenden ≥3 verschiedene Tools → zusammenfassende Erzählung über Ergebnisse hinweg benötigt Primary
  if (needsCrossResultReasoning(turn)) return 'primary';

  // 6. Tool-Ausgabe zu lang → lange Zusammenfassung benötigt Primary
  if (estimateTotalToolOutputTokens(turn) > 4000) return 'primary';

  // ===== Veto durch Modell-Machbarkeit =====
  // 7. Fast-Modell hat zu kleines Kontextfenster → Wechsel zu Fast würde Kompaktierung auslösen
  //    (Kompaktierung selbst erfordert einen LLM-Aufruf, was die RT und Kosten verschlechtert)
  if (wouldTriggerCompression(turn.history, config.getFastModel()))
    return 'primary';

  // ===== Mehrsprachen-Fallback =====
  if (!isPromptLanguageSupported(userPrompt)) return 'primary';

  // ===== Session-Zustands-Fallback =====
  if (turn.justCompacted || turn.justCleared) return 'primary';

  return 'fast';
}
```

Bedeutung der acht Vetos:

- **`requestImpliesFurtherAction`**: Aktionsverben (`ändern|löschen|hinzufügen|ersetzen|reparieren|implementieren|neu erstellen|erstellen|fix|change|add|remove|implement|write|update`) → mehrstufige Aufgabe
- **`MUTATOR_KINDS` Treffer**: Aktuelle Runde hat bereits geschrieben → wahrscheinlich direkt ein Lese-/Überprüfungsschritt. **Wiederverwendung des vorhandenen `MUTATOR_KINDS = [Edit, Delete, Move, Execute]` aus `tools.ts:806`** (die `kind: Kind`-Eigenschaft jedes Tool-Instanz ist die maßgebliche Klassifikation, kein Neu-Erfinden von `isWriteTool`)
- **`hasUnresolvedError(turnResults, currentBatch)`**: Zweistufige Beurteilung –  
  - **Aktueller Batch mit Fehler → immer ungelöst** (geht nicht davon aus, dass parallele Batches sich selbst korrigieren können)
  - **Verlauf nach `(toolName, args fingerprint)` deduplizieren, letzter noch Fehler → als ungelöst betrachten** (nur nach toolName würde bei gleichem Namen mit unterschiedlichen Parametern falsch liegen)
  - Shell etc. müssen `ToolResult.error` korrekt setzen (Abhängigkeit von vorgelagerter Datenqualität)
- **`needsDeepReasoning`**: Enthält Schlüsselwörter wie „analysieren/erklären/warum/vergleichen/diagnostizieren"
- **`needsCrossResultReasoning`**: Unterschiedliche Tool-Aufrufe ≥3 (gleiches Tool mit gleichen Parametern zählt als einer)
- **Ausgabetokens > 4000**: Empirischer Schwellenwert, **muss nach Baseline-Messung mit Fast-Modell angepasst werden**
- **`wouldTriggerCompression`**: Fast-Modell hat meist kleineres Kontextfenster als Primary; derselbe Verlauf löst bei Fast früher `tryCompress` aus (geminiChat.ts:1418) – Kompaktierung selbst benötigt einen LLM-Aufruf, kann **RT und Kosten sogar verschlechtern**. Budgetschätzung: `estimateHistoryTokens(history) > fastModelContextWindow × COMPACTION_THRESHOLD` wird als Auslöser betrachtet
- **Nicht unterstützte Sprache**: Nur englische/chinesische Schlüsselwörter werden erkannt; andere Sprachen (Japanisch, Koreanisch etc.) standardmäßig Primary
- **Session-Zustandsänderung**: Erste Kontinuation nach `/compact` oder `/clear` → Primary zum Wiederaufbau des mentalen Modells

Die Vetos tendieren **eher zu Primary** (lieber 2s mehr als Qualitätseinbußen).

#### Wichtige Implementierung: `GeminiChat.retryStreamWithModel`

**Problem**: Direktes Abbrechen + Aufruf von `client.sendMessageStream` würde den Chat-Zustand beschädigen:

1. `geminiChat.ts:1428` schiebt beim Start des Streams `userContent` in den Verlauf; ein Neustart würde **ein zweites Mal pushen**, was zu doppelten `function_response` im Verlauf führt
2. `sendPromise`-Lock (`geminiChat.ts:1392, 1398`) – nach dem Abbrechen muss sichergestellt werden, dass `streamDoneResolver` aufgerufen wird
3. `pendingPartialState` und andere durch PR #4176 eingeführte Invarianten-Marker müssen korrekt bereinigt werden
4. Das Model-Attribut des Telemetrie-Spans muss aktualisiert werden

**Neues Interface** (`packages/core/src/core/geminiChat.ts`):

```typescript
/**
 * Wiederholt einen in Bearbeitung befindlichen oder gerade abgebrochenen
 * Streaming-Send mit einem anderen Modell.
 * Schiebt userContent NICHT erneut (bleibt vom ursprünglichen Send erhalten).
 * Setzt pendingPartialState zurück; gibt veralteten sendPromise frei; eröffnet neuen Span.
 */
async retryStreamWithModel(
  model: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>;
```

Aufrufvertrag:

- Nur aufrufen, nachdem der ursprüngliche Send abgebrochen wurde (keine Gleichzeitigkeit)
- prompt_id wird wiederverwendet (gleiche Benutzerabsicht)
- Bereits in den Verlauf eingefügter userContent wird nicht erneut eingefügt

Implementierungsaufwand ca. 1,5 Tage plus Unit-Tests.

#### Laufzeit-Sicherung

`selectContinuationTier` gibt `'fast'` zurück, aber im Stream erscheint das Ereignis `ServerGeminiEventType.ToolCallRequest` → **Sofort abbrechen des aktuellen Streams, Aufruf von `retryStreamWithModel(primaryModel)`**.

Dies deckt das einzige stumme Fehlerszenario ab, in dem „als Zusammenfassung vorhergesagt, aber tatsächlich Tool benötigt". Kosten: Ein verschwendeter Fast-Aufruf an Tokens (Kostenzuordnung siehe §5.3).

#### Entkopplung von Skill `modelOverride`

`useGeminiStream.modelOverrideRef` (L376, L2225) trägt derzeit die **explizite Modellauswahl durch das Skill**, also „fachliche Semantik". Das Fast-Routing dieser Richtung ist „Optimierungssemantik"; beide **müssen getrennt werden**:

```typescript
// Neuer separater Ref
const summaryTierRef = useRef<'fast' | 'primary' | undefined>(undefined);

// Aufrufstelle zusammengeführt (modelOverrideRef wird nicht wiederverwendet)
const stream = geminiClient.sendMessageStream(
  finalQueryToSend,
  abortSignal,
  prompt_id!,
  {
    type: submitType,
    notificationDisplayText: metadata?.notificationDisplayText,
    modelOverride:
      modelOverrideRef.current ?? // Skill-Explizite Auswahl hat Vorrang
      (summaryTierRef.current === 'fast' ? config.getFastModel() : undefined),
  },
);
```

Lebenszyklus:

| Zeitpunkt                                          | `modelOverrideRef` (Skill) | `summaryTierRef` (Fast-Routing)           |
| -------------------------------------------------- | -------------------------- | ----------------------------------------- |
| Neuer User-Turn (`!Retry && !ToolResult`)          | Löschen                    | Löschen                                   |
| Skill-Tool gibt `modelOverride`-Feld zurück        | Schreiben                  | Unverändert                               |
| Tool-Batch abgeschlossen → `selectContinuationTier` | Unverändert                | Schreiben                                 |
| Laufzeit-Fallback (ToolCallRequest gesehen)        | Unverändert                | Upgrade auf `'primary'`                   |
| Retry (Benutzer manuell Ctrl+Y)                    | Behalten                   | Upgrade auf `'primary'` (Fast-Fehler kein weiteres Fast) |

Die explizite Skill-Auswahl **gewinnt immer** – die explizite Absicht des Benutzers hat Vorrang vor der Optimierungsstrategie.

#### Telemetriekorrektur

Der Interaction-Span in `client.ts:1303` zeichnet beim Start des Turns das `model`-Attribut auf. Wenn ein Fallback ausgelöst wird, ändert sich das Modell tatsächlich, und die Span-Daten werden ungenau. Erforderlich:

```typescript
// Beim Auslösen des Fallbacks
span.setAttribute('llm.model.requested', fastModel);
span.setAttribute('llm.model.actual', primaryModel);
span.setAttribute('llm.fallback.reason', 'tool_call_seen');
```

Und in `addUserPromptAttributes` zwischen `requested`/`actual`-Modell unterscheiden, um Abrechnungs-/Prüfungsverwirrung zu vermeiden.

#### Benutzerebene erzwingender Schalter

Neue Einstellung (`packages/cli/src/config/settingsSchema.ts`):

```typescript
summaryTierStrategy: 'auto' | 'always_primary' | 'always_fast';
// Standard: 'auto'
```

- `'auto'`: Verwendung von `selectContinuationTier` (empfohlen)
- `'always_primary'`: D2-Optimierung vollständig deaktivieren (produktionskritische Szenarien)
- `'always_fast'`: Vetos überspringen, **unterliegt weiterhin Laufzeit-Sicherungen** (fortgeschrittene Benutzer)

Begründung: D2 tauscht Qualität gegen Geschwindigkeit; manche Benutzer/Szenarien benötigen ein explizites Opt-Out.

#### Vorbedingungen

- `config.getFastModel()` ist konfiguriert
- **Validierungsexperiment für Fast-Model-Streaming im Hauptchat** (1 Tag vor Codierung):
  - Ein Tool mit `resultIsTerminal=true` mocken, im Hauptchat wiederholt eine Zusammenfassungsrunde auslösen
  - Beobachten, ob `tryCompress` fälschlich ausgelöst wird (Fast-Modell hat kleineres Kontextfenster, könnte früher auslösen)
  - Beobachten, ob die Ausgabe von `chatRecordingService` einen Modell-Mismatch aufweist
  - Beobachten, ob nach einem einzelnen Fast-Aufruf der nächste Primary-Aufruf den Verlauf korrekt lesen kann
- **Baseline-Messung der Fast-Kandidatenmodelle** (1 Tag):
  - 100 Zusammenfassungs-Prompts ausführen (Eingabe enthält `function_response`), P50/P95 End-to-End-Latenz und Time-to-First-Token messen
  - `tryCompress`-Auslöserate `P_compact` messen, Netto-RT-Gewinn verifizieren = `(1 - P_compact) × ΔRT − P_compact × compression_RT > 0`
  - Nur aktivieren, wenn Fast P50 ≤ Primary P50 × 0,5 und P95 ≤ Primary P95 × 0,6
- Fast-Modell und Primary-Modell aus derselben Familie (Unterschiede in der `function_response`-Kodierung vermeiden); bei unterschiedlichen Familien muss `getFastModel()` die Auswahl auf der Konfigurationsebene ablehnen
- **`thinkingConfig`-Kompatibilität**:
  - Fast-Modell muss mit Primary in Bezug auf die Unterstützung von `thinkingConfig.includeThoughts` übereinstimmen; oder
  - Fast-Pfad erzwingt `includeThoughts: false` (abgestimmt mit `sideQuery.ts:118-122`)
  - Validierung: Fast-Modell kann thought-Parts im Verlauf korrekt verarbeiten (kein Fehler, keine Behandlung von thought als Benutzereingabe)

#### Risiken und Gegenmaßnahmen

| Risiko                                                                  | Schwere | Gegenmaßnahme                                                                                                                       |
| ----------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Fast-Modell wählt Tool-Aufruf stumm falsch                              | Hoch    | Gesprächsfluss-Heuristik + Laufzeit-ToolCallRequest-Abbruch-Sicherung                                                                |
| Fast-Modell halluziniert bei fehlerhafter Eingabe eine „für den Benutzer sichtbare falsche Antwort" | **Hoch** | `hasUnresolvedError`-Veto; Überwachung der Benutzer-Nachfragequote (Anmerkung: `emitToolUseSummaries` hat das gleiche Risiko nur für 60-Token-Labels, dieses Risiko betrifft die endgültige Antwort, ist also schwerwiegender) |
| Fast-Pfad löst `tryCompress` aus → ein weiterer LLM-Aufruf, **verschlechtert RT und Kosten** | **Hoch** | `wouldTriggerCompression`-Vorabprüfung (Gate, siehe Entscheidungsfunktion #7); vorherige Baseline-Messung des `P_compact`-Schwellenwerts |
| Welches Modell für die Kompaktierung selbst verwendet wird               | Mittel  | Auslösen der Kompaktierung führt zur Aufgabe des Fast-Routings (Gate #7 fängt ab); Fehler in der Antwort vermeiden                   |
| Modellwechsel im Hauptchat beeinträchtigt den internen Zustand/die Aufzeichnung | Mittel  | Vorheriges Validierungsexperiment abdecken; Session-Resume-Wiederholungstest                                                         |
| D2 und `emitToolUseSummaries` lösen gleichzeitig konkurrierende Fast-Aufrufe aus, überschreiten Rate-Limit | Mittel  | Entweder: Bei aktiviertem D2 `emitToolUseSummaries` deaktivieren (Titel beeinträchtigen keine Funktion), oder gemeinsamen Rate-Limit-Token-Bucket verwenden |
| `thinkingConfig` ist zwischen Fast/Primary inkonsistent → History-Parsing-Fehler | Mittel  | Gleiche Familie + Fast-Pfad erzwingt `includeThoughts: false` (siehe Vorbedingungen)                                                 |
| Fallback-Pfad ist teurer (Fast-Tokens verschwendet + gesamter Primary-Durchlauf) | Mittel  | Überwachung des `fast_tokens_consumed`-Entscheidungslogs; bei Fallback-Rate >20% automatisches Flag-Deaktivieren                     |
| Telemetrie-Span-Modell verfälscht                                      | Mittel  | Aufteilung in `requested`/`actual` (siehe Telemetriekorrektur)                                                                       |
| Kontextformat inkompatibel (familienübergreifend)                       | Mittel  | `getFastModel()` lehnt familienübergreifende Auswahl ab                                                                              |
| Semantikkonflikt mit Skill `modelOverride`                               | Mittel  | Separater Ref + Skill-Vorrang                                                                                                       |
| `summaryTierRef`-Entscheidung nach `/model`-Laufzeitwechsel des Primärmodells ungültig | Niedrig | Beim Verarbeiten des `/model`-Befehls `summaryTierRef` synchron löschen                                                              |
| Fast-Tokens/s sind langsamer                                            | Niedrig | Gleichzeitig auch TTFT messen, nicht nur gesamte RT                                                                                  |

#### Nutzen (muss noch gemessen werden)

- **RT**: Zusammenfassungsrunde spart 2–3s (nicht vor der Messung in den PR-Titel schreiben)
- **Kosten**: Fast-Modell-Stückpreis ist meist deutlich niedriger als Primary; in Szenarien mit häufigen Zusammenfassungen könnten die Token-Kosten um 30-50% sinken; aber der Fallback-Pfad verbraucht zusätzliche Tokens, teilweise gegenläufig – muss durch `fast_tokens_consumed`-Messung bestätigt werden

---

### 3.3 Richtung Drei: Präsentations- und Interaktionsentkopplung (Presentation Decoupling)

#### Problem

Nach Abschluss eines Tools muss der Benutzer warten, bis die LLM-Zusammenfassungsrunde abgeschlossen ist, bevor er erneut eingeben kann:

```
Tool abgeschlossen → [Ergebnis anzeigen] → [submitQuery] → [auf LLM-Streaming-Antwort warten 3-4s] → Idle → Eingabe möglich
                                                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                                                         Benutzer sieht bereits Ergebnis, kann aber nicht handeln
```

#### Entwurf

Neuer Zustand `StreamingState.Summarizing`:

```typescript
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
  Summarizing = 'summarizing', // Neu
}
```

#### Zustandsautomat-Änderung

```
Tool abgeschlossen und Ergebnis bereits angezeigt
  → Wenn alle Tools im Batch postExecution.resultIsTerminal === true:
    → Übergang zu Summarizing (Benutzer kann eingeben)
    → submitQuery wird asynchron ausgeführt
    → LLM-Zusammenfassung wird an den Verlauf angehängt (oder durch neue Benutzernachricht abgebrochen)
  → Andernfalls:
    → Zustand Responding beibehalten (Benutzer kann nicht eingeben)
```

#### Behandlung neuer Benutzernachrichten

- Im Zustand `Summarizing` sendet der Benutzer eine neue Nachricht → aktuelle Zusammenfassung abbrechen → neue Nachricht verarbeiten
- **Bereits erzeugter teilweiser Zusammenfassungstext wird verworfen** (nicht in den Verlauf aufgenommen), um einen halben Satz im Assistant-Kontext zu vermeiden
- `function_response` bleibt im Verlauf erhalten (das Modell weiß, dass das Tool ausgeführt wurde)
- Followup-Vorschläge etc. werden erst ausgelöst, nachdem Summarizing abgeschlossen oder abgebrochen wurde

#### Bereinigungsliste für partiellen Text beim Abbruch

Partieller Text ist an mehreren Stellen verteilt; **alle müssen gleichzeitig** bereinigt werden, fehlende Stellen führen zu Zustandsinkonsistenzen:

| Stelle                                                    | Bereinigungsaktion                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pendingHistoryItemRef.current` (useGeminiStream React State) | Auf `null` setzen, `addItem` nicht aufrufen                                                      |
| Interne Akkumulation in `GeminiChat.history`               | Wenn vor dem Abbruch bereits partieller Assistant-Content eingefügt wurde, über neues `discardPendingAssistant()`-Interface zurücksetzen |
| `ChatRecordingService` gepufferter Turn                   | Als abgebrochen markieren, nicht in JSONL schreiben                                              |
| `dualOutput.emitText` (falls aktiviert)                   | Abbruch-Sentinel senden, Sidecar verwirft selbst                                                 |
| `loopDetectorRef` akkumulierte Tokens                     | Zählung für aktuellen Turn zurücksetzen                                                          |
执行顺序: abort signal 触发 → 收齐上述五处清理 → 才允许新 user message 进入 `submitQuery`。竞态测试覆盖: abort 触发瞬间正好收到最后一个 chunk。

#### 适用条件

batch 全员 `postExecution.resultIsTerminal === true`。

#### 历史不变量（与 §3.1 同源）

中途打断 Summarizing 会产生:

```
[user_1, function_call, function_response, user_2]
                                          ↑ 无 assistant turn
```

**这与 §3.1 跳过 LLM 轮破坏的是同一个不变量**，必须使用与 D1 相同的修复策略（注入空 assistant / 接受 Qwen 容忍）。

- 复用 D1 的不变量单测覆盖
- session-load 重放（含 `repairOrphanedToolUseTurnsInHistory`）必须覆盖此形态
- Anthropic alternation: 直连时与 D1 同时补兜底

#### 风险与缓解

| 风险                                | 严重度 | 缓解                                                           |
| ----------------------------------- | ------ | -------------------------------------------------------------- |
| Abort 时半句 assistant 进 history   | **中** | 显式丢弃 partial text；仅保留 function_response；单测覆盖 race |
| 历史不变量破坏（无 assistant 接续） | **中** | 与 D1 同源问题，统一修复（见 §3.1 历史不变量）                 |
| UI 状态复杂度增加                   | 中     | Summarizing = Idle + 背景任务；输入路径复用 Idle               |
| 用户感知收益依赖行为模式            | 低     | 用户若 3s 内不输入，summary 已完成 → 无感知收益；但**不退化**  |

#### 收益

- **理论上限**：3-4s 感知 RT（用户工具完成即输入）
- **实际中位数**：取决于用户输入间隔——读结果 2-5s 后才输入的用户不会感受到差异，但**绝不会更慢**

---

### 3.4 方向四: 流式提前调度 (Stream-Ahead Scheduling)

#### 问题

`processGeminiStreamEvents` 在 stream 完全结束后才批量调度工具。`ToolCallRequest` 事件可能在 stream 中期就已 yield。

#### 设计

在 stream 事件处理中对 `ToolCallRequest` 立即开始**前置验证**（不执行）:

```typescript
case ServerGeminiEventType.ToolCallRequest:
  toolCallRequests.push(event.value);
  scheduler.prevalidate(event.value, signal);  // 新增
  break;
```

`CoreToolScheduler.prevalidate(request)`:

1. 查找工具注册
2. 构建 invocation
3. 执行 `shouldConfirmExecute`（缓存结果）
4. `schedule()` 时直接使用缓存结果

#### 纯度契约与 Allowlist

`prevalidate` 要求 `shouldConfirmExecute` 是 side-effect-free **且**结果在 prevalidate→schedule 间隙不会被外部修改使之失效。

**直接复用 `tools.ts:818` 的 `CONCURRENCY_SAFE_KINDS`**:

```typescript
export const CONCURRENCY_SAFE_KINDS: ReadonlySet<Kind> = new Set([
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
]);
```

这是项目已有的"无副作用 + 可并发"分类，正好匹配 prevalidate 需求。

| 工具 Kind                     | 是否在 allowlist        | 理由                                                    |
| ----------------------------- | ----------------------- | ------------------------------------------------------- |
| `Read`（read_file 等）        | ✅                      | 纯读                                                    |
| `Search`（grep / glob）       | ✅                      | 纯读                                                    |
| `Fetch`（web_fetch 等）       | ✅                      | 远程读，无写副作用                                      |
| `Edit`                        | **❌**（见下文 TOCTOU） | shouldConfirmExecute 纯只读，但 diff 在调度间隙可能失效 |
| `Delete` / `Move` / `Execute` | ❌                      | MUTATOR_KINDS                                           |
| `Think`                       | ❌                      | 含 save_memory / todo_write 等隐式写                    |
| MCP 工具                      | ❌                      | 不可信                                                  |

**TOCTOU: 为什么 Edit 不进 allowlist**

理论上 Edit 的 `shouldConfirmExecute` 是纯只读（读文件、算 diff）。但 prevalidate 与 schedule 之间存在时间窗:

```
T=0      stream 收到 Edit(file=a.ts, ...) → prevalidate
T=10ms   shouldConfirmExecute 读 a.ts，缓存 diff_v0
T=300ms  stream 结束，scheduler.schedule()
T=305ms  期间其他工具/IDE/外部进程修改 a.ts
T=310ms  scheduler 用 diff_v0 展示给用户
T=320ms  用户基于 v0 确认
T=330ms  Edit 应用旧 params 到 v1 文件 → 内容损坏 / merge 失败
```

这是 TOCTOU。修复方向:

- **A（推荐）**：Edit 不进 allowlist，prevalidate 仅覆盖 `CONCURRENCY_SAFE_KINDS` 三类。代价: 收益从"50-200ms（Edit 主导）"降到"50-100ms（仅读类）"
- **B（可选加强）**：Edit 进入 allowlist 但缓存附 `(mtime, size, content_hash)`；schedule() 时校验未变才用缓存，否则重算

文档暂选 A。

#### 与现有并行调度的交互

`coreToolScheduler.attemptExecutionOfScheduledCalls`（L2436+）使用 `partitionToolCalls` 把工具分成"并发安全 batch"和"串行 batch"，并发 batch 通过 `runConcurrently`（L2473）执行。

prevalidate 必须与这个分批模型对齐:

- 缓存按 `callId` 索引（不是 `(toolName, args)`，避免并发同名调用冲突）
- prevalidate 失败的 call → 不影响其他 call，schedule 时该 call 走原始 `shouldConfirmExecute` 路径
- stream 取消时按 `signal` 级联 abort 所有 in-flight prevalidate

#### 风险

| 风险                                       | 严重度 | 缓解                                                                   |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------- |
| 缓存 diff 与确认时实际文件不一致（TOCTOU） | 高     | 方案 A: Edit 不进 allowlist；方案 B: 缓存附 `(mtime, size, hash)` 校验 |
| prevalidate 失败影响调度                   | 低     | 失败/超时退回原 `shouldConfirmExecute` 路径，缓存缺失 ≡ 未启用         |
| 并发 prevalidate 共享 fd / 资源争抢        | 低     | `QWEN_CODE_MAX_TOOL_CONCURRENCY` 已限并发上限（默认 10）               |

#### 收益

50-100ms/轮（仅 `CONCURRENCY_SAFE_KINDS` 范围）。若选方案 B 含 Edit，理论收益 100-200ms。

---

## 4. 综合评估与路线图

### 4.1 综合评估

| 方向                 | RT 收益                       | 实施复杂度               | 质量风险 | 依赖                                        | 优先级 |
| -------------------- | ----------------------------- | ------------------------ | -------- | ------------------------------------------- | ------ |
| D1 工具后置指令      | 3-4s/终态轮                   | 低（2-3d）               | 低       | 无                                          | **P0** |
| D2 summary fast 路由 | 2-3s/summary 轮（待实测）     | **中-高（9d）**          | 中-高    | D2 自带启发式 + 主 chat 验证实验 + ACP 同步 | **P1** |
| D3 展示解耦          | 3-4s 感知改善（依赖用户行为） | 中（3-5d，含不变量修复） | 中       | D1 历史不变量修复                           | **P1** |
| D4 流式提前调度      | 50-200ms/轮                   | 高（5-7d）               | 极低     | 无                                          | P2     |

#### D2 工作量细分

| 子任务                                                                                     | 估时   |
| ------------------------------------------------------------------------------------------ | ------ |
| 主 chat fastModel-streaming 验证实验（含 P_compact 测量）                                  | 1d     |
| Fast 候选模型基线测量（含 TTFT、P95、`thinkingConfig` 兼容性）                             | 1d     |
| `selectContinuationTier` + `summaryTierRef` 接入（useGeminiStream）                        | 0.5d   |
| 启发式实现（含 `MUTATOR_KINDS` 复用 / `wouldTriggerCompression` 估算 / 多语言 / 状态突变） | 1d     |
| `GeminiChat.retryStreamWithModel` + `discardPendingAssistant` 接口实现                     | 1.5d   |
| ACP Session 同步改造（acp-integration/session/Session.ts）                                 | 1d     |
| Telemetry span 修正（`requested` / `actual` 拆分）                                         | 0.5d   |
| User-level setting `summaryTierStrategy` + JSON schema + `/config` 集成                    | 0.5d   |
| 单测（race、abort 时机、history 不变量、fallback 路径、ACP 路径）                          | 2d     |
| **合计**                                                                                   | **9d** |

> 注: 早期估时 6.5d 未含 ACP 路径、`wouldTriggerCompression` gate、清理清单、settings schema 工程化等成本。

### 4.2 实施路线

#### Phase 1: D1 工具后置指令（1 周）

- 扩展 `ToolResult.postExecution`（tools.ts L422）: `skipLlmRound` + `resultIsTerminal`
- `handleCompletedTools` 实现 `skipLlmRound` 短路（useGeminiStream.ts L2038）
- 单测覆盖历史不变量
- **Phase 1 不消费 `resultIsTerminal`**（留给 Phase 3）

#### Phase 2: 信号生态建设（2 周，与 Phase 4 并行）

- 内置工具陆续打标 `skipLlmRound` / `resultIsTerminal`（见 §3.1 表）
- 验证打标覆盖率 ≥60%（按 turn 数加权，非按调用次数）
- 收集 production 数据，校准 §3.2 否决 gate 阈值
- Phase 2 末期跑 §3.2 主 chat 验证实验和基线测量

#### Phase 3: D2 + D3（约 3 周，含 ACP 同步）

> **修正**：早期路线图估 1 周，未含 fastModel-streaming 验证实验、`retryStreamWithModel` 实现、不变量统一修复、ACP 路径同步。

- 编码前: 完成主 chat 验证实验 + 基线测量（含 `P_compact` 与 thinkingConfig 兼容性）
- 新增 `summaryTierRef` + `selectContinuationTier`（含 `wouldTriggerCompression` gate）
- 新增 `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`
- **同步改造 ACP Session 路径**（acp-integration/session/Session.ts）使用同一决策函数
- 新增 `StreamingState.Summarizing` + 输入路径复用 + abort 清理清单
- 历史不变量统一修复（D1+D3 同源）
- Feature flag `experimental.summaryRoundFastModel: false`，**Release N 默认关**
- User setting `summaryTierStrategy`
- Telemetry span 修正
- 运行时保险（ToolCallRequest abort + retryStreamWithModel）

#### Phase 4: D4 流式提前调度（可独立插入）

- `CoreToolScheduler.prevalidate` + allowlist
- `processGeminiStreamEvents` 增量调度

---

## 5. 度量、验收与限制

### 5.1 性能指标

| 指标                       | 基线  | Phase 1 | Phase 3                   |
| -------------------------- | ----- | ------- | ------------------------- |
| 端到端 RT P50（3 轮 loop） | 13.4s | <10s    | <8s（待实测）             |
| 端到端 RT P95              | -     | <13s    | <12s（fallback 路径上限） |
| 用户感知首结果时间 P50     | 13.4s | <10s    | <5s（D3 启用）            |
| 用户感知首结果时间 P95     | -     | <13s    | <8s                       |
| LLM 调用次数（可跳过场景） | 3     | 2       | 2（更快）                 |

> 注: 基线为单次采样，落地前需补 ≥3 类场景。

### 5.2 质量指标

| 指标                                         | 基线 | 允许退化                 |
| -------------------------------------------- | ---- | ------------------------ |
| Tool-calling 准确率（fast model summary 轮） | 100% | ≥98%                     |
| skipLlmRound 误用率（用户追问"再详细些"）    | -    | <1%                      |
| Fast model fallback_triggered 率             | -    | <10%（>20% 自动关 flag） |
| Summarizing 状态下半句 assistant 入 history  | 0    | 0（硬性）                |

### 5.3 成本指标

| 指标                              | 基线 | Phase 3 目标                                                 |
| --------------------------------- | ---- | ------------------------------------------------------------ |
| 每千会话 token 成本（summary 轮） | 100% | <70%                                                         |
| Fallback 路径浪费 tokens 占比     | 0    | <15%（fallback 率 × 单次 fast tokens / 单次 primary tokens） |

### 5.4 决策日志 schema

每次 `selectContinuationTier` 与 `handleCompletedTools` 的关键判定写一条结构化日志:

```
{
  turn_id, prompt_id,
  decision: 'skip' | 'fast' | 'primary',
  tier_requested: 'fast' | 'primary',          // 决策（fallback 前）
  tier_actual:    'fast' | 'primary',          // 实际跑（fallback 后）
  signal_skipLlmRound: bool,
  signal_resultIsTerminal: bool,
  user_strategy: 'auto' | 'always_primary' | 'always_fast',
  veto_reason: 'further_action' | 'write_tool' | 'unresolved_error' |
               'deep_reasoning' | 'cross_result' | 'output_tokens' |
               'lang_unsupported' | 'compact_or_clear' | null,
  tool_count, distinct_tool_count,
  has_write_tool: bool,
  has_error: bool, has_cancel: bool,
  output_tokens_est: int,
  user_prompt_classification: 'query' | 'action' | 'analysis',
  fast_ttft_ms, primary_ttft_ms,                // fallback 时双份
  fast_tokens_consumed: int,                    // fallback 浪费的 tokens（成本归因）
  total_rt_ms,
  fallback_triggered: bool,
  fallback_reason: 'tool_call_seen' | 'timeout' | 'error' | null,
}
```

观察指标:

- fast 触发率（预期 30-50%）
- fallback_triggered 率（预期 <10%；>20% 提示在下个 release 关 default flag）
- 各 veto 占比（识别过严/过松）
- fast_tokens_consumed × fallback_rate（成本反向风险）
- 用户追问"再详细些"频次（fast 质量回归信号）

**`fast_tokens_consumed` 测量说明**:

abort 中断的 stream **大概率收不到 `finishReason` / `usageMetadata`**——后者只在 stream 完整结束时填充。实现需估算:

- 优先: abort 前尝试 `stream.return()` 让生成器走 finally 路径，可能拿到 partial usage
- 兜底: 累计已收 chunk 的文本长度 × 4 估算 output tokens；input tokens 用 history 估算
- 标注: 日志字段附 `tokens_source: 'usage' | 'estimated'`，事后分析需区分

### 5.5 验证方法与发布策略

#### 验证

- 复用 `/tmp/tool-timing.log` 计时框架
- 新增 `T_userIdle`（用户可再次输入时刻）
- 新增 `T_firstToken`（流式首 token 时刻）
- A/B 测试对比各 Phase 前后的 RT 与 cost 分布

#### 发布策略（适配本地 CLI）

Qwen Code 是本地 CLI，**没有运行时下发能力**——传统"5% / 25% / 100% 灰度"不适用。采用**阶段性 release 推进**:

| 阶段                  | Release 节点           | feature flag 默认值 | 触发条件                                                    |
| --------------------- | ---------------------- | ------------------- | ----------------------------------------------------------- |
| Phase 3a: dogfood     | Release N              | `false`             | 内部用户用 `summaryTierStrategy=always_fast` 自启用         |
| Phase 3b: opt-in 默认 | Release N+1（≥2 周后） | `false`（不变）     | dogfood 阶段决策日志达标: fallback <10%、净 RT/cost 收益 >0 |
| Phase 3c: 默认开启    | Release N+2（≥4 周后） | `true`              | Phase 3b 用户层面无质量回归报告                             |
| 回滚                  | Release N+3（如需）    | `true → false`      | 大规模 fallback >20% 或质量指标退化                         |

**回滚机制**:

- 无运行时下发，**回滚 = 发新 release 关 default flag**
- 用户级 `summaryTierStrategy=always_primary` 始终提供"我要立刻退出"通道，不依赖新 release
- 决策日志的 `fallback_rate` / `cost_regression` 在每个 Release 周期评估，决定下一步

### 5.6 已知限制

1. **基线数据单薄**：单次采样不能覆盖全部任务模式，落地前需补场景
2. **fast 模型前提**：不存在显著更快且 tool-calling 达标的同家族模型 → D2 不启用
3. **`skipLlmRound` 是质量换速度**：跳过 LLM = 放弃模型理解和纠错，仅适用确定性高场景
4. **D2 是质量+成本换速度**：fast 模型质量低于 primary；fallback 路径反而更贵——必须以决策日志实测净收益
5. **`tryCompress` 触发可能反向恶化**：fast 模型 context 小，compression 自身耗 LLM 调用——`wouldTriggerCompression` gate 是必备防御
6. **展示解耦改变交互模型**：新模式需要用户适应；用户行为决定实际感知收益
7. **网络延迟不可控**：本方案减少调用次数，非优化单次调用
8. **Anthropic 直连未覆盖**：当前 alternation 容忍度依赖 Qwen / OpenAI 风格 API
9. **主 chat 上 fastModel-streaming 是首次落地**：无生产先例，需独立验证实验
10. **本地 CLI 无运行时下发**：发布策略只能阶段性 release 推进，不支持快速灰度调节
11. **D2 仅作用于交互路径**：Subagent / Cron / Notification 不享收益，刻意如此
12. **混合模型 history 长期影响未知**：D2 启用后 session 内 turn 在 fast/primary 间切换，长会话 resume 与上下文连贯性需观察
13. **D4 收益缩水**：Edit 退出 allowlist 后，prevalidate 仅覆盖纯读类工具（50-100ms 收益）；含 Edit 的 200ms 收益需方案 B 的 mtime/hash 校验机制

### 5.7 关键代码位置

| 文件                                                  | 关键符号                                                 | 位置                     |
| ----------------------------------------------------- | -------------------------------------------------------- | ------------------------ |
| `packages/core/src/tools/tools.ts`                    | `ToolResult` interface                                   | L422                     |
| `packages/core/src/tools/tools.ts`                    | `Kind` enum + `MUTATOR_KINDS` + `CONCURRENCY_SAFE_KINDS` | L793, L806, L818         |
| `packages/core/src/tools/tools.ts`                    | `DeclarativeTool.kind: Kind`（每个 Tool 实例都带）       | L165                     |
| `packages/core/src/core/client.ts`                    | `SendMessageOptions.modelOverride`                       | L142                     |
| `packages/core/src/core/client.ts`                    | `sendMessageStream`                                      | L1216                    |
| `packages/core/src/core/client.ts`                    | `modelOverride ?? getModel()`                            | L1305, L1598             |
| `packages/core/src/core/client.ts`                    | `turn.run(model, …)`                                     | L1707                    |
| `packages/core/src/core/geminiChat.ts`                | `sendMessageStream(model, …)`                            | L1387                    |
| `packages/core/src/core/geminiChat.ts`                | `history.push(userContent)`                              | L1428                    |
| `packages/core/src/core/geminiChat.ts`                | `sendPromise` 锁                                         | L1392                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`        | `modelOverrideRef`（skill 选模型）                       | L376, L2225              |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`        | `processGeminiStreamEvents`                              | L1365                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`        | `sendMessageStream` 调用点                               | L1841                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`        | `handleCompletedTools`                                   | L2038                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`        | `submitQuery(ToolResult, …)`                             | L2355                    |
| `packages/core/src/services/toolUseSummary.ts`        | fast-model side query（非流式先例）                      | L108                     |
| `packages/core/src/followup/speculation.ts`           | fast-model streaming（forked chat 先例）                 | L224                     |
| `packages/core/src/config/config.ts`                  | `fastModel` + `getFastModel` + `setFastModel`            | L684, L1987, L2021       |
| `packages/core/src/core/coreToolScheduler.ts`         | `attemptExecutionOfScheduledCalls`                       | L2436                    |
| `packages/core/src/core/coreToolScheduler.ts`         | `runConcurrently` + `partitionToolCalls`                 | L2473                    |
| `packages/cli/src/acp-integration/session/Session.ts` | `sendMessageStream` 调用点（ACP / IDE 路径）             | L705, L965, L1182, L1423 |
| `packages/core/src/agents/runtime/agent-core.ts`      | Subagent `sendMessageStream`（不受 D2 影响）             | L614                     |

---

## 6. Review 验证记录（2026-05-26）

### 6.1 验证方法

针对设计文档中**只声明、未量化**的几条前置数据质量假设与收益估算，启动 4 个并行 Explore subagent 做只读代码调研。每个 subagent 只回答一个事实问题，不做判断，不给优化建议。调研基于当前 `main` 分支（HEAD: `026f2f768`）。

| 验证问题                                                               | 关联章节                           |
| ---------------------------------------------------------------------- | ---------------------------------- |
| Q3 当前所有工具的 `ToolResult.error` 字段填充率                        | §3.2 `hasUnresolvedError` 前置依赖 |
| Q4 stream abort 后 `usageMetadata` 实际可得性                          | §5.4 `fast_tokens_consumed` 测量   |
| Q5 "用户追问 / clarification" 埋点存在性                               | §5.2 fast 质量回归监控信号         |
| Q6 `CONCURRENCY_SAFE_KINDS` 工具 `shouldConfirmExecute` 实际 IO 工作量 | §3.4 D4 收益估算                   |

### 6.2 发现 1: `hasUnresolvedError` 启发式存在 32% 工具盲区（影响 D2）

**事实**: 在 22 个有错误路径的工具中，**15 个（68%）规范填 `ToolResult.error` 字段**（shell、read-file、write-file、edit、grep、glob、ls、web-fetch、mcp-tool、cron-\* 等核心 I/O 工具齐备），**7 个（32%）仅把错误塞进 `llmContent` 字符串**: `askUserQuestion`、`monitor`、`skill`、`lsp`、`exitPlanMode`、`todoWrite` 等。

**不存在**统一的 `createErrorResult` helper，每个工具独立实现错误构造。

**对设计的影响**:

- §3.2 的 `hasUnresolvedError` 否决项若仅检查 `ToolResult.error` 字段，**这 7 个工具的失败永远不会触发"切回 primary"**——下一轮仍会被路由到 fast model
- 其中 **`skill` 工具的失败被 fast model 错误总结**是高优风险场景（本仓库大量 skill 驱动的工作流会被影响）
- §3.2 列出的"shell 等需正确填 ToolResult.error（前置数据质量依赖）" **范围太窄**，shell 实际已规范，真正漏报的是 skill / lsp / todoWrite 等

**建议修正**: 把 "**将 7 个仅靠 `llmContent` 传错的工具改造为规范填 `error` 字段**" 列为 D2 的硬前置依赖（§3.2 前置条件），估时 ~2d；不接受 "用 `llmContent.match(/^Error:/i)` 兜底" 的脏路径（误判风险高）。

### 6.3 发现 2: `fast_tokens_consumed` 指标实现成本被低估（影响 D2 / §5.3）

**事实**:

- `turn.ts` 的 abort 路径（L289-291）直接 `return`，**没有 finally 块，也没有 `stream.return()` 调用**——文档 §5.4 暗示的 "abort 前 `stream.return()` 让生成器走 finally" 在当前代码中不存在该入口
- `geminiChat.ts:processStreamResponse` 的 `for await` 循环只在完整遍历时记录 turn（L1286），abort 中断意味着最后的 usage-only chunk（通常携带完整 metadata）**被直接丢弃**
- 主聊天路径**无任何 chunk-level token 累计兜底**；仅 subagent 层（`agent.ts:731-744`）有累计，无法复用
- 结论: abort 时 `usageMetadata` **零获取**，只能靠 `chars/4` 估算（±20% 误差）

**对设计的影响**:

- §5.4 末尾的"优先 / 兜底 / 标注"三层方案中，**"优先" 路径在当前代码不可达**——需先改 `sendMessageStream` 生成器结构加 finally，工作量约 1d，设计文档没体现这笔成本
- §5.3 把 "每千会话 token 成本 <70%" 列为 Phase 3 目标，但若指标本身 ±20% 误差，**"70%" 与 "82%" 落在测量噪声内**

**建议修正**:

- §5.3 改写为**趋势指标**，不作为 release gate；改用 "决策日志的 `fallback_triggered` 率 + `fast_tokens_consumed` 同向趋势" 双指标联合判断
- §5.4 增补: `fast_tokens_consumed` 实现需先改造 turn.ts abort 路径加 finally + `stream.return()`，作为 §3.2 工作量补充（+1d）

### 6.4 发现 3: `user_prompt_classification` 与"用户追问"埋点需新建（影响 D2 / §5.2）

**事实**:

- `packages/core/src/followup/` 已存在 `speculation.ts` / `suggestionGenerator.ts` / `followupState.ts`，但其 telemetry（`PromptSuggestionEvent`）记录的是 **"系统建议被采纳/忽略"**，不是"用户主动追问"
- `ChatRecordingService` 存储用户消息但**不打分类标签**
- 全仓库 grep 无 `user_prompt_classification`、无中英文追问模式匹配、无 `clarif*` / `intentDetect` 类机制

**对设计的影响**:

- §5.4 决策日志 schema 里 `user_prompt_classification: 'query' | 'action' | 'analysis'` 字段**没有数据源**——既不能从现有 PromptSuggestionEvent 推导，也不能从 ChatRecord 读出
- §5.2 "用户追问'再详细些'频次" 监控信号同上，**最接近的现有锚点 `followupState.onOutcome` 不可复用**
**Empfohlene Korrektur**:

- In §3.2 „Voraussetzungen“ muss „Minimale Implementierung des Benutzereingabe-Klassifikators“ hinzugefügt werden (Englisch/Chinesisch Pattern-Matching, ~3d), sonst fehlen in §5.4 Entscheidungslog sowohl `user_prompt_classification` als auch `requestImpliesFurtherAction` die Daten.
- Oder: **Akzeptieren**, dass in Phase 3a Dogfood diese beiden Signale fehlen und die Qualitätsregression nur über die `fallback_triggered`-Rate überwacht wird – geringe Kosten, aber hohes Risiko.

### 6.5 Befund 4: D4 Design-Widerspruch – Allowlist und Nutzenzuordnung inkonsistent (betrifft D4 / §3.4)

**Fakten**:

- Die drei Tool-Typen `Kind.Read` (read_file), `Kind.Search` (glob / grep), `Kind.Fetch` (web_fetch) implementieren `shouldConfirmExecute` / `getConfirmationDetails` **größtenteils von der Standardimplementierung `BaseToolInvocation` mit null IO** (read_file / glob / grep überschreiben gar nichts, web_fetch macht nur eine 5-10-zeilige String-Parsing der URL-Hostname)
- Wirkliches IO findet bei `Edit` / `WriteFile` statt (`calculateEdit` + `readTextFile` + `Diff.createPatch`, typisch ~20ms), aber §3.4 Variante A schließt sie aus der Allowlist aus, um TOCTOU zu vermeiden.
- **Ergebnis**: Die drei in der Allowlist verbliebenen Tools haben nahezu den gleichen Arbeitsaufwand mit und ohne Prevalidation – die Allowlist blockiert tatsächlich nur „das einzige Edit, bei dem IO eingespart werden könnte", und lässt die „ohnehin kostenlosen Tools" drin.

**Auswirkungen auf das Design**:

- Die Erzählung der „vorausgehenden IO-Validierung" in §3.4 **ist nicht haltbar**: Die eigentliche Quelle der 50-100ms Ersparnis ist die **Beseitigung der Scheduling-Wartezeit „Stream vollständig abgeschlossen → dann erst Batch-Scheduling"**, und hat nahezu nichts mit dem IO auf Tool-Seite zu tun.
- Die falsche Nutzenzuordnung führt zu zwei Problemen:
  1. **Die Allowlist könnte breiter sein** – jedes Tool mit idempotenter Prevalidation ist geeignet, nicht nur an `CONCURRENCY_SAFE_KINDS` gebunden.
  2. **Der Aufwand von 5-7d ist schwer zu rechtfertigen** – wenn der tatsächliche Nutzen nur ~50ms der Scheduling-Änderung beträgt und Edit nicht in der Allowlist ist, ist der ROI dieses Aufwands geringer als im Design-Dokument angedeutet.

**Empfohlene Korrektur**: §3.4 Nutzenzuordnung neu schreiben –

- Aufteilen in zwei Teile: (a) ~50ms durch die Scheduling-Änderung (Stream-Wartezeit eingespart), (b) ~0ms (innerhalb der Allowlist) / ~20ms (falls Edit in die Allowlist aufgenommen würde) durch vorverlagertes Tool-IO.
- In der zusammenfassenden Bewertungstabelle in §4.1 den D4 RT-Nutzen von „50-200ms" auf „30-80ms (Variante A, hauptsächlich durch Scheduling-Modell) / 100-200ms (Variante B, inkl. Edit)" ändern.
- In der Roadmap in §4.2 D4 weiter herabstufen – die reine Scheduling-Modell-Änderung kann unabhängig durchgeführt werden, ohne sich an das Prevalidation-Konzept zu binden.

### 6.6 Kombinierte Auswirkungen auf die Roadmap

| Kapitel                      | Ursprüngl. Schätzung | Nach Validierung | Zusätzliche Quelle                                                                                     |
| ---------------------------- | -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| D2 §3.2 Aufwand (§4.1 Detailtabelle) | 9d                   | **14-16d**       | +2d (Befund 1: vorausgehende Tool-Umbauten) +1d (Befund 2: turn.ts finally-Umbau) +3d (Befund 3: Eingabeklassifikator, wenn harter Pfad gewählt) |
| D4 §3.4 Gesamtbewertung      | 5-7d                 | 5-7d (unverändert) | Aufwand unverändert, aber **RT-Nutzenzuordnung von „Tool-IO" auf „Scheduling-Modell" geändert**, ROI-Absenkung |
| Phase 3 Gesamtdauer (§4.2)   | ~3 Wochen            | **~4-5 Wochen**  | D2 Aufwandssteigerung + vorausgehende Tool-Umbauten als separate PRs mit Review-Zyklus                 |

**Empfohlene Korrekturen an der ursprünglichen Roadmap**:

1. **D1 (P0) und D3 dicht dahinter beibehalten** – diese Validierung hat ihre Kernannahmen nicht berührt, ROI-Beurteilung unverändert.
2. **Verschärfte Startbedingung für D2** – die vorausgehenden Arbeiten aus Befund 1/2/3 (insgesamt ~6d) als „D2 Start-Gate" festlegen; ohne deren Abschluss nicht in die §3.2 Vorversuche eintreten.
3. **D4 Priorität neu bewerten** – da der tatsächliche Nutzen von der Scheduling-Änderung und nicht vom Tool-IO kommt, entweder (a) 30-80ms akzeptieren und D4 auf P3 nach hinten verschieben, oder (b) Variante B (Edit + mtime/hash) in Betracht ziehen, um 100-200ms zu erhalten, aber zusätzliche 5-7d Aufwand.
4. **§1.2 Einzelmessungs-Baseline nicht ändern** – aber in §5.1 die P95-Spalte erst nach Abschluss der D1-Implementierung und nach mindestens ≥3 Szenarien-Baselines mit konkreten Zahlen befüllen.

### 6.7 Nicht abgedeckte Nachfragen der Validierung

Die folgenden Nachfragen betreffen subjektive Entscheidungen oder die Autorenabsicht und wurden in dieser Validierung nicht durch Subagenten bearbeitet. Sie bleiben für das spätere Design-Review offen:

- Soll D2 in der Implementierungsreihenfolge hinter D3 gestellt werden? (subjektive Reihenfolge)
- Sollten D1/D3 in Phase 1 zusammengelegt werden? (Strategie)
- Ist der Schwellwert `needsCrossResultReasoning ≥ 3` in §3.2 eine rückwärts angepasste Anpassung an die Baselineszenarien in §1.2? (Autorenabsicht)
- Sollen die Zeilen-Anker der Tabelle mit wichtigen Codestellen in §5.7 in symbolische Anker geändert werden? (Dokumentenstabilität)

---

## 7. Überprüfung der „Low-Hanging Fruits" und nächste Schritte (Zweites Review am 2026-05-26)

### 7.1 Fakten, die diese Neubewertung auslösen

Nach der Validierung in §6 wurden zwei weitere **Fakten entdeckt, die die ROI-Beurteilung ändern**:

1. **DashScope `cache_control` ist bereits implementiert** (`packages/core/src/core/openaiContentGenerator/provider/dashscope.ts:172-181`)
   - Streaming-Request markiert `system + letzte Nachricht + letzte Tool-Definition`
   - Die Trefferdaten `cached_tokens` werden bereits in `usageMetadata.cachedContentTokenCount` erfasst (`converter.ts:1124-1149`)
   - Dies ist ein Prefix-Cache-Mechanismus: Runde N+1 trifft automatisch den in Runde N geschriebenen Prefix
   - **Die Summary-Runde ist genau die Runde mit dem längsten Präfix-Treffer**

2. **System-Prompt ist bereits stabil** (Audit-Ergebnis aus `prompts.ts`)
   - Keine harten Wunden wie cwd / Zeitstempel / git-Status / Dateiliste / LSP-Status, die sich pro Turn ändern
   - `process.cwd()` wird nur als Schalter für `isGitRepository()` verwendet, nicht in den Prompt-Inhalt geschrieben
   - Einzige dynamische Punkte: `save_memory`-Tool ausgelöst / `/model`-Wechsel / MCP dynamisches Laden (alle ereignisgesteuert, niedrige Frequenz)

### 7.2 Diese beiden Fakten ändern die ROI-Beurteilung von D2

§3.2 Dokumentation nimmt an: „Fast-Modell ist ~2s schneller als Primary". Vergleichsbasis ist **Primary uncached vs. Fast uncached**.

Aber in der Realität läuft Primary **gecached** (die Summary-Runde trifft genau den stärksten Präfix), also ist der korrekte Vergleich:

> Primary gecached vs. Fast ungecached

| Routing                             | Geschätzte Latenz | Anmerkung                                    |
| ----------------------------------- | ----------------- | -------------------------------------------- |
| Primary mit 80% Prefix-Cache-Treffer | ~1,8-2,2s         | Aktuelles tatsächliches Verhalten in Summary-Runde |
| Fast ohne Cache (modelübergreifend nicht geteilt) | ~1,5-2s           | Tatsächliches Verhalten nach D2-Wechsel      |

**Netto-Unterschied: einige hundert Millisekunden, möglicherweise sogar Fast langsamer**. Zuzüglich 14-16d Engineering-Aufwand + Qualitätsrisiko + Fallback-Verschwendung, **D2 Nettogewinn nahe 0 oder negativ**.

§3.2 Voraussetzungen **müssen ergänzt werden**: Die Baseline-Messung muss Primary **gecached** vs. Fast **ungecached** vergleichen, und wenn `T_primary_cached < T_fast_uncached × 1,5` ist, darf D2 nicht aktiviert werden.

### 7.3 Kandidatenliste (nach „Schmierigkeitsgrad" neu geordnet)

**Echte Low-Hanging Fruits (sofort umsetzbar, < 1d Aufwand, sehr geringes Risiko, sicherer Nutzen)**:

| Punkt                           | Aufwand | Nutzen                             | Vorgehen                                                                                    |
| ------------------------------- | ------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Kurz-Anweisung für Antwort      | 30min   | ~2s/Summary-Runde (Ausgabe-Token halbiert) | In `prompts.ts` Final Reminder Abschnitt einen Satz hinzufügen                              |
| Cache-Hit-Rate Telemetrie freigeben | 0,5d    | 0s direkt, aber **Ermöglicher** für nachfolgende Entscheidungen | `cachedContentTokenCount` bereits erfasst, fehlt nur die Exponierung; zudem nach `save_memory` separate Markierung |

**Fast Low-Hanging Fruits (auf Daten warten, 0,5-1d Aufwand)**:

| Punkt                                   | Aufwand | Nutzen                                           | Entscheidungsvoraussetzung                                                        |
| --------------------------------------- | ------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Summary-Runde `tool_choice='none'`      | 0,5-1d  | 0,3-1s (Sampling überspringt tool_call-Token)    | Braucht Logik zur Erkennung „ist das die Summary-Runde", geringes Fehlerrisiko    |
| Summary-Runde Thinking deaktivieren     | 1d      | 0,5-2s                                           | Nur sinnvoll für Modelle mit aktiviertem Thinking (qwen3.5-plus, glm-4.7, kimi-k2.5 etc.) |
| UI-Rendering-Layer Chunk-Batching       | 0,5d Recherche + 0,5d Umsetzung | Zu validieren                              | Annahme: Der kumulierte Token-Rendering-Aufwand von langer Summary mit `useGeminiStream` ist nicht gering |

**Zu untersuchen (könnte „großer Fisch" sein)**:

| Punkt                                   | Forschungsaufwand         | Potenzieller Nutzen         | Wesentliche Unbekannte                                   |
| --------------------------------------- | ------------------------ | --------------------------- | -------------------------------------------------------- |
| ~~DashScope `scope: 'global'` support~~ | ~~0,5d Dokumentation + 0,5d A/B~~ | ~~Session-übergreifende Treffer~~ | **Bereits recherchiert, Fazit (c) nicht machbar** (siehe §7.4 Befund B). Diese Zeile bleibt als Entscheidungsprotokoll, nicht neu starten. |

**Mittlere Umbauten (keine Low-Hanging Fruits, separat bewerten)**:

| Punkt                              | Aufwand           | Risiko | Nutzen         |
| ---------------------------------- | ----------------- | ------ | -------------- |
| D1 `skipLlmRound` (Endzustands-Abfrage-Szenario) | 2-3d              | Mittel | 3-4s/Endzustands-Runde |
| Summary-Runde Tool-Ergebnis-Trimming (D5 Teilmenge) | 2d                | Mittel | 1-2s           |
| D3 `Summarizing`-Status            | 3-5d              | Mittel | Wahrnehmungsverbesserung 3s |
| System-Prompt verschlanken         | 2-3d inkl. A/B-Test | Mittel | 0,5-1s         |

**Bereits verworfene Richtungen (nicht mehr machen)**:

| Punkt                                           | Grund des Verwurfs                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| D2 Fast-Modell-Routing                           | Durch DashScope-Cache ausgeglichen, Nettogewinn nahe 0 oder negativ |
| D4 Prevalidate                                   | Nutzenzuordnung falsch (tatsächlich nur ~50ms durch Scheduling-Modell), 5-7d Aufwand lohnt nicht |
| System-Prompt stabilisieren                      | Bereits stabil, nichts zu tun |
| Stream vorzeitig terminalisieren (Höflichkeits-Text vorzeitig abbrechen) | Hohes Fehlerrisiko, Benutzer empfindet Antwort als abgeschnitten |

### 7.4 Drei neue Befunde, die eine genauere Betrachtung lohnen

#### Befund A: Tatsächlicher Mechanismus von `tool_choice='none'`

In der OpenAI / DashScope API bewirkt `tool_choice='none'` nicht nur „kein Tool-Aufruf" – in der Sampling-Phase des Modells wird **die Wahrscheinlichkeitsverteilung für das spezielle `<tool_call>`-Token vollständig übersprungen**, der Decoder geht direkt zur Pfad der natürlichen Sprachgenerierung. Der Nutzen liegt nicht darin, „ein oder zwei Retries zu sparen", sondern dass das Sampling selbst schneller ist.

#### Befund B: `scope: 'global'` hat im Repository bereits einen Anthropic-Vorläufer

In `packages/core/src/core/anthropicContentGenerator/converter.test.ts:85, 1543` gibt es bereits die Verwendung von `cache_control: { type: 'ephemeral', scope: 'global' }`. Aber `provider/dashscope.ts:288` übergibt **kein scope** beim Setzen von cache_control:

```typescript
cache_control: { type: 'ephemeral' },   // kein scope
```

Falls der DashScope-Server `scope: 'global'` erkennt:

- System + Tools werden auf globalen Cache hochgestuft (TTL weit größer als die 5 Minuten von ephemeral)
- **Session-übergreifende Treffer**, auch die Startlatenz sinkt
- Allein dieser Nutzen könnte die gesamte ursprüngliche Annahme von D2 übertreffen

##### Rechercheergebnis (2026-05-26, Fazit: (c) nicht machbar, diese Linie schließen)

Durch Recherche in der offiziellen Alibaba Cloud Bailian-Dokumentation (`help.aliyun.com/zh/model-studio/context-cache`) ergibt sich folgende Faktenliste:

| Frage                     | Ergebnis                                                                                                                                                                                            | Beleg                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Unterstützung des Felds `scope` | **Nicht unterstützt**. Es wird nur `type: 'ephemeral'` erkannt; jedes `scope`/`persistent`/`global` wird stillschweigend fallen gelassen.                                                            | Offizielle Dokumentation: „Nur `type` auf `ephemeral` setzen wird unterstützt" |
| Tatsächliche TTL von ephemeral | **5 Minuten gleitendes Fenster** (wird bei Treffer zurückgesetzt)                                                                                                                                    | Bailian-Dokumentation klar angegeben               |
| Lange TTL / globaler Mechanismus | **Keinerlei öffentlicher Cloud-API-Endpunkt-Mechanismus**. Kein `persistent` type-Wert, keine separate Pre-Upload-API, kein `prompt_cache_key`; das einzige „global persistente" Produkt ist der PAI Global Context Cache (eigenes Deployment + vLLM + Lingjun + shared Redis), nicht mit DashScope API verwandt | PAI-Dokumentation                                   |
| Session-übergreifende gemeinsame Nutzung | Gleicher Account + gleiches Modell + Inhaltsübereinstimmung → bereits Treffer (das macht `ephemeral` bereits); verschiedene Accounts teilen absolut nicht.                                              | Bailian-Dokumentation                               |
| Preisgestaltung           | Cache write 125%, expliziter Cache read 10%, **impliziter Cache read 20%** (auch ohne `cache_control`-Markierung kann der implizite 20%-Rabatt bezogen werden).                                    | Bailian-Preisseite                                  |
| Minimaler cachebarer Prompt | **1024 Tokens**                                                                                                                                                                                      | Bailian-Dokumentation                               |
| Modellunterstützung (expliziter Cache) | qwen3.7-max / qwen3.6-plus / qwen3.5-plus / qwen3-coder-plus / qwen3-vl-plus / deepseek-v3.2 / kimi-k2.5 / glm-5.1 alle explizit aufgeführt. **qwen3.6-plus und qwen3.7-max genießen ebenfalls 90% expliziten Cache-Rabatt** | Bailian-Modellliste (am 26.05.2026 erneut überprüft) |

**Nebenbefunde mit weitergehenden Implikationen**:

1. **TTL-gleitendes Fenster** ist für den Agent-Loop eine gute Nachricht – die Intervalle zwischen aufeinanderfolgenden Aufrufen im Loop liegen normalerweise unter 30s, **der Cache bleibt immer frisch, läuft nicht nach 5 Minuten ab**.
2. **Impliziter Cache-Rabatt von 20%** ist ein kostenloser Bonus – selbst ohne `cache_control`-Markierung kann er bezogen werden; aber zur feinen Steuerung ist explizite Kennzeichnung erforderlich.
3. ~~`qwen3.6-plus` nicht in der expliziten Liste~~ – **Korrektur (2026-05-26)**: Nach erneuter Überprüfung ist qwen3.6-plus **tatsächlich in der expliziten Cache-Liste** und genießt den 90%-Rabatt. Der vorherige Bericht hatte hier einen Fehler, der in der ersten Tabelle dieses Abschnitts korrigiert wurde.
4. **Die aktuelle Vorgehensweise in `dashscope.ts:288` ist bereits die Obergrenze der DashScope Public Cloud API** – es gibt keinen Spielraum für weitere Optimierung.

**Verstärkung der D2-Beurteilung aus §7.2**:

Das TTL-gleitende Fenster bedeutet, dass die Summary-Runde im Agent-Loop **fast zu 100%** den Cache von Primary trifft (da die vorherigen Runden gerade getroffen wurden und innerhalb von 5 Minuten liegen). Ein Wechsel zu D2 Fast-Modell würde nicht nur die aufgebaute Cache-Schreibkette zerreißen, sondern **die Summary-Runde von „nahezu 100% Treffer" auf „vollständigen Miss" degradieren** – der Nettogewinn ist noch klarer negativ als in der ursprünglichen Annahme von §7.2.

#### Befund C: UI-Rendering-Layer – ein übersehenes Blindfeld

§1.2 Baseline veranschlagt „Framework-Overhead" mit 0,3s (3%), aber das ist eine grobe Schätzung. Ink 7 + React 19.2 lösen bei jedem Chunk `setState` → Re-Render aus, bei einer langen Summary können sich 200-500ms ansammeln. Es muss geprüft werden, wie `useGeminiStream` den Token-Stream verarbeitet – ob es `requestAnimationFrame` / `useDeferredValue` zur Zusammenfassung von Chunks gibt.

### 7.5 Daten-Checkpoints – Bei neuen Daten: Welche Entscheidung ist zu überprüfen?

Dieser Abschnitt ist der **aktive Einstiegspunkt dieses Dokuments**: Sobald Metrik-Daten vorliegen, wird anhand der folgenden Tabelle entschieden, welche Entscheidung erneut überprüft werden muss.

#### Checkpoint 1: Nachdem Cache-Hit-Rate-Daten vorliegen

**Auslöser**: Die Low-Hanging-Fruit „Cache-Hit-Rate Telemetrie freigeben" ist seit ≥3 Tagen live, das Entscheidungslog enthält die Verteilung von `cached_tokens` / `prompt_tokens`.

**Anzusehende Daten**:

- Gesamte Trefferquote (cached / prompt) P50, P90-Verteilung
- Nach Runden: Runde 1 / Runde 2 / Runde 3 (Summary) jeweils ihre Trefferquoten
- Trefferquote der Runde nach `save_memory`-Auslösung (sollte nahe 0 sein)
- Trefferquote der Runde nach `/model`-Wechsel (sollte nahe 0 sein)

**Entscheidungspfad**:

| Gesamte Trefferquote | Bedeutung                                | Aktion                                                                      |
| --------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| > 70%                 | Aktueller Zustand nahe theoretischem Maximum | Nur #1 Kurz-Anweisung + Befund B Forschung; restliche Low-Hanging Fruits nach Bedarf |
| 40-70%                | Noch Spielraum, aber Quelle unklar       | Analyse nach Runden-Trefferquote, herausfinden, welcher Teil missed         |
| < 40%                 | Dynamischer Punkt schlägt Cache          | System-Prompt / userMemory-Auslösefrequenz neu auditieren; möglicherweise `save_memory` häufiger als erwartet |

#### Checkpoint 2: DashScope `scope: 'global'` Dokumentations-Recherche ✅ abgeschlossen (2026-05-26)

**Ergebnis**: **Wird überhaupt nicht erkannt**. Siehe „Rechercheergebnis" in §7.4 Befund B.

**Ausgeführte Aktion**: Status akzeptieren, diesen Punkt überspringen. `dashscope.ts:288` behält die bestehende `ephemeral`-Markierung, kein Umbau erforderlich.

**Diese Recherche in Zukunft nicht wieder aufnehmen** – es sei denn, DashScope kündigt offiziell einen neuen Persistenzmechanismus an.

#### Checkpoint 3: UI-Rendering-Layer Rechercheergebnis

**Auslöser**: Befund C Recherche abgeschlossen (`useGeminiStream` Token-Stream-Verarbeitung + Ink/React DevTools Messungen).

**Entscheidungspfad**:

| Ergebnis                                  | Aktion                                               |
| ----------------------------------------- | ---------------------------------------------------- |
| Langes Summary-Stream-Rendering kumuliert > 200ms | Batching einführen (`useDeferredValue` oder eigene Drosselung) |
| Rendering-Overhead < 100ms                | Diese Linie schließen                                |

#### Checkpoint 4: Zweite Baseline-Messung nach Abschluss der „echten Low-Hanging Fruits"

**Auslöser**: #1 Kurz-Anweisung + Checkpoint 1/2/3 Entscheidungen abgeschlossen seit ≥1 Woche.

**Anzusehende Daten**:

- End-to-End RT P50 im Vergleich zur Einzelmessungs-Baseline in §1.2 (13,4s)
- Separate P50 / P95 der Summary-Runde
- Benutzer-Nachfrage-Rate (falls Low-Hanging Fruit A auch den Benutzereingabe-Klassifikator mitliefert)

**Entscheidungspfad**:

| Kumulierte Einsparung | Aktion                                                                             |
| --------------------- | ---------------------------------------------------------------------------------- |
| > 4s (erreicht 9,6s End-to-End P50) | D1 `skipLlmRound` bewerten (weitere 3-4s/Endzustands-Runde)                        |
| 2-4s                  | Status akzeptieren, bewerten, ob D3 Wahrnehmungsverbesserung den Aufwand lohnt     |
| < 2s                  | Neu prüfen: Sind die Low-Hanging Fruits selbst überschätzt, oder gibt es unerkannte Engpässe (Netzwerk-RTT, Provider-Latenz)? |

### 7.6 Endgültige Beurteilung zu den Richtungen aus §3

Basierend auf der Validierung in §6 + der ROI-Neuordnung in diesem Abschnitt:

| Richtung              | Ursprüngliche Priorität in §3 | Beurteilung in diesem Abschnitt | Grund                                                                        |
| --------------------- | ----------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| D1 Tool-nachgestellte Anweisung | P0                            | **P0 beibehalten**, aber nach Abschluss der Low-Hanging Fruits neu bewerten | ROI immer noch gut, aber nicht mehr „sofort machen" – erst die günstigeren Low-Hanging Fruits abräumen |
| D2 Summary Fast-Routing | P1                            | **Defer / Won't Fix**           | Durch DashScope-Cache ausgeglichen, 14-16d Aufwand für nahezu 0 Nutzen       |
| D3 Anzeige-Entkopplung | P1                            | **Beibehalten als optional**, Checkpoint 4 Daten abwarten | Wahrnehmungsverbesserung sicher, aber absolute RT ändert sich nicht, abhängig vom Benutzerverhalten |
| D4 Stream vorzeitiges Scheduling | P2                            | **Defer**                       | Nutzenzuordnung falsch, tatsächlich ~50ms nicht wert 5-7d                    |

### 7.7 Empfohlene Ausführungsreihenfolge

**Tag 1** (von einer Person an einem Tag erledigbar):

- ✅ `prompts.ts` Kurz-Anweisung für Antwort hinzufügen (30min)
- ✅ `cachedContentTokenCount` in Telemetrie exponieren + Markierung für `save_memory` / `/model`-Wechsel (0,5d)
- ✅ Befund B Recherche starten: DashScope `scope: 'global'` Dokumentation abfragen + Vergleich mit bestehender Anthropic-Verwendung (0,5d)

**Tag 2-3**:

- Erste Cache-Hit-Rate-Daten sammeln
- Befund C Recherche starten: React-Rendering-Pfad von `useGeminiStream`
- Anhand von Checkpoint 2 entscheiden, ob `scope: 'global'`-Umbau gemacht werden soll

**Ende von Woche 1**:

- Checkpoint 1 Datenentscheidung (Verteilung ansehen)
- Entscheiden, ob `tool_choice='none'` / Thinking deaktivieren gemacht werden soll (basierend auf Hit-Rate-Daten)

**Woche 2-3**:

- Checkpoint 4 Zweite Baseline-Messung
- Entscheiden, ob D1 gestartet werden soll (größter Nicht-Low-Hanging-Fruit, 3-4s/Endzustands-Runde)

**Immer nicht machen**: D2 / D4 / System-Prompt stabilisieren.

### 7.8 Audit der dynamischen Inhalte von `prompts.ts` (2026-05-27)

§7.1 hat die Schlussfolgerung „System-Prompt ist bereits stabil" nur mit einem groben grep gezogen. Dieser Abschnitt ist eine systematische Prüfung von `packages/core/src/core/prompts.ts` (1169 Zeilen) und listet die Ergebnisse als Grundlage für die spätere Cache-Hit-Rate-Analyse und Low-Hanging-Fruit-Entscheidungen.

**Prüfmethode**: Aufzählung aller `${...}`-Interpolationsausdrücke, IIFEs, `process.*` / `new Date` / `Date.now` / `Math.random` / `fs.*`-Aufrufe, für jede Stelle beurteilen, ob sie sich innerhalb einer Session ändert.

#### Überhaupt nicht vorhanden (häufig verdächtigte harte Wunden)

| Kandidat                            | Code-Tatsache                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `Date.now()` / `new Date()`         | **Null Vorkommen** im gesamten Text (kein Treffer bei `rg`)                         |
| `Math.random()`                     | **Null Vorkommen**                                                                  |
| Schreiben des Werts von `process.cwd()` in den Prompt | Nur L366 `if (isGitRepository(process.cwd())) { ... }`, **Wert wird nicht in String geschrieben**, nur als Schalter |
| Subprozessaufrufe für git status / git branch | **Null**, git-Abschnitt ist statischer Anleitungstext                          |
| Aktuelle Dateiliste / Projektstruktur-Injektion | **Null**                                                                            |
| LSP-Status / Fehlerzahl             | **Null**                                                                            |
| Benutzereingabe-Verlauf             | **Null** (history läuft über messages, nicht in system)                            |

#### Einmalig beim Start, innerhalb der Session unverändert

| Position   | Inhalt                                                                                             | Wann könnte es sich ändern |
| ---------- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| L190       | `process.env['QWEN_SYSTEM_MD']` bestimmt Quelle von basePrompt (Standard vs. Benutzer system.md)   | Innerhalb des Prozesses unverändert |
| L342-343   | `process.env['SANDBOX']` bestimmt, welche Version des Sandbox-Abschnitts (Seatbelt / Sandbox / Outside) | Innerhalb des Prozesses unverändert |
| L366       | `isGitRepository(process.cwd())` bestimmt, ob der Git-Abschnitt eingefügt wird                     | cwd bleibt in derselben Session normalerweise unverändert |
| L871       | `process.env['QWEN_CODE_TOOL_CALL_STYLE']` bestimmt Tool-Call-Stil (qwen-coder / qwen-vl / general) | Innerhalb des Prozesses unverändert |

#### Ereignisgesteuert (niedrige Frequenz)

| Parameter                                          | Auslösebedingung                                          | Geschätzte Frequenz |
| -------------------------------------------------- | --------------------------------------------------------- | ------------------- |
| `userMemory` (1. Parameter von `getCoreSystemPrompt`) | `save_memory`-Tool / `/memory refresh` / Erweiterung laden | 0-3 pro Session     |
| Modellname (beeinflusst, welche `getToolCallExamples`-Variante gewählt wird) | `/model`-Wechsel                                          | Selten              |
| `appendInstruction`                                | Konfigurationselement, innerhalb der Session im Wesentlichen unverändert | Fast nie            |
| `deferredTools` (`buildDeferredToolsSection`)       | MCP-Tools dynamisches Laden                               | Meist in der Startphase der Session |

#### Eine versteckte kleine Falle

L207-209: Falls die Umgebungsvariable `QWEN_SYSTEM_MD` gesetzt ist, wird **bei jedem** `getCoreSystemPrompt` ein `fs.readFileSync(systemMdPath)` ausgeführt:

```typescript
const basePrompt = systemMdEnabled
  ? fs.readFileSync(systemMdPath, 'utf8')
  : `...`;
```

- Bei unveränderter Datei ist der Inhalt stabil → Cache-Treffer nicht beeinträchtigt
- Aber jeder LLM-Aufruf hat einen synchronen IO (Standard `.qwen/system.md`, bei Netzwerk-Mounts noch langsamer)
- Beeinflusst nicht die Schlussfolgerung zur „Cache-Freundlichkeit" dieses Abschnitts, wird nur als bekannter kleiner Performance-Einbruch notiert

#### Abgeleitete Schlussfolgerungen

1. **Der System-Prompt ist in einer stabilen Session bei jedem Aufruf byte-identisch** → Der DashScope-ephemeral-Cache-Key (basierend auf dem Inhalts-Hash) ist stabil → **Cache-Trefferquote des System-Abschnitts nahezu 100%**
2. Das einzige Ereignis, das den Cache trifft, ist `save_memory` – eine Kernfunktion, die nicht zugunsten des Caches geopfert werden kann.
3. **Kostenanalyse von Low-Hanging Fruit #1 (Kurz-Anweisung für Antwort)**: Die Anweisung wird im Final-Reminder-Abschnitt (L389-390) hinzugefügt → Der System-Prompt-Inhalt ändert sich einmal → **Erste Anfrage: Cache-Miss (einmalige Aufwärmkosten), danach alle weiteren Anfragen treffen den Cache**
4. **Die in §7 als „verworfen" eingestufte „System-Prompt-Stabilisierung" erhält formelle Beweise** – sie ist nicht nur unnötig, sondern selbst die theoretische Behauptung, dass eine weitere Reduzierung der Cache-Miss-Rate möglich wäre, ist nicht haltbar, da diese bereits bei ≈ 0 liegt
5. Dieses Audit kann als Referenzbaseline für spätere Diskussionen dienen und wiederholte Greps vermeiden; falls `prompts.ts` größere Änderungen erfährt, muss dieser Abschnitt synchron aktualisiert werden.