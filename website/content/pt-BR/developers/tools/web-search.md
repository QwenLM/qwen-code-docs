# Ferramenta de Pesquisa na Web (`web_search`)

Este documento descreve a ferramenta `web_search` para realizar pesquisas na web usando múltiplos provedores.

## Descrição

Use `web_search` para executar uma pesquisa na web e obter informações da internet. A ferramenta suporta múltiplos provedores de pesquisa e retorna uma resposta concisa com citações das fontes, quando disponíveis.

### Provedores Suportados

1. **DashScope** (Oficial, Gratuito) — Disponível automaticamente para usuários do Qwen com autenticação OAuth (200 requisições/minuto, 1000 requisições/dia)
2. **Tavily** — API de pesquisa de alta qualidade com geração integrada de respostas
3. **Google Custom Search** — API JSON de Pesquisa Personalizada do Google

### Argumentos

`web_search` aceita dois argumentos:

- `query` (string, obrigatório): A consulta de pesquisa
- `provider` (string, opcional): Provedor específico a ser usado ("dashscope", "tavily", "google")
  - Se não for especificado, usa o provedor padrão definido na configuração

## Configuração

### Método 1: Arquivo de configurações (recomendado)

Adicione ao seu arquivo `settings.json`:

```json
{
  "webSearch": {
    "provider": [
      { "type": "dashscope" },
      { "type": "tavily", "apiKey": "tvly-xxxxx" },
      {
        "type": "google",
        "apiKey": "sua-chave-de-api-do-google",
        "searchEngineId": "seu-id-do-mecanismo-de-pesquisa"
      }
    ],
    "default": "dashscope"
  }
}
```

**Observações:**

- O DashScope não exige uma chave de API (serviço oficial e gratuito)
- **Usuários do Qwen com OAuth:** O DashScope é adicionado automaticamente à sua lista de provedores, mesmo que não esteja configurado explicitamente
- Configure provedores adicionais (Tavily, Google) se desejar usá-los em conjunto com o DashScope
- Defina `default` para especificar qual provedor usar por padrão (se não for definido, a ordem de prioridade é: Tavily > Google > DashScope)

### Método 2: Variáveis de ambiente

Defina as variáveis de ambiente no seu shell ou no arquivo `.env`:

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="sua-chave-de-api"
export GOOGLE_SEARCH_ENGINE_ID="seu-id-de-motor-de-busca"
```

### Método 3: Argumentos de Linha de Comando

Passe as chaves de API ao executar o Qwen Code:

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key sua-chave --google-search-engine-id seu-id

# Especifique o provedor padrão
qwen --web-search-default tavily
```

### Compatibilidade com Versões Anteriores (Obsoleto)

⚠️ **OBSOLETO:** A configuração legada `tavilyApiKey` ainda é suportada para compatibilidade com versões anteriores, mas está obsoleta:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Obsoleto
  }
}
```

**Importante:** Essa configuração está obsoleta e será removida em uma versão futura. Migre para o novo formato de configuração `webSearch` mostrado acima. A configuração antiga configurará automaticamente o Tavily como provedor, mas recomendamos fortemente que você atualize sua configuração.

## Desabilitando a pesquisa na web

Se você deseja desabilitar a funcionalidade de pesquisa na web, pode excluir a ferramenta `web_search` no seu arquivo `settings.json`:

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**Observação:** Essa configuração requer uma reinicialização do Qwen Code para entrar em vigor. Após ser desabilitada, a ferramenta `web_search` não estará mais disponível para o modelo, mesmo que provedores de pesquisa na web estejam configurados.

## Exemplos de uso

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
web_search(query="previsão do tempo em São Francisco hoje")
web_search(query="última versão LTS do Node.js", provider="google")
web_search(query="melhores práticas para React 19", provider="dashscope")
```

## Detalhes dos provedores

### DashScope (Oficial)

- **Custo:** Gratuito  
- **Autenticação:** Disponível automaticamente ao usar a autenticação OAuth do Qwen  
- **Configuração:** Nenhuma chave de API é necessária; adicionado automaticamente à lista de provedores para usuários com OAuth do Qwen  
- **Cota:** 200 requisições/minuto, 1000 requisições/dia  
- **Ideal para:** Consultas gerais; sempre disponível como alternativa padrão para usuários com OAuth do Qwen  
- **Registro automático:** Se você usa o OAuth do Qwen, o DashScope é adicionado automaticamente à sua lista de provedores, mesmo sem configuração explícita  

### Tavily

- **Custo:** Requer chave de API (serviço pago com camada gratuita)  
- **Cadastro:** https://tavily.com  
- **Recursos:** Resultados de alta qualidade com respostas geradas por IA  
- **Ideal para:** Pesquisas e respostas abrangentes com citações

### Pesquisa Personalizada do Google

- **Custo:** Camada gratuita disponível (100 consultas/dia)
- **Configuração:**
  1. Habilite a API de Pesquisa Personalizada no Google Cloud Console
  2. Crie um mecanismo de pesquisa personalizado em https://programmablesearchengine.google.com
- **Recursos:** Qualidade de busca do Google
- **Ideal para:** Consultas específicas e factuais

## Observações importantes

- **Formato da resposta:** Retorna uma resposta concisa com citações de fontes numeradas
- **Citações:** Os links das fontes são anexados como uma lista numerada: [1], [2], etc.
- **Vários provedores:** Se um provedor falhar, especifique manualmente outro usando o parâmetro `provider`
- **Disponibilidade do DashScope:** Disponível automaticamente para usuários Qwen com autenticação OAuth, sem necessidade de configuração
- **Seleção automática do provedor padrão:** O sistema seleciona automaticamente um provedor padrão com base na disponibilidade:
  1. Sua configuração explícita de `default` (prioridade mais alta)
  2. Argumento da CLI `--web-search-default`
  3. Primeiro provedor disponível por ordem de prioridade: Tavily > Google > DashScope

## Solução de problemas

**Ferramenta não disponível?**

- **Para usuários do Qwen com OAuth:** A ferramenta é registrada automaticamente com o provedor DashScope; nenhuma configuração é necessária.
- **Para outros tipos de autenticação:** Certifique-se de que pelo menos um provedor (Tavily ou Google) esteja configurado.
- Para Tavily/Google: Verifique se suas chaves de API estão corretas.

**Erros específicos do provedor?**

- Use o parâmetro `provider` para tentar um provedor de busca diferente.
- Verifique suas cotas e limites de taxa de chamadas da API.
- Confirme se as chaves de API estão corretamente definidas na configuração.

**Precisa de ajuda?**

- Verifique sua configuração: Execute `qwen` e use a caixa de diálogo de configurações.
- Visualize suas configurações atuais em `~/.qwen-code/settings.json` (macOS/Linux) ou `%USERPROFILE%\.qwen-code\settings.json` (Windows).