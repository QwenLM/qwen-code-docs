# Ferramenta de Escrita de Tarefas (`todo_write`)

Este documento descreve a ferramenta `todo_write` para o Qwen Code.

## Descrição

Use `todo_write` para criar e gerenciar uma lista de tarefas estruturada para sua sessão atual de programação. Essa ferramenta ajuda o assistente de IA a acompanhar o progresso e organizar tarefas complexas, fornecendo visibilidade sobre o trabalho que está sendo realizado.

### Argumentos

`todo_write` aceita um argumento:

- `todos` (array, obrigatório): Um array de itens de tarefa, em que cada item contém:
  - `content` (string, obrigatório): A descrição da tarefa.
  - `status` (string, obrigatório): O status atual (`pending`, `in_progress` ou `completed`).
  - `activeForm` (string, obrigatório): A forma no presente contínuo que descreve o que está sendo feito (por exemplo, "Executando testes", "Construindo o projeto").

## Como usar o `todo_write` com o Qwen Code

O assistente de IA usará automaticamente essa ferramenta ao trabalhar em tarefas complexas e com várias etapas. Você não precisa solicitá-la explicitamente, mas pode pedir ao assistente para criar uma lista de tarefas se quiser visualizar a abordagem planejada para sua solicitação.

A ferramenta armazena listas de tarefas no seu diretório pessoal (`~/.qwen/todos/`) usando arquivos específicos por sessão, de modo que cada sessão de programação mantenha sua própria lista de tarefas.

## Quando a IA usa essa ferramenta

O assistente usa o `todo_write` para:

- Tarefas complexas que exigem várias etapas  
- Implementações de funcionalidades com diversos componentes  
- Operações de refatoração em vários arquivos  
- Qualquer trabalho envolvendo 3 ou mais ações distintas  

O assistente não usará essa ferramenta para tarefas simples de única etapa ou para solicitações puramente informativas.

### Exemplos de `todo_write`

Criando um plano de implementação de funcionalidade:

```
todo_write(todos=[
  {
    "content": "Criar modelo de preferências do usuário",
    "status": "pending",
    "activeForm": "Criando modelo de preferências do usuário"
  },
  {
    "content": "Adicionar endpoints de API para preferências",
    "status": "pending",
    "activeForm": "Adicionando endpoints de API para preferências"
  },
  {
    "content": "Implementar componentes frontend",
    "status": "pending",
    "activeForm": "Implementando componentes frontend"
  }
])
```

## Observações importantes

- **Uso automático:** O assistente de IA gerencia listas de tarefas automaticamente durante tarefas complexas.
- **Visibilidade do progresso:** Você verá as listas de tarefas atualizadas em tempo real conforme o trabalho avança.
- **Isolamento por sessão:** Cada sessão de programação possui sua própria lista de tarefas, sem interferência entre sessões.