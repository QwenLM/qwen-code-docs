# Background Agent Hot Continuation

## Kontext

Ein abgeschlossener Hintergrund-Agent verliert derzeit seine
In-Prozess-Runtime. Ein späteres `send_message` rekonstruiert einen neuen
`AgentHeadless` aus dem JSONL-Transkript. Dies bewahrt den größten Teil der
sichtbaren Konversationshistorie, erstellt aber Chat, Tool-Fläche,
Pro-Agent-Registries und Provider-seitigen Cache-Zustand neu.

Der Startpfad konstruiert gewöhnliche Hintergrund-Agenten außerdem doppelt:
einmal mit dem Parent-Emitter und erneut mit dem dedizierten
Hintergrund-Emitter. Die erste Instanz wird nie ausgeführt oder entsorgt.

Dieses Design behandelt den In-Session-Lebenszyklus. Logische Entdeckung und
Fortsetzung nach Wiederherstellung der Parent-Session werden separat vom
Hintergrund-Agenten-Roster-Restore-Design behandelt.

Die Unterscheidung ist verhaltensbezogen, nicht nur ein
Implementierungsdetail. Innerhalb einer Session bewahrt die
Transkript-Wiederbelebung bereits die modellsichtbare Konversation, sodass Hot
Continuation hauptsächlich die Runtime-Rekonstruktion vermeidet und
Provider-/Tool-Zustand bewahrt. Über eine Parent-Session-Wiederherstellung
hinweg kann die ursprüngliche In-Memory-Runtime den Prozess-Teardown nicht
überleben. Logische Kontinuität kommt daher von der Wiederherstellung der
Task-Identität und des Transkripts in die neue Session, gefolgt von einer
kalten Rekonstruktion.

## Ziele

- Eine Runtime für einen frischen gewöhnlichen Hintergrund-Agenten erstellen.
- Diese Runtime nach einem erfolgreichen Turn resident halten.
- Einen abgeschlossenen Task auf demselben Chat und derselben vorbereiteten
  Tool-Fläche fortsetzen.
- Die aktuelle Task-Zeile, Task-Id, Pro-Turn-Start-/Completion-Events und
  Terminal-Benachrichtigungen bewahren.
- Transkript-Wiederbelebung als Fallback behalten, wenn keine kompatible
  residente Runtime existiert.
- Residente Ressourcen bei Fehler, Abbruch, Session-Shutdown/-Reset,
  Terminal-Entry-Eviction, Arbeitsverzeichniswechsel, Branch-Wechsel und
  ACP-Session-Close/-Disposal freigeben.
- Atomar Eingaben beanspruchen, die im Abschlussfenster in die Queue gestellt
  wurden, bevor eine erfolgreiche Completion publiziert wird.

## Non-Goals

- Persistenz einer Live-Runtime über Prozesse oder
  Parent-Session-Wiederherstellung hinweg.
- Hinzufügen eines `idle`-Werts zur geteilten Task-Status-Union.
- Ändern, wie Nachrichten, die an einen aktiv laufenden Agenten gesendet
  werden, zwischen Tool-Runden injiziert werden.
- Fork-Agenten persistent machen.
- Erweitern der Lebensdauer temporärer Worktrees über abgeschlossene Turns
  hinweg.
- Global registrierte Frontmatter-Hooks sicher installiert lassen, während ein
  Agent idle ist.

## Design

### Wiederverwendbare Headless-Runtime

`AgentHeadless` behält sein `GeminiChat` und vorbereitete Tool-Deklarationen
als Instanzzustand. Sein öffentliches `execute()` bleibt eine
Pro-Turn-Operation:

- Es darf nur ein Aufruf gleichzeitig laufen;
- Finaler Text und Terminierungsmodus werden zu Beginn zurückgesetzt;
  Statistiken werden für eine neue Parent-Anweisung zurückgesetzt, bleiben
  aber kumulativ über interne Stop-Hook-Retries dieser Anweisung;
- Der erste Aufruf erstellt den Chat und bereitet Tools vor;
- Spätere Aufrufe hängen einen neuen User-Turn an denselben Chat an und
  emittieren ein externes Nachrichten-Event, sodass das JSONL-Transkript
  vollständig bleibt.

Dies erhält die bestehenden `AgentHeadless`-Hooks, Telemetrie,
Externe-Nachrichten-Drain und den Terminal-Result-Vertrag. `AgentInteractive`
wird nicht verwendet, da seine Queue-API das Pro-Turn-Abschluss-Ergebnis und
die Benachrichtigungssemantik, die Hintergrund-Tasks benötigen, nicht
bereitstellt.

### Residenter Controller

`BackgroundTaskRegistry` besitzt eine In-Memory-Controller-Tabelle, die mit
Task-Ids als Schlüssel versehen ist. Der Controller ist absichtlich getrennt
von `AgentTask`, das ein serialisierbarer UI-/Status-Datensatz bleibt.

Ein Controller kann:

- eine Fortsetzung von einer abgeschlossenen Zeile starten;
- seine Runtime abbrechen und entsorgen.

Bei einem abgeschlossenen `send_message` fragt das Tool zuerst die Registry
nach einer residenten Fortsetzung. Ein Treffer ändert synchron die bestehende
Zeile zurück auf `running`, beansprucht einen normalen
Hintergrund-Ausführungs-Slot und plant den neuen Turn, nachdem der vorherige
Turn vollständig settled. Ein Fehlschlag verwendet den bestehenden
Transkript-Wiederbelebungs-Service.

`completed` bedeutet weiterhin „der letzte Turn wurde abgeschlossen". Die
Runtime-Residenz ist eine interne Implementierungstatsache, sodass der
geteilte Task-Status und die UI keinen neuen Idle-Zustand erhalten.

### Pro-Turn- und residente Ressourcen

Jede Fortsetzung erhält einen frischen Abort-Controller, ein
SubagentStart/Stop-Hook-Paar, einen Trace-Span, ein Task-Start-Event, eine
Completion-Benachrichtigung und einen Sidecar-Statusübergang. Eine Runtime,
die eine Child-only-AUTO-Permission-Lease benötigen würde, wird nicht
behalten, da diese Leases über parallele Subagents hinweg nicht
referenzgezählt sind.

Chat, vorbereitete Tools, JSONL-Writer, Event-Listener, Agent-scoped
Tool-Registry und Pro-Agent-MCP-Ressourcen bleiben lebendig, während der
Controller resident ist. Disposal ist idempotent.

Das bestehende Terminal-Entry-Retention-Limit begrenzt auch residente
Controller. Das Prunen einer Zeile entsorgt ihren Controller. Registry-Reset
und Shutdown entsorgen alle Controller, einschließlich bereits abgeschlossener.

### Kompatibilitätsausschlüsse

Die erste Version behält nur gewöhnliche benannte Hintergrund-Agenten, die:

- normal abgeschlossen haben;
- `isolation: "worktree"` nicht verwenden;
- keine Frontmatter-Hooks deklarieren;
- keine Child-only-AUTO-Permission-Lease benötigen.

Temporäre Worktrees werden derzeit nach jedem Turn finalisiert, sodass eine
behaltene Runtime mit einem Config auf ein entferntes Verzeichnis zeigen
würde. Frontmatter-Hooks werden derzeit für ihre Lebensdauer global
registriert, sodass ihr Behalten im Idle-Zustand unzusammenhängende Arbeit
beeinflussen könnte. Child-only-AUTO-Leases mutieren den
Parent-Permission-Manager und sind über parallele Subagents hinweg nicht
referenzgezählt, sodass ihr erneutes Akquirieren pro Hot-Turn unsicher wäre.
Agenten mit Hooks, Worktree-Isolation und Child-only-AUTO fahren über den
bestehenden JSONL-Wiederbelebungs-Flow fort. Der rekonstruierte Worktree-Agent
läuft vom aktuellen Parent-Arbeitsverzeichnis, da sein temporärer
Start-Worktree bereits finalisiert wurde.

## Races und Fehlerbehandlung

- Unmittelbar bevor eine kompatible Runtime eine erfolgreiche Completion
  publiziert, drainet der aktive Turn die Registry-Queue ohne zu yielden.
  Beansprucht er Eingaben, führt dieselbe Headless-Runtime diese Eingaben aus
  und der Task bleibt running. Ist die Queue leer, erfolgen
  Transkript-Persistenz und der Running-zu-Completed-Übergang synchron, sodass
  ein späteres `send_message` die abgeschlossene Zeile beobachtet und den
  residenten Fortsetzungspfad verwendet, statt eine irreführende
  In-die-Queue-Stellung-Bestätigung zu erhalten. Worktree-isolierte Turns
  führen ihren finalen Drain vor dem Teardown aus, da ihre Runtime danach
  absichtlich nicht fortsetzbar ist.
- Die Registry führt den Completed-zu-Running-Übergang synchron aus, bevor das
  Fortsetzungs-Promise geplant wird. Ein zweites paralleles `send_message`
  beobachtet daher `running` und verwendet die bestehende
  In-Runden-Nachrichten-Queue.
- Der nächste Turn wird nach dem vorherigen Turn-Promise verkettet und deckt
  das Fenster ab, in dem die Completion-Benachrichtigung emittiert wird, bevor
  der vorherige `finally`-Block abgeschlossen ist.
- Fehlgeschlagene und abgebrochene Turns entfernen und entsorgen den
  residenten Controller.
- Wenn das Beanspruchen eines Hintergrund-Slots fehlschlägt, bleibt die Zeile
  completed und der Aufrufer kann den bestehenden
  Kalt-Wiederbelebungs-Fehlerpfad verwenden.
- Disposal während eines aktiven Turns bricht seinen Controller ab und
  verschiebt destruktives Ressourcen-Cleanup in den Finalizer des Turns.

## Validierung

Unit-Tests müssen beweisen:

- Ein frischer Hintergrund-Start erzeugt exakt einen `AgentHeadless`;
- Zwei sequenzielle Turns verwenden einen `GeminiChat` und eine vorbereitete
  Tool-Liste;
- Abgeschlossenes `send_message` bevorzugt den residenten Controller;
- Abwesenheit eines residenten Controllers ruft weiterhin die
  Transkript-Wiederbelebung auf;
- Die zweite User-Anweisung ist im JSONL vorhanden;
- Reset, Shutdown/Abbruch und Terminal-Pruning entsorgen exakt einmal.
- `/branch` verweigert laufende Hintergrund-Arbeit und entsorgt residente
  Terminals erst, nachdem der Branch erfolgreich initialisiert wurde;
- Arbeitsverzeichniswechsel und ACP-Session-Disposal geben residente Runtimes
  frei.

Das E2E-Szenario verwendet eine Task-Id für zwei abgeschlossene Phasen und
verifiziert, dass die zweite Phase eine Nonce aus der ersten erinnert. Die
physische Runtime-Identität wird von Unit-Tests verifiziert, da Stream-JSON
keine Konstruktor-Zählungen preisgibt.
