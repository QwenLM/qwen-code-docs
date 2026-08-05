# Daemon Multi-Workspace Phase 4b: Channel-Worker nach Workspace

## Zusammenfassung

Dieses Dokument entwirft den Channel-Worker-Slice von Phase 4b von Issue
#6378: die Gruppierung Daemon-verwalteter Channel-Worker nach Workspace. Voice
(`/workspaces/:workspace/voice/stream`) ist ein separater Phase-4b-Slice und
liegt hier außerhalb des Umfangs.

Heute startet `qwen serve --channel <name>` einen einzelnen Channel-Worker,
gebunden an den primären Workspace. Im Multi-Workspace-Modus muss der Worker
nach dem Workspace gruppiert werden, dem jeder Channel gehört: Jeder
registrierte, vertrauenswürdige Workspace erhält einen eigenen Worker-Prozess,
gebunden an das cwd dieses Workspaces, `QWEN_DAEMON_WORKSPACE` und das
effektive Env-Overlay. Das Pidfile und der Daemon-Status erhalten eine additive
Worker-Liste, während die bestehenden Single-Worker-Felder erhalten bleiben.
`--channel all` bleibt in v1 Primary-only. Das Single-Workspace-Verhalten ist
unverändert.

Mapping-Modell: Channels werden **implizit nach ihrem aufgelösten cwd**
gruppiert — ein Channel gehört zu dem registrierten Workspace, auf den sein
konfiguriertes cwd auflöst. Es wird keine neue CLI-Syntax hinzugefügt.

## Baseline: aktueller Channel-Worker-Seam

- `run-qwen-serve.ts` erzeugt einen `ChannelWorkerSupervisor` im
  Listen-Callback (gebunden an `boundWorkspace`, den primären) und startet ihn
  in `completeRuntimeStartup`. `completeRuntimeStartup` ist der einzige
  Konvergenzpunkt über jeden Runtime-Start-Pfad (der eager `deps.bridge`-Pfad
  und der `startRuntime` -> `buildRuntime`-Pfad). `deps.bridge` ist auf einen
  einzelnen Workspace beschränkt, daher fließt Multi-Workspace immer durch
  `startRuntime`.
- `commands/channel/daemon-worker.ts` validiert seinen eigenen Workspace gegen
  `capabilities.workspaceCwd` (den primären), sodass ein Non-Primary-Worker
  wirft. `validateChannelWorkspaces` verlangt zusätzlich, dass das aufgelöste
  cwd jedes Channels dem Daemon-Workspace entspricht.
- `config-utils.ts` löst das cwd eines Channels als
  `resolvePath(rawConfig.cwd || defaultCwd)` auf; `loadChannelsConfig(W)` gibt
  `loadSettings(W).merged.channels` zurück, das System-/User-/Workspace-Scopes
  merged.
- `channel-worker-supervisor.ts` baut die Worker-Env aus `{...process.env}`.
  Im Multi-Workspace-Modus ist die Eltern-Env die Daemon-Basis-Env
  (Phase-2a-Env-Isolation), sodass sie das eigene `.env` des Workspaces
  verpassen würde.
- Das Pidfile `ServiceInfo` ist Single-Worker (`channels[] / servePid? /
  workerPid?`); der Daemon-Status `runtime.channelWorker` ist ein einzelner
  Snapshot.
- Die Workspace-Registry (gebaut innerhalb von `buildRuntime`) exponiert
  `env.effectiveEnv`, `trusted` und kanonisches `workspaceCwd` jeder Runtime.
  Das Phase-2a/3-Session-Routing adressiert bereits eine Runtime über
  `workspaceCwd`.

## Gruppierungsalgorithmus

Eine pure Funktion `resolveChannelWorkspaceGroups` spiegelt das
Worker-seitige `validateChannelWorkspaces` und die `config-utils`-cwd-Auflösung —
andernfalls könnten die Serve-Schicht-Gruppierung und die eigene Validierung
des Workers zu unterschiedlichen Ergebnissen kommen. Weil
`loadChannelsConfig(W)` über Scopes hinweg gemerged ist, kann der Besitz nicht
durch „welche Workspace-Merged-Config enthält den Namen" entschieden werden.

Für jeden gewählten Channel `name` werden die registrierten Workspaces `W`
iteriert. Wenn `name` in `loadChannelsConfig(W)` enthalten ist, berechne
`resolvedCwd = canonicalizeWorkspace(resolvePath(cfg[name].cwd ?? W))`. `W`
ist genau dann ein Kandidaten-Owner, **wenn `resolvedCwd === W`** (d. h. der
Channel würde `validateChannelWorkspaces` unter `W` bestehen):

- explizites `cwd` = ein registrierter Pfad X: nur `W === X` erfüllt es ->
  Owner = X (eindeutig).
- kein `cwd`, nur im eigenen Scope eines Workspaces definiert
  (`/B/.qwen/settings.json`): erscheint nur in Bs Merged-Config und löst auf B
  auf -> Owner = B (eindeutig).
- kein `cwd`, im User-/System-Scope definiert: unter jedem W erfüllt ->
  mehrere Owner -> genuinely mehrdeutig.
- explizites `cwd` = ein nicht registrierter Pfad: kein W erfüllt es -> null
  Owner.

Fehler und Aggregation:

- null Owner -> `channel_workspace_mismatch` (nicht konfiguriert, oder das cwd
  zeigt auf einen nicht registrierten Workspace).
- mehr als ein Owner -> `ambiguous_channel_workspace` (ein
  User-/System-Scope-Channel ohne `cwd`; der Betreiber muss ihn auf einen
  Workspace scopieren oder ein explizites `cwd` hinzufügen).
- Owner nicht vertrauenswürdig -> `untrusted_workspace` (ein Channel muss
  Sessions erzeugen).
- eindeutiger vertrauenswürdiger Owner -> Namen nach Owner gruppieren -> jede
  Gruppe erhält `{mode:'names', names}`.
- `mode:'all'` -> Primary-only: `[{ workspaceCwd: primary, selection:
  {mode:'all'} }]`. Der primäre Worker lädt die Merged-Channels des Primary;
  Einträge, deren cwd nicht Primary ist, behalten das bestehende
  `validateChannelWorkspaces`-Fehlerverhalten.
- Single-Workspace (nur Primary): `resolvedCwd` kann nur Primary sein und
  erzeugt exakt dieselbe einzelne Gruppe wie heute.

Ein geteilter cwd-Helfer wird von Config-Parsing und Ownership-Gruppierung
verwendet. Explizite absolute Pfade und `~/...` behalten ihre bestehende
Bedeutung; gewöhnliche relative Pfade lösen gegen den Workspace auf, dessen
Settings geladen werden. Der Owner-Pfad wird dann kanonisiert, sodass die
Serve-Schicht und der Worker nicht über den Besitz uneinig sein können.

## Worker-Identität und Env

`CreateChannelWorkerSupervisorOptions` erhält ein optionales `workerBaseEnv`
(Default `process.env`). `createWorkerEnv` verwendet `workerBaseEnv ??
process.env` als Basis; alles andere ist unverändert
(`QWEN_DAEMON_WORKSPACE`, Token-Env-Scrubbing, Daemon-Token-Injektion). Der
Gruppen-Manager übergibt `runtime.env.effectiveEnv ?? process.env` — das
direkte Lesen des Feldes vermeidet den Import eines privaten Helfers aus
`server.ts`, und eine Parent-Process-Modus-Runtime (Single Workspace) hat
`effectiveEnv` undefined und fällt exakt wie heute auf `process.env` zurück.

## Daemon-Worker-Validierungsfix

`DaemonCapabilitiesLike` erhält ein optionales `workspaces?: Array<{ cwd; id;
primary; trusted }>` (bereits seit Phase 2a von `/capabilities` publiziert).
Die Validierung löst `daemonWorkspace = canonicalizeWorkspace(opts.workspace)`
auf; wenn `capabilities.workspaces` vorhanden ist, muss es zu einem davon
passen und vertrauenswürdig sein, andernfalls fällt sie auf den Legacy-Check
`== capabilities.workspaceCwd` für alte Single-Workspace-Daemons zurück. Beide
Seiten sind kanonisch (der Supervisor übergibt `runtime.workspaceCwd`), sodass
der Vergleich stabil ist. Der Rest des Workers (Channel-Config-Load,
`validateChannelWorkspaces`, `createOrAttach({workspaceCwd})`) funktioniert
bereits mit Multi-Workspace-Routing.

## Supervisor-Gruppen-Manager

Ein schlankes `ChannelWorkerGroup` besitzt `Map<workspaceId,
ChannelWorkerSupervisor>`:

- gebaut aus den aufgelösten Gruppen und der Registry; jeder Supervisor ist an
  das `workspaceCwd`, die Auswahl und `env.effectiveEnv` seiner Runtime
  gebunden und wird durch dieselbe injizierbare Factory erzeugt, die der
  einzelne Worker verwendet.
- `start()` startet Supervisoren sequenziell und rollt bereits gestartete
  zurück, wenn ein späterer Start fehlschlägt. `stop()` wartet auf laufende
  Restarts und stoppt jeden Supervisor. `killAllSync()` bleibt der
  Signal-Handler-Fallback.
- `restart()` ist die daemonweite Reload-Transaktion. Gleichzeitige Requests
  coalescen; Supervisoren starten sequenziell neu, und jeder Fehler stoppt die
  gesamte Gruppe, um eine teilweise reloadete Flotte zu vermeiden.
- `snapshots()` gibt Pro-Workspace-Snapshots zurück (`ChannelWorkerSnapshot &
  { workspaceId; workspaceCwd; primary }`); `primarySnapshot()` untermauert
  die Legacy-Single-Worker-Felder.
- `onReady` / `onExit` eines beliebigen Supervisors löst einen vollständigen
  Pidfile-Rewrite aus `snapshots()` aus (nie ein inkrementelles
  Single-Entry-Update — siehe unten).

## Pidfile-Schema und Nebenläufigkeit

`ServiceInfo` erhält ein optionales `workers?: Array<{ workspaceId?;
workspaceCwd?; channels: string[]; workerPid? }>`. Das Top-Level-`channels`
wird die Union der Channels aller Worker, und das Top-Level-`workerPid` bleibt
die Pid des primären Workers, sodass alte Reader (`qwen channel status`, das
nur `workerPid` und `channels` liest) nicht betroffen sind.

Nebenläufigkeit: Mit N Workern feuern `onReady`/`onExit`-Callbacks
gleichzeitig. Ein Read-Modify-Write eines einzelnen Eintrags würde Updates
verlieren. Stattdessen nimmt der Writer die vollständige Menge der Snapshots
von der Gruppe und führt einen synchronen Full-Rewrite aus.
`writeServeServiceInfo` verwendet synchrones `openSync`/`writeSync` ohne
`await`, sodass ein Full-Snapshot-Write atomar genug ist — der letzte Write
hält immer das vollständige Bild. `writeServeServiceInfo` erhält einen
optionalen `workers`-Parameter, der wortwörtlich unter dem bestehenden
`O_RDWR + O_NOFOLLOW` + Serve-Ownership-Guard geschrieben wird;
`parseServiceInfo` validiert `workers?` optional und reicht es durch.

## Daemon-Status-Schema

`DaemonStatusRuntime` erhält ein optionales `channelWorkers?: Array<
ChannelWorkerSnapshot & { workspaceId; workspaceCwd; primary }>`; das
erforderliche `channelWorker` bleibt der Snapshot der primären Gruppe für alte
Clients. Der Getter (`getChannelWorkerSnapshots`) wird von `run-qwen-serve`
durch `ServeAppDeps` und `BuildDaemonStatusOptions` gereicht, analog zum
bestehenden `getChannelWorkerSnapshot`-Pfad, und wird auch im
Bootstrap-Status exponiert. Bevor die Gruppe erzeugt wird (Pre-Startup),
meldet er den Disabled-Snapshot.

## Orchestrierung und Timing

- Die einzelne `channelWorker`-Variable wird im äußeren Scope zu einer
  Gruppen-Manager-Referenz, sodass der Pidfile-Writer und die Shutdown-Pfade
  sie weiterhin sehen.
- Frühes Fail-fast: Zur Listen-Zeit (vor `buildRuntime`) läuft die pure
  Gruppierungsfunktion einmal gegen `workspaceInputs` + `loadSettings` +
  Boot-eingefrorenen Trust (`getWorkspaceTrustStatus`). Unbekannter,
  mehrdeutiger, nicht vertrauenswürdiger und ungültiger cwd-Besitz lehnt den
  Start ab, bevor ein nutzbarer Handle exponiert wird. Der aufgelöste
  Gruppenplan wird für den Rest des Starts eingefroren; Settings werden später
  nicht unter einem anderen Filesystem-Snapshot neu gruppiert.
- Die eigentliche Erzeugung/der Start wandert in `completeRuntimeStartup`: Es
  liest die Registry aus `runtimeApp.locals.workspaceRegistry` (garantiert
  vorhanden für Multi-Workspace, das immer durch `startRuntime` ->
  `buildRuntime` fließt), baut einen Supervisor pro eingefrorener Gruppe und
  startet sie — als Ersatz für den einzelnen `channelWorker.start()`.
- Die neu gebaute Runtime-App wird publiziert und an ACP-Transporte angehängt,
  bevor Channel-Supervisoren starten. Worker benötigen während des Bootstrap
  die Runtime-`/capabilities`-Route und können Channel-Traffic erhalten,
  sobald sie verbunden sind, daher müssen ihre Daemon-Session-Routen bereits
  verfügbar sein. Dies entspricht der bestehenden
  Single-Workspace-Reihenfolge auf `main`; `runtimeReady` settled weiterhin
  erst, nachdem jeder angeforderte Supervisor ready erreicht hat.
- Ein Channel-Worker-Startfehler bleibt fatal. Die Runtime-Publikation wird
  zurückgezogen, bevor Gruppe, Pidfile, Bridges und Listener abgebaut werden;
  ein Runtime-Start-Timeout während der Worker-Phase folgt demselben Pfad,
  statt einen lauschenden Daemon zurückzulassen. Die Gruppen-Stornierung
  verhindert zudem, dass ein späterer Workspace-Supervisor startet, nachdem
  dieser Teardown begonnen hat.
- Die Pidfile-Reservierung behält die aggregierten Channel-Namen;
  Shutdown-Pfade (`stopChannelWorkerAfterFailedStartup`, `killAllSync`,
  normaler Shutdown) fanen zur Gruppe aus.

Regressionsrisiko: Für einen einzelnen Workspace wandert der
Erzeugungszeitpunkt vom Listen-Callback nach `completeRuntimeStartup`.
Bestehende Channel-Tests in `run-qwen-serve.test.ts` (injizierte Factory,
Pidfile-bei-Ready, Second-Signal-Force-Kill) müssen grün bleiben. Die
Multi-Workspace-Orchestrierungs-Coverage probt zudem die
Live-Daemon-`/capabilities`-Route vom Supervisor-Start, sodass die
Runtime-/Worker-Reihenfolge nicht hinter einer injizierten
Ready-only-Factory regressieren kann.

## Boot-Verhalten

- Single-Workspace: identisch zu heute.
- Multi-Workspace + `--channel names`: nach Owner gruppiert, ein Worker pro
  vertrauenswürdigem Workspace; null / mehrere Owner / nicht vertrauenswürdig
  -> ein klarer Boot-Fehler (kein Halb-aktiviert).
- Multi-Workspace + `--channel all`: nur primärer Worker, mit einem
  Stderr-Hinweis, dass Non-Primary-Channels nicht gehostet werden.

## Kompatibilität und Einschränkungen

- Single-Workspace ist unverändert; alte Pidfile-/Status-Reader behalten
  `channels`/`workerPid`/`channelWorker`.
- Betreiber-Hinweise: Um einen Channel in einem Non-Primary-Workspace zu
  hosten, definiere ihn in der eigenen `.qwen/settings.json` dieses
  Workspaces (kein `cwd` nötig) oder definiere ihn in einem beliebigen Scope
  mit einem expliziten `cwd` gleich dem Workspace-Pfad. Ein
  User-/System-Scope-Channel ohne `cwd` muss im Multi-Workspace-Modus
  disambiguiert werden, sonst gibt der Daemon einen Boot-Fehler aus.
- v1-Einschränkungen: mehrdeutige/gleichnamige Channels benötigen eine
  zukünftige explizite Syntax; `--channel all` ist Primary-only; der
  Single-Daemon-Auswirkungsradius deckt die Worker aller Workspaces ab; ein
  Daemon-Token deckt alle Workspaces ab.

## Offene Fragen

- Sollten mehrdeutige Channels über eine explizite
  `--channel <workspace>:<name>`-Syntax auflösbar sein, statt einen
  Boot-Fehler auszugeben?
- Sollte `--channel all` irgendwann über alle Workspaces ausfanen?

## Außerhalb des Umfangs

- Voice `/workspaces/:workspace/voice/stream` und Pro-Workspace-Voice.
- dynamisches Workspace-Hinzufügen/-Entfernen (Phase 5).
