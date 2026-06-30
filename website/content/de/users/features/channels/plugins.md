# Benutzerdefinierte Channel-Plugins

Du kannst das Channel-System um benutzerdefinierte Plattform-Adapter erweitern, die als [Extensions](../../extension/introduction) verpackt sind. So kannst du Qwen Code mit jeder Messaging-Plattform, jedem Webhook oder einem benutzerdefinierten Transport verbinden.

## So funktioniert es

Channel-Plugins werden beim Start aus den aktiven Extensions geladen. Wenn `qwen channel start` ausgeführt wird, passiert Folgendes:

1. Durchsucht alle aktivierten Extensions nach `channels`-Einträgen in deren `qwen-extension.json`
2. Importiert dynamisch den Einstiegspunkt jedes Channels
3. Registriert den Channel-Typ, damit er in `settings.json` referenziert werden kann
4. Erstellt Channel-Instanzen mithilfe der Factory-Funktion des Plugins

Dein benutzerdefinierter Channel erhält die komplette gemeinsame Pipeline ohne zusätzlichen Aufwand: Sender-Gating, Group Policies, Session-Routing, Slash Commands, Crash-Recovery und eine Agent-Bridge. Der eigenständige `qwen channel start` stellt derzeit `AcpBridge` bereit; der Plugin-Adapter-Code sollte auf dem für Adapter gedachten `ChannelAgentBridge`-Contract basieren. Bestehende TypeScript-Plugins mit einem expliziten `AcpBridge`-Bridge-Parameter sollten diese Annotation auf `ChannelAgentBridge` migrieren. JavaScript-Plugins sind zur Laufzeit nicht betroffen.

## Installation eines benutzerdefinierten Channels

Installiere eine Extension, die ein Channel-Plugin bereitstellt:

```bash
# Von einem lokalen Pfad (für Entwicklung oder private Plugins)
qwen extensions install /path/to/my-channel-extension

# Oder für die Entwicklung verlinken (Änderungen werden sofort übernommen)
qwen extensions link /path/to/my-channel-extension
```

## Konfiguration eines benutzerdefinierten Channels

Füge einen Channel-Eintrag zu `~/.qwen/settings.json` hinzu, wobei du den von der Extension bereitgestellten benutzerdefinierten Typ verwendest:

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

Der `type` muss mit einem Channel-Typ übereinstimmen, der von einer installierten Extension registriert wurde. In der Dokumentation der Extension findest du Informationen darüber, welche pluginspezifischen Felder erforderlich sind (z. B. `apiKey`, `webhookUrl`).

Alle Standard-Channel-Optionen funktionieren auch mit benutzerdefinierten Channels:

| Option         | Beschreibung                                   |
| -------------- | ---------------------------------------------- |
| `senderPolicy` | `allowlist`, `pairing` oder `open`             |
| `allowedUsers` | Statische Allowlist der Sender-IDs             |
| `sessionScope` | `user`, `thread` oder `single`                 |
| `cwd`          | Arbeitsverzeichnis für den Agenten             |
| `instructions` | Wird der ersten Nachricht jeder Session vorangestellt |
| `model`        | Model-Override für den Channel                 |
| `groupPolicy`  | `disabled`, `allowlist` oder `open`            |
| `groups`       | Einstellungen pro Gruppe                       |

Details zu den einzelnen Optionen findest du in der [Übersicht](./overview).

## Starten des Channels

```bash
# Alle Channels einschließlich benutzerdefinierter Channels starten
qwen channel start

# Nur den eigenen benutzerdefinierten Channel starten
qwen channel start my-bot
```

## Automatisch enthaltene Funktionen

Benutzerdefinierte Channels unterstützen automatisch alles, was auch integrierte Channels können:

- **Sender Policies** — Zugriffskontrolle via `allowlist`, `pairing` und `open`
- **Group Policies** — Einstellungen pro Gruppe mit optionalem @mention-Gating
- **Session-Routing** — Sessions pro Benutzer, pro Thread oder eine einzige gemeinsame Session
- **DM-Pairing** — Vollständiger Pairing-Code-Flow für unbekannte Benutzer
- **Slash Commands** — `/help`, `/clear`, `/status` funktionieren out of the box
- **Custom Instructions** — Werden der ersten Nachricht in jeder Session vorangestellt
- **Crash-Recovery** — Automatischer Neustart unter Beibehaltung der Session
- **Serialisierung pro Session** — Nachrichten werden in eine Warteschlange gestellt, um Race Conditions zu vermeiden

## Ein eigenes Channel-Plugin erstellen

Du möchtest ein Channel-Plugin für eine neue Plattform entwickeln? Im [Channel Plugin Developer Guide](../../../developers/channel-plugins.md) findest du Informationen zum `ChannelPlugin`-Interface, zum `Envelope`-Format und zu den Extension Points.