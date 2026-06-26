# Web-Suche

Qwen Code unterstützt Websuche-Funktionen über **MCP (Model Context Protocol)**-Integrationen. Statt eines integrierten Suchtools wird die Websuche durch die Verbindung zu externen MCP-Servern bereitgestellt, was Ihnen die volle Flexibilität gibt, den Suchdienst auszuwählen, der am besten zu Ihren Anforderungen passt.

## ⚠️ Breaking Change: Integriertes `web_search`-Tool entfernt

> **Betroffene Versionen:** `V0.0.7+` bis zur letzten Version mit integrierter Websuche-Unterstützung.

Das integrierte `web_search`-Tool und alle zugehörigen Konfigurationen wurden **entfernt**. Wenn Sie eines der folgenden Elemente verwendet haben, migrieren Sie zu dem in diesem Dokument beschriebenen MCP-basierten Ansatz:

| Entfernt                                                                  | Was zu tun ist                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `webSearch`-Block in `settings.json`                                      | Stattdessen einen MCP-Server in `mcpServers` konfigurieren (siehe unten)                      |
| `advanced.tavilyApiKey` in `settings.json`                                | Den [Tavily MCP-Server](#tavily-websearch) verwenden                                          |
| `TAVILY_API_KEY`-Umgebungsvariable                                        | Den [Tavily MCP-Server](#tavily-websearch) verwenden                                          |
| `DASHSCOPE_API_KEY` für die Websuche                                      | Den [Alibaba Cloud Bailian WebSearch MCP](#alibaba-cloud-bailian-websearch-recommended) verwenden |
| `GLM_API_KEY` für die Websuche                                            | Den [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) verwenden                          |
| `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` CLI-Flags | Über `mcpServers` in `settings.json` konfigurieren                                             |

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

### Alibaba Cloud Bailian WebSearch (Empfohlen)

Der offizielle Websuche-MCP-Dienst, bereitgestellt von der Alibaba Cloud Bailian-Plattform, unterstützt von DashScope.

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