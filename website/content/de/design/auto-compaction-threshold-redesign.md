# Neugestaltung der Auto-Kompaktionsschwelle

**Status:** Entwurf · 14.05.2026

## Hintergrund

> In diesem Abschnitt wird der Zustand **vor** der Umsetzung dieses PRs beschrieben (Verhalten vor der Neugestaltung). Die unten verwendeten Symbole `COMPRESSION_TOKEN_THRESHOLD`, `thinkingConfig.includeThoughts = true`, `hasFailedCompressionAttempt` sowie die konkreten Datei:Zeile-Verweise beziehen sich auf den Code vor der Zusammenführung von PR #4345 – nach der Zusammenführung sind diese Symbole/Zeilenangaben nicht mehr gültig.

Die automatische Kompression von qwen-code verwendet derzeit nur einen einzigen proportionalen Schwellenwert `COMPRESSION_TOKEN_THRESHOLD = 0.7` (`chatCompressionService.ts:33`), der für alle Fenstergrößen gleich ist. Im Vergleich zur „absoluten Token-Leiter" von claude-code (`autoCompact.ts:62-65`) hat qwen-code drei konkrete Probleme:

1. **Zu viel Reserve bei großen Fenstern**: Bei einem 1M-Modell wird der 70%-Schwellenwert bei 700K ausgelöst. Die verbleibenden 300K übertreffen den tatsächlichen Bedarf von ~33K für Zusammenfassung + Ausgabe bei weitem.
2. **Permanente Sperre nach 1 Fehlschlag**: Nach `hasFailedCompressionAttempt = true` wird im gesamten Session kein Auto-Compact mehr versucht (`geminiChat.ts:504`). Dies ist strenger als die „3-malige Unterbrechung" von claude-code.
3. **Tip-System und Auto-Schwelle entkoppelt**: Die drei `context-*`-Tips in `tipRegistry.ts` verwenden feste Prozentsätze von 50/80/95, völlig unabhängig von der Auto-Compact-Schwelle (70%). Dies führt dazu, dass auf dem Hauptpfad, auf dem Auto normal funktioniert, die 80 %/95 %-Tips selten ausgelöst werden, während sie auf den Randpfaden (Auto fehlgeschlagen/reaktive Notfallmaßnahmen) semantisch nicht auf die Schwellenwerte abgestimmt sind.
4. **Der Kompressionsaufruf selbst hat keine Ausgabebudgetkontrolle**: [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) aktiviert explizit `thinkingConfig.includeThoughts = true` (Kommentar: „Compression quality drives every subsequent main turn"), während der SideQuery-Aufruf keine `maxOutputTokens`-Obergrenze setzt. Der Code-Kommentar ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) räumt selbst ein, dass `compressionOutputTokenCount may include non-persisted tokens (thoughts)`. Wenn die Kompression nahe der Fensterobergrenze erfolgt, kann die Gesamtausgabe aufblähen, was die Pufferreserve unvorhersehbar macht.<br/><br/>Noch schlimmer ist das inkonsistente Verhalten zwischen verschiedenen Providern: Das Thinking-Budget von Anthropic ist völlig unabhängig von max_tokens; die Reasoning-Tokens von OpenAI unterliegen nicht der max_completion_tokens-Beschränkung; das Verhalten von Gemini variiert je nach Modellversion. Dies bedeutet, dass der Ansatz „allein durch Hinzufügen von maxOutputTokens die Gesamtausgabe kontrollieren" in einem Multi-Provider-Projekt wie qwen-code nicht funktioniert.

5. **Der für die Schwellenwertprüfung verwendete `lastPromptTokenCount` ist systematisch zu niedrig.** [geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217) zeigt, dass dieser Wert aus `usageMetadata.totalTokenCount` der vorherigen API-Antwort stammt. Zwei Lücken: (a) Er enthält nicht die aktuelle Benutzernachricht, die in dieser Runde hinzugefügt wird. Daher ist jede Cheap-Gate-Prüfung um einen Teil kleiner als der tatsächliche Prompt. (b) Der Anfangswert der ersten Runde ist 0. Bei der Wiederherstellung eines großen Sessions mit `--continue` / der Vererbung umfangreicher History durch Sub-Agents umgeht das erste Senden immer alle Schwellenwerte. Im Vergleich dazu verwendet `tokenCountWithEstimation` von claude-code (`query.ts:638`) ein Zweischienensystem (letzte Assistant-API-Nutzung + Schätzung der danach hinzugefügten Nachrichten), das diese beiden Lücken schließt.

## Designziele

- Einführung eines „proportionalen + absoluten" Mischschwellenwerts: Große Fenstermodelle werden durch den Absolutwert gesteuert, kleine Fenster verwenden weiterhin den proportionalen Schwellenwert als Rückfall.
- Neue Warn-/Hart-Ebenen (Auto bleibt als Hauptauslöser), die eine dreistufige Leiter bilden.
- Umschreiben des Tip-Systems, sodass es den neuen Schwellenwerten als Auslösebedingung folgt.
- Upgrade der Fehlerbehandlung von „1-malige permanente Sperre" zu „3-malige Unterbrechung + automatische Wiederherstellung".
- **Kompression deaktiviert Thinking und fügt eine `maxOutputTokens`-Obergrenze hinzu**: In Anlehnung an claude-code, sodass die Gesamtausgabe durch einen einzigen Parameter begrenzt wird und das Pufferbudget vorhersagbar ist; die mögliche Verschlechterung der Kompressionsqualität wird in Kauf genommen.
- **Hinzufügen einer Token-Schätzkompensation**: Beseitigt die beiden systematischen Unterschätzungen von `lastPromptTokenCount` („eine Runde verzögert" und „erste Runde = 0"), sodass die Schwellenwertprüfung näher an der tatsächlichen Prompt-Größe liegt.
- Entfernen des Konfigurationseintrags `contextPercentageThreshold` in den Einstellungen (interne PCT-Konstanten bleiben erhalten).
- **Keine** Einführung von Umgebungsvariablen-Override-Kanälen, **kein** neuer expliziter Enable/Disable-Schalter.

## Dreistufige Schwellenwertleiter

```
                       window  (rohes Kontextfenster)
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
auto_threshold = max(PCT * window, effectiveWindow - AUTOCOMPACT_BUFFER)
                          │
                          │  ← WARN_BUFFER = 20K
                          ▼
warn_threshold = max((PCT - WARN_OFFSET) * window, auto_threshold - WARN_BUFFER)
                          │
                          ▼
                          0
```

### Semantik der drei Ebenen

| Ebene      | Auslösebedingung                           | Verhalten                                                            |
| ---------- | ------------------------------------------ | -------------------------------------------------------------------- |
| **warn**   | `tokenCount >= warn_threshold`             | UI-Hinweis: „Noch X Tokens bis zur automatischen Kompression", Send-Verhalten unverändert |
| **auto**   | `tokenCount >= auto_threshold`             | Vor dem Senden `tryCompress(force=false)` ausführen, normaler Kompressionsablauf |
| **hard**   | `tokenCount >= hard_threshold`             | Vor dem Senden `tryCompress(force=true)` ausführen, Fehlersperre zurücksetzen und Kompression erzwingen |

Die `hard`-Ebene verlagert die bisherige reaktive Overflow-Notfalllogik (`geminiChat.ts:711`) auf den Zeitpunkt vor dem Senden, um eine fehlgeschlagene Oversized-Request-Round-Trip zu vermeiden.

## Interne Konstanten

```ts
// chatCompressionService.ts
const DEFAULT_PCT = 0.7; // proportionale Auto-Rückfallschwelle
const WARN_PCT_OFFSET = 0.1; // Warn-Schwelle in Prozent = PCT - WARN_OFFSET = 0.6
const COMPACT_MAX_OUTPUT_TOKENS = 20_000; // Absolute Obergrenze für die Ausgabe der Kompressions-SideQuery (Thinking + Zusammenfassung zusammen)
const SUMMARY_RESERVE = 20_000; // Ausgabereserve, die von der Fensterobergrenze für die Schwellenwertleiter abgezogen wird = maxOutput
const AUTOCOMPACT_BUFFER = 13_000; // Abstand zwischen Auto und effectiveWindow
const WARN_BUFFER = 20_000; // Abstand zwischen Warn und Auto
const HARD_BUFFER = 3_000; // Abstand zwischen Hard und effectiveWindow
const MAX_CONSECUTIVE_FAILURES = 3; // Schwellenwert für die Fehlerunterbrechung
```

Wertequelle: Alle Werte sind von den gemessenen Werten von claude-code übernommen ([autoCompact.ts:30,62-65](src/services/compact/autoCompact.ts:30)).

`SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS` ist eine entscheidende Beziehung: Da das Modell durch die harte Grenze von `maxOutputTokens` eingeschränkt ist, kann die Ausgabe nicht über 20K liegen. Daher benötigt die Reserve keinen zusätzlichen Sicherheitsspielraum. Hinweis: Diese Gleichung gilt, nachdem Thinking in diesem Design deaktiviert wurde (das gesamte Output-Budget steht der Zusammenfassung zur Verfügung); wenn Thinking beibehalten würde, würden sich `Thinking + Zusammenfassung` das Budget teilen (Semantik von `maxOutputTokens` im Gemini SDK / den meisten Providern), und das Modell würde selbstständig zwischen beiden aufteilen. In diesem Fall wäre der tatsächlich verfügbare Platz für die Zusammenfassung kleiner als 20K (siehe „Risiken und Hinweise", Punkte 1 und 2).

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
  const hard = Math.max(rawHard, auto); // Degeneration zu auto bei kleinen Fenstern

  return { warn, auto, hard, effectiveWindow };
}
```

### Gemessene Daten

| Fenster | warn        | auto        | hard         | Anmerkung                         |
| ------- | ----------- | ----------- | ------------ | --------------------------------- |
| 32K     | 19,2K (pct) | 22,4K (pct) | 22,4K (Deg.) | Proportionaler Rückfall           |
| 64K     | 38,4K (pct) | 44,8K (pct) | 44,8K (Deg.) | Proportionaler Rückfall           |
| 128K    | 76,8K (pct) | 95K (abs)   | 105K (abs)   | Gemischt (warn=pct, auto/hard=abs)|
| 200K    | 147K (abs)  | 167K (abs)  | 177K (abs)   | Absolutwert übernimmt             |
| 256K    | 203K (abs)  | 223K (abs)  | 233K (abs)   | Absolutwert übernimmt             |
| 1M      | 947K (abs)  | 967K (abs)  | 977K (abs)   | Vollständig absolut               |

`(pct)` bedeutet, dass die Ebene durch die proportionale Formel bestimmt wird, `(abs)` bedeutet, dass sie durch die absolute Formel bestimmt wird.

## Benutzerkonfiguration

### Änderungen an ChatCompressionSettings

```ts
// packages/core/src/config/config.ts:217
export interface ChatCompressionSettings {
  /** Beibehalten (für dieses Design irrelevant, wird von compactionInputSlimming verwendet) */
  imageTokenEstimate?: number;
}
```

**Entfernt:** Das Feld `contextPercentageThreshold`. Begründung:

1.  Unter der neuen Formel hat dieses Feld bei gängigen Fenstern (>= 128K) kaum Einfluss – der absolute Wert übernimmt.
2.  Bei kleinen Fenstern könnte die Benutzerkonfiguration den Schwellenwert sogar „früher" setzen, was der Intuition des Token-Sparens widerspricht.
3.  claude-code legt dieses Feld nicht offen; es gibt kein vergleichbares benutzerseitiges Konfigurationspräzedenz.

### Behandlung von Breaking Changes

**Benutzerseite:** Beim Start stellt `Config` fest, dass `chatCompression.contextPercentageThreshold` vorhanden ist:

- Eine Warnung wird auf stderr ausgegeben: `„chatCompression.contextPercentageThreshold wurde entfernt und wird jetzt durch integrierte Schwellenwerte gesteuert."`
- **Kein** Fehler, **kein** Blockieren des Starts
- Der Feldwert wird ignoriert

**SDK-Seite (R5.4):** Das Feld `hasFailedCompressionAttempt: boolean` in `CompressOptions` wird in `consecutiveFailures: number` umbenannt. Zwei Unterschiede:

|           | Altes Feld                      | Neues Feld                                                           |
| --------- | ------------------------------- | -------------------------------------------------------------------- |
| Name      | `hasFailedCompressionAttempt`   | `consecutiveFailures`                                                |
| Typ       | `boolean`                       | `number`                                                             |
| Semantik  | `true` = dauerhaftes Deaktivieren von Auto-Compact | `>= MAX_CONSECUTIVE_FAILURES` (Standard 3) = vorübergehend deaktiviert, bis ein force-Reset erfolgreich ist |

Es gibt nur einen internen Konsumenten, `GeminiChat.tryCompress`, daher ist das interne Migrationsrisiko gering; aber `@qwen-code/qwen-code-core` ist ein veröffentlichtes Package, `CompressOptions` ist in d.ts sichtbar. Code, der direkt `service.compress({ ..., hasFailedCompressionAttempt: true })` aufruft, erhält einen TS-Kompilierungsfehler. **Migrationsleitfaden:** Ersetzen Sie `true` durch `MAX_CONSECUTIVE_FAILURES` (oder eine beliebige ganze Zahl >= 3), `false` durch `0`. Wenn der Aufrufer eine eigene Fehleranzahl verwaltet, kann diese direkt übergeben werden.

## Token-Schätzkompensation

`lastPromptTokenCount` von qwen-code stammt aus `usageMetadata.totalTokenCount` der vorherigen API-Antwort ([geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217)). Dies führt zu:

1. **Eine Runde Verzögerung**: Die Cheap-Gate-Prüfung verwendet `lastPromptTokenCount`, aber der tatsächliche Prompt dieser Sendung = dieser Wert + die aktuelle Benutzernachricht. Die fehlende Menge kann zu False-Negatives bei der Schwellenwertprüfung führen.
2. **Erste Runde = 0**: Der Anfangswert ist 0. Unabhängig von der History-Größe wird beim ersten Senden kein Schwellenwert ausgelöst (einschließlich `--continue`-Wiederherstellung / Sub-Agent-Vererbung).

Einführung einer leichten, lokalen Schätzfunktion `estimatePromptTokens`, die diese beiden fehlenden Teile vor dem Senden bei der Cheap-Gate-/Hard-Prüfung ergänzt:

```ts
// chatCompressionService.ts (oder neue Datei packages/core/src/services/tokenEstimation.ts)

const BYTES_PER_TOKEN = 4; // Allgemeine char/4-Schätzung (claude-code verwendet dasselbe)
const BYTES_PER_TOKEN_JSON = 2; // JSON / tool_call-Eingabe ist dichter

/**
 * Schätzt die Token-Anzahl einer Gruppe von Content-Objekten,
 * um die Verzögerung der API-Nutzungsmetadaten zu kompensieren.
 * Für Bilder/Dokumente wird der bestehende imageTokenEstimate (Standard 1600) wiederverwendet.
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  // Verwendet estimateContentChars (compactionInputSlimming.ts) und teilt durch bytesPerToken
  // Intern werden functionCall/functionResponse mit BYTES_PER_TOKEN_JSON berechnet
  // ...
}

/**
 * Einheitlicher Einstiegspunkt für Cheap-Gate- und Hard-Prüfungen.
 * Hauptpfad: lastPromptTokenCount ist genau + Schätzung der aktuellen Benutzernachricht
 * Erster-Runde-Pfad: Schätzung der gesamten History
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

- Cheap-Gate in `chatCompressionService.compress()`: Ersetzen der Quelle von `originalTokenCount` durch `estimatePromptTokens(history, userMessage, lastPromptTokenCount)`
- Hard-Prüfung am Einstiegspunkt `geminiChat.sendMessageStream` (siehe nächster Abschnitt)

**Die Schätzung wird nur verwendet, um die Auslösung vorzuverlegen, nicht um sie zu überspringen.** Da char/4 eine grobe untere Grenzschätzung ist, ist sie auf der False-Positive-Seite sicher (lieber etwas früher komprimieren), aber auf der False-Negative-Seite unzuverlässig.

## Änderungen der Auslösekette

### chatCompressionService.ts

1. **Export von `computeThresholds`** zur Wiederverwendung durch Cheap-Gate / UI / Befehle
2. **Cheap-Gate in `compress()`** (Zeile 221-249):
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
3. **Aufruf von runSideQuery in `compress()`** (Zeile 356-380): Thinking deaktivieren + `maxOutputTokens` hinzufügen:

   ```ts
   const summaryResult = await runSideQuery(config, {
     // ...
     config: {
       thinkingConfig: { includeThoughts: false }, // Thinking deaktivieren (übereinstimmend mit claude-code)
       maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS, // Harte Obergrenze von 20K
     },
     // ...
   });
   ```

   Oder einfach `thinkingConfig` entfernen, sodass der Standardwert von `runSideQuery` (`sideQuery.ts:118` standardmäßig `includeThoughts: false`) greift.

   Nach dem Deaktivieren von Thinking begrenzt `maxOutputTokens` direkt die Gesamtausgabe (es gibt kein separates Thinking-Budget-Problem), und `SUMMARY_RESERVE = maxOutput = 20K` ist eine saubere, harte Beziehung.

   Gleichzeitig wird der Kommentar in [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) von „Compression quality drives every subsequent main turn — keep reasoning on" in eine Erklärung geändert, dass die Ausrichtung am claude-code-Design erfolgt, um eine über alle Provider hinweg vorhersagbare Ausgabeobergrenze zu gewährleisten.

   Der Token-Mathematik-Kommentar ([:436-437](packages/core/src/services/chatCompressionService.ts:436)) mit „may include non-persisted tokens (thoughts)" kann ebenfalls synchron bereinigt werden.

### geminiChat.ts: Einstiegspunkt `sendMessageStream` (Zeile 562)

```ts
// Vorher: tryCompress(force=false)
// Nachher: Prüfung mit geschätzten Tokens, ob Hard-Schwelle überschritten wird, Festlegung des Force-Flags

const { hard } = computeThresholds(contextLimit);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  createUserContent(params.message),
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;

if (shouldForceFromHard) {
  // Unterbrechung zurücksetzen, entspricht force compress
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
);
```

### Fehlerbehandlungs-Upgrade (`geminiChat.ts:504-510`)

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

Fehlschläge bei Aufrufen mit `force=true` werden nicht gezählt (die bestehende Semantik, dass reaktive/manuelle Aufrufe nicht das „Kontingent" belasten, bleibt erhalten).

## UI-Änderungen

### Umschreiben der drei context-*-Tips in tipRegistry.ts

Die drei Ebenen entsprechen genau den drei Tips. Zuordnung (nach Token-Anzahl aufsteigend):

| Tip-ID          | Aktuelle Bedingung                                | Neue Bedingung                                                        | Textänderung                                                       |
| --------------- | ------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `compress-intro`| `pct >= 50 && < 80 && sessionPromptCount > 5`     | `tokenCount >= warn && tokenCount < auto && sessionPromptCount > 5`   | Unverändert                                                        |
| `context-high`  | `pct >= 80 && < 95`                               | `tokenCount >= auto && tokenCount < hard`                             | Unverändert                                                        |
| `context-critical`| `pct >= 95`                                     | `tokenCount >= hard`                                                  | Ein Satz hinzugefügt: „Auto-compact wird beim nächsten Senden erzwungen.", um das Verhalten der neuen Hard-Ebene widerzuspiegeln. |

**Auswirkung auf die Auslösefrequenz:**

- Hauptpfad (Auto funktioniert normal): Nachdem `tokenCount` die Auto-Schwelle überschritten hat, wird sofort die Kompression ausgelöst. In der nächsten Runde fällt `tokenCount` wieder ab. Daher ist `context-high` nur kurz zwischen „Auslösung" und „Wirksamwerden der Kompression" sichtbar.
- Randpfade (Auto fehlgeschlagen/Unterbrechung/Reaktion zu spät): `tokenCount` steigt kontinuierlich an und durchläuft nacheinander warn → auto → hard, wodurch die drei Tips ausgelöst werden. Dies entspricht der Benutzerperspektive, dass der Kontext „immer enger wird".
- Wenn `context-critical` ausgelöst wird, hat die Hard-Ebene bereits vor dem Senden eine Force-Kompression durchgeführt (siehe Abschnitt „Änderungen der Auslösekette" im Lastenheft). Daher ist dieser Tip eigentlich eine „Post-Rettungs-Mitteilung" und keine „Pre-Rettungs-Warnung". Der Text wird entsprechend ergänzt.

Dem Interface `TipContext` wird Folgendes hinzugefügt:

```ts
export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  // Neu: Ermöglicht der isRelevant-Funktion den Zugriff auf die Schwellenwerte.
  // computeThresholds wird beim Aufrufer berechnet und injiziert,
  // um eine direkte Abhängigkeit des tipRegistry von core zu vermeiden.
  thresholds?: CompactionThresholds;
}
```

`AppContainer.tsx:1150` injiziert bei der Konstruktion von `TipContext` gleichzeitig die Schwellenwerte.

### Synchronisierung des /context-Befehls (`contextCommand.ts:177-183`)

```ts
// Ersetzt den hartcodierten (1 - threshold) * contextWindowSize
const { warn, auto, hard, effectiveWindow } =
  computeThresholds(contextWindowSize);

// Zeigt vier Zeilen an:
//   Effektives Fenster:   180K   (Fenster − 20K Reserve)
//   Warn-Schwelle:        147K   (...)
//   Auto-Schwelle:        167K   ← Aktuelle Position
//   Hard-Schwelle:        177K
// Markiert, in welcher Stufe sich der aktuelle Token-Zähler befindet
```

### Kontinuierliche Fußzeilenanzeige (optionales Follow-up)

Dieses Lastenheft erzwingt keine kontinuierliche Fußzeilenanzeige. Gründe:

- Das bestehende Tip-System kann bereits Hinweise im Verlauf geben.
- Eine kontinuierliche Fußzeilenanzeige erfordert Änderungen an der Ink-Darstellung und erhöht die Neuzeichnungsfrequenz.
- Dies könnte als nachgelagertes Follow-up zu diesem Lastenheft (separater PR) umgesetzt werden.

Sollte dies später erfolgen, wird als Auslösebedingung `tokenCount >= warn && tokenCount < auto` empfohlen; nach Überschreiten von auto wird die Anzeige ausgeblendet (Kompression hat begonnen).

## Testabdeckung

### Unit-Tests (chatCompressionService.test.ts)

- `computeThresholds(32K)` → Proportionaler-Rückfall-Zweig (warn/auto beide pct, hard degeneriert)
- `computeThresholds(128K)` → Gemischter Zweig (warn=pct, auto=abs, hard=abs)
- `computeThresholds(200K)` → Absolutwert-übernimmt-Zweig (warn/auto/hard alle abs)
- `computeThresholds(1M)` → Vollständig absoluter Zweig
- `computeThresholds(window=10K)` → Extrem kleines Fenster (absolute Werte alle negativ), Formel bricht nicht ab
- Die drei Schwellenwerte erfüllen stets `warn <= auto <= hard`
- Die max()-Formel ist an den Grenzpunkten stabil (pct * window == abs)

### Unit-Tests (tokenEstimation.test.ts)

- `estimateContentTokens` durchläuft für Klartext/JSON/functionCall/functionResponse/Bild/Dokument jeweils die entsprechenden bytesPerToken
- `estimatePromptTokens` durchläuft bei `lastPromptTokenCount > 0` den „Hauptpfad", bei 0 den „Erster-Runde-Pfad"
- Eine große Benutzernachricht, die in der Cheap-Gate-Phase hinzugefügt wird, kann die Auto-Schwelle überschreiten
- Die Abweichung zwischen Schätzung und tatsächlicher API-Nutzung liegt innerhalb von ±30 % (Regression mit echten History-Stichproben)

### Integrationstests (geminiChat.test.ts / chatCompressionService.test.ts)

- Nach 3 aufeinanderfolgenden Fehlschlägen gibt Cheap-Gate NOOP zurück; beim nächsten Force-Aufruf wird die Kompression wiederhergestellt
- Ein einzelner Fehlschlag führt nicht mehr zu einer permanenten Sperre
- Nach Überschreiten der Hard-Schwelle durch geschätzte Tokens wird beim Senden automatisch eine Force-Kompression durchgeführt
- Der SideQuery-Aufruf der Kompression übergibt `maxOutputTokens = COMPACT_MAX_OUTPUT_TOKENS` korrekt an `runSideQuery`, `thinkingConfig.includeThoughts` ist `false` (oder wird durch den Standardwert von sideQuery ersetzt)
- **Erste-Runde-Abdeckung**: Erstellen eines Chats mit `lastPromptTokenCount = 0` und großer History (Simulation der Wiederherstellung mit `--continue`). Beim ersten Senden kann die Auto-Schwelle durch den Schätzungspfad ausgelöst werden

### Kompatibilitätstests

- Starten mit der Einstellung `contextPercentageThreshold = 0.5` → stderr-Warnung + Feld wird ignoriert, das Verhalten richtet sich nach der internen PCT-Konstante

### Tests des Tip-Systems (tipRegistry.test.ts)

- Die drei context-*-Tips werden beim Überschreiten von warn/auto/hard korrekt ausgelöst und die Bereiche überschneiden sich nicht
- Unter dem Hauptpfad ist `context-high` nach dem Auslösen der Kompression durch die Auto-Schwelle nicht dauerhaft sichtbar
- Unter dem Randpfad (Unterbrechung + Tokens steigen weiter) werden die drei Tips nacheinander ausgelöst
- Das Verhalten bei fehlendem `thresholds` im `TipContext` (Fallback) ist sinnvoll

## Phasenweise Implementierung

| Phase | Inhalt                                                                                           | Unabhängigkeit         |
| ----- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| 1     | Interne Konstanten + `computeThresholds` + Cheap-Gate-Änderungen (ohne Schätzkompensation)       | Kann unabhängig gemergt werden |
| 2     | Upgrade der Fehlerbehandlung (1 → 3 Unterbrechungen)                                            | Kann unabhängig gemergt werden |
| 3     | Vorzeitige Force-Kompression auf Hard-Ebene                                                     | Abhängig von P1 + P7   |
| 4     | Konfigurationsseitige Änderungen + Breaking-Change-Warnung                                      | Abhängig von P1        |
| 5     | UI (Tip-Umschreibung + /context)                                                                | Abhängig von P1        |
| 6     | Kompressions-SideQuery: Thinking deaktivieren + `maxOutputTokens`-Obergrenze hinzufügen          | Unabhängig, kann vor P1 umgesetzt werden |
| 7     | Token-Schätzkompensation (`estimateContentTokens` + `estimatePromptTokens`, angewandt auf Cheap-Gate/Hard) | Unabhängig, kann parallel zu P1 erfolgen |

Jede Phase kann ein separater PR sein. Empfohlene Merge-Reihenfolge **P6 → P7 → P1 → P2 → P4 → P3 → P5**: Zuerst die `maxOutputTokens`-Obergrenze für Kompressionsaufrufe setzen (damit die Pufferannahme vertrauenswürdig ist); dann die Schätzkompensation hinzufügen (damit die Token-Zählung zuverlässiger wird); dann die Schwellenwert-Infrastruktur bereitstellen; dann die Fehlerunterbrechung und Konfigurationsänderungen vornehmen; erst zuletzt die aktive Rettung auf Hard-Ebene aktivieren (dann mit zuverlässigen Token-Zahlen und Unterbrechung). Jeder PR kann unabhängig validiert und zurückgerollt werden.

## Risiken und Hinweise

1. **Das Deaktivieren von Thinking könnte die Zusammenfassungsqualität beeinträchtigen.** Der ursprüngliche Kommentar „Compression quality drives every subsequent main turn — keep reasoning on" drückte diese Besorgnis aus. Dieses Lastenheft entscheidet sich für „vorhersagbare Token-Obergrenze" vor „maximale Qualität". Nach der Umsetzung muss jedoch die Verteilung von `compression_input_token_count` / `compression_output_token_count` in der Telemetrie sowie die Qualitätsänderung des Hauptdialogs nach der Kompression beobachtet werden (Benutzerfeedback, `COMPRESSION_FAILED_*`-Statusrate). Sollte die Qualität deutlich nachlassen, kann eine Rückkehr zu aktiviertem Thinking mit provider-spezifischer ThinkingBudget-Steuerung in Betracht gezogen werden.

2. **Das Erreichen der `maxOutputTokens`-Obergrenze könnte dazu führen, dass die Zusammenfassung abgeschnitten wird.** Nach dem Deaktivieren von Thinking begrenzt 20K direkt den Hauptteil der Zusammenfassung; claude-code hat gemessene p99.99 ≈ 17K, mit ~3K Sicherheitsreserve. Aber der Kompressions-Prompt von qwen-code unterscheidet sich von dem von claude-code; die Verteilung muss beobachtet werden. Es wird empfohlen, im Fehlerfall der Kompression ([chatCompressionService.ts:464-491](packages/core/src/services/chatCompressionService.ts:464)) einen NOOP-Pfad für „finish_reason = MAX_TOKENS erkannt" hinzuzufügen, um das Persistieren einer abgeschnittenen Zusammenfassung zu vermeiden.

3. **Provider-übergreifende Unterschiede in der maxOutputTokens-Abbildung.** OpenAI compat (dashscope) → `max_tokens`, Anthropic → `max_tokens`, Gemini SDK → `maxOutputTokens`. qwen-code hat diese Abbildung bereits ([contentGenerator.ts:94](packages/core/src/core/contentGenerator.ts:94) usw.). Bei der Implementierung von P6 muss verifiziert werden, dass das Feld `maxOutputTokens` auf dem SideQuery-Pfad tatsächlich in den Request-Body aller Provider durchdringt.

4. **Die Token-Schätzung ist eine grobe untere Grenze und sollte nicht als Grundlage für „Auslösung überspringen" verwendet werden.** Die Abweichung von `char/4` zu den tatsächlichen Tokenizern der Provider kann ±30 % betragen. Dieses Lastenheft verwendet die Schätzung nur, um „Schwellenwerte früher auszulösen" (False-Positive-Richtung: lieber zu früh als zu spät komprimieren). Alle Codepfade, die „Token-Anzahl verringern / Kompression überspringen", sollten weiterhin `lastPromptTokenCount` (den autoritativen API-Wert) verwenden.

5. **Beziehung der Schätzfunktion zu `estimateContentChars`.** In [compactionInputSlimming.ts](packages/core/src/services/compactionInputSlimming.ts) gibt es bereits `estimateContentChars` (für die Berechnung von Kompressions-Split-Punkten). Die neue `estimateContentTokens` sollte diese Funktion wiederverwenden (durch bytesPerToken teilen), anstatt eine neue zu schreiben, um Abweichungen zwischen den beiden Schätzmethoden zu vermeiden.

## Nicht in diesem Lastenheft enthalten

- Umgebungsvariablen-Override-Kanäle (D-Ansatz): Das Prinzip „minimale Konfigurationsfläche" bleibt erhalten.
- Permanente Fußzeilenvisualisierung: Bleibt als Follow-up.
- Verbesserungen des Zusammenfassungs-Prompts, Anpassung von `MIN_COMPRESSION_FRACTION`: Orthogonal zum Schwellenwert-Design.

## Offene Fragen (warten auf Review)

1. **Stärke des Breaking Changes**: Warnung + Feld ignorieren vs. Startfehler. Derzeit wird die Warnung bevorzugt. Es muss bestätigt werden, ob dies für Enterprise-Bereitstellungen/Team-Konfigurationen ausreichend benutzerfreundlich ist.

## Abgeschlossen

2. **Bei kleinen Fenstern (≤ ~76,7K) fallen Hard und Auto auf denselben Wert zurück** – Entscheidung: **keine explizite Anzeige in `/context`**. Begründung:
   - Der Kollapsbereich umfasst nicht nur 32K, sondern alle Fenster, bei denen `effectiveWindow - HARD_BUFFER ≤ 0.7 × window` gilt (einschließlich 64K).
   - Das Benutzerverhalten ändert sich nicht: Im kollabierten Fenster überspringt `currentTier` die Stufe `'auto'` und meldet direkt `'hard'` (`contextCommand.ts:43-44` prüft zuerst `>= hard`). Das Band `context-high` (`auto ≤ t < hard`) wird leer. Das Fehlen einer Zwischenstufe ist bei kleinen Fenstern sinnvoll – das Fenster selbst ist klein, der Benutzer verwaltet den Kontext wahrscheinlich manuell.
   - Sollte es in Zukunft echte Benutzerberichte geben, dass die Zwischenstufe bei kleinen Fenstern nicht sichtbar ist, kann zu diesem Zeitpunkt entschieden werden, eine UI-Markierung hinzuzufügen oder die Auslösebedingung für `context-high` anzupassen (dies ist eine UI-Aufgabe, keine Lastenheft-Aufgabe). Derzeit wird darauf verzichtet, die UI-Komplexität zu erhöhen.