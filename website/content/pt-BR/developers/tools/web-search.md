# Pesquisa na Web

O Qwen Code oferece suporte a recursos de pesquisa na Web por meio de integrações com o **MCP (Model Context Protocol)**. Em vez de uma ferramenta de pesquisa integrada, a pesquisa na Web é fornecida pela conexão a servidores MCP externos, dando a você total flexibilidade para escolher o serviço de pesquisa que melhor atende às suas necessidades.

## ⚠️ Mudança Significativa: Ferramenta `web_search` Integrada Removida

> **Versões afetadas:** `V0.0.7+` até a última versão com suporte a pesquisa na Web integrada.

A ferramenta `web_search` integrada e toda a sua configuração associada foram **removidas**. Se você estava usando algum dos itens a seguir, migre para a abordagem baseada em MCP descrita neste documento:

| Removido                                                                | O que fazer                                                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Bloco `webSearch` em `settings.json`                                    | Configure um servidor MCP em `mcpServers` (veja abaixo)                                      |
| `advanced.tavilyApiKey` em `settings.json`                              | Use o [servidor MCP Tavily](#tavily-websearch)                                               |
| Variável de ambiente `TAVILY_API_KEY`                                   | Use o [servidor MCP Tavily](#tavily-websearch)                                               |
| `DASHSCOPE_API_KEY` para pesquisa na Web                                | Use o [MCP do Alibaba Cloud Bailian WebSearch](#alibaba-cloud-bailian-websearch-recommended) |
| `GLM_API_KEY` para pesquisa na Web                                      | Use o [MCP do GLM WebSearch Prime](#glm-websearch-prime-zhipuai)                             |
| Flags CLI `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key`  | Configure via `mcpServers` em `settings.json`                                                |

### Exemplos de Migração

**Antes (Tavily via ferramenta integrada):**

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

**Antes (DashScope via ferramenta integrada):**

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

## Serviços de Pesquisa na Web MCP Suportados

### Alibaba Cloud Bailian WebSearch (Recomendado)

O serviço oficial de pesquisa na Web MCP fornecido pela plataforma Alibaba Cloud Bailian, alimentado pelo DashScope.

- **MCP Marketplace:** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **Custo:** Pago (cobrado via Alibaba Cloud DashScope)
- **Obter Chave de API:** https://help.aliyun.com/zh/model-studio/get-api-key
- **Melhor para:** consultas em chinês, acesso a conteúdo web chinês, integração com o ecossistema Alibaba Cloud

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

Substitua `${DASHSCOPE_API_KEY}` pela sua chave de API real, ou defina-a como uma variável de ambiente para que o Qwen Code a reconheça automaticamente.

---

### Tavily WebSearch

Um servidor MCP pronto para produção que oferece recursos de pesquisa na Web em tempo real, extração, mapeamento e rastreamento.

- **Repositório:** https://github.com/tavily-ai/tavily-mcp
- **Custo:** Pago (plano gratuito disponível)
- **Obter Chave de API:** https://app.tavily.com/home
- **Melhor para:** pesquisa na Web de propósito geral com respostas de alta qualidade geradas por IA

#### Ferramentas Disponíveis

- `tavily_search` — Pesquisa na Web em tempo real
- `tavily_extract` — Extração inteligente de dados de páginas web
- `tavily_map` — Criar um mapa estruturado de um site
- `tavily_crawl` — Explorar sites de forma sistemática

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

Substitua `${TAVILY_API_KEY}` pela sua chave de API real, ou defina-a como uma variável de ambiente.

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

O serviço oficial de pesquisa na Web MCP Remoto fornecido pela ZhipuAI (智谱AI), desenvolvido para usuários do GLM Coding Plan. Oferece pesquisa na Web em tempo real, incluindo notícias, preços de ações, clima e muito mais.

- **Documentação:** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **Custo:** Incluso na assinatura do GLM Coding Plan (Lite: 100 chamadas/mês, Pro: 1.000/mês, Max: 4.000/mês)
- **Obter Chave de API:** https://open.bigmodel.cn/apikey/platform
- **Melhor para:** consultas em chinês, recuperação de informações em tempo real

#### Ferramentas Disponíveis

- `webSearchPrime` — Pesquisa na Web que retorna título da página, URL, resumo, nome do site e favicon

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

Substitua `${GLM_API_KEY}` pela sua chave de API ZhipuAI real, ou defina-a como uma variável de ambiente.

---