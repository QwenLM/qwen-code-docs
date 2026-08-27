# Web-Suche

Qwen Code bietet Websuche auf zwei Arten:

1. **Integriertes `web_search`-Tool** (opt-in) — unterstützt von der DashScope Responses API Server-seitigen Suche. Funktioniert mit einem standardmäßigen Bailian (DashScope) API-Schlüssel; kein zusätzlicher Anbieter oder MCP-Setup erforderlich.
2. **MCP-Integrationen (Model Context Protocol)** — verbinden Sie einen beliebigen externen Suchdienst (Tavily, GLM und andere). Verwenden Sie dies, wenn Sie keinen DashScope-Schlüssel haben.

## Integriertes `web_search` (opt-in)

Das integrierte Tool sendet eine eigenständige Suchanfrage an ein kleines Hilfsmodell mit den Server-seitigen `web_search`- (und `web_extractor`-) Tools von DashScope und gibt die erzählten Ergebnisse sowie Quell-URLs zurück. Es wird nie implizit aktiviert — zwei Einstellungen sind erforderlich:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.6-plus",
        "envKey": "DASHSCOPE_API_KEY",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
      }
    ]
  },
  "tools": {
    "webSearch": {
      "enabled": true,
      "model": "qwen3.6-plus"
    }
  }
}
```

| Einstellung                    | Umgebungs-Override     | Bedeutung                                                                                                                                                         |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`    | Opt-in-Flag. Erforderlich.                                                                                                                                        |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`     | Suchmodell-Selektor, aufgelöst gegen `modelProviders` wie `fastModel` (`modelId` oder `authType:modelId`). Erforderlich — kein Standard. Empfohlen: `qwen3.6-plus`. |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR` | Dem Such-Agenten erlauben, Ergebnisseiten für besser fundierte Antworten zu öffnen (Standard `true`; wird von DashScope separat berechnet).                        |

### Nur-Umgebungsvariablen-Konfiguration (ohne settings.json)

Für Umgebungen, in denen Sie keine Einstellungsdatei schreiben können (abgeschottete Container, CI nur mit Umgebungsvariablen-Injektion), kann das Tool vollständig über Umgebungsvariablen konfiguriert werden — kein `modelProviders`-Eintrag erforderlich:

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.6-plus
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export DASHSCOPE_API_KEY=sk-...        # oder stattdessen WEB_SEARCH_API_KEY setzen
```

`WEB_SEARCH_BASE_URL` spiegelt den `baseUrl` eines `modelProviders`-Eintrags wider und muss ein DashScope-kompatibler Endpunkt sein; wenn es gesetzt ist, hat es Vorrang vor der `modelProviders`-Auflösung und `WEB_SEARCH_MODEL` wird als reine DashScope-Modell-ID verwendet. Der API-Schlüssel wird aus `WEB_SEARCH_API_KEY` gelesen, wenn gesetzt, andernfalls aus `DASHSCOPE_API_KEY`. Eine Fehlkonfiguration wird weiterhin als Startmeldung angezeigt.

Hinweise:

- Der Selektor muss sich auf einen DashScope-kompatiblen `modelProviders`-Eintrag auflösen, der einen direkten API-Schlüssel über `envKey` trägt. Ihr Hauptmodell kann ein beliebiger Anbieter sein — nur die Such-Anfrage benötigt einen DashScope-Eintrag. Qwen OAuth kann das Tool nicht bereitstellen.
- Wenn aktiviert, aber fehlerhaft konfiguriert, bleibt das Tool ausgeschaltet und eine Startmeldung erklärt, welche Bedingung fehlgeschlagen ist.
- Suchen werden über Ihren DashScope-Schlüssel abgerechnet (`usage.x_tools` zählt). Das Tool fordert standardmäßig eine Bestätigung an; Genehmigung mit „immer zulassen" persistiert eine standardmäßige `WebSearch`-Berechtigungsregel, wie bei anderen Tools.
- Es gibt keine clientseitige Modell-Allowlist; ein Modell, das der Responses-Endpunkt nicht bereitstellt, schlägt bei der ersten Verwendung lautstark fehl.

## MCP-Alternativen

Wenn Sie keinen DashScope-Schlüssel haben, steht die Websuche durch die Verbindung eines externen MCP-Servers zur Verfügung — siehe die folgenden Dienste.

## ⚠️ Historischer Breaking Change: Ursprüngliches integriertes `web_search` entfernt

> **Betroffene Versionen:** `V0.0.7+` bis zur letzten Version mit dem ursprünglichen integrierten Multi-Anbieter-Websuchtool.

Das ursprüngliche integrierte `web_search`-Tool (Tavily/Google/GLM/DashScope Multi-Anbieter) und seine Konfiguration wurden **entfernt**. Das neue Opt-in-Tool oben ist eine andere Implementierung mit einer anderen Konfiguration. Wenn Sie einen der folgenden Punkte verwendet haben, migrieren Sie entweder zum neuen integrierten Tool (DashScope) oder zu MCP:

| Entfernt                                                                  | Was zu tun ist                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `webSearch`-Block in `settings.json`                                      | Stattdessen einen MCP-Server in `mcpServers` konfigurieren (siehe unten) |
| `advanced.tavilyApiKey` in `settings.json`                                | Den [Tavily MCP-Server](#tavily-websearch) verwenden                  |
| `TAVILY_API_KEY`-Umgebungsvariable                                        | Den [Tavily MCP-Server](#tavily-websearch) verwenden                  |
| `DASHSCOPE_API_KEY` für die Websuche                                      | Das [integrierte `web_search`-Tool](#integriertes-web_search-opt-in) verwenden |
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

Der offizielle Remote-MCP-Websuchdienst von ZhipuAI (智谱AI), entwickelt für GLM Coding Plan-Nutzer. Bietet Echtzeit-Websuche einschließlich Nachrichten, Aktienkurse, Wetter und mehr.

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
