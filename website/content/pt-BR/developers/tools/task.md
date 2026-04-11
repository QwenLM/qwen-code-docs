# Ferramenta `task` (`task`)

Este documento descreve a ferramenta `task` para o Qwen Code.

## Descrição

Use `task` para iniciar um subagente especializado para lidar com tarefas complexas e de múltiplas etapas de forma autônoma. A ferramenta `task` delega o trabalho a agentes especializados que podem operar de forma independente, com acesso ao seu próprio conjunto de ferramentas, permitindo execução paralela de tarefas e expertise especializada.

### Argumentos

`task` aceita os seguintes argumentos:

- `description` (string, obrigatório): Uma descrição curta (3 a 5 palavras) da tarefa para visibilidade e rastreamento pelo usuário.
- `prompt` (string, obrigatório): O prompt detalhado da tarefa para o subagente executar. Deve conter instruções abrangentes para execução autônoma.
- `subagent_type` (string, obrigatório): O tipo de agente especializado a ser usado nesta tarefa. Deve corresponder a um dos subagentes configurados disponíveis.

## Como usar `task` com o Qwen Code

A ferramenta `task` carrega dinamicamente os subagentes disponíveis a partir da sua configuração e delega tarefas a eles. Cada subagente é executado de forma independente e pode usar seu próprio conjunto de ferramentas, permitindo expertise especializada e execução paralela.

Ao usar a ferramenta `task`, o subagente irá:

1. Receber o prompt da tarefa com autonomia total
2. Executar a tarefa usando suas ferramentas disponíveis
3. Retornar uma mensagem com o resultado final
4. Encerrar (subagentes são stateless e de uso único)

Uso:

```
task(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## Subagentes Disponíveis

Os subagentes disponíveis dependem da sua configuração. Tipos comuns de subagentes podem incluir:

- **general-purpose**: Para tarefas complexas de múltiplas etapas que exigem várias ferramentas
- **code-reviewer**: Para revisar e analisar a qualidade do código
- **test-runner**: Para executar testes e analisar resultados
- **documentation-writer**: Para criar e atualizar documentação

Você pode visualizar os subagentes disponíveis usando o comando `/agents` no Qwen Code.

## Recursos da Ferramenta `task`

### Atualizações de Progresso em Tempo Real

A ferramenta `task` fornece atualizações em tempo real mostrando:

- Status de execução do subagente
- Chamadas individuais de ferramentas feitas pelo subagente
- Resultados das chamadas de ferramentas e eventuais erros
- Progresso geral da tarefa e status de conclusão

### Execução Paralela

Você pode iniciar vários subagentes simultaneamente chamando a ferramenta `task` várias vezes em uma única mensagem, permitindo execução paralela de tarefas e maior eficiência.

### Expertise Especializada

Cada subagente pode ser configurado com:

- Permissões específicas de acesso a ferramentas
- System prompts e instruções especializadas
- Configurações personalizadas de modelo
- Conhecimento e capacidades específicos do domínio

## Exemplos de `task`

### Delegando para um agente general-purpose

```
task(
  description="Code refactoring",
  prompt="Please refactor the authentication module in src/auth/ to use modern async/await patterns instead of callbacks. Ensure all tests still pass and update any related documentation.",
  subagent_type="general-purpose"
)
```

### Executando tarefas em paralelo

```
# Launch code review and test execution in parallel
task(
  description="Code review",
  prompt="Review the recent changes in the user management module for code quality, security issues, and best practices compliance.",
  subagent_type="code-reviewer"
)

task(
  description="Run tests",
  prompt="Execute the full test suite and analyze any failures. Provide a summary of test coverage and recommendations for improvement.",
  subagent_type="test-runner"
)
```

### Geração de documentação

```
task(
  description="Update docs",
  prompt="Generate comprehensive API documentation for the newly implemented REST endpoints in the orders module. Include request/response examples and error codes.",
  subagent_type="documentation-writer"
)
```

## Quando Usar a Ferramenta `task`

Use a ferramenta `task` quando:

1. **Tarefas complexas de múltiplas etapas** - Tarefas que exigem múltiplas operações que podem ser tratadas de forma autônoma
2. **Expertise especializada** - Tarefas que se beneficiam de conhecimento ou ferramentas específicas de um domínio
3. **Execução paralela** - Quando você tem múltiplas tarefas independentes que podem ser executadas simultaneamente
4. **Necessidade de delegação** - Quando você quer delegar uma tarefa completa em vez de gerenciar cada etapa manualmente
5. **Operações que consomem muitos recursos** - Tarefas que podem levar um tempo significativo ou consumir muitos recursos computacionais

## Quando NÃO Usar a Ferramenta `task`

Não use a ferramenta `task` para:

- **Operações simples de etapa única** - Use ferramentas diretas como Read, Edit, etc.
- **Tarefas interativas** - Tarefas que exigem comunicação de ida e volta
- **Leitura de arquivos específicos** - Use a ferramenta Read diretamente para melhor desempenho
- **Pesquisas simples** - Use as ferramentas Grep ou Glob diretamente

## Observações Importantes

- **Execução stateless**: Cada invocação de subagente é independente, sem memória de execuções anteriores
- **Comunicação única**: Subagentes fornecem uma única mensagem de resultado final - sem comunicação contínua
- **Prompts abrangentes**: Seu prompt deve conter todo o contexto e instruções necessários para execução autônoma
- **Acesso a ferramentas**: Subagentes têm acesso apenas às ferramentas configuradas em sua configuração específica
- **Capacidade paralela**: Múltiplos subagentes podem ser executados simultaneamente para maior eficiência
- **Dependência de configuração**: Os tipos de subagentes disponíveis dependem da configuração do seu sistema

## Configuração

Os subagentes são configurados por meio do sistema de configuração de agentes do Qwen Code. Use o comando `/agents` para:

- Visualizar subagentes disponíveis
- Criar novas configurações de subagentes
- Modificar configurações existentes de subagentes
- Definir permissões e capacidades de ferramentas

Para mais informações sobre como configurar subagentes, consulte a documentação de subagentes.