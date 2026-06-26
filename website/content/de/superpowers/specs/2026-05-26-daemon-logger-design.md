# `qwen serve` Daemon-Datei-Logger — Design

- **Issue**: [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **Branch**: `feat/support_daemon_logger`
- **Status**: Design freigegeben, Implementierungsplan offen
- **Datum**: 2026-05-26

## 1. Problem

`qwen serve` gibt Daemon-Level-Diagnosen (Lebenszyklus, Routenfehler, ACP-Child-Stderr) an `process.stderr` aus. Das funktioniert unter systemd/Docker, ist aber für SDK / Desktop / lokale Daemon-Nutzung fragil: Wenn ein Client `POST /session/:id/prompt` mit HTTP 500 sieht, sind der Route- + Session- + Stack-Kontext verloren, sofern der Betreiber nicht manuell stderr umgeleitet hat.

`createDebugLogger` (in `packages/core/src/utils/debugLogger.ts`) ist session-basiert: Es benötigt eine aktive `DebugLogSession` und schreibt in `${runtimeBaseDir}/debug/<sessionId>.txt`. Der Serve-Daemon startet **bevor** eine Session existiert, daher würden Daemon-Level-Aufrufe lautlos ins Leere laufen. Zudem kann es nicht wiederverwendet werden, ohne die pro-Session `debug/latest`-Semantik zu ändern.

Dieses Design fügt einen Daemon-spezifischen Datei-Sink hinzu, additiv zum bestehenden stderr-Verhalten, sodass Daemon-Diagnosen ohne Shell-Umleitung überdauern.

## 2. Umfang

### Im Umfang enthalten

- Ein neuer Logger, der einmal pro `runQwenServe`-Prozess initialisiert wird.
- Datei unter `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`, Anhänge-Modus (`append`).
- Tee von:
  - `runQwenServe.ts` Lebenszyklus / Shutdown / Signal-Meldungen
  - `sendBridgeError` (`server.ts`) Routenfehler
  - `bridge.ts` `writeServeDebugLine` (wenn `QWEN_SERVE_DEBUG` gesetzt ist)
  - `spawnChannel.ts` ACP-Child-Stderr-Weiterleitung
- Deaktivierung via `QWEN_DAEMON_LOG_FILE=0|false|off|no`.
- `latest`-Symlink im Daemon-Verzeichnis für `tail -f`.
- Dokumentation in der serve-CLI-Dokumentation.

### Nicht im Umfang enthalten (keine Ziele des Issues)

- Ersatz von OpenTelemetry oder Hinzufügen von Daemon-Tracing.
- Strukturierter Export von Unternehmensfehlerlogs (Issue #2014).
- Rotation oder Löschung bestehender Session-Debug-Logs.
- Log-Rotation / Größenbegrenzung für das Daemon-Log selbst (verschoben auf einen Folge-PR). Eine Boot-Zeit-Stderr-Warnung wird ausgegeben, wenn die vorhandene Datei ungewöhnlich groß ist; keine automatische Aktion.

## 3. Architektur

### 3.1 Modulgrenzen

| Schicht                                                  | Neu / Geändert | Verantwortung                                                                                                                             |
| -------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                 | **neu**        | Sink: init, format, append-to-file, tee-to-stderr, flush, latest-symlink                                                                  |
| `packages/cli/src/serve/runQwenServe.ts`                 | geändert       | Logger beim Boot initialisieren; Lebenszyklus-`writeStderrLine` durch `daemonLog.*` ersetzen; `await flush()` beim Shutdown; `onDiagnosticLine` an Bridge übergeben |
| `packages/cli/src/serve/server.ts`                       | geändert       | `sendBridgeError(...)` leitet durch `daemonLog.error(...)` weiter                                                                         |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`)     | geändert       | Optionales `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void` hinzufügen                                    |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine`  | geändert       | Falls `onDiagnosticLine` injiziert wurde, dieselbe Zeile teeen                                                                             |
| `packages/acp-bridge/src/spawnChannel.ts`                | geändert       | Child-Stderr-Weiterleitung teet jede präfixierte Zeile in `onDiagnosticLine`                                                              |

**Design-Absicht**: `daemonLogger.ts` ist eine einzelne Datei, CLI-lokal, kein globales Singleton. `acp-bridge` bleibt unwissend über CLI – es sieht nur einen Callback. Abhängigkeitsgraph unverändert.

### 3.2 Kein globales Singleton

Logger wird in `runQwenServe` erstellt, per Closure an interne Serve-Module übergeben, die ihn benötigen (oder per Callback an `acp-bridge`). Begründung:

- Spiegelt wider, wie `BridgeOptions` bereits Abhängigkeiten injiziert.
- Vermeidet die testübergreifenden State-Leaks, die `debugLogger` historisch getroffen haben (`resetDebugLoggingState()` existiert aus diesem Grund).

## 4. Daemon-ID & Dateipfad

- Pfad: `Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - Wird aufgelöst zu `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`.
  - Nutzt `Storage.getGlobalDebugDir()` wieder, sodass die Runtime-Verzeichnis-Überschreibung (Umgebungsvariable, kontextabhängig) automatisch greift.
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` disambiguiert mehrere Daemons im selben Workspace.
  - `workspaceHash` ist feste Länge, dateinamenssicher und stabil für denselben Workspace-Pfad.
- `latest`-Symlink: `~/.qwen/debug/daemon/latest` → Logdatei des aktuellen Prozesses. Wird bei Initialisierung mit dem existierenden `updateSymlink`-Helper (`packages/core/src/utils/symlink.ts`) aktualisiert. Symlink-Fehler werden geloggt und ignoriert – beeinträchtigen die primären Schreibvorgänge nicht. Unterscheidet sich von `${runtimeBaseDir}/debug/latest` (Session-basiert) gemäß Nicht-Zielen.
- Dateimodus: `'a'` (Anhängen mit `O_APPEND | O_CREAT`). Vorhandene Dateien überleben Neustarts zur Forensik.

## 5. Öffentliche API

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
   * Sowohl `err` als auch `ctx` sind optional und unabhängig voneinander.
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * Nur-Datei-Tee für Zeilen, deren Aufrufer bereits stderr schreiben
   * (ACP-Child-Stderr-Weiterleitung, `writeServeDebugLine`). Die Zeile wird
   * dem Daemon-Log unter dem Standard-Präfix `<timestamp> [<LEVEL>] [DAEMON] `
   * angehängt; sie wird NICHT nach stderr ausgegeben (was die Ausgabe des Betreibers verdoppeln würde).
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** Absoluter Pfad zur Daemon-Logdatei. */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** Ausstehende Anhänge abarbeiten. Wird vom runQwenServe-Shutdown-Handler aufgerufen. */
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

`initDaemonLogger` führt synchron Folgendes aus:

1. Berechnet `daemonId` + Log-Pfad.
2. `mkdirSync(parentDir, { recursive: true })` — Fehler → No-op-Logger zurückgeben, eine stderr-Warnung schreiben. Boot wird fortgesetzt.
3. `appendFileSync(path, '<erste Zeile>\n', { flag: 'a' })` — schreibt `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>` synchron. Dient auch als Schreibbarkeitsprobe; bei EACCES/ENOSPC wird in den Fehlermodus gewechselt = No-op-Logger + eine stderr-Warnung.
4. Aktualisiert den `latest`-Symlink (best-effort, Fehler werden geschluckt).
5. Gibt Logger zurück; nachfolgende Aufrufe von `info/warn/error/raw` stellen asynchrone `fs.promises.appendFile`-Aufrufe in die Warteschlange.

Wenn `process.env['QWEN_DAEMON_LOG_FILE']` einer der Werte `0|false|off|no` ist, wird `initDaemonLogger` vor jedem Dateisystemzugriff zu einem No-op-Logger abgekürzt.

## 6. Logzeilenformat

Spiegelt `debugLogger.buildLogLine` für visuelle Gleichheit wider:

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- Zeitstempel: ISO 8601, UTC.
- Level: `INFO` | `WARN` | `ERROR`. (Kein DEBUG anfangs – `QWEN_SERVE_DEBUG` fließt als `INFO` über `raw()` ein.)
- Tag: wörtlich `DAEMON`.
- Trace-Kontext: `trace.getActiveSpan()` wenn verfügbar; gleiche Logik wie `debugLogger.getActiveSpanTraceContext`. Helper entweder in ein gemeinsames Modul (`packages/core/src/utils/traceContext.ts`?) extrahiert oder lokal dupliziert – Planung vorbehalten.
- Kontextfelder: dargestellt als `key=value`, feste Reihenfolge (`route`, `sessionId`, `clientId`, `childPid`, `channelId`), dann alle zusätzlichen Schlüssel lexikografisch sortiert. Werte, die Leerzeichen oder `=` enthalten, werden mit `JSON.stringify` in Anführungszeichen gesetzt.
- Error-Stack: wird als eingerückte Fortsetzungszeilen nach der Nachricht angehängt.
- `raw(line, level)` schreibt die Zeile unverändert nach dem Standard-Präfix `<timestamp> [<LEVEL>] [DAEMON] `, keine weitere Verarbeitung.

**Tee-Semantik (wichtig):**

- `info` / `warn` / `error` schreiben **sowohl** in die Daemon-Logdatei **als auch** nach stderr (über den injizierten `stderr`-Schreiber). Aufrufer, die eine frühere `writeStderrLine(...)` ersetzen, verwenden diese direkt; kein separater stderr-Aufruf nötig.
- `raw` schreibt **nur in die Datei**. Wird von der ACP-Child-Stderr-Weiterleitung und `writeServeDebugLine` verwendet, wo der Aufrufer bereits über seinen bestehenden Pfad nach stderr schreibt. Eine Verdopplung würde die Betreiberausgabe überfluten.

## 7. Boot / Shutdown Ablauf

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

- Boot-Banner ist nur stderr (die Pfadzeile über sich selbst wäre zirkulär, wenn geloggt).
- `initDaemonLogger` ist synchron, sodass ein Fehler sofort beim Boot sichtbar ist, nicht erst nach dem ersten Fehler vergraben.
- Beim Shutdown ist `flush()` der letzte erwartete Schritt vor `process.exit`. SIGKILL ist definitionsgemäß nicht flushen – das akzeptieren wir.

## 8. Coverage-Tabelle

| Quelle                                                       | Heute                                         | Nachher                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `runQwenServe.ts` Lebenszyklus / Signale / Konfigwarnungen   | `writeStderrLine(...)`                        | `daemonLog.info \| warn(...)` (stderr passiert weiterhin – `daemonLog` teet)                     |
| `runQwenServe.ts` "listening on URL" (stdout)                | `writeStdoutLine(...)`                        | unverändert – Betriebsskripte parsen stdout                                                      |
| `server.ts:sendBridgeError`                                  | `writeStderrLine(...)` mit route/sessionId    | `daemonLog.error(msg, err, { route, sessionId, ... })` (stderr wird weiterhin durch den Tee von daemonLog ausgegeben) |
| `bridge.ts:writeServeDebugLine` (`QWEN_SERVE_DEBUG`)         | `writeStderrLine('qwen serve debug: ...')`    | Tee nach `onDiagnosticLine(line, 'info')`                                                        |
| `spawnChannel.ts` child stderr                               | `process.stderr.write(prefix + line + '\n')`  | zusätzlich `onDiagnosticLine(prefix + line, 'warn')`                                             |
| `writeStdoutLine`-Aufrufer                                   | unverändert                                   | unverändert                                                                                      |
| CLI-Nutzung / argparse-Fehler (frühe Validierung in `runQwenServe`) | `writeStderrLine(...)`                | unverändert (Logger existiert möglicherweise noch nicht)                                         |

Jeder vorhandene stderr-Schreibvorgang bleibt erhalten. Das Daemon-Log ist **additiv**, niemals ersetzend.

## 9. Schreibpfad & Flush

- Interne Warteschlange: Eine einzelne `Promise<void>`-Kette (`this.pending = this.pending.then(() => fs.promises.appendFile(...))`).
- Jeder `info/warn/error/raw`-Aufruf stellt einen Anhängevorgang (Datei) in die Warteschlange und, für `info/warn/error`, ruft synchron den injizierten `stderr`-Schreiber auf.
- Die stderr-Reihenfolge bleibt erhalten (synchron, vor dem Einreihen des Anhängevorgangs). Datei-Anhänge sind in der Einreihungsreihenfolge letztendlich konsistent.
- Schreibfehler setzen ein internes `degraded`-Flag und geben eine einmalige stderr-Warnung aus. Nachfolgende Aufrufe versuchen den Schreibvorgang trotzdem, aber der Zähler wird nicht geführt.
- `flush()` gibt das aktuelle Promise am Ende der Kette zurück.
- Keine Pufferschicht: Jeder Aufruf = ein `appendFile`. Das Volumen ist gering (Routenfehler + Lebenszyklus); Micro-Batching wäre verfrühte Optimierung.

## 10. Konfiguration

| Umgebungsvariable                                | Verhalten                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`         | `initDaemonLogger` gibt No-op zurück; Tee ist No-op; stderr unverändert                         |
| `QWEN_DAEMON_LOG_FILE=<irgendetwas anderes>` oder nicht gesetzt | Aktiviert (Standard)                                                              |
| `QWEN_RUNTIME_DIR=<path>`                        | Verschiebt das Wurzelverzeichnis `~/.qwen`, Daemon-Log wandert mit (bestehende Semantik)         |
| `QWEN_SERVE_DEBUG=1`                             | Bestehend – `writeServeDebugLine` aktiviert; Zeilen werden jetzt auch in das Daemon-Log geteet   |

`QWEN_DAEMON_LOG_FILE` ist bewusst getrennt von `QWEN_DEBUG_LOG_FILE`, sodass das Deaktivieren von Session-Debug-Logs nicht das Daemon-Log des Betreibers deaktiviert (und umgekehrt).

## 11. Fehlerbehandlung

- `initDaemonLogger` mkdir/open-Fehler → No-op-Logger + eine stderr-Warnung. Daemon-Boot wird fortgesetzt. Betreiber sieht nichts in der Datei, erhält aber weiterhin stderr.
- Fehler pro Anhängevorgang → degradiert-Flag setzen, eine stderr-Warnung ausgeben, weiter versuchen. Issue sagt nichts über ein degradiertes UI-Signal, daher keine öffentliche Oberfläche nötig.
- `flush()`-Ablehnung → im Shutdown-Handler abgefangen, via `writeStderrLine` geloggt. Blockiert den Exit nicht.
- `latest`-Symlink-Fehler → geschluckt; primäre Schreibvorgänge nicht betroffen.

## 12. Tests

### `daemonLogger.test.ts` (neu)

- Sandboxed `baseDir`, gemocktes `now`, `pid`, `stderr`.
- Pfad- und Daemon-ID-Ableitung einschließlich des 8-Zeichen-`workspaceHash` für bekannte Eingabe.
- `latest`-Symlink erstellt und bei nachfolgenden `initDaemonLogger`-Aufrufen im selben Verzeichnis aktualisiert.
- Level-Formatierung (INFO/WARN/ERROR), Kontextfeldreihenfolge, Error-Stack-Fortsetzung.
- Trace-Kontext-Injektion, wenn ein aktiver Span existiert.
- `raw(line, level)` schreibt die präfixierte Zeile wörtlich.
- `flush()` wird erst aufgelöst, wenn alle eingereihten Schreibvorgänge in der Datei landen.
- `QWEN_DAEMON_LOG_FILE=0` → keine Datei erstellt.
- `mkdir`-Fehler → No-op-Logger, eine stderr-Warnung, nachfolgende Aufrufe werfen keinen Fehler.
- `appendFile`-Fehler → degradiert-Flag gesetzt, eine stderr-Warnung.

### `runQwenServe.test.ts` (erweitern)

- Boot schreibt `daemon started ...`-Zeile ins Log.
- Shutdown-Handler wartet auf `daemonLog.flush()` vor dem Exit.
- stderr-Boot-Banner enthält den Daemon-Log-Pfad.

### `server.test.ts` (erweitern)

- Eine Route, die einen Fehler wirft, leitet den Fehler durch `daemonLog.error(...)` mit den richtigen `route` und `sessionId`.

### acp-bridge Tests (erweitern)

- `onDiagnosticLine`-Callback wird von `writeServeDebugLine` aufgerufen, wenn `QWEN_SERVE_DEBUG=1`, und von der `spawnChannel`-Child-Stderr-Weiterleitung. Tests injizieren einen erfassenden Fake; kein Dateisystem.

## 13. Dokumentation

- `docs/cli/serve.md` (oder wo immer serve dokumentiert ist) erhält einen Abschnitt "Daemon-Logdatei" mit: Pfad, Daemon-ID-Format, `latest`-Symlink, `QWEN_DAEMON_LOG_FILE`-Deaktivierung, Abgrenzung zu pro-Session `debug/<sessionId>.txt`.
- README unter `packages/cli/src/serve/` falls vorhanden.
- Kein CHANGELOG-ähnliches File in diesem Repo; Release-Notes werden separat behandelt.

## 14. Rollback

- Rein additive Änderung. Rollback = Commit rückgängig machen:
  - `daemonLogger.ts` + dessen Test löschen.
  - Änderungen in `runQwenServe.ts` (Lebenszyklus / sendBridgeError / bridge / spawnChannel) rückgängig machen.
  - `onDiagnosticLine` aus `BridgeOptions` entfernen.
- Kein On-Disk-State zum Bereinigen; vorhandene Daemon-Logdateien werden verwaist, aber sind harmlos.

## 15. Abnahmekriterien (aus Issue)

| Kriterium                                                         | Wie erfüllt                                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `qwen serve` erstellt/erweitert Daemon-Log ohne Shell-Umleitung    | `initDaemonLogger` öffnet die Datei beim Boot                                                    |
| HTTP 500 von `POST /session/:id/prompt` im Daemon-Log korrelierbar | `sendBridgeError` schreibt `route=` + `sessionId=`                                              |
| ACP-Child-Stderr-Zeilen ebenfalls im Daemon-Log                   | `spawnChannel` teet durch `onDiagnosticLine`                                                    |
| Logging funktioniert vor der ersten Session und nachdem alle Sessions geschlossen sind | Nicht Session-basiert; lebt für die Daemon-Lebensdauer      |
| Bestehendes stderr-Verhalten intakt                               | Alle Schreibvorgänge sind additiv; kein `writeStderrLine`-Aufruf wird entfernt ohne ein gleichwertiges Gegenstück |
| Log-Pfad + Deaktivierung dokumentiert                             | Dokumentationsabschnitt in §13                                                                   |

## 16. Offene Fragen

Keine blockierenden. Mögliche Folgeaufgaben:

- Soll der `latest`-Symlink in `~/.qwen/debug/daemon/latest` oder `~/.qwen/debug/daemon-latest`? Spezifikation wählt ersteres für Verzeichnis-Ordnung.
- Sollten wir JSON-Zeilen-Ausgabe als zukünftiges Flag anbieten (z.B. `QWEN_DAEMON_LOG_FORMAT=json`)? Nicht im Umfang dieses PRs; strukturierter Export ist, was #2014 behandelt.