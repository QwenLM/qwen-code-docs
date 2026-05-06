# Web-Fetch-Tool (`web_fetch`)

Dieses Dokument beschreibt das `web_fetch`-Tool für Qwen Code.

## Beschreibung

Verwende `web_fetch`, um Inhalte von einer angegebenen URL abzurufen und sie mit einem KI-Modell zu verarbeiten. Das Tool erwartet eine URL und einen Prompt als Eingabe, lädt den Inhalt der URL herunter und verarbeitet ihn mithilfe des Prompts mit einem kleinen, schnellen Modell.

### Argumente

`web_fetch` erwartet drei Argumente:

- `url` (string, erforderlich): Die URL, von der Inhalte abgerufen werden sollen. Muss eine vollständig gültige URL sein, die mit `http://` oder `https://` beginnt.
- `prompt` (string, erforderlich): Der Prompt, der beschreibt, welche Informationen aus dem Seiteninhalt extrahiert werden sollen.
- `format` (string, optional): Steuert ausschließlich den `Accept`-Header, der an den Server gesendet wird, und gibt deine Inhaltspräferenz an. **Alle abgerufenen Inhalte werden für die LLM-Verarbeitung zu Plain Text normalisiert**, unabhängig vom angegebenen Format. Standardwert ist `"auto"`, wenn nichts angegeben wird.
  - `"auto"` (Standard): Bevorzugt Markdown über Content Negotiation (`Accept: text/markdown, text/html`), akzeptiert HTML als Fallback. **Empfohlen für die meisten Anwendungsfälle**, da es den Token-Verbrauch bei Servern, die Markdown unterstützen, um bis zu 80 % reduzieren kann.
  - `"markdown"`: Sendet `Accept: text/markdown`. Verwende dies, wenn du explizit Markdown-Inhalte benötigst.
  - `"html"`: Sendet `Accept: text/html`. Verwende dies, wenn der Server HTML im Accept-Header erfordert. Der Inhalt wird dennoch für die LLM-Verarbeitung zu Plain Text konvertiert.
  - `"text"`: Sendet `Accept: text/plain`. Verwende dies, wenn du explizit Plain-Text-Inhalte benötigst.

## Verwendung von `web_fetch` mit Qwen Code

Um `web_fetch` mit Qwen Code zu verwenden, gib eine URL und einen Prompt an, der beschreibt, was du aus dieser URL extrahieren möchtest. Das Tool fragt vor dem Abruf der URL nach einer Bestätigung. Nach der Bestätigung lädt das Tool den Inhalt direkt herunter und verarbeitet ihn mit einem KI-Modell.

Das Tool führt automatisch folgende Schritte aus:

- Konvertiert HTML bei Bedarf in Text
- Verarbeitet GitHub-Blob-URLs (konvertiert sie in Raw-URLs)
- Aktualisiert HTTP-URLs aus Sicherheitsgründen auf HTTPS
- Unterstützt Content Negotiation für Markdown (reduziert den Token-Verbrauch erheblich)

Verwendung:

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

Mit Formatangabe:

```
web_fetch(url="https://example.com", prompt="Get the raw content", format="markdown")
```

## `web_fetch`-Beispiele

Zusammenfassung eines einzelnen Artikels:

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

Abrufen von Markdown-Inhalten (für Server, die Markdown for Agents unterstützen):

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extract the key information", format="markdown")
```

## Wichtige Hinweise

- **Verarbeitung einzelner URLs:** `web_fetch` verarbeitet jeweils eine URL. Um mehrere URLs zu analysieren, rufe das Tool separat auf.
- **URL-Format:** Das Tool aktualisiert HTTP-URLs automatisch auf HTTPS und konvertiert GitHub-Blob-URLs in das Raw-Format, um einen besseren Zugriff auf den Inhalt zu ermöglichen.
- **Content Negotiation:** Das Tool unterstützt die Content Negotiation für „Markdown for Agents“. Bei Verwendung von `format="auto"` (Standard) sendet es `Accept: text/markdown, text/html`-Header, was Servern, die Markdown unterstützen, ermöglicht, diesen direkt statt HTML zurückzugeben. Dies kann den Token-Verbrauch um bis zu 80 % reduzieren.
- **Inhaltsverarbeitung:** Das Tool lädt Inhalte direkt herunter und verarbeitet sie mit einem KI-Modell. Wenn der Server HTML zurückgibt, wird es in ein lesbares Textformat konvertiert. Wenn der Server Markdown oder Plain Text zurückgibt, wird der Inhalt unverarbeitet übernommen.
- **Ausgabequalität:** Die Qualität der Ausgabe hängt von der Klarheit der Anweisungen im Prompt ab.
- **MCP-Tools:** Wenn ein von MCP bereitgestelltes Web-Fetch-Tool verfügbar ist (beginnt mit `mcp__`), verwende vorzugsweise dieses Tool, da es möglicherweise weniger Einschränkungen hat.

## Unterstützung für Markdown for Agents

Das `web_fetch`-Tool von Qwen Code implementiert die Unterstützung für die Spezifikation [Cloudflare's Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/). Diese Funktion ermöglicht es Websites, Markdown-Inhalte direkt an KI-Agents auszuliefern, was den Token-Verbrauch im Vergleich zum Parsen von HTML erheblich reduziert.

### Funktionsweise

1. Der `format`-Parameter steuert **ausschließlich** den `Accept`-Header, der an den Server gesendet wird (er hat keinen Einfluss auf das Ausgabeformat):
   - `format="auto"`: sendet `Accept: text/markdown, text/html`
   - `format="markdown"`: sendet `Accept: text/markdown`
   - `format="html"`: sendet `Accept: text/html`
   - `format="text"`: sendet `Accept: text/plain`
2. Wenn der Server Markdown unterstützt, gibt er `Content-Type: text/markdown` zurück
3. Das Tool verwendet Markdown- oder Plain-Text-Inhalte direkt ohne Konvertierung
4. Wenn der Server HTML zurückgibt, wird es für die LLM-Verarbeitung in ein lesbares Textformat konvertiert
5. Alle Inhalte werden vor der Verarbeitung durch das KI-Modell zu Text normalisiert

### Vorteile

- **Token-Effizienz:** Markdown-Inhalte verbrauchen in der Regel 80 % weniger Tokens als entsprechendes HTML
- **Bessere Struktur:** Markdown bewahrt die semantische Struktur (Überschriften, Listen usw.)
- **Abwärtskompatibel:** Funktioniert mit allen Websites, bietet ein verbessertes Erlebnis für unterstützende Server

### Beispielserver mit Markdown-Unterstützung

- Cloudflare Developer Documentation
- Cloudflare Blog
- Jede Website, die die „Markdown for Agents“-Funktion von Cloudflare nutzt