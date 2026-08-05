# DingTalk-Webhook-Direktchat-Zustellungsdesign

## Status

Implementiert und mit Verifikation der echten Direktchat-Kette abgeschlossen. Zugehöriges Issue:
[QwenLM/qwen-code#6883](https://github.com/QwenLM/qwen-code/issues/6883).

## Hintergrund

Vom Daemon gehostete Channels können authentifizierte externe Webhook-Events empfangen, den Agent als unbeaufsichtigte Aufgabe ausführen und das Endergebnis proaktiv an vorkonfigurierte Chat-Ziele zustellen. Derzeit unterstützt DingTalk nur die Zustellung an Gruppenchats: Das Ziel muss `isGroup: true` gesetzt haben, und der Adapter sendet Markdown über die Gruppennachrichten-API.

Dadurch können Webhook-Quellen wie CI-Systeme oder Monitoring-Alarme einen verantwortlichen DingTalk-Benutzer nicht direkt benachrichtigen, sondern nur an Gruppenchats zustellen.

## Ziele

- Daemon-Webhook-Aufgabenergebnisse an DingTalk-Direktchat-Ziele zustellen.
- Das bestehende DingTalk-Gruppenchat-Webhook-Zustellverhalten unverändert lassen.
- Gewöhnliche proaktive Zustellung und Channel-Loop weiterhin nur DingTalk-Gruppenchat-Ziele akzeptieren lassen und die Konversations-Id eines eingehenden Direktchats nicht als Benutzer-Id verwenden.
- Die bestehende Zielkonfigurationsstruktur, Token-Cache, Markdown-Formatierung, Nachrichten-Segmentierung, Retries und Zustellfehlerbehandlung wiederverwenden.
- Den bestehenden DingTalk-Channel weiterverwenden, ohne neue Channels oder Konfigurationsfelder hinzuzufügen.

## Nicht-Ziele

- Native DingTalk-Cards oder Card-Callbacks.
- Card-Streaming-Updates, Buttons, Feedback oder das Abbrechen von Aufgaben aus DingTalk.
- Mehrere Empfänger für eine einzelne Zielkonfiguration.
- DingTalk-Themen-Zustellung.
- Neue Channel-Typen oder Änderungen am Daemon-Webhook-Protokoll.

## Zielkonfiguration

Es sind keine neuen Konfigurationsfelder erforderlich. Die Bedeutungen der bestehenden Webhook-Zielfelder im DingTalk-Channel sind wie folgt:

| `isGroup` | Bedeutung von `chatId`        | Zustell-API                   |
| --------- | ----------------------------- | ----------------------------- |
| `true`    | DingTalk-Gruppenchat-`openConversationId` | `robot/groupMessages/send`    |
| `false`   | DingTalk-Benutzer-Id          | `robot/oToMessages/batchSend` |

`senderId` bleibt die virtuelle Identität, die zum Routen der Webhook-Aufgabe auf eine Agent-Session verwendet wird, nicht die DingTalk-Empfänger-Id.

Konfigurationsbeispiel:

```json
{
  "webhooks": {
    "sources": {
      "github-ci": {
        "secretEnv": "QWEN_CHANNEL_GITHUB_CI_SECRET",
        "targets": {
          "operator": {
            "chatId": "DINGTALK_USER_ID",
            "senderId": "webhook:github-ci",
            "isGroup": false
          },
          "team": {
            "chatId": "OPEN_CONVERSATION_ID",
            "senderId": "webhook:github-ci",
            "isGroup": true
          }
        }
      }
    }
  }
}
```

Ziele müssen `isGroup` explizit setzen. Die folgenden Ziele werden weiterhin vom Adapter abgelehnt: `chatId` leer, `threadId` gesetzt, fehlendes `isGroup` oder die Verwendung einer Webhook-URL anstelle einer stabilen Ziel-Id.

## Zustellkette

Daemon-Routing und Worker-IPC bleiben unverändert; die geteilte Channel-Runtime erhält nur einen Webhook-spezifischen Ziel-Check:

```text
POST /channels/:channelName/webhooks/:source
  -> daemon 对事件进行鉴权和校验
  -> channel worker 运行无人值守 agent 任务
  -> ChannelBase 调用 DingtalkChannel.pushProactive()
  -> adapter 根据 target.isGroup 选择钉钉 API
  -> 钉钉接收 Markdown
```

Die geteilte Channel-Runtime verwendet einen unabhängigen Webhook-Ziel-Capability-Check. Die Standardimplementierung verwendet weiterhin die Zielregeln der gewöhnlichen proaktiven Zustellung; DingTalk akzeptiert nur bei der Auflösung von Webhook-Aufgaben zusätzlich `isGroup: false`. Daher lehnt die gewöhnliche Channel-Loop weiterhin Direktchat-Ziele ab, damit die `conversationId` eines eingehenden Direktchats nicht fälschlich als die Benutzer-Id behandelt wird, die die Eins-zu-eins-Nachrichten-API benötigt.

Gruppenchat-Ziele verwenden weiterhin den bestehenden Request-Body:

```json
{
  "robotCode": "CLIENT_ID",
  "openConversationId": "OPEN_CONVERSATION_ID",
  "msgKey": "sampleMarkdown",
  "msgParam": "{...}"
}
```

Direktchat-Ziele senden dieselbe Markdown-Vorlage über die Eins-zu-eins-Nachrichten-API:

```json
{
  "robotCode": "CLIENT_ID",
  "userIds": ["DINGTALK_USER_ID"],
  "msgKey": "sampleMarkdown",
  "msgParam": "{...}"
}
```

Beide Pfade teilen den bestehenden Access-Token-Cache, der eine Minute vor Ablauf des Tokens aktualisiert wird; bei HTTP 401 wird einmal retryt; zudem verwenden beide dieselbe Markdown-Normalisierung und dieselben Segmentierungslimits. Die Mehrsegment-Zustellung stoppt nach dem Fehlschlagen des ersten Segments.

## Fehlerbehandlung

- Ungültige Ziele scheitern bereits an der Webhook-Aufgaben-Validierung, bevor der Agent läuft.
- Ein Fehlschlagen beim Token-Abruf wird weiterhin als Zustellfehler behandelt und geloggt, ohne Credentials offenzulegen.
- HTTP 401 löscht den gecachten Token und retryt das aktuelle Segment einmal.
- Andere nicht erfolgreiche HTTP-Antworten brechen die Zustellung ab und geben die anonymisierten API-Fehlerdetails im Channel-Worker-Log aus.
- Ein `202 {"accepted": true}` vom Daemon bedeutet weiterhin nur, dass der Worker die Aufgabe angenommen hat, nicht, dass die DingTalk-Zustellung erfolgreich war.

Im Umfang dieser Phase wird nur Markdown unterstützt, daher ist keine Markdown-Degradationsstrategie erforderlich.

## Tests

### Unit-Tests

- Der Webhook akzeptiert explizit konfigurierte Gruppenchat- und Direktchat-Ziele; gewöhnliche proaktive Zustellung akzeptiert weiterhin nur Gruppenchat-Ziele.
- Ablehnung von Zielen ohne `isGroup`, mit leerer Id, mit Webhook-URL und mit gesetztem `threadId`.
- Bestehender Gruppenchat-Endpoint und Request-Body mit `openConversationId` bleiben unverändert.
- Direktchat verwendet den Eins-zu-eins-Nachrichten-Endpoint und einen Request-Body mit `userIds`.
- Gruppenchat- und Direktchat-Versand teilen den gecachten Token.
- Nach HTTP 401 wird der Token aktualisiert und nur einmal retryt.
- Die Direktchat-Zustellung befolgt ebenfalls die Regeln für Nachrichtensegmentierung und Abbruch beim ersten Fehlschlagen.

### Lokale End-to-End-Verifikation

Unter `.qwen/e2e-tests/` wird ein Testplan geschrieben, und zuerst wird mit dem global installierten `qwen`-CLI das aktuelle Basisverhalten dokumentiert, bei dem Direktchat-Webhook-Ziele abgelehnt werden. Nach Abschluss der Implementierung:

1. Jeweils ein Direktchat-Ziel und ein Gruppenchat-Ziel konfigurieren.
2. Den DingTalk-Channel aktivieren und `qwen serve` starten.
3. Mit `curl` jeweils ein Event an die beiden `targetRef` senden.
4. Bestätigen, dass beide Requests `202` zurückgeben.
5. Bestätigen, dass der Channel-Worker beide Aufgaben abschließt.
6. Bestätigen, dass der DingTalk-Zielbenutzer und der Gruppenchat beide die erwartete Markdown-Nachricht erhalten.

Wenn lokal keine nutzbaren DingTalk-Credentials oder Empfängerziele vorhanden sind, dienen die Unit-Tests als automatisierte Zustellverifikation, und es wird explizit dokumentiert, welche Online-Verifikationsschritte fehlen.

## Dokumentation

Die Channel-Webhook-Dokumentation wird aktualisiert, um beide DingTalk-Zielkonfigurationen für Direktchat und Gruppenchat zu zeigen, und es wird erläutert, dass `chatId` eines Direktchat-Ziels die DingTalk-Benutzer-Id enthält.

## Kompatibilität

Dies ist eine inkrementelle Änderung. Konfiguration, Validierung, Endpoint, Request-Body, Formatierung und Retry-Verhalten bestehender Gruppenchat-Ziele bleiben alle unverändert; eine Migration der Konfiguration ist nicht erforderlich. Der neue Webhook-Ziel-Check der geteilten Runtime delegiert standardmäßig an den ursprünglichen proaktiven Zustell-Ziel-Check, daher bleibt das Verhalten anderer Channels unverändert.
