# Feishu (Lark)

Diese Anleitung beschreibt die Einrichtung eines Qwen Code-Kanals auf Feishu (飞书) / Lark.

## Voraussetzungen

- Ein Feishu-Organisationskonto
- Eine Feishu-Anwendung mit App-ID und App-Secret (siehe unten)

## Erstellen einer Anwendung

1. Gehen Sie zur [Feishu Open Platform](https://open.feishu.cn)
2. Erstellen Sie eine neue Anwendung (oder verwenden Sie eine bestehende)

![](https://gw.alicdn.com/imgextra/i4/O1CN01ORb10i1JM0MQfhnsV_!!6000000001013-2-tps-2219-931.png)

3. Aktivieren Sie unter der Anwendung die **Bot**-Funktion (添加应用能力 → 机器人)

![](https://gw.alicdn.com/imgextra/i4/O1CN01bClpxu1FZxyH4kNjJ_!!6000000000502-2-tps-2219-931.png)

4. Wählen Sie unter **Event Subscriptions** (事件与回调) die Option **Long Connection** (使用长连接接收事件)

![](https://gw.alicdn.com/imgextra/i1/O1CN01uIwzbl1ph8Kwq7hTI_!!6000000005391-2-tps-2219-1166.png)

5. Fügen Sie das Ereignis `im.message.receive_v1` (接收消息) hinzu

![](https://gw.alicdn.com/imgextra/i2/O1CN01n7sZmV28s6WX0aDhw_!!6000000007987-2-tps-2219-1090.png)

6. Notieren Sie sich die **App-ID** (Client ID) und das **App-Secret** (Client Secret) auf der Seite mit den Anwendungsanmeldeinformationen

![](https://gw.alicdn.com/imgextra/i2/O1CN01ag1yBh1DxfEUb4xmE_!!6000000000283-2-tps-2219-1166.png)

### Erforderliche Berechtigungen

Aktivieren Sie die folgenden Berechtigungen unter **Permissions & Scopes** (权限管理):

- `im:message` — Nachrichten lesen und senden
- `im:message:send_as_bot` — Nachrichten als Bot senden
- `im:resource` — Auf Nachrichtenressourcen zugreifen (Bilder, Dateien)

### Anwendung veröffentlichen

Nachdem Sie Berechtigungen und Ereignisse konfiguriert haben, erstellen Sie eine Version und veröffentlichen Sie sie. Der Bot funktioniert erst, wenn die Anwendung veröffentlicht und genehmigt wurde.

![](https://gw.alicdn.com/imgextra/i1/O1CN01GbNRcj1lVuACnkV6M_!!6000000004825-2-tps-2219-1090.png)

## Konfiguration

Fügen Sie den Kanal zu `~/.qwen/settings.json` hinzu:

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

| Option                 | Beschreibung                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| `clientId`             | Feishu App-ID                                                        |
| `clientSecret`         | Feishu App-Secret                                                    |
| `collapsible`          | Lange Antworten in aufklappbare Abschnitte zusammenfassen (Standard: `false`) |
| `collapsibleThreshold` | Zeichenschwelle für das Zusammenfassen (Standard: `500`)             |
| `webhookPort`          | Falls gesetzt, wird der HTTP-Webhook-Modus anstelle von WebSocket verwendet |
| `verificationToken`    | Verifikationstoken für den Webhook-Modus                             |
| `encryptKey`           | Verschlüsselungsschlüssel für den Webhook-Modus                      |

## Ausführen

```bash
# Start only the Feishu channel
qwen channel start my-feishu

# Or start all configured channels together
qwen channel start
```

Öffnen Sie Feishu und senden Sie dem Bot eine Nachricht. Sie sollten eine interaktive Streaming-Karte mit der Antwort sehen.

## Verbindungsmodi

### WebSocket (Standard)

Der WebSocket-Modus verwendet eine ausgehende Langzeitverbindung – es wird keine öffentliche URL oder kein Server benötigt. Dies ist der empfohlene Modus für die meisten Bereitstellungen.

### Webhook

Wenn Sie den Webhook-Modus benötigen (z.B. für gemeinsame Anwendungen), setzen Sie `webhookPort` in Ihrer Konfiguration:

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

Feishu-Bots funktionieren sowohl in Direktnachrichten als auch in Gruppenchats. Um die Gruppenunterstützung zu aktivieren:

1. Setzen Sie `groupPolicy` in Ihrer Kanalkonfiguration auf `"allowlist"` oder `"open"`
2. Fügen Sie den Bot zu einer Feishu-Gruppe hinzu
3. Erwähnen Sie den Bot mit @ in der Gruppe, um eine Antwort auszulösen

Standardmäßig erfordert der Bot eine @-Erwähnung in Gruppenchats (`requireMention: true`). Setzen Sie `"requireMention": false` für eine bestimmte Gruppe, damit er auf alle Nachrichten antwortet.

## Funktionen

### Interaktives Karten-Streaming

Antworten werden als interaktive Feishu-Karten mit Echtzeit-Streaming-Updates dargestellt. Die Karte zeigt einen „Generieren“-Indikator, während die Antwort erstellt wird, und einen **Stopp**-Button, um die Generierung abzubrechen.

### Zitat/Antwort-Kontext

Wenn Sie auf eine Nachricht antworten (zitieren), wird der zitierte Inhalt automatisch als Kontext für den Agenten einbezogen. Dies funktioniert für:

- Text- und Rich-Text-Nachrichten
- Interaktive Karten (vorherige Antworten des Bots)

### Bilder und Dateien

Sie können Fotos und Dokumente an den Bot senden:

- **Bilder:** Werden mit multimodalen Bildanalysefunktionen analysiert
- **Dateien:** Werden heruntergeladen und lokal gespeichert, damit der Agent sie lesen kann

### Gleichzeitige Nachrichten

Mehrere Benutzer können gleichzeitig Nachrichten im selben Gruppenchat senden. Jede Nachricht erhält ihre eigene unabhängige Karte und Antwort – sie stören sich nicht gegenseitig.
## Wesentliche Unterschiede zu DingTalk

- **Antwortformat:** Verwendet Feishu interaktive Karten (v2-Schema) mit nativer Markdown-Wiedergabe, einschließlich Tabellen
- **Streaming:** Karteninhalte werden direkt aktualisiert, mit gedrosselten PATCH-Anfragen (1,5-Sekunden-Intervall)
- **Verbindung:** WebSocket über `@larksuiteoapi/node-sdk` — gleiches reines Outbound-Modell, keine öffentliche URL erforderlich
- **Arbeitsanzeige:** Während der Verarbeitung wird eine „OnIt“-Emoji-Reaktion hinzugefügt
- **Zitatkontext:** Unterstützt das Zitieren von Textnachrichten und interaktiven Karten

## Fehlerbehebung

### Bot stellt keine Verbindung her

- Überprüfen Sie, ob Ihre App-ID und Ihr App-Secret korrekt sind
- Stellen Sie sicher, dass in den Ereignisabonnements **Long Connection** ausgewählt ist
- Überprüfen Sie, ob das Ereignis `im.message.receive_v1` abonniert ist
- Überprüfen Sie die Terminalausgabe auf Verbindungsfehler

### Bot antwortet nicht in Gruppen

- Überprüfen Sie, ob `groupPolicy` auf `"allowlist"` oder `"open"` gesetzt ist (Standard ist `"disabled"`)
- Stellen Sie sicher, dass Sie den Bot in der Gruppennachricht @erwähnen
- Überprüfen Sie, ob der Bot zur Gruppe hinzugefügt wurde

### Karte bleibt im Status „generating“

- Dies deutet normalerweise darauf hin, dass die Antwort abgeschlossen wurde, aber die endgültige Kartenaktualisierung fehlgeschlagen ist
- Überprüfen Sie die Terminalprotokolle auf API-Fehler (Ratenbegrenzung, Kartengrößenbeschränkungen)
- Sehr lange Antworten mit vielen Tabellen können die Grenzen der Kartenelemente von Feishu überschreiten

### Zitat enthält keinen Karteninhalt

- Der Bot liest Karteninhalte über den API-Parameter `card_msg_content_type=user_card_content`
- Stellen Sie sicher, dass der Bot die Berechtigung `im:message` zum Lesen von Nachrichten hat
