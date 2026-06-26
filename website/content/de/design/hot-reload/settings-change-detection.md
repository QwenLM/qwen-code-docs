# Erkennung von Änderungen an der Einstellungsdatei (Issue #3696 Sub-Task 1)

## Kontext

Qwen Code besitzt derzeit keinen Mechanismus zur Erkennung von Änderungen an der Einstellungsdatei. Benutzer müssen die Sitzung nach dem Ändern von `settings.json` neu starten, damit die Änderungen wirksam werden. Dieser Vorschlag implementiert die Infrastrukturebene für das #3696 Hot-Reload-System – automatische Erkennung und Ereignisverteilung bei Änderungen an der Einstellungsdatei.

**Umfang**: Dieser Sub-Task ist nur für „Dateiänderungen erkennen → neu laden → Listener benachrichtigen“ zuständig. `Config` kopiert viele Einstellungsfelder zum Zeitpunkt der Erstellung (`approvalMode`, `mcpServers`, `telemetry`, etc.), und diese Snapshots werden von diesem Sub-Task **nicht** automatisch aktualisiert. Nur Konsumenten, die `LoadedSettings.merged` in Echtzeit lesen (z.B. der `useSettings()`-Hook, `disabledSkillNamesProvider`) sehen Änderungen sofort. Andere Sub-Tasks (MCP-Wiederverbindung, `/reload`-Befehl) sind für das Pushen von Aktualisierungen an den internen Zustand von `Config` verantwortlich.

## Architekturentscheidungen

### Modulort: `packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` und die Pfade der Einstellungsdateien befinden sich beide in `packages/cli`
- `reloadScopeFromDisk()` ist eine Methode von `LoadedSettings`
- Das Core-Paket erhält nur ein minimales Lifecycle-Interface `{ stopWatching(): void }`, ohne CLI-Typen wie `SettingScope` zu importieren
- Die Ereignisverteilung und die nachgelagerte Aktualisierungslogik sind vollständig in der CLI-Ebene verdrahtet

### Watching-Strategie: Überwachung des Elternverzeichnisses + strenge Pfadfilterung

Der `writeWithBackupSync`-Schreibablauf ist `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)`, wodurch die Zieldatei kurzzeitig verschwindet. Die direkte Überwachung des Dateipfads würde dazu führen, dass chokidar die Überwachung verliert. Daher überwachen wir das Elternverzeichnis (`depth: 0`) und filtern nach **exaktem Basename-Match**, reagieren nur auf `settings.json`-Dateiereignisse und ignorieren `.tmp`, `.orig`, temporäre Editor-Dateien usw. Das `.orig`-Backup ist ein temporäres Sicherheitsnetz und wird bei Erfolg **entfernt** (letzter `unlink`-Schritt), sodass es niemals im Benutzerverzeichnis verbleibt.

### Lazy Directory Handling: Erstelle `.qwen/` niemals beim Start

> **Nebenwirkung auf das Dateisystem beim Start (bewusst vermieden).** Der Watcher darf **niemals** `<projekt>/.qwen/` (oder `~/.qwen/`) erstellen, nur um es überwachen zu können. Eine frühere Version rief `mkdirSync({ recursive: true })` für jedes fehlende Einstellungsverzeichnis auf, was bedeutete, dass ein normaler, nicht-Bare-Start stillschweigend `<projekt>/.qwen/` erstellte, selbst in Projekten, die nie Qwen-Einstellungen hatten – und so den Workspace und den Git-Status verschmutzte. Die Verzeichniserstellung liegt ausschließlich in der Verantwortung der Einstellungs_-Persistenz_ (`saveSettings()` führt sein eigenes `mkdirSync` aus, wenn der Benutzer tatsächlich Einstellungen schreibt).

Um dennoch eine `settings.json` zu erkennen, die später in der Sitzung hinzugefügt wird, ohne das Verzeichnis zu erstellen und ohne den Projektbaum zu durchlaufen, verwendet der Watcher eine zweistufige, bereichsbezogene Strategie, die auf die Existenz des **Verzeichnisses** abstellt:

- **`.qwen` existiert beim Start** → direkt überwachen (`watchTargetDir`, die obige Strategie).
- **`.qwen` fehlt** → **Bootstrap-Überwachung des Elternverzeichnisses** (`watchParentForDir`): `chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })`, wobei das `ignored`-Prädikat `(p) => p !== parentDir && basename(p) !== '.qwen'` nur den Eintrag `.qwen` durchlässt. Dies unterdrückt alle nicht zusammenhängenden top-level Änderungen und durchläuft niemals rekursiv. Sobald `.qwen` erscheint, führt der Watcher ein **Promote** durch: schließt den Bootstrap-Watcher und startet einen Ziel-Watcher auf `.qwen`, plant dann eine Aktualisierung ein, um eine möglicherweise bereits darin enthaltene `settings.json` zu erfassen.

Robustheitsdetails:

- **TOCTOU-Guard**: Nach dem Aktivieren des Bootstrap-Watchers (der `ignoreInitial` verwendet) wird `existsSync(dir)` erneut geprüft; wenn `.qwen` in der Zwischenzeit erstellt wurde, erfolgt das Promote sofort.
- **Demote bei Entfernung**: Wenn `.qwen` selbst gelöscht wird (`unlinkDir`), wechselt der Ziel-Watcher zurück zu einem Bootstrap-Watcher des Elternverzeichnisses, sodass eine spätere Neuerstellung weiterhin erkannt wird.
- **Generierungs-Guard**: `chokidar.close()` ist asynchron, sodass ein veralteter `'all'`-Callback eines gerade abgebauten Watchers sonst erneut das Promote auslösen und Watcher stapeln könnte. Ein bereichsbezogener monotoner Generierungstoken (erhöht bei jedem Promote/Demote und bei `stopWatching`) macht veraltete Callbacks zu No-Ops und garantiert höchstens einen aktiven Watcher pro Bereich.

### Änderungserkennung: Semantischer Diff als primärer Deduplizierungsmechanismus

Jedes Mal, wenn der Watcher auslöst, erstellt er zunächst einen Snapshot **des aktuellen In-Memory-Zustands vor dem Neuladen** (`JSON.stringify(file.settings)`), ruft dann `reloadScopeFromDisk()` zum Neuladen auf und vergleicht abschließend die Vorher-/Nachher-Snapshots. Listener werden nur benachrichtigt, wenn sich der semantische Inhalt tatsächlich geändert hat.

Wichtig: Der Vergleich erfolgt zwischen dem In-Memory-Zustand **vor und nach dem Neuladen**, nicht mit einem gespeicherten historischen Snapshot. Dies liegt daran, dass `setValue()` synchron `file.settings` im Speicher aktualisiert, bevor es auf die Festplatte schreibt. Wenn der Watcher also ein Neuladen auslöst, enthält der In-Memory-Zustand bereits den selbstgeschriebenen Wert – das Neuladen erzeugt denselben Inhalt → kein Diff → keine Benachrichtigung.

Dies unterdrückt auf natürliche Weise:

- Doppelte Ereignisse durch Selbstschreibvorgänge (`setValue()` hat den Speicher bereits aktualisiert, das Neuladen erzeugt identischen Inhalt → kein Diff → keine Benachrichtigung)
- Nur Format-/Kommentaränderungen (aufgelöste Einstellungen enthalten keine Kommentare)
- Editorspeicherungen ohne Inhaltsänderung
- Doppelte chokidar-Ereignisse

Bekannte Einschränkung: `JSON.stringify` ist empfindlich gegenüber der Schlüsselreihenfolge. Wenn ein Benutzer Schlüssel in settings.json manuell umordnet, ohne Werte zu ändern, wird eine harmlose zusätzliche Benachrichtigung ausgelöst. Dies ist akzeptabel; es besteht keine Notwendigkeit, eine Tiefengleichheitsabhängigkeit einzuführen.

## Implementierung

### 1. Neue `SettingsWatcher`-Klasse

**Datei**: `packages/cli/src/config/settingsWatcher.ts`

```typescript
export interface SettingsChangeEvent {
  scope: SettingScope;
  path: string;
  changeType: 'modified' | 'created' | 'deleted';
}

export type SettingsChangeListener = (
  events: SettingsChangeEvent[],
) => void | Promise<void>;

export class SettingsWatcher {
  private readonly settings: LoadedSettings;
  private readonly watchers: Map<SettingScope, FSWatcher> = new Map();
  // 'bootstrap' = überwacht Elternverzeichnis auf .qwen; 'target' = überwacht .qwen
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // Monotoner Token pro Bereich; bei Promote/Demote erhöht, um veraltete Callbacks unwirksam zu machen
  private readonly watchGeneration: Map<SettingScope, number> = new Map();
  private readonly changeListeners: Set<SettingsChangeListener> = new Set();
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingScopeChanges: Set<SettingScope> = new Set();
  private processing: boolean = false; // Serialisierungs-Guard
  private started: boolean = false;

  static readonly DEBOUNCE_MS = 300;
  static readonly LISTENER_TIMEOUT_MS = 30_000;
}
```

**Kernmethoden**:

#### `startWatching()`

- Iteriert über User- und Workspace-Bereiche
- Verzweigt je nach **Verzeichnis**existenz: überwacht `.qwen` direkt, falls vorhanden, andernfalls Bootstrap-Überwachung des Elternverzeichnisses (siehe [Lazy Directory Handling](#lazy-directory-handling-create-qwen-niemals-beim-start))
- **Erstellt** das Verzeichnis **niemals** – kein `mkdirSync`
- `ignoreInitial: true`, `depth: 0` durchgehend
- Wird im Bare-Modus nicht aufgerufen

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // Verzeichnis niemals erstellen; die Einstellungspersistenz (saveSettings) ist dafür zuständig.
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` ist der oben beschriebene Watcher für das Elternverzeichnis mit strengem Basename (er wechselt auch zurück zu einem Bootstrap-Watcher, wenn `.qwen` selbst entfernt wird). `watchParentForDir` aktiviert den nur-`.qwen`-Bootstrap-Watcher und führt ein Promote durch, sobald `.qwen` erscheint:

```typescript
private watchParentForDir(scope: SettingScope, settingsPath: string): void {
  const dir = path.dirname(settingsPath);
  const parentDir = path.dirname(dir);
  const dirBasename = path.basename(dir); // ".qwen"
  const gen = this.bumpGeneration(scope);

  const watcher = watchFs(parentDir, {
    ignoreInitial: true,
    depth: 0,
    ignored: (filePath: string) =>
      filePath !== parentDir && path.basename(filePath) !== dirBasename,
  })
    .on('all', (_event: string, changedPath: string) => {
      if (this.watchGeneration.get(scope) !== gen) return; // veralteter Callback
      if (path.basename(changedPath) !== dirBasename) return;
      void this.promoteScope(scope, settingsPath);
    })
    .on('error', (error: unknown) => {
      debugLogger.warn(`Settings Bootstrap-Watcher-Fehler für ${parentDir}:`, error);
    });

  this.watchers.set(scope, watcher);
  this.watchStage.set(scope, 'bootstrap');

  // TOCTOU-Guard: `.qwen` könnte zwischen der Existenzprüfung und hier erschienen sein.
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // schützt vor doppeltem Promote
  await this.replaceWatcher(scope); // erhöht Generation + wartet auf asynchrones close()
  if (!this.started) return;
  this.watchTargetDir(scope, settingsPath);
  this.scheduleRefresh(scope); // erfasst eine bereits in .qwen enthaltene settings.json
}
```

#### `stopWatching()` – Idempotentes Herunterfahren

```typescript
stopWatching(): void {
  if (!this.started) return;
  this.started = false;
  for (const [, watcher] of this.watchers) {
    watcher.close().catch((err) => debugLogger.warn('Watcher-Close-Fehler:', err));
  }
  this.watchers.clear();
  if (this.refreshTimer) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
  this.pendingScopeChanges.clear();
}
```

#### `scheduleRefresh(scope)` – 300 ms Entprellung + Bereichsakkumulation

```typescript
private scheduleRefresh(scope: SettingScope): void {
  this.pendingScopeChanges.add(scope);
  if (this.refreshTimer) clearTimeout(this.refreshTimer);
  this.refreshTimer = setTimeout(() => {
    this.refreshTimer = null;
    void this.drainPendingChanges();
  }, SettingsWatcher.DEBOUNCE_MS);
}
```

#### `drainPendingChanges()` – Serialisierte Verarbeitung zur Vermeidung von Wiedereintritt

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // vorherige Runde läuft noch; sie wird beim Beenden abfließen
  this.processing = true;
  try {
    while (this.pendingScopeChanges.size > 0) {
      const scopes = new Set(this.pendingScopeChanges);
      this.pendingScopeChanges.clear();
      await this.handleChange(scopes);
    }
  } finally {
    this.processing = false;
  }
}
```

#### `handleChange(scopes)` – Neuladen + semantischer Diff + Benachrichtigung

```typescript
private async handleChange(changedScopes: Set<SettingScope>): Promise<void> {
  const events: SettingsChangeEvent[] = [];

  for (const scope of changedScopes) {
    const file = this.settings.forScope(scope);

    // Snapshot des aktuellen In-Memory-Zustands vor dem Neuladen (enthält setValue()-Mutationen)
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk hat internen try/catch; bei Parse-Fehler wird alter Zustand beibehalten
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // Semantischer Diff: nur benachrichtigen, wenn sich der Inhalt tatsächlich geändert hat
    // Selbstschreibunterdrückung: setValue() hat Speicher bereits aktualisiert → Neuladen stimmt überein → keine Benachrichtigung
    if (afterSettings === beforeSettings) continue;

    events.push({
      scope,
      path: file.path,
      changeType: !existedBefore && existsNow ? 'created'
                : existedBefore && !existsNow ? 'deleted'
                : 'modified',
    });
  }

  if (events.length > 0) {
    await this.notifyListeners(events);
  }
}
```

#### `notifyListeners(events)` – `Promise.allSettled()` + 30 s Timeout

Verwendet das Listener-Benachrichtigungsmuster des SkillManager (`packages/core/src/skills/skill-manager.ts:188-236`): Jeder Listener wird in einen 30-s-Timeout-Race-Wrapper gehüllt, parallel mit `Promise.allSettled` ausgeführt, Fehler werden nicht propagiert.

#### `addChangeListener(listener)` – Gibt eine Unsubscribe-Funktion zurück

### 2. Änderungen an `LoadedSettings`

**Datei**: `packages/cli/src/config/settings.ts`

**Keine Änderungen erforderlich**. Der semantische Diff-Mechanismus ist vollständig im Watcher enthalten. `setValue()` aktualisiert synchron den Speicher → `saveSettings()` schreibt auf die Festplatte → Watcher löst aus → `reloadScopeFromDisk()` lädt neu → Diff-Vergleich findet identischen Inhalt → keine Benachrichtigung. Die Kette schließt sich auf natürliche Weise.

### 3. Config-Integration (Minimales Interface)

**Datei**: `packages/core/src/config/config.ts`

Zu `ConfigParameters` hinzufügen:

```typescript
/** Lifecycle-Handle für einen externen Datei-Watcher. Wird beim Herunterfahren gestoppt. */
settingsWatcher?: { stopWatching(): void };
```

In `Config.shutdown()` den Watcher **vor** der `initialized`-Prüfung stoppen:

```typescript
async shutdown(): Promise<void> {
  try {
    // Externen Watcher unabhängig vom Initialisierungszustand stoppen
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... restliche Bereinigungslogik ...
  }
}
```

**Der Config werden keine settingsChangeListener hinzugefügt**. Die Ereignisverteilung erfolgt vollständig in der CLI-Ebene, wo Listener direkt Kernaktualisierungsmethoden aufrufen (z.B. `skillManager.refreshCache()`, `toolRegistry.restartMcpServers()`). Dadurch bleibt der Core von den Semantiken der Einstellungsänderungen unberührt.

### 4. Startup-Verdrahtung

**Datei**: `packages/cli/src/gemini.tsx`

Nach `loadSettings()` und `loadCliConfig()`:

```typescript
// Watcher erstellen (im Bare-Modus überspringen)
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// Watcher-Lifecycle-Handle beim Laden der CLI-Konfiguration übergeben
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// Change-Listener registrieren (zukünftige Sub-Tasks werden hier die eigentliche Aktualisierungslogik hinzufügen)
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Einstellungen geändert:', events.map(e => `${e.scope}:${e.changeType}`));
  // Sub-Tasks 2-6 werden hinzufügen:
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - needsRefresh-Flag
});
```

**`loadCliConfig`-Signaturänderung** (`packages/cli/src/config/config.ts`): Optionalen Parameter hinzufügen, um `settingsWatcher` an `ConfigParameters` zu übergeben.

## Behandlung von Randfällen

| Szenario                                              | Behandlung                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.qwen`-Verzeichnis existiert nicht                   | **Nie erstellt.** Bootstrap-Überwachung des Elternverzeichnisses (`depth: 0`, nur-`.qwen`-Filter), Promote sobald `.qwen` erscheint                      |
| `.qwen` nach dem Start erstellt                       | Bootstrap-Watcher fängt `addDir` ab, führt Promote zu Ziel-Watcher durch + plant Aktualisierung ein                                                     |
| `.qwen` nach Promote gelöscht                         | Ziel-Watcher fängt `unlinkDir` ab → Demote zurück zu Bootstrap-Watcher des Elternverzeichnisses                                                         |
| Datei gelöscht                                        | `reloadScopeFromDisk` erkennt `!existsSync`, setzt auf `{}` zurück, Diff löst `deleted`-Ereignis aus                                                     |
| Datei nach dem Start erstellt (Verzeichnis existierte)| Verzeichnis-Watcher fängt `add`-Ereignis ab, `reloadScopeFromDisk` liest neue Datei                                                                     |
| Veralteter Callback während Promote/Demote            | Bereichsbezogener Generierungstoken macht den laufenden Callback des schließenden Watchers zu einem No-Op (kein Stapeln von Watchern)                    |
| Atomare Schreibvorgänge des Editors                   | Verzeichnisüberwachung + strenge Basename-Filterung (schließt `.tmp`/`.orig` aus) + 300 ms Entprell-Koaleszenz                                           |
| `.tmp`/`.orig`-Dateiereignisse                        | Basename-Filter matcht exakt `settings.json`, alle anderen Dateinamen werden ignoriert                                                                  |
| Selbstschreibvorgang (`setValue` → `saveSettings`)    | Semantischer Diff: Neulade-Inhalt stimmt mit In-Memory-Snapshot überein → keine Benachrichtigung                                                        |
| Selbstschreibvorgang gleichzeitig mit externer Änderung| Externe Änderung ändert Inhalt → Diff erkennt die Änderung → korrekte Benachrichtigung                                                                  |
| Nur Format-/Kommentaränderungen                       | `reloadScopeFromDisk` löst Einstellungen ohne Kommentare auf → Diff stimmt überein → keine Benachrichtigung                                             |
| Doppelte chokidar-Ereignisse                          | Entprell-Koaleszenz + semantischer Diff bieten doppelten Schutz                                                                                         |
| `QWEN_HOME`-Umleitung                                 | `getUserSettingsPath()` löst den Pfad bereits auf; Watcher verwendet den aufgelösten Pfad                                                               |
| Bare-Modus                                            | `startWatching()` wird nie aufgerufen, null Overhead                                                                                                    |
| Fehler bei der Watcher-Erstellung                     | Ausnahme abgefangen, Warnung protokolliert; dieser Bereich hat keine Echtzeiterkennung, aber die Funktionalität ist nicht beeinträchtigt                  |
| `reloadScopeFromDisk`-Parse-Fehler                    | Interner try/catch (`settings.ts:501`) bewahrt alten Zustand → Vorher-/Nachher-Diff stimmt überein → keine Benachrichtigung                              |
| Schlüsselreihenfolge geändert (keine Wertänderung)    | `JSON.stringify` ist empfindlich gegenüber Schlüsselreihenfolge; kann eine harmlose zusätzliche Benachrichtigung erzeugen                                |
| Fehler bei der Config-Initialisierung                 | `shutdown()` stoppt Watcher vor der `initialized`-Prüfung, verhindert Lecks                                                                             |
| Wiedereintritt (Listener läuft noch)                  | `processing`-Flag + `drainPendingChanges`-Schleife serialisiert die Verarbeitung                                                                        |
| Ungültiges JSON                                       | `reloadScopeFromDisk`-interner try/catch bewahrt alten Zustand                                                                                         |

## Leistungsanalyse

- Maximal 1 Watcher pro Bereich (≤ 2 gesamt), jeder bei `depth: 0` – minimaler Dateideskriptor-Overhead; Promote/Demote tauschen Watcher aus, stapeln sie nie
- `depth: 0` bedeutet **kein rekursiver Durchlauf** des Projektbaums, auch nicht für den Bootstrap-Watcher des Elternverzeichnisses in einem großen Monorepo. Der Aufwand ist auf die direkten Kinder des Elternverzeichnisses begrenzt: Nicht zusammenhängende top-level Änderungen wecken chokidar für einen `readdir` + `ignored`-Filterdurchlauf (`O(top-level Einträge)`), bevor das Ereignis unterdrückt wird – niemals ein rekursiver Scan
- 300 ms Entprellung stellt sicher, dass schnelle Editorspeicherungen nicht mehrere Neuladevorgänge auslösen
- `reloadScopeFromDisk` verwendet synchrones `readFileSync`, < 1 ms pro Aufruf
- `JSON.stringify`-Vergleich ist O(n), aber Einstellungsobjekte sind typischerweise < 10 KB; kein zusätzlicher Snapshot-Speicher erforderlich
- Listener-Benachrichtigung läuft parallel über `Promise.allSettled`
- Kein Polling – rein ereignisgesteuert

## Zu erstellende/ändernde Dateien

**Neue Dateien**:

- `packages/cli/src/config/settingsWatcher.ts` – Watcher-Klasse
- `packages/cli/src/config/settingsWatcher.test.ts` – Unit-Tests

**Geänderte Dateien**:

- `packages/core/src/config/config.ts` – `settingsWatcher`-Feld zu `ConfigParameters` hinzufügen, `stopWatching()` vor der `initialized`-Prüfung in `Config.shutdown()` aufrufen
- `packages/cli/src/config/config.ts` (`loadCliConfig`) – optionalen Parameter zum Übergeben von `settingsWatcher` hinzufügen
- `packages/cli/src/gemini.tsx` – Watcher instanziieren + Verdrahtung

**Keine Änderungen erforderlich**: `packages/cli/src/config/settings.ts` (semantischer Diff ist in sich geschlossen und benötigt keine Zusammenarbeit von `LoadedSettings`)
## Testplan

### Unit-Tests (`settingsWatcher.test.ts`)

Mocke chokidar (unter Verwendung des gleichen Mock-Musters wie in `skill-manager.test.ts`):

1. **Lebenszyklus**: `startWatching` erstellt Watcher, `stopWatching` schließt Watcher, beide sind idempotent
2. **Pfadfilterung**: Nur Ereignisse mit dem Basisnamen `settings.json` lösen ein Refresh aus; `.tmp`-/`.orig`-/andere Dateien werden ignoriert
3. **Entprellung**: Mehrere schnelle Ereignisse werden zu einem Neuladen zusammengefasst (`vi.useFakeTimers()`)
4. **Semantischer Diff**: Unveränderter Inhalt → Listener wird nicht aufgerufen; geänderter Inhalt → Listener wird mit korrekten Ereignissen aufgerufen
5. **Eigenschreibunterdrückung**: Durch `setValue()` ausgelöste Watcher-Ereignisse werden durch identischen Diff natürlich gefiltert
6. **Serialisierung**: Neue Ereignisse während `handleChange` werden gesammelt und nach Abschluss der Verarbeitung abgearbeitet
7. **Fehlerisolation**: chokidar-Fehler führen nicht zum Absturz; Listener-Ausnahmen beeinträchtigen andere Listener nicht; Fehler von `reloadScopeFromDisk` werden abgefangen
8. **Listener-Timeout**: 30-Sekunden-Timeout-Schutz
9. **Lazy Directory Watching**: Wenn `.qwen` fehlt, wird `mkdirSync` nie aufgerufen; ein Bootstrap-Watcher wird auf dem übergeordneten Verzeichnis aktiviert, und dessen `ignored`-Prädikat erlaubt nur den Eintrag `.qwen`
10. **Promote / TOCTOU**: Wenn `.qwen` erscheint (via `addDir` oder der erneuten Prüfung nach dem Bewaffnen), wird der Bootstrap-Watcher geschlossen und ein Ziel-Watcher auf `.qwen` geöffnet, plus ein Refresh eingeplant
11. **Demote / Re-create**: Das Entfernen von `.qwen` (`unlinkDir`) führt erneut zum Bootstrap auf dem übergeordneten Verzeichnis; ein anschließendes erneutes Erstellen führt wieder zu einem Promote
12. **Generierungsguard**: Ein veralteter Callback von einem bereits geschlossenen Bootstrap-Watcher erzeugt keinen zweiten Ziel-Watcher

### Regression-Verifikation

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### Manuelle Verifikation

Bearbeite `~/.qwen/settings.json` während einer laufenden Sitzung und beobachte die Debug-Log-Ausgabe für Änderungsereignisse.

---

## Folge-Unteraufgabe: Ereignisse für neustartpflichtige & sensible Einstellungen unterdrücken

> **Status: Suppression-Gate implementiert; zwei Schema-Umschaltungen noch in
> Recherche.** Unteraufgabe 1 oben gab ein einzelnes `SettingsChangeEvent` pro
> Scope für _jede_ semantische Änderung aus. Diese Folgeaufgabe fügt einen Filter hinzu,
> sodass Änderungen, die nur Einstellungen betreffen, die ohne Neustart nicht wirklich
> wirksam werden – oder sensibel sind (Credentials) – **keine** Listener benachrichtigen.
>
> - **Erledigt:** das auf `requiresRestart` basierende Suppression-Gate in
>   `SettingsWatcher.handleChange()` sowie Unit-Tests (siehe Mechanismus unten).
> - **Ausstehend:** die beiden `requiresRestart`-Schema-Korrekturen
>   (`modelProviders` → `true`, `permissions.*` → heiß nachladbar halten), jeweils
>   abhängig von der Überprüfung des tatsächlichen Runtime-Read-Pfads.

### Motivation

Einige Einstellungen werden exakt einmal beim Prozessstart gelesen (`Config.initialize()`,
Aufbau des Content-Generators/Clients, Erzeugen von Child-Prozessen, Node-Runtime-Flags).
Beispiele, die der Benutzer explizit genannt hat: **API-Tokens, `env` und Model-Anbieter**.
Ein Hot-Reload-Ereignis dafür auszugeben ist aktiv irreführend – der Listener würde
"aktualisieren", aber der neue Wert würde erst nach einem Neustart von `qwen-code` wirklich
angewendet werden. Sensible Werte (Credentials) sollten zusätzlich nicht durch eine laufende
Sitzung neu verdrahtet werden.

### Entscheidung: Schema-Flag `requiresRestart` wiederverwenden (Single Source of Truth)

`settingsSchema.ts` deklariert bereits `requiresRestart: boolean` für **jeden** Schlüssel,
und `packages/cli/src/utils/settingsUtils.ts` stellt bereits die Lookups bereit:

- `requiresRestart(key: string): boolean` – Flag für einen Dot-Path-Key
- `getFlattenedSchema()` – vollständige abgeflachte `key → definition`-Map
- `getRestartRequiredSettings()` – alle Keys mit `requiresRestart: true`

Wir werden **dieses Flag als Suppression-Signal wiederverwenden**, anstatt eine separate
handgepflegte Denylist zu führen (die unweigerlich vom Schema abweichen würde).
`requiresRestart: true` bedeutet bereits genau "wird ohne Neustart nicht wirksam", was
genau die Bedingung ist, unter der ein Ereignis unterdrückt werden sollte.

### Mechanismus (implementiert in `SettingsWatcher.handleChange()`)

Das alte Gate führte einen gesamten Datei-`JSON.stringify`-Diff durch und konnte nicht sagen,
_welche_ Schlüssel sich geändert haben. Es wird ersetzt durch einen Diff auf Blattebene +
Klassifizierung pro Schlüssel:

1. **`collectChangedKeys(before, after)`** erstellt einen Snapshot des In-Memory-Zustands vor
   dem Neuladen (`structuredClone`), durchläuft dann before/after und sammelt den Dot-Path
   jedes Blatts, dessen Wert sich unterscheidet. Plain-Objekte werden rekursiv durchlaufen;
   Arrays und Primitive werden als Ganzes verglichen (passend zu Schema-Array-Keys wie
   `permissions.allow`). Hinzugefügte/entfernte Keys tauchen als geänderte Blätter auf, sodass
   Dateierstellung/-löschung ohne separate Existenzprüfung abgedeckt ist.
2. **`isRestartRequiredKey(path)`** löst jeden geänderten Pfad gegen das Schema auf, unter
   Verwendung des **längsten Schema-Keys, der ein Präfix des Pfades ist (oder gleich)**.
   Freiform-Objekt-Einstellungen (`env`, `modelProviders`) sind Blatt-Schema-Keys, sodass
   `env.FOO` zur `env`-Definition aufgelöst wird. Unbekannte Keys werden standardmäßig als
   **nicht** neustartpflichtig behandelt, sodass eine nicht klassifizierbare Änderung nie
   stillschweigend unterdrückt wird.
3. Der Scope benachrichtigt **nur, wenn mindestens ein geänderter Key heiß nachladbar ist**
   (`!isRestartRequiredKey`). Wenn jeder geänderte Key neustartpflichtig ist, erzeugt der
   Scope kein Ereignis.

Die Form von `SettingsChangeEvent` bleibt unverändert (weiterhin `{ scope, path, changeType }`);
das Mitführen der überlebenden geänderten Keys im Ereignis bleibt einer späteren Erweiterung
vorbehalten. Die Unterdrückung eigener Schreibvorgänge (leerer Diff → kein Ereignis),
Entprellung, Serialisierung und das Listener-Timeout-Verhalten bleiben alle unverändert.

### Zwei Schema-Anpassungen zu recherchieren & anzuwenden

Diese beiden `requiresRestart`-Werte müssen korrigiert werden, damit der Wiederverwendungsansatz
wie beabsichtigt funktioniert. **Jede erfordert eine Überprüfung des tatsächlichen Runtime-Read-Pfads,
bevor das Flag umgedreht wird.**

1. **`modelProviders`: `false` → `true`** (`settingsSchema.ts:294`)
   - Heute ist es als `requiresRestart: false` markiert, sodass es unter dem Wiederverwendungsansatz
     _nicht_ unterdrückt würde – im Widerspruch zur Anforderung, dass Anbieteränderungen nicht
     heiß nachgeladen werden sollen.
   - Die Anbieterkonfiguration (einschließlich pro Anbieter `apiKey` / `baseUrl`) wird beim
     Erstellen des Modell-Clients / Content-Generators während des Startvorgangs konsumiert.
   - **Forschungspunkt:** bestätigen, dass es kein Runtime-Nachlesen von `modelProviders` gibt
     (Suche im Aufbau des Content-Generators / Clients). Erwartetes Ergebnis: das `false` ist
     ein latenter Fehler; auf `true` setzen.

2. **`permissions.*`: heiß nachladbar halten** (`settingsSchema.ts:1560`, gesamte Subtree
   aktuell `requiresRestart: true`)
   - Berechtigungsregeln (`deny > ask > allow`) werden pro Tool-Aufruf ausgewertet und sollen
     die Einstellungen sein, die Benutzer am schnellsten wirksam sehen möchten.
   - Die gesamte `permissions`-Subtree ist `showInDialog: false`, daher hat ihr
     `requiresRestart`-Flag aktuell **keine UI-Bedeutung** – ein starkes Indiz, dass das
     `true` ein Standardwert und keine bewusste "erfordert Neustart"-Entscheidung war, sodass
     die Schadwirkung des Umschaltens gering ist.
   - **Forschungspunkt:** bestätigen, dass die Laufzeit Berechtigungen live nachliest (z. B. via
     `config.getXxx()` zum Zeitpunkt der Auswertung) und nicht aus einem Start-Snapshot.
     Wenn bestätigt, setze die `permissions`-Subtree auf `requiresRestart: false`, damit sie
     **nicht** durch den Wiederverwendungsmechanismus unterdrückt wird.

> Hinweis: Da `requiresRestart` auch in der Einstellungs-UI / bei Neustartaufforderungen
> angezeigt wird, ändert das Umschalten dieser Flags auch dieses Verhalten. Das ist akzeptabel
> und vermutlich korrekter, sollte aber in der PR-Beschreibung erwähnt werden.

### Abnahme

- Eine Änderung, die nur neustartpflichtige/sensible Keys betrifft (`security.auth.*`,
  `env`, `modelProviders`, `mcpServers`, `proxy`, …) gibt **kein** `SettingsChangeEvent` aus.
- Eine Änderung an einem heiß nachladbaren Key (`ui.*`, `model.name`, `permissions.*` nach
  Umschalten, …) gibt weiterhin ein Ereignis aus.
- Eine gemischte Änderung (ein neustartpflichtiger Key + ein heiß nachladbarer Key) gibt
  weiterhin ein Ereignis aus (der heiß nachladbare Teil muss zu Recht aktualisiert werden).
- Eine Änderung an einem unbekannten (nicht im Schema enthaltenen) Key gibt weiterhin ein
  Ereignis aus, anstatt stillschweigend unterdrückt zu werden.

Teststatus:

- **Erledigt** – `settingsWatcher.test.ts` `restart-required suppression`-Block deckt
  alle unterdrückten (`env`, `security.auth.apiKey`), alle erlaubten (`ui.theme`),
  gemischte und unbekannte Keys ab.
- **Ausstehend (mit den Schema-Umschaltungen)** – `settingsSchema.test.ts`-Assertions
  zur Fixierung der beiden korrigierten `requiresRestart`-Werte, sowie ein Watcher-Test,
  der bestätigt, dass `permissions.*` nach dem Umschalten nicht mehr unterdrückt wird.