# Ferramenta Web Fetch (`web_fetch`)

Este documento descreve a ferramenta `web_fetch` para o Qwen Code.

## Descrição

Use o `web_fetch` para buscar conteúdo de uma URL especificada e processá-lo usando um modelo de IA. A ferramenta recebe uma URL e um prompt como entrada, busca o conteúdo da URL e processa esse conteúdo com o prompt usando um modelo pequeno e rápido.

### Argumentos

O `web_fetch` recebe três argumentos:

- `url` (string, obrigatório): A URL da qual buscar o conteúdo. Deve ser uma URL válida e completa, começando com `http://` ou `https://`.
- `prompt` (string, obrigatório): O prompt que descreve quais informações você deseja extrair do conteúdo da página.
- `format` (string, opcional): Controla apenas o cabeçalho `Accept` enviado ao servidor, indicando sua preferência de conteúdo. **Todo o conteúdo buscado é normalizado para texto simples para processamento pelo LLM**, independentemente do formato especificado. O padrão é `"auto"` se não for especificado.
  - `"auto"` (padrão): Prefere markdown via negociação de conteúdo (`Accept: text/markdown, text/html`), aceitando HTML como fallback. **Recomendado para a maioria dos casos de uso**, pois pode reduzir o uso de tokens em até 80% para servidores que suportam markdown.
  - `"markdown"`: Envia `Accept: text/markdown`. Use quando precisar explicitamente de conteúdo em markdown.
  - `"html"`: Envia `Accept: text/html`. Use quando o servidor exigir HTML no cabeçalho Accept. O conteúdo ainda será convertido para texto simples para processamento pelo LLM.
  - `"text"`: Envia `Accept: text/plain`. Use quando precisar especificamente de conteúdo em texto simples.

## Como usar o `web_fetch` com o Qwen Code

Para usar o `web_fetch` com o Qwen Code, forneça uma URL e um prompt descrevendo o que você deseja extrair dessa URL. A ferramenta solicitará confirmação antes de buscar a URL. Após a confirmação, a ferramenta buscará o conteúdo diretamente e o processará usando um modelo de IA.

A ferramenta faz automaticamente:

- Converte HTML para texto quando necessário
- Lida com URLs de blob do GitHub (convertendo-as para URLs raw)
- Atualiza URLs HTTP para HTTPS por segurança
- Suporta negociação de conteúdo para markdown (reduz significativamente o uso de tokens)

Uso:

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

Com especificação de formato:

```
web_fetch(url="https://example.com", prompt="Get the raw content", format="markdown")
```

## Exemplos do `web_fetch`

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

Obter conteúdo em markdown (para servidores que suportam Markdown for Agents):

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extract the key information", format="markdown")
```

## Notas importantes

- **Processamento de URL única:** O `web_fetch` processa uma URL por vez. Para analisar várias URLs, faça chamadas separadas à ferramenta.
- **Formato de URL:** A ferramenta atualiza automaticamente URLs HTTP para HTTPS e converte URLs de blob do GitHub para o formato raw para um melhor acesso ao conteúdo.
- **Negociação de conteúdo:** A ferramenta suporta a negociação de conteúdo "Markdown for Agents". Ao usar `format="auto"` (padrão), ela envia os cabeçalhos `Accept: text/markdown, text/html`, permitindo que servidores que suportam markdown o retornem diretamente em vez de HTML. Isso pode reduzir o uso de tokens em até 80%.
- **Processamento de conteúdo:** A ferramenta busca o conteúdo diretamente e o processa usando um modelo de IA. Quando o servidor retorna HTML, ele é convertido para um formato de texto legível. Quando o servidor retorna markdown ou texto simples, o conteúdo é usado como está.
- **Qualidade da saída:** A qualidade da saída dependerá da clareza das instruções no prompt.
- **Ferramentas MCP:** Se uma ferramenta de web fetch fornecida por MCP estiver disponível (começando com "mcp\_\_"), prefira usá-la, pois pode ter menos restrições.

## Suporte a Markdown for Agents

A ferramenta `web_fetch` do Qwen Code implementa suporte à especificação [Markdown for Agents da Cloudflare](https://blog.cloudflare.com/markdown-for-agents/). Esse recurso permite que sites sirvam conteúdo em markdown diretamente para agentes de IA, reduzindo significativamente o uso de tokens em comparação com o parsing de HTML.

### Como funciona

1. O parâmetro `format` controla **apenas** o cabeçalho `Accept` enviado ao servidor (não afeta o formato de saída):
   - `format="auto"`: envia `Accept: text/markdown, text/html`
   - `format="markdown"`: envia `Accept: text/markdown`
   - `format="html"`: envia `Accept: text/html`
   - `format="text"`: envia `Accept: text/plain`
2. Se o servidor suportar markdown, ele retorna `Content-Type: text/markdown`
3. A ferramenta usa o conteúdo em markdown ou texto simples diretamente, sem conversão
4. Se o servidor retornar HTML, ele é convertido para um formato de texto legível para processamento pelo LLM
5. Todo o conteúdo é normalizado para texto antes de ser processado pelo modelo de IA

### Benefícios

- **Eficiência de tokens:** Conteúdo em markdown geralmente usa 80% menos tokens do que o HTML equivalente
- **Melhor estrutura:** O markdown preserva a estrutura semântica (cabeçalhos, listas, etc.)
- **Compatibilidade com versões anteriores:** Funciona com todos os sites, com experiência aprimorada para servidores compatíveis

### Exemplos de servidores que suportam markdown

- Documentação para Desenvolvedores da Cloudflare
- Blog da Cloudflare
- Qualquer site que use o recurso "Markdown for Agents" da Cloudflare