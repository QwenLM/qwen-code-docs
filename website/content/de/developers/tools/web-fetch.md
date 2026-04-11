# Web-Fetch-Tool (`web_fetch`)

Dieses Dokument beschreibt das `web_fetch`-Tool für Qwen Code.

## Beschreibung

Verwende `web_fetch`, um Inhalte von einer angegebenen URL abzurufen und sie mithilfe eines KI-Modells zu verarbeiten. Das Tool erwartet eine URL und einen Prompt als Eingabe, ruft den Inhalt der URL ab, konvertiert HTML in Markdown und verarbeitet den Inhalt mit dem Prompt mithilfe eines kleinen, schnellen Modells.

### Argumente

`web_fetch` erwartet zwei Argumente:

- `url` (string, erforderlich): Die URL, von der Inhalte abgerufen werden sollen. Muss eine vollständig gültige URL sein, die mit `http://` oder `https://` beginnt.
- `prompt` (string, erforderlich): Der Prompt, der beschreibt, welche Informationen du aus dem Seiteninhalt extrahieren möchtest.

## So verwendest du `web_fetch` mit Qwen Code

Um `web_fetch` mit Qwen Code zu verwenden, gib eine URL und einen Prompt an, der beschreibt, was du von dieser URL extrahieren möchtest. Das Tool fragt vor dem Abruf der URL nach einer Bestätigung. Nach der Bestätigung ruft das Tool den Inhalt direkt ab und verarbeitet ihn mithilfe eines KI-Modells.

Das Tool konvertiert HTML automatisch in Text, verarbeitet GitHub-Blob-URLs (indem es sie in Raw-URLs umwandelt) und aktualisiert HTTP-URLs aus Sicherheitsgründen auf HTTPS.

Verwendung:

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

## `web_fetch`-Beispiele

Zusammenfassen eines einzelnen Artikels:

```
web_fetch(url="https://example.com/news/latest", prompt="Can you summarize the main points of this article?")
```

Extrahieren spezifischer Informationen:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="What are the key findings and methodology described in this paper?")
```

Analysieren der GitHub-Dokumentation:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="What are the installation steps and main features?")
```

## Wichtige Hinweise

- **Verarbeitung einzelner URLs:** `web_fetch` verarbeitet jeweils eine URL. Um mehrere URLs zu analysieren, rufe das Tool separat auf.
- **URL-Format:** Das Tool aktualisiert HTTP-URLs automatisch auf HTTPS und konvertiert GitHub-Blob-URLs in das Raw-Format, um einen besseren Zugriff auf den Inhalt zu ermöglichen.
- **Inhaltsverarbeitung:** Das Tool ruft Inhalte direkt ab und verarbeitet sie mithilfe eines KI-Modells, wobei HTML in ein lesbares Textformat konvertiert wird.
- **Ausgabequalität:** Die Qualität der Ausgabe hängt von der Klarheit der Anweisungen im Prompt ab.
- **MCP-Tools:** Falls ein von MCP bereitgestelltes Web-Fetch-Tool verfügbar ist (beginnt mit "mcp\_\_"), verwende bevorzugt dieses Tool, da es möglicherweise weniger Einschränkungen aufweist.