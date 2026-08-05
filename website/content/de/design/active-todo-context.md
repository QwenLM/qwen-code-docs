# Active Todo Context

## Problem

`todo_write` zeigt die aktuelle Liste nur im eigenen Tool-Ergebnis als Reminder an. Nach weiteren Tool-Aufrufen verliert dieser Reminder an Präsenz, und das Modell beendet den Turn möglicherweise mit unfertigen Einträgen. Die persistierte Todo-Datei eignet sich nicht als Live-Steuerungszustand, weil sie die Work-Chain überleben kann, die sie erstellt hat.

## Design

Nach einem erfolgreichen `todo_write` wird ein Reminder, der nur unfertige Einträge enthält, unter einem stabilen Work-Chain-Owner gehalten. Prompt-IDs, die von Retries und zugehörigen automatischen Turns genutzt werden, lösen zu diesem Owner auf, sodass gleichzeitige Benachrichtigungs-Branches den Vordergrund-Reminder nicht verschieben oder überschreiben. Hintergrund-Tasks und Loop-Wakeups erfassen den Owner bei ihrer Erstellung und tragen ihn mit ihrem automatischen Turn zurück; unabhängige Cron- und Benachrichtigungs-Turns nutzen einen isolierten Owner, der entfernt wird, wenn der Turn endet. Der Reminder wird beim ersten Request eines Retries oder zugehörigen automatischen Turns injiziert und nach Function-Responses in späteren Tool-Turns. Er wird geleert, wenn alle Todos abgeschlossen sind, eine neue gewöhnliche Work-Chain startet oder die Session wechselt.

Jede injizierte Kopie wird dauerhaft im Chat-Verlauf aufgezeichnet, daher würde eine Pro-Turn-Injektion den Live-Kontext linear mit den Tool-Turns wachsen lassen. Die Tool-Turn-Injektion gibt den Reminder daher nur jeden dritten Tool-Turn seit der letzten Präsentation des Zustands erneut aus (das `todo_write`-Ergebnis selbst zählt mit); Turn-Start-Injektionen feuern immer und setzen diesen Rhythmus zurück. Das Payload ist eine kompakte `- [status] content`-Zeilenliste, begrenzt auf 800 Zeichen. Der Verlauf bleibt Append-only, sodass Provider-Prefix-Caching nicht beeinträchtigt wird.

Das ändert nichts an der Stopp-Semantik und aktiviert `todoStopGuard` nicht. Der Guard bleibt eine optionale begrenzte Wiederherstellung, nachdem ein Modell bereits versucht hat zu stoppen; diese Änderung erhält stattdessen den Task-Kontext vor dieser Entscheidung.

## Verifikation

- Ein erfolgreicher Write mit unfertigen Einträgen aktualisiert den Session-Reminder.
- Eine abgeschlossene Liste leert ihn.
- Core- und ACP-Tool-Ergebnisnachrichten hängen den Reminder nach Function-Ergebnissen an.
- ACP-Mid-Turn-Nutzereingabe bleibt zuletzt und behält damit Vorrang.
- Ein gewöhnlicher neuer Prompt leert veralteten Zustand, während Retry/Continue ihn behält.
- Unabhängige automatische Turns sind isoliert; zugehörige automatische Turns erben.
- Terminale automatische Turns geben ihren temporären Ownership-Zustand frei.
