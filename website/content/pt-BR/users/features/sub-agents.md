# Subagentes

Subagentes são assistentes de IA especializados que lidam com tipos específicos de tarefas dentro do Qwen Code. Eles permitem que você delegue trabalhos focados para agentes de IA configurados com prompts, ferramentas e comportamentos específicos para cada tarefa.

## O que são Subagentes?

Subagentes são assistentes de IA independentes que:

- **Se especializam em tarefas específicas** - Cada Subagente é configurado com um prompt de sistema focado para tipos particulares de trabalho
- **Têm contexto separado** - Eles mantêm seu próprio histórico de conversa, separado do seu chat principal
- **Usam ferramentas controladas** - Você pode configurar quais ferramentas cada Subagente tem acesso
- **Trabalham de forma autônoma** - Uma vez que recebem uma tarefa, trabalham independentemente até a conclusão ou falha
- **Fornecem feedback detalhado** - Você pode ver seu progresso, uso de ferramentas e estatísticas de execução em tempo real

## Subagente Fork

Além dos subagentes nomeados, o Qwen Code suporta **forking** — selecionado explicitamente com `subagent_type: "fork"` (disponível em sessões interativas). Um fork herda o contexto completo de conversa do pai e executa de forma destacada em segundo plano. Omitir `subagent_type` **não** faz fork; ele inicia o subagente de uso geral, que executa até a conclusão e retorna seu resultado inline.

### Como o Fork Difere dos Subagentes Nomeados

|               | Subagente Nomeado                   | Subagente Fork                                       |
| ------------- | ----------------------------------- | ---------------------------------------------------- |
| Contexto      | Começa do zero, sem histórico do pai | Herda o histórico completo de conversa do pai        |
| Prompt de sistema | Usa seu próprio prompt configurado  | Usa o prompt de sistema exato do pai (para compartilhamento de cache) |
| Execução      | Bloqueia o pai até terminar         | Executa em segundo plano, o pai continua imediatamente |
| Caso de uso   | Tarefas especializadas (testes, docs) | Tarefas paralelas que precisam do contexto atual      |

### Quando o Fork é Usado

A IA usa fork automaticamente quando precisa:

- Executar múltiplas tarefas de pesquisa em paralelo (ex.: "investigar módulo A, B e C")
- Realizar trabalho em segundo plano enquanto continua a conversa principal
- Delegar tarefas que exigem compreensão do contexto atual da conversa

### Compartilhamento de Cache de Prompt

Todos os forks compartilham o prefixo de requisição da API exato do pai (prompt de sistema, ferramentas, histórico de conversa), permitindo hits de cache de prompt do DashScope. Quando 3 forks rodam em paralelo, o prefixo compartilhado é armazenado em cache uma vez e reutilizado — economizando 80%+ de custos de token em comparação com subagentes independentes.

### Prevenção de Fork Recursivo

Filhos de fork não podem criar novos forks. Isso é aplicado em tempo de execução — se um fork tentar gerar outro fork, ele recebe um erro instruindo-o a executar tarefas diretamente.

### Limitações Atuais

- **Sem retorno de resultado**: Os resultados do fork são refletidos na exibição de progresso da UI, mas não são automaticamente realimentados na conversa principal. A IA pai vê uma mensagem placeholder e não pode agir com base na saída do fork.
- **Sem isolamento de worktree**: Os forks compartilham o diretório de trabalho do pai. Modificações concorrentes em arquivos de múltiplos forks podem entrar em conflito.

## Principais Benefícios

- **Especialização de Tarefas**: Crie agentes otimizados para fluxos de trabalho específicos (testes, documentação, refatoração, etc.)
- **Isolamento de Contexto**: Mantenha trabalhos especializados separados da sua conversa principal
- **Herança de Contexto**: Subagentes fork herdam a conversa completa para tarefas paralelas que exigem contexto
- **Compartilhamento de Cache de Prompt**: Subagentes fork compartilham o prefixo de cache do pai, reduzindo custos de token
- **Reutilização**: Salve e reutilize configurações de agentes entre projetos e sessões
- **Acesso Controlado**: Limite quais ferramentas cada agente pode usar para segurança e foco
- **Visibilidade de Progresso**: Monitore a execução do agente com atualizações de progresso em tempo real

## Como os Subagentes Funcionam

1. **Configuração**: Você cria configurações de Subagentes que definem seu comportamento, ferramentas e prompts de sistema
2. **Delegação**: A IA principal pode delegar tarefas automaticamente para Subagentes apropriados — ou fazer fork de si mesma (`subagent_type: "fork"`) quando quiser herdar o contexto completo da conversa e descartar a saída intermediária
3. **Execução**: Subagentes trabalham independentemente, usando suas ferramentas configuradas para completar tarefas
4. **Resultados**: Eles retornam resultados e sumários de execução de volta para a conversa principal

## Primeiros Passos

### Início Rápido

1. **Crie seu primeiro Subagente**:

   `/agents create`

   Siga o assistente guiado para criar um agente especializado.

2. **Gerencie agentes existentes**:

   `/agents manage`

   Visualize e gerencie seus Subagentes configurados.

3. **Use Subagentes automaticamente**: Simplesmente peça à IA principal para realizar tarefas que correspondam às especializações dos seus Subagentes. A IA delegará o trabalho apropriado automaticamente.

### Exemplo de Uso

```
Usuário: "Por favor, escreva testes abrangentes para o módulo de autenticação"
IA: Vou delegar isso ao seu Subagente especialista em testes.
[Delega para o Subagente "testing-expert"]
[Mostra progresso em tempo real da criação dos testes]
[Retorna com arquivos de teste concluídos e resumo da execução]`
```

## Gerenciamento

### Comandos CLI

Os Subagentes são gerenciados através do comando slash `/agents` e seus subcomandos:

**Uso:** `/agents create`. Cria um novo Subagente através de um assistente guiado passo a passo.

**Uso:** `/agents manage`. Abre um diálogo de gerenciamento interativo para visualizar e gerenciar Subagentes existentes.

### Locais de Armazenamento

Os Subagentes são armazenados como arquivos Markdown em múltiplos locais:

- **Nível do projeto**: `.qwen/agents/` (maior precedência)
- **Nível do usuário**: `~/.qwen/agents/` (fallback)
- **Nível da extensão**: Fornecido por extensões instaladas

Isso permite que você tenha agentes específicos do projeto, agentes pessoais que funcionam em todos os projetos e agentes fornecidos por extensões que adicionam capacidades especializadas.

### Subagentes de Extensão

Extensões podem fornecer subagentes personalizados que se tornam disponíveis quando a extensão é ativada. Esses agentes são armazenados no diretório `agents/` da extensão e seguem o mesmo formato dos agentes pessoais e de projeto.

Subagentes de extensão:

- São descobertos automaticamente quando a extensão é ativada
- Aparecem no diálogo `/agents manage` na seção "Agentes de Extensão"
- Não podem ser editados diretamente (edite a fonte da extensão)
- Seguem o mesmo formato de configuração dos agentes definidos pelo usuário

Para ver quais extensões fornecem subagentes, verifique o arquivo `qwen-extension.json` da extensão pelo campo `agents`.

### Formato do Arquivo

Subagentes são configurados usando arquivos Markdown com frontmatter YAML. Este formato é legível por humanos e fácil de editar com qualquer editor de texto.

#### Estrutura Básica

```
---
name: nome-do-agente
description: Breve descrição de quando e como usar este agente
model: inherit # Opcional: inherit, fast, modelId, ou authType:modelId
approvalMode: auto-edit # Opcional: default, plan, auto-edit, yolo, bubble
tools:         # Opcional: lista de permissão de ferramentas
  - ferramenta1
  - ferramenta2
disallowedTools: # Opcional: lista de bloqueio de ferramentas
  - ferramenta3
---

Conteúdo do prompt de sistema vai aqui.
Múltiplos parágrafos são suportados.
```

#### Seleção de Modelo

Use o campo opcional `model` no frontmatter para controlar qual modelo um subagente usa:

- `inherit`: Usa o mesmo modelo da conversa principal.
- Omitir o campo: Mesmo que `inherit`.
- `fast`: Usa o `fastModel` configurado. Se nenhum modelo rápido válido estiver configurado,
  o subagente volta para `inherit`.
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
description: Revisa pequenos diffs com o modelo rápido configurado
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

O seletor `fast` usa a mesma configuração de `fastModel` definida em
`settings.json` ou com `/model --fast`. Essa configuração pode, ela própria, referir-se a um
modelo sob outro tipo de autenticação configurado, como `openai:deepseek-v4-flash`.
Quando o seletor resolve para outro tipo de autenticação, o Qwen Code cria um
provedor de runtime dedicado para aquela requisição do subagente e envia ao provedor apenas o
ID do modelo puro.

#### Modo de Permissão

Use o campo opcional `approvalMode` no frontmatter para controlar como as chamadas de ferramentas de um subagente são aprovadas. Valores válidos:

- `default`: Ferramentas exigem aprovação interativa (mesmo que o padrão da sessão principal)
- `plan`: Modo apenas de análise — o agente planeja mas não executa alterações
- `auto-edit`: Ferramentas são aprovadas automaticamente sem solicitação (recomendado para a maioria dos agentes)
- `yolo`: Todas as ferramentas são aprovadas automaticamente, incluindo as potencialmente destrutivas
- `bubble`: Aprovações de ferramentas de agente em segundo plano são exibidas na sessão pai

Se você omitir este campo, o modo de permissão do subagente é determinado automaticamente:

- Se a sessão pai estiver no modo **yolo** ou **auto-edit**, o subagente herda esse modo. Um pai permissivo permanece permissivo.
- Se a sessão pai estiver no modo **plan**, o subagente permanece no modo plan. Uma sessão apenas de análise não pode modificar arquivos através de um agente delegado.
- Se a sessão pai estiver no modo **default** (em uma pasta confiável), o subagente recebe **auto-edit** para que possa trabalhar de forma autônoma.

Quando você define `approvalMode`, os modos permissivos do pai ainda têm prioridade. Por exemplo, se o pai está no modo yolo, um subagente com `approvalMode: plan` ainda executará no modo yolo.

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

Você é um revisor de código. Analise o código e relate descobertas.
Não modifique nenhum arquivo.
```

#### Configuração de Ferramentas

Use `tools` e `disallowedTools` para controlar quais ferramentas um subagente pode acessar.

**`tools` (lista de permissão):** Quando especificada, o subagente só pode usar as ferramentas listadas. Quando omitida, o subagente herda todas as ferramentas disponíveis da sessão pai.

```
---
name: reader
description: Agente somente leitura para exploração de código
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
---
```

**`disallowedTools` (lista de bloqueio):** Quando especificada, as ferramentas listadas são removidas do conjunto de ferramentas do subagente. Isso é útil quando você quer "tudo exceto X" sem listar todas as ferramentas permitidas.

```
---
name: safe-worker
description: Agente que não pode modificar arquivos
disallowedTools:
  - write_file
  - edit
  - run_shell_command
---
```

Se ambos `tools` e `disallowedTools` forem definidos, a lista de permissão é aplicada primeiro, depois a lista de bloqueio remove desse conjunto.

**Ferramentas MCP** seguem as mesmas regras. Se um subagente não tem uma lista `tools`, ele herda todas as ferramentas MCP da sessão pai. Se um subagente tem uma lista `tools` explícita, ele só recebe ferramentas MCP que são explicitamente nomeadas nessa lista.

O campo `disallowedTools` suporta padrões de nível de servidor MCP:

- `mcp__server__nome_ferramenta` — bloqueia uma ferramenta MCP específica
- `mcp__server` — bloqueia todas as ferramentas daquele servidor MCP

```
---
name: no-slack
description: Agente sem acesso ao Slack
disallowedTools:
  - mcp__slack
---
```

#### Campos de Compatibilidade com Claude Code

O Qwen Code aceita os campos de frontmatter do Claude Code 2.1.168 abaixo para que
você possa colocar um arquivo de agente do CC em `.qwen/agents/` e ter os campos
suportados analisados de forma idêntica. Campos opcionais com valores inválidos são
silenciosamente descartados no momento da análise, em vez de rejeitados — a mesma postura
flexível que o CC usa.

| Campo            | Tipo             | Notas                                                                                                                                                                                                                                                                          |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `permissionMode` | enum string      | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`. Mapeado para `approvalMode` na análise; quando ambos são definidos, o `approvalMode` explícito vence.                                                                                                 |
| `maxTurns`       | inteiro positivo | Limita o orçamento de turnos do agente. Conectado a `runConfig.max_turns` em tempo de execução; quando ambos são definidos, o campo de nível superior vence. O valor aninhado legado é removido do arquivo em disco ao salvar para evitar duas fontes de verdade.               |
| `color`          | enum string      | Cor de exibição. Lista de permissão: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` (espelha o `_Y` do CC). O sentinela legado do qwen `auto` é preservado para compatibilidade reversa. Outros valores são silenciosamente descartados na análise.      |
| `mcpServers`     | registro de specs | Substituições de servidor MCP por agente. Mesclado com o conjunto de servidores MCP no nível da sessão quando o agente é iniciado; em caso de colisão de chave, a especificação do agente vence (correspondendo à semântica `scope: 'agent'` do CC). Entradas malformadas são descartadas por chave com um aviso, em vez de falhar o agente inteiro. |
| `hooks`          | registro de arrays | Hooks por agente. As chaves são nomes de eventos de hook do CC (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, …); os valores são arrays de definições `{ matcher?, hooks: [...] }` no mesmo formato do campo `hooks` do `settings.json`. Registrados enquanto o agente executa, removidos quando ele para.  |

Exemplo com todos os itens acima:

```
---
name: rigorous-reviewer
description: Revisão profunda de código com limite de turnos
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
          command: echo "agente de revisão prestes a executar um comando shell"
---

Você é um revisor de código. Analise o código minuciosamente e relate descobertas
ordenadas por gravidade.
```

Os campos restantes do frontmatter do CC — `effort`, `skills`, `initialPrompt`,
`memory`, `isolation` — estão documentados no documento de design do agente declarativo
e chegarão em PRs subsequentes assim que a infraestrutura pré-requisito existir
(`effort` precisa de um parâmetro de camada de modelo; `memory` precisa de um subsistema
de memória com escopo; a flag CLI `--agent` habilita `initialPrompt`; etc.).

> **Limitação v1 dos `hooks`.** Enquanto um subagente declarando `hooks` está em execução,
> suas entradas de hook disparam para cada evento correspondente na sessão, não apenas
> para as chamadas de ferramenta desse subagente. Se dois subagentes com diferentes
> conjuntos de hooks por agente executam concorrentemente, ambos os conjuntos disparam
> para ambos os agentes. A filtragem de escopo por agente no momento do disparo do hook
> é deixada para um follow-up; para v1, prefira hooks por agente que sejam seguros para
> disparar globalmente durante a execução do agente (ex.: logging) em vez de hooks que
> modifiquem o comportamento.

#### Exemplo de Uso

```
---
name: project-documenter
description: Cria documentação de projeto e arquivos README
---

Você é um especialista em documentação.

Foque em criar documentação clara e abrangente que ajude tanto
novos contribuidores quanto usuários finais a entender o projeto.
```

## Usando Subagentes Efetivamente

### Delegação Automática

O Qwen Code delega tarefas proativamente com base em:

- A descrição da tarefa na sua solicitação
- O campo de descrição nas configurações dos Subagentes
- Contexto atual e ferramentas disponíveis

Para incentivar o uso mais proativo de Subagentes, inclua frases como "use PROACTIVELY" ou "MUST BE USED" no campo de descrição.

### Invocação Explícita

Solicite um Subagente específico mencionando-o no seu comando:

```
Deixe o Subagente testing-expert criar testes unitários para o módulo de pagamento
Peça ao Subagente documentation-writer para atualizar a referência da API
Solicite ao Subagente react-specialist para otimizar o desempenho deste componente
```

## Exemplos

### Agentes de Fluxo de Trabalho de Desenvolvimento

#### Especialista em Testes

Perfeito para criação abrangente de testes e desenvolvimento orientado a testes.

```
---
name: testing-expert
description: Escreve testes unitários, de integração abrangentes e gerencia automação de testes com melhores práticas
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em testes focado em criar testes de alta qualidade e sustentáveis.

Sua especialidade inclui:

- Testes unitários com mocking e isolamento apropriados
- Testes de integração para interações entre componentes
- Práticas de desenvolvimento orientado a testes
- Identificação de casos de borda e cobertura abrangente
- Testes de desempenho e carga quando apropriado

Para cada tarefa de teste:

1. Analise a estrutura do código e dependências
2. Identifique funcionalidades chave, casos de borda e condições de erro
3. Crie suítes de teste abrangentes com nomes descritivos
4. Inclua setup/teardown adequados e asserções significativas
5. Adicione comentários explicando cenários de teste complexos
6. Garanta que os testes sejam sustentáveis e sigam princípios DRY

Sempre siga as melhores práticas de teste para a linguagem e framework detectados.
Foque tanto em casos de teste positivos quanto negativos.
```

**Casos de Uso:**

- "Escreva testes unitários para o serviço de autenticação"
- "Crie testes de integração para o fluxo de processamento de pagamentos"
- "Adicione cobertura de testes para casos de borda no módulo de validação de dados"

#### Redator de Documentação

Especializado em criar documentação clara e abrangente.

```
---
name: documentation-writer
description: Cria documentação abrangente, arquivos README, documentação de API e guias do usuário
tools:
  - read_file
  - write_file
  - read_many_files
---

Você é um especialista em documentação técnica.

Seu papel é criar documentação clara e abrangente que atenda tanto
desenvolvedores quanto usuários finais. Foque em:

**Para Documentação de API:**

- Descrições claras de endpoints com exemplos
- Detalhes de parâmetros com tipos e restrições
- Documentação do formato de resposta
- Explicações de códigos de erro
- Requisitos de autenticação

**Para Documentação do Usuário:**

- Instruções passo a passo com capturas de tela quando útil
- Guias de instalação e configuração
- Opções de configuração e exemplos
- Seções de solução de problemas para problemas comuns
- Seções de FAQ baseadas em perguntas frequentes de usuários

**Para Documentação do Desenvolvedor:**

- Visões gerais de arquitetura e decisões de design
- Exemplos de código que realmente funcionam
- Diretrizes para contribuição
- Configuração do ambiente de desenvolvimento

Sempre verifique exemplos de código e garanta que a documentação permaneça atualizada com
a implementação real. Use cabeçalhos claros, marcadores e exemplos.
```

**Casos de Uso:**

- "Crie documentação de API para os endpoints de gerenciamento de usuários"
- "Escreva um README abrangente para este projeto"
- "Documente o processo de deploy com etapas de solução de problemas"

#### Revisor de Código

Focado em qualidade de código, segurança e melhores práticas.

```
---
name: code-reviewer
description: Revisa código em busca de melhores práticas, problemas de segurança, desempenho e sustentabilidade
tools:
  - read_file
  - read_many_files
---

Você é um revisor de código experiente focado em qualidade, segurança e sustentabilidade.

Critérios de revisão:

- **Estrutura do Código**: Organização, modularidade e separação de responsabilidades
- **Desempenho**: Eficiência algorítmica e uso de recursos
- **Segurança**: Avaliação de vulnerabilidades e práticas de codificação segura
- **Melhores Práticas**: Convenções específicas de linguagem/framework
- **Tratamento de Erros**: Tratamento adequado de exceções e cobertura de casos de borda
- **Legibilidade**: Nomenclatura clara, comentários e organização do código
- **Testes**: Cobertura de testes e considerações de testabilidade

Forneça feedback construtivo com:

1. **Problemas Críticos**: Vulnerabilidades de segurança, bugs maiores
2. **Melhorias Importantes**: Problemas de desempenho, problemas de design
3. **Sugestões Menores**: Melhorias de estilo, oportunidades de refatoração
4. **Feedback Positivo**: Padrões bem implementados e boas práticas

Foque em feedback acionável com exemplos específicos e soluções sugeridas.
Priorize problemas por impacto e forneça justificativa para as recomendações.
```
**Casos de Uso:**

- "Revise esta implementação de autenticação em busca de problemas de segurança"
- "Verifique as implicações de desempenho desta lógica de consulta ao banco de dados"
- "Avalie a estrutura do código e sugira melhorias"

### Agentes Específicos para Tecnologia

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

- "Crie um componente de tabela de dados reutilizável com ordenação e filtragem"
- "Implemente um hook personalizado para busca de dados de API com cache"
- "Refatore este componente de classe para usar padrões modernos do React"

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

- "Crie um serviço FastAPI para autenticação de usuários com tokens JWT"
- "Implemente um pipeline de processamento de dados com pandas e tratamento de erros"
- "Escreva uma ferramenta de linha de comando usando argparse com documentação de ajuda abrangente"

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

#### Diretrizes para System Prompt

**Seja Específico sobre a Especialização:**

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
- **Modo de Permissão**: Subagentes herdam o modo de permissão do pai por padrão. Sessões em modo de planejamento não podem escalar para edição automática por meio de agentes delegados. Modos privilegiados (auto-edit, yolo) são bloqueados em pastas não confiáveis.
- **Seleção de Provedor**: Um subagente com `model: authType:modelId` ou `model: fast` onde `fastModel` resolve para outro tipo de autenticação envia as requisições de modelo desse subagente para o provedor selecionado. Certifique-se de que esse provedor seja apropriado para a tarefa e os dados do subagente.
- **Isolamento (Sandboxing)**: Toda execução de ferramentas segue o mesmo modelo de segurança que o uso direto de ferramentas
- **Trilha de Auditoria**: Todas as ações dos Subagentes são registradas e visíveis em tempo real
- **Controle de Acesso**: A separação em nível de projeto e usuário fornece limites apropriados
- **Informações Sensíveis**: Evite incluir segredos ou credenciais nas configurações dos agentes
- **Ambientes de Produção**: Considere agentes separados para ambientes de produção e desenvolvimento

## Limites

Os seguintes avisos leves se aplicam às configurações de Subagentes (nenhum limite rígido é imposto):

- **Campo Descrição**: Um aviso é exibido para descrições que excedam 1.000 caracteres
- **System Prompt**: Um aviso é exibido para system prompts que excedam 10.000 caracteres