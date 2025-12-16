# Shell-Tool (`run_shell_command`)

Dieses Dokument beschreibt das `run_shell_command`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `run_shell_command`, um mit dem zugrunde liegenden System zu interagieren, Skripte auszuführen oder Befehlszeilenoperationen durchzuführen. `run_shell_command` führt einen angegebenen Shell-Befehl aus, einschließlich interaktiver Befehle, die eine Benutzereingabe erfordern (z. B. `vim`, `git rebase -i`), wenn die Einstellung `tools.shell.enableInteractiveShell` auf `true` gesetzt ist.

Unter Windows werden Befehle mit `cmd.exe /c` ausgeführt. Auf anderen Plattformen werden sie mit `bash -c` ausgeführt.

### Argumente

`run_shell_command` akzeptiert die folgenden Argumente:

- `command` (String, erforderlich): Der genaue Shell-Befehl, der ausgeführt werden soll.
- `description` (String, optional): Eine kurze Beschreibung des Zwecks des Befehls, die dem Benutzer angezeigt wird.
- `directory` (String, optional): Das Verzeichnis (relativ zum Projektstamm), in dem der Befehl ausgeführt werden soll. Wenn nicht angegeben, wird der Befehl im Projektstamm ausgeführt.
- `is_background` (Boolean, erforderlich): Gibt an, ob der Befehl im Hintergrund ausgeführt werden soll. Dieser Parameter ist erforderlich, um eine explizite Entscheidung über den Ausführungsmodus des Befehls zu gewährleisten. Auf `true` setzen für langlaufende Prozesse wie Entwicklungsserver, Watcher oder Daemons, die weiterlaufen sollen, ohne weitere Befehle zu blockieren. Auf `false` setzen für einmalige Befehle, die abgeschlossen sein müssen, bevor fortgefahren wird.

## Verwendung von `run_shell_command` mit Qwen Code

Bei der Verwendung von `run_shell_command` wird der Befehl als Subprozess ausgeführt. Du kannst steuern, ob Befehle im Hintergrund oder Vordergrund laufen, indem du den Parameter `is_background` verwendest oder explizit `&` zu den Befehlen hinzufügst. Das Tool gibt detaillierte Informationen über die Ausführung zurück, darunter:

### Erforderlicher Hintergrundparameter

Der Parameter `is_background` ist **erforderlich** für alle Befehlsausführungen. Dieses Design stellt sicher, dass das LLM (und die Benutzer) bewusst entscheiden müssen, ob jeder Befehl im Hintergrund oder Vordergrund ausgeführt werden soll, was ein absichtliches und vorhersehbares Verhalten bei der Befehlsausführung fördert. Durch die obligatorische Festlegung dieses Parameters vermeiden wir unbeabsichtigte Rückgriffe auf die Vordergrundausführung, die nachfolgende Operationen blockieren könnte, wenn es sich um langlaufende Prozesse handelt.

### Hintergrund- vs Vordergrundausführung

Das Tool behandelt intelligent Hintergrund- und Vordergrundausführung basierend auf Ihrer expliziten Auswahl:

**Verwenden Sie die Hintergrundausführung (`is_background: true`) für:**

- Langlaufende Entwicklungsserver: `npm run start`, `npm run dev`, `yarn dev`
- Build-Watcher: `npm run watch`, `webpack --watch`
- Datenbankserver: `mongod`, `mysql`, `redis-server`
- Webserver: `python -m http.server`, `php -S localhost:8000`
- Jeder Befehl, der voraussichtlich unbegrenzt läuft, bis er manuell gestoppt wird

**Verwenden Sie die Vordergrundausführung (`is_background: false`) für:**

- Einmalige Befehle: `ls`, `cat`, `grep`
- Build-Befehle: `npm run build`, `make`
- Installationsbefehle: `npm install`, `pip install`
- Git-Operationen: `git commit`, `git push`
- Testläufe: `npm test`, `pytest`

### Ausführungs-Informationen

Das Tool gibt detaillierte Informationen über die Ausführung zurück, darunter:

- `Command`: Der Befehl, der ausgeführt wurde.
- `Directory`: Das Verzeichnis, in dem der Befehl ausgeführt wurde.
- `Stdout`: Ausgabe vom Standardausgabestrom.
- `Stderr`: Ausgabe vom Standardfehlerstrom.
- `Error`: Jegliche Fehlermeldung, die vom Unterprozess gemeldet wurde.
- `Exit Code`: Der Exit-Code des Befehls.
- `Signal`: Die Signalnummer, falls der Befehl durch ein Signal beendet wurde.
- `Background PIDs`: Eine Liste von PIDs für alle gestarteten Hintergrundprozesse.

Verwendung:

```bash
run_shell_command(command="Ihre Befehle.", description="Ihre Beschreibung des Befehls.", directory="Ihr Ausführungsverzeichnis.", is_background=false)
```

**Hinweis:** Der Parameter `is_background` ist erforderlich und muss bei jeder Befehlsausführung explizit angegeben werden.

## `run_shell_command` Beispiele

Dateien im aktuellen Verzeichnis auflisten:

```bash
run_shell_command(command="ls -la", is_background=false)
```

Ein Skript in einem bestimmten Verzeichnis ausführen:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Mein benutzerdefiniertes Skript ausführen", is_background=false)
```

Einen Entwicklungsserver im Hintergrund starten (empfohlener Ansatz):

```bash
run_shell_command(command="npm run dev", description="Entwicklungsserver im Hintergrund starten", is_background=true)
```

Einen Server im Hintergrund starten (Alternative mit explizitem &):

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

Du kannst das Verhalten des `run_shell_command`-Tools konfigurieren, indem du deine `settings.json`-Datei bearbeitest oder den Befehl `/settings` im Qwen Code verwendest.

### Interaktive Befehle aktivieren

Um interaktive Befehle zu aktivieren, musst du die Einstellung `tools.shell.enableInteractiveShell` auf `true` setzen. Dadurch wird `node-pty` für die Ausführung von Shell-Befehlen verwendet, was interaktive Sitzungen ermöglicht. Falls `node-pty` nicht verfügbar ist, greift das System auf die Implementierung mit `child_process` zurück, welche keine interaktiven Befehle unterstützt.

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

### Festlegen des Pagers

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

Das Tool `run_shell_command` unterstützt nun interaktive Befehle durch die Integration eines Pseudo-Terminals (pty). Dadurch können Sie Befehle ausführen, die eine Echtzeiteingabe vom Benutzer erfordern, wie Texteditoren (`vim`, `nano`), Terminal-basierte Benutzeroberflächen (`htop`) und interaktive Versionskontrollvorgänge (`git rebase -i`).

Während ein interaktiver Befehl ausgeführt wird, können Sie von Qwen Code aus Eingaben an diesen senden. Um den Fokus auf die interaktive Shell zu legen, drücken Sie `Strg+f`. Die Terminalausgabe, einschließlich komplexer TUIs, wird korrekt dargestellt.

## Wichtige Hinweise

- **Sicherheit:** Seien Sie vorsichtig beim Ausführen von Befehlen, insbesondere solchen, die aus Benutzereingaben konstruiert werden, um Sicherheitslücken zu vermeiden.
- **Fehlerbehandlung:** Prüfen Sie die Felder `Stderr`, `Error` und `Exit Code`, um festzustellen, ob ein Befehl erfolgreich ausgeführt wurde.
- **Hintergrundprozesse:** Wenn `is_background=true` ist oder wenn ein Befehl `&` enthält, kehrt das Tool sofort zurück und der Prozess wird im Hintergrund weiter ausgeführt. Das Feld `Background PIDs` enthält die Prozess-ID des Hintergrundprozesses.
- **Auswahlmöglichkeiten für die Hintergrundausführung:** Der Parameter `is_background` ist erforderlich und bietet explizite Kontrolle über den Ausführungsmodus. Sie können auch manuell `&` zum Befehl hinzufügen, um eine Hintergrundausführung zu erzwingen, aber der Parameter `is_background` muss dennoch angegeben werden. Der Parameter verdeutlicht die Absicht und übernimmt automatisch die Einrichtung der Hintergrundausführung.
- **Befehlsbeschreibungen:** Bei Verwendung von `is_background=true` enthält die Befehlsbeschreibung einen `[background]`-Indikator, um den Ausführungsmodus klar zu kennzeichnen.

## Umgebungsvariablen

Wenn `run_shell_command` einen Befehl ausführt, setzt es die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Unterprozesses. Dies ermöglicht es Skripten oder Tools zu erkennen, ob sie aus der CLI heraus ausgeführt werden.

## Befehlseinschränkungen

Sie können die Befehle einschränken, die vom `run_shell_command`-Tool ausgeführt werden dürfen, indem Sie die Einstellungen `tools.core` und `tools.exclude` in Ihrer Konfigurationsdatei verwenden.

- `tools.core`: Um `run_shell_command` auf eine bestimmte Menge von Befehlen zu beschränken, fügen Sie Einträge im Format `run_shell_command(<Befehl>)` zur `core`-Liste unter der Kategorie `tools` hinzu. Beispiel: `"tools": {"core": ["run_shell_command(git)"]}` erlaubt nur `git`-Befehle. Das generische `run_shell_command` ohne Angabe eines konkreten Befehls wirkt wie ein Platzhalter und erlaubt jeden Befehl, der nicht explizit blockiert ist.
- `tools.exclude`: Um bestimmte Befehle zu blockieren, fügen Sie Einträge im Format `run_shell_command(<Befehl>)` zur `exclude`-Liste unter der Kategorie `tools` hinzu. Beispiel: `"tools": {"exclude": ["run_shell_command(rm)"]}` blockiert `rm`-Befehle.

Die Validierungslogik ist sicher und flexibel gestaltet:

1.  **Befehlsverkettung deaktiviert**: Das Tool trennt automatisch durch `&&`, `||` oder `;` verkettete Befehle und validiert jeden Teil einzeln. Wenn ein Teil der Kette nicht erlaubt ist, wird der gesamte Befehl blockiert.
2.  **Präfix-basierte Übereinstimmung**: Das Tool verwendet präfixbasierte Übereinstimmung. Wenn Sie zum Beispiel `git` erlauben, können Sie `git status` oder `git log` ausführen.
3.  **Vorrang der Blockliste**: Die Liste `tools.exclude` wird immer zuerst überprüft. Wenn ein Befehl einem blockierten Präfix entspricht, wird er abgelehnt, selbst wenn er auch einem erlaubten Präfix in `tools.core` entspricht.

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

Um alle Shell-Befehle zu blockieren, fügen Sie den Platzhalter `run_shell_command` zu `tools.exclude` hinzu:

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`: Blockiert
- `jeder anderer Befehl`: Blockiert

## Sicherheitshinweis für `excludeTools`

Befehlsspezifische Einschränkungen in `excludeTools` für `run_shell_command` basieren auf einfacher String-Matching und können leicht umgangen werden. Diese Funktion ist **kein Sicherheitsmechanismus** und sollte nicht darauf verlassen werden, um nicht vertrauenswürdigen Code sicher auszuführen. Es wird empfohlen, `coreTools` zu verwenden, um explizit Befehle auszuwählen,
die ausgeführt werden dürfen.