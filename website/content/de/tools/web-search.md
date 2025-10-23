# Web Search Tool (`web_search`)

Dieses Dokument beschreibt das `web_search` Tool.

## Beschreibung

Verwende `web_search`, um eine Websuche über die Tavily API durchzuführen. Das Tool gibt nach Möglichkeit eine präzise Antwort mit Quellen zurück.

### Argumente

`web_search` akzeptiert ein Argument:

- `query` (string, erforderlich): Die Suchanfrage.

## Verwendung von `web_search`

`web_search` ruft die Tavily API direkt auf. Du musst den `TAVILY_API_KEY` über eine der folgenden Methoden konfigurieren:

1. **Settings-Datei**: Füge `"tavilyApiKey": "your-key-here"` zu deiner `settings.json` hinzu  
2. **Umgebungsvariable**: Setze `TAVILY_API_KEY` in deiner Umgebung oder in der `.env` Datei  
3. **Kommandozeile**: Verwende `--tavily-api-key your-key-here` beim Starten der CLI

Wenn der API-Key nicht konfiguriert ist, wird das Tool deaktiviert und übersprungen.

Verwendung:

```
web_search(query="Your query goes here.")
```

## `web_search` Beispiele

Informationen zu einem Thema abrufen:

```
web_search(query="latest advancements in AI-powered code generation")
```

## Wichtige Hinweise

- **Zurückgegebene Antwort:** Das `web_search` Tool liefert eine prägnante Antwort, wenn verfügbar, zusammen mit einer Liste von Quelllinks.
- **Zitate:** Quelllinks werden als nummerierte Liste angehängt.
- **API key:** Konfiguriere `TAVILY_API_KEY` über settings.json, Umgebungsvariablen, .env Dateien oder Kommandozeilenargumente. Wenn nicht konfiguriert, wird das Tool nicht registriert.