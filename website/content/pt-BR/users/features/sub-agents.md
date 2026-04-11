# Subagentes

Os subagentes são assistentes de IA especializados que lidam com tipos específicos de tarefas dentro do Qwen Code. Eles permitem que você delegue trabalho focado a agentes de IA configurados com prompts, ferramentas e comportamentos específicos para cada tarefa.

## O que são Subagentes?

Os subagentes são assistentes de IA independentes que:

- **Especializam-se em tarefas específicas** - Cada subagente é configurado com um prompt de sistema focado para tipos particulares de trabalho
- **Possuem contexto separado** - Eles mantêm seu próprio histórico de conversas, separado do seu chat principal
- **Usam ferramentas controladas** - Você pode configurar quais ferramentas cada subagente tem acesso
- **Trabalham de forma autônoma** - Uma vez recebida uma tarefa, eles trabalham independentemente até a conclusão ou falha
- **Fornecem feedback detalhado** - Você pode ver o progresso, o uso de ferramentas e as estatísticas de execução em tempo real

## Principais Benefícios

- **Especialização em Tarefas**: Crie agentes otimizados para fluxos de trabalho específicos (testes, documentação, refatoração, etc.)
- **Isolamento de Contexto**: Mantenha o trabalho especializado separado da sua conversa principal
- **Reutilização**: Salve e reutilize configurações de agentes entre projetos e sessões
- **Acesso Controlado**: Limite quais ferramentas cada agente pode usar para segurança e foco
- **Visibilidade do Progresso**: Monitore a execução do agente com atualizações de progresso em tempo real

## Como os Subagentes Funcionam

1. **Configuração**: Você cria configurações de subagentes que definem seu comportamento, ferramentas e prompts de sistema
2. **Delegação**: A IA principal pode delegar automaticamente tarefas aos subagentes apropriados
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

3. **Use subagentes automaticamente**: Basta pedir à IA principal para executar tarefas que correspondam às especializações dos seus subagentes. A IA delegará automaticamente o trabalho adequado.

### Exemplo de Uso

```
Usuário: "Por favor, escreva testes abrangentes para o módulo de autenticação"
IA: Vou delegar isso aos seus subagentes especialistas em testes.
[Delega para o subagente "testing-expert"]
[Mostra o progresso em tempo real da criação dos testes]
[Retorna com os arquivos de teste concluídos e o resumo da execução]`
```

## Gerenciamento

### Comandos da CLI

Os subagentes são gerenciados por meio do comando de barra `/agents` e seus subcomandos:

**Uso:** `/agents create`. Cria um novo subagente por meio de um assistente guiado passo a passo.

**Uso:** `/agents manage`. Abre um diálogo de gerenciamento interativo para visualizar e gerenciar subagentes existentes.

### Locais de Armazenamento

Os subagentes são armazenados como arquivos Markdown em vários locais:

- **Nível do projeto**: `.qwen/agents/` (maior precedência)
- **Nível do usuário**: `~/.qwen/agents/` (fallback)
- **Nível da extensão**: Fornecidos por extensões instaladas

Isso permite que você tenha agentes específicos do projeto, agentes pessoais que funcionam em todos os projetos e agentes fornecidos por extensões que adicionam capacidades especializadas.

### Subagentes de Extensões

As extensões podem fornecer subagentes personalizados que ficam disponíveis quando a extensão é ativada. Esses agentes são armazenados no diretório `agents/` da extensão e seguem o mesmo formato dos agentes pessoais e do projeto.

Subagentes de extensões:

- São descobertos automaticamente quando a extensão é ativada
- Aparecem no diálogo `/agents manage` na seção "Extension Agents"
- Não podem ser editados diretamente (edite o código-fonte da extensão em vez disso)
- Seguem o mesmo formato de configuração dos agentes definidos pelo usuário

Para ver quais extensões fornecem subagentes, verifique o arquivo `qwen-extension.json` da extensão em busca de um campo `agents`.

### Formato do Arquivo

Os subagentes são configurados usando arquivos Markdown com frontmatter YAML. Este formato é legível por humanos e fácil de editar com qualquer editor de texto.

#### Estrutura Básica

```
---
name: nome-do-agente
description: Breve descrição de quando e como usar este agente
model: inherit # Opcional: inherit ou id-do-modelo
tools:
	- ferramenta1
	- ferramenta2
	- ferramenta3 # Opcional
---

O conteúdo do prompt de sistema vai aqui.
Vários parágrafos são suportados.
```

#### Seleção de Modelo

Use o campo opcional `model` no frontmatter para controlar qual modelo um subagente usa:

- `inherit`: Usa o mesmo modelo da conversa principal
- Omitir o campo: Igual a `inherit`
- `glm-5`: Usa esse ID de modelo com o tipo de autenticação da conversa principal
- `openai:gpt-4o`: Usa um provedor diferente (resolve credenciais a partir de variáveis de ambiente)

#### Exemplo de Uso

```
---
name: documentador-do-projeto
description: Cria documentação do projeto e arquivos README
---

Você é um especialista em documentação.

Foque em criar documentação clara e abrangente que ajude tanto
novos contribuidores quanto usuários finais a entender o projeto.
```

## Usando Subagentes de Forma Eficaz

### Delegação Automática

O Qwen Code delega tarefas proativamente com base em:

- Na descrição da tarefa na sua solicitação
- No campo de descrição nas configurações dos subagentes
- No contexto atual e nas ferramentas disponíveis

Para incentivar um uso mais proativo dos subagentes, inclua frases como "use PROATIVAMENTE" ou "DEVE SER USADO" no seu campo de descrição.

### Invocação Explícita

Solicite um subagente específico mencionando-o no seu comando:

```
Peça ao subagente testing-expert para criar testes unitários para o módulo de pagamento
Peça ao subagente documentation-writer para atualizar a referência da API
Peça ao subagente react-specialist para otimizar o desempenho deste componente
```

## Exemplos

### Agentes de Fluxo de Trabalho de Desenvolvimento

#### Especialista em Testes

Perfeito para criação abrangente de testes e desenvolvimento orientado a testes (TDD).

```
---
name: testing-expert
description: Escreve testes unitários abrangentes, testes de integração e lida com automação de testes seguindo melhores práticas
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em testes focado em criar testes de alta qualidade e fáceis de manter.

Sua expertise inclui:

- Testes unitários com mocking e isolamento adequados
- Testes de integração para interações entre componentes
- Práticas de desenvolvimento orientado a testes (TDD)
- Identificação de casos extremos e cobertura abrangente
- Testes de desempenho e carga quando apropriado

Para cada tarefa de teste:

1. Analise a estrutura do código e as dependências
2. Identifique funcionalidades principais, casos extremos e condições de erro
3. Crie suítes de testes abrangentes com nomes descritivos
4. Inclua setup/teardown adequados e asserções significativas
5. Adicione comentários explicando cenários de teste complexos
6. Garanta que os testes sejam mantíveis e sigam os princípios DRY

Siga sempre as melhores práticas de teste para a linguagem e framework detectados.
Foque em casos de teste positivos e negativos.
```

**Casos de Uso:**

- “Escreva testes unitários para o serviço de autenticação”
- “Crie testes de integração para o fluxo de processamento de pagamentos”
- “Adicione cobertura de testes para casos extremos no módulo de validação de dados”

#### Escritor de Documentação

Especializado em criar documentação clara e abrangente.

```
---
name: documentation-writer
description: Cria documentação abrangente, arquivos README, docs de API e guias do usuário
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
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
- Seções de solução de problemas para questões comuns
- Seções de FAQ baseadas em perguntas frequentes dos usuários

**Para Documentação do Desenvolvedor:**

- Visões gerais da arquitetura e decisões de design
- Exemplos de código que realmente funcionam
- Diretrizes de contribuição
- Configuração do ambiente de desenvolvimento

Sempre verifique os exemplos de código e garanta que a documentação permaneça atualizada com
a implementação real. Use títulos claros, listas e exemplos.
```

**Casos de Uso:**

- “Crie documentação da API para os endpoints de gerenciamento de usuários”
- “Escreva um README abrangente para este projeto”
- “Documente o processo de deploy com etapas de solução de problemas”

#### Revisor de Código

Focado em qualidade de código, segurança e melhores práticas.

```
---
name: code-reviewer
description: Revisa código em busca de melhores práticas, problemas de segurança, desempenho e manutenibilidade
tools:
  - read_file
  - read_many_files
---

Você é um revisor de código experiente focado em qualidade, segurança e manutenibilidade.

Critérios de revisão:

- **Estrutura do Código**: Organização, modularidade e separação de responsabilidades
- **Desempenho**: Eficiência algorítmica e uso de recursos
- **Segurança**: Avaliação de vulnerabilidades e práticas de codificação segura
- **Melhores Práticas**: Convenções específicas da linguagem/framework
- **Tratamento de Erros**: Tratamento adequado de exceções e cobertura de casos extremos
- **Legibilidade**: Nomenclatura clara, comentários e organização do código
- **Testes**: Cobertura de testes e considerações sobre testabilidade

Forneça feedback construtivo com:

1. **Problemas Críticos**: Vulnerabilidades de segurança, bugs graves
2. **Melhorias Importantes**: Problemas de desempenho, problemas de design
3. **Sugestões Menores**: Melhorias de estilo, oportunidades de refatoração
4. **Feedback Positivo**: Padrões bem implementados e boas práticas

Foque em feedback acionável com exemplos específicos e soluções sugeridas.
Priorize os problemas por impacto e forneça a justificativa para as recomendações.
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
description: Especialista em desenvolvimento React, hooks, padrões de componentes e melhores práticas modernas do React
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em React com profunda expertise em desenvolvimento React moderno.

Sua expertise abrange:

- **Design de Componentes**: Componentes funcionais, hooks personalizados, padrões de composição
- **Gerenciamento de Estado**: useState, useReducer, Context API e bibliotecas externas
- **Desempenho**: React.memo, useMemo, useCallback, code splitting
- **Testes**: React Testing Library, Jest, estratégias de teste de componentes
- **Integração com TypeScript**: Tipagem adequada para props, hooks e componentes
- **Padrões Modernos**: Suspense, Error Boundaries, Concurrent Features

Para tarefas em React:

1. Use componentes funcionais e hooks por padrão
2. Implemente tipagem TypeScript adequada
3. Siga as melhores práticas e convenções do React
4. Considere as implicações de desempenho
5. Inclua tratamento de erros adequado
6. Escreva código testável e mantível

Mantenha-se sempre atualizado com as melhores práticas do React e evite padrões obsoletos.
Foque em considerações de acessibilidade e experiência do usuário.
```

**Casos de Uso:**

- “Crie um componente de tabela de dados reutilizável com ordenação e filtragem”
- “Implemente um hook personalizado para busca de dados da API com cache”
- “Refatore este componente de classe para usar padrões modernos do React”

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

- **Python Core**: Padrões Pythonicos, estruturas de dados, algoritmos
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testes**: pytest, unittest, mocking, desenvolvimento orientado a testes
- **Ciência de Dados**: pandas, numpy, matplotlib, notebooks Jupyter
- **Programação Assíncrona**: asyncio, padrões async/await
- **Gerenciamento de Pacotes**: pip, poetry, ambientes virtuais
- **Qualidade de Código**: PEP 8, type hints, linting com pylint/flake8

Para tarefas em Python:

1. Siga as diretrizes de estilo PEP 8
2. Use type hints para melhor documentação do código
3. Implemente tratamento de erros adequado com exceções específicas
4. Escreva docstrings abrangentes
5. Considere desempenho e uso de memória
6. Inclua logging adequado
7. Escreva código modular e testável

Foque em escrever código Python limpo e mantível que siga os padrões da comunidade.
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
description: Escreve testes unitários abrangentes e testes de integração
---
```

**❌ Evite:**

```
---
name: general-helper
description: Ajuda com testes, documentação, revisão de código e deploy
---
```

**Por quê:** Agentes focados produzem melhores resultados e são mais fáceis de manter.

#### Especialização Clara

Defina áreas de especialização específicas em vez de capacidades amplas.

**✅ Bom:**

```
---
name: react-performance-optimizer
description: Otimiza aplicações React para desempenho usando profiling e melhores práticas
---
```

**❌ Evite:**

```
---
name: frontend-developer
description: Trabalha em tarefas de desenvolvimento frontend
---
```

**Por quê:** Especialização específica leva a uma assistência mais direcionada e eficaz.

#### Descrições Acionáveis

Escreva descrições que indiquem claramente quando usar o agente.

**✅ Bom:**

```
description: Revisa código em busca de vulnerabilidades de segurança, problemas de desempenho e preocupações com manutenibilidade
```

**❌ Evite:**

```
description: Um revisor de código útil
```

**Por quê:** Descrições claras ajudam a IA principal a escolher o agente certo para cada tarefa.

### Melhores Práticas de Configuração

#### Diretrizes para o Prompt de Sistema

**Seja Específico Sobre a Especialização:**

```
Você é um especialista em testes Python com expertise em:

- Framework pytest e fixtures
- Objetos Mock e injeção de dependência
- Práticas de desenvolvimento orientado a testes
- Testes de desempenho com pytest-benchmark
```

**Inclua Abordagens Passo a Passo:**

```
Para cada tarefa de teste:

1. Analise a estrutura do código e as dependências
2. Identifique funcionalidades principais e casos extremos
3. Crie suítes de testes abrangentes com nomenclatura clara
4. Inclua setup/teardown e asserções adequadas
5. Adicione comentários explicando cenários de teste complexos
```

**Especifique Padrões de Saída:**

```
Siga sempre estes padrões:

- Use nomes de testes descritivos que expliquem o cenário
- Inclua casos de teste positivos e negativos
- Adicione docstrings para funções de teste complexas
- Garanta que os testes sejam independentes e possam ser executados em qualquer ordem
```

## Considerações de Segurança

- **Restrições de Ferramentas**: Os subagentes têm acesso apenas às suas ferramentas configuradas
- **Sandboxing**: Toda execução de ferramentas segue o mesmo modelo de segurança do uso direto de ferramentas
- **Rastro de Auditoria**: Todas as ações dos subagentes são registradas e visíveis em tempo real
- **Controle de Acesso**: A separação em nível de projeto e usuário fornece limites adequados
- **Informações Sensíveis**: Evite incluir segredos ou credenciais nas configurações dos agentes
- **Ambientes de Produção**: Considere agentes separados para ambientes de produção vs. desenvolvimento

## Limites

Os seguintes avisos brandos se aplicam às configurações de subagentes (nenhum limite rígido é aplicado):

- **Campo de Descrição**: Um aviso é exibido para descrições que excedem 1.000 caracteres
- **Prompt de Sistema**: Um aviso é exibido para prompts de sistema que excedem 10.000 caracteres