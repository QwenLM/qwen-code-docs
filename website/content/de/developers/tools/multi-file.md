# Multi-File-Lesen (`read_many_files`)

> [!note]
>
> `read_many_files` wurde zuvor als eigenständiges Tool bereitgestellt, aber in eine interne Hilfsfunktion umgewandelt. Das Modell ruft es nicht mehr direkt auf – stattdessen decken die Tools `read_file`, `glob` und `grep_search` das Lesen von einzelnen und mehreren Dateien ab. Die folgenden Informationen dienen als Referenz.

## Beschreibung

`read_many_files` liest den Inhalt mehrerer Dateien, die durch Pfade oder Glob-Muster angegeben werden. Das Verhalten hängt vom Dateityp ab:

- Bei Textdateien verkettet dieses Tool deren Inhalt zu einem einzigen String.
- Bei Bild- (z. B. PNG, JPEG), PDF-, Audio- (MP3, WAV) und Videodateien (MP4, MOV) liest und gibt es diese als base64-kodierte Daten zurück, sofern sie explizit nach Name oder Erweiterung angefordert werden.

`read_many_files` kann verwendet werden, um Aufgaben wie das Verschaffen eines Überblicks über eine Codebasis, das Auffinden, wo eine bestimmte Funktionalität implementiert ist, das Überprüfen von Dokumentation oder das Sammeln von Kontext aus mehreren Konfigurationsdateien durchzuführen.

**Hinweis:** `read_many_files` sucht nach Dateien, die den angegebenen Pfaden oder Glob-Mustern entsprechen. Ein Verzeichnispfad wie `"/docs"` gibt ein leeres Ergebnis zurück; das Tool benötigt ein Muster wie `"/docs/*"` oder `"/docs/*.md"`, um die relevanten Dateien zu identifizieren.

### Argumente

`read_many_files` akzeptiert die folgenden Argumente:

- `paths` (list[string], erforderlich): Ein Array von Glob-Mustern oder Pfaden relativ zum Zielverzeichnis des Tools (z. B. `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], optional): Glob-Muster für Dateien/Verzeichnisse, die ausgeschlossen werden sollen (z. B. `["**/*.log", "temp/"]`). Diese werden zu den Standardausschlüssen hinzugefügt, wenn `useDefaultExcludes` wahr ist.
- `include` (list[string], optional): Zusätzliche Glob-Muster, die eingeschlossen werden sollen. Diese werden mit `paths` zusammengeführt (z. B. `["*.test.ts"]`, um speziell Testdateien hinzuzufügen, wenn sie breit ausgeschlossen wurden, oder `["images/*.jpg"]`, um bestimmte Bildtypen einzuschließen).
- `recursive` (boolean, optional): Gibt an, ob rekursiv gesucht werden soll. Dies wird hauptsächlich durch `**` in Glob-Mustern gesteuert. Standardwert: `true`.
- `useDefaultExcludes` (boolean, optional): Gibt an, ob eine Liste von Standardausschlussmustern angewendet werden soll (z. B. `node_modules`, `.git`, Binärdateien, die keine Bild-/PDF-Dateien sind). Standardwert: `true`.
- `respect_git_ignore` (boolean, optional): Gibt an, ob .gitignore-Muster beim Finden von Dateien berücksichtigt werden sollen. Standardwert: `true`.

## Verwendung von `read_many_files` mit Qwen Code

`read_many_files` sucht nach Dateien, die den angegebenen `paths`- und `include`-Mustern entsprechen, unter Berücksichtigung der `exclude`-Muster und der Standardausschlüsse (falls aktiviert).

- Bei Textdateien: Liest den Inhalt jeder gefundenen Datei (versucht, Binärdateien zu überspringen, die nicht explizit als Bild/PDF angefordert wurden) und verkettet ihn zu einem einzigen String, mit einem Trennzeichen `--- {filePath} ---` zwischen dem Inhalt jeder Datei. Standardmäßig wird UTF-8-Kodierung verwendet.
- Das Tool fügt nach der letzten Datei `--- End of content ---` ein.
- Bei Bild- und PDF-Dateien: Wenn explizit nach Name oder Erweiterung angefordert (z. B. `paths: ["logo.png"]` oder `include: ["*.pdf"]`), liest das Tool die Datei und gibt ihren Inhalt als base64-kodierten String zurück.
- Das Tool versucht, andere Binärdateien (die nicht den gängigen Bild-/PDF-Typen entsprechen oder nicht explizit angefordert wurden) zu erkennen und zu überspringen, indem es den Anfangsinhalt auf Nullbytes prüft.

Verwendung:

```
read_many_files(paths=["Ihre Dateien oder Pfade hier."], include=["Zusätzliche Dateien zum Einschließen."], exclude=["Dateien zum Ausschließen."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## Beispiele für `read_many_files`

Alle TypeScript-Dateien im `src`-Verzeichnis lesen:

```
read_many_files(paths=["src/**/*.ts"])
```

Die Haupt-README, alle Markdown-Dateien im `docs`-Verzeichnis und ein bestimmtes Logo-Bild lesen, dabei eine bestimmte Datei ausschließen:

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Alle JavaScript-Dateien lesen, aber explizit Testdateien und alle JPEGs in einem `images`-Ordner einschließen:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Wichtige Hinweise

- **Binärdateien-Handling:**
  - **Bild-/PDF-/Audio-/Videodateien:** Das Tool kann gängige Bildtypen (PNG, JPEG usw.), PDF, Audio (mp3, wav) und Video (mp4, mov) lesen und gibt sie als base64-kodierte Daten zurück. Diese Dateien _müssen_ explizit durch die `paths`- oder `include`-Muster adressiert werden (z. B. durch Angabe des genauen Dateinamens wie `video.mp4` oder eines Musters wie `*.mov`).
  - **Andere Binärdateien:** Das Tool versucht, andere Arten von Binärdateien zu erkennen und zu überspringen, indem es den Anfangsinhalt auf Nullbytes prüft. Das Tool schließt diese Dateien aus der Ausgabe aus.
- **Leistung:** Das Lesen einer sehr großen Anzahl von Dateien oder sehr großer einzelner Dateien kann ressourcenintensiv sein.
- **Pfadspezifität:** Stellen Sie sicher, dass Pfade und Glob-Muster korrekt relativ zum Zielverzeichnis des Tools angegeben sind. Verwenden Sie für Bild-/PDF-Dateien Muster, die spezifisch genug sind, um diese einzuschließen.
- **Standardausschlüsse:** Seien Sie sich der Standardausschlussmuster (wie `node_modules`, `.git`) bewusst und verwenden Sie `useDefaultExcludes=False`, wenn Sie diese überschreiben müssen, aber gehen Sie dabei vorsichtig vor.