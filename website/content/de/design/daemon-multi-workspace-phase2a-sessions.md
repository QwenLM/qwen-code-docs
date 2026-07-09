# Phase 2a Multi-Workspace Sessions Fundament

## Zusammenfassung

Dieses Dokument hält den Phase-2a-Foundation-Contract für Issue #6378 nach dem Phase-1-`WorkspaceRegistry`-PR fest. Der aktuelle Implementierungs-Batch kombiniert das Phase-1-Follow-up für wiederholte `--workspace`-Argumente, die Phase-2a-Prep-Guardrails und den ersten internen Registry/Runtime-Contract, der für die spätere Multi-Workspace-Session-Arbeit benötigt wird.

Phase 2a bleibt rein auf Sessions beschränkt. Es fügt in diesem Foundation-Batch keine Plural-Routes, keinen `WorkspaceDaemonClient`, kein Workspace-qualifiziertes ACP/WebSocket, keine File-, Memory-, MCP-, Settings-, Voice- oder Channel-Worker-Migration, keine Env-Overlays, keine Total-Session-Admission, keine `workspaces[]`-Capabilities, keine `multi_workspace_sessions`, kein Route-Dispatch und keine Non-Primary-Runtime-Konstruktion hinzu.

## Foundation-Contract

- `--workspace` ist auf der CLI-Parser-Ebene wiederholbar, sodass yargs die Array-Eingabe beibehält, anstatt sie zusammenzufassen.
- Der Serve-Fast-Pfad fällt auf den vollständigen Parser zurück, wenn wiederholte Workspace-Werte vorhanden sind.
- Ein Workspace-Array mit einem einzigen Element wird als primärer Workspace behandelt und behält das bestehende Single-Workspace-Verhalten bei.
- Mehrere explizite Workspaces bleiben durch ein Gate geschützt und schlagen vor dem Runtime-Boot fehl.
- Doppelte kanonische Workspace-Inputs schlagen explizit fehl.
- Verschachtelte Workspace-Inputs schlagen explizit fehl.
- Unterschiedliche, nicht verschachtelte Multiple-Workspace-Inputs schlagen mit dem generischen Boot-Fehler "multi-workspace serve is not enabled" fehl.
- Der erste explizite Workspace ist der zukünftige primäre Workspace, sobald das Gate entfernt wird; dieser Foundation-Batch macht diese Liste nicht öffentlich zugänglich.

Der interne `WorkspaceRuntime`-Contract enthält jetzt stabile Metadaten für die spätere Phase-2a-Arbeit:

- `workspaceId`: stabiler Hash des kanonischen Workspace-CWD.
- `workspaceCwd`: kanonisches Workspace-CWD.
- `primary`: `true` für die primäre Runtime.
- `trusted`: Trust-Metadaten zur Boot-Zeit; der direkte `createServeApp`-Fallback bleibt `false`, außer in der Production wird ein expliziter `trusted`-Wert übergeben.
- `env`: nur Metadaten. Dieser Foundation-Batch zeichnet den Parent-Process-Modus und leere Overlay-Keys auf; er berechnet keine Runtime-lokalen Env-Overlays.

Die interne `WorkspaceRegistry` unterstützt das exakte CWD-Lookup, das exakte ID-Lookup, den `resolveWorkspaceCwd(undefined)`-Primär-Fallback und die Live-Session-Owner-Auflösung. Die Live-Owner-Auflösung scannt nur die Runtime-Bridge-Zusammenfassungen; sie scannt keinen persistierten Speicher, erstellt keine Children und routet noch keine Requests. Doppelte Live-Owner schlagen fehl (fail closed) und liefern ein mehrdeutiges Ergebnis.

`createServeApp` kann für Tests und zukünftige Assembly eine injizierte Registry akzeptieren, aber Route-Module erhalten weiterhin nur die primäre Runtime. Die bestehenden Legacy-`app.locals.boundWorkspace` und `app.locals.fsFactory` bleiben reine Primary-Kompatibilitäts-Locals.

## Phase-2a-Route-Klassifizierung

Der erste ungegate Phase-2a-Meilenstein muss alle `/session/:id/*`-Routen klassifizieren, bevor mehrere explizite Workspaces aktiviert werden.

Phase-2a-dispatchte Routen:

- `POST /session`
- `GET /session/:id/events`
- `POST /session/:id/prompt`
- `POST /session/:id/cancel`
- `POST /session/:id/permission/:requestId`
- `POST /session/:id/heartbeat`
- `POST /session/:id/detach`
- `GET /session/:id/pending-prompts`
- `DELETE /session/:id/pending-prompts/:promptId`
- `DELETE /session/:id`
- `GET /session/:id/status`

Spätere oder Primary-only Routen:

- non-primary `POST /session/:id/load`
- non-primary `POST /session/:id/resume`
- `GET /session/:id/export`
- `POST /sessions/delete`
- `POST /sessions/archive`
- `POST /sessions/unarchive`
- `PATCH /session/:id/organization`
- session-group mutations
- branch, fork, cd, rewind, shell, model, and language session mutations
- non-session `POST /permission/:requestId`
- `/acp`

Zusätzliche Live-Read-Routen dürfen erst in einem späteren Phase-2a-Slice owner-geroutet werden, nachdem Tests bewiesen haben, dass sie ausschließlich von der besitzenden Live-Bridge abhängen.

## Spätere Phase-2a-Anforderungen

- Behalte Scan-Fehlschläge als `404 session_not_found` bei; falle niemals auf Primary zurück.
- Schlage fehl (fail closed), wenn mehr als eine Runtime dieselbe Live-Session-ID meldet.
- Behalte die Non-Primary-Session-Auflistung als "live-only" bei, außer persistierte Einträge sind explizit als "non-resumable" markiert.
- Füge Runtime-lokale Env-Overlays vor dem Non-Primary-Child-Spawn hinzu.
- Füge `maxTotalSessions` an der Bridge-Fresh-Creation-Seam hinzu, damit REST und die primäre `/acp` sie nicht umgehen können, während Attach die Admission weiterhin umgeht.
- Veröffentliche `workspaces[]`, Total-Limits und `multi_workspace_sessions` erst im finalen UnGate-PR.
- Aktualisiere die SDK-Capability-Types, wenn das additive Capabilities-Schema ausgeliefert wird, aber füge in Phase 2a keinen Workspace-Client hinzu.

## Audit-Entscheidungen

- Der Foundation-PR darf keine Non-Primary-Runtimes erstellen oder REST-Routen auflockern.
- Die bestehenden `app.locals.boundWorkspace` und `app.locals.fsFactory` bleiben reine Primary-Kompatibilitäts-Locals.
- Die REST-`routeFileSystemFactory` bleibt getrennt von den Bridge-Filesystem-Factories; sie darf nicht zur Darstellung von Non-Primary-Bridge-Grenzen verwendet werden.
- Sekundäre Filesystem-Roots der IDE dürfen nicht zu expliziten Workspace-Runtimes hochgestuft werden.
- Das Single-Workspace-Parent-Env-Verhalten bleibt kompatibel, bis der echte Multi-Workspace-Modus ungegated ist.