# Entwurf eines Daemon-Adapters für Channel- und Web-Backend

## Ziel

Channel-Adapter und Web-Chat-Backends sollen `qwen serve` über
`DaemonSessionClient` nutzen können, während das bestehende ACP-Subprozess-Verhalten
für Channel die Voreinstellung bleibt.

Dieser Entwurf behandelt nur serverseitige Clients:

- Channel-Bot-Backend -> `qwen serve`
- Webbrowser -> Web-Backend / BFF -> `qwen serve`

Es erlaubt explizit keinem Browser-JavaScript, den Daemon direkt aufzurufen.
Der Daemon lehnt Browser-`Origin`-Anfragen derzeit bewusst ab.

## Vorgeschlagene Einstiegspunkte

Channel-Backend:

```bash
QWEN_CHANNEL_DAEMON_URL=http://127.0.0.1:4170 qwen channel start telegram
```

Web-Backend:

```bash
QWEN_WEB_DAEMON_URL=http://127.0.0.1:4170 qwen web-chat-backend
```

Gemeinsame optionale Variablen:

```bash
QWEN_DAEMON_TOKEN=...
QWEN_DAEMON_WORKSPACE=/repo
```

## Minimaler Channel-Ablauf

Dieser PR fügt `DaemonChannelBridge` hinzu, eine lokal überprüfbare serverseitige Brücke für
Channel- und Web-Backend-Adapter. Die bestehende ACP-Brücke bleibt die
Voreinstellung und der Daemon-Session-Zustand wird im Backend-Prozess gehalten.

1. Auflösen des Channel-Absenders/Threads zu einem Channel-Session-Key.
2. Verwenden von `DaemonClient` + `DaemonSessionClient.createOrAttach()`.
3. Einreichen des eingehenden Benutzertexts mit `session.prompt()`.
4. Abonnieren von `session.events()` und Sammeln der Assistant-Textblöcke.
5. Senden des endgültigen Texts über den Plattform-Adapter.
6. Abgeben von Berechtigungsstimmen mit `session.respondToPermission()`.
7. Abbrechen der aktiven Arbeit mit `session.cancel()`.

## Minimaler Web-Backend-Ablauf

1. Der Browser öffnet einen WebSocket oder HTTP-Stream zum Web-Backend.
2. Das Backend besitzt `DaemonSessionClient`.
3. Das Backend übersetzt Browser-Nachrichten in Daemon-Prompts.
4. Das Backend übersetzt Daemon-SSE-Ereignisse in browsersichere App-Ereignisse.
5. Das Backend speichert die Daemon-`sessionId` und die zuletzt gesehene Ereignis-ID serverseitig.

Browser-Clients dürfen keine Daemon-Bearer-Tokens erhalten.

## Einschränkung der Session-Isolation

Das aktuelle Verhalten von Daemon Stage 1 entspricht effektiv `sessionScope: single` auf der
Daemon-Einstellungsebene. Bis `sessionScope` pro Anfrage verfügbar ist, müssen
Multi-User-Channel- oder Web-Bereitstellungen eine dieser sicheren Formen wählen:

- ein Daemon pro Channel-Thread / Web-Raum
- ein Daemon pro Benutzer-Workspace
- nur Single-User-Demo

Multiplexen Sie nicht stillschweigend unabhängige Channel-Threads in eine Daemon-Session.

## Vertrag zur Ereigniszuordnung

| Daemon-Ereignis                           | Behandlung durch Channel-/Web-Backend        |
| ----------------------------------------- | -------------------------------------------- |
| `session_update` / `agent_message_chunk`  | Assistant-Text anhängen                      |
| `session_update` / `agent_thought_chunk`  | Optionaler versteckter/Debug-Stream          |
| `session_update` / `tool_call`            | Tool-Status-Karte/Nachricht ausgeben         |
| `permission_request`                      | Plattformspezifische Genehmigungsinteraktion |
| `permission_resolved`                     | Genehmigungsinteraktion schließen/aktualisieren |
| `model_switched`                          | Backend-Session-Metadaten aktualisieren      |
| `session_died`                            | Benutzer benachrichtigen und Stream beenden  |

Unbekannte Daemon-Ereignisse müssen ignoriert oder als Debug-Metadaten weitergeleitet werden, nicht als Fehler.

Die Brücke ist noch nicht in `qwen channel start` eingebunden. Das bestehende Verhalten
von Telegram, Weixin, Dingtalk, Plugin-Channel und Browser bleibt unverändert.

## Explizite Nicht-Ziele

- Kein direkter Browser-zu-Daemon-Fetch oder EventSource.
- Keine CORS-Lockerung in diesem Adapter-PR.
- Keine Standardmigration von Telegram, Weixin, Dingtalk oder Plugin-Channels.
- Kein Datei-CRUD, Memory-CRUD, MCP-Neustart oder Provider-Änderung.
- Keine SessionScope-Emulation im Client, wenn die Daemon-Seite diese nicht unterstützt.

## Merge-Sicherheit

- Standardmäßig deaktiviert.
- Die bestehende ACP-Channel-Brücke bleibt die Voreinstellung.
- Das Web-Backend ist eine explizite BFF-Schicht, keine Daemon-Sicherheitsänderung.
- Kein Channel-Adapter sollte Daemon-Tokens in Frontend-/Browser-Code importieren.

## Validierungsplan

- Unit-Test der Bindung von Channel-Session-Key zu Daemon-Session.
- Unit-Test der Abbildung von Daemon-Ereignissen auf Channel-/Web-Nachrichten.
- Unit-Test der Weiterleitung von Prompt, Cancel, Modellwechsel und Berechtigungsantwort.
- Smoke-Test eines Single-User-Channel-Backends gegen lokales `qwen serve`.
- Smoke-Test Browser -> BFF -> Daemon ohne Offenlegung des Daemon-Tokens.

## Blockierer vor der Standardmigration

- `sessionScope` pro Anfrage.
- Session-Metadaten + Lebenszyklus für Schließen/Löschen.
- Daemon-gestempelte Client-Identität.
- Berechtigungsroute im Session-Bereich.
- Nur-Lese-Diagnose für MCP, Skills, Provider und Umgebung.
