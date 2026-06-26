# Benutzerdefinierte Channel-Plugins

Sie können das Channel-System mit benutzerdefinierten Plattform-Adaptern erweitern, die als [Erweiterungen](../../extension/introduction) verpackt sind. So können Sie Qwen Code mit jeder Messaging-Plattform, jedem Webhook oder benutzerdefinierten Transport verbinden.

## Funktionsweise

Channel-Plugins werden beim Start aus aktiven Erweiterungen geladen. Wenn `qwen channel start` ausgeführt wird, durchläuft es:

1. Alle aktivierten Erweiterungen auf Einträge vom Typ `channels` in deren `qwen-extension.json` scannen
2. Den Einstiegspunkt jedes Channels dynamisch importieren
3. Den Channel-Typ registrieren, sodass er in `settings.json` referenziert werden kann
4. Channel-Instanzen mithilfe der Factory-Funktion des Plugins erstellen

Ihr benutzerdefinierter Channel erhält automatisch die gesamte gemeinsame Pipeline: Sender-Gating, Gruppenrichtlinien, Sitzungs-Routing, Slash-Befehle, Crash-Wiederherstellung und die ACP-Brücke zum Agenten.

## Installieren eines benutzerdefinierten Channels

Installieren Sie eine Erweiterung, die ein Channel-Plugin bereitstellt:

```bash
# Über einen lokalen Pfad (für Entwicklung oder private Plugins)
qwen extensions install /pfad/zu/meiner-channel-erweiterung

# Oder verlinken Sie sie für die Entwicklung (Änderungen werden sofort übernommen)
qwen extensions link /pfad/zu/meiner-channel-erweiterung
```

## Konfigurieren eines benutzerdefinierten Channels

Fügen Sie in `~/.qwen/settings.json` einen Channel-Eintrag mit dem von der Erweiterung bereitgestellten benutzerdefinierten Typ hinzu:

```json
{
  "channels": {
    "my-bot": {
      "type": "my-platform",
      "apiKey": "$MY_PLATFORM_API_KEY",
      "senderPolicy": "open",
      "cwd": "/pfad/zu/projekt"
    }
  }
}
```

Der `type` muss mit einem Channel-Typ übereinstimmen, der von einer installierten Erweiterung registriert wurde. Überprüfen Sie die Dokumentation der Erweiterung, welche plugin-spezifischen Felder erforderlich sind (z.B. `apiKey`, `webhookUrl`).

Alle Standard-Channel-Optionen funktionieren auch mit benutzerdefinierten Channels:

| Option         | Beschreibung                                    |
| -------------- | ----------------------------------------------- |
| `senderPolicy` | `allowlist`, `pairing` oder `open`              |
| `allowedUsers` | Statische Allowlist von Sender-IDs              |
| `sessionScope` | `user`, `thread` oder `single`                  |
| `cwd`          | Arbeitsverzeichnis für den Agenten              |
| `instructions` | Vor die erste Nachricht jeder Sitzung gestellt  |
| `model`        | Modell-Überschreibung für den Channel           |
| `groupPolicy`  | `disabled`, `allowlist` oder `open`             |
| `groups`       | Pro-Gruppen-Einstellungen                       |

Details zu jeder Option finden Sie in der [Übersicht](./overview).

## Starten des Channels

```bash
# Alle Channels starten, einschließlich benutzerdefinierter
qwen channel start

# Nur Ihren benutzerdefinierten Channel starten
qwen channel start my-bot
```

## Was Sie automatisch erhalten

Benutzerdefinierte Channels unterstützen automatisch alles, was die integrierten Channels bieten:

- **Sender-Richtlinien** — Zugriffskontrolle per `allowlist`, `pairing` und `open`
- **Gruppen-Richtlinien** — Pro-Gruppen-Einstellungen mit optionalem @-Erwähnungs-Gating
- **Sitzungs-Routing** — Einzelsitzungen pro Benutzer, Thread oder gemeinsam genutzt
- **DM-Pairing** — Vollständiger Pairing-Code-Ablauf für unbekannte Benutzer
- **Slash-Befehle** — `/help`, `/clear`, `/status` funktionieren sofort
- **Benutzerdefinierte Anweisungen** — Werden der ersten Nachricht jeder Sitzung vorangestellt
- **Crash-Wiederherstellung** — Automatischer Neustart mit Beibehaltung der Sitzung
- **Pro-Sitzungs-Serialisierung** — Nachrichten werden zur Vermeidung von Wettlaufsituationen in die Warteschlange gestellt

## Erstellen Ihres eigenen Channel-Plugins

Möchten Sie ein Channel-Plugin für eine neue Plattform erstellen? Lesen Sie den [Channel Plugin Developer Guide](../../../developers/channel-plugins.md) für das `ChannelPlugin`-Interface, das `Envelope`-Format und Erweiterungspunkte.
