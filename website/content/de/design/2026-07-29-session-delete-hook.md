# SessionDelete-Hook

## Ziel

Einen User-Hook benachrichtigen, nachdem eine explizit ausgewählte Session
gelöscht wurde.

## Vertrag

- `SessionDelete` läuft, nachdem `SessionService.removeSession` oder
  `removeSessions` gemeldet haben, dass ein Transkript entfernt wurde.
- Der Hook ist Fire-and-forget. Seine Ausgabe und sein Fehlschlag können eine
  abgeschlossene Löschung nicht rückgängig machen oder verzögern.
- Der Payload enthält die normalen Hook-Felder der Hook-Runtime plus
  `deleted_session_id`. Die Hook-Runtime besitzt die Hook-Konfiguration; die
  gelöschte Session kann inaktiv sein und hat keine Live-Hook-Runtime.
- Der interaktive `/delete`-Flow und ACPs explizite
  `deleteSession`-Extension-Methode emittieren das Event. Cleanup, Rollback,
  Archivierung, Schließen und die Daemon-REST-Batch-Löschung tun das nicht.

## Begründung

`SessionEnd` beschreibt den Lebenszyklus einer aktiven Konversation. Endgültige
Löschung ist Speicher-Lebenszyklusarbeit und kann ein inaktives Transkript zum
Ziel haben, daher braucht sie ein separates Event und einen separaten
Identifier. Sie nur nach Erfolg laufen zu lassen, verhindert, dass Hooks
Close-und-Delete-Flows teilweise abgeschlossen zurücklassen.

Die Daemon-REST-Löschung hat keinen `Config`- oder `HookSystem`-Owner in dem
Prozess, der die Transkripte entfernt. Diesen Pfad zu verdrahten würde einen
expliziten Workspace-Hook-Ausführungsvertrag erfordern statt die
In-Memory-Hooks einer gelöschten Session zu rekonstruieren. Das ist bewusst
außerhalb des Scopes dieser Änderung.
