# GitHub-Benachrichtigungs-Reason-Dispatch

## Ziel

`notification.reason` nutzen, um den Prompt auszuwählen, den der GitHub-Channel
sendet, ohne dessen Polling-, Cursor-Advance-, Retry- oder
Fehlermelde-Verhalten zu ändern.

| Reason              | Verhalten                                                                 |
| ------------------- | ------------------------------------------------------------------------- |
| `mention`           | Nur Inhalte senden, die den Bot tatsächlich erwähnen.                     |
| `review_requested`  | Bei Pull Requests einen Review-Prompt mit Pull-Request-Daten senden.      |
| `assign`            | Einen Triage-Prompt mit Issue-Daten senden.                               |
| `author`, `comment` | Die neuen Kommentare des Zeitfensters in einem Folge-Prompt aggregieren.  |
| Sonstige            | Pro-Kommentar-Behandlung behalten und den Benachrichtigungs-Reason angeben. |

Review- und Assignment-Events nutzen den GitHub-Event-Akteur als
Envelope-Absender, damit die bestehende Absender-Policy die Person prüft, die
die Aktion ausgelöst hat, nicht den Issue- oder Pull-Request-Autor. Die
Aggregation enthält nur erlaubte Absender und ist auf die letzten 20
Kommentare und 400 Zeichen pro Kommentar begrenzt. Die Pairing-Policy behält
den Pro-Kommentar-Dispatch, damit jeder Absender unabhängig autorisiert wird.

Der Cursor merkt sich bis zu 500 Node-Ids dispatchter Kommentare und
Direkt-Events. Ein fester Installationszeit-Floor erlaubt verzögerten Review-
und Assignment-Benachrichtigungen, ihr Event zu finden, ohne die
Vor-Installations-Historie zu replaysen. Benachrichtigungs-Ids werden nicht
persistiert, weil GitHub sie für spätere Aktivität im selben Thread
wiederverwendet.

## Verifizierung

Der fokussierte Adapter-Test deckt jede Route ab: Direkt-Trigger-Metadaten,
Mention-Stripping, Aggregat-Autorisierung sowie Kommentar- und
Direkt-Event-Deduplizierung.
