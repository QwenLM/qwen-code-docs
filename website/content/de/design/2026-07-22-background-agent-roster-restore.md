# Background Agent Roster Restore

## Kontext

Sidecars und JSONL-Transkripte von Hintergrund-Agenten persistieren logische
Identität und Historie, während `BackgroundTaskRegistry` die adressierbaren
Tasks der aktuellen Session indiziert. Der Resume-Loader stellt derzeit nur
Sidecars wieder her, die im `running`-Zustand verblieben sind. Abgeschlossene
Agenten verschwinden daher aus der Registry, nachdem ihre Parent-Session
wiederhergestellt wurde, obwohl ihre Transkripte weiterhin verfügbar sind. Das
Modell hat auch kein Tool, um die Registry abzufragen.

## Ziele

- Kürzlich abgeschlossene Hintergrund-Agenten mit ihren ursprünglichen
  Task-Ids wiederherstellen.
- Ein Modell-aufrufbares `list_agents`-Tool für die On-Demand-Entdeckung
  hinzufügen.
- `send_message(task_id)` als Fortsetzungs-Operation behalten.
- Dem Modell nach der Wiederherstellung eine kurze, einmalige Erinnerung
  geben.
- Dasselbe Wiederherstellungsverhalten auf TUI-, Headless- und
  ACP-Einstiegspunkte anwenden.

## Non-Goals

- Persistenz einer Live-JavaScript-Runtime über den Prozess-Teardown hinweg.
- Ersetzen des Agent-Teams-`task_list`-Tools.
- Wiederherstellung fehlgeschlagener oder abgebrochener Agenten.
- Rekonstruktion temporärer Worktree-Isolation.

## Design

Der Session-Verzeichnis-Scan akzeptiert sowohl `running`- als auch
`completed`-Sidecars. Laufende Entries werden paused und bewahren das
bestehende Verhalten für unterbrochene Arbeit. Abgeschlossene Entries bleiben
completed, werden als bereits benachrichtigt markiert und behalten die
Transkript- und Metadaten-Pfade, die für die `send_message`-Wiederbelebung
benötigt werden.

Neue Sidecars persistieren, ob der ursprüngliche Start im Hintergrund war.
Abgeschlossene Entries werden nur wiederhergestellt, wenn dieser Marker
explizit true ist, sodass abgeschlossene Vordergrund- und
Legacy-nicht-markierte Sidecars nicht als wiederverwendbare
Hintergrund-Agenten freigegeben werden. Legacy-laufende Sidecars behalten das
bestehende Wiederherstellungsverhalten.

Der Loader verifiziert den Sidecar-Dateinamen und den Parent-Session-Owner vor
der Registrierung. Eine behaltene Zeile mit fehlendem Transkript, nicht
übereinstimmender Transkript-Identität, inkompatibler Isolation oder
kollidierendem Arbeitsverzeichnis bleibt sichtbar, wird aber als nicht
fortsetzbar markiert. Worktree-isolierte Zeilen werden genauso behandelt, da
ihr temporärer Ownership-Kontext nicht sicher rekonstruiert werden kann. Nur
die neuesten behaltenen abgeschlossenen Entries werden wiederhergestellt;
laufende Entries unterliegen diesem Limit nicht.

`list_agents` liest die Live-Registry und liefert Hintergrund-Agenten mit
einer stabilen `task_id`, Beschreibung, Typ, Status, Fortsetzungs-Fähigkeit
und jedem blockierenden Grund zurück. Es scannt keine Festplatte. Das Tool
gehört dem Aufrufer und ist von Subagents und Teammates ausgeschlossen.

Nach der Wiederherstellung erhält der nächste gewöhnliche Top-Level-User-Prompt
eine einzelne System-Erinnerung, `list_agents` und dann `send_message`
aufzurufen. Slash-Befehle und Fortsetzungen unterbrochener Turns verbrauchen
diese Erinnerung nicht. Der Bare-Modus erhält sie nicht.

Session-Wechsel leeren die In-Memory-Registry, bevor ein neues Roster geladen
wird. Ein fehlgeschlagener Resume-Rollback leert teilweise wiederhergestellte
Entries, bevor die alte Session wiederhergestellt wird, und Branching wird
blockiert, während Hintergrund-Arbeit noch aktiv ist.

## Validierung

- Laufende und abgeschlossene Sidecars werden mit stabilen Ids und korrekten
  Zuständen wiederhergestellt.
- Vordergrund- und Falsch-Owner-Sidecars werden ausgeschlossen.
- Unsicherer behaltener Zustand ist sichtbar, kann aber nicht fortgesetzt
  werden.
- Wiederhergestellte abgeschlossene Entries emittieren keine doppelten
  Completion-Benachrichtigungen.
- `send_message` kann einen kompatiblen wiederhergestellten abgeschlossenen
  Entry wiederbeleben.
- TUI, Headless und ACP stellen das Roster wieder her und liefern die
  Erinnerung einmal.
- Neue-, Leeren-, Branch- und fehlgeschlagene-Resume-Pfade leaken kein
  vorheriges Roster.
