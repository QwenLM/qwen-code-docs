# Tool zum Lesen mehrerer Dateien (`read_many_files`)

Dieses Dokument beschreibt das Tool `read_many_files` für Qwen Code.

## Beschreibung

Verwenden Sie `read_many_files`, um Inhalte aus mehreren Dateien zu lesen, die durch Pfade oder Glob-Muster angegeben sind. Das Verhalten dieses Tools hängt von den bereitgestellten Dateien ab:

- Bei Textdateien verbindet dieses Tool deren Inhalte zu einer einzelnen Zeichenkette.
- Bei Bilddateien (z. B. PNG, JPEG), PDF-, Audio- (MP3, WAV) und Videodateien (MP4, MOV) liest es diese ein und gibt sie als base64-kodierte Daten zurück – vorausgesetzt, sie werden explizit nach Name oder Erweiterung angefordert.

`read_many_files` kann für Aufgaben wie das Erhalten eines Überblicks über eine Codebasis, das Auffinden der Implementierung bestimmter Funktionalität, das Durchsehen von Dokumentation oder das Sammeln von Kontext aus mehreren Konfigurationsdateien eingesetzt werden.

**Hinweis:** `read_many_files` sucht nach Dateien, die den angegebenen Pfaden oder Glob-Mustern entsprechen. Ein Verzeichnispfad wie `"/docs"` führt zu einem leeren Ergebnis; das Tool benötigt ein Muster wie `"/docs/*"` oder `"/docs/*.md"`, um die relevanten Dateien zu identifizieren.

### Argumente

`read_many_files` akzeptiert die folgenden Argumente:

- `paths` (Liste von Zeichenketten, erforderlich): Ein Array mit Glob-Mustern oder Pfaden relativ zum Zielverzeichnis des Tools (z. B. `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (Liste von Zeichenketten, optional): Glob-Muster für auszuschließende Dateien oder Verzeichnisse (z. B. `["**/*.log", "temp/"]`). Diese werden zu den Standardausschlüssen hinzugefügt, falls `useDefaultExcludes` auf `true` gesetzt ist.
- `include` (Liste von Zeichenketten, optional): Zusätzliche Glob-Muster, die eingeschlossen werden sollen. Diese werden mit `paths` zusammengeführt (z. B. `["*.test.ts"]`, um gezielt Testdateien einzubeziehen, falls diese allgemein ausgeschlossen wurden, oder `["images/*.jpg"]`, um bestimmte Bilddateitypen einzuschließen).
- `recursive` (boolesch, optional): Ob rekursiv gesucht werden soll. Dies wird hauptsächlich durch `**` in den Glob-Mustern gesteuert. Der Standardwert ist `true`.
- `useDefaultExcludes` (boolesch, optional): Ob eine Liste mit Standard-Ausschlussmustern angewendet werden soll (z. B. `node_modules`, `.git`, binäre Nicht-Image-/Nicht-PDF-Dateien). Der Standardwert ist `true`.
- `respect_git_ignore` (boolesch, optional): Ob `.gitignore`-Muster beim Auffinden von Dateien berücksichtigt werden sollen. Der Standardwert ist `true`.

## So verwenden Sie `read_many_files` mit Qwen Code

`read_many_files` sucht nach Dateien, die den angegebenen Mustern für `paths` und `include` entsprechen, und berücksichtigt dabei auch die Muster für `exclude` sowie standardmäßige Ausschlüsse (sofern aktiviert).

- Bei Textdateien: Der Inhalt jeder übereinstimmenden Datei wird gelesen (binäre Dateien, die nicht explizit als Bild- oder PDF-Datei angefordert wurden, werden versuchsweise übersprungen) und zu einer einzelnen Zeichenkette zusammengefügt. Zwischen den Inhalten der einzelnen Dateien wird der Trenner `--- {filePath} ---` eingefügt. Die Codierung erfolgt standardmäßig in UTF-8.
- Das Tool fügt nach der letzten Datei `--- End of content ---` ein.
- Bei Bilddateien und PDF-Dateien: Falls diese explizit über ihren Namen oder ihre Erweiterung angefordert werden (z. B. `paths: ["logo.png"]` oder `include: ["*.pdf"]`), liest das Tool die Datei und gibt deren Inhalt als Base64-codierten String zurück.
- Das Tool versucht, andere binäre Dateien (also solche, die weder gängigen Bild- oder PDF-Typen entsprechen noch explizit angefordert wurden), durch Prüfung auf Null-Bytes im Anfangsbereich des Inhalts zu erkennen und zu überspringen.

Verwendung:

```
read_many_files(paths=["Ihre Dateien oder Pfade hier."], include=["Zusätzliche einzubeziehende Dateien."], exclude=["Auszuschließende Dateien."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## Beispiele für `read_many_files`

Alle TypeScript-Dateien im Verzeichnis `src` lesen:

```
read_many_files(paths=["src/**/*.ts"])
```

Die Haupt-README-Datei, alle Markdown-Dateien im Verzeichnis `docs` und ein bestimmtes Logo-Bild lesen, wobei eine bestimmte Datei ausgeschlossen wird:

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Alle JavaScript-Dateien lesen, aber Testdateien explizit einschließen sowie alle JPEGs im Ordner `images`:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Wichtige Hinweise

- **Behandlung binärer Dateien:**
  - **Bilddateien/PDF/Audio-/Videodateien:** Das Tool kann gängige Bildformate (PNG, JPEG usw.), PDF-, Audio- (mp3, wav) und Videodateien (mp4, mov) lesen und gibt sie als Base64-kodierte Daten zurück. Diese Dateien _müssen_ explizit über die `paths`- oder `include`-Muster angegeben werden (z. B. durch Angabe des genauen Dateinamens wie `video.mp4` oder eines Musters wie `*.mov`).
  - **Andere binäre Dateien:** Das Tool versucht, andere Arten binärer Dateien anhand von Null-Bytes im Anfangsbereich ihres Inhalts zu erkennen und überspringt sie. Solche Dateien werden vom Tool von der Ausgabe ausgeschlossen.
- **Leistung:** Das Lesen einer sehr großen Anzahl von Dateien oder einzelner sehr großer Dateien kann ressourcenintensiv sein.
- **Pfadgenauigkeit:** Stellen Sie sicher, dass Pfade und Glob-Muster korrekt relativ zum Zielverzeichnis des Tools angegeben sind. Bei Bilddateien und PDFs stellen Sie sicher, dass die Muster spezifisch genug sind, um diese Dateien einzuschließen.
- **Standardausschlüsse:** Beachten Sie die standardmäßig ausgeschlossenen Muster (z. B. `node_modules`, `.git`) und verwenden Sie bei Bedarf `useDefaultExcludes=False`, um sie zu überschreiben – tun Sie dies jedoch mit Vorsicht.