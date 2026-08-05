# Sicheres Replay nach MCP-Verbindungsverlust

## Problem

Ein MCP-Tool kann einen Seiteneffekt abschließen, bevor seine
Response-Verbindung fehlschlägt. Erneut zu verbinden und denselben
`tools/call` noch einmal zu senden, kann daher einen Schreibvorgang
wiederholen, während der Nutzer nur das zweite Ergebnis sieht.
MCP-Tool-Annotationen sind optional und gehen standardmäßig von
nicht-idempotentem Verhalten aus, daher können fehlende Annotationen kein
automatisches Replay rechtfertigen.

## Replay-Policy

Qwen Code spielt einen fehlgeschlagenen Aufruf nur dann automatisch erneut
ab, wenn alle der folgenden Bedingungen wahr sind:

- Der Fehlschlag wird von den bestehenden MCP-Verbindungs-Checks als
  Verbindungsverlust klassifiziert.
- Der MCP-Server hat `trust: true`.
- Der aktuelle Workspace besteht das Workspace-Trust-Gate.
- Das Tool deklariert `idempotentHint: true`, oder deklariert
  `readOnlyHint: true` ohne `destructiveHint: true` oder
  `idempotentHint: false`.

Widersprüchliche Annotationen werden nicht als sicher behandelt.
Insbesondere wird ein Tool, das sich als read-only deklariert und zugleich
destruktives oder nicht-idempotentes Verhalten deklariert, nicht erneut
abgespielt. Eine explizite Idempotenz-Deklaration kann eine mutierende
Operation abdecken, hebt aber widersprüchliche Read-only-Annotationen nicht
auf.

Dieselbe Entscheidung wird auf beide Ausführungspfade angewendet: den
direkten MCP-Client für Progress-fähige Aufrufe und den Callable-Fallback.
Abort-Fehler, Nicht-Verbindungs-Fehler und MCP-`isError: true`-Protokoll-
Ergebnisse behalten ihr bestehendes Verhalten.

Nach dem Wiederverbinden wendet Qwen Code dieselben Trust- und
Annotations-Checks auf das neu entdeckte Tool an, bevor es das Replay
sendet. Es übernimmt kein Trust und keine Annotationen eines vorherigen
Server-Prozesses in den neuen Aufruf.

## Fehlerverhalten

Wenn ein Verbindungsfehler nicht sicher abzuspielen ist, verbindet der
aktuelle Aufruf nicht erneut und konstruiert keinen zweiten Aufruf. Er gibt
einen stabilen Fehler zurück, der erklärt, dass die Operation
möglicherweise abgeschlossen wurde und nicht automatisch wiederholt werden
darf. Der Fehler enthält weder Tool-Argumente noch den Upstream-Transport-
Fehler.

Die Verbindungs-Wiederherstellung für spätere, unabhängige Aufrufe bleibt
Verantwortung des bestehenden Health-Monitors, eines expliziten Reconnects
oder des normalen Discovery-Lebenszyklus. Sichere Aufrufe behalten das
bestehende begrenzte Reconnect-Verhalten.

## Kompatibilität

Dies ist eine bewusst konservative Änderung. Tools ohne Annotationen
erhalten kein transparentes Verbindungsverlust-Replay mehr, selbst wenn eine
ältere Qwen-Code-Version sie erneut versucht hat. Server, die Replay
möchten, müssen korrekte Annotationen bereitstellen, und Administratoren
müssen in einem vertrauenswürdigen Workspace dem Server-Trust zustimmen.

MCP-Annotationen sind Verhaltens-Hinweise, die der Server liefert, und keine
Autorisierungsgrenze. Qwen Code verwendet sie für Replay erst, nachdem sowohl
das Server- als auch das Workspace-Trust-Gate bestanden wurden.

## Verifikation

Tests decken den direkten Client und den Callable-Fallback, sichere
idempotente und Read-only-Deklarationen, fehlende und widersprüchliche
Annotationen, beide Trust-Gates, neu entdeckte Tools, die Trust oder
Annotationen verlieren, Verbindungsfehler-Klassifikation, Abbrüche,
Protokollfehler, Reconnect-Fehlschläge und das Retry-Limit ab. Ein separater
lokaler E2E-Mitschnitt übt einen Server, der einen Seiteneffekt committet,
bevor er die Response-Verbindung trennt, und verifiziert, dass ein unsicherer
Aufruf den Server nur einmal erreicht.
