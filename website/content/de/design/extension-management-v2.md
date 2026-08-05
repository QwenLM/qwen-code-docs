# Extension-Management V2

## Status

Dieses Design erweitert das Daemon-Protokoll `v1` unter der additiven
Capability `extension_management_v2`. Die bereits veröffentlichte
Capability `workspace_extensions` und die Routen `/workspace/extensions/*`
bleiben als Primär-Workspace-Kompatibilitätsadapter verfügbar.

## Ressourcenmodell

Eine installierte Extension ist ein User-Level-Artefakt in
`QWEN_HOME/extensions`. Aktivierung ist Policy, keine zweite Kopie dieses
Artefakts:

1. Ein exakter Workspace-Override (`enabled` oder `disabled`).
2. Eine interne exakte `inherit`-Maske, die bei der Migration von
   Legacy-Pfadregeln erstellt wurde.
3. Eine geordnete V1-Pfadregel.
4. Der globale Default.

Die Workspace-Identität verwendet den kanonischen Workspace-Pfad des
Daemons. Eine Workspace-Route wählt eine bestehende Runtime zuerst nach
Workspace-Id und dann nach kanonischem cwd aus. Lesezugriffe sind für nicht
vertrauenswürdige Runtimes erlaubt; Aktivierungsänderungen, Refresh und
Workspace-bezogene Installationen erfordern ein vertrauenswürdiges Ziel.
Globale Mutationen verwenden die normale Daemon-Mutations-Authentifizierung
und die Installations-Zustimmung, nicht den Trust-Zustand des Workspaces,
der die Anfrage initiiert hat.

## Store- und Transaktionsgrenze

`ExtensionStore` ist der einzige Writer der finalen Extension-Verzeichnisse
und des V2-Aktivierungszustands. `ExtensionManager` bleibt die
Workspace-zugewandte Fassade, aber CLI, TUI, Auto-Update, Daemon und
SDK-gestützte Operationen delegieren Mutationen an den Store.

Das Layout ist:

```text
~/.qwen/
├── extensions/
└── extension-store/
    ├── lock
    ├── state.json
    ├── state.previous.json
    ├── staging/
    ├── rollback/
    └── transactions/
```

Der Store und die Artefakte teilen sich ein Dateisystem, sodass
Artefakt-Austausche Verzeichnis-Umbenennungen sind. Ein In-Prozess-Mutex
und ein `proper-lockfile`-Lock serialisieren Commits über alle V2-fähigen
Prozesse hinweg. Jede Mutation liest den Zustand erneut, während sie den
Lock hält, und inkrementiert eine monotone Generation, um verlorene Updates
zu verhindern.

Die Vorbereitung von Installation/Update erfolgt außerhalb des finalen
Artefakt-Verzeichnisses. Der Commit schreibt ein `prepared`-Journal,
verschiebt das alte Artefakt in den Rollback, verschiebt das Staging an
seinen Platz und schreibt `state.json` atomar. Diese State-Umbenennung ist
der Commit-Punkt. Davor rollt die Recovery zurück; danach schließt die
Recovery nur Projektion und Cleanup ab. Eine committete Policy wird niemals
zurückgerollt, weil ein Runtime-Refresh fehlgeschlagen ist. Wenn sowohl
eine Pre-Commit-Operation als auch ihr Rollback fehlschlagen, erhält der
Aufrufer beide Fehler und das Journal verbleibt für die fail-closed
Recovery; der Store schreibt nicht durch einen mehrdeutigen Artefakt-Zustand
hindurch weiter.

Store-Dateien verwenden Owner-only-Berechtigungen und atomare
No-Follow-Writes. Extension-Ids, Artefakt-Pfade direkter Kinder,
Transaktionspfade und Namen werden validiert. Fehler werden mit um
Credentials bereinigten Quellen gemeldet.

## V1-Migration und Downgrade-Projektion

Der erste V2-fähige Prozess importiert die geordneten Regeln aus
`extension-enablement.json`, ohne die aktuelle Menge der registrierten
Workspaces als exakte Overrides zu materialisieren. V2 schreibt nach jedem
State-Commit eine kompatible Projektion und speichert ihren Hash in
`state.json`.

Unterscheiden sich die Hashes, entscheidet die Reihenfolge der Änderungen
über die Recovery-Richtung: Eine ältere Projektion wird aus dem
maßgeblichen V2-Zustand repariert; eine Projektion, die nach dem V2-Zustand
geändert wurde, wird als sequenzieller Schreibvorgang eines downgegradeten
Binaries behandelt und mit einer neuen Generation erneut importiert.
Gleichzeitige V1- und V2-Writer, die sich ein `QWEN_HOME` teilen, werden
bewusst nicht unterstützt.

Das Löschen eines öffentlichen Workspace-Overrides löscht normalerweise den
exakten Datensatz. Würde eine ältere Pfadregel danach den effektiven Wert
ändern, schreibt der Store eine interne `inherit`-Maske, sodass DELETE
weiterhin "den globalen Standard erben" bedeutet.

## Daemon-API

Die globale Oberfläche ist:

```text
GET    /extensions
POST   /extensions/install
POST   /extensions/check-updates
POST   /extensions/:extensionId/update
DELETE /extensions/:extensionId
PUT    /extensions/:extensionId/activation
GET    /extensions/operations/:operationId
```

Eine Installation erfordert explizite Zustimmung und initiale Aktivierung:

```ts
type InitialActivation =
  | { scope: 'user' }
  | { scope: 'workspace'; workspaceId: string };
```

Der Installations-Endpunkt des Daemons akzeptiert HTTPS-Git-,
GitHub-Release- und npm-Quellen unter der Public-Network-Policy. SSH- und
lokale/Link-Quellen bleiben Features der lokalen CLI. Ein Update erhält die
Extension-Id, den Manifest-Namen, die Settings und die Aktivierungs-Policy.
"Bereits aktuell" ist ein erfolgreiches Ergebnis `updated: false`.
Uninstall ist idempotent und entfernt sowohl das Artefakt als auch die
Policy.

Die Workspace-Projektion ist:

```text
GET    /workspaces/:workspace/extensions
PUT    /workspaces/:workspace/extensions/:extensionId/activation
DELETE /workspaces/:workspace/extensions/:extensionId/activation
POST   /workspaces/:workspace/extensions/refresh
```

Sie hat bewusst keine Routen für Workspace-Artefakt-Mutationen.
Projektionseinträge enthalten den Default, den exakten Workspace-Wert, den
effektiven Wert und die Quelle. Gewünschte Generation und lokal angewandte
Generation sind Top-Level-Antwortfelder.

Potenziell langsame Mutationen geben `202`, `Location` und `Retry-After`
zurück. Der Operationsdatensatz liegt im lokalen Speicher des Daemons,
behält höchstens 100 terminale Datensätze und kann bei einem Neustart
verloren gehen. Die Catalog-/Store-Recovery ist maßgeblich. Der
Polling-Timeout des SDK stoppt nur das Polling; er bricht niemals
akzeptierte Arbeit ab.

Der Daemon lässt höchstens 10 unvollendete Extension-Operationen zu. Eine
daemon-weite FIFO-Vorbereitungs-Queue führt höchstens zwei Downloads,
Extraktionen, Konvertierungen oder Update-Checks für eine einzelne
Extension gleichzeitig aus. Installation und Update verwenden einen
expliziten `prepare -> commit/dispose`-Lifecycle: Die Vorbereitung besitzt
Staging-Dateien und versionierte Credential-Snapshots, ändert aber nicht
den Store, den Cache, die Runtime oder die Credentials, die vom
installierten Artefakt ausgewählt wurden. Vorbereitete Mutationen treten in
der Reihenfolge, in der die Vorbereitung abgeschlossen wird, in eine
separate FIFO-Commit-Queue mit einfacher Parallelität ein. Aktivierung und
Uninstall treten nur in die Commit-Queue ein; check-updates tritt nur in
die Vorbereitungs-Queue ein. Manueller Refresh wird über die Commit-Queue
serialisiert. Sein HTTP-Timeout gibt diese Lane frei, sodass ein hängen
gebliebener Runtime-Refresh spätere Extension-Mutationen nicht dauerhaft
blockieren kann; der bereits gestartete Refresh kann danach trotzdem noch
abschließen. Sensible Settings werden als ein atomares Secret-Bundle unter
einer Pro-Prepare-Revision in Staging abgelegt. Ein nicht geheimer Selector
zeichnet diese Revision und das Secure-Storage-Backend innerhalb des
Staging-Artefakts auf, sodass nur der gewinnende Artefakt-Commit ein
vollständiges Bundle aktiviert. Der Store-Commit ist daher der
Durability-Punkt und gibt die Commit-Lane sofort frei. Extension-Reload,
Legacy-Settings-Synchronisation pro Key, Manager-Runtime-Refresh,
Prepared-File-Cleanup und Daemon-Runtime-Reconciliation laufen außerhalb
davon. Diese Post-Commit-Schritte belegen keinen der beiden Slots, sodass
spätere Commits fortfahren können, während eine frühere Generation noch
angewendet oder aufgeräumt wird.

Das Disposen einer vorbereiteten Mutation entfernt ihren nicht ausgewählten
Credential-Snapshot, und ein erfolgreicher Commit entfernt den zuvor
ausgewählten Snapshot als Best-Effort. Ein harter Prozessabsturz vor dem
Disposen kann einen unerreichbaren Eintrag im Secure-Backend hinterlassen;
kein Artefakt-Selector referenziert ihn, sodass er nicht aktiv werden oder
mit den committeten Credentials verwechselt werden kann.

Die Vorbereitungs-Deadline beginnt, wenn eine Operation zum ersten Mal
einen Vorbereitungs-Slot erhält, nicht während sie wartet. Ein Abbruch wird
an Netzwerk-Operationen sowie aktive Archiv-Scan- und Extraktions-Streams
propagiert. Ein gestarteter Task belegt seinen Slot weiter, bis das
zugrunde liegende Promise abgeschlossen ist, selbst wenn er den Abbruch
ignoriert. Ein Commit ist nicht abbrechbar. Vorbereitete Updates tragen die
Ziel-Artefakt-Generation: Davon unabhängige Extension- oder
Aktivierungsänderungen werden sicher rebased, während ein veraltetes Update
desselben Artefakts mit `extension_conflict` fehlschlägt.

Remote-npm-Metadaten werden mit einer Antwort-Obergrenze von 10 MiB
gestreamt. npm- und GitHub-Archive haben separate
100-MiB-Download-Obergrenzen, Request-Deadlines, Redirect-Limits und eine
Validierung der Archiveinträge vor der Extraktion.

## Runtime-Reconciliation

Ein erfolgreicher Commit invalidiert den lokalen Status und aktualisiert
die betroffenen Runtimes. Globale Artefakt-/Default-Änderungen reconcilen
alle Runtimes dieses Daemons; ein exakter Workspace-Override reconciled nur
sein Ziel. Die Runtime-Reconciliation aktualisiert den Extension- und
Skill-Cache, die Extension-Tools, das hierarchische Memory, die
System-Instruktionen aktiver Chats und die verfügbaren Befehle. Eine
fehlgeschlagene Komponente überspringt nicht die übrigen
Refresh-Komponenten; die Session-RPC meldet den kombinierten Fehler,
nachdem alle Komponenten versucht wurden. Die
Runtime-Generations-Reconciliation verwendet einen daemon-weiten FIFO, der
von Mutationen und dem Generations-Poller geteilt wird. Eine Mutation
reserviert ihre Position beim durable Commit-Callback, sodass spätere
Generationen eine Runtime nicht zuerst refreshen können, selbst wenn frühere
Post-Commit-Arbeit später fertig wird.
Die ACP-Bridge begrenzt jeden Session-Refresh auf 30 Sekunden. Überschreitet
der aggregierte Refresh weiterhin die Routen-Deadline, gibt der Controller
die Commit-Lane frei, ohne die zugrunde liegende RPC abzubrechen. Das
Anwenden von Generation N befriedigt auch Waiter für ältere Generationen,
und ein später Refresh einer niedrigeren Generation kann die angewandte
Generation daher nicht rückwärts bewegen. Ein teilweiser Refresh-Fehler
oder ein Post-Commit-Reload-/Cleanup-Fehler erzeugt
`succeeded_with_warnings` mit Workspace-spezifischen oder
Commit-Diagnosen, ohne das Artefakt zurückzurollen.

Die Legacy-Workspace-Migration behandelt ein committetes Artefakt nur dann
als fehlgeschlagen, wenn es nicht neu geladen werden konnte.
Settings-Kompatibilitätssynchronisation, Cleanup- oder
Runtime-Refresh-Warnungen lösen keinen Retry eines bereits dauerhaft
installierten Artefakts aus. Update-Aufrufer erhalten Warnungsdetails;
Kompatibilitäts- und Cleanup-Warnungen verwenden den separaten Zustand
`updated with warnings`, während Reload- oder Runtime-Refresh-Fehler
weiterhin `updated, needs restart` bleiben.

Der Extension-File-Watcher beobachtet nur `extension-store/state.json` für
die Policy-Generation und beobachtet weiterhin die Inhalte
installierter/verlinkter Extensions auf Änderungen an Commands, Skills,
Agents, Hooks und MCP. Ein 30-Sekunden-Generations-Poll repariert verpasste
Dateisystem-Events und begrenzt die Konvergenzzeit für andere Daemons, die
den Store teilen.

## Kompatibilität

`workspace_extensions` bleibt die Capability für die bestehende singuläre
Oberfläche. Ihre Handler rufen denselben Manager/Coordinator auf und passen
die Antworten an: Projekt-Aktivierung wird zu einem Primär-Workspace-Override;
Nutzer-Aktivierung behält das Legacy-Verhalten zum Löschen von Regeln;
globale Mutationen reconcilen jede lokale Runtime. Der
Legacy-Operations-Endpunkt bildet V2-Warnungsabschlüsse auf den
veröffentlichten Legacy-Refresh-Fehlerstatus zurück.

Clients müssen auf `extension_management_v2` prüfen; weder der Daemon-Modus
noch eine andere Workspace-Capability impliziert diese API. Der aufgegebene
Vorschlag `workspace_qualified_extensions` ist nicht Teil des Protokolls.

## Non-Goals

- Artefakt-Kopien pro Workspace.
- Eine Daemon-Registry oder ein Remote-Acknowledgement-Protokoll.
- Nutzer-Abbruch akzeptierter Operationen.
- Gleichzeitige Schreibzugriffe von alten Binaries und V2-fähigen Prozessen
  auf ein `QWEN_HOME`.
- Entfernen des V1-Adapters vor einer zukünftigen Protokoll-v2-Migration.
