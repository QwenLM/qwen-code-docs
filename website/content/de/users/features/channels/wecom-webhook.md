# WeCom-Webhook-Versand

Verwenden Sie den Message-Push-Webhook (früher Gruppen-Robot genannt) einer internen WeCom-Gruppe, um Benachrichtigungen und Aufgabenergebnisse zu senden. Dafür wird nur die Webhook-URL der Gruppe benötigt, keine Bot-ID/Secret, Anwendungs-Credentials, keine persistente Verbindung und kein öffentlicher eingehender Server. Für Konversationen mit einem Agenten verwenden Sie den [WeCom Intelligent Robot](./wecom); für eine selbst erstellte Anwendung siehe [WeCom Callback](./wecom-callback).

## Gruppenziel erstellen

1. Öffnen Sie die Einstellungen einer internen WeCom-Gruppe und suchen Sie Message Push.
2. Erstellen Sie einen benutzerdefinierten Message Push und kopieren Sie dessen Webhook-URL, beginnend mit
   `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=`.
3. Überprüfen Sie die Erstellungsberechtigungen Ihrer Organisation, wenn der Eintrag nicht verfügbar ist.
   Administratoren können einschränken, welche Mitglieder Message Push erstellen dürfen, und vom Owner
   verwaltete Gruppen können den Eintrag auf den Gruppen-Owner beschränken.

Externe Gruppen werden von diesem Setup nicht unterstützt. Die offiziellen Erstellungsbedingungen
beschreiben Berechtigungen für interne Gruppen und Administratoren; sie begründen keine universelle
Anforderung oder Ausnahme für die Unternehmenszertifizierung.

Die URL enthält die Versende-Credentials. Bewahren Sie sie in der Channel-Konfiguration oder einer
Umgebungsvariable auf, niemals in einem Aufgaben-Prompt oder Lieferziel. Verwenden Sie die URL wie von
WeCom ausgegeben. Die lokale Validierung erlaubt genau einen `key`-Parameter mit Buchstaben, Ziffern,
`-`, `.`, `_` oder `~`; Prozentkodierung, Fragmente und zusätzliche Parameter werden nicht akzeptiert.
Es gibt kein separates Signing-Secret.

## Channel konfigurieren

Konfigurieren Sie diese Integration in [WebShell](#use-web-shell) oder `settings.json` wie unten gezeigt.

Fügen Sie eine benannte Instanz zu den Channel-Einstellungen des Workspace hinzu:

```json
{
  "channels": {
    "team-notices": {
      "type": "wecom-webhook",
      "webhookUrl": "$WECOM_WEBHOOK_URL"
    }
  }
}
```

Setzen Sie `WECOM_WEBHOOK_URL` in der Umgebung, die zum Starten von Qwen Code verwendet wird, und
starten Sie dann den Daemon in diesem Workspace:

```bash
qwen serve --channel team-notices
```

Eine benannte Instanz repräsentiert eine Gruppe. Erstellen Sie zusätzliche Instanzen für andere Gruppen.
Das Ändern der URL einer Instanz ändert zukünftige Zustellungen darüber.

Das Starten macht den Channel lokal bereit zum Senden. Es sendet keine Testnachricht und verifiziert
nicht die Remote-Credentials. Das Stoppen bricht laufende Sendungen ab; Neustart oder Reload übernehmen
gespeicherte Konfigurationsänderungen.

## WebShell verwenden

Wenn Ihr Build die Backend-Unterstützung enthält, aber vor der Web-Integration erstellt wurde, listet
Channels diese Methode oder vorhandene `wecom-webhook`-Instanzen nicht auf. Verwenden Sie die
`settings.json`- und `qwen serve --channel`-Schritte oben, bis Sie auf einen Build mit Web-Integration
aktualisieren.

Wählen Sie in Channels WeCom und dann Webhook (nur Senden). Wählen Sie den Workspace, speichern Sie die
Webhook-URL und starten Sie den Channel. Kein Signing-Secret erforderlich. Empfangs-, Pairing- und
Agenten-Session-Einstellungen gelten nicht für diese Methode. Die Intelligent-Bot-Methode bleibt unter
WeCom; WeCom Callback behält seinen separaten Eintrag.

Wählen Sie in Scheduled Tasks eine persistente Aufgaben-Session und wählen Sie diesen Channel als
Zustellziel. WebShell füllt seine konfigurierte Gruppe automatisch aus; keine beobachteten Kontakte oder
manuell eingegebene Chat-ID erforderlich. Bestehende Pro-Run- und manuelle Trigger-Zustellbeschränkungen
bleiben in Kraft.

Die gleichen Steuerungen sind über `WebShellWithProviders` verfügbar, wenn der Host Channels und
Scheduled Tasks aktiviert und einen Daemon-Workspace bereitstellt.

## Explizite API-Zustellung

Notify und explizite Prompt-/Scheduled-Zustellung verwenden das vorhandene Channel-Ziel.
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

Dies ist ein Workspace-Notify-Request-Body. `default` benennt die konfigurierte Gruppe; es ist keine
WeCom-Chat-ID. Andere IDs, Benutzerziele und Threads werden abgelehnt. Tasks speichern das logische Ziel;
die Credentials bleiben in den Channel-Einstellungen.

Persistente Scheduled Tasks verwenden dasselbe Ziel. Die Zustellung behält das vorhandene
Best-Effort-Verhalten für erfolgreiche Endergebnisse bei, einschließlich der aktuellen Pro-Run- und
manuellen Trigger-Beschränkungen.

## Nachrichtenformatierung und Limits

- Sendet `markdown_v2` mit dem Originaltext. Das unterstützte Subset umfasst Überschriften, Listen,
  Links, Fenced Code und Tabellen; normaler Text, Chinesisch und Emoji sind gültige Eingaben. Vollständige
  GitHub-Flavored-Markdown-Kompatibilität wird nicht garantiert.
- Dieses Format unterstützt keine Mentions oder Schriftfarb-Markup. Der Adapter sendet keine
  Mention-Arrays und wandelt Aufgabentext nicht in Mentions um. Mention-artige Strings wie `< @all>`
  verbleiben im Body.
- Clients vor 4.1.36 (Android vor 4.1.38) zeigen die Nachricht als Plain Text an. Verwenden Sie einen
  aktuellen Client für Markdown-Rendering.
- Der endgültige **content** ist auf **4096 UTF-8 Bytes** vor JSON-Escaping begrenzt. Chinesisch und
  Emoji benötigen mehr Bytes als ASCII. Dies ist kein 4096-Zeichen-Limit oder ein Limit für die
  vollständige JSON-Anfrage.
- Übergroßer Content schlägt vor dem Senden explizit fehl. Es gibt keine stille Adapter-Kürzung, kein
  automatisches Splitting und keinen Retry. Die gemeinsame Zustellgrenze gilt weiterhin vor der
  plattformspezifischen Prüfung.
- WeCom erlaubt **20 Nachrichten pro Minute pro Webhook**. Halten Sie Scheduled Reports knapp und
  vermeiden Sie Bursts; gedrosselte Zustellungen melden Fehler ohne Queueing.

## Fehler und Transport

Sowohl HTTP-Status als auch der numerische WeCom-`errcode` werden geprüft. Ungültige oder deaktivierte
Credentials, abgelehnte Gruppenziele und Rate Limits erzeugen beobachtbare Fehler. Diagnosen lassen URL,
Key, Nachrichteninhalt und rohen Provider-Fehlertext weg.

Jeder Versuch macht höchstens eine Anfrage mit einem 15-Sekunden-Timeout. API-Akzeptanz ist keine
Lesebestätigung; ein Timeout oder eine Stornierung kann die Remote-Akzeptanz unbekannt lassen. Der
Transport berücksichtigt den aufgelösten Workspace-Proxy und das vorhandene `NO_PROXY`-Verhalten.

Dieser Modus empfängt keine Nachrichten, führt keine eingehenden Webhook-Tasks aus und startet keine
Channel-Loops. Er fügt keine Attachments, interaktiven Karten, automatischen Fehler/Stornierungs-Warnungen,
dauerhaften Retries oder generisches Webhook-Protokoll hinzu.

Siehe das offizielle [Message-Push-Protokoll](https://developer.work.weixin.qq.com/document/path/91770)
und den [Einrichtungsleitfaden](https://open.work.weixin.qq.com/help2/pc/14931) für aktuelle
Plattformanforderungen.
