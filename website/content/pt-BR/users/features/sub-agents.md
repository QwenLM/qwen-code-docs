# Subagentes

Subagentes são assistentes de IA especializados que lidam com tipos específicos de tarefas dentro do Qwen Code. Eles permitem que você delegue trabalhos focados a agentes de IA configurados com prompts, ferramentas e comportamentos específicos para a tarefa.

## O que são Subagentes?

Subagentes são assistentes de IA independentes que:

- **Especializam-se em tarefas específicas** - Cada Subagente é configurado com um prompt de sistema focado para tipos particulares de trabalho
- **Possuem contexto separado** - Mantêm seu próprio histórico de conversação, separado do seu chat principal
- **Usam ferramentas controladas** - Você pode configurar quais ferramentas cada Subagente tem acesso
- **Trabalham autonomamente** - Uma vez que recebem uma tarefa, trabalham independentemente até a conclusão ou falha
- **Fornecem feedback detalhado** - Você pode ver o progresso, uso de ferramentas e estatísticas de execução em tempo real

## Fork Subagent

Além dos subagentes nomeados, o Qwen Code suporta **forking** — selecionado explicitamente com `subagent_type: "fork"` (disponível em sessões interativas). Um fork herda o contexto completo da conversa do pai e executa de forma destacada em segundo plano. Omitir `subagent_type` **não** faz fork; ele lança o subagente de propósito geral, que executa até o fim e retorna seu resultado inline.

### Como o Fork Difere dos Subagentes Nomeados

|               | Subagente Nomeado                  | Fork Subagent                                         |
| ------------- | --------------------------------- | ----------------------------------------------------- |
| Contexto      | Começa do zero, sem histórico pai  | Herda o histórico completo da conversa do pai         |
| Prompt do sistema | Usa seu próprio prompt configurado | Usa o prompt de sistema exato do pai (para compartilhamento de cache) |
| Execução      | Bloqueia o pai até terminar        | Executa em segundo plano, o pai continua imediatamente|
| Caso de uso   | Tarefas especializadas (testes, docs) | Tarefas paralelas que precisam do contexto atual      |

### Quando o Fork é Usado

A IA usa automaticamente o fork quando precisa:

- Executar múltiplas tarefas de pesquisa em paralelo (ex.: "investigue os módulos A, B e C")
- Realizar trabalho em segundo plano enquanto continua a conversa principal
- Delegar tarefas que exigem compreensão do contexto atual da conversa

### Compartilhamento de Cache de Prompt

Todos os forks compartilham o prefixo exato da requisição da API do pai (prompt de sistema, ferramentas, histórico de conversa), permitindo acertos de cache de prompt do DashScope. Quando 3 forks executam em paralelo, o prefixo compartilhado é armazenado em cache uma vez e reutilizado — economizando mais de 80% nos custos de tokens comparado a subagentes independentes.

### Prevenção de Fork Recursivo

Filhos de fork não podem criar mais forks. Isso é aplicado em tempo de execução — se um fork tentar gerar outro fork, ele recebe um erro instruindo-o a executar tarefas diretamente.

### Limitações Atuais

- **Sem feedback de resultado**: Os resultados do fork são refletidos na exibição de progresso da UI, mas não são automaticamente realimentados na conversa principal. A IA pai vê uma mensagem placeholder e não pode agir com base na saída do fork.
- **Sem isolamento de worktree**: Os forks compartilham o diretório de trabalho do pai. Modificações concorrentes em arquivos de múltiplos forks podem entrar em conflito.

## Principais Benefícios

- **Especialização de Tarefas**: Crie agentes otimizados para fluxos de trabalho específicos (testes, documentação, refatoração, etc.)
- **Isolamento de Contexto**: Mantenha trabalhos especializados separados da sua conversa principal
- **Herança de Contexto**: Subagentes fork herdam a conversa completa para tarefas paralelas que exigem contexto
- **Compartilhamento de Cache de Prompt**: Subagentes fork compartilham o prefixo de cache do pai, reduzindo custos de tokens
- **Reutilização**: Salve e reutilize configurações de agentes entre projetos e sessões
- **Acesso Controlado**: Limite quais ferramentas cada agente pode usar para segurança e foco
- **Visibilidade de Progresso**: Monitore a execução do agente com atualizações de progresso em tempo real

## Como os Subagentes Funcionam

1. **Configuração**: Você cria configurações dos Subagentes que definem seu comportamento, ferramentas e prompts de sistema
2. **Delegação**: A IA principal pode delegar automaticamente tarefas para Subagentes apropriados — ou fazer fork de si mesma (`subagent_type: "fork"`) quando deseja herdar o contexto completo da conversa e descartar a saída intermediária
3. **Execução**: Subagentes trabalham independentemente, usando suas ferramentas configuradas para completar tarefas
4. **Resultados**: Eles retornam resultados e resumos de execução de volta para a conversa principal

## Primeiros Passos

### Início Rápido

1. **Crie seu primeiro Subagente**:

   `/agents create`

   Siga o assistente guiado para criar um agente especializado.

2. **Gerencie agentes existentes**:

   `/agents manage`

   Visualize e gerencie seus Subagentes configurados.

3. **Use Subagentes automaticamente**: Simplesmente peça à IA principal para realizar tarefas que correspondam às especializações dos seus Subagentes. A IA delegará automaticamente o trabalho apropriado.

### Exemplo de Uso

```
User: "Please write comprehensive tests for the authentication module"
AI: I'll delegate this to your testing specialist Subagents.
[Delegates to "testing-expert" Subagents]
[Shows real-time progress of test creation]
[Returns with completed test files and execution summary]`
```
## Gerenciamento

### Comandos da CLI

Os subagentes são gerenciados através do comando de barra `/agents` e seus subcomandos:

**Uso:** `/agents create`. Cria um novo subagente através de um assistente de etapas guiado.

**Uso:** `/agents manage`. Abre um diálogo interativo de gerenciamento para visualizar e gerenciar subagentes existentes.

### Locais de Armazenamento

Os subagentes são armazenados como arquivos Markdown em múltiplos locais:

- **Nível do projeto**: `.qwen/agents/` (maior precedência)
- **Nível do usuário**: `~/.qwen/agents/` (fallback)
- **Nível da extensão**: Fornecido por extensões instaladas

Isso permite que você tenha agentes específicos do projeto, agentes pessoais que funcionam em todos os projetos e agentes fornecidos por extensões que adicionam capacidades especializadas.

### Subagentes de Extensão

Extensões podem fornecer subagentes personalizados que se tornam disponíveis quando a extensão está habilitada. Esses agentes são armazenados no diretório `agents/` da extensão e seguem o mesmo formato que os agentes pessoais e de projeto.

Subagentes de extensão:

- São descobertos automaticamente quando a extensão é habilitada
- Aparecem no diálogo `/agents manage` sob a seção "Agentes de Extensão"
- Não podem ser editados diretamente (edite o código-fonte da extensão)
- Seguem o mesmo formato de configuração que os agentes definidos pelo usuário

Para ver quais extensões fornecem subagentes, verifique o arquivo `qwen-extension.json` da extensão em busca de um campo `agents`.

### Formato do Arquivo

Os subagentes são configurados usando arquivos Markdown com frontmatter YAML. Este formato é legível por humanos e fácil de editar com qualquer editor de texto.

#### Estrutura Básica

```
---
name: agent-name
description: Descrição breve de quando e como usar este agente
model: inherit # Opcional: inherit, fast, modelId ou authType:modelId
approvalMode: auto-edit # Opcional: default, plan, auto-edit, yolo, bubble
tools:         # Opcional: lista de permissão de ferramentas
  - tool1
  - tool2
disallowedTools: # Opcional: lista de bloqueio de ferramentas
  - tool3
---

O conteúdo do prompt do sistema fica aqui.
Múltiplos parágrafos são suportados.
```

#### Seleção de Modelo

Use o campo opcional `model` no frontmatter para controlar qual modelo um subagente utiliza:

- `inherit`: Usa o mesmo modelo da conversa principal.
- Omitir o campo: Equivalente a `inherit`.
- `fast`: Usa o `fastModel` configurado. Se nenhum modelo rápido válido estiver configurado,
  o subagente recai para `inherit`.
- `glm-5`: Usa esse ID de modelo. O Qwen Code primeiro verifica o tipo de autenticação da
  conversa principal; se o modelo não estiver disponível lá, ele pode resolver o modelo de
  outro provedor configurado.
- `openai:gpt-4o`: Usa um provedor explícito e ID de modelo. Isso é útil quando um
  subagente deve executar em um modelo registrado sob um tipo de autenticação diferente
  da conversa principal.

Por exemplo:

```
---
name: fast-reviewer
description: Revisa pequenas diffs com o modelo rápido configurado
model: fast
tools:
  - read_file
  - grep_search
---
```

```
---
name: openai-researcher
description: Usa um provedor compatível com OpenAI para tarefas de pesquisa
model: openai:gpt-4o
tools:
  - read_file
  - grep_search
  - glob
---
```

O seletor `fast` usa a mesma configuração `fastModel` definida em
`settings.json` ou com `/model --fast`. Essa configuração pode, por sua vez, referir-se a um
modelo sob outro tipo de autenticação configurado, como `openai:deepseek-v4-flash`.
Quando o seletor resolve para outro tipo de autenticação, o Qwen Code cria um provedor
de runtime dedicado para essa requisição do subagente e envia ao provedor apenas o ID
do modelo básico.

#### Modo de Permissão

Use o campo opcional `approvalMode` no frontmatter para controlar como as chamadas de ferramenta de um subagente são aprovadas. Valores válidos:

- `default`: Ferramentas exigem aprovação interativa (igual ao padrão da sessão principal)
- `plan`: Modo apenas de análise — o agente planeja, mas não executa alterações
- `auto-edit`: Ferramentas são aprovadas automaticamente sem confirmação (recomendado para a maioria dos agentes)
- `yolo`: Todas as ferramentas são aprovadas automaticamente, incluindo as potencialmente destrutivas
- `bubble`: As aprovações de ferramentas de agentes em segundo plano são exibidas na sessão principal

Se você omitir este campo, o modo de permissão do subagente é determinado automaticamente:

- Se a sessão principal estiver no modo **yolo** ou **auto-edit**, o subagente herda esse modo. Uma sessão permissiva permanece permissiva.
- Se a sessão principal estiver no modo **plan**, o subagente permanece no modo plan. Uma sessão apenas de análise não pode modificar arquivos através de um agente delegado.
- Se a sessão principal estiver no modo **default** (em uma pasta confiável), o subagente recebe **auto-edit** para que possa trabalhar autonomamente.

Quando você define `approvalMode`, os modos permissivos da sessão principal ainda têm prioridade. Por exemplo, se a sessão principal estiver no modo yolo, um subagente com `approvalMode: plan` ainda será executado no modo yolo.

```
---
name: cautious-reviewer
description: Revisa código sem fazer alterações
approvalMode: plan
tools:
  - read_file
  - grep_search
  - glob
---

Você é um revisor de código. Analise o código e relate os resultados.
Não modifique nenhum arquivo.
```

#### Configuração de Ferramentas

Use `tools` e `disallowedTools` para controlar quais ferramentas um subagente pode acessar.

**`tools` (lista de permissão):** Quando especificado, o subagente pode usar apenas as ferramentas listadas. Quando omitido, o subagente herda todas as ferramentas disponíveis da sessão principal.
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

**`disallowedTools` (lista de bloqueio):** Quando especificada, as ferramentas listadas são removidas do conjunto de ferramentas do subagente. Isso é útil quando você deseja "tudo exceto X" sem listar todas as ferramentas permitidas.

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

Se ambos `tools` e `disallowedTools` estiverem definidos, a lista de permissão é aplicada primeiro, e depois a lista de bloqueio remove desse conjunto.

**Ferramentas MCP** seguem as mesmas regras. Se um subagente não tiver uma lista `tools`, ele herda todas as ferramentas MCP da sessão pai. Se um subagente tiver uma lista `tools` explícita, ele receberá apenas as ferramentas MCP que estiverem explicitamente nomeadas nessa lista.

O campo `disallowedTools` suporta padrões no nível do servidor MCP:

- `mcp__server__tool_name` — bloqueia uma ferramenta MCP específica
- `mcp__server` — bloqueia todas as ferramentas desse servidor MCP

```
---
name: no-slack
description: Agent without Slack access
disallowedTools:
  - mcp__slack
---
```

#### Campos de Compatibilidade com Claude Code

O Qwen Code aceita os campos de frontmatter do Claude Code 2.1.168 listados abaixo, para que você possa colocar um arquivo de agente do CC em `.qwen/agents/` e os campos suportados sejam analisados de forma idêntica. Campos opcionais com valores inválidos são descartados silenciosamente durante a análise, em vez de rejeitados — a mesma postura flexível que o CC adota.

| Campo           | Tipo             | Notas                                                                                                                                                                                                                                                                            |
| --------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`| string enum      | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`. Mapeado para `approvalMode` no momento da análise; quando ambos estão definidos, o `approvalMode` explícito vence.                                                                                                           |
| `maxTurns`      | inteiro positivo | Limita o orçamento de turnos do agente. Conectado a `runConfig.max_turns` em tempo de execução; quando ambos estão definidos, o campo de nível superior vence. O valor aninhado legado é removido do arquivo no disco ao salvar para evitar duas fontes de verdade.                                                           |
| `color`         | string enum      | Cor de exibição. Lista de permissão: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` (espelha `_Y` do CC). O sentinela legado do qwen `auto` é preservado para compatibilidade reversa. Outros valores são descartados silenciosamente na análise.                                         |
| `mcpServers`    | registro de specs| Substituições de servidor MCP por agente. Mesclado com o conjunto de servidores MCP do nível de sessão quando o agente é criado; em caso de colisão de chave, a especificação do agente vence (correspondendo à semântica `scope: 'agent'` do CC). Entradas malformadas são descartadas por chave com um aviso, em vez de falhar o agente inteiro. |
| `hooks`         | registro de arrays| Hooks por agente. As chaves são nomes de eventos de hook do CC (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, …); os valores são arrays de definições `{ matcher?, hooks: [...] }` no mesmo formato do campo `hooks` do `settings.json`. Registrados enquanto o agente está em execução, removidos quando ele para.  |

Exemplo com todos os itens acima:

```
---
name: rigorous-reviewer
description: Deep code review with a turn cap
permissionMode: plan
maxTurns: 50
color: cyan
tools:
  - read_file
  - grep_search
  - glob
mcpServers:
  filesystem:
    type: stdio
    command: node
    args: [/usr/local/lib/mcp-fs/server.js]
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: echo "review-agent about to run a shell command"
---

You are a code reviewer. Analyze the code thoroughly and report findings
ordered by severity.
```

Os campos restantes de frontmatter do CC — `effort`, `skills`, `initialPrompt`, `memory`, `isolation` — estão documentados no documento de design do agente declarativo e serão implementados em PRs posteriores assim que a infraestrutura pré-requisito existir (`effort` precisa de um parâmetro na camada do modelo; `memory` precisa de um subsistema de memória com escopo; a flag `--agent` da CLI habilita `initialPrompt`; etc.).

> **Limitação de `hooks` v1.** Enquanto um subagente que declara `hooks` está em execução, suas entradas de hook são acionadas para cada evento correspondente na sessão, não apenas para as chamadas de ferramenta desse subagente. Se dois subagentes com conjuntos de hooks diferentes por agente forem executados simultaneamente, ambos os conjuntos são acionados para ambos os agentes. A filtragem por escopo por agente no momento da ativação do hook é deixada para uma versão futura; para v1, prefira hooks por agente que sejam seguros para acionar globalmente durante a execução do agente (por exemplo, registro de log) em vez de hooks que alteram o comportamento.
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
- O campo de descrição nas configurações dos Subagentes
- Contexto atual e ferramentas disponíveis

Para incentivar o uso mais proativo dos Subagentes, inclua frases como "use PROACTIVELY" ou "MUST BE USED" no campo de descrição.

### Invocação Explícita

Solicite um Subagente específico mencionando-o no seu comando:

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## Exemplos

### Agentes de Fluxo de Desenvolvimento

#### Especialista em Testes

Perfeito para criação abrangente de testes e desenvolvimento orientado a testes.

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

- "Escreva testes unitários para o serviço de autenticação"
- "Crie testes de integração para o fluxo de processamento de pagamentos"
- "Adicione cobertura de testes para casos extremos no módulo de validação de dados"

#### Redator de Documentação

Especializado em criar documentação clara e abrangente.

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

- "Crie documentação de API para os endpoints de gerenciamento de usuários"
- "Escreva um README abrangente para este projeto"
- "Documente o processo de implantação com etapas de solução de problemas"

#### Revisor de Código

Focado em qualidade de código, segurança e boas práticas.

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

### Agentes Especializados em Tecnologia

#### Especialista em React

Otimizado para desenvolvimento React, hooks e padrões de componentes.

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
- “Escreva uma ferramenta de linha de comando usando argparse com documentação de ajuda abrangente”

## Melhores Práticas

### Princípios de Design

#### Princípio da Responsabilidade Única

Cada Subagente deve ter um propósito claro e focado.

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

**Por quê:** Agentes focados produzem melhores resultados e são mais fáceis de manter.

#### Especialização Clara

Defina áreas de especialização específicas em vez de capacidades amplas.

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

**Por quê:** Especialização específica leva a uma assistência mais direcionada e eficaz.

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

**Por quê:** Descrições claras ajudam a IA principal a escolher o agente certo para cada tarefa.

### Melhores Práticas de Configuração

#### Diretrizes para o Prompt do Sistema

**Seja Específico sobre a Expertise:**

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
```
Sempre siga estes padrões:

- Use nomes de teste descritivos que expliquem o cenário
- Inclua casos de teste positivos e negativos
- Adicione docstrings para funções de teste complexas
- Garanta que os testes sejam independentes e possam ser executados em qualquer ordem
```

## Considerações de Segurança

- **Restrições de Ferramentas**: Use `tools` para limitar quais ferramentas um subagente pode acessar, ou `disallowedTools` para bloquear ferramentas específicas enquanto herda todo o resto
- **Modo de Permissão**: Subagentes herdam o modo de permissão de seu pai por padrão. Sessões em modo de planejamento não podem escalar para auto-edit através de agentes delegados. Modos privilegiados (auto-edit, yolo) são bloqueados em pastas não confiáveis.
- **Seleção de Provedor**: Um subagente com `model: authType:modelId`, ou
  `model: fast` onde `fastModel` resolve para outro tipo de autenticação, envia
  as requisições de modelo desse subagente para o provedor selecionado. Certifique-se de que esse provedor seja apropriado para a tarefa e os dados do subagente.
- **Isolamento**: Toda execução de ferramenta segue o mesmo modelo de segurança que o uso direto de ferramentas
- **Trilha de Auditoria**: Todas as ações dos Subagentes são registradas e visíveis em tempo real
- **Controle de Acesso**: A separação entre projeto e usuário fornece limites apropriados
- **Informações Sensíveis**: Evite incluir segredos ou credenciais em configurações de agentes
- **Ambientes de Produção**: Considere agentes separados para ambientes de produção vs. desenvolvimento

## Limites

Os seguintes avisos suaves se aplicam às configurações de Subagentes (nenhum limite rígido é imposto):

- **Campo de Descrição**: Um aviso é mostrado para descrições que excedem 1.000 caracteres
- **Prompt do Sistema**: Um aviso é mostrado para prompts do sistema que excedem 10.000 caracteres
