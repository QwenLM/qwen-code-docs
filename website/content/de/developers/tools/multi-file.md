# Multi File Read Tool (`read_many_files`)

Dieses Dokument beschreibt das `read_many_files`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `read_many_files`, um Inhalte aus mehreren Dateien zu lesen, die durch Pfade oder Glob-Muster angegeben werden. Das Verhalten dieses Tools hängt von den bereitgestellten Dateien ab:

- Für Textdateien verkettet dieses Tool deren Inhalt zu einer einzigen Zeichenkette.
- Für Bilddateien (z. B. PNG, JPEG), PDF-, Audiodateien (MP3, WAV) und Videodateien (MP4, MOV) liest es diese und gibt sie als base64-kodierte Daten zurück, sofern sie explizit nach Name oder Erweiterung angefordert werden.

`read_many_files` kann verwendet werden, um Aufgaben wie das Einholen eines Überblicks über eine Codebasis, das Finden der Implementierung spezifischer Funktionen, das Überprüfen von Dokumentation oder das Sammeln von Kontext aus mehreren Konfigurationsdateien durchzuführen.

**Hinweis:** `read_many_files` sucht nach Dateien gemäß den angegebenen Pfaden oder Glob-Mustern. Ein Verzeichnispfad wie `"/docs"` liefert ein leeres Ergebnis; das Tool benötigt ein Muster wie `"/docs/*"` oder `"/docs/*.md"`, um die relevanten Dateien zu identifizieren.

### Argumente

`read_many_files` akzeptiert die folgenden Argumente:

- `paths` (list[string], erforderlich): Ein Array von Globmustern oder Pfaden relativ zum Zielverzeichnis des Tools (z. B. `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], optional): Globmuster für Dateien/Verzeichnisse, die ausgeschlossen werden sollen (z. B. `["**/*.log", "temp/"]`). Diese werden zu den Standardausschlüssen hinzugefügt, wenn `useDefaultExcludes` auf `true` gesetzt ist.
- `include` (list[string], optional): Zusätzliche Globmuster, die eingeschlossen werden sollen. Diese werden mit `paths` zusammengeführt (z. B. `["*.test.ts"]`, um Testdateien gezielt hinzuzufügen, wenn diese zuvor allgemein ausgeschlossen wurden, oder `["images/*.jpg"]`, um bestimmte Bildtypen einzuschließen).
- `recursive` (boolean, optional): Gibt an, ob rekursiv gesucht werden soll. Dies wird hauptsächlich durch `**` in Globmustern gesteuert. Standardwert ist `true`.
- `useDefaultExcludes` (boolean, optional): Gibt an, ob eine Liste von Standardausschlussmustern angewendet werden soll (z. B. `node_modules`, `.git`, Nicht-Bild-/PDF-Binärdateien). Standardwert ist `true`.
- `respect_git_ignore` (boolean, optional): Gibt an, ob `.gitignore`-Muster beim Suchen von Dateien berücksichtigt werden sollen. Standardwert ist `true`.

## Verwendung von `read_many_files` mit Qwen Code

`read_many_files` sucht nach Dateien, die den angegebenen `paths`- und `include`-Mustern entsprechen, und berücksichtigt dabei `exclude`-Muster sowie Standardausschlüsse (falls aktiviert).

- Für Textdateien: Es liest den Inhalt jeder gefundenen Datei (und versucht, Binärdateien zu überspringen, es sei denn, diese wurden explizit als Bild/PDF angefordert) und fügt diesen zu einem einzigen String zusammen. Zwischen den Inhalten der einzelnen Dateien wird ein Trennzeichen `--- {filePath} ---` eingefügt. Standardmäßig wird UTF-8-Encoding verwendet.
- Das Tool fügt nach der letzten Datei ein `--- End of content ---` ein.
- Für Bilder und PDF-Dateien: Wenn diese explizit anhand des Namens oder der Erweiterung angefordert wurden (z. B. `paths: ["logo.png"]` oder `include: ["*.pdf"]`), liest das Tool die Datei und gibt ihren Inhalt als base64-kodierten String zurück.
- Das Tool versucht, andere Binärdateien (die weder gängigen Bild-/PDF-Typen entsprechen noch explizit angefordert wurden) durch Prüfung auf Null-Bytes im Anfangsinhalt zu erkennen und auszulassen.

Verwendung:

```
read_many_files(paths=["Deine Dateien oder Pfade hier."], include=["Zusätzliche Dateien zum Einbinden."], exclude=["Auszuschließende Dateien."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` Beispiele

Lese alle TypeScript-Dateien im `src` Verzeichnis:

```
read_many_files(paths=["src/**/*.ts"])
```

Lese die Haupt-README, alle Markdown-Dateien im `docs` Verzeichnis und ein bestimmtes Logo-Bild, ausgenommen eine bestimmte Datei:

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Lese alle JavaScript-Dateien, aber schließe Testdateien explizit ein und alle JPEGs in einem `images` Ordner:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Wichtige Hinweise

- **Umgang mit Binärdateien:**
  - **Bilddateien/PDFs/Audiodateien/Videodateien:** Das Tool kann gängige Bildformate (PNG, JPEG usw.), PDF-, Audio- (mp3, wav) und Videodateien (mp4, mov) lesen und gibt diese als base64-kodierte Daten zurück. Diese Dateien _müssen_ explizit über die `paths`- oder `include`-Muster angesprochen werden (z. B. durch Angabe des exakten Dateinamens wie `video.mp4` oder eines Musters wie `*.mov`).
  - **Andere Binärdateien:** Das Tool versucht, andere Arten von Binärdateien zu erkennen und überspringt diese, indem es den Anfangsinhalt auf Null-Bytes prüft. Solche Dateien werden aus der Ausgabe ausgeschlossen.
- **Leistung:** Das Lesen einer sehr großen Anzahl von Dateien oder einzelner sehr großer Dateien kann ressourcenintensiv sein.
- **Pfadangaben:** Stellen Sie sicher, dass Pfade und Glob-Muster korrekt relativ zum Zielverzeichnis des Tools angegeben sind. Bei Bilddateien/PDFs sollten die Muster spezifisch genug sein, um diese einzuschließen.
- **Standardmäßig ausgeschlossene Pfade:** Beachten Sie die standardmäßig ausgeschlossenen Muster (wie `node_modules`, `.git`) und verwenden Sie `useDefaultExcludes=False`, wenn Sie diese überschreiben müssen – jedoch mit Vorsicht.