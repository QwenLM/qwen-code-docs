# Websuche

Qwen Code unterstützt Websuchfunktionen über **MCP-Integrationen (Model Context Protocol)**. Anstatt eines integrierten Suchtools wird die Websuche durch die Verbindung zu externen MCP-Servern bereitgestellt. Dies gibt dir die volle Flexibilität, den Suchdienst auszuwählen, der am besten zu deinen Anforderungen passt.

## ⚠️ Breaking Change: Integriertes `web_search`-Tool entfernt

> **Betroffene Versionen:** `V0.0.7+` bis zur letzten Version mit integrierter Websuchunterstützung.

Das integrierte `web_search`-Tool und alle zugehörigen Konfigurationen wurden **entfernt**. Wenn du eine der folgenden Optionen verwendet hast, solltest du auf den in diesem Dokument beschriebenen MCP-basierten Ansatz migrieren:

| Entfernt | Vorgehensweise |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `webSearch`-Block in `settings.json` | Konfiguriere stattdessen einen MCP-Server in `mcpServers` (siehe unten) |
| `advanced.tavilyApiKey` in `settings.json` | Verwende den [Tavily MCP-Server](#tavily-websearch) |
| `TAVILY_API_KEY`-Umgebungsvariable | Verwende den [Tavily MCP-Server](#tavily-websearch) |
| `DASHSCOPE_API_KEY` für die Websuche | Verwende den [Alibaba Cloud Bailian WebSearch MCP](#alibaba-cloud-bailian-websearch-recommended) |
| `GLM_API_KEY` für die Websuche | Verwende den [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) |
| `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` CLI-Flags | Konfiguriere über `mcpServers` in `settings.json` |

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

Der offizielle Websuch-MCP-Dienst der Alibaba Cloud Bailian-Plattform, betrieben mit DashScope.

- **MCP Marketplace:** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **Kosten:** Kostenpflichtig (Abrechnung über Alibaba Cloud DashScope)
- **API-Key erhalten:** https://help.aliyun.com/zh/model-studio/get-api-key
- **Ideal für:** Chinesischsprachige Suchanfragen, Zugriff auf chinesische Webinhalte, Integration in das Alibaba Cloud-Ökosystem

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

Ersetze `${DASHSCOPE_API_KEY}` durch deinen tatsächlichen API-Key oder lege ihn als Umgebungsvariable fest, damit Qwen Code ihn automatisch erkennt.

---

### Tavily WebSearch

Ein produktionsreifer MCP-Server mit Funktionen für Echtzeit-Websuche, Extrahieren, Mapping und Crawlen.

- **Repository:** https://github.com/tavily-ai/tavily-mcp
- **Kosten:** Kostenpflichtig (kostenloses Kontingent verfügbar)
- **API-Key erhalten:** https://app.tavily.com/home
- **Ideal für:** Allgemeine Websuche mit hochwertigen, KI-generierten Antworten

#### Verfügbare Tools

- `tavily_search` — Echtzeit-Websuche
- `tavily_extract` — Intelligente Datenextraktion aus Webseiten
- `tavily_map` — Erstellen einer strukturierten Karte einer Website
- `tavily_crawl` — Systematisches Erkunden von Websites

#### Einrichtung

**Methode 1: CLI-Befehl (Remote-MCP)**

```bash
qwen mcp add tavily \
  -t http \
  "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
```

**Methode 2: `settings.json` (Remote-MCP)**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    }
  }
}
```

Ersetze `${TAVILY_API_KEY}` durch deinen tatsächlichen API-Key oder lege ihn als Umgebungsvariable fest.

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

Der offizielle Remote-MCP-Websuchdienst von ZhipuAI (智谱AI), entwickelt für Nutzer des GLM Coding Plans. Bietet Echtzeit-Websuche, einschließlich Nachrichten, Aktienkursen, Wetter und mehr.

- **Dokumentation:** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **Kosten:** Im GLM Coding Plan-Abonnement enthalten (Lite: 100 Aufrufe/Monat, Pro: 1.000/Monat, Max: 4.000/Monat)
- **API-Key erhalten:** https://open.bigmodel.cn/apikey/platform
- **Ideal für:** Chinesischsprachige Suchanfragen, Echtzeit-Informationsabruf

#### Verfügbare Tools

- `webSearchPrime` — Websuche, die Seitentitel, URL, Zusammenfassung, Site-Name und Favicon zurückgibt

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

Ersetze `${GLM_API_KEY}` durch deinen tatsächlichen ZhipuAI-API-Key oder lege ihn als Umgebungsvariable fest.

---