# Веб-поиск

Qwen Code поддерживает веб-поиск двумя способами:

1. **Встроенный инструмент `web_search`** (включаемый явно) — работает через серверный поиск DashScope Responses API. Работает со стандартным API-ключом Bailian (DashScope); дополнительная настройка провайдера или MCP не требуется.
2. **Интеграции через MCP (Model Context Protocol)** — подключите любой внешний поисковый сервис (Tavily, GLM и другие). Используйте этот вариант, если у вас нет ключа DashScope.

## Встроенный `web_search` (opt-in)

Встроенный инструмент отправляет самодостаточный запрос поиска небольшой вспомогательной модели с серверными инструментами DashScope `web_search` (и `web_extractor`) и возвращает описанные результаты плюс URL-адреса источников. Он никогда не активируется неявно — требуются две настройки:

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

| Настройка                      | Переопределение через env | Назначение                                                                                                                                                       |
| ------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`       | Флаг включения. Обязателен.                                                                                                                                      |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`        | Селектор модели поиска, разрешается через `modelProviders` аналогично `fastModel` (`modelId` или `authType:modelId`). Обязателен — значения по умолчанию нет. Рекомендуется: `qwen3.6-plus`. |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR`    | Позволяет поисковому агенту открывать страницы результатов для более обоснованных ответов (по умолчанию `true`; тарифицируется DashScope отдельно).               |

### Конфигурация только через env (без settings.json)

Для окружений, где невозможно записать файл настроек (заблокированные контейнеры, CI только с инъекцией env), инструмент можно настроить полностью через переменные окружения — запись в `modelProviders` не нужна:

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.6-plus
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export DASHSCOPE_API_KEY=sk-...        # или установите WEB_SEARCH_API_KEY
```

`WEB_SEARCH_BASE_URL` дублирует `baseUrl` из записи `modelProviders` и должен быть эндпоинтом, совместимым с DashScope; когда он установлен, он имеет приоритет над разрешением через `modelProviders`, а `WEB_SEARCH_MODEL` используется как простой id модели DashScope. API-ключ читается из `WEB_SEARCH_API_KEY`, если установлен, иначе из `DASHSCOPE_API_KEY`. Неправильная конфигурация по-прежнему отображается как уведомление при запуске.

Примечания:

- Селектор должен разрешаться в совместимую с DashScope запись `modelProviders` с прямым API-ключом через `envKey`. Ваша основная модель может быть любым провайдером — только запрос поисковой стороны требует запись DashScope. Qwen OAuth не может использоваться для инструмента.
- Если инструмент включён, но неправильно настроен, он остаётся выключенным, а уведомление при запуске объясняет, какое условие не выполнено.
- Поиск тарифицируется с вашего ключа DashScope (`usage.x_tools`). Инструмент по умолчанию запрашивает подтверждение; одобрение с "always allow" сохраняет стандартное правило разрешения `WebSearch`, как и другие инструменты.
- Клиентского белого списка моделей нет; модель, которую не обслуживает эндпоинт Responses, выдаст ошибку при первом использовании.

## Альтернативы через MCP

Если у вас нет ключа DashScope, веб-поиск доступен через подключение внешнего MCP-сервера — см. сервисы ниже.

## ⚠️ Историческое критическое изменение: оригинальный встроенный `web_search` удалён

> **Затронутые версии:** с `V0.0.7+` до последнего релиза с поддержкой встроенного веб-поиска.

Оригинальный встроенный инструмент `web_search` (мультипровайдерный: Tavily/Google/GLM/DashScope) и его конфигурация были **удалены**. Новый встроенный инструмент с явным включением выше — это другая реализация с другой конфигурацией. Если вы использовали что-либо из перечисленного, перейдите на новый встроенный инструмент (DashScope) или на MCP:

| Удалено                                                                | Что делать                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Блок `webSearch` в `settings.json`                                     | Вместо этого настройте MCP-сервер в `mcpServers` (см. ниже)       |
| `advanced.tavilyApiKey` в `settings.json`                              | Используйте [MCP-сервер Tavily](#tavily-websearch)                |
| Переменная окружения `TAVILY_API_KEY`                                  | Используйте [MCP-сервер Tavily](#tavily-websearch)                |
| `DASHSCOPE_API_KEY` для веб-поиска                                     | Используйте [встроенный инструмент `web_search`](#built-in-web_search-opt-in) |
| `GLM_API_KEY` для веб-поиска                                           | Используйте [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) |
| Флаги CLI `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` | Настройте через `mcpServers` в `settings.json`                    |

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

### Alibaba Cloud Bailian WebSearch

Официальный MCP-сервис веб-поиска, предоставляемый платформой Alibaba Cloud Bailian на базе DashScope. Если у вас есть ключ DashScope, предпочтите встроенный инструмент `web_search` выше — он использует более мощный путь поиска, чем этот MCP-сервис.

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