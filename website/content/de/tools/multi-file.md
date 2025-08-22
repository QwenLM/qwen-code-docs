# Multi File Read Tool (`read_many_files`)

Dieses Dokument beschreibt das `read_many_files` Tool für Qwen Code.

## Beschreibung

Verwende `read_many_files`, um Inhalte aus mehreren Dateien zu lesen, die durch Pfade oder Glob-Muster angegeben werden. Das Verhalten dieses Tools hängt von den bereitgestellten Dateien ab:

- Für Textdateien verknüpft dieses Tool deren Inhalt zu einem einzigen String.
- Für Bilddateien (z. B. PNG, JPEG), PDF-, Audio- (MP3, WAV) und Videodateien (MP4, MOV) liest es diese als base64-kodierte Daten, sofern sie explizit nach Name oder Erweiterung angefordert werden.

`read_many_files` kann für Aufgaben wie das Überblicken einer Codebasis, das Finden von Implementierungen bestimmter Funktionen, das Überprüfen von Dokumentationen oder das Sammeln von Kontext aus mehreren Konfigurationsdateien verwendet werden.

**Hinweis:** `read_many_files` sucht nach Dateien anhand der angegebenen Pfade oder Glob-Muster. Ein Verzeichnispfad wie `"/docs"` liefert ein leeres Ergebnis; das Tool benötigt ein Muster wie `"/docs/*"` oder `"/docs/*.md"`, um die relevanten Dateien zu identifizieren.

### Argumente

`read_many_files` akzeptiert die folgenden Argumente:

- `paths` (list[string], required): Ein Array von Glob-Patterns oder Pfaden relativ zum Zielverzeichnis des Tools (z. B. `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], optional): Glob-Patterns für Dateien/Verzeichnisse, die ausgeschlossen werden sollen (z. B. `["**/*.log", "temp/"]`). Diese werden zu den Standard-Excludes hinzugefügt, wenn `useDefaultExcludes` auf `true` gesetzt ist.
- `include` (list[string], optional): Zusätzliche Glob-Patterns, die explizit eingeschlossen werden sollen. Diese werden mit `paths` zusammengeführt (z. B. `["*.test.ts"]`, um Testdateien gezielt hinzuzufügen, falls sie allgemein ausgeschlossen wurden, oder `["images/*.jpg"]`, um bestimmte Bildtypen einzuschließen).
- `recursive` (boolean, optional): Gibt an, ob rekursiv gesucht werden soll. Dies wird hauptsächlich durch `**` in den Glob-Patterns gesteuert. Standardwert ist `true`.
- `useDefaultExcludes` (boolean, optional): Legt fest, ob eine Liste von Standard-Ausschlussmustern angewendet wird (z. B. `node_modules`, `.git`, binäre Dateien, die keine Bilder oder PDFs sind). Standardwert ist `true`.
- `respect_git_ignore` (boolean, optional): Gibt an, ob `.gitignore`-Muster beim Suchen von Dateien berücksichtigt werden sollen. Standardwert ist `true`.

## Wie man `read_many_files` mit Qwen Code verwendet

`read_many_files` sucht nach Dateien, die den angegebenen `paths`- und `include`-Mustern entsprechen, und berücksichtigt dabei `exclude`-Muster sowie Standard-Ausschlüsse (falls aktiviert).

- **Für Textdateien**: Der Inhalt jeder gefundenen Datei wird gelesen (es wird versucht, Binärdateien zu überspringen, es sei denn, sie wurden explizit als Bild/PDF angefordert). Die Inhalte werden zu einem einzigen String zusammengefasst, wobei zwischen den Inhalten der einzelnen Dateien der Trenner `--- {filePath} ---` eingefügt wird. Standardmäßig wird UTF-8-Encoding verwendet.
- **Für Bilder und PDFs**: Wenn explizit nach Name oder Erweiterung angefordert (z. B. `paths: ["logo.png"]` oder `include: ["*.pdf"]`), liest das Tool die Datei und gibt ihren Inhalt als base64-kodierten String zurück.
- **Für andere Binärdateien**: Das Tool versucht, diese zu erkennen und zu überspringen (solche, die weder zu den gängigen Bild-/PDF-Typen gehören noch explizit angefordert wurden), indem es auf das Vorhandensein von Null-Bytes im Anfangsbereich prüft.

Verwendung:

```
read_many_files(paths=["Deine Dateien oder Pfade hier."], include=["Zusätzliche Dateien zum Einbinden."], exclude=["Dateien zum Ausschließen."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
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
  - **Bild-/PDF-/Audio-/Videodateien:** Das Tool kann gängige Bildformate (PNG, JPEG, etc.), PDF-, Audio- (mp3, wav) und Videodateien (mp4, mov) lesen und gibt diese als base64-kodierte Daten zurück. Diese Dateien _müssen_ explizit über die `paths`- oder `include`-Muster angesprochen werden (z. B. durch Angabe des exakten Dateinamens wie `video.mp4` oder eines Musters wie `*.mov`).
  - **Andere Binärdateien:** Das Tool versucht, andere Binärdateitypen zu erkennen und zu überspringen, indem es den Anfang der Datei auf null-Bytes prüft. Solche Dateien werden von der Ausgabe ausgeschlossen.
- **Performance:** Das Lesen einer sehr großen Anzahl an Dateien oder einzelner sehr großer Dateien kann ressourcenintensiv sein.
- **Pfadangaben:** Stelle sicher, dass Pfade und Glob-Muster korrekt relativ zum Zielverzeichnis des Tools angegeben sind. Bei Bild-/PDF-Dateien solltest du sicherstellen, dass die Muster spezifisch genug sind, um sie einzuschließen.
- **Standardmäßig ausgeschlossene Pfade:** Beachte die standardmäßig ausgeschlossenen Pfade (wie `node_modules`, `.git`) und verwende `useDefaultExcludes=False`, wenn du diese überschreiben musst – aber tue dies mit Vorsicht.