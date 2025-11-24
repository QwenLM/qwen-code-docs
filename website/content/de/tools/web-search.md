# Web-Such-Tool (`web_search`)

Dieses Dokument beschreibt das `web_search`-Tool zum Durchführen von Websuchen mit mehreren Anbietern.

## Beschreibung

Verwende `web_search`, um eine Websuche durchzuführen und Informationen aus dem Internet zu erhalten. Das Tool unterstützt mehrere Suchanbieter und liefert eine präzise Antwort mit Quellenangaben, sofern verfügbar.

### Unterstützte Anbieter

1. **DashScope** (Offiziell, Kostenlos) – Automatisch verfügbar für Qwen-OAuth-Benutzer (200 Anfragen/Minute, 2000 Anfragen/Tag)  
2. **Tavily** – Hochwertige Search-API mit integrierter Antwortgenerierung  
3. **Google Custom Search** – Googles Custom Search JSON API  

### Argumente

`web_search` akzeptiert zwei Argumente:

- `query` (string, erforderlich): Die Suchanfrage  
- `provider` (string, optional): Spezifischer Anbieter, der verwendet werden soll ("dashscope", "tavily", "google")  
  - Falls nicht angegeben, wird der Standardanbieter aus der Konfiguration verwendet  

## Konfiguration

### Methode 1: Settings File (Empfohlen)

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

- DashScope benötigt keinen API key (offizieller, kostenloser Service)
- **Qwen OAuth Nutzer:** DashScope wird automatisch zu deiner Provider-Liste hinzugefügt, auch wenn es nicht explizit konfiguriert ist
- Konfiguriere zusätzliche Provider (Tavily, Google), falls du diese neben DashScope nutzen möchtest
- Setze `default`, um festzulegen, welcher Provider standardmäßig verwendet werden soll (wenn nicht gesetzt, Reihenfolge der Priorität: Tavily > Google > DashScope)

### Methode 2: Umgebungsvariablen

Setze Umgebungsvariablen in deiner Shell oder in der `.env` Datei:

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"```

```markdown
# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### Methode 3: Command Line Arguments

API-Schlüssel beim Start von Qwen Code übergeben:

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# Standard-Provider festlegen
qwen --web-search-default tavily
```

### Abwärtskompatibilität (Veraltet)

⚠️ **VERALTET:** Die alte `tavilyApiKey`-Konfiguration wird aus Gründen der Abwärtskompatibilität noch unterstützt, ist aber veraltet:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Veraltet
  }
}
```

**Wichtig:** Diese Konfiguration ist veraltet und wird in zukünftigen Versionen entfernt. Bitte migriere zur neuen `webSearch`-Konfiguration, wie oben gezeigt. Die alte Konfiguration wird automatisch Tavily als Provider konfigurieren, aber wir empfehlen dringend, deine Konfiguration zu aktualisieren.
```

## Web-Suche deaktivieren

Wenn du die Web-Suchfunktionalität deaktivieren möchtest, kannst du das `web_search`-Tool in deiner `settings.json` ausschließen:

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Hinweis:** Diese Einstellung erfordert einen Neustart von Qwen Code, um wirksam zu werden. Sobald deaktiviert, steht das `web_search`-Tool dem Modell nicht mehr zur Verfügung, selbst wenn Web-Suchanbieter konfiguriert sind.

## Anwendungsbeispiele

### Einfache Suche (mit Standard-Anbieter)

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
- **Konfiguration:** Kein API-Key erforderlich, wird automatisch zur Provider-Liste für Qwen OAuth-Nutzer hinzugefügt
- **Quota:** 200 Anfragen/Minute, 2000 Anfragen/Tag
- **Empfohlen für:** Allgemeine Abfragen, immer als Fallback für Qwen OAuth-Nutzer verfügbar
- **Automatische Registrierung:** Wenn du Qwen OAuth verwendest, wird DashScope automatisch zu deiner Provider-Liste hinzugefügt, selbst wenn du es nicht explizit konfigurierst

### Tavily

- **Kosten:** Erfordert einen API-Key (kostenpflichtiger Service mit kostenlosem Plan)
- **Registrierung:** https://tavily.com
- **Funktionen:** Hochwertige Ergebnisse mit KI-generierten Antworten
- **Empfohlen für:** Recherche, umfassende Antworten mit Quellenangaben

### Google Custom Search

- **Kosten:** Kostenlose Stufe verfügbar (100 Abfragen/Tag)
- **Einrichtung:**
  1. Aktiviere die Custom Search API in der Google Cloud Console
  2. Erstelle eine Custom Search Engine unter https://programmablesearchengine.google.com
- **Funktionen:** Googles Suchqualität
- **Am besten geeignet für:** Spezifische, sachliche Abfragen

## Wichtige Hinweise

- **Antwortformat:** Gibt eine präzise Antwort mit nummerierten Quellenangaben zurück
- **Zitate:** Quellenlinks werden als nummerierte Liste angehängt: [1], [2], usw.
- **Mehrere Anbieter:** Falls ein Anbieter ausfällt, kannst du manuell einen anderen über den `provider` Parameter festlegen
- **DashScope Verfügbarkeit:** Automatisch verfügbar für Qwen OAuth Nutzer, keine zusätzliche Konfiguration nötig
- **Standardanbieter-Auswahl:** Das System wählt automatisch einen Standardanbieter basierend auf der Verfügbarkeit:
  1. Deine explizite `default` Konfiguration (höchste Priorität)
  2. CLI Argument `--web-search-default`
  3. Der erste verfügbare Anbieter nach Priorität: Tavily > Google > DashScope

## Fehlerbehebung

**Tool nicht verfügbar?**

- **Für Qwen OAuth-Nutzer:** Das Tool wird automatisch beim DashScope-Anbieter registriert, keine Konfiguration erforderlich
- **Für andere Authentifizierungstypen:** Stelle sicher, dass mindestens ein Anbieter (Tavily oder Google) konfiguriert ist
- Für Tavily/Google: Überprüfe, ob deine API-Schlüssel korrekt sind

**Anbieterspezifische Fehler?**

- Verwende den `provider`-Parameter, um einen anderen Suchanbieter auszuprobieren
- Prüfe deine API-Kontingente und Ratenlimits
- Vergewissere dich, dass die API-Schlüssel in der Konfiguration richtig gesetzt sind

**Brauchst du Hilfe?**

- Überprüfe deine Konfiguration: Führe `qwen` aus und verwende den Einstellungsdialog
- Sieh dir deine aktuellen Einstellungen in `~/.qwen-code/settings.json` (macOS/Linux) oder `%USERPROFILE%\.qwen-code\settings.json` (Windows) an