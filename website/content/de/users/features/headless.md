# Headless Mode

Der Headless-Modus ermöglicht es Ihnen, Qwen Code programmatisch über Befehlszeilenskripte und Automatisierungstools auszuführen, ohne eine interaktive Benutzeroberfläche. Dies ist ideal für Skripting, Automatisierung, CI/CD-Pipelines und die Erstellung von KI-gestützten Tools.

## Übersicht

Der Headless-Modus bietet eine headless-Schnittstelle zu Qwen Code, die:

- Eingabeaufforderungen über Befehlszeilenargumente oder stdin akzeptiert
- Strukturierte Ausgaben (Text oder JSON) zurückgibt
- Dateiumleitung und Piping unterstützt
- Automatisierungs- und Skripting-Workflows ermöglicht
- Einheitliche Exit-Codes für die Fehlerbehandlung bereitstellt
- Vorherige Sitzungen, die auf das aktuelle Projekt beschränkt sind, für mehrstufige Automatisierung fortsetzen kann

## Grundlegende Verwendung

### Direkte Prompts

Verwenden Sie das Flag `--prompt` (oder `-p`), um im Headless-Modus auszuführen:

```bash
qwen --prompt "What is machine learning?"
```

### Stdin-Eingabe

Leiten Sie Eingaben von Ihrem Terminal an Qwen Code weiter:

```bash
echo "Explain this code" | qwen
```

### Kombinieren mit Dateieingabe

Lesen Sie aus Dateien und verarbeiten Sie mit Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Vorherige Sitzungen fortsetzen (Headless)

Wiederverwendung des Gesprächskontexts aus dem aktuellen Projekt in Headless-Skripten:

```bash
# Die letzte Sitzung für dieses Projekt fortsetzen und einen neuen Prompt ausführen
qwen --continue -p "Run the tests again and summarize failures"

# Eine bestimmte Sitzungs-ID direkt fortsetzen (keine UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Sitzungsdaten sind projektspezifische JSONL-Dateien unter `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Stellt den Gesprächsverlauf, Tool-Ausgaben und Chat-Komprimierungs-Checkpoints wieder her, bevor die neue Eingabeaufforderung gesendet wird.

## Hauptsitzungs-Prompt anpassen

Sie können den System-Prompt der Hauptsitzung für einen einzelnen CLI-Durchlauf ändern, ohne gemeinsame Speicherdateien zu bearbeiten.

### Integrierten System-Prompt überschreiben

Verwenden Sie `--system-prompt`, um den integrierten Hauptsitzungs-Prompt von Qwen Code für den aktuellen Durchlauf zu ersetzen:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Zusätzliche Anweisungen anhängen

Verwenden Sie `--append-system-prompt`, um den integrierten Prompt zu behalten und zusätzliche Anweisungen für diesen Durchlauf hinzuzufügen:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Sie können beide Flags kombinieren, wenn Sie einen benutzerdefinierten Basis-Prompt plus eine zusätzliche laufspezifische Anweisung wünschen:

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` gilt nur für die Hauptsitzung des aktuellen Durchlaufs.
> - Geladene Speicher- und Kontextdateien wie `QWEN.md` werden weiterhin nach `--system-prompt` angehängt.
> - `--append-system-prompt` wird nach dem integrierten Prompt und dem geladenen Speicher angewendet und kann zusammen mit `--system-prompt` verwendet werden.

## Ausgabeformate

Qwen Code unterstützt mehrere Ausgabeformate für verschiedene Anwendungsfälle:

### Textausgabe (Standard)

Standardmäßige menschenlesbare Ausgabe:

```bash
qwen -p "What is the capital of France?"
```

Antwortformat:

```
The capital of France is Paris.
```

### JSON-Ausgabe

Gibt strukturierte Daten als JSON-Array zurück. Alle Nachrichten werden gepuffert und zusammen ausgegeben, wenn die Sitzung abgeschlossen ist. Dieses Format ist ideal für programmatische Verarbeitung und Automatisierungsskripte.

Die JSON-Ausgabe ist ein Array von Nachrichtenobjekten. Die Ausgabe enthält mehrere Nachrichtentypen: Systemnachrichten (Sitzungsinitialisierung), Assistant-Nachrichten (KI-Antworten) und Ergebnisnachrichten (Ausführungszusammenfassung).

#### Beispielverwendung

```bash
qwen -p "What is the capital of France?" --output-format json
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
          "text": "The capital of France is Paris."
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
    "result": "The capital of France is Paris.",
    "usage": {...}
  }
]
```

### Stream-JSON-Ausgabe

Das Stream-JSON-Format gibt JSON-Nachrichten sofort aus, wenn sie während der Ausführung auftreten, was eine Echtzeitüberwachung ermöglicht. Dieses Format verwendet zeilengetrenntes JSON, wobei jede Nachricht ein vollständiges JSON-Objekt in einer einzelnen Zeile ist.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Ausgabe (streaming, wenn Ereignisse auftreten):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```
In Kombination mit `--include-partial-messages` werden zusätzliche Stream-Ereignisse in Echtzeit ausgegeben (message_start, content_block_delta, usw.) für Echtzeit-UI-Updates.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Eingabeformat

Der `--input-format`-Parameter steuert, wie Qwen Code Eingaben von der Standardeingabe verarbeitet:

- **`text`** (Standard): Standard-Text-Eingabe über stdin oder Befehlszeilenargumente
- **`stream-json`**: JSON-Nachrichtenprotokoll über stdin für bidirektionale Kommunikation

> **Hinweis:** Der Stream-json-Eingabemodus befindet sich derzeit im Aufbau und ist für die SDK-Integration vorgesehen. Er erfordert, dass `--output-format stream-json` gesetzt ist.

### Dateiumleitung

Ausgabe in Dateien speichern oder an andere Befehle weiterleiten:

```bash
# In Datei speichern
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# An Datei anhängen
qwen -p "Add more details" >> docker-explanation.txt

# An andere Tools weiterleiten
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Stream-JSON-Ausgabe für Echtzeitverarbeitung
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Konfigurationsoptionen

Wichtige Befehlszeilenoptionen für den unbeaufsichtigten Betrieb:

| Option                       | Beschreibung                                                              | Beispiel                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Im unbeaufsichtigten Modus ausführen                                     | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Ausgabeformat angeben (text, json, stream-json)                          | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Eingabeformat angeben (text, stream-json)                                | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Partielle Nachrichten in die stream-json-Ausgabe einbeziehen             | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Das Haupt-System-Prompt dieser Sitzung für diesen Durchlauf überschreiben| `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Zusätzliche Anweisungen an das Haupt-System-Prompt dieser Sitzung für diesen Durchlauf anhängen | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Debug-Modus aktivieren                                                   | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | Alle Dateien in den Kontext einbeziehen                                  | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Zusätzliche Verzeichnisse einbeziehen                                    | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Alle Aktionen automatisch genehmigen                                     | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Genehmigungsmodus festlegen                                              | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Die letzte Sitzung für dieses Projekt fortsetzen                         | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Eine bestimmte Sitzung fortsetzen (oder interaktiv auswählen)            | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`        | Die Anzahl der Benutzer/Modell/Werkzeug-Runden in diesem Durchlauf begrenzen | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | Wanduhrzeit-Budget; akzeptiert `90` (s), `30s`, `5m`, `1h`, `1.5h`      | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | Kumulatives Werkzeugaufruf-Budget für diesen Durchlauf                   | `qwen -p "..." --max-tool-calls 50`                                      |

Vollständige Details zu allen verfügbaren Konfigurationsoptionen, Einstellungsdateien und Umgebungsvariablen finden Sie im [Konfigurationsleitfaden](../configuration/settings).

## Sicherheit bei unbeaufsichtigten Durchläufen

Unbeaufsichtigte / CI-Durchläufe in Kombination mit `--yolo` (oder `--approval-mode=yolo`) genehmigen automatisch jeden Werkzeugaufruf, einschließlich `shell`, `write` und `edit`. **`--yolo` aktiviert keine Sandbox** – diese Werkzeuge laufen mit den Berechtigungen des Host-Prozesses. Wenn Qwen Code diese Kombination ohne konfigurierte Sandbox erkennt, gibt es beim Start eine einzeilige Warnung auf stderr aus. Unterdrücken Sie die Warnung mit `QWEN_CODE_SUPPRESS_YOLO_WARNING=1`, nachdem Sie den Kompromiss überprüft haben.
### Budgets auf Ausführungsebene

Qwen Code kann eine unbeaufsichtigte Ausführung abbrechen, sobald einer der folgenden Schwellenwerte überschritten wird. Jeder ist standardmäßig `-1` (unbegrenzt); das Setzen eines einzigen ist ausreichend, um ausuferndes Verhalten zu begrenzen. Sie werden kooperativ gegen denselben `AbortController` durchgesetzt, der bereits SIGINT transportiert, sodass ein Budget-Abbruch einen strukturierten `FatalBudgetExceededError` (Exit-Code **55**) auslöst – unterscheidbar vom Turn-Cap-Exit-Code 53 und SIGINTs 130, damit CI-Skripte je nach Grund verzweigen können.

| Flag                  | Settings-Key                | Was es begrenzt                                                                                                                                                                                                                                                          |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds`  | Wanduhrzeit der gesamten Ausführung. Das Flag akzeptiert `90` (s), `30s`, `5m`, `1h`, `1.5h` (Bruchzahlen unterstützt). Minimum 1 s – Werte unter einer Sekunde werden als Tippfehler zurückgewiesen. Settings-Wert in Sekunden.                                           |
| `--max-tool-calls`    | `model.maxToolCalls`        | Kumulative Top-Level-Tool-Aufrufe, die von der Hauptschleife ausgelöst werden (zählt Erfolge _und_ Fehlschläge – das Modell verbraucht bei Fehlern trotzdem Tokens). Siehe „Geltungsbereich“ unten für Ausnahmen bei Subagenten / strukturierter Ausgabe.                  |
| `--max-session-turns` | `model.maxSessionTurns`     | Anzahl der Benutzer/Modell/Tool-Runden; bereits vorhanden. Beendet sich bei Überschreitung mit Code 53 (unterscheidet sich vom Budget-Exit 55).                                                                                                                            |

#### Geltungsbereich

- **`--max-tool-calls` zählt nur Top-Level-Aufrufe.** Wenn das Modell das `agent`-Tool aufruft, zählt der Aufruf als **1**; innere Tool-Aufrufe, die vom gestarteten Subagenten ausgeführt werden, werden **nicht** gezählt. Ein Modell, das Arbeit über Subagenten kanalisiert, kann unter einem kleinen Top-Level-Budget unbegrenzte innere Arbeit ausführen. Kombinieren Sie es mit `--exclude-tools agent`, wenn Sie eine strengere Begrenzung benötigen.
- **`structured_output` ist von `--max-tool-calls` ausgenommen.** Unter `--json-schema` ist der terminale `structured_output`-Aufruf des Modells der „Ich bin fertig“-Vertrag, keine echte Arbeit – er wird nicht auf `--max-tool-calls` angerechnet, sodass eine kurz vor dem Budget stehende Vervollständigung nicht als Fehlalarm abgebrochen wird. Die Ausnahme ist bedingungslos (auch bei fehlgeschlagenen Ajv-Validierungen), sodass ein Modell, das in einer Schleife fehlerhafter Ausgaben feststeckt, NICHT durch `--max-tool-calls` begrenzt wird; kombinieren Sie es mit `--max-session-turns` oder `--max-wall-time`, um Wiederholungen zu begrenzen.
- **`structured_output` ist NICHT von `--max-session-turns` ausgenommen.** Dieser Zähler ist bereits vorhanden und erhöht sich bei jeder Runde, einschließlich des terminalen Vertrags. Dimensionieren Sie `--max-session-turns` auf `N+1`, wenn Sie unter `--json-schema` `N` echte Arbeitsrunden zulassen möchten.
- **Einzelausführung vs. `--input-format stream-json`:** Im Stream-JSON-Eingabemodus setzt der Daemon die Budgetzähler zu Beginn jeder Benutzernachricht zurück; das Budget gilt pro Nachricht, nicht pro Prozess.
- **`qwen serve` / ACP-Sitzungen:** Der Daemon-ACP-Sitzungspfad berücksichtigt derzeit NICHT `--max-wall-time` / `--max-tool-calls` aus der settings.json. Diese Budgets gelten nur für Einzelausführungen mit `qwen -p` und für `--input-format stream-json`-Sitzungen. (`qwen serve` gibt beim Start den YOLO-keine-Sandbox-Warnung aus, wenn `tools.approvalMode: 'yolo'` in den Einstellungen gesetzt ist.)

### Empfohlene Kombinationen

- **Vertraute, isolierte Umgebung (ephemerer CI-Runner, Container):** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Legen Sie ein Rundenbudget und ein Wanduhrzeit-Budget fest, damit ein hängengebliebener Agent nicht Ihre CI-Minuten verbraucht, und erfassen Sie `--output-format json` für die Nutzungsanalyse nach dem Lauf / Tool-Call-Überwachung.
- **Lokale Maschine oder gemeinsame Infrastruktur:** Übergeben Sie ebenfalls `--sandbox` (oder setzen Sie `QWEN_SANDBOX=1`), sodass Shell-/Schreib-/Bearbeitungswerkzeuge innerhalb des Sandbox-Images ausgeführt werden.
- **Langlaufende CI mit Wiederholung bei Ratenbegrenzung:** Kombinieren Sie `QWEN_CODE_UNATTENDED_RETRY=1` mit `--max-wall-time`. Die Umgebungsvariable für Wiederholungen hält die Ausführung über vorübergehende 429/529-Antworten hinweg am Leben; das Wanduhrzeit-Budget stellt sicher, dass ein dauerhaft fehlschlagender Anbieter den Job nicht unbegrenzt verlängern kann.
- **Begrenzte Prüfung/Erkundung:** Für schreibgeschützte Aufgaben begrenzt `--max-tool-calls 25`, wie aggressiv das Modell grep/lesen kann. Kombinieren Sie es mit `--exclude-tools shell,write,edit`, um die Begrenzung sinnvoll zu machen.

## Beispiele

### Code-Review

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### Commit-Nachrichten generieren

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

### API-Dokumentation

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```
### Batch-Code-Analyse

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### PR-Code-Review

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Log-Analyse

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Generierung von Release-Notes

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Modell- und Tool-Nutzungsverfolgung

```bash
result=$(qwen -p "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## Dauerhafter Wiederholungsmodus

Wenn Qwen Code in CI/CD-Pipelines oder als Hintergrund-Daemon läuft, sollte eine kurze API-Unterbrechung (Rate Limiting oder Überlastung) keine mehrstündige Aufgabe abbrechen. Der **dauerhafte Wiederholungsmodus** sorgt dafür, dass Qwen Code vorübergehende API-Fehler unbegrenzt wiederholt, bis der Dienst sich erholt.

### Funktionsweise

- **Nur vorübergehende Fehler**: HTTP 429 (Rate Limit) und 529 (Overloaded) werden unbegrenzt wiederholt. Andere Fehler (400, 500 usw.) schlagen normal fehl.
- **Exponentielles Backoff mit Obergrenze**: Die Wiederholungsverzögerungen steigen exponentiell an, sind aber auf **5 Minuten** pro Wiederholung begrenzt.
- **Heartbeat-Keepalive**: Während langer Wartezeiten wird alle **30 Sekunden** eine Statuszeile auf stderr ausgegeben, um zu verhindern, dass CI-Runner den Prozess aufgrund von Inaktivität beenden.
- **Graceful Degradation**: Nicht-vorübergehende Fehler und der interaktive Modus sind davon vollkommen unbeeinflusst.

### Aktivierung

Setzen Sie die Umgebungsvariable `QWEN_CODE_UNATTENDED_RETRY` auf `true` oder `1` (strikte Übereinstimmung, Groß-/Kleinschreibung):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Der dauerhafte Wiederholungsmodus erfordert ein **explizites Opt-in**. `CI=true` allein aktiviert ihn **nicht** – einen schnellen CI-Job in einen unendlich langen Wartejob zu verwandeln wäre gefährlich. Setzen Sie `QWEN_CODE_UNATTENDED_RETRY` immer explizit in Ihrer Pipeline-Konfiguration.

### Beispiele

#### GitHub Actions

```yaml
- name: Automated code review
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "Review all files in src/ for security issues" \
      --output-format json \
      --yolo > review.json
```

#### Nächtliche Batch-Verarbeitung

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migrate all callback-style functions to async/await in src/" --yolo
```

#### Hintergrund-Daemon

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audit all dependencies for known CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### Überwachung

Während des dauerhaften Wiederholungsmodus werden Heartbeat-Nachrichten auf **stderr** ausgegeben:

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

Diese Nachrichten halten CI-Runner am Leben und ermöglichen es Ihnen, den Fortschritt zu überwachen. Sie erscheinen nicht in stdout, sodass die JSON-Ausgabe, die an andere Tools weitergeleitet wird, sauber bleibt.

## Ressourcen

- [CLI-Konfiguration](../configuration/settings#command-line-arguments) – Vollständiger Konfigurationsleitfaden
- [Authentifizierung](../configuration/auth.md) – Authentifizierung einrichten
- [Befehle](../features/commands) – Referenz für interaktive Befehle
- [Tutorials](../quickstart) – Schritt-für-Schritt-Automatisierungsanleitungen
