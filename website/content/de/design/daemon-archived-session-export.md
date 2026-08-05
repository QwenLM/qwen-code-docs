# Workspace-qualifizierter Export archivierter Sessions

## Zusammenfassung

Der Daemon kann aktive persistierte Sessions aus einem ausgewählten registrierten
Workspace exportieren, aber archivierte Transkripte bleiben unzugänglich, bis sie
in den aktiven Speicher zurückverschoben werden. Diese Änderung fügt einen
Read-only-Archiv-Export hinzu, ohne das aktive Exportverhalten oder die
Archiv-Zustandsmaschine zu ändern.

Das Protokoll fügt
`GET /workspaces/:workspace/session/:id/archive/export?format=html|md|json|jsonl`,
die bedingungslose `workspace_archived_session_export`-Capability und
`WorkspaceDaemonClient.exportArchivedSession` hinzu. Route und Capability sind
vom aktiven Export getrennt, damit ein älterer Daemon die Archiv-Absicht nicht
ignorieren und ein aktives Transkript mit derselben Id zurückgeben kann.

## Vertrag

Der Selector wird zuerst als exakte registrierte Workspace-Id aufgelöst und
danach als URL-kodierte kanonische absolute cwd. Die ausgewählte Runtime muss
vertrauenswürdig sein; Selector- und Trust-Prüfungen erfolgen vor der Session-
und Formatvalidierung.

Nur `chats/archive/<id>.jsonl` des ausgewählten Workspaces ist zulässig. Die
Route scannt weder den aktiven Speicher noch einen anderen Workspace, fällt
nicht auf Primary zurück, löst keinen live Owner auf, ruft keine Bridge auf,
startet kein ACP, hängt keinen Client an und lädt keine Settings. Nur-aktive
Sessions geben `409 session_not_archived` zurück, fehlende Sessions geben
`404 session_not_found` zurück, gleichzeitige aktive und archivierte Dateien
geben `409 session_conflict` zurück und Übergänge geben `409 session_archiving`
zurück.

## Wiederverwendung und Nebenläufigkeit

`SessionService.loadArchivedSession` ist die einzige neue
Core-Consumer-Oberfläche. Sie delegiert an dieselbe private
Rekonstruktionslogik wie `loadSession`, liest dabei aber den Archiv-Pfad;
bestehende load/resume-Caller bleiben nur-aktiv. Der Daemon verwendet die
bestehenden Export-Collectors, Formatters, Response-Header und den
SDK-Attachment-Parser wieder, sodass archivierte und aktive Exporte identisches
Formatverhalten zeigen. Vor der Rekonstruktion erzwingt der Nur-Archiv-Loader
das bestehende 256-MiB-Limit für die Transkript-Indizierung und gibt darüber
`413 transcript_too_large` zurück. Der aktive Export behält seinen
ausgelieferten No-Cap-Vertrag.

Der Export hält den bestehenden geteilten `SessionArchiveCoordinator`-Lease für
den gesamten Lokalisierungs-Check, die Transkript-Rekonstruktion und den
Formatierungsvorgang. Archive, Unarchive und Delete behalten exklusive Leases,
sodass ein Übergang entweder vor dem Export startet und ihn ablehnt oder erst
startet, nachdem der geteilte Lease freigegeben wurde. Der Coordinator bleibt
über Workspaces hinweg konservativ nach Session-Id keyed.

## Kompatibilität und Verifikation

Die aktive Workspace-Export-Route, die `workspace_session_export`-Capability,
der Legacy-Primary-Export, Archiv-Mutationen und das Persistenz-Layout bleiben
unverändert. Direkte SDK-Caller erhalten den normalen HTTP-Fehler, wenn die
neue Methode auf einen älteren Daemon abzielt.

Tests decken Capability-Advertising, Id- und cwd-Selectors, alle Formate,
Attachment-Metadaten, aktive/fehlende/Konflikt-/Übergangszustände,
Trust-Vorrang, Workspace-Isolation bei gleicher Id, das Ausbleiben von
Bridge-Aktivität, beide Lock-Richtungen, die Core-Archiv-Rekonstruktion,
Telemetrie-Zuordnung und den nativen REST-SDK-Transport ab. Größen-Tests
akzeptieren das exakte Archiv-Limit und lehnen eine Sparse-Datei ein Byte
darüber ab, bevor das Transkript materialisiert wird.
