# ACP-Compile-Cache-Propagation

## Kontext

Der Produktions-Wrapper `cli-entry.js` aktiviert bereits den Modul-Compile-Cache von Node für den In-Prozess-Fast-Path von `serve`. Der Daemon spawnt später ein ACP-Kind über `createSpawnChannelFactory()`, aber `module.enableCompileCache()` wirkt nur auf den aktuellen Prozess und setzt `NODE_COMPILE_CACHE` nicht. Das ACP-Kind startet daher ohne Cache, es sei denn, der Operator hat diese Umgebungsvariable vor dem Start von Qwen Code gesetzt.

Dies ist der orthogonale Compile-Cache-Kandidat, der in #7264 erfasst ist. Er verkleinert nicht den eager Modul-Graphen; er nutzt den V8-Code-Cache für den Graphen wieder, der nach der Lazy-Loading-Arbeit übrig bleibt.

## Ziele

- Produktions-ACP-Nachkommen sollen das Compile-Cache-Verzeichnis wiederverwenden können, das der Daemon-Entry-Wrapper bereits aktiviert hat.
- Ein vom Operator gesetztes `NODE_COMPILE_CACHE` bleibt erhalten.
- `NODE_DISABLE_COMPILE_CACHE=1` bleibt erhalten.
- Cache-Fehler bleiben eine stille Optimierungsfehlfunktion und keine Anwendungsfehlfunktion.
- Keine Änderungen an ACP-Bridge, Konfiguration oder Session-Lebenszyklus.

## Nicht-Ziele

- Kein Qwen-spezifischer Cache-Ort, keine Eviction-Policy und kein Cleanup-Befehl.
- Kein Erzwingen von Compile-Cache-Unterstützung auf Node-Versionen, auf denen die JavaScript-API nicht verfügbar ist.
- Kein Flush des Caches aus dem Daemon- oder ACP-Lebenszyklus.
- Keine globalen Änderungen an Test- oder Coverage-Umgebungen.

## Start-Topologie

Der Produktions-Daemon-Pfad ist:

1. `cli-entry.js serve`
2. `module.enableCompileCache()` im Daemon-Prozess
3. In-Prozess-Import des gebündelten CLI
4. `createSpawnChannelFactory()` kopiert `process.env`
5. Ein neuer Node-Prozess liest `NODE_COMPILE_CACHE` während des Starts
6. Das Kind führt den gewählten CLI-Entry mit `--acp` aus (standardmäßig `cli.js`, oder `QWEN_CLI_ENTRY`, wenn explizit konfiguriert)

Heute profitiert von Schritt 2 nur der Daemon. Die in Schritt 4 kopierte Umgebung enthält kein Compile-Cache-Verzeichnis, sodass das Kind in Schritt 5 und 6 nicht opt-in geht.

## Vorgeschlagene Änderung

Das Ergebnis des bestehenden `module.enableCompileCache()`-Aufrufs wird eingefangen. Wenn es einen neu aktivierten Cache meldet, ein Verzeichnis preisgibt und der Operator `NODE_COMPILE_CACHE` nicht gesetzt hat, wird dieses Verzeichnis in `process.env` veröffentlicht. Die bestehende Kindprozess-Konstruktion kopiert die Umgebung bereits, daher ist keine Änderung an der ACP-Schicht nötig.

Ein vorhandener Umgebungswert wird nicht überschrieben. Wenn Node den Cache aus einer bereits vorhandenen Umgebungsvariablen aktiviert hat, meldet es den Already-enabled-Zustand und das ursprüngliche Basisverzeichnis muss intakt bleiben. Ein Ersetzen durch `getCompileCacheDir()` oder das Already-enabled-Ergebnis kann in Nachkommen ein verschachteltes Versionsverzeichnis erzeugen.

Wenn das Aktivieren fehlschlägt, deaktiviert ist oder die API nicht verfügbar ist, wird kein Verzeichnis synthetisiert. Diese Fälle behalten das aktuelle Verhalten.

## Betrachtete Alternativen

### Umgebungsvariable in `spawnChannel` setzen

Abgelehnt. Die Verantwortung für den Compile-Cache ist globales Entry-Verhalten des Prozesses, während `spawnChannel` eine geteilte ACP-Infrastruktur ist, die von eingebetteten Hosts genutzt wird. Die Policy dorthin zu verlagern, verbreitert die Architekturoberfläche und dupliziert Node-Bootstrap-Verhalten.

### Qwen-versionierten Cache unter `QWEN_HOME` setzen

Abgelehnt. Node trennt bereits inkompatible Node-Versionen und schlüsselt Einträge nach Modulinhalt. Node empfiehlt den Temporary-Directory-Default, um das Ansammeln veralteter Caches zu vermeiden. Ein persistenter Qwen-spezifischer Cache würde neue Cleanup-, Berechtigungs- und Lebenszyklus-Policy erfordern, ohne Beleg, dass er den gemessenen Pfad verbessert.

### `getCompileCacheDir()` bedingungslos exportieren

Abgelehnt. Wenn der Cache aus einer bestehenden Umgebungsvariablen aktiviert wurde, ist das gemeldete Verzeichnis bereits Node-versionsspezifisch. Es als Basis des nächsten Prozesses wiederzuverwenden, erzeugt ein weiteres verschachteltes Versionsverzeichnis und verhindert das beabsichtigte Sharing.

## Fehler- und Kompatibilitätsverhalten

- Node ohne `enableCompileCache()`: keine Umgebungsänderung und keine Verhaltensänderung.
- `NODE_DISABLE_COMPILE_CACHE=1`: Node meldet disabled; es wird kein Verzeichnis propagiert.
- Vom Operator gesetztes `NODE_COMPILE_CACHE`: bleibt wortwörtlich erhalten und wird normal vererbt.
- Nicht beschreibbares oder anderweitig ungültiges Cache-Verzeichnis: Node meldet den Fehler, ohne zu werfen; Qwen Code fährt ohne Cache fort.
- Node- oder Qwen-Upgrade: Node isoliert inkompatible Runtime-Versionen, und Änderungen am Quellinhalt erzeugen andere Cache-Einträge.
- Coverage: Der Produktions-Fast-Path ist der einzige Mutationspunkt. Unit-Test-Runner gehen nicht global in den Compile-Cache.
- Shutdown: Node schreibt den angesammelten Code-Cache beim normalen Prozess-Exit. Erzwungene Terminierung kann neu generierte Einträge verlieren, kann aber die Korrektheit nicht beeinträchtigen.

## Verifikation

Die Machbarkeit wird vor der Implementierung mit einem identischen Release-Bundle für beide Varianten gegatet. Beide Daemon-Varianten erhalten denselben warmen Elternprozess-Cache. Die Kontrolle entfernt die Cache-Umgebung vor dem Import des Bundles, sodass ACP-Nachkommen ohne Cache bleiben; der Kandidat veröffentlicht dasselbe Basisverzeichnis vor dem Import, sodass ACP-Nachkommen es erben.

Das Gate auf dem 2-vCPU-Referenz-Host umfasst:

- 30 abwechselnde paarige kalte Daemon-Starts
- 30 abwechselnde paarige vorgeheizte Starts
- `channel.initialize`, Prozess bis erste Session, Listener-Bereitschaft und Peak-RSS
- eine warme zweite Session
- gleichzeitige erste Sessions
- Telemetrie aktiviert und deaktiviert
- Legacy-Einzel-Session-Verhalten
- Erste Nutzung mit leerem Cache, Warm-Cache-Wiederverwendung, Cache-Fußabdruck und verbleibende Prozesse

Die Implementierung geht nur weiter, wenn der kindspezifische Warm-Cache-Vergleich einen wiederholbaren Initialisierungs- oder Prozess-bis-Session-Vorteil ohne funktionale Regression zeigt.

## Validierungsergebnisse

Das Gate lief auf einem 2-vCPU-, 4-GB-Linux-x64-Host mit Node.js 22.23.1. Kontrolle und Kandidat nutzten dasselbe Bundle aus `77af061e` und unterschieden sich nur darin, ob das ACP-Kind das Compile-Cache-Verzeichnis des Elternprozesses erbte.

Über 30 Warm-Cache-Paarläufe gewann der Kandidat jeden `channel.initialize`-Vergleich. Die gepaarte Median-Verbesserung betrug 176,6 ms, mit einem Bootstrap-95-%-Konfidenzintervall von 167,7–186,2 ms. Die gepaarte Median-Verbesserung bei Prozess bis erste Session betrug 199,0 ms, mit einem 95-%-Konfidenzintervall von 177,6–226,5 ms. Der Median-Peak-RSS des Prozessbaums des Kandidaten lag 8,6 MB höher.

Eine zusätzliche 10-Paar-Bestätigung nutzte den unveränderten Produktions-Entry von `origin/main` als Kontrolle und den gepatchten Produktions-Entry als Kandidat. Sie reproduzierte eine Median-`channel.initialize`-Verbesserung von 181,6 ms und eine Median-Verbesserung von Prozess bis erste Session von 189,4 ms.

Über 20 unabhängige Leerer-Cache-Paare war der erste Prozess-bis-Session-Lauf im Median 117,2 ms langsamer, mit einem 95-%-Konfidenzintervall von 69,3–130,9 ms. Der zweite ACP-Start holt die einmaligen Generierungskosten unter der gemessenen Workload also wieder herein. Der stabile Cache enthielt 362 Dateien und nutzte 9,4 MB.

Alle gemessenen Läufe schlossen erfolgreich ab, ohne verbleibende Prozesse. Der Kandidat bestand außerdem die gleichzeitige erste Session-Erstellung, den Start mit deaktivierter Telemetrie und das Legacy-Einzel-Session-Verhalten.
