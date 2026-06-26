# Web Fetch Tool (`web_fetch`)

Dieses Dokument beschreibt das `web_fetch`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `web_fetch`, um Inhalte von einer angegebenen URL abzurufen und mit einem KI-Modell zu verarbeiten. Das Tool nimmt eine URL und einen Prompt als Eingabe, ruft die Inhalte der URL ab und verarbeitet die Inhalte mit dem Prompt unter Verwendung eines kleinen, schnellen Modells.

### Argumente

`web_fetch` erwartet drei Argumente:

- `url` (string, erforderlich): Die URL, von der Inhalte abgerufen werden sollen. Muss eine vollständig ausgebildete gültige URL sein, die mit `http://` oder `https://` beginnt.
- `prompt` (string, erforderlich): Der Prompt, der beschreibt, welche Informationen aus dem Seiteninhalt extrahiert werden sollen.
- `format` (string, optional): Steuert nur den `Accept`-Header, der an den Server gesendet wird, und gibt Ihre Inhaltspräferenz an. **Alle abgerufenen Inhalte werden für die LLM-Verarbeitung in Klartext normalisiert**, unabhängig vom angegebenen Format. Standardmäßig `"auto"`, wenn nicht angegeben.
  - `"auto"` (Standard): Bevorzugt Markdown über Content Negotiation (`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`), fällt dann auf HTML, Klartext oder andere Inhaltstypen zurück. **Für die meisten Anwendungsfälle empfohlen**, da es den Tokenverbrauch für Server, die Markdown unterstützen, um bis zu 80% reduzieren kann, während es weiterhin mit reinen JSON-APIs funktioniert.
  - `"markdown"`: Bevorzugt `Accept: text/markdown, */*;q=0.1`. Verwenden Sie, wenn Sie explizit Markdown-Inhalte benötigen.
  - `"html"`: Bevorzugt `Accept: text/html, */*;q=0.1`. Verwenden Sie, wenn der Server HTML im Accept-Header erwartet. Der Inhalt wird dennoch für die LLM-Verarbeitung in Klartext umgewandelt.
  - `"text"`: Bevorzugt `Accept: text/plain, */*;q=0.1`. Verwenden Sie, wenn Sie gezielt Klartext-Inhalte benötigen.

## So verwenden Sie `web_fetch` mit Qwen Code

Um `web_fetch` mit Qwen Code zu verwenden, geben Sie eine URL und einen Prompt an, der beschreibt, was Sie aus dieser URL extrahieren möchten. Das Tool fragt nach einer Bestätigung, bevor es die URL abruft. Nach der Bestätigung ruft das Tool den Inhalt direkt ab und verarbeitet ihn mit einem KI-Modell.

Das Tool automatisch:

- Konvertiert HTML bei Bedarf in Text
- Verarbeitet GitHub-Blob-URLs (wandelt sie in Raw-URLs um)
- Stuft HTTP-URLs aus Sicherheitsgründen auf HTTPS hoch
- Unterstützt Content Negotiation für Markdown (reduziert den Tokenverbrauch erheblich)

Verwendung:

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

Mit Formatangabe:

```
web_fetch(url="https://example.com", prompt="Get the raw content", format="markdown")
```

## `web_fetch`-Beispiele

Fassen Sie einen einzelnen Artikel zusammen:

```
web_fetch(url="https://example.com/news/latest", prompt="Can you summarize the main points of this article?")
```

Bestimmte Informationen extrahieren:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="What are the key findings and methodology described in this paper?")
```

GitHub-Dokumentation analysieren:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="What are the installation steps and main features?")
```

Markdown-Inhalt abrufen (für Server, die Markdown für Agenten unterstützen):

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extract the key information", format="markdown")
```

## Wichtige Hinweise

- **Einzelne URL-Verarbeitung:** `web_fetch` verarbeitet jeweils eine URL. Um mehrere URLs zu analysieren, tätigen Sie separate Aufrufe an das Tool.
- **URL-Format:** Das Tool stuft HTTP-URLs automatisch auf HTTPS hoch und wandelt GitHub-Blob-URLs zur besseren Inhaltsabfrage in das Raw-Format um.
- **Content Negotiation:** Das Tool unterstützt Content Negotiation gemäß „Markdown for Agents". Bei Verwendung von `format="auto"` (Standard) sendet es `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`, sodass Server, die Markdown unterstützen, diesen direkt statt HTML zurückgeben können. Der niedrig priorisierte Fallback `*/*` stellt sicher, dass JSON-only-APIs und andere Nicht-Text-Endpunkte weiterhin abrufbar sind. Dies kann den Tokenverbrauch um bis zu 80 % reduzieren.
- **Inhaltsverarbeitung:** Das Tool ruft Inhalte direkt ab und verarbeitet sie mit einem KI-Modell. Wenn der Server HTML zurückgibt, konvertiert es diesen in ein lesbares Textformat. Wenn der Server Markdown, Klartext oder einen anderen Fallback-Inhaltstyp wie JSON zurückgibt, verwendet es den Inhalt unverändert.
- **Ausgabequalität:** Die Qualität der Ausgabe hängt von der Klarheit der Anweisungen im Prompt ab.
- **MCP-Tools:** Wenn ein von MCP bereitgestelltes Web-Fetch-Tool verfügbar ist (beginnt mit „mcp\_\_"), bevorzugen Sie die Verwendung dieses Tools, da es möglicherweise weniger Einschränkungen hat.

## Unterstützung für Markdown for Agents

Das `web_fetch`-Tool von Qwen Code implementiert Unterstützung für die [Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/)-Spezifikation von Cloudflare. Diese Funktion ermöglicht es Websites, Markdown-Inhalte direkt an KI-Agenten auszuliefern, was den Tokenverbrauch im Vergleich zum Parsen von HTML erheblich reduziert.

### So funktioniert's

1. Der Parameter `format` steuert **nur** den an den Server gesendeten `Accept`-Header (er beeinflusst nicht das Ausgabeformat):
   - `format="auto"`: sendet `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`
   - `format="markdown"`: sendet `Accept: text/markdown, */*;q=0.1`
   - `format="html"`: sendet `Accept: text/html, */*;q=0.1`
   - `format="text"`: sendet `Accept: text/plain, */*;q=0.1`
2. Wenn der Server Markdown unterstützt, gibt er `Content-Type: text/markdown` zurück.
3. Das Tool verwendet Markdown- oder Klartext-Inhalte direkt ohne Konvertierung.
4. Wenn der Server HTML zurückgibt, konvertiert es diesen in ein lesbares Textformat für die LLM-Verarbeitung; Markdown, Klartext und Fallback-Inhaltstypen wie JSON werden unverändert verwendet.
5. Alle Inhalte werden vor der Verarbeitung durch das KI-Modell in Text normalisiert.

### Vorteile

- **Tokeneffizienz:** Markdown-Inhalte verwenden typischerweise 80 % weniger Token als äquivalentes HTML.
- **Bessere Struktur:** Markdown bewahrt die semantische Struktur (Überschriften, Listen usw.).
- **Abwärtskompatibel:** Funktioniert mit allen Websites, verbesserte Erfahrung für unterstützende Server.

### Beispielserver, die Markdown unterstützen

- Cloudflare-Entwicklerdokumentation
- Cloudflare-Blog
- Jede Website, die die Funktion „Markdown for Agents" von Cloudflare verwendet.