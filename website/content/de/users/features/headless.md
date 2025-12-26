# Headless-Modus

Der Headless-Modus ermöglicht es Ihnen, Qwen Code programmgesteuert über Befehlszeilenskripte und Automatisierungstools auszuführen, ohne eine interaktive Benutzeroberfläche zu verwenden. Dies ist ideal für Skripterstellung, Automatisierung, CI/CD-Pipelines und den Bau von KI-gestützten Tools.

## Übersicht

Der Headless-Modus bietet eine headlose Schnittstelle zu Qwen Code, die:

- Eingaben über Befehlszeilenargumente oder stdin akzeptiert
- Strukturierte Ausgabe zurückgibt (Text oder JSON)
- Datei-Umleitung und Piping unterstützt
- Automatisierungs- und Skript-Workflows ermöglicht
- Konsistente Exit-Codes für Fehlerbehandlung bereitstellt
- Vorherige Sitzungen im Kontext des aktuellen Projekts für mehrstufige Automatisierung fortsetzen kann

## Grundlegende Verwendung

### Direkte Eingaben

Verwenden Sie das Flag `--prompt` (oder `-p`), um im Headless-Modus auszuführen:

```bash
qwen --prompt "Was ist maschinelles Lernen?"
```

### Stdin-Eingabe

Leiten Sie Eingaben von Ihrem Terminal an Qwen Code weiter:

```bash
echo "Erkläre diesen Code" | qwen
```

### Kombination mit Dateieingabe

Aus Dateien lesen und mit Qwen Code verarbeiten:

```bash
cat README.md | qwen --prompt "Fassen Sie diese Dokumentation zusammen"
```

### Vorherige Sitzungen fortsetzen (Headless)

Konversationskontext aus dem aktuellen Projekt in Headless-Skripten wiederverwenden:

```bash

# Die letzte Sitzung für dieses Projekt fortsetzen und eine neue Eingabeaufforderung ausführen
qwen --continue -p "Führen Sie die Tests erneut aus und fassen Sie die Fehler zusammen"

# Eine bestimmte Sitzungs-ID direkt fortsetzen (ohne UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Führen Sie den anschließenden Refactoring durch"
```

> [!note]
>
> - Sitzungsdaten sind projektspezifisches JSONL unter `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Stellt den Gesprächsverlauf, Tool-Ausgaben und Chat-Komprimierungs-Checkpoints wieder her, bevor die neue Eingabeaufforderung gesendet wird.

## Ausgabeformate

Qwen Code unterstützt mehrere Ausgabeformate für verschiedene Anwendungsfälle:

### Text-Ausgabe (Standard)

Standard-Ausgabe im menschenlesbaren Format:

```bash
qwen -p "Was ist die Hauptstadt von Frankreich?"
```

Antwortformat:

```
Die Hauptstadt von Frankreich ist Paris.
```

### JSON-Ausgabe

Gibt strukturierte Daten als JSON-Array zurück. Alle Nachrichten werden zwischengespeichert und gemeinsam ausgegeben, wenn die Sitzung abgeschlossen ist. Dieses Format eignet sich ideal für programmatische Verarbeitung und Automatisierungsskripte.

Die JSON-Ausgabe ist ein Array von Nachrichtenobjekten. Die Ausgabe enthält mehrere Nachrichtentypen: Systemnachrichten (Sitzungsinitialisierung), Assistentennachrichten (KI-Antworten) und Ergebnisnachrichten (Ausführungszusammenfassung).

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

Das Stream-JSON-Format gibt JSON-Nachrichten sofort aus, sobald sie während der Ausführung auftreten, und ermöglicht so eine Echtzeitüberwachung. Dieses Format verwendet JSON mit Zeilenumbrüchen, wobei jede Nachricht ein vollständiges JSON-Objekt in einer einzelnen Zeile ist.

```bash
qwen -p "Erkläre TypeScript" --output-format stream-json
```

Ausgabe (Streaming während der Ereignisse):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

In Kombination mit `--include-partial-messages` werden zusätzliche Stream-Ereignisse in Echtzeit ausgegeben (message_start, content_block_delta usw.), um Echtzeit-UI-Aktualisierungen zu ermöglichen.

```bash
qwen -p "Schreibe ein Python-Skript" --output-format stream-json --include-partial-messages
```

### Eingabeformat

Der Parameter `--input-format` steuert, wie Qwen Code Eingaben aus der Standardeingabe verarbeitet:

- **`text`** (Standard): Standard-Texteingabe über stdin oder Befehlszeilenargumente
- **`stream-json`**: JSON-Nachrichtenprotokoll über stdin für bidirektionale Kommunikation

> **Hinweis:** Der Stream-json-Eingabemodus befindet sich derzeit in der Entwicklung und ist für die SDK-Integration vorgesehen. Es erfordert die Einstellung von `--output-format stream-json`.

### Datei-Umleitung

Ausgabe in Dateien speichern oder an andere Befehle weiterleiten:

```bash

# In Datei speichern
qwen -p "Erkläre Docker" > docker-erklaerung.txt
qwen -p "Erkläre Docker" --output-format json > docker-erklaerung.json

# An Datei anhängen
qwen -p "Weitere Details hinzufügen" >> docker-erklaerung.txt

# An andere Tools weiterleiten
qwen -p "Was ist Kubernetes?" --output-format json | jq '.response'
qwen -p "Erkläre Microservices" | wc -w
qwen -p "Programmiersprachen auflisten" | grep -i "python"

# Stream-JSON-Ausgabe für die Echtzeitverarbeitung
qwen -p "Erkläre Docker" --output-format stream-json | jq '.type'
qwen -p "Code schreiben" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Konfigurationsoptionen

Wichtige Befehlszeilenoptionen für den headless-Modus:

| Option                       | Beschreibung                                            | Beispiel                                                                 |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Im headless-Modus ausführen                             | `qwen -p "Abfrage"`                                                      |
| `--output-format`, `-o`      | Ausgabeformat festlegen (text, json, stream-json)       | `qwen -p "Abfrage" --output-format json`                                 |
| `--input-format`             | Eingabeformat festlegen (text, stream-json)             | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Teilweise Nachrichten in stream-json-Ausgabe einbeziehen| `qwen -p "Abfrage" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Debug-Modus aktivieren                                  | `qwen -p "Abfrage" --debug`                                              |
| `--all-files`, `-a`          | Alle Dateien in den Kontext einbeziehen                 | `qwen -p "Abfrage" --all-files`                                          |
| `--include-directories`      | Zusätzliche Verzeichnisse einbeziehen                   | `qwen -p "Abfrage" --include-directories src,docs`                       |
| `--yolo`, `-y`               | Alle Aktionen automatisch genehmigen                    | `qwen -p "Abfrage" --yolo`                                               |
| `--approval-mode`            | Genehmigungsmodus festlegen                             | `qwen -p "Abfrage" --approval-mode auto_edit`                            |
| `--continue`                 | Die letzte Sitzung für dieses Projekt fortsetzen        | `qwen --continue -p "Setzen wir fort, wo wir aufgehört haben"`           |
| `--resume [sessionId]`       | Eine bestimmte Sitzung fortsetzen (oder interaktiv wählen) | `qwen --resume 123e... -p "Refactoring abschließen"`                    |
| `--experimental-skills`      | Experimentelle Skills aktivieren (registriert das `skill`-Tool) | `qwen --experimental-skills -p "Welche Skills sind verfügbar?"`      |

Für vollständige Details zu allen verfügbaren Konfigurationsoptionen, Einstellungsdateien und Umgebungsvariablen siehe [Konfigurationsanleitung](../configuration/settings).

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
result=$(git diff origin/main...HEAD | qwen -p "Überprüfen Sie diese Änderungen auf Fehler, Sicherheitsprobleme und Code-Qualität" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Log-Analyse

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analysieren Sie diese Fehler und schlagen Sie Ursache und Lösungen vor" > error-analysis.txt
```

### Erstellung von Release-Notes

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Erstellen Sie Release-Notes aus diesen Commits" --output-format json)
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
echo "$(date): $total_tokens tokens, $tool_calls Tool-Aufrufe ($tools_used) verwendet mit Modellen: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Aktuelle Nutzungstrends:"
tail -5 usage.log
```

## Ressourcen

- [CLI-Konfiguration](../configuration/settings#command-line-arguments) - Vollständiger Konfigurationsleitfaden
- [Authentifizierung](../configuration/settings#environment-variables-for-api-access) - Authentifizierung einrichten
- [Befehle](../features/commands) - Referenz zu interaktiven Befehlen
- [Tutorials](../quickstart) - Schritt-für-Schritt-Automatisierungsanleitungen