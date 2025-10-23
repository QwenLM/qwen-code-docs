# Ferramenta de Memória (`save_memory`)

Este documento descreve a ferramenta `save_memory` para o Qwen Code.

## Descrição

Use `save_memory` para salvar e recuperar informações entre suas sessões do Qwen Code. Com `save_memory`, você pode instruir o CLI a lembrar detalhes importantes entre sessões, oferecendo assistência personalizada e direcionada.

### Argumentos

`save_memory` recebe um argumento:

- `fact` (string, obrigatório): O fato específico ou informação a ser lembrada. Deve ser uma declaração clara e autocontida escrita em linguagem natural.

## Como usar `save_memory` com Qwen Code

A ferramenta adiciona o `fact` fornecido ao seu arquivo de contexto no diretório home do usuário (`~/.qwen/QWEN.md` por padrão). Este nome de arquivo pode ser configurado através da opção `contextFileName`.

Uma vez adicionados, os fatos são armazenados sob uma seção chamada `## Qwen Added Memories`. Este arquivo é carregado como contexto em sessões subsequentes, permitindo que o CLI recupere as informações salvas.

Uso:

```
save_memory(fact="Seu fato aqui.")
```

### Exemplos de `save_memory`

Lembrar uma preferência do usuário:

```
save_memory(fact="Minha linguagem de programação preferida é Python.")
```

Armazenar um detalhe específico do projeto:

```
save_memory(fact="O projeto no qual estou trabalhando atualmente se chama 'qwen-code'.")
```

## Notas importantes

- **Uso geral:** Esta ferramenta deve ser usada para fatos concisos e importantes. Não é destinada ao armazenamento de grandes volumes de dados ou histórico de conversas.
- **Arquivo de memória:** O arquivo de memória é um arquivo Markdown em texto simples, então você pode visualizá-lo e editá-lo manualmente se necessário.