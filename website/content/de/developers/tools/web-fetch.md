# Web Fetch Tool (`web_fetch`)

Dieses Dokument beschreibt das `web_fetch`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `web_fetch`, um Inhalte von einer angegebenen URL abzurufen und mit einem KI-Modell zu verarbeiten. Das Tool benötigt eine URL und einen Prompt als Eingabe, ruft den Inhalt der URL ab, konvertiert HTML in Markdown und verarbeitet den Inhalt anhand des Prompts mit einem kleinen, schnellen Modell.

### Argumente

`web_fetch` akzeptiert zwei Argumente:

- `url` (String, erforderlich): Die URL, von der der Inhalt abgerufen werden soll. Muss eine vollständig gültige URL sein, die mit `http://` oder `https://` beginnt.
- `prompt` (String, erforderlich): Der Prompt, der beschreibt, welche Informationen aus dem Seiteninhalt extrahiert werden sollen.

## Verwendung von `web_fetch` mit Qwen Code

Um `web_fetch` mit Qwen Code zu verwenden, gib eine URL und eine Eingabeaufforderung an, die beschreibt, was du von dieser URL extrahieren möchtest. Das Tool fordert vor dem Abrufen der URL eine Bestätigung an. Nach der Bestätigung ruft das Tool den Inhalt direkt ab und verarbeitet ihn mithilfe eines KI-Modells.

Das Tool konvertiert automatisch HTML in Text, verarbeitet GitHub-Blob-URLs (indem es sie in Roh-URLs umwandelt) und aktualisiert HTTP-URLs aus Sicherheitsgründen auf HTTPS.

Verwendung:

```
web_fetch(url="https://example.com", prompt="Fasse die Hauptpunkte dieses Artikels zusammen")
```

## `web_fetch` Beispiele

Zusammenfassung eines einzelnen Artikels:

```
web_fetch(url="https://example.com/news/latest", prompt="Können Sie die Hauptpunkte dieses Artikels zusammenfassen?")
```

Extrahieren spezifischer Informationen:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="Welche sind die wichtigsten Erkenntnisse und Methoden, die in diesem Paper beschrieben werden?")
```

Analyse der GitHub-Dokumentation:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="Welche sind die Installationsschritte und Hauptfunktionen?")
```

## Wichtige Hinweise

- **Einzelne URL-Verarbeitung:** `web_fetch` verarbeitet jeweils nur eine URL. Um mehrere URLs zu analysieren, führen Sie separate Aufrufe des Tools durch.
- **URL-Format:** Das Tool aktualisiert HTTP-URLs automatisch auf HTTPS und wandelt GitHub-Blob-URLs in das Raw-Format um, um einen besseren Zugriff auf den Inhalt zu ermöglichen.
- **Inhaltsverarbeitung:** Das Tool ruft Inhalte direkt ab und verarbeitet sie mithilfe eines KI-Modells, wobei HTML in ein lesbares Textformat konvertiert wird.
- **Ausgabegüte:** Die Qualität der Ausgabe hängt von der Klarheit der Anweisungen im Prompt ab.
- **MCP-Tools:** Falls ein vom MCP bereitgestelltes Web-Fetch-Tool verfügbar ist (beginnend mit "mcp\_\_"), bevorzugen Sie die Verwendung dieses Tools, da es möglicherweise weniger Einschränkungen unterliegt.