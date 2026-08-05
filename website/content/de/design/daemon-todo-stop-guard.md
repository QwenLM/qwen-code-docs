# Daemon Todo Stop Guard

## Problem

Daemon- und ACP-Clients können eine Session am Leben erhalten, nachdem ein
Modell-Turn geendet hat. Wenn das Modell gerade eine unfertige Top-Level-Todo-Liste
geschrieben hat, kann ein natürlicher Modell-Stopp die Daemon-Anfrage unvollständig
lassen, obwohl die Session genug vertrauenswürdigen Zustand hat, um fortzufahren.
Der Client hat derzeit keine begrenzte, eingebaute Möglichkeit, diesen Fall von
einem gewöhnlich abgeschlossenen Turn zu unterscheiden.

Dieses Design fügt einen Opt-in-Stop-Guard nur für den Daemon hinzu. Er ändert
bewusst weder das TUI noch das Core-Todo-Tool noch die allgemeine Agent-Schleife.

## Konfiguration und Sicherheitsgrenze

`experimental.todoStopGuard` ist standardmäßig `false`, erfordert einen Neustart
und wird nicht im TUI-Einstellungsdialog angezeigt. Der Guard wird im Safe-Modus,
Bare-Modus und im Approval-`plan`-Modus zwangsweise deaktiviert. `disableAllHooks`
deaktiviert den eingebauten Guard nicht, da er kein externer Hook ist.

Jede ununterbrochene automatische Fortsetzungsstufe darf höchstens zwei
zusätzliche Primärmodell-Streams erzeugen. Eine Mid-Turn-Nutzernachricht beginnt
explizit eine neue Zwei-Versuchs-Stufe, da sie neue Nutzereingabe ist, während
Retry/Continue und Hintergrund-Ergebnisse das Budget der aktuellen Stufe
behalten. Bestehende Berechtigungsprüfungen, Abbruch, Token-Limits, Loop-Schutz,
ACP-Grace-Perioden und Daemon-Ressourcenlimits bleiben maßgeblich. Insbesondere
impliziert ein getrennter Client niemals eine Genehmigung von Berechtigungen.

## Vertrauenswürdiger Zustand

Die CLI-`Session` besitzt eine kleine In-Memory-Zustandsmaschine
`DaemonTodoStopGuard`. Sie speichert, ob der aktuelle Work-Chain scharfgeschaltet
ist, die letzte Anzahl unfertiger Einträge, committete Fortsetzungsversuche, den
Suspendierungs-/Queued-Prompt-Zustand und ob die Erschöpfung bereits gemeldet
wurde. Die Session fertigt zu Beginn eines Work-Chains separat einen Snapshot der
IDs von Hintergrund-Agents, Shells, Monitoren und Wakeups an, einschließlich
Terminal-Benachrichtigungen und Wakeups, die an dieser Grenze bereits queued sind.

Nur ein erfolgreiches Top-Level-Ergebnis von `TodoWriteTool.execute()` mit dem
strukturierten `{ type: 'todo_list', todos: [...] }`-Envelope kann den Guard
scharfschalten. Die Beobachtung erfolgt nach der Tool-Ausführung und
Statusberechnung, vor den `PostToolUse`-Hooks der Session. Argumente,
History-Replays, Disk-Zustand, fehlgeschlagene oder doppelte Tool-Aufrufe,
Subagent-Todo-Listen und entdeckte Tools, die den Wire-Namen `todo_write`
überschatten, sind nicht vertrauenswürdig. Das neueste erfolgreiche Ergebnis
ersetzt den Zähler; eine leere oder vollständig abgeschlossene Liste entschärft
den Guard sofort. Das Entschärfen verhindert eine weitere
natürliche-Stopp-Fortsetzung; es schneidet keine Tool-Schleife ab, die bereits
von einem committeten Guard-Stream geöffnet wurde.

Ein neuer gewöhnlicher Nutzer-Prompt startet einen unscharfen Work-Chain und
setzt dessen Hintergrund-Baseline zurück. Er kann keine Aktivierung von einer
früheren Anfrage erben, selbst wenn der Todo-Zustand im Speicher verbleibt.
Vertrauenswürdiger Retry/Continue behält den Work-Chain nur, solange
vertrauenswürdiger unfertiger Guard-Zustand noch existiert; nach einem
trust-löschenden Lebenszyklus-Ereignis startet er mit einer neuen
Hintergrund-Baseline und muss erneut scharfschalten. Eine Mid-Turn-Nutzernachricht
behält ihre Aktivierung und beginnt eine neue Zwei-Versuchs-Stufe. Das bedeutet,
die harte Grenze sind zwei aufeinanderfolgende automatische Streams ohne neue
Nutzereingabe, nicht zwei Streams über die gesamte Lebensdauer eines Work-Chains.
Cron- und Benachrichtigungs-Turns können ihren eigenen Chain durch einen
erfolgreichen Top-Level-Todo-Write etablieren; wenn sie Hintergrund-Ergebnisse
für einen scharfgeschalteten Chain verarbeiten, behalten sie das Budget dieses
Chains. Ein zugehöriges Hintergrund-Ergebnis ist ebenfalls eine vertrauenswürdige
Fortsetzung, die eine API-/Netzwerk-Retry-Pause löscht, ohne eine harte
Suspendierung zu löschen.

Der Guard wird nicht persistiert. Rewind und History-Wiederherstellung löschen
das Trust, ebenso Branch/Fork, ein erfolgreicher Wechsel des Arbeitsverzeichnisses,
eine neue Session, Disk-Wiederherstellung sowie ein Neustart von Daemon oder
Agent. Ein Live-Client-Attach an dieselbe Session behält den In-Memory-Zustand;
ein Wechsel des Modells oder eines Nicht-Plan-Genehmigungsmodus startet für sich
genommen keinen neuen Work-Chain. Eine Lebenszyklus-Invalidierung blockiert
außerdem, dass späte Tool-Ergebnisse des ersetzten Live-Turns den Guard erneut
scharfschalten; der nächste unabhängige Prompt oder automatische Turn etabliert
eine neue Grenze. Zurückgestellte automatische Queues werden freigegeben, sobald
ein invalidierter Vordergrund-Prompt das Settlement erreicht, auch wenn dieser
Prompt über einen Fehlerpfad endet.

## Stopp-Reihenfolge

Der Guard nimmt nur bei einem natürlichen Modell-Stopp teil. Wenn er aktiv ist,
wendet die Session diese Reihenfolge an:

1. Draine Mid-Turn-Nutzernachrichten. Falls welche existieren, überspringe
   Stop-Hooks und den Guard, setze das Guard-Budget zurück und führe die
   Nutzer-Fortsetzung in der aktuellen Schleife aus.
2. Falls die Daemon-FIFO einen vollständigen, nicht abgebrochenen Prompt
   enthält, beende die aktuelle Anfrage und markiere den alten Chain als auf
   diesen Prompt wartend. Eine abgebrochene gequeute Anfrage kann später nicht
   dazu führen, dass Hintergrundaktivität den alten Chain wiederbelebt. Wenn der
   letzte gequeute Prompt abgebrochen wird, weist die Bridge die Live-Session
   explizit an, den wartenden Guard zu beenden und nicht zugehörige automatische
   Queues freizugeben. Falls ein Drain sowohl eine Mid-Turn-Nachricht als auch
   einen gequeuten vollen Prompt beobachtet, läuft die Mid-Turn-Nachricht zuerst
   und die FIFO-Priorität bleibt in Kraft, selbst wenn diese Fortsetzung die
   Todo-Liste vervollständigt oder den Guard hart stoppt.
3. Evaluiere bei Vordergrund-Turns bestehende externe Stop-Hooks mit ihren
   bestehenden Caps und Fehlersemantiken.
4. Evaluiere den Guard nur, wenn er scharfgeschaltet ist, nicht suspendiert oder
   auf einen gequeuten Prompt wartend, unfertige Einträge hat, außerhalb von
   Approval-`plan` liegt und keinen relevanten Hintergrund-Input hat.
5. Falls sowohl ein externer Hook als auch der Guard denselben Stopp blockieren,
   kombiniere ihre Begründungen zu einem Fortsetzungs-Modellaufruf. Ihre Zähler
   bleiben unabhängig.

Relevanter Hintergrund-Input ist ein noch lebender Hintergrund-Agent, Shell,
Monitor oder `@wakeup`, dessen ID nicht in der Work-Chain-Baseline war, plus
gequeute Benachrichtigungen oder Wakeups mit derselben Zugehörigkeit.
Hintergrundarbeit und gewöhnliche Cron-Jobs, die von einer älteren Anfrage geerbt
wurden, blockieren eine neue Anfrage nicht. Automatische Cron-/Benachrichtigungs-Turns
führen nur den eingebauten Guard aus; sie führen keine externen Stop-Hook-Aufrufe
ein. Ein zugehöriges Ergebnis behält das aktuelle Budget, während eine
Benachrichtigung über eine alte Aufgabe oder ein gewöhnlicher Cron-Turn verzögert
wird, bis der aktive Chain nicht mehr fortgesetzt werden kann, und dann einen
unabhängigen, unscharfen Chain startet. Zurückgestellte, nicht zugehörige
wiederkehrende Cron-Fires werden pro Task zusammengeführt und begrenzt, sodass
eine festgefahrene Hintergrund-Abhängigkeit die Queue nicht unbegrenzt wachsen
lassen kann. Daemon-Folgeempfehlungen werden ebenfalls unterdrückt, solange ein
Guard-Chain noch fortsetzen kann oder ein vollständiger FIFO-Prompt Priorität
hat, damit unfertige Arbeit keinen konkurrierenden Suggestion-Modellaufruf
auslöst.

Harte Beendigungspfade suspendieren den aktuellen Work-Chain: Abbruch durch
Nutzer oder Berechtigung, `PostToolUse.shouldStop`, Loop- oder
Wiederholungsaufruf-Schutz, Token-Limits und der externe Stop-Hook-Cap. API- und
Netzwerkfehler bewahren den Zustand für einen expliziten vertrauenswürdigen
Retry/Continue.

## Fortsetzungen und Observability

Die erste Guard-Fortsetzung sendet:

> [Todo Stop Guard] N todo item(s) are still pending or in progress. Continue executing the current task now. Do not ask the user whether to continue. If progress requires user input, use the structured question or permission flow. If progress depends on external state, report the blocker explicitly.

Die zweite sendet zusätzlich:

> This is the final automatic continuation. Before ending, either complete/update the todos or report the completed progress and the exact blocker.

Der Zähler wird erst committet, nachdem `responseStream` erfolgreich
zurückgegeben wurde. Abbruch, Compaction-Fehler oder Token-Ablehnung vor diesem
Punkt verbrauchen keinen Versuch; ein späterer Stream-Fehler hingegen schon.
Freitext-Blocker-Text wird nicht geparst. Ein Compaction-Fehler suspendiert
diesen Guard-Chain, sodass er keine automatischen Queues hinter einem
unerreichbaren Retry blockiert lassen kann; wenn ein externer Stop-Hook
zusammengeführt wurde, kann seine Begründung weiterhin unter der bestehenden
Semantik des Hooks fortsetzen. Das Budget zählt jeden dem Guard zurechenbaren
Primärmodell-Stream, einschließlich eines Folgeaufrufs, der Tool-Ergebnisse des
vorangegangenen Guard-Streams sendet. Falls der zweite Stream weitere
Tool-Aufrufe zurückgibt, führt die Session sie aus und bewahrt ihre Ergebnisse,
öffnet aber keinen dritten dem Guard zurechenbaren Stream. Falls der erste Stream
alle Todos über einen Tool-Aufruf abschließt, darf der verbleibende Versuch das
Tool-Ergebnis ohne einen weiteren Unfertig-Todo-Prompt senden, damit das Modell
seine Antwort beenden kann. Mid-Turn-Input sponsert stattdessen diesen
Tool-Ergebnis-Versand und hat Priorität, ohne den verbleibenden Guard-Versuch zu
verbrauchen. Wenn dieser Stream mit einem externen Stop-Hook zusammengeführt
wurde, darf die bestehende Tool-Schleife des Hooks diese Ergebnisse weiterhin
ohne einen weiteren Guard-Prompt oder Guard-Versuch senden; das Aktivieren des
Guards darf eine externe Hook-Fortsetzung nicht abschneiden.

Jede committete Fortsetzung emittiert einen replaybaren diskreten
`agent_message_chunk` mit `_meta.source = 'todo_stop_guard'` sowie Versuch,
maximaler Versuchszahl und Unfertig-Zähler. Erschöpfung emittiert ähnlich:

> [Todo Stop Guard] Automatic continuation stopped after 2 attempts; N todo item(s) remain unfinished.

Todo-Text wird niemals in die Guard-Telemetrie aufgenommen. Normale
Nutzungsmetadaten erfassen die zusätzlichen Aufrufe weiterhin. Replay-Compaction
bewahrt Guard-Events, die sowohl `qwenDiscreteMessage` als auch die Guard-Quelle
tragen, unabhängig auf, sodass sie Versuche weder zusammenführt noch ihre
Pro-Versuch-Metadaten verwirft, nachdem der Live-Event-Ring übergelaufen ist.

## Bridge-Kompatibilität

`craft/drainMidTurnQueue` fügt das optionale `hasQueuedPrompt` hinzu. Die Bridge
setzt es nur, wenn ihre Pending-Prompt-Liste einen vollständigen Eintrag enthält,
dessen Zustand `queued` ist und dessen Abbruchsignal nicht abgebrochen hat.
Ältere Desktop-/Channel-Clients dürfen das Feld weglassen; die Session behandelt
das Fehlen als `false`. Falls der Drain einen Timeout erreicht, dürfen späte
Antworten Nachrichteninhalte wiederherstellen, aber ihr Queued-Prompt-Snapshot
wird verworfen, da er bereits veraltet sein kann.

Das REST/SSE-Trennverhalten und der Event-Ring bleiben unverändert. ACP HTTP
behält seine bestehende Zehn-Sekunden-Grace-Periode und seinen Replay-Pfad;
Grace-Ablauf und explizites Close/Cancel behalten ihr aktuelles
Beendigungsverhalten.

## Verifizierung

Unit-Tests decken strikte Aktivierung, Lebenszyklus-Resets, Suspendierung,
Budget- und Stream-Commit-Semantik, Bridge-Queue-Meldung, Konfigurations-Gates,
Stop-Hook-Zusammenführung und Beendigungspfade ab. Concurrency-Tests decken
Prompt-FIFO-Priorität, späte Drain-Wiederherstellung, Hintergrund-Baseline-Isolation
und automatische Turns ab. Daemon-E2E-Tests decken Prompt-Admission ohne
SSE-Subscriber und späteres Ring-Replay der begrenzten Versuche ab. Bestehende
ACP-Transport-Regressionen decken Reconnect innerhalb des Grace-Fensters,
Grace-Ablauf und Berechtigungs-Round-Trips ab; der manuelle E2E-Plan übt diese
Pfade auch mit scharfgeschaltetem Guard. Wenn die Einstellung deaktiviert ist,
müssen bestehendes Stop-Hook-, Cron-, Benachrichtigungs- und Prompt-Verhalten
unverändert bleiben.
