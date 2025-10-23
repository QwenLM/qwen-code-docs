# Ferramenta de Busca na Web (`web_search`)

Este documento descreve a ferramenta `web_search`.

## Descrição

Use `web_search` para realizar uma busca na web utilizando a API do Tavily. A ferramenta retorna uma resposta concisa com fontes quando possível.

### Argumentos

`web_search` recebe um argumento:

- `query` (string, obrigatório): A consulta de busca.

## Como usar `web_search`

`web_search` chama a API do Tavily diretamente. Você deve configurar a `TAVILY_API_KEY` através de um dos seguintes métodos:

1. **Arquivo de configurações**: Adicione `"tavilyApiKey": "sua-chave-aqui"` no seu `settings.json`
2. **Variável de ambiente**: Defina `TAVILY_API_KEY` no seu ambiente ou arquivo `.env`
3. **Linha de comando**: Use `--tavily-api-key sua-chave-aqui` ao executar o CLI

Se a chave não estiver configurada, a ferramenta será desativada e ignorada.

Uso:

```
web_search(query="Sua consulta vai aqui.")
```

## Exemplos de `web_search`

Obter informações sobre um tópico:

```
web_search(query="últimos avanços em geração de código com IA")
```

## Notas importantes

- **Resposta retornada:** A ferramenta `web_search` retorna uma resposta concisa quando disponível, com uma lista de links das fontes.
- **Citações:** Os links das fontes são adicionados como uma lista numerada.
- **API key:** Configure `TAVILY_API_KEY` via settings.json, variáveis de ambiente, arquivos .env, ou argumentos de linha de comando. Se não configurada, a ferramenta não será registrada.