# Qwen Code Dateisystem-Tools

Qwen Code bietet eine umfassende Sammlung von Tools zur Interaktion mit dem lokalen Dateisystem. Diese Tools ermöglichen es dem Modell, Dateien und Verzeichnisse zu lesen, zu schreiben, aufzulisten, zu durchsuchen und zu ändern – alles unter deiner Kontrolle und typischerweise mit Bestätigung für sensible Operationen.

**Hinweis:** Alle Dateisystem-Tools arbeiten innerhalb eines `rootDirectory` (normalerweise das aktuelle Arbeitsverzeichnis, in dem du die CLI gestartet hast) aus Sicherheitsgründen. Die Pfade, die du diesen Tools übergibst, werden in der Regel als absolut erwartet oder relativ zu diesem Stammverzeichnis aufgelöst.

## 1. `list_directory` (ListFiles)

`list_directory` listet die Namen von Dateien und Unterverzeichnissen direkt innerhalb eines angegebenen Verzeichnispfads auf. Es kann optional Einträge ignorieren, die mitgelieferten Globmustern entsprechen.

- **Toolname:** `list_directory`
- **Anzeigename:** ListFiles
- **Datei:** `ls.ts`
- **Parameter:**
  - `path` (String, erforderlich): Der absolute Pfad zum aufzulistenden Verzeichnis.
  - `ignore` (Array aus Strings, optional): Eine Liste von Globmustern, die vom Listing ausgeschlossen werden sollen (z. B. `["*.log", ".git"]`).
  - `respect_git_ignore` (Boolean, optional): Ob beim Auflisten von Dateien `.gitignore`-Muster berücksichtigt werden sollen. Standardmäßig `true`.
- **Verhalten:**
  - Gibt eine Liste von Datei- und Verzeichnisnamen zurück.
  - Zeigt an, ob jeder Eintrag ein Verzeichnis ist.
  - Sortiert Einträge zuerst nach Verzeichnissen, dann alphabetisch.
- **Ausgabe (`llmContent`):** Ein String wie: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Bestätigung:** Nein.

## 2. `read_file` (ReadFile)

`read_file` liest und gibt den Inhalt einer angegebenen Datei zurück. Dieses Tool verarbeitet Text-, Bild- (PNG, JPG, GIF, WEBP, SVG, BMP) und PDF-Dateien. Für Textdateien kann es bestimmte Zeilenbereiche lesen. Andere binäre Dateitypen werden im Allgemeinen übersprungen.

- **Tool-Name:** `read_file`
- **Anzeigename:** ReadFile
- **Datei:** `read-file.ts`
- **Parameter:**
  - `path` (string, erforderlich): Der absolute Pfad zur zu lesenden Datei.
  - `offset` (number, optional): Bei Textdateien die nullbasierte Zeilennummer, ab der das Lesen beginnt. Erfordert, dass `limit` gesetzt ist.
  - `limit` (number, optional): Bei Textdateien die maximale Anzahl der zu lesenden Zeilen. Wenn weggelassen, wird eine Standardhöchstmenge gelesen (z. B. 2000 Zeilen) oder die gesamte Datei, falls möglich.
- **Verhalten:**
  - Für Textdateien: Gibt den Inhalt zurück. Wenn `offset` und `limit` verwendet werden, wird nur dieser Abschnitt der Zeilen zurückgegeben. Zeigt an, ob Inhalte aufgrund von Zeilen- oder Zeilenlängenbeschränkungen gekürzt wurden.
  - Für Bild- und PDF-Dateien: Gibt den Dateiinhalt als base64-kodierte Datenstruktur zurück, die für die Modellverarbeitung geeignet ist.
  - Für andere binäre Dateien: Versucht, sie zu identifizieren und zu überspringen, und gibt eine Meldung zurück, dass es sich um eine generische Binärdatei handelt.
- **Ausgabe:** (`llmContent`):
  - Für Textdateien: Der Dateiinhalt, möglicherweise mit einer Kürzungsmeldung am Anfang (z. B. `[Dateiinhalt gekürzt: Zeilen 1–100 von insgesamt 500 Zeilen werden angezeigt...]\nTatsächlicher Dateiinhalt...`).
  - Für Bild-/PDF-Dateien: Ein Objekt mit `inlineData`, das `mimeType` und base64-kodierte `data` enthält (z. B. `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Für andere binäre Dateien: Eine Meldung wie `Inhalt der Binärdatei kann nicht angezeigt werden: /pfad/zu/datei.dat`.
- **Bestätigung:** Nein.

## 3. `write_file` (WriteFile)

`write_file` schreibt Inhalte in eine angegebene Datei. Wenn die Datei bereits existiert, wird sie überschrieben. Falls die Datei nicht existiert, wird sie (sowie alle notwendigen übergeordneten Verzeichnisse) erstellt.

- **Tool-Name:** `write_file`
- **Anzeigename:** WriteFile
- **Datei:** `write-file.ts`
- **Parameter:**
  - `file_path` (String, erforderlich): Der absolute Pfad zur Datei, in die geschrieben werden soll.
  - `content` (String, erforderlich): Der Inhalt, der in die Datei geschrieben werden soll.
- **Verhalten:**
  - Schreibt den bereitgestellten `content` in die angegebene `file_path`.
  - Erstellt übergeordnete Verzeichnisse, falls diese nicht existieren.
- **Ausgabe (`llmContent`):** Eine Erfolgsmeldung, z. B. `Successfully overwrote file: /path/to/your/file.txt` oder `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Bestätigung:** Ja. Zeigt einen Diff der Änderungen an und fordert die Zustimmung des Benutzers vor dem Schreiben an.

## 4. `glob` (Glob)

`glob` findet Dateien, die bestimmten Glob-Mustern entsprechen (z. B. `src/**/*.ts`, `*.md`), und gibt absolute Pfade zurück, sortiert nach Änderungszeit (neueste zuerst).

- **Tool-Name:** `glob`
- **Anzeigename:** Glob
- **Datei:** `glob.ts`
- **Parameter:**
  - `pattern` (String, erforderlich): Das Glob-Muster, gegen das abgeglichen werden soll (z. B. `"*.py"`, `"src/**/*.js"`).
  - `path` (String, optional): Das Verzeichnis, in dem gesucht werden soll. Falls nicht angegeben, wird das aktuelle Arbeitsverzeichnis verwendet.
- **Verhalten:**
  - Sucht nach Dateien, die dem Glob-Muster innerhalb des angegebenen Verzeichnisses entsprechen.
  - Gibt eine Liste von absoluten Pfaden zurück, sortiert nach den zuletzt geänderten Dateien.
  - Berücksichtigt standardmäßig `.gitignore`- und `.qwenignore`-Muster.
  - Begrenzt die Ergebnisse auf 100 Dateien, um einen Kontextüberlauf zu verhindern.
- **Ausgabe (`llmContent`):** Eine Nachricht wie: `5 Datei(en) gefunden, die "*.ts" im Verzeichnis /path/to/search/dir entsprechen, sortiert nach Änderungszeit (neueste zuerst):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 Dateien gekürzt] ...`
- **Bestätigung:** Nein.

## 5. `grep_search` (Grep)

`grep_search` sucht nach einem regulären Ausdruck innerhalb des Inhalts von Dateien in einem angegebenen Verzeichnis. Kann Dateien mithilfe eines Glob-Musters filtern. Gibt die Zeilen mit Übereinstimmungen sowie deren Dateipfade und Zeilennummern zurück.

- **Tool-Name:** `grep_search`
- **Anzeigename:** Grep
- **Datei:** `grep.ts` (mit `ripGrep.ts` als Fallback)
- **Parameter:**
  - `pattern` (String, erforderlich): Der reguläre Ausdruck, nach dem im Dateiinhalt gesucht werden soll (z. B. `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (String, optional): Die Datei oder das Verzeichnis, in dem gesucht werden soll. Standardmäßig das aktuelle Arbeitsverzeichnis.
  - `glob` (String, optional): Glob-Muster zum Filtern von Dateien (z. B. `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (Zahl, optional): Begrenzt die Ausgabe auf die ersten N übereinstimmenden Zeilen. Optional – zeigt alle Übereinstimmungen an, wenn nicht angegeben.
- **Verhalten:**
  - Verwendet ripgrep für eine schnelle Suche, falls verfügbar; greift andernfalls auf eine JavaScript-basierte Suchimplementierung zurück.
  - Gibt übereinstimmende Zeilen mit Dateipfaden und Zeilennummern zurück.
  - Standardmäßig ohne Beachtung der Groß-/Kleinschreibung.
  - Berücksichtigt .gitignore- und .qwenignore-Muster.
  - Begrenzt die Ausgabe, um einen Kontextüberlauf zu verhindern.
- **Ausgabe (`llmContent`):** Ein formatierter String der Übereinstimmungen, z. B.:

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

Suche nach einem Muster mit standardmäßiger Ergebnisbegrenzung:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Suche nach einem Muster mit benutzerdefinierter Ergebnisbegrenzung:

```
grep_search(pattern="function", path="src", limit=50)
```

Suche nach einem Muster mit Dateifilterung und benutzerdefinierter Ergebnisbegrenzung:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (Bearbeiten)

`edit` ersetzt Text innerhalb einer Datei. Standardmäßig erfordert es, dass `old_string` einem einzigen, eindeutigen Ort entspricht. Setze `replace_all` auf `true`, wenn du absichtlich alle Vorkommen ändern möchtest. Dieses Tool ist für präzise, gezielte Änderungen konzipiert und benötigt einen ausreichenden Kontext um `old_string`, um sicherzustellen, dass die korrekte Stelle geändert wird.

- **Tool-Name:** `edit`
- **Anzeigename:** Bearbeiten
- **Datei:** `edit.ts`
- **Parameter:**
  - `file_path` (String, erforderlich): Der absolute Pfad zur zu ändernden Datei.
  - `old_string` (String, erforderlich): Der exakte wörtliche Text, der ersetzt werden soll.

    **WICHTIG:** Diese Zeichenfolge muss die einzelne Instanz eindeutig identifizieren, die geändert werden soll. Sie sollte ausreichend Kontext um den Zieltext enthalten und Leerzeichen sowie Einrückungen genau übereinstimmen. Wenn `old_string` leer ist, versucht das Tool, eine neue Datei unter `file_path` mit `new_string` als Inhalt zu erstellen.

  - `new_string` (String, erforderlich): Der exakte wörtliche Text, durch den `old_string` ersetzt werden soll.
  - `replace_all` (Boolean, optional): Ersetzt alle Vorkommen von `old_string`. Standardwert ist `false`.

- **Verhalten:**
  - Wenn `old_string` leer ist und `file_path` nicht existiert, wird eine neue Datei mit `new_string` als Inhalt erstellt.
  - Wenn `old_string` angegeben ist, liest es `file_path` und versucht, genau ein Vorkommen zu finden, es sei denn, `replace_all` ist wahr.
  - Wenn die Übereinstimmung eindeutig ist (oder `replace_all` wahr ist), ersetzt es den Text durch `new_string`.
  - **Erweiterte Zuverlässigkeit (Mehrstufige Bearbeitungskorrektur):** Um die Erfolgsrate von Änderungen deutlich zu verbessern, insbesondere wenn der vom Modell bereitgestellte `old_string` möglicherweise nicht perfekt präzise ist, integriert das Tool einen mehrstufigen Korrekturmechanismus.
    - Wenn der anfängliche `old_string` nicht gefunden wird oder mehreren Positionen entspricht, kann das Tool das Qwen-Modell nutzen, um `old_string` (und möglicherweise auch `new_string`) iterativ zu verfeinern.
    - Dieser Selbstkorrekturprozess versucht, das eindeutige Segment zu identifizieren, das das Modell ändern wollte, wodurch die `edit`-Operation robuster wird, selbst bei leicht ungenauem Ausgangskontext.
- **Fehlerbedingungen:** Trotz des Korrekturmechanismus schlägt das Tool fehl, wenn:
  - `file_path` nicht absolut ist oder sich außerhalb des Root-Verzeichnisses befindet.
  - `old_string` nicht leer ist, aber `file_path` nicht existiert.
  - `old_string` leer ist, aber `file_path` bereits existiert.
  - `old_string` nach Korrekturversuchen nicht in der Datei gefunden wird.
  - `old_string` mehrfach vorkommt, `replace_all` falsch ist und der Selbstkorrekturmechanismus keine eindeutige Übereinstimmung feststellen kann.
- **Ausgabe (`llmContent`):**
  - Bei Erfolg: `Erfolgreich geänderte Datei: /pfad/zur/datei.txt (1 Ersetzung).` oder `Neue Datei erstellt: /pfad/zur/neuen_datei.txt mit bereitgestelltem Inhalt.`
  - Bei Fehler: Eine Fehlermeldung mit Erklärung des Grundes (z. B. `Bearbeitung fehlgeschlagen, 0 Vorkommen gefunden...`, `Bearbeitung fehlgeschlagen, da der Text mehreren Stellen entspricht...`).
- **Bestätigung:** Ja. Zeigt einen Diff der vorgeschlagenen Änderungen an und fordert die Benutzerbestätigung vor dem Schreiben in die Datei an.

Diese Dateisystemtools bieten eine Grundlage dafür, dass Qwen Code dein lokales Projektverständnis erfassen und damit interagieren kann.