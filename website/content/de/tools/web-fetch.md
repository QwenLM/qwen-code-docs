# Web Fetch Tool (`web_fetch`)

Dieses Dokument beschreibt das `web_fetch` Tool für Qwen Code.

## Beschreibung

Verwende `web_fetch`, um Inhalte von einer angegebenen URL abzurufen und mit einem KI-Modell zu verarbeiten. Das Tool benötigt eine URL und einen Prompt als Eingabe, ruft den Inhalt der URL ab, konvertiert HTML in Markdown und verarbeitet den Inhalt anschließend mit dem Prompt unter Verwendung eines kleinen, schnellen Modells.

### Argumente

`web_fetch` akzeptiert zwei Argumente:

- `url` (string, erforderlich): Die URL, von der der Inhalt abgerufen werden soll. Muss eine vollständige, gültige URL sein, die mit `http://` oder `https://` beginnt.
- `prompt` (string, erforderlich): Der Prompt, der beschreibt, welche Informationen du aus dem Seiteninhalt extrahieren möchtest.

## Wie man `web_fetch` mit Qwen Code verwendet

Um `web_fetch` mit Qwen Code zu verwenden, gib eine URL und einen Prompt an, der beschreibt, was du von dieser URL extrahieren möchtest. Das Tool fordert vor dem Abrufen der URL eine Bestätigung an. Sobald bestätigt, ruft das Tool den Inhalt direkt ab und verarbeitet ihn mithilfe eines KI-Modells.

Das Tool konvertiert HTML automatisch in Text, verarbeitet GitHub-Blob-URLs (indem es sie in Raw-URLs umwandelt) und aktualisiert HTTP-URLs aus Sicherheitsgründen auf HTTPS.

Verwendung:

```
web_fetch(url="https://example.com", prompt="Fasse die Hauptpunkte dieses Artikels zusammen")
```

## `web_fetch` Beispiele

Zusammenfassung eines einzelnen Artikels:

```
web_fetch(url="https://example.com/news/latest", prompt="Can you summarize the main points of this article?")
```

Extrahieren spezifischer Informationen:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="What are the key findings and methodology described in this paper?")
```

Analyse von GitHub-Dokumentation:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="What are the installation steps and main features?")
```

## Wichtige Hinweise

- **Einzelne URL-Verarbeitung:** `web_fetch` verarbeitet jeweils nur eine URL. Um mehrere URLs zu analysieren, führe separate Aufrufe des Tools durch.
- **URL-Format:** Das Tool aktualisiert HTTP-URLs automatisch auf HTTPS und wandelt GitHub-Blob-URLs in das Raw-Format um, um einen besseren Zugriff auf den Inhalt zu ermöglichen.
- **Inhaltsverarbeitung:** Das Tool ruft den Inhalt direkt ab und verarbeitet ihn mithilfe eines KI-Modells, wobei HTML in ein lesbares Textformat konvertiert wird.
- **Ausgabegüte:** Die Qualität der Ausgabe hängt von der Klarheit der Anweisungen im Prompt ab.
- **MCP-Tools:** Falls ein von MCP bereitgestelltes Web-Fetch-Tool verfügbar ist (beginnend mit "mcp\_\_"), bevorzuge die Verwendung dieses Tools, da es möglicherweise weniger Einschränkungen unterliegt.