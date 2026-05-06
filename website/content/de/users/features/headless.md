# Headless-Modus

Der Headless-Modus ermöglicht die programmatische Ausführung von Qwen Code über Befehlszeilenskripte und Automatisierungstools ohne interaktive Benutzeroberfläche. Dies ist ideal für Skripting, Automatisierung, CI/CD-Pipelines und die Entwicklung KI-gestützter Tools.

## Übersicht

Der Headless-Modus bietet eine kopflose Schnittstelle zu Qwen Code, die:

- Prompts über Befehlszeilenargumente oder stdin akzeptiert
- Strukturierte Ausgaben zurückgibt (Text oder JSON)
- Dateiweiterleitung und Piping unterstützt
- Automatisierungs- und Skripting-Workflows ermöglicht
- Konsistente Exit-Codes für die Fehlerbehandlung bereitstellt
- Vorherige Sitzungen im Kontext des aktuellen Projekts für mehrstufige Automatisierung fortsetzen kann

## Grundlegende Verwendung

### Direkte Prompts

Verwende das Flag `--prompt` (oder `-p`), um den Headless-Modus zu starten:

```bash
qwen --prompt "What is machine learning?"
```

### Stdin-Eingabe

Leite Eingaben von deinem Terminal an Qwen Code weiter:

```bash
echo "Explain this code" | qwen
```

### Kombination mit Dateieingabe

Lese aus Dateien und verarbeite sie mit Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Vorherige Sitzungen fortsetzen (Headless)

Verwende den Konversationskontext des aktuellen Projekts in Headless-Skripten wieder:

```bash
# Continue the most recent session for this project and run a new prompt
qwen --continue -p "Run the tests again and summarize failures"

# Resume a specific session ID directly (no UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Sitzungsdaten werden als projektbezogene JSONL-Dateien unter `~/.qwen/projects/<sanitized-cwd>/chats` gespeichert.
> - Stellt den Konversationsverlauf, Tool-Ausgaben und Chat-Komprimierungs-Checkpoints wieder her, bevor der neue Prompt gesendet wird.

## Haupt-Sitzungsprompt anpassen

Du kannst den Systemprompt der Hauptsitzung für einen einzelnen CLI-Aufruf ändern, ohne gemeinsam genutzte Speicherdateien zu bearbeiten.

### Eingebauten Systemprompt überschreiben

Verwende `--system-prompt`, um den eingebauten Hauptsitzungsprompt von Qwen Code für den aktuellen Lauf zu ersetzen:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Zusätzliche Anweisungen anhängen

Verwende `--append-system-prompt`, um den eingebauten Prompt beizubehalten und zusätzliche Anweisungen für diesen Lauf hinzuzufügen:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Du kannst beide Flags kombinieren, wenn du einen benutzerdefinierten Basis-Prompt plus eine laufspezifische Zusatzanweisung verwenden möchtest:

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` gilt nur für die Hauptsitzung des aktuellen Laufs.
> - Geladene Speicher- und Kontextdateien wie `QWEN.md` werden weiterhin nach `--system-prompt` angehängt.
> - `--append-system-prompt` wird nach dem eingebauten Prompt und dem geladenen Speicher angewendet und kann zusammen mit `--system-prompt` verwendet werden.

## Ausgabeformate

Qwen Code unterstützt mehrere Ausgabeformate für verschiedene Anwendungsfälle:

### Textausgabe (Standard)

Standardmäßige, menschenlesbare Ausgabe:

```bash
qwen -p "What is the capital of France?"
```

Antwortformat:

```
The capital of France is Paris.
```

### JSON-Ausgabe

Gibt strukturierte Daten als JSON-Array zurück. Alle Nachrichten werden gepuffert und gemeinsam ausgegeben, sobald die Sitzung abgeschlossen ist. Dieses Format ist ideal für die programmatische Verarbeitung und Automatisierungsskripte.

Die JSON-Ausgabe ist ein Array aus Nachrichtenobjekten. Die Ausgabe enthält mehrere Nachrichtentypen: Systemnachrichten (Sitzungsinitialisierung), Assistentennachrichten (KI-Antworten) und Ergebnisnachrichten (Ausführungszusammenfassung).

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

Das Stream-JSON-Format gibt JSON-Nachrichten sofort aus, sobald sie während der Ausführung auftreten, und ermöglicht so Echtzeit-Monitoring. Dieses Format verwendet zeilengetrenntes JSON, bei dem jede Nachricht ein vollständiges JSON-Objekt in einer einzelnen Zeile ist.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Ausgabe (Streaming bei Ereigniseintritt):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

In Kombination mit `--include-partial-messages` werden zusätzliche Stream-Ereignisse in Echtzeit ausgegeben (`message_start`, `content_block_delta` usw.), um UI-Updates in Echtzeit zu ermöglichen.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Eingabeformat

Der Parameter `--input-format` steuert, wie Qwen Code Eingaben von der Standardeingabe verarbeitet:

- **`text`** (Standard): Standard-Texteingabe von stdin oder Befehlszeilenargumenten
- **`stream-json`**: JSON-Nachrichtenprotokoll über stdin für bidirektionale Kommunikation

> **Hinweis:** Der Stream-JSON-Eingabemodus befindet sich derzeit in Entwicklung und ist für die SDK-Integration vorgesehen. Er erfordert die Einstellung von `--output-format stream-json`.

### Dateiumleitung

Speichere die Ausgabe in Dateien oder leite sie an andere Befehle weiter:

```bash
# Save to file
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Append to file
qwen -p "Add more details" >> docker-explanation.txt

# Pipe to other tools
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Stream-JSON output for real-time processing
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Konfigurationsoptionen

Wichtige Befehlszeilenoptionen für die Headless-Nutzung:

| Option                       | Beschreibung                                                              | Beispiel                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Führe im Headless-Modus aus                                              | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Ausgabeformat angeben (text, json, stream-json)                          | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Eingabeformat angeben (text, stream-json)                                | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Teilnachrichten in der Stream-JSON-Ausgabe einschließen                  | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Systemprompt der Hauptsitzung für diesen Lauf überschreiben              | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Zusätzliche Anweisungen an den Systemprompt der Hauptsitzung für diesen Lauf anhängen | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Debug-Modus aktivieren                                                   | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | Alle Dateien in den Kontext einschließen                                 | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Zusätzliche Verzeichnisse einschließen                                   | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Alle Aktionen automatisch genehmigen                                     | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Genehmigungsmodus festlegen                                              | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Die neueste Sitzung für dieses Projekt fortsetzen                        | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Eine bestimmte Sitzung fortsetzen (oder interaktiv auswählen)            | `qwen --resume 123e... -p "Finish the refactor"`                         |

Vollständige Details zu allen verfügbaren Konfigurationsoptionen, Einstellungsdateien und Umgebungsvariablen findest du im [Konfigurationsleitfaden](../configuration/settings).

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

### Batch-Codeanalyse

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

### Release-Notes generieren

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

## Persistenter Retry-Modus

Wenn Qwen Code in CI/CD-Pipelines oder als Hintergrund-Daemon läuft, sollte ein kurzer API-Ausfall (Rate-Limiting oder Überlastung) keine mehrstündige Aufgabe abbrechen. Der **persistente Retry-Modus** veranlasst Qwen Code, vorübergehende API-Fehler unbegrenzt zu wiederholen, bis der Dienst wieder verfügbar ist.

### Funktionsweise

- **Nur vorübergehende Fehler**: HTTP 429 (Rate Limit) und 529 (Overloaded) werden unbegrenzt wiederholt. Andere Fehler (400, 500 usw.) führen weiterhin zu einem normalen Abbruch.
- **Exponentielles Backoff mit Obergrenze**: Die Wartezeiten zwischen den Wiederholungen wachsen exponentiell, sind jedoch pro Wiederholungsversuch auf **5 Minuten** begrenzt.
- **Heartbeat-Keepalive**: Während langer Wartezeiten wird alle **30 Sekunden** eine Statuszeile auf stderr ausgegeben, um zu verhindern, dass CI-Runner den Prozess aufgrund von Inaktivität beenden.
- **Graceful Degradation**: Nicht-vorübergehende Fehler und der interaktive Modus bleiben vollständig unberührt.

### Aktivierung

Setze die Umgebungsvariable `QWEN_CODE_UNATTENDED_RETRY` auf `true` oder `1` (strikter Abgleich, Groß-/Kleinschreibung beachten):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Der persistente Retry-Modus erfordert ein **explizites Opt-in**. `CI=true` allein aktiviert ihn **nicht** – einen schnell fehlschlagenden CI-Job stillschweigend in einen Job mit unbegrenzter Wartezeit umzuwandeln, wäre gefährlich. Setze `QWEN_CODE_UNATTENDED_RETRY` immer explizit in deiner Pipeline-Konfiguration.

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

### Monitoring

Während des persistenten Retry-Modus werden Heartbeat-Nachrichten auf **stderr** ausgegeben:

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

Diese Nachrichten halten CI-Runner aktiv und ermöglichen die Überwachung des Fortschritts. Sie erscheinen nicht in stdout, sodass die an andere Tools weitergeleitete JSON-Ausgabe sauber bleibt.

## Ressourcen

- [CLI-Konfiguration](../configuration/settings#command-line-arguments) – Vollständiger Konfigurationsleitfaden
- [Authentifizierung](../configuration/settings#environment-variables-for-api-access) – Authentifizierung einrichten
- [Befehle](../features/commands) – Referenz für interaktive Befehle
- [Tutorials](../quickstart) – Schritt-für-Schritt-Anleitungen zur Automatisierung