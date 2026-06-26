# Umgestaltungsplan für die automatische Komprimierungsschwelle

> **Für agentische Arbeiter:** ERFORDERLICHE UNTERFÄHIGKEIT: Verwenden Sie Superkräfte:subagent-getriebene-Entwicklung (empfohlen) oder Superkräfte:Ausführende-Pläne, um diesen Plan Aufgabe für Aufgabe umzusetzen. Schritte verwenden die Kontrollkästchen-Syntax (`- [ ]`) zum Nachverfolgen.

**Ziel:** Die einstufige prozentuale Schwelle (70 %) der automatischen Komprimierung von qwen-code auf eine gemischte „Prozent + Absolut“- dreistufige Schwellenleiter (warn / auto / hard) aufrüsten, gleichzeitig der Komprimierungsaufruf selbst mit einem `maxOutputTokens`-Limit versehen, das Denken deaktivieren, eine Fehlerunterbrechung einführen, die Verzögerung/Lückenschließung bei `lastPromptTokenCount` beheben und die Benutzerkonfigurationsfläche bereinigen.

**Architektur:**

- `chatCompressionService.ts` fügt `computeThresholds(window)` hinzu, das `{ warn, auto, hard }` ausgibt; cheap-gate verwendet `auto`, der `sendMessageStream`-Einstiegspunkt fügt hard als aktive Rettung hinzu.
- Neues `tokenEstimation.ts` bietet eine lokale char/4-Schätzfunktion, um die beiden Lücken von `lastPromptTokenCount` („eine Runde verzögert + erste Runde ist 0“) zu kompensieren.
- Die Fehlerbehandlung wird von einem einmaligen Lock `hasFailedCompressionAttempt: boolean` auf eine dreimalige Unterbrechung `consecutiveFailures: number` aufgewertet.
- Der Komprimierungs-sideQuery-Aufruf schaltet das Denken aus + fügt `maxOutputTokens: 20K` hinzu.
- Löscht das Feld `chatCompression.contextPercentageThreshold` aus den Einstellungen; bei Start wird bei alter Konfiguration eine Warnung auf stderr ausgegeben und diese ignoriert.
- Drei context-\* Tipps in `tipRegistry.ts` werden neu geschrieben, um den neuen Schwellen zu folgen; der Befehl `/context` zeigt die dreistufigen Werte an.

**Tech Stack:** TypeScript, Vitest, `@google/genai`, vorhandenes Schätztool `compactionInputSlimming`.

**Zusammenführungsreihenfolge:** P6 → P7 → P1 → P2 → P4 → P3 → P5. Jede Aufgabe ist ein PR-Kandidat.

---

## Dateistruktur

| Pfad                                                           | Aktion   | Verantwortung                                                                                              |
| -------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/core/src/services/tokenEstimation.ts`                | Erstellen | Zeichenbasierte Token-Schätzung + `estimatePromptTokens`-Einstiegspunkt                                    |
| `packages/core/src/services/tokenEstimation.test.ts`           | Erstellen | Unit-Tests für die Schätzfunktion                                                                          |
| `packages/core/src/services/chatCompressionService.ts`         | Ändern   | Neue Konstanten + `computeThresholds`; cheap-gate ändern; Denken ausschalten + maxOutput; Fehlerzählung ändern |
| `packages/core/src/services/chatCompressionService.test.ts`    | Ändern   | Unit-Tests für computeThresholds + Assertions für cheap-gate / sideQuery-Konfiguration                     |
| `packages/core/src/core/geminiChat.ts`                         | Ändern   | Hard-Prüfung am `sendMessageStream`-Einstiegspunkt hinzufügen; `hasFailedCompressionAttempt` → `consecutiveFailures` |
| `packages/core/src/core/geminiChat.test.ts`                    | Ändern   | Integrationstests für Hard-Auslösung + Unterbrecher + Abdeckung der ersten Runde                           |
| `packages/core/src/config/config.ts`                           | Ändern   | `contextPercentageThreshold` aus `ChatCompressionSettings` löschen; Startwarnung                          |
| `packages/cli/src/services/tips/tipRegistry.ts`                | Ändern   | Drei context-\* Tipps verwenden absolute Schwellenvergleiche; `TipContext` um `thresholds` erweitern       |
| `packages/cli/src/services/tips/tipRegistry.test.ts`           | Erstellen/Ändern | Tests für Tipp-Auslöseintervalle                                                                  |
| `packages/cli/src/ui/commands/contextCommand.ts`               | Ändern   | Neue dreistufige Schwellenwerte anzeigen                                                                    |
| `packages/cli/src/ui/commands/contextCommand.test.ts`          | Ändern   | Ausgabe-Snapshot                                                                                           |
| `packages/cli/src/ui/AppContainer.tsx`                         | Ändern   | `thresholds` beim Erstellen von `TipContext` injizieren                                                    |

---

## Phase P6 — Komprimierungs-sideQuery Denken ausschalten + maxOutputTokens hinzufügen

Erste Umsetzung, damit nachfolgende Schwellenannahmen vertrauenswürdig sind. Unabhängiger PR.

### Aufgabe 1: sideQuery-Aufruf in chatCompressionService ändern

**Dateien:**

- Ändern: `packages/core/src/services/chatCompressionService.ts:374-376`
- Ändern: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Import-Abschnitt am Anfang von `chatCompressionService.test.ts` um Spy-Einstiegspunkt erweitern und Test innerhalb einer geeigneten `describe`-Gruppe hinzufügen. `runSideQuery` ist bereits ein Modulexport, kann also mit `spyOn` versehen werden:

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress sideQuery config', () => {
  it('übergibt maxOutputTokens=20_000 und includeThoughts=false an runSideQuery', async () => {
    const spy = vi.spyOn(sideQueryModule, 'runSideQuery').mockResolvedValue({
      text: '<state_snapshot>summary</state_snapshot>',
      usage: {
        promptTokenCount: 1000,
        candidatesTokenCount: 500,
        totalTokenCount: 1500,
      },
    } as any);

    const service = new ChatCompressionService();
    await service.compress(makeFakeChat(), {
      promptId: 'p',
      force: true,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 180_000,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const callArg = spy.mock.calls[0]![1];
    expect(callArg.config?.thinkingConfig?.includeThoughts).toBe(false);
    expect(callArg.config?.maxOutputTokens).toBe(20_000);
  });
});
```

`makeFakeChat` / `makeFakeConfig` verwenden vorhandene Test-Helper (falls in der Datei vorhanden, direkt verwenden; falls nicht, einen minimalen Stub inline einfügen).

- [ ] **Schritt 2: Test ausführen, um Fehlschlag zu überprüfen**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'übergibt maxOutputTokens=20_000'
```

Erwartet: FAIL — Derzeit wird `{ thinkingConfig: { includeThoughts: true } }` übergeben, und es gibt kein `maxOutputTokens`.

- [ ] **Schritt 3: Implementieren — chatCompressionService.ts ändern**

Den gesamten `config:`-Block an [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) ersetzen:

```ts
const summaryResult = await runSideQuery(config, {
  purpose: 'chat-compression',
  model,
  maxAttempts: 1,
  systemInstruction: getCompressionPrompt(),
  contents: [
    ...slim.slimmedHistory,
    {
      role: 'user',
      parts: [
        {
          text: 'Überlege zuerst in deinem Notizblock. Generiere dann den <state_snapshot>.',
        },
      ],
    },
  ],
  // Die Komprimierungsausgabe wird durch maxOutputTokens begrenzt, um eine
  // vorhersagbare Reserve über alle Anbieter hinweg zu gewährleisten
  // (siehe docs/design/auto-compaction-threshold-redesign.md).
  // Das Denken ist deaktiviert, da die Semantik der Denk-Budgets pro Anbieter
  // inkonsistent ist (Anthropic/OpenAI zählen es separat, Gemini variiert modellabhängig).
  config: {
    thinkingConfig: { includeThoughts: false },
    maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS,
  },
  abortSignal: signal ?? new AbortController().signal,
  promptId,
});
```

Im Konstantenbereich am Dateianfang (direkt nach `TOOL_ROUND_RETAIN_COUNT`) hinzufügen:

```ts
/**
 * Hartes Limit für die sideQuery-Ausgabe der Komprimierung (nur Zusammenfassungstext, da
 * das Denken deaktiviert ist). Spiegelt claude-code's MAX_OUTPUT_TOKENS_FOR_SUMMARY
 * (autoCompact.ts:30) wider, das auf dem p99.99 der realen Komprimierungsausgaben basiert.
 */
export const COMPACT_MAX_OUTPUT_TOKENS = 20_000;
```

Gleichzeitig den Kommentar `„kann nicht-persistierte Tokens (Gedanken) enthalten“` im Token-Mathematik-Abschnitt von `compress()` (etwa Zeile 436-437) anpassen — da jetzt keine Denkausgabe mehr existiert, den Satz in „compressionOutputTokenCount spiegelt nur die Zusammenfassungs-Tokens wider, da das Denken deaktiviert ist“ ändern.

- [ ] **Schritt 4: Test ausführen, um Bestehen zu überprüfen**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Erwartet: PASS (Neuer Test + vorhandene Tests sollten nicht zurückgehen)

- [ ] **Schritt 5: Typecheck + Lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

Erwartet: Keine Fehler.

- [ ] **Schritt 6: Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): sideQuery-Ausgabe der Komprimierung begrenzen und Denken deaktivieren

COMPACT_MAX_OUTPUT_TOKENS=20_000 hinzugefügt und maxOutputTokens an den
runSideQuery-Aufruf übergeben, thinkingConfig.includeThoughts deaktiviert.
Entspricht claude-code's autoCompact-Reserve, sodass die nachgelagerte
Schwellenleiter (P1/P3) sich auf eine vorhersagbare Obergrenze für die
Zusammenfassungsausgabe über alle Anbieter hinweg verlassen kann (Anthropic /
OpenAI / Gemini behandeln Denkbudgets inkonsistent).

Co-Authored-By: Claude Opus 4.7 (1M Kontext) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P7 — Token-Schätzungskompensation

Behebt die Verzögerung/Lücke der ersten Runde bei `lastPromptTokenCount`. 3 Aufgaben.

### Aufgabe 2: Neue tokenEstimation.ts-Einheit

**Dateien:**

- Erstellen: `packages/core/src/services/tokenEstimation.ts`
- Erstellen: `packages/core/src/services/tokenEstimation.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`packages/core/src/services/tokenEstimation.test.ts`:

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import {
  estimateContentTokens,
  estimatePromptTokens,
} from './tokenEstimation.js';

const textContent = (text: string): Content => ({
  role: 'user',
  parts: [{ text }],
});

describe('estimateContentTokens', () => {
  it('gibt 0 für leeres Array zurück', () => {
    expect(estimateContentTokens([])).toBe(0);
  });

  it('schätzt reinen Text mit ~chars/4', () => {
    // "hello world" = 11 Zeichen → ceil(11/4) = 3
    expect(estimateContentTokens([textContent('hello world')])).toBe(3);
  });

  it('summiert Tokens über mehrere Nachrichten', () => {
    const a = textContent('aaaa'); // 4/4 = 1
    const b = textContent('bbbbbbbb'); // 8/4 = 2
    expect(estimateContentTokens([a, b])).toBe(3);
  });

  it('schätzt inlineData über imageTokenEstimate', () => {
    const c: Content = {
      role: 'user',
      parts: [{ inlineData: { mimeType: 'image/png', data: 'xxx' } }],
    };
    expect(estimateContentTokens([c], 1600)).toBe(1600);
  });

  it('schätzt functionCall (json-dicht) mit ~chars/2', () => {
    const c: Content = {
      role: 'model',
      parts: [{ functionCall: { name: 'foo', args: { a: 1, b: 2 } } }],
    };
    // estimateContentChars stringifiziert; das resultierende JSON ist kurz,
    // aber das Verhältnis (chars/2) sollte dies >= dem chars/4-Pfad machen.
    const result = estimateContentTokens([c]);
    expect(result).toBeGreaterThan(0);
  });
});

describe('estimatePromptTokens', () => {
  const history: Content[] = [
    textContent('ältere Nachricht a'),
    textContent('ältere Nachricht b'),
  ];
  const user = textContent('aktuelle Benutzernachricht');

  it('verwendet lastPromptTokenCount + Benutzernachricht-Schätzung wenn count > 0', () => {
    const userEst = estimateContentTokens([user]);
    expect(estimatePromptTokens(history, user, 5000)).toBe(5000 + userEst);
  });

  it('greift auf vollständige Schätzung zurück wenn lastPromptTokenCount 0 ist', () => {
    const fullEst = estimateContentTokens([...history, user]);
    expect(estimatePromptTokens(history, user, 0)).toBe(fullEst);
  });
});
```

- [ ] **Schritt 2: Test ausführen, um Fehlschlag zu überprüfen**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

Erwartet: FAIL — `tokenEstimation.ts` wurde noch nicht erstellt.

- [ ] **Schritt 3: Implementieren — tokenEstimation.ts erstellen**

`packages/core/src/services/tokenEstimation.ts`:

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import {
  DEFAULT_IMAGE_TOKEN_ESTIMATE,
  estimateContentChars,
} from './compactionInputSlimming.js';

/**
 * Durchschnittliche Bytes-pro-Token für zeichenbasierte Tokenschätzung.
 * Entspricht claude-code's standardmäßigem roughTokenCountEstimation (tokens.ts).
 */
const BYTES_PER_TOKEN = 4;

/**
 * Schätzt die Tokenanzahl einer Liste von Content-Objekten über char/4.
 *
 * Verwendet `estimateContentChars` wieder, sodass inlineData / functionCall /
 * functionResponse die gleiche Behandlung erfahren wie bei der Berechnung von
 * Komprimierungssplit-Punkten — die Synchronisation der beiden Schätzer
 * verhindert, dass der automatische Komprimierungsauslöser und der Splitter
 * sich über die Größe uneinig sind.
 *
 * Nur für das Pre-Send-Schwellentor vorgesehen. Char/4 ist eine konservative
 * untere Grenze (echte Tokenizer variieren um ±30 %); die Verwendung zum
 * FRÜHEREN Auslösen der Komprimierung ist sicher (falsch-positiv), die
 * Verwendung zum ÜBERSPRINGEN der Komprimierung ist es nicht.
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate: number = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  let totalChars = 0;
  for (const content of contents) {
    totalChars += estimateContentChars(content, imageTokenEstimate);
  }
  return Math.ceil(totalChars / BYTES_PER_TOKEN);
}

/**
 * Berechnet eine effektive Prompt-Tokenanzahl für das automatische Komprimierungstor.
 *
 * `lastPromptTokenCount` (aus den Nutzungsmetadaten der vorherigen Runde) fehlen
 * zwei Dinge: die aktuelle Benutzernachricht und jeder Anfangswert beim allerersten
 * Senden. Dieser Helfer schließt beide Lücken mittels lokaler Schätzung.
 */
export function estimatePromptTokens(
  history: Content[],
  userMessage: Content,
  lastPromptTokenCount: number,
  imageTokenEstimate: number = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  if (lastPromptTokenCount > 0) {
    return (
      lastPromptTokenCount +
      estimateContentTokens([userMessage], imageTokenEstimate)
    );
  }
  return estimateContentTokens([...history, userMessage], imageTokenEstimate);
}
```

- [ ] **Schritt 4: Test ausführen, um Bestehen zu überprüfen**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

Erwartet: PASS

- [ ] **Schritt 5: Typecheck + Lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Schritt 6: Commit**

```bash
git add packages/core/src/services/tokenEstimation.ts packages/core/src/services/tokenEstimation.test.ts
git commit -m "$(cat <<'EOF'
feat(core): Schätzhelfer für Token zur Komprimierungstor hinzugefügt

Führe estimateContentTokens / estimatePromptTokens ein, aufbauend auf dem
vorhandenen estimateContentChars (compactionInputSlimming) dividiert durch
ein char/4-Verhältnis. Wird die rohe Verwendung von lastPromptTokenCount
an den Cheap-Gate- und Hard-Threshold-Prüfungen ersetzen, sodass das
System auf (a) die aktuelle Benutzernachricht und (b) das allererste Senden
(wo der von der API gemeldete Count 0 ist) reagieren kann.

Co-Authored-By: Claude Opus 4.7 (1M Kontext) <noreply@anthropic.com>
EOF
)"
```

### Aufgabe 3: Schätzung am chatCompressionService cheap-gate anwenden

**Dateien:**

- Ändern: `packages/core/src/services/chatCompressionService.ts`
- Ändern: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Diese Aufgabe wird vor P1 umgesetzt, verwendet also die **bestehende** Formel `threshold * contextLimit` (70 % * 200K = 140K) und ersetzt nur `originalTokenCount` durch `estimatePromptTokens(...)`:

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress cheap-gate verwendet geschätzte Tokens', () => {
  it('löst Komprimierung aus, wenn API-gemeldete Tokens unter Schwelle liegen, aber geschätzte Tokens mit der anstehenden Benutzernachricht die Schwelle überschreiten', async () => {
    // 200K Fenster aktueller Schwellwert = 0.7 * 200K = 140K
    // originalTokenCount = 135K (Differenz 5K)
    // Benutzernachricht Schätzung ~10K → 145K, überschreitet 140K
    const userMessage: Content = {
      role: 'user',
      parts: [{ text: 'x'.repeat(40_000) }], // 40K Zeichen ≈ 10K Tokens
    };
    const chat = makeFakeChat({ historyChars: 500_000 });

    // Mock runSideQuery, damit compress nachfolgende Schritte nicht crasht
    vi.spyOn(sideQueryModule, 'runSideQuery').mockResolvedValue({
      text: '<state_snapshot>x</state_snapshot>',
      usage: {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
      },
    } as any);

    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 135_000,
      pendingUserMessage: userMessage,
    });
    expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
  });

  it('NOOP, wenn weder originalTokenCount noch die geschätzte Gesamtsumme die Schwelle erreicht', async () => {
    const chat = makeFakeChat();
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 80_000,
      pendingUserMessage: {
        role: 'user',
        parts: [{ text: 'kurz' }],
      },
    });
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
  });
});
```

`makeFakeChat({ historyChars })` ist ein Inline-Helper innerhalb der Testdatei: Erstellt einen `GeminiChat`-Stellvertreter, dessen `getHistory()` ein Content-Array mit einer Länge zurückgibt, die ungefähr `historyChars` entspricht (falls bereits ein solcher Helper in der Datei existiert, diesen wiederverwenden).

- [ ] **Schritt 2: Test ausführen, um Fehlschlag zu überprüfen**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate verwendet geschätzte Tokens'
```

Erwartet: FAIL — Das aktuelle cheap-gate betrachtet nur `originalTokenCount` und würde NOOP feststellen.

- [ ] **Schritt 3: Implementieren — compress() cheap-gate ändern**

Den Abschnitt [chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235) ändern:

```ts
// Nicht komprimieren, wenn nicht erzwungen und wir unter dem Limit sind. Dies ist der
// stationäre Pfad bei jedem Senden; wir wollen aussteigen, bevor wir für den
// vollständigen `getHistory(true)`-Klon unten bezahlen.
if (!force) {
  const contextLimit =
    config.getContentGeneratorConfig()?.contextWindowSize ??
    DEFAULT_TOKEN_LIMIT;
  const pendingUserMessage = opts.pendingUserMessage;
  const effectiveTokens = pendingUserMessage
    ? estimatePromptTokens(
        chat.getHistory(true),
        pendingUserMessage,
        originalTokenCount,
        slimmingConfig.imageTokenEstimate,
      )
    : originalTokenCount;
  if (effectiveTokens < threshold * contextLimit) {
    return {
      newHistory: null,
      info: {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      },
    };
  }
}
```

Der `CompressOptions`-Schnittstelle ([:172-196](packages/core/src/services/chatCompressionService.ts:172)) ein neues Feld hinzufügen:

```ts
export interface CompressOptions {
  // ... vorhandene Felder ...
  /**
   * Ausstehende Benutzernachricht, die gerade gesendet werden soll. Wenn vorhanden,
   * addiert das cheap-gate deren geschätzte Tokenanzahl zu `originalTokenCount` (welches
   * nur die API-Nutzung der vorherigen Runde widerspiegelt), sodass das Tor die
   * tatsächliche Prompt-Größe sieht. Optional für Abwärtskompatibilität mit Aufrufern,
   * die keine Benutzernachricht zur Hand haben (z. B. manuelle /compress force=true-Pfade).
   */
  pendingUserMessage?: Content;
}
```

Import hinzufügen: `import { estimatePromptTokens } from './tokenEstimation.js';`

- [ ] **Schritt 4: Test ausführen, um Bestehen zu überprüfen**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Erwartet: PASS

- [ ] **Schritt 5: Typecheck + Lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Schritt 6: Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): cheap-gate verwendet geschätzte Tokens, wenn Benutzernachricht aussteht

`pendingUserMessage` zu CompressOptions hinzugefügt und diese am automatischen
Komprimierungs-cheap-gate durch estimatePromptTokens geführt. Schließt die Lücke
'um eine Runde verzögert', bei der die Schwellenprüfung die zu sendende
Benutzernachricht übersehen hat.

Co-Authored-By: Claude Opus 4.7 (1M Kontext) <noreply@anthropic.com>
EOF
)"
```

### Aufgabe 4: pendingUserMessage am sendMessageStream-Einstiegspunkt in geminiChat durchreichen

**Dateien:**

- Ändern: `packages/core/src/core/geminiChat.ts`
- Ändern: `packages/core/src/core/geminiChat.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `packages/core/src/core/geminiChat.test.ts` hinzufügen:

```ts
describe('sendMessageStream Schätzung der ersten Runde', () => {
  it('löst automatische Komprimierung beim allerersten Senden aus, wenn der geerbte Verlauf riesig ist', async () => {
    // Simuliert Sub-Agent-erbt-großen-Verlauf / --continue Szenario:
    // lastPromptTokenCount = 0, aber der Verlauf ist bereits nahe der auto-Schwelle
    const chat = makeChatWithLargeInheritedHistory(/* ~150K Zeichen wert */);
    expect(chat.getLastPromptTokenCount()).toBe(0);

    const mockGen = mockContentGeneratorWithUsage({
      totalTokenCount: 80_000,
    });
    chat.setContentGenerator(mockGen);

    const stream = await chat.sendMessageStream(
      'qwen-test',
      { message: 'nächster Benutzerprompt' },
      'prompt-1',
    );
    // Sammle das erste Event des Streams, es sollte COMPRESSED sein
    const first = await stream.next();
    expect(first.value?.type).toBe(StreamEventType.COMPRESSED);
  });
});
```
```markdown
helper `makeChatWithLargeInheritedHistory` inline in der Testdatei: Erstellt einen `GeminiChat`, fügt 1500 einfache User/Model-Contents in die `history` ein, mit jeweils 100 Zeichen, insgesamt ~150.000 Zeichen.

- [ ] **Schritt 2: Test ausführen, um zu prüfen, dass er fehlschlägt**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'first-turn estimation'
```

Erwartet: FAIL — Der aktuelle `tryCompress` verwendet `lastPromptTokenCount = 0`, das Cheap-Gate entscheidet auf NOOP.

- [ ] **Schritt 3: Implementierung — Ändere sendMessageStream und tryCompress**

[geminiChat.ts:562](packages/core/src/core/geminiChat.ts:562) ändern zu:

```ts
compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  false,
  params.config?.abortSignal,
  {
    pendingUserMessage: createUserContent(params.message),
  },
);
```

Das `options`-Interface `TryCompressOptions` der `tryCompress`-Signatur (etwa [:460-478](packages/core/src/core/geminiChat.ts:460)) erhält:

```ts
interface TryCompressOptions {
  originalTokenCountOverride?: number;
  trigger?: CompactTrigger;
  pendingUserMessage?: Content; // ← neu hinzugefügt
}
```

`pendingUserMessage` an `service.compress` durchreichen:

```ts
const { newHistory, info } = await service.compress(this, {
  // ... vorhandene Felder ...
  pendingUserMessage: options?.pendingUserMessage,
});
```

- [ ] **Schritt 4: Test ausführen, um zu prüfen, dass er besteht**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

Erwartet: PASS

- [ ] **Schritt 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Schritt 6: Commit**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/core/geminiChat.test.ts
git commit -m "$(cat <<'EOF'
feat(core): pass pendingUserMessage from sendMessageStream to tryCompress

Closes the 'first send after inherited history' gap where
lastPromptTokenCount is 0 and the cheap-gate would always NOOP.
estimatePromptTokens falls back to a full-history estimate in that
case once the user message is provided.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P1 — Drei-stufige Schwellenkonstanten + computeThresholds + Cheap-Gate

### Task 5: Konstanten und computeThresholds-Funktion hinzufügen

**Dateien:**

- Ändern: `packages/core/src/services/chatCompressionService.ts`
- Ändern: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`chatCompressionService.test.ts` um folgenden Test ergänzen:

```ts
import { computeThresholds } from './chatCompressionService.js';

describe('computeThresholds', () => {
  it('32K Fenster — proportionaler Fallback für alle Stufen, hard fällt auf auto zurück', () => {
    const t = computeThresholds(32_000);
    expect(t.warn).toBe(19_200); // 0.6 * 32K
    expect(t.auto).toBe(22_400); // 0.7 * 32K
    expect(t.hard).toBe(22_400); // max(Fenster-23K=9K, auto=22.4K) = auto
    expect(t.effectiveWindow).toBe(12_000);
  });

  it('128K Fenster — gemischt (warn=prozentual, auto/hard=absolut)', () => {
    const t = computeThresholds(128_000);
    expect(t.warn).toBe(76_800); // 0.6 * 128K (Prozent gewinnt: 76.8K vs auto-20K=75K)
    expect(t.auto).toBe(95_000); // absolut: Fenster-33K (Absolut gewinnt: 95K vs 0.7*128K=89.6K)
    expect(t.hard).toBe(105_000); // absolut: Fenster-23K
    expect(t.effectiveWindow).toBe(108_000);
  });

  it('200K Fenster — absolut übernimmt alle Stufen', () => {
    const t = computeThresholds(200_000);
    expect(t.warn).toBe(147_000); // absolut: auto-20K (Absolut gewinnt: 147K vs 0.6*200K=120K)
    expect(t.auto).toBe(167_000); // absolut: 200K-33K
    expect(t.hard).toBe(177_000); // absolut: 200K-23K
  });

  it('1M Fenster — vollständig absolut', () => {
    const t = computeThresholds(1_000_000);
    expect(t.warn).toBe(947_000);
    expect(t.auto).toBe(967_000);
    expect(t.hard).toBe(977_000);
  });

  it('extrem kleines Fenster (10K) stürzt nicht ab; liefert sinnvolle Werte', () => {
    const t = computeThresholds(10_000);
    expect(t.warn).toBeGreaterThan(0);
    expect(t.auto).toBeGreaterThan(0);
    expect(t.warn).toBeLessThanOrEqual(t.auto);
    expect(t.auto).toBeLessThanOrEqual(t.hard);
  });

  it('Schwellenwerte erfüllen stets warn <= auto <= hard', () => {
    for (const w of [32_000, 64_000, 128_000, 200_000, 256_000, 1_000_000]) {
      const t = computeThresholds(w);
      expect(t.warn).toBeLessThanOrEqual(t.auto);
      expect(t.auto).toBeLessThanOrEqual(t.hard);
    }
  });
});
```

- [ ] **Schritt 2: Test ausführen, um zu prüfen, dass er fehlschlägt**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'computeThresholds'
```

Erwartet: FAIL — `computeThresholds` existiert nicht.

- [ ] **Schritt 3: Implementierung — Konstanten und Funktion hinzufügen**

Im Konstantenbereich der Datei [chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts) (direkt nach `COMPACT_MAX_OUTPUT_TOKENS`) einfügen:

```ts
/**
 * Standard proportionaler Auto-Kompaktierungsschwellwert (Legacy-Semantik
 * als Fallback/Sicherheitsnetz für kleine Fenster beibehalten).
 */
export const DEFAULT_PCT = 0.7;

/**
 * Proportionaler Offset für die Warnstufe: warn-PCT = PCT - WARN_PCT_OFFSET (= 0.6).
 */
export const WARN_PCT_OFFSET = 0.1;

/**
 * Token-Budget, das für die Komprimierungsausgabe reserviert ist. Entspricht
 * COMPACT_MAX_OUTPUT_TOKENS, da Thinking deaktiviert ist (siehe Task 1),
 * also maxOutputTokens die harte Obergrenze für die Zusammenfassung darstellt.
 */
export const SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS; // 20_000

/** Abstand zwischen auto-Schwellwert und effectiveWindow. */
export const AUTOCOMPACT_BUFFER = 13_000;

/** Abstand zwischen warn-Schwellwert und auto-Schwellwert. */
export const WARN_BUFFER = 20_000;

/** Abstand zwischen hard-Schwellwert und effectiveWindow (claude-code MANUAL_COMPACT_BUFFER). */
export const HARD_BUFFER = 3_000;

/** Unterbrechungsgrenze für aufeinanderfolgende Fehlschläge der Auto-Kompaktierung. */
export const MAX_CONSECUTIVE_FAILURES = 3;

export interface CompactionThresholds {
  /** Token-Anzahl, bei der die UI-Warnstufe ausgelöst wird. */
  warn: number;
  /** Token-Anzahl, bei der die Auto-Kompaktierung ausgelöst wird. */
  auto: number;
  /** Token-Anzahl, bei der die Auto-Kompaktierung erzwungen wird (setzt Fehlerzähler zurück). */
  hard: number;
  /** Fenster minus SUMMARY_RESERVE; das verfügbare Budget für Eingabe + Zusammenfassung. */
  effectiveWindow: number;
}

/**
 * Berechnet die dreistufige Schwellwertleiter für ein gegebenes Kontextfenster.
 *
 * Jede Stufe ist `max(proportional, absolut)`:
 *   auto  = max(PCT * Fenster,                effectiveWindow - AUTOCOMPACT_BUFFER)
 *   warn  = max((PCT - WARN_OFFSET) * Fenster, auto - WARN_BUFFER)
 *   hard  = max(effectiveWindow - HARD_BUFFER, auto)  // hard fällt für winzige Fenster auf auto zurück
 *
 * Kleine Fenster (bei denen der absolute Zweig negativ wird) fallen automatisch
 * auf den proportionalen Zweig zurück. Große Fenster werden vom absoluten Zweig
 * dominiert, was die verschwendete Reserve auf ~33K begrenzt, statt 30 % des Fensters.
 */
export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto);

  return { warn, auto, hard, effectiveWindow };
}
```

- [ ] **Schritt 4: Test ausführen, um zu prüfen, dass er besteht**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Erwartet: PASS

- [ ] **Schritt 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Schritt 6: Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add computeThresholds for three-tier compaction ladder

Introduces warn/auto/hard thresholds combining proportional fallback
(small windows) with absolute reservation (large windows). Matches the
formula in docs/design/auto-compaction-threshold-redesign.md. Pure
function with full coverage across 32K/128K/200K/1M/extreme-small
windows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6: Cheap-Gate auf computeThresholds.auto umschalten

**Dateien:**

- Ändern: `packages/core/src/services/chatCompressionService.ts`
- Ändern: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
describe('compress Cheap-Gate verwendet computeThresholds.auto', () => {
  it('bei einem 200K-Fenster mit originalTokenCount=160K, NOOP (unter auto=167K)', async () => {
    const chat = makeFakeChat();
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 160_000,
    });
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
  });

  it('bei einem 200K-Fenster mit originalTokenCount=168K wird das Gate passiert', async () => {
    // 168K > 167K (auto), Cheap-Gate lässt durch, geht in die curatedHistory-Phase
    const chat = makeFakeChat({ historyChars: 500_000 });
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 168_000,
    });
    // Tatsächliches Ergebnis hängt vom gemockten sideQuery ab; wir prüfen nur, dass es nicht
    // ein frühes NOOP durch das Cheap-Gate ist.
    expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
  });
});
```

- [ ] **Schritt 2: Test ausführen, um zu prüfen, dass er fehlschlägt**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate uses computeThresholds'
```

Erwartet: FAIL — Der aktuelle Schwellwert ist `threshold * contextLimit = 0.7 * 200K = 140K`. 160K überschreitet bereits 140K, das Cheap-Gate lässt durch (widerspricht Assertion ①); 168K ebenso.

- [ ] **Schritt 3: Implementierung — Cheap-Gate-Formel umstellen**

Den Block `if (!force) { ... }` ab [chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235) ändern:

```ts
if (!force) {
  const contextLimit =
    config.getContentGeneratorConfig()?.contextWindowSize ??
    DEFAULT_TOKEN_LIMIT;
  const { auto } = computeThresholds(contextLimit);
  const pendingUserMessage = opts.pendingUserMessage;
  const effectiveTokens = pendingUserMessage
    ? estimatePromptTokens(
        chat.getHistory(true),
        pendingUserMessage,
        originalTokenCount,
        slimmingConfig.imageTokenEstimate,
      )
    : originalTokenCount;
  if (effectiveTokens < auto) {
    return {
      newHistory: null,
      info: {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      },
    };
  }
}
```

Gleichzeitig die Zeile `const threshold = chatCompressionSettings?.contextPercentageThreshold ?? COMPRESSION_TOKEN_THRESHOLD;` ( [chatCompressionService.ts:214-217](packages/core/src/services/chatCompressionService.ts:214) ) löschen, da `threshold` im Cheap-Gate nicht mehr verwendet wird. Außerdem den `threshold <= 0`-Zweig (Zeile 221) entfernen (die implizite Deaktivierung wird in P4 behandelt).

- [ ] **Schritt 4: Test ausführen, um zu prüfen, dass er besteht**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Erwartet: PASS

- [ ] **Schritt 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Schritt 6: Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): cheap-gate uses computeThresholds.auto

Replace the legacy `threshold * contextLimit` formula with
computeThresholds.auto, which combines proportional fallback with
absolute reservation. On large windows (>=128K) the gate now triggers
later than 70% but reserves a fixed ~33K, freeing tens of thousands of
context tokens that the old formula wasted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P2 — Fehlerbehandlung aktualisiert (1-fache Sperre → 3-fach Unterbrechung)

### Task 7: hasFailedCompressionAttempt → consecutiveFailures

**Dateien:**

- Ändern: `packages/core/src/core/geminiChat.ts`
- Ändern: `packages/core/src/services/chatCompressionService.ts`
- Ändern: `packages/core/src/core/geminiChat.test.ts`
- Ändern: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`geminiChat.test.ts`:

```ts
describe('compression failure circuit breaker', () => {
  it('toleriert 2 aufeinanderfolgende Fehlschläge, NOOP beim dritten', async () => {
    const chat = makeChatWithMockedFailingCompression();
    // 3 aufeinanderfolgende Fehlschläge auslösen:
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // Versuch 1 schlägt fehl
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // Versuch 2 schlägt fehl
    const events = await collectEvents(
      await chat.sendMessageStream('m', { message: 'c' }, 'p3'), // Versuch 3 sollte NOOP sein
    );
    expect(
      events.find((e) => e.type === StreamEventType.COMPRESSED),
    ).toBeUndefined();
    // Prüfen, dass service.compress beim dritten Mal gar nicht aufgerufen wurde (Unterbrecher-NOOP im Cheap-Gate)
    expect(getCompressCallCount()).toBe(2);
  });

  it('setzt den Zähler bei einem erfolgreichen Force-Komprimieren zurück', async () => {
    const chat = makeChatWithMockedFailingCompression();
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // Fehlschlag
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // Fehlschlag
    // Manuelles /compress durch den Benutzer
    await chat.tryCompress('p3', 'm', /* force */ true);
    // Der Unterbrecher sollte jetzt zurückgesetzt sein
    await chat.sendMessageStream('m', { message: 'c' }, 'p4');
    expect(getCompressCallCount()).toBeGreaterThan(3);
  });
});
```

- [ ] **Schritt 2: Test ausführen, um zu prüfen, dass er fehlschlägt**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'circuit breaker'
```

Erwartet: FAIL — Derzeit wird nach einem einzigen Fehlschlag dauerhaft gesperrt; der zweite `send` wird bereits vom Cheap-Gate mit NOOP beantwortet, der dritte ebenfalls. Assertion ② erwartet jedoch, dass nach einem `force` die Komprimierung wieder möglich ist und `sendMessageStream` bis zu `compress` gelangt.

- [ ] **Schritt 3: Implementierung — Feld ersetzen**

In [geminiChat.ts](packages/core/src/core/geminiChat.ts) das interne Feld (grep nach `hasFailedCompressionAttempt`):

```ts
// Vorher
private hasFailedCompressionAttempt = false;

// Nachher
private consecutiveFailures = 0;
```

In [geminiChat.ts:467-478](packages/core/src/core/geminiChat.ts:467) die an `service.compress` übergebenen Felder in `tryCompress`:

```ts
const { newHistory, info } = await service.compress(this, {
  promptId,
  force,
  model,
  config: this.config,
  consecutiveFailures: this.consecutiveFailures, // ← ersetzt hasFailedCompressionAttempt
  originalTokenCount:
    options?.originalTokenCountOverride ?? this.lastPromptTokenCount,
  pendingUserMessage: options?.pendingUserMessage,
  trigger: options?.trigger,
  signal,
});
```

In [geminiChat.ts:503-510](packages/core/src/core/geminiChat.ts:503) die Fehler-/Erfolgszweige:

```ts
if (info.compressionStatus === CompressionStatus.COMPRESSED && newHistory) {
  // ... bestehende Logik ...
  this.setHistory(newHistory);
  this.config.getFileReadCache().clear();
  this.lastPromptTokenCount = info.newTokenCount;
  this.telemetryService?.setLastPromptTokenCount(info.newTokenCount);
  this.consecutiveFailures = 0; // ← ersetzt hasFailedCompressionAttempt = false
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1; // ← ersetzt hasFailedCompressionAttempt = true
  }
}
```

In [chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts) das `CompressOptions`-Interface:

```ts
export interface CompressOptions {
  // ... vorhandene Felder ...
  /**
   * Anzahl der aufeinanderfolgenden Auto-Kompaktierungsfehlschläge für diesen Chat.
   * Wenn sie MAX_CONSECUTIVE_FAILURES erreicht, stoppt das Gate die Versuche,
   * bis ein erfolgreicher force=true-Aufruf den Zähler zurücksetzt.
   */
  consecutiveFailures: number;
  // hasFailedCompressionAttempt löschen
}
```

Innerhalb der `compress()`-Funktion [:221](packages/core/src/services/chatCompressionService.ts:221) die Cheap-Gate-Prüfung:

```ts
// Cheap-Gates zuerst – diese benötigen keine aufbereitete History.
if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !force) {
  return {
    newHistory: null,
    info: {
      originalTokenCount: 0,
      newTokenCount: 0,
      compressionStatus: CompressionStatus.NOOP,
    },
  };
}
```

Die Destrukturierung `const { ... } = opts;` aktualisieren: `hasFailedCompressionAttempt` durch `consecutiveFailures` ersetzen.

In `chatCompressionService.test.ts` alle Stellen, die `hasFailedCompressionAttempt: false/true` übergeben, durch `consecutiveFailures: 0` / `consecutiveFailures: MAX_CONSECUTIVE_FAILURES` ersetzen und die Test-Erwartungen einzeln anpassen.

- [ ] **Schritt 4: Test ausführen, um zu prüfen, dass er besteht**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
```

Erwartet: PASS

- [ ] **Schritt 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Schritt 6: Commit**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/services/chatCompressionService.ts packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): replace hasFailedCompressionAttempt with circuit breaker

Switches from a one-shot permanent lock to a three-strike circuit
breaker (MAX_CONSECUTIVE_FAILURES=3). Successful force compress
(manual /compress, reactive overflow, or hard-tier rescue) resets the
counter. Aligns with claude-code's design and unblocks recovery from
transient failures (rate limits, transient model errors) that
previously disabled auto-compaction for the rest of the session.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P4 — Konfiguration: contextPercentageThreshold löschen + Breaking-Change-Warnung

### Task 8: Feld löschen + Startwarnung hinzufügen

**Dateien:**

- Ändern: `packages/core/src/config/config.ts`
- Ändern: `packages/cli/src/config/settingsSchema.ts` (falls referenziert)
- Ändern: `packages/core/src/services/chatCompressionService.ts`
- Ändern: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`packages/core/src/config/config.test.ts` (falls nicht vorhanden, erstellen):

```ts
import { describe, it, expect, vi } from 'vitest';

describe('Config — chatCompression.contextPercentageThreshold Deprecation', () => {
  it('gibt eine stderr-Warnung aus, wenn das deprecated-Feld gesetzt ist', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... minimale erforderliche Config-Parameter ...
      chatCompression: { contextPercentageThreshold: 0.5 } as any,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'chatCompression.contextPercentageThreshold has been removed',
      ),
    );
    warnSpy.mockRestore();
  });

  it('gibt keine Warnung aus, wenn das deprecated-Feld fehlt', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... minimale Parameter, kein chatCompression.contextPercentageThreshold ...
    });
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('chatCompression.contextPercentageThreshold'),
    );
    warnSpy.mockRestore();
  });
});
```

- [ ] **Schritt 2: Test ausführen, um zu prüfen, dass er fehlschlägt**

```bash
npm test --workspace=packages/core -- --run packages/core/src/config/config.test.ts
```

Erwartet: FAIL — Config akzeptiert das Feld derzeit vollständig, keine Warnung.

- [ ] **Schritt 3: Implementierung — ChatCompressionSettings + Config-Konstruktor ändern**

[config.ts:217-227](packages/core/src/config/config.ts:217):

```ts
export interface ChatCompressionSettings {
  /**
   * Geschätzte Tokens für einen einzelnen Inline-Bild/Dokument-Teil, wenn
   * Zeichen in der History bei `findCompressSplitPoint` aufgeteilt werden.
   * Wird auch als Platzhalterbudget verwendet, wenn Inline-Medien aus dem
   * Side-Query-Kompaktierungs-Prompt entfernt werden. Standard 1600.
   * Umgebungsüberschreibung: `QWEN_IMAGE_TOKEN_ESTIMATE`.
   */
  imageTokenEstimate?: number;
}
```

(Das Feld `contextPercentageThreshold` wurde entfernt.)
```
[config.ts](packages/core/src/config/config.ts) Finde im Config-Konstruktor die Stelle, an der `params.chatCompression` verarbeitet wird (ca. Zeile 933), und füge vor der Zuweisung Folgendes ein:

```ts
if (
  params.chatCompression &&
  typeof (params.chatCompression as Record<string, unknown>)
    .contextPercentageThreshold !== 'undefined'
) {
  console.warn(
    '[qwen-code] chatCompression.contextPercentageThreshold has been removed ' +
      'and is now controlled by built-in thresholds. Setting will be ignored.',
  );
}
this.chatCompression = params.chatCompression;
```

`chatCompressionService.ts` gleichzeitig bereinigen: [:214-217](packages/core/src/services/chatCompressionService.ts:214) jener Abschnitt wurde bereits in Task 6 gelöscht. Prüfe die Datei nochmals auf Überreste von `chatCompressionSettings?.contextPercentageThreshold` oder der exportierten Konstante `COMPRESSION_TOKEN_THRESHOLD`:

- Wenn `COMPRESSION_TOKEN_THRESHOLD` keine Referenzen mehr hat, lösche die Konstante.
- Wenn es noch Referenzen gibt (z. B. in Telemetrie oder Dokumentation), ersetze sie durch `DEFAULT_PCT`.

cli/config/settingsSchema.ts muss nicht geändert werden – `chatCompression` bleibt als `type: 'object'` ohne Schemafelder ([settingsSchema.ts:1020-1028](packages/cli/src/config/settingsSchema.ts:1020)). Falls innerhalb des Schemas ein Verweis auf `contextPercentageThreshold` existiert, lösche ihn.

- [ ] **Schritt 4: Test ausführen, um Bestehen zu prüfen**

```bash
npm test --workspace=packages/core
npm test --workspace=packages/cli
```

Erwartet: PASS (einschließlich bestehender Komprimierungstests)

- [ ] **Schritt 5: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Schritt 6: Committen**

```bash
git add packages/core/src/config/config.ts packages/core/src/config/config.test.ts packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core)!: remove chatCompression.contextPercentageThreshold setting

The proportional threshold is now an internal constant (DEFAULT_PCT) and
the auto-compaction threshold is computed from a mixed proportional /
absolute formula (computeThresholds). User-facing tuning of the bare
percentage no longer maps to meaningful behavior on large-window models.

Existing settings.json files containing the field will log a one-line
stderr warning on startup; the field is otherwise ignored.

BREAKING CHANGE: chatCompression.contextPercentageThreshold is removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P3 — Hard-Stufe aktive Rettung

### Task 9: sendMessageStream Einstieg mit Hard-Check + Force-Komprimierung

**Dateien:**

- Ändern: `packages/core/src/core/geminiChat.ts`
- Ändern: `packages/core/src/core/geminiChat.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
describe('sendMessageStream hard-tier rescue', () => {
  it('triggers force compress when estimated tokens cross hard threshold', async () => {
    // Konstruiere 200K Fenster: hard = 177K
    const chat = makeChatWithLastPromptTokenCount(176_000);
    // geschätzte Tokens dieser User-Nachricht + 176K überschreiten 177K
    const userMessage = makeBigUserMessage(/* ~3K tokens */);
    const stream = await chat.sendMessageStream(
      'm',
      { message: userMessage },
      'p',
    );
    const first = await stream.next();
    expect(first.value?.type).toBe(StreamEventType.COMPRESSED);
    expect(getLastCompressCallForce()).toBe(true);
  });

  it('hard rescue resets consecutiveFailures before forcing', async () => {
    const chat = makeChatWithLastPromptTokenCount(176_000);
    // Zuerst 3 Fehler erzeugen, sodass consecutiveFailures = 3
    setMockedCompressionToFail(3);
    await chat.sendMessageStream('m', { message: 'a' }, 'p1');
    await chat.sendMessageStream('m', { message: 'b' }, 'p2');
    await chat.sendMessageStream('m', { message: 'c' }, 'p3');
    expect(chat.getConsecutiveFailures()).toBe(3);
    // 4. Mal: Tokens überschreiten hard; Hard Rescue setzt den Schutzschalter zurück und force=true
    setMockedCompressionToSucceed();
    await chat.sendMessageStream('m', { message: 'd' }, 'p4');
    expect(getLastCompressCallForce()).toBe(true);
    expect(chat.getConsecutiveFailures()).toBe(0);
  });
});
```

- [ ] **Schritt 2: Test ausführen, um Fehlschlagen zu prüfen**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'hard-tier rescue'
```

Erwartet: FAIL – sendMessageStream ruft tryCompress aktuell immer mit `force=false` auf.

- [ ] **Schritt 3: Implementieren – Hard-Check im sendMessageStream-Einstieg einfügen**

[geminiChat.ts:560-567](packages/core/src/core/geminiChat.ts:560):

```ts
// Hard-tier rescue: If the pending prompt is large enough to risk overflow,
// force compress before the send and reset the failure counter so a
// session already in circuit-breaker NOOP can recover. This proactively
// covers what reactive overflow (line ~711) would otherwise catch
// after a wasted round-trip.
const contextLimit =
  this.config.getContentGeneratorConfig()?.contextWindowSize ??
  DEFAULT_TOKEN_LIMIT;
const { hard } = computeThresholds(contextLimit);
const pendingUserMessage = createUserContent(params.message);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  pendingUserMessage,
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;
if (shouldForceFromHard) {
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
  { pendingUserMessage },
);
```

Hinweis: `createUserContent` wird in sendMessageStream intern bereits in [:569](packages/core/src/core/geminiChat.ts:569) aufgerufen; da wir es jetzt vorziehen, kann die Zeile `const userContent = createUserContent(params.message);` in [:569](packages/core/src/core/geminiChat.ts:569) gelöscht/ersetzt werden durch `const userContent = pendingUserMessage;`.

Importe hinzufügen: `import { computeThresholds } from '../services/chatCompressionService.js';`
Importe hinzufügen: `import { estimatePromptTokens } from '../services/tokenEstimation.js';`

- [ ] **Schritt 4: Test ausführen, um Bestehen zu prüfen**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

Erwartet: PASS

- [ ] **Schritt 5: Typecheck + Lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Schritt 6: Committen**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/core/geminiChat.test.ts
git commit -m "$(cat <<'EOF'
feat(core): hard-tier rescue forces compaction before oversized send

When estimated tokens cross computeThresholds.hard, sendMessageStream
now resets the consecutive-failure counter and calls tryCompress with
force=true. This pulls reactive overflow recovery forward to before
the send, saving one wasted round-trip and unblocking sessions whose
circuit breaker had latched off.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P5 — UI-Änderungen (Tip-Umschreibung + /context-Anzeige)

### Task 10: tipRegistry drei context-*-Tips umschreiben

**Dateien:**

- Ändern: `packages/cli/src/services/tips/tipRegistry.ts`
- Ändern: `packages/cli/src/services/tips/tipRegistry.test.ts` (falls nicht vorhanden, erstellen)
- Ändern: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`packages/cli/src/services/tips/tipRegistry.test.ts`:

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { tipRegistry, type TipContext } from './tipRegistry.js';

const baseCtx: TipContext = {
  lastPromptTokenCount: 0,
  contextWindowSize: 200_000,
  sessionPromptCount: 10,
  sessionCount: 1,
  platform: 'darwin',
  thresholds: {
    warn: 147_000,
    auto: 167_000,
    hard: 177_000,
    effectiveWindow: 180_000,
  },
};

function tipById(id: string) {
  return tipRegistry.find((t) => t.id === id)!;
}

describe('context-* tip thresholds align with computeThresholds', () => {
  it('compress-intro fires between warn and auto', () => {
    const t = tipById('compress-intro');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 100_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 150_000 })).toBe(
      true,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 168_000 })).toBe(
      false,
    );
  });

  it('context-high fires between auto and hard', () => {
    const t = tipById('context-high');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 150_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 170_000 })).toBe(
      true,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 178_000 })).toBe(
      false,
    );
  });

  it('context-critical fires at or above hard', () => {
    const t = tipById('context-critical');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 170_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 178_000 })).toBe(
      true,
    );
  });

  it('falls back gracefully when thresholds undefined (legacy callers)', () => {
    const ctx = { ...baseCtx, thresholds: undefined };
    // Bei fehlenden thresholds sollten alle drei Tips nicht auslösen (kein Vergleich möglich)
    expect(tipById('compress-intro').isRelevant(ctx)).toBe(false);
    expect(tipById('context-high').isRelevant(ctx)).toBe(false);
    expect(tipById('context-critical').isRelevant(ctx)).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test ausführen, um Fehlschlagen zu prüfen**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
```

Erwartet: FAIL – `TipContext` hat kein `thresholds`-Feld; die drei Tips feuern immer noch bei Prozentsätzen 50/80/95.

- [ ] **Schritt 3: Implementieren – tipRegistry ändern**

[tipRegistry.ts:15-21](packages/cli/src/services/tips/tipRegistry.ts:15):

```ts
import type { CompactionThresholds } from '@qwen-code/qwen-code-core';
import { DEFAULT_TOKEN_LIMIT } from '@qwen-code/qwen-code-core';

export type TipTrigger = 'startup' | 'post-response';

export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  /**
   * Drei-Stufen-Schwellenwerte für die automatische Kompaktierung, berechnet von den Aufrufern.
   * Optional aus Gründen der Rückwärtskompatibilität; Tip-Prüfungen geben false zurück, wenn fehlend.
   */
  thresholds?: CompactionThresholds;
}
```

`getContextUsagePercent` behalten (könnte von anderen Startup-Tips verwendet werden), aber die context-*-Tips verlassen sich nicht mehr darauf.

Ersetze die `isRelevant`-Implementierung der drei Tips in [tipRegistry.ts:37-69](packages/cli/src/services/tips/tipRegistry.ts:37):

```ts
export const tipRegistry: ContextualTip[] = [
  // --- Post-response contextual tips (priority: higher = more urgent) ---
  {
    id: 'context-critical',
    content:
      'Context near hard limit — auto-compact will force on next send. Consider /clear if you want to start fresh.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.hard,
    cooldownPrompts: 3,
    priority: 100,
  },
  {
    id: 'context-high',
    content: 'Context is getting full. Use /compress to free up space.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.auto &&
      ctx.lastPromptTokenCount < ctx.thresholds.hard,
    cooldownPrompts: 5,
    priority: 90,
  },
  {
    id: 'compress-intro',
    content: 'Long conversation? /compress summarizes history to free context.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.warn &&
      ctx.lastPromptTokenCount < ctx.thresholds.auto &&
      ctx.sessionPromptCount > 5,
    cooldownPrompts: 10,
    priority: 50,
  },

  // --- Startup tips ---  ← unverändert lassen
  // ... nachfolgende Startup-Tips bleiben unverändert ...
```

In `packages/cli/src/ui/AppContainer.tsx` bei Zeile ~1150 (bekannter Konstruktionspunkt für kontextuelle Tips) ändern zu:

```tsx
// pseudo – je nach vorhandenem Code
const thresholds = computeThresholds(contextWindowSize);
const tipCtx: TipContext = {
  lastPromptTokenCount,
  contextWindowSize,
  sessionPromptCount,
  sessionCount,
  platform: process.platform,
  thresholds,
};
```

Import in AppContainer.tsx hinzufügen:

```tsx
import { computeThresholds } from '@qwen-code/qwen-code-core';
```

- [ ] **Schritt 4: Test ausführen, um Bestehen zu prüfen**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
npm test --workspace=packages/cli
```

Erwartet: PASS

- [ ] **Schritt 5: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Schritt 6: Committen**

```bash
git add packages/cli/src/services/tips/tipRegistry.ts packages/cli/src/services/tips/tipRegistry.test.ts packages/cli/src/ui/AppContainer.tsx
git commit -m "$(cat <<'EOF'
feat(cli): align context-* tips with new compaction thresholds

The three context-usage tips now compare tokenCount against the
warn/auto/hard ladder from computeThresholds instead of fixed 50/80/95
percentages. compress-intro fires between warn and auto, context-high
between auto and hard, context-critical at or above hard. Threshold
data is injected into TipContext from the AppContainer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 11: /context-Befehl zeigt drei Schwellenwerte an

**Dateien:**

- Ändern: `packages/cli/src/ui/commands/contextCommand.ts`
- Ändern: `packages/cli/src/ui/commands/contextCommand.test.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
describe('/context shows three-tier thresholds', () => {
  it('renders warn/auto/hard with current tier marker', () => {
    const result = renderContextCommand({
      contextWindowSize: 200_000,
      lastPromptTokenCount: 150_000, // zwischen warn und auto
    });
    expect(result).toMatch(/Warn threshold:\s+147[,.]?000/);
    expect(result).toMatch(/Auto threshold:\s+167[,.]?000/);
    expect(result).toMatch(/Hard threshold:\s+177[,.]?000/);
    expect(result).toMatch(/current tier:\s+warn/i);
  });

  it('correctly identifies "below warn" tier when tokens are low', () => {
    const result = renderContextCommand({
      contextWindowSize: 200_000,
      lastPromptTokenCount: 50_000,
    });
    expect(result).toMatch(/current tier:\s+(safe|below warn|normal)/i);
  });
});
```

- [ ] **Schritt 2: Test ausführen, um Fehlschlagen zu prüfen**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts -t 'three-tier'
```

Erwartet: FAIL – Aktuell verwendet [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177) die Formel `(1 - threshold) * contextWindowSize`, die nur eine einzelne "autocompactBuffer"-Zahl anzeigt.

- [ ] **Schritt 3: Implementieren – contextCommand-Ausgabe ändern**

Ersetze den Abschnitt in [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177):

```ts
import { computeThresholds } from '@qwen-code/qwen-code-core';

// ... in buildContextSummary oder einem ähnlichen Einstiegspunkt:
const thresholds = computeThresholds(contextWindowSize);
const { warn, auto, hard, effectiveWindow } = thresholds;

function currentTier(tokens: number): string {
  if (tokens >= hard) return 'hard (force compress imminent)';
  if (tokens >= auto) return 'auto (compaction in progress / just ran)';
  if (tokens >= warn) return 'warn';
  return 'safe';
}

// Im Abschnitt für die formatierte Ausgabe hinzufügen:
const lines = [
  // ... bestehende Ausgabe ...
  `Effective window:   ${formatNum(effectiveWindow)}  (window − 20K reserve)`,
  `Warn threshold:     ${formatNum(warn)}`,
  `Auto threshold:     ${formatNum(auto)}`,
  `Hard threshold:     ${formatNum(hard)}`,
  `Current tier:       ${currentTier(lastPromptTokenCount)}`,
];
```

Hinweis: `formatNum` ist im bestehenden Projekt z.B. `.toLocaleString()`; falls nicht in der Datei vorhanden, inline ein `(n: number) => n.toLocaleString('en-US')` verwenden.

**Lösche** gleichzeitig den ursprünglichen Code, der `autocompactBuffer` berechnet ([:180-183](packages/cli/src/ui/commands/contextCommand.ts:180)) und die Verwendung von `compressionThreshold` – jetzt wird direkt auf `auto` geschaut.

- [ ] **Schritt 4: Test ausführen, um Bestehen zu prüfen**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts
```

Erwartet: PASS

- [ ] **Schritt 5: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Schritt 6: Committen**

```bash
git add packages/cli/src/ui/commands/contextCommand.ts packages/cli/src/ui/commands/contextCommand.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): /context shows three-tier thresholds and current tier

Replace the legacy single-buffer display with effective window + warn /
auto / hard threshold lines and a "current tier" label so users can see
exactly where in the ladder the session sits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Abnahme (finale vollständige Regression)

Führe nach der Umsetzung aller Tasks abschließend die vollständige Validierung durch:

- [ ] **Schritt 1: Vollständige Tests**

```bash
npm test
```

Erwartet: Alle Workspace-Tests bestanden.

- [ ] **Schritt 2: Vollständiger Typecheck**

```bash
npm run typecheck
```

- [ ] **Schritt 3: Vollständiger Lint**

```bash
npm run lint
```

- [ ] **Schritt 4: Manueller Smoke-Test**

CLI starten und Folgendes ausführen:

1. `/context` – Prüfe, ob die neue Drei-Stufen-Anzeige sinnvoll aussieht.
2. Ein Gespräch führen, das die Komprimierung auslöst (z. B. mit einem 200K-Fenstermodell den Prompt auf 170K+ aufblähen).
3. `chatCompression.contextPercentageThreshold = 0.5` setzen und starten – Prüfe auf Deprecation-Warnung in stderr.
4. Mit `--continue` eine große Sitzung wiederherstellen; prüfe, ob die Komprimierung beim ersten Senden durch den ersten Schätzungspfad ausgelöst wird.

- [ ] **Schritt 5: Einheitliches PR-Beschreibungsskript (optional)**

Wenn die PRs in mehreren Teilen eingereicht werden, verlinke in jeder PR-Beschreibung auf [docs/design/auto-compaction-threshold-redesign.md](docs/design/auto-compaction-threshold-redesign.md) und kennzeichne die Phase / den Task.