# Ferramenta de Busca na Web (`web_search`)

Este documento descreve a ferramenta `web_search` para realizar buscas na web utilizando múltiplos provedores.

## Descrição

Use `web_search` para realizar uma busca na web e obter informações da internet. A ferramenta suporta vários provedores de busca e retorna uma resposta concisa com citações das fontes quando disponíveis.

### Provedores Suportados

1. **DashScope** (Oficial, Gratuito) - Disponível automaticamente para usuários Qwen OAuth (200 requisições/minuto, 2000 requisições/dia)
2. **Tavily** - API de busca de alta qualidade com geração de respostas embutida
3. **Google Custom Search** - API JSON do Google Custom Search

### Argumentos

`web_search` aceita dois argumentos:

- `query` (string, obrigatório): A consulta de busca
- `provider` (string, opcional): Provedor específico a ser usado ("dashscope", "tavily", "google")
  - Se não especificado, utiliza o provedor padrão definido na configuração

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

- DashScope não requer uma API key (serviço oficial gratuito)
- **Usuários Qwen OAuth:** O DashScope é adicionado automaticamente à sua lista de providers, mesmo que não seja configurado explicitamente
- Configure providers adicionais (Tavily, Google) se quiser usá-los junto com o DashScope
- Defina `default` para especificar qual provider usar por padrão (se não definido, ordem de prioridade: Tavily > Google > DashScope)

### Método 2: Variáveis de Ambiente

Defina variáveis de ambiente no seu shell ou arquivo `.env`:

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"```

```markdown
# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### Método 3: Argumentos de Linha de Comando

Passe as chaves da API ao executar o Qwen Code:

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# Especificar provedor padrão
qwen --web-search-default tavily
```

### Compatibilidade Reversa (Descontinuada)

⚠️ **DEPRECIADA:** A configuração legada `tavilyApiKey` ainda é suportada para compatibilidade reversa, mas está descontinuada:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Descontinuada
  }
}
```

**Importante:** Esta configuração está descontinuada e será removida em uma versão futura. Por favor, migre para o novo formato de configuração `webSearch` mostrado acima. A configuração antiga irá configurar automaticamente o Tavily como provedor, mas recomendamos fortemente que você atualize sua configuração.
```

## Desabilitando a Pesquisa na Web

Se você quiser desabilitar a funcionalidade de pesquisa na web, pode excluir a ferramenta `web_search` no seu arquivo `settings.json`:

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Nota:** Essa configuração requer que o Qwen Code seja reiniciado para ter efeito. Uma vez desabilitada, a ferramenta `web_search` não estará disponível para o modelo, mesmo que provedores de busca na web estejam configurados.

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
web_search(query="última versão LTS do Node.js", provider="google")
web_search(query="melhores práticas para React 19", provider="dashscope")
```

## Detalhes dos Provedores

### DashScope (Oficial)

- **Custo:** Gratuito
- **Autenticação:** Disponível automaticamente ao usar a autenticação OAuth do Qwen
- **Configuração:** Nenhuma chave de API necessária, adicionado automaticamente à lista de providers para usuários OAuth do Qwen
- **Quota:** 200 requisições/minuto, 2000 requisições/dia
- **Indicado para:** Consultas gerais, sempre disponível como fallback para usuários OAuth do Qwen
- **Registro automático:** Se você estiver usando OAuth do Qwen, o DashScope é adicionado automaticamente à sua lista de providers mesmo que você não o configure explicitamente

### Tavily

- **Custo:** Requer chave de API (serviço pago com plano gratuito)
- **Cadastro:** https://tavily.com
- **Recursos:** Resultados de alta qualidade com respostas geradas por IA
- **Indicado para:** Pesquisa, respostas abrangentes com citações

### Google Custom Search

- **Custo:** Camada gratuita disponível (100 consultas/dia)
- **Configuração:**
  1. Habilite a API do Custom Search no Google Cloud Console
  2. Crie um mecanismo de busca personalizado em https://programmablesearchengine.google.com
- **Recursos:** Qualidade de busca do Google
- **Indicado para:** Consultas específicas e factuais

## Notas importantes

- **Formato da resposta:** Retorna uma resposta concisa com citações numeradas das fontes
- **Citações:** Links das fontes são adicionados como uma lista numerada: [1], [2], etc.
- **Múltiplos provedores:** Se um provedor falhar, especifique manualmente outro usando o parâmetro `provider`
- **Disponibilidade do DashScope:** Disponível automaticamente para usuários Qwen OAuth, sem necessidade de configuração
- **Seleção do provedor padrão:** O sistema seleciona automaticamente um provedor padrão com base na disponibilidade:
  1. Sua configuração explícita como `default` (prioridade mais alta)
  2. Argumento CLI `--web-search-default`
  3. Primeiro provedor disponível por ordem de prioridade: Tavily > Google > DashScope

## Solução de Problemas

**Ferramenta não disponível?**

- **Para usuários Qwen OAuth:** A ferramenta é registrada automaticamente com o provedor DashScope, nenhuma configuração adicional é necessária
- **Para outros tipos de autenticação:** Certifique-se de que pelo menos um provedor (Tavily ou Google) esteja configurado
- Para Tavily/Google: Verifique se suas chaves de API estão corretas

**Erros específicos do provedor?**

- Utilize o parâmetro `provider` para tentar um provedor de busca diferente
- Verifique suas cotas e limites de taxa da API
- Confirme que as chaves de API estão definidas corretamente na configuração

**Precisa de ajuda?**

- Verifique sua configuração: Execute `qwen` e utilize o diálogo de configurações
- Veja suas configurações atuais em `~/.qwen-code/settings.json` (macOS/Linux) ou `%USERPROFILE%\.qwen-code\settings.json` (Windows)