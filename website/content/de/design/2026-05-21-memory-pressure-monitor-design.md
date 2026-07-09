# Memory Pressure Monitor

## Problem

Lang laufende Qwen Code-Sessions können durch große Tool-Ergebnisse, wiederholte File-Reads, Chat-Verläufe und native/externe Allokationen viel Speicher akkumulieren. Vor dieser Änderung verfügte das Core-Package über Diagnostik und Session-Reset-Bereinigung, aber über keine Runtime-Reaktion, wenn der Memory Pressure während der normalen Tool-Ausführung steigt.

Die größte cache-spezifische Lücke ist `FileReadCache`: Sie hat bereits eine begrenzte FIFO-Größe, aber keinen zeitbasierten Eviction-Pfad. Das bedeutet, dass eine Session inaktive File-Read-Metadaten behalten kann, bis das harte Entry-Limit erreicht ist, selbst wenn der Prozess unter Memory Pressure steht.

## Goals

- Einen Low-Overhead Memory-Pressure-Check nach der Tool-Ausführung hinzufügen.
- Gezielte Cleanup-Maßnahmen vor destruktiven Maßnahmen bevorzugen.
- Container-Memory-Limits berücksichtigen, wenn cgroup v2 oder cgroup v1 Memory-Limit-Dateien verfügbar sind.
- Auf V8-Heap-Pressure reagieren, bevor es auf Hosts mit viel Speicher zu einem JavaScript-Heap-OOM kommt.
- Subagent/scoped `Config`-Instanzen isoliert vom Parent-Session-Cleanup halten.
- Verhalten über Umgebungsvariablen konfigurierbar machen, ohne eine neue, für Benutzer sichtbare Einstellungs-Oberfläche hinzuzufügen.

## Non-Goals

- Keine Background-Polling-Loop hinzufügen.
- Explicit GC nicht zum Standard machen; es läuft nur, wenn es aktiviert ist und Node mit `--expose-gc` gestartet wurde.
- Semantik der Prior-Read-Durchsetzung nicht ändern. Cache-Eviction kann alte Metadaten entfernen, darf aber Stale-File-Checks für behaltene Entries nicht abschwächen.

## Design

`Config.initialize()` erstellt einen `MemoryPressureMonitor` pro initialisierter `Config`. `getMemoryPressureMonitor()` spiegelt das bestehende `getFileReadCache()` `Object.create`-Isolationsmuster wider: Wenn eine Child-Config durch Prototype-Delegation erstellt wird, installiert der Getter lazy einen eigenen Monitor, der an diese Child-Config gebunden ist.

`CoreToolScheduler.executeSingleToolCall()` ruft `scheduleCheck()` in seinem `finally`-Block auf, nachdem der Tool-Span beendet wurde. `scheduleCheck()` fasst mehrere Aufrufe im selben Event-Loop-Turn mit `queueMicrotask` zusammen, sodass gleichzeitige Read-ähnliche Tool-Batches nicht für jedes Tool-Ergebnis einen separaten Memory-Check ausführen.

Der Monitor verwendet das stärkere von zwei Pressure-Signalen:

- RSS geteilt durch ein effektives Prozess-Memory-Limit. Bevorzuge cgroup v2 `/sys/fs/cgroup/memory.max`, wenn es ein endlicher positiver Wert ist; falle andernfalls auf cgroup v1 `/sys/fs/cgroup/memory/memory.limit_in_bytes` und dann auf `os.totalmem()` zurück. Die riesigen "unlimited"-Sentinel-Werte von cgroup v1 werden ignoriert.
- V8 `heapUsed` geteilt durch `getHeapStatistics().heap_size_limit`.

Die Verwendung beider Signale ist wichtig, da Container normalerweise am RSS/cgroup-Limit scheitern, während lokale Maschinen mit viel Speicher lange vor einem V8-Heap-OOM landen können, bevor RSS einen großen Anteil am gesamten Systemspeicher ausmacht.

Die Standard-Thresholds sind absichtlich konservativ genug, um zu reagieren, bevor der OS- oder Container-OOM-Killer eingreift:

- `softPressureRatio = 0.50`
- `hardPressureRatio = 0.65`
- `criticalRatio = 0.80`
- `cleanupCooldownMs = 5000`
- `enableExplicitGC = false`

Umgebungs-Overrides:

- `QWEN_MEMORY_PRESSURE_SOFT`
- `QWEN_MEMORY_PRESSURE_HARD`
- `QWEN_MEMORY_PRESSURE_CRITICAL`
- `QWEN_MEMORY_ENABLE_GC=1`

Ungültige Ratios fallen auf die Standardwerte zurück. Gültige Ratios müssen als `soft < hard < critical` geordnet sein, mit einer unteren Soft-Grenze von `0.3` und einer oberen Critical-Grenze von `0.98`. Ratio-Umgebungsvariablen werden strikt mit `Number()` geparst, sodass Werte wie `0.8extra` abgelehnt statt teilweise akzeptiert werden. Eine ungültige Memory-Pressure-Umgebungskonfiguration schreibt eine sichtbare Warnung nach stderr und in das Debug-Log, bevor auf die Standardwerte zurückgefallen wird.

## Cleanup Policy

Pressure-Level werden auf zunehmend stärkere Cleanup-Maßnahmen abgebildet:

- `soft`: Evict von stale `FileReadCache`-Entries, auf die in den letzten 60 Minuten nicht zugegriffen wurde.
- `hard`: Evict von Cache-Entries, auf die in den letzten 30 Minuten nicht zugegriffen wurde.
- `critical`: Leere den File-Read-Cache und triggere optional `global.gc()`.

Der Monitor erzwingt absichtlich keine Chat-Kompaktierung. Die Kompaktierung kann das Model-Backend aufrufen und den aktiven Chat-Zustand umschreiben, daher sollte sie nur von einer Call-Site aus getriggert werden, die sicher mit der Conversation-Loop koordinieren kann.

Cleanup ist Fire-and-Forget vom Scheduler aus, aber der Monitor schützt Cleanup-Schritte mit `cleanupInProgress` und einem Cooldown-Timestamp. Ein höherer Pressure-Cleanup kann den Cooldown umgehen und sich hinter einem laufenden niedrigeren Pressure-Cleanup einreihen, sodass ein `critical`-Check nicht verloren geht, während ein `soft`-Cleanup abgeschlossen wird. Nach einem erfolgreichen Cleanup loggt er ein RSS-Delta auf `setImmediate()`, aber RSS-Bewegungen sind nur diagnostisch: V8 und libc können freigegebene Pages behalten, selbst wenn JavaScript-Objekte collectible wurden. Aufeinanderfolgende Fehler zählen Cleanup-Schritt-Ausnahmen, nicht unverändertes RSS, und der Zähler wird bei einer neuen Session zurückgesetzt. Wenn drei erfolgreiche Cleanup-Versuche hintereinander weniger als 1 % RSS freigeben, gibt der Monitor `memory-cleanup-ineffective` als diagnostisches Signal aus, ohne den Cleanup-Schritt selbst als fehlgeschlagen zu behandeln.

## Test Coverage

Die Implementierung wird abgedeckt durch:

- Threshold-Validation-Tests;
- Environment-Config-Parsing-, Fallback-, Visible-Warning- und Explicit-GC-Tests;
- Pressure-Classification-Tests unter Verwendung von gemocktem `process.memoryUsage()`;
- cgroup v2 `memory.max`- und cgroup v1 `memory.limit_in_bytes`-Verhalten;
- V8-Heap-Limit-Verhalten;
- `scheduleCheck()`-Coalescing;
- Scheduler-Integration, die `scheduleCheck()` nach der Tool-Ausführung aufruft;
- Soft- und Critical-Cleanup-Aktionen;
- Cleanup-Failure-Accounting für geworfene Cleanup-Schritte;
- Cleanup-Listener-Exception-Isolation und Ineffective-Cleanup-Diagnostik;
- Child-`Config`-Monitor-Isolation durch `Object.create`;
- `FileReadCache.evictNotAccessedSince()`-Verhalten.

## Risks And Tradeoffs

- RSS kann nach dem Cleanup gleich bleiben, da V8 oder libc freigegebenen Speicher behalten können. RSS-Deltas werden geloggt, aber unverändertes RSS gilt nicht als Cleanup-Fehler.
- Zeitbasierte File-Read-Cache-Eviction kann Fast-Path-Hits für alte Dateien reduzieren, aber sie bewahrt kürzlich aktive Entries und läuft nur unter Memory Pressure.