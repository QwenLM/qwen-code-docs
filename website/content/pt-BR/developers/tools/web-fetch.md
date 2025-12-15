# Ferramenta de Busca na Web (`web_fetch`)

Este documento descreve a ferramenta `web_fetch` para o Qwen Code.

## Descrição

Use `web_fetch` para buscar conteúdo de uma URL especificada e processá-lo usando um modelo de IA. A ferramenta recebe uma URL e um prompt como entrada, busca o conteúdo da URL, converte HTML em markdown e processa o conteúdo com o prompt usando um modelo pequeno e rápido.

### Argumentos

`web_fetch` recebe dois argumentos:

- `url` (string, obrigatório): A URL da qual buscar o conteúdo. Deve ser uma URL válida e completa começando com `http://` ou `https://`.
- `prompt` (string, obrigatório): O prompt que descreve quais informações você deseja extrair do conteúdo da página.

## Como usar `web_fetch` com Qwen Code

Para usar `web_fetch` com Qwen Code, forneça uma URL e um prompt descrevendo o que você deseja extrair dessa URL. A ferramenta pedirá confirmação antes de buscar a URL. Uma vez confirmada, a ferramenta buscará o conteúdo diretamente e o processará usando um modelo de IA.

A ferramenta converte automaticamente HTML em texto, trata URLs do GitHub blob (convertendo-as em URLs raw) e atualiza URLs HTTP para HTTPS por segurança.

Uso:

```
web_fetch(url="https://example.com", prompt="Resuma os principais pontos deste artigo")
```

## Exemplos de `web_fetch`

Resumir um único artigo:

```
web_fetch(url="https://example.com/news/latest", prompt="Você pode resumir os principais pontos deste artigo?")
```

Extrair informações específicas:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="Quais são as principais descobertas e a metodologia descrita neste artigo?")
```

Analisar documentação do GitHub:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="Quais são as etapas de instalação e os principais recursos?")
```

## Notas importantes

- **Processamento de URL única:** `web_fetch` processa uma URL por vez. Para analisar várias URLs, faça chamadas separadas à ferramenta.
- **Formato da URL:** A ferramenta atualiza automaticamente URLs HTTP para HTTPS e converte URLs do GitHub no formato blob para o formato raw, garantindo melhor acesso ao conteúdo.
- **Processamento de conteúdo:** A ferramenta busca o conteúdo diretamente e o processa usando um modelo de IA, convertendo HTML para um formato de texto legível.
- **Qualidade da saída:** A qualidade da saída dependerá da clareza das instruções fornecidas no prompt.
- **Ferramentas MCP:** Se houver uma ferramenta de busca web fornecida pelo MCP disponível (começando com "mcp\_\_"), prefira usá-la, pois pode ter menos restrições.