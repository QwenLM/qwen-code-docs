# Web-Such-Tool (`web_search`)

Dieses Dokument beschreibt das `web_search`-Tool zum Durchführen von Websuchen mit mehreren Anbietern.

## Beschreibung

Verwende `web_search`, um eine Websuche durchzuführen und Informationen aus dem Internet abzurufen. Das Tool unterstützt mehrere Suchanbieter und gibt bei Verfügbarkeit eine präzise Antwort mit Quellenangaben zurück.

### Unterstützte Anbieter

1. **DashScope** (Offiziell, Kostenlos) – Automatisch verfügbar für Qwen OAuth-Nutzer (200 Anfragen/Minute, 1000 Anfragen/Tag)
2. **Tavily** – Hochwertige Search-API mit integrierter Antwortgenerierung
3. **Google Custom Search** – Googles Custom Search JSON API

### Argumente

`web_search` akzeptiert zwei Argumente:

- `query` (string, erforderlich): Die Suchanfrage
- `provider` (string, optional): Spezifischer zu verwendender Anbieter ("dashscope", "tavily", "google")
  - Falls nicht angegeben, wird der Standardanbieter aus der Konfiguration verwendet

## Konfiguration

### Methode 1: Einstellungsdatei (Empfohlen)

Füge Folgendes zu deiner `settings.json` hinzu:

```json
{
  "webSearch": {
    "provider": [
      { "type": "dashscope" },
      { "type": "tavily", "apiKey": "tvly-xxxxx" },
      {
        "type": "google",
        "apiKey": "your-google-api-key",
        "searchEngineId": "your-search-engine-id"
      }
    ],
    "default": "dashscope"
  }
}
```

**Hinweise:**

- DashScope erfordert keinen API-Key (offizieller, kostenloser Service)
- **Qwen OAuth-Nutzer:** DashScope wird automatisch zu deiner Anbieterliste hinzugefügt, auch wenn es nicht explizit konfiguriert ist
- Konfiguriere zusätzliche Anbieter (Tavily, Google), wenn du sie parallel zu DashScope nutzen möchtest
- Lege `default` fest, um den standardmäßig zu verwendenden Anbieter anzugeben (falls nicht gesetzt, gilt folgende Prioritätsreihenfolge: Tavily > Google > DashScope)

### Methode 2: Umgebungsvariablen

Lege Umgebungsvariablen in deiner Shell oder `.env`-Datei fest:

```bash
# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### Methode 3: Befehlszeilenargumente

Übergib API-Keys beim Starten von Qwen Code:

```bash
# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# Specify default provider
qwen --web-search-default tavily
```

### Abwärtskompatibilität (Veraltet)

⚠️ **VERALTET:** Die Legacy-Konfiguration `tavilyApiKey` wird aus Gründen der Abwärtskompatibilität noch unterstützt, ist jedoch veraltet:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Deprecated
  }
}
```

**Wichtig:** Diese Konfiguration ist veraltet und wird in einer zukünftigen Version entfernt. Bitte migriere zum neuen `webSearch`-Konfigurationsformat, das oben gezeigt wird. Die alte Konfiguration richtet Tavily automatisch als Anbieter ein, wir empfehlen jedoch dringend, deine Konfiguration zu aktualisieren.

## Deaktivieren der Websuche

Wenn du die Websuchfunktion deaktivieren möchtest, kannst du das `web_search`-Tool in deiner `settings.json` ausschließen:

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Hinweis:** Diese Einstellung erfordert einen Neustart von Qwen Code, um wirksam zu werden. Nach der Deaktivierung steht das `web_search`-Tool dem Modell nicht mehr zur Verfügung, selbst wenn Websuchanbieter konfiguriert sind.

## Anwendungsbeispiele

### Grundlegende Suche (unter Verwendung des Standardanbieters)

```
web_search(query="latest advancements in AI")
```

### Suche mit spezifischem Anbieter

```
web_search(query="latest advancements in AI", provider="tavily")
```

### Praxisbeispiele

```
web_search(query="weather in San Francisco today")
web_search(query="latest Node.js LTS version", provider="google")
web_search(query="best practices for React 19", provider="dashscope")
```

## Anbieterdetails

### DashScope (Offiziell)

- **Kosten:** Kostenlos
- **Authentifizierung:** Automatisch verfügbar bei Verwendung der Qwen OAuth-Authentifizierung
- **Konfiguration:** Kein API-Key erforderlich, wird automatisch zur Anbieterliste für Qwen OAuth-Nutzer hinzugefügt
- **Kontingent:** 200 Anfragen/Minute, 1000 Anfragen/Tag
- **Am besten geeignet für:** Allgemeine Anfragen, immer als Fallback für Qwen OAuth-Nutzer verfügbar
- **Automatische Registrierung:** Wenn du Qwen OAuth verwendest, wird DashScope automatisch zu deiner Anbieterliste hinzugefügt, auch wenn du es nicht explizit konfigurierst

### Tavily

- **Kosten:** Erfordert API-Key (kostenpflichtiger Service mit kostenlosem Kontingent)
- **Registrierung:** https://tavily.com
- **Funktionen:** Hochwertige Ergebnisse mit KI-generierter Antwort
- **Am besten geeignet für:** Recherche, umfassende Antworten mit Quellenangaben

### Google Custom Search

- **Kosten:** Kostenloses Kontingent verfügbar (100 Anfragen/Tag)
- **Einrichtung:**
  1. Aktiviere die Custom Search API in der Google Cloud Console
  2. Erstelle eine Custom Search Engine unter https://programmablesearchengine.google.com
- **Funktionen:** Googles Suchqualität
- **Am besten geeignet für:** Spezifische, faktenbasierte Anfragen

## Wichtige Hinweise

- **Antwortformat:** Gibt eine präzise Antwort mit nummerierten Quellenangaben zurück
- **Quellenangaben:** Quell-Links werden als nummerierte Liste angehängt: [1], [2] usw.
- **Mehrere Anbieter:** Falls ein Anbieter fehlschlägt, gib manuell einen anderen über den `provider`-Parameter an
- **DashScope-Verfügbarkeit:** Automatisch verfügbar für Qwen OAuth-Nutzer, keine Konfiguration erforderlich
- **Auswahl des Standardanbieters:** Das System wählt automatisch einen Standardanbieter basierend auf der Verfügbarkeit aus:
  1. Deine explizite `default`-Konfiguration (höchste Priorität)
  2. CLI-Argument `--web-search-default`
  3. Erster verfügbarer Anbieter nach Priorität: Tavily > Google > DashScope

## Fehlerbehebung

**Tool nicht verfügbar?**

- **Für Qwen OAuth-Nutzer:** Das Tool wird automatisch mit dem DashScope-Anbieter registriert, keine Konfiguration erforderlich
- **Für andere Authentifizierungstypen:** Stelle sicher, dass mindestens ein Anbieter (Tavily oder Google) konfiguriert ist
- Für Tavily/Google: Überprüfe, ob deine API-Keys korrekt sind

**Anbieterspezifische Fehler?**

- Verwende den `provider`-Parameter, um einen anderen Suchanbieter zu testen
- Überprüfe deine API-Kontingente und Ratenlimits
- Stelle sicher, dass die API-Keys korrekt in der Konfiguration hinterlegt sind

**Brauchst du Hilfe?**

- Überprüfe deine Konfiguration: Führe `qwen` aus und verwende den Einstellungsdialog
- Zeige deine aktuellen Einstellungen in `~/.qwen-code/settings.json` (macOS/Linux) oder `%USERPROFILE%\.qwen-code\settings.json` (Windows) an