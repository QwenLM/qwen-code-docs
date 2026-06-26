# Neugestaltung des Auto-Kompaktionsschwellwerts

**Status:** Entwurf · 2026-05-14

## Hintergrund

> Dieser Abschnitt beschreibt den Zustand **vor** der Umsetzung dieses PR (Pre-Redesign-Verhalten). Die unten genannten `COMPRESSION_TOKEN_THRESHOLD`, `thinkingConfig.includeThoughts = true`, `hasFailedCompressionAttempt` sowie die konkreten file:line-Verweise beziehen sich auf den Code vor der Integration von PR #4345 – nach der Integration sind diese Symbole / Zeilennummern nicht mehr gültig.

Die aktuelle automatische Kompression von qwen-code verwendet nur einen einzigen proportionalen Schwellwert `COMPRESSION_TOKEN_THRESHOLD = 0.7` (`chatCompressionService.ts:33`), der für alle Fenstergrößen gleich ist. Im Vergleich zu claude-codes „absoluter Token-Leiter“ (autoCompact.ts:62-65) hat qwen-code drei konkrete Probleme:

1. **Zu viel Reservierung bei großen Fenstern**: Bei 1M Modell löst der 70%-Schwellwert bei 700K aus, die restlichen 300K sind weit mehr als die ~33K, die für Zusammenfassung + Ausgabe tatsächlich benötigt werden
2. **Einmaliger Fehler führt zu permanenter Sperre**: Nach `hasFailedCompressionAttempt = true` wird für die gesamte Session kein auto-compact mehr versucht (geminiChat.ts:504), was strenger ist als claude-codes „3 aufeinanderfolgende Fehler“-Unterbrechung
3. **Tip-System und Auto-Schwellwert entkoppelt**: Die drei `context-*`-Tips in `tipRegistry.ts` verwenden feste 50/80/95 Prozent, die völlig unabhängig vom Auto-Compact-Schwellwert (70%) sind. Dies bedeutet, dass auf dem Hauptpfad, in dem „auto“ normal funktioniert, die 80%/95%-Tips selten ausgelöst werden, während auf den Randpfaden, in denen „auto“ fehlschlägt / reaktiv abgesichert wird, eine semantische Ausrichtung an den Schwellwerten fehlt
4. **Der Kompressionsaufruf selbst hat keine Ausgabebudgetkontrolle**: [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) aktiviert explizit `thinkingConfig.includeThoughts = true` (Kommentar: „Compression quality drives every subsequent main turn“), während der sideQuery-Aufruf keine `maxOutputTokens`-Obergrenze setzt. Der Code-Kommentar ([`:436-437`](packages/core/src/services/chatCompressionService.ts:436)) gibt auch zu, dass `compressionOutputTokenCount may include non-persisted tokens (thoughts)`. Wenn die Kompression nahe am Fensterende ist, kann die Gesamtausgabe aufgebläht werden, sodass die Pufferreservierung keine vorhersagbare Obergrenze hat.<br/><br/>Noch schlimmer ist das inkonsistente Verhalten zwischen den Providern: Anthropic's Thinking-Budget ist völlig unabhängig von max_tokens; OpenAI's Reasoning-Tokens werden nicht durch max_completion_tokens begrenzt; Geminis Verhalten variiert je nach Modellversion. Dies bedeutet, dass „allein durch Hinzufügen von maxOutputTokens die Gesamtausgabe kontrollieren“ in einem Multi-Provider-Projekt wie qwen-code nicht funktioniert

5. **Der für die Schwellwertprüfung verwendete `lastPromptTokenCount` ist systematisch zu niedrig.** [geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217) zeigt, dass diese Zahl vom `usageMetadata.totalTokenCount` der vorherigen API-Antwort stammt. Zwei Lücken: (a) Sie enthält nicht die in dieser Runde hinzugefügte User-Nachricht, jede Cheap-Gate-Prüfung ist daher um einen Teil kleiner als der tatsächliche Prompt; (b) Der Anfangswert in der ersten Runde ist 0, sodass beim Wiederherstellen einer großen Session mit `--continue` / beim Übernehmen einer langen Historie durch einen Sub-Agenten das erste Senden immer alle Schwellwerte umgeht. Im Vergleich dazu schließt claude-codes `tokenCountWithEstimation` ([query.ts:638](src/query.ts:638)) mit einem zweigleisigen Ansatz aus „letzter Assistant-API-Nutzung + Schätzung der danach hinzugefügten Nachrichten“ diese beiden Lücken

## Entwurfsziele

- Einführung eines „proportionalen + absoluten“ Mischschwellwerts, sodass große Fenstermodelle durch den absoluten Wert gesteuert werden, kleine Fenster weiterhin durch den proportionalen Wert abgesichert werden
- Neue Warn-/Hard-Ebene (Auto bleibt als Hauptauslöser erhalten), sodass eine dreistufige Leiter entsteht
- Umschreibung des Tip-Systems, sodass es den neuen Schwellwerten als Auslösebedingungen folgt
- Upgrade der Fehlerbehandlung von „einmaliger Fehler führt zu permanenter Sperre“ zu „3 Fehler führen zu Unterbrechung + automatische Wiederherstellung“
- **Der Kompressionsaufruf deaktiviert Thinking und fügt eine `maxOutputTokens`-Obergrenze hinzu**: Angleichung an claude-code, sodass die Gesamtausgabe durch einen einzigen Parameter begrenzt wird und das Pufferbudget vorhersagbar ist; Akzeptanz einer möglichen Verschlechterung der Kompressionsqualität
- **Hinzufügen einer Token-Schätzungskompensation**: Beseitigung der beiden systematischen Unterschätzungen von `lastPromptTokenCount` („eine Runde verzögert“ und „erste Runde ist 0“), sodass die Schwellwertprüfung näher an der tatsächlichen Prompt-Größe liegt
- Entfernung des Konfigurationseintrags `contextPercentageThreshold` in den Einstellungen (die interne PCT-Konstante bleibt erhalten)
- **Keine** Einführung von Env-Override-Kanälen, **kein** neuer expliziter Enabled-Schalter

## Dreistufige Schwellwertleiter

```
                       Fenster  (rohes Kontextfenster)
                          │
                          │  ← SUMMARY_RESERVE = 20K
                          ▼
                    effectiveWindow
                          │
                          │  ← HARD_BUFFER = 3K
                          ▼
              hard_threshold = effectiveWindow - 3K
                          │
                          │  ← (AUTOCOMPACT_BUFFER - HARD_BUFFER) = 10K
                          ▼
auto_threshold = max(PCT * Fenster, effectiveWindow - AUTOCOMPACT_BUFFER)
                          │
                          │  ← WARN_BUFFER = 20K
                          ▼
warn_threshold = max((PCT - WARN_OFFSET) * Fenster, auto_threshold - WARN_BUFFER)
                          │
                          ▼
                          0
```

### Semantik der drei Ebenen

| Ebene     | Auslösebedingung                      | Verhalten                                                     |
| --------- | ------------------------------------- | ------------------------------------------------------------- |
| **warn**  | `tokenCount >= warn_threshold`        | UI-Hinweis „Verbleibende Token bis zur automatischen Kompression: X“, ändert das Sendeverhalten nicht |
| **auto**  | `tokenCount >= auto_threshold`        | `tryCompress(force=false)` vor dem Senden, normaler Kompressionsablauf |
| **hard**  | `tokenCount >= hard_threshold`        | `tryCompress(force=true)` vor dem Senden, setzt die Fehlersperre zurück und erzwingt die Kompression |

Die `hard`-Ebene entspricht im Wesentlichen dem Vorziehen der bestehenden reaktiven Überlauf-Absicherung (geminiChat.ts:711) vor das Senden, wodurch eine fehlgeschlagene, zu große Request-Roundtrip vermieden wird.

## Interne Konstanten

```ts
// chatCompressionService.ts
const DEFAULT_PCT = 0.7; // Auto-Proportionalabfederung
const WARN_PCT_OFFSET = 0.1; // Warn-Proportional = PCT - WARN_OFFSET = 0.6
const COMPACT_MAX_OUTPUT_TOKENS = 20_000; // Harte Obergrenze für die Ausgabe des Kompressions-sideQuery (Thinking + Zusammenfassung gesamt)
const SUMMARY_RESERVE = 20_000; // Vom Fensterende abgezogene Ausgabereservierung für die Schwellwertleiter = maxOutput
const AUTOCOMPACT_BUFFER = 13_000; // Abstand zwischen Auto und effectiveWindow
const WARN_BUFFER = 20_000; // Abstand zwischen Warn und Auto
const HARD_BUFFER = 3_000; // Abstand zwischen Hard und effectiveWindow
const MAX_CONSECUTIVE_FAILURES = 3; // Schwellwert für die Fehlerunterbrechung
```

Wertequelle: Alle übernommen aus den gemessenen Werten von claude-code ([autoCompact.ts:30,62-65](src/services/compact/autoCompact.ts:30)).

`SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS` ist die entscheidende Beziehung: Da das Modell durch die `maxOutputTokens`-Obergrenze eingeschränkt ist, kann die Ausgabe 20K nicht überschreiten, daher benötigt die Reserve keinen zusätzlichen Sicherheitsspielraum. Hinweis: Nach der Deaktivierung von Thinking in diesem Entwurf gilt diese Gleichung (das Ausgabebudget steht vollständig für die Zusammenfassung zur Verfügung). Wenn Thinking beibehalten wird, teilen sich `Thinking + Zusammenfassung` das Budget (Gemini SDK / die `maxOutputTokens`-Semantik der meisten Provider), und das Modell verteilt selbstständig zwischen beiden. In diesem Fall ist der tatsächlich für die Zusammenfassung verfügbare Platz kleiner als 20K (siehe „Risiken und Hinweise“, Punkte 1 & 2).

## Berechnungsfunktion

```ts
export interface CompactionThresholds {
  warn: number;
  auto: number;
  hard: number; // Wenn hard < auto, dann gleich auto (Degeneration bei kleinen Fenstern)
  effectiveWindow: number;
}

export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto); // Degeneriert bei kleinen Fenstern zu auto

  return { warn, auto, hard, effectiveWindow };
}
```
### Gemessene Daten

| Fenster | warn        | auto        | hard         | Anmerkungen                         |
| ------- | ----------- | ----------- | ------------ | ----------------------------------- |
| 32K     | 19,2K (pct) | 22,4K (pct) | 22,4K (Deg.) | Prozentuale Absicherung             |
| 64K     | 38,4K (pct) | 44,8K (pct) | 44,8K (Deg.) | Prozentuale Absicherung             |
| 128K    | 76,8K (pct) | 95K (abs)   | 105K (abs)   | Gemischt (warn=pct, auto/hard=abs)  |
| 200K    | 147K (abs)  | 167K (abs)  | 177K (abs)   | Absolute Übernahme                  |
| 256K    | 203K (abs)  | 223K (abs)  | 233K (abs)   | Absolute Übernahme                  |
| 1M      | 947K (abs)  | 967K (abs)  | 977K (abs)   | Vollständig absolut                 |

`(pct)` bedeutet, dass die Ebene durch die Prozentformel bestimmt wird, `(abs)` bedeutet, dass die Ebene durch die absolute Formel bestimmt wird.

## Benutzerkonfiguration

### Änderungen an ChatCompressionSettings

```ts
// packages/core/src/config/config.ts:217
export interface ChatCompressionSettings {
  /** Beibehalten (nicht relevant für dieses Design, wird von compactionInputSlimming verwendet) */
  imageTokenEstimate?: number;
}
```

**Entfernt:** Feld `contextPercentageThreshold`. Gründe:

1. Unter der neuen Formel hat dieses Feld bei gängigen Fenstern (>= 128K) praktisch keine Auswirkung – absolute Werte übernehmen
2. Bei kleinen Fenstern könnte die Benutzerkonfiguration den Schwellenwert sogar „früher" komprimieren lassen, was der Intuition des Tokensparens widerspricht
3. claude-code macht dieses Feld nicht verfügbar; es gibt keine vergleichbaren Präzedenzfälle für benutzerseitige Konfigurationen

### Umgang mit Breaking Changes

**Benutzerseite:** Startet `Config` und erkennt, dass `chatCompression.contextPercentageThreshold` vorhanden ist:

- Eine Warnung wird in stderr geschrieben: `"chatCompression.contextPercentageThreshold has been removed and is now controlled by built-in thresholds."`
- **Kein** Fehler, **kein** Startblocker
- Der Feldwert wird ignoriert

**SDK-Seite (R5.4):** Das Feld `hasFailedCompressionAttempt: boolean` von `CompressOptions` wird in `consecutiveFailures: number` umbenannt. Zwei Unterschiede:

|        | Altes Feld                    | Neues Feld                                                            |
| ------ | ----------------------------- | --------------------------------------------------------------------- |
| Name   | `hasFailedCompressionAttempt` | `consecutiveFailures`                                                 |
| Typ    | `boolean`                     | `number`                                                              |
| Semantik | `true` = auto-compact dauerhaft deaktiviert | `>= MAX_CONSECUTIVE_FAILURES` (Standard 3) = vorübergehend deaktiviert, bis ein force-Reset erfolgreich ist |

Im Repository gibt es nur einen internen Verbraucher, `GeminiChat.tryCompress`, daher ist das interne Migrationsrisiko gering. Da `@qwen-code/qwen-code-core` jedoch ein veröffentlichtes Paket ist und `CompressOptions` in der d.ts sichtbar ist, erhalten Code, der direkt `service.compress({ ..., hasFailedCompressionAttempt: true })` aufruft, einen TS-Compilerfehler. **Migrationsanleitung:** Ersetze `true` durch `MAX_CONSECUTIVE_FAILURES` (oder eine beliebige ganze Zahl >= 3), `false` durch `0`. Wenn der Aufrufer eine eigene Fehlerzählung verwaltet, kann diese direkt übergeben werden.

## Token-Schätzungskompensation

Der `lastPromptTokenCount` von qwen-code stammt aus dem `usageMetadata.totalTokenCount` der vorherigen API-Antwort ([geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217)). Dies führt zu:

1. **Eine Runde Verzögerung:** Das cheap-gate verwendet `lastPromptTokenCount` für die Entscheidung, aber das tatsächliche Prompt dieser Sendung = es + die aktuelle Benutzernachricht. Der unterschätzte Teil kann zu einem false-negative der Schwellenwertprüfung führen
2. **Erste Runde ist 0:** Der Anfangswert ist 0. Beim ersten Send werden unabhängig von der Historiegröße keine Schwellenwerte ausgelöst (einschließlich `--continue`-Wiederherstellung / Sub-Agent-Vererbungsszenarien)

Einführung einer leichten lokalen Schätzfunktion `estimatePromptTokens`, die diese beiden fehlenden Teile vor dem Send in der cheap-gate-/hard-Prüfung ergänzt:

```ts
// chatCompressionService.ts (oder neue Datei packages/core/src/services/tokenEstimation.ts)

const BYTES_PER_TOKEN = 4; // Allgemeine char/4-Schätzung (claude-code genauso)
const BYTES_PER_TOKEN_JSON = 2; // JSON / tool_call Eingabe dichter

/**
 * Schätzt die Tokenanzahl einer Gruppe von Content-Elementen, um die
 * Verzögerung der API-Nutzungsmetadaten zu kompensieren.
 * Für image/document wird das vorhandene imageTokenEstimate (Standard 1600) wiederverwendet.
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  // Wiederverwendung von estimateContentChars (compactionInputSlimming.ts), dann Division durch bytesPerToken
  // Intern wird für functionCall/functionResponse BYTES_PER_TOKEN_JSON verwendet
  // ...
}

/**
 * Einheitlicher Einstiegspunkt für cheap-gate- und hard-Prüfungen.
 * Hauptpfad: lastPromptTokenCount genau + Schätzung der aktuellen Benutzernachricht
 * Erste-Runde-Pfad: Schätzung der gesamten Historie
 */
export function estimatePromptTokens(
  history: Content[],
  userMessage: Content,
  lastPromptTokenCount: number,
): number {
  if (lastPromptTokenCount > 0) {
    return lastPromptTokenCount + estimateContentTokens([userMessage]);
  }
  return estimateContentTokens([...history, userMessage]);
}
```

Anwendungsstellen:

- cheap-gate in `chatCompressionService.compress()`: Ersetze die Quelle von `originalTokenCount` durch `estimatePromptTokens(history, userMessage, lastPromptTokenCount)`
- hard-Prüfung am Einstiegspunkt von `geminiChat.sendMessageStream` (siehe nächster Abschnitt)

**Die Schätzung dient nur zum vorzeitigen Auslösen, nicht zum „Überspringen des Auslösens".** Da char/4 eine grobe untere Schätzung ist, ist es auf der false-positive-Seite sicher (lieber etwas früher komprimieren), auf der false-negative-Seite jedoch unzuverlässig.

## Änderungen der Auslösekette

### chatCompressionService.ts

1. **Exportiere `computeThresholds`**, zur Wiederverwendung durch cheap-gate / UI / Befehle
2. **`compress()` cheap-gate** (Zeile 221-249):
   ```ts
   if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !force) {
     return NOOP;
   }
   const { auto } = computeThresholds(contextLimit);
   const effectiveTokens = estimatePromptTokens(
     curatedHistory,
     userMessage,
     originalTokenCount,
   );
   if (!force && effectiveTokens < auto) return NOOP;
   ```
3. **`compress()` Aufruf von runSideQuery** (Zeile 356-380): thinking deaktivieren + `maxOutputTokens` hinzufügen:

   ```ts
   const summaryResult = await runSideQuery(config, {
     // ...
     config: {
       thinkingConfig: { includeThoughts: false }, // thinking deaktivieren (wie bei claude-code)
       maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS, // Hartes Limit von 20K
     },
     // ...
   });
   ```

   Oder `thinkingConfig` direkt entfernen und die Standardwerte von `runSideQuery` übernehmen lassen ([sideQuery.ts:118](packages/core/src/utils/sideQuery.ts:118) standardmäßig `includeThoughts: false`).
Nach dem Ausschalten von `thinking` beschränkt `maxOutputTokens` direkt die gesamte Ausgabe (es gibt kein separates Budget für Thinking), und `SUMMARY_RESERVE = maxOutput = 20K` ist eine saubere, harte Beziehung.

Gleichzeitig den Kommentar in [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) von „Compression quality drives every subsequent main turn — keep reasoning on" auf „Um ein vorhersagbares Ausgabelimit über verschiedene Provider hinweg zu gewährleisten, angelehnt an das claude-code Design" aktualisieren.

Der Kommentar zum Token-Mathe-Abschnitt ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) mit „may include non-persisted tokens (thoughts)" kann ebenfalls bereinigt werden.

### geminiChat.ts: `sendMessageStream` Einstiegspunkt (Zeile 562)

```ts
// Vorher: tryCompress(force=false)
// Nachher: Geschätzte Token verwenden, um zu prüfen, ob Hard-Schwelle erreicht ist, und force-Flag setzen

const { hard } = computeThresholds(contextLimit);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  createUserContent(params.message),
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;

if (shouldForceFromHard) {
  // Circuit Breaker zurücksetzen, entspricht force compress
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
);
```

### Fehlerbehandlung verbessern (`geminiChat.ts:504-510`)

```ts
// Vorher
hasFailedCompressionAttempt: boolean;

// Nachher
consecutiveFailures: number;  // Standard 0

// Fehlerfall
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1;
  }
}

// Erfolgsfall
this.consecutiveFailures = 0;
```

Ein fehlgeschlagener `force=true`-Aufruf wird nicht hochgezählt (behält die Semantik von reaktiv/manuell bei, dass diese den "Zähler" nicht belasten).

## UI-Änderungen

### tipRegistry.ts: Drei context-* Tipps neu schreiben

Die drei Schwellenwerte entsprechen genau den drei Tipps. Zuordnung (aufsteigend nach Token-Anzahl):

| Tip ID             | Aktuelle Bedingung                              | Neue Bedingung                                                      | Textänderung                                                     |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `compress-intro`   | `pct >= 50 && < 80 && sessionPromptCount > 5`   | `tokenCount >= warn && tokenCount < auto && sessionPromptCount > 5` | Bleibt unverändert                                               |
| `context-high`     | `pct >= 80 && < 95`                             | `tokenCount >= auto && tokenCount < hard`                           | Bleibt unverändert                                               |
| `context-critical` | `pct >= 95`                                     | `tokenCount >= hard`                                                | Satz hinzufügen: „Auto-compact wird beim nächsten Senden erzwungen." um das neue Hard-Layer-Verhalten widerzuspiegeln |

**Auswirkung auf die Auslösefrequenz:**

- Hauptpfad (auto funktioniert normal): `tokenCount` überschreitet auto, Komprimierung wird sofort ausgelöst, tokenCount fällt in der nächsten Runde wieder. Daher ist `context-high` nur kurz zwischen „Auslösung der Komprimierung" und „Wirksamwerden" sichtbar.
- Randpfad (auto fehlgeschlagen / Circuit Breaker aktiv / reaktiv zu langsam): `tokenCount` steigt kontinuierlich an und durchläuft nacheinander warn → auto → hard, wodurch die drei Tipps ausgelöst werden. Dies entspricht der Benutzerwahrnehmung, dass der Kontext „immer enger" wird.
- Wenn `context-critical` ausgelöst wird, hat das Hard-Layer bereits vor dem Senden eine force-Komprimierung durchgeführt (siehe Abschnitt „Änderungen an der Spezifikations-Auslösekette"). Daher ist dieser Tipp eher eine „Post-Rettungs-Info" als eine „Pre-Rettungs-Warnung". Der hinzugefügte Satz im Text dient der Erklärung.

Dem `TipContext`-Interface hinzufügen:

```ts
export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  // Neu: Der isRelevant-Funktion die Schwellenwerte zugänglich machen.
  // computeThresholds wird in der aufrufenden Stelle berechnet und injiziert,
  // um eine direkte Abhängigkeit des tipRegistry vom Core zu vermeiden.
  thresholds?: CompactionThresholds;
}
```

Bei der Konstruktion von `TipContext` in `AppContainer.tsx:1150` ebenfalls injizieren.

### /context Befehl synchronisieren (`contextCommand.ts:177-183`)

```ts
// Hardcodiertes (1 - threshold) * contextWindowSize ersetzen
const { warn, auto, hard, effectiveWindow } =
  computeThresholds(contextWindowSize);

// Vier Zeilen anzeigen:
//   Effektives Fenster:   180K   (Fenster − 20K Reserve)
//   Warn-Schwelle:        147K   (...)
//   Auto-Schwelle:        167K   ← Aktuelle Position
//   Hard-Schwelle:        177K
// Aktuelle Token-Anzahl markieren, in welcher Stufe sie liegt
```

### Fußzeilen-Hinweis (optionales Follow-up)

Diese Spezifikation erzwingt keinen dauerhaften Hinweis in der Fußzeile, mit der Begründung:

- Das bestehende Tipp-System kann bereits Hinweise im Verlauf geben.
- Ein dauerhafter Fußzeilen-Hinweis erfordert Änderungen am Ink-Rendering und erhöht die Neuzeichnungsfrequenz.
- Kann als nachgelagertes Follow-up zu dieser Spezifikation behandelt werden (separater PR).

Falls später umgesetzt, wird als Auslösebedingung `tokenCount >= warn && tokenCount < auto` vorgeschlagen. Nach Überschreiten von auto wird der Hinweis ausgeblendet (Komprimierung hat begonnen).

## Testabdeckung

### Unit-Tests (chatCompressionService.test.ts)

- `computeThresholds(32K)` → Prozentuale Auffang-Verzweigung (warn/auto beide pct, hard degradiert)
- `computeThresholds(128K)` → Gemischte Verzweigung (warn=pct, auto=abs, hard=abs)
- `computeThresholds(200K)` → Absolute Übernahme-Verzweigung (warn/auto/hard alle abs)
- `computeThresholds(1M)` → Vollständig absolute Verzweigung
- `computeThresholds(window=10K)` → Sehr kleines Fenster (absolute Werte alle negativ), Formel bricht nicht
- Drei Schwellenwerte erfüllen immer `warn <= auto <= hard`
- max()-Formel ist an den Grenzpunkten (pct * window == abs) stabil

### Unit-Tests (tokenEstimation.test.ts)

- `estimateContentTokens` für Plain Text / JSON / functionCall / functionResponse / image / document jeweils mit entsprechendem bytesPerToken
- `estimatePromptTokens` geht bei `lastPromptTokenCount > 0` den „Hauptpfad", bei 0 den „Erstrunden-Pfad"
- Große User-Nachricht kann nach Hinzufügen in der Cheap-Gate-Phase die auto-Schwelle überschreiten
- Abweichung zwischen Schätzung und tatsächlichem API-Verbrauch liegt innerhalb von ±30 % (Regression mit echten historischen Stichproben)

### Integrationstests (geminiChat.test.ts / chatCompressionService.test.ts)

- Nach 3 aufeinanderfolgenden Fehlschlägen Cheap-Gate NOOP; bei nächster force-Operation Erholung
- Ein einzelner Fehlschlag führt nicht mehr zu einer dauerhaften Sperre
- Geschätzte Token überschreiten hard → send löst automatisch force-Komprimierung aus
- Komprimierungs-sideQuery-Aufruf mit `maxOutputTokens = COMPACT_MAX_OUTPUT_TOKENS` korrekt an `runSideQuery` weitergeleitet, `thinkingConfig.includeThoughts` ist `false` (oder wird durch sideQuery-Standardwert überschrieben)
- **Erstrunden-Abdeckung**: Ein Chat mit `lastPromptTokenCount = 0` aber großem Verlauf konstruieren (Simulation einer `--continue`-Wiederherstellung). Beim ersten Senden kann die auto-Schwelle über den Schätzungspfad ausgelöst werden.
### Kompatibilitätstest

- Setzen von `contextPercentageThreshold = 0.5` beim Start → stderr-Warnung + Feld wird ignoriert, Verhalten richtet sich nach der internen PCT-Konstante

### Tip-Systemtest (tipRegistry.test.ts)

- Drei context-*-Tips werden korrekt beim Überschreiten von warn/auto/hard ausgelöst, und die Intervalle überschneiden sich nicht
- Unter dem Hauptpfad wird nach dem Auslösen der Auto-Schwelle komprimiert, `context-high` bleibt nicht dauerhaft sichtbar
- Unter dem Randpfad (Sicherungsauslösung + Token steigen weiter) werden die drei Tips nacheinander ausgelöst
- Bei fehlenden `thresholds` im TipContext (Fallback) ist das Verhalten sinnvoll

## Umsetzung in Phasen

| Phase | Inhalt                                                                                                      | Unabhängigkeit          |
|-------|-------------------------------------------------------------------------------------------------------------|-------------------------|
| 1     | Interne Konstanten + `computeThresholds` + Cheap-Gate-Änderungen (ohne Schätzkompensation)                  | Kann unabhängig gemergt werden |
| 2     | Upgrade der Fehlerbehandlung (1 → 3 Sicherungsauslösungen)                                                  | Kann unabhängig gemergt werden |
| 3     | Hard-Layer-Force-Compress vorzeitig                                                                         | Abhängig von P1 + P7    |
| 4     | Konfigurationsänderungen + Breaking-Change-Warnung                                                         | Abhängig von P1         |
| 5     | UI (Tip-Umschreibung + /context)                                                                            | Abhängig von P1         |
| 6     | Compression sideQuery: thinking abschalten + `maxOutputTokens`-Obergrenze hinzufügen                        | Unabhängig, kann vor P1 ausgerollt werden |
| 7     | Token-Schätzkompensation (`estimateContentTokens` + `estimatePromptTokens`, angewandt auf Cheap-Gate / Hard) | Unabhängig, parallel zu P1 möglich |

Jede Phase kann als separater PR eingereicht werden. Empfohlene Merge-Reihenfolge: **P6 → P7 → P1 → P2 → P4 → P3 → P5**: Zuerst dem Compression-Aufruf eine `maxOutputTokens`-Obergrenze geben (damit der Puffer vertrauenswürdig wird); dann die Schätzkompensation hinzufügen (damit die Token-Zahlen zuverlässiger werden); dann die Schwellenwert-Infrastruktur ausrollen; dann die Fehler-Sicherungen und Konfigurationsänderungen; erst zuletzt den Hard-Layer-Aktiv-Notfall öffnen (zu diesem Zeitpunkt sind zuverlässige Token-Zahlen + Sicherungsauslöser vorhanden). Jeder PR kann unabhängig verifiziert und zurückgerollt werden.

## Risiken und Hinweise

1. **Abschalten des Denkens kann die Zusammenfassungsqualität beeinträchtigen.** Der ursprüngliche Kommentar „Compression quality drives every subsequent main turn — keep reasoning on“ drückte Bedenken aus. Diese Spezifikation stuft „vorhersagbares Token-Limit“ als höher ein als „maximale Qualität“, aber nach der Auslieferung sollte die Verteilung von `compression_input_token_count` / `compression_output_token_count` in der Telemetrie sowie die Qualitätsänderungen der Hauptkonversation nach der Komprimierung beobachtet werden (Benutzerfeedback, `COMPRESSION_FAILED_*`-Statusrate). Bei deutlicher Qualitätsverschlechterung sollte ein Rückfall auf eingeschaltetes Denken mit provider-spezifischer thinkingBudget-Steuerung in Betracht gezogen werden.

2. **Das Erreichen von `maxOutputTokens` kann zu abgeschnittenen Zusammenfassungen führen.** Nach dem Abschalten des Denkens begrenzt 20K direkt den Zusammenfassungstext; claude-code hat in der Praxis p99.99 ≈ 17K, ~3K Sicherheitsreserve. Aber der Compression-Prompt von qwen-code unterscheidet sich von claude-code, die Verteilung muss beobachtet werden. Es wird empfohlen, im Compression-Fehlerpfad ([chatCompressionService.ts:464-491](packages/core/src/services/chatCompressionService.ts:464)) einen NOOP-Pfad für „finish_reason = MAX_TOKENS“ hinzuzufügen, um die Persistierung einer halben Zusammenfassung zu vermeiden.

3. **Unterschiede in der maxOutputTokens-Zuordnung zwischen Providern.** OpenAI Compat (dashscope) → `max_tokens`, Anthropic → `max_tokens`, Gemini SDK → `maxOutputTokens`. Aktuell hat qwen-code diese Zuordnung bereits ([contentGenerator.ts:94](packages/core/src/core/contentGenerator.ts:94) etc.), bei der Implementierung von P6 muss verifiziert werden, dass das Feld `maxOutputTokens` im sideQuery-Pfad tatsächlich bis zum Request-Body aller Provider durchgereicht wird.

4. **Die Token-Schätzung ist eine grobe Untergrenze und sollte nicht als Grundlage für „Auslösen überspringen“ verwendet werden.** Die Abweichung von `char/4` zum echten Tokenizer jedes Providers kann ±30 % betragen. Diese Spezifikation verwendet die Schätzung nur, um die Schwelle früher auszulösen (False-Positive-Richtung, lieber zu früh als zu spät komprimieren). Alle Codepfade, die die Token-Zahl verringern / die Komprimierung überspringen, sollten weiterhin `lastPromptTokenCount` (den autoritativen API-Wert) verwenden.

5. **Beziehung der Schätzfunktion zu bestehendem `estimateContentChars`.** In [compactionInputSlimming.ts](packages/core/src/services/compactionInputSlimming.ts) gibt es bereits `estimateContentChars` (für die Berechnung des Split-Punkts bei der Komprimierung). Die neu hinzugefügten `estimateContentTokens` sollten darauf aufbauen (Division durch bytesPerToken), anstatt einen neuen Satz zu schreiben, um Diskrepanzen zwischen den beiden Schätzmethoden zu vermeiden.

## Nicht im Umfang dieser Spezifikation

- Env-Variablen-Override-Kanal (Plan D): Beibehaltung des Prinzips „Minimale Konfigurationsfläche“
- Footer-Permanent-Visualisierung: Als Follow-up reserviert
- Verbesserung des Zusammenfassungs-Prompts, Anpassung von `MIN_COMPRESSION_FRACTION`: Orthogonal zum Schwellenwert-Design

## Offene Fragen (wartet auf Review)

1. **Stärke des Breaking Changes**: Warnung + Feld ignorieren vs. Startfehler. Aktuell wird die Warnung gewählt, es muss bestätigt werden, ob dies für Unternehmens-Deployments/Team-Konfigurationen ausreichend benutzerfreundlich ist.

## Abgeschlossen

2. **Kleines Fenster (≤ ~76,7K): Hard und Auto fallen auf denselben Wert zurück** – Entscheidung: **Nicht in `/context` anzeigen**. Begründung:
   - Der Kollapsbereich umfasst nicht nur 32K, sondern alle Fenster, bei denen `effectiveWindow - HARD_BUFFER ≤ 0.7 × window` (einschließlich 64K)
   - Das Benutzerverhalten ändert sich nicht: Bei kollabierten Fenstern überspringt `currentTier` den Wert `'auto'` und meldet direkt `'hard'` (`contextCommand.ts:43-44` prüft zuerst `>= hard`); das `context-high`-Band (`auto ≤ t < hard`) wird leer – ein fehlender Zwischenhinweis ist bei kleinen Fenstern sinnvoll, da das Fenster bereits klein ist und Benutzer den Kontext wahrscheinlich manuell verwalten
   - Sollte es in Zukunft echte Benutzerberichte geben, dass der Zwischenhinweis bei kleinen Fenstern fehlt, könnte eine UI-Markierung hinzugefügt oder die Auslösebedingung für `context-high` angepasst werden (das ist UI-Arbeit, nicht Spezifikationsarbeit). Aktuell wird keine zusätzliche UI-Komplexität eingeführt.
