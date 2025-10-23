# Qwen Code CLI

Innerhalb von Qwen Code ist `packages/cli` das Frontend, über das Nutzer Prompts an Qwen und andere KI-Modelle samt zugehörigen Tools senden und Antworten erhalten können. Für einen allgemeinen Überblick über Qwen Code

## Navigation in diesem Abschnitt

- **[Authentication](./authentication.md):** Eine Anleitung zur Einrichtung der Authentifizierung mit Qwen OAuth und OpenAI-kompatiblen Anbietern.
- **[Commands](./commands.md):** Eine Referenz zu den Qwen Code CLI-Befehlen (z. B. `/help`, `/tools`, `/theme`).
- **[Configuration](./configuration.md):** Eine Anleitung zum Anpassen des Verhaltens der Qwen Code CLI mithilfe von Konfigurationsdateien.
- **[Themes](./themes.md):** Eine Anleitung zur Individualisierung des Erscheinungsbilds der CLI mit verschiedenen Themes.
- **[Tutorials](tutorials.md):** Ein Tutorial, das zeigt, wie Qwen Code genutzt werden kann, um eine Entwicklungsaufgabe zu automatisieren.

## Non-interactive mode

Qwen Code kann im Non-interactive mode ausgeführt werden, was für Scripting und Automation nützlich ist. In diesem Modus übergibst du die Eingabe per Pipe an die CLI, sie führt den Befehl aus und beendet sich dann.

Das folgende Beispiel übergibt einen Befehl per Pipe von deinem Terminal an Qwen Code:

```bash
echo "What is fine tuning?" | qwen
```

Du kannst auch das Flag `--prompt` oder `-p` verwenden:

```bash
qwen -p "What is fine tuning?"
```

Für eine umfassende Dokumentation zur headless-Nutzung, Scripting, Automation und fortgeschrittene Beispiele, schau dir den **[Headless Mode](../headless.md)** Guide an.