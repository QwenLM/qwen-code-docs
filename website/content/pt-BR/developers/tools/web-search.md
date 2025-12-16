# Ferramenta de Busca na Web (`web_search`)

Este documento descreve a ferramenta `web_search` para realizar buscas na web utilizando múltiplos provedores.

## Descrição

Utilize `web_search` para realizar uma busca na web e obter informações da internet. A ferramenta suporta múltiplos provedores de busca e retorna uma resposta concisa com citações das fontes quando disponíveis.

### Provedores Suportados

1. **DashScope** (Oficial, Gratuito) - Disponível automaticamente para usuários Qwen OAuth (200 requisições/minuto, 2000 requisições/dia)
2. **Tavily** - API de busca de alta qualidade com geração de respostas embutida
3. **Google Custom Search** - API JSON do Google Custom Search

### Argumentos

`web_search` recebe dois argumentos:

- `query` (string, obrigatório): A consulta de busca
- `provider` (string, opcional): Provedor específico a ser utilizado ("dashscope", "tavily", "google")
  - Se não especificado, utiliza o provedor padrão da configuração

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

- DashScope não requer uma chave de API (serviço oficial gratuito)
- **Usuários Qwen OAuth:** DashScope é adicionado automaticamente à sua lista de provedores, mesmo que não configurado explicitamente
- Configure provedores adicionais (Tavily, Google) se quiser usá-los juntamente com DashScope
- Defina `default` para especificar qual provedor usar por padrão (se não definido, ordem de prioridade: Tavily > Google > DashScope)

### Método 2: Variáveis de Ambiente

Defina variáveis de ambiente em seu shell ou arquivo `.env`:

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"```

# Google
export GOOGLE_API_KEY="sua-chave-de-api"
export GOOGLE_SEARCH_ENGINE_ID="seu-id-de-mecanismo"
```

### Método 3: Argumentos de Linha de Comando

Passe chaves de API ao executar o Qwen Code:

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key sua-chave --google-search-engine-id seu-id

# Especificar provedor padrão
qwen --web-search-default tavily
```

### Compatibilidade Reversa (Descontinuada)

⚠️ **DESCONTINUADA:** A configuração legada `tavilyApiKey` ainda é suportada para compatibilidade reversa, mas está descontinuada:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Descontinuada
  }
}
```

**Importante:** Esta configuração está descontinuada e será removida em uma versão futura. Por favor, migre para o novo formato de configuração `webSearch` mostrado acima. A configuração antiga configurará automaticamente o Tavily como um provedor, mas recomendamos fortemente que você atualize sua configuração.

## Desativando a Pesquisa na Web

Se você quiser desativar a funcionalidade de pesquisa na web, pode excluir a ferramenta `web_search` no seu arquivo `settings.json`:

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Nota:** Esta configuração requer que o Qwen Code seja reiniciado para entrar em vigor. Uma vez desativada, a ferramenta `web_search` não estará disponível para o modelo, mesmo que provedores de pesquisa na web estejam configurados.

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
web_search(query="tempo em São Francisco hoje")
web_search(query="última versão LTS do Node.js", provider="google")
web_search(query="melhores práticas para React 19", provider="dashscope")
```

## Detalhes dos Provedores

### DashScope (Oficial)

- **Custo:** Grátis
- **Autenticação:** Disponível automaticamente ao usar a autenticação OAuth do Qwen
- **Configuração:** Nenhuma chave de API necessária, adicionada automaticamente à lista de provedores para usuários OAuth do Qwen
- **Cota:** 200 solicitações/minuto, 2000 solicitações/dia
- **Indicado para:** Consultas gerais, sempre disponível como alternativa para usuários OAuth do Qwen
- **Registro automático:** Se você estiver usando OAuth do Qwen, o DashScope é adicionado automaticamente à sua lista de provedores mesmo que você não o configure explicitamente

### Tavily

- **Custo:** Requer chave de API (serviço pago com camada gratuita)
- **Cadastro:** https://tavily.com
- **Recursos:** Resultados de alta qualidade com respostas geradas por IA
- **Indicado para:** Pesquisa, respostas abrangentes com citações

### Google Custom Search

- **Custo:** Camada gratuita disponível (100 consultas/dia)
- **Configuração:**
  1. Habilite a API de Pesquisa Personalizada no Console do Google Cloud
  2. Crie um Mecanismo de Pesquisa Personalizada em https://programmablesearchengine.google.com
- **Recursos:** Qualidade de pesquisa do Google
- **Indicado para:** Consultas específicas e factuais

## Notas Importantes

- **Formato da resposta:** Retorna uma resposta concisa com citações numeradas das fontes
- **Citações:** Os links das fontes são adicionados como uma lista numerada: [1], [2], etc.
- **Vários provedores:** Se um provedor falhar, especifique manualmente outro usando o parâmetro `provider`
- **Disponibilidade do DashScope:** Disponível automaticamente para usuários OAuth do Qwen, sem necessidade de configuração
- **Seleção do provedor padrão:** O sistema seleciona automaticamente um provedor padrão com base na disponibilidade:
  1. Sua configuração explícita de `default` (prioridade mais alta)
  2. Argumento da CLI `--web-search-default`
  3. Primeiro provedor disponível por prioridade: Tavily > Google > DashScope

## Solução de Problemas

**Ferramenta não disponível?**

- **Para usuários do Qwen OAuth:** A ferramenta é registrada automaticamente com o provedor DashScope, nenhuma configuração é necessária
- **Para outros tipos de autenticação:** Certifique-se de que pelo menos um provedor (Tavily ou Google) esteja configurado
- Para Tavily/Google: Verifique se suas chaves de API estão corretas

**Erros específicos do provedor?**

- Use o parâmetro `provider` para tentar um provedor de busca diferente
- Verifique suas cotas e limites de taxa da API
- Confirme que as chaves de API estão definidas corretamente na configuração

**Precisa de ajuda?**

- Verifique sua configuração: Execute `qwen` e use o diálogo de configurações
- Veja suas configurações atuais em `~/.qwen-code/settings.json` (macOS/Linux) ou `%USERPROFILE%\.qwen-code\settings.json` (Windows)