# Observed channel group names

## Problem

Der mit #7109 eingeführte workspace-scoped beobachtete Kontakte-Graph bewahrt
vollständige Plattform-Gruppen-Ids, aber jedes `groups[].label` fällt derzeit
auf diese Id zurück. Einige eingehende Channel-Callbacks tragen bereits einen
menschenlesbaren Gruppennamen, und die Adapter verwerfen ihn vor der
gemeinsamen Beobachtungsgrenze.

User, die ein Ziel für proaktive Zustellung auswählen, benötigen den lesbaren
Namen neben der vollständigen, stabilen Plattform-Id. Der Name ist
beobachtende Metadaten, kein Routing-Schlüssel.

## Umfang

Einen optionalen Gruppennamen zum gemeinsamen Eingangs-Envelope hinzufügen und
ihn nur aus Metadaten füllen, die bereits in einer akzeptierten eingehenden
Nachricht vorhanden sind.

- DingTalk mappt das `conversationTitle` des Stream-Callbacks.
- Telegram mappt das `title` des eingehenden Chats für Gruppen und
  Supergruppen.
- Feishu behält den vollständigen `chat_id`-Fallback, da
  `im.message.receive_v1` keinen Chat-Anzeigenamen enthält.
- Andere Adapter behalten den Id-Fallback, es sei denn, ihre bestehende
  Eingangs-Payload hat ein dokumentiertes Gruppennamen-Feld.

Diese Änderung ruft keine Plattform-Verzeichnis-, Gruppen-Detail- oder
Chat-Info-API ab; fügt keine Berechtigungen hinzu; ändert kein Routing und
keine Session-Identität; entdeckt keine autoritative Mitgliedschaft;
beobachtet keine Bot-Ausgaben; und fügt keine Topic-Namen hinzu.

## Vertrag

`Envelope` erhält ein optionales Feld:

```ts
chatName?: string;
```

Das Feld beschreibt den Anzeigenamen von `chatId`, wie er auf dieser Nachricht
beobachtet wurde. Es wird bei Direktnachrichten ignoriert. `chatId` bleibt der
vollständige Plattform-Zustellschlüssel und bestimmt weiterhin Sessions,
Deduplizierung und Graph-Identität.

Der gemeinsame Beobachtungspfad verwendet ein bereinigtes, nicht leeres
`chatName` als Gruppen-Label. Fehlende oder unbrauchbare Werte fallen auf die
vollständige `chatId` zurück. Der bestehende Registry-Store begrenzt
persistierte Labels auf 256 UTF-16-Code-Einheiten, ohne Surrogat-Paare zu
trennen.

## Refresh-Semantik

Eine akzeptierte spätere Nachricht für denselben Channel, User und dieselbe
Gruppe aktualisiert die Beobachtung. Wenn sie ein anderes brauchbares
`chatName` trägt, aktualisiert die bestehende Store-Ersetzungssemantik das
abgeleitete Gruppen-Label, ohne einen weiteren Gruppen-Node zu erzeugen. Die
Freshness bleibt `lastObservedAt`; Namen werden nicht als dauerhaft oder
autoritativ behandelt.

Eine Plattform, die bei einer späteren Nachricht einen Gruppennamen weglässt,
trägt für diese Beobachtung den Id-Fallback bei. Die Graph-Ableitung wählt
bereits die letzte Beobachtung, daher stellt das zurückgegebene Label den
neuesten akzeptierten Beleg dar und keinen versteckten langlebigen
Namen-Cache.

## Plattform-Belege

- Das Stream-Robot-Message-Beispiel von DingTalk enthält `conversationTitle`
  im eingehenden Callback: [DingTalk Stream protocol](https://opensource.dingtalk.com/developerpedia/docs/learn/stream/protocol/#%E5%9B%9E%E8%B0%83%E6%8E%A8%E9%80%81).
- Telegram definiert `Message.chat` als `Chat`, dessen `title` für
  Gruppenchats und Supergruppen verfügbar ist: [Telegram Bot API — Chat](https://core.telegram.org/bots/api/#chat).
- Das Feishu-Nachrichtenempfangs-Event listet `chat_id`, `chat_type` und
  `thread_id` auf, aber keinen Chat-Anzeigenamen: [Feishu Open Platform — Receive message](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive).

## Teststrategie

- Base-Channel-Tests beweisen, dass brauchbare Gruppennamen propagiert werden,
  unbrauchbare Namen auf vollständige Ids zurückfallen, Direktnachrichten
  `chatName` ignorieren und spätere Beobachtungen Labels aktualisieren können.
- DingTalk-Adapter-Tests beweisen, dass `conversationTitle` in das Envelope
  gelangt, ohne das Callback-Handling zu ändern.
- Telegram-Adapter-Tests beweisen, dass Gruppen- und Supergruppen-Titel in das
  Envelope gelangen, während private Chats unverändert bleiben.
- Bestehende Feishu-Tests beweisen weiterhin den Id-Fallback-Pfad ohne
  API-Verkehr.
- Fokussierte Store-Tests decken die Ersetzung durch neuere Labels ab; eine
  Schema-Migration ist nicht erforderlich, da persistierte Beobachtungen
  bereits `group.label` enthalten.
