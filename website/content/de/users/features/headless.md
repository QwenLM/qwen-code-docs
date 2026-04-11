# Headless-Modus

Der Headless-Modus ermöglicht es dir, Qwen Code programmatisch über Befehlszeilenskripte und Automatisierungstools ohne interaktive Benutzeroberfläche auszuführen. Dies ist ideal für Skripting, Automatisierung, CI/CD-Pipelines und die Entwicklung KI-gestützter Tools.

## Übersicht

Der Headless-Modus bietet eine headless-Schnittstelle zu Qwen Code, die:

- Prompts über Befehlszeilenargumente oder stdin akzeptiert
- Strukturierte Ausgaben (Text oder JSON) zurückgibt
- Datei-Umleitung und Piping unterstützt
- Automatisierungs- und Skripting-Workflows ermöglicht
- Konsistente Exit-Codes für die Fehlerbehandlung bereitstellt
- Vorherige Sitzungen im Kontext des aktuellen Projekts für mehrstufige Automatisierung fortsetzen kann

## Grundlegende Verwendung

### Direkte Prompts

Verwende das Flag `--prompt` (oder `-p`), um im Headless-Modus zu starten:

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

### Integrierten Systemprompt überschreiben

Verwende `--system-prompt`, um den integrierten Hauptsitzungsprompt von Qwen Code für den aktuellen Lauf zu ersetzen:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Zusätzliche Anweisungen anhängen

Verwende `--append-system-prompt`, um den integrierten Prompt beizubehalten und zusätzliche Anweisungen für diesen Lauf hinzuzufügen:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Du kannst beide Flags kombinieren, wenn du einen benutzerdefinierten Basis-Prompt plus eine laufspezifische Zusatzanweisung benötigst:

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` gilt nur für die Hauptsitzung des aktuellen Laufs.
> - Geladene Speicher- und Kontextdateien wie `QWEN.md` werden weiterhin nach `--system-prompt` angehängt.
> - `--append-system-prompt` wird nach dem integrierten Prompt und dem geladenen Speicher angewendet und kann zusammen mit `--system-prompt` verwendet werden.

## Ausgabeformate

Qwen Code unterstützt mehrere Ausgabeformate für verschiedene Anwendungsfälle:

### Textausgabe (Standard)

Standardmäßige, für Menschen lesbare Ausgabe:

```bash
qwen -p "What is the capital of France?"
```

Antwortformat:

```
The capital of France is Paris.
```

### JSON-Ausgabe

Gibt strukturierte Daten als JSON-Array zurück. Alle Nachrichten werden gepuffert und gemeinsam ausgegeben, wenn die Sitzung abgeschlossen ist. Dieses Format ist ideal für die programmatische Verarbeitung und Automatisierungsskripte.

Die JSON-Ausgabe ist ein Array aus Nachrichtenobjekten. Die Ausgabe umfasst mehrere Nachrichtentypen: Systemnachrichten (Sitzungsinitialisierung), Assistant-Nachrichten (KI-Antworten) und Ergebnisnachrichten (Ausführungszusammenfassung).

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

Das Stream-JSON-Format gibt JSON-Nachrichten sofort aus, sobald sie während der Ausführung auftreten, und ermöglicht so Echtzeit-Monitoring. Dieses Format verwendet zeilengetrenntes JSON, bei dem jede Nachricht ein vollständiges JSON-Objekt in einer einzigen Zeile ist.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Ausgabe (Streaming bei Ereigniseintritt):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

In Kombination mit `--include-partial-messages` werden zusätzliche Stream-Ereignisse in Echtzeit ausgegeben (`message_start`, `content_block_delta` usw.), um Echtzeit-UI-Updates zu ermöglichen.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Eingabeformat

Der Parameter `--input-format` steuert, wie Qwen Code Eingaben von der Standardeingabe verarbeitet:

- **`text`** (Standard): Standard-Texteingabe über stdin oder Befehlszeilenargumente
- **`stream-json`**: JSON-Nachrichtenprotokoll über stdin für bidirektionale Kommunikation

> **Hinweis:** Der Stream-JSON-Eingabemodus befindet sich derzeit in der Entwicklung und ist für die SDK-Integration vorgesehen. Er erfordert die Einstellung von `--output-format stream-json`.

### Datei-Umleitung

Speichere Ausgaben in Dateien oder leite sie an andere Befehle weiter:

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
| `--prompt`, `-p`             | Startet im Headless-Modus                                                | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Gibt das Ausgabeformat an (text, json, stream-json)                      | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Gibt das Eingabeformat an (text, stream-json)                            | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Bindet teilweise Nachrichten in die stream-json-Ausgabe ein              | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Überschreibt den Systemprompt der Hauptsitzung für diesen Lauf           | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Hängt zusätzliche Anweisungen an den Systemprompt der Hauptsitzung für diesen Lauf an | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Aktiviert den Debug-Modus                                                | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | Bindet alle Dateien in den Kontext ein                                   | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Bindet zusätzliche Verzeichnisse ein                                     | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Bestätigt alle Aktionen automatisch                                      | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Legt den Bestätigungsmodus fest                                          | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Setzt die zuletzt genutzte Sitzung für dieses Projekt fort               | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Setzt eine bestimmte Sitzung fort (oder wählt interaktiv aus)            | `qwen --resume 123e... -p "Finish the refactor"`                         |

Vollständige Details zu allen verfügbaren Konfigurationsoptionen, Einstellungsdateien und Umgebungsvariablen findest du im [Konfigurationshandbuch](../configuration/settings).

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

### Generierung von Release Notes

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Tracking von Modell- und Tool-Nutzung

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

## Ressourcen

- [CLI-Konfiguration](../configuration/settings#command-line-arguments) - Vollständiges Konfigurationshandbuch
- [Authentifizierung](../configuration/settings#environment-variables-for-api-access) - Authentifizierung einrichten
- [Befehle](../features/commands) - Referenz für interaktive Befehle
- [Tutorials](../quickstart) - Schritt-für-Schritt-Anleitungen zur Automatisierung