# Tool zum Lesen mehrerer Dateien (`read_many_files`)

Dieses Dokument beschreibt das `read_many_files`-Tool für Qwen Code.

## Beschreibung

Verwende `read_many_files`, um Inhalte aus mehreren Dateien zu lesen, die durch Pfade oder Glob-Patterns angegeben sind. Das Verhalten dieses Tools hängt von den bereitgestellten Dateien ab:

- Bei Textdateien verkettet dieses Tool deren Inhalte zu einem einzigen String.
- Bei Bild- (z. B. PNG, JPEG), PDF-, Audio- (MP3, WAV) und Videodateien (MP4, MOV) liest und gibt es diese als base64-kodierte Daten zurück, sofern sie explizit nach Name oder Erweiterung angefordert werden.

`read_many_files` kann verwendet werden, um Aufgaben wie das Erhalten eines Überblicks über eine Codebasis, das Auffinden der Implementierung bestimmter Funktionen, das Überprüfen von Dokumentationen oder das Sammeln von Kontext aus mehreren Konfigurationsdateien durchzuführen.

**Hinweis:** `read_many_files` sucht nach Dateien anhand der bereitgestellten Pfade oder Glob-Patterns. Ein Verzeichnispfad wie `"/docs"` liefert ein leeres Ergebnis; das Tool benötigt ein Pattern wie `"/docs/*"` oder `"/docs/*.md"`, um die relevanten Dateien zu identifizieren.

### Argumente

`read_many_files` akzeptiert die folgenden Argumente:

- `paths` (list[string], erforderlich): Ein Array aus Glob-Patterns oder Pfaden relativ zum Zielverzeichnis des Tools (z. B. `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], optional): Glob-Patterns für Dateien/Verzeichnisse, die ausgeschlossen werden sollen (z. B. `["**/*.log", "temp/"]`). Diese werden zu den Standardausschlüssen hinzugefügt, wenn `useDefaultExcludes` auf `true` gesetzt ist.
- `include` (list[string], optional): Zusätzliche Glob-Patterns, die eingeschlossen werden sollen. Diese werden mit `paths` zusammengeführt (z. B. `["*.test.ts"]`, um Testdateien explizit hinzuzufügen, falls sie pauschal ausgeschlossen wurden, oder `["images/*.jpg"]`, um bestimmte Bildtypen einzuschließen).
- `recursive` (boolean, optional): Gibt an, ob rekursiv gesucht werden soll. Dies wird hauptsächlich durch `**` in Glob-Patterns gesteuert. Standardwert ist `true`.
- `useDefaultExcludes` (boolean, optional): Gibt an, ob eine Liste von Standardausschluss-Patterns angewendet werden soll (z. B. `node_modules`, `.git`, binäre Dateien, die keine Bilder/PDFs sind). Standardwert ist `true`.
- `respect_git_ignore` (boolean, optional): Gibt an, ob `.gitignore`-Pattern beim Suchen von Dateien berücksichtigt werden sollen. Standardwert ist `true`.

## Verwendung von `read_many_files` mit Qwen Code

`read_many_files` sucht nach Dateien, die den angegebenen `paths`- und `include`-Pattern entsprechen, und berücksichtigt dabei `exclude`-Pattern sowie Standardausschlüsse (sofern aktiviert).

- Bei Textdateien: Es liest den Inhalt jeder gefundenen Datei (und versucht, binäre Dateien zu überspringen, die nicht explizit als Bild/PDF angefordert wurden) und verkettet sie zu einem einzigen String. Zwischen den Inhalten der einzelnen Dateien wird ein Trennzeichen `--- {filePath} ---` eingefügt. Standardmäßig wird UTF-8-Kodierung verwendet.
- Das Tool fügt nach der letzten Datei ein `--- End of content ---` ein.
- Bei Bild- und PDF-Dateien: Wenn sie explizit nach Name oder Erweiterung angefordert werden (z. B. `paths: ["logo.png"]` oder `include: ["*.pdf"]`), liest das Tool die Datei und gibt ihren Inhalt als base64-kodierten String zurück.
- Das Tool versucht, andere binäre Dateien (die nicht gängigen Bild-/PDF-Typen entsprechen oder nicht explizit angefordert wurden) zu erkennen und zu überspringen, indem es den Anfangsinhalt auf Null-Bytes prüft.

Verwendung:

```
read_many_files(paths=["Your files or paths here."], include=["Additional files to include."], exclude=["Files to exclude."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## Beispiele für `read_many_files`

Lese alle TypeScript-Dateien im `src`-Verzeichnis:

```
read_many_files(paths=["src/**/*.ts"])
```

Lese die Haupt-README, alle Markdown-Dateien im `docs`-Verzeichnis und ein bestimmtes Logo-Bild, wobei eine bestimmte Datei ausgeschlossen wird:

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Lese alle JavaScript-Dateien, aber schließe explizit Testdateien und alle JPEGs in einem `images`-Ordner ein:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Wichtige Hinweise

- **Verarbeitung binärer Dateien:**
  - **Bild-/PDF-/Audio-/Videodateien:** Das Tool kann gängige Bildtypen (PNG, JPEG usw.), PDF-, Audio- (mp3, wav) und Videodateien (mp4, mov) lesen und gibt sie als base64-kodierte Daten zurück. Diese Dateien _müssen_ explizit durch die `paths`- oder `include`-Pattern angesprochen werden (z. B. durch Angabe des exakten Dateinamens wie `video.mp4` oder eines Patterns wie `*.mov`).
  - **Andere binäre Dateien:** Das Tool versucht, andere Arten von binären Dateien zu erkennen und zu überspringen, indem es deren Anfangsinhalt auf Null-Bytes prüft. Diese Dateien werden von der Ausgabe ausgeschlossen.
- **Performance:** Das Lesen einer sehr großen Anzahl von Dateien oder sehr großer Einzeldateien kann ressourcenintensiv sein.
- **Pfadgenauigkeit:** Stelle sicher, dass Pfade und Glob-Patterns korrekt relativ zum Zielverzeichnis des Tools angegeben sind. Achte bei Bild-/PDF-Dateien darauf, dass die Pattern spezifisch genug sind, um sie einzuschließen.
- **Standardausschlüsse:** Beachte die Standardausschluss-Patterns (wie `node_modules`, `.git`) und verwende `useDefaultExcludes=False`, wenn du sie überschreiben musst, gehe dabei jedoch vorsichtig vor.