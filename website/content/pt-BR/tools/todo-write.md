# Ferramenta Todo Write (`todo_write`)

Este documento descreve a ferramenta `todo_write` para o Qwen Code.

## Descrição

Use `todo_write` para criar e gerenciar uma lista de tarefas estruturada para sua sessão atual de codificação. Esta ferramenta ajuda o assistente de IA a acompanhar o progresso e organizar tarefas complexas, fornecendo visibilidade sobre o trabalho que está sendo realizado.

### Argumentos

`todo_write` recebe um argumento:

- `todos` (array, obrigatório): Um array de itens de tarefas, onde cada item contém:
  - `id` (string, obrigatório): Um identificador único para o item de tarefa.
  - `content` (string, obrigatório): A descrição da tarefa.
  - `status` (string, obrigatório): O status atual (`pending`, `in_progress`, ou `completed`).

## Como usar `todo_write` com Qwen Code

O assistente de IA vai usar essa ferramenta automaticamente ao trabalhar em tarefas complexas com múltiplas etapas. Você não precisa solicitar explicitamente, mas pode pedir ao assistente para criar uma lista de tarefas se quiser ver a abordagem planejada para sua solicitação.

A ferramenta armazena as listas de tarefas no seu diretório home (`~/.qwen/todos/`) em arquivos específicos por sessão, então cada sessão de codificação mantém sua própria lista de tarefas.

## Quando a IA usa essa ferramenta

O assistente usa `todo_write` para:

- Tarefas complexas que exigem múltiplas etapas
- Implementações de funcionalidades com vários componentes
- Operações de refatoração em múltiplos arquivos
- Qualquer trabalho que envolva 3 ou mais ações distintas

O assistente não usará essa ferramenta para tarefas simples de uma única etapa ou solicitações puramente informativas.

### Exemplos de `todo_write`

Criando um plano de implementação de feature:

```
todo_write(todos=[
  {
    "id": "create-model",
    "content": "Create user preferences model",
    "status": "pending"
  },
  {
    "id": "add-endpoints",
    "content": "Add API endpoints for preferences",
    "status": "pending"
  },
  {
    "id": "implement-ui",
    "content": "Implement frontend components",
    "status": "pending"
  }
])
```

## Notas importantes

- **Uso automático:** O assistente de IA gerencia as listas de tarefas automaticamente durante tarefas complexas.
- **Visibilidade do progresso:** Você verá as listas de tarefas sendo atualizadas em tempo real conforme o trabalho avança.
- **Isolamento de sessão:** Cada sessão de codificação tem sua própria lista de tarefas que não interfere nas demais.