# Finales Tool-Response-Budget

## Problem

Tool-Output wird derzeit auf mehreren unabhängigen Ebenen gekürzt. Shell-Output wird bei etwa 30K Zeichen gekürzt und als trunkiert markiert, generischer Tool-Output wird bei etwa 2K Zeichen gekürzt, und ein Core-Scheduler-Batch kann Output auslagern, wenn die Gesamtmenge das konfigurierte Batch-Budget übersteigt. Diese Ebenen teilen keinen strukturierten State.

Der Scheduler behandelt einen vorhandenen Trunkierungs-Marker als Beweis, dass keine weitere Arbeit nötig ist. Folglich können mehrere individuell gekürzte Shell-Ergebnisse das aggregierte Budget weiterhin überschreiten. Der Headless-Modus vergrößert die Lücke, weil er einen Scheduler pro Tool-Call erzeugt und ihre Responses außerhalb dieser Scheduler konkateniert. Der interaktive Modus hängt nach der Scheduler-Finalisierung ebenfalls duplizierte und synthetische Responses an. ACP, Agent und spekulative Ausführung haben ihre eigenen Aggregationsgrenzen.

Der Modell-Request, das wiederaufnehmbare Transkript und die Tool-Ergebnis-Aufzeichnung müssen dieselbe begrenzte Response enthalten. Die reichhaltige nutzerseitige Tool-Anzeige ist bewusst außerhalb des Scopes und kann weiterhin die bestehende Ergebnisanzeige verwenden.

## Invariants

1. Jeder Tool-Response-Batch wird an der letzten Aggregationsgrenze finalisiert, bevor er an das Modell gesendet wird.
2. Der serialisierte Tool-Output-Text in diesem Batch überschreitet das konfigurierte aggregierte Zeichenbudget nicht, wenn das Budget endlich und positiv ist. Der `enter_plan_mode`-Lifecycle-Reminder ist Policy-Input, kein Tool-Output, und bleibt inline außerhalb dieses Budgets.
3. Wenn ein Producer bereits Output-Artefakte persistiert hat, wiederverwenden spätere Ebenen diese Pfade, statt denselben Producer-Output erneut zu schreiben.
4. Die aggregierte Finalisierung verwendet strukturierte interne Metadaten, um zu entscheiden, ob persistierte Artefakte wiederverwendet werden können; sie leitet diese Entscheidung niemals aus menschenlesbarem Text ab. Die Producer-lokale Sentinel-Behandlung bleibt ein Kompatibilitätsdetail der bestehenden Trunkierer.
5. Die Finalisierung bewahrt die Response-Reihenfolge und Nicht-Text-Teile. Sie darf nur `functionResponse.response.output`, `functionResponse.response.error` und Top-Level-Textteile kürzen, die zum Tool-Response-Batch gehören.
6. Die finalisierten Teile sind auch die Teile, die für Replay und Resume aufgezeichnet werden.
7. Die Tool-Anzeige bleibt unabhängig von der Modell-Response.

## Design

### Persistierungs-Metadaten

`ToolResult` und `ToolCallResponseInfo` tragen ein internes optionales `persistedOutputFiles`-Feld.

- `undefined`: Der Producer hat keine Persistierungsentscheidung getroffen.
- `[]`: Eine Entscheidung wurde getroffen und es gibt keine wiederverwendbare Datei.
- ein nicht-leeres Array: Vom Producer persistierte Output-Artefakte sind unter diesen Pfaden verfügbar.

Das Feld ist nicht in Hook-Serialisierung, ACP-Payloads, JSON-Output, Telemetrie-Attributen oder persistierten UI-Metadaten enthalten. Eine von einem Hook rekonstruierte Response erbt keine Metadaten, es sei denn, sie wird explizit von der Runtime kopiert.

### Producer-Level-Vorschau

Die Producer-Trunkierung steuert die normale Modell-Vorschau und persistiert den vollständigen Output einmal.

- Shell behält den aktuellen 30K-Trigger, gibt aber eine etwa 4K große Head-and-Tail-Vorschau zurück, damit Exit-Informationen sichtbar bleiben.
- MCP behält seinen aktuellen Large-Output-Trigger, behält das vollständige transformierte Ergebnis für die nutzerseitige Anzeige und verwendet eine etwa 2K große Modell-Vorschau.
- Die generische Persistierung gibt den tatsächlich geschriebenen Pfad sowohl für den primären als auch den Fallback-Writer zurück.

Diese Vorschauen sind keine aggregierte Durchsetzung. Eine bereits gekürzte Response kann durch die Finalisierung erneut gekürzt werden.

### Geteilter Finalizer

Ein gemeinsamer Finalizer akzeptiert Responses in Originalreihenfolge plus das konfigurierte aggregierte Budget. Er misst alle begrenzten Textfelder und reduziert dann Text, bis die Gesamtmenge passt. Vorhandene persistierte Pfade werden wiederverwendet. Eine Response ohne wiederverwendbaren Pfad wird höchstens einmal persistiert, bevor eine Pfadreferenz ihre gekürzte Vorschau ersetzt oder begleitet.

Die Reduktion ist deterministisch. Eine Max-Min-Water-Fill-Allokation teilt das Budget über die modellseitigen Textfelder auf, während kleine Felder ihren vollständigen Inhalt behalten dürfen. Reduzierte Felder behalten eine kleine Head-and-Tail-Vorschau und listen die verfügbaren persistierten Artefaktpfade auf, wenn die Allokation es erlaubt. Unicode-Surrogate-Pairs werden niemals getrennt. Der finale Hard-Cap-Durchgang kürzt Text ohne I/O, sodass ein Persistierungsfehler die Request-Größen-Invariante nicht verletzen kann.

Der Finalizer berechnet `contentLength` aus den zurückgegebenen Teilen neu. Unendliche oder deaktivierte Budgets sind ein No-op.

`enter_plan_mode` ist die einzige semantische Ausnahme. Sein erfolgreicher Function-Response-Output installiert die aktive Planungs-Policy; ihn zu trunkieren würde daher Ausführungsregeln ändern statt diagnostischen Output zu kürzen. Der Finalizer und der Last-Chance-Send-Guard identifizieren diesen Output anhand des Tool-Namens und schließen ihn von der Allokation aus; Fehlertext und aller gewöhnliche Output im selben Batch bleiben begrenzt.

### Runtime-Grenzen

- Der Core-Scheduler finalisiert vor `PostToolBatch`-Hooks, um den Hook-Input zu begrenzen, und erneut nach dem Hook, um den Hook-Output zu begrenzen.
- Der interaktive Modus führt ausführbare, duplizierte und synthetische Responses in ursprünglicher Reihenfolge zusammen und führt dann die äußere Finalisierung vor Aufzeichnung und Submission aus.
- Der Headless-Modus sammelt den gesamten Turn, einschließlich duplizierter, übersprungener, abgebrochener und ausgeführter Calls, und finalisiert dann einmal vor Aufzeichnung und Submission.
- ACP sammelt den vollständigen Tool-Call-Turn, finalisiert ihn vor der Transkript-Aufzeichnung und gibt dieselben Teile für die nächste Nachricht zurück. Unmittelbare ACP-Anzeige-Events bleiben unverändert.
- Agent-Runtime und spekulative Folgeausführung finalisieren ihr Aggregat, bevor sie modellseitige Ergebnisse ausgeben oder History anhängen.
- Die Chat-Send-Grenze wendet eine I/O-freie Sicherheits-Obergrenze nur auf Tool-Response-Felder an. Sie sollte normalerweise ein No-op sein und schützt zukünftige Caller, die eine äußere Aggregationsgrenze verfehlen.

## Fehlerbehandlung

Persistierungsfehler werden über das bestehende Logging gemeldet und verhindern niemals die finale Trunkierung. Die zurückgegebene Modell-Response passt weiterhin ins Budget, kann aber eine Dateireferenz weglassen, wenn kein vollständiger Output erfolgreich persistiert wurde. Media-Teile bleiben unberührt und werden in diesem Zeichenbudget nicht gezählt.

Abbruch- und Hook-Stop-Responses werden genauso finalisiert wie erfolgreiche und fehlgeschlagene Tool-Responses. Leere Output- und Fehlerfelder bleiben gültig. Eine einzelne Response, die größer als das gesamte Batch-Budget ist, wird für sich allein reduziert; mehrere große Responses teilen sich die verbleibende Vorschau-Kapazität deterministisch.

## Kompatibilität und Non-Goals

Das öffentliche modellseitige Function-Response-Schema ändert sich nicht. Bestehender Trunkierungstext bleibt lesbar, aber die aggregierte Finalisierung hängt nicht mehr davon ab. Bestehende Sessions können weiterhin replayed werden; nur neu aufgezeichnete Tool-Ergebnisse erhalten die strengere Invariante.

Diese Änderung fügt keine Wire-Byte-Hashes, exaktes Token-Accounting, Media-Budgetierung, Storage-Lifecycle-Änderungen, Transkript-Migration oder ein neues Temp-File-Layout hinzu. Das sind unabhängige Folgeänderungen.
