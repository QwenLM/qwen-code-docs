# Tool-Call-Terminal-Telemetrie-Vertrag

## Problem

Tool-Call-Terminal-Events werden sowohl vom Core-Scheduler als auch von ACP
erzeugt. Sie legen bereits `status`, `success`, `error` und `error_type`
offen, aber diese Felder können widersprüchlich sein oder fehlen.
Insbesondere kann ein Tool einen Soft-Error ohne Error-Typ zurückgeben, und
ACP kann den Telemetrie-Logger aufrufen, ohne ein `ToolCallEvent` zu
konstruieren.

Dies lässt Logs, Nutzungsstatistiken, Metriken, Hooks und Chat-Aufzeichnung
mit unterschiedlichen Sichten auf dasselbe Terminal-Ergebnis.

## PR1-Scope

PR1 etabliert einen Runtime-Vertrag an zwei Grenzen:

1. Der Core-Scheduler konvertiert einen unklassifizierten `ToolResult.error`
   zu `ToolErrorType.UNKNOWN`, bevor er einen abgeschlossenen Call baut.
2. `logToolCall` normalisiert jedes Event, bevor es an einen
   Telemetrie-Consumer gesendet wird.

Der Terminal-Vertrag ist:

| `status`    | `success` | `error`   | `error_type`                |
| ----------- | --------- | --------- | --------------------------- |
| `success`   | `true`    | abwesend  | abwesend                    |
| `error`     | `false`   | erhalten  | expliziter Wert oder `unknown` |
| `cancelled` | `false`   | abwesend  | abwesend                    |

`status` ist autoritativ. Ein leerer `function_name` wird zu
`unknown_tool`. Nicht-leere Tool-Namen und nicht-leere Error-Typen bleiben
wortwörtlich erhalten. Der Normalizer liefert eine Kopie zurück und ist
idempotent.

Die Core-Grenze ist absichtlich privat. Öffentliche Tool-Implementierungen
dürfen `ToolResult.error.type` weiterhin weglassen, und
`ToolCallResponseInfo.errorType` bleibt optional, weil erfolgreiche und
abgebrochene Calls keine Fehlerklassifikation haben.

## Consumer

Das normalisierte Event wird von der UI-Telemetrie, dem Chat-aufgezeichneten
UI-Event, QwenLogger, OpenTelemetry-Logs und Tool-Call-Metriken verwendet.
Die OpenTelemetry-Aliase `error.message` und `error.type` werden unabhängig
befüllt.

Der Tool-Call-Counter fügt das `status`-Attribut mit niedriger Kardinalität
hinzu und behält `success` bei. Der öffentliche
`recordToolCallMetrics`-Input akzeptiert einen optionalen Status für
Quellkompatibilität; Caller, die ihn weglassen, werden vom
Legacy-Success-Boolean gemappt. Das Latenz-Histogramm bleibt nur nach
`function_name` keyed, und `error_type` wird nicht zu Metriken
hinzugefügt.

QwenLogger erhält `status` und `tool_type`. Es erhält im Rahmen dieser
Änderung nicht `mcp_server_name`, Funktionsargumente, Ergebnisse oder
Stack-Traces.

## Kompatibilität und Follow-ups

Diese Änderung ist additiv für Logs und Metriken, aber sie ändert einen
unklassifizierten Core-Fehler von einem fehlenden Wert zu `unknown` in
PostToolBatch und der Core-Chat-Aufzeichnung. Historische Queries sollten
fehlende Error-Typen zu `unknown` zusammenfassen; ein Daten-Backfill ist
nicht erforderlich.

Das Folgende bleibt außerhalb von PR1:

- Korrektur von ACP-Genehmigungs-Abbruch und anderen Producer-seitigen
  Terminal-Status-Bugs;
- Normalisierung der separaten rohen `tool_result`-Aufzeichnung von ACP;
- Hinzufügen von `error_type` zum PostToolUseFailure-Hook-Vertrag;
- Hinzufügen von Fehlerklassifikation zu primären Tool-Spans;
- Klassifizierung einzelner eingebauter und MCP-Fehlerstellen;
- Änderung der Legacy-UI-`totalFail`-Semantik.

Die neue `status`-Metrik darf nicht zur Stabilitäts-SLO-Quelle werden, bis
die ACP-Terminal-Status-Fixes gelandet sind.

## Rollout-Checks

Für die neue Service-Version sollten Operatoren verifizieren, dass:

- Error-Tool-Call-Logs nie einen leeren `error_type` haben;
- Tool-Call-Logs nie einen leeren `function_name` haben;
- Success- und Cancelled-Events keine Error-Felder tragen;
- explizit klassifizierte Errors ihren vorherigen Typ behalten;
- die Tool-Call-Counter-Summe weiterhin mit dem Tool-Call-Log-Volumen
  übereinstimmt; und
- der Anstieg von `unknown` dem vorherigen Bucket fehlender Werte
  entspricht.
