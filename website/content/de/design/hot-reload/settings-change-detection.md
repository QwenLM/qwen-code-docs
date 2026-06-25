# Erkennung von Änderungen an der Einstellungsdatei (Issue #3696 Sub-task 1)

## Kontext

Qwen Code verfügt derzeit über keinen Mechanismus zur Erkennung von Änderungen an der Einstellungsdatei. Benutzer müssen die Sitzung nach dem Ändern von `settings.json` neu starten, damit die Änderungen wirksam werden. Dieser Vorschlag implementiert die Infrastrukturebene für das #3696 Hot-Reload-System – automatische Erkennung und Ereignisverteilung bei Änderungen an der Einstellungsdatei.

**Umfang**: Diese Unteraufgabe ist nur für „Dateiänderungen erkennen → neu laden → Listener benachrichtigen“ zuständig. `Config` kopiert viele Einstellungsfelder zum Zeitpunkt der Erstellung (`approvalMode`, `mcpServers`, `telemetry`, usw.), und diese Schnappschüsse werden von dieser Unteraufgabe **nicht** automatisch aktualisiert. Nur Konsumenten, die `LoadedSettings.merged` in Echtzeit lesen (z. B. der `useSettings()`-Hook, `disabledSkillNamesProvider`) sehen Änderungen sofort. Andere Unteraufgaben (MCP-Wiederverbindung, `/reload`-Befehl) sind dafür verantwortlich, Aktualisierungen in den internen Zustand von `Config` zu pushen.

## Architekturentscheidungen

### Modul-Pfad: `packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` und die Pfade zu den Einstellungsdateien befinden sich beide in `packages/cli`
- `reloadScopeFromDisk()` ist eine Methode von `LoadedSettings`
- Das Kernpaket erhält nur eine minimale Lebenszyklus-Schnittstelle `{ stopWatching(): void }`, ohne CLI-Typen wie `SettingScope` zu importieren
- Das Verteilen von Änderungsereignissen und die nachgelagerte Aktualisierungslogik sind vollständig in der CLI-Schicht implementiert

### Überwachungsstrategie: Überwachen des übergeordneten Verzeichnisses + strenge Pfadfilterung

Der `writeWithBackupSync`-Schreibablauf ist `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)`, wodurch die Zieldatei kurzzeitig verschwindet. Das direkte Überwachen des Dateipfads würde dazu führen, dass chokidar die Überwachung verliert. Daher überwachen wir das übergeordnete Verzeichnis (`depth: 0`) und filtern nach **exaktem Basisnamen**, um nur auf `settings.json`-Dateiereignisse zu reagieren und `.tmp`, `.orig`, temporäre Editor-Dateien usw. zu ignorieren. Die `.orig`-Sicherungskopie dient als Sicherheitsnetz während des Schreibvorgangs und wird **bei Erfolg entfernt** (letzter `unlink`-Schritt), sodass sie niemals im Benutzerverzeichnis zurückbleibt.

### Faules Verzeichnis-Handling: Niemals `.qwen/` beim Start erstellen

> **Nebenwirkung auf das Dateisystem beim Start (absichtlich vermieden).** Der Watcher darf **niemals** `<projekt>/.qwen/` (oder `~/.qwen/`) nur erstellen, um es überwachen zu können. Eine frühere Version rief `mkdirSync({ recursive: true })` für jedes fehlende Einstellungsverzeichnis auf, was bedeutete, dass ein normaler, nicht-leerer Start `<projekt>/.qwen/` sogar in Projekten erstellte, die nie Qwen-Einstellungen hatten – das den Arbeitsbereich und den Git-Status verschmutzte. Die Verzeichniserstellung wird ausschließlich von der Einstellungs-_Persistenz_ gesteuert (`saveSettings()` führt sein eigenes `mkdirSync` aus, wenn der Benutzer tatsächlich Einstellungen schreibt).

Um dennoch eine später in der Sitzung hinzugefügte `settings.json` zu erkennen, ohne das Verzeichnis zu erstellen oder den Projektbaum zu durchlaufen, verwendet der Watcher eine zweistufige, pro-Bereich-Strategie, die auf die **Verzeichnis**-Existenz abzielt:

- **`.qwen` existiert beim Start** → direkt überwachen (`watchTargetDir`, die obige Strategie).
- **`.qwen` fehlt** → **Bootstrap-Überwachung des übergeordneten Verzeichnisses** (`watchParentForDir`): `chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })` wobei das `ignored`-Prädikat `(p) => p !== parentDir && basename(p) !== '.qwen'` nur den Eintrag `.qwen` durchlässt. Dies unterdrückt das gesamte unzusammenhängende oberflächliche Rauschen und durchläuft nie den Baum. Sobald `.qwen` erscheint, **befördert** der Watcher: Er schließt den Bootstrap-Watcher und startet einen Ziel-Watcher auf `.qwen`, plant dann eine Aktualisierung, um eine möglicherweise bereits darin enthaltene `settings.json` zu erfassen.

Details zur Robustheit:

- **TOCTOU-Schutz**: Nach dem Scharfschalten des Bootstrap-Watchers (der `ignoreInitial` verwendet), wird `existsSync(dir)` erneut überprüft; wenn `.qwen` in der Zwischenzeit erstellt wurde, erfolgt die Beförderung sofort.
- **Rückstufung bei Entfernung**: Wenn `.qwen` selbst gelöscht wird (`unlinkDir`), stuft sich der Ziel-Watcher zurück zu einem übergeordneten Bootstrap-Watcher, sodass eine spätere Neuerstellung immer noch erfasst wird.
- **Generationsschutz**: chokidars `close()` ist asynchron, sodass ein veralteter `'all'`-Callback von einem gerade heruntergefahrenen Watcher sonst erneut die Beförderung auslösen und Watcher stapeln könnte. Ein pro-Bereich monotoner Generierungstoken (bei jeder Beförderung/Rückstufung und bei `stopWatching` erhöht) macht veraltete Callbacks unwirksam und garantiert höchstens einen aktiven Watcher pro Bereich.

### Änderungserkennung: Semantischer Diff als primärer Deduplizierungsmechanismus

Jedes Mal, wenn der Watcher auslöst, erstellt er zunächst einen Schnappschuss **des aktuellen In-Memory-Zustands vor dem Neuladen** (`JSON.stringify(file.settings)`), ruft dann `reloadScopeFromDisk()` zum Neuladen auf und vergleicht schließlich die Vorher-/Nachher-Schnappschüsse. Listener werden nur benachrichtigt, wenn sich der semantische Inhalt tatsächlich geändert hat.

Wichtig: Der Vergleich erfolgt zwischen dem In-Memory-Zustand **vor und nach dem Neuladen**, nicht gegen einen gespeicherten historischen Schnappschuss. Dies liegt daran, dass `setValue()` synchron `file.settings` im Speicher aktualisiert, bevor es auf die Festplatte schreibt. Wenn der Watcher also ein Neuladen auslöst, enthält der In-Memory-Zustand bereits den selbst geschriebenen Wert – das Neuladen erzeugt denselben Inhalt → kein Diff → keine Benachrichtigung.
Dadurch werden folgende Fälle natürlich unterdrückt:

- Doppelte Ereignisse durch eigene Schreibvorgänge (`setValue()` hat den Speicher bereits aktualisiert; ein erneutes Laden liefert identischen Inhalt → kein Unterschied → keine Benachrichtigung)
- Nur Format-/Kommentaränderungen (aufgelöste Einstellungen enthalten keine Kommentare)
- Editor-Speichervorgänge ohne Inhaltsänderung
- Doppelte Chokidar-Ereignisse

Bekannte Einschränkung: `JSON.stringify` reagiert empfindlich auf die Reihenfolge der Schlüssel. Wenn ein Benutzer Schlüssel in settings.json manuell umordnet, ohne die Werte zu ändern, wird eine harmlose zusätzliche Benachrichtigung ausgelöst. Das ist akzeptabel; es ist nicht nötig, eine Deep-Equality-Abhängigkeit einzuführen.

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
  // 'bootstrap' = Überwachen des Elternverzeichnisses auf `.qwen`; 'target' = Überwachen von `.qwen`
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // Monoton steigender Token pro Geltungsbereich; wird bei Promote/Demote erhöht, um veraltete Callbacks ungültig zu machen
  private readonly watchGeneration: Map<SettingScope, number> = new Map();
  private readonly changeListeners: Set<SettingsChangeListener> = new Set();
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingScopeChanges: Set<SettingScope> = new Set();
  private processing: boolean = false; // Serialisierungs-Wächter
  private started: boolean = false;

  static readonly DEBOUNCE_MS = 300;
  static readonly LISTENER_TIMEOUT_MS = 30_000;
}
```

**Kernmethoden**:

#### `startWatching()`

- Iteriert über beide Geltungsbereiche (User und Workspace)
- Verzweigt in Abhängigkeit davon, ob das **Verzeichnis** existiert: Überwacht `.qwen` direkt, wenn es existiert; andernfalls Bootstrap-Überwachung des Elternverzeichnisses (siehe [Lazy Directory Handling](#lazy-directory-handling-never-create-qwen-at-startup))
- **Erstellt niemals** das Verzeichnis — kein `mkdirSync`
- `ignoreInitial: true`, `depth: 0` durchgängig
- Wird im Bare-Modus nicht aufgerufen

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // Verzeichnis niemals erstellen; die Persistenz der Einstellungen (saveSettings) ist dafür zuständig.
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` ist der oben beschriebene Überwacher des Elternverzeichnisses mit strikter Basisnamen-Prüfung (er stuft auch auf einen Bootstrap-Überwacher zurück, wenn `.qwen` selbst entfernt wird). `watchParentForDir` aktiviert den Bootstrap-Überwacher (nur für `.qwen`) und stuft auf, sobald `.qwen` erscheint:

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
      debugLogger.warn(`Fehler im Settings-Bootstrap-Überwacher für ${parentDir}:`, error);
    });

  this.watchers.set(scope, watcher);
  this.watchStage.set(scope, 'bootstrap');

  // TOCTOU-Absicherung: `.qwen` könnte zwischen der Existenzprüfung und hier erschienen sein.
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // Schutz vor doppeltem Promote
  await this.replaceWatcher(scope); // erhöht Generation + wartet auf asynchrones close()
  if (!this.started) return;
  this.watchTargetDir(scope, settingsPath);
  this.scheduleRefresh(scope); // nimmt eine bereits in .qwen vorhandene settings.json auf
}
```

#### `stopWatching()` — Idempotentes Herunterfahren

```typescript
stopWatching(): void {
  if (!this.started) return;
  this.started = false;
  for (const [, watcher] of this.watchers) {
    watcher.close().catch((err) => debugLogger.warn('Watcher-close-Fehler:', err));
  }
  this.watchers.clear();
  if (this.refreshTimer) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
  this.pendingScopeChanges.clear();
}
```

#### `scheduleRefresh(scope)` — 300 ms Entprellung + Akkumulation des Geltungsbereichs

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
#### `drainPendingChanges()` — Serialisierte Verarbeitung zur Vermeidung von Wiedereintritt

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // vorherige Runde läuft noch; sie wird beim Beenden alle verarbeiten
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

#### `handleChange(scopes)` — Neu laden + semantischer Diff + Benachrichtigung

```typescript
private async handleChange(changedScopes: Set<SettingScope>): Promise<void> {
  const events: SettingsChangeEvent[] = [];

  for (const scope of changedScopes) {
    const file = this.settings.forScope(scope);

    // Snapshot des aktuellen In-Memory-Zustands vor dem Neuladen (enthält setValue()-Mutationen)
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk hat intern try/catch; bei Parse-Fehler bleibt alter Zustand erhalten
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // Semantischer Diff: nur benachrichtigen, wenn sich der Inhalt tatsächlich geändert hat
    // Selbst-Schreib-Unterdrückung: setValue() hat den Speicher bereits aktualisiert → reload stimmt überein → keine Benachrichtigung
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

#### `notifyListeners(events)` — `Promise.allSettled()` + 30s Timeout

Verwendet das gleiche Benachrichtigungsmuster wie SkillManager (`packages/core/src/skills/skill-manager.ts:188-236`): Jeder Listener wird mit einem 30s-Timeout-Rennen versehen, parallel über `Promise.allSettled` ausgeführt, Fehler werden nicht weitergereicht.

#### `addChangeListener(listener)` — Gibt eine unsubscribe-Funktion zurück

### 2. Änderungen an `LoadedSettings`

**Datei**: `packages/cli/src/config/settings.ts`

**Keine Änderungen nötig**. Der semantische Diff-Mechanismus ist vollständig im Watcher gekapselt. `setValue()` aktualisiert synchron den Speicher → `saveSettings()` schreibt auf die Festplatte → Watcher wird ausgelöst → `reloadScopeFromDisk()` lädt neu → Diff-Vergleich findet identischen Inhalt → keine Benachrichtigung. Die Kette schließt sich von selbst.

### 3. Config-Integration (Minimale Schnittstelle)

**Datei**: `packages/core/src/config/config.ts`

Zu `ConfigParameters` hinzufügen:

```typescript
/** Lebenszyklus-Handle für einen externen Datei-Watcher. Wird beim Herunterfahren gestoppt. */
settingsWatcher?: { stopWatching(): void };
```

In `Config.shutdown()` den Watcher **vor** dem `initialized`-Check stoppen:

```typescript
async shutdown(): Promise<void> {
  try {
    // Stoppt den externen Watcher unabhängig vom Initialisierungsstatus
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... restliche Aufräumlogik ...
  }
}
```

**Es werden keine `settingsChangeListeners` zu Config hinzugefügt.** Das Auslösen von Änderungsereignissen wird vollständig in der CLI-Ebene behandelt, wo Listener direkt Core-Refresh-Methoden aufrufen (z.B. `skillManager.refreshCache()`, `toolRegistry.restartMcpServers()`). Dadurch bleibt der Core von der Semantik der Einstellungsänderungen unabhängig.

### 4. Startlogik

**Datei**: `packages/cli/src/gemini.tsx`

Nach `loadSettings()` und `loadCliConfig()`:

```typescript
// Watcher erstellen (im Bare-Modus überspringen)
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// Watcher-Lebenszyklus-Handle beim Laden der CLI-Config übergeben
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// Änderungslistener registrieren (zukünftige Unteraufgaben fügen hier die eigentliche Refresh-Logik ein)
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Einstellungen geändert:', events.map(e => `${e.scope}:${e.changeType}`));
  // Unteraufgaben 2-6 werden hinzufügen:
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - needsRefresh-Flag
});
```

**`loadCliConfig`-Signaturänderung** (`packages/cli/src/config/config.ts`): Optionalen Parameter hinzufügen, um `settingsWatcher` an `ConfigParameters` zu übergeben.

## Behandlung von Grenzfällen

| Szenario                                  | Behandlung                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `.qwen`-Verzeichnis existiert nicht       | **Wird nie erstellt.** Bootstrap-Überwachung des Elternverzeichnisses (`depth: 0`, nur `.qwen`-Filter), Promotion sobald `.qwen` erscheint |
| `.qwen` nach dem Start erstellt           | Bootstrap-Watcher fängt `addDir` ab, befördert zu einem Ziel-Watcher und plant einen Refresh               |
| `.qwen` nach Promotion gelöscht           | Ziel-Watcher fängt `unlinkDir` ab → Degradierung zurück zu einem Eltern-Bootstrap-Watcher                  |
| Datei gelöscht                            | `reloadScopeFromDisk` erkennt `!existsSync`, setzt auf `{}` zurück, Diff löst `deleted`-Ereignis aus       |
| Datei nach dem Start erstellt (Verz. existiert) | Verzeichnis-Watcher fängt `add`-Ereignis, `reloadScopeFromDisk` liest die neue Datei                  |
| Veralteter Callback während Promote/Demote | Per-Scope-Generation-Token macht den in-flight-Callback des schließenden Watchers zu einem No-Op (kein Watcher-Stacking) |
| Editor-atomare Schreibvorgänge            | Verzeichnisüberwachung + strikte Basisnamen-Filterung (schließt `.tmp`/`.orig` aus) + 300ms Debounce-Coalescing |
| `.tmp`/`.orig`-Dateiereignisse            | Basisnamen-Filter gleicht exakt `settings.json` ab, alle anderen Dateinamen werden ignoriert               |
| Selbst-Schreiben (`setValue` → `saveSettings`) | Semantischer Diff: neugeladener Inhalt stimmt mit In-Memory-Snapshot überein → keine Benachrichtigung |
| Selbst-Schreiben gleichzeitig mit externer Bearbeitung | Externe Bearbeitung ändert Inhalt → Diff erkennt die Änderung → korrekte Benachrichtigung      |
| Nur Format-/Kommentaränderungen           | `reloadScopeFromDisk` löst Einstellungen ohne Kommentare auf → Diff stimmt überein → keine Benachrichtigung |
| Doppelte chokidar-Ereignisse              | Debounce-Coalescing + semantischer Diff bieten doppelten Schutz                                             |
| `QWEN_HOME`-Umleitung                     | `getUserSettingsPath()` löst den Pfad bereits auf; Watcher verwendet den aufgelösten Pfad                   |
| Bare-Modus                                | `startWatching()` wird nie aufgerufen, kein Overhead                                                         |
| Fehler beim Erstellen des Watchers        | Ausnahme abgefangen, Warnung protokolliert, dieser Scope hat keine Echtzeiterkennung, Funktionalität bleibt unbeeinträchtigt |
| `reloadScopeFromDisk`-Parse-Fehler        | Internes try/catch (`settings.ts:501`) erhält alten Zustand → vorher/nachher-Diff stimmt überein → keine Benachrichtigung |
| Änderung der Schlüsselreihenfolge (keine Werteänderung) | `JSON.stringify` ist empfindlich gegenüber Schlüsselreihenfolge; kann eine harmlose zusätzliche Benachrichtigung auslösen |
| Fehler bei der Config-Initialisierung      | `shutdown()` stoppt Watcher vor dem `initialized`-Check, verhindert Lecks                                 |
| Wiedereintritt (Listener läuft noch)      | `processing`-Flag + `drainPendingChanges`-Schleife serialisiert die Verarbeitung                            |
| Ungültiges JSON                           | `reloadScopeFromDisk` internes try/catch erhält alten Zustand                                                |
## Leistungsanalyse

- Maximal 1 Watcher pro Scope (≤ 2 insgesamt), jeder mit `depth: 0` — minimaler Dateideskriptor-Overhead; Promote/Demote tauschen Watcher aus, stapeln sie nie
- `depth: 0` bedeutet **kein rekursiver Durchlauf** des Projektbaums, selbst nicht für den übergeordneten Bootstrap-Watcher in einem großen Monorepo. Die Kosten beschränken sich auf die direkten Kinder des übergeordneten Verzeichnisses: Unzusammenhängende Änderungen auf oberster Ebene wecken chokidar für einen `readdir`- + `ignored`-Filterdurchlauf (`O(top-level entries)`), bevor das Ereignis unterdrückt wird — niemals ein rekursiver Scan.
- 300ms Entprellung stellt sicher, dass schnelle Editor-Speicherungen keine mehrfachen Neuladungen auslösen.
- `reloadScopeFromDisk` verwendet synchrones `readFileSync`, < 1ms pro Aufruf.
- Der `JSON.stringify`-Vergleich ist O(n), aber Einstellungsobjekte sind typischerweise < 10KB; kein zusätzlicher Snapshot-Speicher nötig.
- Listener-Benachrichtigung läuft parallel via `Promise.allSettled`.
- Kein Polling — rein ereignisgesteuert.

## Zu erstellende/ändernde Dateien

**Neue Dateien**:

- `packages/cli/src/config/settingsWatcher.ts` — Watcher-Klasse
- `packages/cli/src/config/settingsWatcher.test.ts` — Unit-Tests

**Geänderte Dateien**:

- `packages/core/src/config/config.ts` — füge `settingsWatcher`-Feld zu `ConfigParameters` hinzu, rufe `stopWatching()` vor `initialized`-Prüfung in `Config.shutdown()` auf
- `packages/cli/src/config/config.ts` (`loadCliConfig`) — füge optionalen Parameter hinzu, um `settingsWatcher` zu übergeben
- `packages/cli/src/gemini.tsx` — Watcher instanziieren + Verdrahtung

**Keine Änderungen nötig**: `packages/cli/src/config/settings.ts` (semantischer Diff ist in sich abgeschlossen und benötigt keine Zusammenarbeit mit `LoadedSettings`)

## Testplan

### Unit-Tests (`settingsWatcher.test.ts`)

Mokke chokidar (unter Wiederverwendung des `skill-manager.test.ts`-Mockmusters):

1. **Lebenszyklus**: `startWatching` erstellt Watcher, `stopWatching` schließt Watcher, beide sind idempotent.
2. **Pfadfilterung**: Nur Ereignisse mit dem Basisnamen `settings.json` lösen eine Aktualisierung aus; `.tmp`/`.orig`/andere Dateien werden ignoriert.
3. **Entprellung**: Mehrere schnelle Ereignisse werden zu einem Neuladen zusammengefasst (`vi.useFakeTimers()`).
4. **Semantischer Diff**: Unveränderter Inhalt → Listener wird nicht aufgerufen; geänderter Inhalt → Listener wird mit korrekten Ereignissen aufgerufen.
5. **Eigenschreib-Unterdrückung**: Durch `setValue()` ausgelöste Watcher-Ereignisse werden durch identischen Diff natürlich gefiltert.
6. **Serialisierung**: Neue Ereignisse während `handleChange` werden gesammelt, nach Abschluss der Verarbeitung abgearbeitet.
7. **Fehlerisolierung**: chokidar-Fehler stürzen nicht ab; Listener-Ausnahmen beeinträchtigen andere Listener nicht; `reloadScopeFromDisk`-Fehler werden abgefangen.
8. **Listener-Timeout**: 30s Timeout-Schutz.
9. **Faules Verzeichnis-Watching**: Wenn `.qwen` fehlt, wird `mkdirSync` nie aufgerufen; ein Bootstrap-Watcher wird auf dem übergeordneten Verzeichnis aktiviert und sein `ignored`-Prädikat erlaubt nur den Eintrag `.qwen`.
10. **Promote / TOCTOU**: Wenn `.qwen` erscheint (via `addDir` oder die erneute Prüfung nach dem Aktivieren), schließt dies den Bootstrap-Watcher, öffnet einen Ziel-Watcher auf `.qwen` und plant eine Aktualisierung.
11. **Demote / Neuerstellung**: Entfernen von `.qwen` (`unlinkDir`) startet den Bootstrap auf dem übergeordneten Verzeichnis neu; eine anschließende Neuerstellung promoted wieder.
12. **Generierungs-Schutz**: Ein veralteter Callback von einem bereits geschlossenen Bootstrap-Watcher erstellt keinen zweiten Ziel-Watcher.

### Regressionsüberprüfung

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### Manuelle Überprüfung

Bearbeiten Sie `~/.qwen/settings.json` während einer laufenden Sitzung und beobachten Sie die Debug-Log-Ausgabe für Änderungsereignisse.

---

## Folge-Teilaufgabe: Ereignisse für Neustart-erfordernde und sensible Einstellungen unterdrücken

> **Status: Unterdrückungs-Gate implementiert; zwei Schema-Umstellungen noch ausstehend (Forschung).** Teilaufgabe 1 oben hat ein `SettingsChangeEvent` pro Scope für jede semantische Änderung ausgegeben. Diese Folgeaufgabe fügt einen Filter hinzu, sodass Änderungen, die auf Einstellungen beschränkt sind, die ohne Neustart nicht wirklich wirksam werden können – oder die sensibel sind (Anmeldeinformationen) – **keine** Listener benachrichtigen.
>
> - **Erledigt:** das auf `requiresRestart` basierende Unterdrückungs-Gate in `SettingsWatcher.handleChange()` plus Unit-Tests (siehe Mechanismus unten).
> - **Ausstehend:** die beiden `requiresRestart`-Schema-Korrekturen (`modelProviders` → `true`, `permissions.*` → hot-reloadable lassen), jede abhängig von der Überprüfung des Laufzeit-Lesepfads zuerst.

### Motivation

Einige Einstellungen werden genau einmal während des Prozessstarts gelesen (`Config.initialize()`, Content-Generator/Client-Erstellung, Kindprozess-Spawning, Node-Laufzeit-Flags). Beispiele, die der Benutzer explizit genannt hat: **API-Tokens, `env` und Modellanbieter**. Das Ausgeben eines Hot-Reload-Ereignisses dafür ist aktiv irreführend – der Listener würde "aktualisieren", aber der neue Wert würde nicht wirklich angewendet, bis der Benutzer `qwen-code` neu startet. Sensible Werte (Anmeldeinformationen) sollten zusätzlich nicht durch eine laufende Sitzung neu verdrahtet werden.

### Entscheidung: Das `requiresRestart`-Flag des Schemas wiederverwenden (einzige Quelle der Wahrheit)

`settingsSchema.ts` deklariert bereits `requiresRestart: boolean` auf **jedem** Schlüssel, und `packages/cli/src/utils/settingsUtils.ts` stellt bereits die Lookups bereit:
- `requiresRestart(key: string): boolean` — Flag für einen Dot-Path-Schlüssel
- `getFlattenedSchema()` — vollständig flache `key → definition`-Map
- `getRestartRequiredSettings()` — alle Schlüssel mit `requiresRestart: true`

Wir werden **dieses Flag als Unterdrückungssignal wiederverwenden**, anstatt eine separate manuell kuratierte Denylist zu pflegen (die zwangsläufig vom Schema abweichen würde). `requiresRestart: true` bedeutet bereits genau „wird ohne Neustart nicht wirksam", was genau die Bedingung ist, unter der ein Ereignis unterdrückt werden soll.

### Mechanismus (implementiert in `SettingsWatcher.handleChange()`)

Der alte Gate führte einen Ganzdatei-`JSON.stringify`-Diff durch und konnte nicht sagen, _welche_ Schlüssel sich geändert haben. Er wird ersetzt durch einen Diff auf Blattebene + Klassifizierung pro Schlüssel:

1. **`collectChangedKeys(before, after)`** erstellt einen Snapshot des In-Memory-Zustands vor dem Neuladen (`structuredClone`), durchläuft dann vorher/nachher und sammelt den Dot-Path jedes Blatts, dessen Wert sich unterscheidet. Plain-Objekte werden rekursiv durchlaufen; Arrays und Primitive werden als Ganzes verglichen (entsprechend Schema-Array-Schlüsseln wie `permissions.allow`). Hinzugefügte/entfernte Schlüssel tauchen als geänderte Blätter auf, sodass Dateierstellung/-löschung ohne separate Existenzprüfung abgedeckt ist.
2. **`isRestartRequiredKey(path)`** löst jeden geänderten Pfad gegen das Schema auf, indem der **längste Schema-Schlüssel, der ein Präfix des (oder gleich dem) Pfad ist**, verwendet wird. Freiform-Objekt-Einstellungen (`env`, `modelProviders`) sind Schema-Blatt-Schlüssel, daher wird `env.FOO` auf die `env`-Definition aufgelöst. Unbekannte Schlüssel standardmäßig auf **nicht** neustartpflichtig, sodass eine Änderung, die wir nicht klassifizieren können, niemals stillschweigend unterdrückt wird.
3. Der Scope benachrichtigt **nur, wenn mindestens ein geänderter Schlüssel hot-reloadable ist** (`!isRestartRequiredKey`). Wenn jeder geänderte Schlüssel neustartpflichtig ist, erzeugt der Scope kein Ereignis.

Die Form von `SettingsChangeEvent` bleibt unverändert (immer noch `{ scope, path, changeType }`); das Mitführen der überlebenden geänderten Schlüssel im Ereignis wird als mögliche spätere Verbesserung offen gelassen. Selbstschreib-Unterdrückung (leerer Diff → kein Ereignis), Entprellung, Serialisierung und Listener-Timeout-Verhalten bleiben alle unverändert.

### Zwei Schema-Anpassungen, die zu recherchieren und anzuwenden sind

Diese beiden `requiresRestart`-Werte müssen korrigiert werden, damit der Wiederverwendungsansatz wie beabsichtigt funktioniert. **Jeder erfordert die Überprüfung des tatsächlichen Laufzeit-Lesepfads, bevor das Flag umgedreht wird.**

1. **`modelProviders`: `false` → `true`** (`settingsSchema.ts:294`)
   - Derzeit ist es mit `requiresRestart: false` markiert, sodass es unter dem Wiederverwendungsansatz _nicht_ unterdrückt würde – was der Anforderung widerspricht, dass Provideränderungen nicht hot-reloaden.
   - Die Provider-Konfiguration (einschließlich pro-Provider `apiKey`/`baseUrl`) wird beim Bau des Modell-Clients/Content-Generators während des Starts verwendet.
   - **Recherchepunkt:** bestätigen, dass es kein Laufzeit-Nachlesen von `modelProviders` gibt (Suche nach Content-Generator/Client-Konstruktion). Erwartetes Ergebnis: das `false` ist ein latenter Fehler; auf `true` setzen.

2. **`permissions.*`: hot-reloadable behalten** (`settingsSchema.ts:1560`, gesamter Unterbaum derzeit `requiresRestart: true`)
   - Berechtigungsregeln (`deny > ask > allow`) werden pro Tool-Aufruf ausgewertet und sind als die Einstellungen gedacht, die Benutzer am ehesten sofort wirksam sehen möchten.
   - Der gesamte `permissions`-Unterbaum ist `showInDialog: false`, daher hat sein `requiresRestart`-Flag derzeit **keine UI-Bedeutung** – ein starkes Indiz dafür, dass das `true` ein Standardwert war und keine bewusste „braucht Neustart“-Entscheidung, sodass die Auswirkung des Umkehrens gering ist.
   - **Recherchepunkt:** bestätigen, dass die Laufzeit die Berechtigungen live nachliest (z. B. über `config.getXxx()` zur Auswertungszeit) und nicht aus einem Start-Snapshot. Wenn bestätigt, setzen Sie den `permissions`-Unterbaum auf `requiresRestart: false`, sodass er **nicht** vom Wiederverwendungsmechanismus unterdrückt wird.

> Hinweis: Da `requiresRestart` auch in der Einstellungs-UI/Neustart-Aufforderungen angezeigt wird, ändert das Umkehren dieser Flags auch dieses Verhalten. Das ist akzeptabel und arguably korrekter, sollte aber in der PR-Beschreibung erwähnt werden.

### Akzeptanz

- Eine Änderung, die nur neustartpflichtige/sensible Schlüssel betrifft (`security.auth.*`, `env`, `modelProviders`, `mcpServers`, `proxy`, …) sendet **kein** `SettingsChangeEvent`.
- Eine Änderung an einem hot-reloadable Schlüssel (`ui.*`, `model.name`, `permissions.*` nach dem Umkehren, …) sendet weiterhin ein Ereignis.
- Eine gemischte Änderung (ein neustartpflichtiger Schlüssel + ein hot-reloadable Schlüssel) sendet weiterhin ein Ereignis (der hot-reloadable Teil muss legitimerweise aktualisiert werden).
- Eine unbekannte (nicht im Schema vorhandene) Schlüsseländerung sendet weiterhin ein Ereignis, anstatt stillschweigend unterdrückt zu werden.

Teststatus:

- **Erledigt** — `settingsWatcher.test.ts`-Block `restart-required suppression` deckt alle unterdrückten (`env`, `security.auth.apiKey`), alle erlaubten (`ui.theme`), gemischte und unbekannte Schlüsselfälle ab.
- **Ausstehend (mit den Schema-Umkehrungen)** — `settingsSchema.test.ts`-Assertions, die die beiden korrigierten `requiresRestart`-Werte festlegen, und ein Watcher-Test, der bestätigt, dass `permissions.*` nach dem Umkehren nicht mehr unterdrückt wird.
