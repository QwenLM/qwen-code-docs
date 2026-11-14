# DingTalk-Webhook-Versand

Verwende einen benutzerdefinierten DingTalk-Roboter, um Benachrichtigungen und Aufgabenergebnisse in dessen Gruppe zu posten.
Dieser Versandmodus erfordert keinen Anwendungsbot, keine lange Verbindung,
keinen öffentlichen Callback-Server und keine Conversation-ID. Für Konversationen mit einem Agent
verwende stattdessen den [DingTalk-Anwendungsbot](./dingtalk).

## Roboter erstellen

1. Füge einen benutzerdefinierten Roboter in der Ziel-DingTalk-Gruppe hinzu.
2. Kopiere dessen Webhook-URL, beginnend mit
   `https://oapi.dingtalk.com/robot/send?access_token=...`.
3. Konfiguriere die Sicherheitseinstellungen des Roboters. Wenn Signing aktiviert ist, kopiere zusätzlich dessen
   Signing-Secret. Schlüsselwort- und IP-Einschränkungen gelten weiterhin für jede Nachricht.

Die Webhook-URL enthält Anmeldedaten. Speichere sie als Secret oder
Umgebungsreferenz, nicht im Prompt oder Delivery-Ziel einer geplanten Aufgabe.

## Channel konfigurieren

Füge eine benannte Instanz zu den Channel-Einstellungen des Workspace hinzu:

```json
{
  "channels": {
    "team-notices": {
      "type": "dingtalk-webhook",
      "webhookUrl": "$DINGTALK_WEBHOOK_URL",
      "signingSecret": "$DINGTALK_WEBHOOK_SECRET"
    }
  }
}
```

Setze die referenzierten Variablen in der Umgebung, die zum Starten von Qwen Code verwendet wird. Lasse
`signingSecret` weg, wenn der Roboter kein Signing erfordert. Dieses Secret ist das
Signing-Secret des benutzerdefinierten Roboters, nicht das Client Secret einer Anwendung.

Starte den Daemon in diesem Workspace:

```bash
qwen serve --channel team-notices
```

Eine benannte Instanz repräsentiert eine konfigurierte Gruppe. Erstelle zusätzliche Instanzen
für andere Gruppen. Das Ändern der URL einer Instanz ändert das Ziel für zukünftige
Deliveries, die sie referenzieren.

## Web Shell verwenden

Wähle in Channels DingTalk und dessen Webhook-Versandmethode. Speichere die Webhook-
URL und das optionale Signing-Secret, und starte dann den Channel. Empfangs-, Pairing- und
Agent-Session-Einstellungen gelten nicht für diese Methode.

Ein Ready/Connected-Status bedeutet, dass lokale Versandressourcen bereit sind;
er verifiziert keine Remote-Anmeldedaten.

Wähle in Scheduled Tasks eine persistente Aufgabe und wähle diesen Channel als
Delivery-Ziel. Web Shell füllt das konfigurierte Ziel automatisch aus;
keine beobachteten Kontakte oder manuelle Benutzer-/Chat-ID werden benötigt. Bestehende pro-Run-Delivery-
Einschränkungen bleiben in Kraft.

Dieselben Steuerungen sind in der gemeinsamen Web Shell verfügbar, die von
`WebShellWithProviders` verwendet wird, wenn der Host Channels und Scheduled Tasks aktiviert und
einen gewöhnlichen Daemon-Workspace bereitstellt.

## Explizite API-Delivery

Notify und explizite Prompt-/Scheduled-Delivery verwenden das bestehende Channel-Ziel-
Format. Dieser Adapter definiert `chat/default` als sein einziges logisches Ziel:

```json
{
  "text": "The daily report is ready.",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "team-notices",
      "type": "chat",
      "id": "default"
    }
  }
}
```

Dies ist ein Workspace-Notify-Request-Body. `default` ist ein Adapter-eigener Alias,
keine DingTalk-Conversation-ID. Andere IDs und Benutzerziele werden abgelehnt; der
Adapter ignoriert niemals ein beliebiges angefordertes Ziel. Die Webhook-URL und
das Signing-Secret bleiben in der Channel-Konfiguration.

## Delivery-Verhalten

- Sendet Nachrichten als Markdown, mit einem kurzen Titel, abgeleitet aus der ersten Zeile.
  Gewöhnlicher Text wird ebenfalls akzeptiert. Der Adapter bewahrt das mitgelieferte Markdown,
  einschließlich Tabellensyntax; das Rendering übernimmt der DingTalk-Client.
- Er empfängt keine Nachrichten, führt keine eingehenden Webhook-Aufgaben aus und ermöglicht keine Channel-Loops.
- Prüft sowohl HTTP-Status als auch DingTalks Business-Response. Abgewiesene Signaturen,
  Anmeldedaten, Sicherheitsregeln und Rate-Limits sind Fehler mit bereinigten Fehlermeldungen.
- Kein automatischer Retry. Ein Timeout kann dazu führen, dass die Remote-Annahme unbekannt bleibt.
- Verwendet die Workspace-Proxy-Konfiguration, einschließlich `NO_PROXY`-Ausnahmen.
- Bricht laufende Sendevorgänge ab, wenn der Channel stoppt. Neuladen verwendet die aktualisierte
  gespeicherte Konfiguration.
- Behält den gemeinsamen Delivery-Größenschutz bei, der gekürzte Ergebnisse markiert.
  Die erste Version sendet dieses Ergebnis als eine Nachricht und lässt DingTalk
  übergroße Inhalte ablehnen. Die Ablehnung wird als Delivery-Fehler gemeldet; der Adapter
  sendet keine gekürzte Kopie, teilt keine Nachrichten auf und versucht es nicht erneut. DingTalks genaues
  Markdown-Größenlimit und dessen Einheit wurden nicht verifiziert, daher garantiert das Bestehen der gemeinsamen
  Größenprüfung keine Delivery. Halte geplante Reports knapp.
- Scheduled-Delivery behält sein bestehendes Best-Effort-Successful-Final-Result-
  Verhalten. Dies führt keine Fehler-/Abbruch-Benachrichtigungen, eine persistente Retry-
  Queue, Anhänge oder einen generischen Webhook-Payload-Vertrag ein.

Siehe DingTalks [Sending-API](https://open.dingtalk.com/document/orgapp/custom-robots-send-group-messages),
[Nachrichtentypen](https://open.dingtalk.com/document/orgapp/custom-bot-send-message-type),
und [Sicherheitseinstellungen](https://open.dingtalk.com/document/orgapp/customize-robot-security-settings)
für Plattformanforderungen.