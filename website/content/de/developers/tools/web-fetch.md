# Web-Fetch-Werkzeug (`web_fetch`)

Dieses Dokument beschreibt das `web_fetch`-Werkzeug für Qwen Code.

## Beschreibung

Verwende `web_fetch`, um Inhalte von einer angegebenen URL abzurufen und mit einem KI-Modell zu verarbeiten. Das Werkzeug nimmt eine URL und einen Prompt als Eingabe, ruft den Inhalt der URL ab und verarbeitet den Inhalt mit dem Prompt unter Verwendung eines kleinen, schnellen Modells.

### Argumente

`web_fetch` akzeptiert drei Argumente:

- `url` (Zeichenkette, erforderlich): Die URL, von der der Inhalt abgerufen werden soll. Muss eine vollständig ausgebildete, gültige URL sein, die mit `http://` oder `https://` beginnt.
- `prompt` (Zeichenkette, erforderlich): Der Prompt, der beschreibt, welche Informationen du aus dem Seiteninhalt extrahieren möchtest.
- `format` (Zeichenkette, optional): Steuert nur den `Accept`-Header, der an den Server gesendet wird, und gibt deine Inhaltspräferenz an. **Alle abgerufenen Inhalte werden zur LLM-Verarbeitung in Klartext normalisiert**, unabhängig vom angegebenen Format. Standard ist `"auto"`, falls nicht angegeben.
  - `"auto"` (Standard): Bevorzugt Markdown mittels Inhaltsaushandlung (`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`), fällt dann auf HTML, Klartext oder andere Inhaltstypen zurück. **Für die meisten Anwendungsfälle empfohlen**, da es die Token-Nutzung bei Servern, die Markdown unterstützen, um bis zu 80 % reduzieren kann, während es dennoch mit reinen JSON-APIs funktioniert.
  - `"markdown"`: Bevorzugt `Accept: text/markdown, */*;q=0.1`. Verwende dies, wenn du explizit Markdown-Inhalte benötigst.
  - `"html"`: Bevorzugt `Accept: text/html, */*;q=0.1`. Verwende dies, wenn der Server HTML im Accept-Header erfordert. Der Inhalt wird dennoch für die LLM-Verarbeitung in Klartext umgewandelt.
  - `"text"`: Bevorzugt `Accept: text/plain, */*;q=0.1`. Verwende dies, wenn du speziell Klartextinhalte benötigst.

## So verwendest du `web_fetch` mit Qwen Code

Um `web_fetch` mit Qwen Code zu verwenden, gib eine URL und einen Prompt an, der beschreibt, was du aus dieser URL extrahieren möchtest. Das Werkzeug wird vor dem Abruf der URL um Bestätigung bitten. Nach der Bestätigung ruft das Werkzeug den Inhalt direkt ab und verarbeitet ihn mit einem KI-Modell.

Das Werkzeug automatisiert:

- Konvertierung von HTML in Text, wenn nötig
- Behandlung von GitHub-Blob-URLs (Umwandlung in Roh-URLs)
- Upgrade von HTTP-URLs auf HTTPS aus Sicherheitsgründen
- Unterstützung der Inhaltsaushandlung für Markdown (reduziert die Token-Nutzung erheblich)

Verwendung:

```
web_fetch(url="https://example.com", prompt="Fasse die Hauptpunkte dieses Artikels zusammen")
```

Mit Formatangabe:

```
web_fetch(url="https://example.com", prompt="Hole den Rohinhalt", format="markdown")
```

## `web_fetch`-Beispiele

Einen einzelnen Artikel zusammenfassen:

```
web_fetch(url="https://example.com/news/latest", prompt="Kannst du die wichtigsten Punkte dieses Artikels zusammenfassen?")
```

Spezifische Informationen extrahieren:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="Was sind die wichtigsten Ergebnisse und die beschriebene Methodik in diesem Papier?")
```

GitHub-Dokumentation analysieren:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="Was sind die Installationsschritte und die Hauptfunktionen?")
```

Markdown-Inhalte abrufen (für Server, die Markdown für Agents unterstützen):

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extrahiere die wichtigsten Informationen", format="markdown")
```

## Wichtige Hinweise

- **Einzel-URL-Verarbeitung:** `web_fetch` verarbeitet jeweils eine URL. Um mehrere URLs zu analysieren, rufe das Werkzeug getrennt auf.
- **URL-Format:** Das Werkzeug aktualisiert automatisch HTTP-URLs auf HTTPS und wandelt GitHub-Blob-URLs in das Rohformat um, um einen besseren Zugriff auf den Inhalt zu ermöglichen.
- **Inhaltsaushandlung:** Das Werkzeug unterstützt die Inhaltsaushandlung "Markdown für Agents". Bei Verwendung von `format="auto"` (Standard) sendet es `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`, sodass Server, die Markdown unterstützen, diesen direkt statt HTML zurückgeben können. Der niederpriore `*/*`-Fallback hält rein JSON-APIs und andere Nicht-Text-Endpunkte abrufbar. Dies kann die Token-Nutzung um bis zu 80 % reduzieren.
- **Inhaltsverarbeitung:** Das Werkzeug ruft den Inhalt direkt ab und verarbeitet ihn mit einem KI-Modell. Wenn der Server HTML zurückgibt, konvertiert es ihn in ein lesbares Textformat. Wenn der Server Markdown, Klartext oder einen anderen Fallback-Inhaltstyp wie JSON zurückgibt, wird der Inhalt unverändert verwendet.
- **Ausgabequalität:** Die Qualität der Ausgabe hängt von der Klarheit der Anweisungen im Prompt ab.
- **MCP-Werkzeuge:** Falls ein MCP-basiertes Web-Fetch-Werkzeug verfügbar ist (beginnend mit "mcp\_\_"), verwende vorzugsweise dieses, da es möglicherweise weniger Einschränkungen hat.

## Unterstützung von Markdown für Agents

Das `web_fetch`-Werkzeug von Qwen Code implementiert Unterstützung für die [Markdown für Agents]-Spezifikation von Cloudflare (https://blog.cloudflare.com/markdown-for-agents/). Diese Funktion ermöglicht es Websites, KI-Agenten Markdown-Inhalte direkt bereitzustellen, was die Token-Nutzung im Vergleich zum Parsen von HTML erheblich reduziert.

### Funktionsweise

1. Der Parameter `format` steuert **nur** den an den Server gesendeten `Accept`-Header (er beeinflusst nicht das Ausgabeformat):
   - `format="auto"`: sendet `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`
   - `format="markdown"`: sendet `Accept: text/markdown, */*;q=0.1`
   - `format="html"`: sendet `Accept: text/html, */*;q=0.1`
   - `format="text"`: sendet `Accept: text/plain, */*;q=0.1`
2. Wenn der Server Markdown unterstützt, gibt er `Content-Type: text/markdown` zurück.
3. Das Werkzeug verwendet Markdown- oder Klartextinhalte direkt ohne Konvertierung.
4. Wenn der Server HTML zurückgibt, konvertiert er es für die LLM-Verarbeitung in ein lesbares Textformat; Markdown, Klartext und Fallback-Inhaltstypen wie JSON werden unverändert verwendet.
5. Alle Inhalte werden vor der Verarbeitung durch das KI-Modell in Text normalisiert.
### Vorteile

- **Token-Effizienz:** Markdown-Inhalte benötigen typischerweise 80 % weniger Tokens als äquivalentes HTML
- **Bessere Struktur:** Markdown bewahrt die semantische Struktur (Überschriften, Listen usw.)
- **Abwärtskompatibel:** Funktioniert mit allen Websites, verbesserte Erfahrung für unterstützende Server

### Beispielserver mit Markdown-Unterstützung

- Cloudflare Developer Documentation
- Cloudflare Blog
- Jede Website, die Cloudflares „Markdown for Agents“-Funktion verwendet
