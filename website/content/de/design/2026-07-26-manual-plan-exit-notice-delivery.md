# Zustellung der Benachrichtigung beim manuellen Plan-Exit

## Problem

Der Plan-Modus wird durch einen wiederkehrenden Reminder bei modellgebundenen
User-Turns abgesichert. Wenn sich der Genehmigungsmodus außerhalb des
genehmigten `exit_plan_mode`-Flows ändert, ist das bloße Stoppen dieses
Reminders kein zuverlässiges Signal dafür, dass der Plan-Modus beendet wurde.

Die bestehende One-Shot-Benachrichtigung wird in `GeminiClient` für
UserQuery- und Cron-Turns zusammengesetzt. Diese Grenze verfehlt
Modell-Requests, die über andere Pfade gesendet werden, darunter
Tool-Result-Continuations, Steering, Hooks, direkte ACP-/Daemon-Sends und
interaktive Agenten. Ein einzelnes Pending-Boolean auf `Config` lässt zudem
zu, dass eine Konversation eine Benachrichtigung konsumiert, die für jede
Live-Konversation bestimmt war, die den Modus teilt.

## Scope

Die Garantie gilt für Live-Konversationen im aktuellen Prozess. Sie
persistiert keine Benachrichtigungen über Prozessneustarts hinweg und ändert
keine Genehmigungs-Checks, Plan-Genehmigungen oder Tool-Ausführungen.

Benachrichtigungen sind aktiviert für:

- den von `GeminiClient.startChat` erstellten Haupt-Chat, einschließlich TUI,
  nicht-interaktiv, ACP, Daemon/Web-UI und Ersatz-Chats nach Kompression;
- Chats, die von `AgentCore.createChat` mit `interactive: true` erstellt
  werden.

Sie bleiben deaktiviert für Fork/Spekulation, Headless-Agenten, Workflows,
Memory- und Compaction-Side-Queries und jede andere `GeminiChat`, sofern
nicht explizit aktiviert.

## Zustand und Ownership

`Config` hält zwei unabhängige In-Memory-Zustände:

- ein Modus-Event `{ version, kind }`, wobei `kind` `clear` oder `manual-exit`
  ist;
- einen Konversations-Cursor `{ seenVersion }`.

Das Event gehört zum Genehmigungsmodus. Ein mit `Object.create(parent)`
erstelltes `Config` erbt sowohl den Genehmigungsmodus des Parents als auch
das aktuelle Event. Beim ersten Schreibvorgang, der einen eigenen
Genehmigungsmodus erzeugt, kopiert es das aktuelle Event und wird danach von
späteren Parent-Events isoliert.

Der Cursor gehört immer lazy dem empfangenden `Config`. Die Haupt-Konversation
und jeder interaktive Agent können dasselbe geerbte Event daher unabhängig
claimen. Wird ein Chat mit demselben `Config` neu erstellt, bleibt sein Cursor
erhalten und das Event wird nicht erneut zugestellt.

Modusübergänge aktualisieren das Event wie folgt:

- von Nicht-Plan zu Plan erhöht die Version und schreibt `clear`;
- von Plan zu Nicht-Plan erhöht die Version und schreibt `manual-exit`, außer
  ein genehmigtes `exit_plan_mode` schreibt `clear`;
- von Nicht-Plan zu Nicht-Plan erzeugt kein Event.

Der Eintritt in den Plan-Modus löscht einen noch nicht zugestellten älteren
Exit. Eine Zustellung liest den neuesten Genehmigungsmodus, sodass ein späterer
Nicht-Plan-zu-Nicht-Plan-Wechsel den in der ausstehenden Benachrichtigung
genannten Modus ändert, ohne eine weitere Benachrichtigung zu erzeugen.

## Zustellungs- und Fehlersemantik

`GeminiChat` stellt ein idempotentes Opt-in bereit. Bei jedem Send schließt er
die asynchrone Kompression und die Hard-Rescue-Checks ab und claimt dann
synchron ein ausstehendes Event unmittelbar bevor der User-Content in die
Historie übernommen wird. Die Benachrichtigung wird als letzter Text-Part
hinzugefügt, wobei alle davorliegenden Function-Response-Parts erhalten
bleiben.

Der Linearisierungspunkt ist der erfolgreiche Historien-Commit, der die
Benachrichtigung enthält. Provider-Retries und -Fallbacks verwenden diesen
committeten Request erneut und hängen keine zweite Benachrichtigung an die
Historie. Wirft der synchrone Sende-Setup eine Exception und rollt den
Historien-Push zurück, wird der Claim nur dann wiederhergestellt, wenn
dasselbe Manual-Exit-Event noch aktuell ist, der Modus noch Nicht-Plan ist und
der Cursor noch auf diese Version zeigt. Ein späteres Modus-Event macht eine
alte Wiederherstellung veraltet und harmlos.

Die Implementierung kann nicht feststellen, ob ein Provider einen
fehlgeschlagenen Transport-Request erhalten hat. Ein Transport-Retry kann
denselben Request mehrmals senden, aber die Live-Chat-Historie enthält die
Benachrichtigung höchstens einmal.

Die Context-Overflow-Recovery ist die Ausnahme von der Wiederverwendung des
Original-Requests: reaktive Kompression ersetzt die Live-Historie, bevor der
Retry-Payload neu aufgebaut wird. Enthält die komprimierte Historie die
committete Benachrichtigung nicht mehr, hängt der Chat genau diesen Text vor
dem Retry erneut an. Endet die Kompression bereits in einem User-Turn, wird
die Benachrichtigung als dessen letzter Part hinzugefügt, statt benachbarte
User-Turns zu erzeugen.

## Benachrichtigung

```text
<system-reminder>
The approval mode changed outside the approved exit_plan_mode flow.
The current approval mode is: ${currentMode}.
Plan mode is no longer active. This notice supersedes any earlier reminder that Plan mode is active. Do not call exit_plan_mode; no plan approval is pending. Continue under the current mode's permissions and confirmation requirements.
</system-reminder>
```

## Verifizierung

Unit-Tests decken die Übergangssemantik, Ownership geerbter Events,
unabhängige Konversations-Cursor, Verhalten veralteter Wiederherstellung,
Opt-in-Zustellung, Part-Reihenfolge, Setup-Rollback, Retries, Chat-Neuerstellung
und Chat-Ownership ab. Der E2E-Plan deckt PTY, ACP, interaktive Agenten und
genehmigte Plan-Exits ab.
