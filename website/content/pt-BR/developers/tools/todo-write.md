# Ferramenta de Escrita de Tarefas (`todo_write`)

Este documento descreve a ferramenta `todo_write` para Qwen Code.

## Descrição

Use `todo_write` para criar e gerenciar uma lista de tarefas estruturada para sua sessão de codificação atual. Esta ferramenta ajuda o assistente de IA a acompanhar o progresso e organizar tarefas complexas, fornecendo a você visibilidade sobre o trabalho que está sendo realizado.

### Argumentos

`todo_write` aceita um argumento:

- `todos` (array, obrigatório): Um array de itens de tarefa, onde cada item contém:
  - `content` (string, obrigatório): A descrição da tarefa.
  - `status` (string, obrigatório): O status atual (`pending`, `in_progress` ou `completed`).
  - `id` (string, obrigatório): Um identificador único para o item de tarefa.

## Como usar `todo_write` com Qwen Code

O assistente de IA usará automaticamente esta ferramenta ao trabalhar em tarefas complexas e de várias etapas. Você não precisa solicitá-la explicitamente, mas pode pedir ao assistente que crie uma lista de tarefas se quiser ver a abordagem planejada para sua solicitação.

A ferramenta armazena listas de tarefas no seu diretório pessoal (`~/.qwen/todos/`) com arquivos específicos de sessão, para que cada sessão de codificação mantenha sua própria lista de tarefas.

## Quando a IA usa esta ferramenta

O assistente usa `todo_write` para:

- Tarefas complexas que exigem várias etapas
- Implementações de funcionalidades com vários componentes
- Operações de refatoração em vários arquivos
- Qualquer trabalho envolvendo 3 ou mais ações distintas

O assistente não usará esta ferramenta para tarefas simples de uma única etapa ou solicitações puramente informativas.

### Exemplos de `todo_write`

Criando um plano de implementação de funcionalidade:

```
todo_write(todos=[
  {
    "id": "1",
    "content": "Create user preferences model",
    "status": "pending"
  },
  {
    "id": "2",
    "content": "Add API endpoints for preferences",
    "status": "pending"
  },
  {
    "id": "3",
    "content": "Implement frontend components",
    "status": "pending"
  }
])
```

## Notas importantes

- **Uso automático:** O assistente de IA gerencia listas de tarefas automaticamente durante tarefas complexas.
- **Visibilidade do progresso:** Você verá listas de tarefas atualizadas em tempo real conforme o trabalho avança.
- **Isolamento de sessão:** Cada sessão de codificação tem sua própria lista de tarefas que não interfere nas outras.