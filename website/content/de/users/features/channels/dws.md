# DingTalk Workspace (DWS)

Der DWS-Channel verwendet einen Account, der bereits über die DingTalk Workspace CLI authentifiziert wurde. Er empfängt Direkt- und Gruppennachrichten, erkennt DingTalk-Dokument-Erwähnungs-Benachrichtigungskarten und veröffentlicht die Antwort des Agenten zurück an die ursprüngliche Nachricht oder den Dokumentenkommentar.

Dies ist getrennt vom [DingTalk-Bot-Channel](./dingtalk). Verwende weiterhin `type: "dingtalk"` für einen dedizierten Anwendungsbot; verwende `type: "dws"`, wenn Qwen Code über ein bestehendes DWS-Login agieren soll.

## Voraussetzungen

Installiere DWS CLI 1.0.57 oder neuer auf dem Host, der Qwen Code ausführt, und stelle sicher, dass `dws` aus dem `PATH` dieses Prozesses auflösbar ist:

```bash
dws version --format json
```

Authentifiziere dich auf demselben Host:

```bash
dws auth login
dws profile list --format json
dws auth status --format json
```

Auf einem Headless-Server verwende `dws auth login --device`. Ein Channel pinnt genau ein bestehendes Profil beim Start. Setze `profile` auf einen exakten Profilnamen oder eine CorpId, oder lass es weg, um den mit `isCurrent` markierten Eintrag zu pinnen. Der Channel behandelt jedes DWS-Login gleich und hängt nicht von `user_id`-Metadaten ab.

## Konfiguration

Füge einen Channel zu `~/.qwen/settings.json` hinzu:

```json
{
  "channels": {
    "dws-work": {
      "type": "dws",
      "profile": "profile-name-or-corp-id",
      "senderPolicy": "pairing",
      "groupPolicy": "pairing",
      "watchTodos": true,
      "startReaction": "🤔",
      "endReaction": "赞",
      "groups": {
        "*": { "requireMention": true }
      },
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project"
    }
  }
}
```

Der YOLO-Genehmigungsmodus ist für Antwort-Bots verfügbar, die Tool-Aufrufe ohne interaktive Bestätigungen ausführen sollen:

```json
{
  "channels": {
    "dws-answers": {
      "type": "dws",
      "senderPolicy": "pairing",
      "groupPolicy": "pairing",
      "approvalMode": "yolo",
      "cwd": "/path/to/answer-bot"
    }
  }
}
```

Der YOLO-Modus genehmigt jeden Tool-Aufruf automatisch. Verwende ihn nur für einen vertrauenswürdigen Bot-Account und Workspace.

`senderPolicy` und `groupPolicy` sind standardmäßig `pairing` für einen neu verwalteten DWS-Channel. Genehmige einen Benutzer oder eine Gruppe mit dem vom Channel zurückgegebenen Code:

```bash
qwen channel pairing approve dws-work CODE
```

`senderPolicy` steuert Direktnachrichten-Absender, Autoren von Dokument-Benachrichtigungen, Ersteller nativer Todos und Absender in `open`- oder `allowlist`-Gruppen. `groupPolicy` steuert Gruppenkonversationen. Eine genehmigte Pairing-Gruppe folgt dem gemeinsamen Channel-Verhalten und autorisiert ihre Mitglieder; offene und Allowlist-Gruppen müssen zusätzlich die `senderPolicy` passieren.

`groups` steuert das Erwähnungsverhalten. Eine konkrete Gruppen-ID überschreibt `"*"`. Mit `requireMention: true` weckt nur eine @-Nachricht den Channel. Mit `requireMention: false` werden auch gewöhnliche Nachrichten empfangen, nachdem die Gruppen- und Absender-Richtlinien bestanden sind.

Gruppen-Erwähnungen verwenden zuerst den persönlichen Echtzeit-Event-Stream. Der Channel prüft außerdem alle fünf Sekunden die jüngste `@`-Nachrichtenhistorie, sodass Erwähnungen aus externen Gruppen wiederhergestellt werden, wenn DingTalk sie aus dem persönlichen Event-Stream weglässt. Nachrichten werden über beide Pfade nach Konversation und Nachrichten-ID dedupliziert.

Gewöhnliche Direktnachrichten werden auf dieselbe Weise wiederhergestellt: Eine Fünf-Sekunden-Historienprüfung treibt jede Direktnachricht erneut an, die der Echtzeit-Stream weggelassen hat, dedupliziert nach Konversation und Nachrichten-ID über beide Pfade.

Wenn eine Nachricht eine andere DingTalk-Nachricht zitiert, wird der zitierte Text als Antwortkontext für den Agenten auf beiden Pfaden – Echtzeit und Historien-Fallback – einbezogen.

## Dokument-Erwähnungen

Es gibt keine Dokument- oder Wissensbasis-Watchlist. Um eine Dokument-Aufgabe zu starten:

1. Füge einen DingTalk-Dokumentkommentar hinzu, der den authentifizierten Account @erwähnt.
2. Aktiviere die Option, die eine DingTalk-Benachrichtigung an diesen Account sendet.
3. DWS liefert die Benachrichtigungskarte über die Direktnachrichten-Historie des Accounts.

Der Channel extrahiert die Dokument-ID, den Kommentar-Schlüssel und die Anfrage aus dieser Benachrichtigung. Er liest das referenzierte Dokument für den Kontext, fügt die konfigurierte Startreaktion hinzu, während die Aufgabe läuft, und antwortet auf den ursprünglichen Dokumentkommentar. Der Echtzeit-DWS-Event-Stream wird verwendet, wenn er die Karte enthält; eine fünfsekündige inkrementelle Historienprüfung deckt Karten ab, die vom aktuellen Event-Stream weggelassen werden.

Kommentare, die keine Benachrichtigung erzeugen, werden by Design ignoriert. Doppelte Benachrichtigungsnachrichten für denselben Dokumentkommentar werden nur einmal ausgeführt. Dokument-Aufgaben folgen der `senderPolicy` und unterstützen `approvalMode` `default`, `plan` oder `yolo`; `default` wird verwendet, wenn nichts angegeben ist.

## Native Todo-Änderungen

Setze `watchTodos: true`, um die ausstehenden nativen Todos des ausgewählten DWS-Profils zu pollen, bei denen der Account als Executor zugewiesen ist. Die Option ist standardmäßig `false`, sodass das Hinzufügen eines DWS-Channels niemals bestehende Todos implizit ausführt.

Der erste erfolgreiche Scan erstellt eine Basislinie und startet keine historischen Todos. Spätere Scans starten eine Aufgabe, wenn ein Todo neu zugewiesen, wiedereröffnet wird oder sich seine handlungsfähigen Felder ändern, einschließlich Titel, Priorität, Deadline oder Assignees. Die endgültige Antwort wird als Kommentar zum ursprünglichen Todo hinzugefügt. Rein kommentarbasierte Metadaten und Änderungszeitstempel werden von der Änderungserkennung ausgeschlossen, sodass die eigene Antwort des Channels keinen Loop auslösen kann. Abschluss oder Entfernung entfernt das Todo aus der ausstehenden Menge; Wiedereröffnung erzeugt einen neuen Trigger.

Native Todos folgen der `senderPolicy` unter Verwendung der Todo-Ersteller-Identität. Unter `pairing` fügt der Channel einen Pairing-Code-Kommentar hinzu und hält das Todo ausstehend; nachdem der Ersteller lokal genehmigt wurde, kann ein späterer Poll das unveränderte Todo verarbeiten. Das Polling läuft alle 30 Sekunden und bleibt auf die aktuelle Organisation des gepinnten Profils beschränkt.

## Starten und Verifizieren

Starte den Channel direkt:

```bash
qwen channel start dws-work
```

Oder lass den Daemon ihn besitzen:

```bash
qwen serve --workspace /path/to/your/project --channel dws-work
```

Führe nicht beide Formen gleichzeitig aus, da sie sich die Channel-Service-Lease teilen.

Für die lokale Verifizierung sende eine Direktnachricht von einem anderen Account, genehmige das Pairing falls erforderlich, und stelle sicher, dass die konfigurierte Startreaktion erscheint, während die Aufgabe läuft. Wenn eine Endreaktion konfiguriert ist, stelle sicher, dass sie danach die Startreaktion ersetzt. Füge dann einen Dokumentkommentar mit aktivierter @Erwähnungs-Benachrichtigung hinzu. Der Channel sollte auf die Benachrichtigungsnachricht reagieren, das Dokument lesen und die endgültige Antwort unter dem ursprünglichen Kommentar veröffentlichen. Ein Kommentar mit deaktivierter Benachrichtigung sollte keine Aufgabe erzeugen.

Der Channel ignoriert Events von Absender-IDs, die DWS als den authentifizierten Account identifiziert, was Antwort- und Pairing-Loops verhindert, ohne die Identität aus dem Nachrichtentext abzuleiten. Das Starten der IM-Quellen erfordert diese autoritative Selbst-Identität: Wenn der authentifizierte Account keine openDingTalkId bereitstellt und keine frühere Session unter demselben Profil eine aufgezeichnet hat, verweigert der Channel die Verbindung. Ein Reconnect, der die ID vorübergehend verliert, behält die Filterung auf den zuvor aufgezeichneten Selbst-Absender-IDs bei.
