# Pesquisa na Web

O Qwen Code oferece pesquisa na web de duas formas:

1. **Ferramenta `web_search` integrada** — baseada na busca no lado do servidor da API Responses do DashScope ou, para sessões de Assinatura Qwen, no serviço de busca MCP da Qwen. Ativada após o login na assinatura Plus/Pro e habilitada por padrão na inicialização para configurações compatíveis com ModelStudio e OpenAI via DashScope; sem necessidade de provedor adicional ou configuração de MCP.
2. **Integrações MCP (Model Context Protocol)** — conecte qualquer serviço de busca externo (Tavily, GLM e outros). Use esta opção quando seu provedor não puder suportar a ferramenta integrada.

## `web_search` integrado [#built-in-web_search]

Para o DashScope, a ferramenta integrada emite uma solicitação de busca autônoma para um modelo auxiliar pequeno com ferramentas `web_search` (e `web_extractor`) no lado do servidor, e retorna os achados narrados mais as URLs das fontes. Com [Conta Qwen com Assinatura](../../users/configuration/auth.md), ela usa o serviço de busca MCP da Qwen e suas credenciais de login atuais. Não é necessária uma chave de API de busca separada, um modelo auxiliar ou configuração `mcpServers`. `webExtractor` se aplica apenas à busca do DashScope.

### Quando ela se ativa sozinha

Se você não configurou nada em `tools.webSearch`, a ferramenta é registrada sempre que o modelo que você está executando pode suportar a requisição de busca com as mesmas credenciais:

| Como você fez login                                                                                                  | Busca integrada                                 |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [Conta Qwen com Assinatura](https://chat.qwen.ai/?memberPlan=qwen_code) — **Plus ou Pro**                             | ativado                                              |
| Alibaba ModelStudio → **Chave de API Padrão**                                                                        | ativada                                         |
| Alibaba ModelStudio → **Token Plan**                                                                                 | ativada                                         |
| Alibaba ModelStudio → **Coding Plan**                                                                                | desativada — seu endpoint não é verificado para esta API |
| QwenCloud → **Chave de API Padrão**                                                                                           | ativado                                              |
| QwenCloud → **Plano de Tokens**                                                                                                 | ativado                                              |
| Uma entrada `modelProviders` compatível com OpenAI ou Provedor Personalizado em um host reconhecido de DashScope Responses, com uma chave direta | ativada                                         |
| Provedores de terceiros (OpenRouter, DeepSeek, ModelScope, …), endpoints personalizados em outros hosts, modelos locais | desativada                                      |

As buscas do DashScope cobram a mesma chave que seu modelo principal; as buscas por assinatura reutilizam suas credenciais de login da Qwen. O tratamento de permissões segue o modo de aprovação ativo e as regras; no modo de aprovação `default`, a primeira busca solicita confirmação. Quando seu provedor não pode suportar a ferramenta, ela simplesmente não aparece na inicialização — sem aviso na inicialização.

Para desativá-la:

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

ou `ENABLE_WEB_SEARCH=false`. O modo bare e o modo safe sempre a desativam.

### Configurando-a explicitamente

Esta seção configura a busca do DashScope. A busca por assinatura reutiliza suas credenciais de associação e não requer configuração adicional. Configurações explícitas de busca ainda têm precedência sobre a busca automática por assinatura.

Aponte a ferramenta para um ModelStudio Standard/Token Plan ou outra entrada verificada de DashScope Responses. Isso é útil quando seu modelo principal está em outro provedor e você também tem uma chave DashScope suportada separada. Hosts do Coding Plan são excluídos da ativação automática porque as ferramentas de busca Responses não são verificadas neles. Você pode ativar explicitamente com `tools.webSearch.model`; se o endpoint não as servir, a primeira busca falha de forma explícita. Use um provedor de busca MCP se não quiser depender desse caminho não verificado.

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

| Configuração                   | Substituição por env   | Significado                                                                                                                                                                                                                                                                               |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`    | Defina `false` para desativar a ferramenta. A ativação implícita na inicialização requer deixar `enabled`, `model` e o backend somente-env não definidos. Definir `true` permite a derivação automática somente quando o backend somente-env também não está definido; caso contrário, um `model` é obrigatório. |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`     | Seletor do modelo de busca para o caminho explícito (`modelId` ou `authType:modelId`). Com `WEB_SEARCH_BASE_URL`, é o id simples do modelo para aquele endpoint; caso contrário, deve corresponder a uma entrada `modelProviders` compatível com DashScope declarada. O caminho automático usa `qwen3.8-flash`. |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR` | Permite que o agente de busca abra páginas de resultado para respostas melhor fundamentadas (padrão `true`; cobrado separadamente pelo DashScope).                                                                                                                                                                |
| `tools.webSearch.timeoutMs`     | `WEB_SEARCH_TIMEOUT_MS`      | Orçamento de tempo total para uma busca, em milissegundos (padrão `120000`, máximo `600000`; outros valores voltam ao padrão). Uma busca que esgota o tempo retorna o que chegou como resultado parcial quando pelo menos uma chamada de busca foi concluída; se o orçamento expira antes da primeira chamada de busca terminar, a ferramenta reporta um erro de timeout, porque narração sem busca executada não é evidência auditável. Um limite de execução por ferramenta (`QWEN_CODE_TOOL_EXECUTION_TIMEOUT_MS`) abaixo desse orçamento dispara primeiro e descarta o resultado parcial; mantenha-o acima de `timeoutMs`. |
| `tools.webSearch.allowedHosts`  | `WEB_SEARCH_ALLOWED_HOSTS`   | Sufixos de host adicionais confiáveis para um backend de busca configurado explicitamente — um host exato, ou qualquer subdomínio de um sufixo listado (separados por vírgula na variável de ambiente). Vazio por padrão, então o comportamento permanece inalterado a menos que definido. Apenas o backend `WEB_SEARCH_BASE_URL` e o caminho `modelProviders` consultam isso; a derivação automática nunca faz isso, então um host personalizado é usado apenas onde sua própria configuração o nomeia. O host configurado recebe a chave de API. As entradas são aparadas e convertidas para minúsculas, e entradas sem ponto são ignoradas.                                                 |
| `tools.webSearch.maxPerSession` | `WEB_SEARCH_MAX_PER_SESSION` | Máximo de chamadas `web_search` em uma sessão (padrão `200`, máximo `10000`; outros valores voltam ao padrão). A contagem é compartilhada com subagentes e reinicia quando a sessão muda (`/clear`, `/resume`, ramificação). Quando atingido, buscas adicionais são ignoradas e o modelo é instruído a continuar com o que já coletou.                                                                                                                  |

### Configuração apenas por env (sem settings.json)

Para ambientes onde você não pode escrever um arquivo de configurações (contêineres restritos, CI com injeção apenas via variáveis de ambiente), a ferramenta pode ser configurada inteiramente através de variáveis de ambiente — nenhuma entrada `modelProviders` é necessária:

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.8-flash
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export WEB_SEARCH_ALLOWED_HOSTS=llm-gw.example.com   # only for a gateway host
export DASHSCOPE_API_KEY=sk-...        # or set WEB_SEARCH_API_KEY instead
```

`WEB_SEARCH_BASE_URL` espelha o `baseUrl` de uma entrada `modelProviders` e deve ser um endpoint compatível com DashScope; quando definido, ele tem precedência sobre a resolução `modelProviders` e `WEB_SEARCH_MODEL` é usado como o id do modelo DashScope simples. A chave da API é lida de `WEB_SEARCH_API_KEY` se definida, caso contrário, de `DASHSCOPE_API_KEY`. Se o endpoint for um gateway em seu próprio domínio, liste esse host em `WEB_SEARCH_ALLOWED_HOSTS` (ou `tools.webSearch.allowedHosts`) — caso contrário, a lista incorporada é a única aceita pela verificação. Uma configuração incorreta ainda aparece como um aviso na inicialização.

Notas:

- Para busca explícita do DashScope, o seletor deve resolver para uma entrada `modelProviders` compatível com DashScope carregando uma chave de API direta via `envKey`. Seu modelo principal pode ser de qualquer provedor. O provedor legado gratuito Qwen OAuth não pode suportar este caminho; a busca por Assinatura Qwen usa o serviço MCP separado descrito acima.
- O registro da busca é reavaliado após mudanças bem-sucedidas de autenticação. Entrar na Assinatura Qwen habilita a busca na sessão atual sem reiniciar. Desativação explícita, modo seguro/bare e regras de permissão de ferramentas ainda se aplicam.
- A detecção automática de host aceita intencionalmente apenas hosts regionais conhecidos do DashScope, Model Studio e hosts MaaS da QwenCloud (incluindo seus subdomínios de assinatura `token-plan.`), além de hosts internos da Alibaba. Gateways genéricos `*.alicloudapi.com`, `DASHSCOPE_PROXY_BASE_URL` e qualquer host que você tenha adicionado apenas em `allowedHosts` são excluídos desse caminho automático, pois ele é executado sem sua intervenção e poderia entregar a chave do seu provedor principal a um host não declarado. Para um gateway que você declara explicitamente, liste-o em `tools.webSearch.allowedHosts` e aponte `WEB_SEARCH_BASE_URL` (ou uma entrada `modelProviders`) para ele.
- Se habilitada explicitamente mas mal configurada, a ferramenta permanece desligada e um aviso de inicialização explica qual condição falhou. A ativação automática nunca emite um aviso.
- As buscas no DashScope cobram sua chave DashScope (`usage.x_tools` conta). O modo de aprovação automática (padrão) permite que o classificador aprove buscas sem solicitar confirmação; no modo de aprovação `default`, a ferramenta pergunta, e aprovar com "permitir sempre" persiste uma regra de permissão padrão `WebSearch`, como ocorre com outras ferramentas.
- Não há lista de permissão de modelo no lado do cliente; um modelo que o endpoint Responses não serve falha de forma explícita no primeiro uso.
- Uma busca que excede seu orçamento de tempo retorna o que chegou como resultado parcial quando pelo menos uma chamada de busca foi concluída; se o orçamento expira antes da primeira chamada de busca terminar, a ferramenta reporta um erro de timeout, porque narração sem busca executada não é evidência auditável. Quando uma chamada de busca foi concluída mas a resposta narrada nunca chegou, o resultado carrega no máximo 6.000 caracteres do texto da página que o agente havia lido, rotulado como conteúdo bruto de página.
- O limite por sessão conta chamadas da ferramenta `web_search`, não as buscas que uma chamada executa internamente, e uma chamada que falha ainda conta porque a requisição foi enviada. Uma chamada ignorada não é um erro: ela informa ao modelo que o orçamento foi usado e para pedir que você aumente `tools.webSearch.maxPerSession` se mais buscas forem genuinamente necessárias.

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

### WebSearch da Alibaba Cloud Bailian

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

O serviço Remote MCP oficial de busca na web fornecido pela ZhipuAI (智谱AI), projetado para usuários do GLM Coding Plan. Fornece busca na web em tempo real, incluindo notícias, preços de ações, clima e muito mais.

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

### Firecrawl

O servidor MCP hospedado oficial da Firecrawl, fornecendo busca na web, scraping de páginas, crawling e mapeamento de sites, interação com navegador e análise de arquivos. Os resultados da busca podem incluir o conteúdo de cada página em Markdown, permitindo que o modelo leia suas fontes sem uma etapa separada de fetch. O servidor hospedado funciona sem chave de API para busca, scraping e análise. As consultas de busca, as URLs que você solicita para leitura e os arquivos analisados são enviados à Firecrawl.

- **Documentação:** https://docs.firecrawl.dev/mcp-server
- **Custo:** Nenhuma chave de API necessária para busca, scraping e análise (limite diário por IP); planos pagos para limites maiores
- **Obter Chave de API:** https://www.firecrawl.dev/app/api-keys
- **Ideal para:** Busca na web onde o modelo também precisa ler as páginas encontradas, e para testar a busca na web via MCP sem uma chave de API

#### Ferramentas Disponíveis

- `firecrawl_search` — Busca na web, opcionalmente retornando o conteúdo da página de cada resultado em Markdown
- `firecrawl_scrape` — Obter uma única página em Markdown limpo
- `firecrawl_parse` — Converter um arquivo local (PDF, Word, planilha e outros) para Markdown

Com uma chave de API, o servidor também oferece ferramentas para mapear e rastrear sites, interagir com páginas (clicar, digitar, navegar) e buscar fontes de desenvolvedores, como issues e docs do GitHub.

#### Configuração

**Método 1: Comando CLI (MCP Remoto)**

```bash
qwen mcp add firecrawl \
  -t http \
  "https://mcp.firecrawl.dev/v2/mcp" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}"
```

Para experimentar sem uma chave, omita a linha `-H`. Você obtém `firecrawl_search`, `firecrawl_scrape` e `firecrawl_parse` dentro de um limite diário por IP.

**Método 2: `settings.json` (MCP Remoto)**

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

Substitua `${FIRECRAWL_API_KEY}` pela sua chave de API real ou defina-a como uma variável de ambiente. Se a chave estiver vazia, o servidor ainda se conecta, mas oferece apenas as três ferramentas sem chave.

**Método 3: `settings.json` (NPX Local)**

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

O servidor MCP hospedado oficial da SerpApi, fornecendo resultados de busca estruturados em tempo real do Google, Baidu, Bing e outros mecanismos de busca através de uma única ferramenta. As consultas de busca e seus parâmetros são enviados à SerpApi.

- **Documentação:** https://serpapi.com/integrations/mcp
- **Custo:** Pago (plano gratuito disponível)
- **Obter Chave de API:** https://serpapi.com/manage-api-key
- **Ideal para:** Resultados estruturados de uma ampla escolha de mecanismos de busca

#### Ferramentas Disponíveis

- `search` — Busca na web, opcionalmente retornando resultados em Markdown

#### Configuração

**Método 1: Comando CLI**

```bash
qwen mcp add serpapi \
  -t http \
  "https://mcp.serpapi.com/mcp" \
  -H "Authorization: Bearer ${SERPAPI_API_KEY}"
```

**Método 2: `settings.json`**

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

Substitua `${SERPAPI_API_KEY}` pela sua chave de API real ou defina-a como uma variável de ambiente. A chave é necessária apenas para buscas. Sem uma chave de API válida, o servidor ainda se conecta e lista suas ferramentas, mas `search` retorna um erro.

---

### looot

Um servidor MCP hospedado da looot com busca na web, resultados SERP do Google, busca de notícias e leitura de páginas da web. As consultas de busca e as URLs que você solicita para leitura são enviadas à looot.

- **Documentação:** https://docs.looot.ai
- **Custo:** Pago (saldo pré-pago, sem nível gratuito)
- **Obter Chave de API:** https://looot.ai
- **Ideal para:** Busca na web, resultados SERP do Google e notícias, e leitura de uma página como texto

#### Ferramentas Disponíveis

- `web_search` — Busca na web
- `google_search_results` — Resultados SERP do Google
- `news_search` — Busca de notícias
- `read_web_page` — Ler uma única página como texto

O servidor também expõe buscas de empresas e e-mails.

#### Configuração

**Método 1: Comando CLI (MCP Remoto)**

```bash
qwen mcp add looot \
  -t http \
  "https://api.looot.ai/mcp" \
  -H "Authorization: Bearer ${LOOOT_API_KEY}"
```

**Método 2: `settings.json` (MCP Remoto)**

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

Substitua `${LOOOT_API_KEY}` pela sua chave de API real, ou defina-a como uma variável de ambiente.

---
