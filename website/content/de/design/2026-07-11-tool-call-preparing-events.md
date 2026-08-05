# Tool-call preparation events

## Kontext

Qwen Code emittiert einen Tool-Call derzeit erst, nachdem der Provider das Streaming seiner Argumente abgeschlossen hat. Bei Tools mit großen oder komplexen Eingaben kann das Erzeugen dieser Argumente deutlich länger dauern als die Ausführung des Tools selbst. ACP-Clients zeigen daher während des teuren Teils keine Aktivität, und Benutzer können den Turn für eine hängengebliebene Anfrage halten.

Die Provider-Streams legen die stabile Tool-Identität bereits offen, bevor die Argumente vollständig sind:

- Anthropic sendet `id` und `name` in `content_block_start` für einen `tool_use`-Block und sendet dann Argument-Fragmente als `input_json_delta`.
- OpenAI-kompatible Provider senden üblicherweise `id` und `function.name` im ersten `choice.delta.tool_calls`-Element und hängen dann Argument-Fragmente an.

Qwen Code wartet bewusst auf `content_block_stop` oder `finish_reason`, bevor ein Gemini-kompatibler `functionCall` konstruiert wird. Diese Eigenschaft der Ausführungssicherheit muss unverändert bleiben.

## Ziel

ACP-Clients sollen eine Tool-Card rendern können, während das Modell die Tool-Argumente noch vorbereitet, mit folgendem Lebenszyklus:

```text
preparing -> in_progress -> completed | failed
```

Das frühe Event enthält nur die stabile Tool-Call-ID und den Tool-Namen. Es enthält niemals partielle Argumente und startet niemals die Tool-Ausführung.

## Umfang

Diese Änderung unterstützt die beiden Provider-Pfade, die der integrierende Client verwendet:

- Anthropic- und Anthropic-kompatible Streaming-Antworten.
- OpenAI- und OpenAI-kompatible Streaming-Antworten.

Andere Provider behalten ihr aktuelles Verhalten. Da die Vorbereitungs-Metadaten optional sind, degradieren sie natürlich auf den bestehenden Lebenszyklus `in_progress -> completed | failed`.

Die Änderung ändert nicht:

- Tool-Permission-Checks;
- Hook-Reihenfolge;
- Tool-Scheduling oder -Ausführung;
- Modell-Konversationshistorie;
- Konstruktion von `functionCall` oder `functionResponse`;
- Nicht-ACP-Ausgabeformate.

## Design

### 1. Interne Antwort-Metadaten

Transiente Tool-Vorbereitungs-Metadaten werden über eine modullokale `WeakMap` mit jedem `GenerateContentResponse` assoziiert:

```ts
interface ToolCallPreparation {
  callId: string;
  toolName: string;
}
```

Provider-Adapter speichern diese Metadaten am Top-Level-Response-Chunk. Sie sind weder eine aufzählbare Response-Property noch ein Gemini-`Part`, daher werden sie nicht serialisiert, und die Gemini-History-Zusammenstellung sieht weiterhin nur Text-, Thought- und vollständige `functionCall`-Parts. Geteilte Helper bieten typisierte Store- und Read-Operationen und vermeiden Provider-spezifische Casts im ACP.

### 2. Anthropic-Producer

In `AnthropicContentGenerator.processStream()` wird, wenn `content_block_start(tool_use)` ein nicht-leeres `id` und `name` enthält, ein ansonsten leerer Gemini-Response-Chunk mit einem Vorbereitungs-Eintrag yielded.

Die Akkumulation von `input_json_delta` wird unverändert fortgesetzt. Bei `content_block_stop` wird der bestehende vollständige `functionCall` mit geparsten Argumenten emittiert. Vor diesem Punkt werden keine Argumentdaten offengelegt.

### 3. OpenAI-kompatibler Producer

In `convertOpenAIChunkToGemini()` wird jedes `choice.delta.tool_calls`-Element beobachtet, nachdem es an den bestehenden stream-lokalen Tool-Call-Parser übergeben wurde. Wenn eine stabile nicht-leere ID und ein Name erstmals verfügbar sind, wird ein Vorbereitungs-Eintrag an den aktuellen Response-Chunk angehängt.

Innerhalb des Request-Kontexts wird nach Tool-Call-ID dedupliziert. Der vollständige `functionCall` wird weiterhin nur emittiert, wenn `finish_reason` vorhanden ist. Provider, die beide Identitätsfelder nicht früh offenlegen, behalten schlicht das bestehende Verhalten.

### 4. ACP-Consumer und Zustandsübergänge

Die ACP-`Session` liest die Vorbereitungs-Metadaten, bevor sie vollständige `functionCalls` sammelt. Für jede neue Vorbereitung emittiert sie den Standard-ACP-`tool_call`-Frame mit:

```ts
{
  status: 'pending',
  rawInput: {},
  _meta: {
    phase: 'preparing',
    toolName,
    // bestehende Provenienz-Metadaten bleiben vorhanden
  },
}
```

Der bestehende Ausführungspfad emittiert später dieselbe `toolCallId` mit `status: 'in_progress'` und den vollständigen Argumenten. Die bestehende Ergebnis-Emission schließt die Card dann als `completed` oder `failed` ab.

`TodoWrite` behält seine aktuelle Sonderbehandlung und emittiert keine Tool-Card. Die Vorbereitungs-Emission verwendet dieselbe Filterregel, sodass sie keine Card erzeugen kann, die der Ausführungspfad absichtlich unterdrückt.

### 5. Retry, Fallback, Cancellation und Stream-Fehler

Jeder aktive ACP-Modell-Stream verfolgt Vorbereitungen, bis der Stream abgeschlossen ist und seine geparsten Calls an die Tool-Ausführung übergibt. Wenn ein Versuch durch Retry, Modell-Fallback, Benutzer-Abbruch oder Stream-Fehler aufgegeben wird, emittiert ACP für jeden verbleibenden Eintrag ein terminales `tool_call_update`:

```ts
{
  status: 'failed',
  content: [],
  _meta: {
    phase: 'preparing',
    preparationDiscarded: true,
    toolName,
  },
}
```

`preparationDiscarded` bedeutet, dass der Modellversuch aufgegeben wurde, bevor eine geparste Tool-Anfrage die Ausführung erreichte. Es handelt sich nicht um einen Tool-Ausführungsfehler. Der integrierende Client sollte diese transiente Card entfernen, statt ein fehlgeschlagenes Tool zu rendern. Die Verwendung eines protokollgültigen terminalen Status stellt sicher, dass ältere Clients keine dauerhaft pending bleibende Card behalten.

`RETRY` leert jetzt vollständige `functionCalls`, die aus dem aufgegebenen Versuch gesammelt wurden, analog zum bestehenden `MODEL_FALLBACK`-Verhalten über alle vier ACP-Stream-Pfade hinweg. Das verhindert, dass ein geparster Call aus dem fehlgeschlagenen Versuch zusammen mit Calls des Ersatzversuchs ausgeführt wird.

Wenn ein vollständiger `functionCall` mit derselben ID eintrifft und der Stream normal endet, übergibt ACP ihn ohne Discarded-Update an den bestehenden Ausführungspfad. Falls der Stream nach dem Parsen des Calls, aber vor der Ausführung fehlschlägt, wird die Vorbereitung weiterhin verworfen. Normale Tool-Fehler laufen daher weiterhin über den bestehenden Ergebnispfad und werden niemals als verworfen markiert.

## Auswirkungen auf Downstream

- `GeminiChat` und History-Builder ignorieren die optionalen Top-Level-Metadaten und persistieren weiterhin nur Candidate-Content.
- Eine Antwort, die nur Vorbereitungs-Metadaten enthält, wird nicht als benutzersichtbarer Output gezählt, sodass Transport-Retry und Modell-Fallback ihr bestehendes Pre-Output-Verhalten behalten.
- Vorbereitungs-Ids verwenden dieselbe Turn-übergreifende Normalisierung wie vollständige `functionCall`-Ids und bewahren so die ACP-Update-Korrelation, wenn ein Provider eine Id aus der Historie wiederverwendet.
- Der Core-`Turn`, die TUI und nicht-interaktive JSON-Consumer behalten ihr aktuelles Verhalten, da kein neuer Gemini-`Part` und kein neues Server-Event eingeführt wird.
- ACP ist der einzige Consumer, der in die Metadaten opt-in macht und den frühen UI-Zustand emittiert.
- Derselbe Metadaten-Vertrag wird von Anthropic- und OpenAI-kompatiblen Adaptern geteilt, sodass ACP keine Provider-spezifischen Verzweigungen hat.

## Testplan

### Core-Provider-Tests

- Anthropic: Ein `content_block_start(tool_use)` yielded Vorbereitungs-Metadaten vor jedem `input_json_delta` und vor dem finalen `functionCall`.
- Anthropic: Fehlende ID oder fehlender Name emittiert keine Vorbereitungs-Metadaten.
- OpenAI-kompatibel: Der erste Delta mit stabiler ID und Name emittiert einen Vorbereitungs-Eintrag; spätere Argument-Deltas duplizieren ihn nicht.
- OpenAI-kompatibel: Vollständige Calls erscheinen weiterhin nur bei `finish_reason`, mit unveränderten geparsten Argumenten.
- OpenAI-kompatibel: Fehlende frühe Identitätsfelder fallen auf das aktuelle Verhalten ohne ungültiges Vorbereitungs-Event zurück.
- GeminiChat: Reine Vorbereitungs-Chunks unterdrücken weder Transport-Retry noch Primary-Modell-Fallback noch die Fortsetzung über eine Multi-Modell-Fallback-Kette.
- GeminiChat: Turn-übergreifend duplizierte Provider-Ids werden in Vorbereitungs-Metadaten und vollständigen Calls konsistent normalisiert.

### ACP-Tests

- Vorbereitungs-Metadaten emittieren `pending` mit `_meta.phase = 'preparing'` und ohne partiellen Input.
- Der vollständige Call verwendet dieselbe ID wieder und geht mit vollständigen Argumenten in `in_progress` über.
- Retry, Fallback, Abbruch und Stream-Fehler verwerfen Vorbereitungen, die die Tool-Ausführung nicht erreicht haben, mit `_meta.preparationDiscarded = true`.
- Retry und Modell-Fallback leeren vollständige Calls aus dem aufgegebenen Versuch, bevor Ersatz-Chunks akzeptiert werden.
- Eine Vorbereitung, die zu einem vollständigen Call wurde, wird nach einem normal abgeschlossenen Stream nicht verworfen, wohl aber, wenn dieser Stream vor der Ausführung fehlschlägt.
- `TodoWrite` bleibt unterdrückt.

### Regressionsverifikation

Die fokussierten Provider- und ACP-Suites werden aus ihren Paketverzeichnissen heraus ausgeführt, danach werden vor dem Abschluss Repository-Build, Typecheck und Lint ausgeführt. Die auf v0.19.9 rebasierte Implementierung wurde verifiziert mit:

- Core-Provider- und Stream-Suites: 649 bestanden.
- ACP-Lifecycle-Suites: 316 bestanden.
- Repository-Build, Workspace-Typecheck und vollständiger Lint: bestanden.
- Prettier- und Diff-Checks der geänderten Dateien: bestanden.

## Akzeptanzkriterien

1. Anthropic- und OpenAI-kompatible ACP-Turns emittieren eine pending Tool-Card, sobald die stabile Tool-Identität verfügbar ist.
2. Kein Tool startet, bevor die vollständigen Argumente vorliegen und die bestehenden Permission- und Ausführungspfade durchlaufen wurden.
3. Vollständige Calls und Ergebnisse behalten ihre aktuellen Ids, Argumente, Reihenfolge und History-Darstellung.
4. Aufgegebene Versuche hinterlassen keine dauerhaft pending bleibende Vorbereitungs-Card.
5. Provider ohne Vorbereitungs-Metadaten verhalten sich exakt wie zuvor.
