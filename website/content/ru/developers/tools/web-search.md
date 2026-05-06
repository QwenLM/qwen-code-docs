# Веб-поиск

Qwen Code поддерживает возможности веб-поиска через интеграции **MCP (Model Context Protocol)**. Вместо встроенного инструмента поиска, веб-поиск реализуется путем подключения к внешним MCP-серверам, что дает вам полную гибкость в выборе поискового сервиса, наиболее подходящего для ваших задач.

## ⚠️ Breaking Change: Встроенный инструмент `web_search` удален

> **Затронутые версии:** `V0.0.7+` и все последующие релизы с поддержкой встроенного веб-поиска.

Встроенный инструмент `web_search` и вся связанная с ним конфигурация были **удалены**. Если вы использовали что-либо из перечисленного ниже, перейдите на подход на основе MCP, описанный в этом документе:

| Удалено | Что делать |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Блок `webSearch` в `settings.json` | Настройте MCP-сервер в `mcpServers` (см. ниже) |
| `advanced.tavilyApiKey` в `settings.json` | Используйте [MCP-сервер Tavily](#tavily-websearch) |
| Переменная окружения `TAVILY_API_KEY` | Используйте [MCP-сервер Tavily](#tavily-websearch) |
| `DASHSCOPE_API_KEY` для веб-поиска | Используйте [Alibaba Cloud Bailian WebSearch MCP](#alibaba-cloud-bailian-websearch-recommended) |
| `GLM_API_KEY` для веб-поиска | Используйте [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) |
| Флаги CLI `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` | Настройте через `mcpServers` в `settings.json` |

### Примеры миграции

**До (Tavily через встроенный инструмент):**

```json
{
  "webSearch": {
    "provider": [{ "type": "tavily", "apiKey": "tvly-xxx" }],
    "default": "tavily"
  }
}
```

**После (Tavily через MCP):**

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

**До (DashScope через встроенный инструмент):**

```json
{
  "webSearch": {
    "provider": [{ "type": "dashscope", "apiKey": "sk-xxx" }],
    "default": "dashscope"
  }
}
```

**После (Alibaba Cloud Bailian WebSearch через MCP):**

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

## Поддерживаемые MCP-сервисы веб-поиска

### Alibaba Cloud Bailian WebSearch (Рекомендуется)

Официальный MCP-сервис веб-поиска от платформы Alibaba Cloud Bailian, работающий на базе DashScope.

- **MCP Marketplace:** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **Стоимость:** Платный (оплата через Alibaba Cloud DashScope)
- **Получить API Key:** https://help.aliyun.com/zh/model-studio/get-api-key
- **Оптимален для:** Запросов на китайском языке, доступа к китайскому веб-контенту, интеграции с экосистемой Alibaba Cloud

#### Настройка

**Способ 1: Команда CLI**

```bash
qwen mcp add WebSearch \
  -t http \
  "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}"
```

**Способ 2: `settings.json`**

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

Замените `${DASHSCOPE_API_KEY}` на ваш реальный API key или задайте его как переменную окружения, чтобы Qwen Code автоматически подхватил его.

---

### Tavily WebSearch

Готовый к production MCP-сервер, предоставляющий возможности поиска в реальном времени, извлечения данных, построения карты сайта и краулинга.

- **Репозиторий:** https://github.com/tavily-ai/tavily-mcp
- **Стоимость:** Платный (доступен бесплатный тариф)
- **Получить API Key:** https://app.tavily.com/home
- **Оптимален для:** Универсального веб-поиска с высококачественными ответами, генерируемыми ИИ

#### Доступные инструменты

- `tavily_search` — Поиск в интернете в реальном времени
- `tavily_extract` — Интеллектуальное извлечение данных с веб-страниц
- `tavily_map` — Создание структурированной карты веб-сайта
- `tavily_crawl` — Систематический обход (краулинг) веб-сайтов

#### Настройка

**Способ 1: Команда CLI (Remote MCP)**

```bash
qwen mcp add tavily \
  -t http \
  "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
```

**Способ 2: `settings.json` (Remote MCP)**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    }
  }
}
```

Замените `${TAVILY_API_KEY}` на ваш реальный API key или задайте его как переменную окружения.

**Способ 3: `settings.json` (Local NPX)**

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

Официальный Remote MCP-сервис веб-поиска от ZhipuAI (智谱AI), разработанный для пользователей GLM Coding Plan. Предоставляет поиск в интернете в реальном времени, включая новости, котировки акций, погоду и многое другое.

- **Документация:** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **Стоимость:** Включена в подписку GLM Coding Plan (Lite: 100 запросов/мес, Pro: 1 000/мес, Max: 4 000/мес)
- **Получить API Key:** https://open.bigmodel.cn/apikey/platform
- **Оптимален для:** Запросов на китайском языке, получения информации в реальном времени

#### Доступные инструменты

- `webSearchPrime` — Веб-поиск, возвращающий заголовок страницы, URL, краткое содержание, название сайта и favicon

#### Настройка

**Способ 1: Команда CLI**

```bash
qwen mcp add web-search-prime \
  -t http \
  "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp" \
  -H "Authorization: Bearer ${GLM_API_KEY}"
```

**Способ 2: `settings.json`**

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

Замените `${GLM_API_KEY}` на ваш реальный API key от ZhipuAI или задайте его как переменную окружения.

---