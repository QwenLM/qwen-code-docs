# Härtung des Daemon-Todo-Stop-Guard

## Kontext

Der Todo-Stop-Guard des Daemons kann eine begrenzte automatische Fortsetzung
anhängen, nachdem ein Modell-Turn vertrauenswürdige Todo-Einträge unfertig
gelassen hat. Eine Bridge kann einen weiteren User-Prompt aufnehmen, während
der aktuelle Turn drainet, und Hintergrund-Agenten, Monitore,
Benachrichtigungen und Cron-Jobs können gleichzeitig abgeschlossen werden. Der
Guard darf zugelassene Benutzerarbeit nicht überholen, keine Arbeit aus einem
anderen Workspace oder Prompt wiederbeleben und keine User- und Tool-Inhalte
verlieren, wenn ein automatisches Senden fehlschlägt.

## Fortsetzungs-Ownership

`craft/claimTodoStopGuardContinuation` ist die Reihenfolge-Grenze zwischen der
Prompt-Queue einer Bridge und einer Guard-Fortsetzung. Der Request enthält die
Session-ID und, bei einem Prompt im Besitz der Bridge, die vertrauenswürdige,
von der Bridge injizierte `InvocationContextV1.promptId`. Session-lokale
Provider-Prompt-IDs sind keine Owner.

Bei einem Prompt im Besitz der Bridge claimt der Daemon nur, solange dieser
Prompt noch der aktive, nicht abgebrochene laufende Eintrag ist. Ein live
gequeueter Prompt erzeugt `{ claimed: false, hasQueuedPrompt: true }` und
bindet das Warten an die aktuelle Owner-Prompt-ID. Ein fehlender, ersetzter
oder konkurrierender Owner schlägt fail-closed fehl, ohne den Zustand eines
anderen Owners zu ändern. Ein Owner-loser automatischer Turn kann nur claimen,
wenn kein live Bridge-Prompt existiert.

Channels und der geteilte Desktop-Agent haben nicht die Daemon-FIFO. Sie
validieren die aktuelle Session und geben einen erfolgreichen Claim für sie
zurück; unbekannte Sessions und Owner-lose Fallback-Handler schlagen
fail-closed fehl. Clients, die die Methode nicht implementieren, fehlerhafte
Responses und die Zwei-Sekunden-Claim-Deadline deaktivieren jeweils nur den
Guard-Anteil einer Fortsetzung; ein unabhängig blockierender externer
Stop-Hook darf weiterhin fortsetzen. Ein bestätigter live FIFO-Prompt beendet
stattdessen den alten Turn sofort, ohne die nun veraltete Hook-Response
anzuzeigen oder zu zählen.

`craft/todoStopGuardQueueReleased` trägt die Guard-Owner-Prompt-ID. Ein spätes
Release kann nur das passende Warten löschen. Die FIFO-Promotion löscht
ebenfalls das Owner-scoped Warten, weil der gequeuete User-Prompt die
Ownership übernommen hat. Die Session verfolgt auch Claims in Flight: Wird das
passende Release vor der Claim-Response-Fortsetzung verarbeitet, nimmt sie
einen kurzlebigen Tombstone auf, wendet den terminalen Release-Zustand an und
lehnt es ab, ein Warten aus der veralteten Response zu installieren. Der
Tombstone wird entfernt, wenn der letzte in-flight Claim für diesen Owner zum
Settlement kommt.

## Send-Reihenfolge und Erhalt

Das Feld `hasQueuedPrompt` des Drain-Ergebnisses ist ein Hinweis. Ein
positiver Hinweis wird durch einen Claim bestätigt: Eine noch aktive Queue
gibt den Turn frei, während eine verschwundene Queue die Fortsetzung der
Stop-Verarbeitung erlaubt. Hat derselbe Drain auch User-Inhalte mitten im Turn
entfernt, speichert das Freigeben diese Inhalte im Chat-Verlauf, bevor der
gequeuete Prompt läuft, damit die Reihenfolge-Grenze nicht zur
Datenverlust-Grenze wird. Ein fehlgeschlagener oder fehlerhafter Drain gibt
wiederhergestellten User-Inhalten Vorrang, wenn solche Inhalte existieren;
andernfalls suspendiert er den Guard hart, ohne einen unabhängigen externen
Stop-Hook zu unterdrücken.

Vor einem Guard-zugeordneten Modell-Stream drainet die Session den Input, baut
Image-Parts, wählt das Vision-Modell für den vollen Turn, aktualisiert den
PLAN-Modus und den Hintergrundzustand, aktualisiert die Guard-Entscheidung und
claimt die Fortsetzung. Kompression, Token-Limit-Checks und der Provider-Send
erfolgen erst nach diesem Claim. Jeder weitere Guard-Stream claimt separat.
Ein Prompt, der vor dem Claim aufgenommen wird, gewinnt; einer, der nach dem
Claim aufgenommen wird, wird nach der bereits committeten Fortsetzung
eingeordnet.

Wenn Vorbereitung, Kompression, Claim, Token-Limit-Validierung,
Stream-Erstellung oder der Provider-Send fehlschlagen, wird die nicht
gesendete Guard-Anweisung vor dem Erhalt des Verlaufs entfernt. Gedrainte
User-Parts, erfolgreiche Function-Responses und andere unabhängige
Stop-Inhalte bleiben erhalten. Die Session vergleicht den
User-Content-Push-Zähler, bevor sie Verlauf hinzufügt, damit eine tiefere
Schicht, die den Inhalt bereits persistiert hat, kein Duplikat verursachen
kann.

## Harte Suspendierung

Die harte Suspendierung tritt ein nach Guard-Erschöpfung, expliziter
Session-Entsorgung, Beginn der Verlegung des Arbeitsverzeichnisses, einem
terminalen Release eines gequeueten Prompts, einem unzuverlässigen Drain ohne
wiederhergestellten User-Input sowie kontrollierten Abbruch- oder
Fehlschlagpfaden, die die Kette nicht sicher fortsetzen können. Sie löscht
bestehende Ownership gequeueter Einträge und blockiert späte Todo-Writes, die
die alte Kette erneut aktivieren würden. Eine vollständige FIFO-Beobachtung,
die mit der Suspendierung raced, kann für ihren Owner weiterhin die
Prompt-Reihenfolge-Priorität etablieren, aber diese Priorität stellt weder das
Guard-Vertrauen wieder her noch erlaubt sie einen Guard-Send.

Nur ein neuer gewöhnlicher Prompt startet eine neue Kette. Ein
vertrauenswürdiger Retry darf eine durch Retry pausierte Kette fortsetzen,
aber Hintergrund-Ergebnisse, Cron-Turns, Benachrichtigungs-Turns,
Settings-Refreshes und späte Tool-Abschlüsse können die harte Suspendierung
nicht aufheben. Der Eintritt in den PLAN-Modus löscht das Guard-Vertrauen und
verhindert automatische Fortsetzungen.

## Hintergrund-Lineage

Die Session erfasst zu Beginn jeder Work-Chain eine Hintergrund-Baseline und
setzt die Baseline und das explizite Set zugehöriger Agenten gemeinsam zurück.

- Ein neu erstellter Top-Level-Agent ist zugehörig.
- Ein neues Child erbt rekursiv von seinem Parent. Fehlende Parents und Zyklen
  schlagen fail-closed fehl.
- Ein Baseline-Agent ist nicht zugehörig, es sei denn, die Chain setzt ihn
  erfolgreich mit `send_message(task_id)` fort.
- `send_message(task_id)` markiert das Ziel provisorisch nach den Permission-
  und `PreToolUse`-Checks, aber vor der Ausführung, sodass eine schnelle
  Completion-Benachrichtigung korrekt klassifiziert wird. Erfolg committet vor
  `PostToolUse`; Fehler, Abbruch oder ein Throw rollt nur die durch diesen
  Aufruf eingebrachte Markierung zurück.
- Ein an das Team adressiertes `send_message(to)` ändert die Task-Lineage
  nicht.
- Ein Monitor mit Owner erbt die Relation des Owners unabhängig von der
  eigenen Baseline-Mitgliedschaft des Monitors. Ein Monitor ohne Owner
  verwendet seine Monitor-ID.

Die Benachrichtigungs-Relation wird zum Enqueue-Zeitpunkt gespeichert, damit
eine spätere Registry-Löschung oder Statusänderung ein bereits zugestelltes
Ergebnis nicht umklassifizieren kann. Live-Scans, Prioritätsauswahl und
Overflow-Schutz verwenden dieselben Lineage-Regeln. Der Start eines neuen
gewöhnlichen Prompts setzt absichtlich jede Benachrichtigung, die bereits in
der Queue ist, auf nicht zugehörig zurück: Diese Ergebnisse wurden vor der
Grenze der neuen Work-Chain eingereiht und können die Klassifikation ihrer
vorherigen Chain nicht erben.

## Session-Lebenszyklus und begrenzte Queues

`/cd` validiert und kanonisiert das Ziel, bevor es das bestehende
Session-Close-Gate erwirbt. Ein scheinbares No-Op erwirbt das Gate ebenfalls
und prüft das aktuelle Verzeichnis erneut, sodass es nicht mit einer
gleichzeitigen Verlegung racen kann; es suspendiert den Guard nicht hart,
außer wenn es zu einem echten Umzug wird. Sobald ein Umzug gegatet ist,
suspendiert er den Guard hart, wartet, bis Vordergrund-, Cron- und
Benachrichtigungs-Turns settled sind, verlegt, aktualisiert den Modellkontext
und gibt das Gate in `finally` frei. Die Prompt-Admission prüft das Gate
sowohl vor als auch nach der Writer-Admission. Der Settle-Loop prüft die
Ownership nach jedem Abschluss erneut, sodass auch ein Prompt einbezogen wird,
der bereits vor dem Gate aufgenommen wurde, während er auf seinen Vorgänger
gewartet hat. Ein Fehlschlag der Verlegung lässt den alten Guard suspendiert
zurück.

`dispose()` bleibt synchron, bricht aber den Vordergrund-Controller mit einem
dedizierten kontrollierten Abbruchgrund ab, suspendiert den Guard hart und
verhindert, dass späte Tool-Ergebnisse ihn wiederbeleben.
Produktions-Close-Pfade behalten die Verantwortung, zu warten, bis die Turns
settled sind.

Beim Laden oder Resumen einer persistierten Session schließen der
History-Replay, die Worktree-Wiederherstellung, die Wiederherstellung
pausierter Agenten und die Goal-Wiederherstellung alle ab, bevor der Rewriter
und der dauerhafte Cron-Scheduler starten. Das verhindert, dass ein sofort
fälliger Cron-Fire mit der Wiederherstellung raced und einen bereits
existierenden pausierten Agenten als neue Arbeit der wieder aufgenommenen
Chain klassifiziert.

Deferred-Cron-Overflow wird nach der Deduplizierung berechnet. Ein eingehendes
zugehöriges Element darf zwanzig nicht zugehörige Elemente behalten; ein
eingehendes nicht zugehöriges Element trimmt zuerst auf neunzehn und wird das
zwanzigste. Zugehörige Einträge werden nie verdrängt, und ein Trim mehrerer
Einträge emittiert eine Diagnose.

Der Fall der Benachrichtigungs-Queue, in dem alle begrenzten Einträge
zugehörig sind, bleibt zurückgestellt. Ein eindeutiges zugehöriges Ergebnis
durch ein anderes zu ersetzen, wäre weiterhin stiller Datenverlust. Ein
Folgedesign muss für jedes ausgelassene zugehörige Ergebnis ein
wiederherstellbares Ergebnis oder einen dauerhaften, für Modell und Benutzer
sichtbaren Lückenhinweis bereitstellen. Diese Arbeit wird in
[#7805](https://github.com/QwenLM/qwen-code/issues/7805) getrackt.
