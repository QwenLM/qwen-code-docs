# Stable and Bounded Daemon Logs

- **Status:** Implementiert
- **Datum:** 2026-07-15
- **Geltungsbereich:** `qwen serve` Datei-Logging, Lifecycle-Verantwortung, Access-Log-Zulassung, Daemon-Status und der TypeScript-SDK-Status-Spiegel

## Entscheidung

Jeder Runtime-Log-Namespace hat einen stabilen aktiven Pfad:

```text
${runtimeBaseDir}/debug/daemon/daemon.log
```

Normale Neustarts hängen an diesen Pfad an. Die feste Policy lautet:

| Limit                                 |        Wert |
| ------------------------------------- | -----------: |
| Aktive Datei                           |       10 MiB |
| Archive pro Familie                   |            4 |
| Gerendertes Datei-Record                  |      256 KiB |
| Akzeptierte, aber nicht abgesetzte Datei-Payload   |        4 MiB |
| Stabile Lease stale/update             |  60 s / 10 s |
| Stable-/Maintenance-Akquisitions-Budget | 1 s / 250 ms |
| Öffentliches Logger-Close-Budget            |          2 s |

Diese Werte sind bewusst weder CLI-Flags noch Umgebungsvariablen noch Settings. Eine gesunde stabile Familie belegt höchstens etwa 50 MiB. Das Vorhalten der jüngsten inaktiven Fallback-Familie bringt den konvergierten Namespace auf etwa 100 MiB. Live- oder noch-nicht-stale Fallback-Owner werden niemals gelöscht, daher kann der temporäre Verbrauch mit der Anzahl möglicherweise aktiver Daemons wachsen.

Jeder Start erzeugt eine zufällige 128-Bit-`runId`. Jedes Datei-Record beginnt mit unveränderlichem `runId`- und Daemon-PID-Kontext. Aufrufer-Kontext kann diese Werte nicht ersetzen. Stderr behält das bestehende Format und die Feldreihenfolge.

## Namespace und Verantwortung

Das konfigurierte Log-Verzeichnis ist der Verantwortungs- und Vorhaltungs-Namespace. Workspace, Listener-Port und PID sind keine Speicher-Identitäten: Ein Daemon kann mehrere Workspaces hosten, Port null ist dynamisch, Ports können bei Konflikten weiterzählen, und eingebettete Daemons können sich eine PID teilen.

Die stabile Familie ist im Besitz einer Lifetime-`proper-lockfile`-Lease. Ein Anwärter, der sie nicht erwerben kann, schreibt nach:

```text
debug/daemon/runs/run-<32-hex-runId>/daemon.log
```

Er hält die `.owner.lock` dieser Familie für seine Lebenszeit und wird während des Laufs niemals in die stabile Familie befördert. Der Boot-Banner und der vollständige Daemon-Status sind maßgeblich für den gewählten Pfad. `runs/recent-fallback` ist nur ein validierter Discovery-Hinweis.

Fallback-Allokation und Cleanup werden durch `runs/.maintenance.lock` serialisiert. Das Cleanup behält jede beschäftigte Owner-Familie und höchstens eine inaktive Familie. Es bevorzugt einen gültigen Locator, dann die neueste Active-Log-mtime, dann den Basenamen als deterministischen Tie-Breaker. Ein Nicht-Lock-Cleanup-Fehler oder eine fehlgeschlagene Löschung lehnt die Allokation ab, damit ein beschädigter Namespace nicht bei jedem Start ein neues Verzeichnis ansammelt.

Ein sauberes Fallback-Close erwirbt die Maintenance-Verantwortung, gibt seine Owner-Lease frei, behält die aktuelle Familie, entfernt andere inaktive Familien und repariert den Locator. Wenn die Maintenance-Verantwortung nicht verfügbar ist, gibt das Close nur die Owner-Lease frei und überlässt die Reparatur einem späteren Start.

## Dateisystem-Layout

```text
debug/daemon/
├── daemon.log
├── latest -> daemon.log
├── .stable-writer.lock/
├── archive/
│   └── daemon-000000000001-20260715T031415926Z-a1b2c3d4.log
└── runs/
    ├── .maintenance.lock/
    ├── recent-fallback
    └── run-6a45c211000000000000000000000000/
        ├── .owner.lock/
        ├── daemon.log
        └── archive/
```

Nur strikt passende reguläre Archivdateien nehmen an der Vorhaltung teil. Legacy-`serve-<pid>.log`- und `serve-<pid>-<workspaceHash>.log`-Dateien werden weder migriert noch gelöscht.

Neue Verzeichnisse verwenden Modus `0700`; neue aktive Logs und Locator-Temporärdateien verwenden `0600`. Bestehende Objekt-Berechtigungen werden nicht umgeschrieben. `latest` wird nur von einem erfolgreichen stabilen Owner aktualisiert und bleibt Best-Effort, wenn Symlinks nicht verfügbar sind.

## Datei-Records und Warteschlange

Datei-Records werden an einer gültigen UTF-8-Grenze trunkiert. Das finale Record, einschließlich eines Original-Byte-Zähl-Markers und Zeilenumbruchs, beträgt höchstens 256 KiB. Seine Stderr-Kopie wird nicht trunkiert.

Eine Promise-Warteschlange bewahrt die Datei-Mutations-Reihenfolge. Akzeptierte, aber noch nicht abgesetzte Record-Bytes werden synchron verbucht. Ein Record, das die Warteschlange über 4 MiB heben würde, verliert nur seine Dateikopie; der Logger erhöht `droppedRecords` und `droppedBytes` und warnt einmal für diese Overflow-Episode.

Nachdem die Kapazität wiederhergestellt ist, wird dem nächsten Aufrufer-Record eine reine Datei-Warnung namens `daemon file log records dropped` vorangestellt. Sie meldet die nicht gemeldeten Record- und Byte-Summen und trägt nicht rekursiv zu ihnen bei. Das Close unternimmt einen letzten Versuch, nachdem die Warteschlange geleert ist.

Jede Warteschlangen-Aufgabe fängt ihren eigenen Fehler und gibt ihre Pending-Byte-Verbuchung in `finally` frei; das geteilte Tail bleibt niemals rejected. Wenn ein aktiver Append rejected, ist sein Ergebnis unbekannt: Der Logger zeichnet `write_failed` auf, stoppt jede nachfolgende Datei-Mutation für diesen Lauf und behauptet nicht, dass das fehlgeschlagene Record ein exakter Verlust ist. Bewusst übersprungene spätere Records werden gezählt.

Ein Lease-Kompromiss stoppt neue Datei-Mutationen ebenfalls sofort. Eine einzelne Dateisystem-Operation, die bereits gestartet wurde, darf abschließen, aber kein späterer Append, keine Rotation und keine Löschung wird über diese Familie gestartet.

## Rotations-Transaktion

Bevor ein Record die aktive Datei über 10 MiB hinaus vergrößern würde, führt der Logger aus:

1. Verifizieren, dass `archive/` ein echtes, Nicht-Symlink-Verzeichnis ist;
2. die ältesten erzeugten Archive entfernen, bis höchstens drei übrig bleiben;
3. einen nicht existierenden Namen wählen, der eine 12-stellige Generation, einen UTC-Zeitstempel und ein zufälliges Suffix enthält;
4. den aktiven Pfad atomar in diesen Archivnamen umbenennen;
5. das auslösende Record an eine neue `daemon.log` mit Modus `0600` anhängen; und
6. den In-Memory-Größen- und Generations-Zustand committen.

Damit hat eine von dieser Implementierung erzeugte Familie höchstens eine aktive Datei und vier Archive. Wenn der Neue-Aktive-Append fehlschlägt, bleibt die vorherige aktive Datei vollständig im neuesten Archiv.

Ein Fehlschlagen von Archiv-Validierung, Pruning, Benennung oder Umbenennen verwirft das Record, statt zu erlauben, dass die aktive Datei 10 MiB überschreitet. Die Rotation wird höchstens einmal pro 60 Sekunden erneut versucht, während kleinere Records, die weiterhin passen, fortsetzen dürfen. Es gibt kein spezielles ENOSPC/EDQUOT-Lösch-und-Retry-Protokoll und keinen Trunkierungs-Rollback für rejected Appends, da beides den resultierenden Zustand der Datei nicht beweisen kann.

Die Initialisierung liest die tatsächliche Größe der aktiven Datei. Wenn ihr letztes Byte kein Zeilenumbruch ist und das Boot-Record nicht zuerst rotiert, fügt der Logger einen Zeilenumbruch ein und markiert das Boot-Record mit `previousTailIncomplete=true`. Wenn der stabile Boot-Probe nicht sicher schreiben kann, gibt er die stabile Lease frei und versucht eine Fallback-Familie. Ein fehlgeschlagener Fallback-Probe führt zu degradiertem Nur-Stderr-Logging.

## Logger-Zustand und Lifecycle

```ts
type DaemonLogMode = 'stable' | 'fallback' | 'stderr-only';
type DaemonLogHealth = 'ok' | 'degraded';
type DaemonLogIssue =
  | 'init_failed'
  | 'rotation_failed'
  | 'retention_failed'
  | 'queue_overflow'
  | 'write_failed'
  | 'lease_compromised';
```

`getStatus()` liefert die Lauf-Identität, den Modus, die Gesundheit, geordnete Probleme und Verlust-Zähler zurück. `QWEN_DAEMON_LOG_FILE=0|false|off|no` liefert einen gesunden Nur-Stderr-Logger, ohne auf das Dateisystem zuzugreifen: `info`, `warn` und `error` schreiben weiterhin auf Stderr, während `raw` datei-only bleibt und daher nichts tut.

`close()` ist idempotent und rejecting-frei. Es stoppt synchron die Annahme von Dateikopien, während strukturierte Stderr-Aufrufe nutzbar bleiben. Sein Hintergrund-Finalizer leert die Warteschlange, versucht die finale Verlust-Zusammenfassung, führt das Fallback-Cleanup aus und gibt die Lifetime-Lease frei. Das öffentliche Promise wartet höchstens zwei Sekunden; ein Timeout gibt die Lease nicht früh frei, und der Finalizer bleibt am Leben, bis gestartetes I/O sich gesetzt hat. `flush()` behält seine unbegrenzte Warteschlangen-Snapshot-Semantik. Forcierte Signal-Pfade und retrybare Ressourcen-Close-Fehler liefern sich ein Rennen gegen 250 ms.

Die Logger-Verantwortung wandert durch:

```text
startup -> published handle -> terminal close
       \-> startup signal -> terminal close
```

Ein internes Close vor der Handle-Publikation leert Daemon-Ressourcen, ohne auf die Logger-Warteschlange zu warten, und überlässt den Logger dann dem äußeren Startup-Error-Owner. Dieser Owner zeichnet `daemon startup failed` auf und schließt ihn. Ein terminales publiziertes oder signal-owned Close versiegelt das Access-Logging, zeichnet `daemon stopped` auf und schließt den Logger selbst dann, wenn das Ressourcen-Shutdown einen nicht retrybaren Fehler zurückgibt; der ursprüngliche Ressourcen-Fehler bleibt der zurückgegebene Fehler. Terminale Diagnose-Schreibvorgänge sind Best-Effort, damit ein nicht verfügbares Stderr nicht den ursprünglichen Fehler ersetzen oder das Logger-Cleanup überspringen kann. Ein retrybarer Channel-Worker-/Service-Lease-Fehler hält den Logger geöffnet, verwendet das oben beschriebene begrenzte Flush und zeichnet `daemon stopped` nicht auf.

## Access-Log-Zulassung

Jede Runtime-Express-App besitzt einen Token-Bucket mit konstantem Speicherplatz, Burst 60 und Auffüllung von 2 Records/Sekunde, gemessen mit einer monotonen Uhr. Ein Zurückgehen der Uhr bewegt die Auffüll-Baseline niemals rückwärts. Die Health-, Heartbeat- und erfolgreichen SSE-Ausschlüsse bleiben unverändert.

Route, Session-ID und das erste rohe `x-qwen-client-id`-Vorkommen werden an UTF-8-Grenzen auf 2 KiB, 256 Bytes und 256 Bytes begrenzt. Trunkierte Werte tragen ein Original-Byte-Zähl-Kontextfeld. Das erste rohe Header zu verwenden vermeidet, dass zusammengeführte doppelte Header zu einer neuen Kardinalitätsquelle werden.

Wenn kein Token verfügbar ist, werden nur fünf feste Zähler geführt: 2xx, 3xx, 4xx, 5xx und other. Bei Erholung konsumiert eine WARN-`access logs suppressed`-Zusammenfassung den nächsten Token vor jedem einzelnen Record. Wenn das der einzige Token war, schließt sich der aktuelle Request der nächsten Zusammenfassung an. Das Shutdown versiegelt den Controller nach dem normalen Listener-Drain oder der sekundären Deadline, emittiert eine finale Zusammenfassung, ignoriert späte Finish-Callbacks und zeichnet dann `daemon stopped` auf.

Rate-Limiting betrifft nur die Diagnostik; es ändert niemals das HTTP-Ergebnis. Unterdrückte einzelne Records erreichen weder Stderr noch Datei, während Zusammenfassungen beide erreichen.

## Daemon-Status und SDK

Jede Status-Antwort nimmt einen Logger-Snapshot. Zusammenfassungs- und vollständige Antworten dürfen enthalten:

- `daemon.runId`
- `daemon.logMode`
- `daemon.logHealth`

Vollständige Antworten dürfen zusätzlich `daemon.logPath`, `daemon.logIssues`, `daemon.logDroppedRecords` und `daemon.logDroppedBytes` enthalten. Degradiertes Logging fügt dem bestehenden Rollup eine pfadlose Top-Level-`daemon_log_degraded`-Warnung hinzu. Das TypeScript-SDK spiegelt die optionalen Felder und abgeschlossenen Unions. Kein Capability-Tag oder Client-Upgrade ist erforderlich.

Opt-out meldet `stderr-only/ok`; gewöhnliche stabile Konkurrenz meldet `fallback/ok`; ein Dateisystem-Initialisierungsfehler meldet degradiertes Logging mit `init_failed`.

## Operative und Kompatibilitäts-Grenzen

- Separate Runtime-Verzeichnisse für unabhängige Vorhaltungs- oder Audit-Namespaces verwenden.
- Unter macOS/Linux `tail -F daemon.log` verwenden; auf jeder Plattform müssen Viewer den Pfadnamen nach der Rotation erneut öffnen.
- Kein externes logrotate so konfigurieren, dass es `daemon.log` mutiert. Kopieren oder Verschicken ist sicher; Umbenennen, Trunkieren oder Löschen bricht das In-Memory-Größenmodell.
- Es gibt kein Alters-Ablauf, Kompression, fsync-Dauerhaftigkeit oder absolute Grenzen während Stürmen paralleler Daemons oder Crash-Neustarts innerhalb des Stale-Fensters.
- Manipulation durch denselben Benutzer, falsche Stale-Übernahme, Dateisystem-Aufrufe, die niemals zurückkehren, plötzlicher Stromverlust und Windows-Reader, die Umbenennungen verhindern, werden durch sichere Degradation behandelt, nicht durch plattformspezifische No-Follow-, fsync- oder Prozess-Zulassungs-Protokolle.
- Downgrade bleibt möglich; ältere Versionen nehmen einfach wieder das Erzeugen PID-benannter Dateien auf.

## Verifikationsstrategie

Die Unit-Abdeckung umfasst Formatierung, unveränderlichen Datei-Kontext, stabile Wiederverwendung, UTF-8-Trunkierung, Rotationsgrenzen, unvollständige Tails, Warteschlangen-Overflow-Zusammenfassungen, poisoned Appends, aktive und nach-Freigabe kompromittierte Leases, begrenztes Close und Retry-Flushes, Stable-/Fallback-Parallelität, Fallback-Vorhaltung, Cleanup-Verweigerung, Lifecycle-Diagnose-Fehler, Access-Token-Zulassung, Shutdown-Versiegelung, Status-Snapshots, isolierte Test-Runtime-Namespaces und die SDK-Typ-Oberfläche.

Die Prozess-Level-Verifikation verwendet ein gebautes Bundle und ein isoliertes Runtime-Verzeichnis für Neustart-Wiederverwendung, Rotation bei echten Schwellen, Stable-/Fallback-Parallelität, Signal-Lease-Freigabe, SIGKILL-Stale-Fenster-Verhalten, Access-Aggregation, Legacy-Datei-Vorhaltung und Opt-out ohne Dateisystemzugriff. Die CI-Plattform-Matrix muss direkte aktive Pfade unter macOS, Linux und Windows ausführen; Windows verifiziert zusätzlich die sichere Degradation, wenn ein Reader das Umbenennen von active/archive verhindert.
