# Ferramenta de Memória (`save_memory`)

Este documento descreve a ferramenta `save_memory` para o Qwen Code.

## Descrição

Use `save_memory` para salvar e recuperar informações entre suas sessões do Qwen Code. Com `save_memory`, você pode instruir a CLI a lembrar detalhes importantes entre sessões, oferecendo assistência personalizada e direcionada.

### Argumentos

`save_memory` aceita um argumento:

- `fact` (string, obrigatório): O fato ou informação específica a ser lembrada. Deve ser uma declaração clara e autocontida, escrita em linguagem natural.

## Como usar `save_memory` com o Qwen Code

A ferramenta adiciona o `fact` fornecido ao seu arquivo de contexto no diretório home do usuário (`~/.qwen/QWEN.md` por padrão). Esse nome de arquivo pode ser configurado por meio de `contextFileName`.

Após a adição, os fatos são armazenados em uma seção `## Qwen Added Memories`. Esse arquivo é carregado como contexto nas sessões subsequentes, permitindo que a CLI recupere as informações salvas.

Uso:

```
save_memory(fact="Your fact here.")
```

### Exemplos de `save_memory`

Lembrar uma preferência do usuário:

```
save_memory(fact="My preferred programming language is Python.")
```

Armazenar um detalhe específico do projeto:

```
save_memory(fact="The project I'm currently working on is called 'qwen-code'.")
```

## Notas importantes

- **Uso geral:** Esta ferramenta deve ser usada para fatos concisos e importantes. Não foi projetada para armazenar grandes volumes de dados ou histórico de conversas.
- **Arquivo de memória:** O arquivo de memória é um arquivo Markdown de texto simples, portanto, você pode visualizá-lo e editá-lo manualmente, se necessário.