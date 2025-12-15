# Ferramenta Todo Write (`todo_write`)

Este documento descreve a ferramenta `todo_write` para o Qwen Code.

## Descrição

Use `todo_write` para criar e gerenciar uma lista de tarefas estruturada para sua sessão atual de codificação. Esta ferramenta ajuda o assistente de IA a acompanhar o progresso e organizar tarefas complexas, fornecendo visibilidade sobre o trabalho que está sendo realizado.

### Argumentos

`todo_write` recebe um argumento:

- `todos` (array, obrigatório): Um array de itens de tarefas, onde cada item contém:
  - `content` (string, obrigatório): A descrição da tarefa.
  - `status` (string, obrigatório): O status atual (`pending`, `in_progress` ou `completed`).
  - `activeForm` (string, obrigatório): A forma contínua presente descrevendo o que está sendo feito (por exemplo, "Executando testes", "Construindo o projeto").

## Como usar `todo_write` com o Qwen Code

O assistente de IA usará automaticamente esta ferramenta ao trabalhar em tarefas complexas com várias etapas. Você não precisa solicitá-la explicitamente, mas pode pedir ao assistente para criar uma lista de tarefas se quiser ver a abordagem planejada para sua solicitação.

A ferramenta armazena listas de tarefas em seu diretório pessoal (`~/.qwen/todos/`) em arquivos específicos da sessão, então cada sessão de programação mantém sua própria lista de tarefas.

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

- **Uso automático:** O assistente de IA gerencia listas de tarefas automaticamente durante tarefas complexas.
- **Visibilidade do progresso:** Você verá as listas de tarefas sendo atualizadas em tempo real conforme o trabalho avança.
- **Isolamento de sessão:** Cada sessão de codificação possui sua própria lista de tarefas que não interfere nas demais.