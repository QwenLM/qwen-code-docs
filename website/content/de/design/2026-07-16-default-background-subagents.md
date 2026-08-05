# Default Background Subagents

## Zusammenfassung

Top-Level-One-Shot-Subagents sollten standardmäßig im Hintergrund laufen. Aufrufer, die ein Inline-Ergebnis benötigen, können mit `run_in_background: false` opt-out machen. Verschachtelte Subagent-Starts und Starts, die an einen caller-eigenen `working_dir` gebunden sind, bleiben Vordergrund-Operationen, da der aktuelle Hintergrund-Lebenszyklus Ergebnisse nicht sicher an diese Aufrufer zurückgeben kann. Forks und benannte Agent-Teams-Teammates behalten ihr bestehendes Verhalten.

## Motivation

Das Agent-Tool unterstützt bereits Hintergrundausführung über interaktive, headless- und SDK-Consumer hinweg, aber Aufrufer müssen sie aktuell mit `run_in_background: true` anfordern oder einen Agent auswählen, der mit `background: true` deklariert ist. Dadurch blockiert gewöhnliche Delegation den Parent standardmäßig, selbst wenn der Parent unabhängige Arbeit fortsetzen könnte. Hintergrundausführung zum Top-Level-Standard zu machen, entspricht besser der Parallel-Delegations-Anleitung des Tools und behält gleichzeitig einen expliziten Vordergrund-Notausstieg für ergebnisabhängige Arbeit.

## Ziele

- Top-Level-One-Shot-Subagents im Hintergrund ausführen, wenn `run_in_background` weggelassen wird.
- `run_in_background: false` als expliziten Vordergrund-Opt-out beibehalten.
- Die bestehenden Completion-Benachrichtigungs-, Cancellation-, Parallelitäts-, Berechtigungs-, Transkript- und Headless-Hold-back-Pfade beibehalten.
- Unsichere oder nicht unterstützte Start-Formen auf ihrem bestehenden Vordergrund-Pfad belassen.
- Die Kompatibilitätsauswirkungen für Skills und Aufrufer dokumentieren, die ein Inline-Ergebnis benötigen.

## Nicht-Ziele

- Hintergrundausführung für verschachtelte Subagent-Starts.
- Hintergrundausführung in einem caller-eigenen `working_dir`.
- Änderungen an Fork-Kontextvererbung oder Fork-Lebenszyklus.
- Änderungen am Verhalten benannter Agent-Teams-Teammates.
- Ein neues globales Setting für den Standard.
- Neugestaltung von Hintergrund-Benachrichtigungs-Routing oder Task-Verantwortung.

## Verhalten

Die Runtime löst die One-Shot-Subagent-Ausführung in dieser Reihenfolge auf:

1. Ein benannter Agent-Teams-Teammate verwendet den bestehenden Teammate-Pfad.
2. Ein gültiger Top-Level-Fork verwendet den bestehenden Detached-Fork-Pfad.
3. Ein verschachtelter gewöhnlicher Subagent läuft im Vordergrund, selbst wenn Hintergrund angefordert wurde, damit sein Ergebnis an den verschachtelten Aufrufer zurückkehrt.
4. Ein gewöhnlicher Subagent mit `working_dir` und ohne konfigurierten Hintergrund-Standard läuft im Vordergrund, da der Aufrufer den Lebenszyklus dieses Worktrees besitzt. Eine explizite oder konfigurierte Hintergrund-Anfrage bleibt ungültig.
5. Für jeden anderen Top-Level-gewöhnlichen Subagent:
   - `run_in_background: false` läuft im Vordergrund.
   - `run_in_background: true` läuft im Hintergrund.
   - Ein weggelassenes `run_in_background` läuft im Hintergrund.

Das bestehende Frontmatter `background: true` auf Agent-Ebene bleibt aus Kompatibilitätsgründen akzeptiert. Es ist nicht mehr erforderlich, um den neuen Top-Level-Standard zu erhalten. Ein expliziter Tool-Call-Wert von `run_in_background: false` hat Vorrang und wählt den Vordergrund-Pfad.

## Implementierung

Die Dispatch-Entscheidung bleibt im Agent-Tool, damit jeder Consumer dasselbe Verhalten erhält. Die Hintergrund-Entscheidung sollte drei Konzepte unterscheiden:

- ob der Aufrufer explizit opt-out gemacht hat;
- ob der Start Top-Level ist;
- ob die Start-Form sicher abgetrennt werden kann.

Die Implementierung sollte den bestehenden Hintergrund-Branch wiederverwenden, statt einen zweiten Start-Pfad hinzuzufügen. Der Tool-Schema-Text und die modell-seitige Nutzungsanleitung sollten Hintergrund als Standard beschreiben und Aufrufern sagen, dass sie `run_in_background: false` übergeben sollen, wenn sie das Ergebnis inline benötigen.

Die `working_dir`-Ausnahme muss vor dem bestehenden Inkompatibilitäts-Guard aufgelöst werden. Ein weggelassener Hintergrund-Parameter darf zuvor gültige gepinnte Review-Starts nicht in Fehler verwandeln. Ein explizites `run_in_background: true` oder ein mit `background: true` konfigurierter Agent bleibt inkompatibel mit `working_dir` und bewahrt so den bestehenden Sicherheits-Check.

## Ergebnisfluss

Ein Standard-Hintergrund-Start liefert die bestehende Hintergrund-Start-Antwort sofort an den Parent zurück. Der abgetrennte Task bleibt in der bestehenden Hintergrund-Task-Registry registriert. Wenn er endet, emittiert die Registry die bestehende Completion-, Failure- oder Cancellation-Benachrichtigung, und der Parent verarbeitet das Ergebnis in einem späteren Turn. Es wird weder ein neues Nachrichtenformat noch ein SDK-Event eingeführt.

Vordergrund-Opt-outs fahren über den bestehenden synchronen Branch fort und liefern das bereinigte Subagent-Ergebnis inline zurück.

## Dokumentation

Der Subagent-Benutzerleitfaden sollte angeben, dass benannte One-Shot-Subagents auf Top-Level standardmäßig im Hintergrund laufen, und `run_in_background: false` erklären. Der Fork-Vergleich sollte sich auf Kontextvererbung und Ergebnis-Semantik konzentrieren, statt zu behaupten, dass alle benannten Subagents den Parent blockieren.

## Testen

Die Unit-Abdeckung sollte verifizieren:

- Ein gewöhnlicher Top-Level-Subagent mit weggelassenem Flag startet im Hintergrund;
- `run_in_background: false` liefert das Ergebnis inline zurück;
- `run_in_background: true` behält das bestehende Hintergrund-Verhalten;
- Ein verschachtelter Start mit weggelassenem oder true-Flag bleibt Vordergrund;
- Ein `working_dir`-Start mit weggelassenem Flag bleibt Vordergrund;
- Eine explizite Hintergrund-Anfrage mit `working_dir` bleibt abgelehnt;
- Fork- und benanntes Teammate-Verhalten bleiben unverändert;
- Das Tool-Schema und die Nutzungsanleitung bewerben den neuen Standard und den Opt-out.

Bestehende Tests, die den Vordergrund-Branch absichtlich ausführen, sollten `run_in_background: false` übergeben, damit ihre Erwartung explizit ist. Die fokussierte Agent-Tool-Testdatei, Build und Typecheck sind vor der Einreichung erforderlich. Ein manueller interaktiver E2E-Check sollte bestätigen, dass eine normale Delegation die Kontrolle sofort zurückgibt und später eine Completion-Benachrichtigung zustellt, während eine explizite Vordergrund-Delegation blockiert und ihr Ergebnis inline zurückgibt.

## Risiken und Kompatibilität

Die Änderung ist verhaltensbrechend für Prompts, Skills und programmatische Aufrufer, die das Flag weglassen und annehmen, dass die Agent-Tool-Antwort das Subagent-Ergebnis enthält. Diese Aufrufer müssen `run_in_background: false` übergeben.

Die Standard-Hintergrundausführung kann auch die parallele Arbeit erhöhen. Bestehende globale Parallelitäts-Limits und Queuing bleiben die maßgeblichen Schutzmechanismen. Berechtigungsbehandlung, Shutdown und Headless-Warten verwenden bereits den etablierten Hintergrund-Task-Lebenszyklus und werden durch dieses Design nicht geändert.
