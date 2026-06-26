# Qwen Code Dateisystem-Werkzeuge

Qwen Code bietet eine umfassende Sammlung von Werkzeugen für die Interaktion mit dem lokalen Dateisystem. Diese Werkzeuge ermöglichen es dem Modell, Dateien und Verzeichnisse zu lesen, zu schreiben, aufzulisten, zu durchsuchen und zu ändern – alles unter Ihrer Kontrolle und in der Regel mit Bestätigung bei sensiblen Operationen.

**Hinweis:** Alle Dateisystem-Werkzeuge arbeiten aus Sicherheitsgründen innerhalb eines `rootDirectory` (normalerweise das aktuelle Arbeitsverzeichnis, in dem Sie die CLI gestartet haben). Pfade, die Sie diesen Werkzeugen übergeben, werden in der Regel als absolut erwartet oder relativ zu diesem Stammverzeichnis aufgelöst.

## 1. `list_directory` (ListFiles)

`list_directory` listet die Namen von Dateien und Unterverzeichnissen direkt innerhalb eines angegebenen Verzeichnispfads auf. Es kann optional Einträge ignorieren, die auf angegebene Glob-Muster passen.

- **Werkzeugname:** `list_directory`
- **Anzeigename:** ListFiles
- **Datei:** `ls.ts`
- **Parameter:**
  - `path` (string, erforderlich): Der absolute Pfad zum aufzulistenden Verzeichnis.
  - `ignore` (Array von Strings, optional): Eine Liste von Glob-Mustern, die von der Auflistung ausgeschlossen werden sollen (z. B. `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, optional): Ob `.gitignore`-Muster beim Auflisten von Dateien beachtet werden sollen. Standard ist `true`.
- **Verhalten:**
  - Gibt eine Liste von Datei- und Verzeichnisnamen zurück.
  - Gibt an, ob jeder Eintrag ein Verzeichnis ist.
  - Sortiert Einträge mit Verzeichnissen zuerst, dann alphabetisch.
- **Ausgabe (`llmContent`):** Ein String wie: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Bestätigung:** Nein.

## 2. `read_file` (ReadFile)

`read_file` liest und gibt den Inhalt einer angegebenen Datei zurück. Dieses Werkzeug verarbeitet Textdateien und Mediendateien (Bilder, PDFs, Audio, Video), deren Modalität vom aktuellen Modell unterstützt wird. Bei Textdateien können bestimmte Zeilenbereiche gelesen werden. Mediendateien, deren Modalität vom aktuellen Modell nicht unterstützt wird, werden mit einer hilfreichen Fehlermeldung abgelehnt. Andere binäre Dateitypen werden in der Regel übersprungen.

- **Werkzeugname:** `read_file`
- **Anzeigename:** ReadFile
- **Datei:** `read-file.ts`
- **Parameter:**
  - `path` (string, erforderlich): Der absolute Pfad zur zu lesenden Datei.
  - `offset` (number, optional): Bei Textdateien die 0-basierte Zeilennummer, ab der gelesen werden soll. Erfordert, dass `limit` gesetzt ist.
  - `limit` (number, optional): Bei Textdateien die maximale Anzahl zu lesender Zeilen. Wenn nicht angegeben, wird ein Standardmaximum (z. B. 2000 Zeilen) oder die gesamte Datei gelesen, falls möglich.
- **Verhalten:**
  - Bei Textdateien: Gibt den Inhalt zurück. Wenn `offset` und `limit` verwendet werden, wird nur dieser Zeilenabschnitt zurückgegeben. Gibt an, ob der Inhalt aufgrund von Zeilen- oder Zeilenlängenbeschränkungen abgeschnitten wurde.
  - Bei Mediendateien (Bilder, PDFs, Audio, Video): Wenn das aktuelle Modell die Modalität der Datei unterstützt, wird der Dateiinhalt als base64-codiertes `inlineData`-Objekt zurückgegeben. Wenn das Modell die Modalität nicht unterstützt, wird eine Fehlermeldung mit Hinweisen zurückgegeben (z. B. Vorschlag von Skills oder externen Werkzeugen).
  - Bei anderen binären Dateien: Versucht, diese zu identifizieren und zu überspringen, und gibt eine Meldung zurück, dass es sich um eine generische Binärdatei handelt.
- **Ausgabe (`llmContent`):**
  - Bei Textdateien: Der Dateiinhalt, ggf. mit einer Kürzungsmeldung vorangestellt (z. B. `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Bei unterstützten Mediendateien: Ein Objekt mit `inlineData`, das `mimeType` und base64-`data` enthält (z. B. `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Bei nicht unterstützten Mediendateien: Eine Fehlermeldung als String, die erklärt, dass das aktuelle Modell diese Modalität nicht unterstützt, mit Vorschlägen für Alternativen.
  - Bei anderen binären Dateien: Eine Meldung wie `Cannot display content of binary file: /path/to/data.bin`.
- **Bestätigung:** Nein.

### Jupyter-Notebook-Lesevorgänge

Bei Jupyter-Notebooks (`.ipynb`) parst `read_file` das Notebook-JSON und gibt eine strukturierte, modelllesbare Notebook-Ansicht anstelle des rohen JSONs zurück. Die gerenderte Ausgabe enthält die Notebook-Sprache, geordnete Zellen, Zellen-IDs, Quellcode und zusammengefasste Ausgaben.

Notebook-Zellen können dann mit `notebook_edit` bearbeitet werden. Das Modell sollte die von `read_file` angezeigten Zellen-IDs verwenden, wenn eine Zelle anvisiert wird.

`offset` und `limit` werden für `.ipynb`-Dateien nicht unterstützt. Notebook-Lesevorgänge werden als strukturierte vollständige Dateilesungen behandelt; wenn die gerenderte Notebook-Ausgabe intern abgeschnitten wird, weil sie zu groß ist, wird `notebook_edit` Bearbeitungen auf Zellenebene ablehnen und Sie bitten, die Ausgaben zu reduzieren oder das Notebook vor der Bearbeitung aufzuteilen.

## 3. `notebook_edit` (NotebookEdit)

`notebook_edit` bearbeitet Jupyter-Notebook-Dateien (`.ipynb`) sicher auf Zellenebene. Verwenden Sie es anstelle von `edit` oder `write_file`, wenn Sie Notebook-Zellen ändern möchten.

- **Werkzeugname:** `notebook_edit`
- **Anzeigename:** NotebookEdit
- **Datei:** `notebook-edit.ts`
- **Parameter:**
  - `notebook_path` (string, erforderlich): Der absolute Pfad zur `.ipynb`-Datei.
  - `cell_id` (string, optional): Die Ziel-Zellen-ID, die von `read_file` angezeigt wird. Erforderlich für `replace` und `delete`. Bei `insert` wird die neue Zelle nach dieser Zelle eingefügt; wenn nicht angegeben, wird die neue Zelle am Anfang eingefügt.
  - `new_source` (string, optional): Der neue Zellenquellcode für `replace` und `insert`. Nicht erforderlich für `delete`.
  - `cell_type` (`code` oder `markdown`, optional): Der Zellentyp für eingefügte Zellen oder der Zieltyp beim Ersetzen einer Zelle.
  - `edit_mode` (`replace`, `insert` oder `delete`, optional): Die Bearbeitungsoperation. Standard ist `replace`.
- **Verhalten:**
  - Erfordert, dass das Notebook zuvor mit `read_file` in der aktuellen Sitzung gelesen wurde.
  - Zielzellen werden über die von `read_file` gerenderten IDs angesteuert, einschließlich echter Notebook-Zellen-IDs und angezeigter Fallback-IDs wie `cell-N`.
  - Lehnt mehrdeutig gerenderte Zellen-IDs ab, anstatt zu raten.
  - Bei Code-Zellen werden veraltete Ausgaben gelöscht und `execution_count` zurückgesetzt, wenn sich der Quellcode ändert.
  - Bewahrt nach Möglichkeit die JSON-Formatierung des Notebooks, Zeilenenden, Kodierung und BOM.
  - Macht den vorherigen Lesezustand nach strukturellen Bearbeitungen ungültig, wenn sich die angezeigten Fallback-IDs verschieben können, sodass die nächste Notebook-Bearbeitung einen neuen `read_file`-Aufruf erfordert.
- **Ausgabe (`llmContent`):** Eine Erfolgsmeldung, die die bearbeitete Notebook-Zelle beschreibt, und bei Nicht-Lösch-Operationen den aktualisierten Quellcode.
- **Bestätigung:** Ja. Zeigt einen Notebook-JSON-Diff an und fordert die Benutzerfreigabe vor dem Schreiben an, es sei denn, der aktuelle Berechtigungsmodus oder die Regeln genehmigen Bearbeitungswerkzeuge automatisch.

### `notebook_edit`-Beispiele

Ersetzen einer Code-Zelle:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  cell_id="load-data",
  new_source="result = 41 + 1\nprint(result)"
)
```

Einfügen einer Markdown-Zelle nach einer vorhandenen Zelle:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="insert",
  cell_id="summary",
  cell_type="markdown",
  new_source="## Findings\n\nThe cleaned data is ready for modeling."
)
```

Löschen einer Zelle:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="delete",
  cell_id="old-experiment"
)
```

## 4. `write_file` (WriteFile)

`write_file` schreibt Inhalt in eine angegebene Datei. Wenn die Datei existiert, wird sie überschrieben. Wenn die Datei nicht existiert, wird sie (und alle erforderlichen übergeordneten Verzeichnisse) erstellt.

- **Werkzeugname:** `write_file`
- **Anzeigename:** WriteFile
- **Datei:** `write-file.ts`
- **Parameter:**
  - `file_path` (string, erforderlich): Der absolute Pfad zur zu beschreibenden Datei.
  - `content` (string, erforderlich): Der Inhalt, der in die Datei geschrieben werden soll.
- **Verhalten:**
  - Schreibt den bereitgestellten `content` in die `file_path`.
  - Schreibt kein rohes Jupyter-Notebook-JSON. Verwenden Sie für `.ipynb`-Zellenbearbeitungen `notebook_edit`.
  - Erstellt übergeordnete Verzeichnisse, falls diese nicht existieren.
- **Ausgabe (`llmContent`):** Eine Erfolgsmeldung, z. B. `Successfully overwrote file: /path/to/your/file.txt` oder `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Bestätigung:** Ja. Zeigt einen Diff der Änderungen an und fordert die Benutzerfreigabe vor dem Schreiben an.

## 5. `glob` (Glob)

`glob` findet Dateien, die auf bestimmte Glob-Muster passen (z. B. `src/**/*.ts`, `*.md`), und gibt absolute Pfade sortiert nach Änderungszeit (neueste zuerst) zurück.

- **Werkzeugname:** `glob`
- **Anzeigename:** Glob
- **Datei:** `glob.ts`
- **Parameter:**
  - `pattern` (string, erforderlich): Das Glob-Muster, gegen das abgeglichen werden soll (z. B. `"*.py"`, `"src/**/*.js"`).
  - `path` (string, optional): Das zu durchsuchende Verzeichnis. Wenn nicht angegeben, wird das aktuelle Arbeitsverzeichnis verwendet.
- **Verhalten:**
  - Durchsucht das angegebene Verzeichnis nach Dateien, die auf das Glob-Muster passen.
  - Gibt eine Liste absoluter Pfade zurück, sortiert nach den zuletzt geänderten Dateien zuerst.
  - Beachtet standardmäßig .gitignore, .qwenignore und konfigurierte benutzerdefinierte Qwen-Ignore-Dateien.
  - Begrenzt die Ergebnisse auf 100 Dateien, um einen Kontextüberlauf zu vermeiden.
- **Ausgabe (`llmContent`):** Eine Meldung wie: `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **Bestätigung:** Nein.

## 6. `grep_search` (Grep)

`grep_search` durchsucht den Inhalt von Dateien in einem angegebenen Verzeichnis nach einem regulären Ausdrucksmuster. Kann Dateien nach einem Glob-Muster filtern. Gibt die Zeilen mit Übereinstimmungen zusammen mit ihren Dateipfaden und Zeilennummern zurück.

- **Werkzeugname:** `grep_search`
- **Anzeigename:** Grep
- **Datei:** `grep.ts` (mit `ripGrep.ts` als Fallback)
- **Parameter:**
  - `pattern` (string, erforderlich): Das reguläre Ausdrucksmuster, nach dem im Dateiinhalt gesucht werden soll (z. B. `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, optional): Datei oder Verzeichnis, in dem gesucht werden soll. Standard ist das aktuelle Arbeitsverzeichnis.
  - `glob` (string, optional): Glob-Muster zum Filtern von Dateien (z. B. `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (integer, optional): Beschränkt die Ausgabe auf die ersten N übereinstimmenden Zeilen. Muss eine positive Ganzzahl sein. Optional – zeigt alle Übereinstimmungen an, wenn nicht angegeben.
- **Verhalten:**
  - Verwendet ripgrep für schnelle Suche, falls verfügbar; andernfalls wird auf eine JavaScript-basierte Suchimplementierung zurückgegriffen.
  - Gibt übereinstimmende Zeilen mit Dateipfaden und Zeilennummern zurück.
  - Standardmäßig wird die Groß-/Kleinschreibung nicht beachtet.
  - Beachtet .gitignore, .qwenignore und konfigurierte benutzerdefinierte Qwen-Ignore-Dateien.
  - Begrenzt die Ausgabe, um einen Kontextüberlauf zu vermeiden.
- **Ausgabe (`llmContent`):** Ein formatierter String mit Übereinstimmungen, z. B.:

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

### `grep_search`-Beispiele

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

## 7. `edit` (Edit)

`edit` ersetzt Text in einer Datei. Standardmäßig muss `old_string` an genau einer eindeutigen Position übereinstimmen; setzen Sie `replace_all` auf `true`, wenn Sie absichtlich jedes Vorkommen ändern möchten. Dieses Werkzeug ist für präzise, gezielte Änderungen konzipiert und erfordert ausreichend Kontext um `old_string`, um sicherzustellen, dass es die richtige Stelle ändert.

- **Werkzeugname:** `edit`
- **Anzeigename:** Edit
- **Datei:** `edit.ts`
- **Parameter:**
  - `file_path` (string, erforderlich): Der absolute Pfad zur zu ändernden Datei.
  - `old_string` (string, erforderlich): Der exakte literale Text, der ersetzt werden soll.

    **KRITISCH:** Dieser String muss die einzelne zu ändernde Instanz eindeutig identifizieren. Er sollte ausreichend Kontext um den Zieltext herum enthalten und Leerzeichen und Einrückungen genau übernehmen. Wenn `old_string` leer ist, versucht das Werkzeug, eine neue Datei unter `file_path` mit `new_string` als Inhalt zu erstellen.

  - `new_string` (string, erforderlich): Der exakte literale Text, durch den `old_string` ersetzt werden soll.
  - `replace_all` (boolean, optional): Alle Vorkommen von `old_string` ersetzen. Standard ist `false`.

- **Verhalten:**
  - Bearbeitet kein rohes Jupyter-Notebook-JSON. Verwenden Sie für `.ipynb`-Zellenbearbeitungen `notebook_edit`.
  - Wenn `old_string` leer ist und `file_path` nicht existiert, wird eine neue Datei mit `new_string` als Inhalt erstellt.
  - Wenn `old_string` angegeben ist, wird die `file_path` gelesen und es wird versucht, genau ein Vorkommen zu finden, es sei denn, `replace_all` ist `true`.
  - Wenn die Übereinstimmung eindeutig ist (oder `replace_all` `true` ist), wird der Text durch `new_string` ersetzt.
  - **Verbesserte Zuverlässigkeit (mehrstufige Bearbeitungskorrektur):** Um die Erfolgsrate von Bearbeitungen deutlich zu erhöhen, insbesondere wenn der vom Modell bereitgestellte `old_string` möglicherweise nicht perfekt präzise ist, enthält das Werkzeug einen mehrstufigen Bearbeitungskorrekturmechanismus.
    - Wenn der ursprüngliche `old_string` nicht gefunden wird oder mit mehreren Stellen übereinstimmt, kann das Werkzeug das Qwen-Modell nutzen, um `old_string` (und möglicherweise `new_string`) iterativ zu verfeinern.
    - Dieser Selbstkorrekturprozess versucht, das eindeutige Segment zu identifizieren, das das Modell ändern wollte, und macht die `edit`-Operation auch bei leicht unvollkommenem anfänglichem Kontext robuster.
- **Fehlerbedingungen:** Trotz des Korrekturmechanismus schlägt das Werkzeug fehl, wenn:
  - `file_path` nicht absolut ist oder außerhalb des Stammverzeichnisses liegt.
  - `old_string` nicht leer ist, aber `file_path` nicht existiert.
  - `old_string` leer ist, aber `file_path` bereits existiert.
  - `old_string` nach Korrekturversuchen nicht in der Datei gefunden wird.
  - `old_string` mehrfach gefunden wird, `replace_all` `false` ist und der Selbstkorrekturmechanismus dies nicht zu einer einzigen eindeutigen Übereinstimmung auflösen kann.
- **Ausgabe (`llmContent`):**
  - Bei Erfolg: `Successfully modified file: /path/to/file.txt (1 replacements).` oder `Created new file: /path/to/new_file.txt with provided content.`
  - Bei Fehler: Eine Fehlermeldung, die den Grund erklärt (z. B. `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **Bestätigung:** Ja. Zeigt einen Diff der vorgeschlagenen Änderungen an und fordert die Benutzerfreigabe vor dem Schreiben in die Datei an.

## Dateikodierung und plattformspezifisches Verhalten

### Kodierungserkennung und -erhaltung

Beim Lesen von Dateien erkennt Qwen Code die Kodierung der Datei mit einer mehrstufigen Strategie:

1. **UTF-8** — wird zuerst versucht (die meisten modernen Tools geben UTF-8 aus)
2. **chardet** — statistische Erkennung für Nicht-UTF-8-Inhalte
3. **Systemkodierung** — Rückfall auf die OS-Codepage (Windows `chcp` / Unix `LANG`)

Sowohl `write_file` als auch `edit` bewahren die ursprüngliche Kodierung und BOM (Byte Order Mark) vorhandener Dateien. Wenn eine Datei als GBK mit einer UTF-8-BOM gelesen wurde, wird sie auf die gleiche Weise zurückgeschrieben.

### Standardkodierung für neue Dateien konfigurieren

Die Einstellung `defaultFileEncoding` steuert die Kodierung für **neu erstellte** Dateien (nicht für Bearbeitungen vorhandener Dateien):

| Wert        | Verhalten                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| _(nicht gesetzt)_ | UTF-8 ohne BOM, mit automatischen plattformspezifischen Anpassungen (siehe unten)                  |
| `utf-8`     | UTF-8 ohne BOM, keine automatischen Anpassungen                                                      |
| `utf-8-bom` | UTF-8 mit BOM für alle neuen Dateien                                                                 |

Setzen Sie es in `.qwen/settings.json` oder `~/.qwen/settings.json`:

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows: CRLF für Batch-Dateien

Unter Windows werden `.bat`- und `.cmd`-Dateien automatisch mit CRLF (`\r\n`)-Zeilenumbrüchen geschrieben. Dies ist erforderlich, da `cmd.exe` CRLF als Zeilentrennzeichen verwendet – nur LF-Zeilenumbrüche können mehrzeilige `if`/`else`-, `goto`-Labels und `for`-Schleifen beschädigen. Dies gilt unabhängig von den Kodierungseinstellungen und nur unter Windows.

### Windows: UTF-8-BOM für PowerShell-Skripte

Unter Windows mit einer **Nicht-UTF-8-Systemcodepage** (z. B. GBK/cp936, Big5/cp950, Shift_JIS/cp932) werden neu erstellte `.ps1`-Dateien automatisch mit einer UTF-8-BOM geschrieben. Dies ist notwendig, da Windows PowerShell 5.1 (die in Windows 10/11 integrierte Version) BOM-lose Skripte mit der ANSI-Codepage des Systems liest. Ohne BOM werden alle Nicht-ASCII-Zeichen im Skript falsch interpretiert.

Diese automatische BOM gilt nur, wenn:

- Die Plattform Windows ist
- Die Systemcodepage nicht UTF-8 ist (nicht Codepage 65001)
- Die Datei eine neue `.ps1`-Datei ist (vorhandene Dateien behalten ihre ursprüngliche Kodierung)
- Der Benutzer `defaultFileEncoding` **nicht explizit** in den Einstellungen gesetzt hat

PowerShell 7+ (pwsh) verwendet standardmäßig UTF-8 und behandelt BOMs transparent, daher ist die BOM dort harmlos.

Wenn Sie `defaultFileEncoding` explizit auf `"utf-8"` setzen, wird die automatische BOM deaktiviert – dies ist eine bewusste Ausweichmöglichkeit für Repositorys oder Tools, die BOMs ablehnen.

### Zusammenfassung

| Dateityp       | Plattform                      | Automatisches Verhalten                    |
| -------------- | ------------------------------ | ------------------------------------------ |
| `.bat`, `.cmd` | Windows                        | CRLF-Zeilenumbrüche                        |
| `.ps1`         | Windows (Nicht-UTF-8-Codepage) | UTF-8-BOM bei neuen Dateien                |
| Alle anderen   | Alle                           | UTF-8 ohne BOM (Standard)                  |

Diese Dateisystem-Werkzeuge bilden die Grundlage dafür, dass Qwen Code Ihren lokalen Projektkontext verstehen und mit ihm interagieren kann.