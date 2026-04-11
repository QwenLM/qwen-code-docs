# Ferramenta de Pesquisa na Web (`web_search`)

Este documento descreve a ferramenta `web_search` para realizar pesquisas na web usando vários provedores.

## Descrição

Use `web_search` para realizar uma pesquisa na web e obter informações da internet. A ferramenta suporta vários provedores de pesquisa e retorna uma resposta concisa com citações de fontes, quando disponíveis.

### Provedores Suportados

1. **DashScope** (Oficial, Gratuito) - Disponível automaticamente para usuários do Qwen OAuth (200 requisições/minuto, 1000 requisições/dia)
2. **Tavily** - API de pesquisa de alta qualidade com geração de respostas integrada
3. **Google Custom Search** - API JSON do Custom Search do Google

### Argumentos

`web_search` aceita dois argumentos:

- `query` (string, obrigatório): A consulta de pesquisa
- `provider` (string, opcional): Provedor específico a ser usado ("dashscope", "tavily", "google")
  - Se não especificado, usa o provedor padrão da configuração

## Configuração

### Método 1: Arquivo de Configurações (Recomendado)

Adicione ao seu `settings.json`:

```json
{
  "webSearch": {
    "provider": [
      { "type": "dashscope" },
      { "type": "tavily", "apiKey": "tvly-xxxxx" },
      {
        "type": "google",
        "apiKey": "your-google-api-key",
        "searchEngineId": "your-search-engine-id"
      }
    ],
    "default": "dashscope"
  }
}
```

**Notas:**

- O DashScope não requer uma API key (serviço oficial e gratuito)
- **Usuários do Qwen OAuth:** O DashScope é adicionado automaticamente à sua lista de provedores, mesmo que não esteja configurado explicitamente
- Configure provedores adicionais (Tavily, Google) se quiser usá-los junto com o DashScope
- Defina `default` para especificar qual provedor usar por padrão (se não definido, a ordem de prioridade é: Tavily > Google > DashScope)

### Método 2: Variáveis de Ambiente

Defina as variáveis de ambiente no seu shell ou no arquivo `.env`:

```bash
# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### Método 3: Argumentos de Linha de Comando

Passe as API keys ao executar o Qwen Code:

```bash
# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# Specify default provider
qwen --web-search-default tavily
```

### Compatibilidade com Versões Anteriores (Obsoleto)

⚠️ **OBSOLETO:** A configuração legada `tavilyApiKey` ainda é suportada para compatibilidade com versões anteriores, mas está obsoleta:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Deprecated
  }
}
```

**Importante:** Esta configuração está obsoleta e será removida em uma versão futura. Migre para o novo formato de configuração `webSearch` mostrado acima. A configuração antiga configurará automaticamente o Tavily como um provedor, mas recomendamos fortemente que você atualize sua configuração.

## Desativando a Pesquisa na Web

Se quiser desativar a funcionalidade de pesquisa na web, você pode excluir a ferramenta `web_search` no seu `settings.json`:

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Nota:** Esta configuração requer a reinicialização do Qwen Code para entrar em vigor. Uma vez desativada, a ferramenta `web_search` não estará disponível para o modelo, mesmo que os provedores de pesquisa na web estejam configurados.

## Exemplos de Uso

### Pesquisa básica (usando o provedor padrão)

```
web_search(query="latest advancements in AI")
```

### Pesquisa com provedor específico

```
web_search(query="latest advancements in AI", provider="tavily")
```

### Exemplos do mundo real

```
web_search(query="weather in San Francisco today")
web_search(query="latest Node.js LTS version", provider="google")
web_search(query="best practices for React 19", provider="dashscope")
```

## Detalhes dos Provedores

### DashScope (Oficial)

- **Custo:** Gratuito
- **Autenticação:** Disponível automaticamente ao usar a autenticação Qwen OAuth
- **Configuração:** Não requer API key, adicionado automaticamente à lista de provedores para usuários do Qwen OAuth
- **Cota:** 200 requisições/minuto, 1000 requisições/dia
- **Melhor para:** Consultas gerais, sempre disponível como fallback para usuários do Qwen OAuth
- **Registro automático:** Se você estiver usando o Qwen OAuth, o DashScope é adicionado automaticamente à sua lista de provedores, mesmo que não o configure explicitamente

### Tavily

- **Custo:** Requer API key (serviço pago com plano gratuito)
- **Cadastro:** https://tavily.com
- **Recursos:** Resultados de alta qualidade com resposta gerada por IA
- **Melhor para:** Pesquisas, respostas abrangentes com citações

### Google Custom Search

- **Custo:** Plano gratuito disponível (100 consultas/dia)
- **Configuração:**
  1. Ative a Custom Search API no Google Cloud Console
  2. Crie um Custom Search Engine em https://programmablesearchengine.google.com
- **Recursos:** Qualidade de pesquisa do Google
- **Melhor para:** Consultas específicas e factuais

## Notas Importantes

- **Formato da resposta:** Retorna uma resposta concisa com citações de fontes numeradas
- **Citações:** Os links das fontes são anexados como uma lista numerada: [1], [2], etc.
- **Vários provedores:** Se um provedor falhar, especifique outro manualmente usando o parâmetro `provider`
- **Disponibilidade do DashScope:** Disponível automaticamente para usuários do Qwen OAuth, sem necessidade de configuração
- **Seleção do provedor padrão:** O sistema seleciona automaticamente um provedor padrão com base na disponibilidade:
  1. Sua configuração explícita `default` (maior prioridade)
  2. Argumento da CLI `--web-search-default`
  3. Primeiro provedor disponível por prioridade: Tavily > Google > DashScope

## Solução de Problemas

**Ferramenta não disponível?**

- **Para usuários do Qwen OAuth:** A ferramenta é registrada automaticamente com o provedor DashScope, sem necessidade de configuração
- **Para outros tipos de autenticação:** Certifique-se de que pelo menos um provedor (Tavily ou Google) esteja configurado
- Para Tavily/Google: Verifique se suas API keys estão corretas

**Erros específicos do provedor?**

- Use o parâmetro `provider` para tentar um provedor de pesquisa diferente
- Verifique suas cotas e limites de taxa da API
- Verifique se as API keys estão configuradas corretamente

**Precisa de ajuda?**

- Verifique sua configuração: Execute `qwen` e use o diálogo de configurações
- Visualize suas configurações atuais em `~/.qwen-code/settings.json` (macOS/Linux) ou `%USERPROFILE%\.qwen-code\settings.json` (Windows)