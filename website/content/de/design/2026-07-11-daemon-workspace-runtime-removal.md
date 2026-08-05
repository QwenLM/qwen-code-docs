# Daemon Workspace Runtime Removal

## Kontext

Die Runtime-Workspace-Registrierung und die persistente Registrierung sind bereits verfügbar, aber das Vergessen einer persistenten Registrierung entlädt weder die aktive Bridge noch den ACP-Mount, den Session-Aufnahme-Zustand oder die Memory-Lane. Dieses Design fügt ein synchrones Hot Removal für sekundäre Runtimes hinzu und behält dabei die bestehende Registration-Forget-API bei.

## Umfang und Invarianten

- Nur dynamisch registrierte und aus der Persistenz wiederhergestellte sekundäre Runtimes sind entfernbar. Der primäre Workspace und jede `--workspace`-Runtime sind statisch.
- `DELETE /workspaces/:workspace` entfernt die Runtime und alle bekannten persistenten Aliase. Es entfernt niemals Workspace-Dateien, Einstellungen, Transkripte, Archive oder andere Projektdaten.
- Eine Entfernung ohne Force ist beobachtend: Wenn die eingefrorene Runtime Aktivität aufweist, wird jedes Gate zurückgerollt und die Anfrage liefert `409 workspace_busy` zurück. Eine Force-Entfernung beendet diese Aktivität.
- Die Persistenz wird vor dem destruktiven Cleanup committed. Ein Store-Fehler stellt die aktive Runtime wieder her. Cleanup-Fehler nach dem Store-Commit können die Operation nicht mehr zurückrollen und verwenden das synchrone Beenden der Bridge als Fallback.
- Ein entfernter cwd bleibt reserviert, bis das Cleanup abgeschlossen ist, und kann danach mit einer frischen Bridge, einem frischen ACP-Dispatcher, einer frischen Verbindungs-Registry und einer frischen Memory-Lane erneut registriert werden.

## Protokoll

Produktions-Daemons bewerben `workspace_runtime_removal`, wenn der Removal-Controller installiert ist. Die Workspace-Zeilen der Capabilities erhalten ein optionales `removable`; alte Clients und Daemons bleiben kompatibel.

`DELETE /workspaces/:workspace` verwendet den bestehenden Selektor aus Workspace-Id oder kanonischem cwd und akzeptiert einen optionalen JSON-Body mit dem booleschen `force`. Bei Erfolg werden die entfernte Identität, ob Force angefragt wurde, ob ein persistenter Alias entfernt wurde und der abschließende Aktivitäts-Snapshot nach dem Drain zurückgegeben. Eine Anfrage ohne Force, die bereits beobachtbar ausgelastet ist, darf einen früheren Pre-Drain-Snapshot zurückgeben, ohne die Runtime kurz zu gaten. Das bestehende `DELETE /workspace-registrations/:id` bleibt reine Forget-Operation.

## Lifecycle

Die Registry verfolgt aktive, drainende und entfernte Runtimes. Die öffentliche Auflösung sieht nur aktive Runtimes; die Verwaltungsauflösung behält drainende Runtimes für Konfliktberichte und cwd-Reservierung bei.

Die Entfernung nimmt zuerst einen schnellen Aktivitäts-Snapshot. Danach markiert sie die Registry synchron als drainend, schließt die workspace-bezogene Session-Aufnahme und drainet den ACP-Mount und die Memory-Lane. Der abschließende Snapshot liest ausstehende Session-Reservierungen vor den Live-Bridge-Zählwerten, damit ein Übergang von Reservierung zu Session nicht als idle erscheinen kann. Eine ausgelastete Anfrage ohne Force kehrt die Gates um. Andernfalls werden alle bekannten Registrierungs-Ids atomar gelöscht, queued Memory-Arbeit wird fehlschlagen gelassen, Sub-Session-Launcher und Bridge werden gestoppt, der ACP-Mount wird entsorgt, Ownership-Indizes werden geleert und der Registry-Eintrag wird abgeschlossen.

Das Runtime-Cleanup wird nach Runtime-Identität memoisiert, nicht nach cwd, damit eine spätere, auf demselben Pfad registrierte Runtime kein altes Cleanup-Promise wiederverwenden kann. Das Daemon-Shutdown versiegelt Verwaltungsoperationen, wartet auf deren Konvergenz, stoppt die Launcher und verwendet dann denselben Bridge-Teardown-Pfad für die verbleibenden verwalteten Runtimes.

## Persistenz-Identität

Die Wiederherstellung zeichnet die Id jedes rohen gespeicherten Pfads vor der Kanonisierung auf. Mehrere rohe Aliase, die sich auf eine Runtime auflösen, werden als ein Id-Set beibehalten, einschließlich Aliasen, die von einem expliziten Startup-Workspace überdeckt werden. Die Entfernung löscht dieses Set zuzüglich der kanonischen Registrierungs-Id unter einem einzigen Store-Lock, ohne das Schema zu ändern.

## UI

Die Web Shell bietet die Entfernung nur an, wenn sowohl das Feature-Tag als auch `removable: true` vorhanden sind. Die Aktion bleibt für nicht vertrauenswürdige Workspaces verfügbar. Die erste Bestätigung führt eine Anfrage ohne Force aus; `workspace_busy` rendert die Aktivitätszählwerte und bietet die Force-Entfernung an. Force ist deaktiviert, wenn die aktuelle Session zum Ziel-Workspace gehört. Bei Erfolg werden Capabilities und Session-Listen abgeglichen und bei Bedarf auf den primären Workspace zurückgefallen.

## Fehler- und Kompatibilitätsanalyse

Client-Disconnects und SDK-Timeouts brechen das serverseitige Cleanup nicht ab. Gleichzeitige Add-, Persistence-Promotion- und Remove-Operationen werden pro kanonischem cwd serialisiert. Das Shutdown lehnt neue Verwaltungsoperationen mit `daemon_shutting_down` ab und wartet auf bereits begonnene Arbeit. Alte Clients ignorieren das optionale Capability-Feld und das Feature; alte Daemons erzeugen weiterhin einen normalen `DaemonHttpError` für die fehlende Route.

Die workspace-scoped Channel-Worker-Gruppe liefert Aktivität und Teardown über einen dünnen Adapter. Das Draining blockiert Reload und Webhook-Routing für den Ziel-Workspace; die committete Entfernung stoppt nur diesen Worker und hebt dessen Registrierung auf, damit Daemon-Status und Pidfile-Metadaten konvergieren, ohne andere Workspaces zu beeinflussen.

## Verifikation

Die Unit-Abdeckung zielt auf Registry-Zustandsübergänge und Owner-Cleanup, Admission-Drain-Rollback, Alias-Batch-Löschung, das Routenverhalten bei busy/force/store-failure, Idempotenz des Bridge-Shutdown-Reasons, Memory-Lane-Cancellation, SDK-Request-Encoding sowie die Feature- und Force-Guards der Web Shell. Der E2E-Plan liegt unter `.qwen/e2e-tests/workspace-runtime-removal.md`.
