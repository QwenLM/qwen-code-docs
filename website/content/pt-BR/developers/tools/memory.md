# Ferramenta de Memória (`save_memory`)

Este documento descreve a ferramenta `save_memory` para o Qwen Code.

## Descrição

Use `save_memory` para salvar e recuperar informações entre suas sessões do Qwen Code. Com `save_memory`, você pode instruir a CLI a lembrar detalhes importantes entre sessões, oferecendo assistência personalizada e direcionada.

### Argumentos

`save_memory` aceita um único argumento:

- `fact` (string, obrigatório): O fato específico ou a informação a ser lembrada. Deve ser uma declaração clara e autossuficiente, escrita em linguagem natural.

## Como usar `save_memory` com o Qwen Code

A ferramenta adiciona o `fact` fornecido ao arquivo de contexto do usuário no diretório home (`~/.qwen/QWEN.md` por padrão). Esse nome de arquivo pode ser configurado via `contextFileName`.

Uma vez adicionado, os fatos são armazenados na seção `## Qwen Added Memories`. Esse arquivo é carregado como contexto nas sessões subsequentes, permitindo que a CLI recupere as informações salvas.

Uso:

```
save_memory(fact="Seu fato aqui.")
```

### Exemplos de `save_memory`

Lembre uma preferência do usuário:

```
save_memory(fact="Minha linguagem de programação preferida é Python.")
```

Armazene um detalhe específico do projeto:

```
save_memory(fact="O projeto em que estou trabalhando atualmente chama-se 'qwen-code'.")
```

## Observações importantes

- **Uso geral:** Esta ferramenta deve ser usada para fatos concisos e importantes. Ela não foi projetada para armazenar grandes volumes de dados ou histórico de conversas.
- **Arquivo de memória:** O arquivo de memória é um arquivo de texto simples no formato Markdown, portanto você pode visualizá-lo e editá-lo manualmente, se necessário.