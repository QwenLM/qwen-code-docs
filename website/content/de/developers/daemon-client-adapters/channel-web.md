# Channel- und Web-Backend-Daemon-Adapter – Entwurf

## Ziel

Channel-Adapter und Web-Chat-Backends sollen `qwen serve` über `DaemonSessionClient` nutzen können, während das bisherige Channel-ACP-Subprozess-Verhalten die Standardeinstellung bleibt.

Dieser Entwurf behandelt nur serverseitige Clients:

- Channel-Bot-Backend → `qwen serve`
- Webbrowser → Web-Backend / BFF → `qwen serve`

Er erlaubt ausdrücklich nicht, dass Browser-JavaScript direkt den Daemon aufruft. Der Daemon lehnt Browser-`Origin`-Requests aktuell bewusst ab.

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

Dieser PR fügt `DaemonChannelBridge` hinzu, eine lokal verifizierbare serverseitige Brücke für Channel- und Web-Backend-Adapter. Sie behält die bestehende ACP-Brücke als Standard und verwaltet den Daemon-Session-Zustand innerhalb des Backend-Prozesses.

1. Auflösen von Channel-Sender/Thread zu einem Channel-Session-Key.
2. Verwendung von `DaemonClient` + `DaemonSessionClient.createOrAttach()`.
3. Übermittlung eingehenden Benutzertexts mit `session.prompt()`.
4. Subskription von `session.events()` und Sammeln von Assistenten-Text-Chunks.
5. Senden des finalen Texts über den Plattform-Adapter.
6. Abgeben von Berechtigungsstimmen über `session.respondToPermission()`.
7. Abbrechen aktiver Arbeit über `session.cancel()`.

## Minimaler Web-Backend-Ablauf

1. Browser öffnet einen Websocket- oder HTTP-Stream zum Web-Backend.
2. Backend besitzt `DaemonSessionClient`.
3. Backend übersetzt Browser-Nachrichten in Daemon-Prompts.
4. Backend übersetzt Daemon-SSE-Ereignisse in browsertaugliche App-Ereignisse.
5. Backend speichert die Daemon-`sessionId` und die zuletzt gesehene Ereignis-ID serverseitig.

Browser-Clients dürfen keine Daemon-Bearer-Tokens erhalten.

## Session-Isolationsbeschränkung

Das aktuelle Daemon-Stage-1-Verhalten entspricht effektiv `sessionScope: single` auf der Daemon-Einstellungsebene. Bis `sessionScope` pro Request verfügbar ist, müssen Multi-User-Channel- oder Web-Deployments eine dieser sicheren Formen wählen:

- ein Daemon pro Channel-Thread / Web-Raum
- ein Daemon pro Benutzer-Workspace
- nur Single-User-Demo

Mehrere unabhängige Channel-Threads dürfen nicht stillschweigend in eine Daemon-Session gemultiplext werden.

## Ereignismapping-Vertrag

| Daemon-Ereignis                          | Channel-/Web-Backend-Behandlung          |
| ---------------------------------------- | ---------------------------------------- |
| `session_update` / `agent_message_chunk` | Assistenten-Text anhängen                |
| `session_update` / `agent_thought_chunk` | Optionaler versteckter/Debug-Stream      |
| `session_update` / `tool_call`           | Tool-Status-Card/-Nachricht ausgeben     |
| `permission_request`                     | Plattformspezifische Genehmigungsinteraktion |
| `permission_resolved`                    | Genehmigungsinteraktion schließen/aktualisieren |
| `model_switched`                         | Backend-Session-Metadaten aktualisieren  |
| `session_died`                           | Benutzer benachrichtigen und Stream stoppen |

Unbekannte Daemon-Ereignisse müssen ignoriert oder als Debug-Metadaten weitergereicht werden, nicht als fatal.

Die Brücke ist noch nicht in `qwen channel start` eingebunden. Bestehendes Telegram-, Weixin-, Dingtalk-, Plugin-Channel- und Browser-Verhalten bleibt unverändert.

## Explizite Nicht-Ziele

- Kein direkter Browser-zu-Daemon-`fetch` oder `EventSource`.
- Keine CORS-Lockerung in diesem Adapter-PR.
- Keine Standardmigration von Telegram-, Weixin-, Dingtalk- oder Plugin-Channels.
- Kein Datei-CRUD, Memory-CRUD, MCP-Neustart oder Provider-Mutation.
- Keine `sessionScope`-Emulation im Client, wenn die Daemon-Seite keine Unterstützung bietet.

## Merge-Sicherheit

- Standardmäßig ausgeschaltet.
- Bestehende ACP-Channel-Bridge bleibt Standard.
- Web-Backend ist eine explizite BFF-Schicht, keine Daemon-Sicherheitsänderung.
- Kein Channel-Adapter soll Daemon-Tokens in Frontend-/Browser-Code importieren.

## Validierungsplan

- Unit-Tests für Channel-Session-Key zu Daemon-Session-Bindung.
- Unit-Tests für Daemon-Ereignis-zu-Channel/Web-Nachrichten-Mapping.
- Unit-Tests für Prompt-, Cancel-, Model-Switch- und Permission-Response-Weiterleitung.
- Smoke-Test eines Single-User-Channel-Backends gegen lokales `qwen serve`.
- Smoke-Test Browser → BFF → Daemon ohne Offenlegung des Daemon-Tokens.

## Blocker vor Standardmigration

- `sessionScope` pro Request.
- Session-Metadaten + Close/Delete-Lebenszyklus.
- Daemon-gestempelte Client-Identität.
- Session-bezogene Permission-Route.
- Schreibgeschützte Diagnosen für MCP, Skills, Providers und Umgebung.