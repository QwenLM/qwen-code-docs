# Ferramenta de Pesquisa na Web (`web_search`)

Este documento descreve a ferramenta `web_search` para realizar pesquisas na web usando múltiplos provedores.

## Descrição

Use `web_search` para realizar uma pesquisa na web e obter informações da internet. A ferramenta suporta múltiplos provedores de busca e retorna uma resposta concisa com citações de fontes quando disponíveis.

### Provedores Suportados

1. **DashScope** (Oficial, Gratuito) - Disponível automaticamente para usuários do Qwen OAuth (200 requisições/minuto, 1000 requisições/dia)
2. **Tavily** - API de busca de alta qualidade com geração de respostas integrada
3. **Google Custom Search** - API JSON de Busca Personalizada do Google

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

**Observações:**

- O DashScope não requer uma chave de API (serviço oficial e gratuito)
- **Usuários do Qwen OAuth:** O DashScope é adicionado automaticamente à sua lista de provedores, mesmo que não configurado explicitamente
- Configure provedores adicionais (Tavily, Google) se quiser usá-los juntamente com o DashScope
- Defina `default` para especificar qual provedor usar por padrão (se não definido, a ordem de prioridade será: Tavily > Google > DashScope)

### Método 2: Variáveis de Ambiente

Defina variáveis de ambiente em seu terminal ou arquivo `.env`:

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"
```

# Google
export GOOGLE_API_KEY="sua-chave-api"
export GOOGLE_SEARCH_ENGINE_ID="seu-id-engine"
```

### Método 3: Argumentos de Linha de Comando

Passe as chaves de API ao executar o Qwen Code:

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key sua-chave --google-search-engine-id seu-id

# Especificar provedor padrão
qwen --web-search-default tavily
```

### Compatibilidade com Versões Anteriores (Descontinuado)

⚠️ **DESCONTINUADO:** A configuração legada `tavilyApiKey` ainda é suportada para compatibilidade com versões anteriores, mas está descontinuada:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Descontinuado
  }
}
```

**Importante:** Esta configuração está descontinuada e será removida em uma versão futura. Por favor, migre para o novo formato de configuração `webSearch` mostrado acima. A configuração antiga configurará automaticamente o Tavily como provedor, mas recomendamos fortemente que você atualize sua configuração.

## Desativando a Pesquisa na Web

Se você quiser desativar a funcionalidade de pesquisa na web, pode excluir a ferramenta `web_search` em seu `settings.json`:

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Observação:** Esta configuração requer uma reinicialização do Qwen Code para entrar em vigor. Uma vez desativada, a ferramenta `web_search` não estará disponível para o modelo, mesmo que provedores de pesquisa na web estejam configurados.

## Exemplos de Uso

### Pesquisa básica (usando o provedor padrão)

```
web_search(query="últimos avanços em IA")
```

### Pesquisa com provedor específico

```
web_search(query="últimos avanços em IA", provider="tavily")
```

### Exemplos do mundo real

```
web_search(query="clima em São Francisco hoje")
web_search(query="versão LTS mais recente do Node.js", provider="google")
web_search(query="melhores práticas para React 19", provider="dashscope")
```

## Detalhes do Provedor

### DashScope (Oficial)

- **Custo:** Grátis
- **Autenticação:** Disponível automaticamente ao usar autenticação OAuth do Qwen
- **Configuração:** Nenhuma chave de API necessária, adicionada automaticamente à lista de provedores para usuários com OAuth do Qwen
- **Cota:** 200 solicitações/minuto, 1000 solicitações/dia
- **Melhor para:** Consultas gerais, sempre disponível como fallback para usuários com OAuth do Qwen
- **Auto-registro:** Se você estiver usando OAuth do Qwen, o DashScope será automaticamente adicionado à sua lista de provedores mesmo que você não configure explicitamente

### Tavily

- **Custo:** Requer chave de API (serviço pago com camada gratuita)
- **Cadastro:** https://tavily.com
- **Recursos:** Resultados de alta qualidade com respostas geradas por IA
- **Melhor para:** Pesquisa, respostas abrangentes com citações

### Pesquisa Personalizada do Google

- **Custo:** Camada gratuita disponível (100 consultas/dia)
- **Configuração:**
  1. Habilite a API de Pesquisa Personalizada no Google Cloud Console
  2. Crie um mecanismo de pesquisa personalizado em https://programmablesearchengine.google.com
- **Recursos:** Qualidade de pesquisa do Google
- **Melhor para:** Consultas específicas e factuais

## Notas Importantes

- **Formato da resposta:** Retorna uma resposta concisa com citações numeradas de fontes
- **Citações:** Links de fontes são adicionados como uma lista numerada: [1], [2], etc.
- **Múltiplos provedores:** Se um provedor falhar, especifique manualmente outro usando o parâmetro `provider`
- **Disponibilidade do DashScope:** Automaticamente disponível para usuários OAuth do Qwen, nenhuma configuração necessária
- **Seleção do provedor padrão:** O sistema seleciona automaticamente um provedor padrão com base na disponibilidade:
  1. Sua configuração explícita de `default` (prioridade mais alta)
  2. Argumento da CLI `--web-search-default`
  3. Primeiro provedor disponível por prioridade: Tavily > Google > DashScope

## Solução de problemas

**Ferramenta não disponível?**

- **Para usuários do Qwen OAuth:** A ferramenta é registrada automaticamente com o provedor DashScope, nenhuma configuração necessária
- **Para outros tipos de autenticação:** Verifique se pelo menos um provedor (Tavily ou Google) está configurado
- Para Tavily/Google: Verifique se suas chaves de API estão corretas

**Erros específicos do provedor?**

- Use o parâmetro `provider` para tentar um provedor de busca diferente
- Verifique suas cotas e limites de taxa da API
- Verifique se as chaves de API estão definidas corretamente na configuração

**Precisa de ajuda?**

- Verifique sua configuração: Execute `qwen` e utilize o diálogo de configurações
- Visualize suas configurações atuais em `~/.qwen-code/settings.json` (macOS/Linux) ou `%USERPROFILE%\.qwen-code\settings.json` (Windows)