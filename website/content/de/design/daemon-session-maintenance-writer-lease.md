# Daemon Session Maintenance Writer Lease

## Problem

Der Daemon kann ein persistiertes Transkript löschen, archivieren oder
unarchivieren, nachdem sein In-Prozess-ACP-Owner geschlossen hat. Ein anderer
Daemon-Prozess kann weiterhin Owner desselben Transkripts sein, daher
verhindert der In-Prozess-Archive-Coordinator allein nicht, dass der Daemon
gegen einen externen Writer raced.

Der Transkript-Pfad und der Writer-Lock-Pfad müssen außerdem aus derselben
Workspace-Runtime aufgelöst werden. Ein Fallback auf die primäre
Daemon-Runtime kann einen Workspace mutieren, während ein Lock in einem
anderen geprüft wird.

## Scope

Diese Änderung deckt Maintenance durch den Daemon ab:

- REST- und ACP-Anfragen für Delete, Archive und Unarchive
- Disconnect- und Orphan-Cleanup
- Rollback geplanter Tasks und Keepalive-Cleanup
- Daemon-Shutdown, während Maintenance bereits läuft

Sie fügt kein Lease-Ablauf, keine Heartbeats, keine hostname-basierte
Wiederherstellung, kein automatisches Steal, kein Force-Unlock und keine
Lock-Schema-Migration hinzu. Writer, die nicht am Lease-Protokoll teilnehmen,
erfordern weiterhin ein plattformseitiges Single-Writer-Fencing.

## Storage-Bindung der Runtime

Jede `WorkspaceRuntime` löst bei ihrer Erstellung ein absolutes
Session-Runtime-Basisverzeichnis auf. Die Auflösung behält die bestehende
Priorität:

1. `QWEN_RUNTIME_DIR`
2. `advanced.runtimeOutputDir`, relativ zum Workspace aufgelöst
3. das normale Qwen-Runtime-Verzeichnis

Das aufgelöste Verzeichnis wird auf der Runtime gespeichert und als
`QWEN_RUNTIME_DIR` in jedes verwaltete ACP-Kind injiziert. Ein Reload der
Umgebung darf andere Werte aktualisieren, behält aber diesen gepinnten Wert,
weil eine Änderung von `runtimeOutputDir` einen Neustart der Runtime
erfordert.

Daemon-Elternoperationen, die Sessions auflisten, lesen, exportieren,
organisieren oder warten, laufen im Storage-Kontext der ausgewählten Runtime.
Fehler bei der Runtime-Auflösung fallen nicht auf die primäre Runtime zurück.

## Lease-API

`SessionService.acquireSessionWriterLease()` leitet sowohl die
Writer-Lock-Wurzel als auch den aktiven Transkript-Pfad von der festen
`Storage`-Instanz des Service ab. Caller liefern nur Session-ID, Prozessart,
Version und Reclaim-Policy. Ungültige Session-IDs werden abgelehnt, bevor das
Lock-Verzeichnis angerührt wird.

Die Daemon-Maintenance verwendet immer `processKind: 'daemon'` und
`reclaimPolicy: 'never'`. Das bestehende Lock-Schema, der Schlüssel, der
Owner-Record und das Acquire/Release-Protokoll bleiben unverändert.

## Maintenance-Protokoll

Jede Session wird unabhängig verarbeitet:

1. Betritt den exklusiven Pro-Session-Archive-Coordinator des Daemons.
2. Schließt den lokalen Owner. Archive erfordert ein Agent-Close; Delete
   verwendet das normale Fast-Close. Ein fehlender lokaler Owner ist erlaubt.
3. Klassifiziert den persistierten Zustand und bewahrt bestehende Not-found-
   und idempotente Ergebnisse, ohne ein Lock zu erzeugen.
4. Erwirbt den Daemon-Writer-Lease.
5. Klassifiziert erneut, während der Lease gehalten wird.
6. Verifiziert Ownership und den Transkript-Fingerprint und führt dann genau
   eine Mutation aus.
7. Gibt den Lease mit Owner-Token-Verifizierung frei.

Batch-Anfragen dürfen unabhängige Sessions parallel verarbeiten, aber ein
Worker hält höchstens einen Cross-Prozess-Lease und wartet nie, während er
mehrere Leases hält.

Eine fehlgeschlagene Mutation bleibt der gemeldete Fehler, wenn die Freigabe
gelingt. Ein Fehler bei Freigabe oder Ownership ist der extern sichere Fehler,
selbst wenn die Mutation ebenfalls fehlschlug. Logs zeichnen Workspace,
Session, Aktion, Fehlerart und ob die Transkript-Mutation den Datenträger
erreicht hat auf; sie enthalten nie Owner-Tokens oder Lock-Pfade. Die
Reconciliation geplanter Tasks folgt der tatsächlichen Transkript-Mutation,
nicht ob die anschließende Lease-Freigabe gelang.

Das Orphan-Cleanup schließt zuerst den lokalen Owner und respektiert
`requireZeroAttaches`. Ein neu angehängter Owner verhindert daher das
Löschen. Das Late-Spawn-Cleanup wartet auf das Close, bevor es den Lease
erwirbt und das Transkript löscht.

## Shutdown

`SessionArchiveCoordinator.sealMaintenanceAndWait()` lehnt synchron neue
exklusive Maintenance ab und wartet auf bereits zugelassene exklusive
Operationen. Geteilte Transkript-Lesevorgänge sind nicht eingeschlossen,
damit ein langer Export nicht das Terminations-Budget verbraucht. REST gibt
`503 daemon_draining` zurück; ACP gibt einen JSON-RPC-Serverfehler mit
`data.errorKind = daemon_draining` zurück.

Der Daemon-Shutdown versiegelt die Maintenance vor dem Child-/Prozess-Teardown
und schließt erst ab, nachdem die zugelassenen Maintenance-Leases freigegeben
wurden.

## Kompatibilität und Rollout

Die Formen der Batch-Responses und die bestehende
Archive-/Delete-/Unarchive-Idempotenz bleiben unverändert. Lokale
`session_archiving`-Konflikte aus dem Pre-Check (von `assertNotTransitioning`
vor der Admission ausgelöst) erscheinen weiterhin als `409` auf
Request-Ebene. Konflikte, die innerhalb des Admission-Gates ausgelöst werden,
werden pro Session im `200`-Response-Body (`errors[]`) gemeldet, gleichermaßen
für Archive, Unarchive und Delete. Mixed-Version-Writer sind unsicher, daher
müssen Deployment und Rollback den alten Daemon und verwaltete ACP-Prozesse
drainen, bevor die neue Version gestartet wird.

## Verifikation

Tests verwenden echte temporäre Runtime-Roots für Writer-Contention und
Root-Isolation, decken Zustandsänderungen zwischen der initialen und der
gelockten Klassifikation ab und verifizieren Close, Mutation, Freigabe,
Reconciliation geplanter Tasks und Shutdown-Reihenfolge. Unit-Tests decken
zusätzlich ungültige IDs, doppelte IDs, Aktiv-/Archiv-Konflikte,
fehlgeschlagene Lease-Freigaben, Orphan-Reattachment und Log-Redaction ab.
Relevante Paket-Tests, Build und Typecheck sind vor dem Merge erforderlich.
