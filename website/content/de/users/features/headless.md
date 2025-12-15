# Headless-Modus

Der Headless-Modus ermöglicht es Ihnen, Qwen Code programmgesteuert über Kommandozeilen-Skripte und Automatisierungstools ohne interaktive Benutzeroberfläche auszuführen. Dies ist ideal für Skripterstellung, Automatisierung, CI/CD-Pipelines und den Aufbau KI-gestützter Tools.

## Übersicht

Der Headless-Modus bietet eine kopflose Schnittstelle zu Qwen Code, die:

- Eingabeaufforderungen über Kommandozeilenargumente oder stdin entgegennimmt
- Strukturierte Ausgabe zurückgibt (Text oder JSON)
- Dateiumleitung und Pipe-Verarbeitung unterstützt
- Automatisierungs- und Skriptworkflows ermöglicht
- Konsistente Exit-Codes zur Fehlerbehandlung bereitstellt
- Vorherige Sitzungen im aktuellen Projektbereich fortsetzen kann für mehrstufige Automatisierung

## Grundlegende Verwendung

### Direkte Eingabeaufforderungen

Verwenden Sie das Flag `--prompt` (oder `-p`), um im Headless-Modus auszuführen:

```bash
qwen --prompt "Was ist maschinelles Lernen?"
```

### Stdin-Eingabe

Leiten Sie Eingaben von Ihrem Terminal an Qwen Code weiter:

```bash
echo "Erkläre diesen Code" | qwen
```

### Kombinieren mit Dateieingabe

Aus Dateien lesen und mit Qwen Code verarbeiten:

```bash
cat README.md | qwen --prompt "Fasse diese Dokumentation zusammen"
```

### Vorherige Sitzungen fortsetzen (Kopflos)

Konversationskontext aus dem aktuellen Projekt in kopflosen Skripten wiederverwenden:

```bash

# Setze die letzte Sitzung für dieses Projekt fort und führe eine neue Eingabeaufforderung aus
qwen --continue -p "Führe die Tests erneut aus und fasse Fehler zusammen"

# Setze direkt eine bestimmte Sitzungs-ID fort (keine Benutzeroberfläche)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Wende die nachfolgende Refaktorisierung an"
```

> [!note]
>
> - Sitzungsdaten sind projektbezogenes JSONL unter `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Stellt Konversationsverlauf, Tool-Ausgaben und Chat-Komprimierungs-Checkpoints vor dem Senden der neuen Eingabeaufforderung wieder her.

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

Gibt strukturierte Daten als JSON-Array zurück. Alle Nachrichten werden zwischengespeichert und gemeinsam ausgegeben, sobald die Sitzung abgeschlossen ist. Dieses Format eignet sich ideal für die programmatische Verarbeitung und Automatisierungsskripte.

Die JSON-Ausgabe besteht aus einem Array von Nachrichtenobjekten. Die Ausgabe umfasst mehrere Nachrichtentypen: Systemnachrichten (Initialisierung der Sitzung), Assistentennachrichten (KI-Antworten) sowie Ergebnisnachrichten (Zusammenfassung der Ausführung).

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

Das Stream-JSON-Format gibt JSON-Nachrichten sofort aus, sobald sie während der Ausführung auftreten, und ermöglicht so eine Echtzeitüberwachung. Dieses Format verwendet zeilenbasiertes JSON, bei dem jede Nachricht ein vollständiges JSON-Objekt in einer einzelnen Zeile darstellt.

```bash
qwen -p "Erkläre TypeScript" --output-format stream-json
```

Ausgabe (wird beim Auftreten von Ereignissen gestreamt):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

In Kombination mit `--include-partial-messages` werden zusätzliche Stream-Ereignisse in Echtzeit ausgegeben (message_start, content_block_delta usw.), um Aktualisierungen der Benutzeroberfläche in Echtzeit zu ermöglichen.

```bash
qwen -p "Schreibe ein Python-Skript" --output-format stream-json --include-partial-messages
```

### Eingabeformat

Der Parameter `--input-format` steuert, wie Qwen Code die Eingabe über die Standardeingabe verarbeitet:

- **`text`** (Standard): Normale Texteingabe über stdin oder Kommandozeilenargumente
- **`stream-json`**: JSON-Nachrichtenprotokoll über stdin für bidirektionale Kommunikation

> **Hinweis:** Der Eingabemodus `stream-json` ist derzeit noch in Entwicklung und für die Integration mit SDKs gedacht. Er erfordert die Angabe von `--output-format stream-json`.

### Dateiumleitung

Ausgabe in Dateien speichern oder an andere Befehle weiterleiten:

```bash

# In Datei speichern
qwen -p "Erkläre Docker" > docker-erklaerung.txt
qwen -p "Erkläre Docker" --output-format json > docker-erklaerung.json

# An Datei anhängen
qwen -p "Füge weitere Details hinzu" >> docker-erklaerung.txt

# An andere Tools weiterleiten
qwen -p "Was ist Kubernetes?" --output-format json | jq '.response'
qwen -p "Erkläre Microservices" | wc -w
qwen -p "Liste Programmiersprachen auf" | grep -i "python"```

# Stream-JSON-Ausgabe für Echtzeitverarbeitung
qwen -p "Erkläre Docker" --output-format stream-json | jq '.type'
qwen -p "Schreibe Code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Konfigurationsoptionen

Wichtige Befehlszeilenoptionen für die headless-Nutzung:

| Option                       | Beschreibung                                         | Beispiel                                                                  |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Im Headless-Modus ausführen                         | `qwen -p "Abfrage"`                                                      |
| `--output-format`, `-o`      | Ausgabeformat festlegen (text, json, stream-json)   | `qwen -p "Abfrage" --output-format json`                                 |
| `--input-format`             | Eingabeformat festlegen (text, stream-json)         | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Teilnachrichten in stream-json-Ausgabe einbeziehen  | `qwen -p "Abfrage" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Debug-Modus aktivieren                              | `qwen -p "Abfrage" --debug`                                              |
| `--all-files`, `-a`          | Alle Dateien im Kontext einbeziehen                  | `qwen -p "Abfrage" --all-files`                                          |
| `--include-directories`      | Zusätzliche Verzeichnisse einbeziehen               | `qwen -p "Abfrage" --include-directories src,docs`                       |
| `--yolo`, `-y`               | Alle Aktionen automatisch genehmigen                | `qwen -p "Abfrage" --yolo`                                               |
| `--approval-mode`            | Genehmigungsmodus festlegen                         | `qwen -p "Abfrage" --approval-mode auto_edit`                            |
| `--continue`                 | Die letzte Sitzung für dieses Projekt fortsetzen    | `qwen --continue -p "Mach weiter, wo wir aufgehört haben"`               |
| `--resume [sessionId]`       | Eine bestimmte Sitzung fortsetzen (oder interaktiv wählen) | `qwen --resume 123e... -p "Beende die Umstrukturierung"`         |

Für vollständige Details zu allen verfügbaren Konfigurationsoptionen, Einstellungsdateien und Umgebungsvariablen, siehe [Konfigurationshandbuch](/users/configuration/settings).

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

### Erstellung von Versionshinweisen

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Verfolgung der Modell- und Tool-Nutzung

```bash
result=$(qwen -p "Erkläre dieses Datenbankschema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "keine" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "keine" else . end')
echo "$(date): $total_tokens Tokens, $tool_calls Tool-Aufrufe ($tools_used) verwendet mit Modellen: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Aktuelle Nutzungstrends:"
tail -5 usage.log
```

## Ressourcen

- [CLI-Konfiguration](/users/configuration/settings#command-line-arguments) - Vollständiger Konfigurationsleitfaden
- [Authentifizierung](/users/configuration/settings#environment-variables-for-api-access) - Authentifizierung einrichten
- [Befehle](/users/reference/cli-reference) - Interaktive Befehlsreferenz
- [Tutorials](/users/quickstart) - Schritt-für-Schritt-Anleitungen zur Automatisierung