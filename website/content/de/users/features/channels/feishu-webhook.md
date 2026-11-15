# Feishu-Webhook-Versand

Verwende einen Feishu-Custom-Bot, um Benachrichtigungen und Task-Ergebnisse an seine Gruppe zu senden.
Diese Methode benötigt eine Webhook-URL und, wenn für den Bot aktiviert, ein Signierungs-Secret.
Sie benötigt keine Anwendung, keine persistente Verbindung und keinen Inbound-Server.
Für Konversationen mit einem Agenten verwende den [Feishu-Anwendungsbot](./feishu).

## Bot erstellen

1. Füge einen Custom-Bot in der Ziel-Feishu-Gruppe hinzu.
2. Kopiere die Webhook-URL, beginnend mit
   `https://open.feishu.cn/open-apis/bot/v2/hook/`.
3. Konfiguriere die Sicherheitseinstellungen des Bots. Wenn die Signaturprüfung aktiviert ist,
   kopiere auch das Signierungs-Secret. Keyword- und IP-Einschränkungen gelten weiterhin.

Die URL enthält ein Credential. Bewahre sie in der Channel-Konfiguration oder einer Umgebungsvariable
auf, nicht in einem Task-Prompt oder Delivery-Target. Diese Integration unterstützt
`open.feishu.cn`; Lark-Endpunkte sind nicht enthalten.

Verwende die URL genau wie von Feishu ausgegeben. Die lokale Validierung erfordert ein Token-Pfadsegment
mit Buchstaben, Ziffern, `-`, `.`, `_` oder `~`, ohne Prozentkodierung, Query-Parameter oder Fragment.

## Channel konfigurieren

Konfiguriere diese Integration in [Web Shell](#use-web-shell) oder `settings.json` wie
unten gezeigt.

Füge eine benannte Instanz zu den Channel-Einstellungen des Workspace hinzu:

```json
{
  "channels": {
    "team-notices": {
      "type": "feishu-webhook",
      "webhookUrl": "$FEISHU_WEBHOOK_URL",
      "signingSecret": "$FEISHU_WEBHOOK_SECRET"
    }
  }
}
```

Setze diese Variablen in der Umgebung, die zum Starten von Qwen Code verwendet wird. Lasse
`signingSecret` weg, wenn der Bot keine Signierung erfordert. Verwende das Signierungs-Secret
des Custom-Bots, nicht das App Secret einer Anwendung.

Starte den Daemon in diesem Workspace:

```bash
qwen serve --channel team-notices
```

Eine benannte Instanz repräsentiert eine Gruppe. Erstelle zusätzliche Instanzen für andere
Gruppen. Das Ändern der URL einer Instanz ändert das Ziel für zukünftige Deliveries,
die sie referenzieren.

Das Starten des Channel macht ihn lokal bereit zum Senden; es sendet keine Testnachricht
und verifiziert keine Remote-Credentials. Das Stoppen bricht laufende Sendungen ab. Restart
oder Reload übernimmt gespeicherte Konfigurationsänderungen.

## Web Shell verwenden

Wähle in Channels Feishu und dann Webhook (nur Senden). Wähle den Workspace,
speichere die Webhook-URL und das optionale Signierungs-Secret, und starte den Channel.
Empfangs-, Pairing- und Agenten-Session-Einstellungen gelten nicht für diese Methode.
Die Anwendungsbot-Methode bleibt unter derselben Feishu-Plattform verfügbar.

Wähle in Scheduled Tasks eine persistente Task-Session und wähle diesen Channel
als Delivery-Ziel. Web Shell füllt seine konfigurierte Gruppe automatisch aus;
es werden keine beobachteten Kontakte oder manuell eingegebene Chat-IDs benötigt. Bestehende
Pro-Run- und Manual-Trigger-Delivery-Einschränkungen bleiben wirksam.

Dieselben Controls sind über `WebShellWithProviders` verfügbar, wenn der Host
Channels und Scheduled Tasks aktiviert und einen Daemon-Workspace bereitstellt.

## Explizite API-Delivery

Notify und explizite Prompt/Scheduled-Delivery verwenden das bestehende Channel-Target-Format.
Dieser Adapter besitzt ein logisches Ziel, `chat/default`:

```json
{
  "text": "# Daily report\n\nThe checks passed.",
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

Dies ist ein Workspace-Notify-Request-Body. `default` ist ein Alias für die konfigurierte
Gruppe, keine Feishu-Chat-ID. Andere IDs und User-Targets werden abgelehnt. Der Endpunkt
und das Signierungs-Secret bleiben in der Channel-Konfiguration.

Persistente Scheduled Tasks verwenden dasselbe Destination-Tuple. Delivery behält das
bestehende Best-Effort-Successful-Final-Result-Verhalten bei, einschließlich der aktuellen
Pro-Run- und Manual-Trigger-Einschränkungen.

## Nachrichtenformatierung und Limits

- Sendet Plain Text und Markdown in einer Static-Schema-2.0-Karte. Überschriften, Listen,
  Links, Fenced Code, Tabellen, Chinesisch und Emoji bleiben gültige Eingaben. Die Karte hat
  keine Buttons, Streaming-Updates oder duplizierte Preview-Summary.
- Verwendet Feishus Markdown-Subset; vollständige GitHub-Flavored-Markdown-Kompatibilität
  wird nicht garantiert. Tabellen verwenden separate Elemente innerhalb derselben Karte. Feishu
  dokumentiert Pagination nach fünf Datenzeilen pro Tabelle.
- Escaped vollständige `<at ...>` und `</at>` Tags mit numerischen HTML-Entities, sodass
  Task-bereitgestelltes Mention-Markup als Literaltext gesendet wird. Dies gilt auch innerhalb
  von Code-Beispielen. Konfigurierbare Mentions und Empfänger-Lookup werden nicht unterstützt.
  Client-Rendering und Benachrichtigungsverhalten sollten in deiner Gruppe überprüft werden.
- Prüft den **vollständigen serialisierten UTF-8-JSON-Request** einschließlich Escaping,
  Kartenstruktur und optionaler Signatur gegen ein **lokales Budget von 20.000 Byte**.
  Feishus Custom-Bot-Guide gibt 20 KB an, ohne die genaue Byte-Anzahl zu spezifizieren;
  dieses konservative lokale Limit ist kein gemessenes Plattform-Maximum.
- Lehnt übergroße Requests vor dem Senden mit einem expliziten Delivery-Fehler ab.
  Der Adapter kürzt nicht stillschweigend, teilt nicht in mehrere Requests auf und retryt nicht.
  Der gemeinsame Delivery-Size-Schutz gilt weiterhin vor dieser Plattformprüfung.
  Halte Berichte prägnant genug, damit der vollständige Request hineinpasst.

## Fehler und Transport

Sowohl der HTTP-Status als auch Feishus numerischer `code` werden geprüft. Keyword-, IP-,
Signatur- und Rate-Limit-Ablehnungen sind beobachtbare Fehler. Fehler lassen die Webhook-URL,
Secrets, Nachrichteninhalt und rohe Provider-Antworten weg.

Jeder Versuch sendet höchstens einen Request mit einem 15-Sekunden-Timeout. Ein Timeout oder
eine Cancellation kann die Remote-Akzeptanz unbekannt lassen. Der Channel verwendet den aufgelösten
Workspace-Proxy und das bestehende `NO_PROXY`-Bypass-Verhalten.

Dieser Modus empfängt keine Nachrichten, führt keine Inbound-Webhook-Tasks aus und startet keine
Channel-Loops. Er fügt keine Attachments, Failure/Cancellation-Alerts, dauerhafte Retry-Queue
oder ein generisches Webhook-Protokoll hinzu.

Siehe den offiziellen [Custom-Bot-Guide](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)
und die [Markdown-Komponentendokumentation](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/rich-text?lang=zh-CN)
für Plattformkonfiguration und Rendering-Anforderungen.
