# Daemon Multi-Workspace Phase 1 Registry

## Zusammenfassung

Phase 1 führt die interne Single-Runtime-Registry für `qwen serve` ein, zusammen mit den beiden in Issue #6378 genannten Schutzmechanismen: daemon-spezifische Identität und die Verarbeitung wiederholter `--workspace`-Eingaben. Der Daemon bedient weiterhin genau einen primären Workspace. Das Verhalten der Routen/APIs bleibt unverändert, mit der Ausnahme, dass mehrere explizite `--workspace`-Werte nun zu einem deutlichen Fehler führen, anstatt still in den alten Single-Workspace-Pfad abzurutschen. Auch die Daemon-Log-Dateinamen und die Telemetrie-Service-Instanz-IDs werden absichtlich von einer Workspace-spezifischen auf eine Daemon-spezifische Identität umgestellt; die PR-Release-Notes sollten diese Migration explizit erwähnen.

Die Registry bildet die zukünftige interne Grenze für den Multi-Workspace-Rollout aus Issue #6378. Dieser Schritt vermeidet jedoch absichtlich eine Erweiterung des Protokolls/Schemas und aktiviert kein Multi-Workspace-Verhalten in der CLI.

## Design

- `WorkspaceRuntime` kapselt die aktuellen Single-Workspace-Serve-Objekte: `workspaceCwd`, `AcpSessionBridge`, `DaemonWorkspaceService`, die REST-Route-Filesystem-Factory und die aktuelle Client-MCP-Sender-Registry.
- `WorkspaceRegistry` macht nur `primary`, `list()` und die exakte `getByWorkspaceCwd()`-Abfrage verfügbar.
- `createServeApp` konstruiert zuerst den bestehenden Bridge/Service/fsFactory-Stack und kapselt ihn dann als primäre Runtime.
- Die bestehenden `app.locals.fsFactory` und `app.locals.boundWorkspace` bleiben für die aktuellen Datei-Routen erhalten. `app.locals.workspaceRegistry` ist additiv.
- Routen-Module behalten ihre aktuellen Signaturen. Die Server-Assembly-Schicht übergibt nun Werte aus `workspaceRegistry.primary`.
- Daemon-Log-Dateinamen und Telemetrie-Service-Instanz-IDs sind Daemon-spezifisch (`serve-<pid>.log`, `daemon:<pid>`). Der Workspace-Hash bleibt ein Attribut in den Log-/Telemetrie-Datensätzen, anstatt Teil der Daemon-Identität zu sein.
- `runQwenServe` akzeptiert die mögliche yargs-Runtime-Struktur, bei der `workspace` ein Array ist. Ein einzelner Wert verhält sich weiterhin wie der bestehende Single-Workspace; mehrere Werte führen zu einem Boot-Fehler, bis die Multi-Workspace-Unterstützung aktiviert ist.

## Grenzen

- Noch keine Unterstützung für wiederholbare `--workspace`-Werte; wiederholte Werte werden abgelehnt.
- Kein `workspaces[]` in `/capabilities` oder dem Daemon-Status.
- Keine SDK-Typänderungen.
- Keine Plural-Routen `/workspaces/:workspace/...`.
- Kein Session-Ownership-Index, kein Env-Overlay, keine `maxTotalSessions` und kein Workspace-spezifisches ACP/Voice/Channel-Worker-Verhalten.

## Audit-Hinweise

Die Route-Filesystem-Factory heißt `routeFileSystemFactory`, da die Produktion derzeit zwischen Bridge-Dateizugriff und REST-Route-Dateizugriff unterscheidet. Die Registry darf diese Grenzen nicht zusammenführen.

`ClientMcpSenderRegistry` bleibt in dieser Phase die aktuelle Prozess-spezifische Single-Daemon-Map. Die Runtime speichert nur die bestehende Instanz; die Workspace-spezifische Client-MCP-Isolierung ist ein späteres Multi-Workspace-Thema.

`SessionArchiveCoordinator` und `WorkspaceRememberTaskLane` bleiben als aktuelle Server-Assembly-Komponenten erhalten. Sie sind in Phase 1 nicht Teil der Kernverantwortlichkeiten der Registry.

Die Daemon-Telemetrie-Middleware löst das Workspace-CWD nun zur Request-Zeit auf, obwohl Phase 1 immer noch auf "primary" auflöst. Dies bewahrt das aktuelle Verhalten und vermeidet gleichzeitig eine Primary-Workspace-Hash-Closure, die falsch wäre, sobald Workspace-spezifische Routen eingeführt werden.

## Verifizierung

Gezielte Tests decken das exakte Registry-Lookup, die Bereitstellung der `createServeApp`-Locals, die Beibehaltung der injizierten Route-Filesystem-Factory, das Verhalten der bestehenden File-Route-Locals, die Daemon-spezifische Log-/Telemetrie-Identität, das Workspace-Hashing zur Request-Zeit, die yargs-Strukturen für einzelne/wiederholte `--workspace`-Werte, den Single-Workspace-Array-Pfad und den Boot-Schutz für wiederholte `--workspace`-Werte ab. Die finale Verifizierung sollte die fokussierten Serve-Tests sowie den Repository-Build und Typecheck ausführen.