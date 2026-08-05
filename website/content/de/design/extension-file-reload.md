# Extension-File-Reload-Design

## Hintergrund

Änderungen an Extensions erreichen die Runtime aktuell aus zwei Richtungen.
Von Nutzern ausgelöste UI-Mutationen wie Aktivieren, Deaktivieren, Installieren,
Deinstallieren und Updaten laufen bereits über `ExtensionManager` und können den
Runtime-Status direkt aktualisieren. Außerbandliche Dateisystemänderungen, etwa
das Bearbeiten von `skills/`, `commands/`, `hooks/` oder `qwen-extension.json`
einer installierten Extension, gehören zu keiner einzelnen UI-Aktion und brauchen
deshalb einen Watcher-gesteuerten Pfad.

Dieses Design fügt den fehlenden Watcher-Pfad hinzu und behält den direkten
Mutationspfad bei. Es folgt derselben Schichtung wie die Hot-Reload-Designs für
MCP und LSP:

- die CLI entscheidet, wann Dateisystemänderungen einen Reload oder eine
  Nutzerbenachrichtigung auslösen;
- Core besitzt die Verantwortung dafür, wie der Extension-Runtime-Status
  aktualisiert wird;
- UI-Komponenten konsumieren ein kleines Event-/Status-Objekt, statt
  Extension-Dateien direkt zu pollen.

Die zentrale Einschränkung ist, dass sich nicht jede Extension-Datei sicher auf
dieselbe Weise hot-anwenden lässt. Inhaltsartige Fähigkeitsdateien können
automatisch aktualisiert werden, aber bei Änderungen auf Paketebene sollte der
Nutzer `/reload-plugins` ausführen, damit Extension-Cache, Runtime-Tools, Hooks,
Kontextdateien und Slash-Befehlsliste aus einem konsistenten Snapshot neu
aufgebaut werden.

## Bestandsaufnahme des aktuellen Codes

- `ExtensionManager` lädt bereits Extension-Manifeste, Konventionsverzeichnisse,
  Installationsmetadaten, Aktivierungszustand, Marketplace-Quellstatus,
  Commands, Skills, Agents, Hooks, MCP-Deklarationen und LSP-Deklarationen.
- UI-Extension-Operationen rufen bereits `ExtensionManager.refreshTools()` auf,
  nachdem sie Runtime-relevanten Zustand geändert haben. Dieser Pfad
  aktualisiert MCP, Skills, Subagents, Hooks und hierarchischen Memory über
  Core.
- Die Slash-Befehls-Vervollständigung wird von `CommandService.create()` aus
  Loadern aufgebaut. Extension-Commands und Skill-gestützte Slash-Befehle
  erscheinen nicht automatisch, solange `reloadCommands()` den Command-Service
  nicht neu aufbaut.
- Skill- und Subagent-Manager haben APIs zum Cache-Refresh, aber diese Caches
  sind von der Slash-Befehls-Vervollständigung getrennt.
- Hooks gehören `HookSystem` und `HookRegistry`. Das komplette Neuerstellen des
  Hook-Systems würde Agent-scopige temporäre Hooks verlieren, daher darf der
  Reload nur konfigurierte Hooks neu laden.
- `SettingsWatcher` und die bestehenden MCP/LSP-Watcher decken die Inhalte
  installierter Extension-Pakete nicht ab. Extension-spezifische Dateien
  brauchen einen eigenen Watcher.
- Verlinkte Extensions können außerhalb des Nutzer-Extension-Verzeichnisses
  liegen, daher verpasst das alleinige Beobachten von `~/.qwen/extensions`
  aktive Entwicklungs-Workflows.

## Ziele

Extension-Änderungen sollen in der aktuellen interaktiven Session ohne
vollständigen CLI-Neustart wirksam werden:

- UI-Extension-Mutationen bleiben sofort wirksam;
- manuelles Bearbeiten, Hinzufügen und Entfernen von Extensions unter dem
  Nutzer-Extension-Verzeichnis erkennen;
- Bearbeitungen in Quellverzeichnissen verlinkter Extensions erkennen;
- Fähigkeitsdateien auf Inhaltsebene unter `commands/`, `skills/` und
  `agents/` automatisch aktualisieren;
- den Nutzer bei Änderungen auf Paketebene auffordern, `/reload-plugins`
  auszuführen;
- Hooks als Teil des Runtime-Reloads aktualisieren, ohne Agent-scopige Hooks zu
  verlieren;
- die Slash-Befehls-Vervollständigung mit Command- und Skill-Änderungen
  synchron halten;
- Watcher-Benachrichtigungen für Änderungen unterdrücken, die von Qwens eigenen
  Extension-Mutationen geschrieben wurden;
- Fehler beim MCP- und Hook-Reload anzeigen, statt eine irreführende
  erfolgreiche Reload-Zusammenfassung zu melden.

## Nicht-Ziele

- Bearbeitungen von Hook-Dateien werden nicht Teil des automatischen
  Content-Refreshs. Hook-Verhalten kann die Befehlsausführung und
  sicherheitskritische Workflows beeinflussen, daher werden Hook-Bearbeitungen
  als Änderungen auf Paketebene behandelt.
- Beliebige Extension-Dateien werden nicht per Hot-Reload neu geladen.
  Unbekannte Dateien werden ignoriert, es sei denn, es sind aufgelöste
  Kontextdateien.
- Kein inkrementeller MCP-Neustart pro Extension. Dieses Design nutzt weiterhin
  den bestehenden MCP-Reinitialisierungs-Einstiegspunkt.
- Keine Änderungen an Extension-Discovery, Konvertierung, Parsing von
  Installationsquellen oder Marketplace-Semantik.
- Kein Umschalten des Bare-Modus zur Laufzeit. Im Bare-Modus wird der Watcher
  schlicht nicht gestartet.

## Codestruktur

Die Implementierung ist bewusst nach Schichten aufgeteilt.

```text
packages/core/src/extension/
  extensionManager.ts
    Extension mutation lifecycle events.
    UI mutation methods still own direct runtime refresh.

  extension-runtime-refresh.ts
    Core runtime refresh contract for extension mutations.

packages/core/src/hooks/
  hookRegistry.ts
    Reload configured hooks while preserving agent-scoped hooks.

  hookSystem.ts
    Public hook reload facade used by extension runtime refresh.

packages/cli/src/config/
  extension-refresh-state.ts
    Shared event/state object for watcher, slash processor, and reload command.

  extension-file-watcher.ts
    Filesystem watcher and path classifier.

  extension-runtime-reload.ts
    CLI reload helpers for /reload-plugins and content auto-refresh.

packages/cli/src/ui/commands/
  reload-plugins-command.ts
    Interactive slash command for package-level extension reload.

packages/cli/src/ui/hooks/
  slashCommandProcessor.ts
    Event consumers for stale notifications and content auto-refresh.

packages/cli/src/
  gemini.tsx
  ui/AppContainer.tsx
  ui/startInteractiveUI.tsx
    Startup and dependency injection for ExtensionRefreshState and watcher.
```

## Design

### 1. Dateisystemänderungen klassifizieren

`ExtensionFileWatcher` bildet ein chokidar-Event auf eines von drei Ergebnissen
ab:

```ts
type RefreshAction = 'auto' | 'stale' | false;
```

Die Klassifizierung ist bewusst konservativ.

| Pfadklasse | Aktion | Grund |
| --- | --- | --- |
| `commands/**` | `auto` | Slash-Befehls-Loader können aus dem bestehenden Extension-Cache neu aufgebaut werden. |
| `skills/**` | `auto` | Skill-Cache und Slash-Befehls-Loader können neu aufgebaut werden, ohne die Paketidentität zu ändern. |
| `agents/**` | `auto` | Der Subagent-Cache kann neu aufgebaut werden, ohne die Paketidentität zu ändern. |
| `hooks/**` | `stale` | Das Hook-Ausführungsverhalten sollte aus einem konsistenten Paket-Snapshot neu geladen werden. |
| `qwen-extension.json` | `stale` | Das Manifest kann Commands, Skills, Agents, Hooks, MCP, LSP, Kontextdateinamen und Metadaten ändern. |
| `.qwen-extension-install.json` | `stale` | Installationsmetadaten beeinflussen verlinkte Quellwurzeln und die Paketidentität. |
| konfigurierte Kontextdateien | `stale` | Der Modellkontext kann sich ändern und sollte explizit neu geladen werden. |
| Hinzufügen/Entfernen von Extension-Verzeichnissen | `stale` | Die Topologie installierter Extensions hat sich geändert. |
| Top-Level-Extension-Konfigurationsdateien | `stale` | Aktivierung, Präferenzen oder Marketplaces wurden außerhalb des UI-Mutationspfads geändert. |
| unbekannte Dateien | ignoriert | Vermeidet Refresh für Build-Artefakte oder unbeteiligte Daten. |

Derselbe Klassifizierer wird für vom Nutzer installierte Extensions und für
Quellwurzeln verlinkter Extensions verwendet. Bei verlinkten Wurzeln findet der
Watcher zuerst die zugehörige verlinkte Extension und klassifiziert den Pfad
dann relativ zu dieser Quellwurzel.

### 2. Nutzer- und verlinkte Extension-Wurzeln beobachten

`ExtensionFileWatcher.startWatching()` baut die Beobachtungswurzeln aus:

1. `Storage.getUserExtensionsDir()`, sofern es existiert;
2. aktiven Quellpfaden verlinkter Extensions aus den Installationsmetadaten;
3. dem Parent des Nutzer-Extension-Verzeichnisses, nur wenn das
   Extension-Verzeichnis noch nicht existiert.

Der Parent-Bootstrap-Watcher deckt die Erstinstallation einer Extension oder das
manuelle Anlegen des Extension-Verzeichnisses nach dem Start ab. Sobald das
Verzeichnis erscheint, markiert der Watcher den Extension-Zustand als stale und
plant `restartWatching()` in einem Microtask. Der eingeplante Neustart vermeidet,
den Bootstrap-Watcher zu schließen, während chokidar das Event noch verarbeitet.

Watcher-Optionen:

```ts
watchFs(roots, {
  ignoreInitial: true,
  followSymlinks: false,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 50,
  },
  ignored: (filePath) => this.isIgnored(filePath),
});
```

`followSymlinks: false` verhindert, dass eine Extension Qwen dazu bringt, über
Symlinks beliebige externe Pfade zu beobachten. Der Ignore-Filter überspringt
`node_modules`, `.git`, übliche Editor-Backup-Dateien, Swap-Dateien, temporäre
Dateien und `.DS_Store`.

### 3. Reload-Zustand über ExtensionRefreshState teilen

`ExtensionRefreshState` ist die kleine Event-/Status-Primitive, die sich
Watcher, Slash-Command-Prozessor und `/reload-plugins` teilen.

Wichtige Methoden:

```ts
markExtensionsChanged(reason?: string): boolean;
markExtensionContentChanged(reason?: string): boolean;
clearExtensionsChanged(): void;
notifyExtensionsReloadStarted(): void;
needsExtensionRefresh(): boolean;
beginSuppression(onSettle?: () => void): () => void;
suppressNotifications<T>(fn: () => T, onSettle?: () => void): T;
```

Events:

| Event | Erzeuger | Konsument | Bedeutung |
| --- | --- | --- | --- |
| `ExtensionContentChanged` | `ExtensionFileWatcher` | `useSlashCommandProcessor` | Dateien auf Inhaltsebene geändert; Auto-Refresh einplanen. |
| `ExtensionRefreshNeeded` | `ExtensionFileWatcher` | `useSlashCommandProcessor` | Zustand auf Paketebene geändert; Nutzer auffordern, `/reload-plugins` auszuführen. |
| `ExtensionsReloadStarted` | `/reload-plugins` | `useSlashCommandProcessor` | Ausstehende Content-Refresh-Timer vor dem manuellen Reload abbrechen. |
| `ExtensionsReloaded` | `/reload-plugins`, Watcher-Neustart-Pfad | Watcher und Slash-Command-Prozessor | Stale-Flags löschen und ausstehende Arbeit neu starten/abbrechen. |

`markExtensionsChanged()` dedupliziert Stale-Benachrichtigungen, bis der Zustand
gelöscht wird. Content-Änderungs-Benachrichtigungen werden von diesem
Zustandsobjekt nicht dedupliziert, weil der Slash-Command-Prozessor Debounce und
Serialisierung besitzt.

### 4. Watcher-Rauschen bei programmatischen Mutationen unterdrücken

`ExtensionManager` stellt bereit:

```ts
interface ExtensionMutationEvent {
  id: number;
  phase: 'start' | 'end';
  operation: string;
}

addMutationListener(listener: ExtensionMutationListener): () => void;
```

Runtime-relevante Mutationsmethoden rufen `beginMutation()` auf und emittieren
in `finally` immer ein passendes End-Event.

Methoden, die Mutations-Events emittieren:

- `enableExtension()`
- `disableExtension()`
- `installExtension()`
- `uninstallExtension()`
- `updateExtension()`
- `addSource()`
- `removeSource()`
- `setExtensionScope()`
- `setMcpServerDisabled()`

Methoden, die keine Mutations-Events emittieren:

- `toggleFavorite()`
- `markSourceUpdated()`

Der Watcher hält `mutation id -> end suppression callback` in einer `Map`. Das
ist wichtig, weil eine Installation intern ein Aktivieren auslösen kann und sich
separate Mutationen überschneiden können. Die Zuordnung per Id vermeidet eine
Abhängigkeit von der Stack-Reihenfolge.

Wenn die äußere Suppression-Tiefe null erreicht, startet der Watcher neu. Das
aktualisiert verlinkte Quellwurzeln, Kontextdateinamen und Metadaten aktiver
Extensions, nachdem die Mutation abgeschlossen ist.

### 5. Runtime-Zustand von Core aus aktualisieren

`refreshExtensionRuntime()` ist der Core-seitige Einstigspunkt für den
Runtime-Refresh, den Extension-UI-Mutationen verwenden.

Der Refresh erfolgt in dieser Reihenfolge:

1. `config.reinitializeMcpServers(config.getSettingsMcpServers())`
2. `config.getSkillManager()?.refreshCache()`
3. `config.getSubagentManager().refreshCache()`
4. `config.getHookSystem()?.reload()`
5. `config.refreshHierarchicalMemory()`

Die MCP-Reinitialisierung läuft zuerst, weil Tool-Beschreibungen von Skills und
Subagents von der aktualisierten MCP-Tool-Liste abhängen können.

Skills, Subagents und Hooks laufen über `Promise.allSettled()`, damit ein
abgelehnter Teilschritt die anderen nicht an der Anwendung hindert. Ein
Fehlschlagen des Hook-Reloads wird gespeichert und erneut geworfen, nachdem der
hierarchische Memory die Chance hatte, sich zu aktualisieren. So bleiben
Hook-Fehler sichtbar, während Best-Effort-Cache-Refreshes trotzdem angewendet
werden.

Fehlervertrag:

- MCP-Fehler propagieren sofort, spätere Runtime-Teilschritte laufen nicht
  mehr.
- Fehler beim Hook-Reload propagieren, nachdem parallele Refresh-Teilschritte
  und der Memory-Refresh abgeschlossen sind.
- Ein Fehlschlagen des Skill-Refreshs wird geloggt und ist Best-Effort.
- Ein Fehlschlagen des Subagent-Refreshs wird geloggt und ist Best-Effort.
- Ein Fehlschlagen des Refreshs des hierarchischen Memorys wird geloggt und ist
  Best-Effort.

### 6. Änderungen auf Paketebene mit /reload-plugins neu laden

`reloadPluginsRuntime()` ist der CLI-seitige Runtime-Reload-Helfer, den der
Slash-Befehl verwendet:

```ts
async function reloadPluginsRuntime(options: {
  config: Config;
  reloadCommands?: () => void | Promise<void>;
}): Promise<ReloadPluginsSummary>;
```

Ablauf:

1. `config.getExtensionManager().refreshCache()`
2. `config.getExtensionManager().refreshTools()`
3. `reloadCommands()`
4. Fähigkeiten aktiver Extensions zusammenfassen

Die Zusammenfassung zählt aktive Extension-Deklarationen für:

- Extensions;
- Commands;
- Skills;
- Agents;
- Hooks;
- Extension-MCP-Server;
- Extension-LSP-Server.

`/reload-plugins` besitzt das nutzerseitige Befehlsverhalten:

1. `config` voraussetzen;
2. `ExtensionsReloadStarted` emittieren;
3. `reloadPluginsRuntime()` aufrufen;
4. `clearExtensionsChanged()` bei Erfolg oder Fehlschlag aufrufen;
5. entweder eine lokalisierte Info-Zusammenfassung oder eine Fehlermeldung
   zurückgeben.

Den Stale-Zustand bei einem Fehlschlag zu löschen, ist Absicht. Würde ein
fehlgeschlagener Reload `extensionRefreshNeeded = true` lassen, würden
zukünftige File-Watcher-Benachrichtigungen wegdedupliziert und der
Content-Auto-Refresh würde sich dauerhaft selbst umgehen.

### 7. Änderungen auf Inhaltsebene automatisch aktualisieren

`refreshExtensionContentRuntime()` wird für reine Inhaltsänderungen am
Dateisystem verwendet.

Ablauf:

1. Extension-Cache aktualisieren;
2. Skill-Cache aktualisieren;
3. Subagent-Cache aktualisieren;
4. Slash-Befehle neu laden;
5. Fehler sammeln und eine einzelne Meldung werfen, wenn ein Teilschritt
   fehlschlug.

Der Slash-Command-Prozessor hört auf `ExtensionContentChanged` und debounced den
Refresh um 250 ms. Er serialisiert Refreshes mit:

```ts
extensionContentRefreshRunningRef;
extensionContentRefreshPendingRef;
```

Trifft ein Content-Event ein, während ein Refresh läuft, markiert der Prozessor
einen weiteren Durchlauf als ausstehend und führt ihn nach Abschluss des
aktuellen aus. Eine kleine Obergrenze verhindert, dass ein lauter Editor oder
Build-Prozess dieselbe Refresh-Aufgabe endlos am Leben hält.

Ist `ExtensionRefreshState.needsExtensionRefresh()` wahr, bricht der
Content-Auto-Refresh früh ab. Der Reload auf Paketebene muss zuerst laufen,
damit Command-, Skill-, Agent-, Hook-, MCP-, LSP- und Kontextzustand aus einem
einzigen Extension-Cache-Snapshot neu aufgebaut werden.

### 8. Hooks neu laden, ohne Agent-scopige Hooks zu verlieren

`HookRegistry.reloadConfiguredHooks()` ersetzt nur konfigurierte Hook-Einträge.
Einträge mit `agentScope !== undefined` bleiben erhalten, weil das temporäre
Hooks sind, die für die Subagent-Ausführung registriert wurden.

Ablauf:

1. `previousEntries` sichern;
2. `agentEntries` behalten;
3. Registry-Einträge auf `agentEntries` setzen;
4. `processHooksFromConfig()` ausführen;
5. bei Fehlschlag `previousEntries` wiederherstellen und erneut werfen.

`HookSystem.reload()` ist eine schmale Fassade, die an
`hookRegistry.reloadConfiguredHooks()` delegiert. Der Runtime-Reload muss das
gesamte Hook-System daher nicht neu erstellen.

Dieser Reload-Pfad liest Nutzer- oder Projekt-Settings-Dateien nicht erneut von
der Festplatte. `processHooksFromConfig()` verarbeitet die aktuellen
`Config`-Werte für Nutzer-/Projekt-Hooks und die aktualisierten
Extension-Konfigurationswerte neu. Der Reload von Settings-Dateien bleibt beim
Settings-Reload-Pfad; `/reload-plugins` ist auf den Extension-Runtime-Zustand
beschränkt.

### 9. Zustand in die interaktive UI verdrahten

Der interaktive Start erzeugt einen gemeinsam genutzten
`ExtensionRefreshState`:

```ts
const extensionRefreshState = new ExtensionRefreshState();
const extensionFileWatcher = isBareMode(argv.bare)
  ? undefined
  : new ExtensionFileWatcher(config, undefined, extensionRefreshState);
```

Dieser Zustand wird durchgereicht durch:

```text
gemini.tsx
  -> startInteractiveUI(...)
    -> AppContainer
      -> useSlashCommandProcessor
      -> CommandContext.services.extensionRefreshState
```

`AppContainer` erzeugt einen Fallback-`ExtensionRefreshState` nur, wenn keiner
bereitgestellt wurde. Das hält Tests und alternative UI-Einstiegspunkte einfach,
während der Hauptpfad der interaktiven Nutzung den Zustand zwischen Watcher und
Slash-Command-Verarbeitung teilt.

Das Cleanup deregistriert den Reload-Listener und stoppt den Watcher.

## Event-Flows

### Bearbeitung einer Content-Datei

```text
edit extension commands/skills/agents file
  -> ExtensionFileWatcher classifies as auto
  -> ExtensionRefreshState.markExtensionContentChanged()
  -> useSlashCommandProcessor schedules debounced refresh
  -> refreshExtensionContentRuntime()
      -> ExtensionManager.refreshCache()
      -> SkillManager.refreshCache()
      -> SubagentManager.refreshCache()
      -> reloadCommands()
```

### Bearbeitung einer Datei auf Paketebene

```text
edit qwen-extension.json/hooks/context/install metadata/topology
  -> ExtensionFileWatcher classifies as stale
  -> ExtensionRefreshState.markExtensionsChanged()
  -> useSlashCommandProcessor prints:
       "Extensions changed on disk. Run /reload-plugins to apply updates."
  -> user runs /reload-plugins
  -> reloadPluginsRuntime()
      -> ExtensionManager.refreshCache()
      -> ExtensionManager.refreshTools()
      -> reloadCommands()
```

### UI-Mutation

```text
user enables/disables/installs/uninstalls/updates extension
  -> ExtensionManager emits mutation start
  -> ExtensionRefreshState begins suppression
  -> ExtensionManager writes disk/runtime state
  -> ExtensionManager.refreshTools()
      -> refreshExtensionRuntime()
  -> ExtensionManager emits mutation end
  -> suppression settles
  -> ExtensionFileWatcher restarts with fresh roots/context files
```

## Parallelität und Reihenfolge

- Watcher-Neustarts sind generationsgesichert. Events einer alten
  Watcher-Instanz werden ignoriert, nachdem sich `watchGeneration` geändert hat.
- Mutations-Suppression wird per Mutations-Id zugeordnet, nicht per
  Stack-Reihenfolge.
- `stopWatching()` beendet alle ausstehenden Suppressions, bevor
  Watcher-Referenzen aufgegeben werden, damit die Suppression-Tiefe nicht lecken
  kann, wenn der Watcher mitten in einer Mutation gestoppt wird.
- Der Content-Auto-Refresh wird im Slash-Command-Prozessor serialisiert.
  Gleichzeitige Events verschmelzen zu höchstens einem ausstehenden
  Wiederholungslauf.
- `/reload-plugins` emittiert `ExtensionsReloadStarted` und
  `ExtensionsReloaded`, damit ausstehende Content-Refresh-Timer um den manuellen
  Reload herum abgebrochen werden.
- Stale-Zustand auf Paketebene gewinnt gegen den Content-Auto-Refresh. Wird ein
  Stale-Reload benötigt, steigt der Content-Auto-Refresh aus und wartet auf
  `/reload-plugins`.

## Fehlersemantik

| Pfad | Verhalten |
| --- | --- |
| MCP-Reinitialisierung bei Mutation oder `/reload-plugins` | Propagiert. Eine Erfolgsmeldung wäre irreführend, weil Extension-MCP-Tools möglicherweise nicht verfügbar sind. |
| Hook-Reload bei Mutation oder `/reload-plugins` | Propagiert, nachdem andere parallele Refresh-Teilschritte abgeschlossen sind. Eine Erfolgsmeldung wäre irreführend, weil konfigurierte Hooks möglicherweise nicht registriert sind. |
| Skill-Cache-Refresh während Mutation | Wird geloggt und ist Best-Effort. |
| Subagent-Cache-Refresh während Mutation | Wird geloggt und ist Best-Effort. |
| Refresh des hierarchischen Memorys während Mutation | Wird geloggt und ist Best-Effort. Bereits geschriebener Extension-Zustand sollte nicht zurückgerollt werden. |
| Fehlschlagen des Content-Auto-Refreshs | Wird gesammelt und in der UI mit einem `/reload-plugins`-Fallback angezeigt. |
| Fehlschlagen von `/reload-plugins` | Gibt eine Fehlermeldung zurück und löscht den Stale-Zustand, damit zukünftige Watcher-Benachrichtigungen wieder feuern können. |
| Fehlschlagen des Hook-Registry-Reloads | Stellt vorherige Hook-Einträge wieder her und wirft erneut. |
| Watcher-Fehler | Wird über den Debug-Logger geloggt; die Session läuft weiter. |

## Tests

### Core-Tests

`packages/core/src/extension/extension-runtime-refresh.test.ts`

- kehrt ohne Config früh zurück;
- aktualisiert MCP vor Skills/Subagents/Hooks/Memory;
- propagiert MCP-Reconcile-Fehler;
- hält das Fehlschlagen des Skill-Refreshs auf Best-Effort;
- propagiert Hook-Reload-Fehler, nachdem andere Refresh-Teilschritte
  abgeschlossen sind;
- hält das Fehlschlagen des hierarchischen Memorys auf Best-Effort.

`packages/core/src/extension/extensionManager.test.ts`

- emittiert Mutations-Start/-Ende um das Deaktivieren;
- emittiert Mutations-Ende, wenn das Deaktivieren fehlschlägt;
- emittiert Mutations-Start/-Ende um die Installation, einschließlich
  verschachtelter Aktivierungs-Events;
- emittiert Mutations-Start/-Ende um die Deinstallation;
- emittiert Mutations-Start/-Ende um einen Fehlschlag des temporären
  Update-Verzeichnisses;
- emittiert keine Mutations-Events für Favoriten-Änderungen oder
  Quellen-Timestamp-Updates;
- behält die bestehende Abdeckung von Extension-Loading, Command-Discovery,
  Hook-Loading und refreshTools bei.

`packages/core/src/hooks/hookRegistry.test.ts`

- lädt konfigurierte Hooks neu;
- behält Agent-scopige Hooks während des Reloads;
- stellt vorherige Einträge wieder her, wenn der Reload konfigurierte Hooks
  fehlschlägt.

`packages/core/src/hooks/hookSystem.test.ts`

- delegiert den Reload an die Hook-Registry.

### CLI-Tests

`packages/cli/src/config/extension-refresh-state.test.ts`

- emittiert Stale-Refresh-Events einmal, bis gelöscht wird;
- emittiert Content-Refresh-Events;
- unterdrückt Benachrichtigungen während der Mutations-Suppression;
- löscht Stale-Zustand und Suppression-Fenster korrekt.

`packages/cli/src/config/extension-file-watcher.test.ts`

- klassifiziert Commands, Skills und Agents als Auto-Refresh;
- klassifiziert Manifeste, Installationsmetadaten, Hooks, Kontextdateien und
  Änderungen der Extension-Topologie als stale;
- ignoriert unbekannte Dateien und ignorierte Verzeichnisse;
- beobachtet Quellen verlinkter Extensions;
- unterdrückt Benachrichtigungen während programmatischer Mutation;
- startet die Beobachtung nach Abschluss der Mutation neu;
- behandelt das späte Anlegen des Extension-Verzeichnisses.

`packages/cli/src/config/extension-runtime-reload.test.ts`

- lädt für `/reload-plugins` Extension-Cache, Runtime-Tools und Slash-Befehle
  neu;
- fasst Fähigkeiten aktiver Extensions zusammen;
- aktualisiert Content-Runtime-Komponenten;
- sammelt Fehler des Content-Auto-Refreshs.

`packages/cli/src/ui/commands/reload-plugins-command.test.ts`

- registriert den Befehl als rein interaktives Verhalten;
- gibt einen Fehler zurück, wenn Config fehlt;
- lädt die Runtime neu und löscht bei Erfolg den Stale-Zustand;
- löscht bei Fehlschlag den Stale-Zustand und gibt einen Fehler zurück.

`packages/cli/src/services/BuiltinCommandLoader.test.ts`

- schließt `/reload-plugins` in das Laden der Built-in-Befehle ein.

### Manuelle Verifikation

Die manuelle Verifikation sollte abdecken:

1. Eine Extension über die UI aktivieren und bestätigen, dass Commands, Skills,
   Agents, MCP, Hooks und Kontext ohne Neustart aktualisiert werden.
2. Dieselbe Extension deaktivieren und bestätigen, dass Runtime-Fähigkeiten
   entfernt oder nicht mehr angeboten werden.
3. Eine Command-Datei unter `commands/` bearbeiten und bestätigen, dass sich
   die Slash-Befehls-Vervollständigung automatisch aktualisiert.
4. Eine Skill-Datei unter `skills/` bearbeiten und bestätigen, dass sich die
   Skill-gestützte Slash-Befehls-Vervollständigung automatisch aktualisiert.
5. Eine Agent-Datei unter `agents/` bearbeiten und bestätigen, dass das
   Agent-Cache-Verhalten die Änderung widerspiegelt.
6. `hooks/hooks.json`, `qwen-extension.json`, Installationsmetadaten,
   Kontextdateien oder die Extension-Verzeichnis-Topologie bearbeiten und
   bestätigen, dass die UI um `/reload-plugins` bittet.
7. `/reload-plugins` ausführen und bestätigen, dass die Zusammenfassung
   Extensions, Commands, Skills, Agents, Hooks, Extension-MCP-Server und
   Extension-LSP-Server meldet.
8. Einen Reload-Fehlschlag erzwingen und bestätigen, dass die UI den Fehler
   meldet und eine spätere Dateisystemänderung weiterhin eine neue
   Benachrichtigung auslösen kann.

## Tradeoffs

- Hooks werden als Stale-Änderungen auf Paketebene behandelt, obwohl eine
  Reload-API für konfigurierte Hooks existiert. Das vermeidet, dass ein
  Dateisystem-Event im Hintergrund das Hook-Ausführungsverhalten stillschweigend
  ändert.
- Der MCP-Refresh bleibt eine vollständige Runtime-Reinitialisierung. Ein
  inkrementeller MCP-Neustart pro Extension würde Kosten senken, würde diesen
  PR aber in MCP-Ownership- und Reconciliation-Logik ausweiten.
- Der Watcher klassifiziert unbekannte Dateien als ignoriert statt als stale.
  Das reduziert Rauschen durch Build-Artefakte, bedeutet aber, dass
  Extension-Autoren Runtime-Fähigkeitsdateien in die unterstützten
  Konventionsverzeichnisse legen müssen.
- Wurzeln verlinkter Extensions werden direkt beobachtet. Das verbessert die
  Ergonomie beim Entwickeln, kann aber die Watcher-Anzahl für Nutzer mit vielen
  verlinkten Extensions erhöhen.

## Zukünftige Arbeit

- Inkrementelles MCP-Reconciliation pro Extension hinzufügen.
- Für Nutzer sichtbare Diagnostik für fatale Watcher-Fehler wie `ENOSPC` oder
  `EMFILE` hinzufügen.
- Ein typisiertes Reload-Ergebnis von `refreshExtensionRuntime()` erwägen,
  falls Aufrufer Teilerfolgs-Zusammenfassungen brauchen.
- Die Quellauflösung verlinkter Extensions mit einer vorausberechneten
  Wurzel-Map optimieren, falls viele verlinkte Extensions üblich werden.
- Auto-Refresh für Hook-Inhalte nur dann erneut prüfen, wenn der Hook-Reload
  explizit, beobachtbar und sicher genug für die Anwendung im Hintergrund
  gemacht werden kann.
