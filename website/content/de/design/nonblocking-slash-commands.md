# Nicht-blockierende Slash-Befehle während des Streamings

## Problem

Der interaktive Input-Router stellt derzeit jeden Slash-Befehl außer `/btw`
in die Queue, während eine Modell-Antwort streamt. Dadurch warten lokale
UI-Steuerungen auf den aktiven Konversations-Turn, selbst wenn ihr Ergebnis
nicht von diesem Turn abhängt.

## Design

`SlashCommand` erhält eine Opt-in-`canRunDuringStreaming`-Capability. Der
Default bleibt false. Während das Hauptmodell antwortet, löst der
Input-Router den gesendeten Befehl über den bestehenden Slash-Befehl-Baum
auf. Ein Opt-in-Befehl wird direkt an den Slash-Befehl-Prozessor gesendet;
alle anderen Slash-Befehle nutzen weiterhin die bestehende serialisierte
Message-Queue.

Der direkte Pfad läuft nicht durch `submitQuery`. Diese Funktion besitzt den
Modell-Turn-Lebenszyklus und lehnt bewusst parallele Top-Level-Turns ab.
Lokale Befehle außerhalb davon zu halten vermeidet das Teilen von
Abort-Controllern, Submit-Flags oder Modell-Stream-Zählern mit der aktiven
Response.

Der Slash-Befehl-Prozessor und Command-Ergebnisse aktualisieren Ink bereits
über React-State. Die ersten Befehle schreiben daher nicht direkt auf
Terminal-Stdout, während Ink rendert.

## Anfängliche Befehlsmenge

- `/status`, `/about` und `/status paths`: lesen lokale Runtime-Informationen
  und hängen ein Ink-History-Element an.
- `/settings`: öffnet den Settings-Dialog; gespeicherte Änderungen werden
  über die bestehenden Settings-Hooks angewendet, ohne den aktiven
  Konversations-Turn zu ersetzen.
- `/help`: öffnet den statischen Hilfe-Dialog.

Die folgenden Kategorien bleiben serialisiert:

- Befehle, die einen Modell-Turn submitten oder transformieren, etwa Skills,
  `/summary`, `/compress`, `/model <model> <prompt>` und `/goal`.
- Befehle, die Konversationszustand ersetzen, löschen, zurückspulen,
  fortsetzen, verzweigen oder anderweitig mutieren.
- Befehle, die Tools planen oder langlaufende externe Arbeit ausführen.
- Befehle, die Zustand lesen, der vom aktiven Turn mutiert wird, etwa
  `/context`, `/stats`, `/copy`, `/diff` und `/recap`.

`/btw` behält seinen spezialisierten parallelen Modell-Request-Pfad.
`/quit` behält seinen bestehenden sofortigen Cancellation-Pfad. Ctrl+Q
erzwingt weiterhin, dass jede Eingabe auf Idle wartet, einschließlich eines
ansonsten Opt-in-Befehls.

## Verifikation

Die Unit-Abdeckung verifiziert, dass Opt-in-Befehle während einer Response
sowohl `submitQuery` als auch die Message-Queue umgehen, während nicht
markierte Slash-Befehle in der Queue bleiben. Command-Tests pinnen die
anfänglichen Capability-Deklarationen. Interaktive E2E-Checks sollten eine
sichtbar streamende Response starten, jeden Opt-in-Befehl öffnen, jeden
Dialog schließen und bestätigen, dass die ursprüngliche Response fortgesetzt
wird und abschließt.
