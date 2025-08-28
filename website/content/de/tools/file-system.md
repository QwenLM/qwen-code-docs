# Qwen Code Dateisystem-Tools

Qwen Code bietet eine umfassende Sammlung von Tools zur Interaktion mit dem lokalen Dateisystem. Diese Tools ermöglichen es dem Modell, Dateien und Verzeichnisse zu lesen, zu schreiben, aufzulisten, zu durchsuchen und zu ändern – alles unter deiner Kontrolle und in der Regel mit Bestätigungsabfrage bei sensiblen Operationen.

**Hinweis:** Alle Dateisystem-Tools arbeiten innerhalb eines `rootDirectory` (normalerweise das aktuelle Arbeitsverzeichnis, in dem du die CLI gestartet hast) aus Sicherheitsgründen. Die Pfade, die du diesen Tools übergibst, sollten in der Regel absolut sein oder werden relativ zu diesem Root-Verzeichnis aufgelöst.

## 1. `list_directory` (ReadFolder)

`list_directory` listet die Namen von Dateien und Unterverzeichnissen direkt innerhalb eines angegebenen Verzeichnispfads auf. Optional können Einträge ignoriert werden, die bestimmten Glob-Mustern entsprechen.

- **Tool-Name:** `list_directory`
- **Anzeigename:** ReadFolder
- **Datei:** `ls.ts`
- **Parameter:**
  - `path` (string, erforderlich): Der absolute Pfad zum aufzulistenden Verzeichnis.
  - `ignore` (Array von Strings, optional): Eine Liste von Glob-Mustern, die von der Auflistung ausgeschlossen werden sollen (z. B. `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, optional): Ob `.gitignore`-Muster beim Auflisten von Dateien berücksichtigt werden sollen. Standardmäßig `true`.
- **Verhalten:**
  - Gibt eine Liste von Datei- und Verzeichnisnamen zurück.
  - Zeigt an, ob ein Eintrag ein Verzeichnis ist.
  - Sortiert die Einträge so, dass Verzeichnisse zuerst kommen, danach alphabetisch.
- **Ausgabe (`llmContent`):** Ein String wie: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Bestätigung:** Nein.

## 2. `read_file` (ReadFile)

`read_file` liest und gibt den Inhalt einer angegebenen Datei zurück. Dieses Tool verarbeitet Text-, Bild- (PNG, JPG, GIF, WEBP, SVG, BMP) und PDF-Dateien. Für Textdateien kann es bestimmte Zeilenbereiche lesen. Andere binäre Dateitypen werden in der Regel übersprungen.

- **Tool-Name:** `read_file`
- **Anzeigename:** ReadFile
- **Datei:** `read-file.ts`
- **Parameter:**
  - `path` (string, erforderlich): Der absolute Pfad zur zu lesenden Datei.
  - `offset` (number, optional): Bei Textdateien die 0-basierte Zeilennummer, ab der das Lesen beginnt. Erfordert, dass `limit` gesetzt ist.
  - `limit` (number, optional): Bei Textdateien die maximale Anzahl an Zeilen, die gelesen werden sollen. Falls nicht angegeben, wird ein Standardmaximum (z. B. 2000 Zeilen) gelesen oder, wenn möglich, die gesamte Datei.
- **Verhalten:**
  - Für Textdateien: Gibt den Inhalt zurück. Wenn `offset` und `limit` verwendet werden, wird nur dieser Abschnitt der Zeilen zurückgegeben. Zeigt an, ob der Inhalt aufgrund von Zeilen- oder Zeilenlängenbeschränkungen gekürzt wurde.
  - Für Bild- und PDF-Dateien: Gibt den Dateiinhalt als base64-kodierte Datenstruktur zurück, die für die Verarbeitung durch das Modell geeignet ist.
  - Für andere binäre Dateien: Versucht, sie zu erkennen und zu überspringen, und gibt eine Meldung zurück, dass es sich um eine generische Binärdatei handelt.
- **Ausgabe:** (`llmContent`):
  - Für Textdateien: Der Dateiinhalt, ggf. mit einer Kürzungsmeldung am Anfang (z. B. `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Für Bild-/PDF-Dateien: Ein Objekt mit `inlineData`, das `mimeType` und base64-kodierte `data` enthält (z. B. `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Für andere binäre Dateien: Eine Meldung wie `Cannot display content of binary file: /path/to/data.bin`.
- **Bestätigung:** Nein.

## 3. `write_file` (WriteFile)

`write_file` schreibt Inhalte in eine angegebene Datei. Wenn die Datei bereits existiert, wird sie überschrieben. Falls die Datei nicht existiert, wird sie (samt notwendiger übergeordneter Verzeichnisse) erstellt.

- **Tool-Name:** `write_file`
- **Anzeigename:** WriteFile
- **Datei:** `write-file.ts`
- **Parameter:**
  - `file_path` (string, erforderlich): Der absolute Pfad zur Datei, in die geschrieben werden soll.
  - `content` (string, erforderlich): Der Inhalt, der in die Datei geschrieben werden soll.
- **Verhalten:**
  - Schreibt den übergebenen `content` in die angegebene `file_path`.
  - Erstellt übergeordnete Verzeichnisse, falls diese nicht existieren.
- **Ausgabe (`llmContent`):** Eine Erfolgsmeldung, z. B. `Successfully overwrote file: /path/to/your/file.txt` oder `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Bestätigung:** Ja. Zeigt einen Diff der Änderungen an und fordert die Nutzerbestätigung vor dem Schreiben an.

## 4. `glob` (FindFiles)

`glob` findet Dateien, die bestimmten Glob-Patterns entsprechen (z. B. `src/**/*.ts`, `*.md`), und gibt absolute Pfade zurück, sortiert nach Änderungszeit (neueste zuerst).

- **Tool-Name:** `glob`
- **Anzeigename:** FindFiles
- **Datei:** `glob.ts`
- **Parameter:**
  - `pattern` (string, erforderlich): Das Glob-Pattern, gegen das gematcht wird (z. B. `"*.py"`, `"src/**/*.js"`).
  - `path` (string, optional): Der absolute Pfad zum Verzeichnis, in dem gesucht werden soll. Falls nicht angegeben, wird im Root-Verzeichnis des Tools gesucht.
  - `case_sensitive` (boolean, optional): Ob die Suche case-sensitive sein soll. Standardmäßig `false`.
  - `respect_git_ignore` (boolean, optional): Ob `.gitignore`-Patterns beim Suchen von Dateien berücksichtigt werden sollen. Standardmäßig `true`.
- **Verhalten:**
  - Sucht nach Dateien, die dem Glob-Pattern im angegebenen Verzeichnis entsprechen.
  - Gibt eine Liste von absoluten Pfaden zurück, sortiert nach Änderungsdatum (neueste zuerst).
  - Ignoriert standardmäßig gängige Verzeichnisse wie `node_modules` und `.git`.
- **Ausgabe (`llmContent`):** Eine Nachricht wie: `Found 5 file(s) matching "*.ts" within src, sorted by modification time (newest first):\nsrc/file1.ts\nsrc/subdir/file2.ts...`
- **Bestätigung:** Nein.

## 5. `search_file_content` (SearchText)

`search_file_content` sucht nach einem regulären Ausdruck (regex) innerhalb des Inhalts von Dateien in einem bestimmten Verzeichnis. Es können Dateien anhand eines Glob-Patterns gefiltert werden. Gibt die Zeilen mit Treffern sowie deren Dateipfade und Zeilennummern zurück.

- **Tool-Name:** `search_file_content`
- **Anzeigename:** SearchText
- **Datei:** `grep.ts`
- **Parameter:**
  - `pattern` (string, erforderlich): Der reguläre Ausdruck, nach dem gesucht werden soll (z. B. `"function\s+myFunction"`).
  - `path` (string, optional): Der absolute Pfad zum Verzeichnis, in dem gesucht werden soll. Standardmäßig wird das aktuelle Arbeitsverzeichnis verwendet.
  - `include` (string, optional): Ein Glob-Pattern, um festzulegen, welche Dateien durchsucht werden (z. B. `"*.js"`, `"src/**/*.{ts,tsx}"`). Falls weggelassen, werden die meisten Dateien durchsucht (unter Berücksichtigung gängiger Ignorier-Regeln).
  - `maxResults` (number, optional): Maximale Anzahl an Treffern, die zurückgegeben werden, um einen Kontextüberlauf zu vermeiden (Standard: 20, max: 100). Verwende niedrigere Werte bei allgemeinen Suchen, höhere bei spezifischen.
- **Verhalten:**
  - Verwendet `git grep`, falls verfügbar (in einem Git-Repository) für bessere Performance; ansonsten greift es auf das systemeigene `grep` oder eine JavaScript-basierte Suche zurück.
  - Gibt eine Liste der übereinstimmenden Zeilen zurück, jeweils mit Dateipfad (relativ zum Suchverzeichnis) und Zeilennummer vorangestellt.
  - Begrenzt standardmäßig auf maximal 20 Treffer, um einen Kontextüberlauf zu verhindern. Bei gekürzten Ergebnissen wird eine klare Warnung mit Hinweisen zur Verfeinerung der Suche angezeigt.
- **Ausgabe (`llmContent`):** Ein formatierter String mit den Treffern, z. B.:

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  File: src/utils.ts
  L15: export function myFunction() {
  L22:   myFunction.call();
  ---
  File: src/index.ts
  L5: import { myFunction } from './utils';
  ---

  WARNING: Results truncated to prevent context overflow. To see more results:
  - Use a more specific pattern to reduce matches
  - Add file filters with the 'include' parameter (e.g., "*.js", "src/**")
  - Specify a narrower 'path' to search in a subdirectory
  - Increase 'maxResults' parameter if you need more matches (current: 20)
  ```

- **Bestätigung:** Nein.

### `search_file_content` Beispiele

Suche nach einem Muster mit standardmäßigem Limit für Ergebnisse:

```
search_file_content(pattern="function\s+myFunction", path="src")
```

Suche nach einem Muster mit benutzerdefiniertem Limit für Ergebnisse:

```
search_file_content(pattern="function", path="src", maxResults=50)
```

Suche nach einem Muster mit Dateifilterung und benutzerdefiniertem Limit für Ergebnisse:

```
search_file_content(pattern="function", include="*.js", maxResults=10)
```

## 6. `replace` (Editieren)

`replace` ersetzt Text innerhalb einer Datei. Standardmäßig wird nur eine einzelne Fundstelle ersetzt, aber durch Angabe von `expected_replacements` können auch mehrere Vorkommen ersetzt werden. Dieses Tool ist für präzise, gezielte Änderungen konzipiert und benötigt einen ausreichenden Kontext um den `old_string`, um sicherzustellen, dass die korrekte Stelle verändert wird.

- **Tool-Name:** `replace`
- **Anzeigename:** Edit
- **Datei:** `edit.ts`
- **Parameter:**
  - `file_path` (string, erforderlich): Der absolute Pfad zur zu ändernden Datei.
  - `old_string` (string, erforderlich): Der exakte Text, der ersetzt werden soll.

    **WICHTIG:** Dieser String muss die zu ändernde Stelle eindeutig identifizieren. Er sollte mindestens 3 Zeilen Kontext _vor_ und _nach_ dem Zieltext enthalten und dabei Leerzeichen sowie Einrückung exakt wiedergeben. Wenn `old_string` leer ist, versucht das Tool, eine neue Datei unter `file_path` mit `new_string` als Inhalt zu erstellen.

  - `new_string` (string, erforderlich): Der exakte Text, durch den `old_string` ersetzt werden soll.
  - `expected_replacements` (number, optional): Die Anzahl der zu ersetzenden Vorkommen. Standardwert ist `1`.

- **Verhalten:**
  - Wenn `old_string` leer ist und `file_path` nicht existiert, wird eine neue Datei mit `new_string` als Inhalt erstellt.
  - Wenn `old_string` angegeben ist, liest das Tool die Datei unter `file_path` und sucht nach genau einem Vorkommen von `old_string`.
  - Wird genau ein Treffer gefunden, wird dieser durch `new_string` ersetzt.
  - **Erweiterte Zuverlässigkeit (Mehrstufige Edit-Korrektur):** Um die Erfolgsrate von Änderungen deutlich zu erhöhen – insbesondere wenn der vom Modell gelieferte `old_string` nicht perfekt präzise ist – verwendet das Tool einen mehrstufigen Korrekturmechanismus.
    - Falls der ursprüngliche `old_string` nicht gefunden wird oder an mehreren Stellen vorkommt, kann das Tool das Gemini-Modell nutzen, um `old_string` (und ggf. auch `new_string`) iterativ zu verfeinern.
    - Dieser Selbstkorrektur-Prozess versucht, das eindeutige Segment zu identifizieren, das das Modell eigentlich ändern wollte, wodurch die `replace`-Operation robuster wird, selbst bei leicht ungenauem Ausgangskontext.
- **Fehlerbedingungen:** Trotz des Korrekturmechanismus schlägt das Tool fehl, wenn:
  - `file_path` kein absoluter Pfad ist oder außerhalb des Root-Verzeichnisses liegt.
  - `old_string` nicht leer ist, aber `file_path` nicht existiert.
  - `old_string` leer ist, aber `file_path` bereits existiert.
  - `old_string` nach Korrekturversuchen nicht in der Datei gefunden wird.
  - `old_string` mehrfach vorkommt und der Selbstkorrektur-Mechanismus keine eindeutige Übereinstimmung finden kann.
- **Ausgabe (`llmContent`):**
  - Bei Erfolg: `Successfully modified file: /path/to/file.txt (1 replacements).` oder `Created new file: /path/to/new_file.txt with provided content.`
  - Bei Fehler: Eine Fehlermeldung mit Erklärung des Grundes (z. B. `Failed to edit, 0 occurrences found...`, `Failed to edit, expected 1 occurrences but found 2...`).
- **Bestätigung:** Ja. Zeigt einen Diff der vorgeschlagenen Änderungen an und fordert die Nutzer:in zur Bestätigung auf, bevor die Datei geschrieben wird.

Diese Filesystem-Tools bilden die Grundlage dafür, dass Qwen Code dein lokales Projekt-Kontext verstehen und damit interagieren kann.