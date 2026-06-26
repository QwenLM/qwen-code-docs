# Entwurf des TUI-Daemon-Adapters

> **Veraltet**: Dieses Dokument beschreibt den frühen `DaemonTuiAdapter`-Prototyp. Der Legacy-Adapter existiert weiterhin in `packages/cli/src/ui/daemon/`, aber die wiederverwendbare Richtung ist jetzt die gemeinsame UI-Transkript-Schicht des SDK. Für die aktuelle Architektur siehe [`../daemon/14-cli-tui-adapter.md`](../daemon/14-cli-tui-adapter.md).

---

## Ziel (historisch)

Hinzufügen eines flag-gesteuerten TUI-Transports, der mit `qwen serve` über
`DaemonSessionClient` kommuniziert, anstatt eine prozessinterne `Config` + Agenten-
Laufzeitumgebung zu erstellen.

Dies ist ein interner Validierungspfad für die Migration von Modus B Client. Er darf den
Standard-TUI-Pfad nicht ersetzen, bis Ausgabe-Sinks, typisierte Daemon-Ereignisse, sitzungsspezifische
Berechtigungen und Lebenszyklus-Diagnosen stabil sind.

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
- `GET /capabilities` gibt `session_create`, `session_prompt` und
  `session_events` bekannt.

## Minimaler Ablauf

1. `DaemonClient` mit Daemon-URL und Token erstellen.
2. `/capabilities` abrufen.
3. Sitzung mit `DaemonSessionClient.createOrAttach()` erstellen oder beitreten.
4. `session.events()` abonnieren.
5. Benutzereingaben über `session.prompt()` senden.
6. Abbrechen über `session.cancel()` leiten.
7. Modellwechsel über `session.setModel()` leiten.
8. Berechtigungsabstimmungen über `session.respondToPermission()` leiten.

## Rendering-Vertrag

Die erste Implementierung fügt `DaemonTuiAdapter` hinzu, einen lokal verifizierbaren Reducer
und Transport-Prototyp. Er bildet nur diese Daemon-Ereignisse ab:

| Daemon-Ereignis                          | TUI-Behandlung                            |
| ---------------------------------------- | ----------------------------------------- |
| `session_update` / `agent_message_chunk` | Assistententext anhängen                  |
| `session_update` / `agent_thought_chunk` | Denktext anhängen                         |
| `session_update` / `tool_call`           | Tool-Aufruf-Lebenszyklus anzeigen         |
| `permission_request`                     | Vorhandene Bestätigungs-UI anzeigen (wo möglich) |
| `permission_resolved`                    | Bestätigungs-UI schließen oder aktualisieren |
| `model_switched`                         | Fußzeilen-/Modellanzeige aktualisieren    |
| `session_died`                           | Getrennten Zustand anzeigen und Streaming stoppen |

Unbekannte Ereignisse müssen ignoriert werden, nicht fatal. Typisierte Ereignis-Reducer werden in einem
späteren Protocol-PR eingeführt.

Der Adapter ist noch nicht in die standardmäßige Ink-App eingebunden. Das bestehende interaktive TUI-,
JSONL-, Stream-JSON- und Dual-Output-Verhalten bleibt unverändert.

## Explizite Nicht-Ziele

- Die aktuelle TUI-In-Prozess-Laufzeitumgebung nicht entfernen.
- Das Verhalten von JSONL, Stream-JSON oder Dual-Output in diesem PR nicht ändern.
- Datei-CRUD, MCP-Verwaltung, Speicher-CRUD oder Provider/Auth-Mutation noch nicht über die TUI verfügbar machen.
- Keine Browser/Web-Direkt-zu-Daemon-Annahmen treffen; dies ist nur terminalbasiert.

## Merge-Sicherheit

- Standardmäßig deaktiviert.
- Additiver Codepfad.
- Keine vorhandenen CLI-Flags ändern ihr Verhalten.
- Wenn der Daemon nicht verfügbar ist, schlägt der experimentelle Pfad vor dem Start der TUI fehl und teilt dem Benutzer mit, `qwen serve` auszuführen.

## Validierungsplan

- Unit-Tests für die Ereignis-zu-TUI-Zustands-Abbildung mit synthetischen Daemon-Ereignissen.
- Unit-Tests für die Weiterleitung von Prompt, Abbruch, Modellwechsel und Berechtigungsabstimmung.
- Unit-Tests für die Flag-/Umgebungsvariablen-Parsing, wenn das Feature-Flag eingebunden ist.
- Smoke-Tests gegen einen lokalen `qwen serve`:
  - Prompt-Text strömt in die TUI
  - Abbruch beendet den aktiven Prompt
  - Berechtigungsanfrage kann angenommen oder abgelehnt werden
  - Wiederverbindung sendet die verfolgte `Last-Event-ID`

## Blockaden vor der Standardmigration

- Typisiertes Daemon-Ereignisschema.
- Sitzungsspezifische Berechtigungsroute.
- Ausgabe-Sink-Refactoring für JSONL / Stream-JSON / Dual-Output-Parität.
- Sitzungslebenszyklus – Schließen/Löschen-Semantik.
- Laufzeitdiagnose für MCP, Skills, Provider und Workspace-Umgebung.
