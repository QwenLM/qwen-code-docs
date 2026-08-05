# Goal-Loop-Eingabesteuerung

## Problem

Ein aktives `/goal` ist als blockierender Stop-Hook implementiert. Während
das Modell läuft, stellt die interaktive Queue Slash-Befehle normalerweise
zurück, bis der Stream idle wird. Ein Goal-Loop erreicht diese Idle-Grenze
möglicherweise nie, sodass `/goal clear` und ersetzende `/goal`-Befehle
nicht wirksam werden können.

Die Stop-Response kann den Goal-Hook auch mit unzusammenhängenden
konfigurierten Hooks aggregieren. Das Löschen eines Goals darf eine
blockierende Entscheidung, die einem anderen Hook gehört, nicht verwerfen.

## Design

Während eines aktiven Turns drainen die Message-Queue `/goal`-Befehle
zusammen mit einfachen Text-Steering-Nachrichten. Andere Slash-Befehle
bleiben für die normale Idle-Verarbeitung in der Queue.

Die CLI führt gedrainte Goal-Befehle über den bestehenden
Slash-Befehl-Prozessor aus:

- Clear-Befehle wenden ihren Seiteneffekt an, ohne Modell-Input zu erzeugen.
- Ersetzende Befehle ersetzen die pending Goal-Instruktion.
- Wenn mehrere Goal-Befehle zusammen gedraint werden, wird nur die
  Instruktion für das finale aktive Goal gesendet.
- Die überlebende Instruktion behält ihre Position relativ zu den einfachen
  Text-Steering-Nachrichten.
- Ausgeführte Goal-Befehle werden nicht wiederhergestellt, wenn eine spätere
  Steering-Vorbereitung abgebrochen wird; nicht ausgeführte einfache
  Text-Nachrichten werden wiederhergestellt.

Core sampelt die Queue vor Stop-Hooks und erneut, nachdem ein blockierender
Stop-Hook zurückkehrt. Ein blockierender Goal-Output trägt seine
Goal-Hook-ID und hält seinen Fortsetzungsgrund getrennt von gewöhnlichen
Hook-Gründen. Die Hook-Bridge meldet außerdem, ob ein anderer Stop-Output
blockiert. Wenn sich das Goal an der zweiten Grenze ändert, entfernt Core nur
die alte Goal-Fortsetzung; sie folgt weiterhin einem unabhängigen
blockierenden Grund. Nicht-blockierende Hook-Outputs erzwingen keine
zusätzliche Goal-Iteration.

## Verifikation

- Queue-Tests decken Goal-Draining während aktiver Turns und das
  Zurückstellen an der Idle-Grenze ab.
- CLI-Stream-Tests decken Clear, Ersetzung, gebatchte Befehle, Reihenfolge
  und Wiederherstellungsverhalten ab.
- Core-Tests decken Clear und Ersetzung während der Stop-Hook-Evaluierung ab,
  einschließlich eines aggregierten unabhängigen Blockers.
- Eine lokale tmux-Session übt Clear und Ersetzung gegen die gebaute
  interaktive CLI.
