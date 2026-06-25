# Qwen Code Agent Loop RT – Technische Optimierungslösung

## 1. Hintergrund und Problemdefinition

### 1.1 Aktuelle Situation

Der Agent Loop von Qwen Code folgt einem strikt seriellen Modell:

```
User Prompt → [LLM Entscheidung] → Tool Execution → [LLM Entscheidung] → Tool Execution → … → [LLM Antwort] → Idle
               ~3-4s          ~Xms-Ns          ~3-4s          ~Xms-Ns            ~3-4s
```

Jeder LLM‑Aufruf (inklusive Netzwerk‑RTT + Modell‑Inferenz) dauert etwa 3–4 s und ist der Hauptkostenfaktor für die End‑zu‑End‑Latenz.

### 1.2 Messdaten

Testszenario: „Welche Arbeitsbereiche habe ich?“ (3 Agent‑Loop‑Runden, 2 Tool‑Aufrufe, Einzelmessung)

| Phase                        | Dauer     | Anteil |
| ---------------------------- | --------- | ------ |
| LLM Runde 1 (Entscheidung: Skill aufrufen) | 3.8 s     | 28 %   |
| Skill‑Ausführung             | 1 ms      | <1 %   |
| LLM Runde 2 (Entscheidung: Shell aufrufen) | 3.0 s     | 22 %   |
| Shell‑Ausführung             | 2.5 s     | 19 %   |
| LLM Runde 3 (Zusammenfassung) | 3.8 s     | 28 %   |
| Framework‑Overhead (Status‑Sync, Rendering) | 0.3 s     | 3 %    |
| **Gesamt**                   | **13.4 s** | 100 %  |

**Fazit**: LLM‑Aufrufe machen 78 % aus, Tool‑Ausführung 19 %, Framework 3 %. Die Optimierung zielt primär auf **weniger LLM‑Aufrufe** und **geringere Latenz pro LLM‑Aufruf**.

> Hinweis: Einzelmessung, ein Szenario. Die 19 % für Tool‑Ausführung sind durch langsame Shell‑Aufrufe dominiert; in read‑lastigen Szenarien kann der Tool‑Anteil auf <5 % sinken. Vor der Umsetzung sollten ≥3 Szenarien (Schreiboperationen, toolsübergreifende Schlussfolgerungen, Fehlerbehebung) als Baseline gemessen werden.

### 1.3 Wesentliche Einschränkungen der aktuellen Architektur

| Einschränkung                         | Code‑Standort                                                                    | Beschreibung                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Tool‑Ergebnisse haben keine Nachsteuerung | `tools.ts` `ToolResult`‑Interface (L422)                                         | Es gibt nur `llmContent`/`returnDisplay`/`error`, kein Signal wie „LLM überspringen“              |
| Ergebnisse werden bedingungslos an LLM zurückgegeben | `useGeminiStream.ts` `handleCompletedTools` (L2038) → `submitQuery(ToolResult, …)` (L2355) | Alle von Gemini initiierten Tool‑Ergebnisse werden zurückgespielt                                 |
| Dispatch erst nach Stream‑Ende        | `useGeminiStream.ts` `processGeminiStreamEvents` (L1365)                         | `scheduleToolCalls` erst nach Beendigung des Stream‑Loops, kein inkrementelles Dispatch           |
| Modellauswahl ohne Strategieebene     | `client.ts` `modelOverride ?? getModel()` (L1305, L1598)                         | Die Infrastruktur reicht bis `turn.run(model, …)` (L1707), wird aber nur bei expliziter Angabe im Skill genutzt |

### 1.4 Bereits vorhandene Infrastruktur (wird im vorliegenden Ansatz stark genutzt)

| Fähigkeit                                          | Ort                                                                 | Status                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `fastModel`‑Konfig + `/model --fast <id>`          | `config.ts:684`, `1987`, `2021`                                     | Vorhanden                                                 |
| `SendMessageOptions.modelOverride`                 | `client.ts:142` → `1598` → `turn.run`                              | Durchgängig bis `geminiChat.sendMessageStream(model, …)`  |
| Hook‑Ebene `modelOverrideRef` (für Skill‑Modellwahl) | `useGeminiStream.ts:376`, `2225`, `1841`                            | Durchgängig                                                |
| Fast‑Model **nicht‑streaming** Side‑Query (Vorläufer) | `services/toolUseSummary.ts:108` (via `runSideQuery`)              | Live, beweist funktionierende Fast‑Model‑Konfiguration; **aber nicht‑streaming** |
| Fast‑Model **streaming** Vorläufer                 | `followup/speculation.ts:224`                                       | Live, aber **mit forked chat** (`createForkedChat`), getrennt vom Haupt‑Chat |

**Kritische Lücke**: **Kein Produktionscode** nutzt das Fast‑Model für Streaming im Haupt‑Chat. D2 ist der erste Fall; vorher muss ein Validierungsexperiment durchgeführt werden (siehe § 3.2 Vorbedingungen).

---

## 2. Entwurfsprinzipien

1. **Allgemeingültigkeit**: Der Ansatz ist nicht an ein bestimmtes Tool/Skill gebunden.
2. **Abwärtskompatibilität**: Vorhandene Tools funktionieren ohne Änderungen weiter.
3. **Inkrementell + explizite Signale**: Die Standardstrategie ist konservativ; Optimierungen werden von Tool‑Autoren über explizite Felder aktiviert.
4. **Rückrollbarkeit**: Alle Optimierungen werden über Feature‑Flags gesteuert; auf Benutzerebene kann der Nutzer Optimierungen erzwingen oder deaktivieren.
5. **Ehrlicher Trade‑Off**: Qualitätsrisiken, Kostenrisiken und Anwendungsgrenzen werden klar benannt.

---

## 3. Optimierungsansätze

### 3.1 Ansatz 1: Tool‑Resultat‑Nachverarbeitungsanweisung (Post‑Execution Directive)

#### Problem

Das aktuelle `ToolResult` enthält keinerlei Informationen darüber, „was als nächstes zu tun ist“. Unabhängig davon, ob das Tool‑Ergebnis selbsterklärend ist, wird stets bedingungslos eine LLM‑Runde ausgelöst.

#### Entwurf

Erweiterung des `ToolResult`‑Interface (`packages/core/src/tools/tools.ts` L422):

```typescript
export interface ToolResult {
  llmContent: PartListUnion;
  returnDisplay: ToolResultDisplay;
  error?: { message: string; type?: ToolErrorType };

  // Neu: Nachverarbeitungsanweisung
  postExecution?: {
    /**
     * Das Tool‑Ergebnis wird nicht an das LLM zurückgegeben, sondern direkt
     * als endgültige Antwort angezeigt.
     * Geeignet für Ergebnisse, die vollständig selbsterklärend sind und
     * keine erneute Interpretation durch das Modell erfordern.
     * Ist eine lokale Eigenschaft von ToolResult.
     */
    skipLlmRound?: boolean;

    /**
     * Das Tool‑Ergebnis ist „selbsterklärend und direkt dem Benutzer anzeigbar“ –
     * d. h. `returnDisplay` ist bereits die vom Benutzer erwartete endgültige
     * Darstellung, die keine Modell‑Nachbearbeitung benötigt.
     * Ist eine lokale Eigenschaft von ToolResult und **sagt nicht** voraus,
     * ob die nächste Runde eine Zusammenfassung sein wird.
     * Wirkt mit Ansatz 3 (Darstellungsentkopplung) zusammen: true → Übergang in
     * den Zustand „Zusammenfassend“, der Benutzereingabe erlaubt.
     */
    resultIsTerminal?: boolean;
  };
}
```

> **Entwurfskorrektur**: Eine frühere Version hatte das einzelne Feld `selfExplanatory` sowohl für die „Eigenschaft des Werkzeugs“ als auch als „Signal für den Dialogfluss“ verwendet. Beide Aufgaben überschneiden sich jedoch nicht (Beispiel: Benutzer fragt „Lies X und repariere dann Y“; die Ausgabe von `read_file` ist selbsterklärend, aber die nächste Runde ist offensichtlich keine Zusammenfassung). **Das Vorhersagesignal gehört zu den globalen Eigenschaften des Dialogflusses** und sollte nicht über Tool‑Felder ausgedrückt werden – D2 ersetzt dies vollständig durch heuristische Dialogflusssignale (siehe § 3.2).

#### Verhaltensänderung

In `handleCompletedTools` wird eine neue Prüfung eingefügt:

```
Batch von Tools abgeschlossen
  → Prüfe bei allen Tools der Batch, ob postExecution.skipLlmRound gesetzt ist
  → Alle auf true?
    → JA: markToolsAsSubmitted, rufe submitQuery nicht auf, gehe direkt in Idle
    → NEIN: Behalte das bisherige Verhalten bei (submitQuery)
```

**Wichtige Einschränkung**: `skipLlmRound` wirkt nur, wenn **alle Tools der aktuellen Batch** `skip` deklarieren. Bei einer gemischten Batch wird weiterhin `submitQuery` aufgerufen.

#### Historische Invarianten

Nach dem Überspringen der LLM‑Runde sieht die Historie so aus: `user → function_call → function_response → <kein assistant>`.

- Überprüfen, ob `repairOrphanedToolUseTurnsInHistory` (wird beim Session‑Laden aufgerufen) diese Form toleriert
- Überprüfen, wie sich die Auto‑Compaction verhält, wenn kein Assistant‑Text vorhanden ist
- PR #4176 hat die Invariante von tool_use↔tool_result gerade erst geschlossen; vor dem Ausrollen sollten Unit‑Tests die Alternierung „skip → nächste Benutzernachricht“ abdecken
- Qwen / OpenAI‑Stil APIs tolerieren dies; Anthropic verlangt strikte Alternierung – falls später eine direkte Anthropic‑Anbindung unterstützt wird, ist ein Fallback nötig (leeren Assistant‑Text in die Historie einfügen)
> **Einheitlicher Fixpunkt**: Hier und in §3.3 (D3 Unterbrechung des Zusammenfassens während) wird **das gleiche historische Invariante** verletzt. Reparatur: eine von zwei Optionen (leeren assistant einfügen / Qwen-Toleranz akzeptieren) – beide Richtungen müssen die gleiche Wahl verwenden.

#### Signal-Ökosystem (Phase 2 Arbeit)

| Werkzeug                            | `skipLlmRound`       | `resultIsTerminal` | Anmerkung                                                                      |
| ----------------------------------- | -------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `read_file`                         | in Kombination mit query-only Szenario | true               | Dateiinhalt ist die Antwort                                                    |
| `cat` (via shell)                   | je nach Szenario     | true               | wie read_file                                                                  |
| `grep` / `glob` / `ls`              | false                | **false (Standard)** | Ergebnisse erfordern oft Modellauswahl/Sortierung/Zusammenfassung; Skill-Ebene setzt bei explizitem "reine Abfrage"-Szenario auf true |
| `git status` / `git log` (via shell)| false                | true               | Ausgabe bereits formatiert                                                     |
| Skill-Werkzeuge                     | entscheiden selbst   | entscheiden selbst | Abfrage-Skills tendieren zu true                                               |
| MCP-Werkzeuge                       | default false        | default false      | explizit per allowlist opt-in                                                  |

Drittanbieter-/MCP-Werkzeuge sind nicht vertrauenswürdig, standardmäßig kein Flag; explizit über `config.toolPostExecAllowlist` aktivieren.

> `grep/glob/ls` standardmäßig false ist eine strenge Wahl: vermeidet Fehleinschätzung von D2/D3 in Szenarien, die Modellzusammenfassung/Sortierung erfordern.

#### Anwendbar und nicht anwendbar

- **Anwendbar**: Endzustandsabfragen (read/cat/print-Typ), eigenständige Ergebnisse (Skill bereits formatierte Ausgabe)
- **Nicht anwendbar**: Zwischenschritte bei mehrstufigen Aufgaben, Schreibbestätigungen, komplexe zu interpretierende Logs

#### Risiken und Abschwächung

| Risiko                                                    | Schweregrad | Abschwächung                                                              |
| --------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| Falsche Einstellung von `skipLllmRound` durch Werkzeug bricht mehrstufige Aufgaben ab | Mittel      | Batch-Semantik + llmContent bleibt im Verlauf wiederherstellbar           |
| Missbrauch von Drittanbieter-Werkzeugen                   | Mittel      | MCP standardmäßig deaktiviert, allowlist explizit freischalten            |
| Verletzung historischer Invarianten                       | Mittel      | Unit-Tests vor Auslieferung; Session-Load-Playback abdecken               |
| Benutzererwartung inkonsistent (Zusammenfassung erwartet, aber nicht erhalten) | Gering      | `alwaysSummarize: true` in Einstellungen überschreibbar                   |

#### Nutzen

Endzustandsabfragen sparen 3–4s (letzte LLM-Runde überspringen).

---

### 3.2 Richtung 2: Fast-Modell-Routing-Strategie für die Zusammenfassungsrunde

#### Positionierung

**Diese Richtung führt keine neue Pipeline ein, erweitert aber das GeminiChat-Interface, um Modellwechsel zur Laufzeit zu unterstützen**.

Die Infrastruktur von §1.4 bietet Fast-Modell-Konfiguration und Ende-zu-Ende-Durchverbindung von `modelOverride`, aber **die Ausführung des Haupt-Chats auf dem Fast-Modell + Streaming hat keinen Präzedenzfall**. Erforderlich sind:

- Entscheidungsfunktion: Wann `config.getFastModel()` als Override weitergeben
- Sicherer Fallback: Neue Schnittstelle `GeminiChat.retryStreamWithModel` (behandelt internen Zustand des Chats)
- Experimentelle Validierung: Haupt-Chat-Umschaltung zwischen Fast/Primary-Modell zerstört nicht Compaction / History-Recording

#### Anwendungsbereich

D2 wirkt nur auf:

- **useGeminiStream** (Haupt-TUI-Pfad) – `sendMessageStream`-Aufrufpunkt L1841
- **ACP Session** (IDE-Integrationspfad) – `acp-integration/session/Session.ts:1182`, Phase 3 Synchronumbau

D2 **wirkt nicht** auf folgende Pfade, um in nicht-interaktiven oder eigenständigen Kontexten keine zusätzlichen Fehlermodi einzuführen:

- **Subagent-Laufzeit** (`agents/runtime/agent-core.ts:614`): Sub-Agent hat bereits eigene Modellkonfiguration
- **Cron-getriggerter Turn** (`SendMessageType.Cron`, client.ts:127): Nicht interaktiv, keine RT-Dringlichkeit
- **Benachrichtigungs-Turn** (`SendMessageType.Notification`, client.ts:129): Ebenso

#### Kernherausforderung

Zum Zeitpunkt des `submitQuery`-Aufrufs **wissen wir nicht**, ob das Modell nach dem Betrachten des Ergebnisses ein neues Werkzeug startet oder direkt Text ausgibt. Wenn wir das Fast-Modell verwenden, das Modell aber tatsächlich ein Werkzeug aufrufen müsste, ist die Folge **still**: Das Fast-Modell könnte das falsche Werkzeug aufrufen oder Parameterfehler machen – der Fehler hätte kein deutliches Signal.

**Kein Feld auf Werkzeugebene kann zuverlässig vorhersagen**, ob die nächste Runde eine Zusammenfassung ist, weil dies vom Gesprächsfluss (Benutzeraufforderung + akkumulierter Kontext) abhängt, nicht von lokalen Eigenschaften des Werkzeugergebnisses. Beispiel:

```
Benutzer: "Lies utils.ts und ersetze dann alle console.log durch logger.info"
  → Werkzeug 1: read_file → Ergebnis eigenständig
  → Aber nächste Runde ist offensichtlich keine Zusammenfassung
```

Daher verlässt sich D2 vollständig auf **Gesprächsfluss-Heuristiken**, nicht auf Werkzeugfelder.

#### Entscheidungsfunktion: Gesprächsfluss-Heuristik + Veto

```typescript
import { Kind, MUTATOR_KINDS } from '../tools/tools.js';

function selectContinuationTier(
  turn: Turn,
  userPrompt: string,
  batch: ToolCall[],
): 'fast' | 'primary' {
  // ===== Benutzerebene Zwangsschalter (höchste Priorität) =====
  const userPref = config.getSummaryTierStrategy();
  if (userPref === 'always_primary') return 'primary';
  if (userPref === 'always_fast') return 'fast'; // unterliegt immer noch Laufzeit-Bedingungen

  // ===== Benutzerabsicht Veto =====
  // 1. Benutzeraufforderung enthält Aktionsverben → nächste Runde wahrscheinlich Werkzeugaufruf
  if (requestImpliesFurtherAction(userPrompt)) return 'primary';

  // 2. Aktuelle Runde enthält bereits ein Mutator-Werkzeug → wahrscheinlich Überprüfung/Lesen danach
  if (batch.some((c) => MUTATOR_KINDS.includes(c.tool.kind))) return 'primary';

  // 3. Aktuelle Runde oder Historie hat ungelöste Fehler → Modell benötigt Primary-Diagnose
  if (hasUnresolvedError(turn.toolResults, batch)) return 'primary';

  // ===== Ausgabekomplexität Veto =====
  // 4. Benutzeraufforderung verlangt tiefgehende Analyse (Erklärung/Vergleich/Warum-Fragen)
  if (needsDeepReasoning(userPrompt)) return 'primary';

  // 5. Werkzeugaufrufe umfassen ≥3 verschiedene Werkzeuge → Ergebnisübergreifende Erzählung erfordert Primary
  if (needsCrossResultReasoning(turn)) return 'primary';

  // 6. Werkzeugausgabe zu lang → Lange Inhaltszusammenfassung erfordert Primary
  if (estimateTotalToolOutputTokens(turn) > 4000) return 'primary';

  // ===== Machbarkeit des Modells Veto =====
  // 7. Context Window des Fast-Modells nicht ausreichend → Umschalten auf Fast löst Kompression aus
  //    (Kompression selbst benötigt LLM-Aufruf, verlangsamt und verteuert)
  if (wouldTriggerCompression(turn.history, config.getFastModel()))
    return 'primary';

  // ===== Mehrsprachigkeits-Absicherung =====
  if (!isPromptLanguageSupported(userPrompt)) return 'primary';

  // ===== Session-Status-Absicherung =====
  if (turn.justCompacted || turn.justCleared) return 'primary';

  return 'fast';
}
```

Bedeutung der acht Veto-Items:

- **`requestImpliesFurtherAction`**: Aktionsverben (`改|删|加|替换|修复|实现|新建|create|fix|change|add|remove|implement|write|update`) → mehrstufige Aufgabe
- **`MUTATOR_KINDS` Treffer**: Aktuelle Runde hat bereits Änderungen vorgenommen → wahrscheinlich folgt Lesen/Überprüfung. **Wiederverwendung von `MUTATOR_KINDS = [Edit, Delete, Move, Execute]` aus `tools.ts:806`** (die `kind: Kind`-Eigenschaft jeder Tool-Instanz ist die autoritative Klassifikation, kein neues `isWriteTool`)
- **`hasUnresolvedError(turnResults, currentBatch)`**: Zweistufige Bewertung –
  - **Aktueller Batch mit Fehler → immer ungelöst** (geht nicht davon aus, dass parallele Batches sich selbst korrigieren können)
  - **Historie dedupliziert nach `(toolName, args fingerprint)`, letzter immer noch Fehler gilt als ungelöst** (nur nach toolName würde bei selben Name unterschiedlichen Parametern falsch klassifizieren)
  - Shell etc. müssen `ToolResult.error` korrekt setzen (Abhängigkeit von Datenqualität des Vorgängers)
- **`needsDeepReasoning`**: Enthält Schlüsselwörter wie "分析/解释/为什么/对比/诊断" (Analyse/Erklärung/Warum/Vergleich/Diagnose)
- **`needsCrossResultReasoning`**: Unterschiedliche Werkzeugaufrufe ≥3 (gleiches Werkzeug gleicher Parameter zählt als einer)
- **Ausgabetokens > 4000**: Empirischer Schwellwert, **nach Baseline-Messung mit Fast-Modell anpassen**
- **`wouldTriggerCompression`**: Context Window des Fast-Modells ist normalerweise kleiner als das des Primary; gleiche Historie löst beim Fast-Modell früher `tryCompress` aus (geminiChat.ts:1418) – Kompression selbst erfordert einen LLM-Aufruf, könnte **RT und Kosten verschlechtern**. Budgetschätzung: `estimateHistoryTokens(history) > fastModelContextWindow × COMPACTION_THRESHOLD` gilt als Auslöser.
- **Nicht unterstützte Sprache**: Erkennt nur Schlüsselwörter auf Chinesisch/Englisch; andere Sprachen (Japanisch/Koreanisch etc.) standardmäßig Primary.
- **Session-Status-Änderung**: Erste Fortsetzung nach `/compact` oder `/clear` → Primary zum Wiederaufbau des mentalen Modells.
`**Ablehnungsrichtung** bevorzugt **primary** (lieber 2s mehr, aber keine Qualitätseinbußen).

#### Schlüsselimplementierung: `GeminiChat.retryStreamWithModel`

**Problem**: Direktes Abbrechen + Aufrufen von `client.sendMessageStream` zerstört den Chat-Zustand:

1. `geminiChat.ts:1428` schiebt beim Start des Streams `userContent` in den Verlauf; ein Neustart würde es **erneut pushen**, was zu doppelten `function_response` Einträgen im Verlauf führt.
2. `sendPromise` Lock (`geminiChat.ts:1392, 1398`) – nach dem Abbrechen muss sichergestellt sein, dass `streamDoneResolver` aufgerufen wird.
3. `pendingPartialState` und andere durch PR #4176 eingeführte Invariant-Marker müssen ordnungsgemäß bereinigt werden.
4. Die model-Eigenschaft des Telemetry-Spans muss aktualisiert werden.

**Neues Interface** (`packages/core/src/core/geminiChat.ts`):

```typescript
/**
 * Wiederholt einen laufenden oder gerade abgebrochenen Streaming-Send mit einem anderen Modell.
 * PUSHT userContent NICHT erneut (bleibt vom ursprünglichen Send erhalten).
 * Setzt pendingPartialState zurück; gibt den veralteten sendPromise frei; öffnet den Span neu.
 */
async retryStreamWithModel(
  model: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>;
```

Aufrufvertrag:

- Nur aufrufen, nachdem der ursprüngliche Send bereits abgebrochen wurde (kein gleichzeitiger Aufruf)
- prompt_id wird wiederverwendet (gleiche Benutzerabsicht)
- Bereits in den Verlauf gepushter userContent wird nicht erneut gepusht

Implementierungsaufwand ca. 1,5 Arbeitstage inkl. Unit-Tests.

#### Laufzeit-Sicherheitsnetz

`selectContinuationTier` gibt `'fast'` zurück, aber im Stream erscheint ein `ServerGeminiEventType.ToolCallRequest` Ereignis → **Sofortiges Abbrechen des aktuellen Streams, Aufruf von `retryStreamWithModel(primaryModel)`**.

Dies deckt den einzigen stillen Fehlleitungsfall ab, in dem "als Zusammenfassung vorhergesagt, aber tatsächlich wird ein Tool benötigt". Kosten: Verschwendete Tokens eines fast-Aufrufs (Kostenzuordnung siehe §5.3).

#### Entkopplung von skill `modelOverride`

`useGeminiStream.modelOverrideRef` (L376, L2225) trägt derzeit das **vom skill explizit ausgewählte Modell** und hat "Geschäftssemantik". Das fast-Routing dieser Richtung hat "Optimierungssemantik". Beide **müssen getrennt werden**:

```typescript
// Neuer unabhängiger Ref
const summaryTierRef = useRef<'fast' | 'primary' | undefined>(undefined);

// Aufrufstelle zusammenführen (modelOverrideRef wird nicht wiederverwendet)
const stream = geminiClient.sendMessageStream(
  finalQueryToSend,
  abortSignal,
  prompt_id!,
  {
    type: submitType,
    notificationDisplayText: metadata?.notificationDisplayText,
    modelOverride:
      modelOverrideRef.current ?? // Skill explizite Auswahl hat Vorrang
      (summaryTierRef.current === 'fast' ? config.getFastModel() : undefined),
  },
);
```

Lebenszyklus:

| Zeitpunkt                                   | `modelOverrideRef` (Skill) | `summaryTierRef` (fast-Routing)            |
| ------------------------------------------- | --------------------------- | ---------------------------------------- |
| Neuer User-Turn (`!Retry && !ToolResult`)   | Löschen                     | Löschen                                  |
| Skill-Tool gibt `modelOverride` Feld zurück | Schreiben                   | Unverändert                              |
| Tool-Batch abgeschlossen → `selectContinuationTier` | Unverändert          | Schreiben                                |
| Runtime-Fallback (ToolCallRequest gesehen)  | Unverändert                 | Upgrade auf `'primary'`                  |
| Retry (Benutzer manuell Ctrl+Y)             | Behalten                    | Upgrade auf `'primary'` (fast fehlgeschlagen, erneut fast) |

Die explizite Auswahl eines Skills **gewinnt immer** – die explizite Absicht des Benutzers hat Vorrang vor der Optimierungsstrategie.

#### Telemetrie-Korrektur

Der interaction-Span in `client.ts:1303` zeichnet die `model`-Eigenschaft beim Start des Turns auf. Wenn ein Fallback ausgelöst wird, ändert sich das tatsächliche Modell, was die Span-Daten verfälscht. Erforderlich:

```typescript
// Beim Auslösen des Fallbacks
span.setAttribute('llm.model.requested', fastModel);
span.setAttribute('llm.model.actual', primaryModel);
span.setAttribute('llm.fallback.reason', 'tool_call_seen');
```

Und in `addUserPromptAttributes` zwischen `requested` / `actual` Modell unterscheiden, um Abrechnungs-/Prüfungsverwirrung zu vermeiden.

#### Benutzerkontrollierter erzwungener Schalter

Neue Einstellung (`packages/cli/src/config/settingsSchema.ts`):

```typescript
summaryTierStrategy: 'auto' | 'always_primary' | 'always_fast';
// Standard: 'auto'
```

- `'auto'`: Verwendet `selectContinuationTier` (empfohlen)
- `'always_primary'`: Deaktiviert die D2-Optimierung vollständig (produktionskritische Szenarien)
- `'always_fast'`: Überspringt Vetos, **unterliegt weiterhin dem Laufzeit-Sicherheitsnetz** (Power-User)

Begründung: D2 tauscht Qualität gegen Geschwindigkeit; einige Benutzer/Szenarien benötigen ein explizites Opt-Out.

#### Voraussetzungen

- `config.getFastModel()` ist konfiguriert
- **Haupt-Chat fastModel-Streaming-Verifikationsexperiment** (1 Tag vor der Implementierung):
  - Ein Tool mit `resultIsTerminal=true` mocken und im Haupt-Chat wiederholt Summary-Runden auslösen
  - Beobachten, ob `tryCompress` fälschlicherweise ausgelöst wird (das fast-Modell hat ein kleineres Context-Window, könnte früher auslösen)
  - Beobachten, ob die chatRecordingService-Ausgabe Model-Mismatch aufweist
  - Beobachten, ob nach einem einzelnen fast-Aufruf der nächste primary-Aufruf den Verlauf korrekt lesen kann
- **Basis-Messung der Fast-Kandidatenmodelle** (1 Tag):
  - 100 Summary-Runden-Prompts (Eingabe enthält `function_response`) ausführen, P50/P95 End-to-End-Latenz und Time-to-First-Token messen
  - `tryCompress`-Auslöserate `P_compact` messen, Netto-RT-Gewinn verifizieren: `(1 - P_compact) × ΔRT − P_compact × compression_RT > 0`
  - Nur aktivieren, wenn fast P50 ≤ primary P50 × 0.5 und P95 ≤ primary P95 × 0.6
- Fast-Modell und primary-Modell sollten aus derselben Familie stammen (um Kodierungsunterschiede bei `function_response` zu vermeiden); familienübergreifend muss die `getFastModel()`-Schicht ablehnen
- **`thinkingConfig`-Kompatibilität**:
  - Das Fast-Modell muss in der `thinkingConfig.includeThoughts`-Unterstützung mit dem primary-Modell übereinstimmen; oder
  - Der Fast-Pfad erzwingt `includeThoughts: false` (ausgerichtet mit `sideQuery.ts:118-122`)
  - Verifikation: Der Verlauf enthält thought-Elemente. Das Fast-Modell muss diese korrekt verarbeiten (kein Fehler, keine Behandlung als Benutzereingabe)

#### Risiken und Minderungen

| Risiko                                                                 | Schweregrad | Minderung                                                                                                                          |
| ---------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Fast-Modell Tool-Calling leitet still falsch weiter                    | Hoch        | Dialogstrom-Heuristik + Laufzeit-ToolCallRequest abort-Sicherheitsnetz                                                              |
| Fast halluziniert bei Eingabe mit Fehler eine "für den Benutzer sichtbare falsche Antwort" | **Hoch** | `hasUnresolvedError` Veto; Überwachung der Benutzer-Nachfragequote (Anm.: Das gleiche Risiko von `emitToolUseSummaries` betrifft nur 60 Token Labels, dieses Risiko betrifft die endgültige Antwort, von höherer Tragweite) |
| Fast-Pfad löst `tryCompress` aus → ein zusätzlicher LLM-Aufruf, **verschlechtert RT und Kosten gegenteilig** | **Hoch** | `wouldTriggerCompression` Vorhersage-Gate (siehe Entscheidungsfunktion #7); vorherige Basis-Messung des P_compact-Schwellenwerts                                                  |
| Compress verwendet welches Modell                                      | Mittel     | Auslösen der Compression bedeutet Aufgabe des fast-Routings (Gate #7 als Sicherheitsnetz); vermeidet, dass die Antwort fehlerhaft wird |
| Modellwechsel im Haupt-Chat führt zu anomalem internen Zustand / Aufzeichnung | Mittel     | Vorheriges Verifikationsexperiment deckt ab; Session-Resume-Wiederholungstests                                                      |
| D2 und `emitToolUseSummaries` lösen gleichzeitig concurrente fast-Aufrufe aus, über Rate-Limit | Mittel     | Entweder: D2 aktiviert deaktiviert `emitToolUseSummaries` (Titel beeinträchtigt Funktion nicht) oder gemeinsam genutzter Rate-Limit-Token-Bucket |
| `thinkingConfig`-Inkonsistenz zwischen fast/primary führt zu Verlaufsparsierungsfehlern | Mittel     | Gleiche Familie + Fast-Pfad erzwingt `includeThoughts: false` (siehe Voraussetzungen)                                               |
| Fallback-Pfad ist teurer (verschwendete fast-Tokens + vollständiger primary) | Mittel     | Überwachung des `fast_tokens_consumed`-Entscheidungslogs; Fallback-Rate >20% deaktiviert Flag automatisch                          |
| Telemetrie-Span-Modell verfälscht                                      | Mittel     | Aufteilung in `requested` / `actual` (siehe Telemetrie-Korrektur)                                                                  |
| Inkonsistentes Kontextformat (familienübergreifend)                    | Mittel     | `getFastModel()` lehnt familienübergreifende Auswahl ab                                                                             |
| Semantikkonflikt mit Skill-modelOverride                               | Mittel     | Unabhängiger Ref + Skill-Vorrang                                                                                                   |
| Nach Laufzeit-Modellwechsel über `/model` ist `summaryTierRef`-Entscheidung ungültig | Niedrig     | Beim Verarbeiten des `/model`-Befehls `summaryTierRef` synchron löschen                                                                 |
| Fast-Tokens/s sind langsamer                                           | Niedrig     | Bei Tests gleichzeitig TTFT messen, nicht nur Gesamt-RT                                                                             |
#### Nutzen (noch nicht gemessen)

- **RT**: Pro Summary-Runde 2–3 s eingespart (im getesteten Fall wird der PR-Titel nicht vorher geschrieben)
- **Kosten**: Der Preis des Fast-Modells liegt meist deutlich unter dem des Primary. In Szenarien mit häufigen Summaries könnten die Token-Kosten um 30–50 % sinken; der Fallback-Pfad verursacht jedoch etwas Verschwendung, die den Nutzen teilweise aufhebt – mit `fast_tokens_consumed` muss der Nettonutzen gemessen werden.

---

### 3.3 Richtung 3: Ergebnisdarstellung und Interaktion entkoppeln (Presentation Decoupling)

#### Problem

Der Benutzer muss warten, bis die LLM-Summary-Runde abgeschlossen ist, bevor er wieder eingeben kann:

```
Tool abgeschlossen → [Ergebnis rendern] → [submitQuery] → [auf LLM-Streaming-Antwort warten 3–4 s] → Idle → eingabebereit
                                                           ~~~~~~~~~~~~~~~~~~~~~~~~
                                                           Benutzer sieht Ergebnis, kann aber nicht interagieren
```

#### Design

Neuer Zustand `StreamingState.Summarizing`:

```typescript
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
  Summarizing = 'summarizing', // neu
}
```

#### Zustandsmaschinen-Änderung

```
Tool abgeschlossen und Ergebnis angezeigt
  → Falls bei allen Batches postExecution.resultIsTerminal === true:
    → Wechsel zu Summarizing (Benutzer kann eingeben)
    → submitQuery asynchron ausführen
    → LLM-Summary an History anhängen (oder durch neuen Benutzer-Nachricht abgebrochen)
  → Sonst:
    → Responding bleibt (Benutzer kann nicht eingeben)
```

#### Behandlung neuer Benutzer-Nachrichten

- Wenn der Benutzer im Zustand `Summarizing` eine neue Nachricht sendet → aktuelle Summary abbrechen → neue Nachricht verarbeiten
- Bereits erzeugter **partieller Summary-Text wird verworfen** (nicht in History), um halbe Assistant-Turns im Kontext zu vermeiden
- `function_response` bleibt weiterhin in der History (das Modell weiß, dass das Tool ausgeführt wurde)
- Followup-Vorschläge werden erst ausgelöst, wenn Summarizing abgeschlossen oder abgebrochen wurde

#### Aufräumliste für partial text bei Abbruch

Partial text ist an mehreren Stellen verteilt und muss **gleichzeitig** bereinigt werden; fehlt einer, führt das zu inkonsistentem Zustand:

| Position                                                                     | Aufräumaktion                                                                                                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pendingHistoryItemRef.current` (useGeminiStream React State)                | Auf `null` setzen, `addItem` nicht aufrufen                                                                                      |
| Intern kumuliert in `GeminiChat.history`                                     | Falls vor dem Abbruch bereits partielle Assistant-Inhalte gepusht wurden, müssen diese über eine neue `discardPendingAssistant()`-Schnittstelle rückgängig gemacht werden |
| `ChatRecordingService` buffered turn                                         | Als abgebrochen markieren, nicht in JSONL schreiben                                                                              |
| `dualOutput.emitText` (falls aktiviert)                                      | Abbruch-Sentinel senden, Sidecar verwirft selbst                                                                                 |
| `loopDetectorRef` kumulierte Tokens                                          | Zähler für aktuellen Turn zurücksetzen                                                                                           |

Ausführungsreihenfolge: Abbruch-Signal auslösen → obige fünf Stellen bereinigen → erst dann darf eine neue Benutzer-Nachricht in `submitQuery` gelangen. Race-Condition-Test abdecken: Der Abbruch wird genau dann ausgelöst, wenn der letzte Chunk eintrifft.

#### Anwendungsbedingung

Für alle Batches gilt: `postExecution.resultIsTerminal === true`.

#### History-Invariante (gleicher Ursprung wie §3.1)

Ein vorzeitiger Abbruch von Summarizing erzeugt:

```
[user_1, function_call, function_response, user_2]
                                          ↑ kein Assistant-Turn
```

**Das verletzt dieselbe Invariante wie der Überspring der LLM-Runde in §3.1** und muss mit derselben Reparaturstrategie wie für D1 behoben werden (leeren Assistant einfügen / Akzeptieren durch Qwen tolerieren).

- Wiederverwendung der Unit-Test-Abdeckung der Invariante von D1
- Session-Load-Wiedergabe (einschließlich `repairOrphanedToolUseTurnsInHistory`) muss diese Form abdecken
- Anthropic-Alternation: bei Direktverbindung gleichzeitig mit D1 als Fallback absichern

#### Risiken und Abhilfen

| Risiko                                                   | Schweregrad | Abhilfe                                                                                                       |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| Halber Assistant-Turn in History bei Abbruch             | **Mittel**  | Partial text explizit verwerfen; nur function_response behalten; Unit-Test deckt Race-Condition ab            |
| Verletzung der History-Invariante (kein Assistant folgt) | **Mittel**  | Gleiches Problem wie D1, einheitlich reparieren (siehe §3.1 History-Invariante)                               |
| Höhere UI-Zustandskomplexität                            | Mittel      | Summarizing = Idle + Hintergrundaufgabe; Eingabepfad wiederverwendet Idle                                     |
| Wahrgenommener Nutzen hängt vom Verhalten ab             | Niedrig     | Wenn der Benutzer innerhalb von 3 s nichts eingibt, ist die Summary bereits fertig → kein spürbarer Nutzen; aber **keine Verschlechterung** |

#### Nutzen

- **Theoretisches Maximum**: 3–4 s wahrgenommene Reaktionszeit (Benutzer gibt ein, sobald Tool fertig ist)
- **Praktischer Median**: Hängt vom Eingabeintervall des Benutzers ab – Benutzer, die erst nach 2–5 s Lesen des Ergebnisses eingeben, werden keinen Unterschied merken, aber es wird **niemals langsamer**

---

### 3.4 Richtung 4: Streaming-Vorausplanung (Stream-Ahead Scheduling)

#### Problem

`processGeminiStreamEvents` plant Tools erst ein, nachdem der Stream vollständig beendet ist. Das `ToolCallRequest`-Event kann jedoch bereits mitten im Stream auftauchen.

#### Design

Im Stream-Event-Handler für `ToolCallRequest` sofort mit **Vorabvalidierung** (ohne Ausführung) beginnen:

```typescript
case ServerGeminiEventType.ToolCallRequest:
  toolCallRequests.push(event.value);
  scheduler.prevalidate(event.value, signal);  // neu
  break;
```

`CoreToolScheduler.prevalidate(request)`:

1. Tool-Registrierung finden
2. Invocation erstellen
3. `shouldConfirmExecute` ausführen (Ergebnis cachen)
4. Bei `schedule()` direkt das gecachte Ergebnis verwenden

#### Reinheitsvertrag und Allowlist

Für `prevalidate` muss `shouldConfirmExecute` side-effect-frei **und** das Ergebnis darf zwischen prevalidate → schedule nicht durch externe Änderungen ungültig werden.

**Direkt `CONCURRENCY_SAFE_KINDS` aus `tools.ts:818` wiederverwenden**:

```typescript
export const CONCURRENCY_SAFE_KINDS: ReadonlySet<Kind> = new Set([
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
]);
```

Dies ist die bereits existierende Klassifikation „nebeneffektfrei + parallelisierbar“ des Projekts und passt genau auf die Anforderungen von prevalidate.

| Tool-Kind                       | In Allowlist?       | Begründung                                                                                           |
| ------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `Read` (read_file usw.)         | ✅                  | Reine Leseoperation                                                                                  |
| `Search` (grep / glob)          | ✅                  | Reine Leseoperation                                                                                  |
| `Fetch` (web_fetch usw.)        | ✅                  | Fernlesen, keine Schreibnebenwirkungen                                                               |
| `Edit`                          | **❌** (siehe TOCTOU unten) | shouldConfirmExecute ist rein lesend, aber das Diff kann zwischen prevalidate und schedule ungültig werden |
| `Delete` / `Move` / `Execute`   | ❌                  | MUTATOR_KINDS                                                                                        |
| `Think`                         | ❌                  | Enthält implizite Schreiboperationen wie save_memory / todo_write                                    |
| MCP-Tools                       | ❌                  | Nicht vertrauenswürdig                                                                               |
**TOCTOU：Warum Edit nicht in die allowlist aufgenommen wird**

Theoretisch ist `shouldConfirmExecute` von Edit rein lesend (Datei lesen, Diff berechnen). Aber es gibt ein Zeitfenster zwischen Prevalidate und Schedule:

```
T=0      stream erhält Edit(file=a.ts, ...) → prevalidate
T=10ms   shouldConfirmExecute liest a.ts, cached diff_v0
T=300ms  stream endet, scheduler.schedule()
T=305ms   zwischenzeitlich andere Tools/IDE/externe Prozesse ändern a.ts
T=310ms  scheduler zeigt diff_v0 dem Benutzer
T=320ms  Benutzer bestätigt basierend auf v0
T=330ms  Edit wendet alte params auf v1-Datei an → Inhalt beschädigt / Merge fehlgeschlagen
```

Das ist ein TOCTOU. Korrekturrichtung:

- **A (empfohlen)**: Edit kommt nicht in die allowlist, prevalidate deckt nur die drei `CONCURRENCY_SAFE_KINDS` ab. Kosten: Gewinn sinkt von "50-200ms (Edit-dominiert)" auf "50-100ms (nur lesende Typen)"
- **B (optional verstärkend)**: Edit kommt in die allowlist, aber der Cache wird mit `(mtime, size, content_hash)` versehen; bei `schedule()` wird geprüft, ob sich nichts geändert hat, sonst Neuberechnung

Dokument wählt vorerst A.

#### Interaktion mit bestehender paralleler Planung

`coreToolScheduler.attemptExecutionOfScheduledCalls` (L2436+) verwendet `partitionToolCalls`, um Tools in "parallel sichere Batches" und "serielle Batches" aufzuteilen; parallele Batches werden über `runConcurrently` (L2473) ausgeführt.

Prevalidate muss mit diesem Batch-Modell übereinstimmen:

- Cache wird nach `callId` indiziert (nicht nach `(toolName, args)`, um Konflikte bei gleichnamigen parallelen Aufrufen zu vermeiden)
- Ein fehlgeschlagener prevalidate-Call → beeinträchtigt keine anderen Calls; beim Schedule geht dieser Call den ursprünglichen `shouldConfirmExecute`-Pfad
- Bei Stream-Abbruch werden alle in-flight-Prevalidates per `signal`-Kaskade abgebrochen

#### Risiken

| Risiko                                                                         | Schweregrad | Minderung                                                                                 |
| ------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------- |
| Cache-Diff stimmt nicht mit der tatsächlichen Datei bei Bestätigung überein (TOCTOU)| Hoch        | Lösung A: Edit nicht in allowlist; Lösung B: Cache mit `(mtime, size, hash)`-Prüfung       |
| Prevalidate-Fehler beeinträchtigt Planung                                      | Niedrig     | Fehler/Timeout fallen zurück auf ursprünglichen `shouldConfirmExecute`-Pfad; fehlender Cache ≡ nicht aktiviert |
| Parallele Prevalidates teilen sich fd / Ressourcenkonflikte                    | Niedrig     | `QWEN_CODE_MAX_TOOL_CONCURRENCY` begrenzt Parallelität (Standard 10)                      |

#### Nutzen

50-100ms/Runde (nur `CONCURRENCY_SAFE_KINDS`-Bereich). Falls Lösung B mit Edit gewählt würde, theoretischer Nutzen 100-200ms.

---

## 4. Gesamtbewertung und Roadmap

### 4.1 Gesamtbewertung

| Richtung                       | RT-Gewinn                     | Implementierungskomplexität | Qualitätsrisiko | Abhängigkeiten                              | Priorität |
| ------------------------------ | ----------------------------- | --------------------------- | --------------- | ------------------------------------------- | --------- |
| D1 Tool-Post-Execution-Direktive | 3-4s/Endzustand-Runde         | Niedrig (2-3d)              | Niedrig         | Keine                                       | **P0**    |
| D2 Summary-Fast-Route          | 2-3s/Summary-Runde (muss gemessen werden) | **Mittel-Hoch (9d)**       | Mittel-Hoch     | D2 eigene Heuristik + Haupt-Chat-Validierungsexperiment + ACP-Synchronisation | **P1**    |
| D3 Entkopplung der Anzeige     | 3-4s Wahrnehmungsverbesserung (abhängig vom Benutzerverhalten) | Mittel (3-5d, inkl. Invarianten-Fixes) | Mittel          | D1 Historische Invarianten-Fixes            | **P1**    |
| D4 Vorzeitige Streaming-Planung| 50-200ms/Runde                | Hoch (5-7d)                 | Sehr niedrig    | Keine                                       | P2        |

#### D2 Arbeitsaufwand im Detail

| Teilaufgabe                                                                                                      | Schätzung |
| ---------------------------------------------------------------------------------------------------------------- | --------- |
| Haupt-Chat fastModel-Streaming-Validierungsexperiment (inkl. P_compact-Messung)                                   | 1d        |
| Basismessung der Fast-Kandidatenmodelle (inkl. TTFT, P95, `thinkingConfig`-Kompatibilität)                        | 1d        |
| Integration von `selectContinuationTier` + `summaryTierRef` (useGeminiStream)                                      | 0.5d      |
| Heuristik-Implementierung (inkl. `MUTATOR_KINDS`-Wiederverwendung / `wouldTriggerCompression`-Schätzung / Mehrsprachigkeit / Zustandsänderungen) | 1d        |
| Implementierung der `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`-Schnittstelle                  | 1.5d      |
| ACP-Session-Synchronisationsumbau (acp-integration/session/Session.ts)                                          | 1d        |
| Telemetry-Span-Korrektur (`requested`/`actual`-Aufteilung)                                                        | 0.5d      |
| User-level-Setting `summaryTierStrategy` + JSON-Schema + `/config`-Integration                                    | 0.5d      |
| Unit-Tests (Race-Abstände, Abort-Timing, History-Invarianten, Fallback-Pfade, ACP-Pfade)                        | 2d        |
| **Gesamt**                                                                                                       | **9d**    |

> Hinweis: Die frühere Schätzung von 6,5d enthielt nicht die Kosten für ACP-Pfad, `wouldTriggerCompression`-Gate, Aufräumliste, Settings-Schema-Engineering usw.

### 4.2 Implementierungs-Roadmap

#### Phase 1: D1 Tool-Post-Execution-Direktive (1 Woche)

- Erweiterung von `ToolResult.postExecution` (tools.ts L422): `skipLlmRound` + `resultIsTerminal`
- `handleCompletedTools` implementiert `skipLlmRound`-Kurzschluss (useGeminiStream.ts L2038)
- Unit-Tests decken History-Invarianten ab
- **Phase 1 konsumiert `resultIsTerminal` nicht** (bleibt für Phase 3)

#### Phase 2: Signal-Ökosystem-Aufbau (2 Wochen, parallel zu Phase 4)

- Eingebaute Tools werden nach und nach mit `skipLlmRound` / `resultIsTerminal` markiert (siehe §3.1-Tabelle)
- Markierungsabdeckung ≥60% validieren (gewichtet nach Turns, nicht nach Aufrufanzahl)
- Produktionsdaten sammeln, Schwellenwerte des §3.2 Veto-Gates kalibrieren
- Am Ende von Phase 2: Haupt-Chat-Validierungsexperiment und Basismessung aus §3.2 durchführen

#### Phase 3: D2 + D3 (ca. 3 Wochen, inkl. ACP-Synchronisation)

> **Korrektur**: Die frühere Roadmap schätzte 1 Woche, ohne fastModel-Streaming-Validierungsexperiment, `retryStreamWithModel`-Implementierung, einheitliche Invarianten-Fixes, ACP-Pfad-Synchronisation.

- Vor dem Codieren: Haupt-Chat-Validierungsexperiment + Basismessung abschließen (inkl. `P_compact` und thinkingConfig-Kompatibilität)
- Neues `summaryTierRef` + `selectContinuationTier` (inkl. `wouldTriggerCompression`-Gate)
- Neues `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`
- **ACP-Session-Pfad parallel umbauen** (acp-integration/session/Session.ts) unter Verwendung derselben Entscheidungsfunktion
- Neues `StreamingState.Summarizing` + Wiederverwendung des Eingabepfads + Abbruch-Aufräumliste
- Einheitliche Fixes der History-Invarianten (D1+D3 gleiche Quelle)
- Feature-Flag `experimental.summaryRoundFastModel: false`, **Standardmäßig deaktiviert in Release N**
- User-Setting `summaryTierStrategy`
- Telemetry-Span-Korrektur
- Laufzeit-Absicherung (ToolCallRequest-Abbruch + retryStreamWithModel)

#### Phase 4: D4 Vorzeitige Streaming-Planung (kann unabhängig eingefügt werden)

- `CoreToolScheduler.prevalidate` + allowlist
- `processGeminiStreamEvents` inkrementelle Planung
---

## 5. Metriken, Abnahme und Einschränkungen

### 5.1 Leistungskennzahlen

| Kennzahl                         | Basis | Phase 1 | Phase 3                   |
| -------------------------------- | ----- | ------- | ------------------------- |
| End-to-End RT P50 (3 Runden Loop) | 13,4s | <10s    | <8s (noch zu messen)      |
| End-to-End RT P95                | -     | <13s    | <12s (Fallback-Pfad-Obergrenze) |
| Nutzerwahrnehmung – Zeit bis erstem Ergebnis P50 | 13,4s | <10s    | <5s (D3 aktiv)            |
| Nutzerwahrnehmung – Zeit bis erstem Ergebnis P95 | -     | <13s    | <8s                       |
| LLM-Aufrufe (bei überspringbaren Szenarien) | 3     | 2       | 2 (schneller)             |

> Hinweis: Die Basislinie ist eine einzelne Messung; vor dem Deployment müssen ≥3 Szenarien nachgeholt werden.

### 5.2 Qualitätskennzahlen

| Kennzahl                                         | Basis | Erlaubte Verschlechterung |
| ------------------------------------------------ | ----- | ------------------------- |
| Tool-Calling-Genauigkeit (fast model summary-Runde) | 100%  | ≥98%                      |
| skipLlmRound-Fehlernutzung (Nutzer fragt nach „detaillierter") | -     | <1%                       |
| Fast model fallback_triggered-Rate               | -     | <10% (>20% deaktiviert Flag automatisch) |
| Summarizing-Zustand: Halbsatz-Assistent in History | 0     | 0 (zwingend)              |

### 5.3 Kostenkennzahlen

| Kennzahl                                    | Basis | Phase 3 Ziel                                                 |
| ------------------------------------------- | ----- | ------------------------------------------------------------ |
| Token-Kosten pro tausend Sitzungen (summary-Runde) | 100%  | <70%                                                         |
| Anteil verschwendeter Tokens durch Fallback-Pfad | 0     | <15% (Fallback-Rate × einzelne Fast-Tokens / einzelne Primary-Tokens) |

### 5.4 Schema für Entscheidungslogs

Jede entscheidende Bewertung von `selectContinuationTier` und `handleCompletedTools` schreibt ein strukturiertes Log:

```
{
  turn_id, prompt_id,
  decision: 'skip' | 'fast' | 'primary',
  tier_requested: 'fast' | 'primary',          // Entscheidung (vor Fallback)
  tier_actual:    'fast' | 'primary',          // Tatsächlich ausgeführt (nach Fallback)
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
  fast_ttft_ms, primary_ttft_ms,                // Bei Fallback doppelt
  fast_tokens_consumed: int,                    // Durch Fallback verschwendete Tokens (Kostenzuordnung)
  total_rt_ms,
  fallback_triggered: bool,
  fallback_reason: 'tool_call_seen' | 'timeout' | 'error' | null,
}
```

Zu beobachtende Kennzahlen:

- Fast-Trigger-Rate (erwartet 30-50%)
- fallback_triggered-Rate (erwartet <10%; >20% deutet darauf hin, das Standard-Flag im nächsten Release zu deaktivieren)
- Anteile der einzelnen Veto-Gründe (Erkennung von zu streng / zu lax)
- fast_tokens_consumed × fallback_rate (Kostenrisiko in die entgegengesetzte Richtung)
- Häufigkeit von Nutzer-Nachfragen „detaillierter" (Signal für Qualitätsrückgang bei Fast)

**Hinweis zur Messung von `fast_tokens_consumed`**:

Ein abgebrochener Stream erhält **mit hoher Wahrscheinlichkeit weder `finishReason` noch `usageMetadata`** – letztere werden nur bei vollständigem Stream-Ende gefüllt. Die Implementierung muss schätzen:

- Bevorzugt: Vor dem Abbruch versuchen, `stream.return()` aufzurufen, damit der Generator den finally-Pfad durchläuft und ggf. eine partielle Nutzung erhält.
- Fallback: Kumulierte Textlänge der bereits empfangenen Chunks × 4 zur Schätzung der Output-Tokens; Input-Tokens anhand des Verlaufs schätzen.
- Kennzeichnung: Das Log-Feld mit `tokens_source: 'usage' | 'estimated'` versehen; in der事后analyse unterscheiden.

### 5.5 Validierungsmethoden und Veröffentlichungsstrategie

#### Validierung

- Wiederverwendung des `/tmp/tool-timing.log`-Timing-Frameworks
- Neu: `T_userIdle` (Zeitpunkt, zu dem der Nutzer erneut eingeben kann)
- Neu: `T_firstToken` (Zeitpunkt des ersten Stream-Tokens)
- A/B-Tests, die die RT- und Kostenverteilung vor und nach jeder Phase vergleichen

#### Veröffentlichungsstrategie (angepasst an lokales CLI)

Qwen Code ist ein lokales CLI **ohne Laufzeit-Feature-Flag-Anpassung** – traditionelle „5% / 25% / 100% Canary"-Bereitstellungen sind nicht anwendbar. Stattdessen wird ein **schrittweiser Release-Prozess** verwendet:

| Phase               | Release-Knoten       | Standardwert des Feature-Flags | Auslösebedingung                                             |
| ------------------- | -------------------- | ------------------------------ | ------------------------------------------------------------ |
| Phase 3a: Dogfood   | Release N            | `false`                        | Interne Nutzer aktivieren es selbst mit `summaryTierStrategy=always_fast` |
| Phase 3b: Opt-in Standard | Release N+1 (≥2 Wochen) | `false` (unverändert)         | Entscheidungslogs der Dogfood-Phase erfüllen: Fallback <10%, Netto-RT-/Kostengewinn >0 |
| Phase 3c: Standardmäßig aktiv | Release N+2 (≥4 Wochen) | `true`                         | Keine Qualitätsverschlechterungsmeldungen auf Nutzerebene in Phase 3b |
| Rollback            | Release N+3 (falls nötig) | `true → false`                 | Massiver Fallback >20% oder Qualitätsmetriken verschlechtern sich |

**Rollback-Mechanismus**:

- Keine Laufzeitsteuerung, **Rollback = neues Release mit deaktiviertem Standard-Flag**
- Auf Nutzerebene bietet `summaryTierStrategy=always_primary` stets einen „Exit sofort"-Kanal, unabhängig vom neuen Release
- Die `fallback_rate` / `cost_regression` der Entscheidungslogs werden in jedem Release-Zyklus bewertet, um den nächsten Schritt festzulegen

### 5.6 Bekannte Einschränkungen

1. **Dünne Basisdaten**: Ein einzelner Messdurchlauf deckt nicht alle Aufgabenmuster ab; vor dem Deployment müssen Szenarien ergänzt werden.
2. **Voraussetzung für Fast-Modell**: Kein signifikant schnelleres Modell derselben Familie mit ausreichendem Tool-Calling → D2 wird nicht aktiviert.
3. **`skipLlmRound` ist Qualität gegen Geschwindigkeit**: Das Überspringen des LLMs bedeutet, dass das Modell nicht versteht und korrigiert; nur für deterministische Szenarien geeignet.
4. **D2 ist Qualität+Kosten gegen Geschwindigkeit**: Die Fast-Modell-Qualität ist geringer als die des Primary-Modells; der Fallback-Pfad ist sogar teurer – der Netto-Nutzen muss anhand der Entscheidungslogs gemessen werden.
5. **`tryCompress` kann sich negativ auswirken**: Das Fast-Modell hat einen kleinen Kontext, und die Kompression selbst verbraucht LLM-Aufrufe – das `wouldTriggerCompression`-Gate ist ein notwendiger Schutz.
6. **Die Entkopplung der Anzeige verändert das Interaktionsmodell**: Das neue Modell erfordert Nutzergewöhnung; der tatsächlich wahrgenommene Nutzen hängt vom Nutzerverhalten ab.
7. **Netzwerklatenz nicht kontrollierbar**: Diese Lösung reduziert die Anzahl der Aufrufe, optimiert nicht einzelne Aufrufe.
8. **Anthropic-Direktverbindung nicht abgedeckt**: Die aktuelle Toleranz für Alternation ist auf Qwen/OpenAI-ähnliche APIs angewiesen.
9. **FastModel-Streaming im Hauptchat ist eine Premiere**: Keine Produktionsvorgänger; unabhängige Validierungsexperimente erforderlich.
10. **Lokales CLI ohne Laufzeit-Feature-Flag-Anpassung**: Die Veröffentlichungsstrategie kann nur schrittweise Releases vorantreiben, keine schnelle Canary-Regulierung.
11. **D2 wirkt nur auf den Interaktionspfad**: Subagent/Cron/Notification profitieren nicht, dies ist beabsichtigt.
12. **Langzeitauswirkungen des gemischten Modellverlaufs unbekannt**: Nach Aktivierung von D2 wechseln die Turns innerhalb einer Sitzung zwischen Fast und Primary; die Wiederaufnahme langer Sitzungen und die Kontextkohärenz müssen beobachtet werden.
13. **Gewinn von D4 schrumpft**: Nachdem Edit aus der Allowlist entfernt wurde, deckt Prevalidate nur reine Lesetools ab (50-100ms Gewinn); die 200ms Gewinn durch Edit erfordern das mtime/hash-Prüfmechanismus von Plan B.
### 5.7 Kritische Codestellen

| Datei                                                   | Schlüsselsymbole                                              | Position                  |
| ------------------------------------------------------- | ------------------------------------------------------------- | ------------------------- |
| `packages/core/src/tools/tools.ts`                      | `ToolResult`-Interface                                        | L422                      |
| `packages/core/src/tools/tools.ts`                      | `Kind`-Enum + `MUTATOR_KINDS` + `CONCURRENCY_SAFE_KINDS`      | L793, L806, L818          |
| `packages/core/src/tools/tools.ts`                      | `DeclarativeTool.kind: Kind` (jede Tool-Instanz trägt dies)   | L165                      |
| `packages/core/src/core/client.ts`                      | `SendMessageOptions.modelOverride`                            | L142                      |
| `packages/core/src/core/client.ts`                      | `sendMessageStream`                                           | L1216                     |
| `packages/core/src/core/client.ts`                      | `modelOverride ?? getModel()`                                 | L1305, L1598              |
| `packages/core/src/core/client.ts`                      | `turn.run(model, …)`                                          | L1707                     |
| `packages/core/src/core/geminiChat.ts`                  | `sendMessageStream(model, …)`                                 | L1387                     |
| `packages/core/src/core/geminiChat.ts`                  | `history.push(userContent)`                                   | L1428                     |
| `packages/core/src/core/geminiChat.ts`                  | `sendPromise`-Sperre                                          | L1392                     |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `modelOverrideRef` (Skill wählt Modell)                       | L376, L2225               |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `processGeminiStreamEvents`                                   | L1365                     |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | Aufruf von `sendMessageStream`                                | L1841                     |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `handleCompletedTools`                                        | L2038                     |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `submitQuery(ToolResult, …)`                                  | L2355                     |
| `packages/core/src/services/toolUseSummary.ts`          | Fast-Model-Seitenabfrage (nicht-streamender Präzedenzfall)    | L108                      |
| `packages/core/src/followup/speculation.ts`             | Fast-Model-Streaming (geforkter Chat-Präzedenzfall)           | L224                      |
| `packages/core/src/config/config.ts`                    | `fastModel` + `getFastModel` + `setFastModel`                 | L684, L1987, L2021        |
| `packages/core/src/core/coreToolScheduler.ts`           | `attemptExecutionOfScheduledCalls`                            | L2436                     |
| `packages/core/src/core/coreToolScheduler.ts`           | `runConcurrently` + `partitionToolCalls`                      | L2473                     |
| `packages/cli/src/acp-integration/session/Session.ts`   | Aufruf von `sendMessageStream` (ACP/IDE-Pfad)                 | L705, L965, L1182, L1423  |
| `packages/core/src/agents/runtime/agent-core.ts`        | Subagent `sendMessageStream` (nicht von D2 betroffen)         | L614                      |

---

## 6. Review-Validierungsprotokoll (26.05.2026)

### 6.1 Validierungsmethode

Für die im Design nur **deklarierten, nicht quantifizierten** Annahmen über Datenqualität und Nutzenabschätzungen wurden 4 parallele Explore-Subagenten mit einer reinen Lese-Code-Recherche beauftragt. Jeder Subagent beantwortet genau eine Sachfrage, ohne Bewertung oder Optimierungsvorschläge. Die Recherche basiert auf dem aktuellen `main`-Branch (HEAD: `026f2f768`).

| Validierungsfrage                                                               | Zugehöriger Abschnitt                   |
| ------------------------------------------------------------------------------- | --------------------------------------- |
| F3: Ausfüllrate des `ToolResult.error`-Felds aller aktuellen Tools              | §3.2 Abhängigkeit `hasUnresolvedError`  |
| F4: Tatsächliche Verfügbarkeit von `usageMetadata` nach Stream-Abbruch          | §5.4 Messung von `fast_tokens_consumed` |
| F5: Existenz von "Benutzernachfrage / Klarstellungs"-Instrumentierung           | §5.2 Fast-Qualitätsregressions-Monitor  |
| F6: Tatsächlicher IO-Aufwand von `shouldConfirmExecute` bei `CONCURRENCY_SAFE_KINDS`-Tools | §3.4 Nutzenabschätzung D4               |

### 6.2 Feststellung 1: `hasUnresolvedError`-Heuristik hat 32% Tool-Blindstelle (betrifft D2)

**Sachverhalt**: Von 22 Tools mit Fehlerpfaden füllen **15 (68%) das `ToolResult.error`-Feld korrekt** aus (shell, read-file, write-file, edit, grep, glob, ls, web-fetch, mcp-tool, cron-\* etc. – die zentralen I/O-Tools sind vollständig), während **7 (32%) den Fehler nur in den `llmContent`-String packen**: `askUserQuestion`, `monitor`, `skill`, `lsp`, `exitPlanMode`, `todoWrite` u. a.

Es existiert **kein** einheitlicher `createErrorResult`-Helper; jedes Tool implementiert die Fehlerkonstruktion eigenständig.

**Auswirkung auf das Design**:

- Wenn der Veto-Mechanismus aus §3.2 (`hasUnresolvedError`) nur das `ToolResult.error`-Feld prüft, **wird ein Fehler dieser 7 Tools niemals das Umschalten auf primary auslösen** – die nächste Runde wird trotzdem an das Fast-Modell geroutet.
- Besonders der **Fehler des `skill`-Tools, der vom Fast-Modell falsch zusammengefasst wird**, stellt ein hohes Risiko dar (viele Skill-gesteuerte Workflows in diesem Repository wären betroffen).
- Die in §3.2 aufgeführten "shell etc. müssen `ToolResult.error` korrekt füllen (Voraussetzung für Datenqualität)" sind **zu eng gefasst** – shell ist tatsächlich bereits korrekt, die echten Fehlmeldungen liegen bei skill / lsp / todoWrite etc.

**Vorschlag zur Korrektur**: Die "**Umrüstung der 7 Tools, die Fehler nur über `llmContent` übermitteln, auf korrekte Befüllung des `error`-Feldes**" als harte Voraussetzung für D2 deklarieren (§3.2 Vorbedingung), Aufwand ca. 2d; kein "Fallback über `llmContent.match(/^Error:/i)`" (zu hohes Risiko von Fehlalarmen).
### 6.3 Erkenntnis 2: Implementierungskosten des Indikators `fast_tokens_consumed` unterschätzt (Auswirkung auf D2 / §5.3)

**Fakten**:

- Der Abort-Pfad in `turn.ts` (L289-291) macht einen direkten `return`, **ohne finally-Block und ohne `stream.return()`-Aufruf** – der in §5.4 des Dokuments angedeutete Eintrag, dass ein `stream.return()` vor dem Abort den Generator in den finally-Zweig zwingt, ist im aktuellen Code nicht vorhanden.
- Die `for await`-Schleife in `geminiChat.ts:processStreamResponse` zeichnet den Turn nur bei vollständigem Durchlauf auf (L1286). Ein Abbruch durch Abort führt dazu, dass der letzte usage-only Chunk (der normalerweise die vollständigen Metadaten trägt) **direkt verworfen** wird.
- Im Haupt-Chat-Pfad gibt es **keinerlei Fallback für eine kumulative Erfassung der Tokens auf Chunk-Ebene**; nur in der Subagent-Ebene (`agent.ts:731-744`) existiert eine solche Kumulation, die aber nicht wiederverwendet werden kann.
- Fazit: Beim Abort wird `usageMetadata` **überhaupt nicht erfasst**, es bleibt nur die Schätzung über `chars/4` (±20% Fehler).

**Auswirkungen auf das Design**:

- Im Drei-Ebenen-Ansatz aus §5.4 („priorisiert / Fallback / annotiert") ist der **„priorisiert"-Pfad im aktuellen Code nicht erreichbar** – es muss zuerst die Generatorstruktur von `sendMessageStream` mit einem finally-Block erweitert werden, Aufwand ca. 1 Tag, der im Designdokument nicht abgebildet ist.
- §5.3 führt „Tokenkosten pro tausend Sitzungen <70%" als Phase-3-Ziel auf, aber wenn der Indikator selbst einen Fehler von ±20% aufweist, liegen **„70%" und „82%" innerhalb des Messrauschens**.

**Vorschlag zur Korrektur**:

- §5.3 sollte in einen **Trendindikator** umgewandelt werden und nicht als Release-Gate dienen; stattdessen sollte eine kombinierte Beurteilung anhand von „`fallback_triggered`-Rate der Entscheidungsprotokolle + gleichsinniger Trend von `fast_tokens_consumed`" erfolgen.
- §5.4 ergänzen: Für die Implementierung von `fast_tokens_consumed` muss zunächst der Abort-Pfad in turn.ts mit finally + `stream.return()` umgestaltet werden, als Ergänzung zum Arbeitsaufwand in §3.2 (+1 Tag).

### 6.4 Erkenntnis 3: `user_prompt_classification` und User-Follow-up-Tracking müssen neu erstellt werden (Auswirkung auf D2 / §5.2)

**Fakten**:

- Unter `packages/core/src/followup/` existieren bereits `speculation.ts` / `suggestionGenerator.ts` / `followupState.ts`, aber deren Telemetrie (`PromptSuggestionEvent`) erfasst, ob **„Systemvorschläge angenommen/ignoriert"** werden, nicht ob der Nutzer aktiv nachfragt.
- Der `ChatRecordingService` speichert Benutzernachrichten, vergibt aber **keine Klassifikations-Tags**.
- Ein Grep des gesamten Repositorys ergibt kein `user_prompt_classification`, keine chinesisch-englische Mustererkennung für Nachfragen und keine Mechanismen wie `clarif*` / `intentDetect`.

**Auswirkungen auf das Design**:

- Das Feld `user_prompt_classification: 'query' | 'action' | 'analysis'` im Decision-Log-Schema aus §5.4 hat **keine Datenquelle** – es lässt sich weder aus dem bestehenden `PromptSuggestionEvent` ableiten noch aus dem `ChatRecord` auslesen.
- Das Überwachungssignal „Häufigkeit von Benutzer-Nachfragen wie 'bitte detaillierter'" aus §5.2 ist davon betroffen
> primary cached vs fast uncached

| Route                          | Geschätzte Latenz | Anmerkungen                                |
| ------------------------------ | ----------------- | ------------------------------------------ |
| primary mit 80 % Prefix-Cache-Hit | ~1,8-2,2s      | Aktuelle tatsächliche Leistung der summary-Runde |
| fast ohne Cache (modellübergreifend nicht geteilt) | ~1,5-2s | Tatsächliche Leistung nach D2-Umschaltung |

**Netto-Differenz: ein paar hundert Millisekunden, sogar möglicherweise ist fast langsamer**. Hinzu kommen 14-16 Tage Engineering-Aufwand + Qualitätsrisiken + Fallback-Verschwendung, **Nettonutzen von D2 nahe 0 oder negativ**.

§3.2 Vorbedingung **muss hinzugefügt werden**: Die Basismessung muss primary **cached** mit fast **uncached** vergleichen, und wenn `T_primary_cached < T_fast_uncached × 1.5` ist, sollte D2 nicht aktiviert werden.

### 7.3 Kandidatenliste (nach Dringlichkeit neu geordnet)

**Echte Schnellwirkung (sofort umsetzbar, < 1d Aufwand, sehr geringes Risiko, sicherer Nutzen)**:

| Punkt                                     | Aufwand | Nutzen                                   | Position der Änderung                                          |
| ----------------------------------------- | ------- | ---------------------------------------- | -------------------------------------------------------------- |
| Kurze Antwortanweisung                    | 30 Min  | ~2s pro summary-Runde (Ausgabe-Token halbiert) | Einen Satz im Final Reminder-Abschnitt von `prompts.ts` hinzufügen |
| Cache-Hit-Rate-Telemetrie freigeben       | 0,5d    | 0s direkt, ist **Ermöglicher** für nachfolgende Entscheidungen | `cachedContentTokenCount` wird bereits erfasst, fehlt die Freigabe; und sollte nach `save_memory` separat gekennzeichnet werden |

**Nahe Schnellwirkung (auf Daten warten, 0,5-1d Aufwand)**:

| Punkt                                          | Aufwand              | Nutzen                                                      | Entscheidungsvoraussetzung                                                    |
| ---------------------------------------------- | -------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| summary-Runde `tool_choice='none'`              | 0,5-1d               | 0,3-1s (Sampling überspringt tool_call-Token)               | Benötigt Logik zur Identifizierung der summary-Runde, niedriges Fehlklassifizierungsrisiko |
| summary-Runde Thinking deaktivieren             | 1d                   | 0,5-2s                                                      | Nur sinnvoll für Modelle mit aktiviertem Thinking (qwen3.5-plus, glm-4.7, kimi-k2.5 usw.) |
| Chunk-Batching in der UI-Rendering-Schicht      | 0,5d Recherche + 0,5d Implementierung | Noch zu validieren                        | Annahme: Die kumulierten Renderingkosten für lange summary-`useGeminiStream`-Token sind nicht gering |

**Zur Prüfung (könnte große Fische sein)**:

| Punkt                                         | Rechercheaufwand          | Potenzieller Nutzen            | Wichtige Unbekannte                                                                                                          |
| --------------------------------------------- | ------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| ~~DashScope `scope: 'global'`-Unterstützung~~ | ~~0,5d Dokumentation + 0,5d A/B~~ | ~~Sitzungsübergreifender Treffer~~ | **Bereits recherchiert, Schlussfolgerung (c) nicht umsetzbar** (siehe §7.4 Ergebnis von Entdeckung B). Diese Zeile bleibt als Entscheidungsaufzeichnung, Forschung nicht wieder aufnehmen. |

**Mittlere Änderungen (keine Schnellwirkung, separat bewerten)**:

| Punkt                                                                 | Aufwand                | Risiko | Nutzen                     |
| --------------------------------------------------------------------- | ---------------------- | ------ | -------------------------- |
| D1 `skipLlmRound` (Endzustandsabfrageszenario)                        | 2-3d                   | Mittel | 3-4s pro Endzustandsrunde |
| Tool-Ergebnisse der summary-Runde kürzen (D5-Teilmenge)               | 2d                     | Mittel | 1-2s                       |
| D3 `Summarizing`-Status                                               | 3-5d                   | Mittel | Wahrnehmungsverbesserung 3s |
| System-Prompt verschlanken                                            | 2-3d inkl. A/B-Tests   | Mittel | 0,5-1s                     |

**Verworfene Richtungen (nicht mehr machen)**:

| Punkt                                                     | Grund für Verwerfung                                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| D2 Fast-Model-Routing                                     | Wird durch DashScope-Cache aufgehoben, Netto-Nutzen nahe 0 oder negativ                                                       |
| D4 Prevalidate                                            | Nutzen falsch zugeordnet (tatsächlich nur ~50ms vom Scheduling-Modell), 5-7 Tage Aufwand nicht wert                          |
| System-Prompt stabilisieren                               | Bereits stabil, nichts zu tun                                                                                                 |
| Vorzeitiges Streaming-Terminal (vorzeitiger Abbruch von Abschlussfloskeln) | Hohes Fehlklassifizierungsrisiko, Benutzer nimmt abgeschnittene Antwort wahr                                                  |

### 7.4 Drei neue Entdeckungen, die näher untersucht werden sollten

#### Entdeckung A: Tatsächlicher Mechanismus von `tool_choice='none'`

In der OpenAI / DashScope API ist `tool_choice='none'` nicht nur "Werkzeugaufruf verbieten" – die Modell-Sampling-Phase **überspringt die Wahrscheinlichkeitsverteilung des speziellen `<tool_call>`-Tokens vollständig**, der Decoder geht direkt den Pfad der natürlichen Sprachgenerierung. Der Nutzen liegt nicht im "Einsparen von ein oder zwei Retries", sondern darin, dass das Sampling selbst schneller ist.

#### Entdeckung B: `scope: 'global'` hat bereits einen Anthropic-Präzedenzfall im Repository

`packages/core/src/core/anthropicContentGenerator/converter.test.ts:85, 1543` gibt es bereits die Verwendung von `cache_control: { type: 'ephemeral', scope: 'global' }`. Aber in `provider/dashscope.ts:288` wird beim Setzen von cache_control **kein scope übergeben**:

```typescript
cache_control: { type: 'ephemeral' },   // 没有 scope
```

Wenn der DashScope-Server `scope: 'global'` erkennt:

- system + tools werden auf globalen Cache hochgestuft (TTL weit größer als 5 Min von ephemeral)
- **Sitzungsübergreifender Treffer**, auch Startlatenz sinkt
- Allein dieser Nutzen könnte alle angenommenen Nutzen von D2 übertreffen

##### Rechercheergebnis (2026-05-26, Schlussfolgerung: (c) nicht umsetzbar, diese Linie schließen)

Durch Überprüfung der offiziellen Alibaba Cloud Bailian-Dokumentation `help.aliyun.com/zh/model-studio/context-cache` erhaltene Faktenliste:

| Frage                                   | Schlussfolgerung                                                                                                                                                                                                                     | Beweis                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `scope`-Feldunterstützung               | **Nicht unterstützt**. Nur `type: 'ephemeral'` wird erkannt, jeder `scope`/`persistent`/`global` wird stillschweigend ignoriert                                                                                                      | Offizielle Dokumentation: "Nur die Einstellung von `type` auf `ephemeral` wird unterstützt"                                                  |
| Tatsächliche TTL von ephemeral          | **5-Minuten gleitendes Fenster** (zurücksetzen nach Treffer)                                                                                                                                                                         | Bailian-Dokumentation klar angegeben                                                                                                         |
| Lange TTL / globaler Mechanismus        | **Kein Mechanismus auf öffentlicher Cloud-API-Seite**. Kein `persistent` type-Wert, keine unabhängige Pre-Upload-API, kein `prompt_cache_key`; einziges "global persistentes" Produkt ist PAI Global Context Cache (Selbstbereitstellung + vLLM + Lingjun + gemeinsam genutzter Redis), unabhängig von DashScope API | PAI-Dokumentation                                                                                                                           |
| Sitzungsübergreifende gemeinsame Nutzung | Gleicher Account + gleiches Modell + Inhalt übereinstimmend → bereits Treffer (das macht `ephemeral` bereits); verschiedene Accounts absolut keine gemeinsame Nutzung                                                                 | Bailian-Dokumentation                                                                                                                         |
| Preisgestaltung                         | Cache Write 125 %, Expliciter Cache Read 10 %, **Impliciter Cache Read 20 %** (auch ohne `cache_control`-Markierung erhält man impliziten 20 % Rabatt)                                                                               | Bailian-Preisdokumentation                                                                                                                    |
| Minimal cachebarer Prompt               | **1024 Tokens**                                                                                                                                                                                                                      | Bailian-Dokumentation                                                                                                                         |
| Modellunterstützung (expliziter Cache)  | qwen3.7-max / qwen3.6-plus / qwen3.5-plus / qwen3-coder-plus / qwen3-vl-plus / deepseek-v3.2 / kimi-k2.5 / glm-5.1 sind alle explizit aufgeführt. **qwen3.6-plus und qwen3.7-max genießen ebenfalls 90 % expliziten Cache-Rabatt** | Bailian-Modelliste (überprüft am 2026-05-26)                                                                                                |
**Nebenerkenntnisse und ihre Implikationen**:

1. **TTL-Schiebefenster** ist eine gute Nachricht für den Agent-Loop – die Intervalle zwischen aufeinanderfolgenden Aufrufen innerhalb des Loops liegen normalerweise < 30s, **der Cache bleibt immer frisch und läuft nicht nach 5 Minuten ab**.
2. **20 % Rabatt durch impliziten Cache** ist ein kostenloser Bonus – auch ohne `cache_control`-Markierung wird er gewährt; Feinkontrolle erfordert jedoch explizite Angabe.
3. ~~`qwen3.6-plus` nicht in der expliziten Liste~~ – **Korrektur (2026-05-26)**: Nach erneuter Prüfung ist `qwen3.6-plus` **tatsächlich in der expliziten Cache-Liste** und genießt 90 % Rabatt. Der vorherige Bericht enthielt hier einen Fehler, der in der ersten Tabelle dieses Abschnitts korrigiert wurde.
4. **`dashscope.ts:288` in seiner jetzigen Form ist bereits das Maximum der DashScope Public-Cloud-API** – es gibt keinen Spielraum mehr für weitere Optimierung.

**Verstärkung der Entscheidung D2 aus §7.2**:

Das TTL-Schiebefenster bedeutet, dass die Summary-Runde im Agent-Loop **nahezu 100 % Treffer** auf den primären Cache erzielt (die vorherigen Runden wurden gerade getroffen, innerhalb von 5 Minuten). Das Umschalten auf das Fast-Modell bei D2 würde nicht nur die aufgebaute Cache-Schreibkette zerstören, **sondern auch den Treffer der Summary-Runde von "nahezu 100 %" auf "vollständig verfehlt" zurückwerfen** – die Nettoertrag-Einschätzung fällt damit noch deutlicher negativ aus als in der ursprünglichen Annahme von §7.2.

#### Erkenntnis C: Die UI-Rendering-Ebene ist ein übersehener blinder Fleck

Die Baseline in §1.2 beziffert den "Framework-Overhead" mit 0,3 s (3 %), aber das ist eine grobe Schätzung. Ink 7 + React 19.2 löst bei jedem Chunk ein `setState` → Re-Rendering aus; eine lange Summary kann kumuliert 200–500 ms kosten. Es ist zu prüfen, wie `useGeminiStream` den Token-Stream verarbeitet und ob `requestAnimationFrame` / `useDeferredValue` zum Zusammenfassen der Chunks verwendet werden.

### 7.5 Daten-Checkpoint – Welche Entscheidung ist zu treffen, wenn die Daten eintreffen

Dieser Abschnitt ist der **aktive Einstieg in dieses Dokument**: Sobald Metrikdaten vorliegen, ist anhand der folgenden Tabelle zu entscheiden, welche Entscheidung erneut betrachtet werden muss.

#### Checkpoint 1: Nach Vorliegen der Cache-Hit-Rate-Daten

**Auslösebedingung**: Das "Ölflecken"-Telemetry für die Cache-Hit-Rate ist ≥3 Tage aktiv, die Entscheidungslogs enthalten die Verteilung von `cached_tokens` / `prompt_tokens`.

**Zu betrachtende Daten**:

- P50- und P90-Verteilung der Gesamttrefferquote (cached / prompt)
- Aufschlüsselung nach Runden: Trefferquote von Runde 1 / Runde 2 / Runde 3 (Summary) separat
- Trefferquote der nächsten Runde nach Auslösen von `save_memory` (sollte nahe 0 sein)
- Trefferquote der nächsten Runde nach Wechsel von `/model` (sollte nahe 0 sein)

**Entscheidungspfad**:

| Gesamttrefferquote | Bedeutung                     | Aktion                                                                       |
| ------------------ | ----------------------------- | ---------------------------------------------------------------------------- |
| > 70 %             | Aktueller Zustand nahe theore. Max | Nur #1 Kurzanweisung + Erkenntnis B untersuchen; restl. Ölflecken nach Bedarf |
| 40–70 %            | Noch Potenzial, Quelle unklar | Analyse nach Runden-Trefferquote, um die verfehlten Abschnitte zu identifiz. |
| < 40 %             | Dynamische Punkte stören Cache | System-Prompt / userMemory-Auslösefrequenz neu prüfen; ggf. `save_memory` häufiger als erwartet |

#### Checkpoint 2: DashScope `scope: 'global'` Dokumentationsrecherche ✅ abgeschlossen (2026-05-26)

**Ergebnis**: **Wird überhaupt nicht erkannt**. Siehe Abschnitt "Rechercheergebnisse" in §7.4 Erkenntnis B.

**Bereits ausgeführte Aktion**: Akzeptanz des Ist-Zustands, dieser Punkt wird übersprungen. `dashscope.ts:288` behält die vorhandene `ephemeral`-Markierung bei, kein Umbau erforderlich.

**Diese Recherche nicht erneut starten** – es sei denn, DashScope kündigt offiziell einen neuen Persistenzmechanismus an.

#### Checkpoint 3: Forschungsergebnisse zur UI-Rendering-Ebene

**Auslösebedingung**: Erkenntnis C ist abgeschlossen (Überprüfung der Token-Stream-Verarbeitung von `useGeminiStream` + Ink/React DevTools-Messungen).

**Entscheidungspfad**:

| Ergebnis                                         | Aktion                                                |
| ------------------------------------------------ | ----------------------------------------------------- |
| Langes Summary-Stream-Rendering kumuliert >200ms | Batching einsetzen (`useDeferredValue` oder custom Drosselung) |
| Rendering-Overhead < 100ms                       | Diese Spur schließen                                  |

#### Checkpoint 4: Zweite Baseline-Messung nach Abschluss der "echten Ölflecken"

**Auslösebedingung**: #1 Kurzanweisung + Checkpoint 1/2/3-Entscheidungen sind ≥1 Woche abgeschlossen.

**Zu betrachtende Daten**:

- End-to-End-RT P50 im Vergleich zur Einzel-Stichproben-Baseline aus §1.2 (13,4 s)
- P50/P95 der Summary-Runde separat
- Rückfragequote der Benutzer (falls Ölflecken A eine Benutzereingabe-Klassifikation umfasste)

**Entscheidungspfad**:

| Kumulierte Einsparung | Aktion                                                                         |
| --------------------- | ------------------------------------------------------------------------------ |
| > 4 s (erreicht 9,6 s E2E P50) | Bewertung von D1 `skipLlmRound` (weitere 3–4 s/Endzustandsrunde)          |
| 2–4 s                | Ist-Zustand akzeptieren, bewerten ob D3-Wahrnehmungsverbesserung lohnt        |
| < 2 s                | Erneute Prüfung: Sind die Ölflecken überschätzt, oder gibt es unerkannte Engpässe (Netzwerk-RTT, Provider-Latenz)? |

### 7.6 Endgültige Bewertung der Richtungen aus §3

Basierend auf der Validierung in §6 und der ROI-Neugewichtung in diesem Abschnitt:

| Richtung                  | Urspr. Prio aus §3 | Bewertung in diesem Abschnitt                        | Begründung                                                |
| ------------------------- | ------------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| D1 Nachgestellte Tool-Anw. | P0                 | **P0 bleibt**, aber erst nach Abschluss der Ölflecken bewerten | ROI immer noch gut, aber nicht mehr "sofort umsetzen" – erst die billigeren Ölflecken einsammeln |
| D2 Summary-Fast-Routing   | P1                 | **Defer / Won't Fix**                                | Wird durch DashScope-Cache aufgehoben, 14–16d Einsatz für nahezu Null Ertrag |
| D3 Entkopplung der Anzeige | P1                 | **Bleibt optional**, abhängig von Daten aus Checkpoint 4 | Wahrnehmungsverbesserung sicher, aber absolute RT unverändert, abhängig vom Nutzerverhalten |
| D4 Streaming-Vorabplanung  | P2                 | **Defer**                                            | Ertrag falsch zugeordnet, real ~50 ms sind 5–7d nicht wert |

### 7.7 Empfohlene Ausführungsreihenfolge

**Tag 1** (durch eine einzelne Person an einem Tag erledigbar):

- ✅ `prompts.ts`: Kurzanweisung für prägnante Antworten hinzufügen (30 min)
- ✅ `cachedContentTokenCount` in Telemetry exponieren + Markierung bei `save_memory` / `/model`-Wechsel setzen (0,5 d)
- ✅ Recherche zu Erkenntnis B starten: DashScope `scope: 'global'`-Dokumentation abfragen + bestehende Anthropic-Nutzung vergleichen (0,5 d)

**Tag 2–3**:

- Erste Cache-Hit-Rate-Daten sammeln
- Recherche zu Erkenntnis C starten: React-Rendering-Pfad von `useGeminiStream`
- Je nach Checkpoint 2 entscheiden, ob Umbau auf `scope: 'global'` erforderlich

**Ende Woche 1**:

- Datenentscheidung aus Checkpoint 1 (Verteilung betrachten)
- Entscheiden, ob `tool_choice='none'` / Thinking ausschalten (abhängig von Hit-Rate-Daten)

**Woche 2–3**:

- Zweite Baseline-Messung aus Checkpoint 4
- Entscheiden, ob D1 gestartet wird (größter nicht-Ölflecken-Posten, 3–4 s/Endzustandsrunde)

**Nie umsetzen**: D2 / D4 / System-Prompt-Stabilisierung.

### 7.8 Prüfung der dynamischen Inhalte in `prompts.ts` (2026-05-27)

§7.1 kam mit einem groben `grep` zur Schlussfolgerung "System-Prompt ist stabil". Dieser Abschnitt führt eine systematische Prüfung der `packages/core/src/core/prompts.ts` (1169 Zeilen) durch und erstellt eine Liste als Grundlage für die spätere Cache-Hit-Rate-Analyse und Ölflecken-Entscheidungen.

**Prüfmethode**: Aufzählung aller `${...}`-Interpolationen, IIFEs, `process.*` / `new Date` / `Date.now` / `Math.random` / `fs.*`-Aufrufe, mit der Frage: "Ändert sich dieser Wert innerhalb derselben Session?"

#### Gar nicht vorhanden (oft vermutete harte Probleme)

| Kandidat                                  | Tatsächlicher Code                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Date.now()` / `new Date()`               | **Null Vorkommen** im gesamten Text (`rg` findet nichts)                                             |
| `Math.random()`                           | **Null Vorkommen**                                                                                   |
| `process.cwd()`-Wert in Prompt geschrieben | Nur L366 `if (isGitRepository(process.cwd())) { ... }`, **Wert wird nicht in den String geschrieben**, dient nur als Schalter |
| Git-Status / Git-Branch-Subprozessaufruf  | **Null Vorkommen**, der Git-Abschnitt ist statischer Anleitungstext                                  |
| Aktuelle Dateiliste / Projektstruktur-Injektion | **Null Vorkommen**                                                                                   |
| LSP-Status / Fehleranzahl                 | **Null Vorkommen**                                                                                   |
| Benutzereingabe-Verlauf                   | **Null Vorkommen** (History läuft über Messages, nicht im System-Prompt)                             |
#### Beim Start einmalig, innerhalb der Session unverändert

| Position | Inhalt                                                                                            | Wann könnte sich ändern         |
| -------- | ------------------------------------------------------------------------------------------------- | ------------------------------- |
| L190     | `process.env['QWEN_SYSTEM_MD']` bestimmt die Quelle von basePrompt (Standard vs. benutzerspezifisch system.md) | Innerhalb des Prozesses unverändert |
| L342-343 | `process.env['SANDBOX']` bestimmt, welche Version des Sandbox-Abschnitts verwendet wird (Seatbelt / Sandbox / Ausßerhalb) | Innerhalb des Prozesses unverändert |
| L366     | `isGitRepository(process.cwd())` bestimmt, ob der Git-Abschnitt eingefügt wird                   | cwd ändert sich innerhalb der Session normalerweise nicht |
| L871     | `process.env['QWEN_CODE_TOOL_CALL_STYLE']` bestimmt den Stil des Tool-Aufrufs (qwen-coder / qwen-vl / general) | Innerhalb des Prozesses unverändert |

#### Ereignisgesteuert (niedrige Frequenz)

| Parameter                                         | Auslöser                                                     | Geschätzte Häufigkeit  |
| ------------------------------------------------- | ------------------------------------------------------------ | ---------------------- |
| `userMemory` (1. Parameter von `getCoreSystemPrompt`) | `save_memory`-Tool / `/memory refresh` / Erweiterungs laden  | 0-3 mal/Session        |
| Modellname (beeinflusst, welcher Zweig von `getToolCallExamples` gewählt wird) | `/model`-Wechsel                                             | Selten                 |
| `appendInstruction`                               | Konfigurationseintrag, innerhalb der Session nahezu konstant | Fast nie               |
| `deferredTools` (`buildDeferredToolsSection`)     | Dynamisches Laden von MCP-Tools                              | Meist beim Session-Start |

#### Ein subtiler Haken

L207-209: Wenn die Umgebungsvariable `QWEN_SYSTEM_MD` gesetzt ist, führt **jeder** Aufruf von `getCoreSystemPrompt` ein `fs.readFileSync(systemMdPath)` aus:

```typescript
const basePrompt = systemMdEnabled
  ? fs.readFileSync(systemMdPath, 'utf8')
  : `...`;
```

- Bei unveränderter Datei ist der Inhalt stabil → Cache-Treffer bleiben unbeeinflusst
- Allerdings hat jeder LLM-Aufruf einen synchronen I/O-Vorgang (standardmäßig `.qwen/system.md`, bei Netzwerkmounts noch langsamer)
- Beeinträchtigt die Schlussfolgerung zur „Cache-Freundlichkeit" dieses Abschnitts nicht, dient lediglich als Hinweis auf eine bekannte kleine Performance-Falle

#### Fazit

1. **Der System-Prompt ist in einer stabilen Session bei jedem Aufruf byte-for-byte identisch** → Der DashScope ephemeral Cache-Key (basierend auf dem Content-Hash) ist über den gesamten Prompt stabil → **Die Cache-Trefferquote des System-Teils liegt nahezu bei 100%**
2. Das einzige Ereignis, das den Cache ungültig macht, ist `save_memory` – eine Kernfunktion, die nicht zugunsten des Caches geopfert werden kann.
3. **Kostenanalyse von Schwachstelle #1 (Kurze-Antwort-Anweisung)**: Die Anweisung wird im Abschnitt Final Reminder hinzugefügt (L389-390) → Der System-Prompt ändert sich einmalig → **Erste Anfrage verfehlt den Cache (einmaliger Aufwärmkosten), danach treffen alle weiteren Anfragen wieder den Cache**
4. **Die in §7 als obsolet eingestufte „Stabilisierung des System-Prompts" wird durch Beweise gestützt** – Nicht nur unnötig, sondern sogar die theoretische Behauptung, dass sich dadurch die Cache-Miss-Rate weiter senken ließe, trifft nicht zu, da sie bereits ≈0 beträgt.
5. Diese Prüfung kann als Ausgangsbasis für zukünftige Diskussionen dienen, um wiederholtes Grep zu vermeiden; bei größeren Änderungen an `prompts.ts` muss dieser Abschnitt aktualisiert werden.
