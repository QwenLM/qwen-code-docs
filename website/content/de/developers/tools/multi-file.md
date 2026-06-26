# Lesen mehrerer Dateien (`read_many_files`)

> [!note]
>
> `read_many_files` war zuvor als eigenständiges Werkzeug verfügbar, wurde jedoch in eine interne Hilfsfunktion umgestaltet. Das Modell ruft es nicht mehr direkt auf – stattdessen decken die Werkzeuge `read_file`, `glob` und `grep_search` das Lesen einzelner und mehrerer Dateien ab. Die folgenden Informationen dienen als Referenz.

## Beschreibung

`read_many_files` liest den Inhalt mehrerer Dateien, die durch Pfade oder Glob-Muster angegeben werden. Das Verhalten hängt vom Dateityp ab:

- Bei Textdateien verkettet dieses Werkzeug deren Inhalt zu einer einzigen Zeichenkette.
- Bei Bild- (z. B. PNG, JPEG), PDF-, Audio- (MP3, WAV) und Videodateien (MP4, MOV) werden diese gelesen und als base64-kodierte Daten zurückgegeben, sofern sie explizit nach Name oder Erweiterung angefordert werden.

`read_many_files` kann für Aufgaben wie das Verschaffen eines Überblicks über eine Codebasis, das Auffinden der Implementierung einer bestimmten Funktionalität, das Durchsehen von Dokumentation oder das Sammeln von Kontext aus mehreren Konfigurationsdateien verwendet werden.

**Hinweis:** `read_many_files` sucht nach Dateien, die den angegebenen Pfaden oder Glob-Mustern entsprechen. Ein Verzeichnispfad wie `"/docs"` liefert ein leeres Ergebnis; das Werkzeug benötigt ein Muster wie `"/docs/*"` oder `"/docs/*.md"`, um die relevanten Dateien zu identifizieren.

### Argumente

`read_many_files` akzeptiert die folgenden Argumente:

- `paths` (Liste[string], erforderlich): Ein Array von Glob-Mustern oder Pfaden relativ zum Zielverzeichnis des Werkzeugs (z. B. `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (Liste[string], optional): Glob-Muster für auszuschließende Dateien/Verzeichnisse (z. B. `["**/*.log", "temp/"]`). Diese werden zu den standardmäßigen Ausschlüssen hinzugefügt, wenn `useDefaultExcludes` auf `true` gesetzt ist.
- `include` (Liste[string], optional): Zusätzliche Glob-Muster, die eingeschlossen werden sollen. Diese werden mit `paths` zusammengeführt (z. B. `["*.test.ts"]`, um Testdateien spezifisch hinzuzufügen, falls sie weitgehend ausgeschlossen waren, oder `["images/*.jpg"]`, um bestimmte Bildtypen einzuschließen).
- `recursive` (Boolesch, optional): Gibt an, ob rekursiv gesucht werden soll. Dies wird hauptsächlich durch `**` in Glob-Mustern gesteuert. Standardwert: `true`.
- `useDefaultExcludes` (Boolesch, optional): Gibt an, ob eine Liste standardmäßiger Ausschlussmuster angewendet werden soll (z. B. `node_modules`, `.git`, Nicht-Bild/PDF-Binärdateien). Standardwert: `true`.
- `respect_git_ignore` (Boolesch, optional): Gibt an, ob `.gitignore`-Muster beim Finden von Dateien berücksichtigt werden sollen. Standardwert: `true`.

## Verwendung von `read_many_files` mit Qwen Code

`read_many_files` sucht nach Dateien, die den angegebenen `paths`- und `include`-Mustern entsprechen, während `exclude`-Muster und standardmäßige Ausschlüsse (falls aktiviert) beachtet werden.

- Bei Textdateien: Es liest den Inhalt jeder gefundenen Datei (wobei versucht wird, Binärdateien zu überspringen, die nicht explizit als Bild/PDF angefordert wurden) und verkettet ihn zu einer einzigen Zeichenkette, mit einem Trennzeichen `--- {filePath} ---` zwischen den Inhalten der einzelnen Dateien. Standardmäßig wird UTF-8-Kodierung verwendet.
- Das Werkzeug fügt nach der letzten Datei ein `--- End of content ---` ein.
- Bei Bild- und PDF-Dateien: Wenn sie explizit nach Name oder Erweiterung angefordert werden (z. B. `paths: ["logo.png"]` oder `include: ["*.pdf"]`), liest das Werkzeug die Datei und gibt ihren Inhalt als base64-kodierte Zeichenkette zurück.
- Das Werkzeug versucht, andere Binärdateien (solche, die nicht den üblichen Bild-/PDF-Typen entsprechen oder nicht explizit angefordert wurden) zu erkennen und zu überspringen, indem es in ihrem Anfangsbereich nach Nullbytes sucht.

Verwendung:

```
read_many_files(paths=["Ihre Dateien oder Pfade hier."], include=["Zusätzliche Dateien zum Einschließen."], exclude=["Auszuschließende Dateien."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## Beispiele für `read_many_files`

Alle TypeScript-Dateien im `src`-Verzeichnis lesen:

```
read_many_files(paths=["src/**/*.ts"])
```

Die Haupt-README, alle Markdown-Dateien im `docs`-Verzeichnis und ein bestimmtes Logo-Bild lesen, wobei eine bestimmte Datei ausgeschlossen wird:

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Alle JavaScript-Dateien lesen, aber explizit Testdateien und alle JPEGs in einem `images`-Ordner einschließen:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Wichtige Hinweise

- **Umgang mit Binärdateien:**
  - **Bild-/PDF-/Audio-/Videodateien:** Das Werkzeug kann gängige Bildtypen (PNG, JPEG usw.), PDF-, Audio- (mp3, wav) und Videodateien (mp4, mov) lesen und als base64-kodierte Daten zurückgeben. Diese Dateien _müssen_ explizit durch die `paths`- oder `include`-Muster adressiert werden (z. B. durch Angabe des genauen Dateinamens wie `video.mp4` oder eines Musters wie `*.mov`).
  - **Andere Binärdateien:** Das Werkzeug versucht, andere Arten von Binärdateien zu erkennen und zu überspringen, indem es deren Anfangsbereich auf Nullbytes überprüft. Diese Dateien werden aus der Ausgabe ausgeschlossen.
- **Leistung:** Das Lesen einer sehr großen Anzahl von Dateien oder sehr großer einzelner Dateien kann ressourcenintensiv sein.
- **Pfadspezifität:** Stellen Sie sicher, dass Pfade und Glob-Muster korrekt relativ zum Zielverzeichnis des Werkzeugs angegeben werden. Stellen Sie bei Bild-/PDF-Dateien sicher, dass die Muster spezifisch genug sind, um sie einzuschließen.
- **Standardmäßige Ausschlüsse:** Beachten Sie die standardmäßigen Ausschlussmuster (wie `node_modules`, `.git`) und verwenden Sie `useDefaultExcludes=False`, wenn Sie diese überschreiben müssen, aber seien Sie dabei vorsichtig.
