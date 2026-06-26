# Shell-Tool (`run_shell_command`)

Dieses Dokument beschreibt das `run_shell_command`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `run_shell_command`, um mit dem zugrunde liegenden System zu interagieren, Skripte auszuführen oder Befehlszeilenoperationen durchzuführen. `run_shell_command` führt einen gegebenen Shell-Befehl aus, einschließlich interaktiver Befehle, die Benutzereingaben erfordern (z. B. `vim`, `git rebase -i`), wenn die Einstellung `tools.shell.enableInteractiveShell` auf `true` gesetzt ist.

Unter Windows werden Befehle mit `cmd.exe /c` ausgeführt. Auf anderen Plattformen werden sie mit `bash -c` ausgeführt.

### Argumente

`run_shell_command` akzeptiert die folgenden Argumente:

- `command` (string, erforderlich): Der genaue Shell-Befehl, der ausgeführt werden soll.
- `description` (string, optional): Eine kurze Beschreibung des Zwecks des Befehls, die dem Benutzer angezeigt wird.
- `directory` (string, optional): Das Verzeichnis (relativ zum Projektstamm), in dem der Befehl ausgeführt werden soll. Wenn nicht angegeben, wird der Befehl im Projektstamm ausgeführt.
- `is_background` (boolean, erforderlich): Gibt an, ob der Befehl im Hintergrund ausgeführt werden soll. Dieser Parameter ist erforderlich, um eine explizite Entscheidung über den Ausführungsmodus des Befehls zu erzwingen. Setzen Sie ihn auf `true` für lang laufende Prozesse wie Entwicklungsserver, Watcher oder Dienste, die weiterlaufen sollen, ohne weitere Befehle zu blockieren. Setzen Sie ihn auf `false` für einmalige Befehle, die abgeschlossen werden sollen, bevor fortgefahren wird.

## Verwendung von `run_shell_command` mit Qwen Code

Bei der Verwendung von `run_shell_command` wird der Befehl als Unterprozess ausgeführt. Sie können steuern, ob Befehle im Hintergrund oder im Vordergrund ausgeführt werden, indem Sie den Parameter `is_background` verwenden oder explizit ein `&` an den Befehl anhängen. Das Tool gibt detaillierte Informationen über die Ausführung zurück, einschließlich:

### Erforderlicher Hintergrund-Parameter

Der Parameter `is_background` ist **erforderlich** für alle Befehlsausführungen. Dieses Design stellt sicher, dass das LLM (und die Benutzer) explizit entscheiden müssen, ob jeder Befehl im Hintergrund oder Vordergrund ausgeführt werden soll, und fördert so ein beabsichtigtes und vorhersagbares Verhalten der Befehlsausführung. Indem dieser Parameter obligatorisch gemacht wird, vermeiden wir unbeabsichtigte Rückfälle auf die Vordergrundausführung, die nachfolgende Operationen blockieren könnten, wenn es sich um lang laufende Prozesse handelt.

### Hintergrund- vs. Vordergrundausführung

Das Tool behandelt die Hintergrund- und Vordergrundausführung intelligent basierend auf Ihrer expliziten Wahl:

**Verwenden Sie die Hintergrundausführung (`is_background: true`) für:**

- Lang laufende Entwicklungsserver: `npm run start`, `npm run dev`, `yarn dev`
- Build-Watcher: `npm run watch`, `webpack --watch`
- Datenbank-Server: `mongod`, `mysql`, `redis-server`
- Webserver: `python -m http.server`, `php -S localhost:8000`
- Jeder Befehl, der voraussichtlich unbegrenzt läuft, bis er manuell gestoppt wird

**Verwenden Sie die Vordergrundausführung (`is_background: false`) für:**

- Einmalige Befehle: `ls`, `cat`, `grep`
- Build-Befehle: `npm run build`, `make`
- Installationsbefehle: `npm install`, `pip install`
- Git-Operationen: `git commit`, `git push`
- Testläufe: `npm test`, `pytest`

### Ausführungsinformationen

Das Tool gibt detaillierte Informationen über die Ausführung zurück, einschließlich:

- `Command`: Der ausgeführte Befehl.
- `Directory`: Das Verzeichnis, in dem der Befehl ausgeführt wurde.
- `Stdout`: Ausgabe des Standardausgabestroms.
- `Stderr`: Ausgabe des Standardfehlerstroms.
- `Error`: Eventuelle Fehlermeldungen des Unterprozesses.
- `Exit Code`: Der Exit-Code des Befehls.
- `Signal`: Die Signummer, wenn der Befehl durch ein Signal beendet wurde.
- `Background PIDs`: Eine Liste der PIDs für alle gestarteten Hintergrundprozesse.

Verwendung:

```bash
run_shell_command(command="Ihre Befehle.", description="Ihre Beschreibung des Befehls.", directory="Ihr Ausführungsverzeichnis.", is_background=false)
```

**Hinweis:** Der Parameter `is_background` ist erforderlich und muss für jeden Befehl explizit angegeben werden.

## Beispiele für `run_shell_command`

Liste der Dateien im aktuellen Verzeichnis:

```bash
run_shell_command(command="ls -la", is_background=false)
```

Ein Skript in einem bestimmten Verzeichnis ausführen:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Mein benutzerdefiniertes Skript ausführen", is_background=false)
```

Einen Hintergrundentwicklungsserver starten (empfohlener Ansatz):

```bash
run_shell_command(command="npm run dev", description="Entwicklungsserver im Hintergrund starten", is_background=true)
```

Einen Hintergrundserver starten (Alternative mit explizitem &):

```bash
run_shell_command(command="npm run dev &", description="Entwicklungsserver im Hintergrund starten", is_background=false)
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

Sie können das Verhalten des `run_shell_command`-Tools konfigurieren, indem Sie Ihre `settings.json`-Datei ändern oder den Befehl `/settings` in Qwen Code verwenden.

### Aktivieren interaktiver Befehle

Die Einstellung `tools.shell.enableInteractiveShell` steuert, ob Shell-Befehle über `node-pty` (interaktive PTY) oder das einfache `child_process`-Backend ausgeführt werden. Wenn aktiviert, funktionieren interaktive Sitzungen wie `vim`, `git rebase -i` und TUI-Programme korrekt.

Diese Einstellung ist auf den meisten Plattformen standardmäßig auf `true` gesetzt. Auf Windows-Builds **<= 19041** (vor Windows 10 Version 2004) ist sie standardmäßig auf `false` gesetzt, da ältere ConPTY-Implementierungen bekannte Zuverlässigkeitsprobleme haben (fehlende Ausgabe, Hänger). Dies entspricht derselben Grenze, die auch von VS Code verwendet wird ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). Wenn `node-pty` zur Laufzeit nicht verfügbar ist, fällt das Tool unabhängig von dieser Einstellung auf `child_process` zurück.

Um die Standardeinstellung explizit zu überschreiben, setzen Sie den Wert in `settings.json`:

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

### Farbige Ausgabe anzeigen

Um farbige Ausgaben in der Shell-Ausgabe anzuzeigen, müssen Sie die Einstellung `tools.shell.showColor` auf `true` setzen. **Hinweis: Diese Einstellung gilt nur, wenn `tools.shell.enableInteractiveShell` aktiviert ist.**

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

### Pager einstellen

Sie können einen benutzerdefinierten Pager für die Shell-Ausgabe festlegen, indem Sie die Einstellung `tools.shell.pager` setzen. Der Standard-Pager ist `cat`. **Hinweis: Diese Einstellung gilt nur, wenn `tools.shell.enableInteractiveShell` aktiviert ist.**

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

Das `run_shell_command`-Tool unterstützt jetzt interaktive Befehle durch die Integration einer Pseudoterminal (PTY). Dies ermöglicht die Ausführung von Befehlen, die Echtzeit-Benutzereingaben erfordern, wie Texteditoren (`vim`, `nano`), terminalbasierte Benutzeroberflächen (`htop`) und interaktive Versionsverwaltungsoperationen (`git rebase -i`).

Wenn ein interaktiver Befehl läuft, können Sie Eingaben von Qwen Code aus an ihn senden. Um den Fokus auf die interaktive Shell zu legen, drücken Sie `STRG+F`. Die Terminalausgabe, einschließlich komplexer TUIs, wird korrekt dargestellt.

## Wichtige Hinweise

- **Sicherheit:** Seien Sie vorsichtig bei der Ausführung von Befehlen, insbesondere solchen, die aus Benutzereingaben zusammengesetzt werden, um Sicherheitslücken zu vermeiden.
- **Fehlerbehandlung:** Überprüfen Sie die Felder `Stderr`, `Error` und `Exit Code`, um festzustellen, ob ein Befehl erfolgreich ausgeführt wurde.
- **Hintergrundprozesse:** Wenn `is_background=true` ist oder ein Befehl `&` enthält, wird das Tool sofort zurückkehren und der Prozess läuft im Hintergrund weiter. Das Feld `Background PIDs` enthält die Prozess-ID des Hintergrundprozesses.
- **Entscheidungen zur Hintergrundausführung:** Der Parameter `is_background` ist erforderlich und bietet explizite Kontrolle über den Ausführungsmodus. Sie können auch `&` zum Befehl für manuelle Hintergrundausführung hinzufügen, aber der Parameter `is_background` muss dennoch angegeben werden. Der Parameter verdeutlicht die Absicht und richtet die Hintergrundausführung automatisch ein.
- **Befehlsbeschreibungen:** Bei Verwendung von `is_background=true` wird die Befehlsbeschreibung einen `[background]`-Indikator enthalten, um den Ausführungsmodus klar anzuzeigen.

## Umgebungsvariablen

Wenn `run_shell_command` einen Befehl ausführt, setzt es die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Unterprozesses. Dies ermöglicht Skripten oder Tools, zu erkennen, ob sie von der CLI aus ausgeführt werden.

## Befehlseinschränkungen

Sie können die Befehle einschränken, die vom `run_shell_command`-Tool ausgeführt werden dürfen, indem Sie die Einstellungen `tools.core` und `tools.exclude` in Ihrer Konfigurationsdatei verwenden.

- `tools.core`: Um `run_shell_command` auf eine bestimmte Menge von Befehlen zu beschränken, fügen Sie Einträge zur `core`-Liste unter der Kategorie `tools` im Format `run_shell_command(<Befehl>)` hinzu. Beispielsweise erlaubt `"tools": {"core": ["run_shell_command(git)"]}` nur `git`-Befehle. Das Einfügen des generischen `run_shell_command` fungiert als Wildcard und erlaubt jeden Befehl, der nicht explizit blockiert ist.
- `tools.exclude`: Um bestimmte Befehle zu blockieren, fügen Sie Einträge zur `exclude`-Liste unter der Kategorie `tools` im Format `run_shell_command(<Befehl>)` hinzu. Beispielsweise blockiert `"tools": {"exclude": ["run_shell_command(rm)"]}` `rm`-Befehle.

Die Validierungslogik ist darauf ausgelegt, sicher und flexibel zu sein:

1.  **Befehlskettung deaktiviert**: Das Tool teilt automatisch Befehle, die mit `&&`, `||` oder `;` verknüpft sind, auf und validiert jeden Teil separat. Wenn ein Teil der Kette nicht erlaubt ist, wird der gesamte Befehl blockiert.
2.  **Präfix-Matching**: Das Tool verwendet Präfix-Matching. Wenn Sie beispielsweise `git` erlauben, können Sie `git status` oder `git log` ausführen.
3.  **Blocklist-Vorrang**: Die `tools.exclude`-Liste wird immer zuerst geprüft. Wenn ein Befehl mit einem blockierten Präfix übereinstimmt, wird er abgelehnt, selbst wenn er auch mit einem erlaubten Präfix in `tools.core` übereinstimmt.

### Beispiele für Befehlseinschränkungen

**Nur bestimmte Befehlspräfixe erlauben**

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

**Bestimmte Befehlspräfixe blockieren**

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

Wenn ein Befehlspräfix sowohl in `tools.core` als auch in `tools.exclude` vorkommt, wird es blockiert.

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

Um alle Shell-Befehle zu blockieren, fügen Sie den `run_shell_command`-Wildcard zu `tools.exclude` hinzu:

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`: Blockiert
- `jeder andere Befehl`: Blockiert

## Sicherheitshinweis zu `excludeTools`

Befehlsspezifische Einschränkungen in `excludeTools` für `run_shell_command` basieren auf einfachem String-Matching und können leicht umgangen werden. Diese Funktion ist **kein Sicherheitsmechanismus** und sollte nicht verwendet werden, um unzuverlässigen Code sicher auszuführen. Es wird empfohlen, `coreTools` zu verwenden, um explizit Befehle auszuwählen, die ausgeführt werden dürfen.