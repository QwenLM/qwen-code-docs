# Ferramenta Todo Write (`todo_write`)

Este documento descreve a ferramenta `todo_write` para o Qwen Code.

## Descrição

Use `todo_write` para criar e gerenciar uma lista de tarefas estruturada para sua sessão de codificação atual. Esta ferramenta ajuda o assistente de IA a acompanhar o progresso e organizar tarefas complexas, fornecendo visibilidade sobre o trabalho que está sendo realizado.

### Argumentos

`todo_write` aceita um argumento:

- `todos` (array, obrigatório): Um array de itens de `todo`, onde cada item contém:
  - `content` (string, obrigatório): A descrição da tarefa.
  - `status` (string, obrigatório): O status atual (`pending`, `in_progress` ou `completed`).
  - `activeForm` (string, obrigatório): A forma no gerúndio descrevendo o que está sendo feito (ex.: "Executando testes", "Compilando o projeto").

## Como usar `todo_write` com o Qwen Code

O assistente de IA usará automaticamente esta ferramenta ao trabalhar em tarefas complexas com múltiplas etapas. Você não precisa solicitá-la explicitamente, mas pode pedir ao assistente para criar uma lista de `todo` se quiser ver a abordagem planejada para sua solicitação.

A ferramenta armazena as listas de `todo` no seu diretório home (`~/.qwen/todos/`) com arquivos específicos por sessão, de modo que cada sessão de codificação mantém sua própria lista de tarefas.

## Quando a IA usa esta ferramenta

O assistente usa `todo_write` para:

- Tarefas complexas que exigem múltiplas etapas
- Implementações de funcionalidades com vários componentes
- Operações de refatoração em vários arquivos
- Qualquer trabalho que envolva 3 ou mais ações distintas

O assistente não usará esta ferramenta para tarefas simples de uma única etapa ou solicitações puramente informativas.

### Exemplos de `todo_write`

Criando um plano de implementação de funcionalidade:

```
todo_write(todos=[
  {
    "content": "Create user preferences model",
    "status": "pending",
    "activeForm": "Creating user preferences model"
  },
  {
    "content": "Add API endpoints for preferences",
    "status": "pending",
    "activeForm": "Adding API endpoints for preferences"
  },
  {
    "content": "Implement frontend components",
    "status": "pending",
    "activeForm": "Implementing frontend components"
  }
])
```

## Notas importantes

- **Uso automático:** O assistente de IA gerencia listas de `todo` automaticamente durante tarefas complexas.
- **Visibilidade do progresso:** Você verá as listas de `todo` sendo atualizadas em tempo real conforme o trabalho avança.
- **Isolamento de sessão:** Cada sessão de codificação possui sua própria lista de `todo`, que não interfere nas demais.