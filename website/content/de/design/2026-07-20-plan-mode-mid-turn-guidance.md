# Plan mode mid-turn guidance and entry boundary

## Problem

`enter_plan_mode` ändert den Genehmigungsmodus, während ein Modell-Turn noch
verarbeitet wird. Vor dieser Änderung lieferte ein erfolgreicher Aufruf nur
einen kurzen Satz, sodass das Modell die vollständigen
Plan-Modus-Einschränkungen erst in einem späteren Turn erhielt.
Geschwister-Tool-Aufrufe derselben Modell-Antwort konnten auch auf beiden
Seiten des Modusübergangs ausgeführt werden: Aufrufe vor dem Eintritt liefen
unter dem vorherigen Modus, während Aufrufe danach liefen, nachdem der
Plan-Modus aktiv wurde, ohne gegen die neue Grenze neu geplant zu werden.

## Vertrag

Ein erfolgreicher oder bereits aktiver `enter_plan_mode`-Aufruf liefert
dieselbe vollständige Erinnerung zurück, die von
`getPlanModeSystemReminder()` erzeugt wird. SDK-Sessions erhalten die
SDK-spezifische Variante. Ungebetener YOLO-Eintritt, Übergangsfehler und
Subagent- oder Teammate-Ablehnung behalten ihre bestehenden Ergebnisse, da
kein Plan-Modus-Übergang stattfand.

Wenn ein Post-Deduplizierungs-ausführbarer Batch mehr als einen Aufruf
enthält und ein Aufruf `enter_plan_mode` ist, ist der erste Eintrittsaufruf
eine Ausführungsgrenze. Nur dieser Aufruf ist berechtigt, ausgeführt zu
werden. Jedes andere ausführbare Geschwister erhält, unabhängig davon, ob es
vor oder nach dem Eintritt erschien, eine terminale
`EXECUTION_DENIED`-Antwort, die das Modell anweist, im nächsten Turn zu
retryen, nachdem es den neuen Genehmigungsmodus beobachtet hat. Ein
Eintrittsfehler oder idempotenter Erfolg gibt die Geschwister nicht frei.

Bestehende terminale Entscheidungen haben Vorrang. Die Loop-Erkennung lehnt
weiterhin zuerst den gesamten Batch ab. Doppelte Provider-Antworten werden an
ihren ursprünglichen Positionen emittiert, sind aber keine ausführbaren
Geschwister. Im Structured-Output-Modus bleibt der bestehende
Structured-Output-Pre-Scan terminal und unterdrückt `enter_plan_mode` zusammen
mit anderen Nicht-Structured-Aufrufen.

`exit_plan_mode` ist in dieser Änderung keine Ausführungsgrenze. Seine
explizite User-Genehmigung und Stale-Context-Schutzmaßnahmen sind unabhängig.

## Integration

Der Core-Scheduler wendet die Grenze nach Call-Id-Deduplizierung und
kanonischer Namensauflösung an, vor Permission-Checks, Registry-Lookup, Hooks
oder Invocations-Konstruktion. Übersprungene Aufrufe fordern daher keine
Permissions an und führen keine Pro-Tool-Hooks aus. Sie bleiben terminale
Batch-Ergebnisse, sodass der bestehende Completion-Callback, Aufzeichnung,
Telemetrie und der `PostToolBatch`-Auditpfad eine vollständige Antwort für
jede akzeptierte Aufruf-Id beobachten. Laufzeitspezifische
Content-Generator-Views werden mit den anderen terminalen Ergebnissen
bereinigt.

ACP wendet dieselbe Policy nach Loop- und Duplicate-Provider-Handling und vor
der Ausführung seiner sequenziellen oder Agent-Batches an. Doppelte Antworten
bleiben in der Reihenfolge. ACP führt keinen `PostToolBatch`-Hook ein, da
dieser Pfad absichtlich keinen unterstützt.

Der Headless-Modus wendet die Policy nach Duplicate- und
Structured-Output-Filterung an. Übersprungene Aufrufe werden emittiert und als
verweigerte Tool-Ergebnisse in ihrer ursprünglichen Reihenfolge zurückgegeben,
verbrauchen aber kein `--max-tool-calls`-Budget. Der Eintritt selbst folgt dem
normalen Budget- und Abbruchverhalten.

## Output-Erhaltung

Die Erinnerung ist Lifecycle-Policy, kein gewöhnliches Tool-Payload.
`enter_plan_mode` deklariert ein unendliches Pro-Tool-Output-Limit, ist vom
Persistenz-Spill-Gate des Schedulers ausgenommen und ist kein Kandidat für
Aggregat-Batch-Offloading. Diese drei Schutzmaßnahmen verhindern, dass die
Policy vor dem nächsten Modell-Turn abgeschnitten, durch einen Datei-Zeiger
ersetzt oder auf eine Vorschau reduziert wird.

## Validierung

Die Unit-Abdeckung verifiziert exakte DEFAULT- und SDK-Reminders, erfolgreichen
und idempotenten Eintritt, Erste-Eintritt-Auswahl, Geschwister-Verweigerung
auf beiden Seiten, Duplicate-Provider-Reihenfolge, Headless-Budget-Abrechnung,
vollständige Erinnerungs-Erhaltung unter absichtlich winzigen
Output-Schwellen, `PostToolBatch`-Sichtbarkeit und Runtime-View-Cleanup.
Bestehende Scheduler-, ACP- und Headless-Suites decken das umgebende
Permission-, Loop-, Duplicate-, Structured-Output- und Abbruchverhalten ab.

Die Managed-Host-Validierung sollte bestätigen, dass der ACP-Client ein
Ergebnis für jeden Tool-Aufruf erhält und dass die nächste Modell-Anfrage die
vollständige Erinnerung plus die Geschwister-Verweigerungs-Antworten enthält.
Diese Validierung erfordert einen deployten Build und eine Host-Session-Id;
sie wird nicht durch Änderung des Produktions-Routings in diesem PR simuliert.
