# Headless-Modus

Der Headless-Modus ermöglicht es Ihnen, Qwen Code programmatisch über Kommandozeilenskripte und Automatisierungswerkzeuge ohne interaktive Benutzeroberfläche auszuführen. Dies ist ideal für Skripterstellung, Automatisierung, CI/CD-Pipelines und die Entwicklung KI-gestützter Werkzeuge.

## Übersicht

Der Headless-Modus bietet eine headless-Schnittstelle zu Qwen Code, die:

- Eingabeaufforderungen über Kommandozeilenargumente oder stdin akzeptiert
- Strukturierte Ausgabe (Text oder JSON) zurückgibt
- Dateiumleitung und Piping unterstützt
- Automatisierungs- und Skripting-Workflows ermöglicht
- Einheitliche Exit-Codes für die Fehlerbehandlung bereitstellt
- Vorherige Sitzungen im Kontext des aktuellen Projekts für mehrstufige Automatisierung fortsetzen kann

## Grundlegende Verwendung

### Direkte Eingabeaufforderungen

Verwenden Sie das Flag `--prompt` (oder `-p`), um im Headless-Modus zu laufen:

```bash
qwen --prompt "Was ist maschinelles Lernen?"
```

### Stdin-Eingabe

Leiten Sie die Eingabe von Ihrem Terminal an Qwen Code weiter:

```bash
echo "Erkläre diesen Code" | qwen
```

### Kombination mit Dateieingabe

Lesen Sie aus Dateien und verarbeiten Sie sie mit Qwen Code:

```bash
cat README.md | qwen --prompt "Fasse diese Dokumentation zusammen"
```

### Frühere Sitzungen fortsetzen (Headless)

Wiederverwendung des Gesprächskontexts aus dem aktuellen Projekt in Headless-Skripten:

```bash
# Die neueste Sitzung für dieses Projekt fortsetzen und eine neue Eingabeaufforderung ausführen
qwen --continue -p "Führe die Tests erneut aus und fasse Fehler zusammen"

# Eine bestimmte Sitzungs-ID direkt fortsetzen (keine Benutzeroberfläche)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Wende das Follow-up-Refactoring an"
```

> [!note]
>
> - Sitzungsdaten sind projektspezifisch als JSONL unter `~/.qwen/projects/<bereinigtes-cwd>/chats` gespeichert.
> - Stellt den Gesprächsverlauf, Tool-Ausgaben und Chat-Komprimierungs-Checkpoints wieder her, bevor die neue Eingabeaufforderung gesendet wird.

## Hauptsitzungs-Prompt anpassen

Sie können den System-Prompt der Hauptsitzung für einen einzelnen CLI-Durchlauf ändern, ohne gemeinsame Speicherdateien zu bearbeiten.

### Integrierten System-Prompt überschreiben

Verwenden Sie `--system-prompt`, um den integrierten Hauptsitzungs-Prompt von Qwen Code für den aktuellen Durchlauf zu ersetzen:

```bash
qwen -p "Überprüfe diesen Patch" --system-prompt "Du bist ein knapper Release-Reviewer. Melde nur blockierende Probleme."
```

### Zusätzliche Anweisungen anhängen

Verwenden Sie `--append-system-prompt`, um den integrierten Prompt zu behalten und zusätzliche Anweisungen für diesen Durchlauf hinzuzufügen:

```bash
qwen -p "Überprüfe diesen Patch" --append-system-prompt "Sei knapp und konzentriere dich auf konkrete Befunde."
```

Sie können beide Flags kombinieren, wenn Sie einen benutzerdefinierten Basis-Prompt plus eine zusätzliche laufspezifische Anweisung wünschen:

```bash
qwen -p "Fasse dieses Repository zusammen" \
  --system-prompt "Du bist ein Migrationsplaner." \
  --append-system-prompt "Gib genau drei Aufzählungspunkte zurück."
```

> [!note]
>
> - `--system-prompt` gilt nur für die Hauptsitzung des aktuellen Durchlaufs.
> - Geladene Memory- und Kontextdateien wie `QWEN.md` werden weiterhin nach `--system-prompt` angehängt.
> - `--append-system-prompt` wird nach dem integrierten Prompt und geladenem Memory angewendet und kann zusammen mit `--system-prompt` verwendet werden.

## Ausgabeformate

Qwen Code unterstützt mehrere Ausgabeformate für verschiedene Anwendungsfälle:

### Textausgabe (Standard)

Standardmäßige menschenlesbare Ausgabe:

```bash
qwen -p "Was ist die Hauptstadt von Frankreich?"
```

Antwortformat:

```
Die Hauptstadt von Frankreich ist Paris.
```

### JSON-Ausgabe

Gibt strukturierte Daten als JSON-Array zurück. Alle Nachrichten werden gepuffert und zusammen ausgegeben, wenn die Sitzung abgeschlossen ist. Dieses Format ist ideal für programmatische Verarbeitung und Automatisierungsskripte.

Die JSON-Ausgabe ist ein Array von Nachrichtenobjekten. Die Ausgabe enthält mehrere Nachrichtentypen: Systemnachrichten (Sitzungsinitialisierung), Assistentennachrichten (KI-Antworten) und Ergebnismeldungen (Ausführungszusammenfassung).

#### Beispielverwendung

```bash
qwen -p "Was ist die Hauptstadt von Frankreich?" --output-format json
```

Ausgabe (am Ende der Ausführung):

```json
[
  {
    "type": "system",
    "subtype": "session_start",
    "uuid": "...",
    "session_id": "...",
    "model": "qwen3-coder-plus",
    ...
  },
  {
    "type": "assistant",
    "uuid": "...",
    "session_id": "...",
    "message": {
      "id": "...",
      "type": "message",
      "role": "assistant",
      "model": "qwen3-coder-plus",
      "content": [
        {
          "type": "text",
          "text": "Die Hauptstadt von Frankreich ist Paris."
        }
      ],
      "usage": {...}
    },
    "parent_tool_use_id": null
  },
  {
    "type": "result",
    "subtype": "success",
    "uuid": "...",
    "session_id": "...",
    "is_error": false,
    "duration_ms": 1234,
    "result": "Die Hauptstadt von Frankreich ist Paris.",
    "usage": {...}
  }
]
```

### Stream-JSON-Ausgabe

Das Stream-JSON-Format gibt JSON-Nachrichten sofort aus, sobald sie während der Ausführung auftreten, und ermöglicht so eine Echtzeitüberwachung. Dieses Format verwendet zeilenweise getrenntes JSON, wobei jede Nachricht ein vollständiges JSON-Objekt in einer einzelnen Zeile ist.

```bash
qwen -p "Erkläre TypeScript" --output-format stream-json
```

Ausgabe (streaming, während Ereignisse auftreten):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

In Kombination mit `--include-partial-messages` werden zusätzliche Stream-Ereignisse in Echtzeit ausgegeben (message_start, content_block_delta, usw.) für Echtzeit-UI-Updates.

```bash
qwen -p "Schreibe ein Python-Skript" --output-format stream-json --include-partial-messages
```

### Eingabeformat

Der Parameter `--input-format` steuert, wie Qwen Code Eingaben von der Standardeingabe konsumiert:

- **`text`** (Standard): Standardtexteingabe von stdin oder Kommandozeilenargumenten
- **`stream-json`**: JSON-Nachrichtenprotokoll über stdin für bidirektionale Kommunikation

> **Hinweis:** Der Stream-Json-Eingabemodus ist derzeit im Aufbau und für die SDK-Integration vorgesehen. Er erfordert, dass `--output-format stream-json` gesetzt ist.

### Dateiumleitung

Ausgabe in Dateien speichern oder zu anderen Befehlen weiterleiten:

```bash
# In Datei speichern
qwen -p "Erkläre Docker" > docker-explanation.txt
qwen -p "Erkläre Docker" --output-format json > docker-explanation.json

# An Datei anhängen
qwen -p "Füge weitere Details hinzu" >> docker-explanation.txt

# An andere Tools weiterleiten
qwen -p "Was ist Kubernetes?" --output-format json | jq '.response'
qwen -p "Erkläre Microservices" | wc -w
qwen -p "Liste Programmiersprachen auf" | grep -i "python"

# Stream-JSON-Ausgabe für Echtzeitverarbeitung
qwen -p "Erkläre Docker" --output-format stream-json | jq '.type'
qwen -p "Schreibe Code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Konfigurationsoptionen

Wichtige Kommandozeilenoptionen für die Headless-Nutzung:

| Option                         | Beschreibung                                                              | Beispiel                                                                    |
| ------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `--prompt`, `-p`               | Im Headless-Modus ausführen                                               | `qwen -p "Abfrage"`                                                         |
| `--output-format`, `-o`        | Ausgabeformat angeben (text, json, stream-json)                           | `qwen -p "Abfrage" --output-format json`                                    |
| `--input-format`               | Eingabeformat angeben (text, stream-json)                                 | `qwen --input-format text --output-format stream-json`                      |
| `--include-partial-messages`   | Partielle Nachrichten in die Stream-JSON-Ausgabe aufnehmen                | `qwen -p "Abfrage" --output-format stream-json --include-partial-messages`  |
| `--system-prompt`              | System-Prompt der Hauptsitzung für diesen Durchlauf überschreiben         | `qwen -p "Abfrage" --system-prompt "Du bist ein knapper Reviewer."`         |
| `--append-system-prompt`       | Zusätzliche Anweisungen an den Hauptsitzungs-Prompt anhängen              | `qwen -p "Abfrage" --append-system-prompt "Konzentriere dich auf konkrete Befunde."` |
| `--debug`, `-d`                | Debug-Modus aktivieren                                                    | `qwen -p "Abfrage" --debug`                                                 |
| `--all-files`, `-a`            | Alle Dateien in den Kontext aufnehmen                                     | `qwen -p "Abfrage" --all-files`                                             |
| `--include-directories`        | Zusätzliche Verzeichnisse aufnehmen                                       | `qwen -p "Abfrage" --include-directories src,docs`                          |
| `--yolo`, `-y`                 | Alle Aktionen automatisch genehmigen                                      | `qwen -p "Abfrage" --yolo`                                                  |
| `--approval-mode`              | Genehmigungsmodus festlegen                                                | `qwen -p "Abfrage" --approval-mode auto_edit`                               |
| `--continue`                   | Die letzte Sitzung für dieses Projekt fortsetzen                          | `qwen --continue -p "Mach da weiter, wo wir aufgehört haben"`               |
| `--resume [SessionId]`         | Eine bestimmte Sitzung fortsetzen (oder interaktiv auswählen)             | `qwen --resume 123e... -p "Beende das Refactoring"`                         |
| `--max-session-turns`          | Anzahl der Benutzer-/Modell-/Tool-Durchläufe im Durchlauf begrenzen       | `qwen -p "..." --max-session-turns 30`                                      |
| `--max-wall-time`              | Wanduhrzeit-Budget; akzeptiert `90` (s), `30s`, `5m`, `1h`, `1.5h`       | `qwen -p "..." --max-wall-time 10m`                                         |
| `--max-tool-calls`             | Kumulatives Tool-Aufruf-Budget für den Durchlauf                          | `qwen -p "..." --max-tool-calls 50`                                         |

Vollständige Details zu allen verfügbaren Konfigurationsoptionen, Einstellungsdateien und Umgebungsvariablen finden Sie im [Konfigurationsleitfaden](../configuration/settings).

## Sicherheit in unbeaufsichtigten Durchläufen

Headless-/CI-Durchläufe in Kombination mit `--yolo` (oder `--approval-mode=yolo`) genehmigen automatisch jeden Tool-Aufruf, einschließlich `shell`, `write` und `edit`. **`--yolo` aktiviert keine Sandbox** – diese Tools laufen auf der Berechtigungsstufe des Host-Prozesses. Wenn Qwen Code diese Kombination ohne konfigurierte Sandbox erkennt, gibt es beim Start eine einzeilige Warnung auf stderr aus. Unterdrücken Sie die Warnung mit `QWEN_CODE_SUPPRESS_YOLO_WARNING=1`, sobald Sie den Kompromiss geprüft haben.

### Durchlauf-Budgets

Qwen Code kann einen unbeaufsichtigten Durchlauf abbrechen, wenn einer der folgenden Schwellenwerte überschritten wird. Jeder ist standardmäßig `-1` (unbegrenzt); das Setzen eines beliebigen reicht aus, um wildes Verhalten zu begrenzen. Sie werden kooperativ gegen denselben `AbortController` durchgesetzt, der bereits SIGINT trägt, sodass ein Budget-Abbruch einen strukturierten `FatalBudgetExceededError` (Exit-Code **55**) ausgibt – unterscheidbar vom Turn-Cap-Exit-Code 53 und SIGINTs 130, sodass CI-Skripte nach dem Grund verzweigen können.

| Flag                    | Settings-Key                   | Was es begrenzt                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`       | `model.maxWallTimeSeconds`     | Wanduhrzeitdauer des gesamten Durchlaufs. Flag akzeptiert `90` (s), `30s`, `5m`, `1h`, `1.5h` (Bruchteileinheiten unterstützt). Minimum 1s – Werte unterhalb einer Sekunde werden als Tippfehler abgelehnt. Settings in Sekunden.                                   |
| `--max-tool-calls`      | `model.maxToolCalls`           | Kumulative Tool-Aufrufe auf oberster Ebene, die von der Hauptschleife ausgelöst werden (zählt Erfolge _und_ Fehler – das Modell verbraucht bei Fehlern weiterhin Token). Siehe „Umfang“ unten für Ausnahmen bei Subagenten/strukturierter Ausgabe.                    |
| `--max-session-turns`   | `model.maxSessionTurns`        | Anzahl der Benutzer-/Modell-/Tool-Durchläufe; bereits vorhanden. Beendet mit Exit-Code 53 bei Überschreitung (unterscheidbar von Budget-Exit 55).                                                                                                                     |

#### Umfang

- **`--max-tool-calls` zählt nur Aufrufe auf oberster Ebene.** Wenn das Modell das `agent`-Tool aufruft, zählt der Dispatch als **1**; innere Tool-Aufrufe, die vom gestarteten Subagenten ausgeführt werden, werden **nicht** gezählt. Ein Modell, das Arbeit über Subagenten kanalisiert, kann unter einem kleinen Budget auf oberster Ebene unbegrenzte innere Arbeit leisten. Kombinieren Sie mit `--exclude-tools agent`, wenn Sie eine strengere Begrenzung benötigen.
- **`structured_output` ist von `--max-tool-calls` ausgenommen.** Unter `--json-schema` ist der terminale `structured_output`-Aufruf des Modells der „Ich bin fertig“-Vertrag, keine echte Arbeit – er wird nicht gegen `--max-tool-calls` gezählt, damit eine budgetnahe Fertigstellung nicht als falsch positiv abgebrochen wird. Die Ausnahme ist bedingungslos (einschließlich fehlgeschlagener Ajv-Validierungen), sodass ein Modell, das in einer Wiederholungsschleife für fehlerhafte Ausgaben steckt, NICHT durch `--max-tool-calls` begrenzt wird; kombinieren Sie mit `--max-session-turns` oder `--max-wall-time`, um Wiederholungen zu begrenzen.
- **`structured_output` ist NICHT von `--max-session-turns` ausgenommen.** Dieser Zähler ist bereits vorhanden und erhöht sich bei jedem Durchlauf, einschließlich des terminalen Vertrags. Dimensionieren Sie `--max-session-turns` auf `N+1`, wenn Sie `N` echte Arbeitsdurchläufe unter `--json-schema` zulassen möchten.
- **Einzeldurchlauf vs. `--input-format stream-json`:** Im Stream-Json-Eingabemodus setzt der Daemon die Budgetzähler zu Beginn jeder Benutzernachricht zurück; das Budget gilt pro Nachricht, nicht pro Prozess.
- **`qwen serve` / ACP-Sitzungen:** Der ACP-Sitzungspfad des Daemons berücksichtigt derzeit NICHT `--max-wall-time` / `--max-tool-calls` aus settings.json. Diese Budgets gelten nur für Einzeldurchläufe von `qwen -p` und für `--input-format stream-json`-Sitzungen. (`qwen serve` gibt die YOLO-ohne-Sandbox-Warnung beim Start aus, wenn `tools.approvalMode: 'yolo'` in den Einstellungen gesetzt ist.)

### Empfohlene Kombinationen

- **Vertrauenswürdige, isolierte Umgebung (ephemerer CI-Runner, Container):** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Legen Sie ein Turn-Budget und ein Wanduhrzeit-Budget fest, damit ein feststeckender Agent nicht Ihre CI-Minuten verbraucht, und erfassen Sie `--output-format json` für die Nutzungs-/Tool-Aufruf-Prüfung nach dem Durchlauf.
- **Lokaler Rechner oder gemeinsam genutzte Infrastruktur:** Übergeben Sie auch `--sandbox` (oder setzen Sie `QWEN_SANDBOX=1`), damit Shell-/Write-/Edit-Tools innerhalb des Sandbox-Images ausgeführt werden.
- **Langlaufender CI mit Wiederholung bei Ratenbegrenzung:** Kombinieren Sie `QWEN_CODE_UNATTENDED_RETRY=1` mit `--max-wall-time`. Die Wiederholungs-Umgebungsvariable hält den Durchlauf über vorübergehende 429-/529-Antworten am Leben; das Wanduhrzeit-Budget stellt sicher, dass ein dauerhaft fehlschlagender Anbieter den Job nicht unbegrenzt verlängern kann.
- **Begrenzte Prüfung/Erkundung:** Für schreibgeschützte Aufgaben begrenzt `--max-tool-calls 25`, wie aggressiv das Modell grep/read verwenden kann. Kombinieren Sie mit `--exclude-tools shell,write,edit`, um die Begrenzung sinnvoll zu machen.

## Beispiele

### Code-Review

```bash
cat src/auth.py | qwen -p "Überprüfe diesen Authentifizierungscode auf Sicherheitsprobleme" > security-review.txt
```

### Commit-Nachrichten generieren

```bash
result=$(git diff --cached | qwen -p "Schreibe eine prägnante Commit-Nachricht für diese Änderungen" --output-format json)
echo "$result" | jq -r '.response'
```

### API-Dokumentation

```bash
result=$(cat api/routes.js | qwen -p "Generiere OpenAPI-Spezifikation für diese Routen" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Batch-Code-Analyse

```bash
for file in src/*.py; do
    echo "Analysiere $file..."
    result=$(cat "$file" | qwen -p "Finde potenzielle Fehler und schlage Verbesserungen vor" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Analyse abgeschlossen für $(basename "$file")" >> reports/progress.log
done
```

### PR-Code-Review

```bash
result=$(git diff origin/main...HEAD | qwen -p "Überprüfe diese Änderungen auf Fehler, Sicherheitsprobleme und Codequalität" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Log-Analyse

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analysiere diese Fehler und schlage Ursache und Korrekturen vor" > error-analysis.txt
```

### Release-Notes-Generierung

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generiere Release Notes aus diesen Commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Modell- und Tool-Nutzungsverfolgung

```bash
result=$(qwen -p "Erkläre dieses Datenbankschema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) verwendet mit Modellen: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Aktuelle Nutzungstrends:"
tail -5 usage.log
```

## Ausdauernder Wiederholungsmodus

Wenn Qwen Code in CI/CD-Pipelines oder als Hintergrunddaemon läuft, sollte eine kurze API-Störung (Ratenbegrenzung oder Überlastung) keine mehrstündige Aufgabe abbrechen. Der **ausdauernde Wiederholungsmodus** lässt Qwen Code vorübergehende API-Fehler unbegrenzt wiederholen, bis der Dienst sich erholt.

### Wie es funktioniert

- **Nur vorübergehende Fehler**: HTTP 429 (Rate Limit) und 529 (Überlastet) werden unbegrenzt wiederholt. Andere Fehler (400, 500 usw.) schlagen weiterhin normal fehl.
- **Exponentielles Backoff mit Obergrenze**: Wiederholungsverzögerungen wachsen exponentiell, sind jedoch auf **5 Minuten** pro Wiederholung begrenzt.
- **Heartbeat-Keepalive**: Während langer Wartezeiten wird alle **30 Sekunden** eine Statuszeile auf stderr ausgegeben, um zu verhindern, dass CI-Runner den Prozess aufgrund von Inaktivität beenden.
- **Graceful Degradation**: Nicht vorübergehende Fehler und der interaktive Modus sind vollständig unbeeinflusst.

### Aktivierung

Setzen Sie die Umgebungsvariable `QWEN_CODE_UNATTENDED_RETRY` auf `true` oder `1` (strenge Übereinstimmung, Groß-/Kleinschreibung beachten):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Der ausdauernde Wiederholungsmodus erfordert ein **explizites Opt-in**. `CI=true` allein aktiviert ihn **nicht** – ein schnell fehlschlagender CI-Job, der stillschweigend zu einem unendlichen Wartejob wird, wäre gefährlich. Setzen Sie `QWEN_CODE_UNATTENDED_RETRY` immer explizit in Ihrer Pipeline-Konfiguration.

### Beispiele

#### GitHub Actions

```yaml
- name: Automatisierter Code-Review
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "Überprüfe alle Dateien in src/ auf Sicherheitsprobleme" \
      --output-format json \
      --yolo > review.json
```

#### Nächtliche Batch-Verarbeitung

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migriere alle Callback-basierten Funktionen zu async/await in src/" --yolo
```

#### Hintergrunddaemon

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Überprüfe alle Abhängigkeiten auf bekannte CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### Überwachung

Während des ausdauernden Wiederholungsmodus werden Heartbeat-Nachrichten auf **stderr** ausgegeben:

```
[qwen-code] Warte auf API-Kapazität... Versuch 3, Wiederholung in 45s
[qwen-code] Warte auf API-Kapazität... Versuch 3, Wiederholung in 15s
```

Diese Nachrichten halten CI-Runner am Leben und ermöglichen Ihnen die Überwachung des Fortschritts. Sie erscheinen nicht auf stdout, sodass die an andere Tools weitergeleitete JSON-Ausgabe sauber bleibt.

## Ressourcen

- [CLI-Konfiguration](../configuration/settings#command-line-arguments) – Vollständiger Konfigurationsleitfaden
- [Authentifizierung](../configuration/auth.md) – Authentifizierung einrichten
- [Befehle](../features/commands) – Referenz für interaktive Befehle
- [Tutorials](../quickstart) – Schritt-für-Schritt-Automatisierungsanleitungen