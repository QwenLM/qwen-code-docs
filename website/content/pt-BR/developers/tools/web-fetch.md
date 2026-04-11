# Ferramenta Web Fetch (`web_fetch`)

Este documento descreve a ferramenta `web_fetch` para o Qwen Code.

## Descrição

Use `web_fetch` para buscar conteúdo de uma URL específica e processá-lo usando um modelo de IA. A ferramenta recebe uma URL e um prompt como entrada, busca o conteúdo da URL, converte HTML para markdown e processa o conteúdo com o prompt usando um modelo pequeno e rápido.

### Argumentos

`web_fetch` recebe dois argumentos:

- `url` (string, obrigatório): A URL da qual buscar o conteúdo. Deve ser uma URL válida e completa, começando com `http://` ou `https://`.
- `prompt` (string, obrigatório): O prompt descrevendo quais informações você deseja extrair do conteúdo da página.

## Como usar `web_fetch` com o Qwen Code

Para usar `web_fetch` com o Qwen Code, forneça uma URL e um prompt descrevendo o que você deseja extrair dessa URL. A ferramenta solicitará confirmação antes de buscar a URL. Após a confirmação, a ferramenta buscará o conteúdo diretamente e o processará usando um modelo de IA.

A ferramenta converte automaticamente HTML para texto, lida com URLs de blob do GitHub (convertendo-as para URLs raw) e atualiza URLs HTTP para HTTPS por segurança.

Uso:

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

## Exemplos de `web_fetch`

Resumir um único artigo:

```
web_fetch(url="https://example.com/news/latest", prompt="Can you summarize the main points of this article?")
```

Extrair informações específicas:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="What are the key findings and methodology described in this paper?")
```

Analisar documentação do GitHub:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="What are the installation steps and main features?")
```

## Notas importantes

- **Processamento de URL única:** `web_fetch` processa uma URL por vez. Para analisar várias URLs, faça chamadas separadas à ferramenta.
- **Formato da URL:** A ferramenta atualiza automaticamente URLs HTTP para HTTPS e converte URLs de blob do GitHub para o formato raw para um melhor acesso ao conteúdo.
- **Processamento de conteúdo:** A ferramenta busca o conteúdo diretamente e o processa usando um modelo de IA, convertendo HTML para um formato de texto legível.
- **Qualidade da saída:** A qualidade da saída dependerá da clareza das instruções no prompt.
- **Ferramentas MCP:** Se uma ferramenta de web fetch fornecida pelo MCP estiver disponível (começando com "mcp\_\_"), prefira usá-la, pois pode ter menos restrições.