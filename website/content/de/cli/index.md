# Qwen Code CLI

Innerhalb von Qwen Code ist `packages/cli` das Frontend, über das Nutzer Prompts an Qwen und andere KI-Modelle senden und Antworten empfangen können, inklusive der zugehörigen Tools. Eine allgemeine Übersicht über Qwen Code findest du auf der [Hauptdokumentationsseite](../index.md).

## Navigation in diesem Abschnitt

- **[Authentication](./authentication.md):** Ein Leitfaden zur Einrichtung der Authentifizierung mit Qwen OAuth und OpenAI-kompatiblen Anbietern.
- **[Commands](./commands.md):** Eine Referenz für Qwen Code CLI-Befehle (z. B. `/help`, `/tools`, `/theme`).
- **[Configuration](./configuration.md):** Ein Leitfaden zur Anpassung des Verhaltens der Qwen Code CLI mithilfe von Konfigurationsdateien.
- **[Token Caching](./token-caching.md):** Optimiere API-Kosten durch Token-Caching.
- **[Themes](./themes.md):** Ein Leitfaden zur Anpassung des Erscheinungsbilds der CLI mit verschiedenen Themes.
- **[Tutorials](tutorials.md):** Ein Tutorial, das zeigt, wie du Qwen Code zur Automatisierung einer Entwicklungsaufgabe verwenden kannst.
- **[Welcome Back](./welcome-back.md):** Erfahre mehr über die Welcome Back-Funktion, die dir hilft, nahtlos zwischen Sitzungen weiterzuarbeiten.

## Non-interactive mode

Qwen Code kann im Non-interactive mode ausgeführt werden, was für Scripting und Automatisierung nützlich ist. In diesem Modus übergibst du die Eingabe per Pipe an die CLI, sie führt den Befehl aus und beendet sich anschließend.

Das folgende Beispiel übergibt einen Befehl von deinem Terminal per Pipe an Qwen Code:

```bash
echo "What is fine tuning?" | qwen
```

Qwen Code führt den Befehl aus und gibt die Ausgabe in deinem Terminal aus. Beachte, dass du dasselbe Verhalten auch mit dem `--prompt` oder `-p` Flag erreichen kannst. Zum Beispiel:

```bash
qwen -p "What is fine tuning?"
```