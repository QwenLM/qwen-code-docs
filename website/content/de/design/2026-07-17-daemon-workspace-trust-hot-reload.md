# Daemon Workspace Trust Hot Reload

## Status

Implementiert für QwenLM/qwen-code#6378.

## Problem

Der Daemon evaluiert Workspace-Trust derzeit beim Aufbau einer
`WorkspaceRuntime`. `GET /workspace/trust` meldet diesen Snapshot, und
`POST /workspace/trust/request` publiziert lediglich `trust_change_requested`.
Das Ändern von `trustedFolders.json`, des IDE-Trust oder der
Benutzer-/System-Ordner-Trust-Einstellungen baut die Runtime nicht neu, sodass
Einstellungen, Umgebung, Dateisystem, ACP-Sessions, MCP, Extensions,
Channel-Worker und geplante Arbeit bis zu einem Daemon-Neustart auf der alten
Trust-Grenze verbleiben.

Trust kann nicht in-place aktualisiert werden. Die Dateisystem-Factory, die
Bridge, Einstellungen, Umgebung, der ACP-Mount und mehrere workspace-scoped
Manager erfassen ihre Runtime-Eingaben während der Konstruktion.

## Sicherheitsinvarianten

1. Eine Trust-Verringerung schließt den betroffenen Runtime-Generation-Guard
   vor dem ersten asynchronen Drain-Schritt. Ab diesem Punkt darf kein neuer
   privilegierter Seiteneffekt beginnen.
2. Ein geschlossener Generation-Guard wird niemals wieder geöffnet. Ein Ersatz
   erhält einen neuen Guard und eine monoton steigende Generations-Id.
3. Ein fehlgeschlagener Revoke stellt niemals die zuvor vertrauenswürdige
   Runtime wieder her.
4. Fehlerhafte oder unlesbare System-/Benutzereinstellungen schlagen
   fail-closed fehl. Eine fehlerhafte oder unlesbare Trusted-Folders-Datei
   schlägt fail-closed fehl, wenn Datei-Trust benötigt wird, ist aber
   irrelevant, wenn Ordner-Trust deaktiviert ist oder der IDE-Trust den
   primären Workspace bereits aufgelöst hat.
5. Transitionierende, blockierte und stale Session-Owner fallen niemals auf
   die primäre Runtime zurück.
6. Jeder Runtime-Aktivierungspfad validiert die Policy-Revision unmittelbar
   vor der Publikation.

## Trust-Policy

Der Daemon verwendet einen seiteneffektfreien Policy-Loader, der nur
System-Overrides, Benutzereinstellungen, System-Defaults, IDE-Trust und
`trustedFolders.json` liest. Workspace-Einstellungen und
Projekt-Umgebungsdateien sind von der Policy-Evaluierung ausgeschlossen. Die
bestehende Präzedenz der Trust-Regeln und das Pfad-Vergleichsverhalten bleiben
erhalten.

Der Loader erzeugt einen unveränderlichen semantischen Snapshot. Ein Workspace
materialisiert diesen Snapshot in einen operativen Trust-Boolean und eine
Liste erlaubter Roots. Nur eine Änderung der Materialisierung baut eine
Runtime neu. Reine Quellen-Änderungen erhöhen die angewandte Policy-Revision
ohne Rebuild.

Das primäre Dateisystem behält das bestehende
Trusted-IDE-Multi-Root-Verhalten. Wenn ein sekundärer Root aus der primären
Allowed-Root-Liste entfernt wird, werden sowohl die sekundäre als auch die
primäre Generation geschlossen, bevor eine von beiden drained wird.

Der Monitor liest die Policy-Eingaben einmal pro Sekunde neu und publiziert
nur, wenn sich ihr semantischer Hash ändert. IDE- und Same-Process-Schreibzugriffe
auf Trusted-Folders lösen ebenfalls ein sofortiges Lesen aus.
`/workspace/reload` und die dynamische Workspace-Registrierung fordern
explizit eine Reconciliation an.

Schreibzugriffe auf Trusted-Folders akquirieren `proper-lockfile`, lesen unter
dem Lock neu, erhalten Kommentare und ersetzen eine reguläre 0600-Datei atomar,
ohne Symlinks zu folgen. Eine fehlerhafte Datei wird nicht stillschweigend
umgeschrieben.

## Runtime-Ownership

Die Registry besitzt stabile `WorkspaceEntry`-Objekte. Ein aktiver Entry
verweist auf eine unveränderliche `RuntimeGeneration`, die die Runtime und
ihren Generation-Guard besitzt. Workspace-Identität, persistente
Registrierungsmetadaten und der angewandte Policy-Zustand liegen auf dem
Entry, nicht auf der Generation. Konstruktion und Cleanup der Runtime bleiben
vom Daemon-Host koordiniert.

Workspace-qualifizierte Data-Plane-Routen lösen ihre Runtime zur Anfragezeit
auf. Primäre Routen, die prozessweite Pfade behalten, verwenden Live-Delegates
für die aktuelle Runtime. Privilegierte REST-Mutationen erfassen den
Generation-Guard und prüfen ihn an ihrer Commit-Grenze erneut. ACP, Voice,
Channel-Worker und Session-Aufnahme verwenden ihre bestehenden
Drain-Mechanismen. Der Trust-Status und das Daemon-Inventar lesen stabile
Entries, ohne eine Runtime zu akquirieren.

Der Session-Owner-Index ist generation-aware. Session-Erstellung und
-Wiederherstellung registrieren Ownership explizit, und ein Runtime-Ersatz
invalidiert alte Ownership. Der bestehende Active-Bridge-Scan bleibt als
Kompatibilitäts-Reparaturpfad für Sessions, die vor der Indizierung liegen.

Das Runtime-Cleanup fährt die Bridge und Kind-Channels, den Voice-Zustand,
Sub-Sessions, ACP-Mounts, Channel-Worker, geplante Keepalives und den
Git-Zustand herunter. Manager, die der Ersatz-Runtime gehören, werden mit
frischen Einstellungs-, Umgebungs-, Dateisystem-, Trust-, Policy- und
Cache-Eingaben neu aufgebaut. Geteilte Pfad-Locks und Prozess-Telemetrie
überleben den Ersatz, da sie keine Workspace-Fähigkeit tragen.

## Reconciliation

Trust-Reconciliation und Runtime-Publikation teilen sich ein
Daemon-Topologie-Gate; Workspace-Add und -Reload fordern nach ihrer eigenen
Operation eine Reconciliation über dieses Gate an. Trust-Snapshots werden
zusammengeführt, sodass die zuletzt beobachtete Revision angewendet wird,
bevor der Aufrufer freigegeben wird. Das Shutdown stoppt den Monitor und
wartet auf das Topologie-Gate, bevor es seinen Cleanup-Snapshot nimmt.

Bei einer Trust-Verringerung schließt der Controller synchron jede betroffene
Generation vor dem ersten asynchronen Drain, schließt Aufnahmepfade, entsorgt
die alte Runtime, baut eine frische Runtime, prüft die Policy-Revision erneut
und installiert die neue Entry-Generation und den ACP-Mount. Bestehende
Bridge- und ACP-Shutdown-Pfade bieten begrenztes oder erzwungenes Cleanup. Ein
stale Kandidat wird entsorgt und neu aufgebaut.

Ein Grant verwendet denselben destruktiven Ersatz. Schlägt er fehl, versucht
der Controller eine neue nicht vertrauenswürdige Runtime und meldet die
konfigurierte Revision als fehlgeschlagen, bis eine spätere Reconciliation
erfolgreich ist. Wenn die Runtime-Eindämmung nicht bestätigt werden kann,
bleibt der Entry blockiert und der Deep-Health-Zustand ist degradiert; andere
Workspaces bleiben verfügbar.

## Protokoll

Der request-only Endpoint bleibt request-only. Der Trust-Status v1 bleibt die
Standard-Kompatibilitätsansicht. Clients fordern v2 mit `statusVersion=2` an;
alte Server dürfen v1 zurückgeben. V2 trennt die konfigurierte Policy vom
effektiven Runtime-Zustand und meldet `stable`, `applying` oder `failed`, eine
opake Revision und einen stabilen Fehlercode. Der Daemon bewirbt
`workspace_trust_hot_reload` erst, nachdem das primäre und sekundäre Routing
generation-aware Auflösung verwenden.

Es wird kein zuverlässiger Applied-Event-Bus eingeführt. Der GET-Status ist
die Source of Truth. Eine Trust-Änderungsanfrage benötigt eine aktive
Generation, um das bestehende Event zu publizieren; andernfalls liefert sie
ein retryable 503 zurück.

## Non-Goals

- Direkte Remote-Trust-Genehmigung.
- Zero-Downtime-Doppel-Runtimes oder Session-Migration.
- Öffentliche Generations-Bezeichner.
- Parallele Runtime-Rebuilds.
- Rebuild der kompletten Express-Anwendung.
- Änderung der Trust-Semantik der Standalone-CLI.
