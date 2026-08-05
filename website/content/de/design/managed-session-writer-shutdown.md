# Managed-Session-Writer-Shutdown

## Problem

Ein gemanagter `qwen serve`-Ersatz kann auf einem neuen Hostnamen starten,
während das vorherige ACP-Child noch einen Session-Writer-Lock besitzt. Ein
Fremd-Host-v1-Lock kann nicht als stale bewiesen werden, daher gibt der
Ersatz korrekterweise `session_writer_conflict` zurück. Reclaim nach
Hostname oder Alter würde zwei live Pods erlauben, dasselbe Transkript zu
schreiben.

## Scope

Dieses P0 lässt einen kooperativen Managed-Shutdown Writer-Locks vor der
SIGKILL-Deadline des Parents freigeben. Es fügt keine versiegelten
Handoff-Records, Takeover-Claims, TTL- oder Hostnamen-Übernahme,
Plattform-Fencing, Maintenance-Leases oder automatische Recovery nach einem
SIGKILL, einem Event-Loop-Stall oder einem Storage-Fehler hinzu. Historische
Fremd-Host-Locks erfordern weiterhin einen externen Writer-Zaun und manuelles
Cleanup.

Nur ein ACP-Child, das die bestehende private Parent-Capability validiert,
nutzt den Managed-Pfad. Eigenständiges ACP behält sein bestehendes
Shutdown- und lokales Stale-Owner-Recovery-Verhalten. Managed-Acquisition
reclaimed niemals einen bestehenden Lock aufgrund von PID-Sichtbarkeit, da
Container-PID-Namespaces diesen Beweis unsicher machen.

## Writer-Terminal

Writer-Close ist Single-Flight und schließt die öffentliche
Recording-Admission synchron. Normal-Close finalisiert Metadaten vor dem
Schließen und wartet auf akzeptierte Arbeit. Managed-Fast-Close wartet nicht
auf einen aktiven Modell-Turn und hängt keinen zusätzlichen Finalize-Record
an; es drainen nur Recorder-Arbeit, die vor dem Cutoff akzeptiert wurde.

Ein Flush-Fehlschlag versiegelt den Writer und wird weiterhin nach einem
Exact-Owner-Release-Versuch gemeldet, wobei der bestehende Close-Vertrag
erhalten bleibt. Ein Ownership- oder Release-Fehlschlag behält den primären
Lock, sofern der Release nicht bereits committed ist. Der einzige
Release-Commit ist ein Rename im selben Verzeichnis vom primären Lock `P` zu
einem Owner-eindeutigen Ruhestands-Pfad `R`. Der alte Owner darf nur sein
exaktes `R` bereinigen; er wiederholt niemals den primären Rename oder fasst
das `P` eines Nachfolgers an. Managed-Shutdown emittiert eine
Operator-sichtbare Warnung mit Kandidaten-Lock-Pfaden, wenn das
Writer-Terminal fehlschlägt. Manuelles Cleanup ist erst sicher, nachdem
verifiziert wurde, dass der vorherige Writer nicht mehr läuft.

## Managed-ACP-Shutdown

Die erste Shutdown-Aktion schließt Session-Erzeugung und Turn-Admission und
snapshottet aktive, initialisierende und Deferred-Cleanup-Writer-fähige
Config-Instanzen. Alle Writer-Terminals starten vor dem ersten Await und
laufen parallel. SessionEnd-Hooks laufen nach der Writer-Phase, während
Config-Ressourcen noch verfügbar sind. Ressourcen-Cleanup läuft dann mit der
verbleibenden Zeit.

Das Child exitet nur dann null, wenn jedes Writer-Terminal sauber ist. Ein
Lock kann freigegeben worden sein, während späteres Hook- oder
Ressourcen-Cleanup den Gesamt-Shutdown weiterhin unsauber macht.

### Config-Ressourcen-Quieszenz

Writer-Shutdown und Config-Ressourcen-Shutdown sind separate Terminals.
Writer-Close startet weiterhin vor dem ersten Managed-Shutdown-Await.
Ressourcen-Cleanup joint dann jedes laufende `Config.initialize()`, bevor
Ressourcen inspiziert und gestoppt werden, sodass die Initialisierung keinen
Watcher, keine Tool-Registry und keinen MCP-Manager erzeugen kann, nachdem
das Cleanup bereits zurückgekehrt ist.

Die Config-Initialisierung wird versiegelt, sobald der Shutdown startet, und
Ressourcen-Cleanup ist Single-Flight über Managed-Shutdown und paralleles
Request-Fehlschlag-Cleanup hinweg. Der vollständige
`shutdown(options)`-Aufruf ist nicht Single-Flight, da Writer- und
Telemetrie-Optionen aufrufspezifisch bleiben.

Eine unvollständig initialisierte Config startet den Exact-Owner-Release,
sobald ihr Pending-Lease exponiert ist, bevor sie die Initialisierung joint.
Transkript-Snapshot-Reads beobachten diesen Release zwischen Chunks und
stoppen, ohne einen späten Recorder zu publizieren. Eine erfolgreich
initialisierte Config behält die normale Finalize-, Flush- und Close-
Reihenfolge. Der Initialisierungs-Join hat keinen lokalen Timeout: das Warten
zu timeouten würde die darunterliegende Initialisierung weiterlaufen lassen
und späte Ressourcen-Erzeugung wieder einführen. Die Daemon-Prozess-Deadline
bleibt die harte Grenze, nachdem der Pending-Writer-Release bereits
abgeschlossen ist oder explizit fehlgeschlagen ist.

## Parent-Prozess-Lebenszyklus

Jeder Daemon-Handle besitzt eine Prozess-Registry, die von primären,
sekundären und dynamischen Workspace-Channel-Factories geteilt wird.
Spawn-Reservierung und Shutdown-Versiegelung konkurrieren synchron. Ein
erfolgreicher Spawn wird im selben Turn an die Registry angehängt.

Ein Fehler vor Nodes `spawn`-Event ohne PID ist `no_process`; nach der
Spawn-Bestätigung beweist nur ein roher `exit` das Reaping. Ein
Post-Spawn-Channel-Konstruktionsfehler SIGKILLt sofort das noch nicht
publizierte Child und joint das Channel-Terminal, bevor der
Konstruktionsfehler zurückgegeben wird. Nachdem eine Channel-Factory
zurückgekehrt ist, besitzt die Bridge den Channel, bevor sie sein
vollständiges ChannelInfo konstruiert oder publiziert.

Der Daemon-Shutdown verwendet eine monotone
Prozess-Registry-Zeitachse: SIGTERM bei `t0`, stabiler unsauberer Shutdown,
wenn das Child nicht-null oder per Signal exitet, SIGKILL bei `t0 + 5s` und
stabiler `not_reaped`-Fehlschlag bei `t0 + 10s`. Ein Null-Exit ist die
kooperative Writer-Terminal-Bestätigung des Managed-Childs; ein roher Exit
allein beweist nur Reaping. Die Registry-Deadlines starten nie neu, und ein
später roher Exit kann sein fehlgeschlagenes Terminal nicht in Erfolg
ändern. Der Daemon behält seinen bestehenden Retry-Pfad für einen unabhängig
gemanagten Channel-Worker, der später reapable wird; ein solcher Retry joint
dasselbe settled ACP-Prozess-Registry-Terminal, statt eine neue
ACP-Shutdown-Zeitachse zu starten.

Die Parent-Deadline erweitert sich bewusst nicht, um SessionEnd-Hook-,
Config-Initialisierungs- oder MCP-Cleanup-Budgets zu entsprechen, da das
Plattform-Terminierungsfenster kürzer sein kann und außerhalb der Kontrolle
des Daemons liegt. Diese Post-Writer-Phasen nutzen die nach Writer-Release
verbleibende Zeit und dürfen unterbrochen werden, was einen unsauberen
Daemon-Exit erzeugt, ohne den freigegebenen Writer-Lock wiederherzustellen.
Nur ein unbestätigter Channel-Worker-Exit hält den Daemon für einen zweiten
Graceful-Shutdown-Versuch am Leben; andere ACP- oder Bridge-Fehlschläge
exiten beim ersten Signal nicht-null.

## Kompatibilität und Rollout

Die private Capability und öffentliche ACP/REST-Payloads ändern sich nicht.
Eine eigene asynchrone ChannelFactory ist erst abgedeckt, nachdem sie einen
AcpChannel aufgelöst hat; die Default-Managed-Factory ist ab
Spawn-Reservierung abgedeckt.

Mixed-Version-Writer-Betrieb bleibt nicht unterstützt. Deployment und
Rollback müssen alte ACP-Writer drainen, bevor der Ersatz Sessions
akzeptiert.

## Verifikation

Die Verifikation muss unterscheiden:

1. Lock freigegeben und der gesamte Daemon-Shutdown ist sauber;
2. Lock freigegeben, aber späteres Cleanup macht den Shutdown unsauber; und
3. Lock behalten, Nachfolger erhält 409, und manuelle Recovery bleibt
   erforderlich.

Erforderliche deterministische Abdeckung umfasst Flush-Fehlschlag,
Rename-Fehler-nach-Effekt, Nachfolger-Acquisition, Normal-zu-Fast-Close,
Acquisition an jeder Cutoff-Grenze, asynchroner `ENOENT`-Spawn-Fehlschlag,
Post-Spawn-Fehler, partielle Channel-Konstruktion, vor-aufgelöster
Channel-Exit mit gepufferter Initialize-Response, D1/D2- und
Roher-Exit-Rennen, später Exit, zwei Signale, Multi-Runtime-Parallel-
Shutdown, Shutdown während Config-Initialisierung, paralleles Config-Cleanup,
Initialisierung nach Shutdown-Admission, eigenständiges ACP und
Mixed-Version-Rollout-Guardrails.
