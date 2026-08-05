# Phase 2a Multi-Workspace Sessions Fundament

> **Historischer Status:** Dieses Dokument hält die Phase-2a/frühe-Phase-2b-Sequenz
> fest, nicht die aktuelle vollständige Oberfläche. Das Ownership-Modell, die
> Fehlersemantik, die Ressourcengrenzen und die verbleibenden Primary-only-Routen
> werden jetzt durch
> [`daemon-multi-workspace-hardening.md`](./daemon-multi-workspace-hardening.md)
> definiert. Die hier festgehaltenen Live-Session-Rewind-Snapshots, Rewind und
> Shell-Einschränkungen sind durch
> [`daemon-multi-workspace-session-file-ops.md`](./daemon-multi-workspace-session-file-ops.md)
> ersetzt. Die spätere Primary-only-Klassifizierung von Live-Session-Continue-,
> Language- und Artefakt-Mutationen ist ebenfalls ersetzt: Diese
> Singular-REST-Routen dispatchen jetzt an die besitzende vertrauenswürdige
> Workspace-Runtime. Andere phasenbezogene Aussagen können ebenfalls durch spätere
> Design-Records ersetzt sein und dürfen nicht als aktuelles Routen-Inventar
> behandelt werden.

## Zusammenfassung

Dieses Dokument hält den Multi-Workspace-Sessions-Vertrag für Issue #6378 nach
dem Phase-1-`WorkspaceRegistry`-PR, dem Phase-2a-Foundation-PR und dem ersten
Phase-2b-Routen-Erweiterungs-PR fest. Phase 2a wurde in zwei
Implementierungs-PRs aufgeteilt: PR 1 landete Env-Isolation und
Total-Admission-Guardrails, während Multi-Workspace noch gegated war; PR 2
verdrahtete Non-Primary-Live-Session-Dispatch und veröffentlichte das additive
Capabilities-/Status-Schema. Phase 2b PR 1 fügt einen Session-Owner-Index
hinzu und erweitert die Sessions-only-Routen-Oberfläche, ohne File-, Memory-,
MCP-, Settings-, Voice-, Channel-Worker-, ACP- oder SDK-Workspace-Clients zu
verschieben.

Die Multi-Workspace-Arbeit bleibt Sessions-only. Phase 2a fügte keine
Plural-Routes, keinen `WorkspaceDaemonClient`, kein Workspace-qualifiziertes
ACP/WebSocket, keine File-, Memory-, MCP-, Settings-, Voice- oder
Channel-Worker-Migration hinzu. Phase 2b PR 1 fügt nur den unten beschriebenen
Plural-Session-Listen-Alias hinzu; es fügt weiterhin keine
Workspace-Client-APIs hinzu und migriert keine Nicht-Session-Oberflächen. PR 1
fügte keine Capabilities `workspaces[]`, `multi_workspace_sessions`, kein
Route-Dispatch und keine Non-Primary-Runtime-Konstruktion hinzu.

## Foundation-Contract

- `--workspace` ist auf der CLI-Parser-Ebene wiederholbar, sodass yargs die Array-Eingabe beibehält, anstatt sie zusammenzufassen.
- Der Serve-Fast-Pfad fällt auf den vollständigen Parser zurück, wenn wiederholte Workspace-Werte vorhanden sind.
- Ein Workspace-Array mit einem einzigen Element wird als primärer Workspace behandelt und behält das bestehende Single-Workspace-Verhalten bei.
- PR 1 hielt mehrere explizite Workspaces vor dem Runtime-Boot gegated.
- PR 2 akzeptiert unterschiedliche, nicht verschachtelte explizite Workspaces für den Sessions-only-Multi-Workspace-Modus.
- Doppelte kanonische Workspace-Inputs schlagen weiterhin explizit fehl.
- Verschachtelte Workspace-Inputs schlagen weiterhin explizit fehl.
- Der erste explizite Workspace ist der primäre Workspace und bleibt durch die Legacy-Kompatibilitätsfelder `workspaceCwd` / `app.locals.boundWorkspace` gespiegelt.

Der interne `WorkspaceRuntime`-Vertrag enthält jetzt stabile Metadaten für die
spätere Phase-2a-Arbeit:

- `workspaceId`: stabiler Hash des kanonischen Workspace-cwd.
- `workspaceCwd`: kanonisches Workspace-cwd.
- `primary`: true für die primäre Runtime.
- `trusted`: Trust-Metadaten zur Boot-Zeit; der direkte `createServeApp`-Fallback bleibt false, außer in der Produktion wird ein expliziter Trusted-Wert übergeben.
- `env`: Metadaten der Runtime-lokalen Env-Quelle. In der Single-Workspace-Produktion erhält die primäre Runtime jetzt einen berechneten effektiven Env-Snapshot und eine mutable Env-Quelle, die nach einem Daemon-Env-Reload aktualisiert werden kann. Der direkte `createServeApp`-Fallback bleibt bei Parent-Process-Metadaten.

Die interne `WorkspaceRegistry` unterstützt exaktes cwd-Lookup, exaktes
Id-Lookup, den `resolveWorkspaceCwd(undefined)`-Primary-Fallback und die
Live-Session-Owner-Auflösung. Die Live-Owner-Auflösung scannt nur die
Runtime-Bridge-Zusammenfassungen; sie scannt keinen persistierten Speicher,
erstellt keine Children und routet noch keine Requests. Doppelte Live-Owner
schlagen fail-closed als mehrdeutiges Ergebnis fehl.

`createServeApp` darf eine injizierte Registry für Tests und zukünftige
Assembly akzeptieren. Der Foundation-PR beließ die Route-Module auf
Primary-Runtime-Inputs; PR 2 erweitert nur die Live-Session-, SSE- und
Session-Permission-Routen-Verdrahtung um die für den Owner-Dispatch benötigte
Registry. Bestehende Legacy-`app.locals.boundWorkspace` und
`app.locals.fsFactory` bleiben Primary-only-Kompatibilitäts-Locals.

## Phase-2a-Routen-Klassifizierung

Der erste ungegate Phase-2a-Meilenstein muss alle `/session/:id/*`-Routen
klassifizieren, bevor mehrere explizite Workspaces aktiviert werden.

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

Phase-2b-dispatchte Ergänzungen:

- `POST /session/:id/load`
- `POST /session/:id/resume`
- `GET /session/:id/context`
- `GET /session/:id/context-usage`
- `GET /session/:id/stats`
- `GET /session/:id/supported-commands`
- `GET /session/:id/tasks`
- `GET /session/:id/lsp`
- `GET /session/:id/hooks`
- `GET /session/:id/artifacts`

Spätere oder Primary-only Routen:

- `GET /session/:id/export`
- `POST /sessions/delete`
- `POST /sessions/archive`
- `POST /sessions/unarchive`
- `PATCH /session/:id/organization`
- session-group mutations
- branch, fork, cd, rewind, shell, model, and language session mutations
- non-session `POST /permission/:requestId`
- `/acp`

## Phase-2a-PR-übergreifende Anforderungen

- Behalte Scan-Misses als `404 session_not_found` bei; falle niemals auf Primary zurück.
- Schlage fail-closed fehl, wenn mehr als eine Runtime dieselbe Live-Session-Id meldet.
- Halte die Non-Primary-persistierte-Session-Auflistung gegated, bis Restore-Ownership, Trust-Prüfungen und Active-Session-Discovery gemeinsam implementiert sind.
- Verwende die Runtime-lokalen Env-Overlays aus PR 1 vor jedem Non-Primary-Child-Spawn wieder.
- Verwende die `maxTotalSessions`-Admission aus PR 1 an jeder zukünftigen Fresh-Creation-Seam wieder, damit REST und das primäre `/acp` sie nicht umgehen können, während Attach die Admission weiterhin umgeht.
- PR 2 veröffentlicht `workspaces[]` und `multi_workspace_sessions` erst, nachdem die Live-Session-Dispatch-Schleife vollständig ist.
- PR 2 aktualisiert die SDK-Capability-Types für das additive Capabilities-Schema, aber Phase 2a fügt weiterhin keinen Workspace-Client hinzu.

## PR-1-Guardrails

- Die Runtime-Env wird aus der Daemon-Basis-Env plus Workspace-`.env`, Settings-Env und Cloud-Shell-Defaults berechnet, ohne das Eltern-`process.env` während der Runtime-Initialisierung zu mutieren.
- Der Env-Helfer virtualisiert bewusst weder `QWEN_HOME` noch Storage- oder globale Config-Routing. Diese bleiben Verantwortlichkeiten des Daemon-Boots/der Basis-Env.
- ACP-Child-Spawn akzeptiert eine explizite `sourceEnv`, und günstige Workspace-scoped Status-/Config-Reader verwenden injizierte Env statt direkter `process.env`-Reads.
- `maxTotalSessions` ist eine optionale daemonweite Fresh-Session-Obergrenze. Sie deckt Spawn, persistierte Load/Resume-Restore und Branch/Fork-Session-Erzeugung ab; Attach umgeht sie. Im Multi-Workspace-Modus, wenn der Betreiber sie nicht setzt und die Pro-Workspace-`maxSessions`-Obergrenze endlich ist, leitet PR 2 die effektive Gesamt-Obergrenze als `maxSessionsPerWorkspace * workspaceCount` ab; der Single-Workspace-Modus behält den historischen unbegrenzten Gesamt-Default.
- Die Bridge-Admission-Seam ist ein synchroner Reservierungs-Hook. Fehlgeschlagene Fresh-Erzeugung gibt die Reservierung frei und verhindert so gleichzeitigen Oversell über Runtimes hinweg, sobald Non-Primary-Bridges existieren.
- `/daemon/status.limits.maxTotalSessions` ist additiv. `/capabilities` und SDK-Capability-Types bleiben unverändert, bis PR 2 Multi-Workspace-Sessions ungated.

## PR-2-Sessions-Closed-Loop

PR 2 entfernt den expliziten Multi-Workspace-Boot-Gate für den
Sessions-only-Daemon-Modus. Mehrere explizite `--workspace`-Werte erzeugen
jetzt eine Runtime pro kanonischem Workspace, wobei der erste Workspace
Primary ist. Doppelte und verschachtelte Workspace-Inputs bleiben Boot-Fehler,
weil sie den Session-Besitz mehrdeutig machen, bevor ein Routen-Level-Dispatch
einen Request sicher auflösen kann.

Die Produktions-Assembly behält die bestehenden
Primary-Runtime-Verantwortlichkeiten: Daemon-Identität, Log-Identität,
Telemetrie-Service-Id, WebShell, `/acp`, File, Memory, MCP, Settings, Voice,
Channel-Worker und Legacy-Workspace-lose REST-Routen bleiben Primary-only.
Non-Primary-Runtimes sind Bridge-/Workspace-Service-Runtimes nur für
Live-REST-Sessions. Ihr ACP-Kind ist weiterhin lazy: Das Bridge-Objekt
existiert beim Boot, aber es wird kein Non-Primary-Child gespawnt, bis ein
vertrauenswürdiger `POST /session { cwd }`-Request eine frische Session
benötigt.

Die Session-Erzeugung löst `cwd` durch exaktes kanonisches cwd-Matching der
`WorkspaceRegistry` auf. Weggelassenes `cwd` löst auf die primäre Runtime auf.
Unbekanntes `cwd` gibt `400 workspace_mismatch`
zurück; nicht vertrauenswürdiges Non-Primary-`cwd` gibt
`403 untrusted_workspace` zurück; vertrauenswürdige registrierte Runtimes
rufen die Bridge dieser Runtime mit ihrem eigenen kanonischen cwd auf. Dies
vermeidet in Phase 2a bewusst Präfix-Matching, Nearest-Parent-Matching oder
Persisted-Storage-Lookup.

Die dispatchten Live-Session-Routen lösen die Owner-Runtime durch Scannen von
Live-Bridge-Zusammenfassungen über
`WorkspaceRegistry.resolveLiveSessionOwner(sessionId)` auf. `not_found` wird
auf `404 session_not_found` abgebildet, und `ambiguous` wird auf einen
fail-closed Server-Fehler abgebildet. Der Scan ist synchron und Live-only; er
spawnt nie ein Child und behandelt einen Miss nie als Primary-Fallback. Die
dispatchte Routen-Menge ist exakt:

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

`GET /workspace/:id/sessions` löst zuerst nach exakter Workspace-Id und dann
nach exaktem kanonischem cwd auf. Primary behält das bestehende
persistierte/live Merge- und Organized-View-Verhalten. Non-Primary gibt nur
Live-Sessions zurück, lehnt `archiveState=archived` ab und lehnt
Organized-/Group-Queries ab, weil diese persistierte/organisationsgestützte
Oberflächen sind, die späteren Phasen vorbehalten sind.

`/capabilities` bleibt abwärtskompatibel: `workspaceCwd` benennt weiterhin den
primären Workspace. Wenn mehr als eine Runtime registriert ist, publiziert es
zusätzlich `workspaces[]`, `multi_workspace_sessions` und additive
Session-Limits. `/daemon/status` fügt dieselben `workspaces[]`-Metadaten hinzu
und aggregiert Live-Session-Zähler über Runtime-Bridges, während vollständige
Workspace-Abschnitte Primary-only bleiben.

Phase 2a PR 2 fügt keine Plural-Routes, kein Workspace-qualifiziertes
ACP/WebSocket, keine File/Memory/MCP/Settings/Voice/Channel-Worker-Migration,
kein dynamisches Hinzufügen/Entfernen, keine
Non-Primary-persistierte-Load/Resume/Export/Archive/Delete, kein
Branch/Fork/cd/Rewind, keine Shell/Model/Language-Migration und keine
SDK-Workspace-Client-APIs hinzu.

## Phase 2b PR 1 Owner-Index und Restore-Erweiterung

Phase 2b PR 1 fügt eine Bridge-Lifecycle-Callback-Seam und einen
`WorkspaceSessionOwnerIndex` im Besitz der `WorkspaceRegistry` hinzu.
Bridge-Register-/Remove-Lifecycle-Events aktualisieren den Index bei Spawn,
Load/Resume, Channel-Exit, Close, Kill und Daemon-Shutdown. Die
Owner-Auflösung konsultiert zuerst den Index, verifiziert die indizierte
Runtime mit `getSessionSummary`, verwirft veraltete Index-Einträge und fällt
auf den bestehenden Live-Bridge-Scan zurück. Fallback-Treffer werden in den
Index zurückgecacht. Der Index bleibt eine Optimierungs- und
Konsistenz-Seam, keine persistierte Ownership-Datenbank.

`POST /session/:id/load` und `POST /session/:id/resume` akzeptieren jetzt ein
explizites `cwd` für jeden vertrauenswürdigen registrierten Workspace.
Weggelassenes `cwd` löst weiterhin auf die primäre Runtime auf. Unbekanntes
`cwd` gibt `400 workspace_mismatch` zurück; nicht vertrauenswürdiges
Non-Primary-`cwd` gibt `403 untrusted_workspace` zurück; wenn dieselbe
Session-Id bereits live ist oder in einer anderen Runtime wiederhergestellt
wird, scheitert die Wiederherstellung fail-closed mit
`409 session_workspace_conflict`. Wiederherstellungs-Races im selben Workspace
behalten das bestehende Coalescing- und `restore_in_progress`-Verhalten der
Bridge. Restore liest weiterhin den persistierten Session-Speicher vom
bestehenden Speicherpfad des angeforderten Workspaces und aktiviert kein
Non-Primary-Export/Archive/Delete.

Die Owner-gerouteten Read-only-Live-Routen verwenden jetzt die Bridge der
besitzenden Runtime: Context, Context-Usage, Stats, Supported-Commands, Tasks,
Lsp, Hooks und Artifacts. Diese Routen mutieren keinen persistierten Speicher
und benötigen keinen ACP-/WebSocket-verbindungslokalen Zustand, sodass sie dem
Live-Owner sicher folgen können. `GET /session/:id/rewind/snapshots` bleibt
Primary-only, weil der Rewind-Zustand nicht Teil des Sessions-only-Closed-Loops
ist.

`GET /workspaces/:workspace/sessions` ist ein Plural-Alias für
`GET /workspace/:id/sessions`. Beide lösen zuerst nach exakter Workspace-Id
und dann nach exaktem kanonischem cwd auf. Primäre Workspaces behalten die
Persistiert/Live-Merge-Semantik. Phase 2b PR 1 hielt Non-Primary-Workspaces
Live-only und lehnte archivierte oder organisierte Listenansichten ab.

## Phase 2b PR 2 Persistierte Session-Discovery

Die Auflistung vertrauenswürdiger Non-Primary-Workspace-Sessions enthält jetzt
aktive persistierte Sessions aus dem Session-Store dieses Workspaces und
merged passende Live-Zusammenfassungen ohne Duplikate. Dies vervollständigt
die Discovery-Seite des Phase-2b-Restore-Flows: Clients können einen
vertrauenswürdigen sekundären Workspace auflisten, eine aktive persistierte
Session finden und dann die Workspace-bewussten `POST /session/:id/load` oder
`POST /session/:id/resume` aus Phase 2b PR 1 aufrufen.

Wenn ein vertrauenswürdiger Non-Primary-Workspace keine aktiven persistierten
Sessions hat, behält die Auflistung das bisherige Live-only-Cursor-Verhalten.
Archivierte, organisierte und gruppierte Non-Primary-Listenansichten bleiben
abgelehnt, weil Archive/Unarchive/Delete und
Session-Organisations-Oberflächen weiterhin Primary-only/spätere-Phasen-Arbeit
sind.

Die bisherige Phase-2b-Arbeit fügt keine neuen Capability-Tags hinzu, ändert
nicht das `/capabilities`-Schema, ändert keine SDK-Types und routet weder ACP,
Voice, Channel-Worker, File, Memory, MCP, Settings, Branch/Fork/cd/Rewind,
Shell/Model/Language, Export, Archive, Delete noch
Organisations-Oberflächen an Non-Primary-Runtimes.

## Audit-Entscheidungen

- Der Foundation-PR darf keine Non-Primary-Runtimes erstellen oder REST-Routen auflockern.
- Die bestehenden `app.locals.boundWorkspace` und `app.locals.fsFactory` bleiben reine Primary-Kompatibilitäts-Locals.
- Die REST-`routeFileSystemFactory` bleibt getrennt von den Bridge-Filesystem-Factories; sie darf nicht zur Darstellung von Non-Primary-Bridge-Grenzen verwendet werden.
- Sekundäre Filesystem-Roots der IDE dürfen nicht zu expliziten Workspace-Runtimes hochgestuft werden.
- Das Single-Workspace-Parent-Env-Verhalten bleibt kompatibel, bis der echte Multi-Workspace-Modus ungegated ist.
- Die sichere Grenze von PR 2 ist der Live-Session-Closed-Loop plus additive Capabilities-/Status-Metadaten. Wenn eine Route persistierten Speicher, Organisationszustand, Workspace-Settings oder ACP-verbindungslokalen Zustand benötigt, bleibt sie Primary-only oder später.
