# GitHub

Dieser Leitfaden behandelt das Einrichten eines Qwen Code Channels, der GitHub-Benachrichtigungen überwacht und auf Erwähnungen, Review-Anfragen, Zuweisungen und verfolgte Thread-Aktivitäten reagiert.

## Voraussetzungen

- Ein GitHub-Konto, authentifiziert mit den benötigten Berechtigungen zum Lesen von Benachrichtigungen und Posten von Kommentaren
- Die [GitHub CLI](https://cli.github.com/) installiert auf dem Host, der Qwen Code ausführt, bei Verwendung der lokalen `gh`-Authentifizierung

Verwende ein dediziertes Bot-Konto, wenn das authentifizierte Konto auch den Channel betreiben muss. GitHub generiert keine benutzbare Benachrichtigung für die eigene Aktivität des Kontos, und der Adapter ignoriert seine eigenen Kommentare, um Antwort-Schleifen zu verhindern.

## Authentifizierung

Um die GitHub-CLI-Anmeldung auf dem Qwen Code-Host wiederzuverwenden, authentifiziere `gh` und setze explizit `useLocalGh: true` in der Channel-Konfiguration:

```bash
gh auth login
```

Lokale `gh`-Authentifizierung ist kontoweit und kann Benachrichtigungen von jedem Repository sichtbar für dieses GitHub-Konto offenlegen. Aktiviere sie nur, wenn der Workspace-Operator vertrauenswürdig ist, dieses Konto zu verwenden. Konfiguriere andernfalls einen dedizierten PAT.

Für GitHub Enterprise Server authentifiziere denselben Host, der von `baseUrl` verwendet wird:

```bash
gh auth login --hostname github.example.com
```

Du kannst stattdessen einen klassischen Personal Access Token (PAT) konfigurieren. Ein expliziter `token` überschreibt die lokale `gh`-Authentifizierung. Der PAT benötigt diese Scopes:

- **notifications** — Benachrichtigungs-Threads lesen
- **public_repo** (oder **repo** für private Repos) — Kommentare posten

## Konfiguration

Füge den Channel zu `~/.qwen/settings.json` hinzu:

```json
{
  "channels": {
    "my-github": {
      "type": "github",
      "useLocalGh": true,
      "pollInterval": 60000,
      "reasonFilter": ["mention", "review_requested", "assign"],
      "senderPolicy": "allowlist",
      "allowedUsers": ["operator-github-username"],
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "blockStreaming": "off",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Um die lokale `gh`-Authentifizierung mit einem PAT zu überschreiben, füge `"token": "$GITHUB_TOKEN"` zum Channel hinzu und setze die Umgebungsvariable vor dem Start von Qwen Code:

```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

Das authentifizierte Konto kann seinen eigenen Channel nicht auslösen. Wenn dieses Konto den Channel betreiben muss, authentifiziere ein separates Bot-Konto und füge nur Operator-Konten in `allowedUsers` ein. Der Start lehnt eine Allowlist ab, die nur das authentifizierte Konto enthält, und warnt, wenn es zusammen mit anderen Operatoren erscheint.

### GitHub Enterprise

Für GitHub Enterprise Server setze `baseUrl`:

```json
{
  "baseUrl": "https://github.example.com/api/v3"
}
```

Lokale `gh`-Authentifizierung erfordert eine HTTPS-`baseUrl`, damit das Daemon-Host-Credential nicht über HTTP im Klartext gesendet werden kann.

## Konfigurationsoptionen

| Option                  | Standard                 | Beschreibung                                                                       |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `token`                 | nicht gesetzt            | Optionaler klassischer PAT mit `notifications`-Scope; überschreibt lokale `gh`-Authentifizierung |
| `useLocalGh`            | `false`                  | Explizit die kontoweite GitHub-CLI-Authentifizierung des Daemon-Hosts wiederverwenden |
| `pollInterval`          | `60000`                  | Poll-Intervall in ms                                                               |
| `baseUrl`               | `https://api.github.com` | API-Basis-URL (für GHE)                                                            |
| `groupPolicy`           | `"disabled"`             | Muss `"open"`, `"allowlist"` mit dem Repo (`owner/repo`) in `groups` aufgelistet, oder `"pairing"` mit genehmigtem Repo sein, damit Benachrichtigungen fließen können |
| `senderPolicy`          | `"allowlist"`            | Wer den Bot auslösen kann                                                          |
| `groups.*.requireMention` | `true`                 | @Erwähnungen für gewöhnliche Kommentare erforderlich; direkte Benachrichtigungsgründe laufen trotzdem |
| `blockStreaming`          | `"off"`                  | Immer auf `"off"` erzwungen; zwischengeschriebene Modell-Chunks werden nicht veröffentlicht; `"on"` wird nicht unterstützt |
| `reasonFilter`          | nicht gesetzt            | Optionale Allowlist von GitHub-Benachrichtigungsgründen zur Verarbeitung            |

Verwende `reasonFilter`, um laute Benachrichtigungsklassen wie `ci_activity` oder `state_change` auszufiltern. Verwende nicht `reasonFilter: ["mention"]` als Ersatz für `groups.*.requireMention`: GitHubs `mention`-Grund ist auf Thread-Ebene klebrig (sticky), sodass echte neue @Erwähnungen später unter `comment`, `subscribed`, `author` oder anderen Gründen eintreffen können und übersprungen würden.

Gültige `reasonFilter`-Werte sind `mention`, `review_requested`, `assign`, `author`, `comment`, `ci_activity`, `manual`, `state_change`, `subscribed`, `team_mention`, `security_alert`, `approval_requested`, `invitation`, `member_feature_requested` und `security_advisory_credit`.

Gefilterte Benachrichtigungen werden erst als gelesen markiert, nachdem die gesamte akzeptierte Arbeit im Poll-Fenster abgeschlossen ist. Das spätere Entfernen des Filters spielt Benachrichtigungen nicht erneut ab, die der Channel bereits übersprungen hat.

## ⚠️ Sicherheit

Bei einem **öffentlichen Repository** erlaubt `senderPolicy: "open"` **jedem GitHub-Benutzer**, der einen unterstützten Benachrichtigungsgrund auslöst, Prompts einzureichen, die den Agenten in deinem `cwd` steuern. Dies umfasst das Lesen von Code, das Ausgeben von Tokens, das Posten von Kommentaren und (je nach Genehmigungsrichtlinie) das Ausführen von Tools.

Verwende immer `senderPolicy: "allowlist"` mit expliziten `allowedUsers` bei öffentlichen Repos.

Allowlist- und Pairing-Einträge folgen dem **Benutzernamen**, nicht der unveränderlichen Konto-ID. Wenn ein auf der Allowlist stehender Benutzer sein GitHub-Konto umbenennt, entferne den veralteten Eintrag — GitHub gibt den alten Benutzernamen zur Beanspruchung durch andere frei, und der neue Inhaber würde die Allowlist-/Pairing-Autorisierung erben.

Beachte, dass unter `groupPolicy: "pairing"` der Zugriff pro Repository gewährt wird: Sobald ein Repository genehmigt ist, kann **jeder GitHub-Benutzer** den Bot über die Issues und Pull Requests dieses Repositories steuern. Der gesamte GitHub-Traffic ist Gruppen-Traffic, daher beschränken `senderPolicy` und `allowedUsers` nicht die Mitglieder eines genehmigten Repositories. Genehmigungen werden über den vollständigen Repository-Namen (`owner/repo`) geführt, der sich bei Umbenennung oder Transfer ändert — widerrufe veraltete Gruppen-Genehmigungen nach jeder Repository-Umbenennung, jedem Transfer oder jeder Löschung.

## Erwähnungserkennung

Der Adapter erkennt Erwähnungen, indem er Kommentartext und Erstkontakt-Issue- oder PR-Bodys nach `@bot-username` durchsucht, mit einem case-insensitiven Regex. Er vertraut nicht allein auf `reason: "mention"`, da dieser Wert auf Thread-Ebene klebrig ist. Andere Gründe wählen Review-, Triage-, Folgethread- oder Fallback-Prompts aus.

## Funktionsweise

Der Adapter verwendet GitHubs Notifications-API als Wecksignal:

1. **Poll** `GET /notifications` nach ungelesenen Threads
2. **Aufzählung** von Kommentaren über `listComments` innerhalb eines cursorbasierten Zeitfensters
3. **Akzeptierte Arbeit persistieren** vor dem Dispatch, einschließlich des Quell-Envelopes und der Deduplizierungsschlüssel
4. **Dispatch** nach Benachrichtigungsgrund: striktes Erwähnungs-Matching, Pull-Request-Review, Issue-Triage, Folgethread-Kommentaraggregation oder Fallback pro Kommentar
5. **Poll-Fenster commiten** erst nachdem akzeptierte Arbeit abgeschlossen ist: Benachrichtigungen als gelesen markieren und den Cursor vorrücken
6. **Erstkontakt-Fallback**: Ein brandneuer ungelesener Issue/PR-Body kann verarbeitet werden, wenn kein Kommentar dispatched wurde; Erwähnungsbenachrichtigungen erfordern weiterhin eine tatsächliche Body-Erwähnung

Das Kommentarfenster ist `(previousCursor, currentMaxUpdatedAt]`. Akzeptierte, laufende und fehlgeschlagene Tasks werden unter `~/.qwen/channels/<workspace-scope>/` mit privaten Dateiberechtigungen gespeichert. Beim Start stellt der Channel diese Tasks wieder her, bevor er erneut GitHub pollt. Fehlgeschlagene Tasks werden bis zu drei Mal versucht, dann terminal; abgebrochene Tasks sind terminal und werden nicht erneut ausgeführt. Ein Task, dessen finale Antwort bereits gepostet, unterdrückt oder für einen definitiven No-Write-Retry eingereiht wurde, wird nicht erneut ausgeführt.

Der Benachrichtigungs-Cursor rückt nicht vor, während wiederherstellbare Tasks verbleiben oder wenn eingehender Task-Status nicht gelesen oder geschrieben werden kann. Dies verhindert, dass ein Crash oder Agentenfehler einen akzeptierten Kommentar verliert, und bewahrt die Deduplizierungsschlüssel, die benötigt werden, um einen zweiten Dispatch aus dem Benachrichtigungs-Feed zu vermeiden.

Nicht-Kommentar-Aktivitäten (Push, Label-Änderungen) aktualisieren das `updated_at` der Benachrichtigung, erzeugen aber null neue Kommentare im Fenster, sodass erneut abgerufene Threads übersprungen werden, ohne den Agenten auszulösen.

## Response-Feedback

Für einen akzeptierten Issue- oder Pull-Request-Kommentar fügt der Channel GitHubs `👀`-Reaktion hinzu, während der Agent arbeitet, und entfernt sie dann, wenn der Run abgeschlossen ist, fehlschlägt oder abgebrochen wird. Beide Operationen sind Best-Effort: Ein Reaktions-API- oder Berechtigungsfehler wird protokolliert und verhindert niemals die finale Antwort.

### Final-Only-Ausgabe

Der GitHub-Channel erzwingt immer Final-Only-Delivery. Der Adapter setzt `blockStreaming` auf `"off"`, sodass zwischengeschriebene Modell-Chunks niemals als separate Kommentare veröffentlicht werden und `blockStreaming: "on"` nicht unterstützt wird.

```json
{
  "blockStreaming": "off"
}
```

Wenn GitHub eine definitive No-Write-Delivery-Fehlermeldung zurückgibt, wie etwa eine Rate-Limit-Antwort, speichert der Channel die finale Antwort in
`~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-pending-deliveries.json`
mit privaten Dateiberechtigungen und versucht sie beim nächsten Channel-Start erneut. Der
entsprechende eingehende Task verbleibt im `reply_pending`-Status, bis diese Delivery
erfolgreich ist oder einen definitiven terminalen Fehler erreicht. Mehrdeutige Delivery-Fehler
werden nicht automatisch erneut versucht, da GitHub den Kommentar möglicherweise erstellt hat.

## Bekannte Einschränkungen

- **Erster Start überspringt bestehende ungelesene Benachrichtigungen.** Der Cursor wird beim ersten Start auf "jetzt" initialisiert. Benachrichtigungen, die vor dem Bot-Start erstellt wurden, werden nicht verarbeitet, es sei denn, der Thread erhält danach neue Aktivität.
- Wenn ein Benutzer eine Benachrichtigung auf github.com als gelesen markiert, bevor der Bot seinen Poll-Zyklus durchführt, verarbeitet der Bot sie nicht.
- Der Bot liest keine Kommentare vor dem aktuellen Polling-Fenster; `author`- und `comment`-Benachrichtigungen können bis zu 20 Kommentare aus diesem Fenster aggregieren.
- Inline-PR-Review-Kommentare und Review-Summary-Bodys werden nicht aufgezählt; nur Issue/PR-Kommentare werden verarbeitet.
- Das ausgewählte Credential muss die Notifications API unterstützen. Fine-grained PATs unterstützen sie nicht; verwende lokale `gh`-Authentifizierung oder einen klassischen PAT mit `notifications`-Scope.

## Channel starten

```bash
qwen channel start my-github
```
