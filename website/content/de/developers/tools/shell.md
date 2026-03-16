# Shell-Tool (`run_shell_command`)

Dieses Dokument beschreibt das Tool `run_shell_command` für Qwen Code.

## Beschreibung

Verwenden Sie `run_shell_command`, um mit dem zugrunde liegenden System zu interagieren, Skripte auszuführen oder Befehlszeilenoperationen durchzuführen. `run_shell_command` führt einen angegebenen Shell-Befehl aus, einschließlich interaktiver Befehle, die Benutzereingaben erfordern (z. B. `vim`, `git rebase -i`), sofern die Einstellung `tools.shell.enableInteractiveShell` auf `true` gesetzt ist.

Unter Windows werden Befehle mit `cmd.exe /c` ausgeführt. Auf anderen Plattformen erfolgt die Ausführung mit `bash -c`.

### Argumente

`run_shell_command` akzeptiert die folgenden Argumente:

- `command` (Zeichenkette, erforderlich): Der genaue Shell-Befehl, der ausgeführt werden soll.
- `description` (Zeichenkette, optional): Eine kurze Beschreibung des Zwecks des Befehls, die dem Benutzer angezeigt wird.
- `directory` (Zeichenkette, optional): Das Verzeichnis (relativ zum Projektstamm), in dem der Befehl ausgeführt werden soll. Falls nicht angegeben, wird der Befehl im Projektstamm ausgeführt.
- `is_background` (boolesch, erforderlich): Ob der Befehl im Hintergrund ausgeführt werden soll. Dieser Parameter ist erforderlich, um eine bewusste Entscheidung über den Ausführungsmodus des Befehls zu gewährleisten. Legen Sie ihn auf `true` fest für lang laufende Prozesse wie Entwicklungsserver, Watcher oder Daemons, die weiterlaufen sollen, ohne nachfolgende Befehle zu blockieren. Legen Sie ihn auf `false` fest für Einmal-Befehle, die vor Fortsetzung abgeschlossen sein müssen.

## So verwenden Sie `run_shell_command` mit Qwen Code

Bei Verwendung von `run_shell_command` wird der Befehl als Unterprozess ausgeführt. Sie können steuern, ob Befehle im Hintergrund oder im Vordergrund ausgeführt werden, indem Sie den Parameter `is_background` verwenden oder explizit `&` an die Befehle anhängen. Das Tool gibt detaillierte Informationen zur Ausführung zurück, darunter:

### Erforderlicher Hintergrundparameter

Der Parameter `is_background` ist für alle Befehlsausführungen **erforderlich**. Dieses Design stellt sicher, dass das LLM (und die Benutzer) explizit entscheiden müssen, ob jeder Befehl im Hintergrund oder im Vordergrund ausgeführt werden soll, um eine gezielte und vorhersehbare Befehlsausführung zu gewährleisten. Durch die Pflichtangabe dieses Parameters wird ein unbeabsichtigter Fallback auf die Vordergrundausführung vermieden, der bei langlaufenden Prozessen nachfolgende Operationen blockieren könnte.

### Hintergrund- vs. Vordergrundausführung

Das Tool verarbeitet Hintergrund- und Vordergrundausführungen intelligent, basierend auf Ihrer expliziten Wahl:

**Verwenden Sie die Hintergrundausführung (`is_background: true`) für:**

- Lang laufende Entwicklungsserver: `npm run start`, `npm run dev`, `yarn dev`
- Build-Beobachter: `npm run watch`, `webpack --watch`
- Datenbankserver: `mongod`, `mysql`, `redis-server`
- Webserver: `python -m http.server`, `php -S localhost:8000`
- Alle Befehle, die erwartungsgemäß unbegrenzt laufen, bis sie manuell gestoppt werden

**Verwenden Sie die Vordergrundausführung (`is_background: false`) für:**

- Einmalige Befehle: `ls`, `cat`, `grep`
- Build-Befehle: `npm run build`, `make`
- Installationsbefehle: `npm install`, `pip install`
- Git-Operationen: `git commit`, `git push`
- Testausführungen: `npm test`, `pytest`

### Ausführungsinformationen

Das Tool gibt detaillierte Informationen zur Ausführung zurück, darunter:

- `Command`: Der ausgeführte Befehl.
- `Directory`: Das Verzeichnis, in dem der Befehl ausgeführt wurde.
- `Stdout`: Die Ausgabe des Standardausgabestreams.
- `Stderr`: Die Ausgabe des Standardfehlerstreams.
- `Error`: Eine etwaige Fehlermeldung des Unterprozesses.
- `Exit Code`: Der Exit-Code des Befehls.
- `Signal`: Die Signalnummer, falls der Befehl durch ein Signal beendet wurde.
- `Background PIDs`: Eine Liste der Prozess-IDs (PIDs) für alle gestarteten Hintergrundprozesse.

Verwendung:

```bash
run_shell_command(command="Ihre Befehle.", description="Beschreibung Ihres Befehls.", directory="Verzeichnis für die Ausführung.", is_background=false)
```

**Hinweis:** Der Parameter `is_background` ist erforderlich und muss bei jeder Befehlsausführung explizit angegeben werden.

## `run_shell_command`-Beispiele

Listet die Dateien im aktuellen Verzeichnis auf:

```bash
run_shell_command(command="ls -la", is_background=false)
```

Führt ein Skript in einem bestimmten Verzeichnis aus:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Mein benutzerdefiniertes Skript ausführen", is_background=false)
```

Startet einen Entwicklungsserver im Hintergrund (empfohlener Ansatz):

```bash
run_shell_command(command="npm run dev", description="Entwicklungsserver im Hintergrund starten", is_background=true)
```

Startet einen Server im Hintergrund (Alternative mit explizitem `&`):

```bash
run_shell_command(command="npm run dev &", description="Entwicklungsserver im Hintergrund starten", is_background=false)
```

Führt einen Build-Befehl im Vordergrund aus:

```bash
run_shell_command(command="npm run build", description="Projekt erstellen", is_background=false)
```

Startet mehrere Hintergrunddienste:

```bash
run_shell_command(command="docker-compose up", description="Alle Dienste starten", is_background=true)
```

## Konfiguration

Sie können das Verhalten des Tools `run_shell_command` konfigurieren, indem Sie Ihre Datei `settings.json` bearbeiten oder den Befehl `/settings` in Qwen Code verwenden.

### Interaktive Befehle aktivieren

Die Einstellung `tools.shell.enableInteractiveShell` steuert, ob Shell-Befehle über `node-pty` (interaktive PTY) oder über das einfache `child_process`-Backend ausgeführt werden. Wenn diese Einstellung aktiviert ist, funktionieren interaktive Sitzungen wie `vim`, `git rebase -i` und TUI-Programme korrekt.

Auf den meisten Plattformen ist diese Einstellung standardmäßig auf `true` gesetzt. Auf Windows-Versionen mit Buildnummer **<= 19041** (vor Windows 10 Version 2004) ist der Standardwert hingegen `false`, da ältere ConPTY-Implementierungen bekannte Zuverlässigkeitsprobleme aufweisen (fehlende Ausgabe, Hängen). Dies entspricht dem gleichen Cut-off-Wert, den VS Code verwendet ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). Falls `node-pty` zur Laufzeit nicht verfügbar ist, wechselt das Tool unabhängig von dieser Einstellung automatisch zum `child_process`-Backend.

Um den Standardwert explizit zu überschreiben, legen Sie den Wert in `settings.json` fest:

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

Um Farben in der Shell-Ausgabe anzuzeigen, müssen Sie die Einstellung `tools.shell.showColor` auf `true` setzen. **Hinweis: Diese Einstellung gilt nur, wenn `tools.shell.enableInteractiveShell` aktiviert ist.**

**Beispiel für `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "showColor": true
    }
  }
}
```

### Den Pager festlegen

Sie können einen benutzerdefinierten Pager für die Shell-Ausgabe festlegen, indem Sie die Einstellung `tools.shell.pager` konfigurieren. Der Standard-Pager ist `cat`. **Hinweis: Diese Einstellung gilt nur, wenn `tools.shell.enableInteractiveShell` aktiviert ist.**

**Beispiel für `settings.json`:**

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

Das Tool `run_shell_command` unterstützt nun interaktive Befehle durch die Integration eines Pseudo-Terminals (PTY). Damit können Sie Befehle ausführen, die Eingaben in Echtzeit vom Benutzer erfordern – beispielsweise Texteditoren (`vim`, `nano`), terminalbasierte Benutzeroberflächen (`htop`) oder interaktive Versionskontrollvorgänge (`git rebase -i`).

Während ein interaktiver Befehl läuft, können Sie über Qwen Code Eingaben an ihn senden. Um den Fokus auf die interaktive Shell zu legen, drücken Sie `Strg+F`. Die Terminalausgabe – inklusive komplexer TUIs – wird korrekt gerendert.

## Wichtige Hinweise

- **Sicherheit:** Seien Sie vorsichtig beim Ausführen von Befehlen – insbesondere bei solchen, die aus Benutzereingaben erstellt werden – um Sicherheitslücken zu vermeiden.
- **Fehlerbehandlung:** Prüfen Sie die Felder `Stderr`, `Error` und `Exit Code`, um festzustellen, ob ein Befehl erfolgreich ausgeführt wurde.
- **Hintergrundprozesse:** Wenn `is_background=true` ist oder der Befehl ein `&` enthält, gibt das Tool sofort zurück, während der Prozess im Hintergrund weiterläuft. Das Feld `Background PIDs` enthält die Prozess-ID des Hintergrundprozesses.
- **Auswahlmöglichkeiten für die Hintergrundausführung:** Der Parameter `is_background` ist zwingend erforderlich und bietet explizite Kontrolle über den Ausführungsmodus. Sie können `&` auch manuell an den Befehl anhängen, um ihn im Hintergrund auszuführen; der Parameter `is_background` muss jedoch trotzdem angegeben werden. Er macht die Absicht deutlicher und übernimmt automatisch die Einrichtung der Hintergrundausführung.
- **Befehlsbeschreibungen:** Bei Verwendung von `is_background=true` enthält die Befehlsbeschreibung einen `[background]`-Hinweis, um den Ausführungsmodus klar kenntlich zu machen.

## Umgebungsvariablen

Wenn `run_shell_command` einen Befehl ausführt, wird die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Unterprozesses gesetzt. Dadurch können Skripte oder Tools erkennen, ob sie innerhalb der CLI ausgeführt werden.

## Befehlsbeschränkungen

Sie können die Befehle, die vom Tool `run_shell_command` ausgeführt werden dürfen, mithilfe der Einstellungen `tools.core` und `tools.exclude` in Ihrer Konfigurationsdatei einschränken.

- `tools.core`: Um `run_shell_command` auf eine bestimmte Menge von Befehlen einzuschränken, fügen Sie Einträge in Form von `run_shell_command(<Befehl>)` zur Liste `core` unter der Kategorie `tools` hinzu. Beispiel: `"tools": {"core": ["run_shell_command(git)"]}` erlaubt ausschließlich `git`-Befehle. Die allgemeine Angabe `run_shell_command` wirkt wie ein Platzhalter und erlaubt jeden Befehl, der nicht explizit blockiert ist.
- `tools.exclude`: Um bestimmte Befehle zu blockieren, fügen Sie Einträge in Form von `run_shell_command(<Befehl>)` zur Liste `exclude` unter der Kategorie `tools` hinzu. Beispiel: `"tools": {"exclude": ["run_shell_command(rm)"]}` blockiert `rm`-Befehle.

Die Validierungslogik ist so konzipiert, dass sie sowohl sicher als auch flexibel ist:

1.  **Kettenbildung von Befehlen deaktiviert**: Das Tool trennt automatisch Befehlsketten, die mit `&&`, `||` oder `;` verknüpft sind, und validiert jeden Teil separat. Falls ein Teil der Kette nicht erlaubt ist, wird der gesamte Befehl blockiert.
2.  **Präfixabgleich**: Das Tool verwendet einen Präfixabgleich. Beispiel: Wenn Sie `git` erlauben, können Sie `git status` oder `git log` ausführen.
3.  **Vorrang der Blockliste**: Die Liste `tools.exclude` wird stets zuerst überprüft. Passt ein Befehl zu einem blockierten Präfix, wird er abgelehnt – selbst wenn er zusätzlich zu einem erlaubten Präfix in `tools.core` passt.

### Beispiele für Befehlsbeschränkungen

**Nur bestimmte Befehlspräfixe zulassen**

Um nur `git`- und `npm`-Befehle zuzulassen und alle anderen zu blockieren:

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

Um `rm` zu blockieren und alle anderen Befehle zuzulassen:

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

**Die Blockliste hat Vorrang**

Falls ein Befehlspräfix sowohl in `tools.core` als auch in `tools.exclude` enthalten ist, wird er blockiert.

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

Um alle Shell-Befehle zu blockieren, fügen Sie das Platzhalter-Muster `run_shell_command` zu `tools.exclude` hinzu:

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

Befehlsspezifische Einschränkungen in `excludeTools` für `run_shell_command` basieren auf einfacher Zeichenkettenübereinstimmung und können leicht umgangen werden. Diese Funktion ist **kein Sicherheitsmechanismus** und darf nicht darauf vertraut werden, nicht vertrauenswürdigen Code sicher auszuführen. Es wird empfohlen, `coreTools` zu verwenden, um explizit die ausführbaren Befehle auszuwählen.