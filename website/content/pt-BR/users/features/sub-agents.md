# Subagentes

Subagentes são assistentes de IA especializados que realizam tipos específicos de tarefas dentro do Qwen Code. Eles permitem delegar trabalhos focados a agentes de IA configurados com prompts, ferramentas e comportamentos específicos para cada tarefa.

## O que são subagentes?

Subagentes são assistentes de IA independentes que:

- **Especializam-se em tarefas específicas** — Cada subagente é configurado com um prompt de sistema focado em determinados tipos de trabalho  
- **Possuem contexto separado** — Mantêm seu próprio histórico de conversa, distinto do seu chat principal  
- **Utilizam ferramentas controladas** — Você pode configurar quais ferramentas cada subagente tem permissão para usar  
- **Trabalham de forma autônoma** — Após receber uma tarefa, operam de forma independente até sua conclusão ou falha  
- **Fornecem feedback detalhado** — É possível acompanhar seu progresso, uso de ferramentas e estatísticas de execução em tempo real

## Principais Benefícios

- **Especialização de Tarefas**: Crie agentes otimizados para fluxos de trabalho específicos (testes, documentação, refatoração etc.)
- **Isolamento de Contexto**: Mantenha o trabalho especializado separado da sua conversa principal
- **Reutilização**: Salve e reutilize configurações de agentes em diferentes projetos e sessões
- **Acesso Controlado**: Limite quais ferramentas cada agente pode usar, garantindo segurança e foco
- **Visibilidade de Progresso**: Monitore a execução dos agentes com atualizações de progresso em tempo real

## Como os Subagentes Funcionam

1. **Configuração**: Você cria configurações de Subagentes que definem seu comportamento, ferramentas e instruções do sistema
2. **Delegação**: A IA principal pode delegar automaticamente tarefas aos Subagentes apropriados
3. **Execução**: Os Subagentes trabalham de forma independente, utilizando as ferramentas configuradas para concluir as tarefas
4. **Resultados**: Eles retornam os resultados e resumos da execução à conversa principal

## Começando

### Início Rápido

1. **Crie seu primeiro Subagente**:

   `/agents create`

   Siga o assistente guiado para criar um agente especializado.

2. **Gerencie os agentes existentes**:

   `/agents manage`

   Visualize e gerencie seus Subagentes configurados.

3. **Use Subagentes automaticamente**: Basta solicitar à IA principal que execute tarefas compatíveis com as especializações dos seus Subagentes. A IA delegará automaticamente o trabalho apropriado.

### Exemplo de Uso

```
Usuário: "Por favor, escreva testes abrangentes para o módulo de autenticação"
IA: Vou delegar essa tarefa aos seus Subagentes especializados em testes.
[Delega para os Subagentes "testing-expert"]
[Exibe o progresso em tempo real da criação dos testes]
[Retorna com os arquivos de teste concluídos e um resumo da execução]
```

## Gerenciamento

### Comandos da CLI

Subagentes são gerenciados por meio do comando de barra `/agents` e seus subcomandos:

**Uso:** `/agents create`. Cria um novo Subagente por meio de um assistente interativo com etapas guiadas.

**Uso:** `/agents manage`. Abre um diálogo interativo para visualizar e gerenciar os Subagentes existentes.

### Locais de Armazenamento

Os Subagentes são armazenados como arquivos Markdown em vários locais:

- **Nível de projeto**: `.qwen/agents/` (precedência mais alta)
- **Nível de usuário**: `~/.qwen/agents/` (alternativa)
- **Nível de extensão**: fornecido pelas extensões instaladas

Isso permite que você tenha agentes específicos por projeto, agentes pessoais que funcionam em todos os projetos e agentes fornecidos por extensões que adicionam capacidades especializadas.

### Subagentes de Extensão

As extensões podem fornecer subagentes personalizados que ficam disponíveis assim que a extensão é ativada. Esses agentes são armazenados no diretório `agents/` da extensão e seguem o mesmo formato dos agentes pessoais e de projeto.

Subagentes de extensão:

- São descobertos automaticamente quando a extensão é ativada  
- Aparecem na caixa de diálogo `/agents manage`, na seção "Agentes de Extensão"  
- Não podem ser editados diretamente (edite em vez disso o código-fonte da extensão)  
- Seguem o mesmo formato de configuração dos agentes definidos pelo usuário  

Para saber quais extensões fornecem subagentes, verifique o arquivo `qwen-extension.json` da extensão em busca do campo `agents`.

### Formato de Arquivo

Os subagentes são configurados usando arquivos Markdown com frontmatter YAML. Esse formato é legível por humanos e fácil de editar com qualquer editor de texto.

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

Conteúdo do prompt do sistema vai aqui.
Vários parágrafos são suportados.
Você pode usar a sintaxe de template `${variável}` para conteúdo dinâmico.
```

#### Exemplo de Uso

```
---
name: documentador-de-projeto
description: Cria arquivos de documentação do projeto e arquivos README
---

Você é um especialista em documentação para o projeto ${project_name}.

Sua tarefa: ${task_description}

Diretório de trabalho: ${current_directory}
Gerado em: ${timestamp}

Concentre-se em criar documentação clara e abrangente que ajude tanto
novos colaboradores quanto usuários finais a entenderem o projeto.
```

## Usando Subagentes de Forma Eficiente

### Delegação Automática

O Qwen Code delega proativamente tarefas com base em:

- A descrição da tarefa na sua solicitação  
- O campo de descrição nas configurações dos Subagentes  
- O contexto atual e as ferramentas disponíveis  

Para incentivar um uso mais proativo dos Subagentes, inclua frases como “USE DE FORMA PROATIVA” ou “DEVE SER UTILIZADO” no campo de descrição.

### Invocação Explícita

Solicite um Subagente específico mencionando-o diretamente no seu comando:

```
Peça ao Subagente especialista em testes para criar testes unitários para o módulo de pagamentos.
Peça ao Subagente redator de documentação para atualizar a referência da API.
Peça ao Subagente especialista em React para otimizar o desempenho deste componente.
```

## Exemplos

### Agentes para Fluxos de Desenvolvimento

#### Especialista em Testes

Perfeito para criação abrangente de testes e desenvolvimento orientado a testes.

```
---
name: testing-expert
description: Escreve testes unitários e de integração abrangentes e lida com automação de testes seguindo as melhores práticas
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em testes, focado na criação de testes de alta qualidade e facilmente mantidos.

Sua especialização inclui:

- Testes unitários com *mocking* e isolamento adequados
- Testes de integração para interações entre componentes
- Práticas de desenvolvimento orientado a testes (TDD)
- Identificação de casos de borda e cobertura abrangente
- Testes de desempenho e carga, quando apropriado

Para cada tarefa de teste:

1. Analise a estrutura do código e suas dependências
2. Identifique a funcionalidade principal, casos de borda e condições de erro
3. Crie suítes de testes abrangentes com nomes descritivos
4. Inclua configuração (*setup*) e limpeza (*teardown*) adequadas, além de afirmações (*assertions*) significativas
5. Adicione comentários explicando cenários de teste complexos
6. Garanta que os testes sejam facilmente mantidos e sigam os princípios DRY (*Don’t Repeat Yourself*)

Siga sempre as melhores práticas de testes para a linguagem e o framework detectados.
Dê prioridade tanto a casos de teste positivos quanto negativos.
```

**Casos de uso:**

- “Escreva testes unitários para o serviço de autenticação”
- “Crie testes de integração para o fluxo de processamento de pagamentos”
- “Adicione cobertura de testes para casos de borda no módulo de validação de dados”

#### Redator de Documentação

Especializado na criação de documentação clara e abrangente.

```
---
name: documentation-writer
description: Cria documentação abrangente, arquivos README, documentação de API e guias do usuário
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
---

Você é um especialista em documentação técnica para ${project_name}.

Seu papel é criar documentação clara e abrangente que atenda tanto
desenvolvedores quanto usuários finais. Concentre-se em:

**Para documentação de API:**

- Descrições claras dos endpoints com exemplos
- Detalhes dos parâmetros, incluindo tipos e restrições
- Documentação do formato das respostas
- Explicações dos códigos de erro
- Requisitos de autenticação

**Para documentação do usuário:**

- Instruções passo a passo, com capturas de tela quando úteis
- Guias de instalação e configuração
- Opções de configuração e exemplos
- Seções de solução de problemas para problemas comuns
- Seções de perguntas frequentes (FAQ) baseadas em dúvidas comuns dos usuários

**Para documentação de desenvolvedores:**

- Visões gerais da arquitetura e decisões de design
- Exemplos de código que realmente funcionam
- Diretrizes para contribuição
- Configuração do ambiente de desenvolvimento

Sempre verifique os exemplos de código e garanta que a documentação permaneça atualizada
em relação à implementação real. Use títulos claros, marcadores e exemplos.

```

**Casos de uso:**

- “Crie documentação de API para os endpoints de gerenciamento de usuários”
- “Escreva um arquivo README abrangente para este projeto”
- “Documente o processo de implantação com etapas de solução de problemas”

#### Revisor de Código

Focado na qualidade do código, segurança e boas práticas.

```
---
name: code-reviewer
description: Revisa código quanto a boas práticas, problemas de segurança, desempenho e manutenibilidade
tools:
  - read_file
  - read_many_files
---

Você é um revisor de código experiente, com foco em qualidade, segurança e manutenibilidade.

Critérios de revisão:

- **Estrutura do Código**: Organização, modularidade e separação de responsabilidades
- **Desempenho**: Eficiência algorítmica e uso de recursos
- **Segurança**: Avaliação de vulnerabilidades e práticas seguras de programação
- **Boas Práticas**: Convenções específicas da linguagem ou framework
- **Tratamento de Erros**: Tratamento adequado de exceções e cobertura de casos extremos
- **Legibilidade**: Nomes claros, comentários explicativos e organização do código
- **Testes**: Cobertura de testes e considerações sobre testabilidade

Forneça feedback construtivo com:

1. **Problemas Críticos**: Vulnerabilidades de segurança, bugs graves
2. **Melhorias Importantes**: Problemas de desempenho, falhas de design
3. **Sugestões Menores**: Aperfeiçoamentos de estilo, oportunidades de refatoração
4. **Feedback Positivo**: Padrões bem implementados e boas práticas

Concentre-se em feedback acionável, com exemplos específicos e soluções sugeridas.  
Priorize os problemas conforme seu impacto e forneça justificativas para suas recomendações.
```

**Casos de Uso:**

- “Revise esta implementação de autenticação quanto a problemas de segurança”
- “Avalie as implicações de desempenho dessa lógica de consulta ao banco de dados”
- “Avalie a estrutura do código e sugira melhorias”

### Agentes Específicos por Tecnologia

#### Especialista em React

Otimizado para desenvolvimento em React, *hooks* e padrões de componentes.

```
---
name: react-specialist
description: Especialista em desenvolvimento React, *hooks*, padrões de componentes e melhores práticas modernas do React
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em React com profundo conhecimento em desenvolvimento React moderno.

Sua especialização abrange:

- **Projeto de Componentes**: Componentes funcionais, *hooks* personalizados e padrões de composição
- **Gerenciamento de Estado**: `useState`, `useReducer`, API Context e bibliotecas externas
- **Desempenho**: `React.memo`, `useMemo`, `useCallback` e divisão de código (*code splitting*)
- **Testes**: React Testing Library, Jest e estratégias de teste de componentes
- **Integração com TypeScript**: Tipagem adequada para *props*, *hooks* e componentes
- **Padrões Modernos**: `Suspense`, *Error Boundaries* e recursos concorrentes (*Concurrent Features*)

Para tarefas em React:

1. Use componentes funcionais e *hooks* por padrão
2. Implemente tipagem TypeScript adequada
3. Siga as melhores práticas e convenções do React
4. Considere implicações de desempenho
5. Inclua tratamento de erros apropriado
6. Escreva código testável e de fácil manutenção

Mantenha-se sempre atualizado com as melhores práticas do React e evite padrões obsoletos.
Dê prioridade à acessibilidade e às considerações de experiência do usuário.
```

**Casos de Uso:**

- “Crie um componente reutilizável de tabela de dados com ordenação e filtragem”
- “Implemente um *hook* personalizado para busca de dados de API com cache”
- “Refatore este componente de classe para usar padrões modernos do React”

#### Especialista em Python

Especializado em desenvolvimento, frameworks e boas práticas em Python.

```
---
name: python-expert
description: Especialista em desenvolvimento em Python, frameworks, testes e boas práticas específicas para Python
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em Python com conhecimento aprofundado do ecossistema Python.

Sua especialização inclui:

- **Python básico**: Padrões pythonicos, estruturas de dados e algoritmos
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testes**: pytest, unittest, mocks, desenvolvimento orientado a testes (TDD)
- **Ciência de Dados**: pandas, numpy, matplotlib, notebooks Jupyter
- **Programação assíncrona**: asyncio, padrões async/await
- **Gerenciamento de pacotes**: pip, poetry, ambientes virtuais
- **Qualidade de código**: PEP 8, dicas de tipos (type hints), análise estática com pylint/flake8

Para tarefas em Python:

1. Siga as diretrizes de estilo da PEP 8
2. Use dicas de tipos para melhor documentação do código
3. Implemente tratamento adequado de erros com exceções específicas
4. Escreva docstrings completas
5. Considere desempenho e uso de memória
6. Inclua registro (logging) apropriado
7. Escreva código modular e testável

Concentre-se em escrever código Python limpo e sustentável, alinhado às práticas recomendadas pela comunidade.
```

**Casos de uso:**

- “Crie um serviço FastAPI para autenticação de usuários com tokens JWT”
- “Implemente um pipeline de processamento de dados com pandas e tratamento robusto de erros”
- “Escreva uma ferramenta CLI usando argparse com documentação completa de ajuda”

## Melhores Práticas

### Princípios de Projeto

#### Princípio da Responsabilidade Única

Cada Subagente deve ter um propósito claro e focado.

**✅ Bom:**

```
---
name: testing-expert
description: Escreve testes unitários e de integração abrangentes
---
```

**❌ Evite:**

```
---
name: general-helper
description: Ajuda com testes, documentação, revisão de código e implantação
---
```

**Por quê:** Agentes focados produzem melhores resultados e são mais fáceis de manter.

#### Especialização Clara

Defina áreas específicas de especialização em vez de capacidades genéricas.

**✅ Bom:**

```
---
name: react-performance-optimizer
description: Otimiza aplicações React para desempenho usando perfis e boas práticas
---
```

**❌ Evite:**

```
---
name: frontend-developer
description: Realiza tarefas de desenvolvimento frontend
---
```

**Por quê:** Uma especialização específica leva a uma assistência mais direcionada e eficaz.

#### Descrições Acionáveis

Escreva descrições que indiquem claramente quando usar o agente.

**✅ Boa:**

```
description: Analisa código em busca de vulnerabilidades de segurança, problemas de desempenho e questões de manutenibilidade
```

**❌ Evite:**

```
description: Um revisor de código útil
```

**Por quê:** Descrições claras ajudam a IA principal a escolher o agente certo para cada tarefa.

### Melhores Práticas de Configuração

#### Diretrizes para o Prompt do Sistema

**Seja específico quanto à especialização:**

```
Você é um especialista em testes com Python, com expertise em:

- Framework pytest e fixtures
- Objetos mock e injeção de dependências
- Práticas de desenvolvimento orientado a testes (TDD)
- Testes de desempenho com pytest-benchmark
```

**Inclua abordagens passo a passo:**

```
Para cada tarefa de teste:

1. Analise a estrutura do código e suas dependências
2. Identifique a funcionalidade principal e casos de borda
3. Crie suítes de testes abrangentes com nomes claros
4. Inclua configuração (setup) e limpeza (teardown), além de asserções adequadas
5. Adicione comentários explicando cenários de teste complexos
```

**Especifique os padrões de saída:**

```
Siga sempre esses padrões:

- Use nomes descritivos para testes que expliquem o cenário
- Inclua casos de teste positivos e negativos
- Adicione docstrings para funções de teste complexas
- Garanta que os testes sejam independentes e possam ser executados em qualquer ordem
```

## Considerações de Segurança

- **Restrições de Ferramentas**: Subagentes têm acesso apenas às ferramentas configuradas para eles  
- **Sandboxing**: A execução de todas as ferramentas segue o mesmo modelo de segurança que o uso direto dessas ferramentas  
- **Trilha de Auditoria**: Todas as ações dos Subagentes são registradas e visíveis em tempo real  
- **Controle de Acesso**: A separação por projeto e por usuário fornece limites adequados  
- **Informações Sensíveis**: Evite incluir segredos ou credenciais nas configurações dos agentes  
- **Ambientes de Produção**: Considere utilizar agentes distintos para ambientes de produção e desenvolvimento  

## Limites

Os seguintes avisos suaves se aplicam às configurações de Subagentes (não há limites rígidos impostos):

- **Campo de Descrição**: Um aviso é exibido para descrições com mais de 1.000 caracteres  
- **Prompt do Sistema**: Um aviso é exibido para prompts do sistema com mais de 10.000 caracteres