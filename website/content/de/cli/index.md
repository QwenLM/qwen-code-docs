# Qwen Code CLI

Innerhalb von Qwen Code ist `packages/cli` das Frontend, über das Nutzer Prompts an Qwen und andere KI-Modelle senden und Antworten empfangen können – inklusive der dazugehörigen Tools. Eine allgemeine Übersicht über Qwen Code findest du auf der [Hauptdokumentationsseite](../index.md).

## Navigation in diesem Abschnitt

- **[Authentication](./authentication.md):** Anleitung zur Einrichtung der Authentifizierung mit Qwen OAuth und OpenAI-kompatiblen Anbietern.
- **[Commands](./commands.md):** Referenz der Qwen Code CLI-Befehle (z. B. `/help`, `/tools`, `/theme`).
- **[Configuration](./configuration.md):** Anleitung zur Anpassung des CLI-Verhaltens mithilfe von Konfigurationsdateien.
- **[Token Caching](./token-caching.md):** Optimiere API-Kosten durch Token-Caching.
- **[Themes](./themes.md):** Anleitung zur Anpassung des Erscheinungsbilds der CLI mit verschiedenen Themes.
- **[Tutorials](tutorials.md):** Tutorial, das zeigt, wie du Qwen Code zur Automatisierung einer Entwicklungsaufgabe nutzen kannst.

## Non-interactive mode

Qwen Code kann im Non-interactive mode ausgeführt werden, was für Scripting und Automatisierung nützlich ist. In diesem Modus übergibst du die Eingabe per Pipe an die CLI, sie führt den Befehl aus und beendet sich anschließend.

Das folgende Beispiel übergibt einen Befehl per Pipe von deinem Terminal an Qwen Code:

```bash
echo "What is fine tuning?" | qwen
```

Qwen Code führt den Befehl aus und gibt die Ausgabe in deinem Terminal aus. Beachte, dass du dasselbe Verhalten auch mit dem `--prompt` oder `-p` Flag erreichen kannst. Zum Beispiel:

```bash
qwen -p "What is fine tuning?"
```