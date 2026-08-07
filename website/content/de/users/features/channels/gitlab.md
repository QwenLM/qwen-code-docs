# GitLab

Dieser Leitfaden behandelt das Einrichten eines Qwen Code Channels, der GitLab-Todos überwacht und auf Erwähnungen bei Issues und Merge Requests reagiert.

## Voraussetzungen

- Ein GitLab-Konto (oder ein dediziertes Bot-Konto)
- Ein GitLab Personal Access Token mit den Scopes `read_api` und `api`

## Token erstellen

1. Gehe zu **Preferences → Access Tokens**
2. Erstelle ein Token mit diesen Scopes:
   - **read_api** — Todos und Projektdaten lesen
   - **api** — Notes (Kommentare) bei Issues/MRs posten
3. Speichere das Token sicher als Umgebungsvariable

## Konfiguration

Füge den Channel zu `~/.qwen/settings.json` hinzu:

```json
{
  "channels": {
    "my-gitlab": {
      "type": "gitlab",
      "token": "$GITLAB_TOKEN",
      "pollInterval": 60000,
      "senderPolicy": "open",
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "action_prompt_template": {
        "mentioned": "Project: %project% | URL: %project_url% | Author: %author% | Type: %target_type% | IID: %iid% | Title: %title% | Description: %description% | TodoID: %todo_id%"
      }
    }
  }
}
```

Setze das Token als Umgebungsvariable:

```bash
export GITLAB_TOKEN="glpat-your_token_here"
```

### Self-hosted GitLab

Für self-hosted Instanzen setze `baseUrl`:

```json
{
  "baseUrl": "https://gitlab.example.com"
}
```

## Konfigurationsoptionen

| Option                   | Standard                    | Beschreibung                                              |
| ------------------------ | --------------------------- | --------------------------------------------------------- |
| `token`                  | (erforderlich)              | PAT mit `read_api` + `api` Scopes                         |
| `pollInterval`           | `60000`                     | Poll-Intervall in ms                                      |
| `baseUrl`                | `https://gitlab.com`        | GitLab-Instanz-URL                                        |
| `action_prompt_template` | (erforderlich für Verarbeitung) | Bildet GitLab-Aktionsnamen auf Metadaten-Templates ab  |
| `groupPolicy`            | `"disabled"`                | Muss `"open"` sein oder `"allowlist"` mit dem aufgelisteten Projekt |
| `senderPolicy`           | `"allowlist"`               | Wer den Bot auslösen kann                                 |

## action_prompt_template

Dieses Feld steuert, welche Todo-Aktionen verarbeitet werden und wie Metadaten gerendert werden. Nur Aktionen mit einem konfigurierten Template werden dispatched; alle anderen werden übersprungen und als erledigt markiert.

```json
{
  "action_prompt_template": {
    "mentioned": "Project: %project% | Author: %author% | Title: %title%"
  }
}
```

Die `directly_addressed`-Aktion (Kommentar, der mit `@bot` beginnt) fällt automatisch auf das `mentioned`-Template zurück, wenn nicht explizit konfiguriert.

### Verfügbare Aktionsschlüssel

| Schlüssel           | Auslöser                                                                    |
| ------------------- | --------------------------------------------------------------------------- |
| `mentioned`         | Jemand @erwähnt den Bot in einem Kommentar oder einer Beschreibung (nicht am Anfang) |
| `directly_addressed`| Ein Kommentar **beginnt mit** `@bot` (fällt auf `mentioned`-Template zurück) |
| `assigned`          | Jemand weist den Bot einem Issue/MR zu                                      |
| `review_requested`  | Jemand fordert den Bot als Reviewer bei einem MR an                         |
| `approval_required` | Ein MR erfordert die Genehmigung des Bots (Approval-Regeln)                 |
| `marked`            | Jemand markiert den Kommentar/das Issue/MR des Bots (Star)                  |
| `build_failed`      | Eine CI/CD-Pipeline schlägt beim Branch/MR des Bots fehl                    |
| `unmergeable`       | Ein MR, an dem der Bot beteiligt ist, wird unmergebar (Konflikte)           |
| `merge_train_removed`| Ein MR wird aus dem Merge-Zug entfernt                                     |

Nur in `action_prompt_template` vorhandene Schlüssel werden verarbeitet. Nicht konfigurierte Aktionen werden übersprungen und still als erledigt markiert.

### Template-Variablen

| Variable        | Wert                               |
| --------------- | ---------------------------------- |
| `%project%`     | Projektpfad (z. B. `owner/repo`)   |
| `%project_url%` | Vollständige Projekt-URL           |
| `%author%`      | Todo-Autor-Benutzername            |
| `%target_type%` | `Issue` oder `MergeRequest`        |
| `%iid%`         | Issue/MR-interne ID                |
| `%title%`       | Issue/MR-Titel                     |
| `%description%` | Issue/MR-Beschreibungstext         |
| `%todo_id%`     | GitLab-Todo-ID                     |
| `%%`            | Literales `%` (Escape)             |

Unbekannte Variablen werden unverändert in der Ausgabe beibehalten.

### Prompt-Zusammenstellung

Das Template wird in `envelope.metadata` gerendert (strukturierter Kontext). Der auslösende Text (`todo.body` oder Beschreibung) geht in `envelope.text` (Haupt-Prompt). Die Basisklasse stellt den finalen Prompt zusammen, der an den Agenten gesendet wird:

```
[alice] please fix this bug

Project: owner/repo | URL: https://gitlab.com/owner/repo | Author: alice | Type: Issue | IID: 42 | Title: Test Issue | Description: ... | TodoID: 100
```

- Zeile 1: `[sender]`-Präfix + `envelope.text` (mit entferntem `@bot`)
- Zeile 3: `envelope.metadata` (gerendertes Template, bereinigt)

Du brauchst **keine** `%body%`-Variable — der Kommentar-/Beschreibungstext ist immer der Haupt-Prompt-Inhalt, und das Template liefert ergänzenden Kontext darunter.

## ⚠️ Sicherheit

Bei einem **öffentlichen Projekt** erlaubt `senderPolicy: "open"` **jedem GitLab-Benutzer**, der den Bot @erwähnt, Prompts einzureichen, die den Agenten in deinem `cwd` steuern.

Verwende immer `senderPolicy: "allowlist"` mit expliziten `allowedUsers` bei öffentlichen Projekten.

## Erwähnungserkennung

Der Adapter setzt immer `isMentioned = true` bei dispatched Envelopes, da GitLab die Erwähnung bereits bei der Todo-Erstellung bestimmt hat. Die `action_prompt_template`-Konfiguration ist der eigentliche Ereignisfilter — nur Aktionen mit einem konfigurierten Template werden verarbeitet. Die `@bot`-Erwähnung wird vor dem Dispatch über `stripBotMention` aus dem Nachrichtentext entfernt.

### ⚠️ groupPolicy muss "open" oder "allowlist" sein

`groupPolicy` muss auf `"open"` gesetzt sein oder auf `"allowlist"` mit explizit aufgeführtem Projekt, damit Todos verarbeitet werden. Der Standardwert `"disabled"` verwirft alle Erwähnungen: Todos werden als erledigt markiert und der Cursor vorgerückt, aber kein Dispatch erfolgt. Eine Ablehnung wird protokolliert (`preflight rejected reason=group_disabled`), aber das Todo wird trotzdem konsumiert. Wenn dein Bot nicht auf Erwähnungen reagiert, prüfe, dass `groupPolicy` nicht `"disabled"` ist.

## Funktionsweise

Der Adapter verwendet GitLabs Todos-API als Nachrichtenquelle:

1. **Poll** `GET /todos?state=pending` nach neuen Todos
2. **First-Poll-Drain**: Wenn der Cursor nie initialisiert wurde (`initialized: false`), werden alle ausstehenden Todos als erledigt markiert ohne Dispatch und der Cursor wird auf die maximale Todo-ID vorgerückt. Dies verhindert eine Backlog-Flut beim ersten Start.
3. **Veraltete Todos aufräumen**: Todos mit `id <= cursor` werden als erledigt markiert (Best-Effort), um zu verhindern, dass sie bei jedem Poll erneut abgerufen werden
4. **Filtern** nach `id > cursor` und konfiguriertem `action_prompt_template`
5. **Erwähnungstyp erkennen** über den `target_url`-Anker:
   - `#note_123` vorhanden → Kommentar-Erwähnung → Text ist `todo.body` (der Kommentar)
   - Kein Anker → Beschreibungs-Erwähnung → Text ist die Issue/MR-Beschreibung
6. **Dispatch** des Envelopes über `handleInbound` (erfordert `groupPolicy: "open"` oder `"allowlist"` mit aufgeführtem Projekt)
7. **Cursor vorrücken** und **Todo als erledigt markieren** (Best-Effort)

Der Cursor (`lastProcessedId`) rückt vor, unabhängig von Dispatch-Erfolg oder -Fehler. Fehlgeschlagene Dispatches posten einen ⚠️-Fehlerkommentar beim Issue/MR und werden nicht erneut versucht — der Benutzer kann den Bot erneut erwähnen, um ein neues Todo auszulösen.

## Response-Feedback

Für eine akzeptierte Kommentar-Erwähnung (Note mit `#note_`-Anker) fügt der Channel einen 👀-Award-Emoji zur Note hinzu, während der Agent arbeitet, und entfernt ihn dann, wenn der Run abgeschlossen ist, fehlschlägt oder abgebrochen wird. Beide Operationen sind Best-Effort: Ein Award-Emoji-API- oder Berechtigungsfehler wird protokolliert und verhindert niemals die finale Antwort.

Beschreibungs-Erwähnungen (ohne `#note_`-Anker) erhalten keinen Award-Emoji, da es keine spezifische Note gibt, auf die reagiert werden kann.

## Bekannte Einschränkungen

- **Erster Start überspringt bestehende ausstehende Todos.** Der Cursor wird beim ersten Start auf `{ lastProcessedId: 0, initialized: false }` initialisiert. Beim ersten Poll-Zyklus werden alle vorbestehenden ausstehenden Todos ohne Dispatch als erledigt markiert (das `initialized`-Flag steuert dieses einmalige Drain), was eine Backlog-Flut verhindert.
- Der Bot liest keinen vorherigen Gesprächsverlauf — nur der auslösende Inhalt wird verarbeitet.
- **Vertrauliche (interne) Notes:** Wenn jemand den Bot in einer vertraulichen Note @erwähnt, enthält der Todo-Body diesen internen Text und der Agent wird ihn verarbeiten. Die Antwort des Bots wird immer als **öffentliche** Note gepostet, was interne Diskussionen offenlegen kann. GitLabs Todo-API legt die Note-Sichtbarkeit nicht offen, sodass der Adapter dies nicht filtern kann. Vermeide es, den Bot in vertraulichen Notes zu @erwähnen.
- Erfordert `read_api` + `api` PAT-Scopes. Gruppen- oder projektbezogene Token funktionieren, wenn sie diese Scopes haben.
- Todos für Epics, Designs und Alerts werden übersprungen (nur Issues und MRs werden verarbeitet).

## Channel starten

```bash
qwen channel start my-gitlab
```
