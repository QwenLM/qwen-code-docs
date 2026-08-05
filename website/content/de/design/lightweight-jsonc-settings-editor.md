# Leichtgewichtiger JSONC-Settings-Editor

## Kontext

Die ACP-Runtime importiert die Settings- und Trusted-Folders-Writer statisch.
Beide Writer hängen derzeit von `comment-json`, dessen Parser-Cluster 304.770
Bytes zum ACP-Start-Closure beisteuert. Diese Module werden geparst und
evaluiert, bevor das ACP-Child `initialize` beantworten kann, obwohl die
meisten Starts keine der beiden Dateien schreiben.

Issue #7264 Kandidat 6 schlägt vor, diesen Parser lazy zu laden oder durch
einen leichteren Parser zu ersetzen. Die Write-APIs und ihre Aufrufer sind
synchron, und eigenständige Distributionen liefern keine beliebigen
JavaScript-Abhängigkeiten außerhalb des Bundles aus, sodass ein
Runtime-`require()` oder dynamischer Import entweder die API erweitern oder
die Erstverwendung brechen würde. `jsonc-parser` ist bereits im
Development-Abhängigkeitsgraph vorhanden, hat einen kleinen Bundle-Footprint
und bietet synchrone Parse- und Pfad-Edit-APIs.

## Ziele

- `comment-json` und `esprima` aus dem statischen ACP-Start-Closure
  entfernen.
- Synchrone Settings- und Trusted-Folders-Write-APIs bewahren.
- Kommentare sowie Einrückung, Zeilenenden, finalen Zeilenumbruch und
  UTF-8-BOM der bestehenden Datei bei gewöhnlichen Updates bewahren.
- Merge-, Sync- und Exakt-Teilbaum-Ersetzungsverhalten bewahren.
- Die Trusted-Folders-Lock-, Disk-Neulese-, Validierungs-, Berechtigungs-,
  Atomar-Schreib-, Benachrichtigungs- und Lock-Release-Grenzen unverändert
  lassen.
- Missgebildetes oder Nicht-Objekt-JSONC ablehnen, ohne es zu
  überschreiben.

## Nicht-Ziele

- Settings-Migrationen oder Trusted-Folder-Semantik ändern.
- Konfigurations-Schreibvorgänge asynchron machen.
- Alle Konfigurationsdateien neu formatieren.
- Den separaten strikten Trusted-Folders-Ladepfad ersetzen.
- Eine Allzweck-JSONC-Abstraktion für andere Pakete hinzufügen.

## Design

Benenne das Legacy-Camel-Case-Utility in ein Kebab-Case-JSONC-Editor-Modul
um. Das Modul behält die bestehende Datei-Level-Update-API und den
`applyUpdates`-Helfer und fügt zwei synchrone In-Memory-Operationen hinzu:

1. Parse JSONC als Top-Level-Objekt, während alle Parser-Fehler gesammelt
   und abgelehnt werden. Ein führendes UTF-8-BOM wird vor dem Parsen
   temporär entfernt.
2. Wende Merge-, Sync- oder Exakt-Teilbaum-Updates auf den geparsten Wert
   an, berechne die geänderten Objektpfade und wende diese Pfade mit
   `jsonc-parser.modify()` auf den Originaltext an.

Objekte werden rekursiv gedifft, sodass unveränderte Kommentare und Layout
unberührt bleiben. Arrays und Skalarwerte werden atomar ersetzt. Vor dem
Löschen einer Property wird ein Inline-Kommentar auf derselben Zeile mit
dieser Property entfernt; andernfalls kann `jsonc-parser` den Kommentar der
vorhergehenden Property zuordnen. Die vollständige Ausgabe wird erneut
geparst und mit dem beabsichtigten Wert verglichen, bevor ein Aufrufer sie
schreibt.

Doppelte Objekt-Keys erfordern explizite Behandlung, da `jsonc-parser` den
letzten Wert auswertet, während `modify()` die erste passende Property
ansteuert. Vor dem Anwenden von Objektpfad-Updates werden frühere doppelte
Properties entlang dieser Pfade entfernt, sodass die effektive letzte
Property erhalten bleibt. Kommentare, die entfernten doppelten Vorkommen
gehören, werden mit ihnen entfernt. Dies vermeidet, Erfolg zu melden, während
der effektive Wert unverändert bleibt.

Neue Dateien verwenden weiterhin Zwei-Leerzeichen-JSON. Bestehende Dateien
behalten erkannte Tabs oder Leerzeichen, LF oder CRLF, den
Final-Newline-Zustand und ein führendes BOM.

`trustedFolders` verwendet den In-Memory-Parser und -Editor erneut, nachdem
es seinen bestehenden Lock genommen und die Datei neu gelesen hat. Es
validiert weiterhin den Disk-Zustand und den vorgeschlagenen Zustand,
schreibt über `atomicWriteFileSync()` mit Modus `0o600`, `forceMode: true`
und `noFollow: true`, aktualisiert den Speicher erst nach erfolgreichem
Schreiben und gibt den Lock in `finally` frei.

`jsonc-parser` wird eine direkte CLI-Produktions-Abhängigkeit und
`comment-json` wird entfernt. Quell-Imports verwenden den öffentlichen
Paket-Einstieg, sodass ungebundelte kompilierte Ausgaben weiterhin direkt von
Node ausführbar bleiben. Die esbuild-Konfiguration aliast diesen Einstieg auf
den ESM-Build des Pakets, da das Node-orientierte Bundle andernfalls seinen
UMD-Einstieg wählt, dessen relative CommonJS-Requires das aufgeteilte
ESM-Bundle nicht überstehen. Der Fast-Path-Bundle-Guard verbietet
`comment-json`, `esprima` und den `jsonc-parser`-UMD-Build im statischen
ACP-Closure.

## Fehlerbehandlung

- Parser-Fehler oder eine Nicht-Objekt-Wurzel brechen vor dem Schreiben ab.
- Werte, die nicht als JSON darstellbar sind, brechen vor dem Schreiben ab.
- Eine Abweichung zwischen dem editierten Dokument und dem beabsichtigten
  Wert bricht vor dem Schreiben ab.
- Settings-Schreibvorgänge bewahren den bestehenden `false`-Rückgabewert und
  Stderr-Diagnosen bei Parse- oder Validierungsfehlern.
- Trusted-Folders-Schreibvorgänge bewahren ihr Throw-Verhalten, damit
  Aufrufer den In-Memory-Zustand nie nach einem fehlgeschlagenen
  maßgeblichen Schreibvorgang aktualisieren.
- Dateisystem-, Lock-, Berechtigungs- und Atomar-Schreib-Fehler behalten ihr
  bestehendes Verhalten.

## Betrachtete Alternativen

### Dynamisches `import('comment-json')`

Abgelehnt, da der öffentliche Schreibpfad synchron ist und synchrone
Migrations-, UI-, ACP- und Daemon-Aufrufer hat. Den Aufrufgraph auf async
umzustellen ist breiter als diese Optimierung.

### Lazy `createRequire()`

Abgelehnt, da esbuild die Abhängigkeit außerhalb des Bundles lassen würde,
während eigenständige Archive keine beliebigen JavaScript-Pakete in
`lib/node_modules` enthalten. Ein verpackter erster Schreibvorgang könnte zur
Laufzeit fehlschlagen.

### Immer mit `JSON.stringify()` umschreiben

Abgelehnt, da es Nutzerkommentare und Formatierung bei normalen
Settings-Updates verwerfen würde.

### Eigener Tokenizer

Abgelehnt, da `jsonc-parser` bereits den benötigten Parse-Baum und die
Edit-Primitive mit einer wesentlich kleineren, gepflegten Implementierung
bietet.

## Validierung

- Fokussierte Unit-Tests decken bestehendes Verhalten plus missgebildeten
  Input, Nicht-Objekt-Wurzeln, angehängte Kommata, verschachtelte und
  Inline-Kommentare, Kommentare gelöschter Properties, Merge/Sync/Replace-
  Semantik, Prototype-Pollution-Keys, doppelte Keys, CRLF, Tabs, finalen
  Zeilenumbruch, BOM, No-op-Schreibvorgänge und Ausgabe-Validierung ab.
- Trusted-Folders-Tests decken Locked-Disk-Merge, ungültigen Input und
  Output, Kommentar-Bewahrung, exakten Sync, Berechtigungen-bewahrende
  atomare Schreibvorgänge, fehlgeschlagene Schreibvorgänge und Lock-Release
  ab.
- Die Bundle-Guard-Tests und ein generiertes esbuild-Metafile beweisen, dass
  weder `comment-json` noch `esprima` im statischen ACP-Closure enthalten
  ist.
- CLI-Build, Typecheck, Lint und fokussierte Tests müssen bestehen.
- Die Kontroll- und Kandidat-Release-Bundles liefen auf dem etablierten
  2-vCPU-Host mit einem verworfenen Warmup, 30 alternierenden gepaarten
  Kaltstarts und 30 alternierenden gepaarten vorgeheizten Starts. Der
  Kandidat reduzierte das kalte `channel.initialize`-P50 um 35,39 ms,
  Prozess-zu-erster-Session-P50 um 38,00 ms und
  Prozess-zu-erster-Session-Complete-P50 um 48,51 ms. Er gewann 28 von 30
  Kalt-Paaren für jede primäre Metrik, wobei die 95 %-Bootstrap-Intervalle
  der gepaarten Mittelwerte vollständig unter null lagen.
- Der bereits vorgeheizte Prozess-zu-Session-Complete-Pfad war statistisch
  neutral. Parallele erste Sessions, Legacy-Einzel-Session-Modus, Telemetrie
  aktiviert und Telemetrie deaktiviert schlossen alle erfolgreich ab,
  erzeugten die erwartete Telemetrie und hinterließen keinen verbleibenden
  Prozess.
- Der Peak-Prozessbaum-RSS des Kandidaten war während der Initialisierung
  etwa 10,8 MiB höher, aber ein separater 10-Paar-Folgetest sampelte
  dieselben Prozesse nach einer 10-Sekunden-Idle-Phase. Der gepaarte
  Steady-State-Median-Delta betrug 0,55 MiB mit einem Bootstrap-Intervall,
  das null überspannt, was zeigt, dass der Peak-Unterschied transiente
  Initialisierung und Garbage-Collection-Timing war statt einer dauerhaften
  Footprint-Erhöhung.
- Der exakte statische ACP-Closure sank von 12.449.869 auf 12.145.099 Bytes,
  eine Reduktion um 304.770 Bytes (2,45 %), ohne `comment-json`-,
  `esprima`- oder `jsonc-parser`-UMD-Input.
