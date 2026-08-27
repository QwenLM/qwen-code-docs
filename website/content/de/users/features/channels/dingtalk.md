# DingTalk (Dingtalk)

Diese Anleitung beschreibt die Einrichtung eines Qwen Code Kanals auf DingTalk (钉钉).

## Voraussetzungen

- Ein DingTalk-Organisationskonto
- Eine DingTalk-Bot-Anwendung mit AppKey und AppSecret (siehe unten)

## Bot erstellen

1. Rufe das [DingTalk Developer Portal](https://open-dev.dingtalk.com) auf
2. Erstelle eine neue Anwendung (oder verwende eine vorhandene)
3. Aktiviere unter der Anwendung die **Robot**-Fähigkeit
4. Aktiviere in den Robot-Einstellungen den **Stream Mode** (机器人协议 → Stream 模式)
5. Notiere den **AppKey** (Client ID) und das **AppSecret** (Client Secret) von der Seite mit den Anwendungsanmeldedaten

### Stream Mode

Der DingTalk Stream Mode verwendet eine ausgehende WebSocket-Verbindung – es wird keine öffentliche URL oder kein Server benötigt. Der Bot verbindet sich mit DingTalks Servern, die Nachrichten über das WebSocket pushen. Dies ist das einfachste Bereitstellungsmodell.

## Konfiguration

Füge den Kanal zu `~/.qwen/settings.json` hinzu:

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "useConnectionManager": true,
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via DingTalk.",
      "groupPolicy": "open",
      "atSender": true,
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Setze die Anmeldedaten als Umgebungsvariablen:

```bash
export DINGTALK_CLIENT_ID=<your-app-key>
export DINGTALK_CLIENT_SECRET=<your-app-secret>
```

Oder definiere sie im `env`-Abschnitt der `settings.json`:

```json
{
  "env": {
    "DINGTALK_CLIENT_ID": "your-app-key",
    "DINGTALK_CLIENT_SECRET": "your-app-secret"
  }
}
```

### Interactive Cards

Füge ein `interactiveCards`-Objekt hinzu, um DingTalk-Status- und Frage-Karten zu aktivieren. Das Weglassen des Objekts deaktiviert interaktive Karten. Wenn das Objekt vorhanden ist, sind der Gesamtschalter und beide Kartentypen standardmäßig aktiviert, und Frage-Karten laufen nach 270.000 Millisekunden (270 Sekunden) ab.

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "interactiveCards": {
        "enabled": true,
        "statusCard": { "enabled": true },
        "questionCard": {
          "enabled": true,
          "timeoutMs": 270000
        }
      }
    }
  }
}
```

Setze `interactiveCards.enabled` auf `false`, um alle interaktiven Karten zu deaktivieren.
Verwende `statusCard.enabled` oder `questionCard.enabled`, um einen Kartentyp zu deaktivieren,
und setze `questionCard.timeoutMs` auf eine endliche positive Zahl, um zu ändern, wie lange
Qwen Code auf eine Frage-Karten-Antwort wartet. Werte über 2.147.483.647
Millisekunden (ca. 24,8 Tage) werden auf dieses Maximum begrenzt. Interaktive Karten
werden über `settings.json` oder die Management-API konfiguriert; der Web-Shell-
Channel-Editor rendert sie nicht und behält das gespeicherte Objekt bei, wenn
du andere Felder bearbeitest.

### Connection Recovery

`useConnectionManager` ist standardmäßig `true`. Der Connection Manager überwacht das Stream-WebSocket und ersetzt den DingTalk-SDK-Client, wenn die Verbindung nicht mehr reagiert. Du solltest ihn normalerweise aktiviert lassen.

Setze `"useConnectionManager": false`, um den Connection Manager von Qwen Code zu deaktivieren und auf das Keepalive- und automatische Reconnect-Verhalten des SDKs zurückzufallen.

## Ausführen

```bash
# Nur den DingTalk-Kanal starten
qwen channel start my-dingtalk

# Oder alle konfigurierten Kanäle zusammen starten
qwen channel start
```

Öffne DingTalk und sende eine Nachricht an den Bot. Du solltest eine 👀 Emoji-Reaktion sehen, während der Agent verarbeitet, gefolgt von der Antwort.

## Daemon Webhook Delivery

Wenn der Channel unter `qwen serve` läuft, können authentifizierte externe Webhook-Ereignisse unbeaufsichtigte Agenten-Tasks auslösen und die finale Markdown-Antwort an einen DingTalk-Benutzer oder eine Gruppe zustellen. Verwende die bestehenden Webhook-Zielfelder; kein separater Channel-Typ erforderlich:

```json
{
  "webhooks": {
    "sources": {
      "manual-test": {
        "secretEnv": "QWEN_CHANNEL_DINGTALK_TEST_SECRET",
        "targets": {
          "operator": {
            "chatId": "DINGTALK_USER_ID",
            "senderId": "webhook:manual-test",
            "isGroup": false
          },
          "team": {
            "chatId": "OPEN_CONVERSATION_ID",
            "senderId": "webhook:manual-test",
            "isGroup": true
          }
        }
      }
    }
  }
}
```

Jedes Ziel muss `isGroup` explizit setzen. Für eine Direktnachricht ist `chatId` die DingTalk-Benutzer-ID des Empfängers. Für eine Gruppennachricht ist `chatId` die `openConversationId` der Gruppe. Thread-Ziele und eingehende Robot-Webhook-URLs werden für die proaktive Zustellung nicht unterstützt. Siehe [Webhook-triggered tasks](./overview#webhook-triggered-tasks) für die vollständige Channel-Konfiguration und das Anfrageformat.

## Gruppenchats

DingTalk-Bots funktionieren sowohl in Direktnachrichten als auch in Gruppenunterhaltungen. Um die Gruppenunterstützung zu aktivieren:

1. Setze `groupPolicy` in deiner Kanalkonfiguration auf `"allowlist"`, `"pairing"` oder `"open"`
2. Füge den Bot zu einer DingTalk-Gruppe hinzu
3. Erwähne den Bot in der Gruppe mit @, um eine Antwort auszulösen
4. Wenn du `groupPolicy: "pairing"` verwendest, genehmige die Pairing-Anfrage der Gruppe einmal, bevor Antworten starten

Standardmäßig erfordert der Bot eine @-Erwähnung in Gruppenchats (`requireMention: true`). Setze `"requireMention": false` für eine bestimmte Gruppe, damit der Bot auf alle Nachrichten antwortet. Vollständige Details findest du unter [Gruppenchats](./overview#group-chats).

Setze `"atSender": true`, damit der Bot das Mitglied mit @ erwähnt, dessen Gruppennachricht seine Antwort ausgelöst hat. Dies ist standardmäßig ausgeschaltet und gilt nur für Agent-Antworten mit einer DingTalk-Personal-ID. Antworten werden als DingTalk-Markdown gesendet, unabhängig davon, ob sie eine Erwähnung tragen; das Erwähnungspräfix wird in den ersten Nachrichten-Chunk eingefügt.

### Conversation-ID einer Gruppe finden

DingTalk verwendet `conversationId`, um Gruppen zu identifizieren. Du findest sie in den Kanal-Service-Logs, wenn jemand eine Nachricht in der Gruppe sendet – suche im Log-Output nach dem Feld `conversationId`.

## Bilder und Dateien

Du kannst Fotos und Dokumente an den Bot senden, nicht nur Text.

**Fotos:** Sende ein Bild (Screenshot, Diagramm usw.) und der Agent wird es mit seinen visuellen Fähigkeiten analysieren. Dies erfordert ein multimodales Modell – füge `"model": "qwen3.5-plus"` (oder ein anderes vision-fähiges Modell) zu deiner Kanalkonfiguration hinzu. DingTalk unterstützt das Senden von Bildern direkt oder als Teil von Rich-Text-Nachrichten (gemischt Text + Bilder).

**Dateien:** Sende eine PDF-, Code-Datei oder ein beliebiges Dokument. Der Bot lädt sie von DingTalks Servern herunter und speichert sie lokal, damit der Agent sie mit seinen Dateiwerkzeugen lesen kann. Audio- und Videodateien werden ebenfalls unterstützt. Dies funktioniert mit jedem Modell.

## Weitergeleitete Chat-Verläufe

Du kannst eine Reihe von Nachrichten aus einem anderen Chat an den Bot weiterleiten (DingTalks „combined forward"), entweder als eigenständige Nachricht oder als Nachricht, auf die du antwortest. Der Bot expandiert den Verlauf in Text für den Agenten: Titel und Zusammenfassung des Verlaufs werden zu einer Kopfzeile, und jede weitergeleitete Nachricht wird unter `[Chat record messages]` als `Absender: Nachricht` aufgelistet. Eine weitergeleitete Nachricht, deren Inhalt nicht textbasiert ist, wird als Platzhalter angezeigt – `[image]`, `[file: <Name>]`, `[audio]`, `[video]`.

Lange Verläufe werden **begrenzt, und die Begrenzung wird angekündigt**: maximal 50 Nachrichten, maximal 4000 Zeichen insgesamt und maximal 500 Zeichen pro Nachricht. Was abgeschnitten wird, wird dem Agenten im selben Text mitgeteilt – eine abschließende Zeile `[N more message(s) not shown]` für verworfene Nachrichten und ein ` [truncated]`-Marker bei jeder gekürzten Nachricht. Der Agent weiß also, dass er auf einen unvollständigen Verlauf antwortet; wenn du den kompletten Inhalt brauchst, leite ihn in kleineren Paketen weiter.

Ein Verlauf, auf den du **antwortest**, wird zitiert statt gesendet, und zitierter Text wird auf jedem Channel auf 500 Zeichen begrenzt – der Verlauf wird also auf dieses 500-Zeichen-Budget statt auf das 4000-Zeichen-Budget gerendert, und dieselben Ankündigungen gelten innerhalb dessen. Erwarte bei einem zitierten Verlauf seine Kopfzeile und die erste Nachricht oder zwei; leite ihn als eigenständige Nachricht weiter, um dem Agenten den kompletten Inhalt zu geben.

Da ein weitergeleiteter Verlauf von anderen Personen als dir verfasst wird, wird alles daraus entnommene – Titel, Absendernamen, Nachrichteninhalt – neutralisiert, bevor es den Agenten erreicht, sodass eine weitergeleitete Nachricht sich nicht als Anweisung an den Bot ausgeben kann.

Das mehrzeilige Layout oben ist das, was der Agent in einem 1:1-Chat sieht. In einer Gruppe wird die gesamte Nachricht ein zweites Mal neutralisiert, bevor sie den Agenten erreicht – sie wird auf eine Zeile gefaltet und die eckigen Klammern um die Marker werden entfernt; der Inhalt und die Begrenzungsankündigungen sind in beiden Fällen gleich.

## Hauptunterschiede zu Telegram

- **Authentifizierung:** AppKey + AppSecret anstelle eines statischen Bot-Tokens. Das SDK verwaltet die Aktualisierung des Zugriffstokens automatisch.
- **Verbindung:** WebSocket-Stream anstelle von Polling – keine öffentliche IP oder Webhook-URL erforderlich.
- **Formatierung:** Antworten verwenden DingTalks Markdown-Dialekt. Markdown-Tabellen werden an den DingTalk-Client durchgereicht; lange Nachrichten werden bei ~3800 Zeichen in Chunks aufgeteilt.
- **Verarbeitungsanzeige:** Eine 👀 Emoji-Reaktion wird zur Nachricht des Benutzers hinzugefügt, während die Verarbeitung läuft, und dann entfernt, wenn die Antwort gesendet wird.
- **Medien-Download:** Zweistufiger Prozess – ein `downloadCode` aus der Nachricht wird über DingTalks API gegen eine temporäre Download-URL eingetauscht.
- **Gruppen:** DingTalk verwendet `isInAtList` zur Erkennung von @-Erwähnungen anstatt der Analyse von Nachrichten-Entities.

## Tipps

- **Verwende DingTalk-Markdown-bewusste Anweisungen** – DingTalk unterstützt Überschriften, Fettdruck, Links, Codeblöcke und Tabellen. Halte Tabellen kompakt, da schmale Bildschirme horizontal scrollen können.
- **Zugriff einschränken** – In einem Organisationskontext kann `senderPolicy: "open"` akzeptabel sein. Für strengere Kontrolle verwende `"allowlist"` oder `"pairing"`. Details findest du unter [DM Pairing](./overview#dm-pairing).
- **Referenzierte Nachrichten** – Das Zitieren (Antworten auf) einer Benutzernachricht fügt den zitierten Text als Kontext für den Agenten hinzu. Wenn die zitierte Nachricht ein Bild, eine Datei, eine Audio- oder Videonachricht ist, lädt der Bot sie herunter und fügt sie auf dieselbe Weise bei wie bei direktem Senden. Das Zitieren von Bot-Antworten wird noch nicht unterstützt.

## Fehlerbehebung

### Bot verbindet sich nicht

- Überprüfe, ob dein AppKey und AppSecret korrekt sind
- Stelle sicher, dass die Umgebungsvariablen gesetzt sind, bevor du `qwen channel start` ausführst
- Stelle sicher, dass **Stream Mode** in den Bot-Einstellungen im DingTalk Developer Portal aktiviert ist
- Überprüfe die Terminalausgabe auf Verbindungsfehler

### Bot antwortet nicht in Gruppen

- Überprüfe, ob `groupPolicy` auf `"allowlist"`, `"pairing"` oder `"open"` gesetzt ist (Standard ist `"disabled"`)
- Wenn du `"pairing"` verwendest, überprüfe, ob die Pairing-Anfrage der Gruppe genehmigt wurde
- Stelle sicher, dass du den Bot in der Gruppennachricht mit @ erwähnst
- Überprüfe, ob der Bot zur Gruppe hinzugefügt wurde

### „No sessionWebhook in message“

Dies bedeutet, dass DingTalk keinen Antwort-Endpunkt im Nachrichten-Callback enthalten hat. Dies kann passieren, wenn die Berechtigungen des Bots falsch konfiguriert sind. Überprüfe die Bot-Einstellungen im Developer Portal.

### „Sorry, something went wrong processing your message“

Dies bedeutet normalerweise, dass der Agent auf einen Fehler gestoßen ist. Überprüfe die Terminalausgabe auf Details.