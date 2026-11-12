# Session-Übersicht

Verwende die Session-Übersicht in WebShell, um Sessions zu durchsuchen, zu einer
Konversation zurückzukehren und Session-Titel und -Archive zu verwalten.

## Sessions finden und öffnen

Öffne **More → Session-Übersicht**. Suche nach Session-Titel, Session-ID, Git-Branch
oder verknüpfter Pull-Request-Nummer, wie `#123`. Verwende die Statusfilter, um die
Liste einzugrenzen. Wenn mehrere Workspaces verfügbar sind, kannst du mit dem
Workspace-Filter auswählen, welche einbezogen werden sollen. Wähle **Refresh**, um
den Katalog neu zu laden.

Klicke auf eine Session-Zeile, um diese Konversation zu öffnen. Verwende die
Zeilen-Checkboxen, um Sessions für die Footer-Aktionen auszuwählen; die
Paginierungs-Steuerungen ändern die sichtbare Seite und die Anzahl der Zeilen.

## Eine Session umbenennen

Wähle die Bleistift-Aktion der Zeile, wenn sie verfügbar ist, und bearbeite dann
den Titel. Drücke **Enter** zum Speichern oder **Escape** zum Abbrechen. Wenn der
Editor den Fokus verliert, wird die unfertige Umbenennung abgebrochen statt
gespeichert.

## Sessions archivieren

Wähle Sessions mit ihren Zeilen-Checkboxen aus und wähle dann **Archive** im
Footer. Die Aktion ist nur aktiviert, wenn jede ausgewählte Session inaktiv ist
und Archivierung unterstützt. Bestätige im Dialog die Archivierung oder wähle
**Cancel**, um die Sessions aktiv zu lassen.

Wenn ein Umbenennungs-Editor noch den Fokus hat, wenn du **Archive** klickst,
wird sein unfertiger Entwurf abgebrochen und die Archivierungs-Bestätigung öffnet
sich. Das Eingeben oder Abbrechen einer Umbenennung lässt die Footer-Steuerungen
an Ort und Stelle, sodass Klicks in der Nähe eines Button-Rands immer noch diesen
Button erreichen.
