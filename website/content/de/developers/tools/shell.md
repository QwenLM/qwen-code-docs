# Shell-Tool (`run_shell_command`)

Dieses Dokument beschreibt das `run_shell_command`-Tool für Qwen Code.

## Beschreibung

Verwende `run_shell_command`, um mit dem zugrunde liegenden System zu interagieren, Skripte auszuführen oder Befehlszeilenoperationen durchzuführen. `run_shell_command` führt einen angegebenen Shell-Befehl aus, einschließlich interaktiver Befehle, die eine Benutzereingabe erfordern (z. B. `vim`, `git rebase -i`), sofern die Einstellung `tools.shell.enableInteractiveShell` auf `true` gesetzt ist.

Unter Windows werden Befehle mit `cmd.exe /c` ausgeführt. Auf anderen Plattformen erfolgt die Ausführung mit `bash -c`.

### Argumente

`run_shell_command` akzeptiert die folgenden Argumente:

- `command` (string, erforderlich): Der exakte Shell-Befehl, der ausgeführt werden soll.
- `description` (string, optional): Eine kurze Beschreibung des Zwecks des Befehls, die dem Benutzer angezeigt wird.
- `directory` (string, optional): Das Verzeichnis (relativ zum Projektstamm), in dem der Befehl ausgeführt werden soll. Wird nichts angegeben, wird der Befehl im Projektstamm ausgeführt.
- `is_background` (boolean, erforderlich): Gibt an, ob der Befehl im Hintergrund ausgeführt werden soll. Dieser Parameter ist erforderlich, um eine explizite Entscheidung über den Ausführungsmodus des Befehls zu gewährleisten. Setze ihn auf `true` für langlaufende Prozesse wie Entwicklungsserver, Watcher oder Daemons, die weiterlaufen sollen, ohne weitere Befehle zu blockieren. Setze ihn auf `false` für einmalige Befehle, die abgeschlossen sein müssen, bevor fortgefahren wird.

## So verwendest du `run_shell_command` mit Qwen Code

Bei der Verwendung von `run_shell_command` wird der Befehl als Subprozess ausgeführt. Du kannst steuern, ob Befehle im Hintergrund oder Vordergrund laufen, indem du den `is_background`-Parameter verwendest oder explizit `&` an Befehle anhängst. Das Tool gibt detaillierte Informationen über die Ausführung zurück, einschließlich:

### Erforderlicher Hintergrund-Parameter

Der `is_background`-Parameter ist für alle Befehlsausführungen **erforderlich**. Dieses Design stellt sicher, dass das LLM (und Benutzer) explizit entscheiden müssen, ob jeder Befehl im Hintergrund oder Vordergrund ausgeführt werden soll. Dies fördert ein bewusstes und vorhersehbares Ausführungsverhalten. Durch die Pflichtangabe dieses Parameters vermeiden wir ein unbeabsichtigtes Fallback auf die Vordergrundausführung, das nachfolgende Operationen bei langlaufenden Prozessen blockieren könnte.

### Hintergrund- vs. Vordergrundausführung

Das Tool verarbeitet die Hintergrund- und Vordergrundausführung intelligent basierend auf deiner expliziten Auswahl:

**Verwende die Hintergrundausführung (`is_background: true`) für:**

- Langlaufende Entwicklungsserver: `npm run start`, `npm run dev`, `yarn dev`
- Build-Watcher: `npm run watch`, `webpack --watch`
- Datenbankserver: `mongod`, `mysql`, `redis-server`
- Webserver: `python -m http.server`, `php -S localhost:8000`
- Alle Befehle, die voraussichtlich unbegrenzt laufen, bis sie manuell gestoppt werden

**Verwende die Vordergrundausführung (`is_background: false`) für:**

- Einmalige Befehle: `ls`, `cat`, `grep`
- Build-Befehle: `npm run build`, `make`
- Installationsbefehle: `npm install`, `pip install`
- Git-Operationen: `git commit`, `git push`
- Testläufe: `npm test`, `pytest`

### Ausführungsinformationen

Das Tool gibt detaillierte Informationen über die Ausführung zurück, einschließlich:

- `Command`: Der ausgeführte Befehl.
- `Directory`: Das Verzeichnis, in dem der Befehl ausgeführt wurde.
- `Stdout`: Ausgabe des Standardausgabestreams.
- `Stderr`: Ausgabe des Standardfehlerstreams.
- `Error`: Eine vom Subprozess gemeldete Fehlermeldung.
- `Exit Code`: Der Exit-Code des Befehls.
- `Signal`: Die Signalnummer, falls der Befehl durch ein Signal beendet wurde.
- `Background PIDs`: Eine Liste der PIDs für alle gestarteten Hintergrundprozesse.

Verwendung:

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**Hinweis:** Der `is_background`-Parameter ist erforderlich und muss bei jeder Befehlsausführung explizit angegeben werden.

## `run_shell_command`-Beispiele

Dateien im aktuellen Verzeichnis auflisten:

```bash
run_shell_command(command="ls -la", is_background=false)
```

Ein Skript in einem bestimmten Verzeichnis ausführen:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

Einen Entwicklungsserver im Hintergrund starten (empfohlener Ansatz):

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

Einen Server im Hintergrund starten (Alternative mit explizitem &):

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

Einen Build-Befehl im Vordergrund ausführen:

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

Mehrere Hintergrunddienste starten:

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## Konfiguration

Du kannst das Verhalten des `run_shell_command`-Tools konfigurieren, indem du deine `settings.json`-Datei anpasst oder den `/settings`-Befehl in Qwen Code verwendest.

### Aktivieren interaktiver Befehle

Die Einstellung `tools.shell.enableInteractiveShell` steuert, ob Shell-Befehle über `node-pty` (interaktives PTY) oder das einfache `child_process`-Backend ausgeführt werden. Wenn aktiviert, funktionieren interaktive Sitzungen wie `vim`, `git rebase -i` und TUI-Programme korrekt.

Diese Einstellung ist auf den meisten Plattformen standardmäßig auf `true` gesetzt. Unter Windows-Builds **<= 19041** (vor Windows 10 Version 2004) ist sie standardmäßig auf `false` gesetzt, da ältere ConPTY-Implementierungen bekannte Zuverlässigkeitsprobleme aufweisen (fehlende Ausgabe, Hänger). Dies entspricht demselben Grenzwert, der von VS Code verwendet wird ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). Falls `node-pty` zur Laufzeit nicht verfügbar ist, greift das Tool unabhängig von dieser Einstellung auf `child_process` zurück.

Um den Standardwert explizit zu überschreiben, lege den Wert in `settings.json` fest:

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

Du kannst einen benutzerdefinierten Pager für die Shell-Ausgabe festlegen, indem du die Einstellung `tools.shell.pager` konfigurierst. Der Standard-Pager ist `cat`. **Hinweis: Diese Einstellung gilt nur, wenn `tools.shell.enableInteractiveShell` aktiviert ist.**

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

Das `run_shell_command`-Tool unterstützt jetzt interaktive Befehle durch die Integration eines Pseudo-Terminals (PTY). Dadurch kannst du Befehle ausführen, die Echtzeit-Benutzereingaben erfordern, wie Texteditoren (`vim`, `nano`), terminalbasierte UIs (`htop`) und interaktive Versionskontroll-Operationen (`git rebase -i`).

Wenn ein interaktiver Befehl läuft, kannst du Eingaben direkt aus Qwen Code senden. Um den Fokus auf die interaktive Shell zu legen, drücke `ctrl+f`. Die Terminalausgabe, einschließlich komplexer TUIs, wird korrekt gerendert.

## Wichtige Hinweise

- **Sicherheit:** Sei vorsichtig bei der Ausführung von Befehlen, insbesondere solchen, die aus Benutzereingaben konstruiert werden, um Sicherheitslücken zu vermeiden.
- **Fehlerbehandlung:** Prüfe die Felder `Stderr`, `Error` und `Exit Code`, um festzustellen, ob ein Befehl erfolgreich ausgeführt wurde.
- **Hintergrundprozesse:** Wenn `is_background=true` ist oder ein Befehl `&` enthält, kehrt das Tool sofort zurück und der Prozess läuft im Hintergrund weiter. Das Feld `Background PIDs` enthält die Prozess-ID des Hintergrundprozesses.
- **Auswahl der Hintergrundausführung:** Der `is_background`-Parameter ist erforderlich und bietet explizite Kontrolle über den Ausführungsmodus. Du kannst auch `&` an den Befehl anhängen, um die Hintergrundausführung manuell zu steuern, der `is_background`-Parameter muss jedoch weiterhin angegeben werden. Der Parameter verdeutlicht die Absicht und übernimmt automatisch die Einrichtung der Hintergrundausführung.
- **Befehlsbeschreibungen:** Bei Verwendung von `is_background=true` enthält die Befehlsbeschreibung einen `[background]`-Indikator, um den Ausführungsmodus klar anzuzeigen.

## Umgebungsvariablen

Wenn `run_shell_command` einen Befehl ausführt, setzt es die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Subprozesses. Dies ermöglicht es Skripten oder Tools zu erkennen, ob sie innerhalb der CLI ausgeführt werden.

## Befehlseinschränkungen

Du kannst die Befehle einschränken, die vom `run_shell_command`-Tool ausgeführt werden dürfen, indem du die Einstellungen `tools.core` und `tools.exclude` in deiner Konfigurationsdatei verwendest.

- `tools.core`: Um `run_shell_command` auf eine bestimmte Menge von Befehlen zu beschränken, füge Einträge zur `core`-Liste unter der Kategorie `tools` im Format `run_shell_command(<command>)` hinzu. Beispiel: `"tools": {"core": ["run_shell_command(git)"]}` erlaubt nur `git`-Befehle. Die Angabe des generischen `run_shell_command` fungiert als Platzhalter und erlaubt jeden Befehl, der nicht explizit blockiert ist.
- `tools.exclude`: Um bestimmte Befehle zu blockieren, füge Einträge zur `exclude`-Liste unter der Kategorie `tools` im Format `run_shell_command(<command>)` hinzu. Beispiel: `"tools": {"exclude": ["run_shell_command(rm)"]}` blockiert `rm`-Befehle.

Die Validierungslogik ist darauf ausgelegt, sicher und flexibel zu sein:

1.  **Befehlsverkettung deaktiviert**: Das Tool teilt Befehle, die mit `&&`, `||` oder `;` verkettet sind, automatisch auf und validiert jeden Teil separat. Wenn ein Teil der Kette nicht erlaubt ist, wird der gesamte Befehl blockiert.
2.  **Präfix-Abgleich**: Das Tool verwendet Präfix-Abgleich. Wenn du beispielsweise `git` erlaubst, kannst du `git status` oder `git log` ausführen.
3.  **Vorrang der Blockliste**: Die `tools.exclude`-Liste wird immer zuerst geprüft. Stimmt ein Befehl mit einem blockierten Präfix überein, wird er abgelehnt, auch wenn er gleichzeitig mit einem erlaubten Präfix in `tools.core` übereinstimmt.

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

**Blockliste hat Vorrang**

Wenn ein Befehlspräfix sowohl in `tools.core` als auch in `tools.exclude` enthalten ist, wird es blockiert.

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

Um alle Shell-Befehle zu blockieren, füge den Platzhalter `run_shell_command` zu `tools.exclude` hinzu:

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

Befehlsspezifische Einschränkungen in `excludeTools` für `run_shell_command` basieren auf einfachem String-Matching und können leicht umgangen werden. Dieses Feature ist **kein Sicherheitsmechanismus** und sollte nicht darauf verlassen werden, um nicht vertrauenswürdigen Code sicher auszuführen. Es wird empfohlen, `coreTools` zu verwenden, um explizit auszuwählen, welche Befehle ausgeführt werden dürfen.