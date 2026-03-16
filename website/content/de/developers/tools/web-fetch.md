# Web-Fetch-Tool (`web_fetch`)

Dieses Dokument beschreibt das Tool `web_fetch` für Qwen Code.

## Beschreibung

Verwenden Sie `web_fetch`, um Inhalte von einer angegebenen URL abzurufen und mithilfe eines KI-Modells zu verarbeiten. Das Tool nimmt eine URL und eine Anweisung („prompt“) als Eingabe, ruft den Inhalt der URL ab, konvertiert HTML in Markdown und verarbeitet den Inhalt mit der Anweisung unter Verwendung eines kleinen, schnellen Modells.

### Argumente

`web_fetch` akzeptiert zwei Argumente:

- `url` (Zeichenkette, erforderlich): Die URL, von der Inhalte abgerufen werden sollen. Muss eine vollständige, gültige URL sein, die mit `http://` oder `https://` beginnt.
- `prompt` (Zeichenkette, erforderlich): Die Anweisung, die beschreibt, welche Informationen Sie aus dem Seiteninhalt extrahieren möchten.

## So verwenden Sie `web_fetch` mit Qwen Code

Um `web_fetch` mit Qwen Code zu verwenden, geben Sie eine URL und eine Aufforderung an, die beschreibt, was Sie von dieser URL extrahieren möchten. Das Tool fordert vor dem Abrufen der URL eine Bestätigung an. Nach der Bestätigung ruft das Tool den Inhalt direkt ab und verarbeitet ihn mithilfe eines KI-Modells.

Das Tool konvertiert HTML automatisch in Text, verarbeitet GitHub-Blob-URLs (indem es sie in Roh-URLs umwandelt) und aktualisiert HTTP-URLs aus Sicherheitsgründen auf HTTPS.

Verwendung:

```
web_fetch(url="https://example.com", prompt="Fassen Sie die wichtigsten Punkte dieses Artikels zusammen")
```

## `web_fetch`-Beispiele

Zusammenfassung eines einzelnen Artikels:

```
web_fetch(url="https://example.com/news/latest", prompt="Können Sie die wichtigsten Punkte dieses Artikels zusammenfassen?")
```

Extrahieren spezifischer Informationen:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="Was sind die zentralen Erkenntnisse und die beschriebene Methodik dieses Papers?")
```

Analyse der GitHub-Dokumentation:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="Was sind die Installationsschritte und die wichtigsten Funktionen?")
```

## Wichtige Hinweise

- **Verarbeitung einer einzelnen URL:** `web_fetch` verarbeitet jeweils nur eine URL. Um mehrere URLs zu analysieren, müssen separate Aufrufe des Tools erfolgen.
- **URL-Format:** Das Tool aktualisiert HTTP-URLs automatisch auf HTTPS und konvertiert GitHub-Blob-URLs in das Raw-Format, um den Zugriff auf den Inhalt zu verbessern.
- **Inhaltsverarbeitung:** Das Tool ruft den Inhalt direkt ab und verarbeitet ihn mithilfe eines KI-Modells, wobei HTML in ein lesbares Textformat umgewandelt wird.
- **Ausgabequalität:** Die Qualität der Ausgabe hängt von der Klarheit der Anweisungen in der Eingabeaufforderung ab.
- **MCP-Tools:** Falls ein vom MCP bereitgestelltes Web-Fetch-Tool verfügbar ist (mit dem Präfix „mcp__“), sollte dieses bevorzugt verwendet werden, da es möglicherweise weniger Einschränkungen aufweist.