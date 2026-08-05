# Gewöhnliche-Session-Plan-Ausführung

## Ziel

Zeige den Todo-Plan einer gewöhnlichen Session als Abhängigkeitsgraph und
verbinde jeden Knoten mit den Agent-Ausführungen, die ihn implementieren.
Nutze den bestehenden ACP-Plan-Stream, den Session-Task-Snapshot und die
Subagent-Detail-Session erneut.

Diese Funktion ist beobachtend. Sie plant keine Arbeit, wiederholt sie
nicht, entsperrt sie nicht und schließt sie nicht ab.

## Datenvertrag

`todo_write` akzeptiert optionale `blockedBy`-Todo-IDs. Die Runtime
validiert, dass IDs eindeutig sind, Referenzen existieren, Abhängigkeiten
nicht dupliziert oder selbstreferenziell sind und der Graph azyklisch ist.

Das Todo-Sidecar speichert eine Runtime-generierte `planId` mit dem
aktuellen Snapshot. Die ID bleibt stabil, während ein aktiver Plan
überarbeitet wird. Das Löschen eines Plans oder das Beginnen nicht-leerer
Arbeit, nachdem der vorherige Plan abgeschlossen wurde, startet einen neuen
Plan.

Todo-Ergebnis-Anzeigen tragen die `planId`, sodass die Live-ACP-Projektion
und der gewöhnliche Transkript-Replay-Pfad dieselben Plan-Metadaten bewahren:

- Plan-Update `_meta.qwenTodoPlan.id`: stabile Plan-Identität
- Plan-Update `_meta.qwenTranscript.planToolCallId`: Quell-Todo-Tool-Aufruf
- Plan-Eintrag `_meta.qwenTodo.id`: ursprüngliche Todo-ID
- Plan-Eintrag `_meta.qwenTodo.blockedBy`: Abhängigkeits-IDs, wenn vorhanden

Clients, die `_meta` ignorieren, erhalten weiterhin Standard-ACP-Plan-
Einträge.

Das Agent-Tool akzeptiert eine optionale `todo_id`. Sie ist eine Empfehlung,
kein Runtime-Gate: Top-Level-Agent-Aufrufe sollten sie bereitstellen, wenn
ein aktiver Todo-Graph existiert. Das bestehende `AgentTask.toolUseId`
verbindet den Agent-Tool-Aufruf mit dem Live-Task-Status, sodass die
Task-API kein zusätzliches Feld benötigt.

## UI-Ablauf

Die aktive Todo-Pille rendert weiterhin die bestehende kompakte Liste. Ein
Klick darauf öffnet den bestehenden Tasks-Dialog. Wenn Plan-Metadaten
vorhanden sind, fügt dieser Dialog eine native CSS-Plan-Ausführungs-Sektion
oberhalb des bestehenden Task-Baums hinzu:

1. Schichte Knoten aus `blockedBy` topologisch.
2. Gruppiere Top-Level-Agent-Tool-Aufrufe nach `args.todo_id`.
3. Verbinde Live-Task-Zeilen über `task.toolUseId === tool.callId`.
4. Halte verschachtelte Agent-Zeilen über `parentAgentId` unter der Wurzel.
5. Wähle einen Workflow-Knoten aus, um seinen vollständigen Todo-Inhalt,
   Status, Abhängigkeiten und verknüpfte Agent-Ausführungen unterhalb des
   Graphen zu inspizieren.
6. Öffne das bestehende Live-Subagent-Detail-Panel von einer verknüpften
   Agent-Ausführung; es bleibt die Quelle für gestreamten Fortschritt,
   Tool-Aufrufe und finale Ausgabe.
7. Lege fehlende oder unbekannte `todo_id`-Bindungen in eine
   Unassigned-Gruppe.

Es wird keine Graph-Bibliothek hinzugefügt. Pläne ohne
Abhängigkeits-Metadaten behalten die Listen-Darstellung.

## Plan-Modus-Genehmigung

Der Plan-Modus ist das Opt-in-Execution-Gate für Nutzer, die einen Workflow
prüfen möchten, bevor die Arbeit beginnt. Wenn `exit_plan_mode` eine
Genehmigung anfordert, zeigt Web Shell den maßgeblichen ACP-Plan-Body,
gefolgt vom aktiven Todo-Workflow, im bestehenden Genehmigungspanel. Die
Todo-Sicht ist ergänzend, da ihr Snapshot vom gesendeten Plan-Text abweichen
kann. Ein Abhängigkeits-fähiger Workflow wird als derselbe DAG gerendert,
den der Tasks-Dialog verwendet; ein Workflow ohne Abhängigkeiten behält die
Listen-Darstellung.

Der bestehende Berechtigungs-Lebenszyklus bleibt maßgeblich: Genehmigung
verlässt den Plan-Modus und startet die Ausführung, während Ablehnung die
Session im Plan-Modus hält. Wenn kein aktiver Todo-Snapshot vorhanden ist,
behält die Genehmigung ihre bestehende Nur-Text-Darstellung mit dem von ACP
mitgeführten Plan-Body. Sessions, die den Plan-Modus nicht betreten, sind
unverändert.

## Status-Komposition

Der Todo-Status bleibt die fachliche Source-of-Truth. Der Agent-Zustand ist
ein Ausführungs-Overlay:

1. Eine verknüpfte Ausführung läuft: Running
2. Andernfalls, eine verknüpfte Ausführung pausiert: Paused
3. Todo abgeschlossen: Completed
4. Ein Abhängigkeits-Todo unvollständig: Blocked
5. Todo in Bearbeitung: In progress
6. Andernfalls: Ready

Eine fehlgeschlagene oder gecancelte Ausführung fügt ein Needs-attention-
Badge hinzu, ohne den Todo-Status zu ändern.

## Kompatibilität und Grenzen

- Alte Todo-Snapshots ohne IDs oder Abhängigkeiten bleiben lesbar.
- Agent-Aufrufe ohne `todo_id` bleiben gültig.
- Leere Todo-Snapshots müssen den aktiven Zustand sofort löschen.
- Vollständige Subagent-Ergebnisse bleiben außerhalb der
  Drei-Sekunden-Task-Polling-Response.
- Todo-Knoten erfinden keinen Schritt-Output; Ausführungsdetails stammen aus
  verknüpften Agent-Tool-Aufrufen und der bestehenden
  Subagent-Detail-Session.
- Strikte Plan-first-Erzwingung für jede Session bleibt out of scope, da ein
  Session-Level-Existenz-Check einen veralteten Plan akzeptieren könnte.
