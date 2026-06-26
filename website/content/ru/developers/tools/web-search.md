# Веб-поиск

Qwen Code поддерживает возможности веб-поиска через интеграции **MCP (Model Context Protocol)**. Вместо встроенного инструмента поиска веб-поиск осуществляется путём подключения к внешним MCP-серверам, что даёт вам полную гибкость в выборе наиболее подходящего поискового сервиса.

## ⚠️ Критическое изменение: встроенный инструмент `web_search` удалён

> **Затронутые версии:** с `V0.0.7+` до последнего релиза с поддержкой встроенного веб-поиска.

Встроенный инструмент `web_search` и все связанные с ним настройки были **удалены**. Если вы использовали что-либо из перечисленного ниже, вам следует перейти на подход на основе MCP, описанный в этом документе:

| Удалено                                                                                           | Что делать                                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Блок `webSearch` в `settings.json`                                                                | Настройте MCP-сервер в `mcpServers` (см. ниже)                                                    |
| `advanced.tavilyApiKey` в `settings.json`                                                         | Используйте [MCP-сервер Tavily](#tavily-websearch)                                                |
| Переменная окружения `TAVILY_API_KEY`                                                             | Используйте [MCP-сервер Tavily](#tavily-websearch)                                                |
| `DASHSCOPE_API_KEY` для веб-поиска                                                                | Используйте [WebSearch MCP Alibaba Cloud Bailian](#alibaba-cloud-bailian-websearch-recommended)   |
| `GLM_API_KEY` для веб-поиска                                                                      | Используйте [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai)                               |
| Флаги CLI `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key`                            | Настройте через `mcpServers` в `settings.json`                                                    |

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

### Alibaba Cloud Bailian WebSearch (рекомендуется)

Официальный MCP-сервис веб-поиска, предоставляемый платформой Alibaba Cloud Bailian на базе DashScope.

- **Маркетплейс MCP:** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **Стоимость:** платная (тарификация через Alibaba Cloud DashScope)
- **Получить API-ключ:** https://help.aliyun.com/zh/model-studio/get-api-key
- **Подходит для:** запросов на китайском языке, доступа к китайскому веб-контенту, интеграции с экосистемой Alibaba Cloud

#### Настройка

**Способ 1: команда CLI**

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

Замените `${DASHSCOPE_API_KEY}` на ваш реальный API-ключ или установите его как переменную окружения, чтобы Qwen Code автоматически его подхватывал.

---

### Tavily WebSearch

Готовый к использованию MCP-сервер с возможностями веб-поиска в реальном времени, извлечения данных, построения карт сайтов и сканирования.

- **Репозиторий:** https://github.com/tavily-ai/tavily-mcp
- **Стоимость:** платная (доступен бесплатный тариф)
- **Получить API-ключ:** https://app.tavily.com/home
- **Подходит для:** универсального веб-поиска с высококачественными ответами на основе AI

#### Доступные инструменты

- `tavily_search` — Поиск в реальном времени в интернете
- `tavily_extract` — Интеллектуальное извлечение данных из веб-страниц
- `tavily_map` — Создание структурированной карты веб-сайта
- `tavily_crawl` — Систематическое исследование веб-сайтов

#### Настройка

**Способ 1: команда CLI (удалённый MCP)**

```bash
qwen mcp add tavily \
  -t http \
  "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
```

**Способ 2: `settings.json` (удалённый MCP)**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    }
  }
}
```

Замените `${TAVILY_API_KEY}` на ваш реальный API-ключ или установите его как переменную окружения.

**Способ 3: `settings.json` (локальный NPX)**

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

Официальный удалённый MCP-сервис веб-поиска от ZhipuAI (智谱AI), предназначенный для пользователей GLM Coding Plan. Обеспечивает поиск в реальном времени, включая новости, котировки акций, погоду и многое другое.

- **Документация:** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **Стоимость:** включена в подписку GLM Coding Plan (Lite: 100 вызовов/мес, Pro: 1,000/мес, Max: 4,000/мес)
- **Получить API-ключ:** https://open.bigmodel.cn/apikey/platform
- **Подходит для:** запросов на китайском языке, получения информации в реальном времени

#### Доступные инструменты

- `webSearchPrime` — Веб-поиск, возвращающий заголовок страницы, URL, краткое описание, название сайта и иконку

#### Настройка

**Способ 1: команда CLI**

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

Замените `${GLM_API_KEY}` на ваш реальный API-ключ ZhipuAI или установите его как переменную окружения.