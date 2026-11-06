# Web-Suche

Qwen Code bietet Websuche auf zwei Arten:

1. **Integriertes `web_search`-Tool** — unterstützt durch die serverseitige Suche der DashScope Responses API oder, bei Qwen-Abonnement-Sitzungen, den Qwen MCP-Suchdienst. Aktiviert nach Anmeldung mit Plus-/Pro-Abonnement und standardmäßig beim Start für unterstützte ModelStudio- und OpenAI-kompatible DashScope-Konfigurationen aktiviert; keine zusätzliche Anbieter- oder MCP-Einrichtung erforderlich.
2. **MCP-Integrationen (Model Context Protocol)** — verbinden Sie einen beliebigen externen Suchdienst (Tavily, GLM und andere). Verwenden Sie dies, wenn Ihr Anbieter das integrierte Tool nicht bereitstellen kann.

## Integriertes `web_search` [#built-in-web_search]

Für DashScope sendet das integrierte Tool eine eigenständige Suchanfrage an ein kleines Hilfsmodell mit serverseitigen `web_search`- (und `web_extractor`-)Tools und gibt die narrativen Erkenntnisse sowie Quell-URLs zurück. Mit [Qwen Account with Subscription](../../users/configuration/auth.md) nutzt es den Qwen MCP-Suchdienst und Ihre aktuellen Anmeldeinformationen. Kein separates Such-API-Key, Hilfsmodell oder `mcpServers`-Konfiguration ist erforderlich. `webExtractor` gilt nur für die DashScope-Suche.

### Wenn es sich automatisch einschaltet

Wenn Sie unter `tools.webSearch` nichts konfiguriert haben, wird das Tool registriert, sobald das Modell, das Sie ausführen, die Suchanfrage mit denselben Credentials bereitstellen kann:

| Wie Sie sich angemeldet haben                                                                                                  | Integrierte Suche                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| [Qwen Account with Subscription](https://chat.qwen.ai/?memberPlan=qwen_code) — **Plus oder Pro**                             | aktiviert                                              |
| Alibaba ModelStudio → **Standard-API-Schlüssel**                                                                               | ein                                             |
| Alibaba ModelStudio → **Token Plan**                                                                                           | ein                                             |
| Alibaba ModelStudio → **Coding Plan**                                                                                          | aus — sein Endpunkt ist für diese API nicht verifiziert |
| QwenCloud → **Standard API Key**                                                                                           | aktiviert                                              |
| QwenCloud → **Token Plan**                                                                                                 | aktiviert                                              |
| Ein OpenAI-kompatibler `modelProviders`- oder Custom-Provider-Eintrag auf einem erkannten DashScope-Responses-Host mit direktem Schlüssel | ein                                             |
| Drittanbieter (OpenRouter, DeepSeek, ModelScope, …), benutzerdefinierte Endpunkte auf anderen Hosts, lokale Modelle            | aus                                             |

DashScope-Suchen belasten denselben Schlüssel wie Ihr Hauptmodell; Abonnement-Suchen nutzen Ihre Qwen-Anmeldedaten erneut. Die Berechtigungsverwaltung folgt dem aktiven Genehmigungsmodus und den Regeln; im `default`-Genehmigungsmodus fragt die erste Suche nach Bestätigung. Wenn Ihr Anbieter das Tool nicht unterstützen kann, erscheint es einfach nicht beim Start — keine Warnung beim Start.

So schalten Sie es aus:

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

oder `ENABLE_WEB_SEARCH=false`. Bare-Modus und Safe-Modus deaktivieren es immer.

### Explizite Konfiguration

Dieser Abschnitt konfiguriert die DashScope-Suche. Die Abonnement-Suche nutzt Ihre Mitgliedschaftsanmeldedaten und benötigt keine zusätzliche Einrichtung. Explizite Such-Einstellungen haben weiterhin Vorrang vor der automatischen Abonnement-Suche.

Richten Sie das Tool auf einen ModelStudio Standard/Token-Plan- oder einen anderen verifizierten DashScope-Responses-Eintrag. Dies ist nützlich, wenn Ihr Hauptmodell auf einem anderen Anbieter läuft und Sie einen separaten unterstützten DashScope-Schlüssel besitzen. Coding-Plan-Hosts sind von der automatischen Aktivierung ausgeschlossen, da die Responses-Such-Tools dort nicht verifiziert sind. Sie können explizit mit `tools.webSearch.model` aktivieren; wenn der Endpunkt sie nicht bereitstellt, schlägt die erste Suche lautstark fehl. Verwenden Sie einen MCP-Suchanbieter, wenn Sie sich nicht auf diesen unverified Pfad verlassen wollen.

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.8-flash",
        "envKey": "DASHSCOPE_API_KEY",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
      }
    ]
  },
  "tools": {
    "webSearch": {
      "enabled": true,
      "model": "qwen3.8-flash"
    }
  }
}
```

| Einstellung                    | Umgebungs-Override     | Bedeutung                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`    | Auf `false` setzen, um das Tool auszuschalten. Die implizite Startaktivierung erfordert, dass `enabled`, `model` und das reine Umgebungs-Backend nicht gesetzt sind. `true` zu setzen erlaubt automatische Ableitung nur wenn das reine Umgebungs-Backend ebenfalls nicht gesetzt ist; andernfalls ist ein `model` erforderlich.             |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`     | Suchmodell-Selektor für den expliziten Pfad (`modelId` oder `authType:modelId`). Mit `WEB_SEARCH_BASE_URL` ist es die reine Modell-ID für diesen Endpunkt; andernfalls muss es mit einem deklarierten DashScope-kompatiblen `modelProviders`-Eintrag übereinstimmen. Der automatische Pfad verwendet `qwen3.8-flash`.                            |
| `tools.webSearch.webExtractor`  | `WEB_SEARCH_EXTRACTOR`       | Dem Such-Agenten erlauben, Ergebnisseiten für besser fundierte Antworten zu öffnen (Standard `true`; wird von DashScope separat berechnet).                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tools.webSearch.timeoutMs`     | `WEB_SEARCH_TIMEOUT_MS`      | Gesamtzeitbudget für eine Suche in Millisekunden (Standard `120000`, Maximum `600000`; andere Werte fallen auf den Standard zurück). Eine Suche, der die Zeit ausgeht, gibt das Eingetroffene als Teilergebnis zurück, sobald mindestens ein Suchaufruf abgeschlossen ist; wenn das Budget abläuft, bevor der erste Suchaufruf fertig wird, meldet das Tool stattdessen einen Timeout-Fehler, da eine Erzählung ohne ausgeführte Suche kein überprüfbarer Nachweis ist. Eine pro-Tool-Ausführungsobergrenze (`QWEN_CODE_TOOL_EXECUTION_TIMEOUT_MS`) unterhalb dieses Budgets feuert zuerst und verwirft das Teilergebnis; lassen Sie sie über `timeoutMs`. |
| `tools.webSearch.allowedHosts`  | `WEB_SEARCH_ALLOWED_HOSTS`   | Zusätzliche Host-Suffixe, denen für ein von Ihnen explizit konfiguriertes Such-Backend vertraut wird — ein exakter Host oder jede Subdomain eines aufgelisteten Suffixes (durch Kommas getrennt in der Umgebungsvariable). Standardmäßig leer, sodass das Verhalten unverändert bleibt, außer wenn gesetzt. Nur das `WEB_SEARCH_BASE_URL`-Backend und der `modelProviders`-Pfad konsultieren dies; die automatische Ableitung tut dies nie, sodass ein benutzerdefinierter Host nur dort verwendet wird, wo Ihre eigene Konfiguration ihn nennt. Der konfigurierte Host erhält den API-Schlüssel. Einträge werden beschnitten und in Kleinbuchstaben umgewandelt, und Einträge ohne Punkt werden ignoriert.                                                 |
| `tools.webSearch.maxPerSession` | `WEB_SEARCH_MAX_PER_SESSION` | Maximale `web_search`-Aufrufe in einer Session (Standard `200`, Maximum `10000`; andere Werte fallen auf den Standard zurück). Das Zähler wird mit Subagents geteilt und setzt sich zurück, wenn die Session wechselt (`/clear`, `/resume`, Branching). Wenn er erreicht ist, werden weitere Suchen übersprungen und das Modell wird angewiesen, mit dem fortzufahren, was es gesammelt hat.                                                                                                                                                                                                                          |

### Nur-Umgebungsvariablen-Konfiguration (ohne settings.json)

Für Umgebungen, in denen keine Einstellungsdatei geschrieben werden kann (abgesicherte Container, CI mit reiner Env-Injection), kann das Tool vollständig über Umgebungsvariablen konfiguriert werden – kein `modelProviders`-Eintrag erforderlich:

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.8-flash
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export WEB_SEARCH_ALLOWED_HOSTS=llm-gw.example.com   # only for a gateway host
export DASHSCOPE_API_KEY=sk-...        # or set WEB_SEARCH_API_KEY instead
```

`WEB_SEARCH_BASE_URL` spiegelt einen `modelProviders`-Eintrag `baseUrl` wider und muss ein DashScope-kompatibler Endpunkt sein; wenn er gesetzt ist, hat er Vorrang vor der `modelProviders`-Auflösung, und `WEB_SEARCH_MODEL` wird als einfache DashScope-Modell-ID verwendet. Der API-Schlüssel wird aus `WEB_SEARCH_API_KEY` gelesen, falls gesetzt, andernfalls aus `DASHSCOPE_API_KEY`. Wenn der Endpunkt ein Gateway auf Ihrer eigenen Domain ist, listen Sie diesen Host in `WEB_SEARCH_ALLOWED_HOSTS` (oder `tools.webSearch.allowedHosts`) auf – die integrierte Liste ist ansonsten das einzige, was die Prüfung akzeptiert. Fehlkonfigurationen werden weiterhin als Startmeldung angezeigt.

Hinweise:

- Für die explizite DashScope-Suche muss der Selektor zu einem DashScope-kompatiblen `modelProviders`-Eintrag auflösen, der einen direkten API-Schlüssel über `envKey` trägt. Ihr Hauptmodell kann jeder Anbieter sein. Der Legacy-freie Qwen OAuth-Anbieter kann diesen Pfad nicht unterstützen; die Qwen-Abonnement-Suche nutzt den oben beschriebenen separaten MCP-Dienst.
- Die Registrierung der Suche wird nach erfolgreichen Authentifizierungsänderungen neu bewertet. Die Anmeldung beim Qwen-Abonnement aktiviert die Suche in der aktuellen Sitzung ohne Neustart. Explizites Deaktivieren, Bare-/Safe-Modus und Tool-Berechtigungsregeln gelten weiterhin.
- Die automatische Host-Erkennung akzeptiert absichtlich nur bekannte DashScope-Regionale-Hosts, Model Studio und QwenCloud MaaS-Hosts (einschließlich ihrer `token-plan.`-Abonnement-Subdomains) sowie interne Alibaba-Hosts. Generische `*.alicloudapi.com`-Gateways, `DASHSCOPE_PROXY_BASE_URL` und jeder Host, den Sie nur zu `allowedHosts` hinzugefügt haben, sind von diesem automatischen Pfad ausgeschlossen, da er ohne Ihre Beteiligung ausgeführt wird und andernfalls Ihren Hauptschlüssel an einen Host übergeben würde, den niemand deklariert hat. Für ein Gateway, das Sie deklarieren, listen Sie es in `tools.webSearch.allowedHosts` auf und verweisen Sie mit `WEB_SEARCH_BASE_URL` (oder einem `modelProviders`-Eintrag) darauf.
- Wenn explizit aktiviert, aber fehlerhaft konfiguriert, bleibt das Tool ausgeschaltet und eine Startmeldung erklärt, welche Bedingung fehlgeschlagen ist. Die automatische Aktivierung gibt niemals eine Meldung aus.
- DashScope-Suchen belasten Ihren DashScope-Schlüssel (`usage.x_tools` zählt). Der automatische Genehmigungsmodus (Standard) ermöglicht es dem Klassifizierer, Suchen ohne Aufforderung zu genehmigen; im `default`-Genehmigungsmodus fragt das Tool nach, und eine Genehmigung mit "immer zulassen" persistiert eine standardmäßige `WebSearch`-Berechtigungsregel, wie bei anderen Tools.
- Es gibt keine clientseitige Modell-Allowlist; ein Modell, das der Responses-Endpunkt nicht bereitstellt, schlägt bei der ersten Verwendung lautstark fehl.
- Eine Suche, die ihr Zeitbudget überschreitet, gibt das Eingetroffene als Teilergebnis zurück, sobald mindestens ein Suchaufruf abgeschlossen ist; wenn das Budget abläuft, bevor der erste Suchaufruf fertig wird, meldet das Tool stattdessen einen Timeout-Fehler, da eine Erzählung ohne ausgeführte Suche kein überprüfbarer Nachweis ist. Wenn ein Suchaufruf abgeschlossen wurde, aber die erzählte Antwort nie eingetroffen ist, enthält das Ergebnis höchstens 6.000 Zeichen des Seitentextes, den der Agent gelesen hatte, gekennzeichnet als roher Seiteninhalt.
- Die pro-Session-Obergrenze zählt `web_search`-Tool-Aufrufe, nicht die Suchen, die ein Aufruf intern ausführt, und ein fehlgeschlagener Aufruf zählt trotzdem, da die Anfrage gesendet wurde. Ein übersprungener Aufruf ist kein Fehler: Er teilt dem Modell mit, dass das Budget aufgebraucht ist, und dass es Sie bitten soll, `tools.webSearch.maxPerSession` zu erhöhen, wenn wirklich mehr Suchen benötigt werden.

## MCP-Alternativen

Wenn Ihr Anbieter das integrierte Tool nicht bereitstellen kann, steht die Websuche durch die Verbindung eines externen MCP-Servers zur Verfügung — siehe die folgenden Dienste.

## ⚠️ Historischer Breaking Change: Ursprüngliches integriertes `web_search` entfernt

> **Betroffene Versionen:** `V0.0.7+` bis zur letzten Version mit dem ursprünglichen integrierten Multi-Anbieter-Websuchtool.

Das ursprüngliche integrierte `web_search`-Tool (Tavily/Google/GLM/DashScope Multi-Anbieter) und seine Konfiguration wurden **entfernt**. Das oben dokumentierte integrierte Tool ist eine andere Implementierung mit einer anderen Konfiguration. Wenn Sie einen der folgenden Punkte verwendet haben, migrieren Sie entweder zum neuen integrierten Tool (DashScope) oder zu MCP:

| Entfernt                                                                  | Was zu tun ist                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `webSearch`-Block in `settings.json`                                      | Stattdessen einen MCP-Server in `mcpServers` konfigurieren (siehe unten) |
| `advanced.tavilyApiKey` in `settings.json`                                | Den [Tavily MCP-Server](#tavily-websearch) verwenden                  |
| `TAVILY_API_KEY`-Umgebungsvariable                                        | Den [Tavily MCP-Server](#tavily-websearch) verwenden                  |
| `DASHSCOPE_API_KEY` für Websuche                                     | Verwenden des [integrierten `web_search`-Tools](#built-in-web_search)      |
| `GLM_API_KEY` für die Websuche                                            | Den [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) verwenden |
| `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` CLI-Flags | Über `mcpServers` in `settings.json` konfigurieren                    |

### Migrationsbeispiele

**Vorher (Tavily über integriertes Tool):**

```json
{
  "webSearch": {
    "provider": [{ "type": "tavily", "apiKey": "tvly-xxx" }],
    "default": "tavily"
  }
}
```

**Nachher (Tavily über MCP):**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-xxx"
    }
  }
}
```

---

**Vorher (DashScope über integriertes Tool):**

```json
{
  "webSearch": {
    "provider": [{ "type": "dashscope", "apiKey": "sk-xxx" }],
    "default": "dashscope"
  }
}
```

**Nachher (Alibaba Cloud Bailian WebSearch über MCP):**

```json
{
  "mcpServers": {
    "WebSearch": {
      "httpUrl": "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp",
      "headers": {
        "Authorization": "Bearer sk-xxx"
      }
    }
  }
}
```

---

## Unterstützte MCP-Websuchdienste

### Alibaba Cloud Bailian WebSearch

Der offizielle Websuche-MCP-Dienst, bereitgestellt von der Alibaba Cloud Bailian-Plattform, unterstützt von DashScope. Wenn Sie einen DashScope-Schlüssel haben, bevorzugen Sie das oben genannte integrierte `web_search`-Tool — es verwendet einen stärkeren Suchpfad als dieser MCP-Dienst.

- **MCP Marketplace:** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **Kosten:** Kostenpflichtig (Abrechnung über Alibaba Cloud DashScope)
- **API-Schlüssel abrufen:** https://help.aliyun.com/zh/model-studio/get-api-key
- **Am besten geeignet für:** Chinesischsprachige Abfragen, Zugriff auf chinesische Webinhalte, Integration in das Alibaba Cloud-Ökosystem

#### Einrichtung

**Methode 1: CLI-Befehl**

```bash
qwen mcp add WebSearch \
  -t http \
  "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}"
```

**Methode 2: `settings.json`**

```json
{
  "mcpServers": {
    "WebSearch": {
      "httpUrl": "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp",
      "headers": {
        "Authorization": "Bearer ${DASHSCOPE_API_KEY}"
      }
    }
  }
}
```

Ersetzen Sie `${DASHSCOPE_API_KEY}` durch Ihren tatsächlichen API-Schlüssel, oder setzen Sie ihn als Umgebungsvariable, damit Qwen Code ihn automatisch übernimmt.

---

### Tavily WebSearch

Ein produktionsreifer MCP-Server mit Echtzeit-Websuche, Extraktion, Mapping und Crawling-Funktionen.

- **Repository:** https://github.com/tavily-ai/tavily-mcp
- **Kosten:** Kostenpflichtig (kostenlose Stufe verfügbar)
- **API-Schlüssel abrufen:** https://app.tavily.com/home
- **Am besten geeignet für:** Allgemeine Websuche mit hochwertigen KI-generierten Antworten

#### Verfügbare Tools

- `tavily_search` — Echtzeit-Websuche
- `tavily_extract` — Intelligente Datenextraktion aus Webseiten
- `tavily_map` — Erstellen einer strukturierten Karte einer Website
- `tavily_crawl` — Systematisches Erkunden von Websites

#### Einrichtung

**Methode 1: CLI-Befehl (Remote MCP)**

```bash
qwen mcp add tavily \
  -t http \
  "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
```

**Methode 2: `settings.json` (Remote MCP)**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    }
  }
}
```

Ersetzen Sie `${TAVILY_API_KEY}` durch Ihren tatsächlichen API-Schlüssel, oder setzen Sie ihn als Umgebungsvariable.

**Methode 3: `settings.json` (Lokales NPX)**

```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

### GLM WebSearch Prime (ZhipuAI)

Der offizielle Remote-MCP-Dienst für Websuche von ZhipuAI (智谱AI), konzipiert für Nutzer des GLM Coding Plans. Bietet Echtzeit-Websuche einschließlich Nachrichten, Aktienkurse, Wetter und mehr.

- **Dokumentation:** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **Kosten:** Im GLM Coding Plan-Abonnement enthalten (Lite: 100 Aufrufe/Monat, Pro: 1.000/Monat, Max: 4.000/Monat)
- **API-Schlüssel abrufen:** https://open.bigmodel.cn/apikey/platform
- **Am besten geeignet für:** Chinesischsprachige Abfragen, Echtzeit-Informationsabruf

#### Verfügbare Tools

- `webSearchPrime` — Websuche, die Seitentitel, URL, Zusammenfassung, Seitenname und Favicon zurückgibt

#### Einrichtung

**Methode 1: CLI-Befehl**

```bash
qwen mcp add web-search-prime \
  -t http \
  "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp" \
  -H "Authorization: Bearer ${GLM_API_KEY}"
```

**Methode 2: `settings.json`**

```json
{
  "mcpServers": {
    "web-search-prime": {
      "httpUrl": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
      "headers": {
        "Authorization": "Bearer ${GLM_API_KEY}"
      }
    }
  }
}
```

Ersetzen Sie `${GLM_API_KEY}` durch Ihren tatsächlichen ZhipuAI-API-Schlüssel, oder setzen Sie ihn als Umgebungsvariable.

---

### Firecrawl

Der offizielle gehostete MCP-Server von Firecrawl, der Websuche, Seiten-Scraping, Website-Crawling und -Mapping, Browser-Interaktion und Datei-Parsing bietet. Suchergebnisse können den Inhalt jeder Seite als Markdown enthalten, sodass das Modell seine Quellen ohne separaten Abrufschritt lesen kann. Der gehostete Server funktioniert ohne API-Schlüssel für Suche, Scraping und Parsing. Suchanfragen, die URLs, die Sie zum Lesen anfordern, und alle Dateien, die Sie parsen, werden an Firecrawl gesendet.

- **Dokumentation:** https://docs.firecrawl.dev/mcp-server
- **Kosten:** Kein API-Schlüssel für Suche, Scraping und Parsing erforderlich (tägliches Limit pro IP); bezahlte Pläne für höhere Limits
- **API-Schlüssel erhalten:** https://www.firecrawl.dev/app/api-keys
- **Am besten geeignet für:** Websuche, bei der das Modell auch die gefundenen Seiten lesen muss, und Testen der MCP-Websuche ohne API-Schlüssel

#### Verfügbare Tools

- `firecrawl_search` — Websuche, optional Rückgabe des Seiteninhalts jedes Ergebnisses als Markdown
- `firecrawl_scrape` — Abrufen einer einzelnen Seite als sauberes Markdown
- `firecrawl_parse` — Konvertieren einer lokalen Datei (PDF, Word, Tabellenkalkulation und mehr) in Markdown

Mit einem API-Schlüssel bietet der Server zusätzlich Tools zum Mapping und Crawlen von Websites, zur Interaktion mit Seiten (Klicken, Tippen, Navigieren) und zur Suche in Entwicklerquellen wie GitHub-Issues und Docs.

#### Einrichtung

**Methode 1: CLI-Befehl (Remote MCP)**

```bash
qwen mcp add firecrawl \
  -t http \
  "https://mcp.firecrawl.dev/v2/mcp" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}"
```

Um es ohne Schlüssel auszuprobieren, lassen Sie die `-H`-Zeile weg. Sie erhalten `firecrawl_search`, `firecrawl_scrape` und `firecrawl_parse` innerhalb eines täglichen Limits pro IP.

**Methode 2: `settings.json` (Remote MCP)**

```json
{
  "mcpServers": {
    "firecrawl": {
      "httpUrl": "https://mcp.firecrawl.dev/v2/mcp",
      "headers": {
        "Authorization": "Bearer ${FIRECRAWL_API_KEY}"
      }
    }
  }
}
```

Ersetzen Sie `${FIRECRAWL_API_KEY}` durch Ihren tatsächlichen API-Schlüssel oder setzen Sie ihn als Umgebungsvariable. Wenn der Schlüssel leer ist, verbindet sich der Server weiterhin, bietet aber nur die drei schlüsselloosen Tools an.

**Methode 3: `settings.json` (Lokales NPX)**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp@latest"],
      "env": {
        "FIRECRAWL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

### SerpApi

Der offizielle gehostete MCP-Server von SerpApi, der strukturierte Echtzeit-Suchergebnisse von Google, Baidu, Bing und anderen Suchmaschinen über ein einzelnes Tool bereitstellt. Suchanfragen und ihre Parameter werden an SerpApi gesendet.

- **Dokumentation:** https://serpapi.com/integrations/mcp
- **Kosten:** Bezahlt (kostenloser Plan verfügbar)
- **API-Schlüssel erhalten:** https://serpapi.com/manage-api-key
- **Am besten geeignet für:** Strukturierte Ergebnisse aus einer breiten Auswahl an Suchmaschinen

#### Verfügbare Tools

- `search` — Websuche, optionale Rückgabe der Ergebnisse als Markdown

#### Einrichtung

**Methode 1: CLI-Befehl**

```bash
qwen mcp add serpapi \
  -t http \
  "https://mcp.serpapi.com/mcp" \
  -H "Authorization: Bearer ${SERPAPI_API_KEY}"
```

**Methode 2: `settings.json`**

```json
{
  "mcpServers": {
    "serpapi": {
      "httpUrl": "https://mcp.serpapi.com/mcp",
      "headers": {
        "Authorization": "Bearer ${SERPAPI_API_KEY}"
      }
    }
  }
}
```

Ersetzen Sie `${SERPAPI_API_KEY}` durch Ihren tatsächlichen API-Schlüssel oder setzen Sie ihn als Umgebungsvariable. Der Schlüssel wird nur für Suchen benötigt. Ohne gültigen API-Schlüssel verbindet sich der Server weiterhin und listet seine Tools auf, aber `search` gibt einen Fehler zurück.

---

### looot

Ein gehosteter MCP-Server von looot mit Websuche, Google-SERP-Ergebnissen, Nachrichtensuche und Webseitenauslese. Suchanfragen und die URLs, die Sie zum Lesen anfordern, werden an looot gesendet.

- **Dokumentation:** https://docs.looot.ai
- **Kosten:** Bezahlt (Prepaid-Guthaben, keine kostenlose Stufe)
- **API-Schlüssel erhalten:** https://looot.ai
- **Am besten geeignet für:** Websuche, Google-SERP- und Nachrichtenergebnisse sowie das Lesen einer Seite als Text

#### Verfügbare Tools

- `web_search` — Websuche
- `google_search_results` — Google-SERP-Ergebnisse
- `news_search` — Nachrichtensuche
- `read_web_page` — Eine einzelne Seite als Text lesen

Der Server stellt auch Unternehmens- und E-Mail-Lookups bereit.

#### Einrichtung

**Methode 1: CLI-Befehl (Remote MCP)**

```bash
qwen mcp add looot \
  -t http \
  "https://api.looot.ai/mcp" \
  -H "Authorization: Bearer ${LOOOT_API_KEY}"
```

**Methode 2: `settings.json` (Remote MCP)**

```json
{
  "mcpServers": {
    "looot": {
      "httpUrl": "https://api.looot.ai/mcp",
      "headers": {
        "Authorization": "Bearer ${LOOOT_API_KEY}"
      }
    }
  }
}
```

Ersetzen Sie `${LOOOT_API_KEY}` durch Ihren tatsächlichen API-Schlüssel oder legen Sie ihn als Umgebungsvariable fest.

---
