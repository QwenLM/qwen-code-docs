# Qwen-Code-Dateisystemtools

Qwen Code bietet eine umfassende Sammlung von Tools zum Arbeiten mit dem lokalen Dateisystem. Mit diesen Tools kann das Modell Dateien und Verzeichnisse lesen, schreiben, auflisten, durchsuchen und ändern – stets unter Ihrer Kontrolle und in der Regel mit einer Bestätigung für sensible Operationen.

**Hinweis:** Alle Dateisystemtools arbeiten innerhalb eines `rootDirectory` (üblicherweise das aktuelle Arbeitsverzeichnis, aus dem Sie die CLI gestartet haben) aus Sicherheitsgründen. Die Pfade, die Sie diesen Tools übergeben, sollten im Allgemeinen absolut sein oder werden relativ zu diesem Stammverzeichnis aufgelöst.

## 1. `list_directory` (ListFiles)

`list_directory` listet die Namen von Dateien und Unterverzeichnissen auf, die sich direkt im angegebenen Verzeichnispfad befinden. Optional können Einträge ignoriert werden, die bestimmten Glob-Mustern entsprechen.

- **Werkzeugname:** `list_directory`
- **Anzeigename:** ListFiles
- **Datei:** `ls.ts`
- **Parameter:**
  - `path` (Zeichenkette, erforderlich): Der absolute Pfad zum Verzeichnis, dessen Inhalte aufgelistet werden sollen.
  - `ignore` (Array von Zeichenketten, optional): Eine Liste von Glob-Mustern, die bei der Auflistung ausgeschlossen werden sollen (z. B. `["*.log", ".git"]`).
  - `respect_git_ignore` (boolesch, optional): Gibt an, ob beim Auflisten von Dateien Muster aus `.gitignore` berücksichtigt werden sollen. Standardwert ist `true`.
- **Verhalten:**
  - Gibt eine Liste mit Datei- und Verzeichnisnamen zurück.
  - Kennzeichnet, ob jeder Eintrag ein Verzeichnis ist.
  - Sortiert die Einträge so, dass Verzeichnisse zuerst erscheinen, danach alphabetisch.
- **Ausgabe (`llmContent`):** Eine Zeichenkette wie z. B.: `Verzeichnisinhalt für /pfad/zu/ihrem/ordner:\n[DIR] unterordner1\ndatei1.txt\ndatei2.png`
- **Bestätigung:** Nein

## 2. `read_file` (Datei lesen)

`read_file` liest den Inhalt einer angegebenen Datei und gibt ihn zurück. Dieses Tool verarbeitet Textdateien sowie Mediendateien (Bilder, PDFs, Audio-, Videodateien), deren Modus vom aktuellen Modell unterstützt wird. Bei Textdateien kann es bestimmte Zeilenbereiche lesen. Mediendateien, deren Modus vom aktuellen Modell nicht unterstützt wird, werden mit einer hilfreichen Fehlermeldung abgelehnt. Andere binäre Dateitypen werden im Allgemeinen übersprungen.

- **Werkzeugname:** `read_file`
- **Anzeigename:** Datei lesen
- **Datei:** `read-file.ts`
- **Parameter:**
  - `path` (Zeichenkette, erforderlich): Der absolute Pfad zur zu lesenden Datei.
  - `offset` (Zahl, optional): Bei Textdateien die nullbasierte Zeilennummer, ab der gelesen werden soll. Erfordert, dass `limit` festgelegt ist.
  - `limit` (Zahl, optional): Bei Textdateien die maximale Anzahl an Zeilen, die gelesen werden sollen. Wird `limit` weggelassen, wird eine standardmäßige Höchstanzahl (z. B. 2000 Zeilen) oder – falls machbar – die gesamte Datei gelesen.
- **Verhalten:**
  - Bei Textdateien: Gibt den Inhalt zurück. Werden `offset` und `limit` verwendet, wird nur dieser Zeilenabschnitt zurückgegeben. Gibt an, ob der Inhalt aufgrund von Zeilenbegrenzungen oder Zeilenlängenbegrenzungen gekürzt wurde.
  - Bei Mediendateien (Bilder, PDFs, Audio-, Videodateien): Falls der aktuelle Modellmodus das Dateiformat unterstützt, wird der Dateiinhalt als base64-kodiertes `inlineData`-Objekt zurückgegeben. Falls der Modus nicht unterstützt wird, wird eine Fehlermeldung mit Hilfestellung zurückgegeben (z. B. Vorschläge für Skills oder externe Tools).
  - Bei anderen binären Dateitypen: Versucht, diese zu identifizieren und zu überspringen, und gibt eine Nachricht aus, die darauf hinweist, dass es sich um eine generische Binärdatei handelt.
- **Ausgabe:** (`llmContent`):
  - Bei Textdateien: Der Dateiinhalt, ggf. mit einer Kürzungsmeldung am Anfang (z. B. `[Dateiinhalt gekürzt: Zeilen 1–100 von insgesamt 500 Zeilen angezeigt…]\nTatsächlicher Dateiinhalt…`).
  - Bei unterstützten Mediendateien: Ein Objekt mit `inlineData`, das `mimeType` und base64-kodiertes `data` enthält (z. B. `{ inlineData: { mimeType: 'image/png', data: 'base64codierterstring' } }`).
  - Bei nicht unterstützten Mediendateien: Eine Fehlermeldungszeichenkette, die erklärt, dass der aktuelle Modellmodus diesen Typ nicht unterstützt, inklusive Vorschlägen für Alternativen.
  - Bei anderen binären Dateien: Eine Meldung wie `Inhalt der Binärdatei kann nicht angezeigt werden: /pfad/zur/data.bin`.
- **Bestätigung:** Nein.

## 3. `write_file` (Datei schreiben)

Mit `write_file` wird Inhalt in eine angegebene Datei geschrieben. Falls die Datei bereits existiert, wird sie überschrieben. Falls die Datei nicht existiert, wird sie (sowie alle erforderlichen übergeordneten Verzeichnisse) erstellt.

- **Werkzeugname:** `write_file`
- **Anzeigename:** Datei schreiben
- **Datei:** `write-file.ts`
- **Parameter:**
  - `file_path` (Zeichenkette, erforderlich): Der absolute Pfad zur Datei, in die geschrieben werden soll.
  - `content` (Zeichenkette, erforderlich): Der Inhalt, der in die Datei geschrieben werden soll.
- **Verhalten:**
  - Schreibt den angegebenen `content` in die Datei unter `file_path`.
  - Erstellt übergeordnete Verzeichnisse, falls diese nicht existieren.
- **Ausgabe (`llmContent`):** Eine Erfolgsmeldung, z. B. `Datei erfolgreich überschrieben: /pfad/zur/ihren/datei.txt` oder `Neue Datei erfolgreich erstellt und beschrieben: /pfad/zur/neuen/datei.txt`.
- **Bestätigung:** Ja. Zeigt einen Diff der Änderungen an und fordert vor dem Schreiben die Zustimmung des Benutzers an.

## 4. `glob` (Glob)

Mit `glob` werden Dateien gefunden, die bestimmten Glob-Mustern entsprechen (z. B. `src/**/*.ts`, `*.md`). Die zurückgegebenen absoluten Pfade sind nach dem Änderungszeitpunkt sortiert (neueste zuerst).

- **Werkzeugname:** `glob`
- **Anzeigename:** Glob
- **Datei:** `glob.ts`
- **Parameter:**
  - `pattern` (Zeichenkette, erforderlich): Das abzugleichende Glob-Muster (z. B. `"*.py"`, `"src/**/*.js"`).
  - `path` (Zeichenkette, optional): Das Verzeichnis, in dem gesucht werden soll. Falls nicht angegeben, wird das aktuelle Arbeitsverzeichnis verwendet.
- **Verhalten:**
  - Durchsucht das angegebene Verzeichnis nach Dateien, die dem Glob-Muster entsprechen.
  - Gibt eine Liste absoluter Pfade zurück, sortiert nach dem Änderungszeitpunkt (neueste Dateien zuerst).
  - Berücksichtigt standardmäßig Muster aus `.gitignore` und `.qwenignore`.
  - Beschränkt die Ergebnisse auf 100 Dateien, um einen Überlauf des Kontexts zu vermeiden.
- **Ausgabe (`llmContent`):** Eine Nachricht wie: `Gefunden: 5 Datei(en), die "*.ts" im Verzeichnis /pfad/zum/suchverzeichnis entsprechen, sortiert nach Änderungszeit (neueste zuerst):\n---\n/pfad/zur/datei1.ts\n/pfad/zum/unterverzeichnis/datei2.ts\n---\n[95 Dateien gekürzt] ...`
- **Bestätigung erforderlich:** Nein.

## 5. `grep_search` (Grep)

Mit `grep_search` wird nach einem regulären Ausdrucksmuster innerhalb des Inhalts von Dateien in einem angegebenen Verzeichnis gesucht. Es ist möglich, Dateien anhand eines Glob-Musters zu filtern. Die zurückgegebenen Ergebnisse umfassen die Zeilen mit Übereinstimmungen sowie deren Dateipfade und Zeilennummern.

- **Werkzeugname:** `grep_search`
- **Anzeigename:** Grep
- **Datei:** `grep.ts` (mit `ripGrep.ts` als Fallback)
- **Parameter:**
  - `pattern` (Zeichenkette, erforderlich): Das reguläre Ausdrucksmuster, nach dem im Dateiinhalt gesucht werden soll (z. B. `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (Zeichenkette, optional): Datei oder Verzeichnis, in dem gesucht werden soll. Standardwert ist das aktuelle Arbeitsverzeichnis.
  - `glob` (Zeichenkette, optional): Glob-Muster zum Filtern von Dateien (z. B. `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (Zahl, optional): Begrenzt die Ausgabe auf die ersten N übereinstimmenden Zeilen. Optional – bei Nichtangabe werden alle Übereinstimmungen angezeigt.
- **Verhalten:**
  - Verwendet ripgrep für eine schnelle Suche, falls verfügbar; andernfalls erfolgt ein Fallback auf eine JavaScript-basierte Suchimplementierung.
  - Gibt übereinstimmende Zeilen zusammen mit ihren Dateipfaden und Zeilennummern zurück.
  - Die Suche erfolgt standardmäßig nicht unterscheidend zwischen Groß- und Kleinschreibung.
  - Berücksichtigt Muster aus `.gitignore` und `.qwenignore`.
  - Begrenzt die Ausgabe, um einen Überlauf des Kontexts zu vermeiden.
- **Ausgabe (`llmContent`):** Eine formatierte Zeichenkette mit den Übereinstimmungen, z. B.:

  ```
  Gefunden: 3 Übereinstimmungen für Muster „myFunction“ im Pfad „.“ (Filter: „*.ts“):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 Zeilen gekürzt] ...
  ```

- **Bestätigung:** Nein.

### Beispiele für `grep_search`

Nach einem Muster mit der standardmäßigen Begrenzung der Ergebnisse suchen:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Nach einem Muster mit einer benutzerdefinierten Begrenzung der Ergebnisse suchen:

```
grep_search(pattern="function", path="src", limit=50)
```

Nach einem Muster mit Dateifilterung und einer benutzerdefinierten Begrenzung der Ergebnisse suchen:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (Bearbeiten)

Mit `edit` wird Text innerhalb einer Datei ersetzt. Standardmäßig muss `old_string` an genau einer eindeutigen Stelle übereinstimmen; legen Sie `replace_all` auf `true` fest, wenn Sie bewusst alle Vorkommen ändern möchten. Dieses Tool ist für präzise, gezielte Änderungen konzipiert und erfordert einen umfangreichen Kontext um den `old_string`, um sicherzustellen, dass die richtige Stelle geändert wird.

- **Tool-Name:** `edit`
- **Anzeigename:** Bearbeiten
- **Datei:** `edit.ts`
- **Parameter:**
  - `file_path` (Zeichenkette, erforderlich): Der absolute Pfad zur zu ändernden Datei.
  - `old_string` (Zeichenkette, erforderlich): Der exakte, wörtliche Text, der ersetzt werden soll.

    **KRITISCH:** Diese Zeichenkette muss die einzige zu ändernde Instanz eindeutig identifizieren. Sie sollte ausreichend Kontext um den Zieltext enthalten und Whitespace sowie Einrückung exakt wiedergeben. Ist `old_string` leer, versucht das Tool, eine neue Datei unter `file_path` mit `new_string` als Inhalt anzulegen.

  - `new_string` (Zeichenkette, erforderlich): Der exakte, wörtliche Text, mit dem `old_string` ersetzt werden soll.
  - `replace_all` (boolesch, optional): Ersetzt alle Vorkommen von `old_string`. Standardwert ist `false`.

- **Verhalten:**
  - Ist `old_string` leer und existiert `file_path` nicht, wird eine neue Datei mit `new_string` als Inhalt erstellt.
  - Ist `old_string` angegeben, liest das Tool die Datei unter `file_path` und versucht, genau eine Übereinstimmung zu finden – es sei denn, `replace_all` ist `true`.
  - Ist die Übereinstimmung eindeutig (oder `replace_all` ist `true`), wird der Text durch `new_string` ersetzt.
  - **Erhöhte Zuverlässigkeit (mehrstufige Edit-Korrektur):** Um die Erfolgsrate von Änderungen signifikant zu verbessern – insbesondere dann, wenn der vom Modell bereitgestellte `old_string` möglicherweise nicht vollständig präzise ist – enthält das Tool einen mehrstufigen Korrekturmechanismus für Edit-Vorgänge.
    - Falls der anfängliche `old_string` nicht gefunden wird oder an mehreren Stellen übereinstimmt, kann das Tool das Qwen-Modell nutzen, um `old_string` (und ggf. auch `new_string`) iterativ zu verfeinern.
    - Dieser Selbstkorrekturprozess versucht, das eindeutige Segment zu identifizieren, das das Modell tatsächlich ändern wollte, wodurch der `edit`-Vorgang auch bei leicht ungenauem Ausgangskontext robuster wird.
- **Fehlerbedingungen:** Trotz des Korrekturmechanismus schlägt das Tool fehl, wenn:
  - `file_path` kein absoluter Pfad ist oder sich außerhalb des Stammverzeichnisses befindet.
  - `old_string` nicht leer ist, aber die Datei unter `file_path` nicht existiert.
  - `old_string` leer ist, aber die Datei unter `file_path` bereits existiert.
  - `old_string` nach allen Versuchen zur Korrektur nicht in der Datei gefunden wird.
  - `old_string` mehrfach in der Datei vorkommt, `replace_all` `false` ist und der Selbstkorrekturmechanismus keine eindeutige, eindeutig identifizierbare Übereinstimmung herstellen kann.
- **Ausgabe (`llmContent`):**
  - Bei Erfolg: `Erfolgreich geänderte Datei: /pfad/zur/datei.txt (1 Ersetzung).` oder `Neue Datei erstellt: /pfad/zur/neuen_datei.txt mit bereitgestelltem Inhalt.`
  - Bei Fehlschlag: Eine Fehlermeldung, die den Grund erklärt (z. B. `Fehler beim Bearbeiten: 0 Vorkommen gefunden…`, `Fehler beim Bearbeiten: Der Text kommt an mehreren Stellen vor…`).
- **Bestätigung:** Ja. Zeigt einen Diff der vorgeschlagenen Änderungen an und fragt vor dem Schreiben in die Datei nach der Zustimmung des Benutzers.

Diese Dateisystem-Tools bilden die Grundlage dafür, dass Qwen Code Ihren lokalen Projektkontext verstehen und damit interagieren kann.