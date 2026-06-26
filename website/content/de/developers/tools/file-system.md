# Qwen Code Dateisystem-Werkzeuge

Qwen Code bietet eine umfassende Sammlung von Werkzeugen für die Interaktion mit dem lokalen Dateisystem. Diese Werkzeuge ermöglichen es dem Modell, Dateien und Verzeichnisse zu lesen, zu schreiben, aufzulisten, zu durchsuchen und zu ändern – alles unter Ihrer Kontrolle und in der Regel mit Bestätigung bei sensiblen Operationen.

> [!Note]
> Alle Dateisystem-Werkzeuge arbeiten aus Sicherheitsgründen innerhalb eines `rootDirectory` (üblicherweise das aktuelle Arbeitsverzeichnis, in dem Sie die CLI gestartet haben). Pfade, die Sie diesen Werkzeugen übergeben, werden in der Regel als absolute Pfade erwartet oder relativ zu diesem rootDirectory aufgelöst.

## 1. `list_directory` (ListFiles)

`list_directory` listet die Namen von Dateien und Unterverzeichnissen direkt innerhalb eines angegebenen Verzeichnispfads auf. Es kann optional Einträge ignorieren, die auf angegebene Glob-Muster passen.

- **Werkzeugname:** `list_directory`
- **Anzeigename:** ListFiles
- **Datei:** `ls.ts`
- **Parameter:**
  - `path` (string, erforderlich): Der absolute Pfad zum aufzulistenden Verzeichnis.
  - `ignore` (Array von Zeichenketten, optional): Eine Liste von Glob-Mustern, die von der Auflistung ausgeschlossen werden sollen (z.B. `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, optional): Gibt an, ob `.gitignore`-Muster beim Auflisten von Dateien beachtet werden sollen. Standardwert ist `true`.
- **Verhalten:**
  - Gibt eine Liste von Datei- und Verzeichnisnamen zurück.
  - Gibt an, ob jeder Eintrag ein Verzeichnis ist.
  - Sortiert Einträge zuerst nach Verzeichnissen, dann alphabetisch.
- **Ausgabe (`llmContent`):** Ein String wie: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Bestätigung:** Nein.

## 2. `read_file` (ReadFile)

`read_file` liest den Inhalt einer angegebenen Datei und gibt ihn zurück. Dieses Werkzeug verarbeitet Textdateien und Mediendateien (Bilder, PDFs, Audio, Video), deren Modalität vom aktuellen Modell unterstützt wird. Bei Textdateien können bestimmte Zeilenbereiche gelesen werden. Mediendateien, deren Modalität vom aktuellen Modell nicht unterstützt wird, werden mit einer hilfreichen Fehlermeldung abgelehnt. Andere Binärdateitypen werden in der Regel übersprungen.

- **Werkzeugname:** `read_file`
- **Anzeigename:** ReadFile
- **Datei:** `read-file.ts`
- **Parameter:**
  - `path` (string, erforderlich): Der absolute Pfad zur zu lesenden Datei.
  - `offset` (number, optional): Bei Textdateien die 0-basierte Zeilennummer, ab der gelesen werden soll. Erfordert, dass `limit` gesetzt ist.
  - `limit` (number, optional): Bei Textdateien die maximale Anzahl zu lesender Zeilen. Wenn nicht angegeben, wird ein Standardmaximum (z.B. 2000 Zeilen) oder die gesamte Datei gelesen, falls möglich.
- **Verhalten:**
  - Bei Textdateien: Gibt den Inhalt zurück. Wenn `offset` und `limit` verwendet werden, wird nur dieser Zeilenabschnitt zurückgegeben. Gibt an, ob der Inhalt aufgrund von Zeilenlimits oder Zeilenlängenbeschränkungen abgeschnitten wurde.
  - Bei Mediendateien (Bilder, PDFs, Audio, Video): Wenn das aktuelle Modell die Modalität der Datei unterstützt, wird der Dateiinhalt als base64-kodiertes `inlineData`-Objekt zurückgegeben. Wenn das Modell die Modalität nicht unterstützt, wird eine Fehlermeldung mit Hilfestellung zurückgegeben (z.B. Vorschlag für Skills oder externe Werkzeuge).
  - Bei anderen Binärdateien: Versucht, sie zu identifizieren und zu überspringen, und gibt eine Meldung zurück, die angibt, dass es sich um eine allgemeine Binärdatei handelt.
- **Ausgabe (`llmContent`):**
  - Bei Textdateien: Der Dateiinhalt, möglicherweise vorangestellt durch eine Kürzungsmeldung (z.B. `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Bei unterstützten Mediendateien: Ein Objekt, das `inlineData` mit `mimeType` und base64-`data` enthält (z.B. `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Bei nicht unterstützten Mediendateien: Eine Fehlermeldung, die erklärt, dass das aktuelle Modell diese Modalität nicht unterstützt, mit Vorschlägen für Alternativen.
  - Bei anderen Binärdateien: Eine Meldung wie `Cannot display content of binary file: /path/to/data.bin`.
- **Bestätigung:** Nein.

### Jupyter notebook reads

Für Jupyter-Notebooks (`.ipynb`) analysiert `read_file` das Notebook-JSON und gibt eine strukturierte, modelllesbare Notebook-Ansicht anstelle des rohen JSON zurück. Die gerenderte Ausgabe enthält die Notebook-Sprache, geordnete Zellen, Zellen-IDs, Quelle und zusammengefasste Ausgaben.

Notebook-Zellen können dann mit `notebook_edit` bearbeitet werden. Das Modell sollte die von `read_file` angezeigten Zellen-IDs verwenden, wenn es eine Zelle anspricht.

`offset` und `limit` werden für `.ipynb`-Dateien nicht unterstützt. Notebook-Lesevorgänge werden als strukturierte vollständige Dateilesungen behandelt; wenn die gerenderte Notebook-Ausgabe intern abgeschnitten wird, weil sie zu groß ist, wird `notebook_edit` Zellenebenen-Bearbeitungen ablehnen und Sie bitten, die Ausgaben zu reduzieren oder das Notebook vor der Bearbeitung aufzuteilen.

## 3. `notebook_edit` (NotebookEdit)

`notebook_edit` bearbeitet Jupyter-Notebook-Dateien (`.ipynb`) sicher auf Zellenebene. Verwenden Sie es anstelle von `edit` oder `write_file`, wenn Sie Notebook-Zellen ändern.

- **Werkzeugname:** `notebook_edit`
- **Anzeigename:** NotebookEdit
- **Datei:** `notebook-edit.ts`
- **Parameter:**
  - `notebook_path` (string, erforderlich): Der absolute Pfad zur `.ipynb`-Datei.
  - `cell_id` (string, optional): Die Ziel-Zellen-ID, die von `read_file` angezeigt wird. Erforderlich für `replace` und `delete`. Bei `insert` wird die neue Zelle nach dieser Zelle eingefügt; wenn nicht angegeben, wird die neue Zelle am Anfang eingefügt.
  - `new_source` (string, optional): Die neue Zellenquelle für `replace` und `insert`. Nicht erforderlich für `delete`.
  - `cell_type` (`code` oder `markdown`, optional): Der Zellentyp für eingefügte Zellen oder der Zieltyp beim Ersetzen einer Zelle.
  - `edit_mode` (`replace`, `insert` oder `delete`, optional): Die Bearbeitungsoperation. Standardwert ist `replace`.
- **Verhalten:**
  - Erfordert, dass das Notebook zuerst mit `read_file` in der aktuellen Sitzung gelesen wurde.
  - Zielzellen werden anhand der von `read_file` gerenderten IDs identifiziert, einschließlich echter Notebook-Zellen-IDs und angezeigter `cell-N`-Fallback-IDs.
  - Lehnt mehrdeutige gerenderte Zellen-IDs ab, anstatt zu raten.
  - Bei Code-Zellen werden veraltete Ausgaben gelöscht und `execution_count` zurückgesetzt, wenn sich die Quelle ändert.
  - Bewahrt die Notebook-JSON-Formatierung, Zeilenenden, Kodierung und BOM nach Möglichkeit.
  - Macht den vorherigen Lesevorgang ungültig, wenn sich die angezeigten Fallback-IDs durch strukturelle Änderungen verschieben können, sodass die nächste Notebook-Bearbeitung ein erneutes `read_file` erfordert.
- **Ausgabe (`llmContent`):** Eine Erfolgsmeldung, die die bearbeitete Notebook-Zelle beschreibt, und bei Nicht-Lösch-Operationen die aktualisierte Quelle.
- **Bestätigung:** Ja. Zeigt einen Notebook-JSON-Diff und fordert die Benutzerbestätigung vor dem Schreiben an, es sei denn, der aktuelle Berechtigungsmodus oder Regeln genehmigen Bearbeitungswerkzeuge automatisch.
### `notebook_edit` Beispiele

Eine Code-Zelle ersetzen:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  cell_id="load-data",
  new_source="result = 41 + 1\nprint(result)"
)
```

Eine Markdown-Zelle nach einer bestehenden Zelle einfügen:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="insert",
  cell_id="summary",
  cell_type="markdown",
  new_source="## Findings\n\nThe cleaned data is ready for modeling."
)
```

Eine Zelle löschen:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="delete",
  cell_id="old-experiment"
)
```

## 4. `write_file` (WriteFile)

`write_file` schreibt Inhalt in eine angegebene Datei. Wenn die Datei existiert, wird sie überschrieben. Wenn die Datei nicht existiert, wird sie (sowie alle erforderlichen übergeordneten Verzeichnisse) erstellt.

- **Tool name:** `write_file`
- **Display name:** WriteFile
- **File:** `write-file.ts`
- **Parameters:**
  - `file_path` (string, required): Der absolute Pfad zu der Datei, in die geschrieben werden soll.
  - `content` (string, required): Der Inhalt, der in die Datei geschrieben werden soll.
- **Behavior:**
  - Schreibt den angegebenen `content` in die `file_path`.
  - Schreibt kein rohes Jupyter-Notebook-JSON. Verwenden Sie `notebook_edit` für Zellenbearbeitungen in `.ipynb`.
  - Erstellt übergeordnete Verzeichnisse, falls sie nicht existieren.
- **Output (`llmContent`):** Eine Erfolgsmeldung, z. B. `Successfully overwrote file: /path/to/your/file.txt` oder `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmation:** Ja. Zeigt einen Diff der Änderungen an und fragt vor dem Schreiben nach Benutzerzustimmung.

## 5. `glob` (Glob)

`glob` findet Dateien, die bestimmte Glob-Muster (z. B. `src/**/*.ts`, `*.md`) erfüllen, und gibt absolute Pfade sortiert nach Änderungszeit (neueste zuerst) zurück.

- **Tool name:** `glob`
- **Display name:** Glob
- **File:** `glob.ts`
- **Parameters:**
  - `pattern` (string, required): Das Glob-Muster, nach dem gesucht werden soll (z. B. `"*.py"`, `"src/**/*.js"`).
  - `path` (string, optional): Das zu durchsuchende Verzeichnis. Wenn nicht angegeben, wird das aktuelle Arbeitsverzeichnis verwendet.
- **Behavior:**
  - Durchsucht das angegebene Verzeichnis nach Dateien, die dem Glob-Muster entsprechen.
  - Gibt eine Liste absoluter Pfade zurück, sortiert mit den zuletzt geänderten Dateien zuerst.
  - Beachtet standardmäßig .gitignore, .qwenignore und konfigurierte benutzerdefinierte Qwen-Ignore-Dateien.
  - Begrenzt die Ergebnisse auf 100 Dateien, um Kontextüberlauf zu vermeiden.
- **Output (`llmContent`):** Eine Meldung wie: `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **Confirmation:** Nein.

## 6. `grep_search` (Grep)

`grep_search` sucht nach einem regulären Ausdrucksmuster im Inhalt von Dateien in einem angegebenen Verzeichnis. Kann Dateien nach einem Glob-Muster filtern. Gibt die Zeilen mit Treffern sowie deren Dateipfade und Zeilennummern zurück.

- **Tool name:** `grep_search`
- **Display name:** Grep
- **File:** `grep.ts` (mit `ripGrep.ts` als Fallback)
- **Parameters:**
  - `pattern` (string, required): Das reguläre Ausdrucksmuster, nach dem im Dateiinhalt gesucht werden soll (z. B. `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, optional): Datei oder Verzeichnis, in dem gesucht werden soll. Standardmäßig das aktuelle Arbeitsverzeichnis.
  - `glob` (string, optional): Glob-Muster zum Filtern von Dateien (z. B. `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (integer, optional): Begrenzt die Ausgabe auf die ersten N übereinstimmenden Zeilen. Muss eine positive Ganzzahl sein. Optional – zeigt alle Treffer, wenn nicht angegeben.
- **Behavior:**
  - Verwendet ripgrep für schnelle Suche, falls verfügbar; andernfalls wird auf eine JavaScript-basierte Suchimplementierung zurückgegriffen.
  - Gibt übereinstimmende Zeilen mit Dateipfaden und Zeilennummern zurück.
  - Standardmäßig wird die Groß-/Kleinschreibung nicht beachtet.
  - Beachtet .gitignore, .qwenignore und konfigurierte benutzerdefinierte Qwen-Ignore-Dateien.
  - Begrenzt die Ausgabe, um Kontextüberlauf zu vermeiden.
- **Output (`llmContent`):** Eine formatierte Zeichenkette der Treffer, z. B.:

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lines truncated] ...
  ```

- **Confirmation:** Nein.

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

## 7. `edit` (Edit)

`edit` ersetzt Text in einer Datei. Standardmäßig muss `old_string` mit einer einzigen eindeutigen Stelle übereinstimmen; setzen Sie `replace_all` auf `true`, wenn Sie absichtlich jedes Vorkommen ändern möchten. Dieses Tool ist für präzise, gezielte Änderungen konzipiert und erfordert einen signifikanten Kontext um den `old_string`, um sicherzustellen, dass es die richtige Stelle ändert.

- **Tool name:** `edit`
- **Display name:** Edit
- **File:** `edit.ts`
- **Parameters:**
**KRITISCH:** Dieser String muss die einzelne zu ändernde Instanz eindeutig identifizieren. Er sollte ausreichend Kontext um den Zieltext enthalten und Leerzeichen und Einrückungen exakt übernehmen. Wenn `old_string` leer ist, versucht das Tool, eine neue Datei unter `file_path` mit `new_string` als Inhalt zu erstellen.

- `new_string` (String, erforderlich): Der genaue Literaltext, der `old_string` ersetzen soll.
- `replace_all` (Boolean, optional): Ersetzt alle Vorkommen von `old_string`. Standardwert `false`.

- **Verhalten:**
  - Bearbeitet kein rohes Jupyter-Notebook-JSON. Verwenden Sie `notebook_edit` für `.ipynb`-Zellenbearbeitungen.
  - Wenn `old_string` leer ist und `file_path` nicht existiert, wird eine neue Datei mit `new_string` als Inhalt erstellt.
  - Wenn `old_string` angegeben wird, wird `file_path` gelesen und es wird versucht, genau ein Vorkommen zu finden, es sei denn, `replace_all` ist `true`.
  - Wenn der Treffer eindeutig ist (oder `replace_all` `true` ist), wird der Text durch `new_string` ersetzt.
  - **Verbesserte Zuverlässigkeit (mehrstufige Bearbeitungskorrektur):** Um die Erfolgsrate von Bearbeitungen deutlich zu erhöhen – insbesondere wenn der vom Modell gelieferte `old_string` nicht perfekt präzise ist – integriert das Tool einen mehrstufigen Korrekturmechanismus für Bearbeitungen.
    - Wenn der anfängliche `old_string` nicht gefunden wird oder an mehreren Stellen übereinstimmt, kann das Tool das Qwen-Modell nutzen, um `old_string` (und ggf. `new_string`) iterativ zu verfeinern.
    - Dieser Selbstkorrekturprozess versucht, das eindeutige Segment zu identifizieren, das das Modell ändern wollte, und macht die `edit`-Operation robuster, selbst wenn der anfängliche Kontext leicht ungenau ist.
- **Fehlerbedingungen:** Trotz des Korrekturmechanismus schlägt das Tool fehl, wenn:
  - `file_path` nicht absolut ist oder außerhalb des Stammverzeichnisses liegt.
  - `old_string` nicht leer ist, aber `file_path` nicht existiert.
  - `old_string` leer ist, aber `file_path` bereits existiert.
  - `old_string` in der Datei nach Korrekturversuchen nicht gefunden wird.
  - `old_string` mehrfach gefunden wird, `replace_all` `false` ist und der Selbstkorrekturmechanismus es nicht auf einen einzigen, eindeutigen Treffer reduzieren kann.
- **Ausgabe (`llmContent`):**
  - Bei Erfolg: `Successfully modified file: /path/to/file.txt (1 replacements).` oder `Created new file: /path/to/new_file.txt with provided content.`
  - Bei Fehler: Eine Fehlermeldung, die den Grund erklärt (z. B. `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **Bestätigung:** Ja. Zeigt einen Diff der vorgeschlagenen Änderungen an und bittet den Benutzer um Genehmigung, bevor in die Datei geschrieben wird.

## Dateikodierung und plattformspezifisches Verhalten

### Kodierungserkennung und -erhaltung

Beim Lesen von Dateien erkennt Qwen Code die Kodierung der Datei mit einer mehrstufigen Strategie:

1. **UTF-8** – wird zuerst versucht (die meisten modernen Tools geben UTF-8 aus)
2. **chardet** – statistische Erkennung für Nicht-UTF-8-Inhalte
3. **Systemkodierung** – Fallback auf die Betriebssystem-Codepage (Windows `chcp` / Unix `LANG`)

Sowohl `write_file` als auch `edit` erhalten die ursprüngliche Kodierung und BOM (Byte Order Mark) vorhandener Dateien. Wenn eine Datei als GBK mit UTF-8-BOM gelesen wurde, wird sie auf dieselbe Weise zurückgeschrieben.

### Standardkodierung für neue Dateien konfigurieren

Die Einstellung `defaultFileEncoding` steuert die Kodierung für **neu erstellte** Dateien (nicht für Bearbeitungen vorhandener Dateien):

| Wert        | Verhalten                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------- |
| _(nicht gesetzt)_ | UTF-8 ohne BOM, mit automatischen plattformspezifischen Anpassungen (siehe unten)                 |
| `utf-8`     | UTF-8 ohne BOM, ohne automatische Anpassungen                                                     |
| `utf-8-bom` | UTF-8 mit BOM für alle neuen Dateien                                                              |

Setzen Sie es in `.qwen/settings.json` oder `~/.qwen/settings.json`:

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows: CRLF für Batch-Dateien

Unter Windows werden `.bat`- und `.cmd`-Dateien automatisch mit CRLF-Zeilenumbrüchen (`\r\n`) geschrieben. Dies ist erforderlich, da `cmd.exe` CRLF als Zeilentrenner verwendet – nur mit LF können mehrzeilige `if`/`else`-, `goto`-Labels und `for`-Schleifen beschädigt werden. Dies gilt unabhängig von den Kodierungseinstellungen und nur unter Windows.

### Windows: UTF-8-BOM für PowerShell-Skripte

Unter Windows mit einer **Nicht-UTF-8-Systemcodepage** (z. B. GBK/cp936, Big5/cp950, Shift_JIS/cp932) werden neu erstellte `.ps1`-Dateien automatisch mit einer UTF-8-BOM geschrieben. Dies ist notwendig, da Windows PowerShell 5.1 (die in Windows 10/11 integrierte Version) BOM-lose Skripte mit der ANSI-Codepage des Systems liest. Ohne BOM werden alle Nicht-ASCII-Zeichen im Skript falsch interpretiert.

Diese automatische BOM gilt nur, wenn:

- Die Plattform Windows ist
- Die Systemcodepage nicht UTF-8 ist (nicht Codepage 65001)
- Es sich um eine neue `.ps1`-Datei handelt (vorhandene Dateien behalten ihre ursprüngliche Kodierung)
- Der Benutzer `defaultFileEncoding` in den Einstellungen **nicht** explizit gesetzt hat

PowerShell 7+ (pwsh) verwendet standardmäßig UTF-8 und behandelt BOM transparent, sodass die BOM dort harmlos ist.
Wenn Sie explizit `defaultFileEncoding` auf `"utf-8"` setzen, wird das automatische BOM deaktiviert – dies ist eine bewusste Ausweichmöglichkeit für Repositories oder Tools, die BOMs ablehnen.

### Zusammenfassung

| Dateityp      | Plattform                      | Automatisches Verhalten          |
| ------------- | ------------------------------ | -------------------------------- |
| `.bat`, `.cmd`| Windows                        | CRLF-Zeilenumbrüche              |
| `.ps1`        | Windows (Nicht-UTF-8-Codepage) | UTF-8-BOM bei neuen Dateien      |
| Alle anderen  | Alle                           | UTF-8 ohne BOM (Standard)        |

Diese Dateisystemwerkzeuge bilden die Grundlage für Qwen Code, um Ihren lokalen Projektkontext zu verstehen und mit ihm zu interagieren.
