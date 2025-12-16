# Subagents

Subagents são assistentes de IA especializados que lidam com tipos específicos de tarefas dentro do Qwen Code. Eles permitem que você delegue trabalho focado a agentes de IA configurados com prompts, ferramentas e comportamentos específicos para cada tarefa.

## O que são Subagents?

Subagents são assistentes de IA independentes que:

- **Especializam-se em tarefas específicas** - Cada Subagent é configurado com um prompt de sistema focado para tipos particulares de trabalho
- **Possuem contexto separado** - Eles mantêm seu próprio histórico de conversa, separado do seu chat principal
- **Utilizam ferramentas controladas** - Você pode configurar quais ferramentas cada Subagent tem acesso
- **Trabalham de forma autônoma** - Uma vez atribuída uma tarefa, eles trabalham independentemente até a conclusão ou falha
- **Fornecem feedback detalhado** - Você pode ver seu progresso, uso de ferramentas e estatísticas de execução em tempo real

## Benefícios Principais

- **Especialização em Tarefas**: Crie agentes otimizados para fluxos de trabalho específicos (testes, documentação, refatoração, etc.)
- **Isolamento de Contexto**: Mantenha o trabalho especializado separado da sua conversa principal
- **Reutilização**: Salve e reutilize configurações de agentes em projetos e sessões
- **Acesso Controlado**: Limite quais ferramentas cada agente pode usar para segurança e foco
- **Visibilidade do Progresso**: Monitore a execução dos agentes com atualizações de progresso em tempo real

## Como os Subagentes Funcionam

1. **Configuração**: Você cria configurações de Subagentes que definem seu comportamento, ferramentas e prompts do sistema
2. **Delegação**: A IA principal pode delegar automaticamente tarefas aos Subagentes apropriados
3. **Execução**: Os Subagentes trabalham independentemente, usando suas ferramentas configuradas para completar tarefas
4. **Resultados**: Eles retornam resultados e resumos da execução de volta à conversa principal

## Primeiros Passos

### Início Rápido

1. **Crie seu primeiro Subagente**:

   `/agents create`

   Siga o assistente guiado para criar um agente especializado.

2. **Gerencie agentes existentes**:

   `/agents manage`

   Visualize e gerencie seus Subagentes configurados.

3. **Use Subagentes automaticamente**: Basta pedir à IA principal para realizar tarefas que correspondam às especializações dos seus Subagentes. A IA delegará automaticamente o trabalho apropriado.

### Exemplo de Uso

```
Usuário: "Por favor, escreva testes abrangentes para o módulo de autenticação"
IA: Vou delegar isso aos seus Subagentes especialistas em testes.
[Delega para os Subagentes "testing-expert"]
[Mostra o progresso em tempo real da criação dos testes]
[Retorna com os arquivos de teste concluídos e resumo da execução]`
```

## Gerenciamento

### Comandos da CLI

Subagentes são gerenciados através do comando slash `/agents` e seus subcomandos:

**Uso:**：`/agents create`。Cria um novo Subagente através de um assistente passo a passo.

**Uso:**：`/agents manage`。Abre um diálogo interativo de gerenciamento para visualizar e gerenciar Subagentes existentes.

### Locais de Armazenamento

Subagentes são armazenados como arquivos Markdown em dois locais:

- **Nível do projeto**: `.qwen/agents/` (tem precedência)
- **Nível do usuário**: `~/.qwen/agents/` (fallback)

Isso permite que você tenha agentes específicos do projeto e agentes pessoais que funcionam em todos os projetos.

### Formato do Arquivo

Subagentes são configurados usando arquivos Markdown com frontmatter YAML. Este formato é legível por humanos e fácil de editar com qualquer editor de texto.

#### Estrutura Básica

```
---
name: nome-do-agente
description: Breve descrição de quando e como usar este agente
tools:
	- ferramenta1
	- ferramenta2
	- ferramenta3 # Opcional
---

O conteúdo do prompt do sistema vai aqui.
Múltiplos parágrafos são suportados.
Você pode usar templating ${variavel} para conteúdo dinâmico.
```

#### Exemplo de Uso

```
---
name: documentador-de-projeto
description: Cria documentação de projetos e arquivos README
---

Você é um especialista em documentação para o projeto ${project_name}.

Sua tarefa: ${task_description}

Diretório de trabalho: ${current_directory}
Gerado em: ${timestamp}

Concentre-se em criar documentação clara e abrangente que ajude tanto
novos contribuidores quanto usuários finais a entenderem o projeto.
```

## Usando Subagentes de Forma Eficaz

### Delegação Automática

O Qwen Code delega tarefas de forma proativa com base em:

- A descrição da tarefa na sua solicitação
- O campo de descrição nas configurações dos Subagents
- O contexto atual e as ferramentas disponíveis

Para incentivar um uso mais proativo dos Subagents, inclua frases como "usar PROATIVAMENTE" ou "DEVE SER USADO" no campo de descrição.

### Invocação Explícita

Solicite um Subagent específico mencionando-o no seu comando:

```
Deixe o Subagents testing-expert criar testes unitários para o módulo de pagamento
Faça com que o Subagents documentation-writer atualize a referência da API
Peça ao Subagents react-specialist para otimizar o desempenho deste componente
```

## Exemplos

### Agents de Fluxo de Desenvolvimento

#### Especialista em Testes

Perfeito para criação abrangente de testes e desenvolvimento orientado a testes.

```
---
name: testing-expert
description: Escreve testes unitários abrangentes, testes de integração e lida com automação de testes seguindo boas práticas
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em testes focado em criar testes de alta qualidade e mantênicos.

Sua expertise inclui:

- Testes unitários com mocking e isolamento adequados
- Testes de integração para interações entre componentes
- Práticas de desenvolvimento orientado a testes (TDD)
- Identificação de casos extremos e cobertura abrangente
- Testes de performance e carga quando apropriado

Para cada tarefa de teste:

1. Analise a estrutura do código e suas dependências
2. Identifique funcionalidades principais, casos extremos e condições de erro
3. Crie suítes de teste abrangentes com nomes descritivos
4. Inclua setup/teardown adequado e asserções significativas
5. Adicione comentários explicando cenários de teste complexos
6. Garanta que os testes sejam mantênicos e sigam os princípios DRY

Sempre siga as melhores práticas de teste para a linguagem e framework detectados.
Foque tanto em casos de teste positivos quanto negativos.
```

**Casos de Uso:**

- "Escreva testes unitários para o serviço de autenticação"
- "Crie testes de integração para o fluxo de processamento de pagamentos"
- "Adicione cobertura de teste para casos extremos no módulo de validação de dados"

#### Escritor de Documentação

Especializado em criar documentação clara e abrangente.

```
---
name: documentation-writer
description: Cria documentação abrangente, arquivos README, documentação de APIs e guias do usuário
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
---

Você é um especialista em documentação técnica para ${project_name}.

Seu papel é criar documentação clara e abrangente que atenda tanto
desenvolvedores quanto usuários finais. Foque em:

**Para Documentação de API:**

- Descrições claras dos endpoints com exemplos
- Detalhes dos parâmetros com tipos e restrições
- Documentação do formato das respostas
- Explicações dos códigos de erro
- Requisitos de autenticação

**Para Documentação do Usuário:**

- Instruções passo a passo com capturas de tela quando útil
- Guias de instalação e configuração
- Opções de configuração e exemplos
- Seções de solução de problemas para questões comuns
- Seções de perguntas frequentes baseadas em dúvidas comuns dos usuários

**Para Documentação do Desenvolvedor:**

- Visões gerais da arquitetura e decisões de design
- Exemplos de código que realmente funcionam
- Diretrizes para contribuição
- Configuração do ambiente de desenvolvimento

Sempre verifique os exemplos de código e garanta que a documentação permaneça atualizada com
a implementação real. Use cabeçalhos claros, pontos de lista e exemplos.
```

**Casos de Uso:**

- “Crie documentação de API para os endpoints de gerenciamento de usuários”
- “Escreva um README abrangente para este projeto”
- “Documente o processo de deploy com etapas de solução de problemas”

#### Revisor de Código

Focado em qualidade de código, segurança e boas práticas.

```
---
name: code-reviewer
description: Revisa código para verificar boas práticas, problemas de segurança, desempenho e manutenibilidade
tools:
  - read_file
  - read_many_files
---

Você é um revisor de código experiente focado em qualidade, segurança e manutenibilidade.

Critérios de revisão:

- **Estrutura do Código**: Organização, modularidade e separação de responsabilidades
- **Desempenho**: Eficiência algorítmica e uso de recursos
- **Segurança**: Avaliação de vulnerabilidades e práticas de codificação segura
- **Boas Práticas**: Convenções específicas da linguagem/framework
- **Tratamento de Erros**: Manipulação adequada de exceções e cobertura de casos extremos
- **Legibilidade**: Nomes claros, comentários e organização do código
- **Testes**: Cobertura de testes e considerações sobre testabilidade

Forneça feedback construtivo com:

1. **Problemas Críticos**: Vulnerabilidades de segurança, bugs graves
2. **Melhorias Importantes**: Problemas de desempenho, problemas de design
3. **Sugestões Menores**: Melhorias de estilo, oportunidades de refatoração
4. **Feedback Positivo**: Padrões bem implementados e boas práticas

Concentre-se em feedback acionável com exemplos específicos e soluções sugeridas.
Priorize os problemas pelo impacto e forneça justificativas para as recomendações.
```

**Casos de Uso:**

- “Revise esta implementação de autenticação para identificar problemas de segurança”
- “Verifique as implicações de desempenho desta lógica de consulta ao banco de dados”
- “Avalie a estrutura do código e sugira melhorias”

### Agentes Específicos por Tecnologia

#### Especialista em React

Otimizado para desenvolvimento em React, hooks e padrões de componentes.

```
---
name: react-specialist
description: Especialista em desenvolvimento React, hooks, padrões de componentes e melhores práticas modernas do React
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em React com profundo conhecimento em desenvolvimento React moderno.

Sua expertise abrange:

- **Design de Componentes**: Componentes funcionais, hooks personalizados, padrões de composição
- **Gerenciamento de Estado**: useState, useReducer, Context API e bibliotecas externas
- **Performance**: React.memo, useMemo, useCallback, divisão de código
- **Testes**: React Testing Library, Jest, estratégias de teste de componentes
- **Integração com TypeScript**: Tipagem adequada para props, hooks e componentes
- **Padrões Modernos**: Suspense, Error Boundaries, Recursos Concorrentes

Para tarefas em React:

1. Utilize componentes funcionais e hooks por padrão
2. Implemente tipagem adequada com TypeScript
3. Siga as melhores práticas e convenções do React
4. Considere implicações de performance
5. Inclua tratamento de erros apropriado
6. Escreva código testável e mantível

Mantenha-se sempre atualizado com as melhores práticas do React e evite padrões obsoletos.
Foque em considerações de acessibilidade e experiência do usuário.
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
description: Especialista em desenvolvimento Python, frameworks, testes e melhores práticas específicas do Python
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em Python com profundo conhecimento do ecossistema Python.

Sua expertise inclui:

- **Python Core**: Padrões pythônicos, estruturas de dados, algoritmos
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testes**: pytest, unittest, mocking, desenvolvimento orientado a testes
- **Ciência de Dados**: pandas, numpy, matplotlib, jupyter notebooks
- **Programação Assíncrona**: asyncio, padrões async/await
- **Gerenciamento de Pacotes**: pip, poetry, ambientes virtuais
- **Qualidade de Código**: PEP 8, type hints, linting com pylint/flake8

Para tarefas em Python:

1. Siga as diretrizes de estilo PEP 8
2. Use type hints para melhor documentação do código
3. Implemente tratamento adequado de erros com exceções específicas
4. Escreva docstrings abrangentes
5. Considere desempenho e uso de memória
6. Inclua logging apropriado
7. Escreva código testável e modular

Foque em escrever código Python limpo e mantível que siga os padrões da comunidade.
```

**Casos de Uso:**

- "Crie um serviço FastAPI para autenticação de usuários com tokens JWT"
- "Implemente um pipeline de processamento de dados com pandas e tratamento de erros"
- "Escreva uma ferramenta CLI usando argparse com documentação de ajuda abrangente"

## Melhores Práticas

### Princípios de Design

#### Princípio da Responsabilidade Única

Cada Subagente deve ter um propósito claro e focado.

**✅ Bom:**

```
---
name: testing-expert
description: Escreve testes unitários abrangentes e testes de integração
---
```

**❌ Evitar:**

```
---
name: general-helper
description: Ajuda com testes, documentação, revisão de código e deploy
---
```

**Por quê:** Agentes focados produzem melhores resultados e são mais fáceis de manter.

#### Especialização Clara

Defina áreas de expertise específicas em vez de capacidades amplas.

**✅ Bom:**

```
---
name: react-performance-optimizer
description: Otimiza aplicações React para performance usando profiling e boas práticas
---
```

**❌ Evitar:**

```
---
name: frontend-developer
description: Trabalha em tarefas de desenvolvimento frontend
---
```

**Por quê:** Expertise específica leva a assistência mais direcionada e eficaz.

#### Descrições Acionáveis

Escreva descrições que indiquem claramente quando usar o agente.

**✅ Bom:**

```
description: Revisa código em busca de vulnerabilidades de segurança, problemas de desempenho e preocupações com manutenibilidade
```

**❌ Evitar:**

```
description: Um revisor de código útil
```

**Por quê:** Descrições claras ajudam a IA principal a escolher o agente certo para cada tarefa.

### Melhores Práticas de Configuração

#### Diretrizes do Prompt do Sistema

**Seja Específico Sobre a Expertise:**

```
Você é um especialista em testes Python com expertise em:

- Framework pytest e fixtures
- Objetos Mock e injeção de dependência
- Práticas de desenvolvimento orientado por testes
- Testes de performance com pytest-benchmark
```

**Inclua Abordagens Passo a Passo:**

```
Para cada tarefa de teste:

1. Analise a estrutura do código e as dependências
2. Identifique a funcionalidade principal e casos extremos
3. Crie suítes de teste abrangentes com nomes claros
4. Inclua setup/teardown e asserções adequadas
5. Adicione comentários explicando cenários de teste complexos
```

**Especifique Padrões de Saída:**

```
Sempre siga estes padrões:

- Use nomes de teste descritivos que expliquem o cenário
- Inclua casos de teste positivos e negativos
- Adicione docstrings para funções de teste complexas
- Garanta que os testes sejam independentes e possam ser executados em qualquer ordem
```

## Considerações de Segurança

- **Restrições de Ferramentas**: Subagentes só têm acesso às ferramentas configuradas
- **Sandboxing**: Toda execução de ferramenta segue o mesmo modelo de segurança do uso direto da ferramenta
- **Trilha de Auditoria**: Todas as ações dos Subagentes são registradas e visíveis em tempo real
- **Controle de Acesso**: A separação em nível de projeto e usuário fornece limites adequados
- **Informações Sensíveis**: Evite incluir segredos ou credenciais nas configurações dos agentes
- **Ambientes de Produção**: Considere agentes separados para ambientes de produção e desenvolvimento