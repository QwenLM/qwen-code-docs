# `qwen serve` Daemon File Logger — Design

- **Issue**: [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **Branch**: `feat/support_daemon_logger`
- **Status**: Design freigegeben, Implementierungsplan ausstehend
- **Datum**: 2026-05-26

## 1. Problem

`qwen serve` gibt Daemon-Level-Diagnosedaten (Lebenszyklus, Route-Fehler, ACP-Child-stderr) an `process.stderr` aus. Das funktioniert unter systemd/Docker, ist aber fragil für die SDK-/Desktop-/lokale Daemon-Nutzung: Wenn ein Client sieht, dass `POST /session/:id/prompt` HTTP 500 zurückgibt, sind der Route-, Session- und Stack-Kontext verloren, es sei denn, der Operator hat stderr manuell umgeleitet.

`createDebugLogger` (in `packages/core/src/utils/debugLogger.ts`) ist sessionbezogen: Es erfordert eine aktive `DebugLogSession` und schreibt nach `${runtimeBaseDir}/debug/<sessionId>.txt`. Der Serve-Daemon startet **bevor** eine Session existiert, daher würden Daemon-Level-Aufrufe stillschweigend ins Leere laufen (no-op). Es kann auch nicht wiederverwendet werden, ohne die Semantik von `debug/latest` pro Session zu ändern.

Dieses Design fügt ein daemon-spezifisches File-Sink hinzu, das zusätzlich zum bestehenden stderr-Verhalten funktioniert, sodass Daemon-Diagnosedaten ohne Shell-Weiterleitung (Redirection) erhalten bleiben.

## 2. Scope

### Im Scope

- Ein neuer Logger, der einmal pro `runQwenServe`-Prozess initialisiert wird.
- Datei unter `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`, Append-Modus.
- Tee von:
  - `runQwenServe.ts` Lebenszyklus- / Shutdown- / Signal-Nachrichten
  - `sendBridgeError` (`server.ts`) Route-Fehler
  - `bridge.ts` `writeServeDebugLine` (wenn `QWEN_SERVE_DEBUG` gesetzt ist)
  - `spawnChannel.ts` ACP-Child-stderr-Weiterleitung
- Opt-out über `QWEN_DAEMON_LOG_FILE=0|false|off|no`.
- `latest`-Symlink im Daemon-Verzeichnis für `tail -f`.
- Dokumentation in der Serve-CLI-Dokumentation.

### Außerhalb des Scope (Non-Goals aus dem Issue)

- Ersetzen von OpenTelemetry oder Hinzufügen von Daemon-Tracing.
- Strukturierter Enterprise-Error-Log-Export (Issue #2014).
- Rotation oder Löschung bestehender Session-Debug-Logs.
- Log-Rotation / Größenbegrenzung für das Daemon-Log selbst (auf einen Folge-PR verschoben). Beim Booten wird eine stderr-Warnung ausgegeben, wenn die bestehende Datei ungewöhnlich groß ist; es erfolgt keine automatische Aktion.

## 3. Architektur

### 3.1 Modulgrenzen

| Layer                                                   | Neu / Geändert | Verantwortung                                                                                                                                |
| ------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                | **neu**       | Sink: Init, Formatierung, Append-to-File, Tee-to-stderr, Flush, Latest-Symlink                                                                      |
| `packages/cli/src/serve/runQwenServe.ts`                | geändert       | Logger beim Booten initialisieren; Lebenszyklus-`writeStderrLine` durch `daemonLog.*` ersetzen; `await flush()` beim Shutdown; `onDiagnosticLine` an die Bridge übergeben |
| `packages/cli/src/serve/server.ts`                      | geändert       | `sendBridgeError(...)` wird durch `daemonLog.error(...)` geleitet                                                                                  |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`)    | geändert       | Optionales `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void` hinzufügen                                                 |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine` | geändert       | Wenn `onDiagnosticLine` injiziert wurde, dieselbe Zeile als Tee ausgeben                                                                                             |
| `packages/acp-bridge/src/spawnChannel.ts`               | geändert       | Child-stderr-Forwarder gibt jede präfixierte Zeile als Tee an `onDiagnosticLine` aus                                                                        |

**Design-Intention**: `daemonLogger.ts` ist eine Single-File, CLI-lokal, kein globaler Singleton. `acp-bridge` bleibt unwissend gegenüber der CLI – es sieht nur einen Callback. Der Dependency-Graph bleibt unverändert.

### 3.2 Kein globaler Singleton

Der Logger wird in `runQwenServe` erstellt und per Closure an interne Serve-Module übergeben, die ihn benötigen (oder per Callback an `acp-bridge`). Begründung:

- Spiegelt wider, wie `BridgeOptions` bereits Dependencies injiziert.
- Vermeidet die testübergreifenden State-Leaks, auf die `debugLogger` in der Vergangenheit gestoßen ist (`resetDebugLoggingState()` existiert aus diesem Grund).

## 4. Daemon-ID & Dateipfad

- Pfad: `Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - Löst sich auf zu `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`.
  - Verwendet `Storage.getGlobalDebugDir()` erneut, sodass der Runtime-Dir-Override (Umgebungsvariable, kontextbezogen) automatisch angewendet wird.
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` unterscheidet mehrere Daemons im selben Workspace.
  - `workspaceHash` hat eine feste Länge, ist dateinamen-sicher und stabil für denselben Workspace-Pfad.
- `latest`-Symlink: `~/.qwen/debug/daemon/latest` → Logdatei des aktuellen Prozesses. Wird beim Init mit dem bestehenden `updateSymlink`-Helper (`packages/core/src/utils/symlink.ts`) aktualisiert. Ein Symlink-Fehler wird protokolliert und ignoriert – er beeinträchtigt nicht die primären Schreibvorgänge. Unterscheidet sich von `${runtimeBaseDir}/debug/latest` (sessionbezogen) gemäß Non-Goal.
- Datei-Modus: `'a'` (Append bei `O_APPEND | O_CREAT`). Bestehende Dateien überstehen Neustarts für forensische Zwecke.

## 5. Public API

```ts
// packages/cli/src/serve/daemonLogger.ts

export interface DaemonLogContext {
  route?: string;
  sessionId?: string;
  clientId?: string;
  childPid?: number;
  channelId?: string;
  [key: string]: unknown;
}

export interface DaemonLogger {
  info(message: string, ctx?: DaemonLogContext): void;
  warn(message: string, ctx?: DaemonLogContext): void;
  /**
   * `err.stack` wird als eingerückte Fortsetzungszeilen nach der Nachricht angehängt.
   * Sowohl `err` als auch `ctx` sind optional und unabhängig.
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * File-only-Tee für Zeilen, deren Caller bereits in stderr schreibt
   * (ACP-Child-stderr-Forwarder, `writeServeDebugLine`). Die Zeile wird
   * unter dem Standard-Präfix `<timestamp> [<LEVEL>] [DAEMON] ` an das Daemon-Log angehängt;
   * sie wird NICHT an stderr ausgegeben (was die Ausgabe des Operators verdoppeln würde).
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** Absoluter Pfad zur Daemon-Logdatei. */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** Ausstehende Appends abarbeiten. Wird vom runQwenServe-Shutdown-Handler aufgerufen. */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // default process.pid
  now?: () => Date; // default () => new Date()
  stderr?: (line: string) => void; // default writeStderrLine
  baseDir?: string; // default Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

`initDaemonLogger` synchron:

1. Berechnet `daemonId` + Log-Pfad.
2. `mkdirSync(parentDir, { recursive: true })` — Fehler → No-Op-Logger zurückgeben, eine stderr-Warnung schreiben. Boot fährt fort.
3. `appendFileSync(path, '<first line>\n', { flag: 'a' })` — schreibt `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>` synchron. Dies dient gleichzeitig als Writability-Probe; bei EACCES/ENOSPC ist der Fehlermodus = No-Op-Logger + eine stderr-Warnung.
4. Aktualisiert den `latest`-Symlink (Best-Effort, Fehler werden geschluckt).
5. Gibt den Logger zurück; nachfolgende `info/warn/error/raw`-Aufrufe stellen asynchrone `fs.promises.appendFile` in die Warteschlange.

Wenn `process.env['QWEN_DAEMON_LOG_FILE']` einen der Werte `0|false|off|no` hat, springt `initDaemonLogger` vor jedem Dateisystemaufruf zu einem No-Op-Logger.

## 6. Log-Zeilenformat

`debugLogger.buildLogLine` für visuelle Konsistenz spiegeln:

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- Timestamp: ISO 8601, UTC.
- Level: `INFO` | `WARN` | `ERROR`. (Anfänglich kein DEBUG – `QWEN_SERVE_DEBUG` fließt als `INFO` über `raw()` ein.)
- Tag: Literal `DAEMON`.
- Trace-Kontext: `trace.getActiveSpan()`, wenn verfügbar; gleiche Logik wie `debugLogger.getActiveSpanTraceContext`. Helper in ein Shared-Modul extrahiert (`packages/core/src/utils/traceContext.ts`?) oder lokal dupliziert – bleibt dem Plan überlassen.
- Kontextfelder: Dargestellt als `key=value`, feste Reihenfolge (`route`, `sessionId`, `clientId`, `childPid`, `channelId`), dann alle zusätzlichen Schlüssel lexikografisch sortiert. Werte, die Leerzeichen oder `=` enthalten, werden mit `JSON.stringify` quotiert.
- Error-Stack: Wird als eingerückte Fortsetzungszeilen nach der Nachricht angehängt.
- `raw(line, level)` schreibt die Zeile unverändert nach dem Standard-Präfix `<timestamp> [<LEVEL>] [DAEMON] `, keine zusätzliche Verarbeitung.

**Tee-Semantik (wichtig):**

- `info` / `warn` / `error` schreiben in **sowohl** die Daemon-Logdatei **als auch** stderr (über den injizierten `stderr`-Writer). Caller, die ein vorheriges `writeStderrLine(...)` ersetzen, verwenden diese direkt; kein separater stderr-Aufruf nötig.
- `raw` schreibt **nur in die Datei**. Wird vom ACP-Child-stderr-Forwarder und `writeServeDebugLine` verwendet, wo der Caller bereits über seinen bestehenden Pfad in stderr schreibt. Eine Verdoppelung würde die Operator-Ausgabe überfluten.

## 7. Boot- / Shutdown-Flow

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // Boot-Banner ist nur stderr, um zu vermeiden, dass die Zeile auf sich selbst verweist

  bridge = createHttpAcpBridge({
    ...,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  })

  app = createServeApp({ ..., daemonLog })  // für sendBridgeError injiziert

  shutdownHandler(signal):
    daemonLog.warn(`shutdown signal=${signal}`)
    await drainBridge()
    await daemonLog.flush()
    process.exit(0)
```

- Boot-Banner ist nur stderr (die Pfadzeile über sich selbst wäre zirkulär, wenn sie geloggt würde).
- `initDaemonLogger` ist synchron, sodass jeder Fehler sofort beim Booten sichtbar ist und nicht nach dem ersten Fehler versteckt wird.
- Shutdown-`flush()` ist der letzte `await`-Schritt vor `process.exit`. SIGKILL ist per Definition nicht flushbar – das akzeptieren wir.

## 8. Coverage-Tabelle

| Quelle                                                        | Heute                                        | Nachher                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `runQwenServe.ts` Lebenszyklus / Signale / Config-Warnungen       | `writeStderrLine(...)`                       | `daemonLog.info \| warn(...)` (stderr erfolgt weiterhin – `daemonLog` macht ein Tee)                          |
| `runQwenServe.ts` "listening on URL" (stdout)                 | `writeStdoutLine(...)`                       | unverändert – Operator-Skripte parsen stdout                                                        |
| `server.ts:sendBridgeError`                                   | `writeStderrLine(...)` mit Route/SessionId  | `daemonLog.error(msg, err, { route, sessionId, ... })` (stderr wird weiterhin vom Tee des daemonLog ausgegeben) |
| `bridge.ts:writeServeDebugLine` (`QWEN_SERVE_DEBUG`)          | `writeStderrLine('qwen serve debug: ...')`   | Tee zu `onDiagnosticLine(line, 'info')`                                                          |
| `spawnChannel.ts` Child-stderr                                | `process.stderr.write(prefix + line + '\n')` | zusätzlich `onDiagnosticLine(prefix + line, 'warn')`                                                   |
| `writeStdoutLine` Caller                                     | unverändert                                    | unverändert                                                                                        |
| CLI-Nutzung / Argparse-Fehler (`runQwenServe` Early-Validation) | `writeStderrLine(...)`                       | unverändert (Logger existiert möglicherweise noch nicht)                                                             |
Jede bestehende stderr-Ausgabe bleibt erhalten. Das Daemon-Log ist **additiv**, niemals ersetzend.

## 9. Write Path & Flush

- Interne Queue: eine einzelne `Promise<void>`-Kette (`this.pending = this.pending.then(() => fs.promises.appendFile(...))`).
- Jeder `info/warn/error/raw`-Aufruf reiht ein Append (Datei) in die Queue ein und ruft für `info/warn/error` zusätzlich synchron den injizierten `stderr`-Writer auf.
- Die Stderr-Schreibreihenfolge bleibt erhalten (synchron, bevor der Append in die Queue eingereiht wird). Datei-Appends sind in der Einreih-Reihenfolge eventually consistent.
- Schreibfehler setzen ein internes `degraded`-Flag und geben eine einmalige Stderr-Warnung aus. Nachfolgende Aufrufe versuchen weiterhin den Schreibvorgang, aber der Zähler wird nicht weiter gepflegt.
- `flush()` gibt das aktuelle Tail-Promise zurück.
- Keine Buffering-Schicht: jeder Aufruf = ein `appendFile`. Das Volumen ist gering (Route-Fehler + Lifecycle); Micro-Batching ist verfrühte Optimierung.

## 10. Konfiguration

| Umgebungsvariable                               | Verhalten                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`        | `initDaemonLogger` gibt No-op zurück; Tee ist ein No-op; stderr unverändert  |
| `QWEN_DAEMON_LOG_FILE=<beliebiger anderer Wert>` oder nicht gesetzt | Aktiviert (Standard)                                                 |
| `QWEN_RUNTIME_DIR=<path>`                       | Verschiebt das `~/.qwen`-Root-Verzeichnis, das Daemon-Log wird mit verschoben (bestehende Semantik) |
| `QWEN_SERVE_DEBUG=1`                            | Bestehend – `writeServeDebugLine` wird aktiviert; Zeilen werden jetzt auch als Tee ins Daemon-Log geschrieben |

`QWEN_DAEMON_LOG_FILE` ist absichtlich von `QWEN_DEBUG_LOG_FILE` getrennt, damit das Deaktivieren der Debug-Logs pro Sitzung nicht das Daemon-Log des Operators deaktiviert (und umgekehrt).

## 11. Fehlerbehandlung

- `initDaemonLogger` mkdir/open-Fehler → No-op-Logger + eine Stderr-Warnung. Der Daemon-Boot fährt fort. Der Operator sieht nichts in der Datei, erhält aber weiterhin Stderr.
- Fehler beim einzelnen Append → Degraded-Flag umlegen, eine Stderr-Warnung ausgeben, weiter versuchen. Das Issue erwähnt kein UI-Signal für den Degraded-Modus, daher ist keine öffentliche Schnittstelle erforderlich.
- `flush()`-Rejection → wird im Shutdown-Handler abgefangen, über `writeStderrLine` geloggt. Blockiert den Exit nicht.
- `latest`-Symlink-Fehler → wird verschluckt; primäre Schreibvorgänge bleiben unberührt.

## 12. Testing

### `daemonLogger.test.ts` (neu)

- Sandboxed `baseDir`, gemocktes `now`, `pid`, `stderr`.
- Pfad- und Daemon-ID-Ableitung einschließlich des 8 Zeichen langen `workspaceHash` für bekannte Inputs.
- `latest`-Symlink wird erstellt und bei nachfolgenden `initDaemonLogger`-Aufrufen im selben Verzeichnis aktualisiert.
- Level-Formatierung (INFO/WARN/ERROR), Reihenfolge der Kontextfelder, Fortsetzung des Error-Stacks.
- Trace-Context-Injektion, wenn ein aktiver Span existiert.
- `raw(line, level)` schreibt die präfixierte Zeile wortwörtlich.
- `flush()` wird erst aufgelöst, nachdem alle eingereihten Schreibvorgänge in der Datei angekommen sind.
- `QWEN_DAEMON_LOG_FILE=0` → keine Datei wird erstellt.
- `mkdir`-Fehler → No-op-Logger, eine Stderr-Warnung, nachfolgende Aufrufe werfen keine Fehler.
- `appendFile`-Fehler → Degraded-Flag umgelegt, eine Stderr-Warnung.

### `runQwenServe.test.ts` (erweitern)

- Boot schreibt die Zeile `daemon started ...` in das Log.
- Shutdown-Handler wartet vor dem Exit auf `daemonLog.flush()`.
- Das Stderr-Boot-Banner enthält den Daemon-Log-Pfad.

### `server.test.ts` (erweitern)

- Eine Route, die einen Fehler wirft, leitet den Fehler über `daemonLog.error(...)` mit der richtigen `route` und `sessionId` weiter.

### acp-bridge-Tests (erweitern)

- `onDiagnosticLine`-Callback wird von `writeServeDebugLine` aufgerufen, wenn `QWEN_SERVE_DEBUG=1`, und vom `spawnChannel`-Child-Stderr-Forwarder. Tests injizieren eine aufzeichnende Fake-Implementierung; kein Dateisystem.

## 13. Dokumentation

- `docs/cli/serve.md` (oder wo auch immer `serve` dokumentiert ist) erhält einen Abschnitt "Daemon log file", der Folgendes abdeckt: Pfad, Daemon-ID-Format, `latest`-Symlink, `QWEN_DAEMON_LOG_FILE`-Opt-out, Abgrenzung zu `debug/<sessionId>.txt` pro Sitzung.
- README unter `packages/cli/src/serve/`, falls vorhanden.
- Keine CHANGELOG-Datei in diesem Repo; Release Notes werden separat behandelt.

## 14. Rollback

- Rein additive Änderung. Rollback = Commit zurücksetzen:
  - `daemonLogger.ts` + dessen Test löschen.
  - Änderungen an `runQwenServe.ts` lifecycle / sendBridgeError / bridge / spawnChannel zurücksetzen.
  - `onDiagnosticLine` aus `BridgeOptions` entfernen.
- Kein Zustand auf der Festplatte, der bereinigt werden muss; bestehende Daemon-Log-Dateien werden verwaist, sind aber harmlos.

## 15. Akzeptanzkriterien (aus dem Issue)

| Kriterium                                                           | Wie erfüllt                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `qwen serve` erstellt / hängt an das Daemon-Log ohne Shell-Redirection | `initDaemonLogger` öffnet die Datei beim Boot                                                   |
| HTTP 500 von `POST /session/:id/prompt` im Daemon-Log korrelierbar | `sendBridgeError` schreibt `route=` + `sessionId=`                                              |
| ACP-Child-Stderr-Zeilen ebenfalls im Daemon-Log                    | `spawnChannel` leitet über `onDiagnosticLine` als Tee weiter                                    |
| Logging funktioniert vor der ersten Sitzung und nach Schließen aller Sitzungen | Nicht sitzungsgebunden; lebt über die Daemon-Lebensdauer                                        |
| Bestehendes Stderr-Verhalten intakt                                | Alle Schreibvorgänge sind additiv; kein `writeStderrLine`-Aufruf wird entfernt, ohne dass ein gleichwertiger an seiner Stelle bleibt |
| Log-Pfad + Opt-out dokumentiert                                    | Dokumentationsabschnitt in §13                                                                  |

## 16. Offene Fragen

Keine blockierenden. Mögliche Folgeaufgaben:

- Sollte der `latest`-Symlink in `~/.qwen/debug/daemon/latest` oder `~/.qwen/debug/daemon-latest` liegen? Die Spec wählt Ersteres für eine aufgeräumte Verzeichnisstruktur.
- Sollen wir JSON-Line-Output als zukünftiges Flag anbieten (z. B. `QWEN_DAEMON_LOG_FORMAT=json`)? Außerhalb des Scope für diesen PR; strukturierter Export ist Thema von #2014.