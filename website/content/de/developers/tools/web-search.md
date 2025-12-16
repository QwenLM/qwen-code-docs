# Web-Suchwerkzeug (`web_search`)

Dieses Dokument beschreibt das `web_search`-Werkzeug zum Durchführen von Websuchen mit mehreren Anbietern.

## Beschreibung

Verwenden Sie `web_search`, um eine Websuche durchzuführen und Informationen aus dem Internet zu erhalten. Das Werkzeug unterstützt mehrere Suchanbieter und gibt eine prägnante Antwort mit Quellenangaben zurück, sofern verfügbar.

### Unterstützte Anbieter

1. **DashScope** (Offiziell, Kostenlos) - Automatisch verfügbar für Qwen-OAuth-Benutzer (200 Anfragen/Minute, 2000 Anfragen/Tag)
2. **Tavily** - Hochwertige Such-API mit integrierter Antwortgenerierung
3. **Google Custom Search** - Googles Custom Search JSON-API

### Argumente

`web_search` akzeptiert zwei Argumente:

- `query` (String, erforderlich): Die Suchanfrage
- `provider` (String, optional): Spezifischer Anbieter, der verwendet werden soll ("dashscope", "tavily", "google")
  - Wenn nicht angegeben, wird der Standardanbieter aus der Konfiguration verwendet

## Konfiguration

### Methode 1: Einstellungsdatei (empfohlen)

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

- DashScope benötigt keinen API-Schlüssel (offizieller, kostenloser Service)
- **Qwen OAuth-Nutzer:** DashScope wird automatisch zu deiner Anbieterliste hinzugefügt, auch wenn es nicht explizit konfiguriert ist
- Konfiguriere zusätzliche Anbieter (Tavily, Google), falls du diese neben DashScope nutzen möchtest
- Setze `default`, um festzulegen, welcher Anbieter standardmäßig verwendet werden soll (wenn nicht gesetzt, Reihenfolge der Priorität: Tavily > Google > DashScope)

### Methode 2: Umgebungsvariablen

Setze Umgebungsvariablen in deiner Shell oder in der `.env`-Datei:

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### Methode 3: Befehlszeilenargumente

Übergeben Sie API-Schlüssel beim Ausführen von Qwen Code:

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# Standardanbieter festlegen
qwen --web-search-default tavily
```

### Abwärtskompatibilität (Veraltet)

⚠️ **VERALTET:** Die alte `tavilyApiKey`-Konfiguration wird aus Gründen der Abwärtskompatibilität noch unterstützt, ist jedoch veraltet:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Veraltet
  }
}
```

**Wichtig:** Diese Konfiguration ist veraltet und wird in einer zukünftigen Version entfernt. Bitte migrieren Sie zum neuen `webSearch`-Konfigurationsformat wie oben gezeigt. Die alte Konfiguration wird automatisch Tavily als Anbieter konfigurieren, aber wir empfehlen dringend, Ihre Konfiguration zu aktualisieren.

## Deaktivieren der Websuche

Wenn du die Websuchfunktionalität deaktivieren möchtest, kannst du das `web_search`-Tool in deiner `settings.json` ausschließen:

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Hinweis:** Diese Einstellung erfordert einen Neustart von Qwen Code, um wirksam zu werden. Sobald deaktiviert, steht dem Modell das `web_search`-Tool nicht mehr zur Verfügung, selbst wenn Websuchanbieter konfiguriert sind.

## Verwendungsbeispiele

### Grundlegende Suche (mit Standardanbieter)

```
web_search(query="neueste Fortschritte in der KI")
```

### Suche mit spezifischem Anbieter

```
web_search(query="neueste Fortschritte in der KI", provider="tavily")
```

### Praxisbeispiele

```
web_search(query="Wetter in San Francisco heute")
web_search(query="neueste Node.js LTS-Version", provider="google")
web_search(query="Best Practices für React 19", provider="dashscope")
```

## Anbieterdetails

### DashScope (Offiziell)

- **Kosten:** Kostenlos
- **Authentifizierung:** Automatisch verfügbar bei Verwendung der Qwen OAuth-Authentifizierung
- **Konfiguration:** Kein API-Schlüssel erforderlich, wird automatisch zur Anbieterliste für Qwen OAuth-Benutzer hinzugefügt
- **Kontingent:** 200 Anfragen/Minute, 2000 Anfragen/Tag
- **Am besten geeignet für:** Allgemeine Abfragen, immer als Fallback für Qwen OAuth-Benutzer verfügbar
- **Automatische Registrierung:** Wenn Sie Qwen OAuth verwenden, wird DashScope automatisch zu Ihrer Anbieterliste hinzugefügt, selbst wenn Sie es nicht explizit konfigurieren

### Tavily

- **Kosten:** Erfordert API-Schlüssel (kostenpflichtiger Service mit kostenlosem Tarif)
- **Registrierung:** https://tavily.com
- **Funktionen:** Hochwertige Ergebnisse mit KI-generierten Antworten
- **Am besten geeignet für:** Recherche, umfassende Antworten mit Quellenangaben

### Google Custom Search

- **Kosten:** Kostenlose Stufe verfügbar (100 Abfragen/Tag)
- **Einrichtung:**
  1. Aktiviere die Custom Search API in der Google Cloud Console
  2. Erstelle eine benutzerdefinierte Suchmaschine unter https://programmablesearchengine.google.com
- **Funktionen:** Googles Suchqualität
- **Am besten geeignet für:** Spezifische, sachliche Abfragen

## Wichtige Hinweise

- **Antwortformat:** Gibt eine präzise Antwort mit nummerierten Quellenangaben zurück
- **Quellenangaben:** Quellenlinks werden als nummerierte Liste angehängt: [1], [2], usw.
- **Mehrere Anbieter:** Wenn ein Anbieter ausfällt, wähle manuell einen anderen über den Parameter `provider` aus
- **DashScope Verfügbarkeit:** Automatisch verfügbar für Qwen OAuth Benutzer, keine Konfiguration erforderlich
- **Standardanbieter-Auswahl:** Das System wählt automatisch einen Standardanbieter basierend auf der Verfügbarkeit aus:
  1. Deine explizite `default` Konfiguration (höchste Priorität)
  2. CLI Argument `--web-search-default`
  3. Erster verfügbarer Anbieter nach Priorität: Tavily > Google > DashScope

## Fehlerbehebung

**Tool nicht verfügbar?**

- **Für Qwen OAuth-Nutzer:** Das Tool ist automatisch beim DashScope-Anbieter registriert, keine Konfiguration erforderlich
- **Für andere Authentifizierungstypen:** Stellen Sie sicher, dass mindestens ein Anbieter (Tavily oder Google) konfiguriert ist
- Für Tavily/Google: Überprüfen Sie, ob Ihre API-Schlüssel korrekt sind

**Anbieterspezifische Fehler?**

- Verwenden Sie den Parameter `provider`, um einen anderen Suchanbieter zu testen
- Prüfen Sie Ihre API-Kontingente und Ratenbegrenzungen
- Vergewissern Sie sich, dass die API-Schlüssel in der Konfiguration richtig gesetzt sind

**Brauchen Sie Hilfe?**

- Überprüfen Sie Ihre Konfiguration: Führen Sie `qwen` aus und verwenden Sie den Einstellungsdialog
- Sehen Sie sich Ihre aktuellen Einstellungen in `~/.qwen-code/settings.json` (macOS/Linux) oder `%USERPROFILE%\.qwen-code\settings.json` (Windows) an