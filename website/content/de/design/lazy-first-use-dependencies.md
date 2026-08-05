# Lazy-Erstverwendungs-Loading für Encoding-, Terminal- und Git-Abhängigkeiten

## Kontext

Issue #7264 verfolgt Abhängigkeiten, die im eager statischen Import-Closure
des ACP-Child-Prozesses vorhanden sind, obwohl die meisten Sessions sie nie
verwenden. Kandidat 5 gruppiert drei Pakete mit unterschiedlichen
Erstverwendungs-Grenzen:

| Paket                    | Baseline-ACP-Closure | Erstverwendung                                                    |
| ------------------------ | -------------------: | ----------------------------------------------------------------- |
| `iconv-lite`             |        551.713 Bytes | Lesen oder Schreiben von Nicht-UTF-8-Text ohne BOM                |
| `@xterm/headless`        |        213.071 Bytes | Starten einer Shell über den PTY-Pfad                             |
| `simple-git`             |        146.526 Bytes | Ausführen einer Worktree-, Cleanup- oder GitHub-Extension-Git-Operation |
| **Direkte Paketsumme**   |    **911.310 Bytes** |                                                                   |

Die direkte Summe beträgt ungefähr 890 KiB. Der vollständige statische
ACP-Closure enthält außerdem Module, die unerreichbar werden, wenn diese
Pakete vom eager Pfad weichen, sodass die gemessene Bundle-Level-Reduktion
größer sein kann.

## Ziele

- Alle drei Pakete aus dem statischen Import-Closure des ACP-Childs
  entfernen.
- Die aktuellen synchronen öffentlichen Encoding-Helfer bewahren.
- Jedes Paket einmalig bei seiner ersten echten Verwendung laden, ohne neue
  Konfiguration.
- Shell-Fallback-Verhalten, Git-Verhalten, Datei-Encoding-Metadaten,
  BOM-Behandlung und atomare Schreibvorgänge bewahren.
- Einen Bundle-Guard hinzufügen, damit zukünftige Imports diese Pakete nicht
  stillschweigend in den eager Closure zurückbringen können.
- Die Änderung mit derselben 2-vCPU-, 4-GiB-Akzeptanz-Disziplin validieren
  wie die anderen Kandidaten in #7264.

## Nicht-Ziele

- Die öffentlichen Encoding-APIs von synchron auf asynchron umstellen.
- `iconv-lite`, `@xterm/headless` oder `simple-git` ersetzen.
- PTY-Auswahl, Worktree-Semantik, Encoding-Erkennung oder Error-Policy
  ändern.
- Code optimieren, der läuft, nachdem diese Abhängigkeiten bereits geladen
  wurden.

## Import-Closure-Befunde

Das Baseline-Bundle, gebaut aus
`febb43bc9266cc7a3363539df87d90d752ad782c`, hat einen statischen ACP-Closure
von 13.405.027 Bytes über 144 Outputs. Eine esbuild-Metafile-Traversierung
rechnet 551.713 Bytes `iconv-lite`, 213.071 Bytes `@xterm/headless` und
146.526 Bytes `simple-git` zu.

Die anfänglichen Paket-Level-Lazy-Imports reichten nicht aus. Die CLI
enthielt produktive Namespace-dynamische Imports der Core-Paket-Wurzel. In
einem esbuild-Code-Splitting-Build hält das Anfordern des gesamten Namespace
jeden Root-Export erreichbar, einschließlich des synchronen
Encoding-Kompatibilitäts-Exports. Das Design erfordert daher sowohl
abhängigkeitslokale Loader als auch schmale CLI-Runtime-Einstiegsmodule, die
nur die Symbole re-exportieren, die jeder verzögerte Pfad konsumiert.

## Design

### Eigenschaften geteilter Loader

Jedes Paket hat einen paketlokalen Loader, der von einem Modul-scoped Promise
gestützt wird. Gleichzeitige Erstverwender teilen sich denselben Import, und
spätere Verwender nutzen das aufgelöste Modul erneut. Die Loader
normalisieren die CommonJS-Interop-Formen, die Node und esbuild emittieren,
und exponieren nur die Runtime-Member, die ihre Consumer benötigen.

Die Loader verwenden bewusst `import()` statt `createRequire()`. Das
Produktions-Bundle ist eigenständig und darf nicht von einem separat
installierten `node_modules`-Baum abhängen. Dynamische Imports lassen esbuild
in sich geschlossene Chunks emittieren, während diese Chunks außerhalb des
statischen ACP-Closure bleiben.

### `@xterm/headless`

`ShellExecutionService.execute()` ist bereits asynchron. Der Dienst holt
zuerst die PTY-Implementierung und lädt dann `@xterm/headless` unmittelbar,
bevor er den PTY-Ausführungspfad betritt. Er prüft das Abort-Signal nach dem
asynchronen Import erneut und übergibt den aufgelösten `Terminal`-Konstruktor
an die bestehenden synchronen PTY- und Replay-Helfer.

Wenn der Terminal-Chunk nicht geladen werden kann, bleibt der Fehler
innerhalb der bestehenden PTY-Fehlergrenze und die Ausführung fällt auf
`child_process` zurück, entsprechend der aktuellen Fallback-Policy. Es findet
kein Paket-Load statt, wenn PTY-Unterstützung nicht verfügbar ist oder der
Child-Prozess-Pfad gewählt wurde.

### `simple-git`

Alle echten Git-Operationen in den auditierten Consumern sind asynchron.
`GitWorktreeService` hält die Konstruktion nebenwirkungsfrei und löst ein
Pro-Instanz-`SimpleGit`-Promise nur auf, wenn seine erste Git-Methode
aufgerufen wird. Andere Core-Consumer verwenden denselben paketlokalen Loader
direkt.

Das Startup-Cleanup nutzt zuerst die bestehende leichtgewichtige
Repository-Root-Erkennung. Es lädt `simple-git` nur, wenn ein echtes
Repository vorhanden ist und eine Stale-Worktree-Inspektion nötig ist. Ein
fehlgeschlagener Import lehnt die Operation an derselben asynchronen Grenze
ab, an der bereits ein Git-Initialisierungsfehler gemeldet wurde.

### `iconv-lite`

Dieses Paket trägt die wesentliche Kompatibilitäts-Einschränkung:
`decodeBufferWithEncodingInfo()` und `encodeTextFileContent()` sind
öffentliche synchrone APIs. JavaScripts dynamischer Import ist asynchron,
daher wäre das direkte Lazy-Machen dieser Funktionen ein API-Bruch.

Die synchronen APIs bleiben über ein Kompatibilitätsmodul verfügbar, das
`iconv-lite` statisch importiert. Nur die Re-Export-Kante der Core-Wurzel ist
für das Bundle als nebenwirkungsfrei markiert, sodass esbuild das
Kompatibilitätsmodul verwerfen kann, wenn ein bestimmter Einstieg diese
Exporte nicht nutzt. Andere Imports des Moduls behalten die normale
Seiten-Effekt-Behandlung.

Interne asynchrone File-Service-Pfade verwenden Lazy-Varianten:

- Leere, BOM-markierte, gültige UTF-8-, ASCII- und UTF-8-Schreibvorgänge
  schließen ohne Laden von `iconv-lite` ab.
- Ein erkannter Nicht-UTF-8-Lesevorgang lädt den Codec vor dem Decodieren.
- Ein Schreibvorgang, der Nicht-UTF-8-Metadaten bewahrt, lädt den Codec vor
  dem Encodieren.
- Ein Load- oder Decode-Fehlschlag auf der Leseseite behält die aktuelle
  Warnung und den UTF-8-Ersetzungs-Fallback.
- Ein Load- oder Encode-Fehlschlag auf der Schreibseite lehnt den
  Schreibvorgang ab, statt Bytes zu beschädigen.

Die verzögerten Core-Namespace-Imports der CLI werden durch schmale lokale
Runtime-Einstiegsmodule ersetzt. Dies vermeidet das Behalten jedes
Core-Root-Exports, während dieselbe gebündelte Core-Instanz und
Klassen-Identität erhalten bleiben.

## Bundle-Guard

Der ACP-Fast-Path-Guard behandelt `iconv-lite`, `@xterm/headless` und
`simple-git` als verbotene statische Pakete. Ein statischer Pfad vom
ACP-Einstieg lässt den Check fehlschlagen; rein dynamische Pfade sind
erlaubt. Tests decken sowohl Ablehnung als auch erlaubte dynamische Grenzen
ab.

Dieser Guard evaluiert den Metafile-Import-Graph statt Bundle-Text, sodass
ein umbenannter Chunk oder ein minifiziertes Symbol ihn nicht umgehen kann.

## Kompatibilitäts- und Fehler-Audit

| Bereich                         | Bewahrtes Verhalten                                            | Neue Grenze                                                               |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Shell-Ausführung                | PTY-Output-Behandlung, Replay, Abort, Child-Prozess-Fallback   | Terminal-Chunk wird nach der PTY-Auswahl geladen                          |
| Worktrees und GitHub-Extensions | Bestehende `simple-git`-Optionen und Fehler-Propagation        | Git-Modul wird bei der ersten asynchronen Git-Operation geladen           |
| Text-Lesevorgänge               | BOM- und UTF-8-Fast-Paths, Encoding-Metadaten, Fallback-Decode | Codec wird nur für einen erkannten Nicht-UTF-8-Fallback geladen           |
| Text-Schreibvorgänge            | BOM-Bewahrung, Nicht-UTF-8-Encoding, atomares Schreibverhalten | Codec wird nur geladen, wenn Nicht-UTF-8-Metadaten ihn erfordern          |
| Öffentliche Core-API            | Signaturen und Verhalten der synchronen Encoding-Helfer        | Kompatibilitäts-Export kann aus Einstiegen, die ihn nicht nutzen, tree-shaked werden |

Das Design führt keine prozessglobale veränderliche Konfiguration ein.
Loader-Promises sind prozesslokal und idempotent. Abgelehnte Imports bleiben
abgelehnt, was angemessen ist, da ein fehlender oder beschädigter gebündelter
Chunk innerhalb derselben Prozess-Lebenszeit nicht wiederhergestellt werden
kann.

## Betrachtete Alternativen

### Die synchronen Encoding-APIs in Promises umwandeln

Abgelehnt, da es öffentliche Aufrufer bricht und eine ansonsten interne
Startup-Optimierung ausweitet.

### `createRequire()` bei Erstverwendung nutzen

Abgelehnt, da es das gebündelte CLI von einer Runtime-`node_modules`-
Installation abhängig machen würde und kein in sich geschlossenes
Release-Artefakt entstünde.

### Die Encoding-Tabellen oder das Terminal-Verhalten neu implementieren

Abgelehnt, da wesentlich riskanter als das Verzögern der bestehenden Pakete.

### Nur `@xterm/headless` und `simple-git` landen

Dies wäre einfacher, ließe aber das größte Paket der Gruppe auf dem eager
Pfad und würde Kandidat 5 nicht erfüllen. Die Kompatibilitäts-Fassade und die
schmalen Runtime-Einstiegsmodule entfernen `iconv-lite`, ohne seine
öffentliche API zu ändern.

## Verifikationsplan

1. Die nur-CLI-Produktionsartefakte bauen und mit esbuild-Code-Splitting
   bündeln.
2. Den statischen Metafile-Closure des ACP-Einstiegs traversieren und null
   zugerechnete Bytes für alle drei Pakete verlangen.
3. Fokussierte Unit-Tests für Encoding-Lese- und Schreibvorgänge,
   Shell-Ausführung und Fallback, Git-Worktree-Verhalten, Cleanup,
   GitHub-Extension-Operationen, jeden Loader und den Bundle-Guard ausführen.
4. Die betroffenen CLI-Tests, Build und vollständigen Typecheck ausführen.
5. Auf dem 2-vCPU-, 4-GiB-Referenz-Host einen gepaarten Smoke-Test, gefolgt
   von 30 alternierenden seriellen Kalt-Paaren und 30 vorgeheizten Paaren,
   ausführen. `channel.initialize`, Prozess-zu-erster-Session-Latenz,
   Peak-RSS des Prozessbaums, Parallelität, Verhalten bei deaktivierter
   Telemetrie, Legacy-Einzel-Session-Verhalten und verbleibende Prozesse
   melden.

## Gemessenes statisches Ergebnis

| Variante  | ACP-Outputs |  Statischer ACP-Closure |   `iconv-lite` | `@xterm/headless` |   `simple-git` |
| --------- | ----------: | ----------------------: | -------------: | ----------------: | -------------: |
| Baseline  |         144 |        13.405.027 Bytes |  551.713 Bytes |     213.071 Bytes |  146.526 Bytes |
| Kandidat  |         142 |        12.314.617 Bytes |        0 Bytes |           0 Bytes |        0 Bytes |
| Delta     |          −2 | **−1.090.410 Bytes**    | −551.713 Bytes |    −213.071 Bytes | −146.526 Bytes |

Das Remote-Performance-Ergebnis muss separat bewertet werden, da
Bundle-Bytes keine Latenzverbesserung implizieren.

## Gemessenes 2C4G-Ergebnis

Der Remote-Host hatte 2 vCPUs, 3,5 GiB Gesamt-RAM, kein Swap und Node.js
22.23.1. Ein separater Ein-Paar-Smoke-Lauf und seine funktionalen Szenarien
bestanden vor dem formalen Lauf. Der formale Lauf schloss dann 30
alternierende serielle Kalt-Paare und 30 alternierende vorgeheizte Paare ab,
gefolgt von einem weiteren Satz funktionaler Szenarien, ohne fehlgeschlagene
Sessions oder verbleibende Prozesse.

Der formale Kandidat war das kopierte Prototyp-Artefakt mit SHA-256
`f0ac7edc7665752efac7b7bfbb4fb055ce2d8ef1a8ae5dd1af630305a2c84d28`, vom
Harness als `febb43bc9266cc7a3363539df87d90d752ad782c+candidate5`
bezeichnet. Das Ergebnis gilt für genau dieses Artefakt, nicht für einen
zukünftigen Commit-SHA; ein PR sollte den Artefakt-Hash behalten oder das
Gate erneut ausführen, wenn sich sein Produktionscode ändert.

| Szenario   | Metrik                  | Baseline P50 / P95   | Kandidat P50 / P95   | P50-Delta     | Gepaarter Median | Kandidat gewinnt |
| ---------- | ----------------------- | -------------------: | -------------------: | ------------: | ---------------: | ---------------: |
| Kalt       | `channel.initialize`    |   896,2 / 915,5 ms   |    831,5 / 848,5 ms  |  **−64,7 ms** |         −60,1 ms |            30/30 |
| Kalt       | `POST /session`         | 1273,8 / 1305,3 ms   |  1156,5 / 1181,1 ms  | **−117,4 ms** |        −105,1 ms |            30/30 |
| Kalt       | Prozess → erste Session | 1877,7 / 1921,0 ms   |  1733,3 / 1763,8 ms  | **−144,4 ms** |        −136,2 ms |            30/30 |
| Kalt       | Peak-Prozessbaum-RSS    |   417,0 / 451,4 MB   |    408,1 / 419,2 MB  |   **−8,9 MB** |           −8,5 MB |            18/30 |
| Vorgeheizt | `channel.initialize`    |   895,3 / 926,3 ms   |    837,2 / 861,6 ms  |  **−58,1 ms** |         −49,2 ms |            30/30 |
| Vorgeheizt | `POST /session`         |     90,0 / 94,2 ms   |      83,3 / 86,7 ms  |   **−6,7 ms** |           −6,5 ms |            28/30 |
| Vorgeheizt | Prozess → erste Session | 3697,3 / 3723,0 ms   |  3666,0 / 3676,6 ms  |  **−31,3 ms** |         −29,6 ms |            30/30 |
| Vorgeheizt | Peak-Prozessbaum-RSS    |   430,5 / 433,1 MB   |    403,0 / 419,3 MB  |  **−27,5 MB** |         −13,9 MB |            19/30 |

Der Kandidat bestand außerdem parallele erste Sessions, Start bei
deaktivierter Telemetrie und Legacy-Einzel-Session-Start. Eine
Erstverwendungs-Probe mit Produktionskonfiguration bestand
GBK-Encode/Decode, Headless-Terminal-Konstruktion und -Schreiben,
Loader-Single-Flight-Identität und eine echte lokale
`simple-git`-Repository-Initialisierung. Der Remote-Host hat kein
`git`-Executable, daher verifizierte die Remote-`simple-git`-Probe das
Modul-Loading und die Factory-Konstruktion, konnte aber keinen echten
Git-Befehl ausführen; die vollständigen lokalen Git-Service-Suites decken
diese Operationen ab.

Das Akzeptanz-Gate ist erfüllt: Die Kalt-Pfad-Gewinne sind über alle 30
Latenz-Paare konsistent, bleiben in der vorgeheizten
Channel-Initialisierungs-Metrik sichtbar und tauschen keine Latenz gegen
höheren Speicher.

## Risiken und Rollout

Das Hauptrisiko ist ein Nur-Erstverwendungs-Fehler, den eager Imports bisher
beim Start aufdeckten. Fokussierte Tests üben die Erstverwendungs-Pfade, und
der Produktions-Bundle-Guard verifiziert, dass die Imports dynamisch bleiben.
Remote-Smoke- und Akzeptanz-Läufe üben echte gebündelte ACP-Sessions und
prüfen auf verbleibende Prozesse.

Dieser Kandidat sollte, wie von #7264 gefordert, ein separates PR bleiben,
damit seine Regressionsfläche und sein Performance-Effekt
zuschreibbar bleiben. Wenn das 2C4G-Gate keinen reproduzierbaren
Start-Vorteil oder eine bedeutsame Erstverwendungs-Regression zeigt, sollte
die Implementierung nicht allein wegen der Bundle-Größen-Reduktion landen.

## Referenzen

- [esbuild-Code-Splitting](https://esbuild.github.io/api/#splitting)
- [esbuild-Metafile-Analyse](https://esbuild.github.io/api/#metafile)
- [Node.js dynamische Import-Ausdrücke](https://nodejs.org/api/esm.html#import-expressions)
- [Node.js CommonJS-Interoperabilität](https://nodejs.org/api/esm.html#interoperability-with-commonjs)
