# Explizite Monitor-Cancellation-Notifications

## Problem

`task_stop` gibt bereits ein synchrones Tool-Ergebnis zurück, das bestätigt,
dass ein Monitor gecancelt wurde. Die Monitor-Registry emittiert zusätzlich
eine terminale `cancelled`-Notification, die Clients als
Notification-Nutzer-Nachricht aufzeichnen und als neuen Modell-Turn
submitten. Ein `running`-Event, das unmittelbar vor der Cancellation in die
Queue gestellt wurde, kann denselben zusätzlichen Turn verursachen, selbst
wenn die terminale Notification unterdrückt wird.

## Design

- Cancel-Monitore still, wenn die Cancellation von `task_stop` kommt; das
  Tool-Ergebnis bleibt die für Nutzer und Modell sichtbare Bestätigung.
- Behalte das Standard-Cancellation-Verhalten der Registry für andere
  Aufrufer unverändert bei.
- Verwerfe zum Drain-Zeitpunkt in der Queue befindliche `running`-
  Monitor-Notifications, deren Registry-Eintrag jetzt explizit `cancelled`
  ist. Dieser Check gilt für die interaktive Queue, die persistente
  Stream-JSON-Queue und die Einmal-Headless-Queue.
- Liefere weiterhin natürliche `completed`- und `failed`-Notifications sowie
  terminale Notifications, die von Nicht-`task_stop`-Cancellations-Pfaden
  emittiert werden.

ACP lehnt `running`-Monitor-Notifications bereits ab, daher reicht eine
stille explizite Cancellation für diesen Client.

Owner-geroutete Monitor-Notifications bleiben in der Input-Queue eines
Agents statt in der Konversation des Nutzers. Sie liegen außerhalb dieser
Session-Notification-Korrektur; im gewöhnlichen Tool-Aufruf-Pfad wird jedes
Event in der Queue zusammen mit dem ohnehin erforderlichen `task_stop`-
Tool-Ergebnis zugestellt, statt einen Session-Turn zu erzeugen.

## Verifikation

- `task_stop` cancelt und bricht einen Monitor ab, ohne seinen
  Notification-Callback aufzurufen.
- Jeder Client verwirft ein in der Queue befindliches `running`-Event,
  nachdem der Monitor explizit gecancelt wurde.
- Bestehende Terminale-Notification-Tests zeigen weiterhin, dass natürliche
  Vervollständigung und Fehlschlag zugestellt werden.
- Ein echter modell-gesteuerter `monitor`-dann-`task_stop`-Lauf erzeugt
  keinen Folge-Notification-Turn.
