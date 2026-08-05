# Defer ACP telemetry initialization until after protocol initialization

- **Issue**: #7264 Kandidat 2
- **Scope**: ACP-Kind-Start mit aktivierter Telemetrie
- **Status**: implementiert und validiert

## Problem

Ein ACP-Kind startet Telemetrie derzeit aus dem `Config`-Konstruktor. Der
Aufruf ist Fire-and-forget, aber das Laden und Evaluieren der
Telemetrie-Implementierung und der konfigurierten Exporter-Kette konkurriert
weiterhin mit dem CLI-Bootstrap, dem ACP-Modulladen, der
Bootstrap-Config-Initialisierung und dem Protokoll-`initialize`-Handler um
denselben Event-Loop und dieselbe CPU. Auf einem eingeschränkten Host zeigten
die Messungen von Kandidat 1, dass diese Konkurrenz Arbeit in das
User-sichtbare Initialisierungsfenster zurückbringt.

Telemetrie-Events verwenden bereits ein Initialized-Gate: Events, die
emittiert werden, bevor das SDK den Start abgeschlossen hat, werden verworfen.
Den Start zu verschieben, erweitert daher ein bestehendes Verlustfenster,
statt ein neues Puffer- oder Reihenfolgemodell einzuführen.

## Design

Die ACP-Konfiguration setzt die bestehende
`deferTelemetryInitialization`-Option. Dies unterdrückt den
Fire-and-forget-Start des Konstruktors, ohne die Default-, Headless-,
Stream-JSON-, interaktiven TUI- oder Daemon-Runtime-Pfade zu ändern.

`runAcpAgent` verwendet den bestehenden Nachrichten-Beobachtungs-Hook auf
seinem NDJSON-Transport, um sich die JSON-RPC-Id eines eingehenden
`initialize`-Requests zu merken. Der Hook läuft, nachdem der geparste Request
in die Queue gestellt wurde, aber bevor dessen Pending-Read-Fortsetzung ihn
verarbeiten kann. Für ausgehende Nachrichten läuft derselbe Hook erst, nachdem
die kodierte Antwort erfolgreich in den zugrunde liegenden Stdout-Stream
geschrieben wurde. Wenn eine erfolgreiche Antwort mit der gemerkten Id
beobachtet wird, startet das Kind die Telemetrie über die bestehende
Single-Flight-Fassade, registriert sein Event-Loop-Gauge erst, nachdem diese
Initialisierung settled, und leert die gemerkte Id. Diese Reihenfolge ist
erforderlich, weil die Metrics-API ein No-op-Meter cached, wenn ein Gauge
registriert wird, bevor das SDK den globalen Meter-Provider installiert.

Dies erzeugt eine Transport-definierte Grenze: Das Laden der Telemetrie kann
nicht beginnen, bevor der Schreibvorgang der Initialisierungsantwort aufgelöst
ist. Es hängt nicht von Event-Loop-Scheduling-Annahmen ab.

## Ownership und nachgelagerte Consumer

Das ACP-Kind hat ein prozessglobales Telemetrie-SDK und einen
Bootstrap-`Config`. Die verschobene Option ist Config-scoped, während der
letztendliche Initialisierer prozessglobal und Single-Flight ist.
Pro-Session-Configs teilen weiterhin dieses prozessglobale SDK und besitzen
keine unabhängigen Telemetrie-Runtimes.

Die betroffenen Consumer sind:

- **ACP-Bootstrap-Kind**: Wechselt von Konstruktor-gestarteter zu
  Antwort-Schreib-gestarteter Telemetrie. Seine
  Event-Loop-Gauge-Registrierung zieht hinter die SDK-Initialisierung, sodass
  eine frühe Registrierung nicht dauerhaft alle Metriken deaktivieren kann.
- **ACP-Session-Erstellung und Prompts**: Behalten die bestehenden
  Initialized-Gates; sehr frühe Events können nun länger verworfen werden,
  während das SDK-Laden abgeschlossen wird.
- **Gewöhnliches interaktives TUI**: Behält den Start nach dem ersten Render
  über `startPostRenderPrefetches`.
- **Headless- und Stream-JSON-CLI**: Behalten den Konstruktor-Start.
- **`qwen serve` Parent-/Daemon-Runtime**: Behält ihre explizit verschobene
  Core-Runtime-Initialisierung und den Shutdown.
- **Prozess-Exit-Cleanup**: Behält `Config.shutdown()`. Ein Kind, das vor
  einer erfolgreichen Protokoll-Initialisierung trennt, startet nie
  Telemetrie. Wenn die Trennung mit einem gerade gestarteten Import
  konkurriert, verhindert der interne Catch des Initialisierers ein
  unbehandeltes Rejection, und der äußere ACP-Pfad beendet den Prozess
  weiterhin. Obwohl `shutdownTelemetry()` auf einen laufenden Initialisierer
  warten kann, ruft `Config.shutdown()` es nur auf, nachdem das SDK
  initialized meldet, sodass der aktuelle Config-Cleanup eine noch laufende
  Initialisierung überspringen kann.

## Fehler- und Kompatibilitätsverhalten

- Deaktivierte Telemetrie bleibt ein Fassaden-No-op nach der Antwort und lädt
  keine schweren Telemetrie-Module.
- Einmalige Bootstrap-Events, die vor der Antwort emittiert werden,
  einschließlich des initialen `qwen-code.auth`-Events und eines frühen
  `qwen-code.config`-Events, fehlen dauerhaft in der ACP-Telemetrie, statt nur
  verzögert zu sein. Dies sind die akzeptierten Kosten dafür, die
  SDK-Initialisierung hinter die Antwort zu verschieben; die Änderung
  synthetisiert oder puffert keine Ersatz-Events.
- Ein fehlerhafter oder abgelehnter `initialize`-Request startet keine
  Telemetrie. Ein späterer gültiger Initialize-Request kann sie weiterhin
  starten.
- Ein Stdout-Schreibfehler führt den Sent-Message-Hook nicht aus, sodass
  Telemetrie für eine Antwort, die der Client nicht erhalten hat, nicht
  gestartet wird.
- Wiederholte oder unzusammenhängende JSON-RPC-Antworten können Telemetrie
  nicht starten, da sowohl die Request-Id als auch die Form der erfolgreichen
  Antwort übereinstimmen müssen; die gemerkte Id wird einmal verbraucht.
- Das SDK-Laden bleibt Fire-and-forget und Best-Effort. Seine bestehende
  Implementierung fängt Import-, Assembly- und Startfehler.
- Keine Änderung von Protokollform, Capability, Authentifizierungs-Timing,
  Provider-Auswahl, MCP-Verhalten oder
  Telemetrie-Konfigurationsfläche.

## Abgelehnte Alternativen

- **Innerhalb von `QwenAgent.initialize()` starten**: Dies ist bevor der
  Handler zurückkehrt und daher bevor das SDK die Antwort serialisieren oder
  schreiben kann.
- **`queueMicrotask`, `setImmediate` oder einen Timer nach der Rückkehr des
  Handlers verwenden**: Nichts davon beweist, dass die private Schreib-Queue
  des SDK abgeschlossen ist, und ein Timer fügt eine willkürliche
  Latenz-Policy hinzu.
- **`AgentSideConnection` wrappen oder forken**: Nicht nötig, da der
  paketlokale NDJSON-Stream bereits Post-Write-Nachrichtenbeobachtungen
  bereitstellt.
- **Bis zur ersten Session-Antwort warten**: Könnte mehr Konkurrenz entfernen,
  erweitert aber das Verworfene-Events-Fenster über Kandidat 2 hinaus und
  initialisiert nie Telemetrie für einen idle initialisierten Channel.
- **Frühe Telemetrie puffern**: Ändert wesentlich die Telemetrie-Semantik und
  den Speicher-Ownership; Kandidat 2 akzeptiert explizit verworfene frühe
  Events.

## Verifikation

Unit-Tests decken den ACP-Config-Verzug und die exakte Transport-Reihenfolge
ab: kein Start bei Empfang, unzusammenhängender Antwort, Fehlerantwort oder
fehlgeschlagenem Schreibvorgang; ein Start, nachdem die passende erfolgreiche
Antwort geschrieben wurde. Bestehende Transport-Tests beweisen, dass
Sent-Hooks nach dem zugrunde liegenden Schreibvorgang laufen und bei
Schreib-Ablehnung übersprungen werden.

Das Release-Bundle wird über den echten ACP-Parent-/Kind-Pfad mit aktivierter
und deaktivierter Telemetrie durchgespielt. Kompatibilitäts-Checks decken
kalte und vorgeheizte Channels, parallele erste Sessions,
Legacy-Einzel-Session-Modus, frühes Trennen, Cleanup und
Outfile-Datensatz-Produktion ab.

Die Änderung landet nur, wenn sie das 2C4G-Gate von #7264 besteht: 30
alternierende gepaarte serielle Kaltstarts, die `channel.initialize`,
Kind-Prozess-zu-Initialize-Antwort, kalte Session-Anfrage,
Prozess-zu-erster-Session, Peak-RSS, vorgeheiztes Verhalten und
Telemetrie-an/-aus-Kompatibilität melden. Weil Arbeit nach hinten verschoben
wird statt zu verschwinden, muss das Gate sowohl Initialisierungs- als auch
Erste-Session-Timing melden; ein Gewinn, der nur vor der ersten Session
zurückgezahlt wird, wird nicht als erfolgreiche Optimierung behandelt.

## Ergebnisse

Die Kontrolle war `origin/main` bei
`14f1f2bb365280a6e1d4a45b452f7992f1928187`; der Kandidat war derselbe Commit
plus dieser exakten Arbeitsverzeichnis-Änderung. Beide Release-Bundles wurden
aus demselben Lockfile gebaut und auf dem bereitgestellten Linux-Host mit 2
vCPUs, ungefähr 3,5 GiB RAM, ohne Swap und mit gebündeltem Node.js 22.23.1
getestet.

Mit aktivierter Outfile-Telemetrie erzeugten 30 alternierende gepaarte
Kaltstarts:

| Metrik                               | Kontrolle P50 / P95  | Kandidat P50 / P95  | P50-Delta    |
| ------------------------------------ | -------------------- | ------------------- | ------------ |
| `channel.initialize`                 | 942,1 / 1245,0 ms    | 898,3 / 1002,4 ms   | **-43,8 ms** |
| Kind-Prozess zu Initialize-Antwort   | 947,0 / 1249,8 ms    | 903,0 / 998,4 ms    | **-43,9 ms** |
| Kaltes `POST /session`               | 1235,5 / 1591,7 ms   | 1245,1 / 1462,0 ms  | +9,6 ms      |
| Prozess zu erster Session            | 1833,1 / 2190,6 ms   | 1845,5 / 2417,0 ms  | +12,4 ms     |
| Peak-RSS                             | 418,7 / 443,6 MiB    | 406,7 / 438,4 MiB   | -11,9 MiB    |

Die gepaarte Verteilung zeigte `channel.initialize` in 26 von 30 Paaren
schneller mit einem gepaarten Median-Delta von -44,2 ms. Kalte Session-Anfrage
und Prozess-zu-erster-Session hatten gepaarte Median-Deltas von +15,0 ms bzw.
+13,8 ms, mit Kandidaten-Gewinnen in 13/30 bzw. 11/30 Paaren. Das gepaarte
Median-Bootstrap-95%-Intervall von Prozess-zu-erster-Session war -2,8 bis
+27,5 ms, daher hat dieser Lauf weder eine Ende-zu-Ende-Regression noch eine
Verbesserung festgestellt. Die Änderung beansprucht daher nur den direkten
Gewinn an der ACP-Initialisierungsgrenze.

In der Vorheiz-Phase desselben Laufs mit 30 Paaren verbesserte sich
`channel.initialize` von 950,5 / 1323,7 ms auf 908,4 / 964,4 ms P50/P95. Die
bereits vorgeheizte Session-Anfrage änderte sich von 82,1 / 94,8 ms auf
83,7 / 131,6 ms, während sich Prozess-zu-Session von 3683,5 / 4105,0 ms auf
3686,1 / 3749,2 ms änderte. Die gepaarten Session- und
Prozess-zu-Session-Mediane waren +1,4 ms bzw. +1,0 ms. Zwei isolierte
Kandidaten-Session-Ausreißer und mehrere Kontroll-Initialisierungs-Ausreißer
weiteten die ungepaarten P95-Werte; die gepaarten Mediane blieben neutral. Es
wird keine Vorheiz-Speicheränderung beansprucht.

Die Kandidaten-Funktionsläufe bestanden parallele erste Sessions, deaktivierte
Telemetrie mit null Datensätzen und Legacy-Einzel-Session-Modus. Alle 120
Telemetrie-aktivierten Benchmark-Läufe meldeten ein gültiges Start-Profil und
ein nicht leeres Outfile, und jeder Lauf beendete sich ohne Restprozess. Ein
Release-Bundle-Smoke durch den offiziellen ACP-Client wartete zusätzlich über
das Metrik-Export-Intervall hinaus und bestätigte sowohl
`qwen-code.session.count` als auch `qwen-code.acp.event_loop.lag`, als
Absicherung gegen die Registrierung auf einem gecachten No-op-Meter. Zwei
Telemetrie-aktivierte Live-Prompt-Smokes gegen den verfügbaren
OpenAI-kompatiblen Endpoint schlossen beide ab und erzeugten nicht leere
Telemetrie-Outfiles. Direkte gebündelte ACP-Smoke-Tests bestanden auch beide
Frühes-Trennen-Grenzen: EOF vor initialize beendete sauber, ohne Telemetrie zu
starten, während EOF unmittelbar nach einer erfolgreichen Initialize-Antwort
sauber nach Erstellung des Outfiles beendete, in beiden Fällen ohne
Stderr-Output.

Rohe Host-Artefakte liegen unter:

- `/root/qwen-7264-c2-20260723/results/fixed-formal-rerun/2026-07-23T05-14-14.236Z`
- `/root/qwen-7264-c2-20260723/results/prompt-smoke/2026-07-23T03-23-26.883Z`
