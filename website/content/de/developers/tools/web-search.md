# Websuche-Tool (`web_search`)

Dieses Dokument beschreibt das `web_search`-Tool zur Durchführung von Websuchen unter Verwendung mehrerer Anbieter.

## Beschreibung

Verwenden Sie `web_search`, um eine Websuche durchzuführen und Informationen aus dem Internet zu erhalten. Das Tool unterstützt mehrere Suchanbieter und gibt eine prägnante Antwort mit Quellenangaben zurück, wenn verfügbar.

### Unterstützte Anbieter

1. **DashScope** (Offiziell, Kostenlos) - Automatisch verfügbar für Qwen OAuth-Benutzer (200 Anfragen/Minute, 1000 Anfragen/Tag)
2. **Tavily** - Hochwertige Such-API mit integrierter Antwortgenerierung
3. **Google Custom Search** - Googles Custom Search JSON API

### Argumente

`web_search` akzeptiert zwei Argumente:

- `query` (Zeichenkette, erforderlich): Die Suchabfrage
- `provider` (Zeichenkette, optional): Spezifischer zu verwendender Anbieter ("dashscope", "tavily", "google")
  - Wenn nicht angegeben, wird der Standardanbieter aus der Konfiguration verwendet

## Konfiguration

### Methode 1: Einstellungsdatei (Empfohlen)

Fügen Sie Ihrer `settings.json` folgenden Inhalt hinzu:

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

- DashScope erfordert keinen API-Schlüssel (offizieller, kostenloser Service)
- **Qwen-OAuth-Benutzer:** DashScope wird automatisch zu Ihrer Anbieterliste hinzugefügt, auch wenn es nicht explizit konfiguriert ist
- Konfigurieren Sie zusätzliche Anbieter (Tavily, Google), wenn Sie diese neben DashScope nutzen möchten
- Legen Sie `default` fest, um den standardmäßig zu verwendenden Anbieter anzugeben (wenn nicht gesetzt, gilt die Prioritätsreihenfolge: Tavily > Google > DashScope)

### Methode 2: Umgebungsvariablen

Legen Sie Umgebungsvariablen in Ihrer Shell oder `.env`-Datei fest:

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"
```

# Google
export GOOGLE_API_KEY="dein-api-schlüssel"
export GOOGLE_SEARCH_ENGINE_ID="deine-engine-id"
```

### Methode 3: Befehlszeilenargumente

Übergeben Sie API-Schlüssel beim Ausführen von Qwen Code:

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key dein-schlüssel --google-search-engine-id deine-id

# Standardanbieter festlegen
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

**Wichtig:** Diese Konfiguration ist veraltet und wird in einer zukünftigen Version entfernt. Bitte migrieren Sie zum neuen `webSearch`-Konfigurationsformat wie oben gezeigt. Die alte Konfiguration richtet automatisch Tavily als Anbieter ein, aber wir empfehlen dringend, Ihre Konfiguration zu aktualisieren.

## Deaktivieren der Websuche

Wenn Sie die Websuchfunktion deaktivieren möchten, können Sie das Tool `web_search` in Ihrer `settings.json` ausschließen:

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Hinweis:** Diese Einstellung erfordert einen Neustart von Qwen Code, um wirksam zu werden. Sobald deaktiviert, steht das Tool `web_search` dem Modell nicht mehr zur Verfügung, selbst wenn Websuchanbieter konfiguriert sind.

## Verwendungsbeispiele

### Grundlegende Suche (mit Standardanbieter)

```
web_search(query="neueste Entwicklungen in der KI")
```

### Suche mit spezifischem Anbieter

```
web_search(query="neueste Entwicklungen in der KI", provider="tavily")
```

### Praxisbeispiele

```
web_search(query="Wetter heute in San Francisco")
web_search(query="aktuelle Node.js LTS-Version", provider="google")
web_search(query="Best Practices für React 19", provider="dashscope")
```

## Anbieterdetails

### DashScope (Offiziell)

- **Kosten:** Kostenlos
- **Authentifizierung:** Automatisch verfügbar bei Verwendung der Qwen OAuth-Authentifizierung
- **Konfiguration:** Kein API-Schlüssel erforderlich, wird automatisch zur Providerliste für Qwen OAuth-Benutzer hinzugefügt
- **Kontingent:** 200 Anfragen/Minute, 1000 Anfragen/Tag
- **Am besten geeignet für:** Allgemeine Abfragen, immer als Fallback für Qwen OAuth-Benutzer verfügbar
- **Automatische Registrierung:** Wenn Sie Qwen OAuth verwenden, wird DashScope automatisch zu Ihrer Providerliste hinzugefügt, auch wenn Sie es nicht explizit konfigurieren

### Tavily

- **Kosten:** Erfordert API-Schlüssel (kostenpflichtiger Service mit kostenloser Stufe)
- **Registrierung:** https://tavily.com
- **Funktionen:** Hochwertige Ergebnisse mit KI-generierten Antworten
- **Am besten geeignet für:** Recherche, umfassende Antworten mit Zitaten

### Google Custom Search

- **Kosten:** Kostenlose Testversion verfügbar (100 Abfragen/Tag)
- **Einrichtung:**
  1. Aktivieren Sie die Custom Search API in der Google Cloud Console
  2. Erstellen Sie eine Custom Search Engine unter https://programmablesearchengine.google.com
- **Funktionen:** Googles Suchqualität
- **Am besten geeignet für:** Spezifische, sachliche Abfragen

## Wichtige Hinweise

- **Antwortformat:** Gibt eine prägnante Antwort mit nummerierten Quellenangaben zurück
- **Zitate:** Quelllinks werden als nummerierte Liste angehängt: [1], [2], usw.
- **Mehrere Anbieter:** Wenn ein Anbieter ausfällt, geben Sie manuell einen anderen über den Parameter `provider` an
- **DashScope-Verfügbarkeit:** Automatisch für Qwen OAuth-Benutzer verfügbar, keine Konfiguration erforderlich
- **Standardanbieterauswahl:** Das System wählt automatisch einen Standardanbieter basierend auf Verfügbarkeit:
  1. Ihre explizite `default`-Konfiguration (höchste Priorität)
  2. CLI-Argument `--web-search-default`
  3. Erster verfügbaren Anbieter nach Priorität: Tavily > Google > DashScope

## Problembehandlung

**Werkzeug nicht verfügbar?**

- **Für Qwen OAuth-Benutzer:** Das Werkzeug wird automatisch beim DashScope-Anbieter registriert, keine Konfiguration erforderlich
- **Für andere Authentifizierungstypen:** Stellen Sie sicher, dass mindestens ein Anbieter (Tavily oder Google) konfiguriert ist
- Für Tavily/Google: Überprüfen Sie, ob Ihre API-Schlüssel korrekt sind

**Anbieterspezifische Fehler?**

- Verwenden Sie den Parameter `provider`, um einen anderen Suchanbieter auszuprobieren
- Prüfen Sie Ihre API-Kontingente und Ratenlimits
- Stellen Sie sicher, dass die API-Schlüssel in der Konfiguration richtig gesetzt sind

**Benötigen Sie Hilfe?**

- Überprüfen Sie Ihre Konfiguration: Führen Sie `qwen` aus und verwenden Sie den Einstellungsdialog
- Sehen Sie sich Ihre aktuellen Einstellungen in `~/.qwen-code/settings.json` (macOS/Linux) oder `%USERPROFILE%\.qwen-code\settings.json` (Windows) an