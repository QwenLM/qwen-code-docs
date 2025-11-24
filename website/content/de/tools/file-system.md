# Qwen Code Dateisystem-Tools

Qwen Code bietet eine umfassende Sammlung von Tools zur Interaktion mit dem lokalen Dateisystem. Diese Tools ermöglichen es dem Modell, Dateien und Verzeichnisse zu lesen, zu schreiben, aufzulisten, zu durchsuchen und zu ändern – alles unter deiner Kontrolle und in der Regel mit Bestätigungsabfrage bei sensiblen Operationen.

**Hinweis:** Alle Dateisystem-Tools arbeiten innerhalb eines `rootDirectory` (normalerweise das aktuelle Arbeitsverzeichnis, in dem du die CLI gestartet hast) aus Sicherheitsgründen. Die Pfade, die du diesen Tools übergibst, sollten entweder absolut sein oder werden relativ zu diesem Root-Verzeichnis aufgelöst.

## 1. `list_directory` (ListFiles)

`list_directory` listet die Namen von Dateien und Unterverzeichnissen direkt innerhalb eines angegebenen Verzeichnispfads auf. Es kann optional Einträge ignorieren, die bestimmten Glob-Mustern entsprechen.

- **Tool-Name:** `list_directory`
- **Anzeigename:** ListFiles
- **Datei:** `ls.ts`
- **Parameter:**
  - `path` (string, erforderlich): Der absolute Pfad zum aufzulistenden Verzeichnis.
  - `ignore` (Array aus Strings, optional): Eine Liste von Glob-Mustern, die vom Listing ausgeschlossen werden sollen (z.B. `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, optional): Ob `.gitignore`-Muster beim Auflisten berücksichtigt werden sollen. Standardmäßig `true`.
- **Verhalten:**
  - Gibt eine Liste mit Datei- und Verzeichnisnamen zurück.
  - Zeigt für jeden Eintrag an, ob es sich um ein Verzeichnis handelt.
  - Sortiert die Einträge so, dass Verzeichnisse zuerst kommen, danach alphabetisch.
- **Ausgabe (`llmContent`):** Ein String wie: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Bestätigung:** Nein.

## 2. `read_file` (ReadFile)

`read_file` liest und gibt den Inhalt einer angegebenen Datei zurück. Dieses Tool unterstützt Text-, Bild- (PNG, JPG, GIF, WEBP, SVG, BMP) und PDF-Dateien. Für Textdateien kann es bestimmte Zeilenbereiche lesen. Andere binäre Dateitypen werden in der Regel übersprungen.

- **Toolname:** `read_file`
- **Anzeigename:** ReadFile
- **Datei:** `read-file.ts`
- **Parameter:**
  - `path` (string, erforderlich): Der absolute Pfad zur zu lesenden Datei.
  - `offset` (number, optional): Bei Textdateien die nullbasierte Zeilennummer, ab der das Lesen beginnt. Erfordert, dass `limit` gesetzt ist.
  - `limit` (number, optional): Bei Textdateien die maximale Anzahl an Zeilen, die gelesen werden sollen. Falls weggelassen, wird ein Standardmaximum (z. B. 2000 Zeilen) gelesen oder, wenn möglich, die gesamte Datei.
- **Verhalten:**
  - Für Textdateien: Gibt den Inhalt zurück. Wenn `offset` und `limit` verwendet werden, wird nur dieser Abschnitt der Zeilen zurückgegeben. Zeigt an, ob der Inhalt aufgrund von Zeilen- oder Zeilenlängenbeschränkungen gekürzt wurde.
  - Für Bild- und PDF-Dateien: Gibt den Dateiinhalt als base64-kodierte Datenstruktur zurück, die für die Verarbeitung durch das Modell geeignet ist.
  - Für andere binäre Dateien: Versucht, sie zu erkennen und zu überspringen, und gibt eine Meldung zurück, dass es sich um eine generische Binärdatei handelt.
- **Ausgabe:** (`llmContent`):
  - Für Textdateien: Der Dateiinhalt, ggf. mit einer Kürzungsmeldung am Anfang (z. B. `[File content truncated: showing lines 1-100 of 500 total lines...]\nTatsächlicher Dateiinhalt...`).
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
- **Bestätigung:** Ja. Zeigt einen Diff der Änderungen an und fordert die Zustimmung des Benutzers vor dem Schreiben an.

## 4. `glob` (Glob)

`glob` findet Dateien, die bestimmten Glob-Patterns entsprechen (z. B. `src/**/*.ts`, `*.md`), und gibt absolute Pfade zurück, sortiert nach Änderungszeit (neueste zuerst).

- **Tool-Name:** `glob`
- **Anzeigename:** Glob
- **Datei:** `glob.ts`
- **Parameter:**
  - `pattern` (string, erforderlich): Das Glob-Pattern, gegen das gematcht wird (z. B. `"*.py"`, `"src/**/*.js"`).
  - `path` (string, optional): Das Verzeichnis, in dem gesucht wird. Falls nicht angegeben, wird das aktuelle Arbeitsverzeichnis verwendet.
- **Verhalten:**
  - Sucht nach Dateien, die dem Glob-Pattern innerhalb des angegebenen Verzeichnisses entsprechen.
  - Gibt eine Liste von absoluten Pfaden zurück, sortiert nach der letzten Änderungszeit (neueste zuerst).
  - Berücksichtigt standardmäßig `.gitignore`- und `.qwenignore`-Patterns.
  - Begrenzt die Ergebnisse auf 100 Dateien, um einen Kontextüberlauf zu vermeiden.
- **Ausgabe (`llmContent`):** Eine Nachricht wie: `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **Bestätigung:** Nein.

## 5. `grep_search` (Grep)

`grep_search` sucht nach einem regulären Ausdruck innerhalb des Inhalts von Dateien in einem angegebenen Verzeichnis. Kann Dateien mithilfe eines Glob-Musters filtern. Gibt die Zeilen mit Übereinstimmungen sowie deren Dateipfade und Zeilennummern zurück.

- **Tool-Name:** `grep_search`
- **Anzeigename:** Grep
- **Datei:** `ripGrep.ts` (mit `grep.ts` als Fallback)
- **Parameter:**
  - `pattern` (string, erforderlich): Das reguläre Ausdrucksmuster, nach dem im Dateiinhalt gesucht werden soll (z. B. `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, optional): Die Datei oder das Verzeichnis, in dem gesucht werden soll. Standardmäßig das aktuelle Arbeitsverzeichnis.
  - `glob` (string, optional): Ein Glob-Muster zum Filtern von Dateien (z. B. `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (number, optional): Begrenzt die Ausgabe auf die ersten N übereinstimmenden Zeilen. Optional – zeigt alle Übereinstimmungen an, wenn nicht angegeben.
- **Verhalten:**
  - Verwendet ripgrep für eine schnelle Suche, falls verfügbar; greift andernfalls auf eine JavaScript-basierte Suchimplementierung zurück.
  - Gibt übereinstimmende Zeilen mit Dateipfaden und Zeilennummern zurück.
  - Standardmäßig Groß-/Kleinschreibung ignorieren.
  - Berücksichtigt `.gitignore`- und `.qwenignore`-Muster.
  - Begrenzt die Ausgabe, um einen Kontextüberlauf zu verhindern.
- **Ausgabe (`llmContent`):** Ein formatierter String der Übereinstimmungen, z. B.:

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lines truncated] ...
  ```

- **Bestätigung:** Nein.

### `grep_search` Beispiele

Suche nach einem Muster mit standardmäßigem Ergebnis-Limit:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Suche nach einem Muster mit benutzerdefiniertem Ergebnis-Limit:

```
grep_search(pattern="function", path="src", limit=50)
```

Suche nach einem Muster mit Dateifilter und benutzerdefiniertem Ergebnis-Limit:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (Bearbeiten)

Das Tool `edit` ersetzt Text innerhalb einer Datei. Standardmäßig muss der übergebene `old_string` eine eindeutige Position im Text identifizieren. Setze `replace_all` auf `true`, wenn du absichtlich alle Vorkommen ersetzen möchtest. Dieses Tool ist für präzise und gezielte Änderungen konzipiert und benötigt daher ausreichend Kontext um den `old_string`, um sicherzustellen, dass die korrekte Stelle verändert wird.

- **Toolname:** `edit`
- **Anzeigename:** Bearbeiten
- **Datei:** `edit.ts`
- **Parameter:**
  - `file_path` (string, erforderlich): Der absolute Pfad zur zu ändernden Datei.
  - `old_string` (string, erforderlich): Der exakte Text, der ersetzt werden soll.

    **WICHTIG:** Dieser String muss die zu ändernde Stelle eindeutig identifizieren. Er sollte mindestens 3 Zeilen Kontext _vor_ und _nach_ dem Zieltext enthalten und dabei Leerzeichen sowie Einrückung exakt wiedergeben. Wenn `old_string` leer ist, versucht das Tool, eine neue Datei unter `file_path` mit `new_string` als Inhalt zu erstellen.

  - `new_string` (string, erforderlich): Der exakte Text, durch den `old_string` ersetzt wird.
  - `replace_all` (boolean, optional): Alle Vorkommen von `old_string` ersetzen. Standardwert ist `false`.

- **Verhalten:**
  - Wenn `old_string` leer ist und `file_path` nicht existiert, wird eine neue Datei mit `new_string` als Inhalt erstellt.
  - Wenn `old_string` angegeben ist, liest das Tool die Datei unter `file_path` und sucht nach genau einem Treffer – es sei denn, `replace_all` ist aktiviert.
  - Bei einem eindeutigen Treffer (oder wenn `replace_all` aktiv ist) wird der entsprechende Text durch `new_string` ersetzt.
  - **Erweiterte Zuverlässigkeit (Mehrstufige Korrektur bei Editieroperationen):** Um die Erfolgsrate von Änderungen deutlich zu erhöhen – insbesondere wenn der vom Modell gelieferte `old_string` nicht perfekt präzise ist – verwendet das Tool einen mehrstufigen Korrekturmechanismus.
    - Falls der initiale `old_string` nicht gefunden wird oder mehrere Treffer liefert, kann das Tool das Qwen-Modell nutzen, um `old_string` (und ggf. auch `new_string`) iterativ zu verfeinern.
    - Dieser Selbstkorrekturprozess versucht, das Segment zu finden, das das Modell tatsächlich bearbeiten wollte, wodurch die `edit`-Operation robuster gegenüber kleinen Ungenauigkeiten im Ausgangskontext wird.
- **Fehlerbedingungen:** Trotz des Korrekturmechanismus schlägt das Tool fehl, wenn:
  - `file_path` kein absoluter Pfad ist oder außerhalb des Root-Verzeichnisses liegt.
  - `old_string` nicht leer ist, aber die Datei unter `file_path` nicht existiert.
  - `old_string` leer ist, aber die Datei unter `file_path` bereits existiert.
  - `old_string` nach allen Korrekturversuchen nicht in der Datei gefunden wird.
  - `old_string` mehrfach vorkommt, `replace_all` deaktiviert ist und der Selbstkorrekturmechanismus keine eindeutige Übereinstimmung ermitteln kann.
- **Ausgabe (`llmContent`):**
  - Bei Erfolg: `Successfully modified file: /path/to/file.txt (1 replacements).` oder `Created new file: /path/to/new_file.txt with provided content.`
  - Bei Fehler: Eine Fehlermeldung mit Erklärung des Grundes (z. B. `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **Bestätigung:** Ja. Zeigt einen Diff der vorgeschlagenen Änderungen an und fordert eine Benutzerbestätigung vor dem Schreiben in die Datei an.

Diese Filesystem-Tools bilden die Grundlage dafür, dass Qwen Code dein lokales Projektverzeichnis verstehen und damit interagieren kann.