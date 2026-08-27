# Shell-Tool (`run_shell_command`)

Dieses Dokument beschreibt das `run_shell_command`-Tool für Qwen Code.

## Beschreibung

Verwende `run_shell_command`, um mit dem zugrunde liegenden System zu interagieren, Skripte auszuführen oder Befehlszeilenoperationen durchzuführen. `run_shell_command` führt einen angegebenen Shell-Befehl aus, einschließlich interaktiver Befehle, die Benutzereingaben erfordern (z. B. `vim`, `git rebase -i`), wenn die Einstellung `tools.shell.enableInteractiveShell` auf `true` gesetzt ist.

Unter Windows werden Befehle mit `cmd.exe /c` ausgeführt. Auf anderen Plattformen werden sie mit `bash -c` ausgeführt.

### Argumente

`run_shell_command` akzeptiert die folgenden Argumente:

- `command` (string, erforderlich): Der genaue Shell-Befehl, der ausgeführt werden soll.
- `description` (string, optional): Eine kurze Beschreibung des Zwecks des Befehls, die dem Benutzer angezeigt wird.
- `directory` (string, optional): Das Verzeichnis (relativ zum Projektstammverzeichnis), in dem der Befehl ausgeführt werden soll. Wenn nicht angegeben, wird der Befehl im Projektstammverzeichnis ausgeführt.
- `is_background` (boolean, erforderlich): Gibt an, ob der Befehl im Hintergrund ausgeführt werden soll. Dieser Parameter ist erforderlich, um eine explizite Entscheidung über den Befehlsausführungsmodus zu gewährleisten. Setze ihn auf `true` für langlaufende Prozesse wie Development-Server, Watcher oder Daemons, die ohne Blockierung weiterer Befehle weiterlaufen sollen. Setze ihn auf `false` für einmalige Befehle, die abgeschlossen sein müssen, bevor fortgefahren wird.

## Verwendung von `run_shell_command` mit Qwen Code

Bei der Verwendung von `run_shell_command` wird der Befehl als Subprozess ausgeführt. Du kannst mit dem Parameter `is_background` oder durch explizites Hinzufügen von `&` zu Befehlen steuern, ob Befehle im Hintergrund oder Vordergrund ausgeführt werden. Das Tool gibt detaillierte Informationen über die Ausführung zurück, einschließlich:

### Erforderlicher Background-Parameter

Der Parameter `is_background` ist für alle Befehlsausführungen **erforderlich**. Dieses Design stellt sicher, dass die LLM (und die Benutzer) explizit entscheiden müssen, ob jeder Befehl im Hintergrund oder Vordergrund ausgeführt werden soll, was ein absichtliches und vorhersehbares Verhalten bei der Befehlsausführung fördert. Durch die Pflichtangabe dieses Parameters vermeiden wir ein unbeabsichtigtes Fallback auf die Vordergrundausführung, was bei langlaufenden Prozessen nachfolgende Operationen blockieren könnte.

### Hintergrund- vs. Vordergrundausführung

Das Tool verarbeitet die Hintergrund- und Vordergrundausführung intelligent basierend auf deiner expliziten Auswahl:

**Verwende die Hintergrundausführung (`is_background: true`) für:**

- Langlaufende Development-Server: `npm run start`, `npm run dev`, `yarn dev`
- Build-Watcher: `npm run watch`, `webpack --watch`
- Datenbankserver: `mongod`, `mysql`, `redis-server`
- Webserver: `python -m http.server`, `php -S localhost:8000`
- Jeden Befehl, der unbegrenzt laufen soll, bis er manuell gestoppt wird

**Verwende die Vordergrundausführung (`is_background: false`) für:**

- Einmalige Befehle: `ls`, `cat`, `grep`
- Build-Befehle: `npm run build`, `make`
- Installationsbefehle: `npm install`, `pip install`
- Git-Operationen: `git commit`, `git push`
- Testausführungen: `npm test`, `pytest`

### Ausführungsinformationen

Das Tool gibt detaillierte Informationen über die Ausführung zurück, einschließlich:

- `Command`: Der ausgeführte Befehl.
- `Directory`: Das Verzeichnis, in dem der Befehl ausgeführt wurde.
- `Stdout`: Ausgabe aus dem Standard-Output-Stream.
- `Stderr`: Ausgabe aus dem Standard-Error-Stream.
- `Error`: Jegliche Fehlermeldung, die vom Subprozess gemeldet wurde.
- `Exit Code`: Der Exit-Code des Befehls.
- `Signal`: Die Signalnummer, wenn der Befehl durch ein Signal beendet wurde.
- `Background PIDs`: Eine Liste der PIDs für alle gestarteten Hintergrundprozesse.

Verwendung:

```bash
run_shell_command(command="Deine Befehle.", description="Deine Beschreibung des Befehls.", directory="Dein Ausführungsverzeichnis.", is_background=false)
```

**Hinweis:** Der Parameter `is_background` ist erforderlich und muss bei jeder Befehlsausführung explizit angegeben werden.

## `run_shell_command`-Beispiele

Dateien im aktuellen Verzeichnis auflisten:

```bash
run_shell_command(command="ls -la", is_background=false)
```

Ein Skript in einem bestimmten Verzeichnis ausführen:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Mein benutzerdefiniertes Skript ausführen", is_background=false)
```

Einen Background-Development-Server starten (empfohlener Ansatz):

```bash
run_shell_command(command="npm run dev", description="Development-Server im Hintergrund starten", is_background=true)
```

Einen Background-Server starten (Alternative mit explizitem &):

```bash
run_shell_command(command="npm run dev &", description="Development-Server im Hintergrund starten", is_background=false)
```

Einen Build-Befehl im Vordergrund ausführen:

```bash
run_shell_command(command="npm run build", description="Projekt bauen", is_background=false)
```

Mehrere Hintergrunddienste starten:

```bash
run_shell_command(command="docker-compose up", description="Alle Dienste starten", is_background=true)
```

## Konfiguration

Du kannst das Verhalten des `run_shell_command`-Tools anpassen, indem du deine `settings.json`-Datei änderst oder den `/settings`-Befehl in Qwen Code verwendest.

### Interaktive Befehle aktivieren

Die Einstellung `tools.shell.enableInteractiveShell` steuert, ob Shell-Befehle über `node-pty` (interaktives PTY) oder das einfache `child_process`-Backend ausgeführt werden. Wenn aktiviert, funktionieren interaktive Sitzungen wie `vim`, `git rebase -i` und TUI-Programme korrekt.

Diese Einstellung ist auf den meisten Plattformen standardmäßig auf `true` gesetzt. Unter Windows-Builds **<= 19041** (vor Windows 10 Version 2004) ist sie standardmäßig `false`, da ältere ConPTY-Implementierungen bekannte Zuverlässigkeitsprobleme aufweisen (fehlende Ausgabe, Hänger). Dies entspricht dem gleichen Cutoff, der von VS Code verwendet wird ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). Wenn `node-pty` zur Laufzeit nicht verfügbar ist, fällt das Tool unabhängig von dieser Einstellung auf `child_process` zurück.

Um den Standardwert explizit zu überschreiben, setze den Wert in `settings.json`:

**Beispiel `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "enableInteractiveShell": true
    }
  }
}
```

### Farben in der Ausgabe anzeigen

Um Farben in der Shell-Ausgabe anzuzeigen, musst du die Einstellung `tools.shell.showColor` auf `true` setzen. **Hinweis: Diese Einstellung gilt nur, wenn `tools.shell.enableInteractiveShell` aktiviert ist.**

**Beispiel `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "showColor": true
    }
  }
}
```

### Pager festlegen

Du kannst einen benutzerdefinierten Pager für die Shell-Ausgabe festlegen, indem du die Einstellung `tools.shell.pager` setzt. Der Standard-Pager ist `cat` auf Nicht-Windows-Plattformen. Unter Windows ist kein Standard festgelegt. Setze `tools.shell.pager` auf einen leeren String, um Pager-Umgebungsvariablen zu deaktivieren. **Hinweis: Diese Einstellung gilt nur, wenn `tools.shell.enableInteractiveShell` aktiviert ist.**

**Beispiel `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "pager": "less"
    }
  }
}
```

## Interaktive Befehle

Das `run_shell_command`-Tool unterstützt jetzt interaktive Befehle durch die Integration eines Pseudo-Terminals (pty). Dies ermöglicht dir die Ausführung von Befehlen, die Echtzeit-Benutzereingaben erfordern, wie Texteditoren (`vim`, `nano`), terminalbasierte UIs (`htop`) und interaktive Versionskontrolloperationen (`git rebase -i`).

Wenn ein interaktiver Befehl ausgeführt wird, kannst du aus Qwen Code Eingaben daran senden. Um den Fokus auf die interaktive Shell zu legen, drücke `ctrl+f`. Die Terminalausgabe, einschließlich komplexer TUIs, wird korrekt gerendert.

## Wichtige Hinweise

- **Sicherheit:** Sei vorsichtig bei der Ausführung von Befehlen, insbesondere bei solchen, die aus Benutzereingaben konstruiert werden, um Sicherheitslücken zu vermeiden.
- **Fehlerbehandlung:** Überprüfe die Felder `Stderr`, `Error` und `Exit Code`, um festzustellen, ob ein Befehl erfolgreich ausgeführt wurde.
- **Hintergrundprozesse:** Wenn `is_background=true` ist oder ein Befehl `&` enthält, kehrt das Tool sofort zurück und der Prozess läuft im Hintergrund weiter. Das Feld `Background PIDs` enthält die Prozess-ID des Hintergrundprozesses.
- **Wahl der Hintergrundausführung:** Der Parameter `is_background` ist erforderlich und bietet eine explizite Kontrolle über den Ausführungsmodus. Du kannst dem Befehl auch `&` für eine manuelle Hintergrundausführung hinzufügen, aber der Parameter `is_background` muss dennoch angegeben werden. Der Parameter sorgt für eine klarere Absicht und übernimmt automatisch die Einrichtung der Hintergrundausführung.
- **Befehlsbeschreibungen:** Bei Verwendung von `is_background=true` enthält die Befehlsbeschreibung einen `[background]`-Indikator, um den Ausführungsmodus deutlich anzuzeigen.

## Umgebungsvariablen

Wenn `run_shell_command` einen Befehl ausführt, setzt es die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Subprozesses. Dies ermöglicht es Skripten oder Tools zu erkennen, ob sie aus der CLI heraus ausgeführt werden.

## Befehlsbeschränkungen

Du kannst die Befehle, die vom `run_shell_command`-Tool ausgeführt werden können, einschränken, indem du die Einstellungen `tools.core` und `tools.exclude` in deiner Konfigurationsdatei verwendest.

- `tools.core`: Um `run_shell_command` auf einen bestimmten Satz von Befehlen zu beschränken, füge Einträge zur `core`-Liste unter der Kategorie `tools` im Format `run_shell_command(<command>)` hinzu. Zum Beispiel erlaubt `"tools": {"core": ["run_shell_command(git)"]}` nur `git`-Befehle. Die Aufnahme des generischen `run_shell_command` fungiert als Wildcard und erlaubt jeden Befehl, der nicht explizit blockiert ist.
- `tools.exclude`: Um bestimmte Befehle zu blockieren, füge Einträge zur `exclude`-Liste unter der Kategorie `tools` im Format `run_shell_command(<command>)` hinzu. Zum Beispiel blockiert `"tools": {"exclude": ["run_shell_command(rm)"]}` `rm`-Befehle.

Die Validierungslogik ist darauf ausgelegt, sicher und flexibel zu sein:

1.  **Command Chaining deaktiviert**: Das Tool teilt automatisch Befehle, die mit `&&`, `||` oder `;` verkettet sind, und validiert jeden Teil separat. Wenn ein Teil der Kette nicht erlaubt ist, wird der gesamte Befehl blockiert.
2.  **Prefix-Matching**: Das Tool verwendet Prefix-Matching. Wenn du beispielsweise `git` erlaubst, kannst du `git status` oder `git log` ausführen.
3.  **Vorrang der Blocklist**: Die `tools.exclude`-Liste wird immer zuerst überprüft. Wenn ein Befehl mit einem blockierten Prefix übereinstimmt, wird er abgelehnt, auch wenn er mit einem erlaubten Prefix in `tools.core` übereinstimmt.

### Beispiele für Befehlsbeschränkungen

**Nur bestimmte Befehls-Prefixe erlauben**

Um nur `git`- und `npm`-Befehle zu erlauben und alle anderen zu blockieren:

```json
{
  "tools": {
    "core": ["run_shell_command(git)", "run_shell_command(npm)"]
  }
}
```

- `git status`: Erlaubt
- `npm install`: Erlaubt
- `ls -l`: Blockiert

**Bestimmte Befehls-Prefixe blockieren**

Um `rm` zu blockieren und alle anderen Befehle zu erlauben:

```json
{
  "tools": {
    "core": ["run_shell_command"],
    "exclude": ["run_shell_command(rm)"]
  }
}
```

- `rm -rf /`: Blockiert
- `git status`: Erlaubt
- `npm install`: Erlaubt

**Blocklist hat Vorrang**

Wenn ein Befehls-Prefix sowohl in `tools.core` als auch in `tools.exclude` enthalten ist, wird er blockiert.

```json
{
  "tools": {
    "core": ["run_shell_command(git)"],
    "exclude": ["run_shell_command(git push)"]
  }
}
```

- `git push origin main`: Blockiert
- `git status`: Erlaubt

**Alle Shell-Befehle blockieren**

Um alle Shell-Befehle zu blockieren, füge den `run_shell_command`-Wildcard zu `tools.exclude` hinzu:

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`: Blockiert
- `jeder andere Befehl`: Blockiert

## Sicherheitshinweis für `excludeTools`

Befehlsspezifische Einschränkungen in `excludeTools` für `run_shell_command` basieren auf einfachem String-Matching und können leicht umgangen werden. Dieses Feature ist **kein Sicherheitsmechanismus** und sollte nicht verwendet werden, um nicht vertrauenswürdigen Code sicher auszuführen. Es wird empfohlen, `coreTools` zu verwenden, um explizit die Befehle auszuwählen, die ausgeführt werden können.