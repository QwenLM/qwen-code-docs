# IDE-Daemon-Adapter-Entwurf

## Ziel

Die VS Code Companion-Extension soll Mode B dogfooden, indem sie vom
Extension-Host aus über `DaemonSessionClient` eine Verbindung zu `qwen serve` herstellt.

Die Webview darf nicht direkt den Daemon aufrufen. Der Extension-Host besitzt
Daemon-URL, Token, Session-ID und SSE-Replay-Status und leitet bereinigte
App-Ereignisse an die Webview weiter.

## Vorgeschlagener Einstiegspunkt

VS Code-Einstellungen:

```json
{
  "qwen-code.experimentalDaemon.enabled": true,
  "qwen-code.experimentalDaemon.url": "http://127.0.0.1:4170",
  "qwen-code.experimentalDaemon.token": ""
}
```

Umgebungsvariablen-Fallback für lokales Dogfooding:

```bash
QWEN_IDE_DAEMON_URL=http://127.0.0.1:4170 code .
```

## Minimaler Ablauf

1. Der Extension-Host erstellt einen `DaemonClient`.
2. Abrufen von `/capabilities` und Prüfen der Workspace-Kompatibilität.
3. Erstellen oder Anhängen mit `DaemonSessionClient.createOrAttach()`.
4. Abonnieren von `session.events()` im Extension-Host.
5. Übersetzen von Daemon-Ereignissen in bestehende Webview-Nachrichten.
6. Senden von Benutzerprompts über `session.prompt()`.
7. Weiterleiten von Abbrechen/Modellwechsel über `session.cancel()` und
   `session.setModel()`.
8. Weiterleiten von Berechtigungsentscheidungen über `session.respondToPermission()`.

## Beziehung zur bestehenden ACP-Verbindung

Die erste Implementierung führt einen parallelen Verbindungspfad ein, ersetzt aber
nicht `AcpConnection`:

```text
QwenAgentManager
  current default -> AcpConnection -> qwen --acp child
  experimental    -> DaemonIdeConnection -> qwen serve HTTP/SSE
```

Beide Pfade sollten, wo praktikabel, dieselben übergeordneten Webview-Callbacks
speisen. Falls ein Ereignis noch nicht originalgetreu abgebildet werden kann,
sollte der Daemon-Pfad eine klare Warnung über einen nicht unterstützten Zustand
ausgeben, anstatt stillschweigend Parität vorzutäuschen.

Dieser PR fügt `DaemonIdeConnection` als lokal verifizierbaren Extension-Host-
Adapter-Spike hinzu. Er ist noch nicht in den Standardpfad von `QwenAgentManager`
eingebunden, sodass das bestehende VS Code-Verhalten weiterhin auf ACP-Subprozessen basiert.

## Ereignis-Zuordnungstabelle

| Daemon-Ereignis                          | IDE-Behandlung                            |
| ---------------------------------------- | ----------------------------------------- |
| `session_update` / `agent_message_chunk` | Vorhandener Assistant-Stream-Callback     |
| `session_update` / `agent_thought_chunk` | Vorhandener Thinking-Stream-Callback      |
| `session_update` / `tool_call`           | Vorhandener Tool-Call-Update-Callback     |
| `permission_request`                     | Vorhandener Genehmigungs-UI-Callback      |
| `permission_resolved`                    | Genehmigungs-UI schließen/aktualisieren   |
| `model_switched`                         | Vorhandener Modellstatus-Callback (wo möglich) |
| `session_died`                           | Verbindungs-UI trennen + Wiederverbindungsangebot |

Unbekannte Ereignisse müssen ignoriert oder als Debug-Metadaten geloggt werden.

## Laufzeit-Lokalitäts-UX

Die Extension muss die Lokalität des Daemons sichtbar machen:

- Workspace/Dateien sind Daemon-Host-Pfade
- MCP-Server laufen auf dem Daemon-Host
- Skills werden aus dem Daemon-Dateisystem geladen
- Provider-Anmeldedaten werden in der Daemon-Prozessumgebung aufgelöst

Es darf nicht impliziert werden, dass lokale VS Code-Extensions, das lokale
Browserprofil, lokale localhost-Dienste oder lokale SSH/kube-Anmeldedaten
automatisch für den Daemon verfügbar sind.

## Explizite Nicht-Ziele

- Keine Standard-Migration weg von `AcpConnection`.
- Kein Webview-Direkt-Transport zum Daemon.
- Kein Datei-CRUD auf Daemon-Seite über die IDE, bis die File-Service-Grenzen festgelegt sind.
- Noch kein Reverse-RPC für Editor/Browser/Zwischenablage.
- Noch keine vollständige Remote-Control-Integration.

## Merge-Sicherheit

- Standardmäßig deaktiviert hinter Einstellung/Umgebungsvariable.
- Additiver paralleler Verbindungspfad.
- Bestehender VS Code-ACP-Subprozess-Pfad bleibt unverändert.
- Daemon-Token gelangt nie in das Webview-JavaScript.

## Validierungsplan

- Unit-Tests für Daemon-Session-Factory-Verbindung und SSE-Ereigniskonsum.
- Unit-Tests für die Zuordnung von Daemon-Ereignissen zu bestehenden Extension-Host-Callbacks.
- Unit-Tests für die Weiterleitung von Prompt, Abbrechen, Modellwechsel und Berechtigungsantwort.
- Unit-Tests für die Auflösung von Einstellungen/Umgebungsvariablen, wenn das Feature-Flag verdrahtet ist.
- Smoke-Tests des lokalen Extension-Hosts gegen `qwen serve`:
  - Prompt streamt in den Chat
  - Abbrechen funktioniert
  - Genehmigungs-UI kann eine Anfrage auflösen
  - SSE-Wiederverbindung nutzt die nachverfolgte `Last-Event-ID`

## Hürden vor der Standardmigration

- Typisiertes Daemon-Ereignisschema.
- Daemon-gestempelte Client-Identität.
- Session-bezogene Berechtigungsroute.
- Schreibgeschützte Laufzeitdiagnose.
- FileSystemService-Grenze und sichere Datei-Lese-Pfade.
- Output-Sink-Refactoring für CLI/TUI-Parität.