# Prompt-Queue-Backpressure

## Zusammenfassung

`qwen serve` wendet nun pro Sitzung einen Backpressure-Mechanismus für die Prompt-Aufnahme an. Das Standardlimit liegt bei `5` ausstehenden Prompts pro Sitzung. Ein ausstehender Prompt ist ein Prompt, den der Daemon über `sendPrompt` akzeptiert hat und der noch nicht abgeschlossen ist. Dazu gehören Prompts, die in der pro Sitzung geltenden FIFO-Warteschlange warten, sowie der aktuell ausgeführte Prompt.

`branchSession` bleibt hinter derselben pro Sitzung geltenden FIFO-Warteschlange serialisiert, ist jedoch kein Prompt und verbraucht dieses Prompt-Limit nicht.

## Semantik

- Standard: `maxPendingPromptsPerSession = 5`.
- Deaktiviert: `0` oder `Infinity` bedeutet unbegrenzt.
- Ungültig: Negative Zahlen, Brüche und `NaN` werden bei der Bridge-Konstruktion und `runQwenServe` abgelehnt. Das CLI-Flag akzeptiert nicht-negative Ganzzahlen; `0` deaktiviert die Begrenzung.
- Autorität: Die Bridge ist das Admission-Gate. Die SDK-seitige Verwaltung dient als Early-Fail-Schutz und ersetzt nicht die Durchsetzung auf dem Server.
- Prompt-Deadline: `--prompt-deadline-ms` gilt weiterhin nur für bereits akzeptierte Prompts. Es ist keine Begrenzung für die Warteschlangenaufnahme.

## Bridge-Verhalten

`SessionEntry` verwaltet `pendingPromptCount`. `sendPrompt` ist absichtlich nicht `async`, sodass die Zulassungsprüfung synchron eine Ausnahme auslösen kann, bevor HTTP-Routen `202 Accepted` zurückgeben.

Ablauf der Zulassung:

1. Sitzung nachschlagen.
2. Vorab abgebrochene Signale ablehnen, bevor der Zähler erhöht wird.
3. Wenn `pendingPromptCount >= maxPendingPromptsPerSession`, `PromptQueueFullError` auslösen.
4. Zähler erhöhen und den Prompt in die FIFO-Warteschlange einreihen.
5. Den Slot genau einmal freigeben, wenn das für den Aufrufer sichtbare Prompt-Promise abgeschlossen ist.

Fehler beeinträchtigen die FIFO-Warteschlange nicht, da das Ende der Warteschlange jedes Prompt-Ergebnis weiterhin konsumiert. Der ursprüngliche Aufrufer erhält weiterhin die Ablehnung des Prompts.

## HTTP-Verhalten

`POST /session/:id/prompt` fängt synchrone `PromptQueueFullError` ab, bevor eine akzeptierte Antwort ausgegeben wird. Die Route gibt Folgendes zurück:

- Status: `503`
- Header: `Retry-After: 5`
- Body: `{ code: 'prompt_queue_full', error, sessionId, limit, pendingCount }`

Bei fehlgeschlagener Zulassung wird keine `promptId` zurückgegeben.

`/capabilities` macht folgende Angaben:

```json
{
  "limits": {
    "maxPendingPromptsPerSession": 5
  }
}
```

Wenn die Begrenzung deaktiviert ist, ist der angegebene Wert `null`.

## ACP-HTTP-Verhalten

Der ACP-JSON-RPC-Transport mappt `PromptQueueFullError` auf eine stabile Fehlerstruktur, anstatt auf einen unstrukturierten internen Fehler durchzuschlagen:

```json
{
  "data": {
    "errorKind": "prompt_queue_full",
    "sessionId": "...",
    "limit": 5,
    "pendingCount": 5
  }
}
```

## SDK-Verhalten

`DaemonClient` verfügt über eine lokale, sitzungsspezifische Reservierung für `prompt()`-Aufrufe. Es reserviert vor dem Senden der HTTP-Anfrage und gibt frei bei:

- legacy blockierendem `200`-Abschluss,
- nicht blockierendem `202`-Turn-Abschluss,
- `turn_error`,
- Aufrufer-Abbruch,
- SSE-Ende,
- Fetch- oder Antwort-Parsing-Fehler.

`DaemonPendingPromptLimitError` bedeutet, dass das SDK lokal abgelehnt und die Prompt-Anfrage nicht gesendet hat.

Die SDK-Option akzeptiert den numerischen Capability-Wert direkt; `null` deaktiviert die lokale Begrenzung, um mit `/capabilities.limits.maxPendingPromptsPerSession` übereinzustimmen.

`DaemonSessionClient` wendet dasselbe lokale Limit für den langlebigen Subscription-Pfad an. Die statischen Methoden `createOrAttach`, `load` und `resume` behalten ihre bestehenden Parameterpositionen; bei direkter Konstruktion kann das lokale Limit überschrieben werden.