# Web-Suchtool (`web_search`)

Dieses Dokument beschreibt das Tool `web_search` zum Durchführen von Websuchen über mehrere Anbieter.

## Beschreibung

Verwenden Sie `web_search`, um eine Websuche durchzuführen und Informationen aus dem Internet abzurufen. Das Tool unterstützt mehrere Suchanbieter und liefert – falls verfügbar – eine prägnante Antwort mit Quellenangaben.

### Unterstützte Anbieter

1. **DashScope** (offiziell, kostenlos) – Automatisch für Qwen-OAuth-Nutzer verfügbar (200 Anfragen/Minute, 1000 Anfragen/Tag)
2. **Tavily** – Hochwertige Such-API mit integrierter Antwortgenerierung
3. **Google Custom Search** – Googles Custom Search JSON API

### Argumente

`web_search` akzeptiert zwei Argumente:

- `query` (Zeichenkette, erforderlich): Die Suchanfrage
- `provider` (Zeichenkette, optional): Der zu verwendende spezifische Anbieter (`"dashscope"`, `"tavily"`, `"google"`)
  - Falls nicht angegeben, wird der Standardanbieter aus der Konfiguration verwendet

## Konfiguration

### Methode 1: Einstellungsdatei (empfohlen)

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

- DashScope benötigt keinen API-Schlüssel (offizieller, kostenloser Dienst).
- **Qwen-OAuth-Benutzer:** DashScope wird automatisch zu Ihrer Anbieterliste hinzugefügt, auch wenn es nicht explizit konfiguriert ist.
- Konfigurieren Sie zusätzliche Anbieter (Tavily, Google), falls Sie diese neben DashScope nutzen möchten.
- Legen Sie `default` fest, um anzugeben, welcher Anbieter standardmäßig verwendet werden soll (wenn nicht festgelegt, gilt die Prioritätsreihenfolge: Tavily > Google > DashScope).

### Methode 2: Umgebungsvariablen

Legen Sie die Umgebungsvariablen in Ihrer Shell oder in der Datei `.env` fest:

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="Ihr-API-Schlüssel"
export GOOGLE_SEARCH_ENGINE_ID="Ihre-Engine-ID"
```

### Methode 3: Befehlszeilenargumente

Übergeben Sie API-Schlüssel beim Ausführen von Qwen Code:

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key Ihr-Schlüssel --google-search-engine-id Ihre-ID

# Standardanbieter festlegen
qwen --web-search-default tavily
```

### Abwärtskompatibilität (veraltet)

⚠️ **VERALTET:** Die veraltete Konfiguration `tavilyApiKey` wird aus Gründen der Abwärtskompatibilität weiterhin unterstützt, ist jedoch als veraltet gekennzeichnet:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Veraltet
  }
}
```

**Wichtig:** Diese Konfiguration ist veraltet und wird in einer zukünftigen Version entfernt. Bitte migrieren Sie zur neuen `webSearch`-Konfigurationsstruktur, wie oben gezeigt. Die alte Konfiguration konfiguriert automatisch Tavily als Anbieter, wir empfehlen jedoch dringend, Ihre Konfiguration zu aktualisieren.

## Deaktivieren der Websuche

Wenn Sie die Websuchfunktion deaktivieren möchten, können Sie das Tool `web_search` in Ihrer Datei `settings.json` ausschließen:

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Hinweis:** Diese Einstellung erfordert einen Neustart von Qwen Code, um wirksam zu werden. Sobald sie deaktiviert ist, steht das Tool `web_search` dem Modell nicht mehr zur Verfügung – selbst dann nicht, wenn Web-Suchanbieter konfiguriert sind.

## Verwendungsbeispiele

### Grundlegende Suche (mit Standardanbieter)

```
web_search(query="neueste Fortschritte in der KI")
```

### Suche mit einem bestimmten Anbieter

```
web_search(query="neueste Fortschritte in der KI", provider="tavily")
```

### Praxisbeispiele

```
web_search(query="Wetter in San Francisco heute")
web_search(query="neueste Node.js-LTS-Version", provider="google")
web_search(query="Best Practices für React 19", provider="dashscope")
```

## Details zu den Anbietern

### DashScope (offiziell)

- **Kosten:** Kostenlos  
- **Authentifizierung:** Automatisch verfügbar, wenn Sie die Qwen-OAuth-Authentifizierung verwenden  
- **Konfiguration:** Kein API-Schlüssel erforderlich; wird automatisch zur Anbieterliste für Qwen-OAuth-Nutzer hinzugefügt  
- **Kontingent:** 200 Anfragen/Minute, 1000 Anfragen/Tag  
- **Ideal für:** Allgemeine Abfragen; immer als Fallback für Qwen-OAuth-Nutzer verfügbar  
- **Automatische Registrierung:** Wenn Sie Qwen OAuth verwenden, wird DashScope automatisch zu Ihrer Anbieterliste hinzugefügt – auch ohne explizite Konfiguration  

### Tavily

- **Kosten:** Erfordert einen API-Schlüssel (kostenpflichtiger Dienst mit kostenlosem Basis-Tarif)  
- **Registrierung:** https://tavily.com  
- **Funktionen:** Hochwertige Ergebnisse mit von KI generierten Antworten  
- **Ideal für:** Recherchen, umfassende Antworten mit Quellenangaben

### Google Custom Search

- **Kosten:** Kostenlose Stufe verfügbar (100 Abfragen/Tag)
- **Einrichtung:**
  1. Aktivieren Sie die Custom Search-API in der Google Cloud Console.
  2. Erstellen Sie eine Custom Search Engine unter https://programmablesearchengine.google.com.
- **Funktionen:** Die Suchqualität von Google
- **Am besten geeignet für:** Spezifische, sachliche Abfragen

## Wichtige Hinweise

- **Antwortformat:** Gibt eine prägnante Antwort mit nummerierten Quellenangaben zurück.
- **Quellenangaben:** Quelllinks werden als nummerierte Liste angehängt: [1], [2] usw.
- **Mehrere Anbieter:** Falls ein Anbieter fehlschlägt, geben Sie manuell einen anderen über den Parameter `provider` an.
- **DashScope-Verfügbarkeit:** Für Qwen-OAuth-Benutzer automatisch verfügbar – keine Konfiguration erforderlich.
- **Auswahl des Standardanbieters:** Das System wählt automatisch einen Standardanbieter basierend auf Verfügbarkeit aus:
  1. Ihre explizite `default`-Konfiguration (höchste Priorität)
  2. CLI-Argument `--web-search-default`
  3. Erster verfügbare Anbieter nach Priorität: Tavily > Google > DashScope

## Problembehandlung

**Tool nicht verfügbar?**

- **Für Qwen-OAuth-Benutzer:** Das Tool wird automatisch beim DashScope-Anbieter registriert; keine Konfiguration erforderlich.
- **Für andere Authentifizierungstypen:** Stellen Sie sicher, dass mindestens ein Anbieter (Tavily oder Google) konfiguriert ist.
- Für Tavily/Google: Überprüfen Sie, ob Ihre API-Schlüssel korrekt sind.

**Anbieterspezifische Fehler?**

- Verwenden Sie den Parameter `provider`, um einen anderen Suchanbieter auszuprobieren.
- Prüfen Sie Ihre API-Kontingente und Rate-Limits.
- Stellen Sie sicher, dass die API-Schlüssel ordnungsgemäß in der Konfiguration gesetzt sind.

**Brauchen Sie Hilfe?**

- Überprüfen Sie Ihre Konfiguration: Führen Sie `qwen` aus und verwenden Sie den Einstellungsdialog.
- Zeigen Sie Ihre aktuellen Einstellungen in `~/.qwen-code/settings.json` (macOS/Linux) oder `%USERPROFILE%\.qwen-code\settings.json` (Windows) an.