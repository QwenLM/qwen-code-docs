# Benutzerdefinierte Channel-Plugins

Du kannst das Channel-System um benutzerdefinierte Plattform-Adapter erweitern, die als [Extensions](../../extension/introduction) verpackt sind. Dadurch kannst du Qwen Code mit jeder Messaging-Plattform, jedem Webhook oder benutzerdefinierten Transport verbinden.

## Funktionsweise

Channel-Plugins werden beim Start aus aktiven Extensions geladen. Wenn `qwen channel start` ausgeführt wird, passiert Folgendes:

1. Es scannt alle aktivierten Extensions nach `channels`-Einträgen in deren `qwen-extension.json`
2. Es importiert den Einstiegspunkt jedes Channels dynamisch
3. Es registriert den Channel-Typ, sodass er in `settings.json` referenziert werden kann
4. Es erstellt Channel-Instanzen mithilfe der Factory-Funktion des Plugins

Dein benutzerdefiniertes Channel-Plugin erhält die vollständige gemeinsame Pipeline kostenlos dazu: Sender-Gating, Gruppenrichtlinien, Session-Routing, Slash-Befehle, Crash-Recovery und die ACP-Brücke zum Agent.

## Installation eines benutzerdefinierten Channels

Installiere eine Extension, die ein Channel-Plugin bereitstellt:

```bash
# Aus einem lokalen Pfad (für Entwicklung oder private Plugins)
qwen extensions install /path/to/my-channel-extension

# Oder für die Entwicklung verlinken (Änderungen werden sofort übernommen)
qwen extensions link /path/to/my-channel-extension
```

## Konfiguration eines benutzerdefinierten Channels

Füge einen Channel-Eintrag zu `~/.qwen/settings.json` hinzu und verwende dabei den von der Extension bereitgestellten benutzerdefinierten Typ:

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

Der `type` muss mit einem von einer installierten Extension registrierten Channel-Typ übereinstimmen. In der Dokumentation der Extension findest du, welche plugin-spezifischen Felder erforderlich sind (z. B. `apiKey`, `webhookUrl`).

Alle Standard-Channel-Optionen funktionieren auch mit benutzerdefinierten Channels:

| Option         | Beschreibung                                   |
| -------------- | ---------------------------------------------- |
| `senderPolicy` | `allowlist`, `pairing` oder `open`             |
| `allowedUsers` | Statische Allowlist von Sender-IDs             |
| `sessionScope` | `user`, `thread` oder `single`                 |
| `cwd`          | Arbeitsverzeichnis für den Agent               |
| `instructions` | Wird der ersten Nachricht jeder Session vorangestellt |
| `model`        | Modell-Override für den Channel                |
| `groupPolicy`  | `disabled`, `allowlist` oder `open`            |
| `groups`       | Einstellungen pro Gruppe                       |

Details zu den einzelnen Optionen findest du in der [Übersicht](./overview).

## Starten des Channels

```bash
# Startet alle Channels, einschließlich benutzerdefinierter
qwen channel start

# Startet nur deinen benutzerdefinierten Channel
qwen channel start my-bot
```

## Standardmäßig enthaltene Funktionen

Benutzerdefinierte Channels unterstützen automatisch alle Funktionen, die auch die integrierten Channels bieten:

- **Sender-Richtlinien** — Zugriffskontrolle mit `allowlist`, `pairing` und `open`
- **Gruppenrichtlinien** — Einstellungen pro Gruppe mit optionalem @mention-Gating
- **Session-Routing** – Sessions pro Benutzer, pro Thread oder eine einzige gemeinsame Session
- **DM-Pairing** – Vollständiger Pairing-Code-Flow für unbekannte Benutzer
- **Slash-Befehle** – `/help`, `/clear`, `/status` funktionieren out of the box
- **Benutzerdefinierte Anweisungen** – Werden der ersten Nachricht jeder Session vorangestellt
- **Crash-Recovery** – Automatischer Neustart mit Session-Erhalt
- **Serialisierung pro Session** – Nachrichten werden in eine Warteschlange gestellt, um Race Conditions zu vermeiden

## Erstellen eines eigenen Channel-Plugins

Möchtest du ein Channel-Plugin für eine neue Plattform entwickeln? Im [Channel Plugin Developer Guide](/developers/channel-plugins) findest du Informationen zum `ChannelPlugin`-Interface, zum `Envelope`-Format und zu den Extension Points.