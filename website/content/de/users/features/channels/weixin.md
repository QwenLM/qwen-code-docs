# WeChat (Weixin)

Diese Anleitung beschreibt die Einrichtung eines Qwen Code-Kanals auf WeChat über die offizielle iLink Bot API.

## Voraussetzungen

- Ein WeChat-Konto, das QR-Codes scannen kann (mobile App)
- Zugriff auf die iLink Bot-Plattform (die offizielle Bot-API von WeChat)

## Einrichtung

### 1. Anmeldung per QR-Code

WeChat verwendet die Authentifizierung per QR-Code anstelle eines statischen Bot-Tokens. Führen Sie den Login-Befehl aus:

```bash
qwen channel configure-weixin
```

Daraufhin wird eine QR-Code-URL angezeigt. Scannen Sie diese mit Ihrer WeChat-Mobil-App, um sich zu authentifizieren. Ihre Anmeldedaten werden in `~/.qwen/channels/weixin/account.json` gespeichert.

### 2. Konfiguration des Kanals

Fügen Sie den Kanal zu `~/.qwen/settings.json` hinzu:

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

Hinweis: WeChat-Kanäle verwenden kein `token`-Feld – die Anmeldedaten stammen aus dem QR-Login-Schritt.

### 3. Starten des Kanals

```bash
# Nur den WeChat-Kanal starten
qwen channel start my-weixin

# Oder alle konfigurierten Kanäle gemeinsam starten
qwen channel start
```

Öffnen Sie WeChat und senden Sie eine Nachricht an den Bot. Sie sollten während der Verarbeitung durch den Agenten eine Eingabeanzeige ("...") sehen, gefolgt von der Antwort.

## Bilder und Dateien

Sie können dem Bot Fotos und Dokumente senden, nicht nur Text.

**Fotos:** Senden Sie ein Bild (Screenshot, Foto usw.) und der Agent analysiert es mit seinen Vision-Fähigkeiten. Dafür ist ein multimodales Modell erforderlich – fügen Sie `"model": "qwen3.5-plus"` (oder ein anderes vision-fähiges Modell) zu Ihrer Kanal-Konfiguration hinzu. Während das Bild heruntergeladen und verarbeitet wird, wird eine Eingabeanzeige angezeigt.

**Dateien:** Senden Sie eine PDF-, Code-Datei oder ein anderes Dokument. Der Bot lädt sie von WeChats CDN herunter, entschlüsselt sie, speichert sie lokal und der Agent liest sie mit seinen Datei-Tools. Dies funktioniert mit jedem Modell.

## Konfigurationsoptionen

WeChat-Kanäle unterstützen alle Standard-Kanaloptionen (siehe [Kanalübersicht](./overview#options)), plus:

| Option    | Beschreibung                                                                         |
| --------- | ------------------------------------------------------------------------------------ |
| `baseUrl` | Überschreibt die Basis-URL der iLink Bot API (Standard: `https://ilinkai.weixin.qq.com`) |

## Wesentliche Unterschiede zu Telegram

- **Authentifizierung:** QR-Code-Anmeldung statt eines statischen Bot-Tokens. Sitzungen können ablaufen – der Kanal pausiert und protokolliert eine Nachricht, wenn dies geschieht.
- **Formatierung:** WeChat unterstützt nur reinen Text. Markdown in Agentenantworten wird automatisch entfernt.
- **Eingabeanzeige:** WeChat hat eine native "..."-Eingabeanzeige anstelle einer "Working..."-Textnachricht.
- **Gruppen:** Der WeChat iLink Bot ist auf Direktnachrichten beschränkt – Gruppenchats werden nicht unterstützt.
- **Medienverschlüsselung:** Bilder und Dateien werden auf WeChats CDN mit AES-128-ECB verschlüsselt. Der Kanal übernimmt die Entschlüsselung transparent.

## Tipps

- **Verwenden Sie Anweisungen im Klartext** – Da WeChat alle Markdown-Formatierungen entfernt, fügen Sie Anweisungen wie "Nur Klartext verwenden" hinzu, um zu vermeiden, dass der Agent formatierte Antworten erzeugt, die unübersichtlich aussehen.
- **Halten Sie Antworten kurz** – WeChat-Nachrichtenblasen funktionieren am besten mit prägnantem Text. Die Angabe einer Zeichenbegrenzung in Ihren Anweisungen hilft (z.B. "Antworten unter 500 Zeichen halten").
- **Sitzungsablauf** – Wenn Sie im Protokoll "Session expired (errcode -14)" sehen, ist Ihre WeChat-Anmeldung abgelaufen. Stoppen Sie den Kanal und führen Sie `qwen channel configure-weixin` erneut aus, um sich wieder anzumelden.
- **Zugriff einschränken** – Verwenden Sie `senderPolicy: "pairing"` oder `"allowlist"`, um zu kontrollieren, wer mit dem Bot sprechen kann. Details finden Sie unter [DM-Pairing](./overview#dm-pairing).

## Fehlerbehebung

### "WeChat-Konto nicht konfiguriert"

Führen Sie zuerst `qwen channel configure-weixin` aus, um sich per QR-Code anzumelden.

### "Session expired (errcode -14)"

Ihre WeChat-Anmeldesitzung ist abgelaufen. Stoppen Sie den Kanal und führen Sie erneut `qwen channel configure-weixin` aus.

### Bot antwortet nicht

- Überprüfen Sie die Terminalausgabe auf Fehler
- Stellen Sie sicher, dass der Kanal läuft (`qwen channel start my-weixin`)
- Wenn Sie `senderPolicy: "allowlist"` verwenden, stellen Sie sicher, dass Ihre WeChat-Benutzer-ID in `allowedUsers` enthalten ist

### Bilder funktionieren nicht

- Stellen Sie sicher, dass Ihre Kanal-Konfiguration ein `model` enthält, das Vision unterstützt (z.B. `qwen3.5-plus`)
- Überprüfen Sie das Terminal auf CDN-Download-Fehler – diese können auf ein Netzwerkproblem hinweisen