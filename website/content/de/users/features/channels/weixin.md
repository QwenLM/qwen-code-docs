# WeChat (Weixin)

Diese Anleitung beschreibt die Einrichtung eines Qwen Code-Kanals auf WeChat über die offizielle iLink Bot API.

## Voraussetzungen

- Ein WeChat-Konto, das QR-Codes scannen kann (Mobile App)
- Zugriff auf die iLink Bot-Plattform (die offizielle Bot-API von WeChat)

## Einrichtung

### 1. Anmeldung per QR-Code

WeChat verwendet zur Authentifizierung QR-Codes anstelle eines statischen Bot-Tokens. Führe den folgenden Anmeldebefehl aus:

```bash
qwen channel configure-weixin
```

Dadurch wird eine QR-Code-URL angezeigt. Scanne sie mit deiner WeChat-App, um dich zu authentifizieren. Deine Zugangsdaten werden in `~/.qwen/channels/weixin/account.json` gespeichert.

### 2. Kanal konfigurieren

Füge den Kanal zu `~/.qwen/settings.json` hinzu:

```json
{
  "channels": {
    "my-weixin": {
      "type": "weixin",
      "senderPolicy": "pairing",
      "allowedUsers": [],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "model": "qwen3.5-plus",
      "instructions": "You are a concise coding assistant responding via WeChat. Keep responses under 500 characters. Use plain text only."
    }
  }
}
```

Hinweis: WeChat-Kanäle verwenden kein `token`-Feld – die Zugangsdaten stammen aus dem QR-Login-Schritt.

### 3. Kanal starten

```bash
# Start only the WeChat channel
qwen channel start my-weixin

# Or start all configured channels together
qwen channel start
```

Öffne WeChat und sende eine Nachricht an den Bot. Während der Agent die Anfrage verarbeitet, sollte ein Tipp-Indikator („...“) angezeigt werden, gefolgt von der Antwort.

## Bilder und Dateien

Du kannst dem Bot nicht nur Text, sondern auch Fotos und Dokumente senden.

**Fotos:** Sende ein Bild (Screenshot, Foto usw.) und der Agent analysiert es mithilfe seiner Vision-Funktionen. Dies erfordert ein multimodales Modell – füge `"model": "qwen3.5-plus"` (oder ein anderes vision-fähiges Modell) zu deiner Kanal-Konfiguration hinzu. Während das Bild heruntergeladen und verarbeitet wird, wird ein Tipp-Indikator angezeigt.

**Dateien:** Sende ein PDF, eine Codedatei oder ein beliebiges Dokument. Der Bot lädt es von WeChats CDN herunter, entschlüsselt es, speichert es lokal und der Agent liest es mit seinen Datei-Tools. Dies funktioniert mit jedem Modell.

## Konfigurationsoptionen

WeChat-Kanäle unterstützen alle Standard-Kanaloptionen (siehe [Channel Overview](./overview#options)) sowie:

| Option    | Beschreibung                                                                   |
| --------- | ------------------------------------------------------------------------------ |
| `baseUrl` | Überschreibt die Basis-URL der iLink Bot API (Standard: `https://ilinkai.weixin.qq.com`) |

## Wichtige Unterschiede zu Telegram

- **Authentifizierung:** Anmeldung per QR-Code anstelle eines statischen Bot-Tokens. Sitzungen können ablaufen – in diesem Fall pausiert der Kanal und protokolliert eine entsprechende Meldung.
- **Formatierung:** WeChat unterstützt nur Nur-Text. Markdown in Agent-Antworten wird automatisch entfernt.
- **Tipp-Indikator:** WeChat bietet einen nativen „...“-Tipp-Indikator anstelle einer „Working...“-Textnachricht.
- **Gruppen:** Der WeChat iLink Bot unterstützt nur Direktnachrichten (DM) – Gruppenchats werden nicht unterstützt.
- **Medienverschlüsselung:** Bilder und Dateien sind auf WeChats CDN mit AES-128-ECB verschlüsselt. Der Kanal übernimmt die Entschlüsselung transparent.

## Tipps

- **Verwende Nur-Text-Anweisungen** – Da WeChat sämtliches Markdown entfernt, füge Anweisungen wie „Use plain text only“ hinzu, um zu vermeiden, dass der Agent formatierte Antworten erzeugt, die unübersichtlich aussehen.
- **Halte Antworten kurz** – WeChat-Nachrichtenblasen eignen sich am besten für knappen Text. Ein Zeichenlimit in den Anweisungen hilft dabei (z. B. „Keep responses under 500 characters“).
- **Sitzungsablauf** – Wenn du „Session expired (errcode -14)“ in den Logs siehst, ist deine WeChat-Anmeldung abgelaufen. Stoppe den Kanal und führe `qwen channel configure-weixin` erneut aus, um dich neu anzumelden.
- **Zugriff beschränken** – Verwende `senderPolicy: "pairing"` oder `"allowlist"`, um zu steuern, wer mit dem Bot kommunizieren darf. Details findest du unter [DM Pairing](./overview#dm-pairing).

## Fehlerbehebung

### „WeChat account not configured“

Führe zuerst `qwen channel configure-weixin` aus, um dich per QR-Code anzumelden.

### „Session expired (errcode -14)“

Deine WeChat-Anmeldesitzung ist abgelaufen. Stoppe den Kanal und führe `qwen channel configure-weixin` erneut aus.

### Bot antwortet nicht

- Prüfe die Terminalausgabe auf Fehler
- Stelle sicher, dass der Kanal läuft (`qwen channel start my-weixin`)
- Wenn du `senderPolicy: "allowlist"` verwendest, stelle sicher, dass deine WeChat-User-ID in `allowedUsers` enthalten ist

### Bilder funktionieren nicht

- Stelle sicher, dass deine Kanal-Konfiguration ein `model` enthält, das Vision unterstützt (z. B. `qwen3.5-plus`)
- Prüfe das Terminal auf CDN-Download-Fehler – diese können auf ein Netzwerkproblem hinweisen