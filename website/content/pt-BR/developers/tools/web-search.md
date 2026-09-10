# Pesquisa na Web

O Qwen Code oferece pesquisa na web de duas formas:

1. **Ferramenta integrada `web_search`** — suportada pelo search server-side da DashScope Responses API. Ativada por padrão na inicialização para configurações ModelStudio e OpenAI-compatíveis com DashScope suportadas; sem provedor extra ou configuração MCP.
2. **Integrações MCP (Model Context Protocol)** — conecte qualquer serviço de busca externo (Tavily, GLM e outros). Use esta opção quando seu provedor não puder suportar a ferramenta integrada.

## `web_search` integrado

A ferramenta integrada emite uma requisição de busca autônoma para um pequeno modelo auxiliar com as ferramentas `web_search` (e `web_extractor`) server-side do DashScope, e retorna os achados narrados mais URLs de origem.

### Quando ela se ativa sozinha

Se você não configurou nada em `tools.webSearch`, a ferramenta é registrada sempre que o modelo que você está executando pode suportar a requisição de busca com as mesmas credenciais:

| Como você fez login                                                                                                  | Busca integrada                                 |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Alibaba ModelStudio → **Chave de API Padrão**                                                                        | ativada                                         |
| Alibaba ModelStudio → **Token Plan**                                                                                 | ativada                                         |
| Alibaba ModelStudio → **Coding Plan**                                                                                | desativada — seu endpoint não é verificado para esta API |
| Uma entrada `modelProviders` compatível com OpenAI ou Provedor Personalizado em um host reconhecido de DashScope Responses, com uma chave direta | ativada                                         |
| Provedores de terceiros (OpenRouter, DeepSeek, ModelScope, …), endpoints personalizados em outros hosts, modelos locais | desativada                                      |

Buscas são cobradas na mesma chave do seu modelo principal. O tratamento de permissões segue o modo de aprovação ativo e as regras; no modo de aprovação `default`, a primeira busca pede confirmação. Quando seu provedor não pode suportar a ferramenta, ela simplesmente não aparece na inicialização — nenhum aviso de inicialização.

Para desativá-la:

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

ou `ENABLE_WEB_SEARCH=false`. O modo bare e o modo safe sempre a desativam.

### Configurando-a explicitamente

Aponte a ferramenta para um ModelStudio Standard/Token Plan ou outra entrada verificada de DashScope Responses. Isso é útil quando seu modelo principal está em outro provedor e você também tem uma chave DashScope suportada separada. Hosts do Coding Plan são excluídos da ativação automática porque as ferramentas de busca Responses não são verificadas neles. Você pode ativar explicitamente com `tools.webSearch.model`; se o endpoint não as servir, a primeira busca falha de forma explícita. Use um provedor de busca MCP se não quiser depender desse caminho não verificado.

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

| Configuração                   | Substituição por env   | Significado                                                                                                                                                                                                                                                                               |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`    | Defina `false` para desativar a ferramenta. A ativação implícita na inicialização requer deixar `enabled`, `model` e o backend somente-env não definidos. Definir `true` permite a derivação automática somente quando o backend somente-env também não está definido; caso contrário, um `model` é obrigatório. |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`     | Seletor do modelo de busca para o caminho explícito (`modelId` ou `authType:modelId`). Com `WEB_SEARCH_BASE_URL`, é o id simples do modelo para aquele endpoint; caso contrário, deve corresponder a uma entrada `modelProviders` compatível com DashScope declarada. O caminho automático usa `qwen3.6-plus`. |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR` | Permite que o agente de busca abra páginas de resultado para respostas melhor fundamentadas (padrão `true`; cobrado separadamente pelo DashScope).                                                                                                                                                                |

### Configuração apenas por env (sem settings.json)

Para ambientes onde você não pode escrever um arquivo de configurações (contêineres travados, CI apenas com injeção de env), a ferramenta pode ser configurada inteiramente através de variáveis de ambiente — sem entrada `modelProviders` necessária:

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.6-plus
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export DASHSCOPE_API_KEY=sk-...        # ou defina WEB_SEARCH_API_KEY em vez disso
```

`WEB_SEARCH_BASE_URL` espelha o `baseUrl` de uma entrada `modelProviders` e deve ser um endpoint compatível com DashScope; quando definido, tem precedência sobre a resolução de `modelProviders` e `WEB_SEARCH_MODEL` é usado como o id de modelo DashScope simples. A chave de API é lida de `WEB_SEARCH_API_KEY` se definida, caso contrário de `DASHSCOPE_API_KEY`. Configuração incorreta ainda aparece como um aviso de inicialização.

Notas:

- O seletor deve resolver para uma entrada `modelProviders` compatível com DashScope portando uma chave de API direta via `envKey`. Seu modelo principal pode ser qualquer provedor — apenas a requisição do lado da busca precisa de uma entrada DashScope. Qwen OAuth não pode suportar a ferramenta.
- Quais provedores podem ativar a ferramenta é decidido na inicialização. Uma vez ativa, o backend de busca segue o modelo atualmente selecionado na próxima busca; mudar para um provedor não suportado faz aquela invocação falhar, enquanto mudar de uma sessão onde a ferramenta estava ausente ainda exige uma reinicialização para registrá-la.
- A detecção automática de host aceita intencionalmente apenas hosts regionais conhecidos do DashScope, Token Plan MaaS e hosts internos Alibaba. Gateways genéricos `*.alicloudapi.com` e `DASHSCOPE_PROXY_BASE_URL` são excluídos porque não se sabe se encaminham as ferramentas de busca Responses.
- Se habilitada explicitamente mas mal configurada, a ferramenta permanece desligada e um aviso de inicialização explica qual condição falhou. A ativação automática nunca emite um aviso.
- Buscas cobram sua chave DashScope (`usage.x_tools` conta). O modo de aprovação automática (o padrão) permite que o classificador aprove buscas sem prompt; no modo de aprovação `default`, a ferramenta pergunta, e aprovar com "sempre permitir" persiste uma regra de permissão `WebSearch` padrão, como outras ferramentas.
- Não há lista de permissão de modelo no lado do cliente; um modelo que o endpoint Responses não serve falha de forma explícita no primeiro uso.

## Alternativas MCP

Se seu provedor não puder suportar a ferramenta integrada, a pesquisa na web está disponível conectando um servidor MCP externo — consulte os serviços abaixo.

## ⚠️ Mudança Significativa Histórica: `web_search` integrado original removido

> **Versões afetadas:** `V0.0.7+` até a última versão com a busca web integrada multi-provedor original.

A ferramenta `web_search` integrada original (multi-provedor Tavily/Google/GLM/DashScope) e sua configuração foram **removidas**. A ferramenta integrada documentada acima é uma implementação diferente com configuração diferente. Se você estava usando qualquer um dos seguintes, migre para a nova ferramenta integrada (DashScope) ou para MCP:

| Removido                                                               | O que fazer                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Bloco `webSearch` em `settings.json`                                   | Configure um servidor MCP em `mcpServers` em vez disso (veja abaixo) |
| `advanced.tavilyApiKey` em `settings.json`                             | Use o [servidor MCP Tavily](#tavily-websearch)                     |
| Variável de ambiente `TAVILY_API_KEY`                                  | Use o [servidor MCP Tavily](#tavily-websearch)                     |
| `DASHSCOPE_API_KEY` para pesquisa na web                               | Use a [ferramenta `web_search` integrada](#built-in-web_search)      |
| `GLM_API_KEY` para pesquisa na web                                     | Use o [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai)      |
| Flags CLI `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` | Configure via `mcpServers` em `settings.json`                      |

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

### Alibaba Cloud Bailian WebSearch

O serviço oficial de pesquisa na web MCP fornecido pela plataforma Alibaba Cloud Bailian, alimentado pelo DashScope. Se você tem uma chave DashScope, prefira a ferramenta `web_search` integrada acima — ela usa um caminho de busca mais forte que este serviço MCP.

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

Um servidor MCP pronto para produção que oferece recursos de pesquisa na web em tempo real, extração, mapeamento e rastreamento.

- **Repositório:** https://github.com/tavily-ai/tavily-mcp
- **Custo:** Pago (plano gratuito disponível)
- **Obter Chave de API:** https://app.tavily.com/home
- **Melhor para:** pesquisa na web de propósito geral com respostas de alta qualidade geradas por IA

#### Ferramentas Disponíveis

- `tavily_search` — Pesquisa na web em tempo real
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

O serviço oficial de pesquisa na web MCP Remoto fornecido pela ZhipuAI (智谱AI), desenvolvido para usuários do GLM Coding Plan. Oferece pesquisa na web em tempo real, incluindo notícias, preços de ações, clima e muito mais.

- **Documentação:** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **Custo:** Incluso na assinatura do GLM Coding Plan (Lite: 100 chamadas/mês, Pro: 1.000/mês, Max: 4.000/mês)
- **Obter Chave de API:** https://open.bigmodel.cn/apikey/platform
- **Melhor para:** consultas em chinês, recuperação de informações em tempo real

#### Ferramentas Disponíveis

- `webSearchPrime` — Pesquisa na web que retorna título da página, URL, resumo, nome do site e favicon

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
