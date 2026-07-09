# LSP Runtime Hot Reload Design

## Hintergrund

Dieses Design folgt der gleichen Schichtung wie in `mcp-runtime-reinitialization.md` beschrieben: Die CLI entscheidet, wann Reloads ausgelöst werden, und Core entscheidet, wie der Runtime-Status aktualisiert wird. Es verwendet auch die Watcher-Prinzipien aus `settings-change-detection.md` wieder: keine Dateisystem-Nebeneffekte beim Start, Änderungen mit Debouncing, semantische Diffs, serialisierte Listener und Listener-Fehler, die die Hauptsitzung nicht beeinträchtigen.

Der Hauptunterschied zwischen LSP und MCP besteht darin, dass die LSP-Serverkonfiguration nicht in `settings.json` gespeichert ist. Heute verwendet der native LSP-Service `LspConfigLoader`, um die Workspace-`.lsp.json` und die `lspServers`-Deklarationen aktivierter Erweiterungen zu lesen, das Ergebnis über `NativeLspService.discoverAndPrepare()` in den Single-Session-`LspServerManager` zu schreiben und schließlich alle konfigurierten Server mit `start()` zu starten. Daher kann `SettingsWatcher` allein keine Änderungen an der Workspace-`.lsp.json` erkennen.

## Aktuelle Code-Bewertung

- Der LSP-Start wird nur durch `--experimental-lsp` in `packages/cli/src/config/config.ts` gesteuert. Es gibt derzeit kein `--allowed-lsp-server-names`-Flag oder einen entsprechenden LSP-CLI-Allow-List-Parameter; das vorhandene `--allowed-mcp-server-names`-Flag ist nur für MCP.
- `NativeLspService` wird einmal während des Ladens der CLI-Konfiguration instanziiert. Der Startpfad ruft `discoverAndPrepare()` auf, dann `start()`, wickelt den Service in `NativeLspClient` ein und hängt ihn an `Config` an.
- `Config.setLspClient()` und `Config.setLspInitializationError()` werfen derzeit nach der Initialisierung eine Exception, daher sollte das Runtime-Hot-Reload das Client-Objekt nicht ersetzen. Es sollte den vorhandenen `NativeLspClient` beibehalten und nur den dahinterliegenden Service inkrementell abgleichen.
- `LspConfigLoader` liest nur die Workspace-`.lsp.json` und die `lspServers` aktiver Erweiterungen. Die Workspace-`.lsp.json` überschreibt die Erweiterungskonfiguration nach Servername.
- `LspServerManager.setServerConfigs()` löscht derzeit alle Handles; es unterstützt noch keinen inkrementellen Abgleich.
- Das aktuelle Repository verfügt über keinen gemeinsamen Pool-Pfad für LSP. Jede Sitzung besitzt ihren eigenen `NativeLspService` sowie Subprozess-/Socket-Verbindungen. Das Design sollte eine Grenze für einen zukünftigen gemeinsamen Pool offen lassen, aber v1 implementiert nur den Single-Session-Modus.

## Ziele

Änderungen an der LSP-Serverkonfiguration wirksam machen, ohne die aktuelle Qwen Code-Sitzung neu zu starten:

- einen Server starten, wenn er hinzugefügt wird;
- einen Server stoppen, wenn er entfernt wird, und ihn aus dem Status und Tool-Routing entfernen;
- nur den geänderten Server neu starten, wenn sich seine Konfiguration ändert;
- unveränderte Server verbunden lassen und ihren Warm-up-Status beibehalten;
- niemals Server starten, die nicht vertrauenswürdig oder nicht erlaubt sind;
- LSP-Tools und dem `/lsp`-Status ermöglichen, den neuen Runtime-Status über das vorhandene Client-Objekt zu beobachten.

## Nicht-Ziele

- In dieser Änderung wird kein gemeinsamer LSP-Prozess-Pool hinzugefügt.
- Das Umschalten von `--experimental-lsp` zur Laufzeit wird nicht unterstützt. Wenn LSP beim Start nicht aktiviert wurde, gibt es keinen Service zum Neuladen.
- Installations-/Deinstallationsänderungen von Erweiterungen, die `lspServers` betreffen, werden nicht vollständig überwacht; ein manuelles `/reload` deckt Änderungen an der Erweiterungskonfiguration ab.

## Design

### 1. Jeden LSP-Server mit einem stabilen Hash identifizieren

Füge einen kleinen Helper in der Nähe des LSP-Config-Codes hinzu:

```ts
export function lspServerConfigHash(config: LspServerConfig): string;
```

Der Hash muss stabil sein und auf der normalisierten Runtime-Konfiguration basieren, die von `LspConfigLoader` erzeugt wird:

- `name`
- `languages`
- `transport`
- `command`
- `args`
- `env`
- `initializationOptions`
- `settings`
- `extensionToLanguage`
- `workspaceFolder`
- `rootUri`
- `startupTimeout`
- `shutdownTimeout`
- `restartOnCrash`
- `maxRestarts`
- `trustRequired`
- `socket`

Objektschlüssel müssen sortiert werden, damit die JSON-Property-Reihenfolge keine unnötigen Neustarts verursacht. Die Array-Reihenfolge bleibt signifikant, da die Reihenfolge der Befehlsargumente und die Sprachpriorität bedeutsam sein können. Schließe keine Laufzeitfelder wie Prozess-ID, Status, Neustart-Zähler, Diagnostik oder Warm-up-Status ein.

Für die zukünftige Shared-Pool-Kompatibilität definiere die Pool-Identität als:

```text
lsp:<workspaceRoot>:<serverName>:<configHash>
```

Der v1-Single-Session-Manager muss nur `serverName -> configHash` verwalten, aber derselbe Hash kann später direkt im Pool-Key wiederverwendet werden.

### 2. Inkrementellen Abgleich zu `LspServerManager` hinzufügen

Hot Reload sollte nicht `setServerConfigs()` wiederverwenden, da dies jedes Handle löscht. Füge hinzu:

```ts
async reconcileServerConfigs(
  configs: LspServerConfig[],
): Promise<LspReconcileResult>
```

Ablauf:

1. Erstelle die gewünschten Maps: `name -> config` und `name -> hash`.
2. Rufe für vorhandene Handles, deren Server nicht mehr existiert, das vorhandene `stopServer()` auf und lösche dann das Handle.
3. Rufe für vorhandene Handles, deren Hash sich geändert hat, `stopServer()` auf, ersetze das Handle durch `{ config, status: 'NOT_STARTED' }` und starte es dann.
4. Erstelle für neue Server `{ config, status: 'NOT_STARTED' }` und starte sie.
5. Tue für Server, deren Hash sich nicht geändert hat, nichts und behalte das vorhandene Handle.

Füge ein privates Feld hinzu:

```ts
private serverConfigHashes = new Map<string, string>();
```

Lösche es in `stopAll()` und `clearServerHandles()`.

Rückgabe:

```ts
interface LspReconcileResult {
  added: string[];
  removed: string[];
  restarted: string[];
  unchanged: string[];
  failed: string[];
}
```

`skipped` ist nicht Teil des `LspServerManager`-Ergebnisses. Der Manager verarbeitet nur Konfigurationen, die die Zulassung bestanden haben; Server, die von der Zulassung abgelehnt wurden, werden von `NativeLspService.reinitialize()` im Ergebnis auf Service-Ebene aggregiert.

Nebenläufigkeit:

- Füge eine Reconcile-Queue in entweder `LspServerManager` oder `NativeLspService` hinzu, damit Abgleiche serialisiert ausgeführt werden. Das Stoppen und Starten desselben Prozesses darf nicht zu Race Conditions führen.
- Wenn eine neue Konfiguration eintrifft, während ein Server noch startet, warte auf `handle.startingPromise`, bevor du ihn stoppst. Verwende den vorhandenen Startup-Lock wieder, anstatt einen zusätzlichen Lock pro Server hinzuzufügen.
- `stopServer()` selbst muss nach dem Setzen von `stopRequested` auf `handle.startingPromise` warten, sodass die Pfade `stopAll()`, Entfernen und Neustarten alle Crash-Neustarts abdecken, die noch ihre Verbindung/ihren Prozess zuweisen.

Fehlerverhalten:

- Wenn das Starten eines neu hinzugefügten oder geänderten Servers fehlschlägt, behalte das Handle und markiere es als `FAILED`, damit `/lsp` den Fehler erklären kann.
- Zähle einen fehlgeschlagenen Start nicht als `added` oder `restarted`; melde ihn in `failed`.
- Cache den Konfigurations-Hash nicht für einen fehlgeschlagenen Start. Ein späteres Speichern mit derselben Konfiguration muss es erneut versuchen, anstatt als `unchanged` klassifiziert zu werden.
- Wenn der Start fehlschlägt, nachdem eine Verbindung oder ein Prozess erstellt wurde, gib diese Verbindung/diesen Prozess vor der Rückgabe frei. Eine fehlgeschlagene Initialisierung darf keinen Language-Server-Prozess oder eine Socket-Verbindung hinter einem `FAILED`-Handle am Leben lassen.
- Wenn der Start vor der Erstellung der Verbindung fehlschlägt, einschließlich Trust-Ablehnung, unsicherem Befehlspfad oder fehlendem Befehl, lösche den gecachten Konfigurations-Hash. Ein späterer Abgleich mit derselben Konfiguration muss es erneut versuchen, anstatt das fehlgeschlagene Handle als unverändert zu behandeln.
- Wenn ein entfernter Server beim Herunterfahren einen Fehler loggt, lösche ihn trotzdem aus der Handle-Map.
- Der Startfehler eines Servers darf den Abgleich für andere Server nicht blockieren.

Ressourcenbereinigung:

- `stopServer()` muss beide Seiten eines verwalteten Servers freigeben: fahre ordnungsgemäß herunter und beende die LSP-Verbindung, und beende dann den erzeugten Prozess, wenn er noch am Leben ist. Dies ist wichtig für `tcp`-/`socket`-Transports, die mit einem `command` gestartet wurden; das Schließen des Sockets allein reicht nicht aus.
- `process.kill()` muss mit einer eigenen Fehlerbehandlung isoliert werden. Ein Prozess, der während der Bereinigung beendet wird, darf den Rest des Abgleichs nicht abbrechen.
- Das ordnungsgemäße Herunterfahren muss immer ein begrenztes Warten haben. Wenn die Serverkonfiguration `shutdownTimeout` nicht angibt, verwende das Standard-Shutdown-Timeout, anstatt ewig auf `connection.shutdown()` zu warten.
- Shutdown-Timeout-Timer müssen gelöscht werden, wenn das Herunterfahren abgeschlossen ist oder fehlschlägt, damit ein großes Timeout das Handle nicht länger als nötig zurückhält.
- Das zugrunde liegende `shutdown()`-Promise muss beobachtet werden, auch wenn das Timeout das Rennen gewinnt, damit eine späte serverseitige Rejection nicht als Unhandled Rejection auftaucht.
- `stopAll()` muss an derselben Reconcile-Queue wie Hot Reload teilnehmen. Es reicht nicht aus, auf die aktuelle Queue zu warten und dann die Handles zu iterieren, da sonst ein neuer Abgleich zwischen dem Warten und der Handle-Bereinigung eintreten könnte.
- `NativeLspService.stop()` muss auch jede laufende oder in der Queue befindliche `reinitialize()`-Operation abbrechen, bevor Server gestoppt werden. Die Implementierung verwendet kooperatives Cancellation mit `AbortController`: Stop markiert den Service als stopping, bricht den aktiven Reload ab, und jeder Reload in der Queue prüft das Signal, bevor er Konfigurationen lädt, abgleicht, Document-Tracking löscht, Dokumente replayed oder auf Replay-Verzögerungen wartet. Dies verhindert, dass das Herunterfahren bei einem langsamen Reload unbegrenzt blockiert, und verhindert gleichzeitig, dass ein abgebrochener Reload nach `stopAll()` neue LSP-Prozesse startet.
- Crash-Neustarts müssen ebenfalls über die Reconcile-Queue serialisiert werden oder den Hash löschen, wenn sie dauerhaft fehlschlagen. Sie dürfen keinen Ersatzprozess parallel zu einem Konfigurationsänderungs-Abgleich starten.
- Der Crash-Neustart-Reset muss `connection.end()`- und `process.kill()`-Fehler isolieren. Der Reset läuft, wenn die alte Verbindung/der alte Prozess bereits defekt sein könnte, und Bereinigungsfehler dürfen den fortgesetzten Neustart in der Queue nicht verhindern.
- `NativeLspService.stop()` muss `openedDocuments` und `lastConnections` nach `serverManager.stopAll()` löschen, damit ein gestoppter Service keine alten Dokumentenmengen oder Verbindungsobjekte zurückbehält.

### 3. `NativeLspService.reinitialize()` hinzufügen

Füge hinzu:

```ts
async reinitialize(): Promise<LspServiceReinitializeResult>
```

Ablauf:

1. Wenn `requireTrustedWorkspace` wahr ist und `!config.isTrustedFolder()`, rufe `serverManager.stopAll()` auf und kehre zurück. Dies verhindert, dass alte LSP-Prozesse weiterlaufen, nachdem der Workspace nicht mehr vertrauenswürdig ist.
2. Verwende den vorhandenen `LspConfigLoader`, um die Workspace-`.lsp.json` und Erweiterungskonfigurationen zu laden.
3. Führe Konfigurationen unter Verwendung der aktuellen Priorität zusammen.
4. Wende den LSP-Zulassungsfilter vor dem Abgleich an.
5. Rufe `serverManager.reconcileServerConfigs(serverConfigs)` auf.
6. Lösche `openedDocuments` und `lastConnections` nur für entfernte und erfolgreich neu gestartete Server; behalte den Dokumentenstatus für unveränderte und fehlgeschlagene Server. Fehlgeschlagene Server behalten ihr Document-Tracking, damit ein späterer erfolgreicher Neustart dieselben offenen Dokumente replayen kann.
7. Für erfolgreich neu gestartete Server: Replay `textDocument/didOpen` für Dokumente, die vor dem Neustart geöffnet waren. Dies gibt dem Ersatzserver denselben Dokumentenkontext, ohne auf den nächsten Hover-, Completion- oder Diagnostic-Request zu warten, um jede Datei lazy erneut zu öffnen. Warte nach dem Replayen eines oder mehrerer Dokumente für einen Server auf dieselbe Document-Open-Verzögerung, die von lazy `ensureDocumentOpen()` verwendet wird, bevor der Abschluss des Reloads gemeldet wird.

Das Open-Document-Snapshot muss erstellt werden, nachdem `reconcileServerConfigs()` zurückkehrt, und muss auf `reconcile.restarted` beschränkt sein. Dokumente, die geöffnet werden, während der Abgleich aussteht, werden dann in den Replay-Snapshot aufgenommen, bevor das Tracking für neu gestartete Server gelöscht wird.

Die anfängliche Erkennung sollte denselben Zulassungsfilter verwenden, bevor `setServerConfigs()` aufgerufen wird. Dies hält den Start- und Hot-Reload-Status konsistent für die serverbezogene `trustRequired`-Filterung in nicht vertrauenswürdigen Workspaces.

`.lsp.json`-Parse-Fehler benötigen eine spezielle Behandlung: Behandle einen Parse-Fehler nicht als leere Konfiguration. Der Watcher sollte ein Invalid-Config-Event melden, damit die CLI einen für den Benutzer sichtbaren Fehler anzeigen kann, aber er darf für dieses Event nicht `reinitialize()` aufrufen. `reinitialize()` sollte den alten Runtime-Status beibehalten, den Abgleich überspringen und den Fehler in Status/Logs schreiben. Nur das Löschen der Datei oder das Parsen einer gültigen leeren JSON-Konfiguration bedeutet, dass die gewünschte Konfiguration leer ist.

Kaltstart und Hot Reload verwenden absichtlich unterschiedliche Strenge beim Parsen der Benutzerkonfiguration:

- `loadUserConfigs()` bleibt für die Startkompatibilität nachsichtig. Es überspringt ungültige Servereinträge und gibt die gültigen Einträge zurück, die gebaut werden können.
- `loadUserConfigsStrict()` wird von Hot Reload verwendet. Wenn die vorhandene `.lsp.json` syntaktisch gültig ist, aber eine ungültige Top-Level-Form oder einen Servereintrag enthält, der nicht gebaut werden kann, gibt sie einen Fehler zurück und `reinitialize()` führt keinen Abgleich durch. Dies erhält den aktuell laufenden LSP-Status bei ungültigen Bearbeitungen. Der strikte Pfad darf keine Validierung auf Feldebene einführen, die der Kaltstart nicht ebenfalls erzwingt, da dies eine Konfiguration beim Start gültig, aber beim nächsten Speichern ungültig machen würde. Die Verschärfung der Validierung bekannter Felder sollte als separate Kompatibilitätsentscheidung sowohl für den Start als auch für Hot Reload behandelt werden. Wenn die Datei fehlt oder während des strikten Ladens gelöscht wird, behandle dieses `ENOENT` als gültige leere Benutzerkonfiguration, da das Löschen von `.lsp.json` der explizite Weg ist, um alle Workspace-Benutzer-LSP-Server zu entfernen.
`NativeLspService.reinitialize()` gibt ein Ergebnis auf Service-Ebene zurück:

```ts
interface LspServiceReinitializeResult {
  reconcile: LspReconcileResult;
  skipped: Array<{
    name: string;
    reason: 'server_trust_required';
  }>;
}
```

Füge eine optionale `reinitialize()`-Methode zu `NativeLspClient` hinzu und delegiere an den Service. Um intransparente Typ-Assertions in `Config.reinitializeLsp()` zu vermeiden, erweitere die `LspClient`-Schnittstelle direkt:

```ts
reinitialize?: () => Promise<LspServiceReinitializeResult>;
```

Zu `Config` hinzufügen:

```ts
async reinitializeLsp(): Promise<LspServiceReinitializeResult | undefined>
```

Wenn LSP deaktiviert ist oder kein Client existiert, ist dies ein No-Op. Diese Methode darf den Client nach `Config.initialize()` nicht ersetzen.

Da `setLspInitializationError()` derzeit Aufrufe nach der Initialisierung ablehnt, füge einen zur Laufzeit sicheren privaten State-Setter hinzu:

```ts
private setRuntimeLspInitializationError(error: Error | string | undefined): void
```

`reinitializeLsp()` nutzt dies, um Reload-Fehler über `getLspStatusSnapshot()` sichtbar zu machen, ohne die öffentliche Client-Mutations-API nach der Initialisierung aufzuweichen. Ein zurückgegebenes Reconcile-Ergebnis mit `failed` Servern ist ein teilweiser Fehler und kein vollständiger Erfolg. `reinitializeLsp()` muss für diesen Fall `initializationError` setzen und den Fehler nur löschen, wenn der Reload keine fehlgeschlagenen Server aufweist.

### 4. Admission und Permission Boundary

Die aktuellen LSP-Sicherheitsprüfungen umfassen:

- `--experimental-lsp` ist der einzige Aktivierungsschalter;
- Workspace-Trust wird vor der Discovery/dem Start geprüft;
- `trustRequired` ist für jeden Server standardmäßig auf true gesetzt;
- Die Existenz des Befehls und die Sicherheit des Befehlspfads werden vor dem Spawnen geprüft;
- `workspaceFolder` ist auf das Workspace-Root eingeschränkt.

Hot-Reload muss diese Prüfungen beibehalten und vor dem Start eines neuen Servers oder dem Neustart eines geänderten Servers abschließen. Die wichtigste Regel lautet: Nicht zuerst spawnen und erst später entscheiden, ob der Server erlaubt ist.

Die Workspace-`.lsp.json` ist eine vom Workspace kontrollierte Eingabe. Benutzerkonfigurationen müssen daher immer als `trustRequired: true` behandelt werden, selbst wenn die Datei explizit `"trustRequired": false` deklariert. Von Erweiterungen bereitgestellte LSP-Konfigurationen dürfen weiterhin ihren deklarierten `trustRequired`-Wert verwenden. Dies verhindert, dass ein nicht vertrauenswürdiger Workspace seine eigene Trust-Boundary herabsetzt.

Umgebungsvariablen aus `.lsp.json` werden ebenfalls vom Workspace kontrolliert. Runtime-Spawn darf erlaubte Env-Overrides zusammenführen, aber Code-Injection-Variablen wie `NODE_OPTIONS`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES` und `DYLD_LIBRARY_PATH` dürfen nicht durch die LSP-Konfiguration überschrieben werden. `PATH` ist für den eigentlichen Serverprozess erlaubt, um gängige Toolchain-Setups zu erhalten. Das Prüfen der Befehlsextistenz darf reguläre, von der Konfiguration bereitgestellte Env-Werte beibehalten, die Probes benötigen könnten, aber es darf den von der Konfiguration bereitgestellten `PATH` nicht beim Auflösen von reinen Befehlsnamen verwenden. Dies verhindert, dass ein bösartiger Workspace-`PATH` einen Probe wie `clangd --version` vor dem eigentlichen Startpfad auf eine unbeabsichtigte Executable umleitet. Die Filterung sensibler Env-Keys, einschließlich des nur für Probes geltenden `PATH`-Filters, muss Case-insensitive erfolgen, damit Windows-typische Case-insensitive Umgebungsnamen wie `Path`, `node_options` oder `Ld_PreLoad` die Denylist nicht umgehen können.

Allowlist-Boundary:

- Das aktuelle Repository unterstützt keine CLI-Allowlist für LSP-Servernamen. Ich habe bestätigt, dass LSP nur `--experimental-lsp` hat; Allowlist-Parameter sind nur für MCP.
- Wenn dieses Feature `--allowed-lsp-server-names` hinzufügt, muss es sich wie die MCP-Startup-Allowlist verhalten und als Obergrenze für die gesamte Sitzungsdauer fungieren. Die Runtime-Konfiguration darf diese Menge einschränken, aber sie darf nicht über die CLI-Startup-Obergrenze hinaus erweitern.
- Speichere die Startup-Obergrenze in `ConfigParameters.lsp`:

```ts
cliAllowedLspServerNames?: string[];
```

Mache einen Getter dafür verfügbar. Lies die Obergrenze nicht aus veränderlichen Einstellungen.

Admission sollte in eine Pure Function extrahiert werden:

```ts
filterLspServerConfigs(configs, {
  workspaceTrusted,
  requireTrustedWorkspace,
  cliAllowedServerNames,
}): {
  admitted: LspServerConfig[];
  skipped: Array<{
    name: string;
    reason: 'server_trust_required';
  }>;
}
```

Auch wenn es heute keinen LSP-Approval-Store oder eine CLI-Allowlist gibt, macht dieser Helper die Security-Boundary explizit und lässt Raum für zukünftige Hash-basierte Approval-Gates. Wenn in Zukunft ein `--allowed-lsp-server-names`-Flag hinzugefügt wird, sollte es zu diesem Zeitpunkt einen `not_allowed`-Skipped-Reason hinzufügen, anstatt in v1 einen nicht verbundenen Allowlist-Pfad mitzuführen.

Die Trust-Semantik muss dem aktuellen Startup-Pfad entsprechen:

- Wenn `requireTrustedWorkspace` true ist und der Workspace nicht vertrauenswürdig ist, stoppt `NativeLspService.reinitialize()` alle Server auf der Service-Ebene und kehrt zurück. Es durchläuft nicht den Admission-Filter und behält keine alten Server.
- Wenn `requireTrustedWorkspace` false ist, unterbricht der Service nicht global, aber der Admission-Filter überspringt weiterhin einzelne Server mit `trustRequired: true`.
- Wenn der Workspace vertrauenswürdig ist, blockiert `trustRequired` den Server nicht.

### 5. Triggering

Es werden zwei Trigger-Pfade benötigt.

#### Automatischer Workspace-`.lsp.json`-Trigger

Füge einen schmalen `LspConfigWatcher` in der CLI hinzu, modelliert nach `SettingsWatcher`, aber mit geringerer Verantwortung:

- überwache nur das Workspace-Root und matche strikt den Basenamen `.lsp.json`;
- erstelle kein Verzeichnis und keine Datei;
- debounce für 300 ms;
- vergleiche `.lsp.json` vor/nachher mittels Parse + Canonicalize, damit rein formatierungsbedingte Änderungen keinen Reload auslösen;
- behandle `ENOENT` als Löschung;
- unterscheide JSON-Parse-Fehler von anderen Lese-Fehlern. Beide sollten den Listener mit einem für den Benutzer sichtbaren Invalid-Config-Event benachrichtigen und den alten Runtime-State beibehalten, aber die Fehlermeldung muss widerspiegeln, ob die Datei ungültiges JSON war oder nicht lesbar;
- das Löschen von Dateien ist ein separates Event und sollte den Reload-Listener benachrichtigen, wodurch eine leere Workspace-Konfiguration erzeugt wird;
- führe Callbacks seriell aus;
- verwende Listener-Timeout und Fehlerisolierung passend zu `SettingsWatcher`;
- advance den gespeicherten semantischen Snapshot erst, nachdem die Listener-Benachrichtigung erfolgreich war. Wenn der Listener einen Fehler wirft oder ein Timeout auftritt, behalte den vorherigen Snapshot, damit das erneute Speichern desselben Inhalts den Reload wiederholt.

Registriere den Watcher nur, wenn `config.isLspEnabled()` und der Client `reinitialize()` unterstützt. Bei einer Änderung, rufe auf:

```ts
await config.reinitializeLsp();
```

Emittiere dann ein explizites Runtime-Event wie `AppEvent.LspStatusChanged`. UI-Oberflächen wie `/lsp`, `/about` oder `/status` können dieses Event abonnieren, um sich zu aktualisieren. Wenn Reconcile teilweise Fehler zurückgibt, emittiere das Status-Changed-Event, bevor der Fehler an den Watcher zurückgeworfen wird; so kann die UI erfolgreich neu gestartete Server beobachten, während der Watcher weiterhin den alten semantischen Snapshot für einen Retry behält. Zeige bei einem Fehler auch einen für den Benutzer sichtbaren Fehler über `AppEvent.LogError` an; füge die zugrunde liegende Parser/Startup-Fehlermeldung hinzu, falls verfügbar, und schreibe nicht nur einen Debug-Log.

#### Manueller `/reload`-Trigger

Wenn der zukünftige `/reload`-Befehl eingeführt wird, sollte er beide aufrufen:

```ts
await config.reinitializeMcpServers(...);
await config.reinitializeLsp();
```

Manual Reload bietet auch den Fallback-Pfad für Änderungen an `lspServers` der Erweiterung, da diese Änderungen möglicherweise nicht auf ein Workspace-`.lsp.json`-Datei-Event abgebildet werden können.

## Single Session und Shared Pool

Aktueller Stand: Es existiert nur der Single-Session-Modus. Das Repository hat kein LSP-Äquivalent zum MCP-Transport-Pool.

v1: Implementiere inkrementelles Reconcile innerhalb von `LspServerManager`. Jede Session besitzt ihren eigenen Prozess und Socket.

Zukünftiger Shared Pool: Behalte `NativeLspService` als Consumer und ersetze die Interna von `LspServerManager` durch Acquire/Release von:

```text
lsp:<workspaceRoot>:<name>:<hash>
```

Pool-Einträgen. Die Admission-Filterung muss weiterhin vor dem Acquire erfolgen, passend zum MCP-Shared-Pool-Fix, damit nicht erlaubte oder nicht vertrauenswürdige Server nicht über den Pool-Pfad gestartet werden können.

## Unit-Test-Plan

Priorisiere Unit-Tests. Integrationstests gegen echte LSP-Server sind langsam und umgebungsabhängig, daher sind sie nicht erforderlich.

### Core-Tests

`packages/core/src/lsp/configHash.test.ts`

- Hash ignoriert die Reihenfolge der Objekt-Keys;
- Änderungen an Command, Args-Reihenfolge, Env, Settings, Workspace-Folder, Socket und Trust-Anforderung ändern den Hash;
- Hash schließt Status/Process/Runtime-Felder aus.

`packages/core/src/lsp/LspServerManager.test.ts`

- das Hinzufügen eines Servers startet ihn genau einmal;
- das Entfernen eines Servers fährt ihn herunter und löscht ihn aus den Handles;
- Hash-Änderungen stoppen das alte Handle und starten ein neues Handle;
- ein unveränderter Hash stoppt/startet nicht und behält die Handle-Identität;
- ein Startup-Fehler nach der Connection-Erstellung gibt die Connection und den besessenen Prozess frei;
- das Stoppen eines über `command` gestarteten `tcp`/`socket`-Servers schließt die Connection und killt den besessenen Prozess;
- Shutdown-Timeout-Timer werden gelöscht, wenn der Shutdown zuerst abgeschlossen wird;
- ein fehlender `shutdownTimeout` verwendet weiterhin den Standard-Shutdown-Timeout und kann Reconcile nicht für immer blockieren;
- `stopAll()` wartet auf laufende Startups, bevor Ressourcen freigegeben werden;
- `stopAll()` wird über die Reconcile-Queue serialisiert und kann nicht parallel zu einem späteren Reconcile laufen;
- `process.kill()`-Fehler werden geloggt und brechen die Bereinigung nicht ab;
- ein Startup-Fehler eines Servers beeinflusst das Reconcile eines anderen Servers nicht;
- gleichzeitige Reconciles laufen seriell;
- `stopAll()` und `clearServerHandles()` leeren die Hash-Map;
- fehlgeschlagene Starts werden in `failed` gemeldet, nicht als hinzugefügt/neu gestartet, und cachen ihren Config-Hash nicht;
- initiale Startup-Fehler leeren den gecachten Hash, sodass ein späteres Reconcile mit derselben Konfiguration einen Retry durchführt;
- Crash-Restarts serialisieren sich mit Reconcile und leeren gecachte Hashes bei permanentem Fehler;
- der Crash-Restart-Reset ignoriert Connection/Process-Bereinigungsfehler und setzt den queued Restart fort;
- das Prüfen der Befehlsextistenz behält reguläre, von der Konfiguration bereitgestellte Env-Werte, verwendet aber nicht den von der Konfiguration bereitgestellten `PATH`, und Code-Injection-Env-Overrides werden vor dem Spawnen gefiltert;
- der Reconcile-Rückgabewert enthält added/removed/restarted/unchanged/failed, nicht admission skipped.

Mocke `createLspConnection`, Initialisierung und Shutdown in Tests. Starte keine echten Language Server.

`packages/core/src/lsp/NativeLspService.test.ts`

- `reinitialize()` lädt Workspace- und Erweiterungs-Konfiguration und übergibt die zusammengeführte Konfiguration an das Manager-Reconcile;
- ein `.lsp.json`-Parse-Fehler behält den alten Runtime-State und ruft kein Manager-Reconcile auf;
- striktes Hot-Reload weist ungültige Top-Level-Strukturen und Server-Einträge ab, die ohne Reconcile nicht gebaut werden können, während der Cold-Startup weiterhin gültige Einträge aus derselben Datei lädt;
- das Löschen von `.lsp.json` behandelt die Workspace-Konfiguration als leer und triggert Reconcile;
- striktes Laden behandelt `ENOENT` als leere Benutzerkonfiguration, einschließlich der Lösch-Race-Condition, bei der die Datei zwischen Watcher-Benachrichtigung und Reload verschwindet;
- ein nicht vertrauenswürdiger Workspace stoppt alle Server und führt kein Reconcile/Start durch;
- die initiale Discovery wendet denselben Pro-Server-`trustRequired`-Admission-Filter an wie Hot-Reload;
- die Workspace-`.lsp.json` kann sich nicht von `trustRequired` abmelden;
- wenn eine CLI-Allowlist implementiert ist, filtert die Obergrenze die zugelassenen Konfigurationen;
- der Rückgabewert auf Service-Ebene aggregiert die Gründe für übersprungene Admissions;
- neu gestartete/entfernte Server löschen nur ihr eigenes Document-Tracking.
- fehlgeschlagene Server löschen das Document-Tracking nicht und können diese Dokumente nach einem späteren erfolgreichen Neustart replayen.
- neu gestartete Server replayen `textDocument/didOpen` für zuvor geöffnete Dokumente, nachdem der Ersatzserver bereit ist, und warten dann auf die Document-Open-Verarbeitungsverzögerung.
- Dokumente, die geöffnet werden, während Reconcile aussteht, werden in den Replay-Snapshot für neu gestartete Server aufgenommen.
- `stop()` bricht laufende Replay-Verzögerungen und queued `reinitialize()`-Aufrufe ab, bevor sie neue Server starten können.
- `stop()` leert die Document-Tracking-Caches, nachdem alle Server gestoppt wurden.

`packages/core/src/config/config.test.ts`

- `reinitializeLsp()` ist ein No-Op, wenn deaktiviert oder kein Client existiert;
- wenn aktiviert und der Client `reinitialize` unterstützt, delegiert er den Aufruf;
- wenn Reinitialize einen Fehler wirft, macht der Status-Snapshot den Initialisierungs/Reload-Fehler sichtbar.
- wenn Reinitialize teilweise Fehler zurückgibt, macht der Status-Snapshot einen Initialisierungs/Reload-Fehler sichtbar, bis ein späterer vollständig erfolgreicher Reload ihn löscht.
### CLI-Tests

`packages/cli/src/config/lspConfigWatcher.test.ts`

- erstellt keine `.lsp.json`;
- erkennt Erstellen/Ändern/Löschen;
- ignoriert nicht relevante Dateien;
- ignoriert reine Formatierungsänderungen nach dem kanonischen Parsen;
- Ein Parse-Fehler sendet eine `invalid-config`-Benachrichtigung für sichtbares Feedback an den Benutzer
  und löst keine LSP-Reinitialisierung aus;
- Ein Lese-Fehler (nicht ENOENT) sendet eine für den Benutzer sichtbare Lese-Fehlermeldung und löst
  keine LSP-Reinitialisierung aus;
- Das Löschen von `.lsp.json` löst den Reload-Listener aus;
- Doppelte Datei-Events werden entprellt;
- langsame Listener werden seriell ausgeführt;
- Ein Listener-Fehler aktualisiert das gespeicherte Snapshot nicht, und derselbe Inhalt kann
  durch eine spätere Benachrichtigung erneut versucht werden.

`packages/cli/src/ui/AppContainer.test.tsx` oder der entsprechende Event-Test

- `AppEvent.LspStatusChanged` löst eine UI-Aktualisierung aus;
- Ein Reload-Fehler sendet einen für den Benutzer sichtbaren Fehler über `AppEvent.LogError`.
- Ein teilweiser Reconcile-Fehler sendet weiterhin `AppEvent.LspStatusChanged`, bevor der
  Listener rejected wird, sodass der UI-Status die erfolgreichen Teile des Reloads widerspiegeln kann.

`packages/cli/src/config/config.test.ts`

- Die bestehende Assertion beibehalten, dass `--experimental-lsp` das native LSP konstruiert und
  startet;
- Wenn `--allowed-lsp-server-names` hinzugefügt wird, unterstützt der Parser kommagetrennte
  Werte und wiederholte Flags und speichert sie als obere Grenze beim Start.

`packages/cli/src/ui/commands/lspCommand.test.ts`

- Wenn `LspStatusSnapshot` die Gründe für das Überspringen bereitstellt, kann die Statusausgabe
  übersprungene/nicht erlaubte Server anzeigen.

Abdeckungsziele: Neue pure functions sollten eine Abdeckung von nahezu 100 % aufweisen; die Branch-Coverage des Watchers
sollte der von `SettingsWatcher` entsprechen; der Manager-Reconcile muss die Fälle
add/remove/change/unchanged/failure/concurrency abdecken.

## Strenge Überprüfung

### Fazit

1. **v1 sollte kein stop-all/start-all verwenden.**
   Diese Implementierung ist am einfachsten, aber jeder Speichervorgang würde unveränderte
   Language Server neu starten und den Warm-State verlieren. Der aktuelle Manager verfügt bereits über
   Lifecycle-Methoden pro Server, und ein inkrementeller Reconcile ist ein überschaubarer
   Umfang an zusätzlichem Code.

2. **Änderungen an `.lsp.json` nicht in `SettingsWatcher` integrieren.**
   `SettingsWatcher` ist für Reloads im Settings-Scope verantwortlich. Ihn beliebige Workspace-Dateien überwachen zu lassen, würde den Contract verwischen und das Verhalten von MCP/Settings
   schwerer nachvollziehbar machen. Ein separater, eng gefasster `.lsp.json`-Watcher ist
   klarer.

3. **`NativeLspClient` nach der Initialisierung nicht ersetzen.**
   `Config.setLspClient()` verbietet Mutationen nach der Initialisierung explizit. Das Aktualisieren des
   Service hinter dem Adapter vermeidet eine Erweiterung der Lifecycle-API.

4. **Die Admission muss vor dem Spawnen des Prozesses oder dem Pool-Acquire erfolgen.**
   Dies ist dasselbe Risiko, das im MCP-Shared-Pool-Design genannt wird. Auch wenn
   LSP heute keinen Pool hat, sollten Reload-Ergebnisse auf Service-Ebene die vor dem Start
   gefilterten Gründe für das Überspringen zurückgeben, damit ein zukünftiger Pool-Pfad nicht versehentlich einen
   abgelehnten Server startet.

5. **Eine neue LSP-CLI-Allow-List ist optional, muss aber, falls hinzugefügt, eine obere
   Grenze darstellen.**
   Der aktuelle Code hat keine LSP-Allow-List. Das Design darf es den Settings nicht erlauben,
   Befehlszeilen-Einschränkungen zur Laufzeit zu erweitern, da es sonst schwächer wäre als die
   Hot-Reload-Sicherheitssemantik von MCP.

### Verbleibende Risiken

- Die `lspServers` der Extension können sich ändern, ohne dass sich `.lsp.json` ändert. Der automatische
  Watcher deckt nicht alle Dateisystemänderungen der Extension ab; der manuelle `/reload`
  deckt diesen Pfad ab.
- Einige Language Server tolerieren schnelle Neustarts nicht gut. Serialisierter
  Reconcile und Debounce reduzieren das Risiko, aber Tests sollten schnelle
  aufeinanderfolgende Änderungen abdecken.
- TCP/Socket-Server können extern verwaltete Daemons sein. Reconcile sollte die
  Verbindung schließen, aber die Eigentümerschaft über den Prozess nur dann übernehmen, wenn dieser
  Prozess den Server über `command` gestartet hat.