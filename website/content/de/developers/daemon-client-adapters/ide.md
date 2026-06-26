# IDE-Daemon-Adapter-Entwurf

## Ziel

Der VS Code Companion-Erweiterung ermöglichen, Mode B zu dogfooden, indem von
der Erweiterungshost aus über `DaemonSessionClient` eine Verbindung zu
`qwen serve` hergestellt wird.

Das Webview darf den Daemon nicht direkt aufrufen. Der Erweiterungshost besitzt
die Daemon-URL, das Token, die Session-ID und den SSE-Wiederholungsstatus und
leitet bereinigte App-Ereignisse an das Webview weiter.

## Vorgeschlagener Einstiegspunkt

VS Code-Einstellungen:

```json
{
  "qwen-code.experimentalDaemon.enabled": true,
  "qwen-code.experimentalDaemon.url": "http://127.0.0.1:4170",
  "qwen-code.experimentalDaemon.token": ""
}
```

Environment-Fallback für lokales Dogfooden:

```bash
QWEN_IDE_DAEMON_URL=http://127.0.0.1:4170 code .
```

## Minimaler Ablauf

1. Der Erweiterungshost erstellt `DaemonClient`.
2. `/capabilities` abrufen und Workspace-Kompatibilität prüfen.
3. Mit `DaemonSessionClient.createOrAttach()` erstellen oder anhängen.
4. Im Erweiterungshost `session.events()` abonnieren.
5. Daemon-Ereignisse in vorhandene Webview-Nachrichten übersetzen.
6. Benutzereingaben über `session.prompt()` senden.
7. Abbruch/Modellwechsel über `session.cancel()` und `session.setModel()` leiten.
8. Berechtigungsentscheidungen über `session.respondToPermission()` leiten.

## Beziehung zur vorhandenen ACP-Verbindung

Die erste Implementierung führt einen parallelen Verbindungspfad ein, ersetzt
`AcpConnection` aber nicht:

```text
QwenAgentManager
  current default -> AcpConnection -> qwen --acp child
  experimental    -> DaemonIdeConnection -> qwen serve HTTP/SSE
```

Beide Pfade sollten, wo praktikabel, dieselben übergeordneten Webview-Callbacks speisen.
Wenn ein Ereignis noch nicht getreu abgebildet werden kann, sollte der Daemon-Pfad eine
deutliche Warnung über nicht unterstützte Zustände ausgeben, anstatt stillschweigend Parität
vorzutäuschen.

Dieser PR fügt `DaemonIdeConnection` als lokal verifizierbaren Erweiterungshost-Adapter-Spike hinzu.
Er ist noch nicht in den standardmäßigen `QwenAgentManager`-Pfad eingebunden, sodass das vorhandene
VS Code-Verhalten weiterhin auf dem ACP-Subprozess basiert.

## Ereignis-Mapping-Vertrag

| Daemon-Ereignis                        | IDE-Behandlung                                 |
| -------------------------------------- | ---------------------------------------------- |
| `session_update` / `agent_message_chunk` | Vorhandener Assistant-Stream-Callback            |
| `session_update` / `agent_thought_chunk` | Vorhandener Thinking-Stream-Callback             |
| `session_update` / `tool_call`           | Vorhandener Tool-Call-Update-Callback            |
| `permission_request`                     | Vorhandener Genehmigungs-UI-Callback             |
| `permission_resolved`                    | Genehmigungs-UI schließen/aktualisieren          |
| `model_switched`                         | Vorhandener Modellzustands-Callback (wo möglich) |
| `session_died`                           | Trennen der UI + Wiederverbindungsmöglichkeit    |

Unbekannte Ereignisse müssen ignoriert oder als Debug-Metadaten protokolliert werden.

## Laufzeit-Ortsbezug-Benutzererfahrung

Die Erweiterung muss den Ortsbezug des Daemons sichtbar machen:

- Workspace/Dateien sind Daemon-Host-Pfade
- MCP-Server laufen auf dem Daemon-Host
- Skills werden vom Daemon-Dateisystem geladen
- Anbieter-Anmeldeinformationen werden in der Umgebung des Daemon-Prozesses aufgelöst

Es darf nicht impliziert werden, dass lokale VS Code-Erweiterungen, das lokale Browserprofil,
lokale localhost-Dienste oder lokale SSH/kube-Anmeldeinformationen automatisch für den Daemon
verfügbar sind.

## Explizite Nicht-Ziele

- Keine standardmäßige Migration weg von `AcpConnection`.
- Kein Webview-Direkt-zum-Daemon-Transport.
- Kein daemonseitiges Datei-CRUD über die IDE, bis Dateidienst-Grenzen festgelegt sind.
- Noch kein Reverse-RPC für Editor/Browser/Zwischenablage.
- Keine vollständige Fernsteuerungsintegration.

## Merge-Sicherheit

- Standardmäßig deaktiviert hinter Einstellung/Environment.
- Additiver paralleler Verbindungspfad.
- Vorhandener VS Code ACP-Subprozess-Pfad unverändert.
- Daemon-Token gelangt nie in Webview-JavaScript.

## Validierungsplan

- Unit-Tests für Daemon-Session-Factory-Verbindung und SSE-Ereigniskonsum.
- Unit-Tests für Daemon-Ereignis-zu-vorhandenem-Erweiterungshost-Callback-Mapping.
- Unit-Tests für Prompt-, Cancel-, Modellwechsel- und Berechtigungsantwort-Weiterleitung.
- Unit-Tests für Einstellungs-/Environment-Auflösung, sobald das Feature-Flag verdrahtet ist.
- Smoke-Test des lokalen Erweiterungshosts gegen `qwen serve`:
  - Prompt streamt in den Chat
  - Abbruch funktioniert
  - Berechtigungs-UI kann eine Anfrage auflösen
  - SSE-Wiederverbindung verwendet nachverfolgtes `Last-Event-ID`

## Blocker vor standardmäßiger Migration

- Getyptes Daemon-Ereignisschema.
- Daemon-gestempelte Client-Identität.
- Sitzungsbezogene Berechtigungsroute.
- Schreibgeschützte Laufzeitdiagnostik.
- FileSystemService-Grenze und sichere Dateilese-Routen.
- Ausgabe-Senken-Refactoring für CLI/TUI-Parität.
