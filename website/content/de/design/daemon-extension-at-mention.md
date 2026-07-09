# Daemon @extension Mention Support

## Ziel

Die Daemon WebShell soll das CLI-Verhalten für Extension-Mentions bei aktiven Erweiterungen nachbilden. Nutzer können aktive Erweiterungen über die `@`-Completion entdecken, ein kanonisches `@ext:<name>`-Mention auswählen und der Daemon injiziert den Kontext dieser Erweiterung in den Model-Turn, ohne den sichtbaren Prompt-Text zu verändern.

## Design

- Die WebShell-`@`-Completion kombiniert aktive Extension-Einträge aus dem Workspace-Extension-Status mit bestehenden Workspace-Datei-Treffern. Ein bloßes `@` zeigt zuerst Erweiterungen, `@bro` filtert Erweiterungen und Dateien, und `@ext:` wechselt zur reinen Extension-Completion.
- Die Extension-Completion fügt `@ext:<extension.name> ` ein, sodass der Daemon eine stabile Referenz erhält, die unabhängig vom Anzeigetext ist.
- Der Daemon-Extension-Status enthält ein optionales `description`-Feld, das aus der Konfiguration der installierten Erweiterung befüllt wird. Dieses Feld ist additiv für ältere Clients.
- Die ACP-Session-Prompt-Auflösung durchsucht Text-Prompt-Blöcke nach `@ext:<name>`-Tokens, gleicht nur aktive Erweiterungen aus der Session-Konfiguration ab, dedupliziert wiederholte Mentions und überspringt unbekannte oder inaktive Namen stillschweigend.
- Der für den Nutzer sichtbare Text bleibt exakt erhalten. Der aufgelöste Extension-Kontext wird nach dem Text des Nutzers als zusätzliche Model-Text-Parts angehängt.
- CLI und Daemon teilen sich Extension-Mention-Helper für das Parsen, Bereinigen des Anzeigetexts, Formatieren von Capabilities und Lesen von Kontextdateien mit Subpath- und Size-Guards.

## Grenzen

Das Lesen von Kontextdateien ist pro Datei und durch das aggregierte Extension-Kontext-Budget begrenzt. Dateien außerhalb des installierten Extension-Verzeichnisses werden übersprungen, unlesbare Dateien werden mit Debug-Output übersprungen, und wiederholte Mentions verbrauchen das Budget nur einmal.

## Verifizierung

Gezielte Tests decken die WebShell-Completion-Modi, die Daemon-ACP-Kontext-Injektion, wiederholte und unbekannte Mentions, begrenzte Kontextdateien und die bestehenden CLI-Extension-Mention-Prozessoren ab. Die abschließende Verifizierung führt den Repository-Build und Typecheck aus.