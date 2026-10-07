# E-Mail

Verwende ein dediziertes Postfach, um Aufgaben per IMAP an Qwen Code zu senden und Klartext-Antworten über SMTP zu empfangen. Die erste Verbindung überspringt bereits im ausgewählten Ordner vorhandene E-Mails. Spätere Verbindungen setzen am gespeicherten UID-Cursor fort.

## Konfigurieren und starten

Aktiviere IMAP und SMTP für das Postfach und exportiere dessen Zugangsdaten in die Umgebung des Prozesses, der Qwen Code ausführt. Füge diesen Channel in `settings.json` hinzu:

```json
{
  "channels": {
    "agent-mail": {
      "type": "email",
      "address": "agent @example.com",
      "imapHost": "imap.example.com",
      "imapUser": "agent @example.com",
      "imapPassword": "$AGENT_IMAP_PASSWORD",
      "smtpHost": "smtp.example.com",
      "smtpUser": "agent @example.com",
      "smtpPassword": "$AGENT_SMTP_PASSWORD",
      "privatePolicy": "allowlist",
      "allowedUsers": ["you @example.com"],
      "sessionScope": "chat_thread",
      "cwd": "/path/to/workspace"
    }
  }
}
```

Führe `qwen channel start agent-mail` aus. Passwortfelder unterstützen die bestehenden `$ENV_VAR`-Referenzen; halte Klartext-Passwörter aus den Einstellungen heraus. Der Adapter deaktiviert die Protokollprotokollierung und meldet Verbindungsfehler ohne Offenlegung der Zugangsdaten.

Implizites TLS verwendet standardmäßig IMAP-Port 993 und SMTP-Port 465. Für STARTTLS setze `imapSecure` oder `smtpSecure` auf `false`; die Standardports werden dann 143 bzw. 587. STARTTLS und Zertifikatsverifikation bleiben obligatorisch. Überschreibe `imapPort` und `smtpPort` bei Bedarf. Für eine private CA konfiguriere Nodes `NODE_EXTRA_CA_CERTS` vor dem Start von Qwen Code.

| Option                | Standard   | Bedeutung                                                               |
| --------------------- | ---------- | ----------------------------------------------------------------------- |
| `folder`              | `INBOX`    | Ein schreibgeschützter IMAP-Ordner                                      |
| `pollInterval`        | `60000`    | Abfrageintervall in Millisekunden                                       |
| `maxMessageBytes`     | `10485760` | Maximale rohe Nachrichtengröße; größere Nachrichten werden übersprungen |
| `maxAttachmentBytes`  | `5242880`  | Maximale Größe einzelner Anhänge; größere Anhänge werden weggelassen    |
| `maxTextLength`       | `32000`    | Maximale Textzeichen vor dem Kürzen von zitiertem Verlauf/Signatur      |
| `proactiveRecipients` | `[]`       | Exakte Bare-Mailbox-Adressen, die für proactive Zustellung erlaubt sind |

Maximal 16 Anhänge werden weitergeleitet. PNG-, JPEG-, GIF- und WebP-Bilder verwenden die bestehende Bild-Eingabe; andere Dateien werden für die Dauer der Aufgabe unter generierten privaten Pfaden gespeichert. Kalender- und gekapselte Nachrichten-/Bericht-Parts werden nicht unterstützt. HTML wird in Text umgewandelt, ohne entfernte Ressourcen zu laden. Die üblichen Channel-Optionen `cwd`, `model`, `instructions` und `sessionScope` gelten. Der Standard-`chat_thread`-Scope trennt Absender und Threads; die explizite Wahl von `single` teilt eine Agent-Session.

## Zugriff und Antworten

`privatePolicy` unterstützt `allowlist` (Standard), `open` und `disabled`; das ältere `senderPolicy` wird ebenfalls erkannt. Pairing wird in dieser ersten Version nicht unterstützt. Adressen in `allowedUsers` und `operators` werden auf Kleinbuchstaben normalisiert; Anzeigenamen gewähren keinen Zugriff. Bare-ASCII-Adressen werden unterstützt. Verwende einen Mailbox-Anbieter, der gefälschte E-Mails filtert: Eine From-Allowlist authentifiziert den Absender nicht.

Antworte auf die E-Mail des Agenten, um die Konversation fortzusetzen. `Message-ID`, `In-Reply-To` und `References` ordnen die Konversation ihrem Absender zu. Antworten richten sich ausschließlich an diesen Absender; `Reply-To`, CC, BCC und Adressen innerhalb der Aufgabe können die SMTP-Empfänger nicht ändern. Ergebnisse von Hintergrund-Agenten antworten über die gespeicherte akzeptierte Thread-Route, nachdem der initiierende Turn endet. No-Reply-Absender können Aufgaben starten, erhalten aber keine Antwort. Agent-generierte, automatische, Mailinglisten- und Zustellbericht-E-Mails werden ignoriert.

Textbefehle wie `/help`, `/status` und Genehmigungs-Antworten funktionieren im E-Mail-Body. E-Mail verwendet standardmäßig `followup` und unterstützt `steer`. `collect` wird abgelehnt, weil gepufferte Nachrichten ihren Admission-Handler überleben und keinen individuellen dauerhaften Completion-Claim behalten können. Admission bleibt aktiv, während eine Aufgabe wartet. Bis zu 32 normale Zustellungen können gleichzeitig unterwegs sein; ein zusätzlicher Slot erlaubt Kontroll- und Busy-Antworten. Neue Aufgaben bei Kapazität erhalten eine Aufforderung, nach Abschluss einer aktiven Aufgabe erneut zu senden.

Proactive Zustellung ist deaktiviert, außer `proactiveRecipients` enthält das exakte Ziel. Ein threaded proaktives Ziel muss sich auch auf einen bekannten, derzeit erlaubten Absender/Thread auflösen lassen. Unbekannte Ziele schlagen fehl, ohne einen anderen Empfänger auszuwählen oder einen Ersatz-Thread zu erstellen. Der Adapter behält 256 recente Antwortrouten, bis zu 64 Identifier pro Route und 1024 recente Eingangsidentitäten. Der IMAP-UID-Fortschritt verhindert weiterhin das Replay älterer Zustellungen, nachdem diese Metadateneinträge abgelaufen sind; eine verdrängte Thread-Route kann keine proaktiven Antworten empfangen, bis eine andere akzeptierte Nachricht sie wiederherstellt.

## Recovery

Der Zustand liegt unter `$QWEN_HOME/channels/<workspace>/email-<account-hash>/state.json` (Standard-QWEN_HOME ist `~/.qwen`). Channel-Name, kanonischer Workspace und Mailbox-Endpunkt/Benutzer/Ordner bestimmen den Store. Nur ein Prozess kann ihn besitzen. Der Wechsel des Kontos legt eine separate Basislinie an; UIDVALIDITY-Änderungen überspringen ebenfalls die bestehenden Ordnerinhalte.

Der Adapter speichert eine In-Flight-UID vor dem Start einer Aufgabe und eine `outboundPending`-Nachrichten-ID vor jedem SMTP-Versand, einschließlich proaktiver Sendungen. Er entfernt jeden Datensatz nach Abschluss der entsprechenden Operation. Wenn der Prozess während der Ausführung stoppt oder SMTP ein unsicheres Ergebnis zurückgibt, bleibt der Datensatz bestehen. Der Neustart meldet den State-Pfad, ausstehende UIDs und ausgehende Nachrichten-IDs und verweigert deren Replay. Stoppe den Channel, inspiziere das Postfach und die Aufgaben-Nebenwirkungen und entferne nur abgestimmte UIDs aus dem `pending`-Array des State und abgestimmte ausgehende IDs aus `outboundPending` vor dem Neustart. Halte Cursor und Thread-Metadaten intakt. Lösche die State-Datei nicht als Retry-Mechanismus: Ihr Fehlen erzeugt eine neue Basislinie und überspringt vorhandene E-Mails.

E-Mail-Thread-Identifier und Admission-Fortschritt überleben Neustarts. Die Wiederherstellung der Agent-Historie folgt der Channel-Runtime: Der aktuelle Standalone-`channel start`-Pfad stellt seine gespeicherten Agent-Sessions bei Kaltstart nicht wieder her, während Daemon-Worker ihre Routen wiederherstellen.

Agenten-Nebenwirkungen, SMTP-Akzeptanz und ein lokaler Cursor können nicht in einer Transaktion committet werden. Das Stoppen des Channels blockiert wartende Turns, bevor sie Agenten-Arbeit starten. Bereits im Agenten laufende Operationen können dennoch abschließen. Diese Recovery-Richtlinie vermeidet die automatische Wiederausführung unsicherer Arbeit; sie erfordert manuelle Abstimmung nach Unterbrechungen. Korrupter/unlesbarer Zustand blockiert ebenfalls den Start. Alte Anhangverzeichnisse werden nach der Abstimmung und vor dem Empfang neuer Arbeit entfernt.

Provider-OAuth, umfangreiche HTML-Ausgabe, Mailbox-Verwaltung, S/MIME, PGP und Kalenderverarbeitung liegen außerhalb dieser Version.