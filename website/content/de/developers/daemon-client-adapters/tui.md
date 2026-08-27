# TUI-Daemon-Adapter-Entwurf

> **Veraltet**: Dieses Dokument beschreibt den frühen `DaemonTuiAdapter`-Prototypen. Der Legacy-Adapter existiert weiterhin in `packages/cli/src/ui/daemon/`, der zukunftsfähige Ansatz ist jedoch die freigegebene SDK-UI-Transkriptschicht. Informationen zur aktuellen Architektur finden Sie unter [`../daemon/14-cli-tui-adapter.md`](../daemon/14-cli-tui-adapter.md).

---

## Ziel (historisch)

Hinzufügen eines flag-gesteuerten TUI-Transports, der über `DaemonSessionClient` mit `qwen serve` kommuniziert, anstatt einen prozessinternen `Config` + Agenten-Laufzeit zu erstellen.

Dies ist ein interner Validierungspfad für die Mode-B-Client-Migration. Er darf den standardmäßigen TUI-Pfad erst ersetzen, wenn Output-Sinks, typisierte Daemon-Ereignisse, sitzungsspezifische Berechtigungen und Lebenszyklusdiagnostik stabil sind.

## Vorgeschlagener Einstiegspunkt

```bash
QWEN_DAEMON_URL=http://127.0.0.1:4170 qwen --experimental-daemon-tui
```

Optional:

```bash
QWEN_DAEMON_TOKEN=... QWEN_DAEMON_WORKSPACE=/repo qwen --experimental-daemon-tui
```

Die CLI sollte diesen Modus ablehnen, sofern nicht beides zutrifft:

- `QWEN_DAEMON_URL` oder `--daemon-url` ist gesetzt.
- `GET /capabilities` gibt `session_create`, `session_prompt` und `session_events` bekannt.

## Minimaler Ablauf

1. Erstellen eines `DaemonClient` mit Daemon-URL und Token.
2. Abrufen von `/capabilities`.
3. Erstellen oder Anhängen mit `DaemonSessionClient.createOrAttach()`.
4. Abonnieren von `session.events()`.
5. Senden von Benutzereingaben über `session.prompt()`.
6. Abbrechen über `session.cancel()`.
7. Modellwechsel über `session.setModel()`.
8. Berechtigungsabstimmungen über `session.respondToPermission()`.

## Rendering-Vertrag

Die erste Implementierung fügt `DaemonTuiAdapter` hinzu – einen lokal verifizierbaren Reducer- und Transport-Prototypen. Er bildet nur diese Daemon-Ereignisse ab:

| Daemon-Ereignis                          | TUI-Behandlung                                  |
| ---------------------------------------- | ----------------------------------------------- |
| `session_update` / `agent_message_chunk` | Assistententext anhängen                        |
| `session_update` / `agent_thought_chunk` | Denktext anhängen                               |
| `session_update` / `tool_call`           | Lebenszyklus des Tool-Aufrufs anzeigen          |
| `permission_request`                     | Vorhandene Bestätigungs-UI anzeigen, wo möglich |
| `permission_resolved`                    | Bestätigungs-UI schließen oder aktualisieren    |
| `model_switched`                         | Fußzeilen-/Modellanzeige aktualisieren          |
| `session_died`                           | Getrennten Zustand anzeigen und Streaming stoppen |

Unbekannte Ereignisse müssen ignoriert werden, nicht fatal. Typisierte Ereignis-Reducer werden in einem späteren Protokoll-PR eingeführt.

Der Adapter ist noch nicht in die standardmäßige Ink-App eingebunden. Das bestehende interaktive TUI-, JSONL-, Stream-JSON- und Dual-Output-Verhalten bleibt unverändert.

## Explizite Nicht-Ziele

- Die aktuelle TUI-Inprozess-Laufzeit darf nicht entfernt werden.
- Das Verhalten von JSONL, Stream-JSON oder Dual-Output wird in diesem PR nicht geändert.
- Datei-CRUD, MCP-Verwaltung, Speicher-CRUD oder Provider-/Auth-Mutation werden in der TUI noch nicht freigegeben.
- Es werden keine Browser-/Web-Direkt-zu-Daemon-Annahmen getroffen; dies ist nur für das Terminal.

## Merge-Sicherheit

- Standardmäßig deaktiviert.
- Additiver Codepfad.
- Keine bestehenden CLI-Flags ändern das Verhalten.
- Falls der Daemon nicht verfügbar ist, schlägt der experimentelle Pfad vor dem Start der TUI fehl und teilt dem Benutzer mit, `qwen serve` auszuführen.

## Validierungsplan

- Unit-Tests der Ereignis-zu-TUI-Zustandsabbildung mit synthetischen Daemon-Ereignissen.
- Unit-Tests für die Weiterleitung von Prompt, Abbruch, Modellwechsel und Berechtigungsabstimmung.
- Unit-Tests für die Flag-/Umgebungsvariablen-Parsing, sobald das Feature-Flag eingebunden ist.
- Smoke-Test gegen einen lokalen `qwen serve`:
  - Prompt-Text wird in die TUI gestreamt
  - Abbruch löst den aktiven Prompt auf
  - Berechtigungsanfrage kann akzeptiert oder abgelehnt werden
  - Wiederverbindung sendet die verfolgte `Last-Event-ID`

## Blockaden vor der Standardmigration

- Typisiertes Daemon-Ereignisschema.
- Sitzungsspezifische Berechtigungsroute.
- Output-Sink-Refactoring für JSONL / Stream-JSON / Dual-Output-Parität.
- Lebenszyklus-Semantik für Sitzungs-Schließen/Löschen.
- Laufzeitdiagnostik für MCP, Skills, Provider und Workspace-Umgebung.