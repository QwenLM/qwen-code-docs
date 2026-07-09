# Channel-Lifecycle-Status-Adapter

Datum: 2026-07-01

## Ziel

Den Task-Lifecycle-Status über die ersten vier Channel-Adapter verfügbar machen:

- Telegram
- Weixin
- DingTalk
- Feishu

Dies ist ein P1.1-Follow-up zur Arbeit an der Channel-Identität und den Lifecycle-Metadaten.
Das Ziel ist es, dass jeder unterstützte Channel das bestmögliche native Fortschrittssignal
anzeigt, ohne den gemeinsamen Channel-Vertrag erneut zu ändern.

## Nicht-Ziele

- Slack-Verhalten nicht implementieren.
- QQ-Bot-Verhalten nicht implementieren.
- Mock-/Plugin-Beispiele nicht aktualisieren.
- Keine Terminal-Status-Emojis für DingTalk hinzufügen.
- Keine gemeinsame Status-Rendering-Abstraktion für eine Runde adapter-spezifischer
  Mappings einführen.

## Referenzen und Abstimmung

Das Design folgt in erster Linie den aktuellen Fähigkeiten der Qwen-Channel-Adapter.
Die Lifecycle-Semantik bleibt auf das bestehende Task-/Session-Statusmodell abgestimmt,
das bereits in diesem Repository verwendet wird: Ein Task kann starten, laufen,
abgeschlossen werden, abgebrochen werden oder fehlschlagen. In diesem
Scope wird kein zusätzliches externes Statusmodell eingeführt, da jeder Channel
bereits eine klare native Oberfläche für diese Zustände bietet.

## Aktueller Stand

| Channel  | Bestehende Status-Oberfläche | Aktuelles Verhalten                                                     |
| -------- | ---------------------------- | --------------------------------------------------------------------- |
| Telegram | Typing-Indicator             | Beginnt mit dem Tippen bei Prompt-Start und stoppt bei Prompt-Ende.   |
| Weixin   | Typing-Indicator             | Beginnt mit dem Tippen bei Prompt-Start und stoppt bei Prompt-Ende.   |
| DingTalk | Nachrichten-Reaktion         | Fügt die Augen-Reaktion bei Prompt-Start hinzu und entfernt sie bei Prompt-Ende. |
| Feishu   | Streaming-Card               | Zeigt und aktualisiert eine Streaming-Card, mit Abschluss- und Fehlerpfaden. |

## Vorgeschlagenes Design

Die Implementierung bleibt adapter-lokal. Jeder Adapter konsumiert den Lifecycle-Event-
Hook und mappt das Event auf die bestehende native Status-Oberfläche der Plattform.

| Lifecycle-Event | Telegram      | Weixin        | DingTalk             | Feishu                                                                                           |
| --------------- | ------------- | ------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `started`       | Tippen starten. | Tippen starten. | Augen-Reaktion hinzufügen. | Card als laufend anzeigen/aktualisieren.                                                         |
| `text_chunk`    | Ignorieren.   | Ignorieren.   | Ignorieren.          | Im Lifecycle-Hook ignorieren. Content-Streaming bleibt auf dem bestehenden Response-/Card-Stream-Pfad. |
| `tool_call`     | Ignorieren.   | Ignorieren.   | Ignorieren.          | Für UI ignorieren.                                                                               |
| `completed`     | Tippen stoppen. | Tippen stoppen. | Augen-Reaktion entfernen. | Card als abgeschlossen markieren.                                                                |
| `cancelled`     | Tippen stoppen. | Tippen stoppen. | Augen-Reaktion entfernen. | Card als abgebrochen markieren.                                                                  |
| `failed`        | Tippen stoppen. | Tippen stoppen. | Augen-Reaktion entfernen. | Card als fehlgeschlagen markieren.                                                               |

### Telegram

Telegram behält die bestehende Typing-Implementierung bei. Der Lifecycle-Hook sollte
`started` auf den bestehenden Typing-Start-Pfad und alle Terminal-Events auf den
bestehenden Typing-Stop-Pfad mappen.

`text_chunk` und `tool_call` erfordern keine Telegram-UI-Änderungen.

### Weixin

Weixin folgt der gleichen Struktur wie Telegram. Der Lifecycle-Hook sollte
`started` auf `setTyping(true)` und Terminal-Events auf `setTyping(false)` mappen.

Es werden keine zusätzlichen Nachrichten gesendet.

### DingTalk

DingTalk behält das bestehende Augen-Reaktionsverhalten bei:

- `started`: bestehende Augen-Reaktion anfügen.
- `completed`, `cancelled`, `failed`: bestehende Augen-Reaktion entfernen.

In diesem Scope gibt es kein Terminal-Emoji. Fehlgeschlagene und abgebrochene Tasks
sollten keine zusätzlichen Statusnachrichten senden, es sei denn, ein bestehender
Fehlerpfad tut dies bereits.

### Feishu

Feishu behält die Streaming-Card als Status-Oberfläche bei und macht den Terminal-
Zustand im Card-Inhalt explizit:

| Status    | Card-Label                   |
| --------- | ---------------------------- |
| Läuft     | `Läuft...`                   |
| Abgeschlossen | `Abgeschlossen`          |
| Abgebrochen | `Abgebrochen`              |
| Fehlgeschlagen | `Fehlgeschlagen, bitte erneut versuchen` |

Die Card streamt weiterhin Antwortinhalte wie bisher über den bestehenden
Response-/Card-Stream-Hook. Lifecycle-`text_chunk` wird in diesem Scope nicht direkt
vom Adapter konsumiert, was die frühere adapter-lokale Idee, Lifecycle-Chunks zum
Anhängen von Card-Inhalten zu verwenden, außer Kraft setzt. `tool_call` bleibt in
diesem Scope vor der Card-UI verborgen.

Der Markdown-/Card-Helper kann bei Bedarf eine minimale Status-Label-Option
akzeptieren, sollte aber nicht zu einem generischen Rendering-Framework anwachsen.

## Datenfluss

1. Die Channel-Ausführung emittiert Lifecycle-Events aus der Basis-Channel-Schicht.
2. Der ausgewählte Adapter empfängt das Event über seinen Lifecycle-Hook.
3. Der Adapter mappt das Event auf die Plattform-Status-Oberfläche.
4. Plattform-Status-Updates werden nach Best-Effort ausgeführt und beeinflussen die Task-Ausführung nicht.

Der Lifecycle-Event-Payload sollte genügend bestehenden Kontext bereitstellen, um
die Channel-Nachricht/Session zu identifizieren. Wenn ein plattformspezifischer
Bezeichner fehlt, überspringt der Adapter das Status-Update.

## Fehlerbehandlung

Plattform-Status-Updates sind nicht kritisch. Ein fehlgeschlagenes Typing-, Reaktions-
oder Card-Status-Update sollte gemäß dem bestehenden Stil des Adapters geloggt oder
unterdrückt werden und darf nicht zum Fehlschlagen des Tasks führen.

Terminal-Events sollten für eine Nachricht/Session idempotent sein. Wiederholte
Terminal-Events sollten keine doppelten Status-Updates erzeugen oder einen veralteten
Lauf-Indicator hinterlassen.

Feishu erfordert besondere Sorgfalt, da es bereits Card-Abschluss-, Fehler- und
Stop-Button-Flows gibt. Das Lifecycle-Mapping sollte den bestehenden Card-Session-
Zustand wiederverwenden und konkurrierende Updates vermeiden, die einen spezifischeren
Terminal-Zustand überschreiben.

## Testplan

Gezielte Unit-Test-Abdeckung in den betroffenen Channel-Paketen hinzufügen:

- Telegram: Lifecycle-`started` startet das Tippen; Terminal-Events stoppen das Tippen;
  es wird kein doppeltes Typing-Intervall eingeführt.
- Weixin: Lifecycle-`started` ruft `setTyping(true)` auf; Terminal-Events rufen
  `setTyping(false)` auf.
- DingTalk: Lifecycle-`started` fügt die Augen-Reaktion hinzu; Terminal-Events
  entfernen sie; es wird kein Terminal-Emoji gesendet.
- Feishu: Die Card-Status "laufend", "abgeschlossen", "abgebrochen" und "fehlgeschlagen"
  rendern die erwarteten Labels; Lifecycle-`text_chunk` bleibt im Besitz des bestehenden
  Stream-Pfads und nicht des Lifecycle-Hooks; `tool_call` fügt keine UI-Ausgabe hinzu.

Die Verifizierung sollte paketlokale Vitest-Befehle für die berührten Adapter ausführen,
gefolgt von Projekt-Build und Typecheck, bevor der PR eingereicht wird.

## Offene Entscheidungen

Keine. Der aktuelle Scope ist absichtlich eng gefasst und folgt den bestehenden
Adapter-Fähigkeiten.