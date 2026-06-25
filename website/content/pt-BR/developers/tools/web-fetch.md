# Ferramenta de Busca Web (`web_fetch`)

Este documento descreve a ferramenta `web_fetch` para o Qwen Code.

## Descrição

Use `web_fetch` para obter conteúdo de uma URL especificada e processá-lo usando um modelo de IA. A ferramenta recebe uma URL e um prompt como entrada, obtém o conteúdo da URL e processa o conteúdo com o prompt usando um modelo pequeno e rápido.

### Argumentos

`web_fetch` recebe três argumentos:

- `url` (string, obrigatório): A URL para obter o conteúdo. Deve ser uma URL válida totalmente formada começando com `http://` ou `https://`.
- `prompt` (string, obrigatório): O prompt descrevendo quais informações você deseja extrair do conteúdo da página.
- `format` (string, opcional): Controla apenas o cabeçalho `Accept` enviado ao servidor, indicando sua preferência de conteúdo. **Todo o conteúdo obtido é normalizado para texto simples para processamento pelo LLM**, independentemente do formato especificado. O padrão é `"auto"` se não especificado.
  - `"auto"` (padrão): Prefere markdown via negociação de conteúdo (`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`), depois recai para HTML, texto simples ou outros tipos de conteúdo. **Recomendado para a maioria dos casos de uso**, pois pode reduzir o uso de tokens em até 80% para servidores que suportam markdown, enquanto ainda funciona com APIs somente JSON.
  - `"markdown"`: Prefere `Accept: text/markdown, */*;q=0.1`. Use quando você explicitamente precisa de conteúdo markdown.
  - `"html"`: Prefere `Accept: text/html, */*;q=0.1`. Use quando o servidor requer HTML no cabeçalho Accept. O conteúdo ainda é convertido para texto simples para processamento pelo LLM.
  - `"text"`: Prefere `Accept: text/plain, */*;q=0.1`. Use quando você especificamente precisa de conteúdo texto simples.

## Como usar `web_fetch` com o Qwen Code

Para usar `web_fetch` com o Qwen Code, forneça uma URL e um prompt descrevendo o que você deseja extrair dessa URL. A ferramenta pedirá confirmação antes de obter a URL. Uma vez confirmado, a ferramenta obterá o conteúdo diretamente e o processará usando um modelo de IA.

A ferramenta automaticamente:

- Converte HTML para texto quando necessário
- Lida com URLs de blob do GitHub (convertendo-as para URLs raw)
- Atualiza URLs HTTP para HTTPS por segurança
- Suporta negociação de conteúdo para markdown (reduz significativamente o uso de tokens)

Uso:

```
web_fetch(url="https://example.com", prompt="Resuma os pontos principais deste artigo")
```

Com especificação de formato:

```
web_fetch(url="https://example.com", prompt="Obtenha o conteúdo bruto", format="markdown")
```

## Exemplos de `web_fetch`

Resumir um único artigo:

```
web_fetch(url="https://example.com/news/latest", prompt="Você pode resumir os pontos principais deste artigo?")
```

Extrair informações específicas:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="Quais são as principais descobertas e a metodologia descrita neste artigo?")
```

Analisar documentação do GitHub:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="Quais são os passos de instalação e as principais funcionalidades?")
```

Obter conteúdo markdown (para servidores que suportam Markdown for Agents):

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extraia as informações principais", format="markdown")
```

## Notas importantes

- **Processamento de URL única:** `web_fetch` processa uma URL por vez. Para analisar várias URLs, faça chamadas separadas à ferramenta.
- **Formato da URL:** A ferramenta atualiza automaticamente URLs HTTP para HTTPS e converte URLs de blob do GitHub para o formato raw para melhor acesso ao conteúdo.
- **Negociação de conteúdo:** A ferramenta suporta negociação de conteúdo "Markdown for Agents". Ao usar `format="auto"` (padrão), ela envia `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`, permitindo que servidores que suportam markdown o retornem diretamente em vez de HTML. A alternativa de baixa prioridade `*/*` mantém APIs somente JSON e outros endpoints não-texto acessíveis. Isso pode reduzir o uso de tokens em até 80%.
- **Processamento de conteúdo:** A ferramenta obtém o conteúdo diretamente e o processa usando um modelo de IA. Quando o servidor retorna HTML, ela o converte para um formato de texto legível. Quando o servidor retorna markdown, texto simples ou outro tipo de conteúdo alternativo, como JSON, ela usa o conteúdo como está.
- **Qualidade da saída:** A qualidade da saída dependerá da clareza das instruções no prompt.
- **Ferramentas MCP:** Se uma ferramenta de busca web fornecida por MCP estiver disponível (começando com "mcp\_\_"), prefira usar essa ferramenta, pois pode ter menos restrições.

## Suporte a Markdown for Agents

A ferramenta `web_fetch` do Qwen Code implementa suporte para a especificação [Markdown for Agents do Cloudflare](https://blog.cloudflare.com/markdown-for-agents/). Esse recurso permite que sites sirvam conteúdo markdown diretamente para agentes de IA, reduzindo significativamente o uso de tokens em comparação com a análise de HTML.

### Como funciona

1. O parâmetro `format` controla **apenas** o cabeçalho `Accept` enviado ao servidor (não afeta o formato de saída):
   - `format="auto"`: envia `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`
   - `format="markdown"`: envia `Accept: text/markdown, */*;q=0.1`
   - `format="html"`: envia `Accept: text/html, */*;q=0.1`
   - `format="text"`: envia `Accept: text/plain, */*;q=0.1`
2. Se o servidor suportar markdown, ele retorna `Content-Type: text/markdown`
3. A ferramenta usa o conteúdo markdown ou texto simples diretamente, sem conversão
4. Se o servidor retornar HTML, ele converte para um formato de texto legível para processamento pelo LLM; markdown, texto simples e tipos de conteúdo alternativos, como JSON, são usados como estão
5. Todo o conteúdo é normalizado para texto antes de ser processado pelo modelo de IA
### Benefícios

- **Eficiência de tokens:** Conteúdo em Markdown geralmente utiliza 80% menos tokens do que HTML equivalente
- **Melhor estrutura:** Markdown preserva a estrutura semântica (cabeçalhos, listas, etc.)
- **Compatível com versões anteriores:** Funciona com todos os sites, experiência aprimorada para servidores que oferecem suporte

### Exemplos de servidores que suportam markdown

- Documentação do Desenvolvedor Cloudflare
- Blog da Cloudflare
- Qualquer site que use o recurso "Markdown for Agents" da Cloudflare
