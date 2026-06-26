# Benutzerdefinierte Channel-Plugins

Sie können das Channel-System mit benutzerdefinierten Plattform-Adaptern erweitern, die als [Erweiterungen](../../extension/introduction) verpackt sind. So können Sie Qwen Code mit jeder Messaging-Plattform, jedem Webhook oder benutzerdefinierten Transport verbinden.

## So funktioniert es

Channel-Plugins werden beim Start aus aktiven Erweiterungen geladen. Wenn `qwen channel start` ausgeführt wird, werden folgende Schritte durchgeführt:

1. Durchsucht alle aktivierten Erweiterungen nach `channels`-Einträgen in deren `qwen-extension.json`
2. Importiert dynamisch den Einstiegspunkt jedes Channels
3. Registriert den Channel-Typ, sodass er in `settings.json` referenziert werden kann
4. Erstellt Channel-Instanzen mithilfe der Factory-Funktion des Plugins

Ihr benutzerdefinierter Channel erhält automatisch die gesamte gemeinsame Pipeline: Sender-Gating, Gruppenrichtlinien, Session-Routing, Slash-Befehle, Crash-Recovery und die ACP-Brücke zum Agenten.

## Installieren eines benutzerdefinierten Channels

Installieren Sie eine Erweiterung, die ein Channel-Plugin bereitstellt:

```bash
# Von einem lokalen Pfad (für Entwicklung oder private Plugins)
qwen extensions install /pfad/zu/meiner-channel-erweiterung

# Oder verknüpfen Sie sie für die Entwicklung (Änderungen werden sofort übernommen)
qwen extensions link /pfad/zu/meiner-channel-erweiterung
```

## Konfigurieren eines benutzerdefinierten Channels

Fügen Sie einen Channel-Eintrag in `~/.qwen/settings.json` hinzu, wobei Sie den von der Erweiterung bereitgestellten benutzerdefinierten Typ verwenden:

```json
{
  "channels": {
    "my-bot": {
      "type": "my-platform",
      "apiKey": "$MY_PLATFORM_API_KEY",
      "senderPolicy": "open",
      "cwd": "/path/to/project"
    }
  }
}
```

Der `type` muss mit einem Channel-Typ übereinstimmen, der von einer installierten Erweiterung registriert wurde. Lesen Sie die Dokumentation der Erweiterung, um zu erfahren, welche pluginspezifischen Felder erforderlich sind (z. B. `apiKey`, `webhookUrl`).

Alle standardmäßigen Channel-Optionen funktionieren auch mit benutzerdefinierten Channels:

| Option         | Beschreibung                                    |
| -------------- | ---------------------------------------------- |
| `senderPolicy` | `allowlist`, `pairing` oder `open`              |
| `allowedUsers` | Statische Allowlist von Sender-IDs                 |
| `sessionScope` | `user`, `thread` oder `single`                  |
| `cwd`          | Arbeitsverzeichnis für den Agenten                |
| `instructions` | Wird der ersten Nachricht jeder Sitzung vorangestellt |
| `model`        | Modell-Überschreibung für den Channel                 |
| `groupPolicy`  | `disabled`, `allowlist` oder `open`             |
| `groups`       | Pro-Gruppe-Einstellungen                             |

Siehe [Übersicht](./overview) für Details zu jeder Option.

## Starten des Channels

```bash
# Alle Channels starten, einschließlich benutzerdefinierter
qwen channel start

# Nur Ihren benutzerdefinierten Channel starten
qwen channel start my-bot
```

## Was Sie kostenlos erhalten

Benutzerdefinierte Channels unterstützen automatisch alles, was integrierte Channels bieten:

- **Sender-Richtlinien** — Zugriffskontrolle mit `allowlist`, `pairing` und `open`
- **Gruppenrichtlinien** — Pro-Gruppe-Einstellungen mit optionalem @-Erwähnungs-Gating
- **Session-Routing** — Pro-Benutzer, Pro-Thread oder einzelne gemeinsame Sitzungen
- **DM-Pairing** — Vollständiger Pairing-Code-Ablauf für unbekannte Benutzer
- **Slash-Befehle** — `/help`, `/clear`, `/status` funktionieren sofort
- **Benutzerdefinierte Anweisungen** — Werden der ersten Nachricht jeder Sitzung vorangestellt
- **Crash-Recovery** — Automatischer Neustart mit Sitzungswiederherstellung
- **Pro-Session-Serialisierung** — Nachrichten werden zur Vermeidung von Race Conditions in die Warteschlange gestellt

## Erstellen eines eigenen Channel-Plugins

Möchten Sie ein Channel-Plugin für eine neue Plattform erstellen? Siehe [Channel Plugin Developer Guide](../../../developers/channel-plugins.md) für das `ChannelPlugin`-Interface, das `Envelope`-Format und Erweiterungspunkte.