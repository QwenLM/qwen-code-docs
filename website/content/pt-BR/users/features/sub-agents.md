---
description: "Configure Qwen Code Sub Agents para testes, documentação, refatoração e reviews, usando papéis de IA especializados em tarefas complexas."
---

# Subagentes

Os subagentes são assistentes de IA especializados que lidam com tipos específicos de tarefas dentro do Qwen Code. Eles permitem que você delegue trabalho focado a agentes de IA configurados com prompts, ferramentas e comportamentos específicos para a tarefa.

## O que são Subagentes?

Os subagentes são assistentes de IA independentes que:

- **Especializam-se em tarefas específicas** - Cada subagente é configurado com um prompt de sistema focado para tipos particulares de trabalho
- **Possuem contexto separado** - Eles mantêm seu próprio histórico de conversa, separado do seu chat principal
- **Usam ferramentas controladas** - Você pode configurar quais ferramentas cada subagente tem acesso
- **Trabalham de forma autônoma** - Uma vez recebida uma tarefa, eles trabalham independentemente até a conclusão ou falha
- **Fornecem feedback detalhado** - Você pode ver o progresso, o uso de ferramentas e as estatísticas de execução em tempo real

## Subagente Fork (Fork Implícito)

Além dos subagentes nomeados, o Qwen Code suporta **fork implícito** — quando a IA omite o parâmetro `subagent_type`, ela aciona um fork que herda o contexto completo da conversa do pai.

### Como o Fork Diferencia-se dos Subagentes Nomeados

|               | Subagente Nomeado                 | Subagente Fork                                          |
| ------------- | --------------------------------- | ----------------------------------------------------- |
| Contexto      | Começa do zero, sem histórico do pai | Herda o histórico completo da conversa do pai           |
| Prompt de sistema | Usa seu próprio prompt configurado | Usa o prompt de sistema exato do pai (para compartilhamento de cache) |
| Execução      | Bloqueia o pai até terminar       | Executa em segundo plano, o pai continua imediatamente  |
| Caso de uso   | Tarefas especializadas (testes, docs) | Tarefas paralelas que precisam do contexto atual        |

### Quando o Fork é Usado

A IA usa automaticamente o fork quando precisa:

- Executar múltiplas tarefas de pesquisa em paralelo (ex.: "investigar os módulos A, B e C")
- Realizar trabalho em segundo plano enquanto continua a conversa principal
- Delegar tarefas que exigem compreensão do contexto atual da conversa

### Compartilhamento de Cache de Prompt

Todos os forks compartilham o prefixo exato da requisição de API do pai (prompt de sistema, ferramentas, histórico de conversa), permitindo hits no cache de prompt do DashScope. Quando 3 forks rodam em paralelo, o prefixo compartilhado é armazenado em cache uma vez e reutilizado — economizando mais de 80% nos custos de tokens em comparação com subagentes independentes.

### Prevenção de Fork Recursivo

Filhos de fork não podem criar novos forks. Isso é imposto em tempo de execução — se um fork tentar gerar outro fork, ele receberá um erro instruindo-o a executar as tarefas diretamente.

### Limitações Atuais

- **Sem feedback de resultados**: Os resultados do fork são refletidos na exibição de progresso da UI, mas não são alimentados automaticamente de volta na conversa principal. A IA pai vê uma mensagem de placeholder e não pode agir sobre a saída do fork.
- **Sem isolamento de worktree**: Os forks compartilham o diretório de trabalho do pai. Modificações de arquivo concorrentes de múltiplos forks podem entrar em conflito.

## Principais Benefícios

- **Especialização de Tarefas**: Crie agentes otimizados para fluxos de trabalho específicos (testes, documentação, refatoração, etc.)
- **Isolamento de Contexto**: Mantenha o trabalho especializado separado da sua conversa principal
- **Herança de Contexto**: Subagentes fork herdam a conversa completa para tarefas paralelas que exigem muito contexto
- **Compartilhamento de Cache de Prompt**: Subagentes fork compartilham o prefixo de cache do pai, reduzindo custos de tokens
- **Reutilização**: Salve e reutilize configurações de agentes entre projetos e sessões
- **Acesso Controlado**: Limite quais ferramentas cada agente pode usar para segurança e foco
- **Visibilidade de Progresso**: Monitore a execução do agente com atualizações de progresso em tempo real

## Como os Subagentes Funcionam

1. **Configuração**: Você cria configurações de subagentes que definem seu comportamento, ferramentas e prompts de sistema
2. **Delegação**: A IA principal pode delegar automaticamente tarefas para os subagentes apropriados — ou fazer um fork implícito quando nenhum tipo específico de subagente for necessário
3. **Execução**: Os subagentes trabalham de forma independente, usando suas ferramentas configuradas para concluir as tarefas
4. **Resultados**: Eles retornam os resultados e resumos de execução para a conversa principal

## Primeiros Passos

### Início Rápido

1. **Crie seu primeiro subagente**:

   `/agents create`

   Siga o assistente guiado para criar um agente especializado.

2. **Gerencie agentes existentes**:

   `/agents manage`

   Visualize e gerencie seus subagentes configurados.

3. **Use subagentes automaticamente**: Basta pedir à IA principal para realizar tarefas que correspondam às especializações dos seus subagentes. A IA delegará automaticamente o trabalho apropriado.

### Exemplo de Uso

```
User: "Please write comprehensive tests for the authentication module"
AI: I'll delegate this to your testing specialist Subagents.
[Delegates to "testing-expert" Subagents]
[Shows real-time progress of test creation]
[Returns with completed test files and execution summary]`
```

## Gerenciamento

### Comandos CLI

Os subagentes são gerenciados por meio do comando de barra `/agents` e seus subcomandos:

**Uso:** `/agents create`. Cria um novo subagente por meio de um assistente guiado passo a passo.

**Uso:** `/agents manage`. Abre um diálogo de gerenciamento interativo para visualizar e gerenciar subagentes existentes.

### Locais de Armazenamento

Os subagentes são armazenados como arquivos Markdown em vários locais:

- **Nível de projeto**: `.qwen/agents/` (maior precedência)
- **Nível de usuário**: `~/.qwen/agents/` (fallback)
- **Nível de extensão**: Fornecidos por extensões instaladas

Isso permite que você tenha agentes específicos do projeto, agentes pessoais que funcionam em todos os projetos e agentes fornecidos por extensões que adicionam capacidades especializadas.

### Subagentes de Extensão

As extensões podem fornecer subagentes personalizados que ficam disponíveis quando a extensão é ativada. Esses agentes são armazenados no diretório `agents/` da extensão e seguem o mesmo formato dos agentes pessoais e de projeto.

Subagentes de extensão:

- São descobertos automaticamente quando a extensão é ativada
- Aparecem no diálogo `/agents manage` na seção "Extension Agents"
- Não podem ser editados diretamente (edite o código-fonte da extensão em vez disso)
- Seguem o mesmo formato de configuração dos agentes definidos pelo usuário

Para ver quais extensões fornecem subagentes, verifique o arquivo `qwen-extension.json` da extensão em busca de um campo `agents`.

### Formato de Arquivo

Os subagentes são configurados usando arquivos Markdown com frontmatter YAML. Este formato é legível por humanos e fácil de editar com qualquer editor de texto.

#### Estrutura Básica

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit or model-id
approvalMode: auto-edit # Optional: default, plan, auto-edit, yolo
tools:         # Optional: allowlist of tools
  - tool1
  - tool2
disallowedTools: # Optional: blocklist of tools
  - tool3
---

System prompt content goes here.
Multiple paragraphs are supported.
```

#### Seleção de Modelo

Use o campo opcional `model` no frontmatter para controlar qual modelo um subagente usa:

- `inherit`: Usa o mesmo modelo da conversa principal
- Omitir o campo: Igual a `inherit`
- `glm-5`: Usa esse ID de modelo com o tipo de autenticação da conversa principal
- `openai:gpt-4o`: Usa um provedor diferente (resolve credenciais a partir de variáveis de ambiente)

#### Modo de Permissão

Use o campo opcional `approvalMode` no frontmatter para controlar como as chamadas de ferramentas de um subagente são aprovadas. Valores válidos:

- `default`: As ferramentas exigem aprovação interativa (igual ao padrão da sessão principal)
- `plan`: Modo somente análise — o agente planeja, mas não executa alterações
- `auto-edit`: As ferramentas são aprovadas automaticamente sem prompt (recomendado para a maioria dos agentes)
- `yolo`: Todas as ferramentas são aprovadas automaticamente, incluindo as potencialmente destrutivas

Se você omitir este campo, o modo de permissão do subagente será determinado automaticamente:

- Se a sessão pai estiver no modo **yolo** ou **auto-edit**, o subagente herda esse modo. Um pai permissivo permanece permissivo.
- Se a sessão pai estiver no modo **plan**, o subagente permanece no modo plan. Uma sessão somente análise não pode modificar arquivos por meio de um agente delegado.
- Se a sessão pai estiver no modo **default** (em uma pasta confiável), o subagente recebe **auto-edit** para que possa trabalhar de forma autônoma.

Quando você define `approvalMode`, os modos permissivos do pai ainda têm prioridade. Por exemplo, se o pai estiver no modo yolo, um subagente com `approvalMode: plan` ainda será executado no modo yolo.

```
---
name: cautious-reviewer
description: Reviews code without making changes
approvalMode: plan
tools:
  - read_file
  - grep_search
  - glob
---

You are a code reviewer. Analyze the code and report findings.
Do not modify any files.
```

#### Configuração de Ferramentas

Use `tools` e `disallowedTools` para controlar quais ferramentas um subagente pode acessar.

**`tools` (allowlist):** Quando especificado, o subagente só pode usar as ferramentas listadas. Quando omitido, o subagente herda todas as ferramentas disponíveis da sessão pai.

```
---
name: reader
description: Read-only agent for code exploration
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
---
```

**`disallowedTools` (blocklist):** Quando especificado, as ferramentas listadas são removidas do pool de ferramentas do subagente. Isso é útil quando você quer "tudo, exceto X" sem listar todas as ferramentas permitidas.

```
---
name: safe-worker
description: Agent that cannot modify files
disallowedTools:
  - write_file
  - edit
  - run_shell_command
---
```

Se ambos `tools` e `disallowedTools` estiverem definidos, a allowlist é aplicada primeiro e, em seguida, a blocklist remove itens desse conjunto.

**Ferramentas MCP** seguem as mesmas regras. Se um subagente não tiver uma lista `tools`, ele herda todas as ferramentas MCP da sessão pai. Se um subagente tiver uma lista `tools` explícita, ele receberá apenas as ferramentas MCP nomeadas explicitamente nessa lista.

O campo `disallowedTools` suporta padrões em nível de servidor MCP:

- `mcp__server__tool_name` — bloqueia uma ferramenta MCP específica
- `mcp__server` — bloqueia todas as ferramentas daquele servidor MCP

```
---
name: no-slack
description: Agent without Slack access
disallowedTools:
  - mcp__slack
---
```

#### Exemplo de Uso

```
---
name: project-documenter
description: Creates project documentation and README files
---

You are a documentation specialist.

Focus on creating clear, comprehensive documentation that helps both
new contributors and end users understand the project.
```

## Usando Subagentes de Forma Eficaz

### Delegação Automática

O Qwen Code delega tarefas proativamente com base em:

- A descrição da tarefa na sua solicitação
- O campo de descrição nas configurações dos subagentes
- Contexto atual e ferramentas disponíveis

Para incentivar um uso mais proativo dos subagentes, inclua frases como "use PROATIVAMENTE" ou "DEVE SER USADO" no seu campo de descrição.

### Invocação Explícita

Solicite um subagente específico mencionando-o no seu comando:

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## Exemplos

### Agentes de Fluxo de Trabalho de Desenvolvimento

#### Especialista em Testes

Perfeito para criação abrangente de testes e desenvolvimento orientado a testes (TDD).

```
---
name: testing-expert
description: Writes comprehensive unit tests, integration tests, and handles test automation with best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a testing specialist focused on creating high-quality, maintainable tests.

Your expertise includes:

- Unit testing with appropriate mocking and isolation
- Integration testing for component interactions
- Test-driven development practices
- Edge case identification and comprehensive coverage
- Performance and load testing when appropriate

For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality, edge cases, and error conditions
3. Create comprehensive test suites with descriptive names
4. Include proper setup/teardown and meaningful assertions
5. Add comments explaining complex test scenarios
6. Ensure tests are maintainable and follow DRY principles

Always follow testing best practices for the detected language and framework.
Focus on both positive and negative test cases.
```

**Casos de Uso:**

- “Escreva testes unitários para o serviço de autenticação”
- “Crie testes de integração para o fluxo de processamento de pagamentos”
- “Adicione cobertura de testes para casos extremos no módulo de validação de dados”

#### Escritor de Documentação

Especializado na criação de documentação clara e abrangente.

```
---
name: documentation-writer
description: Creates comprehensive documentation, README files, API docs, and user guides
tools:
  - read_file
  - write_file
  - read_many_files
---

You are a technical documentation specialist.

Your role is to create clear, comprehensive documentation that serves both
developers and end users. Focus on:

**For API Documentation:**

- Clear endpoint descriptions with examples
- Parameter details with types and constraints
- Response format documentation
- Error code explanations
- Authentication requirements

**For User Documentation:**

- Step-by-step instructions with screenshots when helpful
- Installation and setup guides
- Configuration options and examples
- Troubleshooting sections for common issues
- FAQ sections based on common user questions

**For Developer Documentation:**

- Architecture overviews and design decisions
- Code examples that actually work
- Contributing guidelines
- Development environment setup

Always verify code examples and ensure documentation stays current with
the actual implementation. Use clear headings, bullet points, and examples.
```

**Casos de Uso:**

- “Crie documentação de API para os endpoints de gerenciamento de usuários”
- “Escreva um README abrangente para este projeto”
- “Documente o processo de deploy com etapas de solução de problemas”

#### Revisor de Código

Focado em qualidade de código, segurança e melhores práticas.

```
---
name: code-reviewer
description: Reviews code for best practices, security issues, performance, and maintainability
tools:
  - read_file
  - read_many_files
---

You are an experienced code reviewer focused on quality, security, and maintainability.

Review criteria:

- **Code Structure**: Organization, modularity, and separation of concerns
- **Performance**: Algorithmic efficiency and resource usage
- **Security**: Vulnerability assessment and secure coding practices
- **Best Practices**: Language/framework-specific conventions
- **Error Handling**: Proper exception handling and edge case coverage
- **Readability**: Clear naming, comments, and code organization
- **Testing**: Test coverage and testability considerations

Provide constructive feedback with:

1. **Critical Issues**: Security vulnerabilities, major bugs
2. **Important Improvements**: Performance issues, design problems
3. **Minor Suggestions**: Style improvements, refactoring opportunities
4. **Positive Feedback**: Well-implemented patterns and good practices

Focus on actionable feedback with specific examples and suggested solutions.
Prioritize issues by impact and provide rationale for recommendations.
```

**Casos de Uso:**

- “Revise esta implementação de autenticação em busca de problemas de segurança”
- “Verifique as implicações de desempenho desta lógica de consulta ao banco de dados”
- “Avalie a estrutura do código e sugira melhorias”

### Agentes Específicos por Tecnologia

#### Especialista em React

Otimizado para desenvolvimento em React, hooks e padrões de componentes.

```
---
name: react-specialist
description: Expert in React development, hooks, component patterns, and modern React best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a React specialist with deep expertise in modern React development.

Your expertise covers:

- **Component Design**: Functional components, custom hooks, composition patterns
- **State Management**: useState, useReducer, Context API, and external libraries
- **Performance**: React.memo, useMemo, useCallback, code splitting
- **Testing**: React Testing Library, Jest, component testing strategies
- **TypeScript Integration**: Proper typing for props, hooks, and components
- **Modern Patterns**: Suspense, Error Boundaries, Concurrent Features

For React tasks:

1. Use functional components and hooks by default
2. Implement proper TypeScript typing
3. Follow React best practices and conventions
4. Consider performance implications
5. Include appropriate error handling
6. Write testable, maintainable code

Always stay current with React best practices and avoid deprecated patterns.
Focus on accessibility and user experience considerations.
```

**Casos de Uso:**

- “Crie um componente de tabela de dados reutilizável com ordenação e filtragem”
- “Implemente um hook personalizado para busca de dados de API com cache”
- “Refatore este componente de classe para usar padrões modernos do React”

#### Especialista em Python

Especializado em desenvolvimento Python, frameworks e melhores práticas.

```
---
name: python-expert
description: Expert in Python development, frameworks, testing, and Python-specific best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a Python expert with deep knowledge of the Python ecosystem.

Your expertise includes:

- **Core Python**: Pythonic patterns, data structures, algorithms
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, mocking, test-driven development
- **Data Science**: pandas, numpy, matplotlib, jupyter notebooks
- **Async Programming**: asyncio, async/await patterns
- **Package Management**: pip, poetry, virtual environments
- **Code Quality**: PEP 8, type hints, linting with pylint/flake8

For Python tasks:

1. Follow PEP 8 style guidelines
2. Use type hints for better code documentation
3. Implement proper error handling with specific exceptions
4. Write comprehensive docstrings
5. Consider performance and memory usage
6. Include appropriate logging
7. Write testable, modular code

Focus on writing clean, maintainable Python code that follows community standards.
```

**Casos de Uso:**

- “Crie um serviço FastAPI para autenticação de usuários com tokens JWT”
- “Implemente um pipeline de processamento de dados com pandas e tratamento de erros”
- “Escreva uma ferramenta CLI usando argparse com documentação de ajuda abrangente”

## Melhores Práticas

### Princípios de Design

#### Princípio da Responsabilidade Única

Cada subagente deve ter um propósito claro e focado.

**✅ Bom:**

```
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ Evite:**

```
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**Por que:** Agentes focados produzem melhores resultados e são mais fáceis de manter.

#### Especialização Clara

Defina áreas de expertise específicas em vez de capacidades amplas.

**✅ Bom:**

```
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ Evite:**

```
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**Por que:** Expertise específica leva a uma assistência mais direcionada e eficaz.

#### Descrições Acionáveis

Escreva descrições que indiquem claramente quando usar o agente.

**✅ Bom:**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ Evite:**

```
description: A helpful code reviewer
```

**Por que:** Descrições claras ajudam a IA principal a escolher o agente certo para cada tarefa.

### Melhores Práticas de Configuração

#### Diretrizes para Prompt de Sistema

**Seja Específico Sobre a Expertise:**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**Inclua Abordagens Passo a Passo:**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**Especifique Padrões de Saída:**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## Considerações de Segurança

- **Restrições de Ferramentas**: Use `tools` para limitar quais ferramentas um subagente pode acessar, ou `disallowedTools` para bloquear ferramentas específicas enquanto herda todo o resto
- **Modo de Permissão**: Por padrão, os subagentes herdam o modo de permissão do pai. Sessões no modo plan não podem escalar para auto-edit por meio de agentes delegados. Modos privilegiados (auto-edit, yolo) são bloqueados em pastas não confiáveis.
- **Sandboxing**: Toda execução de ferramentas segue o mesmo modelo de segurança do uso direto de ferramentas
- **Rastreamento de Auditoria**: Todas as ações dos subagentes são registradas em log e visíveis em tempo real
- **Controle de Acesso**: A separação em nível de projeto e de usuário fornece limites apropriados
- **Informações Sensíveis**: Evite incluir segredos ou credenciais nas configurações do agente
- **Ambientes de Produção**: Considere agentes separados para ambientes de produção vs. desenvolvimento

## Limites

Os seguintes avisos brandos se aplicam às configurações de subagentes (nenhum limite rígido é imposto):

- **Campo de Descrição**: Um aviso é exibido para descrições que excedem 1.000 caracteres
- **Prompt de Sistema**: Um aviso é exibido para prompts de sistema que excedem 10.000 caracteres