# Feishu (Lark)

Diese Anleitung beschreibt die Einrichtung eines Qwen Code-Kanals auf Feishu (飞书) / Lark.

## Voraussetzungen

- Ein Feishu-Organisationskonto
- Eine Feishu-Anwendung mit App-ID und App-Secret (siehe unten)

## Erstellen einer Anwendung

1. Öffnen Sie die [Feishu Open Platform](https://open.feishu.cn)
2. Erstellen Sie eine neue Anwendung (oder verwenden Sie eine vorhandene)

![](https://gw.alicdn.com/imgextra/i4/O1CN01ORb10i1JM0MQfhnsV_!!6000000001013-2-tps-2219-931.png)

3. Aktivieren Sie in der Anwendung die **Bot**-Funktion (添加应用能力 → 机器人)

![](https://gw.alicdn.com/imgextra/i4/O1CN01bClpxu1FZxyH4kNjJ_!!6000000000502-2-tps-2219-931.png)

4. Wählen Sie unter **Event Subscriptions** (事件与回调) die Option **Long Connection** (使用长连接接收事件)

![](https://gw.alicdn.com/imgextra/i1/O1CN01uIwzbl1ph8Kwq7hTI_!!6000000005391-2-tps-2219-1166.png)

5. Fügen Sie das Ereignis `im.message.receive_v1` (接收消息) hinzu

![](https://gw.alicdn.com/imgextra/i2/O1CN01n7sZmV28s6WX0aDhw_!!6000000007987-2-tps-2219-1090.png)

6. Notieren Sie sich die **App-ID** (Client ID) und das **App-Secret** (Client Secret) auf der Seite mit den Anwendungsdaten

![](https://gw.alicdn.com/imgextra/i2/O1CN01ag1yBh1DxfEUb4xmE_!!6000000000283-2-tps-2219-1166.png)

### Erforderliche Berechtigungen

Aktivieren Sie die folgenden Berechtigungen unter **Permissions & Scopes** (权限管理):

- `im:message` – Nachrichten lesen und senden
- `im:message:send_as_bot` – Nachrichten als Bot senden
- `im:resource` – Auf Nachrichtenressourcen zugreifen (Bilder, Dateien)

### Veröffentlichen der Anwendung

Nachdem Sie Berechtigungen und Ereignisse konfiguriert haben, erstellen Sie eine Version und veröffentlichen Sie die Anwendung. Der Bot funktioniert erst, wenn die Anwendung veröffentlicht und genehmigt wurde.

![](https://gw.alicdn.com/imgextra/i1/O1CN01GbNRcj1lVuACnkV6M_!!6000000004825-2-tps-2219-1090.png)

## Konfiguration

Fügen Sie den Kanal in `~/.qwen/settings.json` hinzu:

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "clientId": "<your-app-id>",
      "clientSecret": "<your-app-secret>",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "collapsible": true,
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Konfigurationsoptionen

| Option                 | Beschreibung                                                                   |
| ---------------------- | ------------------------------------------------------------------------------ |
| `clientId`             | Feishu App-ID                                                                  |
| `clientSecret`         | Feishu App-Secret                                                              |
| `collapsible`          | Lange Antworten in einklappbare Abschnitte zusammenfassen (Standard: `false`)  |
| `collapsibleThreshold` | Zeichenschwelle für das Einklappen (Standard: `500`)                           |
| `webhookPort`          | Wenn gesetzt, wird HTTP-Webhook-Modus anstelle von WebSocket verwendet         |
| `verificationToken`    | Verifikationstoken für den Webhook-Modus                                       |
| `encryptKey`           | Verschlüsselungsschlüssel für den Webhook-Modus                                |

## Ausführen

```bash
# Nur den Feishu-Kanal starten
qwen channel start my-feishu

# Oder alle konfigurierten Kanäle gleichzeitig starten
qwen channel start
```

Öffnen Sie Feishu und senden Sie eine Nachricht an den Bot. Sie sollten eine interaktive Streaming-Karte mit der Antwort sehen.

## Verbindungsmodi

### WebSocket (Standard)

Der WebSocket-Modus verwendet eine ausgehende Langzeitverbindung – es wird keine öffentliche URL oder Server benötigt. Dies ist der empfohlene Modus für die meisten Installationen.

### Webhook

Wenn Sie den Webhook-Modus benötigen (z. B. für gemeinsam genutzte Anwendungen), setzen Sie `webhookPort` in Ihrer Konfiguration:

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "webhookPort": 9321,
      "verificationToken": "<from-feishu-console>",
      "encryptKey": "<from-feishu-console>"
    }
  }
}
```

Setzen Sie dann die Request-URL in der Feishu Open Platform auf `http://<your-server>:9321`.

## Gruppenchats

Feishu-Bots funktionieren sowohl in Direktnachrichten als auch in Gruppenkonversationen. Um Gruppenunterstützung zu aktivieren:

1. Setzen Sie `groupPolicy` auf `"allowlist"` oder `"open"` in Ihrer Kanalkonfiguration
2. Fügen Sie den Bot zu einer Feishu-Gruppe hinzu
3. Erwähnen Sie den Bot in der Gruppe mit @, um eine Antwort auszulösen

Standardmäßig erfordert der Bot eine @-Erwähnung in Gruppenchats (`requireMention: true`). Setzen Sie `"requireMention": false` für eine bestimmte Gruppe, damit der Bot auf alle Nachrichten antwortet.

## Funktionen

### Interaktives Card-Streaming

Antworten werden als interaktive Feishu-Karten mit Echtzeit-Streaming-Updates dargestellt. Die Karte zeigt einen „Generiere“-Indikator, während die Antwort erstellt wird, und einen **Stop**-Button, um die Generierung abzubrechen.

### Zitat-/Antwort-Kontext

Wenn Sie auf eine Nachricht antworten (sie zitieren), wird der zitierte Inhalt automatisch als Kontext für den Agenten eingefügt. Dies funktioniert für:

- Text- und Rich-Text-Nachrichten
- Interaktive Karten (frühere Antworten des Bots)

### Bilder und Dateien

Sie können dem Bot Fotos und Dokumente senden:

- **Bilder:** Analyse mittels multimodaler Bilderkennung
- **Dateien:** Heruntergeladen und lokal gespeichert, damit der Agent sie lesen kann

### Gleichzeitige Nachrichten

Mehrere Benutzer können gleichzeitig Nachrichten in derselben Gruppe senden. Jede Nachricht erhält eine eigene unabhängige Karte und Antwort – sie stören sich nicht gegenseitig.

## Wesentliche Unterschiede zu DingTalk

- **Antwortformat:** Verwendet interaktive Feishu-Karten (v2-Schema) mit nativer Markdown-Darstellung, inklusive Tabellen
- **Streaming:** Karteninhalte werden direkt aktualisiert mittels gedrosselter PATCH-Anfragen (1,5 s Intervall)
- **Verbindung:** WebSocket über `@larksuiteoapi/node-sdk` – gleiches reines Outbound-Modell, keine öffentliche URL erforderlich
- **Arbeitsanzeige:** Ein „OnIt“-Emoji wird als Reaktion hinzugefügt, während die Verarbeitung läuft
- **Zitatkontext:** Unterstützt das Zitieren sowohl von Textnachrichten als auch von interaktiven Karten

## Fehlerbehebung

### Bot verbindet sich nicht

- Überprüfen Sie, ob App-ID und App-Secret korrekt sind
- Stellen Sie sicher, dass unter „Event Subscriptions“ die Option **Long Connection** ausgewählt ist
- Prüfen Sie, ob das Ereignis `im.message.receive_v1` abonniert ist
- Überprüfen Sie die Terminalausgabe auf Verbindungsfehler

### Bot antwortet nicht in Gruppen

- Stellen Sie sicher, dass `groupPolicy` auf `"allowlist"` oder `"open"` gesetzt ist (Standard ist `"disabled"`)
- Achten Sie darauf, den Bot in der Gruppennachricht mit @ zu erwähnen
- Vergewissern Sie sich, dass der Bot zur Gruppe hinzugefügt wurde

### Karte bleibt im Status „Generiere“

- Dies deutet normalerweise darauf hin, dass die Antwort abgeschlossen wurde, aber die letzte Kartenaktualisierung fehlgeschlagen ist
- Überprüfen Sie die Terminal-Logs auf API-Fehler (Ratenbegrenzung, Kartengrößenlimits)
- Sehr lange Antworten mit vielen Tabellen könnten die Elementlimits von Feishu-Karten überschreiten

### Zitat enthält keinen Karteninhalt

- Der Bot liest Karteninhalte über den API-Parameter `card_msg_content_type=user_card_content`
- Stellen Sie sicher, dass der Bot die Berechtigung `im:message` hat, um Nachrichten zu lesen