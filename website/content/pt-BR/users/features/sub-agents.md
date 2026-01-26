# Subagentes

Subagentes são assistentes de IA especializados que lidam com tipos específicos de tarefas dentro do Qwen Code. Eles permitem que você delegue trabalhos focados para agentes de IA configurados com prompts, ferramentas e comportamentos específicos para cada tarefa.

## O que são Subagentes?

Subagentes são assistentes de IA independentes que:

- **Especializados em tarefas específicas** - Cada Subagente é configurado com um prompt de sistema focado para tipos particulares de trabalho
- **Possuem contexto separado** - Mantêm seu próprio histórico de conversa, separado do seu chat principal
- **Utilizam ferramentas controladas** - Você pode configurar quais ferramentas cada Subagente tem acesso
- **Trabalham de forma autônoma** - Uma vez atribuída uma tarefa, eles trabalham de forma independente até a conclusão ou falha
- **Fornecem feedback detalhado** - Você pode ver seu progresso, uso de ferramentas e estatísticas de execução em tempo real

## Principais Benefícios

- **Especialização de Tarefas**: Crie agentes otimizados para fluxos de trabalho específicos (testes, documentação, refatoração, etc.)
- **Isolamento de Contexto**: Mantenha o trabalho especializado separado da sua conversa principal
- **Reutilização**: Salve e reutilize configurações de agentes em diferentes projetos e sessões
- **Acesso Controlado**: Limite quais ferramentas cada agente pode usar para segurança e foco
- **Visibilidade de Progresso**: Monitore a execução do agente com atualizações de progresso em tempo real

## Como os Subagentes Funcionam

1. **Configuração**: Você cria configurações de Subagentes que definem seu comportamento, ferramentas e prompts do sistema
2. **Delegação**: A IA principal pode delegar automaticamente tarefas aos Subagentes apropriados
3. **Execução**: Os Subagentes trabalham de forma independente, usando suas ferramentas configuradas para concluir as tarefas
4. **Resultados**: Eles retornam resultados e resumos de execução de volta à conversa principal

## Primeiros Passos

### Primeiros Passos

1. **Crie seu primeiro Subagente**:

   `/agents create`

   Siga o assistente guiado para criar um agente especializado.

2. **Gerencie agentes existentes**:

   `/agents manage`

   Visualize e gerencie seus Subagentes configurados.

3. **Use Subagentes automaticamente**: Basta pedir à IA principal para executar tarefas que correspondam às especializações dos seus Subagentes. A IA delegará automaticamente o trabalho apropriado.

### Exemplo de Uso

```
Usuário: "Por favor, escreva testes abrangentes para o módulo de autenticação"
IA: Vou delegar isso aos seus Subagentes especialistas em testes.
[Delega ao Subagente "testing-expert"]
[Mostra o progresso em tempo real da criação dos testes]
[Retorna com os arquivos de teste concluídos e um resumo de execução]
```

## Gerenciamento

### Comandos CLI

Subagentes são gerenciados através do comando com barra `/agents` e seus subcomandos:

**Uso:** `/agents create`. Cria um novo Subagente através de um assistente guiado em etapas.

**Uso:** `/agents manage`. Abre uma caixa de diálogo interativa para visualizar e gerenciar Subagentes existentes.

### Locais de Armazenamento

Subagentes são armazenados como arquivos Markdown em múltiplos locais:

- **Nível de projeto**: `.qwen/agents/` (precedência mais alta)
- **Nível de usuário**: `~/.qwen/agents/` (reserva)
- **Nível de extensão**: Fornecido por extensões instaladas

Isso permite que você tenha agentes específicos de projeto, agentes pessoais que funcionam em todos os projetos e agentes fornecidos por extensões que adicionam capacidades especializadas.

### Subagentes de Extensão

Extensões podem fornecer subagentes personalizados que ficam disponíveis quando a extensão é ativada. Esses agentes são armazenados no diretório `agents/` da extensão e seguem o mesmo formato dos agentes pessoais e de projeto.

Subagentes de extensão:

- São automaticamente descobertos quando a extensão é ativada
- Aparecem na caixa de diálogo `/agents manage` na seção "Agentes de Extensão"
- Não podem ser editados diretamente (edite o código-fonte da extensão em vez disso)
- Seguem o mesmo formato de configuração dos agentes definidos pelo usuário

Para ver quais extensões fornecem subagentes, verifique o arquivo `qwen-extension.json` da extensão em busca de um campo `agents`.

### Formato de Arquivo

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

O conteúdo do prompt do sistema vem aqui.
Vários parágrafos são suportados.
Você pode usar a template ${variavel} para conteúdo dinâmico.
```

#### Exemplo de Uso

```
---
name: documentador-de-projeto
description: Cria arquivos de documentação e README do projeto
---

Você é um especialista em documentação para o projeto ${nome_do_projeto}.

Sua tarefa: ${descricao_da_tarefa}

Diretório de trabalho: ${diretorio_atual}
Gerado em: ${timestamp}

Concentre-se em criar documentação clara e abrangente que ajude tanto
novos colaboradores quanto usuários finais a entenderem o projeto.
```

## Usando Subagentes de Forma Eficaz

### Delegação Automática

O Qwen Code delega proativamente tarefas com base em:

- A descrição da tarefa na sua solicitação
- O campo de descrição nas configurações dos Subagentes
- Contexto atual e ferramentas disponíveis

Para incentivar um uso mais proativo dos Subagentes, inclua frases como "USAR PROATIVAMENTE" ou "DEVE SER USADO" no seu campo de descrição.

### Invocação Explícita

Solicite um Subagente específico mencionando-o no seu comando:

```
Deixe os Subagentes especialistas em testes criarem testes unitários para o módulo de pagamento
Peça aos Subagentes escritores de documentação para atualizar a referência da API
Peça ao Subagente especialista em React para otimizar o desempenho deste componente
```

## Exemplos

### Agentes de Fluxo de Trabalho de Desenvolvimento

#### Especialista em Testes

Perfeito para criação abrangente de testes e desenvolvimento orientado a testes.

```
---
name: testing-expert
description: Escreve testes unitários abrangentes, testes de integração e lida com automação de testes seguindo as melhores práticas
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em testes focado na criação de testes de alta qualidade e mantidos.

Sua expertise inclui:

- Testes unitários com mock apropriado e isolamento
- Testes de integração para interações entre componentes
- Práticas de desenvolvimento orientado a testes (TDD)
- Identificação de casos extremos e cobertura abrangente
- Testes de desempenho e carga quando apropriado

Para cada tarefa de teste:

1. Analise a estrutura do código e dependências
2. Identifique funcionalidades principais, casos extremos e condições de erro
3. Crie suítes de testes abrangentes com nomes descritivos
4. Inclua configuração/limpeza adequada e asserções significativas
5. Adicione comentários explicando cenários de teste complexos
6. Garanta que os testes sejam mantidos e sigam os princípios DRY

Sempre siga as melhores práticas de teste para a linguagem e framework detectados.
Foque tanto em casos de teste positivos quanto negativos.
```

**Casos de Uso:**

- "Escreva testes unitários para o serviço de autenticação"
- "Crie testes de integração para o fluxo de processamento de pagamento"
- "Adicione cobertura de teste para casos extremos no módulo de validação de dados"

#### Escritor de Documentação

Especializado em criar documentação clara e abrangente.

```
---
name: documentation-writer
description: Cria documentação abrangente, arquivos README, documentação de API e guias de usuário
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
---

Você é um especialista em documentação técnica para ${project_name}.

Seu papel é criar documentação clara e abrangente que atenda tanto
desenvolvedores quanto usuários finais. Concentre-se em:

**Para Documentação de API:**

- Descrições claras de endpoints com exemplos
- Detalhes de parâmetros com tipos e restrições
- Documentação do formato de resposta
- Explicações de códigos de erro
- Requisitos de autenticação

**Para Documentação de Usuário:**

- Instruções passo a passo com capturas de tela quando úteis
- Guias de instalação e configuração
- Opções de configuração e exemplos
- Seções de solução de problemas para questões comuns
- Seções de Perguntas Frequentes baseadas em perguntas comuns dos usuários

**Para Documentação de Desenvolvedor:**

- Visões gerais da arquitetura e decisões de design
- Exemplos de código que realmente funcionam
- Diretrizes de contribuição
- Configuração do ambiente de desenvolvimento

Sempre verifique os exemplos de código e garanta que a documentação permaneça atualizada com
a implementação real. Use títulos claros, listas com marcadores e exemplos.
```

**Casos de Uso:**

- "Crie documentação de API para os endpoints de gerenciamento de usuários"
- "Escreva um README abrangente para este projeto"
- "Documente o processo de implantação com etapas de solução de problemas"

#### Revisor de Código

Focado na qualidade do código, segurança e melhores práticas.

```
---
name: code-reviewer
description: Revisa código para melhores práticas, problemas de segurança, desempenho e capacidade de manutenção
tools:
  - read_file
  - read_many_files
---

Você é um revisor de código experiente focado em qualidade, segurança e capacidade de manutenção.

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
Priorize problemas por impacto e forneça justificativa para recomendações.
```

**Casos de Uso:**

- "Revise esta implementação de autenticação quanto a problemas de segurança"
- "Verifique as implicações de desempenho desta lógica de consulta ao banco de dados"
- "Avalie a estrutura do código e sugira melhorias"

### Agentes Específicos por Tecnologia

#### Especialista em React

Otimizado para desenvolvimento React, hooks e padrões de componentes.

```
---
name: react-specialist
description: Especialista em desenvolvimento React, hooks, padrões de componentes e melhores práticas modernas de React
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
- **Performance**: React.memo, useMemo, useCallback, divisão de código
- **Testes**: React Testing Library, Jest, estratégias de teste de componentes
- **Integração com TypeScript**: Tipagem adequada para props, hooks e componentes
- **Padrões Modernos**: Suspense, Error Boundaries, Recursos Concorrentes

Para tarefas React:

1. Use componentes funcionais e hooks por padrão
2. Implemente tipagem TypeScript adequada
3. Siga as melhores práticas e convenções React
4. Considere implicações de performance
5. Inclua tratamento de erros apropriado
6. Escreva código testável e mantenedor

Sempre mantenha-se atualizado com as melhores práticas React e evite padrões obsoletos.
Foque em considerações de acessibilidade e experiência do usuário.
```

**Casos de Uso:**

- "Crie um componente de tabela de dados reutilizável com ordenação e filtragem"
- "Implemente um hook personalizado para busca de dados de API com cache"
- "Refatore este componente de classe para usar padrões modernos de React"

#### Especialista em Python

Especializado em desenvolvimento Python, frameworks e melhores práticas.

```
---
name: python-expert
description: Especialista em desenvolvimento Python, frameworks, testes e melhores práticas específicas de Python
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Você é um especialista em Python com conhecimento profundo do ecossistema Python.

Sua expertise inclui:

- **Python Core**: padrões Pythonicos, estruturas de dados, algoritmos
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testes**: pytest, unittest, mocking, desenvolvimento orientado a testes
- **Ciência de Dados**: pandas, numpy, matplotlib, notebooks jupyter
- **Programação Assíncrona**: asyncio, padrões async/await
- **Gerenciamento de Pacotes**: pip, poetry, ambientes virtuais
- **Qualidade de Código**: PEP 8, dicas de tipo, verificação com pylint/flake8

Para tarefas em Python:

1. Siga as diretrizes de estilo PEP 8
2. Use dicas de tipo para melhor documentação do código
3. Implemente tratamento adequado de erros com exceções específicas
4. Escreva docstrings abrangentes
5. Considere desempenho e uso de memória
6. Inclua logging apropriado
7. Escreva código testável e modular

Concentre-se em escrever código Python limpo e sustentável que siga os padrões da comunidade.
```

**Casos de Uso:**

- "Crie um serviço FastAPI para autenticação de usuário com tokens JWT"
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

Defina áreas específicas de especialização em vez de capacidades amplas.

**✅ Bom:**

```
---
name: react-performance-optimizer
description: Otimiza aplicações React para desempenho usando perfilamento e boas práticas
---
```

**❌ Evite:**

```
---
name: frontend-developer
description: Trabalha em tarefas de desenvolvimento frontend
---
```

**Por quê:** Especialização específica leva a assistência mais direcionada e eficaz.

#### Descrições Acionáveis

Escreva descrições que indiquem claramente quando usar o agente.

**✅ Bom:**

```
description: Revisa código quanto a vulnerabilidades de segurança, problemas de desempenho e preocupações com manutenibilidade
```

**❌ Evite:**

```
description: Um revisor de código útil
```

**Por quê:** Descrições claras ajudam a IA principal a escolher o agente certo para cada tarefa.

### Práticas Recomendadas de Configuração

#### Diretrizes para Prompt do Sistema

**Seja Específico Sobre a Experiência:**

```
Você é um especialista em testes com Python com experiência em:

- Framework pytest e fixtures
- Objetos mock e injeção de dependência
- Práticas de desenvolvimento orientado a testes
- Testes de desempenho com pytest-benchmark
```

**Inclua Abordagens Passo a Passo:**

```
Para cada tarefa de teste:

1. Analise a estrutura do código e dependências
2. Identifique funcionalidades principais e casos extremos
3. Crie suítes de testes abrangentes com nomes claros
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

- **Restrições de Ferramentas**: Subagentes têm acesso apenas às ferramentas configuradas para eles
- **Sandboxing**: Toda execução de ferramenta segue o mesmo modelo de segurança do uso direto de ferramentas
- **Trilha de Auditoria**: Todas as ações dos Subagentes são registradas e visíveis em tempo real
- **Controle de Acesso**: Separação por projeto e nível de usuário fornece limites apropriados
- **Informações Sensíveis**: Evite incluir segredos ou credenciais nas configurações do agente
- **Ambientes de Produção**: Considere agentes separados para ambientes de produção versus desenvolvimento