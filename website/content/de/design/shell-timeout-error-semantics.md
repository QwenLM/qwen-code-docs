# Shell-Timeout-Fehlersemantik

## Problem

Vordergrund-Shell-Befehle beschreiben derzeit einen Timeout im Text, geben
aber ein erfolgreiches `ToolResult` zurück. Downstream-Code verbucht den
Aufruf daher als erfolgreich, sendet eine Function-Response mit
`output`-Feld und kann einen Erfolgsindikator rendern, obwohl der Befehl
nicht abgeschlossen hat. Ein Abbruch, der nach dem Timeout eintrifft, kann
außerdem den ursprünglichen Grund überschreiben. Während der PTY-Discovery
kann ein bereits abgebrochener Aufruf noch einen Prozess spawnen, weil der
Execution-Service das Signal erst nach dem Start beobachtet.

## Result-Contract

Ein von Shell verantworteter Vordergrund-Timeout gibt
`ToolErrorType.EXECUTION_TIMEOUT` zurück. Das Ergebnis nutzt drei bewusst
getrennte Kanäle:

| Kanal           | Zielgruppe                               | Timeout-Inhalt                                                                        |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `error.message` | Hooks, Telemetrie, Spans, Logs, Alerting | Nur kurze Timeout-Zusammenfassung                                                     |
| `llmContent`    | Modell-Function-Response                 | Timeout-Zusammenfassung, Teil-Output oder explizite Kein-Output-Aussage sowie ein etwaiger Trunkierungs-Zeiger |
| `returnDisplay` | Interaktive Historie und ACP-Clients     | Timeout-Zusammenfassung, Teil-Output oder Kein-Output-Aussage sowie ein etwaiger Trunkierungs-Zeiger |

Der Scheduler wandelt Timeout-`llmContent` in eine Function-Response um,
deren `response` ein `error`-Feld und kein `output`-Feld hat.
Failure-Hook-Zusatzkontext wird einmal an diesen modellseitigen Fehler
angehängt. Der Top-Level-`ToolCallResponseInfo.error` bleibt die kurze
operative Zusammenfassung, damit Befehls-Output nicht in Telemetrie oder
Hook-Fehlerargumente kopiert wird.

Andere Soft-Tool-Fehler behalten ihr bestehendes Core-Scheduler-Verhalten.
ACP und spekulative Ausführung kodieren alle Soft-Fehler konsistent mit
einem Fehler-Envelope, weil diese Pfade Tools direkt aufrufen und sonst
keinen Scheduler-Klassifikationsschritt hätten.

## First-Cause-Regeln

`AbortSignal.any()` bewahrt den Grund des ersten Signals, das abbricht. Die
Shell-Klassifikation liest nach der Ausführung nur den kombinierten
Signal-Grund:

- `TimeoutError` plus abgebrochene Ausführung ist ein Timeout.
- Ein Background-Promote-Grund plus abgebrochene, nicht promotete Ausführung
  ist der bestehende Promote-Refused-Race.
- Jede andere abgebrochene Ausführung ist ein Abbruch.
- Ein Timeout, der zuerst eintritt, wird durch einen späteren Nutzer-Abbruch
  oder eine spätere Promote-Anfrage nicht geändert.
- Ein Abbruch oder eine Promote-Anfrage, die zuerst eintritt, wird durch
  einen späteren Timeout nicht geändert.

Der Core-Scheduler hat einen zweiten, optionalen globalen Execution-Timer.
Ein strukturierter Timeout, den ein Tool zurückgibt, bleibt ein Timeout,
selbst wenn das Eltern-Signal abgebrochen wird, bevor der Scheduler das
Ergebnis konsumiert. Wenn der Timer des Schedulers selbst das
Timeout-Ergebnis liefert, gewinnt er nur, falls das Eltern-Signal zum
Zeitpunkt des Timer-Auslösens noch nicht abgebrochen war. Ein Eltern-Abbruch
gefolgt von einem Timer-Auslösen gegenüber einem unkooperativen Tool bleibt
abgebrochen.

ACP wendet dieselbe Regel für strukturierte Tool-Timeouts an: Der Timeout
ist ein Fehler und kein Interrupt, selbst wenn sein Eltern-Signal danach als
abgebrochen beobachtet wird. Geworfene Exceptions nutzen weiterhin den
Live-Abort-Status.

## Startverhalten

`ShellExecutionService.execute()` gibt sofort ein abgebrochenes, prozessloses
Handle zurück, wenn sein Signal bereits abgebrochen ist. Die PTY-Discovery
führt einen Race zwischen Signal und `getPty()` durch und entfernt ihren
temporären Listener nach dem Race. Gewinnt der Abbruch, wird eine spätere
PTY-Auflösung oder -Ablehnung konsumiert, ohne ein PTY zu spawnen oder auf
`child_process` zurückzufallen. Das zurückgegebene Ergebnis nutzt
`executionMethod: 'none'` und hat keine PID.

Dieses Verhalten betrifft alle Consumer des Service im Repository:
Vordergrund- und Hintergrund-Shell-Plumbing, Nutzer-`!`-Shell,
Prompt-Befehlsinjektion, ACP-Bridge-Shell-Behandlung und
Git-Attribution-Probes. Die einzige Verhaltensänderung ist, dass ein bereits
abgebrochener Request keinen Prozess mehr startet.

## Consumer-Verhalten

| Consumer                           | Timeout-Verhalten                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Core-Scheduler                     | `status: error`, kurzer Top-Level-Fehler, detaillierter `response.error`, Timeout-Fehlerart         |
| ACP-Session                        | Fehlgeschlagenes Tool-Update, detaillierter Fehler-Envelope in Modell-Historie und Recording, kurze operative Metadaten |
| Spekulative Ausführung             | Detaillierter Fehler-Envelope; akzeptierte spekulative Historie rendert Error                        |
| Anthropic-Adapter                  | `tool_result.is_error: true`                                                                          |
| OpenAI-kompatible Adapter          | Expliziter detaillierter Fehlertext; es existiert kein Fehler-Bit auf Protokollebene                 |
| JSON und stream-json               | `is_error: true`, detaillierter verschachtelter Fehlerinhalt wird gegenüber der kurzen Zusammenfassung bevorzugt |
| Kontext-Schätzung und Batch-Budget | Sowohl `response.output`- als auch `response.error`-Text werden gezählt; zu große Fehler behalten beim Offload den Fehler-Key |

Microcompaction lässt fehlgeschlagene Tool-Ergebnisse weiterhin
unangetastet. Die vollständige Chat-Kompression sieht jetzt die detaillierte
Fehlergröße und kann beim korrekten Budget auslösen.

## Claude-Code-Vergleich

Claude Code behandelt einen Befehls-Timeout als fehlgeschlagenes
Tool-Ergebnis, behält vor der Terminierung erzeugten Output für Modell und
Nutzer und markiert das Tool-Ergebnis im Anthropic-Protokoll als Fehler.
Dieses Design übernimmt diese beobachtbaren Eigenschaften, behält aber die
bestehende `ToolResult`-Form und die Telemetrie-Konventionen von qwen-code
bei. Es kopiert keinen Befehls-Output in den kurzen operativen Fehlerkanal.

## Kompatibilität und Observability

Dies ist eine bewusste Wire-Level-Korrektur. Soft-Fehler bei ACP und
Spekulation wechseln von `{ output }` zu `{ error }`; Core ändert diese Form
nur für `EXECUTION_TIMEOUT`. Timeout-Zählungen wandern von Erfolgsmetriken
zu Fehler-/Timeout-Metriken, und Failure-Hooks ersetzen Success-Hooks. Kein
Schema, kein Fehler-Enum, kein Timeout-Default, keine Migration und kein
Rollout-Flag ändern sich.

Teilweiser Befehls-Output kann sensible Daten enthalten. Er bleibt für
Modell, interaktives Ergebnis, Chat-Recording und expliziten JSON-Output
verfügbar, so wie vor der Klassifikationskorrektur. Er wird nicht zu
Hook-Fehlerargumenten, Top-Level-Fehlern, Span-Ergebnisattributen oder
operativen Log-Zusammenfassungen hinzugefügt. Bestehende Trunkierungs- und
Spill-to-Disk-Limits gelten für den detaillierten Modellkanal.

## Nicht im Scope

- Heartbeats oder regelmäßige Fortschrittsmeldungen
- Todo-Stop-Guards oder Prompt-Änderungen
- Semantik von Exit-Codes ungleich null
- Semantik von Terminierung durch externe Signale
- Hintergrund-Shell-Timeouts
- Warten auf Teil-Output, nachdem der globale Scheduler-Timer gewonnen hat
- Neue Timeout-Settings oder Protokollfelder

## Verifikation

Die Unit-Abdeckung testet Pre-Aborted- und PTY-Discovery-Races,
Shell-Timeout-/Cancel-/Promote-Reihenfolge, Sed-Simulation, kurze gegenüber
detaillierten Scheduler-Kanälen, Core-Global-Timeout-Reihenfolge, direkte
ACP- und Spekulations-Aufrufe, Anthropic-Konvertierung, JSON-Inhaltsauswahl,
Fehlergrößenschätzung und Batch-Offload. Der E2E-Plan ist in
`.qwen/e2e-tests/shell-timeout-semantics.md` dokumentiert.
