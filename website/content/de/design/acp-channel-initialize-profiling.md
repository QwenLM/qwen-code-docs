# ACP-Channel-Initialize-Profiling

## Zusammenfassung

Der `channel.initialize`-Span des Daemons beginnt, nachdem das ACP-Kind
gespawnt wurde, und endet, wenn das Kind seine ACP-Initialize-Response
zurückgibt. Er umfasst daher Node- und ESM-Start, CLI-Bootstrap,
ACP-Modulladen, Bootstrap-`Config.initialize()`, Transport-Setup und den
Initialize-Handler. Der Handler selbst gibt nur Capabilities zurück und dürfte
die beobachtete Latenz nicht erklären.

Dieses Design fügt der ACP-Initialize-Response ein festes, Opt-in-
Kind-Start-Profil hinzu und kopiert die validierten Dauern auf den bestehenden
Parent-`channel.initialize`-Span. Es ändert nichts an Channel-Bereitschaft,
Initialisierungsreihenfolge, Fehlerbehandlung oder Session-Verhalten.

## Protokoll

Die Bridge fordert Version 1 des Profils über Initialize-Request-Metadaten an:

```json
{
  "_meta": {
    "qwen.daemon.channelStartupProfile": { "v": 1 }
  }
}
```

Unterstützende Kinder geben das Profil unter demselben Top-Level-
Response-Metadaten-Key zurück. Die Response enthält nur feste Dauer-Felder,
ein Vollständigkeits-Flag, den Wall-Clock-Timestamp des Response-Aufbaus und
die Gesamtdauer vom Kindprozess bis zur Response. Sie enthält nie Pfade,
Extension-Namen, Settings oder andere vom Nutzer abgeleitete Werte.

Das Profil unterteilt den Kind-Start in nicht überlappende Top-Level-Phasen:

- Prozessstart bis Profiler-Bereitschaft;
- Gemini-Modul-Import;
- Argument-Parsing;
- Settings-Laden;
- Config-Konstruktion;
- generische Anwendungsinitialisierung;
- ACP-Modul-Import;
- Bootstrap-Config-Initialisierung;
- Transport-Konstruktion;
- Initialize-Handler-Ausführung;
- nicht zugeordnete Zeit zwischen den festen Phasen.

Die Bootstrap-Config-Initialisierung wird aufgeteilt in initialen
Extension-Refresh, Hooks, Skills, finalen Extension-Refresh, hierarchischen
Memory, Tool-Registry, Tool-Warmup und Restzeit. Der ripgrep-Probe wird als
Kind der Tool-Registry-Zeit gemeldet und bei der Berechnung der Restzeit
nicht erneut abgezogen. Die nicht zugeordnete Top-Level-Zeit enthält auch das
Warten zwischen Transport-Setup und dem Eintreffen des Initialize-Requests im
Kind-Handler.

Alle Dauern nutzen `performance.now()` und werden auf zwei Dezimalstellen
gerundet. Die Response-Aufbau-Epoche nutzt `performance.timeOrigin` plus dem
Response-Mark und wird nur für die optionale Parent-seitige
Transport-Schätzung verwendet.

## Sammlungs-Lebenszyklus

Die CLI initialisiert den ACP-Profiler dynamisch nur dann, wenn die rohen
Argumente `--acp` oder `--experimental-acp` enthalten, und zwar vor dem
Import der Gemini-Runtime. Der Profiler speichert den ersten Timestamp für
eine endliche Union von Mark-Namen. Er führt kein Datei-I/O, keine
Heap-Erfassung, keine Telemetrie-Initialisierung und keine dynamische
Event-Aufbewahrung durch.

Der Core-Startup-Event-Sink leitet feste Config-Phasen-Events nur dann an den
ACP-Profiler weiter, während der ACP-Bootstrap-Config initialisiert. Das
verhindert, dass spätere Pro-Session-Config-Initialisierungen das
Start-Profil verunreinigen. Übersprungene Config-Phasen emittieren weiterhin
benachbarte Start- und End-Marks, sodass ein erfolgreicher Start im Bare- oder
Safe-Mode ein vollständiges Profil erzeugen kann.

Der Initialize-Handler friert den Profiler nach dem Aufbau der ersten Response
ein, unabhängig davon, ob der Aufrufer das Profil ausgehandelt hat. Fehlende
Marks erzeugen `complete: false`; die Sammlung verzögert oder gefährdet die
Initialize-Response nie.

## Parent-Span-Anreicherung

Die Bridge validiert die Response-Metadaten, bevor sie feste numerische
Attribute an den aktiven `channel.initialize`-Span hinzufügt. Unbekannte
Profil-Versionen werden ignoriert. Unbekannte Felder werden ignoriert.
Bekannte Werte müssen endlich, nicht-negativ und höchstens 600 Sekunden sein.
Ungültige oder fehlende bekannte Felder werden weggelassen und machen das
effektive Vollständigkeits-Flag falsch.

Die optionale Response-Transport-Schätzung ist die Parent-Empfangszeit minus
der Kind-Response-Aufbau-Epoche. Sie wird nur aufgezeichnet, wenn endlich,
nicht-negativ und höchstens so groß wie der konfigurierte Initialize-Timeout.

Das Profil-Parsing und die Telemetrie-Anreicherung sind fail-open. Ein
fehlendes, fehlerhaftes oder nicht unterstütztes Profil darf den
Initialize-Erfolg, den Channel-Teardown, das Verhalten zusammengefasster
Aufrufer oder das Retry-Verhalten nicht ändern. Neue Parents bleiben mit alten
Kindern kompatibel, weil ACP-Metadaten erweiterbar sind; neue Kinder geben an
alte Parents ohne Opt-in kein Profil zurück.

## Verifizierung

Fokussierte Tests decken Collector-Aktivierung und -Einfrieren, feste
Phasen-Arithmetik, Payload-Größe, Protokoll-Aushandlung, fehlerhafte Profile,
Span-Anreicherung, Telemetrie-Fehlerisolation, Config-Event-Reihenfolge und
die Serve-Fast-Path-Bundle-Grenze ab. Der release-gebaute Kandidat wird mit
der exakten #6907-Merge-Baseline auf dem repräsentativen 2C4G-Host mit
gepaarten, alternierenden Kaltläufen verglichen, bevor eine Optimierung
ausgewählt wird.

## P0-B-Optimierungsentscheidung

Das 2C4G-P0-A-Profil ordnete 67,3 % des P50 des Kind-Starts dem Gemini- und
ACP-Modulladen zu. CPU-Profile zeigten dann, dass die
Quellmodul-Kompilierung der größte CPU-Kostenpunkt war und dass der statische
ACP-Importgraph Ink, React, React Reconciler und Yoga lud, obwohl das
ACP-Kind keine TUI rendert.

Die optionalen Kanten waren bestehende reine UI-Abhängigkeiten statt ein neuer
ACP-Einstiegspunkt. Die ACP-Session importierte einen API-Error-Classifier
über einen React-Hook; die Extension-Completion importierte ihre Datenform und
ihr Ergebnis-Limit über eine Render-Komponente; die Command-Registry lud
statisch UI-Unterstützung, die nur benötigt wird, wenn `/init` um Bestätigung
bittet, der Genehmigungsmodus in den Auto-Mode wechselt oder eingeklappte
Historie expandiert. Die Optimierung verschiebt die zwei reinen Daten-Helper
aus den Render-Modulen heraus, macht den React-Typ-Import type-only und lädt
die drei interaktiven Aktions-Abhängigkeiten nur dann, wenn diese Aktionen
ausgeführt werden.

Die ACP-Initialize-Response, die Start-Reihenfolge, die
Config-Initialisierung, der Inhalt der Command-Registry, die Fehlerbehandlung
und das Session-Verhalten bleiben unverändert. Ein Bundle-Metafile-Check folgt
der statischen Ausgabe-Closure des ACP-Agenten und lehnt Ink-, React-,
React-Reconciler- oder Yoga-Inputs ab, während er sie hinter dynamischen
Imports weiterhin erlaubt.

Der kausale Vergleich verwendete Release-Artefakte, die aus demselben
main-Commit `af6a9b640c5d9097c5151b8705dd73aee8e180d0` gebaut wurden, wobei
nur diese Optimierung auf den Kandidaten angewendet wurde. Zwei alternierende
Kaltläufe erzeugten nach einem ausgeschlossenen Warmup 60 Paare; ein separater
alternierender vorgeheizter Lauf erzeugte 30 Paare. Der zweite Kaltlauf wurde
gestartet, nachdem der erste Lauf zwei Parent-Listener-Stalls auf der
Kandidatenseite vor dem ACP-Pfad offengelegt hatte. Keine Samples aus beiden
Läufen wurden verworfen. Die gepoolten Kalt-P50-Ergebnisse waren:

| Metrik                    | Gematchte Kontrolle | P0-B-Kandidat |              Änderung |
| ------------------------- | ------------------: | ------------: | --------------------: |
| ACP-Import                |           115,06 ms |      52,00 ms | -63,06 ms (-54,8%)    |
| Kindprozess bis Response  |          1102,88 ms |    1041,09 ms |             -61,80 ms |
| `channel.initialize`      |          1098,25 ms |    1035,61 ms |             -62,64 ms |
| Prozess bis erste Session |          2046,88 ms |    1980,03 ms |             -66,85 ms |
| Kalte Session-Anfrage     |          1358,95 ms |    1290,23 ms |             -68,72 ms |

Alle 60 Kalt-Profile jeder Variante und alle 30 vorgeheizten Profile jeder
Variante waren vollständig. Jeder Lauf endete sauber, und gleichzeitige erste
Sessions, Telemetrie-deaktivierter Start und Legacy-Default-`single`-Verhalten
gelangen in beiden Funktionsrunden. In den gepoolten Kalt-Daten änderte sich
der Warm-Session-P95 von 137,53 ms auf 104,98 ms, der First-Health-P95 von
962,99 ms auf 824,14 ms und der Prozessbaum-RSS-P95 von 442,27 MiB auf
435,70 MiB. In den vorgeheizten Daten änderte sich der Session-P50 von
73,90 ms auf 73,75 ms und der P95 von 88,38 ms auf 76,17 ms.

Transiente Host-weite Stalls betrafen beide Varianten und wurden behalten. Im
ersten 30-Paare-Lauf erhöhten zwei Kandidaten-Parent-Listener-Stalls den
First-Health-P95 von 803,82 ms auf 1175,67 ms, obwohl die Health-Requests
selbst 6–11 ms dauerten und der geänderte ACP-Pfad noch nicht gestartet war.
Der diagnostische Retry drehte die Richtung um, mit
Kontrolle/Kandidat-First-Health-P95 von 1522,44/727,64 ms; das Poolen aller 60
behaltenen Paare erzeugte die Werte oben. Der exakte P0-A-Merge wurde zudem
als sekundärer 30-Paare-Check mit dem Kandidaten verglichen und zeigte
unabhängig dieselbe ACP-Import-Reduktion und keine P95-Regression.

Der Modulladen-Kandidat besteht daher das P0-B-Gate: die ausgewählte Phase
verbessert sich um mehr als 30 % und 10 ms, während sich sowohl
`channel.initialize` als auch Prozess-bis-erste-Session-P50 um mehr als 10 ms
verbessern. Lazy-Top-Level-yargs-Command-Builder wurden abgelehnt, weil ihre
Ausgewählte-Phase-Verbesserung das 30-%-Gate nicht bestand. Tool-Registry und
Warmup bleiben ein separates Deskriptor-Entkopplungs-Design;
Extension-Refresh, hierarchischer Memory und Transport waren zu klein, um eine
P0-Verhaltensänderung zu rechtfertigen.
