# Qwen Code Dateisystem-Tools

Qwen Code bietet eine umfassende Suite von Tools zur Interaktion mit dem lokalen Dateisystem. Diese Tools ermöglichen es dem Modell, Dateien und Verzeichnisse zu lesen, zu schreiben, aufzulisten, zu durchsuchen und zu ändern – stets unter deiner Kontrolle und in der Regel mit Bestätigung für sensible Operationen.

**Hinweis:** Aus Sicherheitsgründen arbeiten alle Dateisystem-Tools innerhalb eines `rootDirectory` (in der Regel das aktuelle Arbeitsverzeichnis, von dem aus du die CLI gestartet hast). Pfade, die du diesen Tools übergibst, sollten in der Regel absolut sein oder werden relativ zu diesem Root-Verzeichnis aufgelöst.

## 1. `list_directory` (ListFiles)

`list_directory` listet die Namen von Dateien und Unterverzeichnissen direkt innerhalb eines angegebenen Verzeichnispfads auf. Optional können Einträge ignoriert werden, die auf angegebene Glob-Patterns passen.

- **Tool name:** `list_directory`
- **Display name:** ListFiles
- **File:** `ls.ts`
- **Parameters:**
  - `path` (string, required): Der absolute Pfad zum aufzulistenden Verzeichnis.
  - `ignore` (array of strings, optional): Eine Liste von Glob-Patterns, die von der Auflistung ausgeschlossen werden sollen (z. B. `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, optional): Gibt an, ob `.gitignore`-Patterns beim Auflisten von Dateien berücksichtigt werden sollen. Standardwert ist `true`.
- **Behavior:**
  - Gibt eine Liste von Datei- und Verzeichnisnamen zurück.
  - Gibt an, ob es sich bei jedem Eintrag um ein Verzeichnis handelt.
  - Sortiert Einträge so, dass Verzeichnisse zuerst erscheinen, gefolgt von alphabetischer Sortierung.
- **Output (`llmContent`):** Ein String wie: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmation:** Nein.

## 2. `read_file` (ReadFile)

`read_file` liest und gibt den Inhalt einer angegebenen Datei zurück. Dieses Tool verarbeitet Textdateien sowie Mediendateien (Bilder, PDFs, Audio, Video), deren Modalität vom aktuellen Modell unterstützt wird. Bei Textdateien können bestimmte Zeilenbereiche gelesen werden. Mediendateien, deren Modalität nicht unterstützt wird, werden mit einer hilfreichen Fehlermeldung abgelehnt. Andere Binärdateitypen werden in der Regel übersprungen.

- **Tool name:** `read_file`
- **Display name:** ReadFile
- **File:** `read-file.ts`
- **Parameters:**
  - `path` (string, required): Der absolute Pfad zur zu lesenden Datei.
  - `offset` (number, optional): Bei Textdateien die 0-basierte Zeilennummer, ab der gelesen werden soll. Erfordert, dass `limit` gesetzt ist.
  - `limit` (number, optional): Bei Textdateien die maximale Anzahl der zu lesenden Zeilen. Falls nicht angegeben, wird ein Standardmaximum (z. B. 2000 Zeilen) oder die gesamte Datei gelesen, sofern möglich.
- **Behavior:**
  - Bei Textdateien: Gibt den Inhalt zurück. Wenn `offset` und `limit` verwendet werden, wird nur dieser Ausschnitt an Zeilen zurückgegeben. Gibt an, ob der Inhalt aufgrund von Zeilen- oder Zeilenlängenlimits gekürzt wurde.
  - Bei Mediendateien (Bilder, PDFs, Audio, Video): Wenn das aktuelle Modell die Modalität der Datei unterstützt, wird der Dateiinhalt als base64-kodiertes `inlineData`-Objekt zurückgegeben. Wenn das Modell die Modalität nicht unterstützt, wird eine Fehlermeldung mit Hinweisen zurückgegeben (z. B. Vorschläge für Skills oder externe Tools).
  - Bei anderen Binärdateien: Versucht, diese zu identifizieren und zu überspringen, und gibt eine Meldung zurück, die darauf hinweist, dass es sich um eine generische Binärdatei handelt.
- **Output:** (`llmContent`):
  - Bei Textdateien: Der Dateiinhalt, optional mit einer Kürzungsmeldung vorangestellt (z. B. `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Bei unterstützten Mediendateien: Ein Objekt, das `inlineData` mit `mimeType` und base64-`data` enthält (z. B. `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Bei nicht unterstützten Mediendateien: Eine Fehlermeldung, die erklärt, dass das aktuelle Modell diese Modalität nicht unterstützt, mit Vorschlägen für Alternativen.
  - Bei anderen Binärdateien: Eine Meldung wie `Cannot display content of binary file: /path/to/data.bin`.
- **Confirmation:** Nein.

## 3. `write_file` (WriteFile)

`write_file` schreibt Inhalt in eine angegebene Datei. Existiert die Datei bereits, wird sie überschrieben. Existiert sie nicht, wird sie (sowie alle erforderlichen übergeordneten Verzeichnisse) erstellt.

- **Tool name:** `write_file`
- **Display name:** WriteFile
- **File:** `write-file.ts`
- **Parameters:**
  - `file_path` (string, required): Der absolute Pfad zur Datei, in die geschrieben werden soll.
  - `content` (string, required): Der Inhalt, der in die Datei geschrieben werden soll.
- **Behavior:**
  - Schreibt den angegebenen `content` in den `file_path`.
  - Erstellt übergeordnete Verzeichnisse, falls diese nicht existieren.
- **Output (`llmContent`):** Eine Erfolgsmeldung, z. B. `Successfully overwrote file: /path/to/your/file.txt` oder `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmation:** Ja. Zeigt einen Diff der Änderungen an und fragt vor dem Schreiben nach der Bestätigung des Nutzers.

## 4. `glob` (Glob)

`glob` findet Dateien, die auf bestimmte Glob-Patterns passen (z. B. `src/**/*.ts`, `*.md`), und gibt absolute Pfade zurück, sortiert nach Änderungszeitpunkt (neueste zuerst).

- **Tool name:** `glob`
- **Display name:** Glob
- **File:** `glob.ts`
- **Parameters:**
  - `pattern` (string, required): Das Glob-Pattern, das abgeglichen werden soll (z. B. `"*.py"`, `"src/**/*.js"`).
  - `path` (string, optional): Das Verzeichnis, in dem gesucht werden soll. Falls nicht angegeben, wird das aktuelle Arbeitsverzeichnis verwendet.
- **Behavior:**
  - Sucht nach Dateien, die auf das Glob-Pattern innerhalb des angegebenen Verzeichnisses passen.
  - Gibt eine Liste absoluter Pfade zurück, sortiert nach den zuletzt geänderten Dateien.
  - Berücksichtigt standardmäßig `.gitignore`- und `.qwenignore`-Patterns.
  - Begrenzt die Ergebnisse auf 100 Dateien, um einen Kontextüberlauf zu verhindern.
- **Output (`llmContent`):** Eine Meldung wie: `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **Confirmation:** Nein.

## 5. `grep_search` (Grep)

`grep_search` sucht nach einem regulären Ausdruck im Inhalt von Dateien in einem angegebenen Verzeichnis. Dateien können optional über ein Glob-Pattern gefiltert werden. Gibt die Zeilen mit Treffern sowie deren Dateipfade und Zeilennummern zurück.

- **Tool name:** `grep_search`
- **Display name:** Grep
- **File:** `grep.ts` (mit `ripGrep.ts` als Fallback)
- **Parameters:**
  - `pattern` (string, required): Das reguläre Ausdrucksmuster, das im Dateiinhalt gesucht werden soll (z. B. `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, optional): Datei oder Verzeichnis, in dem gesucht werden soll. Standardwert ist das aktuelle Arbeitsverzeichnis.
  - `glob` (string, optional): Glob-Pattern zum Filtern von Dateien (z. B. `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (number, optional): Begrenzt die Ausgabe auf die ersten N passenden Zeilen. Optional – zeigt alle Treffer an, wenn nicht angegeben.
- **Behavior:**
  - Verwendet bei Verfügbarkeit ripgrep für eine schnelle Suche; andernfalls wird auf eine JavaScript-basierte Suchimplementierung zurückgegriffen.
  - Gibt passende Zeilen mit Dateipfaden und Zeilennummern zurück.
  - Ignoriert standardmäßig die Groß-/Kleinschreibung.
  - Berücksichtigt `.gitignore`- und `.qwenignore`-Patterns.
  - Begrenzt die Ausgabe, um einen Kontextüberlauf zu verhindern.
- **Output (`llmContent`):** Ein formatierter String mit Treffern, z. B.:

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

### `grep_search` examples

Suche nach einem Pattern mit standardmäßiger Ergebnisbegrenzung:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Suche nach einem Pattern mit benutzerdefinierter Ergebnisbegrenzung:

```
grep_search(pattern="function", path="src", limit=50)
```

Suche nach einem Pattern mit Dateifilterung und benutzerdefinierter Ergebnisbegrenzung:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (Edit)

`edit` ersetzt Text innerhalb einer Datei. Standardmäßig muss `old_string` genau einer eindeutigen Stelle entsprechen; setze `replace_all` auf `true`, wenn du absichtlich jedes Vorkommen ändern möchtest. Dieses Tool ist für präzise, gezielte Änderungen konzipiert und erfordert ausreichend Kontext um den `old_string`, um sicherzustellen, dass die richtige Stelle geändert wird.

- **Tool name:** `edit`
- **Display name:** Edit
- **File:** `edit.ts`
- **Parameters:**
  - `file_path` (string, required): Der absolute Pfad zur zu ändernden Datei.
  - `old_string` (string, required): Der exakte Literaltext, der ersetzt werden soll.

    **KRITISCH:** Dieser String muss die einzelne zu ändernde Instanz eindeutig identifizieren. Er sollte ausreichend Kontext um den Zieltext enthalten und Whitespace sowie Einrückungen exakt abbilden. Ist `old_string` leer, versucht das Tool, eine neue Datei unter `file_path` mit `new_string` als Inhalt zu erstellen.

  - `new_string` (string, required): Der exakte Literaltext, durch den `old_string` ersetzt werden soll.
  - `replace_all` (boolean, optional): Ersetzt alle Vorkommen von `old_string`. Standardwert ist `false`.

- **Behavior:**
  - Wenn `old_string` leer ist und `file_path` nicht existiert, wird eine neue Datei mit `new_string` als Inhalt erstellt.
  - Wenn `old_string` angegeben ist, liest das Tool den `file_path` und versucht, genau ein Vorkommen zu finden, es sei denn, `replace_all` ist `true`.
  - Wenn der Treffer eindeutig ist (oder `replace_all` `true` ist), wird der Text durch `new_string` ersetzt.
  - **Erhöhte Zuverlässigkeit (Mehrstufige Edit-Korrektur):** Um die Erfolgsrate von Edits deutlich zu verbessern, insbesondere wenn der vom Modell bereitgestellte `old_string` nicht ganz präzise ist, integriert das Tool einen mehrstufigen Korrekturmechanismus.
    - Falls der ursprüngliche `old_string` nicht gefunden wird oder auf mehrere Stellen passt, kann das Tool das Qwen-Modell nutzen, um `old_string` (und ggf. `new_string`) iterativ zu verfeinern.
    - Dieser Selbstkorrekturprozess versucht, das eindeutige Segment zu identifizieren, das das Modell ändern wollte, wodurch der `edit`-Vorgang auch bei leicht unvollständigem Ausgangskontext robuster wird.
- **Failure conditions:** Trotz des Korrekturmechanismus schlägt das Tool fehl, wenn:
  - `file_path` nicht absolut ist oder außerhalb des Root-Verzeichnisses liegt.
  - `old_string` nicht leer ist, aber `file_path` nicht existiert.
  - `old_string` leer ist, aber `file_path` bereits existiert.
  - `old_string` in der Datei auch nach Korrekturversuchen nicht gefunden wird.
  - `old_string` mehrfach gefunden wird, `replace_all` `false` ist und der Selbstkorrekturmechanismus ihn nicht auf eine einzige, eindeutige Stelle eingrenzen kann.
- **Output (`llmContent`):**
  - Bei Erfolg: `Successfully modified file: /path/to/file.txt (1 replacements).` oder `Created new file: /path/to/new_file.txt with provided content.`
  - Bei Fehler: Eine Fehlermeldung, die den Grund erklärt (z. B. `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **Confirmation:** Ja. Zeigt einen Diff der vorgeschlagenen Änderungen an und fragt vor dem Schreiben in die Datei nach der Bestätigung des Nutzers.

## Dateikodierung und plattformspezifisches Verhalten

### Erkennung und Beibehaltung der Kodierung

Beim Lesen von Dateien erkennt Qwen Code die Kodierung mithilfe einer mehrstufigen Strategie:

1. **UTF-8** — wird zuerst versucht (die meisten modernen Tools geben UTF-8 aus)
2. **chardet** — statistische Erkennung für Nicht-UTF-8-Inhalte
3. **Systemkodierung** — Fallback auf die OS-Codepage (Windows `chcp` / Unix `LANG`)

Sowohl `write_file` als auch `edit` bewahren die ursprüngliche Kodierung und BOM (Byte Order Mark) bestehender Dateien. Wurde eine Datei als GBK mit UTF-8-BOM gelesen, wird sie auf dieselbe Weise zurückgeschrieben.

### Standardkodierung für neue Dateien konfigurieren

Die Einstellung `defaultFileEncoding` steuert die Kodierung für **neu erstellte** Dateien (nicht für Edits an bestehenden Dateien):

| Wert        | Verhalten                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| _(nicht gesetzt)_ | UTF-8 ohne BOM, mit automatischen plattformspezifischen Anpassungen (siehe unten) |
| `utf-8`     | UTF-8 ohne BOM, keine automatischen Anpassungen                           |
| `utf-8-bom` | UTF-8 mit BOM für alle neuen Dateien                                      |

Konfiguriere sie in `.qwen/settings.json` oder `~/.qwen/settings.json`:

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows: CRLF für Batch-Dateien

Unter Windows werden `.bat`- und `.cmd`-Dateien automatisch mit CRLF-Zeilenenden (`\r\n`) geschrieben. Dies ist erforderlich, da `cmd.exe` CRLF als Zeilentrennzeichen verwendet – reine LF-Enden können mehrzeilige `if`/`else`-Blöcke, `goto`-Labels und `for`-Schleifen unterbrechen. Dies gilt unabhängig von den Kodierungseinstellungen und ausschließlich unter Windows.

### Windows: UTF-8-BOM für PowerShell-Skripte

Unter Windows mit einer **Nicht-UTF-8-Systemcodepage** (z. B. GBK/cp936, Big5/cp950, Shift_JIS/cp932) werden neu erstellte `.ps1`-Dateien automatisch mit einem UTF-8-BOM geschrieben. Dies ist notwendig, da Windows PowerShell 5.1 (die in Windows 10/11 integrierte Version) Skripte ohne BOM mithilfe der ANSI-Codepage des Systems liest. Ohne BOM werden alle Nicht-ASCII-Zeichen im Skript falsch interpretiert.

Dieses automatische BOM gilt nur, wenn:

- Die Plattform Windows ist
- Die Systemcodepage nicht UTF-8 ist (nicht Codepage 65001)
- Es sich um eine neue `.ps1`-Datei handelt (bestehende Dateien behalten ihre ursprüngliche Kodierung)
- Der Nutzer `defaultFileEncoding` in den Einstellungen **nicht** explizit festgelegt hat

PowerShell 7+ (pwsh) verwendet standardmäßig UTF-8 und verarbeitet BOM transparent, sodass das BOM dort unproblematisch ist.

Wenn du `defaultFileEncoding` explizit auf `"utf-8"` setzt, wird das automatische BOM deaktiviert – dies ist eine bewusste Umgehungsmöglichkeit für Repositories oder Tooling, die BOMs ablehnen.

### Zusammenfassung

| Dateityp       | Plattform                     | Automatisches Verhalten     |
| -------------- | ----------------------------- | --------------------------- |
| `.bat`, `.cmd` | Windows                       | CRLF-Zeilenenden            |
| `.ps1`         | Windows (Nicht-UTF-8-Codepage)| UTF-8-BOM bei neuen Dateien |
| Alle anderen   | Alle                          | UTF-8 ohne BOM (Standard)   |

Diese Dateisystem-Tools bilden die Grundlage dafür, dass Qwen Code deinen lokalen Projektkontext versteht und mit ihm interagieren kann.