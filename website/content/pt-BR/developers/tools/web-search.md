# Busca na Web

O Qwen Code oferece recursos de busca na web por meio de integrações **MCP (Model Context Protocol)**. Em vez de uma ferramenta de busca nativa, a funcionalidade é fornecida pela conexão a servidores MCP externos, dando a você total flexibilidade para escolher o serviço de busca que melhor atende às suas necessidades.

## ⚠️ Breaking Change: Ferramenta `web_search` nativa removida

> **Versões afetadas:** `V0.0.7+` até a última versão com suporte nativo à busca na web.

A ferramenta nativa `web_search` e todas as suas configurações associadas foram **removidas**. Se você estava usando algum dos itens abaixo, deve migrar para a abordagem baseada em MCP descrita neste documento:

| Removido | O que fazer |
| --- | --- |
| Bloco `webSearch` no `settings.json` | Configure um servidor MCP em `mcpServers` (veja abaixo) |
| `advanced.tavilyApiKey` no `settings.json` | Use o [servidor MCP da Tavily](#tavily-websearch) |
| Variável de ambiente `TAVILY_API_KEY` | Use o [servidor MCP da Tavily](#tavily-websearch) |
| `DASHSCOPE_API_KEY` para busca na web | Use o [MCP Alibaba Cloud Bailian WebSearch](#alibaba-cloud-bailian-websearch-recommended) |
| `GLM_API_KEY` para busca na web | Use o [MCP GLM WebSearch Prime](#glm-websearch-prime-zhipuai) |
| Flags de CLI `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` | Configure via `mcpServers` no `settings.json` |

### Exemplos de Migração

**Antes (Tavily via ferramenta nativa):**

```json
{
  "webSearch": {
    "provider": [{ "type": "tavily", "apiKey": "tvly-xxx" }],
    "default": "tavily"
  }
}
```

**Depois (Tavily via MCP):**

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

**Antes (DashScope via ferramenta nativa):**

```json
{
  "webSearch": {
    "provider": [{ "type": "dashscope", "apiKey": "sk-xxx" }],
    "default": "dashscope"
  }
}
```

**Depois (Alibaba Cloud Bailian WebSearch via MCP):**

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

## Serviços de Busca na Web via MCP Suportados

### Alibaba Cloud Bailian WebSearch (Recomendado)

O serviço oficial de busca na web via MCP fornecido pela plataforma Alibaba Cloud Bailian, com tecnologia DashScope.

- **Marketplace MCP:** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **Custo:** Pago (faturado via Alibaba Cloud DashScope)
- **Obter API key:** https://help.aliyun.com/zh/model-studio/get-api-key
- **Indicado para:** Consultas em chinês, acesso a conteúdo da web chinesa e integração com o ecossistema Alibaba Cloud

#### Configuração

**Método 1: Comando CLI**

```bash
qwen mcp add WebSearch \
  -t http \
  "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}"
```

**Método 2: `settings.json`**

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

Substitua `${DASHSCOPE_API_KEY}` pela sua API key real ou defina-a como uma variável de ambiente para que o Qwen Code a detecte automaticamente.

---

### Tavily WebSearch

Um servidor MCP pronto para produção que oferece recursos de busca na web em tempo real, extração, mapeamento e crawl.

- **Repositório:** https://github.com/tavily-ai/tavily-mcp
- **Custo:** Pago (com plano gratuito disponível)
- **Obter API key:** https://app.tavily.com/home
- **Indicado para:** Busca na web de uso geral com respostas de alta qualidade geradas por IA

#### Ferramentas Disponíveis

- `tavily_search` — Busca na web em tempo real
- `tavily_extract` — Extração inteligente de dados de páginas web
- `tavily_map` — Criação de um mapa estruturado de um site
- `tavily_crawl` — Exploração sistemática de sites

#### Configuração

**Método 1: Comando CLI (MCP Remoto)**

```bash
qwen mcp add tavily \
  -t http \
  "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
```

**Método 2: `settings.json` (MCP Remoto)**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    }
  }
}
```

Substitua `${TAVILY_API_KEY}` pela sua API key real ou defina-a como uma variável de ambiente.

**Método 3: `settings.json` (NPX Local)**

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

O serviço oficial de busca na web via Remote MCP fornecido pela ZhipuAI (智谱AI), projetado para usuários do GLM Coding Plan. Oferece busca na web em tempo real, incluindo notícias, cotações de ações, previsão do tempo e muito mais.

- **Documentação:** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **Custo:** Incluído na assinatura do GLM Coding Plan (Lite: 100 chamadas/mês, Pro: 1.000/mês, Max: 4.000/mês)
- **Obter API key:** https://open.bigmodel.cn/apikey/platform
- **Indicado para:** Consultas em chinês e recuperação de informações em tempo real

#### Ferramentas Disponíveis

- `webSearchPrime` — Busca na web que retorna título da página, URL, resumo, nome do site e favicon

#### Configuração

**Método 1: Comando CLI**

```bash
qwen mcp add web-search-prime \
  -t http \
  "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp" \
  -H "Authorization: Bearer ${GLM_API_KEY}"
```

**Método 2: `settings.json`**

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

Substitua `${GLM_API_KEY}` pela sua API key real da ZhipuAI ou defina-a como uma variável de ambiente.

---